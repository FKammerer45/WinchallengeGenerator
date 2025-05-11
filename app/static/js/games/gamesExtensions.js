// Suggested changes for app/static/js/games/gamesExtensions.js

import {
    getLocalOnlyTabs,
    setLocalOnlyTabs,
    getLocalOnlyEntries,
    setLocalOnlyEntries
    // removeLocalOnlyGameEntry // We might not need this directly if we remove the whole tab's entries
} from "./localStorageUtils.js";
import { apiFetch } from "../utils/api.js";
import { confirmModal, showFlash } from "../utils/helpers.js";
// renderGamesForTab is called by games.js or entryManagement.js after a tab is created/loaded or entries change.
// We need to ensure it's accessible or re-imported if needed for activating another tab.
// For now, assuming it's handled by the main games.js when a tab is shown.

// Keep track of the highest tab ID number used for *custom* tabs (e.g., tabPane-X)
let currentMaxTabIdNum = 0;

/**
 * Initializes or updates the max ID number based on current tabs.
 * This function now specifically looks for "tabPane-X" style IDs to determine
 * the next available number for new *custom* tabs.
 */
function initializeMaxTabIdNum() {
    let highestNumFound = 0;
    try {
        const isLoggedIn = window.isLoggedIn === true;
        const existingTabs = isLoggedIn && window.userTabsData?.tabs
            ? window.userTabsData.tabs
            : getLocalOnlyTabs();

        if (existingTabs) {
            Object.keys(existingTabs).forEach(tabId => {
                if (tabId.startsWith("tabPane-")) {
                    const numPart = tabId.substring("tabPane-".length);
                    const num = parseInt(numPart, 10);
                    if (!isNaN(num) && num > highestNumFound) {
                        highestNumFound = num;
                    }
                }
            });
        }
        currentMaxTabIdNum = highestNumFound;
    } catch (e) {
        console.error("Error initializing/updating games custom tab ID counter:", e);
    }
}

export function getNextTabIdNumber() {
  initializeMaxTabIdNum();
  currentMaxTabIdNum++;
  return currentMaxTabIdNum;
}

function findNextAvailableCustomTabName(currentTabsData) {
  let nextNameNum = 1;
  let newTabName = `Custom Tab ${nextNameNum}`;
  const existingNames = Object.values(currentTabsData || {}).map(tab => tab.name);

  while (existingNames.includes(newTabName)) {
    nextNameNum++;
    newTabName = `Custom Tab ${nextNameNum}`;
  }
  return newTabName;
}


