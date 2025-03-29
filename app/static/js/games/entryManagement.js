// entryManagement.js

// *** ADD getLocalTabs here ***
import { addLocalGameEntry, updateLocalGameEntry, removeLocalGameEntry, getLocalEntries, getLocalTabs } from "./localStorageUtils.js";

// Helper function for showing alerts (ensure this is defined or imported if needed)
function showGameFormAlert(message, type = 'danger', containerId = 'gameFormAlert') {
    const alertContainer = document.getElementById(containerId);
    if (alertContainer) {
        const alertHtml = `
            <div class="alert alert-${type} alert-dismissible fade show" role="alert">
                ${message}
                <button type="button" class="close" data-dismiss="alert" aria-label="Close">
                    <span aria-hidden="true">&times;</span>
                </button>
            </div>`;
        alertContainer.innerHTML = alertHtml;
    } else {
        // Fallback to standard alert if container not found
        alert(message);
    }
}
function showEditGameAlert(message, type = 'danger') {
    showGameFormAlert(message, type, 'editGameAlert');
}

// Definition for renderGamesForTab (keep as previously corrected)
export function renderGamesForTab(tabId) {
  let normalizedTabId = tabId;
  if (tabId && tabId !== "default" && !tabId.startsWith("tabPane-")) {
    normalizedTabId = "tabPane-" + tabId;
  } else if (!tabId) { console.error("renderGamesForTab: Invalid tabId:", tabId); return; }

  let entries = [];
  try {
      const allEntries = getLocalEntries();
      entries = allEntries[tabId] || [];
  } catch (e) { console.error(`Error getting local entries for tab ${tabId}:`, e); }

  const tbody = document.querySelector(`#${normalizedTabId} .gamesTable`);
  if (!tbody) { return; }

  tbody.innerHTML = "";
  if (entries.length > 0) {
    entries.forEach(entry => {
      const game = entry.game || 'N/A';
      const gameMode = entry.gameMode || 'N/A';
      const difficulty = entry.difficulty !== undefined ? entry.difficulty : 'N/A';
      const players = entry.numberOfPlayers !== undefined ? entry.numberOfPlayers : 'N/A';
      const entryId = entry.id || '';

      const row = document.createElement('tr');
      row.dataset.id = entryId;
      row.innerHTML = `<td></td><td></td><td></td><td></td>`; // Create cells first
      row.cells[0].textContent = game; // Set textContent for safety
      row.cells[1].textContent = gameMode;
      row.cells[2].textContent = difficulty;
      row.cells[3].textContent = players;
      tbody.appendChild(row);
    });
  } else {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">No entries added to this tab yet.</td></tr>`;
  }
}

// Definition for handleSaveNewGame (now uses imported getLocalTabs correctly)
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
  // (Keep validation logic as before)
    if (!game) errors.push("Game name is required.");
    if (!gameMode) errors.push("Game mode is required.");
    if (isNaN(difficulty)) errors.push("Difficulty must be a number.");
    if (isNaN(numberOfPlayers)) errors.push("Number of players must be an integer.");
    if (!isNaN(difficulty) && (difficulty < 0 || difficulty > 10 || Math.round(difficulty * 10) / 10 !== difficulty)) {
        errors.push("Difficulty must be between 0 and 10 (e.g., 5.0, 7.5).");
    }
    if (!isNaN(numberOfPlayers) && (numberOfPlayers < 1 || numberOfPlayers > 99 || !Number.isInteger(numberOfPlayers))) {
        errors.push("Number of players must be a whole number between 1 and 99.");
    }


  if (errors.length > 0) {
      showGameFormAlert(errors.join("<br>"), 'danger', 'newGameAlert');
      return;
  }

  const currentTab = window.currentTargetTab || "default";
  let tabName = "Default";
  try {
      const tabs = getLocalTabs(); // *** THIS WILL NOW WORK ***
      tabName = tabs[currentTab]?.name || tabName;
  } catch(e) { console.error("Error reading tabs for tabName:", e); }

  const newEntry = {
    id: "local-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7),
    game,
    gameMode,
    difficulty: difficulty.toFixed(1),
    numberOfPlayers,
    tabName // Correct tabName should be included now
  };
  console.log(`Adding new entry to tab '${currentTab}':`, newEntry);

  try {
      addLocalGameEntry(currentTab, newEntry);
      renderGamesForTab(currentTab);
      $('#newGameModal').modal('hide');
      form.reset();
  } catch (error) {
      console.error("Error saving entry or rendering tab:", error);
      showGameFormAlert("Failed to save entry. Please try again.", 'danger', 'newGameAlert');
  }
}

