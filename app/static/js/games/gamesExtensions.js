// app/static/js/games/gamesExtensions.js

import { createTabFromLocalData,getNextTabIdNumber } from "./tabManagement.js";
import { renderGamesForTab } from "./entryManagement.js";
import { confirmModal, showFlash } from "../utils/helpers.js";
import { apiFetch } from "../utils/api.js";
import {
    initLocalStorage as initGameLocalStorageIfAbsent,
    getLocalOnlyTabs,
    getLocalOnlyEntries,
    setLocalOnlyTabs,
    setLocalOnlyEntries
} from "./localStorageUtils.js";
// --- Autosave Logic (remains largely the same, but ensure it uses window.userTabsData correctly) ---
let autosaveTimeout = null;
let isCurrentlySaving = false;

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func.apply(this, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Helper to get current entries for the tab being saved
function getCurrentEntriesForSave(tabId) {
    // For logged-in users, always read from the global JS state
    if (window.isLoggedIn && window.userTabsData?.entries) {
        return window.userTabsData.entries[tabId] || [];
    }
    // Fallback for safety, though autosave is only for logged-in users
    console.warn("[Autosave] Attempted to get entries for save, but user not logged in or state missing.");
    return [];
}

async function performSave(tabId) {
    const isLoggedIn = window.isLoggedIn === true;
    if (!isLoggedIn || isCurrentlySaving || !tabId) return;

    // Safety check: Do not attempt to save if critical data is missing
    if (!window.userTabsData || !window.userTabsData.tabs || !window.userTabsData.entries) {
        console.error("[Autosave] Critical data missing in window.userTabsData. Aborting save.");
        showFlash("Autosave failed: Internal data error.", "danger");
        return;
    }
    
    const tabToSave = window.userTabsData.tabs[tabId];
    const entriesToSave = window.userTabsData.entries[tabId];

    if (!tabToSave) {
        console.warn(`[Autosave] Tab data for ${tabId} not found in state. Skipping save.`);
        // This might happen if a tab was deleted but autosave was still queued.
        return;
    }
    if (!Array.isArray(entriesToSave)) {
        console.warn(`[Autosave] Entries for ${tabId} are not an array or missing. Saving with empty entries.`);
        // To prevent errors, ensure entries is an array, even if empty.
        // This handles cases where a new tab is created and autosave triggers before entries are populated.
        // The backend expects an array for 'entries'.
        window.userTabsData.entries[tabId] = []; // Ensure it's an empty array in state
    }


    isCurrentlySaving = true;
    console.log(`[Autosave] Performing save for tab ${tabId}: Name: ${tabToSave.name}, Entries Count: ${entriesToSave?.length || 0}`);


    try {
        const payload = { 
            tabId: tabId, 
            tabName: tabToSave.name, // Get name from state
            entries: entriesToSave || [] // Get entries from state, default to empty array
        };
        const csrfToken = window.csrfToken;
        const response = await apiFetch('/api/tabs/save', { method: 'POST', body: payload }, csrfToken);

        if (response.status === 'ok') {
            console.log(`[Autosave] Tab ${tabId} saved successfully via API.`);
            showFlash("Changes saved ✓", "success", 2000);
            
            // Update local state with potentially normalized data from response
            if (response.saved_tab && window.userTabsData) {
                const savedTabFromServer = response.saved_tab;
                window.userTabsData.tabs[savedTabFromServer.client_tab_id] = { name: savedTabFromServer.tab_name };
                window.userTabsData.entries[savedTabFromServer.client_tab_id] = savedTabFromServer.entries || [];
                
                // If the active tab was the one saved, re-render it to reflect any server-side normalization
                const activeLink = document.querySelector("#gamesTab .nav-link.active");
                const activeTabId = activeLink?.getAttribute("href")?.substring(1);
                if (activeTabId === savedTabFromServer.client_tab_id) {
                    renderGamesForTab(activeTabId);
                }
            }
        } else {
            throw new Error(response.error || 'Unknown server error during save.');
        }
    } catch (error) {
        console.error(`[Autosave] Error saving tab ${tabId}:`, error);
        showFlash(`Autosave failed: ${error.message}`, 'danger', 5000);
    } finally {
        isCurrentlySaving = false;
    }
}

const debouncedSave = debounce(performSave, 2500); // Increased debounce time slightly

export function triggerAutosave(tabId) {
    const isLoggedIn = window.isLoggedIn === true;
    if (!isLoggedIn) return;
    if (!tabId) {
        console.warn("[Autosave] Trigger called without tabId.");
        return;
    }
    console.log(`[Autosave] Triggered for tab ${tabId}. Debouncing...`);
    debouncedSave(tabId);
}
// --- END Autosave Logic ---

// --- MODIFIED: Tab Rename Handler ---
export function attachTabRenameHandler() {
    const container = document.getElementById("gamesTab");
    if (!container) {
        console.error("Could not find #gamesTab container for rename listener.");
        return;
    }

    let activeLink = null;
    let activeId = null;

    container.addEventListener("dblclick", (e) => {
        const link = e.target.closest(".nav-link");
        if (!link || link.classList.contains('system-default-tab-link') || link.id === 'addTabBtn') { // Check for system-default and add button
            if (link && link.classList.contains('system-default-tab-link')) {
                showFlash("System default tabs cannot be renamed.", "info");
            }
            return;
        }

        activeLink = link;
        activeId = link.dataset.tab || link.getAttribute("href")?.substring(1);
        const currentName = link.textContent.trim();
        const renameInput = document.getElementById("renameGameTabInput");
        
        if (!renameInput) { console.error("Rename modal input not found!"); return; }
        renameInput.value = currentName;

        if (typeof $ !== 'undefined' && $.fn.modal) {
            $('#renameGameTabModal').modal('show');
        } else {
            alert("Could not open rename dialog.");
        }
    });

    const renameForm = document.getElementById("renameGameTabForm");
    if (!renameForm) { console.error("Rename modal form not found!"); return; }

    renameForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const renameInput = document.getElementById("renameGameTabInput");
        const newName = renameInput?.value.trim();
        const currentName = activeLink?.textContent.trim();
        const isLoggedIn = window.isLoggedIn === true;

        if (!activeLink || !activeId || !newName || newName === currentName) {
            if (typeof $ !== 'undefined' && $.fn.modal) $('#renameGameTabModal').modal('hide');
            activeLink = null; activeId = null;
            return;
        }

        if (typeof $ !== 'undefined' && $.fn.modal) $('#renameGameTabModal').modal('hide');

        try {
            if (isLoggedIn) {
                if (!window.userTabsData?.tabs || !window.userTabsData.tabs[activeId]) {
                    throw new Error("Tab data not found in application state for rename.");
                }
                window.userTabsData.tabs[activeId].name = newName;
                activeLink.textContent = newName;
                triggerAutosave(activeId); // Save the renamed tab
                showFlash("Tab renamed. Saving...", "info", 2000);
            } else { // Anonymous user
                const localTabs = getLocalOnlyTabs() || {};
                if (!localTabs[activeId]) throw new Error("Local tab not found for rename.");
                localTabs[activeId].name = newName;
                setLocalOnlyTabs(localTabs);
                activeLink.textContent = newName;
                showFlash("Local tab renamed.", "success");
            }
        } catch (err) {
            console.error("Rename failed:", err);
            showFlash(`Failed to rename tab: ${err.message}`, "danger");
            if (activeLink && currentName) activeLink.textContent = currentName; // Revert UI
        } finally {
            activeLink = null; activeId = null;
        }
    });
}