export function createTabFromLocalData(tabId, tabName, referenceNodeForInsertion = null) {
  if (!tabId || !tabName) {
    console.error("createTabFromLocalData (Games): tabId or tabName missing.");
    return;
  }

  const isSystemDefaultKey = window.SYSTEM_DEFAULT_GAME_TABS && window.SYSTEM_DEFAULT_GAME_TABS[tabId];

  let linkId;
  if (tabId.startsWith("default-")) {
    linkId = `link-${tabId}`;
  } else if (tabId.startsWith("tabPane-")) {
    const tabNumberMatch = tabId.match(/tabPane-(\d+)/);
    const tabIdNumber = tabNumberMatch ? tabNumberMatch[1] : tabId.replace(/[^a-zA-Z0-9-_]/g, '');
    linkId = `tab-${tabIdNumber}`;
  } else {
    linkId = `link-custom-${tabId.replace(/[^a-zA-Z0-9-_]/g, '')}`;
  }

  const newTabLink = document.createElement("a");
  newTabLink.className = "nav-link";
  if (tabId.startsWith("default-")) {
    newTabLink.classList.add("system-default-tab-link");
  }
  newTabLink.id = linkId;
  newTabLink.setAttribute("data-toggle", "tab");
  newTabLink.href = `#${tabId}`;
  newTabLink.role = "tab";
  newTabLink.setAttribute("aria-controls", tabId);
  newTabLink.setAttribute("aria-selected", "false");
  newTabLink.textContent = tabName;
  newTabLink.setAttribute("data-tab", tabId);

  const newTabItem = document.createElement("li");
  newTabItem.className = "nav-item";
  newTabItem.appendChild(newTabLink);

  const tabList = document.getElementById("gamesTab");
  const effectiveReferenceNode = referenceNodeForInsertion || document.getElementById("addTabBtn")?.closest('li.nav-item');

  if (tabList && effectiveReferenceNode) {
    tabList.insertBefore(newTabItem, effectiveReferenceNode);
  } else if (tabList) {
    const lastItem = tabList.querySelector('li.nav-item:last-child');
    if (lastItem && lastItem.id !== 'loadingTabsPlaceholder') {
        tabList.insertBefore(newTabItem, lastItem);
    } else {
        tabList.appendChild(newTabItem);
    }
  } else {
    console.error("Could not find gamesTab list or a reference node for inserting new tab link.");
  }


  const newTabPane = document.createElement("div");
  newTabPane.className = "tab-pane fade";
  if (tabId.startsWith("default-")) {
    newTabPane.classList.add("system-default-pane");
  }
  newTabPane.id = tabId;
  newTabPane.setAttribute("role", "tabpanel");
  newTabPane.setAttribute("aria-labelledby", linkId);

  let buttonsHtml = `
    <button class="btn btn-outline-primary btn-sm insertGameBtn" data-tab="${tabId}" title="Add new entry to this tab">
        <i class="bi bi-plus-lg me-1"></i>Insert New Entry
    </button>`;

  // Only add reset button if it's a system default tab *and* the user is logged in
  // (because resetting for anonymous user would just reset to the same initial local default)
  if (isSystemDefaultKey && window.isLoggedIn === true) {
    buttonsHtml += `
    <button class="btn btn-outline-warning btn-sm ms-2 reset-tab-to-default-btn" data-tab="${tabId}" title="Reset this tab to its original system default entries">
        <i class="bi bi-arrow-counterclockwise me-1"></i>Reset Tab
    </button>`;
  }

  newTabPane.innerHTML = `
    <div class="d-flex justify-content-start align-items-center my-3 flex-wrap gap-2">
        ${buttonsHtml}
    </div>
    <div class="glass-effect p-1 rounded shadow-sm">
      <div class="table-responsive">
          <table class="table table-hover table-sm config-table mb-0">
              <thead>
                  <tr>
                      <th scope="col"><i class="bi bi-joystick me-2"></i>Game</th>
                      <th scope="col"><i class="bi bi-gear-wide-connected me-2"></i>Game Mode</th>
                      <th scope="col"><i class="bi bi-graph-up me-2"></i>Difficulty</th>
                      <th scope="col"><i class="bi bi-people-fill me-2"></i>Players</th>
                  </tr>
              </thead>
              <tbody class="gamesTable">
                  <tr><td colspan="4" class="text-center text-secondary py-4">Loading entries...</td></tr>
              </tbody>
          </table>
      </div>
    </div>`;
  document.getElementById("gamesTabContent")?.appendChild(newTabPane);

  if (tabId.startsWith("tabPane-")) {
    const tabNumberMatch = tabId.match(/tabPane-(\d+)/);
    if (tabNumberMatch && !isNaN(parseInt(tabNumberMatch[1], 10))) {
      const num = parseInt(tabNumberMatch[1], 10);
      if (num > currentMaxTabIdNum) {
        currentMaxTabIdNum = num;
      }
    }
  }
}

