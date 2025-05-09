// app/static/js/penalties/penaltyTabManagement.js

import {
  getLocalPenaltyTabs, setLocalPenaltyTabs, getLocalPenalties, setLocalPenalties
} from "./penaltyLocalStorageUtils.js";
import { apiFetch } from "../utils/api.js"; // Assuming penalties will also save via API
import { showFlash } from "../utils/helpers.js";
import { renderPenaltiesForTab } from "./penaltyEntryManagement.js"; // Import renderer

// Keep track of the highest penalty tab ID number used
let currentMaxPenaltyTabIdNum = 0;

// Function to initialize or update the max ID number
function initializeMaxPenaltyTabIdNum() {
  let highestNumFound = 0;
  try {
      const isLoggedIn = window.isLoggedIn === true;
      // Use penalty-specific data source
      const existingTabs = isLoggedIn && window.userPenaltyTabsData?.tabs
                         ? window.userPenaltyTabsData.tabs
                         : getLocalPenaltyTabs();

      if (existingTabs) {
          Object.keys(existingTabs).forEach(tabId => {
              if (tabId.startsWith("penaltyPane-")) { // Check penalty prefix
                  const num = parseInt(tabId.split("-")[1]);
                  if (!isNaN(num) && num > highestNumFound) {
                      highestNumFound = num;
                  }
              }
          });
      }
      currentMaxPenaltyTabIdNum = highestNumFound;
      console.log("Re-initialized penalty tab ID counter max to:", currentMaxPenaltyTabIdNum);
  } catch (e) {
      console.error("Error initializing/updating penalty tab ID counter:", e);
  }
}

// Initialize on script load
initializeMaxPenaltyTabIdNum();

// Gets the next unique penalty tab ID number
export function getNextPenaltyTabIdNumber() {
  initializeMaxPenaltyTabIdNum();
  currentMaxPenaltyTabIdNum++;
  console.log("getNextPenaltyTabIdNumber returning:", currentMaxPenaltyTabIdNum);
  return currentMaxPenaltyTabIdNum;
}

// Finds the next available "Penalty Tab N" name
function findNextAvailablePenaltyTabName(currentTabsData) {
  let nextNameNum = 1;
  let newTabName = `Penalty Tab ${nextNameNum}`;
  const existingNames = Object.values(currentTabsData || {}).map(tab => tab.name);

  while (existingNames.includes(newTabName)) {
      nextNameNum++;
      newTabName = `Penalty Tab ${nextNameNum}`;
  }
  return newTabName;
}


// --- MODIFIED createNewPenaltyTab ---
export async function createNewPenaltyTab() { // Added async

  const isLoggedIn = window.isLoggedIn === true;
  // Use penalty-specific data source
  const currentTabs = isLoggedIn ? (window.userPenaltyTabsData?.tabs || {}) : getLocalPenaltyTabs();
  const MAX_CUSTOM_TABS = 5; // Same limit as games for consistency

  // --- Check Max Tab Limit ---
  const customTabCount = Object.keys(currentTabs).filter(id => id !== 'default').length;
  if (customTabCount >= MAX_CUSTOM_TABS) {
      showFlash(`You have reached the maximum limit of ${MAX_CUSTOM_TABS} custom penalty tabs.`, "warning");
      return;
  }
  // --- End Check ---

  // --- Find Name & ID ---
  const newTabName = findNextAvailablePenaltyTabName(currentTabs);
  initializeMaxPenaltyTabIdNum(); // Refresh max ID before getting next
  const tabIdNumber = getNextPenaltyTabIdNumber();
  const newTabId = `penaltyPane-${tabIdNumber}`; // Use penalty prefix
  const linkId = `penalty-tab-${tabIdNumber}`; // Use penalty prefix
  // --- End Finding ---

  console.log(`Creating new penalty tab: ID=${newTabId}, LinkID=${linkId}, Name=${newTabName}`);

  // --- Create UI Elements ---
  const newTabLink = document.createElement("a");
  newTabLink.className = "nav-link";
  newTabLink.id = linkId;
  newTabLink.setAttribute("data-toggle", "tab");
  newTabLink.href = `#${newTabId}`; // Target pane ID
  newTabLink.role = "tab";
  newTabLink.setAttribute("aria-controls", newTabId);
  newTabLink.setAttribute("aria-selected", "false");
  newTabLink.textContent = newTabName;
  newTabLink.setAttribute("data-tab", newTabId); // Store pane ID

  const newTabItem = document.createElement("li");
  newTabItem.className = "nav-item";
  newTabItem.appendChild(newTabLink);

  // Use penalty-specific add button ID
  const addTabBtn = document.getElementById("addPenaltyTabBtn");
  addTabBtn?.parentNode?.parentNode?.insertBefore(newTabItem, addTabBtn.parentNode);

  const newTabPane = document.createElement("div");
  newTabPane.className = "tab-pane fade";
  newTabPane.id = newTabId;
  newTabPane.setAttribute("role", "tabpanel");
  newTabPane.setAttribute("aria-labelledby", linkId);
  // Use penalty-specific button class
  newTabPane.innerHTML = `
    <div class="d-flex justify-content-start my-3 flex-wrap gap-2">
        <button class="btn btn-primary insertPenaltyBtn" data-tab="${newTabId}" title="Add a new penalty to this tab">Insert New Penalty</button>
    </div>
    <div class="table-responsive">
        <table class="table table-hover table-sm config-table mb-0">
            <thead> <tr> <th>Name</th> <th>Probability</th> <th>Description</th> </tr> </thead>
            <tbody class="penaltiesTable"> <tr><td colspan="3" class="text-center text-secondary py-3">No penalties yet.</td></tr> </tbody>
        </table>
    </div>`;
  // Use penalty-specific content ID
  document.getElementById("penaltiesTabContent")?.appendChild(newTabPane);
  // --- End UI Element Creation ---


  // --- Update Data Store (Conditional) ---
  try {
      if (isLoggedIn) {
           // Use penalty-specific state object
           if(window.userPenaltyTabsData) {
               window.userPenaltyTabsData.tabs[newTabId] = { name: newTabName };
               window.userPenaltyTabsData.entries[newTabId] = [];
               console.log(`Penalty Tab ${newTabId} added to JS state.`);
           } else { throw new Error("Internal state error: window.userPenaltyTabsData missing."); }

           // API Call to save (needs penalty-specific endpoint)
           console.log(`[New Penalty Tab] Calling API to save empty tab ${newTabId}...`);
           const csrfToken = window.csrfToken;
           // *** Uses /api/penalties/save_tab endpoint ***
           await apiFetch('/api/penalties/save_tab', {
               method: 'POST',
               body: { tabId: newTabId, tabName: newTabName, penalties: [] } // Send 'penalties' key
           }, csrfToken);
           console.log(`[New Penalty Tab] API save successful for ${newTabId}`);
           showFlash(`Penalty Tab "${newTabName}" created.`, "success");

      } else {
          // Anonymous: Update localStorage
          const tabs = getLocalPenaltyTabs();
          tabs[newTabId] = { name: newTabName };
          setLocalPenaltyTabs(tabs);

          const penalties = getLocalPenalties();
          penalties[newTabId] = [];
          setLocalPenalties(penalties);
          console.log(`Penalty Tab ${newTabId} added to localStorage.`);
      }
      // Activate the new tab
       if (typeof $ !== 'undefined' && $.fn.tab) { $(newTabLink).tab('show'); }

  } catch (e) {
      console.error(`Failed to create or save new penalty tab ${newTabId}:`, e);
      newTabItem?.remove();
      newTabPane?.remove();
      showFlash(`Error creating penalty tab: ${e.message}`, "danger");
  }
} // End createNewPenaltyTab

