// localStorageUtils.js

export const LOCAL_TABS_KEY = "localTabs";
export const LOCAL_ENTRIES_KEY = "localEntries";

// Initialize local storage data if not present
export function initLocalStorage() {
  const defaultTabs = { "default": { name: "Default" } };
  const defaultEntries = { "default": [] };

  // For debugging: log what is in local storage
  console.log("Before init, localTabs:", localStorage.getItem(LOCAL_TABS_KEY));
  console.log("Before init, localEntries:", localStorage.getItem(LOCAL_ENTRIES_KEY));

  if (!localStorage.getItem(LOCAL_TABS_KEY)) {
    localStorage.setItem(LOCAL_TABS_KEY, JSON.stringify(defaultTabs));
  }
  if (!localStorage.getItem(LOCAL_ENTRIES_KEY)) {
    localStorage.setItem(LOCAL_ENTRIES_KEY, JSON.stringify(defaultEntries));
  }
  
  // Log after initialization to confirm
  console.log("After init, localTabs:", localStorage.getItem(LOCAL_TABS_KEY));
  console.log("After init, localEntries:", localStorage.getItem(LOCAL_ENTRIES_KEY));
}

export function getLocalTabs() {
  return JSON.parse(localStorage.getItem(LOCAL_TABS_KEY));
}

export function setLocalTabs(tabs) {
  localStorage.setItem(LOCAL_TABS_KEY, JSON.stringify(tabs));
}

export function getLocalEntries() {
  return JSON.parse(localStorage.getItem(LOCAL_ENTRIES_KEY));
}

export function setLocalEntries(entries) {
  localStorage.setItem(LOCAL_ENTRIES_KEY, JSON.stringify(entries));
}

export function addLocalGameEntry(tabId, entry) {
  const entries = getLocalEntries();
  if (!entries[tabId]) entries[tabId] = [];
  entries[tabId].push(entry);
  setLocalEntries(entries);
}

export function updateLocalGameEntry(tabId, entryId, newEntry) {
  const entries = getLocalEntries();
  if (entries[tabId]) {
    entries[tabId] = entries[tabId].map(entry =>
      (String(entry.id) === String(entryId) ? newEntry : entry)
    );
    setLocalEntries(entries);
  }
}

export function removeLocalGameEntry(tabId, entryId) {
  const entries = getLocalEntries();
  if (entries[tabId]) {
    entries[tabId] = entries[tabId].filter(entry => String(entry.id) !== String(entryId));
    setLocalEntries(entries);
  }
}
