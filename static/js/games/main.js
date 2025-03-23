import { initLocalStorage, getLocalTabs } from "./localStorageUtils.js";
import { createNewTab, createTabFromLocalData } from "./tabManagement.js";
import { renderGamesForTab, handleSaveNewGame, handleUpdateGame, handleDeleteGame } from "./entryManagement.js";

// -------------------------
// Populate Game Source Dropdown
// -------------------------
function populateGameSourceDropdown() {
  const dropdown = document.getElementById("gameSourceSelect");
  if (!dropdown) {
    console.error("Dropdown with id 'gameSourceSelect' not found.");
    return;
  }
  dropdown.innerHTML = "";
  const tabs = getLocalTabs();
  console.log("Populating dropdown with tabs:", tabs);
  for (const tabId in tabs) {
    const option = document.createElement("option");
    option.value = tabId;
    option.textContent = tabs[tabId].name;
    dropdown.appendChild(option);
  }
}

// -------------------------
// Update Game Selection Card from Local Storage
// -------------------------
function updateGameSelectionCard() {
  const dropdown = document.getElementById("gameSourceSelect");
  if (!dropdown) {
    console.error("Dropdown with id 'gameSourceSelect' not found.");
    return;
  }
  const selectedTab = dropdown.value;
  console.log("Selected tab for game selection:", selectedTab);
  
  // Retrieve entries from localStorage for the selected tab.
  const allEntries = JSON.parse(localStorage.getItem("localEntries")) || {};
  const entries = allEntries[selectedTab] || [];
  console.log("Retrieved entries for tab", selectedTab, ":", entries);
  
  // Group entries by game name.
  const grouped = {};
  entries.forEach(entry => {
    const gameName = entry.game || "";
    if (!gameName) return;
    if (!grouped[gameName]) {
      grouped[gameName] = {
        weight: entry.weight ? entry.weight : 1, // default weight = 1
        availableModes: new Set()
      };
    }
    if (entry.gameMode) {
      grouped[gameName].availableModes.add(entry.gameMode);
    }
  });
  for (const key in grouped) {
    grouped[key].availableModes = Array.from(grouped[key].availableModes);
  }
  
  let html = "";
  const gameNames = Object.keys(grouped);
  if (gameNames.length > 0) {
    gameNames.forEach((gameName, index) => {
      const group = grouped[gameName];
      const weightVal = group.weight;
      const modalId = `modesModal${index + 1}`;
      
      let modalHtml = "";
      group.availableModes.forEach((mode, i) => {
        const checkboxId = `modal-${index + 1}-${i + 1}`;
        modalHtml += `
          <div class="form-check mb-2">
            <input class="form-check-input" type="checkbox" name="allowed_modes_${gameName}[]" value="${mode}" id="${checkboxId}">
            <label class="form-check-label ml-1" for="${checkboxId}">${mode}</label>
          </div>
        `;
      });
      
      html += `
        <tr data-game="${gameName}">
          <td>
            <input class="form-check-input" type="checkbox" name="selected_games" value="${gameName}" id="game${index + 1}"
              style="margin-left: 3px; margin-top:10px; margin-right:8px; vertical-align: middle;">
            <label class="form-check-label" for="game${index + 1}" style="margin-left: 20px; font-weight:bold; vertical-align: middle;">
              ${gameName}
            </label>
          </td>
          <td>
            <input type="number" name="weights" value="${weightVal}" step="0.1" style="width:70px; background-color:#2B2B2B; color:#fff; border:none;">
          </td>
          <td>
            <button type="button" class="btn btn-sm btn-secondary" data-toggle="modal" data-target="#${modalId}">
              Select Mode
            </button>
            <div class="modal fade" id="${modalId}" tabindex="-1" role="dialog" aria-labelledby="${modalId}Label" aria-hidden="true">
              <div class="modal-dialog" role="document">
                <div class="modal-content" style="color:#000;">
                  <div class="modal-header">
                    <h5 class="modal-title" id="${modalId}Label">Gamemodes for ${gameName}</h5>
                    <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                      <span aria-hidden="true">&times;</span>
                    </button>
                  </div>
                  <div class="modal-body">
                    ${modalHtml}
                  </div>
                  <div class="modal-footer">
                    <button type="button" class="btn btn-primary" data-dismiss="modal">Save</button>
                  </div>
                </div>
              </div>
            </div>
          </td>
        </tr>
      `;
    });
  } else {
    html = `<tr><td colspan="3">No games found in the selected source.</td></tr>`;
  }
  
  const tbody = document.getElementById("gamesSelectionTbody");
  if (tbody) {
    tbody.innerHTML = html;
  } else {
    console.error("Table body with id 'gamesSelectionTbody' not found.");
  }
}

