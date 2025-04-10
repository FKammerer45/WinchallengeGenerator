// static/js/games/entryManagement.js
// Manages rendering and CRUD operations for game entries in localStorage, now with grouping.

import {
  addLocalGameEntry,
  updateLocalGameEntry,
  getLocalEntries,
  getLocalTabs
} from "./localStorageUtils.js";
import { escapeHtml } from "../utils/helpers.js"; // Import escapeHtml

// --- Alert Helpers --- (Assume these exist or are imported)
function showGameFormAlert(message, type = 'danger', containerId = 'newGameAlert') {
  const alertContainer = document.getElementById(containerId);
  if (alertContainer) {
      alertContainer.innerHTML = `<div class="alert alert-${type} alert-dismissible fade show" role="alert">${message}<button type="button" class="close" data-dismiss="alert">&times;</button></div>`;
  } else { alert(message); }
}
function showEditGameAlert(message, type = 'danger') {
  showGameFormAlert(message, type, 'editGameAlert'); // Target the alert div in the edit modal
}

/**
* Groups entries by game name and calculates display values.
* @param {Array} entries - Array of game entry objects for a tab.
* @returns {Object} - Object where keys are game names and values contain aggregated data.
* Example: { "CSGO": { modes: ["Ranked", "Premier"], diffRange: "7-8", playerRange: "5", entryIds: [1, 2] }, ... }
*/
function groupEntriesForDisplay(entries) {
  const grouped = {};
  if (!Array.isArray(entries)) return grouped;

  entries.forEach(entry => {
      if (!entry || !entry.game) return;
      const gameName = entry.game.trim();
      if (!gameName) return;

      if (!grouped[gameName]) {
          grouped[gameName] = {
              modes: new Set(),
              difficulties: [],
              players: [],
              entryIds: [] // Store original IDs
          };
      }

      if (entry.gameMode) grouped[gameName].modes.add(entry.gameMode.trim());
      if (entry.difficulty !== undefined) grouped[gameName].difficulties.push(parseFloat(entry.difficulty));
      if (entry.numberOfPlayers !== undefined) grouped[gameName].players.push(parseInt(entry.numberOfPlayers));
      if (entry.id) grouped[gameName].entryIds.push(entry.id);
  });

  // Process aggregated data for display
  for (const gameName in grouped) {
      const data = grouped[gameName];
      // Format modes
      data.modes = Array.from(data.modes).sort().join(', ');

      // Format difficulty range
      const uniqueDiffs = [...new Set(data.difficulties)].sort((a, b) => a - b);
      if (uniqueDiffs.length === 0) data.diffRange = 'N/A';
      else if (uniqueDiffs.length === 1) data.diffRange = uniqueDiffs[0].toFixed(1);
      else data.diffRange = `${uniqueDiffs[0].toFixed(1)}-${uniqueDiffs[uniqueDiffs.length - 1].toFixed(1)}`;

      // Format player range
      const uniquePlayers = [...new Set(data.players)].sort((a, b) => a - b);
      if (uniquePlayers.length === 0) data.playerRange = 'N/A';
      else if (uniquePlayers.length === 1) data.playerRange = uniquePlayers[0].toString();
      else data.playerRange = `${uniquePlayers[0]}-${uniquePlayers[uniquePlayers.length - 1]}`;
  }

  return grouped;
}

/**
* Renders game entries grouped by game name into the specified table body.
* @param {string} tabId - The ID of the tab whose entries should be rendered.
*/
export function renderGamesForTab(tabId) {
  let normalizedTabId = tabId;
  // Handle potential missing prefix for dynamic tabs
  if (tabId && tabId !== "default" && !tabId.startsWith("tabPane-")) {
      normalizedTabId = "tabPane-" + tabId;
  } else if (!tabId) {
      console.error("renderGamesForTab: Invalid tabId:", tabId);
      return;
  }

  let entries = [];
  try {
      const allEntries = getLocalEntries();
      entries = allEntries[tabId] || [];
  } catch (e) { console.error(`Error getting local entries for tab ${tabId}:`, e); }

  const tbody = document.querySelector(`#${normalizedTabId} .gamesTable`);
  if (!tbody) {
      // This might happen briefly during tab creation, not necessarily an error
      // console.warn(`renderGamesForTab: Table body not found for selector #${normalizedTabId} .gamesTable`);
      return;
  }

  tbody.innerHTML = ""; // Clear existing rows
  const groupedEntries = groupEntriesForDisplay(entries);
  const sortedGameNames = Object.keys(groupedEntries).sort();

  if (sortedGameNames.length > 0) {
      sortedGameNames.forEach(gameName => {
          const data = groupedEntries[gameName];
          const row = document.createElement('tr');
          // Store game name and original entry IDs for editing
          row.dataset.gameName = gameName; // Use gameName for editing lookup
          row.dataset.entryIds = JSON.stringify(data.entryIds); // Store IDs as JSON string

          row.innerHTML = `
              <td>${escapeHtml(gameName)}</td>
              <td>${escapeHtml(data.modes) || '<span class="text-muted small">N/A</span>'}</td>
              <td>${escapeHtml(data.diffRange)}</td>
              <td>${escapeHtml(data.playerRange)}</td>
          `;
          tbody.appendChild(row);
      });
  } else {
      tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">No entries added to this tab yet.</td></tr>`;
  }
}

