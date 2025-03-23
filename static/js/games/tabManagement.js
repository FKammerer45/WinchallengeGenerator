// tabManagement.js
import { getLocalTabs, setLocalTabs, getLocalEntries, setLocalEntries } from "./localStorageUtils.js";

export let tabCount = 1;

export function createNewTab() {
  tabCount++;
  const newTabId = `tabPane-${tabCount}`;
  const newTabName = `Tab ${tabCount}`;

  // Create tab navigation link
  const newTabLink = document.createElement("a");
  newTabLink.classList.add("nav-link");
  newTabLink.id = `tab-${tabCount}`;
  newTabLink.setAttribute("data-toggle", "tab");
  newTabLink.href = `#${newTabId}`;
  newTabLink.role = "tab";
  newTabLink.setAttribute("aria-controls", newTabId);
  newTabLink.setAttribute("aria-selected", "false");
  newTabLink.textContent = newTabName;
  newTabLink.setAttribute("data-tab", newTabId);

  // Create tab list item
  const newTabItem = document.createElement("li");
  newTabItem.classList.add("nav-item");
  newTabItem.appendChild(newTabLink);

  // Insert new tab before the "+" button
  const addTabBtn = document.getElementById("addTabBtn");
  const addBtnParent = addTabBtn.parentNode;
  addBtnParent.parentNode.insertBefore(newTabItem, addBtnParent);

  // Create new tab pane for game entries
  const newTabPane = document.createElement("div");
  newTabPane.classList.add("tab-pane", "fade");
  newTabPane.id = newTabId;
  newTabPane.setAttribute("role", "tabpanel");
  newTabPane.setAttribute("aria-labelledby", `tab-${tabCount}`);

  // Insert an "Insert" button and table for game entries
  newTabPane.innerHTML = `
    <div class="my-3">
      <button class="btn btn-primary insertGameBtn" data-tab="${newTabId}">Insert</button>
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
        <!-- New entries will be inserted here -->
      </tbody>
    </table>
  `;
  document.getElementById("gamesTabContent").appendChild(newTabPane);

  // Save the new tab in local storage
  const tabs = getLocalTabs();
  tabs[newTabId] = { name: newTabName };
  setLocalTabs(tabs);

  // Initialize entries for this new tab if not present
  const entries = getLocalEntries();
  if (!entries[newTabId]) {
    entries[newTabId] = [];
    setLocalEntries(entries);
  }
}

export function createTabFromLocalData(tabId, tabName) {
  // Create tab navigation link
  const newTabLink = document.createElement("a");
  newTabLink.classList.add("nav-link");
  // Extract a number from tabId if possible (assumes format "tabPane-X")
  const tabNumber = tabId.split("-")[1] || tabCount;
  newTabLink.id = `tab-${tabNumber}`;
  newTabLink.setAttribute("data-toggle", "tab");
  newTabLink.href = `#${tabId}`;
  newTabLink.role = "tab";
  newTabLink.setAttribute("aria-controls", tabId);
  newTabLink.setAttribute("aria-selected", "false");
  newTabLink.textContent = tabName;
  newTabLink.setAttribute("data-tab", tabId);

  // Create tab list item
  const newTabItem = document.createElement("li");
  newTabItem.classList.add("nav-item");
  newTabItem.appendChild(newTabLink);

  // Insert new tab before the "+" button
  const addTabBtn = document.getElementById("addTabBtn");
  const addBtnParent = addTabBtn.parentNode;
  addBtnParent.parentNode.insertBefore(newTabItem, addBtnParent);

  // Create new tab pane
  const newTabPane = document.createElement("div");
  newTabPane.classList.add("tab-pane", "fade");
  newTabPane.id = tabId;
  newTabPane.setAttribute("role", "tabpanel");
  newTabPane.setAttribute("aria-labelledby", `tab-${tabNumber}`);

  // Insert an "Insert" button and table for game entries
  newTabPane.innerHTML = `
    <div class="my-3">
      <button class="btn btn-primary insertGameBtn" data-tab="${tabId}">Insert</button>
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
        <!-- New entries will be inserted here -->
      </tbody>
    </table>
  `;
  document.getElementById("gamesTabContent").appendChild(newTabPane);
}
