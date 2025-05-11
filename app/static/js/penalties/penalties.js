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
} from "./penaltyEntryManagement.js";
import {
    attachPenaltyTabRenameHandler,
    attachDeletePenaltyTabHandler,
    triggerAutosavePenalties,
    handleDuplicatePenaltyTab,
} from "./penaltyExtensions.js";
import { escapeHtml, confirmModal, showFlash } from "../utils/helpers.js";
import { apiFetch } from "../utils/api.js";

// --- Global States ---
window.userPenaltyTabsData = { tabs: {}, entries: {} };
window.SYSTEM_DEFAULT_PENALTY_TABS = {};

// --- Constants for API URLs ---
const SYSTEM_PENALTY_DEFINITIONS_URL = '/api/penalties/default_definitions';
const USER_PENALTY_TABS_LOAD_URL = '/api/penalties/load_tabs';
const USER_PENALTY_TABS_SAVE_URL = '/api/penalties/save_tab';
const PRIMARY_PENALTY_DEFAULT_ID = "default-all-penalties"; // Ensure this matches your actual primary default

// --- Utility: Update Tab Group Visibility ---
export function updatePenaltyTabGroupVisibility() {
    const systemTabListEl = document.getElementById('penaltiesSystemTabList');
    const customTabListEl = document.getElementById('penaltiesCustomTabList');

    let hasSystemTabs = false;
    if (systemTabListEl && systemTabListEl.querySelector('li.nav-item:not(.system-default-group-label):not(#loadingSystemPenaltyTabsPlaceholder) .nav-link')) {
        hasSystemTabs = true;
    }
    let hasCustomTabs = false;
    if (customTabListEl && customTabListEl.querySelector('li.nav-item:not(.custom-group-label):not(#loadingCustomPenaltyTabsPlaceholder):not(#addPenaltyTabBtnContainer) .nav-link')) {
        hasCustomTabs = true;
    }
    
    const systemTabsLabel = document.getElementById('systemPenaltyTabsLabel');
    const customTabsLabel = document.getElementById('customPenaltyTabsLabel');

    if (systemTabsLabel) systemTabsLabel.style.display = hasSystemTabs ? 'list-item' : 'none';
    if (customTabsLabel) customTabsLabel.style.display = hasCustomTabs ? 'list-item' : 'none';
}

