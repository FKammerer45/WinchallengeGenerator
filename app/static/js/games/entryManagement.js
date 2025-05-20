// app/static/js/games/entryManagement.js

import {
    addLocalOnlyGameEntry,
    updateLocalOnlyGameEntry,
    removeLocalOnlyGameEntry,
    getLocalOnlyEntries
} from "./localStorageUtils.js";
import { escapeHtml, confirmModal, showFlash } from "../utils/helpers.js"; // showError not directly used here, but showFlash is
import { triggerAutosave } from "./gamesExtensions.js";

// --- Alert Helpers (scoped to this module if not needed globally) ---
function showGameModalAlert(message, type = 'danger', containerId = 'newGameAlert') {
    const alertContainer = document.getElementById(containerId);
    if (!alertContainer) {
        // console.error(`Alert container '#${containerId}' not found.`);
        if (message) alert(`(${type.toUpperCase()}) ${message.replace(/<br>/g, '\n')}`);
        return;
    }
    if (message) {
        const alertTypeClass = `alert-${type}`; // Bootstrap alert class
        alertContainer.innerHTML = `
            <div class="alert ${alertTypeClass} alert-dismissible fade show" role="alert" style="margin-bottom: 0;">
                ${message}
                <button type="button" class="close" data-dismiss="alert" aria-label="Close">
                    <span aria-hidden="true">&times;</span>
                </button>
            </div>`;
        alertContainer.style.display = 'block';
    } else {
        alertContainer.innerHTML = '';
        alertContainer.style.display = 'none';
    }
}

function showNewGameAlert(message, type = 'danger') {
    showGameModalAlert(message, type, 'newGameAlert');
}

function showEditGameAlert(message, type = 'danger') {
    showGameModalAlert(message, type, 'editGameAlert');
}
// --- END Alert Helpers ---

// --- Data Abstraction Helpers ---

/**
 * Saves or updates a game entry, abstracting localStorage vs. in-memory state.
 * @param {string} tabId - The ID of the tab.
 * @param {object} entryData - The game entry data to save/update. Must include an 'id'.
 * @param {boolean} [isUpdate=false] - True if updating an existing entry, false if adding a new one.
 * @returns {boolean} True if the operation was successful, false otherwise.
 */
function saveOrUpdateEntryData(tabId, entryData, isUpdate = false) {
    if (!tabId || !entryData || !entryData.id) {
        console.error("saveOrUpdateEntryData: Missing tabId, entryData, or entryData.id");
        return false;
    }
    const isLoggedIn = window.isLoggedIn === true;

    if (isLoggedIn) {
        if (!window.userTabsData || !window.userTabsData.entries) {
            console.error("saveOrUpdateEntryData: window.userTabsData.entries not initialized for logged-in user.");
            return false;
        }
        if (!Array.isArray(window.userTabsData.entries[tabId])) {
            window.userTabsData.entries[tabId] = []; // Initialize if tab's entries don't exist
        }
        const entries = window.userTabsData.entries[tabId];
        const existingIndex = entries.findIndex(e => String(e?.id) === String(entryData.id));

        if (isUpdate) {
            if (existingIndex !== -1) {
                entries[existingIndex] = { ...entries[existingIndex], ...entryData }; // Merge to preserve other potential fields
                console.log(`[State Update] Updated entry ${entryData.id} in state for tab ${tabId}`);
            } else {
                console.warn(`[State Update] Cannot update: Entry ${entryData.id} not found in state for tab ${tabId}.`);
                return false; // Cannot update if not found
            }
        } else { // Adding new or potentially overwriting (though ID should be unique for new)
            if (existingIndex !== -1) {
                console.warn(`[State Update] Overwriting existing entry ${entryData.id} in state for tab ${tabId} during an add operation.`);
                entries[existingIndex] = entryData;
            } else {
                entries.push(entryData);
            }
            console.log(`[State Update] Added/Replaced entry ${entryData.id} in state for tab ${tabId}`);
        }
        return true;
    } else { // Anonymous user
        try {
            if (isUpdate) {
                updateLocalOnlyGameEntry(tabId, entryData.id, entryData);
            } else {
                addLocalOnlyGameEntry(tabId, entryData);
            }
            return true;
        } catch (e) {
            console.error("Error in local storage operation (save/update):", e);
            return false;
        }
    }
}

