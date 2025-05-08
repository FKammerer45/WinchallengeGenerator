// app/static/js/games/entryManagement.js

// --- CORRECTED Imports ---
import {
    addLocalOnlyGameEntry,    // Use renamed function
    updateLocalOnlyGameEntry, // Use renamed function
    removeLocalOnlyGameEntry, // Use renamed function
    getLocalOnlyEntries     // Use renamed function
} from "./localStorageUtils.js";
// Use helpers from the utils directory
import { escapeHtml, showError, confirmModal, showFlash } from "../utils/helpers.js";
// Import autosave trigger function
import { triggerAutosave } from "./gamesExtensions.js";
// --- END CORRECTED Imports ---


// --- Alert Helpers defined FIRST ---
function showGameModalAlert(message, type = 'danger', containerId = 'newGameAlert') {
    const alertContainer = document.getElementById(containerId);
    if (!alertContainer) {
        console.error(`Alert container '#${containerId}' not found.`);
        if(message) alert(`(${type.toUpperCase()}) ${message.replace(/<br>/g, '\n')}`);
        return;
    }
    if (message) {
        const alertTypeClass = `alert-${type}`;
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

// --- groupEntriesForDisplay function (should be present) ---
function groupEntriesForDisplay(entries) {
    const grouped = {};
    if (!Array.isArray(entries)) { return grouped; }
    entries.forEach(entry => {
        if (!entry || !entry.game) return;
        const gameName = entry.game.trim();
        if (!gameName) return;
        if (!grouped[gameName]) {
            grouped[gameName] = { modes: new Set(), difficulties: [], players: [], entryIds: [] };
        }
        if (entry.gameMode) grouped[gameName].modes.add(String(entry.gameMode).trim());
        const difficulty = parseFloat(entry.difficulty); if (!isNaN(difficulty)) grouped[gameName].difficulties.push(difficulty);
        const players = parseInt(entry.numberOfPlayers); if (!isNaN(players)) grouped[gameName].players.push(players);
        if (entry.id) grouped[gameName].entryIds.push(entry.id);
    });
    for (const gameName in grouped) {
        const data = grouped[gameName];
        data.modes = Array.from(data.modes).sort().join(', ');
        const uniqueDiffs = [...new Set(data.difficulties)].sort((a, b) => a - b);
        if (uniqueDiffs.length === 0) data.diffRange = 'N/A'; else if (uniqueDiffs.length === 1) data.diffRange = uniqueDiffs[0].toFixed(1); else data.diffRange = `${uniqueDiffs[0].toFixed(1)} - ${uniqueDiffs[uniqueDiffs.length - 1].toFixed(1)}`;
        const uniquePlayers = [...new Set(data.players)].sort((a, b) => a - b);
        if (uniquePlayers.length === 0) data.playerRange = 'N/A'; else if (uniquePlayers.length === 1) data.playerRange = uniquePlayers[0].toString(); else data.playerRange = `${uniquePlayers[0]} - ${uniquePlayers[uniquePlayers.length - 1]}`;
    }
    return grouped;
} // (End groupEntriesForDisplay)


// --- renderGamesForTab function ---
export function renderGamesForTab(tabId) {
    let normalizedTabId = tabId;
    if (tabId && tabId !== "default" && !tabId.startsWith("tabPane-")) {
        normalizedTabId = "tabPane-" + tabId;
    } else if (!tabId) { console.error("renderGamesForTab: Invalid tabId:", tabId); return; }

    let entries = [];
    try {
        // *** Get entries based on login status ***
        const isLoggedIn = window.isLoggedIn === true; // Use global flag
        if (isLoggedIn) {
            entries = window.userTabsData?.entries?.[tabId] || [];
        } else {
            entries = getLocalOnlyEntries()[tabId] || []; // Use renamed local function
        }
         // console.log(`[Render] Tab ${tabId}. LoggedIn: ${isLoggedIn}. Found ${entries.length} entries.`);
    }
    catch (e) { console.error(`Error getting entries for tab ${tabId}:`, e); }

    const tbody = document.querySelector(`#${normalizedTabId} .gamesTable`);
    if (!tbody) { return; } // Pane might not exist yet during initial load

    tbody.innerHTML = ""; // Clear existing rows
    const groupedEntries = groupEntriesForDisplay(entries); // Use grouping function
    const sortedGameNames = Object.keys(groupedEntries).sort();

    if (sortedGameNames.length > 0) {
        sortedGameNames.forEach(gameName => {
            const data = groupedEntries[gameName];
            const row = document.createElement('tr');
            // Get actual IDs from the ungrouped list for this game
            const entryIdsForGame = entries.filter(e => e.game === gameName).map(e => e.id);

            row.dataset.gameName = gameName;
            // Store the actual IDs associated with this grouped row
            row.dataset.entryIds = JSON.stringify(entryIdsForGame || []);
            row.innerHTML = `
                <td>${escapeHtml(gameName)}</td>
                <td>${escapeHtml(data.modes) || '<span class="text-muted small">N/A</span>'}</td>
                <td>${escapeHtml(data.diffRange)}</td>
                <td>${escapeHtml(data.playerRange)}</td>
            `;
            tbody.appendChild(row);
        });
    } else {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-secondary py-3">No entries added to this tab yet.</td></tr>`;
    }
} // (End renderGamesForTab)


// --- Helper functions for conditional data update ---
function saveOrUpdateEntryData(tabId, entryData, isUpdate = false) {
     if (!tabId || !entryData) return false;
     const entryId = entryData.id;
     const isLoggedIn = window.isLoggedIn === true; // Use global flag

     if (isLoggedIn) {
         if (!window.userTabsData?.entries) return false;
         if (!Array.isArray(window.userTabsData.entries[tabId])) window.userTabsData.entries[tabId] = [];
         const entries = window.userTabsData.entries[tabId];
         const existingIndex = entries.findIndex(e => String(e?.id) === String(entryId));

         if (isUpdate) {
             if (existingIndex !== -1) entries[existingIndex] = entryData;
             else return false; // Cannot update if not found
         } else {
             if (existingIndex === -1) entries.push(entryData);
             else entries[existingIndex] = entryData; // Overwrite if duplicate ID somehow
         }
         console.log(`[Data State] ${isUpdate ? 'Updated' : 'Added'} entry ${entryId} in state for tab ${tabId}`);
         return true;
     } else {
         try {
             if (isUpdate) updateLocalOnlyGameEntry(tabId, entryId, entryData);
             else addLocalOnlyGameEntry(tabId, entryData);
             return true;
         } catch (e) { return false; }
     }
}
function removeEntryData(tabId, entryId) {
    if (!tabId || !entryId) {
        console.error("[removeEntryData] Missing tabId or entryId");
        return false;
    }
    const idToRemove = String(entryId); // Ensure consistent string comparison
    const isLoggedIn = window.isLoggedIn === true;
    console.log(`[removeEntryData] Attempting removal. Tab: ${tabId}, ID: ${idToRemove}, LoggedIn: ${isLoggedIn}`);

    if (isLoggedIn) {
        if (!window.userTabsData?.entries?.[tabId] || !Array.isArray(window.userTabsData.entries[tabId])) {
            console.error(`[removeEntryData] Invalid state for tab ${tabId}`);
            return false;
        }
        const entries = window.userTabsData.entries[tabId];
        const initialLength = entries.length;
        window.userTabsData.entries[tabId] = entries.filter(e => String(e?.id) !== idToRemove);
        const removed = window.userTabsData.entries[tabId].length < initialLength;
        if (removed) {
            console.log(`[Data State] Removed entry ${idToRemove} from state for tab ${tabId}. New count: ${window.userTabsData.entries[tabId].length}`);
        } else {
            console.warn(`[Data State] Entry ${idToRemove} not found in state for tab ${tabId}.`);
        }
        return removed; // Return true only if something was removed
    } else {
         try {
             // removeLocalOnlyGameEntry should return true/false
             const success = removeLocalOnlyGameEntry(tabId, idToRemove);
             if(success) console.log(`[Local Storage] Removed entry ${idToRemove} from tab ${tabId}`);
             else console.warn(`[Local Storage] Entry ${idToRemove} not found in tab ${tabId}`);
             return success;
         } catch (e) {
             console.error(`[removeEntryData] Error removing local entry:`, e);
             return false;
          }
    }
}
// --- End Helper functions ---


// --- MODIFIED handleSaveNewGame ---
export function handleSaveNewGame() {
    const form = document.getElementById("newGameForm");
    // ... (existing validation logic) ...
    const gameInput = form.elements.newGameName;
    const modeInput = form.elements.newGameMode;
    const diffInput = form.elements.newDifficulty;
    const playersInput = form.elements.newPlayers;
    const game = gameInput?.value.trim();
    const gameMode = modeInput?.value.trim();
    const difficulty = parseFloat(diffInput?.value);
    const numberOfPlayers = parseInt(playersInput?.value);

    showNewGameAlert(null); // Clear alerts
    let errors = [];
    if (!game) errors.push("Game name required.");
    if (!gameMode) errors.push("Game mode required.");
    if (isNaN(difficulty) || difficulty <= 0.1 || difficulty > 10.0) errors.push("Difficulty must be > 0.1 and <= 10.0.");
    if (isNaN(numberOfPlayers) || numberOfPlayers < 1 || numberOfPlayers > 99 || !Number.isInteger(numberOfPlayers)) errors.push("Players must be 1-99.");

    if (errors.length > 0) {
        showNewGameAlert(errors.join("<br>"), 'danger'); return;
    }

    const currentTab = window.currentTargetTab || "default";
    const newEntryId = "local-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9); // Always generate local ID first
    const newEntry = {
        id: newEntryId, game, gameMode,
        difficulty: difficulty.toFixed(1), numberOfPlayers,
        weight: 1.0
    };

    if (saveOrUpdateEntryData(currentTab, newEntry, false)) { // Use helper
        renderGamesForTab(currentTab); // Refresh UI
        $('#newGameModal').modal('hide'); // Close modal
        form.reset();
        triggerAutosave(currentTab); // <<< TRIGGER AUTOSAVE
    } else {
        showNewGameAlert("Failed to save entry data.", 'danger');
    }
} // (End handleSaveNewGame)


// --- MODIFIED handleUpdateGame ---
export function handleUpdateGame() {
    const form = document.getElementById("editGameForm");
    const gameNameDisplay = document.getElementById("editGameNameDisplay");
    const modesContainer = document.getElementById("editGameModesContainer");
    const currentTab = window.currentTargetTab || "default";
    const gameName = gameNameDisplay?.textContent;

    if (!form || !modesContainer || !gameName || !currentTab) { /*...*/ return; }
    showEditGameAlert(null); // Clear alerts

    const modeSections = modesContainer.querySelectorAll(".edit-mode-section");
    let allEntriesToUpdate = [];
    let errors = [];

    if (modeSections.length === 0) { // Handle deletion of all modes
        $('#editGameModal').modal('hide');
        triggerAutosave(currentTab); // Save the empty state
        return;
    }

    modeSections.forEach((section, index) => {
        // ... (existing validation logic for each mode section) ...
         const entryId = section.dataset.entryId;
         const modeInput = section.querySelector(".edit-mode-name-input");
         const diffInput = section.querySelector(".edit-mode-difficulty");
         const playersInput = section.querySelector(".edit-mode-players");
         const gameMode = modeInput?.value.trim();
         const difficulty = parseFloat(diffInput?.value);
         const numberOfPlayers = parseInt(playersInput?.value);

         let modeErrors = [];
         if (!entryId) modeErrors.push(`Internal error: Missing ID.`);
         if (!gameMode) modeErrors.push(`Mode name required.`);
         if (isNaN(difficulty) || difficulty <= 0.1 || difficulty > 10.0) modeErrors.push(`Invalid difficulty.`);
         if (isNaN(numberOfPlayers) || numberOfPlayers < 1 || numberOfPlayers > 99 || !Number.isInteger(numberOfPlayers)) modeErrors.push(`Invalid players.`);

        if (modeErrors.length === 0) {
             allEntriesToUpdate.push({
                id: entryId, game: gameName, gameMode,
                difficulty: difficulty.toFixed(1), numberOfPlayers,
                weight: 1.0 // Assuming weight fixed
             });
        } else { errors.push(`Mode "${gameMode || index+1}": ${modeErrors.join(' ')}`); }
    });

    if (errors.length > 0) {
        showEditGameAlert(errors.join("<br>"), 'danger'); return;
    }

    // Update data using helper
    let allSucceeded = true;
    allEntriesToUpdate.forEach(updatedEntry => {
        if (!saveOrUpdateEntryData(currentTab, updatedEntry, true)) { // isUpdate = true
            allSucceeded = false;
            errors.push(`Failed to update data for mode "${escapeHtml(updatedEntry.gameMode)}".`);
        }
    });

    if (allSucceeded) {
        renderGamesForTab(currentTab); // Refresh UI
        $('#editGameModal').modal('hide'); // Close modal
        triggerAutosave(currentTab); // <<<< TRIGGER AUTOSAVE
    } else {
        showEditGameAlert(errors.join("<br>"), 'danger');
    }
} // (End handleUpdateGame)

// --- Moved and MODIFIED handleDeleteSingleMode ---
export async function handleDeleteSingleMode(e) {
    // 1. Check if the clicked element is indeed the delete button
    const button = e.target.closest('.delete-single-mode-btn'); // Use closest to handle clicks on icon inside button
    if (!button) return; // Exit if the click wasn't on or inside a delete button

    console.log("handleDeleteSingleMode triggered for button:", button); // Debug

    // 2. Get necessary data from the button and context
    const entryId = button.dataset.entryId;
    const modeName = button.dataset.modeName || 'this mode';
    const section = button.closest('.edit-mode-section');
    // *** Explicitly get tab ID from the modal context if possible, fallback to window ***
    const modalElement = button.closest('#editGameModal');
    const hiddenGameNameInput = modalElement?.querySelector('#editGameNameHidden'); // Example: If game name stored here helps find tab
    const currentTab = window.currentTargetTab; // Rely on global context set when modal opened
    const alertContainer = document.getElementById("editGameAlert"); // Target edit modal's alert

    console.log(`Attempting to delete: entryId=${entryId}, modeName=${modeName}, currentTab=${currentTab}`); // Debug

    // 3. Validate necessary data
    if (!entryId || !section || !currentTab || !alertContainer) {
        console.error("Cannot delete mode: Missing context (id, section, tab, alert).");
        showEditGameAlert("Internal error: cannot delete mode.", "danger");
        return;
    }

    // 4. Confirmation
    const ok = await confirmModal(
        `Are you sure you want to delete the mode "${escapeHtml(modeName)}"?`,
        "Confirm mode deletion"
    );
    if (!ok) {
        console.log("User cancelled delete.");
        return; // User cancelled
    }

    // 5. Disable button and attempt data removal
    button.disabled = true;
    const spinner = button.querySelector('.spinner-border-sm'); // Optional: Add spinner logic if needed
    if (spinner) spinner.style.display = 'inline-block';

    // Call the helper function to remove data from state/localStorage
    const removed = removeEntryData(currentTab, entryId);

    // 6. Handle result
    if (removed) {
        console.log(`Data removed successfully for entry ${entryId}`);
        section.remove(); // Remove section from modal UI immediately

        // Update main table view outside the modal
        renderGamesForTab(currentTab);

        // Trigger autosave if logged in
        if (window.isLoggedIn === true) {
            triggerAutosave(currentTab);
        }

        // Check if modal is now empty
        const modesContainer = document.getElementById("editGameModesContainer");
        const remainingSections = modesContainer?.querySelectorAll('.edit-mode-section').length;
        console.log(`Mode section removed visually. Remaining: ${remainingSections}`);

        showFlash(`Mode "${escapeHtml(modeName)}" deleted.`, "success", 2000);

        // Optionally close modal if it becomes empty
        if (remainingSections === 0) {
             console.log("No modes left, closing edit modal.");
             // Ensure jQuery/Bootstrap modal('hide') is available
             if (typeof $ !== 'undefined' && $.fn.modal) {
                $('#editGameModal').modal('hide');
             }
        }

    } else {
        // If removeEntryData returned false (likely entry not found in data source)
        console.error(`Failed to remove data for entry ${entryId}. Entry might be out of sync.`);
        showEditGameAlert(`Failed to delete mode "${escapeHtml(modeName)}". Data inconsistency might exist.`, "danger");
        button.disabled = false; // Re-enable button on failure
        if (spinner) spinner.style.display = 'none';
    }
} // (End handleDeleteSingleMode)