export async function createNewTab() {
  const isLoggedIn = window.isLoggedIn === true;
  const currentTabsData = isLoggedIn ? (window.userTabsData?.tabs || {}) : getLocalOnlyTabs();
  const MAX_CUSTOM_TABS = 5;


  let customTabCount = 0;
  const systemDefaultClientTabIds = window.SYSTEM_DEFAULT_GAME_TABS
    ? Object.values(window.SYSTEM_DEFAULT_GAME_TABS).map(def => def.client_tab_id)
    : [];

  for (const tabIdInState in currentTabsData) {
    if (!systemDefaultClientTabIds.includes(tabIdInState)) {
      customTabCount++;
    }
  }

  if (customTabCount >= MAX_CUSTOM_TABS) {
    showFlash(`You have reached the maximum limit of ${MAX_CUSTOM_TABS} custom tabs.`, "warning");
    return;
  }

  const newTabName = findNextAvailableCustomTabName(currentTabsData);
  const tabIdNumber = getNextTabIdNumber();
  const newTabId = `tabPane-${tabIdNumber}`;
  const linkId = `tab-${tabIdNumber}`;

  const newTabLink = document.createElement("a");
  newTabLink.className = "nav-link";
  newTabLink.id = linkId;
  newTabLink.setAttribute("data-toggle", "tab");
  newTabLink.href = `#${newTabId}`;
  newTabLink.role = "tab";
  newTabLink.setAttribute("aria-controls", newTabId);
  newTabLink.setAttribute("aria-selected", "false");
  newTabLink.textContent = newTabName;
  newTabLink.setAttribute("data-tab", newTabId);

  const newTabItem = document.createElement("li");
  newTabItem.className = "nav-item";
  newTabItem.appendChild(newTabLink);

  const addTabBtn = document.getElementById("addTabBtn");
  addTabBtn?.parentNode?.parentNode?.insertBefore(newTabItem, addTabBtn.parentNode);

  const newTabPane = document.createElement("div");
  newTabPane.className = "tab-pane fade";
  newTabPane.id = newTabId;
  newTabPane.setAttribute("role", "tabpanel");
  newTabPane.setAttribute("aria-labelledby", linkId);
  newTabPane.innerHTML = `
    <div class="d-flex justify-content-start my-3 flex-wrap gap-2">
        <button class="btn btn-outline-primary btn-sm insertGameBtn" data-tab="${newTabId}" title="Add a new entry to this tab">
            <i class="bi bi-plus-lg me-1"></i>Insert New Entry
        </button>
    </div>
    <div class="glass-effect p-1 rounded shadow-sm">
      <div class="table-responsive">
          <table class="table table-hover table-sm config-table mb-0">
              <thead> <tr> <th><i class="bi bi-joystick me-2"></i>Game</th> <th><i class="bi bi-gear-wide-connected me-2"></i>Game Mode</th> <th><i class="bi bi-graph-up me-2"></i>Difficulty</th> <th><i class="bi bi-people-fill me-2"></i>Players</th> </tr> </thead>
              <tbody class="gamesTable"> <tr><td colspan="4" class="text-center text-secondary py-3">No entries yet.</td></tr> </tbody>
          </table>
      </div>
    </div>`;
  document.getElementById("gamesTabContent")?.appendChild(newTabPane);

  try {
    if (isLoggedIn) {
      if (!window.userTabsData) {
          window.userTabsData = { tabs: {}, entries: {} };
      }
      window.userTabsData.tabs[newTabId] = { name: newTabName };
      window.userTabsData.entries[newTabId] = [];

      const csrfToken = window.csrfToken;
      const response = await apiFetch('/api/tabs/save', {
        method: 'POST',
        body: { tabId: newTabId, tabName: newTabName, entries: [] }
      }, csrfToken);

      if (response.status !== 'ok') {
          throw new Error(response.error || "Failed to save new tab to server.");
      }
      showFlash(`Tab "${newTabName}" created.`, "success");

    } else {
      const tabs = getLocalOnlyTabs();
      tabs[newTabId] = { name: newTabName };
      setLocalOnlyTabs(tabs);

      const entries = getLocalOnlyEntries();
      entries[newTabId] = [];
      setLocalOnlyEntries(entries);
      showFlash(`Tab "${newTabName}" created locally.`, "success");
    }
    if (typeof $ !== 'undefined' && $.fn.tab) {
      $(newTabLink).tab('show');
    }
  } catch (e) {
    console.error(`Failed to create or save new custom game tab ${newTabId}:`, e);
    newTabItem?.remove();
    newTabPane?.remove();
    showFlash(`Error creating tab: ${e.message}`, "danger");
  }
}
// --- Autosave Logic ---
let autosaveTimeout = null;
let isCurrentlySaving = false;

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func.apply(this, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

async function performSave(tabId) {
    const isLoggedIn = window.isLoggedIn === true;
    if (!isLoggedIn || isCurrentlySaving || !tabId) return;

    if (!window.userTabsData || !window.userTabsData.tabs || !window.userTabsData.entries) {
        console.error("[Autosave] Critical data missing in window.userTabsData. Aborting save.");
        showFlash("Autosave failed: Internal data error.", "danger");
        return;
    }

    const tabToSave = window.userTabsData.tabs[tabId];
    const entriesToSave = window.userTabsData.entries[tabId];

    if (!tabToSave) {
        console.warn(`[Autosave] Tab data for ${tabId} not found in state. Skipping save.`);
        return;
    }
    if (!Array.isArray(entriesToSave)) {
        console.warn(`[Autosave] Entries for ${tabId} are not an array or missing. Saving with empty entries.`);
        window.userTabsData.entries[tabId] = [];
    }

    isCurrentlySaving = true;

    try {
        const payload = {
            tabId: tabId,
            tabName: tabToSave.name,
            entries: entriesToSave || []
        };
        const csrfToken = window.csrfToken;
        const response = await apiFetch('/api/tabs/save', { method: 'POST', body: payload }, csrfToken);

        if (response.status === 'ok') {
            showFlash("Changes saved ✓", "success", 2000);

            if (response.saved_tab && window.userTabsData) {
                const savedTabFromServer = response.saved_tab;
                window.userTabsData.tabs[savedTabFromServer.client_tab_id] = { name: savedTabFromServer.tab_name };
                window.userTabsData.entries[savedTabFromServer.client_tab_id] = savedTabFromServer.entries || [];

                const activeLink = document.querySelector("#gamesTab .nav-link.active");
                const activeTabId = activeLink?.getAttribute("href")?.substring(1);
                if (activeTabId === savedTabFromServer.client_tab_id) {
                    // Import renderGamesForTab locally if it's not already available in this scope
                    // This is a placeholder, actual import might be different or function might be global
                    const { renderGamesForTab } = await import('./entryManagement.js');
                    if (typeof renderGamesForTab === "function") { 
                        renderGamesForTab(activeTabId);
                    } else {
                        console.warn("renderGamesForTab function not available to refresh tab after save.");
                    }
                }
            }
        } else {
            throw new Error(response.error || 'Unknown server error during save.');
        }
    } catch (error) {
        console.error(`[Autosave] Error saving tab ${tabId}:`, error);
        showFlash(`Autosave failed: ${error.message}`, 'danger', 5000);
    } finally {
        isCurrentlySaving = false;
    }
}

const debouncedSave = debounce(performSave, 2500);

export function triggerAutosave(tabId) {
    const isLoggedIn = window.isLoggedIn === true;
    if (!isLoggedIn) return;
    if (!tabId) {
        console.warn("[Autosave] Trigger called without tabId.");
        return;
    }
    debouncedSave(tabId);
}

export function attachTabRenameHandler() {
    const container = document.getElementById("gamesTab");
    if (!container) {
        console.error("Could not find #gamesTab container for rename listener.");
        return;
    }

    let activeLink = null;
    let activeId = null;

    container.addEventListener("dblclick", (e) => {
        const link = e.target.closest(".nav-link");
        if (!link || link.classList.contains('system-default-tab-link') || link.id === 'addTabBtn') {
            if (link && link.classList.contains('system-default-tab-link')) {
                showFlash("System default tabs cannot be renamed.", "info");
            }
            return;
        }

        activeLink = link;
        activeId = link.dataset.tab || link.getAttribute("href")?.substring(1);
        const currentName = link.textContent.trim();
        const renameInput = document.getElementById("renameGameTabInput");

        if (!renameInput) { console.error("Rename modal input not found!"); return; }
        renameInput.value = currentName;

        if (typeof $ !== 'undefined' && $.fn.modal) {
            $('#renameGameTabModal').modal('show');
        } else {
            alert("Could not open rename dialog.");
        }
    });

    const renameForm = document.getElementById("renameGameTabForm");
    if (!renameForm) { console.error("Rename modal form not found!"); return; }

    renameForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const renameInput = document.getElementById("renameGameTabInput");
        const newName = renameInput?.value.trim();
        const currentName = activeLink?.textContent.trim();
        const isLoggedIn = window.isLoggedIn === true;

        if (!activeLink || !activeId || !newName || newName === currentName) {
            if (typeof $ !== 'undefined' && $.fn.modal) $('#renameGameTabModal').modal('hide');
            activeLink = null; activeId = null;
            return;
        }

        if (typeof $ !== 'undefined' && $.fn.modal) $('#renameGameTabModal').modal('hide');

        try {
            if (isLoggedIn) {
                if (!window.userTabsData?.tabs || !window.userTabsData.tabs[activeId]) {
                    throw new Error("Tab data not found in application state for rename.");
                }
                window.userTabsData.tabs[activeId].name = newName;
                activeLink.textContent = newName;
                triggerAutosave(activeId);
                showFlash("Tab renamed. Saving...", "info", 2000);
            } else {
                const localTabs = getLocalOnlyTabs() || {};
                if (!localTabs[activeId]) throw new Error("Local tab not found for rename.");
                localTabs[activeId].name = newName;
                setLocalOnlyTabs(localTabs);
                activeLink.textContent = newName;
                showFlash("Local tab renamed.", "success");
            }
        } catch (err) {
            console.error("Rename failed:", err);
            showFlash(`Failed to rename tab: ${err.message}`, "danger");
            if (activeLink && currentName) activeLink.textContent = currentName;
        } finally {
            activeLink = null; activeId = null;
        }
    });
}

