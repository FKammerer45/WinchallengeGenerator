// penalties/penaltyLocalStorageUtils.js

// Define unique keys for penalty data in localStorage
export const LOCAL_PENALTY_TABS_KEY = "localPenaltyTabs";
export const LOCAL_PENALTIES_KEY = "localPenalties";

// Initialize local storage data if not present
export function initPenaltiesLocalStorage() {
  const defaultTabs = { "default": { name: "Default" } }; // Default penalty tab
  const defaultPenalties = { "default": [] }; // Default empty penalties list

  try {
      if (localStorage.getItem(LOCAL_PENALTY_TABS_KEY) === null) {
        localStorage.setItem(LOCAL_PENALTY_TABS_KEY, JSON.stringify(defaultTabs));
        console.log("Initialized localPenaltyTabs in localStorage.");
      }
      if (localStorage.getItem(LOCAL_PENALTIES_KEY) === null) {
        localStorage.setItem(LOCAL_PENALTIES_KEY, JSON.stringify(defaultPenalties));
        console.log("Initialized localPenalties in localStorage.");
      }
  } catch (e) {
      console.error("Error initializing penalty localStorage:", e);
  }
}

// --- Getters ---
export function getLocalPenaltyTabs() {
    try {
        const tabs = localStorage.getItem(LOCAL_PENALTY_TABS_KEY);
        // Provide a default structure if storage is empty or invalid
        return tabs ? JSON.parse(tabs) : { "default": { name: "Default" } };
    } catch (e) {
        console.error(`Error parsing ${LOCAL_PENALTY_TABS_KEY} from localStorage:`, e);
        return { "default": { name: "Default" } }; // Return default on error
    }
}

export function getLocalPenalties() {
     try {
        const penalties = localStorage.getItem(LOCAL_PENALTIES_KEY);
         // Provide a default structure if storage is empty or invalid
        return penalties ? JSON.parse(penalties) : { "default": [] };
    } catch (e) {
        console.error(`Error parsing ${LOCAL_PENALTIES_KEY} from localStorage:`, e);
        return { "default": [] }; // Return default on error
    }
}

// --- Setters ---
export function setLocalPenaltyTabs(tabs) {
    if (typeof tabs !== 'object' || tabs === null) {
        console.error("setLocalPenaltyTabs: Invalid input, 'tabs' must be an object.");
        return;
    }
    try {
        localStorage.setItem(LOCAL_PENALTY_TABS_KEY, JSON.stringify(tabs));
    } catch (e) {
        console.error(`Error setting ${LOCAL_PENALTY_TABS_KEY} in localStorage:`, e);
    }
}

export function setLocalPenalties(penalties) {
     if (typeof penalties !== 'object' || penalties === null) {
        console.error("setLocalPenalties: Invalid input, 'penalties' must be an object.");
        return;
    }
    try {
        localStorage.setItem(LOCAL_PENALTIES_KEY, JSON.stringify(penalties));
     } catch (e) {
        console.error(`Error setting ${LOCAL_PENALTIES_KEY} in localStorage:`, e);
    }
}

// --- Entry Manipulation ---
export function addLocalPenalty(tabId, penalty) {
  if (!tabId || typeof penalty !== 'object' || penalty === null) {
       console.error("addLocalPenalty: Invalid tabId or penalty provided.");
       return;
  }
  try {
      const allPenalties = getLocalPenalties();
      if (!Array.isArray(allPenalties[tabId])) {
          console.warn(`Initializing penalty list for tab '${tabId}'`);
          allPenalties[tabId] = [];
      }
      allPenalties[tabId].push(penalty);
      setLocalPenalties(allPenalties);
  } catch (e) {
       console.error(`Failed to add local penalty for tab ${tabId}:`, e);
  }
}

export function updateLocalPenalty(tabId, penaltyId, newPenalty) {
   if (!tabId || !penaltyId || typeof newPenalty !== 'object' || newPenalty === null) {
       console.error("updateLocalPenalty: Invalid tabId, penaltyId, or newPenalty provided.");
       return;
   }
   try {
       const allPenalties = getLocalPenalties();
       if (allPenalties[tabId] && Array.isArray(allPenalties[tabId])) {
           let updated = false;
           allPenalties[tabId] = allPenalties[tabId].map(p => {
               if (String(p.id) === String(penaltyId)) {
                   updated = true;
                   return newPenalty; // Replace
               }
               return p;
           });
           if (updated) {
               setLocalPenalties(allPenalties);
           } else {
               console.warn(`updateLocalPenalty: Penalty ID '${penaltyId}' not found in tab '${tabId}'.`);
           }
       } else {
            console.warn(`updateLocalPenalty: No penalties found for tab '${tabId}'.`);
       }
   } catch (e) {
        console.error(`Failed to update local penalty for tab ${tabId}, ID ${penaltyId}:`, e);
   }
}

export function removeLocalPenalty(tabId, penaltyId) {
    if (!tabId || !penaltyId) {
       console.error("removeLocalPenalty: Invalid tabId or penaltyId provided.");
       return;
   }
    try {
        const allPenalties = getLocalPenalties();
        if (allPenalties[tabId] && Array.isArray(allPenalties[tabId])) {
            const initialLength = allPenalties[tabId].length;
            allPenalties[tabId] = allPenalties[tabId].filter(p => String(p.id) !== String(penaltyId));
            if (allPenalties[tabId].length < initialLength) {
                setLocalPenalties(allPenalties);
            } else {
                 console.warn(`removeLocalPenalty: Penalty ID '${penaltyId}' not found in tab '${tabId}'.`);
            }
        } else {
             console.warn(`removeLocalPenalty: No penalties found for tab '${tabId}'.`);
        }
    } catch(e) {
         console.error(`Failed to remove local penalty for tab ${tabId}, ID ${penaltyId}:`, e);
    }
}