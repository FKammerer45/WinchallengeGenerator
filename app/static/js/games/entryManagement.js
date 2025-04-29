// static/js/games/entryManagement.js
// Manages rendering and CRUD operations for game entries in localStorage, now with grouping.

import {
    addLocalGameEntry,
    updateLocalGameEntry,
    // *** removeLocalGameEntry is NOT defined here, removed from import ***
    getLocalEntries,
    getLocalTabs
} from "./localStorageUtils.js";
// Import showError directly, aliased if preferred
import { escapeHtml, showError } from "../utils/helpers.js";




function showGameModalAlert(message, type = 'danger', containerId = 'newGameAlert') {
    const alertContainer = document.getElementById(containerId);
    if (!alertContainer) {
        console.error(`Alert container '#${containerId}' not found.`);
        // Fallback to standard alert if container missing
        if(message) alert(`(${type.toUpperCase()}) ${message.replace(/<br>/g, '\n')}`);
        return;
    }

    if (message) {
        // Construct Bootstrap alert HTML
        const alertTypeClass = `alert-${type}`; // e.g., alert-danger, alert-success
        alertContainer.innerHTML = `
            <div class="alert ${alertTypeClass} alert-dismissible fade show" role="alert" style="margin-bottom: 0;">
                ${message} 
                <button type="button" class="close" data-dismiss="alert" aria-label="Close">
                    <span aria-hidden="true">&times;</span>
                </button>
            </div>`;
        alertContainer.style.display = 'block'; // Ensure container is visible
    } else {
        // Clear the container and hide it
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
// --- groupEntriesForDisplay function ---
// Groups entries by game name and calculates display ranges/lists.
function groupEntriesForDisplay(entries) {
    const grouped = {};
    if (!Array.isArray(entries)) return grouped;

    entries.forEach(entry => {
        if (!entry || !entry.game) return;
        const gameName = entry.game.trim();
        if (!gameName) return;

        if (!grouped[gameName]) {
            grouped[gameName] = { modes: new Set(), difficulties: [], players: [], entryIds: [] };
        }

        if (entry.gameMode) grouped[gameName].modes.add(entry.gameMode.trim());
        if (entry.difficulty !== undefined) grouped[gameName].difficulties.push(parseFloat(entry.difficulty));
        if (entry.numberOfPlayers !== undefined) grouped[gameName].players.push(parseInt(entry.numberOfPlayers));
        if (entry.id) grouped[gameName].entryIds.push(entry.id);
    });

    // Process aggregated data
    for (const gameName in grouped) {
        const data = grouped[gameName];
        data.modes = Array.from(data.modes).sort().join(', '); // Comma-separated modes

        const uniqueDiffs = [...new Set(data.difficulties)].sort((a, b) => a - b);
        if (uniqueDiffs.length === 0) data.diffRange = 'N/A';
        else if (uniqueDiffs.length === 1) data.diffRange = uniqueDiffs[0].toFixed(1);
        else data.diffRange = `${uniqueDiffs[0].toFixed(1)}-${uniqueDiffs[uniqueDiffs.length - 1].toFixed(1)}`;

        const uniquePlayers = [...new Set(data.players)].sort((a, b) => a - b);
        if (uniquePlayers.length === 0) data.playerRange = 'N/A';
        else if (uniquePlayers.length === 1) data.playerRange = uniquePlayers[0].toString();
        else data.playerRange = `${uniquePlayers[0]}-${uniquePlayers[uniquePlayers.length - 1]}`;
    }
    return grouped;
} // (End groupEntriesForDisplay)

// --- renderGamesForTab function ---
// Renders the grouped game entries into the table.
export function renderGamesForTab(tabId) {
    let normalizedTabId = tabId;
    if (tabId && tabId !== "default" && !tabId.startsWith("tabPane-")) {
        normalizedTabId = "tabPane-" + tabId;
    } else if (!tabId) { console.error("renderGamesForTab: Invalid tabId:", tabId); return; }

    let entries = [];
    try { entries = getLocalEntries()[tabId] || []; }
    catch (e) { console.error(`Error getting local entries for tab ${tabId}:`, e); }

    const tbody = document.querySelector(`#${normalizedTabId} .gamesTable`);
    if (!tbody) { return; }

    tbody.innerHTML = ""; // Clear existing rows
    const groupedEntries = groupEntriesForDisplay(entries);
    const sortedGameNames = Object.keys(groupedEntries).sort();

    if (sortedGameNames.length > 0) {
        sortedGameNames.forEach(gameName => {
            const data = groupedEntries[gameName];
            const row = document.createElement('tr');
            row.dataset.gameName = gameName;
            row.dataset.entryIds = JSON.stringify(data.entryIds);
            row.innerHTML = `
                <td>${escapeHtml(gameName)}</td>
                <td>${escapeHtml(data.modes) || '<span class="text-muted small">N/A</span>'}</td>
                <td>${escapeHtml(data.diffRange)}</td>
                <td>${escapeHtml(data.playerRange)}</td>
            `;
            tbody.appendChild(row);
        });
    } else {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-secondary py-3">No entries added to this tab yet.</td></tr>`; // Updated placeholder text color
    }
} // (End renderGamesForTab)


// --- handleSaveNewGame function ---
// Handles saving a single new game entry.
export function handleSaveNewGame() {
    const form = document.getElementById("newGameForm");
    if (!form) {
        console.error("New game form (#newGameForm) not found");
        // Maybe show a general page alert if possible?
        return;
    }

    const gameInput = form.elements.newGameName;
    const modeInput = form.elements.newGameMode;
    const diffInput = form.elements.newDifficulty;
    const playersInput = form.elements.newPlayers;

    const game = gameInput?.value.trim();
    const gameMode = modeInput?.value.trim();
    const difficulty = parseFloat(diffInput?.value); // Parse as float
    const numberOfPlayers = parseInt(playersInput?.value);

    showNewGameAlert(null); // Clear previous errors in the new game modal

    let errors = [];
    if (!game) errors.push("Game name is required.");
    if (!gameMode) errors.push("Game mode is required.");

    // Difficulty Validation (Must be > 0.1)
    if (isNaN(difficulty)) {
        errors.push("Difficulty must be a number.");
    } else if (difficulty <= 0.1) { // Check if less than or equal to 0.1
        errors.push("Difficulty must be greater than 0.1 (e.g., 0.2 or higher).");
    } else if (difficulty > 10.0) { // Upper bound check
        errors.push("Difficulty cannot exceed 10.0.");
    }
    // Optional: Check for too many decimal places
    // else if (String(difficulty).includes('.') && String(difficulty).split('.')[1].length > 1) {
    //     errors.push("Difficulty should have at most one decimal place (e.g., 5.0, 7.5).");
    // }

    // Player Validation
    if (isNaN(numberOfPlayers)) {
        errors.push("Number of players must be an integer.");
    } else if (numberOfPlayers < 1 || numberOfPlayers > 99 || !Number.isInteger(numberOfPlayers)) {
        errors.push("Number of players must be a whole number between 1 and 99.");
    }

    // Show errors if any occurred
    if (errors.length > 0) {
        showNewGameAlert(errors.join("<br>"), 'danger'); // Show errors in a red box
        return;
    }

    // Proceed if validation passed
    const currentTab = window.currentTargetTab || "default";
    let tabName = "Default";
    try {
        // Safely access tabs, default to "Default" if needed
        const tabs = getLocalTabs();
        tabName = tabs[currentTab]?.name || "Default";
    } catch (e) { console.error("Error reading tabs for tabName:", e); }

    const newEntry = {
        id: "local-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7),
        game,
        gameMode,
        difficulty: difficulty.toFixed(1), // Store consistently with one decimal place
        numberOfPlayers,
        tabName,
        weight: 1.0 // Assuming a default weight
    };

    try {
        addLocalGameEntry(currentTab, newEntry); // Save to localStorage
        renderGamesForTab(currentTab); // Refresh the table UI
        $('#newGameModal').modal('hide'); // Close the modal using jQuery/Bootstrap
        form.reset(); // Reset the form fields
    } catch (error) {
        console.error("Error saving entry or rendering tab:", error);
        showNewGameAlert("Failed to save entry. Please try again.", 'danger'); // Show save error
    }
} // (End handleSaveNewGame)


// --- Complete handleUpdateGame Function ---
export function handleUpdateGame() {
    const form = document.getElementById("editGameForm");
    const gameNameDisplay = document.getElementById("editGameNameDisplay");
    const modesContainer = document.getElementById("editGameModesContainer");
    const currentTab = window.currentTargetTab || "default";

    const gameName = gameNameDisplay?.textContent; // Get game name from display element

    if (!form || !modesContainer || !gameName || !currentTab) {
        console.error("Cannot update: Missing form elements, game name, or tab context.");
        showEditGameAlert("An internal error occurred. Cannot save changes."); // Use edit alert
        return;
    }

    showEditGameAlert(null); // Clear previous errors in the edit modal

    const modeSections = modesContainer.querySelectorAll(".edit-mode-section");
    let allUpdates = [];
    let errors = [];

    if (modeSections.length === 0) {
        // If all modes were deleted via the 'X' button, just close the modal and refresh
        $('#editGameModal').modal('hide');
        renderGamesForTab(currentTab);
        return;
    }

    modeSections.forEach((section, index) => {
        const entryId = section.dataset.entryId;
        const modeInput = section.querySelector(".edit-mode-name-input");
        const diffInput = section.querySelector(".edit-mode-difficulty");
        const playersInput = section.querySelector(".edit-mode-players");

        const gameMode = modeInput?.value.trim();
        const difficulty = parseFloat(diffInput?.value); // Parse as float
        const numberOfPlayers = parseInt(playersInput?.value);

        // --- Validation per mode ---
        let modeErrors = [];
        if (!entryId) modeErrors.push(`Internal error: Missing ID for mode #${index + 1}.`);
        if (!gameMode) modeErrors.push(`Mode name is required for entry #${index + 1}.`);

        // Difficulty Validation (Must be > 0.1)
        if (isNaN(difficulty)) {
            modeErrors.push(`Difficulty must be a number for mode "${gameMode || index + 1}".`);
        } else if (difficulty <= 0.1) { // Check lower bound
            modeErrors.push(`Difficulty for "${gameMode || index + 1}" must be > 0.1.`);
        } else if (difficulty > 10.0) { // Check upper bound
             modeErrors.push(`Difficulty for "${gameMode || index + 1}" cannot exceed 10.0.`);
        }
        // Optional: Check for too many decimal places
        // else if (String(difficulty).includes('.') && String(difficulty).split('.')[1].length > 1) {
        //     modeErrors.push(`Difficulty for "${gameMode || index + 1}" should have at most one decimal place.`);
        // }

        // Player Validation
        if (isNaN(numberOfPlayers)) {
            modeErrors.push(`Number of players must be an integer for mode "${gameMode || index + 1}".`);
        } else if (numberOfPlayers < 1 || numberOfPlayers > 99 || !Number.isInteger(numberOfPlayers)) {
            modeErrors.push(`Players for "${gameMode || index + 1}" must be 1-99.`);
        }
        // --- End Validation ---

        if (modeErrors.length === 0) {
            // Get original weight/tabName for context if needed
            const allEntries = getLocalEntries();
            const originalEntry = (allEntries[currentTab] || []).find(e => e.id === entryId);

            allUpdates.push({
                id: entryId,
                game: gameName, // Use the game name from the modal title
                gameMode,
                difficulty: difficulty.toFixed(1), // Store consistently
                numberOfPlayers,
                // Preserve original weight/tabName if they exist
                weight: originalEntry?.weight ?? 1.0,
                tabName: originalEntry?.tabName ?? "Default"
            });
        } else {
            errors.push(...modeErrors); // Add specific mode errors to the overall list
        }
    }); // End forEach section

    // Show errors if any occurred during validation
    if (errors.length > 0) {
        showEditGameAlert(errors.join("<br>"), 'danger'); // Show errors in red box
        return;
    }

    // Proceed with updates if validation passed for all modes
    try {
        let updateSuccess = true;
        allUpdates.forEach(updatedEntry => {
            try {
                updateLocalGameEntry(currentTab, updatedEntry.id, updatedEntry);
            } catch (updateError) {
                console.error(`Failed to update entry ID ${updatedEntry.id}:`, updateError);
                // Collect errors for final message if needed
                errors.push(`Failed to save changes for mode "${escapeHtml(updatedEntry.gameMode)}".`);
                updateSuccess = false;
            }
        });

        // If any individual update failed, show errors
        if (!updateSuccess) {
            showEditGameAlert(errors.join("<br>"), 'danger');
            return;
        }

        // If all updates succeeded
        renderGamesForTab(currentTab); // Refresh the table UI
        $('#editGameModal').modal('hide'); // Close the modal

    } catch (error) {
        // Catch general errors during the update process
        console.error("Error updating entries:", error);
        showEditGameAlert("An unexpected error occurred while saving changes.", 'danger');
    }
}