// --- Recreate UI for existing tab ---
export function createPenaltyTabFromLocalData(tabId, tabName) {
 console.log(`Recreating UI for existing penalty tab: ID=${tabId}, Name=${tabName}`);
 if(!tabId || !tabName) return; // Basic validation

 // Extract number for link ID
 const tabNumberMatch = tabId.match(/penaltyPane-(\d+)/); // Use penalty prefix
 const tabIdNumber = tabNumberMatch ? tabNumberMatch[1] : tabId.replace(/[^a-zA-Z0-9-_]/g, '');
 const linkId = tabId === 'default' ? 'default-penalty-tab' : `penalty-tab-${tabIdNumber}`; // Use penalty prefix

 // --- Create Link ---
 const newTabLink = document.createElement("a");
 newTabLink.className = "nav-link";
 newTabLink.id = linkId;
 newTabLink.setAttribute("data-toggle", "tab");
 newTabLink.href = `#${tabId}`; // Pane ID is the original tabId
 newTabLink.role = "tab";
 newTabLink.setAttribute("aria-controls", tabId);
 newTabLink.setAttribute("aria-selected", "false");
 newTabLink.textContent = tabName;
 newTabLink.setAttribute("data-tab", tabId); // Store original pane ID

 const newTabItem = document.createElement("li");
 newTabItem.className = "nav-item";
 newTabItem.appendChild(newTabLink);

 // Use penalty-specific add button
 const addTabBtn = document.getElementById("addPenaltyTabBtn");
 addTabBtn?.parentNode?.parentNode?.insertBefore(newTabItem, addTabBtn.parentNode);

 // --- Create Pane ---
 const newTabPane = document.createElement("div");
 newTabPane.className = "tab-pane fade";
 newTabPane.id = tabId; // Use the original tabId
 newTabPane.setAttribute("role", "tabpanel");
 newTabPane.setAttribute("aria-labelledby", linkId); // Use the generated link's ID

 // Add correct buttons based on tabId
 let buttonsHtml = '';
 if (tabId === 'default') {
      // Use penalty-specific button ID
      buttonsHtml = `<button id="loadDefaultPenaltiesBtn" class="btn btn-warning mr-2" title="Load global defaults">Load Global Defaults</button>`;
 }
  // Always add Insert button (use penalty-specific class)
 buttonsHtml += `<button class="btn btn-primary insertPenaltyBtn" data-tab="${tabId}" title="Add new penalty">Insert New Penalty</button>`;

 // Use penalty-specific table body class
 newTabPane.innerHTML = `
  <div class="d-flex justify-content-start my-3 flex-wrap gap-2"> ${buttonsHtml} </div>
  <div class="table-responsive">
   <table class="table table-hover table-sm config-table mb-0">
     <thead> <tr> <th>Name</th> <th>Probability</th> <th>Description</th> </tr> </thead>
     <tbody class="penaltiesTable"><tr><td colspan="3" class="text-center text-secondary py-3">Loading...</td></tr></tbody>
   </table>
  </div>`;
 // Use penalty-specific content ID
 document.getElementById("penaltiesTabContent")?.appendChild(newTabPane);

  // --- Update Max ID Counter After Recreating ---
  if (tabNumberMatch && !isNaN(parseInt(tabNumberMatch[1]))) {
      const num = parseInt(tabNumberMatch[1]);
      if (num > currentMaxPenaltyTabIdNum) {
          currentMaxPenaltyTabIdNum = num;
          console.log("Updated max penalty tab ID counter after recreating tab:", currentMaxPenaltyTabIdNum);
      }
  }
  // --- End Update ---
} // End createPenaltyTabFromLocalData