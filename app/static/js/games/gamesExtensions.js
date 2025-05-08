// app/static/js/games/gamesExtensions.js

// --- CORRECTED IMPORTS ---
import {
    getLocalOnlyTabs,
    getLocalOnlyEntries,
    setLocalOnlyTabs,
    setLocalOnlyEntries
} from "./localStorageUtils.js";
import { createTabFromLocalData } from "./tabManagement.js"; // Correctly imported now
import { renderGamesForTab } from "./entryManagement.js";
import { confirmModal, showFlash } from "../utils/helpers.js";
import { apiFetch } from "../utils/api.js"; // Import from central util
// --- END CORRECTIONS ---

// --- Autosave Logic (Keep as is from Step 3.2) ---
let autosaveTimeout = null;
let isCurrentlySaving = false;
function debounce(func, wait) {
    let timeout; // Closure variable to hold the timeout ID
  
    // This is the function that will be returned and called
    return function executedFunction(...args) {
      // Define the function to be executed after the delay
      const later = () => {
        clearTimeout(timeout); // Clear the timeout handle
        func.apply(this, args); // Call the original function with correct context and args
      };
  
      // Clear the previous timeout timer (if one exists)
      clearTimeout(timeout);
      // Set a new timeout timer
      timeout = setTimeout(later, wait);
    };
  }
  function getCurrentEntriesFromDOM(tabId) {
    // Read global flag set by games.js/template
    const isLoggedIn = window.isLoggedIn === true;

    if (isLoggedIn) {
        // Logged-in: Read from the in-memory JS state populated from API
        if (window.userTabsData?.entries) { // Check if state exists
            return window.userTabsData.entries[tabId] || []; // Return entries for tab or empty array
        } else {
            // This case shouldn't happen if initial load succeeded, but handle defensively
            console.error("[Autosave] Cannot get current entries: User logged in but window.userTabsData is missing or invalid.");
            showFlash("Error retrieving current tab data. Cannot autosave.", "danger"); // Inform user
            return []; // Return empty to prevent errors
        }
    } else {
        // Anonymous: Read from localStorage using the *LocalOnly* function
        try {
             return getLocalOnlyEntries()[tabId] || []; // Use the correctly named function
        } catch (e) {
             console.error("[Autosave] Error reading local storage entries:", e);
             return [];
        }
    }
}
async function performSave(tabId) { /* ... implementation using apiFetch ... */
     const isLoggedIn = window.isLoggedIn === true; // Use global flag
     if (!isLoggedIn || isCurrentlySaving || !tabId) return;
     if (tabId === 'default' && !window.userTabsData?.entries?.default && !getLocalOnlyEntries()?.default?.length) {
           console.log("[Autosave] Skipping save for default tab as no user-specific or local default data exists yet.");
           return;
     }

     isCurrentlySaving = true;

     try {
         const currentTabs = window.userTabsData?.tabs || getLocalOnlyTabs();
         const currentEntries = getCurrentEntriesFromDOM(tabId); // Reads from state or local storage
         const tabName = currentTabs[tabId]?.name || (tabId === 'default' ? 'Default' : `Tab ${tabId}`);

         if (!tabName) throw new Error(`Could not determine name for tab ${tabId}`);

         const payload = { tabId, tabName, entries: currentEntries };
         const csrfToken = window.csrfToken; // Use global token
         const response = await apiFetch('/api/tabs/save', { method: 'POST', body: payload }, csrfToken);

         if (response.status === 'ok') {
             console.log(`[Autosave] Tab ${tabId} saved successfully.`);
             showFlash("Changes saved ✓", "success", 2000);
             // Update state with potentially normalized data from response if needed
             if (response.saved_tab && window.userTabsData) {
                 window.userTabsData.tabs[response.saved_tab.client_tab_id] = { name: response.saved_tab.tab_name };
                 window.userTabsData.entries[response.saved_tab.client_tab_id] = response.saved_tab.entries;
             }
         } else { throw new Error(response.error || 'Unknown server error during save.'); }
     } catch (error) {
         console.error(`[Autosave] Error saving tab ${tabId}:`, error);
         showFlash(`Error saving changes: ${error.message}`, 'danger', 5000);
     } finally { isCurrentlySaving = false; }
}
const debouncedSave = debounce(performSave, 2000);
export function triggerAutosave(tabId) {
     const isLoggedIn = window.isLoggedIn === true; // Use global flag
     if (!isLoggedIn) return; // Only autosave for logged-in users
     if(!tabId) { console.warn("[Autosave] Trigger called without tabId."); return; }
     console.log(`[Autosave] Triggered for tab ${tabId}. Debouncing...`);
     debouncedSave(tabId);
}
// --- END Autosave Logic ---


