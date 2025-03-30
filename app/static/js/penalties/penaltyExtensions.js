// penalties/penaltyExtensions.js
// Handles server interactions for penalty tabs and loading defaults

import { getLocalPenaltyTabs, getLocalPenalties, setLocalPenaltyTabs, setLocalPenalties } from "./penaltyLocalStorageUtils.js";
import { createPenaltyTabFromLocalData } from "./penaltyTabManagement.js";
import { renderPenaltiesForTab } from "./penaltyEntryManagement.js";

// --- Reusable API Fetch Helper --- (Consider moving to a shared utils.js)
async function apiFetch(url, options = {}) {
    const method = options.method || 'GET';
    options.headers = options.headers || {};
    if (['POST', 'PUT', 'DELETE'].includes(method.toUpperCase())) {
        if (!options.headers['Content-Type']) { options.headers['Content-Type'] = 'application/json'; }
        if (typeof csrfToken === 'string' && csrfToken) { options.headers['X-CSRFToken'] = csrfToken; }
        if (options.body && typeof options.body === 'object' && options.headers['Content-Type'] === 'application/json') {
            options.body = JSON.stringify(options.body);
        }
    }
    console.log(`Penalty API Fetch: ${method} ${url}`);
    const response = await fetch(url, options);
    if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const errorMessage = errorData?.error || errorData?.message || response.statusText || `HTTP error ${response.status}`;
        console.error(`API Error ${response.status} for ${url}:`, errorMessage, errorData);
        throw new Error(errorMessage);
    }
     if (response.status === 204) return { status: 'ok', message: 'Operation successful (no content)' };
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) return await response.json();
    return { status: 'ok', message: 'Operation successful (non-JSON response)' };
}

// --- Attach Handlers ---

// Attach Save Penalty Tab Button Handler
export function attachSavePenaltyTabHandler() {
  const saveBtn = document.getElementById("savePenaltyTabBtn");
  if (!saveBtn) { return; } // Expected if not logged in
  console.log("Attaching Save Penalty Tab handler to #savePenaltyTabBtn");

  saveBtn.addEventListener("click", async () => {
    const activeTabLink = document.querySelector('#penaltiesTab .nav-link.active'); // Use correct tab container ID
    if (!activeTabLink) { alert("No active penalty tab found."); return; }
    const currentTabId = activeTabLink.getAttribute("href")?.substring(1); // e.g., '#penaltyPane-default' -> 'penaltyPane-default'

    if (!currentTabId || currentTabId === "penaltyPane-default") { // Prevent saving default
        alert("The default penalty tab cannot be saved."); return;
    }

    console.log(`Attempting to save penalty tab: ${currentTabId}`);
    saveBtn.disabled = true;

    try {
        const allPenalties = getLocalPenalties();
        const currentTabPenalties = allPenalties[currentTabId] || []; // Get penalties for this specific tab

        const tabData = {
            tabId: currentTabId, // Send client ID (e.g., penaltyPane-1)
            tabName: activeTabLink.textContent.trim(),
            penalties: currentTabPenalties // Send the list of penalty objects
        };

        // *** TODO: Update URL when backend endpoint is implemented ***
        const data = await apiFetch("/api/penalties/save_tab", {
            method: "POST",
            body: tabData
        });

        if (data.status === "ok") {
            alert("Penalty tab saved successfully.");
        } else { alert("Error saving penalty tab: " + (data.error || "Unknown response")); }
    } catch (error) {
        console.error("Error saving penalty tab:", error);
        alert("Error saving penalty tab: " + error.message);
    } finally {
        saveBtn.disabled = false;
    }
  });
}

