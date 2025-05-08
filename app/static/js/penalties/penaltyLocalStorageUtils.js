// penalties/penaltyLocalStorageUtils.js

// --- Use DISTINCT keys ---
export const LOCAL_PENALTY_TABS_KEY = "localPenaltyTabs";
export const LOCAL_PENALTIES_KEY = "localPenalties";
// --- End Key Definition ---

// Initialize local storage data if not present
export function initPenaltiesLocalStorage() {
  const defaultTabs = { "default": { name: "Default" } }; // Default penalty tab
  const defaultPenalties = { "default": [] }; // Default empty penalties list

  try {
      if (localStorage.getItem(LOCAL_PENALTY_TABS_KEY) === null) {
        localStorage.setItem(LOCAL_PENALTY_TABS_KEY, JSON.stringify(defaultTabs));
        // console.log("Initialized localPenaltyTabs in localStorage."); // Less verbose
      }
      if (localStorage.getItem(LOCAL_PENALTIES_KEY) === null) {
        localStorage.setItem(LOCAL_PENALTIES_KEY, JSON.stringify(defaultPenalties));
        // console.log("Initialized localPenalties in localStorage.");
      }
  } catch (e) {
      console.error("Error initializing penalty localStorage:", e);
  }
}

// --- Getters ---
export function getLocalPenaltyTabs() {
    try {
        const tabs = localStorage.getItem(LOCAL_PENALTY_TABS_KEY);
        return tabs ? JSON.parse(tabs) : { "default": { name: "Default" } };
    } catch (e) {
        console.error(`Error parsing ${LOCAL_PENALTY_TABS_KEY} from localStorage:`, e);
        return { "default": { name: "Default" } };
    }
}

export function getLocalPenalties() {
     try {
        const penalties = localStorage.getItem(LOCAL_PENALTIES_KEY);
        return penalties ? JSON.parse(penalties) : { "default": [] };
    } catch (e) {
        console.error(`Error parsing ${LOCAL_PENALTIES_KEY} from localStorage:`, e);
        return { "default": [] };
    }
}

// --- Setters ---
export function setLocalPenaltyTabs(tabs) {
    if (typeof tabs !== 'object' || tabs === null) return;
    try { localStorage.setItem(LOCAL_PENALTY_TABS_KEY, JSON.stringify(tabs)); }
    catch (e) { console.error(`Error setting ${LOCAL_PENALTY_TABS_KEY} in localStorage:`, e); }
}

export function setLocalPenalties(penalties) {
     if (typeof penalties !== 'object' || penalties === null) return;
    try { localStorage.setItem(LOCAL_PENALTIES_KEY, JSON.stringify(penalties)); }
     catch (e) { console.error(`Error setting ${LOCAL_PENALTIES_KEY} in localStorage:`, e); }
}

// --- Entry Manipulation ---
// Use 'p' prefix for penalty variables to avoid potential confusion if merged later
export function addLocalPenalty(tabId, pEntry) {
  if (!tabId || typeof pEntry !== 'object' || pEntry === null) return;
  try {
      const allPenalties = getLocalPenalties();
      if (!Array.isArray(allPenalties[tabId])) { allPenalties[tabId] = []; }
      // Ensure unique ID if adding multiple quickly locally
      pEntry.id = pEntry.id || ("local-p-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9));
      allPenalties[tabId].push(pEntry);
      setLocalPenalties(allPenalties);
  } catch (e) { console.error(`Failed to add local penalty for tab ${tabId}:`, e); }
}

export function updateLocalPenalty(tabId, pEntryId, newPEntry) {
   if (!tabId || !pEntryId || typeof newPEntry !== 'object' || newPEntry === null) return;
   try {
       const allPenalties = getLocalPenalties();
       if (allPenalties[tabId] && Array.isArray(allPenalties[tabId])) {
           let updated = false;
           newPEntry.id = pEntryId; // Ensure ID consistency
           allPenalties[tabId] = allPenalties[tabId].map(p => {
               if (String(p.id) === String(pEntryId)) { updated = true; return newPEntry; }
               return p;
           });
           if (updated) setLocalPenalties(allPenalties);
           else console.warn(`updateLocalPenalty: Penalty ID '${pEntryId}' not found in tab '${tabId}'.`);
       } else { console.warn(`updateLocalPenalty: No penalties found for tab '${tabId}'.`);}
   } catch (e) { console.error(`Failed to update local penalty for tab ${tabId}, ID ${pEntryId}:`, e); }
}

export function removeLocalPenalty(tabId, pEntryId) {
    if (!tabId || !pEntryId) return false; // Return boolean
    try {
        const allPenalties = getLocalPenalties();
        if (allPenalties[tabId] && Array.isArray(allPenalties[tabId])) {
            const initialLength = allPenalties[tabId].length;
            allPenalties[tabId] = allPenalties[tabId].filter(p => String(p.id) !== String(pEntryId));
            if (allPenalties[tabId].length < initialLength) {
                setLocalPenalties(allPenalties);
                console.log(`Removed local penalty ${pEntryId} from tab ${tabId}`);
                return true; // Indicate success
            } else {
                 console.warn(`removeLocalPenalty: Penalty ID '${pEntryId}' not found in tab '${tabId}'.`);
                 return false; // Indicate not found
            }
        } else { console.warn(`removeLocalPenalty: No penalties found for tab '${tabId}'.`); return false; }
    } catch(e) { console.error(`Failed to remove local penalty for tab ${tabId}, ID ${pEntryId}:`, e); return false; }
}