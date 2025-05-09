// app/static/js/games/games.js

// Keep existing imports
import {
    getLocalOnlyTabs, getLocalOnlyEntries, initLocalStorage
    // removeLocalOnlyGameEntry is only used inside entryManagement now
} from "./localStorageUtils.js";
import { createNewTab, createTabFromLocalData, getNextTabIdNumber} from "./tabManagement.js";
// Import entry management handlers including delete
import { renderGamesForTab, handleSaveNewGame, handleUpdateGame, handleDeleteSingleMode } from "./entryManagement.js";
// Import extension handlers
import {
    attachTabRenameHandler,
    attachLoadDefaultEntriesHandler,
    attachDeleteTabHandler, // Keep this
    triggerAutosave // Keep this
} from "./gamesExtensions.js";
// Import helpers and API fetch
import { escapeHtml, showError, confirmModal, showFlash } from "../utils/helpers.js";
import { apiFetch } from "../utils/api.js";

// --- Global variable to store loaded data for logged-in users ---
window.userTabsData = { tabs: {}, entries: {} };
let apiLoadFailed = false;

async function handleDuplicateTab() {
    if (!isLoggedIn) { // Should be caught by button visibility, but double-check
        showFlash("Login required to duplicate tabs.", "warning");
        return;
    }

    const duplicateBtn = document.getElementById('duplicateTabBtn');
    const activeLink = document.querySelector("#gamesTab .nav-link.active");
    if (!activeLink) return showFlash("No active tab selected to duplicate.", "warning");

    const sourceTabId = activeLink.getAttribute("href")?.substring(1);
    const sourceTabName = activeLink.textContent.trim();

    if (!sourceTabId) return showFlash("Could not identify the active tab.", "danger");
   

    // --- ADD MAX TAB CHECK HERE ---
    const MAX_CUSTOM_TABS = 5; // Define the limit
    const currentTabs = window.userTabsData?.tabs || {}; // Read from state
    const customTabCount = Object.keys(currentTabs).filter(id => id !== 'default').length;

    if (customTabCount >= MAX_CUSTOM_TABS) {
        showFlash(`Cannot duplicate: You have reached the maximum limit of ${MAX_CUSTOM_TABS} custom tabs.`, "warning");
        return; // Stop before creating UI or doing anything else
    }
    // --- END MAX TAB CHECK ---

    console.log(`Duplicating tab: ${sourceTabName} (${sourceTabId})`);
    duplicateBtn.disabled = true; // Disable button during operation

    // --- Keep references for potential cleanup ---
    let newTabItem = null;
    let newTabPane = null;
    // ---

    try {
        // 1. Get source entries (from JS state for logged-in)
        const sourceEntries = window.userTabsData?.entries?.[sourceTabId];
        if (!Array.isArray(sourceEntries)) {
            throw new Error("Could not retrieve entries for the source tab.");
        }
        const copiedEntries = sourceEntries.map(entry => ({
             ...entry,
             id: "local-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9)
        }));

        // 2. Find unique name for the new tab
        let newTabName = `${sourceTabName} Copy`;
        let copyNum = 2;
        // Re-fetch currentTabs names in case something changed slightly, although unlikely here
        const existingNames = Object.values(window.userTabsData?.tabs || {}).map(tab => tab.name);
        while (existingNames.includes(newTabName)) {
            newTabName = `${sourceTabName} Copy (${copyNum})`;
            copyNum++;
        }

        // 3. Get unique ID for the new tab
        // Re-initialize the counter based on current state before getting next ID
        // (import initializeMaxTabIdNum if not already - assumes it's exported from tabManagement.js)
        // initializeMaxTabIdNum(); // You might need to import this if it's not global/accessible
        const newTabIdNumber = getNextTabIdNumber(); // Use the renamed ID generator
        const newTabId = `tabPane-${newTabIdNumber}`;
        const linkId = `tab-${newTabIdNumber}`;

        // 4. Create UI Elements (Now that limit check passed)
         const newTabLink = document.createElement("a");
         newTabLink.className = "nav-link";
         newTabLink.id = linkId;
         newTabLink.setAttribute("data-toggle", "tab");
         newTabLink.href = `#${newTabId}`;
         newTabLink.role = "tab";
         newTabLink.setAttribute("aria-controls", newTabId);
         newTabLink.setAttribute("aria-selected", "false");
         newTabLink.textContent = newTabName;
         newTabLink.setAttribute("data-tab", newTabId);

         newTabItem = document.createElement("li"); // Assign to variable for cleanup
         newTabItem.className = "nav-item";
         newTabItem.appendChild(newTabLink);

         const addTabBtn = document.getElementById("addTabBtn");
         addTabBtn?.parentNode?.parentNode?.insertBefore(newTabItem, addTabBtn.parentNode);

         newTabPane = document.createElement("div"); // Assign to variable for cleanup
         newTabPane.className = "tab-pane fade";
         newTabPane.id = newTabId;
         newTabPane.setAttribute("role", "tabpanel");
         newTabPane.setAttribute("aria-labelledby", linkId);
         newTabPane.innerHTML = `
           <div class="d-flex justify-content-start my-3 flex-wrap gap-2">
               <button class="btn btn-primary insertGameBtn" data-tab="${newTabId}" title="Add new entry">Insert New Entry</button>
           </div>
           <div class="table-responsive">
               <table class="table table-hover table-sm config-table mb-0">
                   <thead> <tr> <th>Game</th> <th>Game Mode</th> <th>Difficulty</th> <th>Players</th> </tr> </thead>
                   <tbody class="gamesTable"></tbody>
               </table>
           </div>`;
         document.getElementById("gamesTabContent")?.appendChild(newTabPane);
         // --- End UI Element Creation ---


        // 5. Save New Tab Data (API call for logged-in)
        console.log(`Saving duplicated tab ${newTabId} with name "${newTabName}" via API...`);
        const payload = {
            tabId: newTabId,
            tabName: newTabName,
            entries: copiedEntries
        };
        // Backend check still exists, but this API call should succeed if frontend check passed.
        const response = await apiFetch('/api/tabs/save', { method: 'POST', body: payload }, csrfToken);
        if (response.status !== 'ok') {
             // If save fails *despite* frontend check (e.g., race condition, server issue)
             // attempt to remove the UI elements we just added
             throw new Error(response.error || "Failed to save duplicated tab data.");
        }

        // 6. Update global JS state
         if(window.userTabsData) {
             window.userTabsData.tabs[newTabId] = { name: newTabName };
             window.userTabsData.entries[newTabId] = copiedEntries;
             console.log(`Duplicated tab ${newTabId} added to JS state.`);
         }

        // 7. Render entries in the new tab pane
        renderGamesForTab(newTabId);

        // 8. Activate the new tab
         if (typeof $ !== 'undefined' && $.fn.tab) { $(newTabLink).tab('show'); }

        showFlash(`Tab "${sourceTabName}" duplicated successfully as "${newTabName}".`, "success");

    } catch (error) {
        console.error("Error duplicating tab:", error);
        showFlash(`Duplication failed: ${error.message}`, "danger");
        // --- Cleanup UI on error ---
        if (newTabItem) newTabItem.remove();
        if (newTabPane) newTabPane.remove();
        // --- End Cleanup ---
    } finally {
        if(duplicateBtn) duplicateBtn.disabled = false; // Re-enable button
    }
}