// --- MODIFIED: Tab Rename Handler ---
export function attachTabRenameHandler() {
    const container = document.getElementById("gamesTab"); // Target the <ul> element
    if (!container) {
        console.error("Could not find #gamesTab container for rename listener.");
        return;
    }

    let activeLink = null; // Track the link being edited
    let activeId = null; // Track the tabId being edited

    console.log("Attaching dblclick listener to #gamesTab"); // Debug log

    // Event listener for double-clicking a tab link
    container.addEventListener("dblclick", (e) => {
        console.log("Tab dblclick detected. Target:", e.target); // Debug log
        const link = e.target.closest(".nav-link"); // Find the clicked link element

        // Ignore clicks not on a link or on the default tab/add button
        if (!link || link.id === "default-tab" || link.id === 'addTabBtn') {
             if (link && link.id === 'default-tab') {
                 showFlash("The Default tab cannot be renamed.", "info");
             }
             console.log("Ignoring dblclick on non-renameable element."); // Debug log
             return;
        }

        activeLink = link; // Store the link element
        activeId = link.dataset.tab || link.getAttribute("href")?.substring(1); // Get tab ID (e.g., tabPane-3)
        const currentName = link.textContent.trim();

        console.log(`Rename initiated for Tab ID: ${activeId}, Current Name: ${currentName}`); // Debug log

        const renameInput = document.getElementById("renameGameTabInput");
        const renameModal = document.getElementById("renameGameTabModal");

        if (!renameInput || !renameModal) {
            console.error("Rename modal input or modal element itself not found!");
            return;
        }

        // Prefill the input in the modal
        renameInput.value = currentName;

        // Show the Bootstrap modal using jQuery (as Bootstrap 4 JS is used)
        if (typeof $ !== 'undefined' && $.fn.modal) {
             $('#renameGameTabModal').modal('show');
        } else {
             console.error("jQuery or Bootstrap modal function not available.");
             alert("Could not open rename dialog.");
        }
    });

    // Event listener for the rename modal form submission
    const renameForm = document.getElementById("renameGameTabForm");
    if (!renameForm) {
        console.error("Rename modal form (#renameGameTabForm) not found!");
        return;
    }

    renameForm.addEventListener("submit", async (e) => { // Added async
        e.preventDefault();
        const renameInput = document.getElementById("renameGameTabInput");
        const newName = renameInput?.value.trim();
        const currentName = activeLink?.textContent.trim(); // Get current name again for comparison/revert
        const isLoggedIn = window.isLoggedIn === true; // Use global flag

        // Close modal if no valid link/ID stored, or name is empty/unchanged
        if (!activeLink || !activeId || !newName || newName === currentName) {
            if (typeof $ !== 'undefined' && $.fn.modal) $('#renameGameTabModal').modal('hide');
            activeLink = null; activeId = null; // Reset context
            return;
        }

        console.log(`Submitting rename for tab ${activeId} to "${newName}"`);
        if (typeof $ !== 'undefined' && $.fn.modal) $('#renameGameTabModal').modal('hide'); // Hide modal optimistically

        try {
            let currentTabs;
            if (isLoggedIn) {
                // --- Logged In: Update State & Trigger Autosave ---
                currentTabs = window.userTabsData?.tabs;
                if (!currentTabs || !currentTabs[activeId]) throw new Error("Tab data not found in application state.");

                // Update state optimistically
                currentTabs[activeId].name = newName;
                activeLink.textContent = newName; // Update UI link text immediately
                console.log(`Updated tab ${activeId} name in JS state.`);

                triggerAutosave(activeId); // <<< Trigger API save via autosave
                showFlash("Tab renamed. Saving...", "info", 2000); // Indicate save is happening

            } else {
                 // --- Anonymous: Update localStorage ---
                currentTabs = getLocalOnlyTabs() || {}; // Use correct local getter
                if (!currentTabs[activeId]) throw new Error("Local tab not found.");

                currentTabs[activeId].name = newName;
                setLocalOnlyTabs(currentTabs); // Use correct local setter
                activeLink.textContent = newName; // Update UI link text
                console.log(`Updated local tab ${activeId} name in localStorage.`);
                showFlash("Local tab renamed.", "success");
            }
        } catch (err) {
          console.error("Rename failed:", err);
          showFlash(`Failed to rename tab: ${err.message}`, "danger");
          // Revert UI change on error
          if (activeLink && currentName) activeLink.textContent = currentName;
        } finally {
             activeLink = null; activeId = null; // Reset context variables
        }
    }); // End form submit listener
}


