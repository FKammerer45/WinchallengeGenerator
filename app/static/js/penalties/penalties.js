// app/static/js/penalties/penalties.js

// Import local storage utils first
import {
    initPenaltiesLocalStorage,
    getLocalPenaltyTabs, // Changed import name
    getLocalPenalties    // Changed import name
} from "./penaltyLocalStorageUtils.js";

// Import penalty-specific tab and entry management
import { createNewPenaltyTab, createPenaltyTabFromLocalData, getNextPenaltyTabIdNumber } from "./penaltyTabManagement.js";
import { renderPenaltiesForTab, handleSaveNewPenalty, handleUpdatePenalty, handleDeletePenalty } from "./penaltyEntryManagement.js";

// Import penalty-specific extension handlers
import {
    attachPenaltyTabRenameHandler,      // Renamed handler
    attachLoadDefaultPenaltiesHandler, // Renamed handler
    attachDeletePenaltyTabHandler,      // Renamed handler
    triggerPenaltyAutosave,           // NEW: For autosave
    loadAndSaveGlobalPenaltyDefaults, // NEW: Function to load defaults
    loadUserPenaltyTabsFromAPI        // NEW: Function to load user tabs
} from "./penaltyExtensions.js";

// Import shared helpers
import { escapeHtml, showError, confirmModal, showFlash } from "../utils/helpers.js";
import { apiFetch } from "../utils/api.js";
// Removed apiFetch import as it's handled within extensions

// --- Global variable to store loaded data for logged-in users ---
window.userPenaltyTabsData = { tabs: {}, entries: {} }; // Use a distinct name
let penaltyApiLoadFailed = false; // Use a distinct flag