async function fetchAndRenderGlobalDefaults() {
    console.log("Fetching global default entries...");
    try {
        const data = await apiFetch("/api/games/load_defaults"); // Fetch global list
        if (!Array.isArray(data.entries)) throw new Error("Invalid global default data structure.");

        const globalDefaultEntries = data.entries.map(e => ({
            id: e.id, game: e.Spiel || "", gameMode: e.Spielmodus || "",
            difficulty: e.Schwierigkeit !== undefined ? parseFloat(e.Schwierigkeit).toFixed(1) : '0.0',
            numberOfPlayers: e.Spieleranzahl !== undefined ? parseInt(e.Spieleranzahl) : 1,
            tabName: "Default", weight: 1.0
        }));

        // Update state for default tab (if logged in)
        if (isLoggedIn && window.userTabsData) {
             window.userTabsData.tabs['default'] = { name: "Default" }; // Ensure tab definition exists
             window.userTabsData.entries['default'] = globalDefaultEntries;
             console.log("Populated state with global defaults for 'default' tab.");
              // --- OPTIONAL: Automatically save these global defaults as user's first default ---
             // This makes the behavior seamless - they load the page, see global defaults,
             // and those become their initial saved default state automatically.
             console.log("Attempting to auto-save global defaults as user's initial default tab...");
             await apiFetch('/api/tabs/save', {
                 method: 'POST',
                 body: { tabId: 'default', tabName: 'Default', entries: globalDefaultEntries }
             }, csrfToken); // Use global csrfToken
             console.log("Auto-save of initial default tab attempted.");
             // No need to triggerAutosave here, as we just saved.
             // --- END OPTIONAL ---
        } else if (!isLoggedIn) {
            // Update local storage for anonymous user
             const entries = getLocalOnlyEntries();
             entries.default = globalDefaultEntries;
             setLocalOnlyEntries(entries);
        }

        // Render the default tab with these entries
        renderGamesForTab("default");
        return true; // Indicate success

    } catch (error) {
        console.error("Error fetching or processing global defaults:", error);
        showFlash(`Could not load global default games: ${error.message}`, "warning");
         // Render default tab as empty if loading fails
         renderGamesForTab("default");
         return false; // Indicate failure
    }
}

