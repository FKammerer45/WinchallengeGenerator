// app/static/js/penalties/penaltyExtensions.js

// Import penalty-specific local storage utils
import {
  getLocalPenaltyTabs,
  getLocalPenalties,
  setLocalPenaltyTabs,
  setLocalPenalties
} from "./penaltyLocalStorageUtils.js";
// Import penalty-specific tab and entry management
import { createPenaltyTabFromLocalData } from "./penaltyTabManagement.js";
import { renderPenaltiesForTab } from "./penaltyEntryManagement.js";
// Import shared helpers and apiFetch
import { confirmModal, showFlash } from "../utils/helpers.js";
import { apiFetch } from "../utils/api.js";

// --- Autosave Logic (Penalty Specific) ---
let penaltyAutosaveTimeout = null;
let isCurrentlySavingPenalties = false;

function debouncePenalty(func, wait) { // Renamed for clarity
  let timeout;
  return function executedFunction(...args) {
      const later = () => { clearTimeout(timeout); func.apply(this, args); };
      clearTimeout(timeout); timeout = setTimeout(later, wait);
  };
}

function getCurrentPenaltyEntries(tabId) { // Renamed for clarity
  const isLoggedIn = window.isLoggedIn === true;
  if (isLoggedIn) {
      // Use penalty-specific state object
      if (window.userPenaltyTabsData?.entries) {
          return window.userPenaltyTabsData.entries[tabId] || [];
      } else {
          console.error("[Penalty Autosave] User logged in but window.userPenaltyTabsData missing.");
          showFlash("Error retrieving penalty data.", "danger");
          return [];
      }
  } else {
      try { return getLocalPenalties()[tabId] || []; } // Use penalty getter
      catch (e) { console.error("[Penalty Autosave] Error reading local penalty entries:", e); return []; }
  }
}

async function performPenaltySave(tabId) { // Renamed for clarity
  const isLoggedIn = window.isLoggedIn === true;
  if (!isLoggedIn || isCurrentlySavingPenalties || !tabId) return;

  isCurrentlySavingPenalties = true;
  console.log(`[Penalty Autosave] Starting save for tab ${tabId}`);

  try {
      const currentTabs = isLoggedIn ? (window.userPenaltyTabsData?.tabs || {}) : getLocalPenaltyTabs();
      // *** Get entries directly from the current state object ***
      const currentEntries = isLoggedIn ? (window.userPenaltyTabsData?.entries?.[tabId] || []) : (getLocalPenalties()[tabId] || []);
      const tabName = currentTabs[tabId]?.name || (tabId === 'default' ? 'Default' : `Penalty Tab ${tabId}`);

      if (!tabName) throw new Error(`Could not determine name for penalty tab ${tabId}`);

      const payload = { tabId, tabName, penalties: currentEntries };
      const csrfToken = window.csrfToken;
      const response = await apiFetch('/api/penalties/save_tab', { method: 'POST', body: payload }, csrfToken);

      // --- MODIFIED SUCCESS BLOCK ---
      if (response.status === 'ok') {
          console.log(`[Penalty Autosave] Tab ${tabId} save API call successful.`);
          showFlash("Penalty changes saved ✓", "success", 2000);

          // Check if the response contains the saved tab data (as implemented in penalties_api.py)
          if (response.saved_tab && isLoggedIn && window.userPenaltyTabsData) {
              const savedTabId = response.saved_tab.client_tab_id;
              const savedTabName = response.saved_tab.tab_name;
              const savedPenalties = response.saved_tab.penalties || []; // Get penalties from response

              // Update the global state with the data returned from the server
              window.userPenaltyTabsData.tabs[savedTabId] = { name: savedTabName };
              window.userPenaltyTabsData.entries[savedTabId] = savedPenalties; // Use server's response

              console.log(`[Penalty Autosave] Updated state from save response for tab ${savedTabId}. New entry count: ${savedPenalties.length}`);

              // Optional: If the save was for the currently viewed tab, re-render it
              // This ensures the UI matches the saved state exactly (e.g., if backend modified data)
              const activeLink = document.querySelector("#penaltiesTab .nav-link.active");
              const activeTabId = activeLink?.getAttribute("href")?.substring(1);
              if (activeTabId === savedTabId) {
                   console.log(`[Penalty Autosave] Re-rendering active tab ${savedTabId} after save confirmation.`);
                   renderPenaltiesForTab(savedTabId);
              }

          } else if (isLoggedIn && window.userPenaltyTabsData) {
               // Fallback if response format is old/unexpected - less ideal
               console.warn("[Penalty Autosave] Save response missing 'saved_tab' object. Assuming local state is correct.");
               window.userPenaltyTabsData.tabs[tabId] = { name: tabName };
               window.userPenaltyTabsData.entries[tabId] = currentEntries;
          }
      } else {
          throw new Error(response.error || 'Unknown server error during penalty save.');
      }
      // --- END MODIFIED SUCCESS BLOCK ---

  } catch (error) {
      console.error(`[Penalty Autosave] Error saving tab ${tabId}:`, error);
      showFlash(`Error saving penalty changes: ${error.message}`, 'danger', 5000);
  } finally {
      isCurrentlySavingPenalties = false;
  }
}