export function attachDeleteTabHandler() {
    const btn = document.getElementById("deleteTabBtn");
    if (!btn) {
        // THIS LOG IS KEY: If it appears when you are logged in, the button is not in the DOM.
        console.log("[Games Page] attachDeleteTabHandler: Delete Tab button (#deleteTabBtn) was NOT FOUND in the DOM. This means it was likely not rendered by the template. window.isLoggedIn was:", window.isLoggedIn);
        return;
    }
    // If we reach here, the button WAS found by the JS.
    console.log("[Games Page] attachDeleteTabHandler: Delete Tab button (#deleteTabBtn) FOUND. Attaching listener. window.isLoggedIn:", window.isLoggedIn);

    btn.addEventListener("click", async () => {
        const activeLink = document.querySelector("#gamesTab .nav-link.active");
        if (!activeLink) return showFlash("No active tab selected for deletion.", "warning");

        const tabId = activeLink.getAttribute("href")?.substring(1);
        const tabName = activeLink.textContent.trim() || 'this tab';
        const isLoggedIn = window.isLoggedIn === true; // Re-check or use module-scoped
        const csrfToken = window.csrfToken;

        if (!tabId) {
            showFlash("Could not identify the active tab for deletion.", "danger");
            return;
        }

        const isSystemDefault = window.SYSTEM_DEFAULT_GAME_TABS && window.SYSTEM_DEFAULT_GAME_TABS[tabId];
        if (isSystemDefault || tabId.startsWith("default-")) {
            showFlash(`System default tab "${tabName}" cannot be deleted.`, "warning");
            return;
        }

        const ok = await confirmModal(`Delete tab "${tabName}"? This cannot be undone.`, "Delete Game Tab?");
        if (!ok) return;

        btn.disabled = true;

        try {
            if (isLoggedIn) { // This condition will be true if we got here based on prior checks
                const res = await apiFetch("/api/tabs/delete", {
                    method: "POST",
                    body: { tabId: tabId }
                }, csrfToken);

                if (res.status !== "ok" || res.deleted_tab_id !== tabId) {
                    throw new Error(res.error || "Server error during tab deletion.");
                }
                if (window.userTabsData) {
                    delete window.userTabsData.tabs?.[tabId];
                    delete window.userTabsData.entries?.[tabId];
                }
                console.log(`[Delete Tab] Successfully deleted tab ${tabId} via API.`);
            } else {
                // This 'else' branch for non-logged-in was for the previous requirement.
                // If the button is only rendered for logged-in users, this part is less critical here.
                // However, to be safe and consistent with the previous change:
                let localTabs = getLocalOnlyTabs();
                let localEntries = getLocalOnlyEntries();
                let wasDeletedLocally = false;
                if (localTabs[tabId]) { delete localTabs[tabId]; setLocalOnlyTabs(localTabs); wasDeletedLocally = true;}
                if (localEntries[tabId]) { delete localEntries[tabId]; setLocalOnlyEntries(localEntries); wasDeletedLocally = true;}
                if (wasDeletedLocally) console.log(`[Delete Tab] Local delete for tab ${tabId}.`);
                else console.warn(`[Delete Tab] Tab ${tabId} not found in local storage for deletion by non-logged-in user.`);
            }

            // Common UI update logic
            const tabLinkElement = document.getElementById(activeLink.id);
            const tabListItem = tabLinkElement?.closest('li.nav-item');
            const tabPaneElement = document.getElementById(tabId);

            if (tabListItem) tabListItem.remove();
            if (tabPaneElement) tabPaneElement.remove();
            
            showFlash(`Tab "${tabName}" deleted successfully.`, "success");

            // Activate another tab
            let newActiveTabId = window.PRIMARY_DEFAULT_GAME_TAB_ID || 'default-all-games';
            let nextActiveLink = document.querySelector(`#gamesTab .nav-link[href="#${newActiveTabId}"]`);

            if (!nextActiveLink) { 
                const systemDefaultIds = window.SYSTEM_DEFAULT_GAME_TABS ? Object.keys(window.SYSTEM_DEFAULT_GAME_TABS) : [];
                for (const id of systemDefaultIds) {
                    nextActiveLink = document.querySelector(`#gamesTab .nav-link[href="#${id}"]`);
                    if (nextActiveLink) { newActiveTabId = id; break; }
                }
            }
            if (!nextActiveLink) { 
                const allNavLinks = document.querySelectorAll('#gamesTab .nav-link');
                for (let link of allNavLinks) {
                    if (link.id !== 'addTabBtn' && !link.classList.contains('system-default-tab-link')) {
                        newActiveTabId = link.getAttribute("href")?.substring(1);
                        nextActiveLink = link; break;
                    }
                }
            }
            if (nextActiveLink && typeof $ !== 'undefined' && $.fn.tab) { $(nextActiveLink).tab('show');}
            else if (nextActiveLink) { nextActiveLink.click(); } 
            else {
                const gamesTabContent = document.getElementById('gamesTabContent');
                if (gamesTabContent) gamesTabContent.innerHTML = '<p class="text-center text-secondary p-5">No game tabs available.</p>';
            }

        } catch (e) {
            console.error("Delete tab failed:", e);
            showFlash(`Error deleting tab: ${e.message}`, "danger");
        } finally {
            btn.disabled = false;
        }
    });
}


