// app/static/js/games/tabManagement.js

import {
  getLocalOnlyTabs, setLocalOnlyTabs, getLocalOnlyEntries, setLocalOnlyEntries
} from "./localStorageUtils.js";
import { apiFetch } from "../utils/api.js";
import { showFlash } from "../utils/helpers.js";
import { renderGamesForTab } from "./entryManagement.js";

// Keep track of the highest tab ID number used (for generating unique IDs)
let currentMaxTabIdNum = 0; // Renamed for clarity

// Function to initialize or update the max ID number based on current tabs
function initializeMaxTabIdNum() {
  let highestNumFound = 0;
  try {
      const isLoggedIn = window.isLoggedIn === true;
      const existingTabs = isLoggedIn && window.userTabsData?.tabs
                         ? window.userTabsData.tabs
                         : getLocalOnlyTabs(); // Read from correct source

      if (existingTabs) {
          Object.keys(existingTabs).forEach(tabId => {
              // Check specifically for the tabPane-ID pattern
              if (tabId.startsWith("tabPane-")) {
                  const num = parseInt(tabId.split("-")[1]);
                  if (!isNaN(num) && num > highestNumFound) {
                      highestNumFound = num;
                  }
              }
          });
      }
      currentMaxTabIdNum = highestNumFound; // Update the global tracker
      console.log("Re-initialized games tab ID counter max to:", currentMaxTabIdNum);
  } catch (e) {
      console.error("Error initializing/updating games tab ID counter:", e);
      // Decide on fallback behavior, maybe keep the existing value?
      // currentMaxTabIdNum = currentMaxTabIdNum; // Keep existing on error
  }
}

// Call initialization once when the script loads (or after data is loaded in games.js)
// Note: It might be better to call this from games.js AFTER user tabs are loaded.
// For now, we'll initialize it here based on local storage/initial state if available.
initializeMaxTabIdNum();

// Gets the next unique ID number
export function getNextTabIdNumber() {
  // OPTIONAL: Re-scan here for absolute safety, but good initialization is usually enough
  // initializeMaxTabIdNum(); // Uncomment if you suspect state issues between loads
  currentMaxTabIdNum++;
  console.log("getNextTabIdNumber returning:", currentMaxTabIdNum);
  return currentMaxTabIdNum;
}

// Finds the next available "Tab N" name
function findNextAvailableTabName(currentTabsData) {
  let nextNameNum = 1;
  let newTabName = `Tab ${nextNameNum}`;
  const existingNames = Object.values(currentTabsData || {}).map(tab => tab.name);

  while (existingNames.includes(newTabName)) {
      nextNameNum++;
      newTabName = `Tab ${nextNameNum}`;
  }
  return newTabName;
}

// --- MODIFIED createNewTab ---
export async function createNewTab() {

  const isLoggedIn = window.isLoggedIn === true;
  const currentTabs = isLoggedIn ? (window.userTabsData?.tabs || {}) : getLocalOnlyTabs();
  const MAX_CUSTOM_TABS = 5; // Define the limit

  // --- Check Max Tab Limit ---
  const customTabCount = Object.keys(currentTabs).filter(id => id !== 'default').length;
  if (customTabCount >= MAX_CUSTOM_TABS) {
      showFlash(`You have reached the maximum limit of ${MAX_CUSTOM_TABS} custom tabs.`, "warning");
      return; // Stop creation
  }
  // --- End Check ---

  // --- Find the next available "Tab N" name ---
  const newTabName = findNextAvailableTabName(currentTabs);
  // --- End Name Finding ---

  // --- Get a unique ID number ---
  // Ensure the counter is up-to-date before getting the next number
  initializeMaxTabIdNum(); // Update based on current reality
  const tabIdNumber = getNextTabIdNumber(); // Increment and get the new highest
  const newTabId = `tabPane-${tabIdNumber}`;
  const linkId = `tab-${tabIdNumber}`; // Use the same unique number for the link ID
  // --- End ID Generation ---

  console.log(`Creating new tab: ID=${newTabId}, LinkID=${linkId}, Name=${newTabName}`);

  // --- Create UI Elements (Link and Pane) ---
  const newTabLink = document.createElement("a");
  newTabLink.className = "nav-link";
  newTabLink.id = linkId; // *** Use the generated linkId ***
  newTabLink.setAttribute("data-toggle", "tab");
  newTabLink.href = `#${newTabId}`; // Pane ID
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
  newTabPane.id = newTabId; // Use unique pane ID
  newTabPane.setAttribute("role", "tabpanel");
  newTabPane.setAttribute("aria-labelledby", linkId); // *** Use the generated linkId ***
  // --- Rest of pane innerHTML and saving logic remains the same ---
  newTabPane.innerHTML = `
    <div class="d-flex justify-content-start my-3 flex-wrap gap-2">
        <button class="btn btn-primary insertGameBtn" data-tab="${newTabId}" title="Add a new entry to this tab">Insert New Entry</button>
    </div>
    <div class="table-responsive">
        <table class="table table-hover table-sm config-table mb-0">
            <thead> <tr> <th>Game</th> <th>Game Mode</th> <th>Difficulty</th> <th>Players</th> </tr> </thead>
            <tbody class="gamesTable"> <tr><td colspan="4" class="text-center text-secondary py-3">No entries yet.</td></tr> </tbody>
        </table>
    </div>`;
  document.getElementById("gamesTabContent")?.appendChild(newTabPane);
  // --- End UI Element Creation ---


  // --- Update Data Store (Conditional) ---
  try {
      if (isLoggedIn) {
           // Add to in-memory state immediately
           if(window.userTabsData) {
               window.userTabsData.tabs[newTabId] = { name: newTabName };
               window.userTabsData.entries[newTabId] = [];
               console.log(`Tab ${newTabId} added to JS state.`);
           } else { throw new Error("Internal state error: window.userTabsData missing."); }

           // API Call to save the new (empty) tab structure
           console.log(`[New Tab] Calling API to save empty tab ${newTabId}...`);
           const csrfToken = window.csrfToken;
           // The backend already has the max tab check, so this should fail if somehow
           // the frontend check was bypassed, but the frontend check provides better UX.
           await apiFetch('/api/tabs/save', {
               method: 'POST',
               body: { tabId: newTabId, tabName: newTabName, entries: [] }
           }, csrfToken);
           console.log(`[New Tab] API save successful for ${newTabId}`);
           showFlash(`Tab "${newTabName}" created.`, "success");

      } else {
          // Anonymous: Update localStorage
          const tabs = getLocalOnlyTabs();
          tabs[newTabId] = { name: newTabName };
          setLocalOnlyTabs(tabs);

          const entries = getLocalOnlyEntries();
          entries[newTabId] = [];
          setLocalOnlyEntries(entries);
          console.log(`Tab ${newTabId} added to localStorage.`);
      }
      // Activate the new tab
       if (typeof $ !== 'undefined' && $.fn.tab) { $(newTabLink).tab('show'); }

  } catch (e) {
      console.error(`Failed to create or save new tab ${newTabId}:`, e);
      // Clean up UI elements if data update failed
      newTabItem?.remove();
      newTabPane?.remove();
      showFlash(`Error creating tab: ${e.message}`, "danger");
      // Decrement counter if saving failed after incrementing?
      // It might be safer to let initializeMaxTabIdNum fix it on next load/action.
  }
} // End createNewTab

