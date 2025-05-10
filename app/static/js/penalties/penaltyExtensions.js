// app/static/js/penalties/penaltyExtensions.js

import {
    createTabFromLocalData as createPenaltyTabUI, // Renamed for clarity
    getNextPenaltyTabIdNumber
} from "./penaltyTabManagement.js"; 
import { renderPenaltiesForTab } from "./penaltyEntryManagement.js";
import { confirmModal, showFlash } from "../utils/helpers.js";
import { apiFetch } from "../utils/api.js";
import { updatePenaltyTabGroupVisibility } from "./penalties.js"; // To be created in penalties.js

// For ensureUserDefaultPenaltyTabs
import {
    initLocalStorage as initPenaltyLocalStorageIfAbsent,
    getLocalOnlyTabs as getLocalOnlyPenaltyTabs,
    getLocalOnlyEntries as getLocalOnlyPenaltyEntries,
    setLocalOnlyTabs as setLocalOnlyPenaltyTabs,
    setLocalOnlyEntries as setLocalOnlyPenaltyEntries
} from "./penaltyLocalStorageUtils.js";

// --- Autosave Logic for Penalties ---
let penaltyAutosaveTimeout = null;
let isCurrentlySavingPenalties = false;

function debouncePenalty(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => { clearTimeout(timeout); func.apply(this, args); };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

async function performPenaltySave(tabId) {
    const isLoggedIn = window.isLoggedIn === true;
    if (!isLoggedIn || isCurrentlySavingPenalties || !tabId) return;

    if (!window.userPenaltyTabsData || !window.userPenaltyTabsData.tabs || !window.userPenaltyTabsData.entries) {
        console.error("[Penalty Autosave] Critical data missing in window.userPenaltyTabsData.");
        showFlash("Penalty autosave failed: Internal data error.", "danger");
        return;
    }
    
    const tabToSave = window.userPenaltyTabsData.tabs[tabId];
    const penaltiesToSave = window.userPenaltyTabsData.entries[tabId]; // Use 'entries' for consistency

    if (!tabToSave) {
        console.warn(`[Penalty Autosave] Tab data for ${tabId} not found. Skipping save.`);
        return;
    }
    if (!Array.isArray(penaltiesToSave)) {
        window.userPenaltyTabsData.entries[tabId] = [];
    }

    isCurrentlySavingPenalties = true;
    // console.log(`[Penalty Autosave] Saving tab ${tabId}: Name: ${tabToSave.name}, Penalties: ${penaltiesToSave?.length || 0}`);

    try {
        const payload = { 
            tabId: tabId, 
            tabName: tabToSave.name,
            penalties: penaltiesToSave || [] // API expects 'penalties' key
        };
        const csrfToken = window.csrfToken;
        const response = await apiFetch('/api/penalties/save_tab', { method: 'POST', body: payload }, csrfToken);

        if (response.status === 'ok') {
            // console.log(`[Penalty Autosave] Tab ${tabId} saved successfully.`);
            showFlash("Penalty changes saved ✓", "success", 2000);
            if (response.saved_tab && window.userPenaltyTabsData) {
                const savedTabFromServer = response.saved_tab;
                window.userPenaltyTabsData.tabs[savedTabFromServer.client_tab_id] = { name: savedTabFromServer.tab_name };
                window.userPenaltyTabsData.entries[savedTabFromServer.client_tab_id] = savedTabFromServer.penalties || [];
                
                const activeLink = document.querySelector("#penaltiesTab .nav-link.active");
                const activeTabId = activeLink?.getAttribute("href")?.substring(1);
                if (activeTabId === savedTabFromServer.client_tab_id) {
                    renderPenaltiesForTab(activeTabId);
                }
            }
        } else {
            throw new Error(response.error || 'Unknown server error during penalty save.');
        }
    } catch (error) {
        console.error(`[Penalty Autosave] Error saving tab ${tabId}:`, error);
        showFlash(`Penalty autosave failed: ${error.message}`, 'danger', 5000);
    } finally {
        isCurrentlySavingPenalties = false;
    }
}

const debouncedPenaltySave = debouncePenalty(performPenaltySave, 2500);

export function triggerAutosavePenalties(tabId) {
    if (!window.isLoggedIn || !tabId) return;
    // console.log(`[Penalty Autosave] Triggered for tab ${tabId}.`);
    debouncedPenaltySave(tabId);
}
// --- END Autosave Logic ---

// --- Tab Rename Handler for Penalties ---
export function attachPenaltyTabRenameHandler() {
    // Attach to a static parent element that exists on page load.
    // '.config-page-container' is a good candidate if it wraps the tabs.
    const tabAreaContainer = document.querySelector(".config-page-container"); 
    
    if (!tabAreaContainer) {
        console.error("Could not find '.config-page-container' to attach penalty tab rename listener.");
        return;
    }

    let activeRenameLink = null; // Stores the link being renamed
    let activeRenameId = null;   // Stores the ID of the tab being renamed

    // Use event delegation for dynamically added tabs
    tabAreaContainer.addEventListener("dblclick", (e) => {
        // Find the closest nav-link that was double-clicked
        const link = e.target.closest("#penaltiesSystemTabList .nav-link, #penaltiesCustomTabList .nav-link");

        if (!link) return; // Double-click was not on a tab link

        // Prevent renaming system default tabs (assuming they have a specific class or ID pattern)
        // System default tabs created by createTabFromLocalData have 'system-default-tab-link' class.
        if (link.classList.contains('system-default-tab-link')) {
            showFlash("System default penalty tabs cannot be renamed.", "info");
            return;
        }
        // Also, don't try to rename the "Add Tab" button if it's styled as a nav-link
        if (link.id === 'addPenaltyTabBtn') { // Check against the ID of the add button's <a> tag
            return;
        }

        activeRenameLink = link;
        // Prefer data-tab attribute for the ID, fallback to href
        activeRenameId = link.dataset.tab || link.getAttribute("href")?.substring(1); 

        if (!activeRenameId) {
            console.error("Could not determine tab ID for renaming.");
            activeRenameLink = null;
            return;
        }

        const currentName = link.textContent.trim();
        const renameInput = document.getElementById("renamePenaltyTabInput"); // Input in the modal

        if (!renameInput) { 
            console.error("Rename penalty tab input field (renamePenaltyTabInput) not found in the modal!"); 
            activeRenameLink = null; activeRenameId = null;
            return; 
        }
        
        renameInput.value = currentName;

        // Ensure the modal for renaming penalties is correctly targeted
        // The rename_tab_modal macro generates IDs like 'rename-penalty-modal-label', 'renamePenaltyTabModal'
        const renameModalElement = document.getElementById('renamePenaltyTabModal');
        if (renameModalElement && typeof $ !== 'undefined' && $.fn.modal) {
            $('#renamePenaltyTabModal').modal('show');
        } else {
            console.error("Rename penalty tab modal (renamePenaltyTabModal) not found or jQuery/Bootstrap modal not available.");
            activeRenameLink = null; activeRenameId = null;
        }
    });

    const renameForm = document.getElementById("renamePenaltyTabForm"); // Form in the modal
    if (!renameForm) {
        console.error("Rename penalty tab form (renamePenaltyTabForm) not found!");
        return;
    }

    renameForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const renameInput = document.getElementById("renamePenaltyTabInput");
        const newName = renameInput?.value.trim();
        const currentNameFromLink = activeRenameLink?.textContent.trim(); // Get current name again in case

        if (!activeRenameLink || !activeRenameId || !newName || newName === currentNameFromLink) {
            if (typeof $ !== 'undefined' && $.fn.modal) $('#renamePenaltyTabModal').modal('hide');
            activeRenameLink = null; activeRenameId = null; 
            return;
        }
        
        if (typeof $ !== 'undefined' && $.fn.modal) $('#renamePenaltyTabModal').modal('hide');

        try {
            if (window.isLoggedIn) {
                if (!window.userPenaltyTabsData?.tabs?.[activeRenameId]) {
                    throw new Error("Penalty tab data not found for logged-in user.");
                }
                window.userPenaltyTabsData.tabs[activeRenameId].name = newName;
                activeRenameLink.textContent = newName;
                triggerAutosavePenalties(activeRenameId); // Make sure this function is available
                showFlash("Penalty tab renamed. Saving...", "info", 2000);
            } else { // Anonymous user
                const localTabs = getLocalOnlyPenaltyTabs();
                if (!localTabs[activeRenameId]) {
                    throw new Error("Local penalty tab not found for anonymous user.");
                }
                localTabs[activeRenameId].name = newName;
                setLocalOnlyPenaltyTabs(localTabs);
                activeRenameLink.textContent = newName;
                showFlash("Local penalty tab renamed.", "success");
            }
        } catch (err) {
            console.error("Penalty tab rename failed:", err);
            showFlash(`Failed to rename penalty tab: ${err.message}`, "danger");
            // Revert text content if rename failed
            if (activeRenameLink && currentNameFromLink) {
                activeRenameLink.textContent = currentNameFromLink;
            }
        } finally { 
            activeRenameLink = null; 
            activeRenameId = null; 
        }
    });
}