export async function loadUserTabsFromAPI() {
    // This function remains largely the same, ensuring it fetches from the API for logged-in users
    // and relies on ensureUserDefaultGameTabs to pre-populate system defaults in window.userTabsData if they were missing.
    console.log("[Load API Tabs] Attempting to load user game tabs...");
    const loadingPlaceholder = document.getElementById('loadingTabsPlaceholder');
    const tabList = document.getElementById('gamesTab');
    const tabContent = document.getElementById('gamesTabContent');

    if (loadingPlaceholder) loadingPlaceholder.style.display = 'block';

    // Clear only non-system-default, non-add-button tabs
    if (tabList) {
        const itemsToRemove = [];
        tabList.querySelectorAll('.nav-item').forEach(item => {
            const link = item.querySelector('a.nav-link');
            if (link && !link.classList.contains('system-default-tab-link') && link.id !== 'addTabBtn') {
                const hrefTarget = link.getAttribute("href")?.substring(1);
                if (!window.SYSTEM_DEFAULT_GAME_TABS || !window.SYSTEM_DEFAULT_GAME_TABS[hrefTarget]) {
                    itemsToRemove.push(item);
                }
            }
        });
        itemsToRemove.forEach(item => item.remove());
    }
    if (tabContent) {
        const panesToRemove = [];
        tabContent.querySelectorAll('.tab-pane').forEach(pane => {
            if (!pane.classList.contains('system-default-pane')) {
                 if (!window.SYSTEM_DEFAULT_GAME_TABS || !window.SYSTEM_DEFAULT_GAME_TABS[pane.id]) {
                    panesToRemove.push(pane);
                }
            }
        });
        panesToRemove.forEach(pane => pane.remove());
    }

    try {
        const data = await apiFetch('/api/tabs/load');
        if (typeof data !== 'object' || data === null) throw new Error("Invalid data format from game tabs API.");

        if (!window.userTabsData) window.userTabsData = { tabs: {}, entries: {} };

        let firstUserCustomTabId = null;
        let firstSystemDefaultTabIdFromAPI = null;

        const sortedTabIds = Object.keys(data).sort((a, b) => {
            const isSystemA = window.SYSTEM_DEFAULT_GAME_TABS && window.SYSTEM_DEFAULT_GAME_TABS[a];
            const isSystemB = window.SYSTEM_DEFAULT_GAME_TABS && window.SYSTEM_DEFAULT_GAME_TABS[b];
            if (isSystemA && !isSystemB) return -1;
            if (!isSystemA && isSystemB) return 1;
            return (data[a]?.tab_name || a).localeCompare(data[b]?.tab_name || b);
        });

        for (const tabId of sortedTabIds) {
            const tabData = data[tabId];
            if (!tabData) continue;

            const isSystemDefaultKey = window.SYSTEM_DEFAULT_GAME_TABS && window.SYSTEM_DEFAULT_GAME_TABS[tabId];

            window.userTabsData.tabs[tabId] = { name: tabData.tab_name || `Tab ${tabId}` };
            window.userTabsData.entries[tabId] = Array.isArray(tabData.entries) ? tabData.entries : [];

            if (!document.getElementById(tabId)) {
                 createTabFromLocalData(tabId, window.userTabsData.tabs[tabId].name);
            }
            
            const { renderGamesForTab } = await import('./entryManagement.js'); // Ensure it's imported
            if (typeof renderGamesForTab === "function") {
                renderGamesForTab(tabId);
            } else {
                console.error("renderGamesForTab function is not defined. Cannot render tab content.");
            }

            if (!isSystemDefaultKey && !firstUserCustomTabId) {
                firstUserCustomTabId = tabId;
            }
            if (isSystemDefaultKey && !firstSystemDefaultTabIdFromAPI) {
                firstSystemDefaultTabIdFromAPI = tabId;
            }
        }

        const tabToActivate = firstUserCustomTabId || 
                              firstSystemDefaultTabIdFromAPI || 
                              (window.SYSTEM_DEFAULT_GAME_TABS ? (window.PRIMARY_DEFAULT_GAME_TAB_ID || Object.keys(window.SYSTEM_DEFAULT_GAME_TABS)[0]) : null);


        if (tabToActivate) {
            const tabLink = document.querySelector(`#gamesTab .nav-link[href="#${tabToActivate}"]`);
            if (tabLink && typeof $ !== 'undefined' && $.fn.tab) {
                $(tabLink).tab('show');
            } else {
                console.warn(`[Load API Tabs] Could not find or activate game tab ${tabToActivate}.`);
            }
        } else {
            console.warn("[Load API Tabs] No tabs available to activate after loading.");
        }
    } catch (error) {
        console.error("[Load API Tabs] Error loading user game tabs from API:", error);
        showFlash(`Could not load your saved game tabs: ${error.message}. Using local backup if available.`, "danger");
        throw error;
    } finally {
        if (loadingPlaceholder) loadingPlaceholder.style.display = 'none';
    }
}


