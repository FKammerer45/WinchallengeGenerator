// static/js/games/gamesExtensions.js

import { getLocalTabs, getLocalEntries, setLocalTabs, setLocalEntries } from "./localStorageUtils.js";
import { createTabFromLocalData } from "./tabManagement.js";
import { renderGamesForTab } from "./entryManagement.js";

// Attach Save Tab Button Handler (for logged-in users)
export function attachSaveTabHandler() {
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
      const localEntries = JSON.parse(localStorage.getItem("localEntries")) || {};
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

// Attach Load Saved Tabs Handler (for logged-in users)
export function attachLoadSavedTabsHandler() {
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
          // Process each saved tab.
          Object.keys(data).forEach(tabId => {
            let localTabs = JSON.parse(localStorage.getItem("localTabs")) || {};
            localTabs[tabId] = { name: data[tabId].tab_name };
            setLocalTabs(localTabs);
            let localEntries = JSON.parse(localStorage.getItem("localEntries")) || {};
            try {
              localEntries[tabId] = JSON.parse(data[tabId].entries_json);
            } catch (err) {
              console.error(`Error parsing entries for tab ${tabId}:`, err);
              localEntries[tabId] = [];
            }
            setLocalEntries(localEntries);
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

// Attach Tab Rename Handler (for non-default tabs)
export function attachTabRenameHandler() {
  const gamesTab = document.getElementById("gamesTab");
  if (!gamesTab) {
    console.error("Element with id 'gamesTab' not found.");
    return;
  }
  gamesTab.addEventListener("dblclick", (e) => {
    const tab = e.target.closest(".nav-link");
    // Allow renaming if a non-default tab was double-clicked.
    if (tab && tab.id !== "default-tab") {
      const currentName = tab.textContent.trim();
      const newName = prompt("Enter new name for the tab:", currentName);
      if (newName && newName.trim() !== "" && newName !== currentName) {
        tab.textContent = newName;
        const clientTabId = tab.getAttribute("data-tab");
        let localTabs = JSON.parse(localStorage.getItem("localTabs")) || {};
        if (localTabs[clientTabId]) {
          localTabs[clientTabId].name = newName;
          setLocalTabs(localTabs);
        }
      }
    }
  });
}

// Attach Load Default Entries Button Handler (Challenge Page)
export function attachLoadDefaultEntriesHandler() {
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
    console.log("[confirmLoadDefaultBtn] Clicked: Starting load default entries process.");
    $("#confirmLoadDefaultModal").modal("hide");

    fetch("/load_default_entries")
      .then(response => {
        console.log("[confirmLoadDefaultBtn] Response status:", response.status);
        return response.json();
      })
      .then(data => {
        console.log("[confirmLoadDefaultBtn] Received data:", data);
        if (data.error) {
          console.error("Error loading default entries:", data.error);
          alert("Error: " + data.error);
        } else {
          // Convert server keys to local keys (remove redundant tabName inside the JSON if desired)
          const convertedEntries = data.entries.map(entry => ({
            id: entry.id,
            game: entry["Spiel"],
            gameMode: entry["Spielmodus"],
            difficulty: entry["Schwierigkeit"],
            numberOfPlayers: entry["Spieleranzahl"],
            // We already know this is for the Default tab:
            tabName: "Default",
            weight: entry.weight || 1
          }));

          let localEntries = JSON.parse(localStorage.getItem("localEntries")) || {};
          localEntries["default"] = convertedEntries;
          localStorage.setItem("localEntries", JSON.stringify(localEntries));

          // Render the default entries in the UI.
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