import { initLocalStorage, getLocalTabs } from "./localStorageUtils.js";
import { createNewTab, createTabFromLocalData } from "./tabManagement.js";
import { renderGamesForTab, handleSaveNewGame, handleUpdateGame, handleDeleteGame } from "./entryManagement.js";

// -------------------------
// Populate Game Source Dropdown (Challenge Form)
// -------------------------
function populateGameSourceDropdown() {
  const dropdown = document.getElementById("gameSourceSelect");
  if (!dropdown) {
    console.error("Dropdown with id 'gameSourceSelect' not found.");
    return;
  }
  dropdown.innerHTML = "";
  const tabs = getLocalTabs();
  console.log("Retrieved tabs from local storage:", tabs);
  for (const tabId in tabs) {
    const option = document.createElement("option");
    option.value = tabId;
    option.textContent = tabs[tabId].name || tabId;
    dropdown.appendChild(option);
  }
}

// -------------------------
// Update Game Selection Card (Challenge Form)
// -------------------------
function updateGameSelectionCard() {
  const dropdown = document.getElementById("gameSourceSelect");
  if (!dropdown) {
    console.error("Dropdown with id 'gameSourceSelect' not found.");
    return;
  }
  const selectedTab = dropdown.value;
  const allEntries = JSON.parse(localStorage.getItem("localEntries")) || {};
  const entries = allEntries[selectedTab] || [];
  // Group entries by game name.
  const grouped = {};
  entries.forEach(entry => {
    const gameName = entry.game || "";
    if (!gameName) return;
    if (!grouped[gameName]) {
      grouped[gameName] = { weight: entry.weight || 1, availableModes: new Set() };
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
// Attach Challenge Form Handler (Challenge Page)
// -------------------------
function gatherSelectedModes() {
  const selectedModes = {};
  // For each row in the games table…
  const rows = document.querySelectorAll("#gamesSelectionTbody tr");
  rows.forEach(row => {
    const gameName = row.getAttribute("data-game");
    if (gameName) {
      // Find all checked checkboxes for this game.
      const checkboxes = row.querySelectorAll(`input[name="allowed_modes_${gameName}[]"]:checked`);
      if (checkboxes.length > 0) {
        // Store the values (modes) in an array.
        // We convert the game name to lowercase so that server-side matching is consistent.
        selectedModes[gameName.toLowerCase()] = Array.from(checkboxes).map(cb => cb.value);
      }
    }
  });
  return selectedModes;
}

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
    
    // Retrieve and parse local entries from localStorage.
    const allEntriesStr = localStorage.getItem("localEntries") || "{}";
    let allEntries;
    try {
      allEntries = JSON.parse(allEntriesStr);
    } catch (error) {
      console.error("Error parsing localEntries from localStorage:", error);
      allEntries = {};
    }
    const entries = allEntries[selectedTab] || [];
    console.log("Converted entries to be sent for tab", selectedTab, ":", entries);
    
    if (entries.length === 0) {
      alert("No game entries found for the selected tab. Please add entries before generating a challenge.");
      return;
    }
    
    // Convert keys for server (local key -> expected key).
    const convertedEntries = entries.map(entry => ({
      id: entry.id,
      Spiel: entry.game,
      Spielmodus: entry.gameMode,
      Schwierigkeit: entry.difficulty,
      Spieleranzahl: entry.numberOfPlayers,
      tabName: entry.tabName
    }));
    console.log("Final converted entries:", convertedEntries);
    
    formData.append("entries", JSON.stringify(convertedEntries));
    
    // NEW STEP: Gather selected allowed modes and add them to the form data.
    const selectedModes = gatherSelectedModes();
    formData.append("selected_modes", JSON.stringify(selectedModes));
    
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
// Attach Load Default Entries Button Handler (Challenge Page)
// -------------------------
function attachLoadDefaultEntriesHandler() {
  const loadDefaultBtn = document.getElementById("loadDefaultEntriesBtn");
  if (!loadDefaultBtn) {
    console.error("Load Default Entries button with id 'loadDefaultEntriesBtn' not found.");
    return;
  }
  loadDefaultBtn.addEventListener("click", () => {
    $("#confirmLoadDefaultModal").modal("show");
  });
}

const confirmBtn = document.getElementById("confirmLoadDefaultBtn");
if (confirmBtn) {
  confirmBtn.addEventListener("click", () => {
    $("#confirmLoadDefaultModal").modal("hide");
    fetch("/load_default_entries")
      .then(response => response.json())
      .then(data => {
        if (data.error) {
          console.error("Error loading default entries:", data.error);
          alert("Error: " + data.error);
        } else {
          const convertedEntries = data.entries.map(entry => ({
            id: entry.id,
            game: entry["Spiel"],
            gameMode: entry["Spielmodus"],
            difficulty: entry["Schwierigkeit"],
            numberOfPlayers: entry["Spieleranzahl"],
            tabName: "Default",
            weight: entry.weight || 1
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
  });
} else {
  console.warn("confirmLoadDefaultBtn not found on this page.");
}

// -------------------------
// Attach Save Tab Button Handler (for logged-in users)
// -------------------------
function attachSaveTabHandler() {
  const csrfToken = document.querySelector('input[name="csrf_token"]').value;
  const saveTabBtns = document.querySelectorAll(".saveTabBtn");
  if (!saveTabBtns.length) {
    console.warn("No saveTabBtn elements found on this page.");
    return;
  }
  saveTabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const tabId = btn.getAttribute("data-tab");
      const tabName = btn.getAttribute("data-tab-name") || tabId;
      let localEntries = JSON.parse(localStorage.getItem("localEntries")) || {};
      const entries = localEntries[tabId] || [];
      const tabData = {
        tabId: tabId,
        tabName: tabName,
        entries: entries,
        csrf_token: csrfToken
      };
      fetch("/save_tab", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrfToken
        },
        body: JSON.stringify(tabData)
      })
        .then(response => {
          if (!response.ok) {
            throw new Error("Server error while saving tab.");
          }
          return response.json();
        })
        .then(data => {
          if (data.status === "ok") {
            alert("Tab saved successfully.");
          } else {
            alert("Error saving tab: " + data.error);
          }
        })
        .catch(error => {
          console.error("Error saving tab:", error);
          alert("Error saving tab: " + error);
        });
    });
  });
}

// -------------------------
// Attach Load Saved Tabs Handler (for logged-in users)
// -------------------------
function attachLoadSavedTabsHandler() {
  const loadSavedBtn = document.getElementById("loadSavedTabsBtn");
  if (!loadSavedBtn) {
    console.warn("Load Saved Tabs button with id 'loadSavedTabsBtn' not found.");
    return;
  }
  loadSavedBtn.addEventListener("click", () => {
    fetch("/load_saved_tabs")
      .then(response => {
        if (!response.ok) {
          throw new Error("Server error while loading saved tabs.");
        }
        return response.json();
      })
      .then(data => {
        if (data.error) {
          alert("Error loading saved tabs: " + data.error);
        } else {
          Object.keys(data).forEach(tabId => {
            let localTabs = JSON.parse(localStorage.getItem("localTabs")) || {};
            localTabs[tabId] = { name: data[tabId].tab_name };
            localStorage.setItem("localTabs", JSON.stringify(localTabs));
            let localEntries = JSON.parse(localStorage.getItem("localEntries")) || {};
            try {
              localEntries[tabId] = JSON.parse(data[tabId].entries_json);
            } catch (err) {
              console.error(`Error parsing entries for tab ${tabId}:`, err);
              localEntries[tabId] = [];
            }
            localStorage.setItem("localEntries", JSON.stringify(localEntries));
            createTabFromLocalData(tabId, data[tabId].tab_name);
            renderGamesForTab(tabId);
          });
          alert("Saved tabs loaded successfully.");
        }
      })
      .catch(error => {
        console.error("Error loading saved tabs:", error);
        alert("Error loading saved tabs: " + error);
      });
  });
}

// -------------------------
// Attach Tab Rename Handler (for non-default tabs)
// -------------------------
function attachTabRenameHandler() {
  const gamesTab = document.getElementById("gamesTab");
  if (!gamesTab) {
    console.error("Element with id 'gamesTab' not found.");
    return;
  }
  gamesTab.addEventListener("dblclick", (e) => {
    const tab = e.target.closest(".nav-link");
    // Only allow renaming if a tab was double-clicked and it is not the default tab.
    if (tab && tab.id !== "default-tab") {
      const currentName = tab.textContent.trim();
      const newName = prompt("Enter new name for the tab:", currentName);
      if (newName && newName.trim() !== "" && newName !== currentName) {
        tab.textContent = newName;
        const clientTabId = tab.getAttribute("data-tab");
        let localTabs = JSON.parse(localStorage.getItem("localTabs")) || {};
        if (localTabs[clientTabId]) {
          localTabs[clientTabId].name = newName;
          localStorage.setItem("localTabs", JSON.stringify(localTabs));
        }
      }
    }
  });
}


// -------------------------
// Main Initialization
// -------------------------
document.addEventListener("DOMContentLoaded", () => {
  console.log("[DOMContentLoaded] Event fired");
  window.generateChallengeUrl = "/generate_challenge";

  const challengeForm = document.getElementById("challengeForm");
  if (challengeForm) {
    challengeForm.removeAttribute("action");
  }

  initLocalStorage();

  // Code for Challenge Form Page (index.html, etc.)
  const gameSourceSelect = document.getElementById("gameSourceSelect");
  if (gameSourceSelect) {
    populateGameSourceDropdown();
    updateGameSelectionCard();
    gameSourceSelect.addEventListener("change", () => {
      updateGameSelectionCard();
    });
    attachChallengeFormHandler();
    if (document.getElementById("loadDefaultEntriesBtn")) {
      attachLoadDefaultEntriesHandler();
    } else {
      console.warn("loadDefaultEntriesBtn not found on this page.");
    }
  } else {
    console.warn("gameSourceSelect not found on this page.");
  }

  // Code for Games Management Page (games.html)
  if (document.getElementById("gamesTabContent")) {
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
    const allEntries = JSON.parse(localStorage.getItem("localEntries"));
    if (allEntries) {
      for (const tabId in allEntries) {
        renderGamesForTab(tabId);
      }
    }
    const addTabBtn = document.getElementById("addTabBtn");
    if (addTabBtn && addTabBtn.parentNode && addTabBtn.parentNode.parentNode) {
      addTabBtn.addEventListener("click", (e) => {
        e.preventDefault();
        createNewTab();
        if (document.getElementById("gameSourceSelect")) {
          populateGameSourceDropdown();
        }
      });
    } else {
      console.error("Element with id 'addTabBtn' or its parent not found.");
    }
    document.addEventListener("click", (e) => {
      if (e.target.classList.contains("insertGameBtn")) {
        $("#newGameModal").modal("show");
        window.currentTargetTab = e.target.getAttribute("data-tab");
      }
    });
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
    document.addEventListener("dblclick", (e) => {
      const targetRow = e.target.closest("tr");
      if (targetRow && targetRow.parentElement.classList.contains("gamesTable")) {
        // Determine which tab pane this row is in
        const tabPane = targetRow.closest(".tab-pane");
        if (tabPane) {
          window.currentTargetTab = tabPane.id; // update current tab id
          console.log("Setting currentTargetTab to:", tabPane.id);
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
    attachSaveTabHandler();
    attachLoadSavedTabsHandler();
    if (document.getElementById("loadDefaultEntriesBtn")) {
      attachLoadDefaultEntriesHandler();
    } else {
      console.warn("loadDefaultEntriesBtn not found on this page.");
    }
    attachTabRenameHandler();
  }
});