async function handleDuplicatePenaltyTab() {
    const isLoggedIn = window.isLoggedIn === true;
    if (!isLoggedIn) { // Should be caught by button visibility
        showFlash("Login required to duplicate tabs.", "warning");
        return;
    }

    const duplicateBtn = document.getElementById('duplicatePenaltyTabBtn'); // Use penalty button ID
    const activeLink = document.querySelector("#penaltiesTab .nav-link.active"); // Use penalty tab selector
    if (!activeLink) return showFlash("No active tab selected to duplicate.", "warning");

    const sourceTabId = activeLink.getAttribute("href")?.substring(1);
    const sourceTabName = activeLink.textContent.trim();

    if (!sourceTabId) return showFlash("Could not identify the active tab.", "danger");
    

    // --- Max Tab Check ---
    const MAX_CUSTOM_TABS = 5;
    const currentTabs = window.userPenaltyTabsData?.tabs || {};
    const customTabCount = Object.keys(currentTabs).filter(id => id !== 'default').length;
    if (customTabCount >= MAX_CUSTOM_TABS) {
        showFlash(`Cannot duplicate: Max limit of ${MAX_CUSTOM_TABS} custom penalty tabs reached.`, "warning");
        return;
    }
    // --- End Check ---

    console.log(`Duplicating penalty tab: ${sourceTabName} (${sourceTabId})`);
    if(duplicateBtn) duplicateBtn.disabled = true;

    let newTabItem = null;
    let newTabPane = null;

    try {
        // 1. Get source entries (from penalty state)
        const sourceEntries = window.userPenaltyTabsData?.entries?.[sourceTabId];
        if (!Array.isArray(sourceEntries)) {
            throw new Error("Could not retrieve penalties for the source tab.");
        }
        // Create a deep copy and assign NEW local IDs
        const copiedEntries = sourceEntries.map(entry => ({
             ...entry,
             id: "local-p-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9) // Penalty ID prefix
        }));

        // 2. Find unique name
        let newTabName = `${sourceTabName} Copy`;
        let copyNum = 2;
        const existingNames = Object.values(window.userPenaltyTabsData?.tabs || {}).map(tab => tab.name);
        while (existingNames.includes(newTabName)) {
            newTabName = `${sourceTabName} Copy (${copyNum})`;
            copyNum++;
        }

        // 3. Get unique ID
        // initializeMaxPenaltyTabIdNum(); // Re-initialize counter (ensure function is accessible if needed)
        const newTabIdNumber = getNextPenaltyTabIdNumber(); // Use penalty ID generator
        const newTabId = `penaltyPane-${newTabIdNumber}`; // Penalty prefix
        const linkId = `penalty-tab-${newTabIdNumber}`; // Penalty prefix

        // 4. Create UI Elements
        const newTabLink = document.createElement("a");
        newTabLink.className = "nav-link"; newTabLink.id = linkId;
        newTabLink.setAttribute("data-toggle", "tab"); newTabLink.href = `#${newTabId}`;
        newTabLink.role = "tab"; newTabLink.setAttribute("aria-controls", newTabId);
        newTabLink.setAttribute("aria-selected", "false"); newTabLink.textContent = newTabName;
        newTabLink.setAttribute("data-tab", newTabId);

        newTabItem = document.createElement("li");
        newTabItem.className = "nav-item";
        newTabItem.appendChild(newTabLink);

        const addTabBtn = document.getElementById("addPenaltyTabBtn"); // Use penalty add button
        addTabBtn?.parentNode?.parentNode?.insertBefore(newTabItem, addTabBtn.parentNode);

        newTabPane = document.createElement("div");
        newTabPane.className = "tab-pane fade"; newTabPane.id = newTabId;
        newTabPane.setAttribute("role", "tabpanel"); newTabPane.setAttribute("aria-labelledby", linkId);
        // Use penalty button class
        newTabPane.innerHTML = `
          <div class="d-flex justify-content-start my-3 flex-wrap gap-2">
              <button class="btn btn-primary insertPenaltyBtn" data-tab="${newTabId}" title="Add new penalty">Insert New Penalty</button>
          </div>
          <div class="table-responsive">
              <table class="table table-hover table-sm config-table mb-0">
                  <thead> <tr> <th>Name</th> <th>Probability</th> <th>Description</th> </tr> </thead>
                  <tbody class="penaltiesTable"></tbody> 
              </table>
          </div>`;
        document.getElementById("penaltiesTabContent")?.appendChild(newTabPane); // Use penalty content ID

        // 5. Save New Tab Data (Use penalty API endpoint)
        console.log(`Saving duplicated penalty tab ${newTabId} with name "${newTabName}" via API...`);
        const payload = {
            tabId: newTabId,
            tabName: newTabName,
            penalties: copiedEntries // Use 'penalties' key
        };
        const csrfToken = window.csrfToken; // Use global token
        const response = await apiFetch('/api/penalties/save_tab', { method: 'POST', body: payload }, csrfToken); // Use penalty endpoint
        if (response.status !== 'ok') {
             throw new Error(response.error || "Failed to save duplicated penalty tab data.");
        }

        // 6. Update global penalty JS state
         if(window.userPenaltyTabsData) {
             window.userPenaltyTabsData.tabs[newTabId] = { name: newTabName };
             window.userPenaltyTabsData.entries[newTabId] = copiedEntries; // Use the copied entries
             console.log(`Duplicated penalty tab ${newTabId} added to JS state.`);
         }

        // 7. Render entries in the new tab pane
        renderPenaltiesForTab(newTabId); // Use penalty renderer

        // 8. Activate the new tab
         if (typeof $ !== 'undefined' && $.fn.tab) { $(newTabLink).tab('show'); }

        showFlash(`Penalty Tab "${sourceTabName}" duplicated successfully as "${newTabName}".`, "success");

    } catch (error) {
        console.error("Error duplicating penalty tab:", error);
        showFlash(`Duplication failed: ${error.message}`, "danger");
        // Cleanup UI on error
        if (newTabItem) newTabItem.remove();
        if (newTabPane) newTabPane.remove();
    } finally {
        if(duplicateBtn) duplicateBtn.disabled = false; // Re-enable button
    }
}