export async function handleDuplicateTab() {
    const isLoggedIn = window.isLoggedIn === true;
    if (!isLoggedIn) {
        showFlash("Login required to duplicate tabs.", "info");
        return;
    }

    const activeLink = document.querySelector("#gamesTab .nav-link.active");
    if (!activeLink) {
        showFlash("No active tab selected to duplicate.", "warning");
        return;
    }

    const sourceTabId = activeLink.getAttribute("href")?.substring(1);
    const sourceTabName = activeLink.textContent.trim();

    if (!sourceTabId || !window.userTabsData?.tabs?.[sourceTabId] || !window.userTabsData?.entries?.[sourceTabId]) {
        showFlash("Could not find data for the active tab to duplicate.", "danger");
        console.error(`[Duplicate Tab] Source tab data missing for ID: ${sourceTabId}`);
        return;
    }

    const MAX_CUSTOM_TABS = 5;
    let customTabCount = 0;
    for (const tabId in window.userTabsData.tabs) {
        if (!window.SYSTEM_DEFAULT_GAME_TABS || !window.SYSTEM_DEFAULT_GAME_TABS[tabId]) {
            customTabCount++;
        }
    }

    if (customTabCount >= MAX_CUSTOM_TABS) {
        showFlash(`Cannot duplicate: You have reached the maximum limit of ${MAX_CUSTOM_TABS} custom tabs.`, "warning");
        return;
    }

    const newTabName = `Copy of ${sourceTabName}`;
    const newTabIdNumber = getNextTabIdNumber();
    const newClientTabId = `tabPane-${newTabIdNumber}`;

    const sourceEntries = window.userTabsData.entries[sourceTabId];
    const newEntries = JSON.parse(JSON.stringify(sourceEntries || []));

    window.userTabsData.tabs[newClientTabId] = { name: newTabName };
    window.userTabsData.entries[newClientTabId] = newEntries;

    const duplicateBtnElement = document.getElementById('duplicateTabBtn');
    if(duplicateBtnElement) duplicateBtnElement.disabled = true;

    try {
        const payload = {
            tabId: newClientTabId,
            tabName: newTabName,
            entries: newEntries
        };
        const csrfToken = window.csrfToken;
        const response = await apiFetch('/api/tabs/save', { method: 'POST', body: payload }, csrfToken);

        if (response.status === 'ok' && response.saved_tab) {
            window.userTabsData.tabs[newClientTabId] = { name: response.saved_tab.tab_name };
            window.userTabsData.entries[newClientTabId] = response.saved_tab.entries || [];

            createTabFromLocalData(newClientTabId, newTabName);
            
            const entryManagement = await import('./entryManagement.js');
            if (typeof entryManagement.renderGamesForTab === "function") {
                 entryManagement.renderGamesForTab(newClientTabId);
            } else {
                console.error("renderGamesForTab function not found in entryManagement.js");
            }

            const newLink = document.querySelector(`#gamesTab .nav-link[href="#${newClientTabId}"]`);
            if (newLink && typeof $ !== 'undefined' && $.fn.tab) {
                $(newLink).tab('show');
            }
            showFlash(`Tab "${sourceTabName}" duplicated as "${newTabName}".`, "success");
        } else {
            throw new Error(response.error || "Server error during tab duplication.");
        }
    } catch (error) {
        console.error(`[Duplicate Tab] Error duplicating tab ${sourceTabId}:`, error);
        showFlash(`Error duplicating tab: ${error.message}`, "danger");
        delete window.userTabsData.tabs[newClientTabId];
        delete window.userTabsData.entries[newClientTabId];
    } finally {
        if(duplicateBtnElement) duplicateBtnElement.disabled = false;
    }
}