// --- MODIFIED: Delete Tab Handler ---
export function attachDeleteTabHandler() {
    const btn = document.getElementById("deleteTabBtn");
    if (!btn) return; // Button might not exist if user not logged in

    btn.addEventListener("click", async () => {
        const activeLink = document.querySelector("#gamesTab .nav-link.active");
        if (!activeLink) return showFlash("No active tab selected for deletion.", "warning");

        const tabId = activeLink.getAttribute("href")?.substring(1);
        const tabName = activeLink.textContent.trim() || 'this tab';
        const csrfToken = window.csrfToken;

        // Prevent deletion of system default tabs (identified by their specific client_tab_ids)
        if (window.SYSTEM_DEFAULT_GAME_TABS && window.SYSTEM_DEFAULT_GAME_TABS[tabId]) {
             showFlash(`System default tab "${tabName}" cannot be deleted.`, "warning");
             return;
        }
        // Also check against the pattern if the above fails (e.g. if SYSTEM_DEFAULT_GAME_TABS not populated yet)
        if (tabId && (tabId.startsWith("default-") || tabId === "default")) { // More generic check for any "default-" prefixed tab
            showFlash(`Default tab "${tabName}" cannot be deleted.`, "warning");
            return;
        }


        if (!tabId) { // Should not happen if activeLink is found
            showFlash("Could not identify the active tab for deletion.", "danger");
            return;
        }

        const ok = await confirmModal(`Delete tab "${tabName}"? This cannot be undone.`, "Delete Game Tab?");
        if (!ok) return;

        btn.disabled = true;

        try {
            // API Call (only for logged-in users, as button is hidden otherwise)
            const res = await apiFetch("/api/tabs/delete", {
                method: "POST",
                body: { tabId: tabId }
            }, csrfToken);

            if (res.status !== "ok" || res.deleted_tab_id !== tabId) {
                throw new Error(res.error || "Server error during tab deletion.");
            }

            // SUCCESS: Update UI Dynamically
            console.log(`[Delete Tab] Successfully deleted tab ${tabId} via API.`);

            if (window.userTabsData) {
                delete window.userTabsData.tabs?.[tabId];
                delete window.userTabsData.entries?.[tabId];
            }

            const tabLinkElement = document.getElementById(activeLink.id);
            const tabListItem = tabLinkElement?.closest('li.nav-item');
            const tabPaneElement = document.getElementById(tabId);

            if (tabListItem) tabListItem.remove();
            if (tabPaneElement) tabPaneElement.remove();
            
            showFlash(`Tab "${tabName}" deleted successfully.`, "success");

            // Activate the first available system default tab (e.g., "All Games") or the first custom if no defaults
            let newActiveTabId = Object.keys(window.SYSTEM_DEFAULT_GAME_TABS || {})[0]; // First system default
            if (!newActiveTabId && window.userTabsData && Object.keys(window.userTabsData.tabs).length > 0) {
                newActiveTabId = Object.keys(window.userTabsData.tabs)[0]; // First custom if no system defaults
            } else if (!newActiveTabId) {
                // Fallback if absolutely no tabs left (should ideally not happen if system defaults exist)
                console.warn("[Delete Tab] No tabs left to activate.");
                // Potentially create a fresh "All Games" tab if all were deleted
            }

            if (newActiveTabId) {
                const nextActiveLink = document.querySelector(`#gamesTab .nav-link[href="#${newActiveTabId}"]`);
                if (nextActiveLink && typeof $ !== 'undefined' && $.fn.tab) {
                    $(nextActiveLink).tab('show');
                } else {
                    console.warn(`[Delete Tab] Could not activate tab ${newActiveTabId}.`);
                }
            }

        } catch (e) {
            console.error("Delete tab failed:", e);
            showFlash(`Error deleting tab: ${e.message}`, "danger");
        } finally {
            btn.disabled = false;
        }
    });
}

