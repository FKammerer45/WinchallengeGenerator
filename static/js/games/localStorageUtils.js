// localStorageUtils.js

export const LOCAL_TABS_KEY = "localTabs";
export const LOCAL_ENTRIES_KEY = "localEntries";

// Initialize local storage data if not present
export function initLocalStorage() {
  const defaultTabs = { "default": { name: "Default" } };
  const defaultEntries = { "default": [] };



  if (!localStorage.getItem(LOCAL_TABS_KEY)) {
    localStorage.setItem(LOCAL_TABS_KEY, JSON.stringify(defaultTabs));
  }
  if (!localStorage.getItem(LOCAL_ENTRIES_KEY)) {
    localStorage.setItem(LOCAL_ENTRIES_KEY, JSON.stringify(defaultEntries));
  }
  

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