// --- Delete Tab Handler for Penalties ---
export function attachDeletePenaltyTabHandler() {
    const btn = document.getElementById("deletePenaltyTabBtn"); // Ensure this ID exists in penalties.html
    if (!btn) return;

    btn.addEventListener("click", async () => {
        const activeLink = document.querySelector("#penaltiesTab .nav-link.active");
        if (!activeLink) return showFlash("No active penalty tab selected for deletion.", "warning");
        const tabId = activeLink.getAttribute("href")?.substring(1);
        const tabName = activeLink.textContent.trim() || 'this tab';
        
        const systemDefaultClientTabIds = window.SYSTEM_DEFAULT_PENALTY_TABS
            ? Object.values(window.SYSTEM_DEFAULT_PENALTY_TABS).map(def => def.client_tab_id)
            : [];
        if (systemDefaultClientTabIds.includes(tabId) || tabId.startsWith("default-")) {
             showFlash(`System default penalty tab "${tabName}" cannot be deleted.`, "warning");
             return;
        }
        if (!tabId) return showFlash("Could not identify active penalty tab.", "danger");

        const ok = await confirmModal(`Delete penalty tab "${tabName}"? This cannot be undone.`, "Delete Penalty Tab?");
        if (!ok) return;
        btn.disabled = true;
        try {
            const csrfToken = window.csrfToken;
            const res = await apiFetch("/api/penalties/delete_tab", { method: "POST", body: { tabId: tabId } }, csrfToken);
            if (res.status !== "ok" || res.deleted_tab_id !== tabId) throw new Error(res.error || "Server error.");
            if (window.userPenaltyTabsData) {
                delete window.userPenaltyTabsData.tabs?.[tabId];
                delete window.userPenaltyTabsData.entries?.[tabId];
            }
            activeLink.closest('li.nav-item')?.remove();
            document.getElementById(tabId)?.remove();
            showFlash(`Penalty tab "${tabName}" deleted.`, "success");
            updatePenaltyTabGroupVisibility();
            
            // Activate next available tab
            const PRIMARY_PENALTY_DEFAULT_ID = "default-all-penalties"; // Define this in penalties.js
            let newActiveTabId = PRIMARY_PENALTY_DEFAULT_ID;
            if (!document.querySelector(`#penaltiesTab .nav-link[href="#${newActiveTabId}"]`)) {
                 const allTabs = document.querySelectorAll('#penaltiesTab .nav-item:not(.system-default-group-label):not(.custom-group-label):not(.tabs-spacer) .nav-link');
                 newActiveTabId = allTabs.length > 0 ? allTabs[0].getAttribute("href")?.substring(1) : null;
            }
            if (newActiveTabId) {
                const nextActiveLink = document.querySelector(`#penaltiesTab .nav-link[href="#${newActiveTabId}"]`);
                if (nextActiveLink && typeof $ !== 'undefined' && $.fn.tab) $(nextActiveLink).tab('show');
            } else {
                 document.getElementById('penaltiesTabContent').innerHTML = '<p class="text-center text-secondary p-5">No penalty tabs available.</p>';
            }
        } catch (e) {
            showFlash(`Error deleting penalty tab: ${e.message}`, "danger");
        } finally { btn.disabled = false; }
    });
}

