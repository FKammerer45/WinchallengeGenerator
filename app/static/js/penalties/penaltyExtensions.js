// Suggested changes for app/static/js/penalties/penaltyExtensions.js

import {
    getLocalOnlyTabs as getLocalOnlyPenaltyTabs,
    setLocalOnlyTabs as setLocalOnlyPenaltyTabs,
    getLocalOnlyEntries as getLocalOnlyPenaltyEntries,
    setLocalOnlyEntries as setLocalOnlyPenaltyEntries
} from "./penaltyLocalStorageUtils.js";
import { apiFetch } from "../utils/api.js";
import { confirmModal, showFlash } from "../utils/helpers.js";
import { updatePenaltyTabGroupVisibility } from "./penalties.js"; // To be created in penalties.js
// For ensureUserDefaultPenaltyTabs
import {
    initLocalStorage as initPenaltyLocalStorageIfAbsent
    // getLocalOnlyPenaltyTabs, getLocalOnlyPenaltyEntries, setLocalOnlyPenaltyTabs, setLocalOnlyPenaltyEntries (already imported above)
} from "./penaltyLocalStorageUtils.js";
import { getNextPenaltyTabIdNumber } from "./penaltyTabManagement.js";

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
    const penaltiesToSave = window.userPenaltyTabsData.entries[tabId];

    if (!tabToSave) {
        console.warn(`[Penalty Autosave] Tab data for ${tabId} not found. Skipping save.`);
        return;
    }
    if (!Array.isArray(penaltiesToSave)) {
        window.userPenaltyTabsData.entries[tabId] = [];
    }

    isCurrentlySavingPenalties = true;

    try {
        const payload = {
            tabId: tabId,
            tabName: tabToSave.name,
            penalties: penaltiesToSave || []
        };
        const csrfToken = window.csrfToken;
        const response = await apiFetch('/api/penalties/save_tab', { method: 'POST', body: payload }, csrfToken);

        if (response.status === 'ok') {
            showFlash("Penalty changes saved ✓", "success", 2000);
            if (response.saved_tab && window.userPenaltyTabsData) {
                const savedTabFromServer = response.saved_tab;
                window.userPenaltyTabsData.tabs[savedTabFromServer.client_tab_id] = { name: savedTabFromServer.tab_name };
                window.userPenaltyTabsData.entries[savedTabFromServer.client_tab_id] = savedTabFromServer.penalties || [];

                const activeLink = document.querySelector("#penaltiesTab .nav-link.active"); // Corrected selector for penalties page
                const activeTabId = activeLink?.getAttribute("href")?.substring(1);
                if (activeTabId === savedTabFromServer.client_tab_id) {
                    // Dynamically import renderPenaltiesForTab
                    const { renderPenaltiesForTab } = await import('./penaltyEntryManagement.js');
                    if (typeof renderPenaltiesForTab === "function") {
                        renderPenaltiesForTab(activeTabId);
                    } else {
                        console.warn("renderPenaltiesForTab function not available to refresh tab after save.");
                    }
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
    debouncedPenaltySave(tabId);
}

// --- Tab Rename Handler for Penalties ---
export function attachPenaltyTabRenameHandler() {
    const tabAreaContainer = document.querySelector(".config-page-container");

    if (!tabAreaContainer) {
        console.error("Could not find '.config-page-container' to attach penalty tab rename listener.");
        return;
    }

    let activeRenameLink = null;
    let activeRenameId = null;

    tabAreaContainer.addEventListener("dblclick", (e) => {
        const link = e.target.closest("#penaltiesSystemTabList .nav-link, #penaltiesCustomTabList .nav-link");
        if (!link) return;

        if (link.classList.contains('system-default-tab-link')) {
            showFlash("System default penalty tabs cannot be renamed.", "info");
            return;
        }
        const addPenaltyTabButton = document.getElementById('addPenaltyTabBtn');
        if (addPenaltyTabButton && link.id === addPenaltyTabButton.id) { // check if the link is the add button itself
            return;
        }


        activeRenameLink = link;
        activeRenameId = link.dataset.tab || link.getAttribute("href")?.substring(1);

        if (!activeRenameId) {
            console.error("Could not determine tab ID for renaming.");
            activeRenameLink = null;
            return;
        }

        const currentName = link.textContent.trim();
        const renameInput = document.getElementById("renamePenaltyTabInput");

        if (!renameInput) {
            console.error("Rename penalty tab input field (renamePenaltyTabInput) not found in the modal!");
            activeRenameLink = null; activeRenameId = null;
            return;
        }

        renameInput.value = currentName;
        const renameModalElement = document.getElementById('renamePenaltyTabModal');
        if (renameModalElement && typeof $ !== 'undefined' && $.fn.modal) {
            $('#renamePenaltyTabModal').modal('show');
        } else {
            console.error("Rename penalty tab modal (renamePenaltyTabModal) not found or jQuery/Bootstrap modal not available.");
            activeRenameLink = null; activeRenameId = null;
        }
    });

    const renameForm = document.getElementById("renamePenaltyTabForm");
    if (!renameForm) {
        console.error("Rename penalty tab form (renamePenaltyTabForm) not found!");
        return;
    }

    renameForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const renameInput = document.getElementById("renamePenaltyTabInput");
        const newName = renameInput?.value.trim();
        const currentNameFromLink = activeRenameLink?.textContent.trim();

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
                triggerAutosavePenalties(activeRenameId);
                showFlash("Penalty tab renamed. Saving...", "info", 2000);
            } else {
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
    const btn = document.getElementById("deletePenaltyTabBtn");
    if (!btn) {
        // THIS LOG IS KEY
        console.log("[Penalties Page] attachDeletePenaltyTabHandler: Delete Penalty Tab button (#deletePenaltyTabBtn) was NOT FOUND in the DOM. window.isLoggedIn was:", window.isLoggedIn);
        return;
    }
    // If we reach here, the button WAS found by the JS.
    console.log("[Penalties Page] attachDeletePenaltyTabHandler: Delete Penalty Tab button (#deletePenaltyTabBtn) FOUND. Attaching listener. window.isLoggedIn:", window.isLoggedIn);


    btn.addEventListener("click", async () => {
        const activeLink = document.querySelector("#penaltiesSystemTabList .nav-link.active, #penaltiesCustomTabList .nav-link.active");
        if (!activeLink) return showFlash("No active penalty tab selected for deletion.", "warning");

        const tabId = activeLink.getAttribute("href")?.substring(1);
        const tabName = activeLink.textContent.trim() || 'this tab';
        const isLoggedIn = window.isLoggedIn === true; // Re-check or use module-scoped
        const csrfToken = window.csrfToken;

        if (!tabId) {
            showFlash("Could not identify active penalty tab for deletion.", "danger");
            return;
        }

        const systemDefaultClientTabIds = window.SYSTEM_DEFAULT_PENALTY_TABS
            ? Object.values(window.SYSTEM_DEFAULT_PENALTY_TABS).map(def => def.client_tab_id)
            : [];
        if (systemDefaultClientTabIds.includes(tabId) || tabId.startsWith("default-")) {
             showFlash(`System default penalty tab "${tabName}" cannot be deleted.`, "warning");
             return;
        }

        const ok = await confirmModal(`Delete penalty tab "${tabName}"? This cannot be undone.`, "Delete Penalty Tab?");
        if (!ok) return;

        btn.disabled = true;
        try {
            if (isLoggedIn) { // This condition will be true
                const res = await apiFetch("/api/penalties/delete_tab", { method: "POST", body: { tabId: tabId } }, csrfToken);
                if (res.status !== "ok" || res.deleted_tab_id !== tabId) {
                    throw new Error(res.error || "Server error during penalty tab deletion.");
                }
                if (window.userPenaltyTabsData) {
                    delete window.userPenaltyTabsData.tabs?.[tabId];
                    delete window.userPenaltyTabsData.entries?.[tabId];
                }
                console.log(`[Delete Penalty Tab] API delete successful for ${tabId}.`);
            } else {
                // LocalStorage deletion for non-logged-in users
                let localPenaltyTabs = getLocalOnlyPenaltyTabs();
                let localPenaltyEntries = getLocalOnlyPenaltyEntries();
                let wasDeletedLocally = false;
                if (localPenaltyTabs[tabId]) { delete localPenaltyTabs[tabId]; setLocalOnlyPenaltyTabs(localPenaltyTabs); wasDeletedLocally = true; }
                if (localPenaltyEntries[tabId]) { delete localPenaltyEntries[tabId]; setLocalOnlyPenaltyEntries(localPenaltyEntries); wasDeletedLocally = true; }
                
                if (wasDeletedLocally) console.log(`[Delete Penalty Tab] Local delete for ${tabId}.`);
                else console.warn(`[Delete Penalty Tab] Tab ${tabId} not found in local storage for deletion by non-logged-in user.`);
            }

            // Common UI update
            const tabLinkElement = document.getElementById(activeLink.id);
            const tabListItem = tabLinkElement?.closest('li.nav-item');
            const tabPaneElement = document.getElementById(tabId);

            if (tabListItem) tabListItem.remove();
            if (tabPaneElement) tabPaneElement.remove();
            
            showFlash(`Penalty tab "${tabName}" deleted.`, "success");
            updatePenaltyTabGroupVisibility();

            // Activate next available tab
            const PRIMARY_PENALTY_DEFAULT_ID = window.PRIMARY_PENALTY_DEFAULT_TAB_ID || "default-all-penalties";
            let newActiveTabId = PRIMARY_PENALTY_DEFAULT_ID;
            let nextActiveLink = document.querySelector(`#penaltiesSystemTabList .nav-link[href="#${newActiveTabId}"], #penaltiesCustomTabList .nav-link[href="#${newActiveTabId}"]`);

            if (!nextActiveLink) {
                const allSystemLinks = document.querySelectorAll('#penaltiesSystemTabList .nav-item:not(.system-default-group-label) .nav-link');
                const allCustomLinks = document.querySelectorAll('#penaltiesCustomTabList .nav-item:not(.custom-group-label):not(#addPenaltyTabBtnContainer) .nav-link');
                if (allSystemLinks.length > 0) nextActiveLink = allSystemLinks[0];
                else if (allCustomLinks.length > 0) nextActiveLink = allCustomLinks[0];
                if(nextActiveLink) newActiveTabId = nextActiveLink.getAttribute("href")?.substring(1);
            }
            
            if (nextActiveLink && typeof $ !== 'undefined' && $.fn.tab) { $(nextActiveLink).tab('show'); }
             else if (nextActiveLink) { // Basic JS fallback
                document.querySelectorAll('#penaltiesSystemTabList .nav-link, #penaltiesCustomTabList .nav-link').forEach(l => l.classList.remove('active'));
                document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('show', 'active')); // Deactivate all panes first
                nextActiveLink.classList.add('active');
                nextActiveLink.setAttribute('aria-selected', 'true');
                const paneToActivate = document.getElementById(newActiveTabId); // Get the correct pane ID
                if (paneToActivate) paneToActivate.classList.add('show', 'active');
            } else {
                 document.getElementById('penaltiesTabContent').innerHTML = '<p class="text-center text-secondary p-5">No penalty tabs available.</p>';
            }
        } catch (e) {
            showFlash(`Error deleting penalty tab: ${e.message}`, "danger");
        } finally {
            btn.disabled = false;
        }
    });
}


export async function handleDuplicatePenaltyTab() {
    if (!window.isLoggedIn) return showFlash("Login required to duplicate tabs.", "info");
    const activeLink = document.querySelector("#penaltiesCustomTabList .nav-link.active, #penaltiesSystemTabList .nav-link.active");
    if (!activeLink) return showFlash("No active penalty tab to duplicate.", "warning");

    const sourceTabId = activeLink.getAttribute("href")?.substring(1);
    const sourceTabName = activeLink.textContent.trim();
    if (!sourceTabId || !window.userPenaltyTabsData?.tabs?.[sourceTabId] || !window.userPenaltyTabsData?.entries?.[sourceTabId]) { // Check .entries
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
    const newTabIdNumber = getNextPenaltyTabIdNumber(); // Uses penalty-specific counter
    const newClientTabId = `penaltyPane-${newTabIdNumber}`;
    const sourceEntries = window.userPenaltyTabsData.entries[sourceTabId]; // Use .entries
    const newEntries = JSON.parse(JSON.stringify(sourceEntries || []));

    window.userPenaltyTabsData.tabs[newClientTabId] = { name: newTabName };
    window.userPenaltyTabsData.entries[newClientTabId] = newEntries; // Use .entries

    const duplicateBtnElement = document.getElementById('duplicatePenaltyTabBtn');
    if(duplicateBtnElement) duplicateBtnElement.disabled = true;
    try {
        const payload = { tabId: newClientTabId, tabName: newTabName, penalties: newEntries }; // API expects 'penalties'
        const csrfToken = window.csrfToken;
        const response = await apiFetch('/api/penalties/save_tab', { method: 'POST', body: payload }, csrfToken);
        if (response.status === 'ok' && response.saved_tab) {
            window.userPenaltyTabsData.tabs[newClientTabId] = { name: response.saved_tab.tab_name };
            window.userPenaltyTabsData.entries[newClientTabId] = response.saved_tab.penalties || []; // API returns 'penalties'
            
            // Import UI creation and rendering functions dynamically
            const { createTabFromLocalData: createPenaltyTabUI } = await import('./penaltyTabManagement.js');
            const { renderPenaltiesForTab } = await import('./penaltyEntryManagement.js');

            createPenaltyTabUI(newClientTabId, newTabName, false); // isSystemDefault = false
            renderPenaltiesForTab(newClientTabId);

            const newLink = document.querySelector(`#penaltiesCustomTabList .nav-link[href="#${newClientTabId}"]`); // Look in custom list
            if (newLink && typeof $ !== 'undefined' && $.fn.tab) $(newLink).tab('show');
            showFlash(`Penalty tab "${sourceTabName}" duplicated.`, "success");
            updatePenaltyTabGroupVisibility();
        } else { throw new Error(response.error || "Server error during penalty tab duplication."); }
    } catch (error) {
        showFlash(`Error duplicating penalty tab: ${error.message}`, "danger");
        delete window.userPenaltyTabsData.tabs[newClientTabId];
        delete window.userPenaltyTabsData.entries[newClientTabId]; // Use .entries
        updatePenaltyTabGroupVisibility();
    } finally { if(duplicateBtnElement) duplicateBtnElement.disabled = false; }
}


export async function ensureUserDefaultPenaltyTabs() {
    const SYSTEM_PENALTY_DEFAULT_DEFINITIONS_URL = '/api/penalties/default_definitions';
    const USER_PENALTY_TABS_LOAD_URL = '/api/penalties/load_tabs';
    const USER_PENALTY_TABS_SAVE_URL = '/api/penalties/save_tab';
    const PRIMARY_PENALTY_DEFAULT_TAB_ID = "default-all-penalties";

    window.PRIMARY_PENALTY_DEFAULT_TAB_ID = PRIMARY_PENALTY_DEFAULT_TAB_ID; // Make it globally available

    console.log("[ensureUserDefaultPenaltyTabs] Starting process...");
    const isLoggedIn = window.isLoggedIn === true;
    const csrfToken = window.csrfToken;
    let systemDefaultPenaltyTabsDefinitions;
    try {
        systemDefaultPenaltyTabsDefinitions = await apiFetch(SYSTEM_PENALTY_DEFAULT_DEFINITIONS_URL);
        if (typeof systemDefaultPenaltyTabsDefinitions !== 'object' || systemDefaultPenaltyTabsDefinitions === null) {
            throw new Error("Invalid system default penalty tab definitions from API.");
        }
         window.SYSTEM_DEFAULT_PENALTY_TABS = systemDefaultPenaltyTabsDefinitions; // Store globally
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
                    const savePayload = { tabId: clientTabId, tabName: sysDef.name, penalties: sysDef.penalties || [] };
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
                localEntries[clientTabId] = sysDef.penalties || [];
                updatedLocal = true;
            }
        }
        if (updatedLocal) {
            setLocalOnlyPenaltyTabs(localTabs);
            setLocalOnlyPenaltyEntries(localEntries);
        }
    }
    console.log("[ensureUserDefaultPenaltyTabs] Process finished.");
}