// -------------------------
// Attach Challenge Form Handler (sends local entries)
// -------------------------
function attachChallengeFormHandler() {
  const challengeForm = document.getElementById("challengeForm");
  if (!challengeForm) {
    console.error("Challenge form with id 'challengeForm' not found.");
    return;
  }
  challengeForm.addEventListener("submit", function (e) {
    e.preventDefault();
    const formData = new FormData(this);

    const selectedTab = document.getElementById("gameSourceSelect").value;
    const allEntries = JSON.parse(localStorage.getItem("localEntries")) || {};
    const entries = allEntries[selectedTab] || [];
    console.log("Local entries for tab", selectedTab, ":", entries);

    // Convert keys for server (local key -> expected key).
    const convertedEntries = entries.map(entry => ({
      id: entry.id,
      Spiel: entry.game,
      Spielmodus: entry.gameMode,
      Schwierigkeit: entry.difficulty,
      Spieleranzahl: entry.numberOfPlayers,
      tabName: entry.tabName
    }));
    console.log("Converted entries:", convertedEntries);

    formData.append("entries", JSON.stringify(convertedEntries));

    fetch(window.generateChallengeUrl, {
      method: "POST",
      body: formData
    })
      .then(response => response.json())
      .then(data => {
        if (data.error) {
          alert(data.error);
        } else {
          const resultDiv = document.getElementById("challengeResult");
          resultDiv.style.display = "block";
          resultDiv.innerHTML = data.result;
          window.currentChallengeData = data;
          document.getElementById("acceptBtn").style.display = "inline-block";
        }
      })
      .catch(error => console.error("Error during challenge generation:", error));
  });
}

