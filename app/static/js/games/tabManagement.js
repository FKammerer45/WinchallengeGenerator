// tabManagement.js
import { getLocalTabs, setLocalTabs, getLocalEntries, setLocalEntries } from "./localStorageUtils.js";

// Keep track of the highest tab number seen or created in this session
// Initialize by finding the max existing number from localStorage
let currentMaxTabNum = 1; // Start counter assuming 'default' exists
try {
    const existingTabs = getLocalTabs();
    if (existingTabs) {
        Object.keys(existingTabs).forEach(tabId => {
            if (tabId.startsWith("tabPane-")) {
                const num = parseInt(tabId.split("-")[1]);
                if (!isNaN(num) && num > currentMaxTabNum) {
                    currentMaxTabNum = num;
                }
            }
        });
    }
} catch (e) { console.error("Error initializing tabCount:", e); }

export function getNextTabCount() {
    currentMaxTabNum++;
    return currentMaxTabNum;
}


// Creates the UI and updates localStorage for a *new* tab
export function createNewTab() {
  const tabNumber = getNextTabCount(); // Get next available number
  const newTabId = `tabPane-${tabNumber}`; // e.g., tabPane-2
  const newTabName = `Tab ${tabNumber}`;    // e.g., Tab 2

  console.log(`Creating new tab: ID=${newTabId}, Name=${newTabName}`);

  // --- Create and Insert Tab Link ---
  const newTabLink = document.createElement("a");
  newTabLink.classList.add("nav-link");
  newTabLink.id = `tab-${tabNumber}`; // Link ID
  newTabLink.setAttribute("data-toggle", "tab");
  newTabLink.href = `#${newTabId}`; // Target pane ID
  newTabLink.role = "tab";
  newTabLink.setAttribute("aria-controls", newTabId);
  newTabLink.setAttribute("aria-selected", "false"); // New tabs aren't active initially
  newTabLink.textContent = newTabName;
  newTabLink.setAttribute("data-tab", newTabId); // Store pane ID for easy access

  const newTabItem = document.createElement("li");
  newTabItem.classList.add("nav-item");
  newTabItem.appendChild(newTabLink);

  const addTabBtn = document.getElementById("addTabBtn");
  if (addTabBtn?.parentNode?.parentNode) { // Ensure button and its list item parent exist
       addTabBtn.parentNode.parentNode.insertBefore(newTabItem, addTabBtn.parentNode);
  } else {
      console.error("Could not find insertion point for new tab link.");
      // Fallback or error? For now, proceed to create pane.
  }

  // --- Create and Insert Tab Pane ---
  const newTabPane = document.createElement("div");
  newTabPane.classList.add("tab-pane", "fade"); // Start faded out
  newTabPane.id = newTabId;
  newTabPane.setAttribute("role", "tabpanel");
  newTabPane.setAttribute("aria-labelledby", `tab-${tabNumber}`);

  // Basic inner structure for a new tab
  newTabPane.innerHTML = `
    <div class="my-3">
      <button class="btn btn-primary insertGameBtn" data-tab="${newTabId}" title="Add a new entry to this tab">Insert New Entry</button>
      </div>
    <table class="table table-dark table-striped">
      <thead>
        <tr>
          <th>Game</th>
          <th>Game Mode</th>
          <th>Difficulty</th>
          <th>Number of Players</th>
        </tr>
      </thead>
      <tbody class="gamesTable">
        <tr><td colspan="4" class="text-center text-muted">No entries added to this tab yet.</td></tr>
      </tbody>
    </table>
  `;
  const tabContentContainer = document.getElementById("gamesTabContent");
   if(tabContentContainer) {
       tabContentContainer.appendChild(newTabPane);
   } else {
        console.error("Tab content container ('gamesTabContent') not found.");
        // If this fails, the tab is unusable. Maybe remove the link item?
        newTabItem.remove(); // Clean up link if pane fails
        throw new Error("Could not add tab content pane."); // Stop creation
   }


  // --- Update Local Storage ---
  try {
      const tabs = getLocalTabs();
      tabs[newTabId] = { name: newTabName };
      setLocalTabs(tabs);

      const entries = getLocalEntries();
      if (!entries[newTabId]) { // Should not exist, but check
        entries[newTabId] = []; // Initialize empty entry list
        setLocalEntries(entries);
      }
      console.log(`Tab ${newTabId} added to localStorage.`);
      // Optional: Activate the new tab programmatically
      // $(newTabLink).tab('show'); // Requires jQuery/Bootstrap JS fully loaded
  } catch(e) {
      console.error(`Failed to update localStorage for new tab ${newTabId}:`, e);
      // Attempt to clean up UI?
      newTabItem.remove();
      newTabPane.remove();
      alert("Error saving new tab locally. Please try again.");
  }
}

// Creates only the UI for a tab based on existing localStorage data (used on page load)
export function createTabFromLocalData(tabId, tabName) {
   console.log(`Recreating UI for existing tab: ID=${tabId}, Name=${tabName}`);
   // Basic validation
   if(!tabId || !tabName) {
       console.error("createTabFromLocalData requires valid tabId and tabName.");
       return;
   }

  // Try to extract number for consistent IDing, fallback needed
  const tabNumberMatch = tabId.match(/tabPane-(\d+)/);
  const tabNumber = tabNumberMatch ? tabNumberMatch[1] : tabId; // Use tabId if no number found

  // --- Create and Insert Tab Link ---
  const newTabLink = document.createElement("a");
  newTabLink.classList.add("nav-link");
  newTabLink.id = `tab-${tabNumber}`; // Link ID using number or id
  newTabLink.setAttribute("data-toggle", "tab");
  newTabLink.href = `#${tabId}`; // Target pane ID
  newTabLink.role = "tab";
  newTabLink.setAttribute("aria-controls", tabId);
  newTabLink.setAttribute("aria-selected", "false"); // Loaded tabs are not active initially
  newTabLink.textContent = tabName;
  newTabLink.setAttribute("data-tab", tabId); // Store pane ID

  const newTabItem = document.createElement("li");
  newTabItem.classList.add("nav-item");
  newTabItem.appendChild(newTabLink);

  const addTabBtn = document.getElementById("addTabBtn");
   if (addTabBtn?.parentNode?.parentNode) {
       addTabBtn.parentNode.parentNode.insertBefore(newTabItem, addTabBtn.parentNode);
  } else {
      console.error("Could not find insertion point for loaded tab link.");
      return; // Don't create pane if link fails
  }


  // --- Create and Insert Tab Pane ---
  const newTabPane = document.createElement("div");
  newTabPane.classList.add("tab-pane", "fade");
  newTabPane.id = tabId;
  newTabPane.setAttribute("role", "tabpanel");
  newTabPane.setAttribute("aria-labelledby", `tab-${tabNumber}`);

  // Inner structure is the same as for a new tab
  newTabPane.innerHTML = `
    <div class="my-3">
      <button class="btn btn-primary insertGameBtn" data-tab="${tabId}" title="Add a new entry to this tab">Insert New Entry</button>
       </div>
    <table class="table table-dark table-striped">
      <thead>
        <tr>
          <th>Game</th>
          <th>Game Mode</th>
          <th>Difficulty</th>
          <th>Number of Players</th>
        </tr>
      </thead>
      <tbody class="gamesTable">
        </tbody>
    </table>
  `;
   const tabContentContainer = document.getElementById("gamesTabContent");
   if(tabContentContainer) {
       tabContentContainer.appendChild(newTabPane);
   } else {
        console.error("Tab content container ('gamesTabContent') not found when recreating tab.");
        newTabItem.remove(); // Clean up link if pane fails
   }
}