export async function ensureUserDefaultGameTabs() {
    const SYSTEM_GAME_DEFAULT_DEFINITIONS_URL_LOCAL = '/api/games/default_definitions';
    const USER_GAME_TABS_LOAD_URL_LOCAL = '/api/tabs/load';
    const USER_GAME_TABS_SAVE_URL_LOCAL = '/api/tabs/save';
    const PRIMARY_DEFAULT_GAME_TAB_ID = "default-all-games"; // Define your primary default tab ID

    window.PRIMARY_DEFAULT_GAME_TAB_ID = PRIMARY_DEFAULT_GAME_TAB_ID; // Make it globally available if needed by other parts

    const isLoggedIn = window.isLoggedIn === true;
    const csrfToken = window.csrfToken;

    let systemDefaultGameTabsDefinitions;
    try {
        systemDefaultGameTabsDefinitions = await apiFetch(SYSTEM_GAME_DEFAULT_DEFINITIONS_URL_LOCAL);
        if (typeof systemDefaultGameTabsDefinitions !== 'object' || systemDefaultGameTabsDefinitions === null) {
            throw new Error("Invalid system default game tab definitions received from API.");
        }
         window.SYSTEM_DEFAULT_GAME_TABS = systemDefaultGameTabsDefinitions; // Store globally
    } catch (error) {
        console.error("[ensureUserDefaultGameTabs] Failed to fetch system default definitions:", error);
        showFlash("Error: Could not load initial game configurations.", "danger");
        throw error;
    }

    if (isLoggedIn) {
        let userSavedTabsFromApi = {};
        try {
            userSavedTabsFromApi = await apiFetch(USER_GAME_TABS_LOAD_URL_LOCAL);
            if (typeof userSavedTabsFromApi !== 'object' || userSavedTabsFromApi === null) {
                userSavedTabsFromApi = {};
            }
        } catch (loadError) {
            console.error("[ensureUserDefaultGameTabs] Error loading user's saved tabs:", loadError);
        }

        for (const defKey in systemDefaultGameTabsDefinitions) {
            const sysDef = systemDefaultGameTabsDefinitions[defKey];
            const clientTabId = sysDef.client_tab_id;

            if (!userSavedTabsFromApi[clientTabId]) {
                try {
                    const transformedInitialEntries = (sysDef.entries || []).map(entry => ({
                        id: entry.id || ("local-g-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9)),
                        game: entry.Spiel,
                        gameMode: entry.Spielmodus,
                        difficulty: (parseFloat(entry.Schwierigkeit) || 1.0).toFixed(1),
                        numberOfPlayers: parseInt(entry.Spieleranzahl, 10) || 1,
                        weight: parseFloat(entry.weight) || 1.0
                    }));

                    const savePayload = {
                        tabId: clientTabId,
                        tabName: sysDef.name,
                        entries: transformedInitialEntries
                    };
                    const savedTabResponse = await apiFetch(USER_GAME_TABS_SAVE_URL_LOCAL, { method: 'POST', body: savePayload }, csrfToken);

                    if (savedTabResponse.status !== 'ok') {
                        console.error(`[ensureUserDefaultGameTabs] Failed to save system default tab ${sysDef.name} for user:`, savedTabResponse.error);
                    }
                } catch (saveError) {
                    console.error(`[ensureUserDefaultGameTabs] Exception while saving system default game tab ${clientTabId} for user:`, saveError);
                }
            }
        }

    } else {
        const { initLocalStorage: initGameLocalStorageIfAbsent, getLocalOnlyTabs, getLocalOnlyEntries, setLocalOnlyTabs, setLocalOnlyEntries } = await import('./localStorageUtils.js');
        initGameLocalStorageIfAbsent();
        let localTabs = getLocalOnlyTabs();
        let localEntries = getLocalOnlyEntries();
        let updatedLocal = false;

        for (const defKey in systemDefaultGameTabsDefinitions) {
            const sysDef = systemDefaultGameTabsDefinitions[defKey];
            const clientTabId = sysDef.client_tab_id;

            if (!localTabs[clientTabId]) {
                localTabs[clientTabId] = { name: sysDef.name };
                localEntries[clientTabId] = (sysDef.entries || []).map(entry => ({
                    id: entry.id || ("local-g-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9)),
                    game: entry.Spiel,
                    gameMode: entry.Spielmodus,
                    difficulty: (parseFloat(entry.Schwierigkeit) || 1.0).toFixed(1),
                    numberOfPlayers: parseInt(entry.Spieleranzahl, 10) || 1,
                    weight: parseFloat(entry.weight) || 1.0
                }));
                updatedLocal = true;
            }
        }
        if (updatedLocal) {
            setLocalOnlyTabs(localTabs);
            setLocalOnlyEntries(localEntries);
        }
    }
}