// -------------------------
// Attach Load Default Entries Button Handler
// -------------------------
function attachLoadDefaultEntriesHandler() {
  const loadDefaultBtn = document.getElementById("loadDefaultEntriesBtn");
  if (!loadDefaultBtn) {
    console.error("Load Default Entries button with id 'loadDefaultEntriesBtn' not found.");
    return;
  }
  loadDefaultBtn.addEventListener("click", () => {
    if (confirm("Are you sure you want to load the default entries? This will override your current default tab.")) {
      fetch("/load_default_entries")
        .then(response => response.json())
        .then(data => {
          if (data.error) {
            alert("Error: " + data.error);
          } else {
            // Convert server keys to local keys:
            // "Spiel" -> "game", "Spielmodus" -> "gameMode",
            // "Schwierigkeit" -> "difficulty", "Spieleranzahl" -> "numberOfPlayers"
            const convertedEntries = data.entries.map(entry => ({
              id: entry.id,
              game: entry["Spiel"],
              gameMode: entry["Spielmodus"],
              difficulty: entry["Schwierigkeit"],
              numberOfPlayers: entry["Spieleranzahl"],
              tabName: "Default",
              weight: entry.weight || 1  // default weight is 1 if not provided
            }));
            let localEntries = JSON.parse(localStorage.getItem("localEntries")) || {};
            localEntries["default"] = convertedEntries;
            localStorage.setItem("localEntries", JSON.stringify(localEntries));
            renderGamesForTab("default");
            alert("Default entries loaded successfully.");
          }
        })
        .catch(error => {
          console.error("Error loading default entries:", error);
          alert("Error loading default entries: " + error);
        });
    }
  });
}
// -------------------------
// Main Initialization
// -------------------------
document.addEventListener("DOMContentLoaded", () => {
  // Define challenge URL globally.
  window.generateChallengeUrl = "/generate_challenge";

  // Remove the form's default action.
  const challengeForm = document.getElementById("challengeForm");
  if (challengeForm) {
    challengeForm.removeAttribute("action");
  }

  // Initialize local storage.
  initLocalStorage();

  // Populate dropdown and update game selection card.
  populateGameSourceDropdown();
  updateGameSelectionCard();

  // Attach change event to dropdown.
  const dropdown = document.getElementById("gameSourceSelect");
  if (dropdown) {
    dropdown.addEventListener("change", updateGameSelectionCard);
  } else {
    console.error("Element with id 'gameSourceSelect' not found.");
  }

  // Attach challenge form handler.
  attachChallengeFormHandler();

  // Attach load default entries button handler (only in default tab).
  attachLoadDefaultEntriesHandler();

  // Rebuild dynamic tabs from localStorage (for tabs other than default).
  const gamesTabContent = document.getElementById("gamesTabContent");
  if (gamesTabContent) {
    const tabs = getLocalTabs();
    for (const tabId in tabs) {
      if (tabId !== "default") {
        try {
          createTabFromLocalData(tabId, tabs[tabId].name);
        } catch (error) {
          console.error("Error in createTabFromLocalData for tab", tabId, error);
        }
      }
    }
  } else {
    console.warn("Element with id 'gamesTabContent' not found; skipping dynamic tab rebuild.");
  }

  // Render entries for all tabs from localStorage.
  const allEntries = JSON.parse(localStorage.getItem("localEntries"));
  if (allEntries) {
    for (const tabId in allEntries) {
      renderGamesForTab(tabId);
    }
  }

  // Attach event listener to the "+" button to create a new tab.
  const addTabBtn = document.getElementById("addTabBtn");
  if (addTabBtn && addTabBtn.parentNode && addTabBtn.parentNode.parentNode) {
    addTabBtn.addEventListener("click", (e) => {
      e.preventDefault();
      createNewTab();
      // Update dropdown after creating a new tab.
      if (document.getElementById("gameSourceSelect")) {
        populateGameSourceDropdown();
      }
    });
  } else {
    console.error("Element with id 'addTabBtn' or its parent not found.");
  }

  // Global listener for "Insert" button clicks to open the new game modal.
  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("insertGameBtn")) {
      console.log("Insert button clicked:", e.target);
      $("#newGameModal").modal("show");
      window.currentTargetTab = e.target.getAttribute("data-tab");
    }
  });

  // Attach listeners for edit modal operations.
  const saveNewGameBtn = document.getElementById("saveNewGameBtn");
  if (saveNewGameBtn) {
    saveNewGameBtn.addEventListener("click", handleSaveNewGame);
  } else {
    console.error("Save button with id 'saveNewGameBtn' not found!");
  }

  const updateGameBtn = document.getElementById("updateGameBtn");
  if (updateGameBtn) {
    updateGameBtn.addEventListener("click", handleUpdateGame);
  } else {
    console.error("Update button with id 'updateGameBtn' not found!");
  }

  const deleteGameBtn = document.getElementById("deleteGameBtn");
  if (deleteGameBtn) {
    deleteGameBtn.addEventListener("click", handleDeleteGame);
  } else {
    console.error("Delete button with id 'deleteGameBtn' not found!");
  }

  // Global dblclick listener for editing a game entry (opens edit modal).
  document.addEventListener("dblclick", (e) => {
    const targetRow = e.target.closest("tr");
    if (targetRow && targetRow.parentElement.classList.contains("gamesTable")) {
      const cells = targetRow.querySelectorAll("td");
      const entryData = {
        id: targetRow.dataset.id,
        game: cells[0] ? cells[0].textContent : "",
        gameMode: cells[1] ? cells[1].textContent : "",
        difficulty: cells[2] ? cells[2].textContent : "",
        numberOfPlayers: cells[3] ? cells[3].textContent : ""
      };
      console.log("Editing entry:", entryData);

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
});