// Attach Delete Penalty Tab Button Handler
export function attachDeletePenaltyTabHandler() {
    const deleteBtn = document.getElementById("deletePenaltyTabBtn");
    if (!deleteBtn) { return; } // Expected if not logged in
    console.log("Attaching Delete Penalty Tab handler to #deletePenaltyTabBtn");

    deleteBtn.addEventListener("click", async () => {
        const activeTabLink = document.querySelector('#penaltiesTab .nav-link.active');
        if (!activeTabLink) { alert("No active penalty tab found."); return; }
        const currentTabId = activeTabLink.getAttribute("href")?.substring(1);

        if (!currentTabId || currentTabId === "penaltyPane-default") {
            alert("The default penalty tab cannot be deleted."); return;
        }
        if (!confirm(`Delete tab "${activeTabLink.textContent.trim()}"? This includes local and potentially saved server data.`)) { return; }

        console.log(`Attempting to delete penalty tab: ${currentTabId}`);
        deleteBtn.disabled = true;

        try {
            // *** TODO: Update URL when backend endpoint is implemented ***
            const data = await apiFetch("/api/penalties/delete_tab", {
                method: "POST",
                body: { tabId: currentTabId }
            });

             if (data.status === "ok") {
                 console.log("Server confirmed penalty tab deletion.");
                // Delete locally after server confirms
                try {
                    let localTabs = getLocalPenaltyTabs() || {};
                    let localPenalties = getLocalPenalties() || {};
                    delete localTabs[currentTabId];
                    delete localPenalties[currentTabId];
                    setLocalPenaltyTabs(localTabs);
                    setLocalPenalties(localPenalties);
                    console.log("Deleted penalty tab locally:", currentTabId);
                } catch(localError) { console.error("Error deleting penalty tab locally:", localError); }

                alert("Penalty tab deleted.");
                location.reload(); // Reload page
            } else { alert("Error deleting penalty tab on server: " + (data.error || "Unknown response")); }
        } catch (error) {
            console.error("Error deleting penalty tab:", error);
            alert("Error deleting penalty tab: " + error.message);
        } finally {
             deleteBtn.disabled = false;
        }
    });
}

// Attach Load Saved Penalty Tabs Handler
export function attachLoadSavedPenaltyTabsHandler() {
  const loadBtn = document.getElementById("loadSavedPenaltyTabsBtn");
  if (!loadBtn) { return; } // Expected if not logged in
   console.log("Attaching Load Saved Penalty Tabs handler to #loadSavedPenaltyTabsBtn");

  loadBtn.addEventListener("click", async () => {
    if (!confirm("Load saved penalty tabs? This will overwrite unsaved local changes in non-default tabs.")) { return; }
    console.log("Attempting to load saved penalty tabs...");
    loadBtn.disabled = true;

    try {
        // *** TODO: Update URL when backend endpoint is implemented ***
        const tabsData = await apiFetch("/api/penalties/load_tabs");

        if (typeof tabsData !== 'object' || tabsData === null) throw new Error("Invalid data from server.");

        console.log("Received saved penalty tabs data:", tabsData);

        // Preserve default, overwrite others
        let localTabs = { "default": getLocalPenaltyTabs()?.["default"] || { name: "Default" } };
        let localPenalties = { "default": getLocalPenalties()?.["default"] || [] };
        let loadedCount = 0;

        for (const clientTabId in tabsData) {
            if (clientTabId !== "default") {
                localTabs[clientTabId] = { name: tabsData[clientTabId].tab_name }; // Assuming structure from backend
                try {
                    localPenalties[clientTabId] = JSON.parse(tabsData[clientTabId].penalties_json || "[]"); // Assuming key name
                    loadedCount++;
                } catch (e) {
                    console.error(`Error parsing penalties JSON for loaded tab ${clientTabId}:`, e);
                    localPenalties[clientTabId] = [];
                }
            }
        }
        setLocalPenaltyTabs(localTabs);
        setLocalPenalties(localPenalties);

        console.log(`${loadedCount} saved penalty tabs loaded into localStorage.`);
        alert("Saved penalty tabs loaded. Reloading page.");
        location.reload();

    } catch (error) {
        console.error("Error loading saved penalty tabs:", error);
        alert("Error loading saved penalty tabs: " + error.message);
         loadBtn.disabled = false;
    }
  });
}

