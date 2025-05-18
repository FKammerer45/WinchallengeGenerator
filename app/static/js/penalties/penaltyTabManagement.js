// app/static/js/penalties/penaltyTabManagement.js

import {
    getLocalOnlyTabs as getLocalOnlyPenaltyTabs,
    setLocalOnlyTabs as setLocalOnlyPenaltyTabs,
    getLocalOnlyEntries as getLocalOnlyPenaltyEntries,
    setLocalOnlyEntries as setLocalOnlyPenaltyEntries
} from "./penaltyLocalStorageUtils.js";
import { apiFetch } from "../utils/api.js";
import { showFlash } from "../utils/helpers.js";

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

/**
 * Creates and appends a penalty tab link and its corresponding pane to the DOM.
 * Appends to the correct list (system or custom) based on isSystemDefault.
 * @param {string} tabId - The unique ID for the tab and pane.
 * @param {string} tabName - The display name for the tab.
 * @param {boolean} isSystemDefault - True if this is a system default tab.
 */
export function createTabFromLocalData(tabId, tabName, isSystemDefault) {
  if (!tabId || !tabName) {
    console.error("createTabFromLocalData (Penalties): tabId or tabName missing.");
    return;
  }

  const targetListId = isSystemDefault ? "penaltiesSystemTabList" : "penaltiesCustomTabList";
  const tabList = document.getElementById(targetListId);
  
  let referenceNodeLi = null;
  if (tabList) {
      if (isSystemDefault) {
          referenceNodeLi = tabList.querySelector('#loadingSystemPenaltyTabsPlaceholder');
      } else {
          referenceNodeLi = tabList.querySelector('#addPenaltyTabBtnContainer');
      }
  }

  if (!tabList) {
    console.error(`Could not find penalty tab list with ID: ${targetListId}`);
    return;
  }

  let linkId;
  if (tabId.startsWith("default-")) {
    linkId = `link-p-${tabId}`; // 'p' for penalty
  } else if (tabId.startsWith("penaltyPane-")) {
    const tabNumberMatch = tabId.match(/penaltyPane-(\d+)/);
    const tabIdNumber = tabNumberMatch ? tabNumberMatch[1] : tabId.replace(/[^a-zA-Z0-9-_]/g, '');
    linkId = `penaltyTabLink-${tabIdNumber}`;
  } else { 
    linkId = `link-custom-p-${tabId.replace(/[^a-zA-Z0-9-_]/g, '')}`;
  }

  // Only create the LI and A tag if it doesn't already exist
  if (!document.getElementById(linkId)) {
      const newTabLink = document.createElement("a");
      newTabLink.className = "nav-link";
      if (isSystemDefault) {
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

      if (referenceNodeLi) {
        tabList.insertBefore(newTabItem, referenceNodeLi);
      } else {
        tabList.appendChild(newTabItem); 
      }
  }


  // Create Tab Pane (if it doesn't exist)
  if (!document.getElementById(tabId)) {
    const newTabPane = document.createElement("div");
    newTabPane.className = "tab-pane fade";
    if (isSystemDefault) {
        newTabPane.classList.add("system-default-pane");
    }
    newTabPane.id = tabId;
    newTabPane.setAttribute("role", "tabpanel");
    newTabPane.setAttribute("aria-labelledby", linkId);

    let buttonsHtml = `
      <button class="btn btn-outline-primary btn-sm insertPenaltyBtn" data-tab="${tabId}" title="Add new penalty to this tab">
          <i class="bi bi-plus-lg me-1"></i>Insert New Penalty
      </button>`;

    if (isSystemDefault) {
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
    document.getElementById("penaltiesTabContent")?.appendChild(newTabPane);
  }

  // Update max ID for custom penalty tabs
  if (!isSystemDefault && tabId.startsWith("penaltyPane-")) {
    const tabNumberMatch = tabId.match(/penaltyPane-(\d+)/);
    if (tabNumberMatch && !isNaN(parseInt(tabNumberMatch[1], 10))) {
      const num = parseInt(tabNumberMatch[1], 10);
      if (num > currentMaxPenaltyTabIdNum) {
        currentMaxPenaltyTabIdNum = num;
      }
    }
  }
}

export async function createNewTab() { // For Penalties
  const isLoggedIn = window.isLoggedIn === true;
  const currentTabsData = isLoggedIn ? (window.userPenaltyTabsData?.tabs || {}) : getLocalOnlyPenaltyTabs();
  const MAX_CUSTOM_TABS = window.MAX_CUSTOM_TABS || 5; // Use global or fallback

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
  const newTabId = `penaltyPane-${tabIdNumber}`; 

  console.log(`Creating new custom penalty tab: ID=${newTabId}, Name=${newTabName}`);
  createTabFromLocalData(newTabId, newTabName, false); // isSystemDefault = false

  try {
    if (isLoggedIn) {
      if (!window.userPenaltyTabsData) window.userPenaltyTabsData = { tabs: {}, entries: {} };
      window.userPenaltyTabsData.tabs[newTabId] = { name: newTabName };
      window.userPenaltyTabsData.entries[newTabId] = []; // Key is 'entries' for consistency
      
      const csrfToken = window.csrfToken;
      const response = await apiFetch('/api/penalties/save_tab', { 
        method: 'POST',
        body: { tabId: newTabId, tabName: newTabName, penalties: [] } // API expects 'penalties'
      }, csrfToken);

      if (response.status !== 'ok') {
          throw new Error(response.error || "Failed to save new penalty tab to server.");
      }
      showFlash(`Penalty Tab "${newTabName}" created.`, "success");
    } else {
      const tabs = getLocalOnlyPenaltyTabs();
      tabs[newTabId] = { name: newTabName };
      setLocalOnlyPenaltyTabs(tabs);
      const entries = getLocalOnlyPenaltyEntries();
      entries[newTabId] = [];
      setLocalOnlyPenaltyEntries(entries);
      showFlash(`Penalty Tab "${newTabName}" created locally.`, "success");
    }

    const newTabLinkElement = document.querySelector(`#penaltiesCustomTabList .nav-link[href="#${newTabId}"]`);
        if (newTabLinkElement && typeof $ !== 'undefined' && $.fn.tab) {
        // Before showing the new tab, deactivate all other tabs in both lists
        document.querySelectorAll('#penaltiesSystemTabList .nav-link, #penaltiesCustomTabList .nav-link').forEach(link => {
            if (link !== newTabLinkElement) { // Don't deactivate the one we're about to activate
                $(link).removeClass('active').attr('aria-selected', 'false');
                 const paneId = link.getAttribute('href');
                 if (paneId && paneId.startsWith('#') && paneId.length > 1) {
                    const pane = document.querySelector(paneId);
                    if (pane) $(pane).removeClass('show active');
                }
            }
        });
        // Now, show the new tab. Bootstrap should handle marking it active and showing its pane.
        $(newTabLinkElement).tab('show');
    }
    
    const { renderPenaltiesForTab } = await import('./penaltyEntryManagement.js');
    renderPenaltiesForTab(newTabId);

  } catch (e) {
    console.error(`Failed to create or save new custom penalty tab ${newTabId}:`, e);
    const tabLinkToRemove = document.querySelector(`#penaltiesCustomTabList .nav-link[href="#${newTabId}"]`);
    tabLinkToRemove?.closest('li.nav-item')?.remove();
    document.getElementById(newTabId)?.remove();
    showFlash(`Error creating penalty tab: ${e.message}`, "danger");
  }
}