const debouncedPenaltySave = debouncePenalty(performPenaltySave, 2000); // Use specific debounce instance

export function triggerPenaltyAutosave(tabId) { // Renamed export
  const isLoggedIn = window.isLoggedIn === true;
  if (!isLoggedIn || !tabId) return;
  console.log(`[Penalty Autosave] Triggered for tab ${tabId}. Debouncing...`);
  debouncedPenaltySave(tabId);
}
// --- END Autosave Logic ---


// --- Tab Rename Handler (Penalty Specific - Local Only) ---
export function attachPenaltyTabRenameHandler() {
  const container = document.getElementById("penaltiesTab"); // Target penalty tabs
  if (!container) { console.error("Could not find #penaltiesTab container."); return; }

  let activeLink = null, activeId = null;

  container.addEventListener("dblclick", (e) => {
      const link = e.target.closest(".nav-link");
      if (!link || link.id === "default-penalty-tab" || link.id === 'addPenaltyTabBtn') {
          if (link && link.id === 'default-penalty-tab') { showFlash("Default penalty tab cannot be renamed.", "info"); }
          return;
      }
      activeLink = link; activeId = link.dataset.tab || link.getAttribute("href")?.substring(1);
      const currentName = link.textContent.trim();
      const renameInput = document.getElementById("renamePenaltyTabInput"); // Use penalty modal input
      if (!renameInput) return;
      renameInput.value = currentName;
      if (typeof $ !== 'undefined' && $.fn.modal) $('#renamePenaltyTabModal').modal('show'); // Use penalty modal ID
      else alert("Rename dialog unavailable.");
  });

  const renameForm = document.getElementById("renamePenaltyTabForm"); // Use penalty modal form
  if (!renameForm) { console.error("Rename penalty modal form not found!"); return; }

  renameForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const renameInput = document.getElementById("renamePenaltyTabInput");
      const newName = renameInput?.value.trim();
      const currentName = activeLink?.textContent.trim();
      const isLoggedIn = window.isLoggedIn === true;

      if (!activeLink || !activeId || !newName || newName === currentName) {
          if (typeof $ !== 'undefined' && $.fn.modal) $('#renamePenaltyTabModal').modal('hide');
          activeLink = null; activeId = null; return;
      }

      if (typeof $ !== 'undefined' && $.fn.modal) $('#renamePenaltyTabModal').modal('hide');

      try {
          // Renaming is LOCAL ONLY for now, no API call needed for penalties yet
          let currentTabs = getLocalPenaltyTabs() || {}; // Use penalty getter
          if (!currentTabs[activeId]) throw new Error("Local penalty tab not found.");
          currentTabs[activeId].name = newName;
          setLocalPenaltyTabs(currentTabs); // Use penalty setter
          activeLink.textContent = newName;
          showFlash("Penalty tab renamed locally.", "success");

          // If logged in, trigger autosave to persist the LOCAL data (including the new name)
           if(isLoggedIn) {
               triggerPenaltyAutosave(activeId);
           }

      } catch (err) {
          console.error("Rename penalty tab failed:", err);
          showFlash(`Failed to rename penalty tab: ${err.message}`, "danger");
          if (activeLink && currentName) activeLink.textContent = currentName; // Revert UI
      } finally { activeLink = null; activeId = null; }
  });
}

