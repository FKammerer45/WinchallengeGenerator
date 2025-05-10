// app/static/js/penalties/penalties.js

import {
    initLocalStorage as initPenaltyLocalStorage,
    getLocalOnlyTabs as getLocalOnlyPenaltyTabs,
    getLocalOnlyEntries as getLocalOnlyPenaltyEntries,
    setLocalOnlyTabs as setLocalOnlyPenaltyTabs,
    setLocalOnlyEntries as setLocalOnlyPenaltyEntries
} from "./penaltyLocalStorageUtils.js";
import {
    createNewTab as createNewPenaltyTab,
    createTabFromLocalData as createPenaltyTabUI,
} from "./penaltyTabManagement.js";
import {
    renderPenaltiesForTab,
    handleSaveNewPenalty,
    handleUpdatePenalty,
    // handleDeleteSinglePenalty // This is usually triggered from a modal/context, not a top-level button
} from "./penaltyEntryManagement.js";
import {
    attachPenaltyTabRenameHandler,
    attachDeletePenaltyTabHandler,
    triggerAutosavePenalties,
    handleDuplicatePenaltyTab,
    // ensureUserDefaultPenaltyTabs // This is called from form.js or if needed here for robustness
} from "./penaltyExtensions.js";
import { escapeHtml, confirmModal, showFlash } from "../utils/helpers.js";
import { apiFetch } from "../utils/api.js";

// Global state for logged-in users
window.userPenaltyTabsData = { tabs: {}, entries: {} }; // Use 'entries' key for consistency
window.SYSTEM_DEFAULT_PENALTY_TABS = {};

// API URL Constants
const SYSTEM_PENALTY_DEFINITIONS_URL = '/api/penalties/default_definitions';
const USER_PENALTY_TABS_LOAD_URL = '/api/penalties/load_tabs';
const USER_PENALTY_TABS_SAVE_URL = '/api/penalties/save_tab';
const PRIMARY_PENALTY_DEFAULT_ID = "default-all-penalties"; // e.g.

// --- Utility: Update Tab Group Visibility for Penalties ---
export function updatePenaltyTabGroupVisibility() {
    const isLoggedIn = window.isLoggedIn === true;
    const tabsData = isLoggedIn ? (window.userPenaltyTabsData?.tabs || {}) : getLocalOnlyPenaltyTabs();
    
    const systemDefaultClientTabIds = window.SYSTEM_DEFAULT_PENALTY_TABS
        ? Object.values(window.SYSTEM_DEFAULT_PENALTY_TABS).map(def => def.client_tab_id)
        : [];

    let hasSystemTabs = false;
    let hasCustomTabs = false;
    for (const tabId in tabsData) {
        if (systemDefaultClientTabIds.includes(tabId)) hasSystemTabs = true;
        else hasCustomTabs = true;
    }

    const systemTabsLabel = document.getElementById('systemPenaltyTabsLabel'); // Ensure these IDs exist in penalties.html
    const customTabsSeparator = document.getElementById('customPenaltyTabsSeparator');
    const customTabsLabel = document.getElementById('customPenaltyTabsLabel');

    if (systemTabsLabel) systemTabsLabel.style.display = hasSystemTabs ? 'list-item' : 'none';
    if (customTabsSeparator) customTabsSeparator.style.display = hasSystemTabs && hasCustomTabs ? 'list-item' : 'none';
    if (customTabsLabel) customTabsLabel.style.display = hasCustomTabs ? 'list-item' : 'none';
}