/**
 * Removes a game entry, abstracting localStorage vs. in-memory state.
 * @param {string} tabId - The ID of the tab.
 * @param {string} entryId - The ID of the entry to remove.
 * @returns {boolean} True if an entry was successfully marked for removal/removed.
 */
function removeEntryData(tabId, entryId) {
    if (!tabId || !entryId) {
        console.error("[removeEntryData] Missing tabId or entryId");
        return false;
    }
    const idToRemove = String(entryId);
    const isLoggedIn = window.isLoggedIn === true;

    if (isLoggedIn) {
        if (!window.userTabsData?.entries?.[tabId] || !Array.isArray(window.userTabsData.entries[tabId])) {
            console.error(`[removeEntryData] Invalid state for tab ${tabId} (logged in).`);
            return false;
        }
        const entries = window.userTabsData.entries[tabId];
        const initialLength = entries.length;
        window.userTabsData.entries[tabId] = entries.filter(e => String(e?.id) !== idToRemove);
        const removed = window.userTabsData.entries[tabId].length < initialLength;
        if (removed) {
            console.log(`[State Update] Removed entry ${idToRemove} from state for tab ${tabId}.`);
        } else {
            console.warn(`[State Update] Entry ${idToRemove} not found in state for tab ${tabId}.`);
        }
        return removed;
    } else { // Anonymous user
        return removeLocalOnlyGameEntry(tabId, idToRemove); // This function already returns boolean
    }
}

// --- END Data Abstraction Helpers ---


function groupEntriesForDisplay(entries) {
    const grouped = {};
    if (!Array.isArray(entries)) {
        // console.warn("groupEntriesForDisplay: input 'entries' is not an array.", entries);
        return grouped;
    }
    entries.forEach(entry => {
        if (!entry || !entry.game) return; // Basic validation for entry object and game name
        const gameName = String(entry.game).trim(); // Ensure gameName is a string
        if (!gameName) return;

        if (!grouped[gameName]) {
            grouped[gameName] = { modes: new Set(), difficulties: [], players: [], entryIds: [] };
        }
        if (entry.gameMode) grouped[gameName].modes.add(String(entry.gameMode).trim());

        const difficulty = parseFloat(entry.difficulty);
        if (!isNaN(difficulty)) grouped[gameName].difficulties.push(difficulty);

        const players = parseInt(entry.numberOfPlayers, 10);
        if (!isNaN(players)) grouped[gameName].players.push(players);

        if (entry.id) grouped[gameName].entryIds.push(String(entry.id)); // Store IDs as strings
    });

    for (const gameName in grouped) {
        const data = grouped[gameName];
        data.modes = Array.from(data.modes).sort().join(', ') || 'N/A'; // Default to N/A if no modes
        const uniqueDiffs = [...new Set(data.difficulties)].sort((a, b) => a - b);
        data.diffRange = uniqueDiffs.length === 0 ? 'N/A' :
                         uniqueDiffs.length === 1 ? uniqueDiffs[0].toFixed(1) :
                         `${uniqueDiffs[0].toFixed(1)} - ${uniqueDiffs[uniqueDiffs.length - 1].toFixed(1)}`;
        const uniquePlayers = [...new Set(data.players)].sort((a, b) => a - b);
        data.playerRange = uniquePlayers.length === 0 ? 'N/A' :
                           uniquePlayers.length === 1 ? uniquePlayers[0].toString() :
                           `${uniquePlayers[0]} - ${uniquePlayers[uniquePlayers.length - 1]}`;
    }
    return grouped;
}

