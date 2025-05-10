// app/static/js/penalties/penaltyTabManagement.js

import {
  getLocalOnlyTabs as getLocalOnlyPenaltyTabs,
  setLocalOnlyTabs as setLocalOnlyPenaltyTabs,
  getLocalOnlyEntries as getLocalOnlyPenaltyEntries,
  setLocalOnlyEntries as setLocalOnlyPenaltyEntries
} from "./penaltyLocalStorageUtils.js";
import { apiFetch } from "../utils/api.js";
import { showFlash } from "../utils/helpers.js";
import { updatePenaltyTabGroupVisibility } from "./penalties.js"; // For updating group labels

let currentMaxPenaltyTabIdNum = 0;

function initializeMaxPenaltyTabIdNum() {
  let highestNumFound = 0;
  try {
    const isLoggedIn = window.isLoggedIn === true;
    const existingTabs = isLoggedIn && window.userPenaltyTabsData?.tabs
                       ? window.userPenaltyTabsData.tabs
                       : getLocalOnlyPenaltyTabs();

    if (existingTabs) {
      Object.keys(existingTabs).forEach(tabId => {
        if (tabId.startsWith("penaltyPane-")) {
          const numPart = tabId.substring("penaltyPane-".length);
          const num = parseInt(numPart, 10);
          if (!isNaN(num) && num > highestNumFound) {
            highestNumFound = num;
          }
        }
      });
    }
    currentMaxPenaltyTabIdNum = highestNumFound;
  } catch (e) {
    console.error("Error initializing/updating penalty custom tab ID counter:", e);
  }
}

export function getNextPenaltyTabIdNumber() {
  initializeMaxPenaltyTabIdNum();
  currentMaxPenaltyTabIdNum++;
  return currentMaxPenaltyTabIdNum;
}

function findNextAvailableCustomPenaltyTabName(currentTabsData) {
  let nextNameNum = 1;
  let newTabName = `Custom Penalties ${nextNameNum}`;
  const existingNames = Object.values(currentTabsData || {}).map(tab => tab.name);

  while (existingNames.includes(newTabName)) {
    nextNameNum++;
    newTabName = `Custom Penalties ${nextNameNum}`;
  }
  return newTabName;
}