async function handleResetPenaltyTabToDefault(event) {
    const button = event.target.closest('.reset-penalty-tab-to-default-btn');
    if (!button) return;
    const tabIdToReset = button.dataset.tab;
    if (!tabIdToReset) return showFlash("Could not identify penalty tab to reset.", "danger");

    const tabDefinition = window.SYSTEM_DEFAULT_PENALTY_TABS ? window.SYSTEM_DEFAULT_PENALTY_TABS[tabIdToReset] : null;
    if (!tabDefinition || !Array.isArray(tabDefinition.penalties)) { 
        return showFlash(`Original default entries for penalty tab "${escapeHtml(tabIdToReset)}" not found.`, "danger");
    }
    const tabDisplayName = (window.isLoggedIn ? window.userPenaltyTabsData?.tabs?.[tabIdToReset]?.name : getLocalOnlyPenaltyTabs()?.[tabIdToReset]?.name) || tabDefinition.name || tabIdToReset;
    const confirmed = await confirmModal(`Reset tab "${escapeHtml(tabDisplayName)}" to system defaults?`, "Confirm Reset");
    if (!confirmed) return;

    button.disabled = true;
    const originalEntries = JSON.parse(JSON.stringify(tabDefinition.penalties || [])); 

    try {
        const isLoggedIn = window.isLoggedIn === true;
        if (isLoggedIn) {
            if (!window.userPenaltyTabsData || !window.userPenaltyTabsData.entries) throw new Error("User data not initialized.");
            window.userPenaltyTabsData.entries[tabIdToReset] = originalEntries; 
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
    const penaltiesPageMarker = document.getElementById('penaltiesSystemTabList');
    if (!penaltiesPageMarker) {
        // console.log("Not on the penalties page. penalties.js will not execute its main logic."); // Optional: for debugging
        return; // Silently abort if not on the penalties page
    }
    const penaltiesTabContent = document.getElementById("penaltiesTabContent");
    const systemTabListEl = document.getElementById('penaltiesSystemTabList');
    const customTabListEl = document.getElementById('penaltiesCustomTabList');

    if (!penaltiesTabContent || !systemTabListEl || !customTabListEl) {
        console.error("Essential penalty tab container elements missing. Aborting penalties.js initialization.");
        return;
    }

    console.log("Initializing Penalties page (penalties.js)...");
    const isLoggedIn = window.isLoggedIn === true;
    const csrfToken = window.csrfToken;

    const loadingSystemPlaceholder = document.getElementById('loadingSystemPenaltyTabsPlaceholder');
    const loadingCustomPlaceholder = document.getElementById('loadingCustomPenaltyTabsPlaceholder');
    const duplicateBtn = document.getElementById('duplicatePenaltyTabBtn');

    if (loadingSystemPlaceholder) loadingSystemPlaceholder.style.display = 'list-item';
    if (loadingCustomPlaceholder) loadingCustomPlaceholder.style.display = 'list-item';

    systemTabListEl.querySelectorAll('li.nav-item:not(.system-default-group-label):not(#loadingSystemPenaltyTabsPlaceholder)').forEach(li => li.remove());
    customTabListEl.querySelectorAll('li.nav-item:not(.custom-group-label):not(#loadingCustomPenaltyTabsPlaceholder):not(#addPenaltyTabBtnContainer)').forEach(li => li.remove());
    penaltiesTabContent.innerHTML = '';

    updatePenaltyTabGroupVisibility();

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
            
            window.userPenaltyTabsData = { tabs: {}, entries: {} }; 

            for (const defKey in window.SYSTEM_DEFAULT_PENALTY_TABS) {
                const sysDef = window.SYSTEM_DEFAULT_PENALTY_TABS[defKey];
                const clientTabId = sysDef.client_tab_id;
                if (!userSavedTabsFromApi[clientTabId]) { 
                    const savePayload = { tabId: clientTabId, tabName: sysDef.name, penalties: sysDef.penalties || [] };
                    try {
                        const resp = await apiFetch(USER_PENALTY_TABS_SAVE_URL, { method: 'POST', body: savePayload }, csrfToken);
                        if (resp.status === 'ok' && resp.saved_tab) {
                            window.userPenaltyTabsData.tabs[clientTabId] = { name: resp.saved_tab.tab_name };
                            window.userPenaltyTabsData.entries[clientTabId] = resp.saved_tab.penalties || [];
                        } else throw new Error(resp.error || `Failed to save default penalty tab ${sysDef.name}`);
                    } catch (e) { 
                        showFlash(`Could not initialize default penalty tab: ${sysDef.name}. Using read-only version.`, "warning");
                        window.userPenaltyTabsData.tabs[clientTabId] = { name: sysDef.name };
                        window.userPenaltyTabsData.entries[clientTabId] = sysDef.penalties || []; 
                    }
                } else { 
                    window.userPenaltyTabsData.tabs[clientTabId] = { name: userSavedTabsFromApi[clientTabId].tab_name };
                    window.userPenaltyTabsData.entries[clientTabId] = userSavedTabsFromApi[clientTabId].penalties || [];
                }
            }
            for (const tabId in userSavedTabsFromApi) {
                if (!window.userPenaltyTabsData.tabs[tabId]) { 
                    window.userPenaltyTabsData.tabs[tabId] = { name: userSavedTabsFromApi[tabId].tab_name };
                    window.userPenaltyTabsData.entries[tabId] = userSavedTabsFromApi[tabId].penalties || [];
                }
            }
        } else { 
            let localTabs = getLocalOnlyPenaltyTabs(); 
            let localEntries = getLocalOnlyPenaltyEntries(); 
            let updatedLocal = false;
            for (const defKey in window.SYSTEM_DEFAULT_PENALTY_TABS) {
                const sysDef = window.SYSTEM_DEFAULT_PENALTY_TABS[defKey]; 
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

        const tabsToRenderData = isLoggedIn ? window.userPenaltyTabsData.tabs : getLocalOnlyPenaltyTabs();
        const systemDefaultClientTabIds = Object.values(window.SYSTEM_DEFAULT_PENALTY_TABS).map(def => def.client_tab_id);
        
        const systemTabsToDisplay = [];
        const customTabsToDisplay = [];

        for (const tabId in tabsToRenderData) {
            const isSystem = systemDefaultClientTabIds.includes(tabId);
            (isSystem ? systemTabsToDisplay : customTabsToDisplay).push({ 
                id: tabId, 
                name: tabsToRenderData[tabId].name,
                isSystemDefault: isSystem 
            });
        }

        systemTabsToDisplay.sort((a,b) => (a.id === PRIMARY_PENALTY_DEFAULT_ID ? -1 : b.id === PRIMARY_PENALTY_DEFAULT_ID ? 1 : a.name.localeCompare(b.name)));
        customTabsToDisplay.sort((a,b) => a.name.localeCompare(b.name));

        if (loadingSystemPlaceholder) loadingSystemPlaceholder.style.display = 'none';
        systemTabsToDisplay.forEach(t => { createPenaltyTabUI(t.id, t.name, t.isSystemDefault); renderPenaltiesForTab(t.id); });
        
        if (loadingCustomPlaceholder) loadingCustomPlaceholder.style.display = 'none';
        customTabsToDisplay.forEach(t => { createPenaltyTabUI(t.id, t.name, t.isSystemDefault); renderPenaltiesForTab(t.id); });
       
        if (customPenaltyTabsLabel) {
            customPenaltyTabsLabel.style.display = 'list-item'; // Always show it
            console.log("[Penalties Init] Set 'Your Custom Penalty Sets' label to visible.");
        }

    
        let hasSystemPenaltyTabs = false;
        if (systemPenaltyTabsLabel) {
            const systemPenaltyTabListEl = document.getElementById('penaltiesSystemTabList');
            if (systemPenaltyTabListEl && systemPenaltyTabListEl.querySelector('li.nav-item:not(.system-default-group-label):not(#loadingSystemPenaltyTabsPlaceholder) .nav-link')) {
                hasSystemPenaltyTabs = true;
            }
            systemPenaltyTabsLabel.style.display = hasSystemPenaltyTabs ? 'list-item' : 'none';
        }
        updatePenaltyTabGroupVisibility();

        let tabToActivateId = PRIMARY_PENALTY_DEFAULT_ID;
        const primaryDefaultDataExists = Object.prototype.hasOwnProperty.call(tabsToRenderData, PRIMARY_PENALTY_DEFAULT_ID);

        if (!primaryDefaultDataExists && systemTabsToDisplay.length > 0) {
            tabToActivateId = systemTabsToDisplay[0].id;
        } else if (!primaryDefaultDataExists && customTabsToDisplay.length > 0) { 
            tabToActivateId = customTabsToDisplay[0].id;
        } else if (!primaryDefaultDataExists && systemTabsToDisplay.length === 0 && customTabsToDisplay.length === 0) {
            tabToActivateId = null; 
        }
        
        let firstTabLink = null;
        if (tabToActivateId) { 
            const escapedTabId = CSS.escape(tabToActivateId);
            firstTabLink = document.querySelector(`#penaltiesSystemTabList .nav-link[href="#${escapedTabId}"], #penaltiesCustomTabList .nav-link[href="#${escapedTabId}"]`);
        }
        
        if (!firstTabLink && (systemTabsToDisplay.length > 0 || customTabsToDisplay.length > 0)) {
            firstTabLink = systemTabListEl.querySelector('.nav-item:not(.system-default-group-label):not(#loadingSystemPenaltyTabsPlaceholder) .nav-link') || 
                           customTabListEl.querySelector('.nav-item:not(.custom-group-label):not(#loadingCustomPenaltyTabsPlaceholder):not(#addPenaltyTabBtnContainer) .nav-link');
        }

        if (firstTabLink && typeof $ !== 'undefined' && $.fn.tab) {
            // **FIX for querySelector Error & Multiple Active Tabs**: Deactivate all before activating one.
            document.querySelectorAll('#penaltiesSystemTabList .nav-link, #penaltiesCustomTabList .nav-link').forEach(link => {
                link.classList.remove('active');
                link.setAttribute('aria-selected', 'false');
                const paneId = link.getAttribute('href');
                // **CRITICAL FIX**: Ensure paneId is a valid selector (not just "#")
                if (paneId && paneId.startsWith('#') && paneId.length > 1) { 
                    const pane = document.querySelector(paneId);
                    if (pane) pane.classList.remove('show', 'active');
                }
            });
            $(firstTabLink).tab('show'); 
            console.log(`Activated penalty tab: ${firstTabLink.getAttribute('href').substring(1)}`);
        } else if (penaltiesTabContent && systemTabsToDisplay.length === 0 && customTabsToDisplay.length === 0) {
            penaltiesTabContent.innerHTML = '<p class="text-center text-secondary p-5">No penalty tabs available.</p>';
        }

    } catch (error) {
        console.error("Error during Penalties page initialization:", error);
        showFlash(`Initialization Error: ${error.message}`, "danger");
        if (penaltiesTabContent) penaltiesTabContent.innerHTML = `<div class="alert alert-danger p-5 text-center">Page failed to load: ${error.message}</div>`;
    } finally {
        if (loadingSystemPlaceholder) loadingSystemPlaceholder.style.display = 'none';
        if (loadingCustomPlaceholder) loadingCustomPlaceholder.style.display = 'none';
    }

    const addTabButton = document.getElementById("addPenaltyTabBtn");
    if (addTabButton) {
        addTabButton.addEventListener("click", (e) => { e.preventDefault(); createNewPenaltyTab(); updatePenaltyTabGroupVisibility(); });
    }
    if (duplicateBtn) {
        duplicateBtn.addEventListener('click', ()=>{ handleDuplicatePenaltyTab(); updatePenaltyTabGroupVisibility(); });
    } else if (duplicateBtn && !isLoggedIn) {
        duplicateBtn.style.display = 'none';
    }
    
    penaltiesTabContent.addEventListener("click", (e) => {
        if (e.target?.classList.contains("insertPenaltyBtn")) {
            window.currentPenaltyTargetTab = e.target.getAttribute("data-tab");
            document.getElementById("newPenaltyAlert")?.replaceChildren();
            document.getElementById("newPenaltyForm")?.reset();
            $('#newPenaltyModal').modal('show');
        } else if (e.target?.classList.contains("reset-penalty-tab-to-default-btn") || e.target.closest('.reset-penalty-tab-to-default-btn')) {
            handleResetPenaltyTabToDefault(e);
        }
    });

    document.getElementById("saveNewPenaltyBtn")?.addEventListener("click", handleSaveNewPenalty);
    document.getElementById("updatePenaltyBtn")?.addEventListener("click", handleUpdatePenalty);
    
    attachPenaltyTabRenameHandler(); 
    attachDeletePenaltyTabHandler(); 

    // Event listener for Bootstrap's tab shown event to ensure single active tab
    // Ensure this targets only penalty page tabs if you have other tabs on the site
    $('.config-page-container a[data-toggle="tab"]').on('shown.bs.tab', function (e) {
        const newlyActiveTabHref = $(e.target).attr('href');
    
        $('#penaltiesSystemTabList .nav-link, #penaltiesCustomTabList .nav-link').each(function() {
            const $thisLink = $(this);
            const currentHref = $thisLink.attr('href');

            if (currentHref !== newlyActiveTabHref) {
                if ($thisLink.hasClass('active')) {
                    $thisLink.removeClass('active').attr('aria-selected', 'false');
                }
                // Also ensure the corresponding pane is deactivated
                if (currentHref && currentHref.length > 1 && $(currentHref).hasClass('show')) {
                    $(currentHref).removeClass('show active');
                }
            } else {
                // Ensure the one shown by Bootstrap is correctly marked (it should be)
                if (!$thisLink.hasClass('active')) {
                    $thisLink.addClass('active').attr('aria-selected', 'true');
                }
                if (currentHref && currentHref.length > 1 && (!$(currentHref).hasClass('show') || !$(currentHref).hasClass('active'))) {
                    $(currentHref).addClass('show active');
                }
            }
        });
    });
    console.log("Penalties page initialization finished.");
});