export function renderGamesForTab(tabId) {
    if (!tabId) {
        console.error("renderGamesForTab: tabId is undefined or null.");
        return;
    }
    // The tabId is already the pane ID (e.g., "default-all-games", "tabPane-1")
    const paneId = tabId;
    const tbody = document.querySelector(`#${paneId} .gamesTable`);

    if (!tbody) {
        // console.warn(`renderGamesForTab: Table body not found for tab pane ID: #${paneId}`);
        return;
    }

    let entries = [];
    const isLoggedIn = window.isLoggedIn === true;
    try {
        if (isLoggedIn) {
            entries = window.userTabsData?.entries?.[tabId] || [];
        } else {
            entries = getLocalOnlyEntries()[tabId] || [];
        }
    } catch (e) {
        console.error("Error getting entries for rendering tab %s:", tabId, e);
    }
    // console.log(`[RenderGames] Tab: ${tabId}, Found ${entries.length} entries. LoggedIn: ${isLoggedIn}`);

    tbody.innerHTML = ""; // Clear existing rows
    const groupedEntries = groupEntriesForDisplay(entries);
    const sortedGameNames = Object.keys(groupedEntries).sort((a,b) => a.localeCompare(b));

    if (sortedGameNames.length > 0) {
        sortedGameNames.forEach(gameName => {
            const data = groupedEntries[gameName];
            const row = document.createElement('tr');
            row.dataset.gameName = gameName; // Used for editing
            // entryIds for this game group are already collected in groupEntriesForDisplay
            row.dataset.entryIds = JSON.stringify(data.entryIds || []);
            // row.setAttribute('title', 'Double-click to edit entries for this game'); // REMOVE old hover hint

            row.innerHTML = `
                <td>${escapeHtml(gameName)}</td>
                <td>${escapeHtml(data.modes)}</td>
                <td>${escapeHtml(data.diffRange)}</td>
                <td>${escapeHtml(data.playerRange)}</td>
            `;
            tbody.appendChild(row);
        });
    } else {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-secondary py-3">No entries added to this tab yet.</td></tr>`;
    }
}

export function handleSaveNewGame() {
    const form = document.getElementById("newGameForm");
    const gameInput = form.elements.newGameName;
    const modeInput = form.elements.newGameMode;
    const diffInput = form.elements.newDifficulty;
    const playersInput = form.elements.newPlayers;

    const game = gameInput?.value.trim();
    const gameMode = modeInput?.value.trim();
    const difficulty = parseFloat(diffInput?.value);
    const numberOfPlayers = parseInt(playersInput?.value, 10);

    showNewGameAlert(null); // Clear previous alerts
    let errors = [];
    if (!game) errors.push("Game name is required.");
    if (!gameMode) errors.push("Game mode is required.");
    if (isNaN(difficulty) || difficulty <= 0.1 || difficulty > 10.0) {
        errors.push("Difficulty must be a number greater than 0.1 and less than or equal to 10.0.");
    }
    if (isNaN(numberOfPlayers) || numberOfPlayers < 1 || numberOfPlayers > 99 || !Number.isInteger(numberOfPlayers)) {
        errors.push("Number of players must be an integer between 1 and 99.");
    }

    if (errors.length > 0) {
        showNewGameAlert(errors.join("<br>"), 'danger');
        return;
    }

    const currentTab = window.currentTargetTab; // Set by games.js when modal opens
    if (!currentTab) {
        showNewGameAlert("Could not determine the current tab. Please try again.", "danger");
        return;
    }

    const newEntryId = "local-g-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9);
    const newEntry = {
        id: newEntryId,
        game,
        gameMode,
        difficulty: difficulty.toFixed(1), // Store with consistent precision
        numberOfPlayers,
        weight: 1.0 // Default weight
    };

    if (saveOrUpdateEntryData(currentTab, newEntry, false)) {
        renderGamesForTab(currentTab);
        if (typeof $ !== 'undefined' && $.fn.modal) $('#newGameModal').modal('hide');
        form.reset();
        if (window.isLoggedIn) {
            triggerAutosave(currentTab);
        }
    } else {
        showNewGameAlert("Failed to save new game entry. Please try again.", 'danger');
    }
}

