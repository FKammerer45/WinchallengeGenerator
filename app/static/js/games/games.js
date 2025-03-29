// games.js
import { getLocalTabs, getLocalEntries, initLocalStorage } from "./localStorageUtils.js";
import { createNewTab, createTabFromLocalData } from "./tabManagement.js";
import { renderGamesForTab, handleSaveNewGame, handleUpdateGame, handleDeleteGame } from "./entryManagement.js";
// Import ALL relevant handlers from extensions
import {
    attachSaveTabHandler,
    attachLoadSavedTabsHandler,
    attachTabRenameHandler,
    attachLoadDefaultEntriesHandler,
    attachDeleteTabHandler // *** Ensure this is imported ***
 } from "./gamesExtensions.js"; // Ensure path is correct

// Wait for the DOM to load
document.addEventListener("DOMContentLoaded", () => {
    console.log("games.js: DOMContentLoaded");
    const gamesTabContent = document.getElementById("gamesTabContent");
    if (!gamesTabContent) {
        return; // Not the games page
    }
    console.log("Initializing Games page...");

    // Initialize localStorage if needed
    try { initLocalStorage(); } catch(e) { console.error("Error initializing local storage:", e); }

    // --- Rebuild UI from LocalStorage ---
    try {
        const tabs = getLocalTabs();
        if (tabs) {
            Object.keys(tabs).filter(id => id !== 'default').forEach(tabId => {
                 createTabFromLocalData(tabId, tabs[tabId].name);
            });
        } else { console.error("Failed to get tabs from local storage for rebuild."); }

        const allEntries = getLocalEntries();
        if(allEntries){
            Object.keys(allEntries).forEach(tabId => {
                 renderGamesForTab(tabId);
            });
        } else {
            console.error("Failed to get entries from local storage for rendering.");
            renderGamesForTab("default"); // Attempt to render default
        }
    } catch (error) { console.error("Error during UI rebuild from localStorage:", error); }

    // --- Attach Core Event Listeners ---
    // (Add Tab, Insert, DblClick Edit - keep these as they were)
    // "+" button to create a new tab.
    const addTabBtn = document.getElementById("addTabBtn");
    if (addTabBtn) {
        addTabBtn.addEventListener("click", (e) => {
            e.preventDefault(); console.log("Add tab button clicked.");
            try { createNewTab(); } catch (tabError) { console.error("Error creating new tab:", tabError); alert("Failed to create new tab."); }
        });
    } else { console.error("Add Tab button ('addTabBtn') not found."); }

    // "Insert" button clicks (event delegation)
    document.addEventListener("click", (e) => {
        if (e.target?.classList.contains("insertGameBtn")) { // Added optional chaining
            const tabId = e.target.getAttribute("data-tab");
            console.log(`Insert button clicked for tab: ${tabId}`);
            window.currentTargetTab = tabId;
             try { $('#newGameModal').modal('show'); }
             catch (modalError) { console.error("Error showing new game modal (jQuery/Bootstrap loaded?):", modalError); alert("Could not open the new game form."); }
        }
    });

     // Double-click on table rows for editing (event delegation)
    document.addEventListener("dblclick", (e) => {
        const targetRow = e.target.closest("tr");
        if (targetRow && targetRow.dataset.id && targetRow.parentElement?.classList.contains("gamesTable")) {
            const tabPane = targetRow.closest(".tab-pane");
            if (tabPane) {
                window.currentTargetTab = tabPane.id;
                console.log(`Editing entry ${targetRow.dataset.id} in tab ${window.currentTargetTab}`);
                const cells = targetRow.querySelectorAll("td");
                const entryData = { /* ... extract data ... */
                    id: targetRow.dataset.id, game: cells[0]?.textContent || "", gameMode: cells[1]?.textContent || "",
                    difficulty: cells[2]?.textContent || "", numberOfPlayers: cells[3]?.textContent || "" };
                const editEntryId = document.getElementById("editEntryId"); /* ... get other elements ... */
                const editGameName = document.getElementById("editGameName"); const editGameMode = document.getElementById("editGameMode");
                const editDifficulty = document.getElementById("editDifficulty"); const editPlayers = document.getElementById("editPlayers");
                if (editEntryId && editGameName && editGameMode && editDifficulty && editPlayers) {
                    editEntryId.value = entryData.id; editGameName.value = entryData.game; editGameMode.value = entryData.gameMode;
                    editDifficulty.value = entryData.difficulty; editPlayers.value = entryData.numberOfPlayers;
                    try { $('#editGameModal').modal('show'); }
                    catch(modalError) { console.error("Error showing edit game modal:", modalError); alert("Could not open the edit game form."); }
                } else { console.error("One or more edit modal form elements not found."); }
            } else { console.warn("Could not determine tab context for double-clicked row."); }
        }
    });


    // --- Attach Modal Button Handlers ---
    // (Save New, Update, Delete Entry buttons - keep these)
     const saveNewGameBtn = document.getElementById("saveNewGameBtn");
    if (saveNewGameBtn) { saveNewGameBtn.addEventListener("click", handleSaveNewGame); }
    else { console.error("Save New Game button ('saveNewGameBtn') not found."); }
    const updateGameBtn = document.getElementById("updateGameBtn");
    if (updateGameBtn) { updateGameBtn.addEventListener("click", handleUpdateGame); }
    else { console.error("Update Game button ('updateGameBtn') not found."); }
    const deleteGameBtn = document.getElementById("deleteGameBtn"); // This is delete *entry* button
    if (deleteGameBtn) { deleteGameBtn.addEventListener("click", handleDeleteGame); }
    else { console.error("Delete Game Entry button ('deleteGameBtn') not found."); }


    // --- Attach Extension Handlers (Server interactions, renaming etc.) ---
    console.log("Attaching extension handlers...");
    try {
        // Use the isLoggedIn variable defined in games.html <script> block
        if (typeof isLoggedIn !== 'undefined' && isLoggedIn) {
             console.log("User is logged in, attaching save/load/delete tab handlers.");
             attachSaveTabHandler();
             attachLoadSavedTabsHandler();
             attachDeleteTabHandler(); // *** Call the new handler ***
        } else {
            console.log("User not logged in, skipping save/load/delete tab handler attachment.");
        }
        attachTabRenameHandler(); // Attach rename handler always (local action)
        attachLoadDefaultEntriesHandler(); // Attach handler always
        console.log("Extension handlers attached.");
    } catch (extError) {
         console.error("Error attaching extension handlers:", extError);
    }

});