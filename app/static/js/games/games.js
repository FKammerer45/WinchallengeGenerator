// static/js/games/games.js
// Main orchestrator for the Games Configuration page

// *** FIX: Import removeLocalGameEntry from localStorageUtils ***
import { getLocalTabs, getLocalEntries, initLocalStorage, removeLocalGameEntry } from "./localStorageUtils.js";
import { createNewTab, createTabFromLocalData } from "./tabManagement.js";
// handleUpdateGame reads editable mode name now
import { renderGamesForTab, handleSaveNewGame, handleUpdateGame } from "./entryManagement.js";
import {
    attachSaveTabHandler,
    attachLoadSavedTabsHandler,
    attachTabRenameHandler,
    attachLoadDefaultEntriesHandler,
    attachDeleteTabHandler // For deleting TABS
 } from "./gamesExtensions.js";
// Import escapeHtml and showError
import { escapeHtml, showError } from "../utils/helpers.js";

// Wait for the DOM to load
document.addEventListener("DOMContentLoaded", () => {
    const gamesTabContent = document.getElementById("gamesTabContent");
    if (!gamesTabContent) {
        return; // Not the games page
    }
    console.log("Initializing Games page...");

    try { initLocalStorage(); } catch(e) { console.error("Error initializing local storage:", e); }

    // --- Rebuild UI from LocalStorage ---
    try {
        const tabs = getLocalTabs();
        if (tabs) { Object.keys(tabs).filter(id => id !== 'default').forEach(tabId => { createTabFromLocalData(tabId, tabs[tabId].name); }); }
        else { console.error("Failed to get tabs from local storage for rebuild."); }
        const allEntries = getLocalEntries();
        if(allEntries) { Object.keys(allEntries).forEach(tabId => { renderGamesForTab(tabId); }); }
        else { console.error("Failed to get entries from local storage for rendering."); renderGamesForTab("default"); }
    } catch (error) { console.error("Error during UI rebuild from localStorage:", error); }

    // --- Attach Core Event Listeners ---

    const addTabBtn = document.getElementById("addTabBtn");
    if (addTabBtn) { addTabBtn.addEventListener("click", (e) => { e.preventDefault(); try { createNewTab(); } catch (tabError) { console.error("Error creating new tab:", tabError); alert("Failed to create new tab."); } }); }
    else { console.error("Add Tab button ('addTabBtn') not found."); }

    document.addEventListener("click", (e) => {
        if (e.target?.classList.contains("insertGameBtn")) {
            const tabId = e.target.getAttribute("data-tab");
            window.currentTargetTab = tabId;
             try { $('#newGameModal').modal('show'); }
             catch (modalError) { console.error("Error showing new game modal:", modalError); alert("Could not open the new game form."); }
        }
    });

     // Double-click on table rows for editing (event delegation)
    document.addEventListener("dblclick", (e) => {
        const targetRow = e.target.closest("tr");
        if (targetRow && targetRow.dataset.gameName && targetRow.dataset.entryIds && targetRow.parentElement?.classList.contains("gamesTable")) {
            const tabPane = targetRow.closest(".tab-pane");
            if (tabPane) {
                window.currentTargetTab = tabPane.id;
                const gameName = targetRow.dataset.gameName;
                let entryIds = [];
                try { entryIds = JSON.parse(targetRow.dataset.entryIds); }
                catch (parseError) { console.error("Failed to parse entry IDs:", parseError); alert("Error loading edit data."); return; }

                if (!Array.isArray(entryIds) || entryIds.length === 0) { console.error("No valid entry IDs found for game:", gameName); alert("Error loading edit data."); return; }

                const modal = document.getElementById('editGameModal');
                const gameNameDisplay = document.getElementById("editGameNameDisplay");
                const gameNameHidden = document.getElementById("editGameNameHidden");
                const modesContainer = document.getElementById("editGameModesContainer");
                const alertContainer = document.getElementById("editGameAlert"); // Alert div inside modal

                if (!modal || !gameNameDisplay || !gameNameHidden || !modesContainer || !alertContainer) { console.error("Edit modal elements are missing."); alert("Error opening edit form."); return; }

                modesContainer.innerHTML = '<p class="text-muted">Loading modes...</p>';
                alertContainer.innerHTML = ''; // Clear alerts
                gameNameDisplay.textContent = gameName;
                gameNameHidden.value = gameName;

                let originalEntries = [];
                try {
                     const allEntries = getLocalEntries();
                     const currentTabEntries = allEntries[window.currentTargetTab] || [];
                     originalEntries = currentTabEntries.filter(entry => entryIds.includes(entry.id));
                } catch (fetchError) { console.error("Error fetching original entries:", fetchError); modesContainer.innerHTML = '<p class="text-danger">Error loading details.</p>'; return; }

                if (originalEntries.length === 0) { modesContainer.innerHTML = '<p class="text-warning">Could not find details.</p>'; return; }

                let modesHtml = '';
                originalEntries.sort((a, b) => (a.gameMode || '').localeCompare(b.gameMode || '')).forEach((entry, index) => {
                    const displayMode = escapeHtml(entry.gameMode || '');
                    // *** FIX: Removed bg-light, ensure button text is "Delete" ***
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
                                    <input type="number" id="edit-difficulty-${entry.id}" class="form-control edit-mode-difficulty" value="${entry.difficulty}" min="0" max="10" step="0.1" required>
                                </div>
                                <div class="form-group col-md-6">
                                    <label for="edit-players-${entry.id}">Players</label>
                                    <input type="number" id="edit-players-${entry.id}" class="form-control edit-mode-players" value="${entry.numberOfPlayers}" min="1" max="99" step="1" required>
                                </div>
                            </div>
                        </div> `;
                });
                modesContainer.innerHTML = modesHtml;

                try { $('#editGameModal').modal('show'); }
                catch(modalError) { console.error("Error showing edit game modal:", modalError); }

            } else { console.warn("Could not determine tab context for double-clicked row."); }
        }
    });

    // Listener for deleting a single mode within the edit modal
    const editModalBody = document.querySelector("#editGameModal .modal-body");
    if (editModalBody) {
        editModalBody.addEventListener('click', (e) => {
            if (e.target?.classList.contains('delete-single-mode-btn')) {
                const button = e.target;
                const entryId = button.dataset.entryId;
                const modeName = button.dataset.modeName || 'this mode';
                const section = button.closest('.edit-mode-section');
                const currentTab = window.currentTargetTab;
                // *** FIX: Get alert container reference *inside* the handler ***
                const alertContainer = document.getElementById("editGameAlert");

                console.log(`Delete button clicked: entryId=${entryId}, modeName=${modeName}, currentTab=${currentTab}`);

                // Check alertContainer again here
                if (!entryId || !section || !currentTab || !alertContainer) {
                    console.error("Cannot delete mode: Missing required elements or context.");
                    // Use showError with the specific alert container if possible
                    showError(alertContainer || document.body, "Could not delete mode due to an internal error.", "danger");
                    return;
                }

                if (confirm(`Are you sure you want to delete the mode "${modeName}"?`)) {
                    try {
                        // *** FIX: Call removeLocalGameEntry (imported correctly now) ***
                        removeLocalGameEntry(currentTab, entryId);
                        section.remove(); // Remove the section from the modal DOM
                        console.log(`Removed entry ${entryId} from localStorage and modal.`);
                        // *** FIX: Use showError with the modal's alert container ***
                        showError(alertContainer, `Mode "${escapeHtml(modeName)}" deleted locally. Save changes in the modal footer to finalize other edits or Cancel to discard all changes.`, "warning");
                    } catch (deleteError) {
                         console.error(`Error removing local game entry ${entryId}:`, deleteError);
                         // *** FIX: Use showError with the modal's alert container ***
                         showError(alertContainer, `Failed to delete mode "${escapeHtml(modeName)}".`, "danger");
                    }
                }
            }
        });
    } else {
        console.error("Could not find edit modal body to attach delete listener.");
    }


    // --- Attach Modal Button Handlers ---
    const saveNewGameBtn = document.getElementById("saveNewGameBtn");
    if (saveNewGameBtn) { saveNewGameBtn.addEventListener("click", handleSaveNewGame); }
    else { console.error("Save New Game button ('saveNewGameBtn') not found."); }

    const updateGameBtn = document.getElementById("updateGameBtn");
    if (updateGameBtn) { updateGameBtn.addEventListener("click", handleUpdateGame); }
    else { console.error("Update Game button ('updateGameBtn') not found."); }
    // --- Attach Extension Handlers ---
    try {
        if (typeof isLoggedIn !== 'undefined' && isLoggedIn) {
             attachSaveTabHandler();
             attachLoadSavedTabsHandler();
             attachDeleteTabHandler();
        }
        attachTabRenameHandler();
        attachLoadDefaultEntriesHandler();
    } catch (extError) {
         console.error("Error attaching extension handlers:", extError);
    }

}); // End DOMContentLoaded
