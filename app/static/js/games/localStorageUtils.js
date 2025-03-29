// localStorageUtils.js

export const LOCAL_TABS_KEY = "localTabs";
export const LOCAL_ENTRIES_KEY = "localEntries";

// Initialize local storage data if not present
export function initLocalStorage() {
  const defaultTabs = { "default": { name: "Default" } };
  const defaultEntries = { "default": [] };

  try {
      if (localStorage.getItem(LOCAL_TABS_KEY) === null) {
        localStorage.setItem(LOCAL_TABS_KEY, JSON.stringify(defaultTabs));
        console.log("Initialized localTabs in localStorage.");
      }
      if (localStorage.getItem(LOCAL_ENTRIES_KEY) === null) {
        localStorage.setItem(LOCAL_ENTRIES_KEY, JSON.stringify(defaultEntries));
        console.log("Initialized localEntries in localStorage.");
      }
  } catch (e) {
      console.error("Error initializing localStorage (browser might block it):", e);
      // Optionally alert user that features relying on localStorage might not work
      // alert("Could not initialize local storage. Some features might be unavailable.");
  }
}

export function getLocalTabs() {
    try {
        const tabs = localStorage.getItem(LOCAL_TABS_KEY);
        return tabs ? JSON.parse(tabs) : { "default": { name: "Default" } }; // Return default structure if null/invalid
    } catch (e) {
        console.error(`Error parsing ${LOCAL_TABS_KEY} from localStorage:`, e);
        return { "default": { name: "Default" } }; // Return default on error
    }
}

export function setLocalTabs(tabs) {
    if (typeof tabs !== 'object' || tabs === null) {
        console.error("setLocalTabs: Invalid input, 'tabs' must be an object.");
        return;
    }
    try {
        localStorage.setItem(LOCAL_TABS_KEY, JSON.stringify(tabs));
    } catch (e) {
        console.error(`Error setting ${LOCAL_TABS_KEY} in localStorage:`, e);
        // Consider alerting user if storage quota exceeded
    }
}

export function getLocalEntries() {
     try {
        const entries = localStorage.getItem(LOCAL_ENTRIES_KEY);
        return entries ? JSON.parse(entries) : { "default": [] }; // Return default structure if null/invalid
    } catch (e) {
        console.error(`Error parsing ${LOCAL_ENTRIES_KEY} from localStorage:`, e);
        return { "default": [] }; // Return default on error
    }
}

export function setLocalEntries(entries) {
     if (typeof entries !== 'object' || entries === null) {
        console.error("setLocalEntries: Invalid input, 'entries' must be an object.");
        return;
    }
    try {
        localStorage.setItem(LOCAL_ENTRIES_KEY, JSON.stringify(entries));
     } catch (e) {
        console.error(`Error setting ${LOCAL_ENTRIES_KEY} in localStorage:`, e);
        // Consider alerting user if storage quota exceeded
    }
}

export function addLocalGameEntry(tabId, entry) {
  if (!tabId || typeof entry !== 'object' || entry === null) {
       console.error("addLocalGameEntry: Invalid tabId or entry provided.");
       return;
  }
  try {
      const entries = getLocalEntries(); // Get current entries, handles parsing errors
      if (!Array.isArray(entries[tabId])) { // Ensure the target is an array
          console.warn(`Initializing entry list for tab '${tabId}'`);
          entries[tabId] = [];
      }
      entries[tabId].push(entry); // Add the new entry
      setLocalEntries(entries); // Save back, handles stringify errors
  } catch (e) {
       console.error(`Failed to add local game entry for tab ${tabId}:`, e);
       // Re-throw or alert?
  }
}

export function updateLocalGameEntry(tabId, entryId, newEntry) {
   if (!tabId || !entryId || typeof newEntry !== 'object' || newEntry === null) {
       console.error("updateLocalGameEntry: Invalid tabId, entryId, or newEntry provided.");
       return;
   }
   try {
       const entries = getLocalEntries();
       if (entries[tabId] && Array.isArray(entries[tabId])) {
           let updated = false;
           entries[tabId] = entries[tabId].map(entry => {
               // Compare IDs as strings for robustness
               if (String(entry.id) === String(entryId)) {
                   updated = true;
                   return newEntry; // Replace with the new entry object
               }
               return entry; // Keep the existing entry
           });
           if (updated) {
               setLocalEntries(entries); // Save if an update occurred
           } else {
               console.warn(`updateLocalGameEntry: Entry ID '${entryId}' not found in tab '${tabId}'.`);
           }
       } else {
            console.warn(`updateLocalGameEntry: No entries found for tab '${tabId}'.`);
       }
   } catch (e) {
        console.error(`Failed to update local game entry for tab ${tabId}, ID ${entryId}:`, e);
   }
}

export function removeLocalGameEntry(tabId, entryId) {
    if (!tabId || !entryId) {
       console.error("removeLocalGameEntry: Invalid tabId or entryId provided.");
       return;
   }
    try {
        const entries = getLocalEntries();
        if (entries[tabId] && Array.isArray(entries[tabId])) {
            const initialLength = entries[tabId].length;
            // Filter out the entry with the matching ID
            entries[tabId] = entries[tabId].filter(entry => String(entry.id) !== String(entryId));
            if (entries[tabId].length < initialLength) {
                setLocalEntries(entries); // Save if an entry was removed
            } else {
                 console.warn(`removeLocalGameEntry: Entry ID '${entryId}' not found in tab '${tabId}'.`);
            }
        } else {
             console.warn(`removeLocalGameEntry: No entries found for tab '${tabId}'.`);
        }
    } catch(e) {
         console.error(`Failed to remove local game entry for tab ${tabId}, ID ${entryId}:`, e);
    }
}