// --- MODIFIED: loadUserTabsFromAPI ---
// This function now ONLY loads tabs from the API and renders them.
// The logic for creating initial default tabs if they don't exist for the user
// will be handled in games.js BEFORE this function is called.
export async function loadUserTabsFromAPI() {
    console.log("[Load API Tabs] Attempting to load user game tabs...");
    const loadingPlaceholder = document.getElementById('loadingTabsPlaceholder');
    const tabList = document.getElementById('gamesTab');
    const tabContent = document.getElementById('gamesTabContent');

    if (loadingPlaceholder) loadingPlaceholder.style.display = 'block';

    // Clear only non-system-default, non-add-button tabs (if any were rendered by mistake or from previous state)
    if (tabList) {
        const itemsToRemove = [];
        tabList.querySelectorAll('.nav-item').forEach(item => {
            const link = item.querySelector('a.nav-link');
            if (link && !link.classList.contains('system-default-tab-link') && link.id !== 'addTabBtn') {
                // Further check to ensure it's not one of the client_tab_ids from SYSTEM_DEFAULT_GAME_TABS
                const hrefTarget = link.getAttribute("href")?.substring(1);
                if (!window.SYSTEM_DEFAULT_GAME_TABS || !window.SYSTEM_DEFAULT_GAME_TABS[hrefTarget]) {
                    itemsToRemove.push(item);
                }
            }
        });
        itemsToRemove.forEach(item => item.remove());
        console.log(`[Load API Tabs] Cleared ${itemsToRemove.length} existing non-system-default custom tab links for games.`);
    }

    if (tabContent) {
        const panesToRemove = [];
        tabContent.querySelectorAll('.tab-pane').forEach(pane => {
            if (!pane.classList.contains('system-default-pane')) {
                 // Further check to ensure it's not one of the client_tab_ids from SYSTEM_DEFAULT_GAME_TABS
                if (!window.SYSTEM_DEFAULT_GAME_TABS || !window.SYSTEM_DEFAULT_GAME_TABS[pane.id]) {
                    panesToRemove.push(pane);
                }
            }
        });
        panesToRemove.forEach(pane => pane.remove());
        console.log(`[Load API Tabs] Cleared non-system-default custom tab panes for games.`);
    }


    try {
        const data = await apiFetch('/api/tabs/load'); // Fetches ALL tabs for the user from DB
        console.log("[Load API Tabs] Raw API Response (Games):", JSON.stringify(data, null, 2));
        if (typeof data !== 'object' || data === null) throw new Error("Invalid data format from game tabs API.");

        // window.userTabsData should have been pre-populated with system defaults by games.js
        // Now, merge/update with user's saved tabs from API.
        // API data takes precedence for tabs that have the same client_tab_id as a system default.
        if (!window.userTabsData) window.userTabsData = { tabs: {}, entries: {} };


        // Determine which tab to activate. Prioritize:
        // 1. First user-created custom tab (not a system default).
        // 2. If none, first system default tab (e.g., "default-all-games").
        let firstUserCustomTabId = null;
        let firstSystemDefaultTabIdFromAPI = null; // If a system default was saved by user

        const sortedTabIds = Object.keys(data).sort((a, b) => {
            // Simple sort, system defaults might not be first if user saved them later
            const isSystemA = window.SYSTEM_DEFAULT_GAME_TABS && window.SYSTEM_DEFAULT_GAME_TABS[a];
            const isSystemB = window.SYSTEM_DEFAULT_GAME_TABS && window.SYSTEM_DEFAULT_GAME_TABS[b];
            if (isSystemA && !isSystemB) return -1; // System defaults first
            if (!isSystemA && isSystemB) return 1;
            // Then sort by name or original order if needed
            return (data[a]?.tab_name || a).localeCompare(data[b]?.tab_name || b);
        });
        
        for (const tabId of sortedTabIds) {
            const tabData = data[tabId];
            if (!tabData) continue;

            const isSystemDefaultKey = window.SYSTEM_DEFAULT_GAME_TABS && window.SYSTEM_DEFAULT_GAME_TABS[tabId];

            // Update state with data from API
            window.userTabsData.tabs[tabId] = { name: tabData.tab_name || `Tab ${tabId}` };
            window.userTabsData.entries[tabId] = Array.isArray(tabData.entries) ? tabData.entries : [];

            // Create UI for this tab (if it's not a system default that was already rendered by games.js)
            // The check `!document.getElementById(tabId)` ensures we don't re-create UI for system defaults
            // if games.js already rendered them.
            if (!document.getElementById(tabId)) { // Check if pane exists
                 createTabFromLocalData(tabId, window.userTabsData.tabs[tabId].name);
            }
            renderGamesForTab(tabId); // Render its content

            if (!isSystemDefaultKey && !firstUserCustomTabId) {
                firstUserCustomTabId = tabId;
            }
            if (isSystemDefaultKey && !firstSystemDefaultTabIdFromAPI) {
                firstSystemDefaultTabIdFromAPI = tabId;
            }
        }
        
        // Determine which tab to activate
        const tabToActivate = firstUserCustomTabId || firstSystemDefaultTabIdFromAPI || (window.SYSTEM_DEFAULT_GAME_TABS ? Object.keys(window.SYSTEM_DEFAULT_GAME_TABS)[0] : null);

        if (tabToActivate) {
            const tabLink = document.querySelector(`#gamesTab .nav-link[href="#${tabToActivate}"]`);
            if (tabLink && typeof $ !== 'undefined' && $.fn.tab) {
                $(tabLink).tab('show');
                console.log(`[Load API Tabs] Activated game tab: ${tabToActivate}`);
            } else {
                console.warn(`[Load API Tabs] Could not find or activate game tab ${tabToActivate}.`);
            }
        } else {
            console.warn("[Load API Tabs] No tabs available to activate after loading.");
        }

        console.log("[Load API Tabs] User game tabs processing complete.");
        // apiLoadFailed = false; // This will be handled by games.js

    } catch (error) {
        console.error("[Load API Tabs] Error loading user game tabs from API:", error);
        showFlash(`Could not load your saved game tabs: ${error.message}. Using local backup if available.`, "danger");
        // apiLoadFailed = true; // This will be handled by games.js
        throw error; // Re-throw to be caught by games.js
    } finally {
        if (loadingPlaceholder) loadingPlaceholder.style.display = 'none';
    }
}