// --- Delete Tab Handler (Penalty Specific) ---
export function attachDeletePenaltyTabHandler() {
  const btn = document.getElementById("deletePenaltyTabBtn"); // Use penalty button ID
  if (!btn || !window.isLoggedIn) return; // Only for logged-in users

  btn.addEventListener("click", async () => {
      const link = document.querySelector("#penaltiesTab .nav-link.active"); // Use penalty tab selector
      if (!link) return showFlash("No active penalty tab found.", "warning");

      const tabId = link.getAttribute("href")?.substring(1);
      const tabName = link.textContent.trim() || 'this tab';
      const csrfToken = window.csrfToken;

      // Use penalty-specific default ID check
      if (!tabId || tabId === 'default') {
          showFlash(tabId === 'default' ? "Default penalty tab cannot be deleted." : "Could not identify active tab.", "warning");
          return;
      }

      const ok = await confirmModal(`Delete penalty tab “${tabName}”? This cannot be undone.`, "Delete Penalty Tab?");
      if (!ok) return;

      btn.disabled = true;

      try {
          // *** Use Penalty API Endpoint ***
          const res = await apiFetch("/api/penalties/delete_tab", {
              method: "POST", body: { tabId: tabId }
          }, csrfToken);

          if (res.status !== "ok") { // Simplified check, specific deleted ID might not be returned
              throw new Error(res.error || "Server error during penalty delete.");
          }

          // --- SUCCESS: Update UI Dynamically ---
          console.log(`[Delete Penalty Tab] Successfully deleted tab ${tabId} via API.`);

          // 1. Remove from global JS state (use penalty state object)
          if(window.userPenaltyTabsData){
             delete window.userPenaltyTabsData.tabs?.[tabId];
             delete window.userPenaltyTabsData.entries?.[tabId];
             console.log(`[Delete Penalty Tab] Removed ${tabId} from window.userPenaltyTabsData.`);
          }

          // 2. Remove Tab Link and Pane from DOM
          const tabLinkElement = document.getElementById(link.id);
          const tabListItem = tabLinkElement?.closest('li.nav-item');
          const tabPaneElement = document.getElementById(tabId);

          if (tabListItem) tabListItem.remove();
          else console.warn(`[Delete Penalty Tab] Could not find tab list item for ${link.id} to remove.`);

          if (tabPaneElement) tabPaneElement.remove();
          else console.warn(`[Delete Penalty Tab] Could not find tab pane for ${tabId} to remove.`);

          // 3. Activate the 'Default' penalty tab
          const defaultTabLink = document.getElementById('default-penalty-tab'); // Use penalty default ID
          if (defaultTabLink && typeof $ !== 'undefined' && $.fn.tab) {
              $(defaultTabLink).tab('show');
          } else { console.warn("[Delete Penalty Tab] Could not activate default tab."); }

          showFlash(`Penalty Tab "${tabName}" deleted successfully.`, "success");

      } catch (e) {
          console.error("Delete penalty tab failed:", e);
          showFlash(`Error deleting penalty tab: ${e.message}`, "danger");
      } finally {
          btn.disabled = false;
      }
  });
}


// --- Load Global Penalty Defaults (Exported Function) ---
export async function loadAndSaveGlobalPenaltyDefaults() {
  const isLoggedIn = window.isLoggedIn === true;
  const csrfToken = window.csrfToken;
  let savedSuccessfully = false; // Flag to track save success

  console.log("[Load Defaults] Fetching global penalty defaults...");
  // Fetch global list from penalty API
  const data = await apiFetch("/api/penalties/load_defaults");
  if (!Array.isArray(data?.penalties)) {
      console.error("[Load Defaults] Invalid default penalty data received from server.");
      // Still try to render empty? Or throw? Let's render empty for now.
      renderPenaltiesForTab("default");
      throw new Error("Invalid default penalty data received from server.");
  }

  // Normalize the received entries
  const globalDefaultPenalties = data.penalties.map(p => ({
      id: `db-p-${p.id}`, // Prefix DB ID consistently
      name: p.name || "",
      probability: p.probability !== undefined ? parseFloat(p.probability).toFixed(4) : '0.0000',
      description: p.description || "",
  }));
   console.log(`[Load Defaults] Fetched ${globalDefaultPenalties.length} global defaults.`);

  if (isLoggedIn) {
      console.log("[Load Defaults] Attempting to save global penalties as user's 'default' tab via API...");
      const payload = { tabId: 'default', tabName: 'Default', penalties: globalDefaultPenalties };
      try {
          const saveResponse = await apiFetch('/api/penalties/save_tab', { method: 'POST', body: payload }, csrfToken);
          if (saveResponse.status === 'ok') {
               console.log("[Load Defaults] Successfully saved global defaults as user's default tab.");
               savedSuccessfully = true;
               // Update global JS state ONLY IF save was successful
               if(window.userPenaltyTabsData) {
                  window.userPenaltyTabsData.tabs['default'] = { name: "Default" };
                  window.userPenaltyTabsData.entries['default'] = saveResponse?.saved_tab?.penalties || globalDefaultPenalties; // Prefer response data
               }
          } else {
              // Log specific error from API if available
              console.error("[Load Defaults] API failed to save default penalties:", saveResponse.error || "Unknown API error");
              // Do NOT update state if save failed
              // Optionally show a flash message to the user
              showFlash("Could not save default penalties to your account.", "warning");
          }
      } catch (saveError) {
          console.error("[Load Defaults] Network/fetch error saving default penalties:", saveError);
          // Do NOT update state if save failed
          showFlash("Network error saving default penalties.", "warning");
      }

  } else {
      console.log("[Load Defaults] Saving global penalties to localStorage...");
      const entries = getLocalPenalties() || { default: [] };
      entries.default = globalDefaultPenalties;
      setLocalPenalties(entries);
      savedSuccessfully = true; // Assume local save works
      // Update state for anonymous (though less critical as it reads from local)
      if(window.userPenaltyTabsData){ // Check if object exists (it shouldn't for anon, but safe check)
           window.userPenaltyTabsData.tabs['default'] = { name: "Default" };
           window.userPenaltyTabsData.entries['default'] = globalDefaultPenalties;
      }
  }

  // Render the default tab UI based on what's now in the state/local storage
  // If save failed for logged-in user, state won't have been updated with globals,
  // so render will show empty or whatever was loaded previously (if anything).
  // If save succeeded (or anonymous), state/local has globals, render shows them.
  console.log("[Load Defaults] Rendering default tab.");
  renderPenaltiesForTab("default");

  return savedSuccessfully; // Return status of the save attempt
}