function initializePenaltyUILocally() {
    console.log("Initializing Penalty UI from localStorage...");
    try {
        initPenaltiesLocalStorage(); // Ensure defaults exist if needed
        const tabs = getLocalPenaltyTabs();
        if (tabs) {
            const sortedTabIds = Object.keys(tabs).sort((a, b) => { /* ... sort logic ... */
                if (a === 'default') return -1; if (b === 'default') return 1;
                const numA = parseInt(a.split('-')[1] || '0'); const numB = parseInt(b.split('-')[1] || '0'); return numA - numB;
            });
            sortedTabIds.filter(id => id !== 'default').forEach(tabId => {
                createPenaltyTabFromLocalData(tabId, tabs[tabId].name); // Use penalty version
            });
        } else { console.error("Failed to get penalty tabs from local storage for rebuild."); }

        const allPenalties = getLocalPenalties();
        if (allPenalties) {
            Object.keys(allPenalties).forEach(tabId => {
                renderPenaltiesForTab(tabId); // Use penalty renderer
            });
        } else {
            console.error("Failed to get penalties from local storage.");
            renderPenaltiesForTab("default"); // Attempt default render
        }

        // Activate the first tab found (usually 'default')
        const firstTabLink = document.querySelector('#penaltiesTab .nav-link'); // Use penalty tab ID
        if (firstTabLink && typeof $ !== 'undefined' && $.fn.tab) {
            $(firstTabLink).tab('show');
        }
    } catch (error) {
        console.error("Error during local Penalty UI rebuild:", error);
        showFlash("Error loading local penalty data.", "danger");
    }
}


