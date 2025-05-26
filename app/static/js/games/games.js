// app/static/js/games/games.js

import {
    initLocalStorage as initGameLocalStorage,
    getLocalOnlyTabs,
    getLocalOnlyEntries,
    setLocalOnlyTabs,
    setLocalOnlyEntries
} from "./localStorageUtils.js";
import {
    createNewTab, // For user-created custom tabs
    createTabFromLocalData, // For rendering all tabs (system-defaults and custom)
    updateAnonymousGameTabCountDisplay, // Import the new function
} from "./tabManagement.js";
import {
    renderGamesForTab,
    handleSaveNewGame,
    handleUpdateGame,
    handleDeleteSingleMode
} from "./entryManagement.js";
import {
    attachTabRenameHandler,
    attachDeleteTabHandler,
    triggerAutosave,
    handleDuplicateTab
} from "./gamesExtensions.js";
import { escapeHtml, showError, confirmModal, showFlash, showRowTooltip, hideRowTooltip, updateRowTooltipPosition } from "../utils/helpers.js";
import { apiFetch } from "../utils/api.js";

// --- Global States ---
window.userTabsData = { tabs: {}, entries: {} };
window.SYSTEM_DEFAULT_GAME_TABS = {};

// --- Constants for API URLs ---
const SYSTEM_DEFAULT_DEFINITIONS_URL = '/api/games/default_definitions';
const USER_TABS_LOAD_URL = '/api/tabs/load';
const USER_TABS_SAVE_URL = '/api/tabs/save';
const PRIMARY_DEFAULT_TAB_ID = "default-all-games";


