// penalties/penaltyTabManagement.js
// Manages creation of UI elements for penalty tabs
import { getLocalPenaltyTabs, setLocalPenaltyTabs, getLocalPenalties, setLocalPenalties } from "./penaltyLocalStorageUtils.js";

// Keep track of the highest tab number seen or created in this session
let currentMaxPenaltyTabNum = 0; // Start at 0, default is not numbered
try {
    const existingTabs = getLocalPenaltyTabs();
    if (existingTabs) {
        Object.keys(existingTabs).forEach(tabId => {
            if (tabId.startsWith("penaltyPane-")) {
                const num = parseInt(tabId.split("-")[1]);
                if (!isNaN(num) && num > currentMaxPenaltyTabNum) {
                    currentMaxPenaltyTabNum = num;
                }
            }
        });
    }
     console.log("Initialized penalty tab counter max to:", currentMaxPenaltyTabNum);
} catch (e) { console.error("Error initializing penaltyTabCount:", e); }

export function getNextPenaltyTabCount() {
    currentMaxPenaltyTabNum++;
    return currentMaxPenaltyTabNum;
}

// Creates the UI and updates localStorage for a *new* penalty tab
export function createNewPenaltyTab() {
  const tabNumber = getNextPenaltyTabCount();
  const newTabId = `penaltyPane-${tabNumber}`; // e.g., penaltyPane-1
  const newTabName = `Penalty Tab ${tabNumber}`;

  console.log(`Creating new penalty tab: ID=${newTabId}, Name=${newTabName}`);

  // --- Create and Insert Tab Link ---
  const newTabLink = document.createElement("a");
  newTabLink.classList.add("nav-link");
  newTabLink.id = `penalty-tab-${tabNumber}`; // Link ID
  newTabLink.setAttribute("data-toggle", "tab");
  newTabLink.href = `#${newTabId}`; // Target pane ID
  newTabLink.role = "tab";
  newTabLink.setAttribute("aria-controls", newTabId);
  newTabLink.setAttribute("aria-selected", "false");
  newTabLink.textContent = newTabName;
  newTabLink.setAttribute("data-tab", newTabId); // Store pane ID

  const newTabItem = document.createElement("li");
  newTabItem.classList.add("nav-item");
  newTabItem.appendChild(newTabLink);

  // Insert before the '+' button specific to penalties tab
  const addPenaltyTabBtn = document.getElementById("addPenaltyTabBtn");
  if (addPenaltyTabBtn?.parentNode?.parentNode) {
       addPenaltyTabBtn.parentNode.parentNode.insertBefore(newTabItem, addPenaltyTabBtn.parentNode);
  } else {
      console.error("Could not find insertion point for new penalty tab link.");
      return; // Stop if cannot insert link
  }

  // --- Create and Insert Tab Pane ---
  const newTabPane = document.createElement("div");
  newTabPane.classList.add("tab-pane", "fade");
  newTabPane.id = newTabId;
  newTabPane.setAttribute("role", "tabpanel");
  newTabPane.setAttribute("aria-labelledby", `penalty-tab-${tabNumber}`);

  // Inner structure for a new penalty tab pane
  newTabPane.innerHTML = `
    <div class="my-3">
      <button class="btn btn-primary insertPenaltyBtn" data-tab="${newTabId}" title="Add a new penalty to this tab">Insert New Penalty</button>
      </div>
    <table class="table table-dark table-striped">
      <thead>
        <tr>
          <th>Name</th>
          <th>Probability</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody class="penaltiesTable">
        <tr><td colspan="3" class="text-center text-muted">No penalties added to this tab yet.</td></tr>
      </tbody>
    </table>
  `;
  const tabContentContainer = document.getElementById("penaltiesTabContent");
   if(tabContentContainer) {
       tabContentContainer.appendChild(newTabPane);
   } else {
        console.error("Penalty tab content container ('penaltiesTabContent') not found.");
        newTabItem.remove(); // Clean up link if pane fails
        throw new Error("Could not add penalty tab content pane.");
   }

  // --- Update Local Storage ---
  try {
      const tabs = getLocalPenaltyTabs();
      tabs[newTabId] = { name: newTabName };
      setLocalPenaltyTabs(tabs);

      const penalties = getLocalPenalties();
      if (!penalties[newTabId]) { // Initialize entry list
        penalties[newTabId] = [];
        setLocalPenalties(penalties);
      }
      console.log(`Penalty tab ${newTabId} added to localStorage.`);
      // Optional: Activate the new tab
      // Requires jQuery/Bootstrap loaded: $('#' + newTabLink.id).tab('show');
  } catch(e) {
      console.error(`Failed to update localStorage for new penalty tab ${newTabId}:`, e);
      newTabItem.remove();
      newTabPane.remove();
      alert("Error saving new penalty tab locally. Please try again.");
  }
}

// Creates only the UI for a penalty tab based on existing localStorage data
export function createPenaltyTabFromLocalData(tabId, tabName) {
   console.log(`Recreating UI for existing penalty tab: ID=${tabId}, Name=${tabName}`);
   if(!tabId || !tabName) { console.error("createPenaltyTabFromLocalData requires valid tabId and tabName."); return; }

  // Try to extract number for consistent IDing
  const tabNumberMatch = tabId.match(/penaltyPane-(\d+)/);
  const tabNumber = tabNumberMatch ? tabNumberMatch[1] : tabId;

  // --- Create and Insert Tab Link ---
  const newTabLink = document.createElement("a");
  newTabLink.classList.add("nav-link");
  newTabLink.id = `penalty-tab-${tabNumber}`;
  newTabLink.setAttribute("data-toggle", "tab");
  newTabLink.href = `#${tabId}`;
  newTabLink.role = "tab";
  newTabLink.setAttribute("aria-controls", tabId);
  newTabLink.setAttribute("aria-selected", "false");
  newTabLink.textContent = tabName;
  newTabLink.setAttribute("data-tab", tabId);

  const newTabItem = document.createElement("li");
  newTabItem.classList.add("nav-item");
  newTabItem.appendChild(newTabLink);

  const addPenaltyTabBtn = document.getElementById("addPenaltyTabBtn");
   if (addPenaltyTabBtn?.parentNode?.parentNode) {
       addPenaltyTabBtn.parentNode.parentNode.insertBefore(newTabItem, addPenaltyTabBtn.parentNode);
  } else { console.error("Could not find insertion point for loaded penalty tab link."); return; }

  // --- Create and Insert Tab Pane ---
  const newTabPane = document.createElement("div");
  newTabPane.classList.add("tab-pane", "fade");
  newTabPane.id = tabId; // Use the provided ID e.g., penaltyPane-1
  newTabPane.setAttribute("role", "tabpanel");
  newTabPane.setAttribute("aria-labelledby", `penalty-tab-${tabNumber}`);

  newTabPane.innerHTML = `
    <div class="my-3">
      <button class="btn btn-primary insertPenaltyBtn" data-tab="${tabId}" title="Add a new penalty to this tab">Insert New Penalty</button>
       </div>
    <table class="table table-dark table-striped">
      <thead>
        <tr>
          <th>Name</th>
          <th>Probability</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody class="penaltiesTable">
        </tbody>
    </table>
  `;
   const tabContentContainer = document.getElementById("penaltiesTabContent");
   if(tabContentContainer) {
       tabContentContainer.appendChild(newTabPane);
   } else {
        console.error("Penalty tab content container ('penaltiesTabContent') not found when recreating tab.");
        newTabItem.remove(); // Clean up link
   }
}