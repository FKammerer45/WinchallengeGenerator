// app/static/js/games/tabManagement.js

import {
  getLocalOnlyTabs, // Used by createNewTab for anonymous users
  setLocalOnlyTabs,   // Used by createNewTab for anonymous users
  getLocalOnlyEntries, // Used by createNewTab for anonymous users
  setLocalOnlyEntries  // Used by createNewTab for anonymous users
} from "./localStorageUtils.js";
import { apiFetch } from "../utils/api.js";
import { showFlash } from "../utils/helpers.js";
// renderGamesForTab is called by games.js after a tab is created or loaded.
// import { renderGamesForTab } from "./entryManagement.js"; // Not directly called here anymore

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

  // --- MODIFIED INSERTION LOGIC ---
  const tabList = document.getElementById("gamesTab");
  const effectiveReferenceNode = referenceNodeForInsertion || document.getElementById("addTabBtn")?.closest('li.nav-item');

  if (tabList && effectiveReferenceNode) {
    tabList.insertBefore(newTabItem, effectiveReferenceNode);
  } else if (tabList) { // Fallback if referenceNode is somehow null, append before the last item (usually add button)
    const lastItem = tabList.querySelector('li.nav-item:last-child');
    if (lastItem && lastItem.id !== 'loadingTabsPlaceholder') { // Avoid inserting before loading placeholder if it's last
      tabList.insertBefore(newTabItem, lastItem);
    } else {
      tabList.appendChild(newTabItem); // Absolute fallback
    }
  } else {
    console.error("Could not find gamesTab list or a reference node for inserting new tab link.");
  }
  // --- END MODIFIED INSERTION LOGIC ---


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

  if (isSystemDefaultKey) {
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

/**
 * Creates a new *custom* tab when the user clicks the "+" button.
 */
export async function createNewTab() {
  const isLoggedIn = window.isLoggedIn === true;
  const currentTabsData = isLoggedIn ? (window.userTabsData?.tabs || {}) : getLocalOnlyTabs();
  const MAX_CUSTOM_TABS = 5;


  let customTabCount = 0;
  // Get the list of client_tab_ids from the system default definitions
  const systemDefaultClientTabIds = window.SYSTEM_DEFAULT_GAME_TABS
    ? Object.values(window.SYSTEM_DEFAULT_GAME_TABS).map(def => def.client_tab_id)
    : [];

  for (const tabIdInState in currentTabsData) {
    // A tab is custom if its ID is NOT in the list of system default client_tab_ids
    if (!systemDefaultClientTabIds.includes(tabIdInState)) {
      customTabCount++;
    }
  }


  console.log(`[createNewTab] Current custom tab count: ${customTabCount}`);

  if (customTabCount >= MAX_CUSTOM_TABS) {
    showFlash(`You have reached the maximum limit of ${MAX_CUSTOM_TABS} custom tabs.`, "warning");
    return; // Prevent API call and further execution
  }

  const newTabName = findNextAvailableCustomTabName(currentTabsData);
  const tabIdNumber = getNextTabIdNumber();
  const newTabId = `tabPane-${tabIdNumber}`;
  const linkId = `tab-${tabIdNumber}`;

  console.log(`Creating new custom game tab: ID=${newTabId}, LinkID=${linkId}, Name=${newTabName}`);

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
      console.log(`Custom game tab ${newTabId} added to JS state.`);

      console.log(`[New Custom Tab] Calling API to save empty tab ${newTabId}...`);
      const csrfToken = window.csrfToken;
      // This API call might fail if backend limit is also not updated
      const response = await apiFetch('/api/tabs/save', {
        method: 'POST',
        body: { tabId: newTabId, tabName: newTabName, entries: [] }
      }, csrfToken);

      // Check response from API, even if frontend check passed, backend is source of truth
      if (response.status !== 'ok') {
        // If API returns error (e.g. limit reached due to race condition or backend logic)
        throw new Error(response.error || "Failed to save new tab to server.");
      }
      console.log(`[New Custom Tab] API save successful for ${newTabId}`);
      showFlash(`Tab "${newTabName}" created.`, "success");

    } else {
      const tabs = getLocalOnlyTabs();
      tabs[newTabId] = { name: newTabName };
      setLocalOnlyTabs(tabs);

      const entries = getLocalOnlyEntries();
      entries[newTabId] = [];
      setLocalOnlyEntries(entries);
      console.log(`Custom game tab ${newTabId} added to localStorage.`);
      showFlash(`Tab "${newTabName}" created locally.`, "success");
    }
    if (typeof $ !== 'undefined' && $.fn.tab) {
      $(newTabLink).tab('show');
    }
  } catch (e) {
    console.error(`Failed to create or save new custom game tab ${newTabId}:`, e);
    // Rollback UI changes if save failed
    newTabItem?.remove();
    newTabPane?.remove();
    showFlash(`Error creating tab: ${e.message}`, "danger");
    // It might be good to also decrement currentMaxTabIdNum here if it was based on this failed attempt,
    // but re-initializing it on the next call to getNextTabIdNumber is generally safer.
  }
}