export function createTabFromLocalData(tabId, tabName, referenceNodeForInsertion = null) {
  if (!tabId || !tabName) {
    console.error("createTabFromLocalData (Penalties): tabId or tabName missing.");
    return;
  }

  const isSystemDefaultKey = window.SYSTEM_DEFAULT_PENALTY_TABS && window.SYSTEM_DEFAULT_PENALTY_TABS[tabId];

  let linkId;
  if (tabId.startsWith("default-")) { // e.g., default-all-penalties
    linkId = `link-${tabId}`;
  } else if (tabId.startsWith("penaltyPane-")) {
    const tabNumberMatch = tabId.match(/penaltyPane-(\d+)/);
    const tabIdNumber = tabNumberMatch ? tabNumberMatch[1] : tabId.replace(/[^a-zA-Z0-9-_]/g, '');
    linkId = `penaltyTabLink-${tabIdNumber}`; // Unique prefix for penalty tab links
  } else {
    linkId = `link-custom-penalty-${tabId.replace(/[^a-zA-Z0-9-_]/g, '')}`;
  }

  const newTabLink = document.createElement("a");
  newTabLink.className = "nav-link";
  if (tabId.startsWith("default-")) {
    newTabLink.classList.add("system-default-tab-link");
  }
  newTabLink.id = linkId;
  newTabLink.setAttribute("data-toggle", "tab");
  newTabLink.href = `#${tabId}`; // Pane ID is the original tabId
  newTabLink.role = "tab";
  newTabLink.setAttribute("aria-controls", tabId);
  newTabLink.setAttribute("aria-selected", "false");
  newTabLink.textContent = tabName;
  newTabLink.setAttribute("data-tab", tabId);

  const newTabItem = document.createElement("li");
  newTabItem.className = "nav-item";
  newTabItem.appendChild(newTabLink);

  const tabList = document.getElementById("penaltiesTab"); // Target penalties tab list
  const effectiveReferenceNode = referenceNodeForInsertion || document.getElementById("addPenaltyTabBtn")?.closest('li.nav-item');

  if (tabList && effectiveReferenceNode) {
    tabList.insertBefore(newTabItem, effectiveReferenceNode);
  } else if (tabList) {
    const lastItem = tabList.querySelector('li.nav-item:last-child');
    if (lastItem && lastItem.id !== 'loadingPenaltyTabsPlaceholder') {
        tabList.insertBefore(newTabItem, lastItem);
    } else {
        tabList.appendChild(newTabItem);
    }
  } else {
    console.error("Could not find penaltiesTab list or a reference node for inserting new tab link.");
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
    <button class="btn btn-outline-primary btn-sm insertPenaltyBtn" data-tab="${tabId}" title="Add new penalty to this tab">
        <i class="bi bi-plus-lg me-1"></i>Insert New Penalty
    </button>`;

  if (isSystemDefaultKey) {
    buttonsHtml += `
    <button class="btn btn-outline-warning btn-sm ms-2 reset-penalty-tab-to-default-btn" data-tab="${tabId}" title="Reset this tab to its original system default entries">
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
                      <th scope="col" style="width: 30%;"><i class="bi bi-tag-fill me-2"></i>Name</th>
                      <th scope="col" style="width: 15%;"><i class="bi bi-percent me-2"></i>Probability</th>
                      <th scope="col" style="width: 55%;"><i class="bi bi-card-text me-2"></i>Description</th>
                  </tr>
              </thead>
              <tbody class="penaltiesTable">
                  <tr><td colspan="3" class="text-center text-secondary py-4">Loading penalties...</td></tr>
              </tbody>
          </table>
      </div>
    </div>`;
  document.getElementById("penaltiesTabContent")?.appendChild(newTabPane); // Target penalties tab content

  if (tabId.startsWith("penaltyPane-")) {
    const tabNumberMatch = tabId.match(/penaltyPane-(\d+)/);
    if (tabNumberMatch && !isNaN(parseInt(tabNumberMatch[1], 10))) {
      const num = parseInt(tabNumberMatch[1], 10);
      if (num > currentMaxPenaltyTabIdNum) {
        currentMaxPenaltyTabIdNum = num;
      }
    }
  }
}

export async function createNewTab() {
  const isLoggedIn = window.isLoggedIn === true;
  const currentTabsData = isLoggedIn ? (window.userPenaltyTabsData?.tabs || {}) : getLocalOnlyPenaltyTabs();
  const MAX_CUSTOM_TABS = 5; // Same limit as games, can be a shared constant later

  let customTabCount = 0;
  const systemDefaultClientTabIds = window.SYSTEM_DEFAULT_PENALTY_TABS
    ? Object.values(window.SYSTEM_DEFAULT_PENALTY_TABS).map(def => def.client_tab_id)
    : [];

  for (const tabIdInState in currentTabsData) {
    if (!systemDefaultClientTabIds.includes(tabIdInState)) {
      customTabCount++;
    }
  }

  if (customTabCount >= MAX_CUSTOM_TABS) {
    showFlash(`You have reached the maximum limit of ${MAX_CUSTOM_TABS} custom penalty tabs.`, "warning");
    return; 
  }

  const newTabName = findNextAvailableCustomPenaltyTabName(currentTabsData);
  const tabIdNumber = getNextPenaltyTabIdNumber();
  const newTabId = `penaltyPane-${tabIdNumber}`; // Unique prefix for penalty panes
  const linkId = `penaltyTabLink-${tabIdNumber}`; // Unique prefix for penalty links

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

  const addTabBtn = document.getElementById("addPenaltyTabBtn");
  const addTabBtnLi = addTabBtn?.closest('li.nav-item');

  if (addTabBtnLi && addTabBtnLi.parentNode) {
      addTabBtnLi.parentNode.insertBefore(newTabItem, addTabBtnLi);
  } else if (document.getElementById("penaltiesTab")) {
      document.getElementById("penaltiesTab").appendChild(newTabItem);
  }

  const newTabPane = document.createElement("div");
  newTabPane.className = "tab-pane fade";
  newTabPane.id = newTabId;
  newTabPane.setAttribute("role", "tabpanel");
  newTabPane.setAttribute("aria-labelledby", linkId);
  newTabPane.innerHTML = `
    <div class="d-flex justify-content-start my-3 flex-wrap gap-2">
        <button class="btn btn-outline-primary btn-sm insertPenaltyBtn" data-tab="${newTabId}" title="Add a new penalty to this tab">
            <i class="bi bi-plus-lg me-1"></i>Insert New Penalty
        </button>
    </div>
    <div class="glass-effect p-1 rounded shadow-sm">
      <div class="table-responsive">
          <table class="table table-hover table-sm config-table mb-0">
              <thead>
                  <tr>
                      <th scope="col" style="width: 30%;"><i class="bi bi-tag-fill me-2"></i>Name</th>
                      <th scope="col" style="width: 15%;"><i class="bi bi-percent me-2"></i>Probability</th>
                      <th scope="col" style="width: 55%;"><i class="bi bi-card-text me-2"></i>Description</th>
                  </tr>
              </thead>
              <tbody class="penaltiesTable">
                  <tr><td colspan="3" class="text-center text-secondary py-3">No entries yet.</td></tr>
              </tbody>
          </table>
      </div>
    </div>`;
  document.getElementById("penaltiesTabContent")?.appendChild(newTabPane);

  try {
    if (isLoggedIn) {
      if (!window.userPenaltyTabsData) {
          window.userPenaltyTabsData = { tabs: {}, entries: {} };
      }
      window.userPenaltyTabsData.tabs[newTabId] = { name: newTabName };
      window.userPenaltyTabsData.entries[newTabId] = []; // Penalties key
      
      const csrfToken = window.csrfToken;
      // IMPORTANT: Use the correct API endpoint for penalties
      const response = await apiFetch('/api/penalties/save_tab', {
        method: 'POST',
        body: { tabId: newTabId, tabName: newTabName, penalties: [] } // Use 'penalties' key
      }, csrfToken);

      if (response.status !== 'ok') {
          throw new Error(response.error || "Failed to save new penalty tab to server.");
      }
      showFlash(`Penalty tab "${newTabName}" created.`, "success");
    } else {
      const tabs = getLocalOnlyPenaltyTabs();
      tabs[newTabId] = { name: newTabName };
      setLocalOnlyPenaltyTabs(tabs);

      const entries = getLocalOnlyPenaltyEntries();
      entries[newTabId] = []; // Penalties key
      setLocalOnlyPenaltyEntries(entries);
      showFlash(`Penalty tab "${newTabName}" created locally.`, "success");
    }
    
    updatePenaltyTabGroupVisibility(); // Update group labels/separators
    
    if (typeof $ !== 'undefined' && $.fn.tab) {
      $(newTabLink).tab('show');
    }
  } catch (e) {
    console.error(`Failed to create or save new custom penalty tab ${newTabId}:`, e);
    newTabItem?.remove();
    newTabPane?.remove();
    showFlash(`Error creating penalty tab: ${e.message}`, "danger");
    updatePenaltyTabGroupVisibility();
  }
}