// Attach Penalty Tab Rename Handler (Local Only)
export function attachPenaltyTabRenameHandler() {
  const penaltiesTabContainer = document.getElementById("penaltiesTab"); // Use correct ID
  if (!penaltiesTabContainer) { return; }
   console.log("Attaching Penalty Tab Rename handler to #penaltiesTab");

  penaltiesTabContainer.addEventListener("dblclick", (e) => {
    const tabLink = e.target.closest(".nav-link");
    // Check for the specific ID of the default penalty tab link
    if (tabLink && tabLink.id !== "default-penalty-tab") {
        e.preventDefault();
        const currentName = tabLink.textContent.trim();
        const newName = prompt(`Enter new name for the penalty tab "${currentName}":`, currentName);

        if (newName && newName.trim() && newName.trim() !== currentName) {
            const finalNewName = newName.trim();
            tabLink.textContent = finalNewName;
            const clientTabId = tabLink.getAttribute("data-tab") || tabLink.getAttribute("href")?.substring(1);

            if(clientTabId) {
                try {
                    let localTabs = getLocalPenaltyTabs() || {};
                    if (localTabs[clientTabId]) {
                        localTabs[clientTabId].name = finalNewName;
                        setLocalPenaltyTabs(localTabs); // Save rename locally
                        console.log(`Penalty Tab '${clientTabId}' renamed locally to '${finalNewName}'.`);
                    } else { console.warn(`Could not find penalty tab ${clientTabId} in localTabs to rename.`); }
                } catch (error) {
                    console.error("Error updating penalty tab name in localStorage:", error);
                    alert("Failed to save rename locally.");
                    tabLink.textContent = currentName; // Revert
                }
            } else { console.error("Could not determine clientTabId for penalty tab rename."); tabLink.textContent = currentName; }
        }
    } else if (tabLink && tabLink.id === "default-penalty-tab") {
        alert("The Default penalty tab cannot be renamed."); // Specific message
    }
  });
}

// Attach Load Default Penalties Button Handler (Modal Trigger + Confirmation Logic)
export function attachLoadDefaultPenaltiesHandler() {
    const loadDefaultBtn = document.getElementById("loadDefaultPenaltiesBtn");
    const confirmBtn = document.getElementById("confirmLoadDefaultPenaltiesBtn");
  
    if (!loadDefaultBtn) { console.warn("Load Default Penalties button not found."); return; }
    if (!confirmBtn) { console.error("Confirmation button for load default penalties not found."); return; }
  
    console.log("Attaching Load Default Penalties handlers.");
  
    loadDefaultBtn.addEventListener("click", () => {
       try { $('#confirmLoadDefaultPenaltiesModal').modal('show'); }
       catch (e) { console.error("Error showing confirm load default penalties modal:", e); }
    });
  
    confirmBtn.addEventListener("click", async () => {
      console.log("Load Default Penalties confirmed.");
       try { $('#confirmLoadDefaultPenaltiesModal').modal('hide'); } catch(e) { console.warn("Could not hide confirm modal.", e);}
  
       loadDefaultBtn.disabled = true; confirmBtn.disabled = true;
  
      try {
          const data = await apiFetch("/api/penalties/load_defaults"); // Fetch from DB API
  
          if (!data || !Array.isArray(data.penalties)) {
               throw new Error("Invalid data structure for penalties received.");
          }
          console.log(`Received ${data.penalties.length} default penalties from DB.`);
  
          // *** SIMPLIFIED CONVERSION - API returns correct keys ***
          // Assign temporary local IDs? Or use DB IDs? Let's use DB IDs.
          // Ensure JS uses these keys consistently.
          const defaultPenalties = data.penalties.map(p => ({
              id: p.id, // Use the ID from the database
              name: p.name || "",
              probability: p.probability !== undefined ? p.probability : 0.0,
              description: p.description || "",
              tabName: "Default" // Assign to default tab
          }));
  
          // Update only the 'default' penalty tab in localStorage
          let localPenalties = getLocalPenalties() || {}; // Use getter
          localPenalties["default"] = defaultPenalties;
          setLocalPenalties(localPenalties); // Use setter
          console.log("Default penalties updated in localStorage.");
  
          // Re-render the 'default' penalty tab UI
          renderPenaltiesForTab("default");
          console.log("Default penalty tab UI refreshed.");
          alert("Default penalties loaded successfully into the 'Default' tab.");
  
      } catch (error) {
          console.error("Error loading/processing default penalties:", error);
          alert("Error loading default penalties: " + error.message);
      } finally {
           loadDefaultBtn.disabled = false; confirmBtn.disabled = false;
      }
    });
  }
  