export async function loadUserTabsFromAPI() {
    console.log("[Load API Tabs] Attempting to load user game tabs..."); // Game-specific log
    const loadingPlaceholder = document.getElementById('loadingTabsPlaceholder');
    const tabList = document.getElementById('gamesTab'); // Use 'gamesTab' for games

    // --- UI Cleanup (More Robust) ---
    if(loadingPlaceholder) loadingPlaceholder.style.display = 'block';

    if (tabList) {
        const itemsToRemove = [];
        // Iterate over all nav-items
        tabList.querySelectorAll('.nav-item').forEach(item => {
            const link = item.querySelector('a.nav-link');
            // Remove if it's not the default tab AND not the add tab button
            if (link && link.id !== 'default-tab' && link.id !== 'addTabBtn') {
                itemsToRemove.push(item);
            }
        });
        itemsToRemove.forEach(item => item.remove());
        console.log(`[Load API Tabs] Cleared ${itemsToRemove.length} existing custom tab links for games.`);
    }

    const tabContent = document.getElementById('gamesTabContent'); // Use 'gamesTabContent'
    if (tabContent) {
         const panesToRemove = tabContent.querySelectorAll('.tab-pane:not(#default)');
         panesToRemove.forEach(pane => pane.remove());
         console.log(`[Load API Tabs] Cleared custom tab panes for games.`);
    }
    // --- End UI Cleanup ---

    try {
        const data = await apiFetch('/api/tabs/load'); // Game tabs endpoint
        console.log("[Load API Tabs] Raw API Response (Games):", JSON.stringify(data, null, 2));
        if (typeof data !== 'object' || data === null) throw new Error("Invalid data format from game tabs API.");

        window.userTabsData = { tabs: {}, entries: {} }; // Reset game-specific state
        console.log("[Load API Tabs] Initialized window.userTabsData for games.");

        let hasUserDefault = false;
        let firstTabId = 'default';

        const sortedTabIds = Object.keys(data).sort((a, b) => {
             if (a === 'default') return -1; if (b === 'default') return 1;
             const numA = parseInt(a.split('-')[1] || '0');
             const numB = parseInt(b.split('-')[1] || '0');
             return numA - numB;
        });
        console.log("[Load API Tabs] Processing sortedTabIds (Games):", sortedTabIds);

        for (const tabId of sortedTabIds) {
            const tabData = data[tabId];
             if (!tabData) {
                 console.warn(`[Load API Tabs] No data found for game tabId: ${tabId}. Skipping.`);
                 continue;
             }
            console.log(`[Load API Tabs] Processing game tabId: ${tabId}, tabData:`, JSON.stringify(tabData));

            window.userTabsData.tabs[tabId] = { name: tabData.tab_name || `Tab ${tabId}` }; // Game tabs
            window.userTabsData.entries[tabId] = Array.isArray(tabData.entries) ? tabData.entries : []; // Game entries

            console.log(`[Load API Tabs] Updated state for game tab ${tabId}.`);

            if (tabId === 'default') {
                hasUserDefault = true;
                console.log("[Load API Tabs] User has a saved default game tab. Rendering its entries.");
                renderGamesForTab('default');
            } else {
                createTabFromLocalData(tabId, window.userTabsData.tabs[tabId].name);
                renderGamesForTab(tabId);
                if (firstTabId === 'default') firstTabId = tabId;
            }
        }

        if (!hasUserDefault) {
            console.log("[Load API Tabs] User has no saved default game tab. Fetching global defaults for games...");
            await loadAndSaveGlobalDefaults(); // Game-specific defaults loader
            firstTabId = 'default';
        }

        const tabLink = document.querySelector(`#gamesTab .nav-link[href="#${firstTabId}"]`); // Target gamesTab
        if (tabLink && typeof $ !== 'undefined' && $.fn.tab) {
            $(tabLink).tab('show');
            console.log(`[Load API Tabs] Activated game tab: ${firstTabId}`);
        } else {
            console.warn(`[Load API Tabs] Could not activate game tab ${firstTabId}.`);
        }
        console.log("[Load API Tabs] User game tabs processing complete.");
        apiLoadFailed = false; // Reset flag on success

    } catch (error) {
        console.error("[Load API Tabs] Error loading user game tabs from API:", error);
        showFlash(`Could not load your saved game tabs: ${error.message}. Using local backup if available.`, "danger");
        apiLoadFailed = true; // Set flag
        // initializeUILocally(); // This will be called in games.js if apiLoadFailed is true
        throw error; // Re-throw to be caught by games.js
    } finally {
         if(loadingPlaceholder) loadingPlaceholder.style.display = 'none';
    }
}