/**
* Handles saving a new single game entry (from the "Insert New Entry" modal).
*/
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

  showGameFormAlert("", "info", "newGameAlert"); // Clear previous alerts

  let errors = [];
  if (!game) errors.push("Game name is required.");
  // Mode is now optional when adding, user can add modes via edit? Or require it? Let's require it for now.
  if (!gameMode) errors.push("Game mode is required.");
  if (isNaN(difficulty)) errors.push("Difficulty must be a number.");
  if (isNaN(numberOfPlayers)) errors.push("Number of players must be an integer.");
  if (!isNaN(difficulty) && (difficulty < 0 || difficulty > 10 || Math.round(difficulty * 10) / 10 !== difficulty)) {
      errors.push("Difficulty must be between 0.0 and 10.0 (e.g., 5.0, 7.5).");
  }
  if (!isNaN(numberOfPlayers) && (numberOfPlayers < 1 || numberOfPlayers > 99 || !Number.isInteger(numberOfPlayers))) {
      errors.push("Number of players must be a whole number between 1 and 99.");
  }

  if (errors.length > 0) {
      showGameFormAlert(errors.join("<br>"), 'danger', 'newGameAlert');
      return;
  }

  const currentTab = window.currentTargetTab || "default"; // Relies on global var set by click listener
  let tabName = "Default"; // Default tab name
  try {
      const tabs = getLocalTabs();
      tabName = tabs[currentTab]?.name || tabName;
  } catch(e) { console.error("Error reading tabs for tabName:", e); }

  const newEntry = {
      id: "local-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7), // Unique local ID
      game,
      gameMode,
      difficulty: difficulty.toFixed(1), // Store with consistent precision
      numberOfPlayers,
      tabName, // Store tab context if needed elsewhere
      weight: 1.0 // Default weight, maybe add to form later?
  };

  try {
      addLocalGameEntry(currentTab, newEntry);
      renderGamesForTab(currentTab); // Re-render the (now grouped) table for the current tab
      $('#newGameModal').modal('hide');
      form.reset();
  } catch (error) {
      console.error("Error saving entry or rendering tab:", error);
      showGameFormAlert("Failed to save entry. Please try again.", 'danger', 'newGameAlert');
  }
}

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

  console.log("--- Starting Update Validation ---"); // Debug log

  modeSections.forEach((section, index) => {
      const entryId = section.dataset.entryId;
      const modeInput = section.querySelector(".edit-mode-name-input"); // Selector for mode name input
      const diffInput = section.querySelector(".edit-mode-difficulty");
      const playersInput = section.querySelector(".edit-mode-players");

      // *** ADDED LOGGING FOR DEBUGGING ***
      console.log(`Processing Section #${index + 1}, Entry ID: ${entryId}`);
      console.log("Mode Input Element:", modeInput); // Log the element found
      console.log("Mode Input Value (raw):", modeInput?.value); // Log raw value
      const gameMode = modeInput?.value.trim(); // Read value and trim
      console.log("Mode Input Value (trimmed):", gameMode); // Log trimmed value
      // *** END LOGGING ***

      const difficulty = parseFloat(diffInput?.value);
      const numberOfPlayers = parseInt(playersInput?.value);

      // --- Validation per mode ---
      if (!entryId) errors.push(`Internal error: Missing ID for mode #${index + 1}.`);
      // *** Check the trimmed gameMode value ***
      if (!gameMode) {
          errors.push(`Mode name is required for entry #${index + 1}.`);
          console.error(`Validation failed for section ${index+1}: gameMode is empty after trim.`); // Log specific failure
      }
      // ... (rest of validation remains the same) ...
      if (isNaN(difficulty)) errors.push(`Difficulty must be a number for mode "${gameMode || index + 1}".`);
      if (isNaN(numberOfPlayers)) errors.push(`Number of players must be an integer for mode "${gameMode || index + 1}".`);
      if (!isNaN(difficulty) && (difficulty < 0 || difficulty > 10 || Math.round(difficulty * 10) / 10 !== difficulty)) { errors.push(`Difficulty for "${gameMode || index + 1}" must be 0.0-10.0.`); }
      if (!isNaN(numberOfPlayers) && (numberOfPlayers < 1 || numberOfPlayers > 99 || !Number.isInteger(numberOfPlayers))) { errors.push(`Players for "${gameMode || index + 1}" must be 1-99.`); }
      // --- End Validation ---

      if (errors.length === 0) { // Only proceed if no errors *so far* for this mode
          const allEntries = getLocalEntries();
          const originalEntry = (allEntries[currentTab] || []).find(e => e.id === entryId);
          allUpdates.push({
              id: entryId, game: gameName, gameMode, // Use the validated gameMode
              difficulty: difficulty.toFixed(1), numberOfPlayers,
              weight: originalEntry?.weight ?? 1.0, tabName: originalEntry?.tabName ?? "Default"
          });
      }
  }); // End forEach section

  console.log("--- Finished Update Validation ---"); // Debug log
  console.log("Validation Errors:", errors); // Log errors found
  console.log("Updates to Apply:", allUpdates); // Log updates prepared

  if (errors.length > 0) {
      showEditGameAlert(errors.join("<br>"), 'danger');
      return; // Stop if any validation failed
  }

  // Proceed with updates
  try {
      let updateSuccess = true;
      allUpdates.forEach(updatedEntry => {
          try { updateLocalGameEntry(currentTab, updatedEntry.id, updatedEntry); }
          catch (updateError) { console.error(`Failed to update entry ID ${updatedEntry.id}:`, updateError); errors.push(`Failed to save changes for mode "${updatedEntry.gameMode}".`); updateSuccess = false; }
      });

      if (!updateSuccess) { showEditGameAlert(errors.join("<br>"), 'danger'); return; }

      renderGamesForTab(currentTab);
      $('#editGameModal').modal('hide');

  } catch (error) {
      console.error("Error updating entries:", error);
      showEditGameAlert("An unexpected error occurred while saving changes.", 'danger');
  }
}