export function handleUpdateGame() {
    const form = document.getElementById("editGameForm");
    const gameNameDisplay = document.getElementById("editGameNameDisplay"); // This is just a display span
    const gameNameHidden = document.getElementById("editGameNameHidden"); // Hidden input holds the actual game name
    const modesContainer = document.getElementById("editGameModesContainer");
    const currentTab = window.currentTargetTab; // Set by games.js

    if (!form || !gameNameHidden || !modesContainer || !currentTab) {
        showEditGameAlert("Error: Edit form components missing or tab context lost.", "danger");
        return;
    }
    const gameName = gameNameHidden.value; // Get game name from hidden input
    showEditGameAlert(null); // Clear previous alerts

    const modeSections = modesContainer.querySelectorAll(".edit-mode-section");
    let allEntriesToUpdate = [];
    let formErrors = [];

    if (modeSections.length === 0) { // All modes were deleted
        // This case is handled by handleDeleteSingleMode, which removes from data and triggers save.
        // If modal is closed after all modes deleted, then an autosave should have been triggered.
        if (typeof $ !== 'undefined' && $.fn.modal) $('#editGameModal').modal('hide');
        // Autosave is triggered by handleDeleteSingleMode if logged in.
        // renderGamesForTab(currentTab) is also called by handleDeleteSingleMode.
        return;
    }

    modeSections.forEach((section, index) => {
        const entryId = section.dataset.entryId;
        const modeInput = section.querySelector(".edit-mode-name-input");
        const diffInput = section.querySelector(".edit-mode-difficulty");
        const playersInput = section.querySelector(".edit-mode-players");

        const gameMode = modeInput?.value.trim();
        const difficulty = parseFloat(diffInput?.value);
        const numberOfPlayers = parseInt(playersInput?.value, 10);

        let modeErrors = [];
        if (!entryId) modeErrors.push(`Internal error: Missing ID for one of the modes.`);
        if (!gameMode) modeErrors.push(`Mode name is required.`);
        if (isNaN(difficulty) || difficulty <= 0.1 || difficulty > 10.0) modeErrors.push(`Difficulty must be > 0.1 and <= 10.0.`);
        if (isNaN(numberOfPlayers) || numberOfPlayers < 1 || numberOfPlayers > 99 || !Number.isInteger(numberOfPlayers)) modeErrors.push(`Players must be 1-99.`);

        if (modeErrors.length === 0) {
            allEntriesToUpdate.push({
                id: entryId, // This ID is crucial for updating the correct entry
                game: gameName, // Game name is fixed for all modes in this modal
                gameMode,
                difficulty: difficulty.toFixed(1),
                numberOfPlayers,
                weight: 1.0 // Assuming weight is fixed or handled elsewhere
            });
        } else {
            formErrors.push(`Mode "${escapeHtml(gameMode) || `Entry ${index + 1}`}": ${modeErrors.join(' ')}`);
        }
    });

    if (formErrors.length > 0) {
        showEditGameAlert(formErrors.join("<br>"), 'danger');
        return;
    }

    let allSucceeded = true;
    allEntriesToUpdate.forEach(updatedEntry => {
        if (!saveOrUpdateEntryData(currentTab, updatedEntry, true)) { // isUpdate = true
            allSucceeded = false;
            formErrors.push(`Failed to update data for mode "${escapeHtml(updatedEntry.gameMode)}".`);
        }
    });

    if (allSucceeded) {
        renderGamesForTab(currentTab);
        if (typeof $ !== 'undefined' && $.fn.modal) $('#editGameModal').modal('hide');
        if (window.isLoggedIn) {
            triggerAutosave(currentTab);
        }
    } else {
        showEditGameAlert(formErrors.join("<br>"), 'danger');
    }
}

export async function handleDeleteSingleMode(e) {
    const button = e.target.closest('.delete-single-mode-btn');
    if (!button) return;

    const entryId = button.dataset.entryId;
    const modeName = button.dataset.modeName || 'this mode';
    const section = button.closest('.edit-mode-section');
    const currentTab = window.currentTargetTab; // Relies on global context

    if (!entryId || !section || !currentTab) {
        showEditGameAlert("Internal error: cannot delete mode.", "danger");
        return;
    }

    const ok = await confirmModal(
        `Are you sure you want to delete the mode "${escapeHtml(modeName)}"? This specific game/mode combination will be removed from the tab.`,
        "Confirm Mode Deletion"
    );
    if (!ok) return;

    button.disabled = true;
    // Optional: Add spinner logic to button

    if (removeEntryData(currentTab, entryId)) {
        section.remove(); // Remove UI element from modal
        renderGamesForTab(currentTab); // Refresh main table
        showFlash(`Mode "${escapeHtml(modeName)}" deleted.`, "success", 2000);

        if (window.isLoggedIn) {
            triggerAutosave(currentTab);
        }

        const modesContainer = document.getElementById("editGameModesContainer");
        if (modesContainer && modesContainer.querySelectorAll('.edit-mode-section').length === 0) {
            if (typeof $ !== 'undefined' && $.fn.modal) $('#editGameModal').modal('hide');
        }
    } else {
        showEditGameAlert(`Failed to delete mode "${escapeHtml(modeName)}". It might have already been removed or an error occurred.`, "danger");
        button.disabled = false;
    }
}