// --- MODIFIED: Delete Tab Handler ---
export function attachDeleteTabHandler() {
    const btn = document.getElementById("deleteTabBtn");
    if (!btn) return; // Button only shown for logged-in users

    btn.addEventListener("click", async () => {
        const link = document.querySelector("#gamesTab .nav-link.active"); // Get the active tab link
        if (!link) return showFlash("No active tab found.", "warning");

        const tabId = link.getAttribute("href")?.substring(1); // Get the ID (e.g., "tabPane-3")
        const tabName = link.textContent.trim() || 'this tab';
        const csrfToken = window.csrfToken; // Use global token

        if (!tabId || tabId === 'default') {
            showFlash(tabId === 'default' ? "The Default tab cannot be deleted." : "Could not identify active tab.", "warning");
            return;
        }

        const ok = await confirmModal(`Delete tab “${tabName}”? This cannot be undone.`, "Delete game tab?");
        if (!ok) return;

        btn.disabled = true;
     

        try {
            // API Call (only logged-in users see this button)
            const res = await apiFetch("/api/tabs/delete", {
                method: "POST",
                body: { tabId: tabId } // Send the correct ID
            }, csrfToken);

            if (res.status !== "ok" || res.deleted_tab_id !== tabId) {
                throw new Error(res.error || "Server error during delete.");
            }

            // --- SUCCESS: Update UI Dynamically ---
            console.log(`[Delete Tab] Successfully deleted tab ${tabId} via API.`);

            // 1. Remove from global JS state
            if(window.userTabsData){
               delete window.userTabsData.tabs?.[tabId];
               delete window.userTabsData.entries?.[tabId];
               console.log(`[Delete Tab] Removed ${tabId} from window.userTabsData.`);
            } else {
                // Fallback for safety, though state should exist if logged in
                console.warn("[Delete Tab] window.userTabsData not found for state update.");
            }


            // 2. Remove Tab Link and Pane from DOM
            const tabLinkElement = document.getElementById(link.id); // Get the <a> element by its ID
            const tabListItem = tabLinkElement?.closest('li.nav-item'); // Find the parent <li>
            const tabPaneElement = document.getElementById(tabId); // Get the content pane <div>

            if (tabListItem) {
                tabListItem.remove();
                 console.log(`[Delete Tab] Removed tab link item for ${tabId} from DOM.`);
            } else { console.warn(`[Delete Tab] Could not find tab list item for ${link.id} to remove.`); }

            if (tabPaneElement) {
                tabPaneElement.remove();
                 console.log(`[Delete Tab] Removed tab pane for ${tabId} from DOM.`);
            } else { console.warn(`[Delete Tab] Could not find tab pane for ${tabId} to remove.`); }

            // 3. Activate the 'Default' tab
            const defaultTabLink = document.getElementById('default-tab');
            if (defaultTabLink && typeof $ !== 'undefined' && $.fn.tab) {
                console.log("[Delete Tab] Activating default tab.");
                $(defaultTabLink).tab('show');
            } else {
                 console.warn("[Delete Tab] Could not activate default tab.");
                 // Fallback: Maybe just reload if activating fails? Or do nothing.
                 // location.reload(); // Use reload as fallback if needed
            }

            showFlash(`Tab "${tabName}" deleted successfully.`, "success");
            // *** REMOVED location.reload(); ***

        } catch (e) {
            console.error("Delete tab failed:", e);
            showFlash(`Error deleting tab: ${e.message}`, "danger");
        } finally {
            btn.disabled = false; // Re-enable button
        }
    });
}
export async function loadAndSaveGlobalDefaults() {
    const isLoggedIn = window.isLoggedIn === true;
    const csrfToken = window.csrfToken;

    // Fetch global list from API
    const data = await apiFetch("/api/games/load_defaults");
    if (!Array.isArray(data?.entries)) throw new Error("Invalid default data received from server.");

    // Normalize the received entries
    const globalDefaultEntries = data.entries.map(e => ({
        id: `db-${e.id}`, // Prefix DB ID to avoid clashes with potential local IDs
        game: e.Spiel || "",
        gameMode: e.Spielmodus || "",
        difficulty: e.Schwierigkeit !== undefined ? parseFloat(e.Schwierigkeit).toFixed(1) : '0.0',
        numberOfPlayers: e.Spieleranzahl !== undefined ? parseInt(e.Spieleranzahl) : 1,
        weight: 1.0 // Default weight
    }));

    if (isLoggedIn) {
        console.log("[Load Defaults] Saving global defaults as user's 'default' tab via API...");
        const payload = { tabId: 'default', tabName: 'Default', entries: globalDefaultEntries };
        const saveResponse = await apiFetch('/api/tabs/save', { method: 'POST', body: payload }, csrfToken);
        if (saveResponse.status !== 'ok') throw new Error(saveResponse.error || "Failed to save defaults to user account.");

        // Update global JS state
        if(window.userTabsData) {
           window.userTabsData.tabs['default'] = { name: "Default" };
           window.userTabsData.entries['default'] = globalDefaultEntries;
        }
    } else {
        console.log("[Load Defaults] Saving global defaults to localStorage...");
        const entries = getLocalOnlyEntries() || { default: [] };
        entries.default = globalDefaultEntries;
        setLocalOnlyEntries(entries);
    }

    // Refresh UI table for the default tab
    renderGamesForTab("default");
    // Return true or data if needed elsewhere, otherwise just complete
    return true;
}

