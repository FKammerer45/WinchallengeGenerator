// app/static/js/games/localStorageUtils.js

export const LOCAL_TABS_KEY = "localGameTabs"; // Changed key to be more specific
export const LOCAL_ENTRIES_KEY = "localGameEntries"; // Changed key to be more specific

/**
 * Initializes localStorage for game tabs and entries if they don't already exist.
 * Ensures the base keys are present, initialized as empty objects.
 * The actual creation of default tab structures will be handled by games.js.
 */
export function initLocalStorage() {
  try {
    if (localStorage.getItem(LOCAL_TABS_KEY) === null) {
      localStorage.setItem(LOCAL_TABS_KEY, JSON.stringify({})); // Initialize with empty object
      // console.log("Initialized localGameTabs in localStorage with empty object.");
    }
    if (localStorage.getItem(LOCAL_ENTRIES_KEY) === null) {
      localStorage.setItem(LOCAL_ENTRIES_KEY, JSON.stringify({})); // Initialize with empty object
      // console.log("Initialized localGameEntries in localStorage with empty object.");
    }
  } catch (e) {
    console.error("Error initializing game localStorage:", e);
  }
}

/**
 * Retrieves the dictionary of all locally stored game tab definitions.
 * @returns {object} An object where keys are tab IDs and values are tab definition objects (e.g., { name: "Tab Name" }). Returns empty object on error or if not found.
 */
export function getLocalOnlyTabs() {
  try {
    const tabs = localStorage.getItem(LOCAL_TABS_KEY);
    return tabs ? JSON.parse(tabs) : {}; // Return empty object if null
  } catch (e) {
    console.error(`Error parsing ${LOCAL_TABS_KEY} from localStorage:`, e);
    return {}; // Return empty object on error
  }
}

/**
 * Retrieves the dictionary of all locally stored game entries, keyed by tab ID.
 * @returns {object} An object where keys are tab IDs and values are arrays of game entry objects. Returns empty object on error or if not found.
 */
export function getLocalOnlyEntries() {
  try {
    const entries = localStorage.getItem(LOCAL_ENTRIES_KEY);
    return entries ? JSON.parse(entries) : {}; // Return empty object if null
  } catch (e) {
    console.error(`Error parsing ${LOCAL_ENTRIES_KEY} from localStorage:`, e);
    return {}; // Return empty object on error
  }
}

/**
 * Saves the entire dictionary of game tab definitions to localStorage.
 * @param {object} tabs - The complete object of tab definitions to save.
 */
export function setLocalOnlyTabs(tabs) {
  if (typeof tabs !== 'object' || tabs === null) {
    console.error("setLocalOnlyTabs: Invalid 'tabs' argument. Must be an object.");
    return;
  }
  try {
    localStorage.setItem(LOCAL_TABS_KEY, JSON.stringify(tabs));
  } catch (e) {
    console.error(`Error setting ${LOCAL_TABS_KEY} in localStorage:`, e);
  }
}

/**
 * Saves the entire dictionary of game entries (keyed by tab ID) to localStorage.
 * @param {object} entries - The complete object of game entries to save.
 */
export function setLocalOnlyEntries(entries) {
  if (typeof entries !== 'object' || entries === null) {
    console.error("setLocalOnlyEntries: Invalid 'entries' argument. Must be an object.");
    return;
  }
  try {
    localStorage.setItem(LOCAL_ENTRIES_KEY, JSON.stringify(entries));
  } catch (e) {
    console.error(`Error setting ${LOCAL_ENTRIES_KEY} in localStorage:`, e);
  }
}

/**
 * Adds a single game entry to a specific tab in localStorage.
 * @param {string} tabId - The ID of the tab to add the entry to.
 * @param {object} entry - The game entry object to add. It will be assigned a local ID if it doesn't have one.
 */
export function addLocalOnlyGameEntry(tabId, entry) {
  if (!tabId || typeof entry !== 'object' || entry === null) {
    console.error("addLocalOnlyGameEntry: Invalid arguments.");
    return;
  }
  try {
    const allEntries = getLocalOnlyEntries();
    if (!Array.isArray(allEntries[tabId])) {
      allEntries[tabId] = [];
    }
    // Ensure unique ID if adding multiple quickly locally or if ID is missing
    entry.id = entry.id || ("local-g-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9)); // 'g' for game
    allEntries[tabId].push(entry);
    setLocalOnlyEntries(allEntries);
  } catch (e) {
    console.error(`Failed to add local game entry for tab ${tabId}:`, e);
  }
}

/**
 * Updates an existing game entry within a specific tab in localStorage.
 * @param {string} tabId - The ID of the tab containing the entry.
 * @param {string} entryId - The ID of the entry to update.
 * @param {object} newEntryData - The new data for the game entry. The ID from newEntryData will be ignored; entryId is used.
 */
export function updateLocalOnlyGameEntry(tabId, entryId, newEntryData) {
  if (!tabId || !entryId || typeof newEntryData !== 'object' || newEntryData === null) {
    console.error("updateLocalOnlyGameEntry: Invalid arguments.");
    return;
  }
  try {
    const allEntries = getLocalOnlyEntries();
    if (allEntries[tabId] && Array.isArray(allEntries[tabId])) {
      let updated = false;
      const entryIdStr = String(entryId); // Ensure string comparison for ID

      allEntries[tabId] = allEntries[tabId].map(existingEntry => {
        if (String(existingEntry.id) === entryIdStr) {
          updated = true;
          // Merge new data, but ensure the original ID is preserved
          return { ...existingEntry, ...newEntryData, id: entryIdStr };
        }
        return existingEntry;
      });

      if (updated) {
        setLocalOnlyEntries(allEntries);
      } else {
        console.warn(`updateLocalOnlyGameEntry: Entry ID '${entryIdStr}' not found in tab '${tabId}'.`);
      }
    } else {
      console.warn(`updateLocalOnlyGameEntry: No entries found for tab '${tabId}'.`);
    }
  } catch (e) {
    console.error(`Failed to update local game entry for tab ${tabId}, ID ${entryId}:`, e);
  }
}

/**
 * Removes a game entry from a specific tab in localStorage.
 * @param {string} tabId - The ID of the tab from which to remove the entry.
 * @param {string} entryId - The ID of the entry to remove.
 * @returns {boolean} True if an entry was removed, false otherwise.
 */
export function removeLocalOnlyGameEntry(tabId, entryId) {
  if (!tabId || !entryId) {
    console.error("removeLocalOnlyGameEntry: Invalid arguments.");
    return false;
  }
  try {
    const allEntries = getLocalOnlyEntries();
    if (allEntries[tabId] && Array.isArray(allEntries[tabId])) {
      const initialLength = allEntries[tabId].length;
      const entryIdStr = String(entryId); // Ensure string comparison

      allEntries[tabId] = allEntries[tabId].filter(entry => String(entry.id) !== entryIdStr);

      if (allEntries[tabId].length < initialLength) {
        setLocalOnlyEntries(allEntries);
        console.log(`Removed local game entry ${entryIdStr} from tab ${tabId}`);
        return true;
      } else {
        console.warn(`removeLocalOnlyGameEntry: Entry ID '${entryIdStr}' not found in tab '${tabId}'.`);
        return false;
      }
    } else {
      console.warn(`removeLocalOnlyGameEntry: No entries found for tab '${tabId}'.`);
      return false;
    }
  } catch (e) {
    console.error(`Failed to remove local game entry for tab ${tabId}, ID ${entryId}:`, e);
    return false;
  }
}
