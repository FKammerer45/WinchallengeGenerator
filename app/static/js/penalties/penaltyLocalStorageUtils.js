// app/static/js/penalties/penaltyLocalStorageUtils.js

export const LOCAL_PENALTY_TABS_KEY = "localPenaltyTabs";
export const LOCAL_PENALTY_ENTRIES_KEY = "localPenaltyEntries";

/**
 * Initializes localStorage for penalty tabs and entries if they don't already exist.
 */
export function initLocalStorage() {
  try {
    if (localStorage.getItem(LOCAL_PENALTY_TABS_KEY) === null) {
      localStorage.setItem(LOCAL_PENALTY_TABS_KEY, JSON.stringify({}));
      // console.log("Initialized localPenaltyTabs in localStorage.");
    }
    if (localStorage.getItem(LOCAL_PENALTY_ENTRIES_KEY) === null) {
      localStorage.setItem(LOCAL_PENALTY_ENTRIES_KEY, JSON.stringify({}));
      // console.log("Initialized localPenaltyEntries in localStorage.");
    }
  } catch (e) {
    console.error("Error initializing penalty localStorage:", e);
  }
}

/**
 * Retrieves the dictionary of all locally stored penalty tab definitions.
 * @returns {object} An object where keys are tab IDs and values are tab definition objects.
 */
export function getLocalOnlyTabs() {
  try {
    const tabs = localStorage.getItem(LOCAL_PENALTY_TABS_KEY);
    return tabs ? JSON.parse(tabs) : {};
  } catch (e) {
    console.error("Error parsing %s from localStorage:", LOCAL_PENALTY_TABS_KEY, e);
    return {};
  }
}

/**
 * Retrieves the dictionary of all locally stored penalty entries, keyed by tab ID.
 * @returns {object} An object where keys are tab IDs and values are arrays of penalty entry objects.
 */
export function getLocalOnlyEntries() {
  try {
    const entries = localStorage.getItem(LOCAL_PENALTY_ENTRIES_KEY);
    return entries ? JSON.parse(entries) : {};
  } catch (e) {
    console.error("Error parsing %s from localStorage:", LOCAL_PENALTY_ENTRIES_KEY, e);
    return {};
  }
}

/**
 * Saves the entire dictionary of penalty tab definitions to localStorage.
 * @param {object} tabs - The complete object of tab definitions to save.
 */
export function setLocalOnlyTabs(tabs) {
  if (typeof tabs !== 'object' || tabs === null) {
    console.error("setLocalOnlyTabs (Penalties): Invalid 'tabs' argument. Must be an object.");
    return;
  }
  try {
    localStorage.setItem(LOCAL_PENALTY_TABS_KEY, JSON.stringify(tabs));
  } catch (e) {
    console.error("Error setting %s in localStorage:", LOCAL_PENALTY_TABS_KEY, e);
  }
}

/**
 * Saves the entire dictionary of penalty entries (keyed by tab ID) to localStorage.
 * @param {object} entries - The complete object of penalty entries to save.
 */
export function setLocalOnlyEntries(entries) {
  if (typeof entries !== 'object' || entries === null) {
    console.error("setLocalOnlyEntries (Penalties): Invalid 'entries' argument. Must be an object.");
    return;
  }
  try {
    localStorage.setItem(LOCAL_PENALTY_ENTRIES_KEY, JSON.stringify(entries));
  } catch (e) {
    console.error("Error setting %s in localStorage:", LOCAL_PENALTY_ENTRIES_KEY, e);
  }
}

/**
 * Adds a single penalty entry to a specific tab in localStorage.
 * @param {string} tabId - The ID of the tab to add the entry to.
 * @param {object} entry - The penalty entry object to add. It will be assigned a local ID if it doesn't have one.
 */
export function addLocalOnlyPenaltyEntry(tabId, entry) {
  if (!tabId || typeof entry !== 'object' || entry === null) {
    console.error("addLocalOnlyPenaltyEntry: Invalid arguments.");
    return;
  }
  try {
    const allEntries = getLocalOnlyEntries();
    if (!Array.isArray(allEntries[tabId])) {
      allEntries[tabId] = [];
    }
    // Ensure unique ID if adding multiple quickly locally or if ID is missing
    entry.id = entry.id || ("local-p-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9)); // 'p' for penalty
    allEntries[tabId].push(entry);
    setLocalOnlyEntries(allEntries);
  } catch (e) {
    console.error("Failed to add local penalty entry for tab %s:", tabId, e);
  }
}

/**
 * Updates an existing penalty entry within a specific tab in localStorage.
 * @param {string} tabId - The ID of the tab containing the entry.
 * @param {string} entryId - The ID of the entry to update.
 * @param {object} newEntryData - The new data for the penalty entry. The ID from newEntryData will be ignored; entryId is used.
 */
export function updateLocalOnlyPenaltyEntry(tabId, entryId, newEntryData) {
  if (!tabId || !entryId || typeof newEntryData !== 'object' || newEntryData === null) {
    console.error("updateLocalOnlyPenaltyEntry: Invalid arguments.");
    return;
  }
  try {
    const allEntries = getLocalOnlyEntries();
    if (allEntries[tabId] && Array.isArray(allEntries[tabId])) {
      let updated = false;
      const entryIdStr = String(entryId);

      allEntries[tabId] = allEntries[tabId].map(existingEntry => {
        if (String(existingEntry.id) === entryIdStr) {
          updated = true;
          return { ...existingEntry, ...newEntryData, id: entryIdStr };
        }
        return existingEntry;
      });

      if (updated) {
        setLocalOnlyEntries(allEntries);
      } else {
        console.warn(`updateLocalOnlyPenaltyEntry: Entry ID '${entryIdStr}' not found in tab '${tabId}'.`);
      }
    } else {
        console.warn(`updateLocalOnlyPenaltyEntry: No entries found for tab '${tabId}'.`);
    }
  } catch (e) {
    console.error("Failed to update local penalty entry for tab %s, ID %s:", tabId, entryId, e);
  }
}

/**
 * Removes a penalty entry from a specific tab in localStorage.
 * @param {string} tabId - The ID of the tab from which to remove the entry.
 * @param {string} entryId - The ID of the entry to remove.
 * @returns {boolean} True if an entry was removed, false otherwise.
 */
export function removeLocalOnlyPenaltyEntry(tabId, entryId) {
  if (!tabId || !entryId) {
    console.error("removeLocalOnlyPenaltyEntry: Invalid arguments.");
    return false;
  }
  try {
    const allEntries = getLocalOnlyEntries();
    if (allEntries[tabId] && Array.isArray(allEntries[tabId])) {
      const initialLength = allEntries[tabId].length;
      const entryIdStr = String(entryId);

      allEntries[tabId] = allEntries[tabId].filter(entry => String(entry.id) !== entryIdStr);

      if (allEntries[tabId].length < initialLength) {
        setLocalOnlyEntries(allEntries);
        console.log(`Removed local penalty entry ${entryIdStr} from tab ${tabId}`);
        return true;
      } else {
        console.warn(`removeLocalOnlyPenaltyEntry: Entry ID '${entryIdStr}' not found in tab '${tabId}'.`);
        return false;
      }
    } else {
        console.warn(`removeLocalOnlyPenaltyEntry: No entries found for tab '${tabId}'.`);
        return false;
    }
  } catch (e) {
    console.error("Failed to remove local penalty entry for tab %s, ID %s:", tabId, entryId, e);
    return false;
  }
}