export async function handleDuplicateTab() {
    const isLoggedIn = window.isLoggedIn === true;
    if (!isLoggedIn) {
        showFlash("Login required to duplicate tabs.", "info");
        return;
    }

    const activeLink = document.querySelector("#gamesTab .nav-link.active");
    if (!activeLink) {
        showFlash("No active tab selected to duplicate.", "warning");
        return;
    }

    const sourceTabId = activeLink.getAttribute("href")?.substring(1);
    const sourceTabName = activeLink.textContent.trim();

    if (!sourceTabId || !window.userTabsData?.tabs?.[sourceTabId] || !window.userTabsData?.entries?.[sourceTabId]) {
        showFlash("Could not find data for the active tab to duplicate.", "danger");
        console.error(`[Duplicate Tab] Source tab data missing for ID: ${sourceTabId}`);
        return;
    }

    const MAX_CUSTOM_TABS = 5; // Should match games.js or be a shared constant
    let customTabCount = 0;
    for (const tabId in window.userTabsData.tabs) {
        if (!window.SYSTEM_DEFAULT_GAME_TABS || !window.SYSTEM_DEFAULT_GAME_TABS[tabId]) {
            customTabCount++;
        }
    }

    if (customTabCount >= MAX_CUSTOM_TABS) {
        showFlash(`Cannot duplicate: You have reached the maximum limit of ${MAX_CUSTOM_TABS} custom tabs.`, "warning");
        return;
    }

    const newTabName = `Copy of ${sourceTabName}`;
    const newTabIdNumber = getNextTabIdNumber(); // From tabManagement.js
    const newClientTabId = `tabPane-${newTabIdNumber}`; // New custom tab ID

    // Deep copy entries. Ensure IDs within entries are also new if necessary,
    // or understand if backend handles ID conflicts if entries are globally unique.
    // For now, assuming entries are just data blobs for the tab.
    const sourceEntries = window.userTabsData.entries[sourceTabId];
    const newEntries = JSON.parse(JSON.stringify(sourceEntries || [])); // Deep copy

    // Create new tab in local state
    window.userTabsData.tabs[newClientTabId] = { name: newTabName };
    window.userTabsData.entries[newClientTabId] = newEntries;

    console.log(`[Duplicate Tab] Duplicating "${sourceTabName}" (ID: ${sourceTabId}) into "${newTabName}" (New ID: ${newClientTabId})`);

    // Save the new duplicated tab via API
    const duplicateBtnElement = document.getElementById('duplicateTabBtn');
    if(duplicateBtnElement) duplicateBtnElement.disabled = true;

    try {
        const payload = {
            tabId: newClientTabId,
            tabName: newTabName,
            entries: newEntries
        };
        const csrfToken = window.csrfToken;
        const response = await apiFetch('/api/tabs/save', { method: 'POST', body: payload }, csrfToken);

        if (response.status === 'ok' && response.saved_tab) {
            // Update state with potentially normalized data from server (though it should match)
            window.userTabsData.tabs[newClientTabId] = { name: response.saved_tab.tab_name };
            window.userTabsData.entries[newClientTabId] = response.saved_tab.entries || [];

            // Create UI for the new tab
            createTabFromLocalData(newClientTabId, newTabName); // From tabManagement.js
            renderGamesForTab(newClientTabId); // From entryManagement.js

            // Activate the new duplicated tab
            const newLink = document.querySelector(`#gamesTab .nav-link[href="#${newClientTabId}"]`);
            if (newLink && typeof $ !== 'undefined' && $.fn.tab) {
                $(newLink).tab('show');
            }
            showFlash(`Tab "${sourceTabName}" duplicated as "${newTabName}".`, "success");
        } else {
            throw new Error(response.error || "Server error during tab duplication.");
        }
    } catch (error) {
        console.error(`[Duplicate Tab] Error duplicating tab ${sourceTabId}:`, error);
        showFlash(`Error duplicating tab: ${error.message}`, "danger");
        // Rollback local state changes if API save failed
        delete window.userTabsData.tabs[newClientTabId];
        delete window.userTabsData.entries[newClientTabId];
    } finally {
        if(duplicateBtnElement) duplicateBtnElement.disabled = false;
    }
}