// --- Attach Handler for Load Defaults Button (Penalty Specific) ---
export function attachLoadDefaultPenaltiesHandler() {
  const loadBtn = document.getElementById("loadDefaultPenaltiesBtn"); // Use penalty button ID
  const okBtn = document.getElementById("confirmLoadDefaultPenaltiesBtn"); // Use penalty modal button ID
  if (!loadBtn || !okBtn) return;

  loadBtn.addEventListener("click", () => {
      const isLoggedIn = window.isLoggedIn === true;
      const message = isLoggedIn
          ? "Load global defaults? This will overwrite your personal 'Default' penalty tab saved to your account."
          : "Load global defaults? This will override penalties currently in your local 'Default' tab.";
      document.getElementById('confirmLoadDefaultPenaltiesModal').querySelector('.modal-body').textContent = message;
      // Use penalty modal ID
      if (typeof $ !== 'undefined' && $.fn.modal) $('#confirmLoadDefaultPenaltiesModal').modal("show");
      else alert("Modal error.");
  });

  okBtn.addEventListener("click", async () => {
      if (typeof $ !== 'undefined' && $.fn.modal) $('#confirmLoadDefaultPenaltiesModal').modal("hide");
      loadBtn.disabled = okBtn.disabled = true;
      try {
          await loadAndSaveGlobalPenaltyDefaults(); // Call penalty version
          showFlash("Global default penalties loaded into 'Default' tab.", "success");
      } catch (e) {
          console.error("Load default penalties failed:", e);
          showFlash(`Error loading default penalties: ${e.message}`, "danger");
      } finally {
          loadBtn.disabled = okBtn.disabled = false;
      }
  });
}


