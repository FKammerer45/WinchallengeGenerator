// games.js
import { getLocalTabs, getLocalEntries } from "./localStorageUtils.js";
import { createNewTab, createTabFromLocalData } from "./tabManagement.js";
import { renderGamesForTab, handleSaveNewGame, handleUpdateGame, handleDeleteGame } from "./entryManagement.js";
import { attachSaveTabHandler, attachLoadSavedTabsHandler, attachTabRenameHandler, attachLoadDefaultEntriesHandler } from "./gamesExtensions.js";

// Wait for the DOM to load
document.addEventListener("DOMContentLoaded", () => {
  // Check if this is the games management page.
  const gamesTabContent = document.getElementById("gamesTabContent");
  if (!gamesTabContent) {
    console.warn("gamesTabContent not found. Skipping games page initialization.");
    return;
  }

  // Rebuild dynamic tabs (for non-default tabs)
  const tabs = getLocalTabs();
  for (const tabId in tabs) {
    if (tabId !== "default") {
      try {
        createTabFromLocalData(tabId, tabs[tabId].name);
      } catch (error) {
        console.error("Error creating tab from local data for tab", tabId, error);
      }
    }
  }

  // Render entries for each tab from localStorage.
  const allEntries = getLocalEntries();
  for (const tabId in allEntries) {
    renderGamesForTab(tabId);
  }

  // Attach event listener to the "+" button to create a new tab.
  const addTabBtn = document.getElementById("addTabBtn");
  if (addTabBtn && addTabBtn.parentNode) {
    addTabBtn.addEventListener("click", (e) => {
      e.preventDefault();
      createNewTab();
      // Update dropdown if it exists (for challenge form, might be on another page)
      const gameSourceSelect = document.getElementById("gameSourceSelect");
      if (gameSourceSelect) {
        // Optionally update dropdown on games page if needed.
      }
    });
  } else {
    console.error("Add Tab button or its parent not found.");
  }

  // Attach event listener for "Insert" button clicks (to open the new game modal).
  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("insertGameBtn")) {
      $("#newGameModal").modal("show");
      window.currentTargetTab = e.target.getAttribute("data-tab");
    }
  });

  // Attach handlers for adding, updating, and deleting game entries.
  const saveNewGameBtn = document.getElementById("saveNewGameBtn");
  if (saveNewGameBtn) {
    saveNewGameBtn.addEventListener("click", handleSaveNewGame);
  } else {
    console.error("Save New Game button not found.");
  }
  const updateGameBtn = document.getElementById("updateGameBtn");
  if (updateGameBtn) {
    updateGameBtn.addEventListener("click", handleUpdateGame);
  } else {
    console.error("Update Game button not found.");
  }
  const deleteGameBtn = document.getElementById("deleteGameBtn");
  if (deleteGameBtn) {
    deleteGameBtn.addEventListener("click", handleDeleteGame);
  } else {
    console.error("Delete Game button not found.");
  }

  // Attach a dblclick event for editing a game entry.
  document.addEventListener("dblclick", (e) => {
    const targetRow = e.target.closest("tr");
    if (targetRow && targetRow.parentElement.classList.contains("gamesTable")) {
      // Update current tab id from the parent tab-pane.
      const tabPane = targetRow.closest(".tab-pane");
      if (tabPane) {
        window.currentTargetTab = tabPane.id;
      }
      const cells = targetRow.querySelectorAll("td");
      const entryData = {
        id: targetRow.dataset.id,
        game: cells[0] ? cells[0].textContent : "",
        gameMode: cells[1] ? cells[1].textContent : "",
        difficulty: cells[2] ? cells[2].textContent : "",
        numberOfPlayers: cells[3] ? cells[3].textContent : ""
      };
      console.log("Editing entry:", entryData);
      // Open the edit modal with entry data.
      const editEntryId = document.getElementById("editEntryId");
      const editGameName = document.getElementById("editGameName");
      const editGameMode = document.getElementById("editGameMode");
      const editDifficulty = document.getElementById("editDifficulty");
      const editPlayers = document.getElementById("editPlayers");
      if (editEntryId && editGameName && editGameMode && editDifficulty && editPlayers) {
        editEntryId.value = entryData.id || "";
        editGameName.value = entryData.game;
        editGameMode.value = entryData.gameMode;
        editDifficulty.value = entryData.difficulty;
        editPlayers.value = entryData.numberOfPlayers;
        $("#editGameModal").modal("show");
      } else {
        console.error("One or more edit modal elements not found.");
      }
    }
  });

  // Attach additional handlers for saving tabs, loading saved tabs, default entries, and renaming tabs.
  attachSaveTabHandler();
  attachLoadSavedTabsHandler();
  attachLoadDefaultEntriesHandler();
  attachTabRenameHandler();
});