// --- MODIFIED: Load Default Entries Handler ---
// (Logic from Step 4 seems mostly correct, ensure renamed local utils are used)
export function attachLoadDefaultEntriesHandler() {
    const loadBtn = document.getElementById("loadDefaultEntriesBtn");
    const okBtn = document.getElementById("confirmLoadDefaultBtn");
    if (!loadBtn || !okBtn) return;

    loadBtn.addEventListener("click", () => {
        const isLoggedIn = window.isLoggedIn === true;
        const message = isLoggedIn
            ? "Load global defaults? This will overwrite your personal 'Default' tab saved to your account."
            : "Load global defaults? This will override entries currently in your local 'Default' tab.";
        document.getElementById('confirmLoadDefaultModal').querySelector('.modal-body').textContent = message;
        // Use jQuery to show modal if available (assuming Bootstrap 4/5 JS)
        if (typeof $ !== 'undefined' && $.fn.modal) {
            $('#confirmLoadDefaultModal').modal("show");
        } else {
            // Fallback or error if jQuery/Bootstrap JS not loaded
            console.error("Cannot show modal: jQuery or Bootstrap modal component not found.");
            alert("Modal functionality not available.");
        }
    });

    okBtn.addEventListener("click", async () => {
        if (typeof $ !== 'undefined' && $.fn.modal) {
            $('#confirmLoadDefaultModal').modal("hide");
        }
        loadBtn.disabled = okBtn.disabled = true;

        try {
            // *** Call the NEW exported function ***
            await loadAndSaveGlobalDefaults();
            showFlash("Global default entries loaded into 'Default' tab.", "success");
        } catch (e) {
            console.error("Load defaults failed:", e);
            showFlash(`Error loading default entries: ${e.message}`, "danger");
        } finally {
            loadBtn.disabled = okBtn.disabled = false;
        }
    });
}