// --- Handle Duplicate Penalty Tab ---
export async function handleDuplicatePenaltyTab() {
    if (!window.isLoggedIn) return showFlash("Login required to duplicate tabs.", "info");
    const activeLink = document.querySelector("#penaltiesTab .nav-link.active");
    if (!activeLink) return showFlash("No active penalty tab to duplicate.", "warning");

    const sourceTabId = activeLink.getAttribute("href")?.substring(1);
    const sourceTabName = activeLink.textContent.trim();
    if (!sourceTabId || !window.userPenaltyTabsData?.tabs?.[sourceTabId] || !window.userPenaltyTabsData?.entries?.[sourceTabId]) {
        return showFlash("Could not find data for active penalty tab.", "danger");
    }

    const MAX_CUSTOM_TABS = 5;
    let customTabCount = 0;
    const systemDefaultClientTabIds = window.SYSTEM_DEFAULT_PENALTY_TABS ? Object.values(window.SYSTEM_DEFAULT_PENALTY_TABS).map(def => def.client_tab_id) : [];
    for (const tabIdInState in window.userPenaltyTabsData.tabs) {
        if (!systemDefaultClientTabIds.includes(tabIdInState)) customTabCount++;
    }
    if (customTabCount >= MAX_CUSTOM_TABS) return showFlash(`Max ${MAX_CUSTOM_TABS} custom penalty tabs reached.`, "warning");

    const newTabName = `Copy of ${sourceTabName}`;
    const newTabIdNumber = getNextPenaltyTabIdNumber();
    const newClientTabId = `penaltyPane-${newTabIdNumber}`;
    const sourceEntries = window.userPenaltyTabsData.entries[sourceTabId];
    const newEntries = JSON.parse(JSON.stringify(sourceEntries || [])); // Deep copy

    window.userPenaltyTabsData.tabs[newClientTabId] = { name: newTabName };
    window.userPenaltyTabsData.entries[newClientTabId] = newEntries;

    const duplicateBtnElement = document.getElementById('duplicatePenaltyTabBtn'); // Ensure this ID exists
    if(duplicateBtnElement) duplicateBtnElement.disabled = true;
    try {
        const payload = { tabId: newClientTabId, tabName: newTabName, penalties: newEntries }; // Use 'penalties'
        const csrfToken = window.csrfToken;
        const response = await apiFetch('/api/penalties/save_tab', { method: 'POST', body: payload }, csrfToken);
        if (response.status === 'ok' && response.saved_tab) {
            window.userPenaltyTabsData.tabs[newClientTabId] = { name: response.saved_tab.tab_name };
            window.userPenaltyTabsData.entries[newClientTabId] = response.saved_tab.penalties || [];
            createPenaltyTabUI(newClientTabId, newTabName);
            renderPenaltiesForTab(newClientTabId);
            const newLink = document.querySelector(`#penaltiesTab .nav-link[href="#${newClientTabId}"]`);
            if (newLink && typeof $ !== 'undefined' && $.fn.tab) $(newLink).tab('show');
            showFlash(`Penalty tab "${sourceTabName}" duplicated.`, "success");
            updatePenaltyTabGroupVisibility();
        } else { throw new Error(response.error || "Server error during penalty tab duplication."); }
    } catch (error) {
        showFlash(`Error duplicating penalty tab: ${error.message}`, "danger");
        delete window.userPenaltyTabsData.tabs[newClientTabId];
        delete window.userPenaltyTabsData.entries[newClientTabId];
        updatePenaltyTabGroupVisibility();
    } finally { if(duplicateBtnElement) duplicateBtnElement.disabled = false; }
}