// --- NEW: Function to initialize UI from Local Storage (extracted) ---
function initializeUILocally() {
    console.log("Initializing UI from localStorage...");
    try {
        initLocalStorage(); // Ensure defaults exist if needed
        const tabs = getLocalOnlyTabs(); // Use renamed function
        if (tabs) {
            Object.keys(tabs).filter(id => id !== 'default').forEach(tabId => {
                createTabFromLocalData(tabId, tabs[tabId].name);
            });
        } else { console.error("Failed to get tabs from local storage for rebuild."); }

        const allEntries = getLocalOnlyEntries(); // Use renamed function
        if (allEntries) {
            Object.keys(allEntries).forEach(tabId => {
                renderGamesForTab(tabId); // Assumes renderGamesForTab is updated later
            });
        } else {
            console.error("Failed to get entries from local storage for rendering.");
            renderGamesForTab("default");
        }

        // Activate the first tab found (usually 'default')
        const firstTabLink = document.querySelector('#gamesTab .nav-link');
        if (firstTabLink && typeof $ !== 'undefined' && $.fn.tab) {
            $(firstTabLink).tab('show');
        }

    } catch (error) {
        console.error("Error during local UI rebuild:", error);
        showFlash("Error loading local data.", "danger");
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    const gamesTabContent = document.getElementById("gamesTabContent");
    if (!gamesTabContent) return;

    console.log("Initializing Games page...");

    const loadSavedBtn = document.getElementById('loadSavedTabsBtn');
    if (loadSavedBtn) loadSavedBtn.remove();

    const tabNav = document.getElementById('gamesTab'); // This is the <ul> for tabs
    const originalAddTabButtonLi = document.getElementById('addTabBtn')?.parentNode; // Get the original <li> of the add button

    if (tabNav) {
        const loadingLi = document.createElement('li');
        loadingLi.id = 'loadingTabsPlaceholder';
        loadingLi.className = 'nav-item ms-2 align-self-center text-secondary small';
        loadingLi.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> Loading Tabs...`;
        loadingLi.style.display = 'none'; // Hidden initially

        // Insert loading placeholder BEFORE the add tab button's list item, if it exists
        if (originalAddTabButtonLi && tabNav.contains(originalAddTabButtonLi)) {
            tabNav.insertBefore(loadingLi, originalAddTabButtonLi);
        } else if (tabNav.lastElementChild) {
            // Fallback: if add button's li isn't found reliably, insert before the last generic child
            // This is less ideal but might prevent errors if the structure is unexpected
            tabNav.insertBefore(loadingLi, tabNav.lastElementChild);
        } else {
            // Fallback: if tabNav is empty, just append
            tabNav.appendChild(loadingLi);
        }
    }

    // --- Load data based on login status ---
    // This section can modify the tab list (tabNav) by calling createTabFromLocalData etc.
    if (isLoggedIn) {
        await loadUserTabsFromAPI();
        if (apiLoadFailed) {
            console.log("API load failed, falling back to local UI initialization.");
            initializeUILocally();
        }
    } else {
        console.log("User not logged in, initializing UI locally.");
        initializeUILocally();
        document.getElementById('deleteTabBtn')?.remove();
        document.getElementById('duplicateTabBtn')?.remove();
    }
    // --- End Load data ---

    // --- Attach Core Event Listeners ---
    // Re-fetch addTabBtn AFTER potential DOM modifications by loadUserTabsFromAPI or initializeUILocally
    // This is crucial if those functions rebuild parts of the tab navigation.
    const addTabBtn = document.getElementById("addTabBtn");
    if (addTabBtn) {
        // Check if a listener is already attached to avoid duplicates if this runs multiple times (unlikely for DOMContentLoaded)
        if (!addTabBtn.dataset.listenerAttached) {
            addTabBtn.addEventListener("click", (e) => {
                e.preventDefault();
                try {
                    createNewTab();
                } catch (tabError) {
                    console.error("Error creating new tab:", tabError);
                    showFlash("Failed to create new tab.", "danger");
                }
            });
            addTabBtn.dataset.listenerAttached = 'true'; // Mark as attached
        }
    } else {
        console.error("Add Tab button ('addTabBtn') still not found after tab loading logic.");
    }

    // --- Attach Duplicate Tab Listener ---
    const duplicateBtn = document.getElementById('duplicateTabBtn');
    if (duplicateBtn && isLoggedIn) { // Only attach if logged in and button exists
        duplicateBtn.addEventListener('click', handleDuplicateTab);
    } else if (duplicateBtn && !isLoggedIn) {
         duplicateBtn.remove(); // Remove button if user not logged in
    }
    // "Insert New Entry" Button Click (Delegated) - No change needed here yet
    document.addEventListener("click", (e) => {
        if (e.target?.classList.contains("insertGameBtn")) {
            const tabId = e.target.getAttribute("data-tab");
            // *** IMPORTANT: Ensure window.currentTargetTab reflects the *actual* active tab ID ***
            // Maybe update it on tab change event listener?
            window.currentTargetTab = tabId; // Set global context (might need refinement)
            try {
                document.getElementById("newGameAlert")?.replaceChildren(); // Clear alerts
                $('#newGameModal').modal('show');
            }
            catch (modalError) { console.error("Error showing new game modal:", modalError); showFlash("Could not open the new game form.", "danger"); }
        }
    });

    // Double-click on Table Row for Editing (Delegated) - No change needed here yet
    document.addEventListener("dblclick", (e) => {
        // ... (existing double-click logic to prepare and show edit modal) ...
        // It reads from localStorage currently, will need update in later step if logged in
        const targetRow = e.target.closest("tr");
        if (targetRow && targetRow.dataset.gameName && targetRow.dataset.entryIds && targetRow.parentElement?.classList.contains("gamesTable")) {
            const tabPane = targetRow.closest(".tab-pane");
            if (tabPane) {
                // *** Update how context tab and original entries are determined ***
                window.currentTargetTab = tabPane.id; // Still okay for context
                const gameName = targetRow.dataset.gameName;
                let entryIds = [];
                try { entryIds = JSON.parse(targetRow.dataset.entryIds); }
                catch (parseError) { console.error("Failed to parse entry IDs:", parseError); showFlash("Error loading edit data.", "danger"); return; }

                if (!Array.isArray(entryIds) || entryIds.length === 0) { console.error("No valid entry IDs found for game:", gameName); showFlash("Error loading edit data.", "danger"); return; }

                const modal = document.getElementById('editGameModal');
                const gameNameDisplay = document.getElementById("editGameNameDisplay");
                const gameNameHidden = document.getElementById("editGameNameHidden");
                const modesContainer = document.getElementById("editGameModesContainer");
                const alertContainer = document.getElementById("editGameAlert");

                if (!modal || !gameNameDisplay || !gameNameHidden || !modesContainer || !alertContainer) {
                    console.error("Edit modal core elements are missing!"); showFlash("Error opening edit form - missing elements.", "danger"); return;
                }

                modesContainer.innerHTML = '<p class="text-muted">Loading modes...</p>';
                alertContainer.replaceChildren(); // Clear alerts
                gameNameDisplay.textContent = gameName;
                gameNameHidden.value = gameName;

                let originalEntries = [];
                try {
                    // *** Fetch original entries based on login status ***
                    const currentEntries = isLoggedIn ? (window.userTabsData.entries[window.currentTargetTab] || []) : (getLocalOnlyEntries()[window.currentTargetTab] || []);
                    originalEntries = currentEntries.filter(entry => entryIds.includes(entry.id));
                } catch (fetchError) { console.error("Error fetching original entries:", fetchError); modesContainer.innerHTML = '<p class="text-danger">Error loading details.</p>'; return; }

                if (originalEntries.length === 0) { modesContainer.innerHTML = '<p class="text-warning">Could not find details.</p>'; return; }

                // --- Render Edit Mode Sections ---
                let modesHtml = '';
                originalEntries.sort((a, b) => (a.gameMode || '').localeCompare(b.gameMode || '')).forEach((entry, index) => {
                    const displayMode = escapeHtml(entry.gameMode || '');
                    const difficulty = entry.difficulty !== undefined ? parseFloat(entry.difficulty).toFixed(1) : ''; // Format difficulty
                    const players = entry.numberOfPlayers !== undefined ? parseInt(entry.numberOfPlayers) : '';
                    modesHtml += `
                         <div class="edit-mode-section border rounded p-3 mb-3 position-relative" data-entry-id="${entry.id}">
                             <button type="button" class="btn btn-sm btn-outline-danger delete-single-mode-btn position-absolute" title="Delete this mode"
                                     style="top: 0.5rem; right: 0.5rem;" data-entry-id="${entry.id}" data-mode-name="${displayMode}">
                                 Delete
                             </button>
                             <div class="form-group">
                                 <label for="edit-mode-${entry.id}" class="font-weight-bold">Mode Name</label>
                                 <input type="text" id="edit-mode-${entry.id}" class="form-control edit-mode-name-input" value="${displayMode}" required>
                             </div>
                             <div class="form-row">
                                 <div class="form-group col-md-6">
                                     <label for="edit-difficulty-${entry.id}">Difficulty</label>
                                     <input type="number" id="edit-difficulty-${entry.id}" class="form-control edit-mode-difficulty" value="${difficulty}" min="0.2" max="10" step="0.1" required>
                                 </div>
                                 <div class="form-group col-md-6">
                                     <label for="edit-players-${entry.id}">Players</label>
                                     <input type="number" id="edit-players-${entry.id}" class="form-control edit-mode-players" value="${players}" min="1" max="99" step="1" required>
                                 </div>
                             </div>
                         </div> `;
                });
                modesContainer.innerHTML = modesHtml;


                // Show the modal
                try { $('#editGameModal').modal('show'); }
                catch (modalError) { console.error("Error showing edit game modal:", modalError); }

            } else { console.warn("Could not determine tab context for double-clicked row."); }
        }
    });

    // --- Modal Save/Update Button Listeners (remain the same for now) ---
    // Note: These handlers will need modification in the next step to call the new data functions
    let newGameListenerAttached = false;
    $('#newGameModal').on('shown.bs.modal', function () {
        if (!newGameListenerAttached) {
            document.getElementById("saveNewGameBtn")?.addEventListener("click", handleSaveNewGame);
            newGameListenerAttached = true;
        }
    });

    let editGameListenersAttached = false;
    $('#editGameModal').on('shown.bs.modal', function () {
        if (!editGameListenersAttached) {
            document.getElementById("updateGameBtn")?.addEventListener("click", handleUpdateGame);
            // Need to re-attach delete listener here or ensure delegation works
            document.querySelector("#editGameModal .modal-body")?.addEventListener('click', handleDeleteSingleMode); // Re-attach delegated listener
            editGameListenersAttached = true;
        }
    });



    // --- Attach Extension Handlers ---
    console.log("Attaching extension handlers...");
    try {
        // Always attach rename and load defaults, logic inside handles login state
        attachTabRenameHandler();
        attachLoadDefaultEntriesHandler();

        if (isLoggedIn) {
            // attachSaveTabHandler(); // Remove this - replaced by autosave
            attachDeleteTabHandler();
        }
    } catch (extError) {
        console.error("Error attaching extension handlers:", extError);
    }
    console.log("Games page initialization finished.");

}); // End DOMContentLoaded