export async function ensureUserDefaultGameTabs() {
    // --- DEFINE Constants INSIDE the function ---
    const SYSTEM_GAME_DEFAULT_DEFINITIONS_URL_LOCAL = '/api/games/default_definitions';
    const USER_GAME_TABS_LOAD_URL_LOCAL = '/api/tabs/load';
    const USER_GAME_TABS_SAVE_URL_LOCAL = '/api/tabs/save';
    // --- END DEFINE Constants ---

    console.log("[ensureUserDefaultGameTabs] Starting process...");
    const isLoggedIn = window.isLoggedIn === true; 
    const csrfToken = window.csrfToken; 

    let systemDefaultGameTabsDefinitions;
    try {
        // Use the locally defined constant
        systemDefaultGameTabsDefinitions = await apiFetch(SYSTEM_GAME_DEFAULT_DEFINITIONS_URL_LOCAL);
        if (typeof systemDefaultGameTabsDefinitions !== 'object' || systemDefaultGameTabsDefinitions === null) {
            throw new Error("Invalid system default game tab definitions received from API.");
        }
        console.log("[ensureUserDefaultGameTabs] System default definitions fetched.");
    } catch (error) {
        console.error("[ensureUserDefaultGameTabs] Failed to fetch system default definitions:", error);
        showFlash("Error: Could not load initial game configurations.", "danger");
        throw error; 
    }

    if (isLoggedIn) {
        console.log("[ensureUserDefaultGameTabs] User is logged in. Checking backend for default tabs.");
        let userSavedTabsFromApi = {};
        try {
            // Use the locally defined constant
            userSavedTabsFromApi = await apiFetch(USER_GAME_TABS_LOAD_URL_LOCAL);
            if (typeof userSavedTabsFromApi !== 'object' || userSavedTabsFromApi === null) {
                userSavedTabsFromApi = {};
            }
        } catch (loadError) {
            console.error("[ensureUserDefaultGameTabs] Error loading user's saved tabs:", loadError);
        }

        for (const defKey in systemDefaultGameTabsDefinitions) {
            const sysDef = systemDefaultGameTabsDefinitions[defKey];
            const clientTabId = sysDef.client_tab_id;

            if (!userSavedTabsFromApi[clientTabId]) {
                console.log(`[ensureUserDefaultGameTabs] System default game tab "${sysDef.name}" (ID: ${clientTabId}) not found for user. Creating and saving...`);
                try {
                    const transformedInitialEntries = (sysDef.entries || []).map(entry => ({
                        id: entry.id || ("local-g-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9)),
                        game: entry.Spiel,
                        gameMode: entry.Spielmodus,
                        difficulty: (parseFloat(entry.Schwierigkeit) || 1.0).toFixed(1),
                        numberOfPlayers: parseInt(entry.Spieleranzahl, 10) || 1,
                        weight: parseFloat(entry.weight) || 1.0
                    }));

                    const savePayload = {
                        tabId: clientTabId,
                        tabName: sysDef.name,
                        entries: transformedInitialEntries
                    };
                    // Use the locally defined constant
                    const savedTabResponse = await apiFetch(USER_GAME_TABS_SAVE_URL_LOCAL, { method: 'POST', body: savePayload }, csrfToken);
                    
                    if (savedTabResponse.status !== 'ok') {
                        console.error(`[ensureUserDefaultGameTabs] Failed to save system default tab ${sysDef.name} for user:`, savedTabResponse.error);
                    } else {
                        console.log(`[ensureUserDefaultGameTabs] Successfully saved new system default tab "${sysDef.name}" for user.`);
                    }
                } catch (saveError) {
                    console.error(`[ensureUserDefaultGameTabs] Exception while saving system default game tab ${clientTabId} for user:`, saveError);
                }
            }
        }
        console.log("[ensureUserDefaultGameTabs] Logged-in user default tab check complete.");

    } else { // Anonymous user
        console.log("[ensureUserDefaultGameTabs] User is anonymous. Checking localStorage for default tabs.");
        initGameLocalStorageIfAbsent(); 
        let localTabs = getLocalOnlyTabs();
        let localEntries = getLocalOnlyEntries();
        let updatedLocal = false;

        for (const defKey in systemDefaultGameTabsDefinitions) {
            const sysDef = systemDefaultGameTabsDefinitions[defKey];
            const clientTabId = sysDef.client_tab_id;

            if (!localTabs[clientTabId]) {
                console.log(`[ensureUserDefaultGameTabs] System default game tab "${sysDef.name}" not found in localStorage. Adding...`);
                localTabs[clientTabId] = { name: sysDef.name };
                localEntries[clientTabId] = (sysDef.entries || []).map(entry => ({
                    id: entry.id || ("local-g-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9)),
                    game: entry.Spiel,
                    gameMode: entry.Spielmodus,
                    difficulty: (parseFloat(entry.Schwierigkeit) || 1.0).toFixed(1),
                    numberOfPlayers: parseInt(entry.Spieleranzahl, 10) || 1,
                    weight: parseFloat(entry.weight) || 1.0
                }));
                updatedLocal = true;
            }
        }
        if (updatedLocal) {
            setLocalOnlyTabs(localTabs);
            setLocalOnlyEntries(localEntries);
            console.log("[ensureUserDefaultGameTabs] localStorage updated with system default game tabs.");
        } else {
            console.log("[ensureUserDefaultGameTabs] localStorage already contains all system default game tabs.");
        }
    }
    console.log("[ensureUserDefaultGameTabs] Process finished.");
}