async function handleResetPenaltyTabToDefault(event) {
    const button = event.target.closest('.reset-penalty-tab-to-default-btn');
    if (!button) return;
    const tabIdToReset = button.dataset.tab;
    if (!tabIdToReset) return showFlash("Could not identify penalty tab to reset.", "danger");

    const tabDefinition = window.SYSTEM_DEFAULT_PENALTY_TABS ? window.SYSTEM_DEFAULT_PENALTY_TABS[tabIdToReset] : null;
    if (!tabDefinition || !Array.isArray(tabDefinition.penalties)) { // Check for 'penalties' key
        return showFlash(`Original default entries for penalty tab "${tabIdToReset}" not found.`, "danger");
    }
    const tabDisplayName = window.userPenaltyTabsData?.tabs?.[tabIdToReset]?.name || tabDefinition.name || tabIdToReset;
    const confirmed = await confirmModal(`Reset tab "${escapeHtml(tabDisplayName)}" to system defaults?`, "Confirm Reset");
    if (!confirmed) return;

    button.disabled = true;
    const originalEntries = JSON.parse(JSON.stringify(tabDefinition.penalties)); // Use 'penalties'

    try {
        const isLoggedIn = window.isLoggedIn === true;
        if (isLoggedIn) {
            if (!window.userPenaltyTabsData || !window.userPenaltyTabsData.entries) throw new Error("User data not initialized.");
            window.userPenaltyTabsData.entries[tabIdToReset] = originalEntries; // Use 'entries' key for state
            triggerAutosavePenalties(tabIdToReset);
            showFlash(`Penalty tab "${escapeHtml(tabDisplayName)}" resetting...`, "info", 2000);
        } else {
            let localEntries = getLocalOnlyPenaltyEntries();
            localEntries[tabIdToReset] = originalEntries;
            setLocalOnlyPenaltyEntries(localEntries);
            showFlash(`Penalty tab "${escapeHtml(tabDisplayName)}" reset locally.`, "success");
        }
        renderPenaltiesForTab(tabIdToReset);
    } catch (error) {
        showFlash(`Failed to reset penalty tab: ${error.message}`, "danger");
    } finally {
        button.disabled = false;
    }
}

