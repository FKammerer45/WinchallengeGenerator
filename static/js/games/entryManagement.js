// entryManagement.js
import { addLocalGameEntry, updateLocalGameEntry, removeLocalGameEntry, getLocalEntries } from "./localStorageUtils.js";

export function renderGamesForTab(tabId) {
  // Normalize the tab id so that it is a valid CSS selector:
  // If the tabId is not "default" and doesn't start with "tabPane-", prepend "tabPane-"
  let normalizedTabId = tabId;
  if (tabId !== "default" && !tabId.startsWith("tabPane-")) {
    normalizedTabId = "tabPane-" + tabId;
  }
  
  const entries = getLocalEntries();
  // Use the normalizedTabId for querying the DOM
  const tbody = document.querySelector(`#${normalizedTabId} .gamesTable`);
  if (!tbody) {
    console.error(`renderGamesForTab: No element found for id #${normalizedTabId} .gamesTable`);
    return;
  }
  
  tbody.innerHTML = "";
  if (entries[tabId] && entries[tabId].length > 0) {
    entries[tabId].forEach(entry => {
      const row = `<tr data-id="${entry.id}">
                      <td>${entry.game}</td>
                      <td>${entry.gameMode}</td>
                      <td>${entry.difficulty}</td>
                      <td>${entry.numberOfPlayers}</td>
                   </tr>`;
      tbody.insertAdjacentHTML("beforeend", row);
    });
  } else {
    // Optionally, you can display a message if no entries exist
    tbody.innerHTML = `<tr><td colspan="4">No entries for this tab.</td></tr>`;
  }
}
export function handleSaveNewGame() {
  const form = document.getElementById("newGameForm");
  const game = form.newGameName.value.trim();
  const gameMode = form.newGameMode.value.trim();
  const difficulty = parseFloat(form.newDifficulty.value);
  const numberOfPlayers = parseInt(form.newPlayers.value);

  if (!game || !gameMode || isNaN(difficulty) || isNaN(numberOfPlayers)) {
    showGameFormAlert("All fields must be filled in correctly!");
    return;
  }
  if (difficulty < 1 || difficulty > 10 || Math.round(difficulty * 10) !== difficulty * 10) {
    showGameFormAlert("Difficulty must be between 1 and 10 in 0.1 increments!");
    return;
  }
  if (numberOfPlayers < 1 || numberOfPlayers > 20) {
    showGameFormAlert("Number of players must be between 1 and 20!");
    return;
  }

  const currentTab = window.currentTargetTab || "default";
  const tabs = JSON.parse(localStorage.getItem("localTabs"));
  const tabName = tabs[currentTab] ? tabs[currentTab].name : "Default";

  const newEntry = {
    id: "local-" + Date.now(),
    game,
    gameMode,
    difficulty: difficulty.toFixed(1),
    numberOfPlayers,
    tabName
  };

  addLocalGameEntry(currentTab, newEntry);
  renderGamesForTab(currentTab);
  $("#newGameModal").modal("hide");
  form.reset();
  document.getElementById("gameFormAlert").innerHTML = "";
}

export function handleUpdateGame() {
  const form = document.getElementById("editGameForm");
  const entryId = form.editEntryId.value;
  const game = form.editGameName.value.trim();
  const gameMode = form.editGameMode.value.trim();
  const difficulty = parseFloat(form.editDifficulty.value);
  const numberOfPlayers = parseInt(form.editPlayers.value);

  if (!game || !gameMode || isNaN(difficulty) || isNaN(numberOfPlayers)) {
    showAlert("All fields must be filled in correctly!", "editGameAlert");
    return;
  }
  if (difficulty < 1 || difficulty > 10) {
    showAlert("Difficulty must be between 1 and 10!", "editGameAlert");
    return;
  }
  if (numberOfPlayers < 1 || numberOfPlayers > 20) {
    showAlert("Number of players must be between 1 and 20!", "editGameAlert");
    return;
  }

  const currentTab = window.currentTargetTab || "default";
  const tabs = JSON.parse(localStorage.getItem("localTabs"));
  const tabName = tabs[currentTab] ? tabs[currentTab].name : "Default";

  const updatedEntry = {
    id: entryId,
    game,
    gameMode,
    difficulty: difficulty.toFixed(1),
    numberOfPlayers,
    tabName
  };

  updateLocalGameEntry(currentTab, entryId, updatedEntry);
  renderGamesForTab(currentTab);
  $("#editGameModal").modal("hide");
}

export function handleDeleteGame() {
  const entryId = document.getElementById("editEntryId").value;
  if (!entryId) {
    showAlert("No entry selected!", "editGameAlert");
    return;
  }
  if (!confirm("Do you really want to delete this entry?")) {
    return;
  }

  const currentTab = window.currentTargetTab || "default";
  removeLocalGameEntry(currentTab, entryId);
  renderGamesForTab(currentTab);
  $("#editGameModal").modal("hide");
}