// createTabFromLocalData function (ensure it uses normalized IDs correctly)
export function createTabFromLocalData(tabId, tabName) {
 console.log(`Recreating UI for existing tab: ID=${tabId}, Name=${tabName}`);
 if(!tabId || !tabName) return; // Basic validation

 // --- Extract number for link ID, use fallback if pattern mismatch ---
 const tabNumberMatch = tabId.match(/tabPane-(\d+)/);
 const tabIdNumber = tabNumberMatch ? tabNumberMatch[1] : tabId.replace(/[^a-zA-Z0-9-_]/g, ''); // Sanitize fallback
 const linkId = tabId === 'default' ? 'default-tab' : `tab-${tabIdNumber}`; // Handle default ID

 // --- Create Link ---
 const newTabLink = document.createElement("a");
 newTabLink.className = "nav-link";
 newTabLink.id = linkId; // Use potentially corrected link ID
 newTabLink.setAttribute("data-toggle", "tab");
 newTabLink.href = `#${tabId}`; // Pane ID remains the original tabId
 newTabLink.role = "tab";
 newTabLink.setAttribute("aria-controls", tabId);
 newTabLink.setAttribute("aria-selected", "false"); // Start inactive
 newTabLink.textContent = tabName;
 newTabLink.setAttribute("data-tab", tabId); // Store original pane ID

 const newTabItem = document.createElement("li");
 newTabItem.className = "nav-item";
 newTabItem.appendChild(newTabLink);

 const addTabBtn = document.getElementById("addTabBtn");
 addTabBtn?.parentNode?.parentNode?.insertBefore(newTabItem, addTabBtn.parentNode);

 // --- Create Pane ---
 const newTabPane = document.createElement("div");
 newTabPane.className = "tab-pane fade"; // Start inactive
 newTabPane.id = tabId; // Use the original tabId
 newTabPane.setAttribute("role", "tabpanel");
 newTabPane.setAttribute("aria-labelledby", linkId); // Use the generated link's ID

 // Add correct buttons based on tabId
 let buttonsHtml = '';
 if (tabId === 'default') {
      buttonsHtml = `<button id="loadDefaultEntriesBtn" class="btn btn-warning mr-2" title="Load global defaults">Load Global Defaults</button>`;
 }
  // Always add Insert button
 buttonsHtml += `<button class="btn btn-primary insertGameBtn" data-tab="${tabId}" title="Add new entry">Insert New Entry</button>`;

 newTabPane.innerHTML = `
  <div class="d-flex justify-content-start my-3 flex-wrap gap-2"> ${buttonsHtml} </div>
  <div class="table-responsive">
   <table class="table table-hover table-sm config-table mb-0">
     <thead> <tr> <th>Game</th> <th>Game Mode</th> <th>Difficulty</th> <th>Players</th> </tr> </thead>
     <tbody class="gamesTable"><tr><td colspan="4" class="text-center text-secondary py-3">Loading...</td></tr></tbody>
   </table>
  </div>`;
 document.getElementById("gamesTabContent")?.appendChild(newTabPane);

  // --- Update Max ID Counter After Recreating ---
  // Ensure the global counter knows about this potentially high ID number
  if (tabNumberMatch && !isNaN(parseInt(tabNumberMatch[1]))) {
      const num = parseInt(tabNumberMatch[1]);
      if (num > currentMaxTabIdNum) {
          currentMaxTabIdNum = num;
          console.log("Updated max tab ID counter after recreating tab:", currentMaxTabIdNum);
      }
  }
  // --- End Update ---
} // End createTabFromLocalData