// --- NEW: Load User Penalty Tabs from API ---
export async function loadUserPenaltyTabsFromAPI() {
  console.log("[Load API Penalties] Attempting to load user penalty tabs...");
  const loadingPlaceholder = document.getElementById('loadingPenaltyTabsPlaceholder');
  const tabList = document.getElementById('penaltiesTab');

  if(loadingPlaceholder) loadingPlaceholder.style.display = 'block';
  // Clear existing non-default tabs before loading
  if(tabList) { /* ... clear tabs ... */
      const itemsToRemove = tabList.querySelectorAll('.nav-item:not(:first-child)');
      itemsToRemove.forEach(item => { if (!item.querySelector('#addPenaltyTabBtn')) item.remove(); });
  }
  const tabContent = document.getElementById('penaltiesTabContent');
  if(tabContent){ /* ... clear panes ... */
       const panesToRemove = tabContent.querySelectorAll('.tab-pane:not(#default)');
       panesToRemove.forEach(pane => pane.remove());
  }

  try {
      const data = await apiFetch('/api/penalties/load_tabs');
      // *** ADD DETAILED LOGGING HERE ***
      console.log("[Load API Penalties] Raw API Response:", JSON.stringify(data, null, 2));
      if (typeof data !== 'object' || data === null) throw new Error("Invalid data format from penalty API.");

      // Reset penalty-specific global state
      window.userPenaltyTabsData = { tabs: {}, entries: {} }; // Ensure it's reset
      console.log("[Load API Penalties] Initialized window.userPenaltyTabsData:", JSON.stringify(window.userPenaltyTabsData));

      let hasUserDefault = false;
      let firstTabId = 'default';

      const sortedTabIds = Object.keys(data).sort((a, b) => { /* ... sort logic ... */
           if (a === 'default') return -1; if (b === 'default') return 1;
           const numA = parseInt(a.split('-')[1] || '0'); const numB = parseInt(b.split('-')[1] || '0'); return numA - numB;
      });
      console.log("[Load API Penalties] Processing sortedTabIds:", sortedTabIds);

      for (const tabId of sortedTabIds) {
          const tabData = data[tabId];
           if (!tabData) {
               console.warn(`[Load API Penalties] No data found for tabId: ${tabId}. Skipping.`);
               continue;
           }
           console.log(`[Load API Penalties] Processing tabId: ${tabId}, tabData:`, JSON.stringify(tabData));

           // Normalize incoming penalty data
           const rawPenalties = tabData.penalties; // Get penalties array from response
           if (!Array.isArray(rawPenalties)) {
               console.warn(`[Load API Penalties] 'penalties' for tab ${tabId} is not an array:`, rawPenalties);
               // Assign empty array to prevent errors later
               window.userPenaltyTabsData.entries[tabId] = [];
           } else {
               const normalizedEntries = rawPenalties.map(p => ({
                   id: p.id || `local-p-${Date.now()}-${Math.random().toString(36).substring(2,7)}`,
                   name: p.name || "",
                   probability: p.probability !== undefined ? parseFloat(p.probability).toFixed(4) : '0.0000',
                   description: p.description || ""
               }));
               // *** LOG BEFORE STATE UPDATE ***
               console.log(`[Load API Penalties] Normalized entries for tab ${tabId}:`, JSON.stringify(normalizedEntries));
               // Update state
               window.userPenaltyTabsData.entries[tabId] = normalizedEntries;
           }

           // Update tab definition in state
           window.userPenaltyTabsData.tabs[tabId] = { name: tabData.tab_name || `Penalty Tab ${tabId}` };
           // *** LOG AFTER STATE UPDATE ***
           console.log(`[Load API Penalties] Updated state for tab ${tabId}:`, JSON.stringify(window.userPenaltyTabsData.tabs[tabId]), JSON.stringify(window.userPenaltyTabsData.entries[tabId]));


           // Create UI elements and render entries
           if (tabId === 'default') {
              hasUserDefault = true;
              console.log("[Load API Penalties] User has a saved default penalty tab. Rendering.");
              renderPenaltiesForTab('default'); // Render user's saved default
          } else {
              createPenaltyTabFromLocalData(tabId, window.userPenaltyTabsData.tabs[tabId].name); // Use penalty func
              renderPenaltiesForTab(tabId); // Use penalty func
              if (firstTabId === 'default') firstTabId = tabId;
          }
      }

      // If user had NO saved default, load global penalties
      if (!hasUserDefault) {
          console.log("[Load API Penalties] User has no saved default penalty tab. Fetching global defaults...");
          await loadAndSaveGlobalPenaltyDefaults(); // Use penalty func
          firstTabId = 'default'; // Ensure default is active after loading globals
      }

      // Activate the appropriate tab
      const tabLink = document.querySelector(`#penaltiesTab .nav-link[href="#${firstTabId}"]`);
      if (tabLink && typeof $ !== 'undefined' && $.fn.tab) {
          $(tabLink).tab('show');
      } else { console.warn(`Could not activate penalty tab ${firstTabId}.`); }

      console.log("[Load API Penalties] User penalty tabs processing complete.");
      // penaltyApiLoadFailed = false; // Set by caller

  } catch (error) {
      console.error("[Load API Penalties] Error loading user penalty tabs from API:", error);
      // penaltyApiLoadFailed = true; // Set by caller
      throw error; // Propagate the error to the caller in penalties.js
  } finally {
       if(loadingPlaceholder) loadingPlaceholder.style.display = 'none';
  }
}