// --- DOMContentLoaded Listener ---
document.addEventListener("DOMContentLoaded", async () => {
    console.log("penalties.js: DOMContentLoaded");
    const penaltiesTabContent = document.getElementById("penaltiesTabContent");
    if (!penaltiesTabContent) return; // Exit if not the penalties page

    console.log("Initializing Penalties page...");

    // Add Loading Placeholder Dynamically (if needed)
    const tabNav = document.getElementById('penaltiesTab');
    let loadingPlaceholder = document.getElementById('loadingPenaltyTabsPlaceholder');
    if (tabNav && !loadingPlaceholder) { // Check if it doesn't already exist
        loadingPlaceholder = document.createElement('li');
        loadingPlaceholder.id = 'loadingPenaltyTabsPlaceholder';
        loadingPlaceholder.className = 'nav-item ms-2 align-self-center text-secondary small';
        loadingPlaceholder.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> Loading Tabs...`;
        loadingPlaceholder.style.display = 'none'; // Hidden initially
        const addBtnLi = document.getElementById('addPenaltyTabBtn')?.parentNode;
        if (addBtnLi) tabNav.insertBefore(loadingPlaceholder, addBtnLi);
    }

    // --- Load data based on login status (use global flags from penalties.html) ---
    if (window.isLoggedIn) {
        try { // Add try..catch around the API call
            await loadUserPenaltyTabsFromAPI();
            // No need to set penaltyApiLoadFailed = false here, it's the default
        } catch (apiError) { // Catch errors thrown by loadUserPenaltyTabsFromAPI
            console.log("Penalty API load failed (caught in penalties.js), falling back to local UI initialization.");
            penaltyApiLoadFailed = true; // <<< SET THE FLAG ON ERROR
            initializePenaltyUILocally();
        }
        // --- Removed the redundant check for apiLoadFailed here ---
    } else {
        console.log("User not logged in, initializing Penalty UI locally.");
        initializePenaltyUILocally();
        document.getElementById('deletePenaltyTabBtn')?.remove();
    }
    // --- End Load data ---


    // --- Attach Core Event Listeners ---
    const addPenaltyTabBtn = document.getElementById("addPenaltyTabBtn");
    if (addPenaltyTabBtn) {
        addPenaltyTabBtn.addEventListener("click", (e) => {
            e.preventDefault();
            try { createNewPenaltyTab(); } // Use penalty function
            catch (tabError) { console.error("Error creating new penalty tab:", tabError); showFlash("Failed to create new tab.", "danger"); }
        });
    } else { console.error("Add Penalty Tab button not found."); }

    // "Insert New Penalty" Button Click (Delegated)
    document.addEventListener("click", (e) => {
        if (e.target?.classList.contains("insertPenaltyBtn")) {
            const tabId = e.target.getAttribute("data-tab");
            window.currentPenaltyTab = tabId; // Use penalty context variable
            try {
                document.getElementById("newPenaltyAlert")?.replaceChildren(); // Clear alerts
                document.getElementById("newPenaltyForm")?.reset(); // Reset form
                $('#newPenaltyModal').modal('show'); // Use penalty modal ID
            }
            catch (modalError) { console.error("Error showing new penalty modal:", modalError); showFlash("Could not open the new penalty form.", "danger"); }
        }
    });

    // Double-click on Penalty Table Row for Editing (Delegated)
    document.addEventListener("dblclick", (e) => {
        const targetRow = e.target.closest("tr");
        // Check if the click is within a PENALTY table body
        if (targetRow && targetRow.dataset.id && targetRow.parentElement?.classList.contains("penaltiesTable")) {
            const tabPane = targetRow.closest(".tab-pane");
            if (tabPane) {
                window.currentPenaltyTab = tabPane.id; // Set context (e.g., default, penaltyPane-1)
                console.log(`Editing penalty ${targetRow.dataset.id} in tab ${window.currentPenaltyTab}`);
                const cells = targetRow.querySelectorAll("td");
                const penaltyData = {
                    id: targetRow.dataset.id,
                    name: cells[0]?.textContent || "",
                    probability: cells[1]?.textContent || "",
                    description: cells[2]?.textContent || ""
                };

                // Populate and show the edit penalty modal
                const editPenaltyEntryId = document.getElementById("editPenaltyEntryId");
                const editPenaltyName = document.getElementById("editPenaltyName");
                const editProbability = document.getElementById("editProbability");
                const editDescription = document.getElementById("editDescription");
                const alertContainer = document.getElementById("editPenaltyAlert");

                if (alertContainer) alertContainer.replaceChildren(); // Clear previous modal errors

                if (editPenaltyEntryId && editPenaltyName && editProbability && editDescription) {
                    editPenaltyEntryId.value = penaltyData.id;
                    editPenaltyName.value = penaltyData.name;
                    editProbability.value = penaltyData.probability;
                    editDescription.value = penaltyData.description;
                    try { $('#editPenaltyModal').modal('show'); } // Use penalty modal ID
                    catch(modalError) { console.error("Error showing edit penalty modal:", modalError); }
                } else { console.error("One or more edit penalty modal form elements not found."); }
            } else { console.warn("Could not determine tab context for penalty double-click."); }
        }
    });


    // --- Attach Modal Button Handlers ---
    // Ensure listeners aren't attached multiple times if script re-runs
    let newPenaltyListenerAttached = false;
    $('#newPenaltyModal').on('shown.bs.modal', function () {
        if (!newPenaltyListenerAttached) {
            document.getElementById("saveNewPenaltyBtn")?.addEventListener("click", handleSaveNewPenalty);
            newPenaltyListenerAttached = true;
        }
    });

    let editPenaltyListenersAttached = false;
    $('#editPenaltyModal').on('shown.bs.modal', function () {
        if (!editPenaltyListenersAttached) {
            document.getElementById("updatePenaltyBtn")?.addEventListener("click", handleUpdatePenalty);
            document.getElementById("deletePenaltyBtn")?.addEventListener("click", handleDeletePenalty);
            editPenaltyListenersAttached = true;
        }
    });


    // --- Attach Extension Handlers ---
    console.log("Attaching penalty extension handlers...");
    try {
        // Always attach rename and load defaults
        attachPenaltyTabRenameHandler();
        attachLoadDefaultPenaltiesHandler();

        // Conditionally attach handlers requiring login
        if (window.isLoggedIn) {
           
            attachDeletePenaltyTabHandler();
            const duplicateBtn = document.getElementById('duplicatePenaltyTabBtn');
            if (duplicateBtn) {
                duplicateBtn.addEventListener('click', handleDuplicatePenaltyTab);
            }
        }
    } catch (extError) {
        console.error("Error attaching penalty extension handlers:", extError);
    }
    console.log("Penalties page initialization finished.");

}); // End DOMContentLoaded