// --- Main DOMContentLoaded ---
document.addEventListener("DOMContentLoaded", async () => {
    const penaltiesTabContent = document.getElementById("penaltiesTabContent");
    if (!penaltiesTabContent) return; // Not on penalties page

    console.log("Initializing Penalties page (penalties.js)...");
    const isLoggedIn = window.isLoggedIn === true;
    const csrfToken = window.csrfToken;

    const loadingPlaceholder = document.getElementById('loadingPenaltyTabsPlaceholder'); // Ensure this ID exists
    const tabListElement = document.getElementById('penaltiesTab'); // Ensure this ID exists
    const addTabButtonElement = document.getElementById("addPenaltyTabBtn"); // Ensure this ID exists
    const addTabBtnLi = addTabButtonElement?.closest('li.nav-item');
    const customTabsSeparator = document.getElementById('customPenaltyTabsSeparator'); // Ensure this ID exists
    const systemTabsLabel = document.getElementById('systemPenaltyTabsLabel'); // Ensure this ID exists
    const customTabsLabel = document.getElementById('customPenaltyTabsLabel'); // Ensure this ID exists
    const duplicateBtn = document.getElementById('duplicatePenaltyTabBtn'); // Ensure this ID exists

    if (loadingPlaceholder) loadingPlaceholder.style.display = 'block';
    if (tabListElement) { /* Clear dynamic tabs */ }
    if (penaltiesTabContent) penaltiesTabContent.innerHTML = '';
    if (customTabsSeparator) customTabsSeparator.style.display = 'none';
    if (systemTabsLabel) systemTabsLabel.style.display = 'none';
    if (customTabsLabel) customTabsLabel.style.display = 'none';

    try {
        const systemDefaultsApiResponse = await apiFetch(SYSTEM_PENALTY_DEFINITIONS_URL);
        if (typeof systemDefaultsApiResponse !== 'object' || systemDefaultsApiResponse === null) {
            throw new Error("Failed to load system default penalty tab definitions.");
        }
        window.SYSTEM_DEFAULT_PENALTY_TABS = systemDefaultsApiResponse;

        if (!isLoggedIn) initPenaltyLocalStorage();

        if (isLoggedIn) {
            let userSavedTabsFromApi = {};
            try {
                userSavedTabsFromApi = await apiFetch(USER_PENALTY_TABS_LOAD_URL);
                if (typeof userSavedTabsFromApi !== 'object' || userSavedTabsFromApi === null) userSavedTabsFromApi = {};
            } catch (e) { userSavedTabsFromApi = {}; showFlash("Could not load saved penalty tabs.", "warning");}
            
            window.userPenaltyTabsData = { tabs: {}, entries: {} }; // Use 'entries' key

            for (const defKey in window.SYSTEM_DEFAULT_PENALTY_TABS) {
                const sysDef = window.SYSTEM_DEFAULT_PENALTY_TABS[defKey];
                const clientTabId = sysDef.client_tab_id;
                if (!userSavedTabsFromApi[clientTabId]) {
                    // Penalties definitions use 'penalties' key for entries
                    const savePayload = { tabId: clientTabId, tabName: sysDef.name, penalties: sysDef.penalties || [] };
                    try {
                        const resp = await apiFetch(USER_PENALTY_TABS_SAVE_URL, { method: 'POST', body: savePayload }, csrfToken);
                        if (resp.status === 'ok' && resp.saved_tab) {
                            window.userPenaltyTabsData.tabs[clientTabId] = { name: resp.saved_tab.tab_name };
                            window.userPenaltyTabsData.entries[clientTabId] = resp.saved_tab.penalties || []; // Use 'penalties' from response
                        } else throw new Error(resp.error);
                    } catch (e) {
                        showFlash(`Could not init default penalty tab: ${sysDef.name}.`, "warning");
                        window.userPenaltyTabsData.tabs[clientTabId] = { name: sysDef.name };
                        window.userPenaltyTabsData.entries[clientTabId] = sysDef.penalties || []; // Fallback
                    }
                } else {
                    window.userPenaltyTabsData.tabs[clientTabId] = { name: userSavedTabsFromApi[clientTabId].tab_name };
                    window.userPenaltyTabsData.entries[clientTabId] = userSavedTabsFromApi[clientTabId].penalties || []; // Use 'penalties'
                }
            }
            for (const tabId in userSavedTabsFromApi) {
                if (!window.userPenaltyTabsData.tabs[tabId]) {
                    window.userPenaltyTabsData.tabs[tabId] = { name: userSavedTabsFromApi[tabId].tab_name };
                    window.userPenaltyTabsData.entries[tabId] = userSavedTabsFromApi[tabId].penalties || []; // Use 'penalties'
                }
            }
        } else {
            let localTabs = getLocalOnlyPenaltyTabs(); let localEntries = getLocalOnlyPenaltyEntries(); let updated = false;
            for (const defKey in window.SYSTEM_DEFAULT_PENALTY_TABS) {
                const sysDef = window.SYSTEM_DEFAULT_PENALTY_TABS[defKey]; const clientTabId = sysDef.client_tab_id;
                if (!localTabs[clientTabId]) {
                    localTabs[clientTabId] = { name: sysDef.name };
                    localEntries[clientTabId] = sysDef.penalties || []; // Use 'penalties'
                    updated = true;
                }
            }
            if (updated) { setLocalOnlyPenaltyTabs(localTabs); setLocalOnlyPenaltyEntries(localEntries); }
        }

        const tabsToRenderData = isLoggedIn ? window.userPenaltyTabsData.tabs : getLocalOnlyPenaltyTabs();
        const systemDefaultIds = window.SYSTEM_DEFAULT_PENALTY_TABS ? Object.values(window.SYSTEM_DEFAULT_PENALTY_TABS).map(def => def.client_tab_id) : [];
        const systemTabs = [], customTabs = [];
        for (const tabId in tabsToRenderData) { (systemDefaultIds.includes(tabId) ? systemTabs : customTabs).push({ id: tabId, name: tabsToRenderData[tabId].name }); }
        systemTabs.sort((a,b) => (a.id === PRIMARY_PENALTY_DEFAULT_ID ? -1 : b.id === PRIMARY_PENALTY_DEFAULT_ID ? 1 : a.name.localeCompare(b.name)));
        customTabs.sort((a,b) => a.name.localeCompare(b.name));

        systemTabs.forEach(t => { createPenaltyTabUI(t.id, t.name, customTabsSeparator || addTabBtnLi); renderPenaltiesForTab(t.id); });
        customTabs.forEach(t => { createPenaltyTabUI(t.id, t.name, addTabBtnLi); renderPenaltiesForTab(t.id); });
        
        updatePenaltyTabGroupVisibility();

        if (tabListElement && addTabBtnLi) tabListElement.appendChild(addTabBtnLi);
        if (tabListElement && loadingPlaceholder) tabListElement.appendChild(loadingPlaceholder);

        let tabToActivateId = PRIMARY_PENALTY_DEFAULT_ID;
        if (!tabsToRenderData[PRIMARY_PENALTY_DEFAULT_ID] && systemTabs.length > 0) tabToActivateId = systemTabs[0].id;
        else if (!tabsToRenderData[PRIMARY_PENALTY_DEFAULT_ID] && customTabs.length > 0) tabToActivateId = customTabs[0].id;
        let firstTabLink = document.querySelector(`#penaltiesTab .nav-link[href="#${tabToActivateId}"]`);
        if (!firstTabLink && (systemTabs.length || customTabs.length)) firstTabLink = tabListElement.querySelector('.nav-item:not(.system-default-group-label):not(.custom-group-label):not(.tabs-spacer) .nav-link');
        if (firstTabLink) $(firstTabLink).tab('show');
        else if (penaltiesTabContent && !systemTabs.length && !customTabs.length) penaltiesTabContent.innerHTML = '<p class="text-center text-secondary p-5">No penalty tabs.</p>';

    } catch (error) {
        console.error("Error during Penalties page initialization:", error);
        showFlash(`Initialization Error: ${error.message}`, "danger");
        if (penaltiesTabContent) penaltiesTabContent.innerHTML = `<div class="alert alert-danger p-5 text-center">Page failed to load.</div>`;
    } finally {
        if (loadingPlaceholder) loadingPlaceholder.style.display = 'none';
    }

    // Attach Event Listeners
    if (addTabButtonElement) addTabButtonElement.addEventListener("click", (e) => { e.preventDefault(); createNewPenaltyTab(); });
    if (isLoggedIn && duplicateBtn) duplicateBtn.addEventListener('click', handleDuplicatePenaltyTab);
    
    if (penaltiesTabContent) {
        penaltiesTabContent.addEventListener("click", (e) => {
            if (e.target?.classList.contains("insertPenaltyBtn")) {
                window.currentPenaltyTargetTab = e.target.getAttribute("data-tab");
                document.getElementById("newPenaltyAlert")?.replaceChildren();
                document.getElementById("newPenaltyForm")?.reset(); // Ensure this form ID exists
                $('#newPenaltyModal').modal('show'); // Ensure this modal ID exists
            } else if (e.target?.classList.contains("reset-penalty-tab-to-default-btn") || e.target.closest('.reset-penalty-tab-to-default-btn')) {
                handleResetPenaltyTabToDefault(e);
            }
        });
    }
    // Listener for edit modal save is usually on the modal's save button
    document.getElementById("saveNewPenaltyBtn")?.addEventListener("click", handleSaveNewPenalty); // Ensure this ID exists
    document.getElementById("updatePenaltyBtn")?.addEventListener("click", handleUpdatePenalty); // Ensure this ID exists
    
    attachPenaltyTabRenameHandler();
    if (isLoggedIn) attachDeletePenaltyTabHandler();
    console.log("Penalties page initialization finished.");
});