// Definition for handleUpdateGame (ensure getLocalTabs is used here too if needed)
export function handleUpdateGame() {
  const form = document.getElementById("editGameForm");
   if (!form) { console.error("Edit game form not found"); return; }

   const entryIdInput = form.elements.editEntryId;
   const gameInput = form.elements.editGameName;
   const modeInput = form.elements.editGameMode;
   const diffInput = form.elements.editDifficulty;
   const playersInput = form.elements.editPlayers;

  const entryId = entryIdInput?.value;
  const game = gameInput?.value.trim();
  const gameMode = modeInput?.value.trim();
  const difficulty = parseFloat(diffInput?.value);
  const numberOfPlayers = parseInt(playersInput?.value);

  showEditGameAlert("", "info"); // Clear previous alerts

  let errors = [];
   // (Keep validation logic as before)
    if (!entryId) errors.push("Entry ID is missing. Cannot update.");
    if (!game) errors.push("Game name is required.");
    if (!gameMode) errors.push("Game mode is required.");
    if (isNaN(difficulty)) errors.push("Difficulty must be a number.");
    if (isNaN(numberOfPlayers)) errors.push("Number of players must be an integer.");
    if (!isNaN(difficulty) && (difficulty < 0 || difficulty > 10 || Math.round(difficulty * 10) / 10 !== difficulty)) {
        errors.push("Difficulty must be between 0 and 10 (e.g., 5.0, 7.5).");
    }
    if (!isNaN(numberOfPlayers) && (numberOfPlayers < 1 || numberOfPlayers > 99 || !Number.isInteger(numberOfPlayers))) {
        errors.push("Number of players must be a whole number between 1 and 99.");
    }


  if (errors.length > 0) {
      showEditGameAlert(errors.join("<br>"), 'danger');
      return;
  }

  const currentTab = window.currentTargetTab || "default";
  let tabName = "Default";
  try {
      const tabs = getLocalTabs(); // *** THIS WILL NOW WORK ***
      tabName = tabs[currentTab]?.name || tabName;
  } catch(e) { console.error("Error reading tabs for tabName:", e); }


  const updatedEntry = {
    id: entryId,
    game,
    gameMode,
    difficulty: difficulty.toFixed(1),
    numberOfPlayers,
    tabName // Update tabName if needed? Or keep original? Let's keep for now.
  };
  console.log(`Updating entry '${entryId}' in tab '${currentTab}':`, updatedEntry);

  try {
      updateLocalGameEntry(currentTab, entryId, updatedEntry);
      renderGamesForTab(currentTab);
      $('#editGameModal').modal('hide');
  } catch (error) {
      console.error("Error updating entry or rendering tab:", error);
      showEditGameAlert("Failed to update entry. Please try again.", 'danger');
  }
}

// Definition for handleDeleteGame (keep as previously corrected)
export function handleDeleteGame() {
  const entryIdInput = document.getElementById("editEntryId");
  const entryId = entryIdInput?.value;

  if (!entryId) { showEditGameAlert("No entry selected for deletion."); return; }

  const form = document.getElementById("editGameForm");
  const gameName = form.elements.editGameName?.value || "this entry";
  if (!confirm(`Are you sure you want to delete the entry for "${gameName}"?`)) { return; }

  const currentTab = window.currentTargetTab || "default";
  console.log(`Deleting entry '${entryId}' from tab '${currentTab}'`);

  try {
      removeLocalGameEntry(currentTab, entryId);
      renderGamesForTab(currentTab);
      $('#editGameModal').modal('hide');
  } catch (error) {
       console.error("Error deleting entry or rendering tab:", error);
      showEditGameAlert("Failed to delete entry. Please try again.", 'danger');
  }
}