// --- Handler for Reset to System Default Button ---
async function handleResetTabToDefault(event) {
    const button = event.target.closest('.reset-tab-to-default-btn');
    if (!button) return;
    const tabIdToReset = button.dataset.tab;
    if (!tabIdToReset) {
        showFlash("Could not identify tab to reset.", "danger");
        return;
    }
    const tabDefinition = window.SYSTEM_DEFAULT_GAME_TABS ? window.SYSTEM_DEFAULT_GAME_TABS[tabIdToReset] : null;
    if (!tabDefinition || !Array.isArray(tabDefinition.entries)) {
        showFlash(`Original default entries for tab "${tabIdToReset}" not found or invalid.`, "danger");
        console.error(`[Reset Tab] Original definition for ${tabIdToReset} not found or 'entries' is not an array.`);
        return;
    }
    const tabDisplayName = window.userTabsData?.tabs?.[tabIdToReset]?.name || tabDefinition.name || tabIdToReset;
    const confirmed = await confirmModal(
        `Are you sure you want to reset the tab "${escapeHtml(tabDisplayName)}" to its original system default entries? All current custom entries in this tab will be lost.`,
        "Confirm Reset Tab"
    );
    if (!confirmed) return;
    button.disabled = true;
    const originalEntriesPythonStyle = JSON.parse(JSON.stringify(tabDefinition.entries));
    const transformedEntries = originalEntriesPythonStyle.map(entry => {
        const difficultyVal = parseFloat(entry.Schwierigkeit);
        return {
            id: entry.id || ("local-g-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9)),
            game: entry.Spiel,
            gameMode: entry.Spielmodus,
            difficulty: !isNaN(difficultyVal) ? difficultyVal.toFixed(1) : "1.0",
            numberOfPlayers: parseInt(entry.Spieleranzahl, 10) || 1,
            weight: parseFloat(entry.weight) || 1.0,
            tags: Array.isArray(entry.tags) ? entry.tags : [] // Add tags here too
        };
    });
    console.log(`[Reset Tab] Resetting tab "${tabIdToReset}" with ${transformedEntries.length} transformed entries.`);
    try {
        const isLoggedIn = window.isLoggedIn === true;
        if (isLoggedIn) {
            if (!window.userTabsData || !window.userTabsData.entries) {
                throw new Error("User data not properly initialized.");
            }
            window.userTabsData.entries[tabIdToReset] = transformedEntries;
            triggerAutosave(tabIdToReset);
            showFlash(`Tab "${escapeHtml(tabDisplayName)}" is being reset to system defaults...`, "info", 2000);
        } else {
            let localEntries = getLocalOnlyEntries();
            localEntries[tabIdToReset] = transformedEntries;
            setLocalOnlyEntries(localEntries);
            showFlash(`Tab "${escapeHtml(tabDisplayName)}" reset to system defaults locally.`, "success");
        }
        renderGamesForTab(tabIdToReset);
    } catch (error) {
        console.error("[Reset Tab] Error resetting tab %s:", tabIdToReset, error);
        showFlash(`Failed to reset tab: ${error.message}`, "danger"); // User-facing, template literal is fine
    } finally {
        button.disabled = false;
    }
}


// --- Main Initialization on DOMContentLoaded ---
document.addEventListener("DOMContentLoaded", async () => {
    const gamesTabContent = document.getElementById("gamesTabContent");
    if (!gamesTabContent) return;

    console.log("Initializing Games page (games.js)...");
    const isLoggedIn = window.isLoggedIn === true;
    const csrfToken = window.csrfToken;

    const loadingPlaceholder = document.getElementById('loadingTabsPlaceholder');
    const tabListElement = document.getElementById('gamesTab');
    const addTabBtnLi = document.getElementById("addTabBtn")?.closest('li.nav-item'); // Get the LI of add button
    const customTabsSeparator = document.getElementById('customTabsSeparator');
    const systemTabsLabel = document.getElementById('systemTabsLabel');
    const customTabsLabel = document.getElementById('customTabsLabel');
    const duplicateBtn = document.getElementById('duplicateTabBtn'); 
    if (loadingPlaceholder) loadingPlaceholder.style.display = 'block';

    // Clear existing dynamic tabs (not the separator, labels, or add button)
    if (tabListElement) {
        const itemsToRemove = [];
        tabListElement.querySelectorAll('li.nav-item').forEach(li => {
            if (li !== addTabBtnLi && li !== loadingPlaceholder && li !== customTabsSeparator && li !== systemTabsLabel && li !== customTabsLabel) {
                itemsToRemove.push(li);
            }
        });
        itemsToRemove.forEach(li => li.remove());
        console.log(`[Init UI] Cleared ${itemsToRemove.length} pre-existing dynamic tab LIs.`);
    }
    if (gamesTabContent) {
        gamesTabContent.innerHTML = '';
        console.log("[Init UI] Cleared gamesTabContent.");
    }
    // Hide separator and labels initially
    if (customTabsSeparator) customTabsSeparator.style.display = 'none';
    if (systemTabsLabel) systemTabsLabel.style.display = 'none';
    if (customTabsLabel) customTabsLabel.style.display = 'none';

    try {
        console.log("Fetching system default game tab definitions...");
        const systemDefaultsApiResponse = await apiFetch(SYSTEM_DEFAULT_DEFINITIONS_URL);
        if (typeof systemDefaultsApiResponse !== 'object' || systemDefaultsApiResponse === null) {
            throw new Error("Failed to load valid system default game tab definitions from API.");
        }
        window.SYSTEM_DEFAULT_GAME_TABS = systemDefaultsApiResponse;
        console.log("System default game tab definitions loaded:", window.SYSTEM_DEFAULT_GAME_TABS);

        if (!isLoggedIn) {
            initGameLocalStorage();
        }

        if (isLoggedIn) {
            console.log("User is logged in. Ensuring system default tabs and loading user tabs from API...");
            let userSavedTabsFromApi = {};
            try {
                userSavedTabsFromApi = await apiFetch(USER_TABS_LOAD_URL);
                if (typeof userSavedTabsFromApi !== 'object' || userSavedTabsFromApi === null) {
                    userSavedTabsFromApi = {};
                }
            } catch (loadError) {
                console.error("Error loading user's saved tabs, proceeding with empty set:", loadError);
                showFlash("Could not load your saved tabs. Initializing with defaults.", "warning");
                userSavedTabsFromApi = {};
            }

            window.userTabsData = { tabs: {}, entries: {} };

            for (const defKey in window.SYSTEM_DEFAULT_GAME_TABS) {
                const sysDef = window.SYSTEM_DEFAULT_GAME_TABS[defKey];
                const clientTabId = sysDef.client_tab_id;

                if (!userSavedTabsFromApi[clientTabId]) {
                    console.log(`System default game tab "${sysDef.name}" (ID: ${clientTabId}) not found for user. Creating and saving...`);
                    try {
                        // Transform entries before saving them for the first time for the user
                        const transformedInitialEntries = (sysDef.entries || []).map(entry => ({
                            id: entry.id || ("local-g-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9)),
                            game: entry.Spiel,
                            gameMode: entry.Spielmodus,
                            difficulty: (parseFloat(entry.Schwierigkeit) || 1.0).toFixed(1),
                            numberOfPlayers: parseInt(entry.Spieleranzahl, 10) || 1,
                            weight: parseFloat(entry.weight) || 1.0,
                            tags: Array.isArray(entry.tags) ? entry.tags : [] // Add tags
                        }));

                        const savePayload = {
                            tabId: clientTabId,
                            tabName: sysDef.name,
                            entries: transformedInitialEntries
                        };
                        const savedTabResponse = await apiFetch(USER_TABS_SAVE_URL, { method: 'POST', body: savePayload }, csrfToken);

                        if (savedTabResponse.status === 'ok' && savedTabResponse.saved_tab) {
                            window.userTabsData.tabs[clientTabId] = { name: savedTabResponse.saved_tab.tab_name };
                            // Ensure entries from response are used, as backend might do further processing
                            window.userTabsData.entries[clientTabId] = savedTabResponse.saved_tab.entries || [];
                            console.log(`Successfully saved new system default tab "${sysDef.name}" for user.`);
                        } else {
                            throw new Error(savedTabResponse.error || `Failed to save system default tab ${sysDef.name}`); // User-facing, template literal is fine
                        }
                    } catch (saveError) {
                        console.error("Error saving system default game tab %s for user:", clientTabId, saveError);
                        showFlash(`Could not initialize default tab: ${sysDef.name}. Displaying read-only version.`, "warning"); // User-facing, template literal is fine
                        // Fallback: use transformed definitions for session display
                        window.userTabsData.tabs[clientTabId] = { name: sysDef.name };
                        window.userTabsData.entries[clientTabId] = (sysDef.entries || []).map(entry => ({
                            id: entry.id || ("local-g-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9)),
                            game: entry.Spiel,
                            gameMode: entry.Spielmodus,
                            difficulty: (parseFloat(entry.Schwierigkeit) || 1.0).toFixed(1),
                            numberOfPlayers: parseInt(entry.Spieleranzahl, 10) || 1,
                            weight: parseFloat(entry.weight) || 1.0
                        }));
                    }
                } else { // System default tab already exists for the user, load it (it should already be in correct JS format from backend)
                    window.userTabsData.tabs[clientTabId] = { name: userSavedTabsFromApi[clientTabId].tab_name };
                    window.userTabsData.entries[clientTabId] = userSavedTabsFromApi[clientTabId].entries || [];
                }
            }

            // Add any other custom tabs the user might have saved
            for (const tabId in userSavedTabsFromApi) {
                if (!window.userTabsData.tabs[tabId]) { // If not already processed as a system default
                    window.userTabsData.tabs[tabId] = { name: userSavedTabsFromApi[tabId].tab_name || `Tab ${tabId}` };
                    window.userTabsData.entries[tabId] = Array.isArray(userSavedTabsFromApi[tabId].entries) ? userSavedTabsFromApi[tabId].entries : [];
                }
            }
            console.log("Final userTabsData (Games) after API load & system default check:", JSON.parse(JSON.stringify(window.userTabsData)));

        } else { // Anonymous user
            console.log("User is anonymous. Ensuring system default game tabs in localStorage...");
            let localTabs = getLocalOnlyTabs();
            let localEntries = getLocalOnlyEntries();
            let updatedLocal = false;

            for (const defKey in window.SYSTEM_DEFAULT_GAME_TABS) {
                const sysDef = window.SYSTEM_DEFAULT_GAME_TABS[defKey];
                const clientTabId = sysDef.client_tab_id;
                if (!localTabs[clientTabId]) {
                    localTabs[clientTabId] = { name: sysDef.name };
                    // Transform for anonymous users too
                    localEntries[clientTabId] = (sysDef.entries || []).map(entry => ({
                        id: entry.id || ("local-g-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9)),
                        game: entry.Spiel,
                        gameMode: entry.Spielmodus,
                        difficulty: (parseFloat(entry.Schwierigkeit) || 1.0).toFixed(1),
                        numberOfPlayers: parseInt(entry.Spieleranzahl, 10) || 1,
                        weight: parseFloat(entry.weight) || 1.0,
                        tags: Array.isArray(entry.tags) ? entry.tags : [] // Add tags
                    }));
                    updatedLocal = true;
                }
            }
            if (updatedLocal) {
                setLocalOnlyTabs(localTabs);
                setLocalOnlyEntries(localEntries);
                console.log("localStorage updated with system default game tabs (transformed).");
            }
        }

        const tabsToRenderData = isLoggedIn ? window.userTabsData.tabs : getLocalOnlyTabs();
        const systemDefaultClientTabIds = window.SYSTEM_DEFAULT_GAME_TABS
            ? Object.values(window.SYSTEM_DEFAULT_GAME_TABS).map(def => def.client_tab_id)
            : [];

        const systemTabs = [];
        const customTabs = [];

        for (const tabId in tabsToRenderData) {
            if (systemDefaultClientTabIds.includes(tabId)) {
                systemTabs.push({ id: tabId, name: tabsToRenderData[tabId].name });
            } else {
                customTabs.push({ id: tabId, name: tabsToRenderData[tabId].name });
            }
        }

        // Sort system tabs (primary first, then alphabetical)
        systemTabs.sort((a, b) => {
            if (a.id === PRIMARY_DEFAULT_TAB_ID) return -1;
            if (b.id === PRIMARY_DEFAULT_TAB_ID) return 1;
            return a.name.localeCompare(b.name);
        });
        // Sort custom tabs alphabetically
        customTabs.sort((a, b) => a.name.localeCompare(b.name));

        // Render system tabs
        if (systemTabs.length > 0 && systemTabsLabel) {
            systemTabsLabel.style.display = 'list-item'; // Show label
            systemTabs.forEach(tab => {
                // createTabFromLocalData inserts before addTabBtnLi by default.
                // We need to ensure it inserts before the systemTabsLabel's next sibling (which would be customTabsSeparator)
                const referenceNode = customTabsSeparator || addTabBtnLi;
                createTabFromLocalData(tab.id, tab.name, referenceNode); // Modified createTabFromLocalData needed
                renderGamesForTab(tab.id);
            });
        }


        // Show separator and custom label if there are custom tabs AND system tabs
        if (customTabs.length > 0 && systemTabs.length > 0 && customTabsSeparator) {
            customTabsSeparator.style.display = 'list-item'; // Show separator
        }
        if (customTabs.length > 0 && customTabsLabel) {
            customTabsLabel.style.display = 'list-item'; // Show label
            // Ensure custom label is after separator
            if (customTabsSeparator && customTabsSeparator.parentNode) {
                customTabsSeparator.parentNode.insertBefore(customTabsLabel, customTabsSeparator.nextSibling);
            }
        }


        // Render custom tabs
        customTabs.forEach(tab => {
            // createTabFromLocalData inserts before addTabBtnLi
            createTabFromLocalData(tab.id, tab.name, addTabBtnLi); // Modified createTabFromLocalData needed
            renderGamesForTab(tab.id);
        });
        const customTabsLabelForGames = document.getElementById('customTabsLabel');
        if (customTabsLabelForGames) {
            customTabsLabelForGames.style.display = 'list-item'; // Always show it
            console.log("[Games Init] Set 'Your Custom Sets' label to visible.");
        }

        // Optionally, manage system label and separator visibility here as well if not handled elsewhere
        const systemTabsLabelForGames = document.getElementById('systemTabsLabel');
        let hasSystemTabs = false;
        if (systemTabsLabelForGames && tabListElement) {
            if (tabListElement.querySelector('li.nav-item .nav-link.system-default-tab-link')) {
                 hasSystemTabs = true;
            }
            systemTabsLabelForGames.style.display = hasSystemTabs ? 'list-item' : 'none';
        }

        let hasCustomSection = false; // True if custom tabs exist or can be added
        if (customTabsLabelForGames && customTabsLabelForGames.style.display === 'list-item') {
            // Check if there are actual custom tabs or if the add button is present
             if (tabListElement && (tabListElement.querySelector('li.nav-item .nav-link:not(.system-default-tab-link):not(#addTabBtn)') || addTabBtnLi) ) {
                hasCustomSection = true;
            }
        }
        
        if (customTabsSeparator) {
            customTabsSeparator.style.display = (hasSystemTabs && hasCustomSection) ? 'list-item' : 'none';
        }
        // Ensure Add Tab button and Loading placeholder are at the very end of the tabListElement
        if (tabListElement && addTabBtnLi) tabListElement.appendChild(addTabBtnLi);
        if (tabListElement && loadingPlaceholder) tabListElement.appendChild(loadingPlaceholder);

        // Update anonymous tab count display after all tabs are rendered
        updateAnonymousGameTabCountDisplay();

        // Activate initial tab
        let tabToActivateId = PRIMARY_DEFAULT_TAB_ID;
        if (!tabsToRenderData[PRIMARY_DEFAULT_TAB_ID] && systemTabs.length > 0) {
            tabToActivateId = systemTabs[0].id;
        } else if (!tabsToRenderData[PRIMARY_DEFAULT_TAB_ID] && customTabs.length > 0) {
            tabToActivateId = customTabs[0].id;
        }

        let firstTabLink = document.querySelector(`#gamesTab .nav-link[href="#${tabToActivateId}"]`);
        if (!firstTabLink && (systemTabs.length > 0 || customTabs.length > 0)) { // Fallback to the very first rendered tab
            firstTabLink = tabListElement.querySelector('.nav-item:not(.system-default-group-label):not(.custom-group-label):not(.tabs-spacer) .nav-link');
            if (firstTabLink) tabToActivateId = firstTabLink.getAttribute('href').substring(1);
        }

        console.log("Attempting to activate tab: %s. Link element found:", tabToActivateId, firstTabLink);
        if (firstTabLink && typeof $ !== 'undefined' && $.fn.tab) {
            $(firstTabLink).tab('show');
        } else if (firstTabLink) { /* manual activation ... */ }
        else {
            console.warn("Could not find or activate initial game tab: %s.", tabToActivateId);
            if (gamesTabContent && systemTabs.length === 0 && customTabs.length === 0) {
                gamesTabContent.innerHTML = '<p class="text-center text-secondary p-5">No game tabs available. Try adding one!</p>';
            }
        }

    } catch (error) {
        console.error("Error during Games page initialization:", error);
        showFlash(`Initialization Error: ${error.message}`, "danger"); // User-facing, template literal is fine
        if (gamesTabContent) gamesTabContent.innerHTML = `<div class="alert alert-danger p-5 text-center">Page failed to load: ${escapeHtml(error.message)}.<br>Please try refreshing.</div>`;
    } finally {
        if (loadingPlaceholder) loadingPlaceholder.style.display = 'none';
    }

    // --- Attach Core Event Listeners ---
    if (addTabBtn) {
        addTabBtn.addEventListener("click", (e) => {
            e.preventDefault();
            createNewTab();
        });
    }

    if (duplicateBtn ) {
        duplicateBtn.addEventListener('click', handleDuplicateTab);
    } 

    gamesTabContent.addEventListener("click", (e) => {
        if (e.target?.classList.contains("insertGameBtn")) {
            const tabId = e.target.getAttribute("data-tab");
            window.currentTargetTab = tabId;
            try {
                document.getElementById("newGameAlert")?.replaceChildren();
                document.getElementById("newGameForm")?.reset();
                if (typeof $ !== 'undefined' && $.fn.modal) {
                    $('#newGameModal').modal('show');
                } else {
                    console.error("jQuery or Bootstrap modal function not available for newGameModal.");
                }
            } catch (modalError) {
                console.error("Error showing new game modal:", modalError);
                showFlash("Could not open the new game form.", "danger");
            }
        } else if (e.target?.classList.contains("reset-tab-to-default-btn") || e.target.closest('.reset-tab-to-default-btn')) {
            handleResetTabToDefault(e);
        }
    });

    document.addEventListener("dblclick", (e) => {
        const targetRow = e.target.closest("tr");
        if (targetRow && targetRow.dataset.gameName && targetRow.dataset.entryIds && targetRow.parentElement?.classList.contains("gamesTable")) {
            const tabPane = targetRow.closest(".tab-pane");
            if (tabPane) {
                window.currentTargetTab = tabPane.id;
                const gameName = targetRow.dataset.gameName;
                let entryIds = [];
                try {
                    entryIds = JSON.parse(targetRow.dataset.entryIds);
                } catch (parseError) {
                    console.error("Failed to parse entry IDs for editing:", parseError);
                    showFlash("Error loading game data for editing.", "danger");
                    return;
                }

                if (!Array.isArray(entryIds) || entryIds.length === 0) {
                    console.error("No valid entry IDs found for game:", gameName);
                    showFlash("No specific entries found for this game group to edit.", "info");
                    return;
                }

                const modal = document.getElementById('editGameModal');
                const gameNameDisplay = document.getElementById("editGameNameDisplay");
                const gameNameHidden = document.getElementById("editGameNameHidden");
                const modesContainer = document.getElementById("editGameModesContainer");
                const alertContainer = document.getElementById("editGameAlert");
                const gameTagsInput = document.getElementById("editGameTags"); // Get the tags input

                if (!modal || !gameNameDisplay || !gameNameHidden || !modesContainer || !alertContainer || !gameTagsInput) {
                    console.error("Edit modal core elements are missing!");
                    showFlash("Error opening edit form - UI elements missing.", "danger");
                    return;
                }

                modesContainer.innerHTML = '<p class="text-muted p-3">Loading modes...</p>';
                alertContainer.replaceChildren();
                gameNameDisplay.textContent = gameName;
                gameNameHidden.value = gameName;
                gameTagsInput.value = ""; // Clear previous tags

                let originalEntriesForModal = [];
                try {
                    const allEntriesForTab = isLoggedIn ?
                        (window.userTabsData.entries[window.currentTargetTab] || []) :
                        (getLocalOnlyEntries()[window.currentTargetTab] || []);

                    originalEntriesForModal = allEntriesForTab.filter(entry => entryIds.includes(String(entry.id)));
                } catch (fetchError) {
                    console.error("Error fetching original entries for edit modal:", fetchError);
                    modesContainer.innerHTML = '<p class="text-danger p-3">Error loading game details.</p>';
                    return;
                }

                if (originalEntriesForModal.length === 0) {
                    modesContainer.innerHTML = '<p class="text-warning p-3">Could not find specific entries for this game.</p>';
                    return;
                }
                
                // Populate general game tags from the first entry (assuming tags are consistent for the game name)
                if (originalEntriesForModal.length > 0 && Array.isArray(originalEntriesForModal[0].tags) && gameTagsInput.options) {
                    const tagsToSelect = originalEntriesForModal[0].tags;
                    for (let i = 0; i < gameTagsInput.options.length; i++) {
                        gameTagsInput.options[i].selected = tagsToSelect.includes(gameTagsInput.options[i].value);
                    }
                } else if (gameTagsInput.options) { // Clear selection if no tags
                    for (let i = 0; i < gameTagsInput.options.length; i++) {
                        gameTagsInput.options[i].selected = false;
                    }
                }


                let modesHtml = '';
                originalEntriesForModal.sort((a, b) => (a.gameMode || '').localeCompare(b.gameMode || '')).forEach((entry) => {
                    const displayMode = escapeHtml(entry.gameMode || '');
                    const difficultyVal = parseFloat(entry.difficulty);
                    const playersVal = parseInt(entry.numberOfPlayers, 10);
                    const difficulty = !isNaN(difficultyVal) ? difficultyVal.toFixed(1) : '';
                    const players = !isNaN(playersVal) ? playersVal : '';

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

                try {
                    if (typeof $ !== 'undefined' && $.fn.modal) {
                        $('#editGameModal').modal('show');
                    } else {
                        console.error("jQuery or Bootstrap modal function not available for editGameModal.");
                    }
                }
                catch (modalError) { console.error("Error showing edit game modal:", modalError); }
            }
        }
    });

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
            document.querySelector("#editGameModal .modal-body")?.addEventListener('click', handleDeleteSingleMode);
            editGameListenersAttached = true;
        }
    });

    console.log("Attaching game extension handlers...");
    try {
        attachTabRenameHandler();
        attachDeleteTabHandler();
        
    } catch (extError) {
        console.error("Error attaching game extension handlers:", extError);
    }

    // Add tooltip listeners for game entry rows
    if (gamesTabContent) {
        gamesTabContent.addEventListener('mouseover', (event) => {
            const targetElement = event.target;
            const row = targetElement.closest('tr');

            if (row && row.parentElement && row.parentElement.classList.contains('gamesTable')) {
                if (row.parentElement.rows.length > 0 && !row.querySelector('td[colspan="4"]')) {
                    showRowTooltip(event);
                }
            }
        });
        gamesTabContent.addEventListener('mouseout', (event) => {
            const targetElement = event.target;
            const row = targetElement.closest('tr');
            if (row && row.parentElement && row.parentElement.classList.contains('gamesTable')) {
                 // Check if the relatedTarget (where the mouse moved to) is outside the row
                if (!row.contains(event.relatedTarget)) {
                    hideRowTooltip();
                }
            } else if (!targetElement.closest('.custom-tooltip')) { 
                // If mouseout is not from a row and not to the tooltip itself, hide.
                // This handles moving out of gamesTabContent entirely.
                hideRowTooltip();
            }
        });
        gamesTabContent.addEventListener('mousemove', (event) => {
            const targetElement = event.target;
            const row = targetElement.closest('tr');
            
            if (row && row.parentElement && row.parentElement.classList.contains('gamesTable') && 
                row.parentElement.rows.length > 0 && !row.querySelector('td[colspan="4"]')) {
                 updateRowTooltipPosition(event);
            } else {
                // If not over a valid data row, ensure tooltip is hidden
                // This helps if mouse moves quickly out of a row onto the table padding for example
                // but only if the mouse isn't over the tooltip itself
                if (!targetElement.closest('.custom-tooltip')) {
                    hideRowTooltip();
                }
            }
        });
    }

    console.log("Games page initialization finished.");
});
