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

// --- Alert Helper ---
// Wrap showError so we always pass the actual element
function showEditGameAlert(message) {
    const alertEl = document.getElementById('editGameAlert');
    showError(alertEl, message);
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
    if (!form) { console.error("New game form not found"); return; }

    const gameInput = form.elements.newGameName;
    const modeInput = form.elements.newGameMode;
    const diffInput = form.elements.newDifficulty;
    const playersInput = form.elements.newPlayers;

    const game = gameInput?.value.trim();
    const gameMode = modeInput?.value.trim();
    const difficulty = parseFloat(diffInput?.value);
    const numberOfPlayers = parseInt(playersInput?.value);


    let errors = [];
    if (!game) errors.push("Game name is required.");
    if (!gameMode) errors.push("Game mode is required.");
    if (isNaN(difficulty)) errors.push("Difficulty must be a number.");
    if (isNaN(numberOfPlayers)) errors.push("Number of players must be an integer.");
    if (!isNaN(difficulty) && (difficulty < 0 || difficulty > 10 || Math.round(difficulty * 10) / 10 !== difficulty)) { errors.push("Difficulty must be between 0.0 and 10.0 (e.g., 5.0, 7.5)."); }
    if (!isNaN(numberOfPlayers) && (numberOfPlayers < 1 || numberOfPlayers > 99 || !Number.isInteger(numberOfPlayers))) { errors.push("Number of players must be a whole number between 1 and 99."); }

    if (errors.length > 0) { const alertEl = document.getElementById('newGameAlert');showError(alertEl, errors.join("<br>")); return; }

    const currentTab = window.currentTargetTab || "default";
    let tabName = "Default";
    try { tabName = getLocalTabs()[currentTab]?.name || tabName; } catch (e) { console.error("Error reading tabs for tabName:", e); }

    const newEntry = {
        id: "local-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7),
        game, gameMode, difficulty: difficulty.toFixed(1), numberOfPlayers,
        tabName, weight: 1.0
    };

    try {
        addLocalGameEntry(currentTab, newEntry);
        renderGamesForTab(currentTab);
        $('#newGameModal').modal('hide');
        form.reset();
    } catch (error) { console.error("Error saving entry or rendering tab:", error); showGameFormAlert("Failed to save entry. Please try again.", 'danger', 'newGameAlert'); }
} // (End handleSaveNewGame)

/**
 * Handles saving changes from the redesigned edit modal (multiple modes).
 */
export function handleUpdateGame() {
    const form = document.getElementById("editGameForm");
    const gameName = document.getElementById("editGameNameDisplay")?.textContent;
    const modesContainer = document.getElementById("editGameModesContainer");
    const currentTab = window.currentTargetTab || "default";

    if (!form || !modesContainer || !gameName || !currentTab) {
        console.error("Cannot update: Missing form elements, game name, or tab context.");
        showEditGameAlert("An internal error occurred. Cannot save changes.");
        return;
    }

    const modeSections = modesContainer.querySelectorAll(".edit-mode-section");
    let allUpdates = [];
    let errors = [];

    if (modeSections.length === 0) {
        showEditGameAlert("No modes remaining for this game.", "info");
        setTimeout(() => {
            $('#editGameModal').modal('hide');
            renderGamesForTab(currentTab);
        }, 1500);
        return;
    }

    // console.log("--- Starting Update Validation ---"); // Optional debug log

    modeSections.forEach((section, index) => {
        const entryId = section.dataset.entryId;
        const modeInput = section.querySelector(".edit-mode-name-input");
        const diffInput = section.querySelector(".edit-mode-difficulty");
        const playersInput = section.querySelector(".edit-mode-players");

        // console.log(`Processing Section #${index + 1}, Entry ID: ${entryId}`); // Optional debug log
        // console.log("Mode Input Element:", modeInput);
        // console.log("Mode Input Value (raw):", modeInput?.value);
        const gameMode = modeInput?.value.trim();
        // console.log("Mode Input Value (trimmed):", gameMode);

        const difficulty = parseFloat(diffInput?.value);
        const numberOfPlayers = parseInt(playersInput?.value);

        // --- Validation per mode ---
        if (!entryId) errors.push(`Internal error: Missing ID for mode #${index + 1}.`);
        if (!gameMode) { errors.push(`Mode name is required for entry #${index + 1}.`); console.error(`Validation failed for section ${index + 1}: gameMode is empty after trim.`); }
        if (isNaN(difficulty)) errors.push(`Difficulty must be a number for mode "${gameMode || index + 1}".`);
        if (isNaN(numberOfPlayers)) errors.push(`Number of players must be an integer for mode "${gameMode || index + 1}".`);
        if (!isNaN(difficulty) && (difficulty < 0 || difficulty > 10 || Math.round(difficulty * 10) / 10 !== difficulty)) { errors.push(`Difficulty for "${gameMode || index + 1}" must be 0.0-10.0.`); }
        if (!isNaN(numberOfPlayers) && (numberOfPlayers < 1 || numberOfPlayers > 99 || !Number.isInteger(numberOfPlayers))) { errors.push(`Players for "${gameMode || index + 1}" must be 1-99.`); }
        // --- End Validation ---

        if (errors.length === 0) {
            const allEntries = getLocalEntries();
            const originalEntry = (allEntries[currentTab] || []).find(e => e.id === entryId);
            allUpdates.push({
                id: entryId, game: gameName, gameMode,
                difficulty: difficulty.toFixed(1), numberOfPlayers,
                weight: originalEntry?.weight ?? 1.0, tabName: originalEntry?.tabName ?? "Default"
            });
        }
    }); // End forEach section

    // console.log("--- Finished Update Validation ---");
    // console.log("Validation Errors:", errors);
    // console.log("Updates to Apply:", allUpdates);

    if (errors.length > 0) {
        showEditGameAlert(errors.join("<br>"));
        return; // Stop if any validation failed
    }

    // Proceed with updates
    try {
        let updateSuccess = true;
        allUpdates.forEach(updatedEntry => {
            try { updateLocalGameEntry(currentTab, updatedEntry.id, updatedEntry); }
            catch (updateError) { console.error(`Failed to update entry ID ${updatedEntry.id}:`, updateError); errors.push(`Failed to save changes for mode "${updatedEntry.gameMode}".`); updateSuccess = false; }
        });

        if (!updateSuccess) { showEditGameAlert(errors.join("<br>")); return; }

        renderGamesForTab(currentTab);
        $('#editGameModal').modal('hide');

    } catch (error) {
        console.error("Error updating entries:", error);
        showEditGameAlert("An unexpected error occurred while saving changes.");
    }
} // (End handleUpdateGame)