// --- Ensure User Default Penalty Tabs ---
export async function ensureUserDefaultPenaltyTabs() {
    const SYSTEM_PENALTY_DEFAULT_DEFINITIONS_URL = '/api/penalties/default_definitions';
    const USER_PENALTY_TABS_LOAD_URL = '/api/penalties/load_tabs';
    const USER_PENALTY_TABS_SAVE_URL = '/api/penalties/save_tab';

    console.log("[ensureUserDefaultPenaltyTabs] Starting process...");
    const isLoggedIn = window.isLoggedIn === true;
    const csrfToken = window.csrfToken;
    let systemDefaultPenaltyTabsDefinitions;
    try {
        systemDefaultPenaltyTabsDefinitions = await apiFetch(SYSTEM_PENALTY_DEFAULT_DEFINITIONS_URL);
        if (typeof systemDefaultPenaltyTabsDefinitions !== 'object' || systemDefaultPenaltyTabsDefinitions === null) {
            throw new Error("Invalid system default penalty tab definitions from API.");
        }
    } catch (error) {
        console.error("[ensureUserDefaultPenaltyTabs] Failed to fetch system default definitions:", error);
        throw error;
    }

    if (isLoggedIn) {
        let userSavedTabsFromApi = {};
        try {
            userSavedTabsFromApi = await apiFetch(USER_PENALTY_TABS_LOAD_URL);
            if (typeof userSavedTabsFromApi !== 'object' || userSavedTabsFromApi === null) userSavedTabsFromApi = {};
        } catch (loadError) { console.error("[ensureUserDefaultPenaltyTabs] Error loading user's saved penalty tabs:", loadError); }

        for (const defKey in systemDefaultPenaltyTabsDefinitions) {
            const sysDef = systemDefaultPenaltyTabsDefinitions[defKey];
            const clientTabId = sysDef.client_tab_id;
            if (!userSavedTabsFromApi[clientTabId]) {
                try {
                    // Penalties usually have 'name', 'probability', 'description'. Assume definitions match this.
                    const savePayload = { tabId: clientTabId, tabName: sysDef.name, penalties: sysDef.penalties || [] }; // Use 'penalties'
                    const savedTabResponse = await apiFetch(USER_PENALTY_TABS_SAVE_URL, { method: 'POST', body: savePayload }, csrfToken);
                    if (savedTabResponse.status !== 'ok') console.error(`[ensureUserDefaultPenaltyTabs] Failed to save default penalty tab ${sysDef.name}:`, savedTabResponse.error);
                } catch (saveError) { console.error(`[ensureUserDefaultPenaltyTabs] Exception saving default penalty tab ${clientTabId}:`, saveError); }
            }
        }
    } else {
        initPenaltyLocalStorageIfAbsent();
        let localTabs = getLocalOnlyPenaltyTabs();
        let localEntries = getLocalOnlyPenaltyEntries(); // Use 'entries' for consistency with games
        let updatedLocal = false;
        for (const defKey in systemDefaultPenaltyTabsDefinitions) {
            const sysDef = systemDefaultPenaltyTabsDefinitions[defKey];
            const clientTabId = sysDef.client_tab_id;
            if (!localTabs[clientTabId]) {
                localTabs[clientTabId] = { name: sysDef.name };
                localEntries[clientTabId] = sysDef.penalties || []; // Use 'penalties' from definition
                updatedLocal = true;
            }
        }
        if (updatedLocal) {
            setLocalOnlyPenaltyTabs(localTabs);
            setLocalOnlyPenaltyEntries(localEntries); // Save to localPenaltyEntries
        }
    }
    console.log("[ensureUserDefaultPenaltyTabs] Process finished.");
}
