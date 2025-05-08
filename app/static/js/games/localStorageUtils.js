// app/static/js/games/localStorageUtils.js

export const LOCAL_TABS_KEY = "localTabs";
export const LOCAL_ENTRIES_KEY = "localEntries";

// Initialize local storage data if not present
export function initLocalStorage() {
  const defaultTabs = { "default": { name: "Default" } };
  const defaultEntries = { "default": [] };
  try {
      if (localStorage.getItem(LOCAL_TABS_KEY) === null) {
        localStorage.setItem(LOCAL_TABS_KEY, JSON.stringify(defaultTabs));
        // console.log("Initialized localTabs in localStorage."); // Keep console logs minimal
      }
      if (localStorage.getItem(LOCAL_ENTRIES_KEY) === null) {
        localStorage.setItem(LOCAL_ENTRIES_KEY, JSON.stringify(defaultEntries));
        // console.log("Initialized localEntries in localStorage.");
      }
  } catch (e) { console.error("Error initializing localStorage:", e); }
}

// --- Getters (for anonymous users or fallback) ---
export function getLocalOnlyTabs() {
    try {
        const tabs = localStorage.getItem(LOCAL_TABS_KEY);
        return tabs ? JSON.parse(tabs) : { "default": { name: "Default" } };
    } catch (e) {
        console.error(`Error parsing ${LOCAL_TABS_KEY} from localStorage:`, e);
        return { "default": { name: "Default" } };
    }
}

export function getLocalOnlyEntries() {
     try {
        const entries = localStorage.getItem(LOCAL_ENTRIES_KEY);
        return entries ? JSON.parse(entries) : { "default": [] };
    } catch (e) {
        console.error(`Error parsing ${LOCAL_ENTRIES_KEY} from localStorage:`, e);
        return { "default": [] };
    }
}

// --- Setters (for anonymous users) ---
export function setLocalOnlyTabs(tabs) {
    if (typeof tabs !== 'object' || tabs === null) return;
    try { localStorage.setItem(LOCAL_TABS_KEY, JSON.stringify(tabs)); }
    catch (e) { console.error(`Error setting ${LOCAL_TABS_KEY} in localStorage:`, e); }
}

export function setLocalOnlyEntries(entries) {
     if (typeof entries !== 'object' || entries === null) return;
    try { localStorage.setItem(LOCAL_ENTRIES_KEY, JSON.stringify(entries)); }
     catch (e) { console.error(`Error setting ${LOCAL_ENTRIES_KEY} in localStorage:`, e); }
}

// --- Entry Manipulation (for anonymous users) ---
export function addLocalOnlyGameEntry(tabId, entry) {
  if (!tabId || typeof entry !== 'object' || entry === null) return;
  try {
      const entries = getLocalOnlyEntries();
      if (!Array.isArray(entries[tabId])) { entries[tabId] = []; }
      // Ensure unique ID if adding multiple quickly locally
      entry.id = entry.id || ("local-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9));
      entries[tabId].push(entry);
      setLocalOnlyEntries(entries);
  } catch (e) { console.error(`Failed to add local game entry for tab ${tabId}:`, e); }
}

export function updateLocalOnlyGameEntry(tabId, entryId, newEntry) {
   if (!tabId || !entryId || typeof newEntry !== 'object' || newEntry === null) return;
   try {
       const entries = getLocalOnlyEntries();
       if (entries[tabId] && Array.isArray(entries[tabId])) {
           let updated = false;
           // Ensure ID consistency
           newEntry.id = entryId;
           entries[tabId] = entries[tabId].map(entry => {
               if (String(entry.id) === String(entryId)) {
                   updated = true;
                   return newEntry;
               }
               return entry;
           });
           if (updated) setLocalOnlyEntries(entries);
           else console.warn(`updateLocalOnlyGameEntry: Entry ID '${entryId}' not found in tab '${tabId}'.`);
       } else { console.warn(`updateLocalOnlyGameEntry: No entries found for tab '${tabId}'.`);}
   } catch (e) { console.error(`Failed to update local game entry for tab ${tabId}, ID ${entryId}:`, e); }
}

export function removeLocalOnlyGameEntry(tabId, entryId) {
    if (!tabId || !entryId) return;
    try {
        const entries = getLocalOnlyEntries();
        if (entries[tabId] && Array.isArray(entries[tabId])) {
            const initialLength = entries[tabId].length;
            entries[tabId] = entries[tabId].filter(entry => String(entry.id) !== String(entryId));
            if (entries[tabId].length < initialLength) {
                setLocalOnlyEntries(entries);
                 console.log(`Removed local entry ${entryId} from tab ${tabId}`);
            } else { console.warn(`removeLocalOnlyGameEntry: Entry ID '${entryId}' not found in tab '${tabId}'.`); }
        } else { console.warn(`removeLocalOnlyGameEntry: No entries found for tab '${tabId}'.`); }
    } catch(e) { console.error(`Failed to remove local game entry for tab ${tabId}, ID ${entryId}:`, e); }
}