// penalties/penalties.js
// Main JS orchestrator for the Penalties Configuration page

// Import local storage utils first for initialization
import { initPenaltiesLocalStorage, getLocalPenaltyTabs, getLocalPenalties } from "./penaltyLocalStorageUtils.js";

// Import tab and entry management specific to penalties
import { createNewPenaltyTab, createPenaltyTabFromLocalData } from "./penaltyTabManagement.js";
import { renderPenaltiesForTab, handleSaveNewPenalty, handleUpdatePenalty, handleDeletePenalty } from "./penaltyEntryManagement.js";

// Import extension handlers specific to penalties
import {
    attachSavePenaltyTabHandler,
    attachLoadSavedPenaltyTabsHandler,
    attachPenaltyTabRenameHandler,
    attachLoadDefaultPenaltiesHandler,
    attachDeletePenaltyTabHandler // Use the specific penalty delete handler
 } from "./penaltyExtensions.js";

// Wait for the DOM to load
document.addEventListener("DOMContentLoaded", () => {
    console.log("penalties.js: DOMContentLoaded");
    // Check if this is the penalties management page.
    const penaltiesTabContent = document.getElementById("penaltiesTabContent"); // Use correct ID
    if (!penaltiesTabContent) {
        return; // Not the penalties page
    }
    console.log("Initializing Penalties page...");

    // Initialize localStorage for penalties if needed
    try { initPenaltiesLocalStorage(); }
    catch(e) { console.error("Error initializing penalty local storage:", e); }

    // --- Rebuild UI from LocalStorage ---
    try {
        const tabs = getLocalPenaltyTabs();
        if (tabs) {
            // Recreate UI for non-default tabs stored locally
            Object.keys(tabs).filter(id => id !== 'default').forEach(tabId => {
                 createPenaltyTabFromLocalData(tabId, tabs[tabId].name);
            });
        } else { console.error("Failed to get penalty tabs from local storage."); }

        // Render entries for all existing tabs (including default)
        const allPenalties = getLocalPenalties();
        if(allPenalties){
            Object.keys(allPenalties).forEach(tabId => {
                 renderPenaltiesForTab(tabId); // Use penalty renderer
            });
        } else {
            console.error("Failed to get penalties from local storage.");
            renderPenaltiesForTab("default"); // Attempt default render
        }
    } catch (error) { console.error("Error during Penalties UI rebuild:", error); }


    // --- Attach Core Event Listeners ---

    // "+" button to create a new penalty tab.
    const addPenaltyTabBtn = document.getElementById("addPenaltyTabBtn"); // Use correct ID
    if (addPenaltyTabBtn) {
        addPenaltyTabBtn.addEventListener("click", (e) => {
            e.preventDefault(); console.log("Add penalty tab button clicked.");
            try { createNewPenaltyTab(); } // Use penalty tab creator
            catch (tabError) { console.error("Error creating new penalty tab:", tabError); }
        });
    } else { console.error("Add Penalty Tab button ('addPenaltyTabBtn') not found."); }

    // "Insert New Penalty" button clicks (event delegation)
    document.addEventListener("click", (e) => {
        if (e.target?.classList.contains("insertPenaltyBtn")) { // Use correct class
            const tabId = e.target.getAttribute("data-tab");
            console.log(`Insert penalty button clicked for tab: ${tabId}`);
            window.currentPenaltyTab = tabId; // Use a separate global context variable
             try { $('#newPenaltyModal').modal('show'); } // Use correct modal ID
             catch (modalError) { console.error("Error showing new penalty modal:", modalError); }
        }
    });

     // Double-click on penalty table rows for editing (event delegation)
    document.addEventListener("dblclick", (e) => {
        const targetRow = e.target.closest("tr");
        // Check if the click is within a PENALTY table
        if (targetRow && targetRow.dataset.id && targetRow.parentElement?.classList.contains("penaltiesTable")) {
            const tabPane = targetRow.closest(".tab-pane"); // Get parent tab pane
            if (tabPane) {
                window.currentPenaltyTab = tabPane.id.replace('penaltyPane-',''); // Store context (e.g., 'default' or '1')
                console.log(`Editing penalty ${targetRow.dataset.id} in tab ${window.currentPenaltyTab}`);
                const cells = targetRow.querySelectorAll("td");
                const penaltyData = {
                    id: targetRow.dataset.id,
                    name: cells[0]?.textContent || "",
                    probability: cells[1]?.textContent || "", // Get as text, form handles parseFloat
                    description: cells[2]?.textContent || ""
                };

                // Populate and show the edit penalty modal
                const editPenaltyEntryId = document.getElementById("editPenaltyEntryId");
                const editPenaltyName = document.getElementById("editPenaltyName");
                const editProbability = document.getElementById("editProbability");
                const editDescription = document.getElementById("editDescription");

                if (editPenaltyEntryId && editPenaltyName && editProbability && editDescription) {
                    editPenaltyEntryId.value = penaltyData.id;
                    editPenaltyName.value = penaltyData.name;
                    editProbability.value = penaltyData.probability;
                    editDescription.value = penaltyData.description;
                    try { $('#editPenaltyModal').modal('show'); } // Use correct modal ID
                    catch(modalError) { console.error("Error showing edit penalty modal:", modalError); }
                } else { console.error("One or more edit penalty modal form elements not found."); }
            } else { console.warn("Could not determine tab context for penalty double-click."); }
        }
    });


    // --- Attach Modal Button Handlers ---
    const saveNewPenaltyBtn = document.getElementById("saveNewPenaltyBtn"); // Use correct ID
    if (saveNewPenaltyBtn) { saveNewPenaltyBtn.addEventListener("click", handleSaveNewPenalty); } // Use correct handler
    else { console.error("Save New Penalty button not found."); }

    const updatePenaltyBtn = document.getElementById("updatePenaltyBtn"); // Use correct ID
    if (updatePenaltyBtn) { updatePenaltyBtn.addEventListener("click", handleUpdatePenalty); } // Use correct handler
    else { console.error("Update Penalty button not found."); }

    const deletePenaltyBtn = document.getElementById("deletePenaltyBtn"); // Use correct ID
    if (deletePenaltyBtn) { deletePenaltyBtn.addEventListener("click", handleDeletePenalty); } // Use correct handler
    else { console.error("Delete Penalty button not found."); }


    // --- Attach Extension Handlers (Server interactions, renaming etc.) ---
    console.log("Attaching penalty extension handlers...");
    try {
        // Use the global isLoggedIn variable set in penalties.html
        if (typeof isLoggedIn !== 'undefined' && isLoggedIn) {
             console.log("User is logged in, attaching save/load/delete penalty tab handlers.");
             attachSavePenaltyTabHandler();      // Use penalty handler
             attachLoadSavedPenaltyTabsHandler();// Use penalty handler
             attachDeletePenaltyTabHandler();    // Use penalty handler
        } else {
            console.log("User not logged in, skipping save/load/delete penalty tab handler attachment.");
        }
        attachPenaltyTabRenameHandler(); // Attach penalty rename handler
        attachLoadDefaultPenaltiesHandler(); // Attach penalty load defaults handler
        console.log("Penalty extension handlers attached.");
    } catch (extError) {
         console.error("Error attaching penalty extension handlers:", extError);
    }

});