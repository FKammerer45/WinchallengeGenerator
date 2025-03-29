// app/static/js/games/gamesExtensions.js

import { getLocalTabs, getLocalEntries, setLocalTabs, setLocalEntries } from "./localStorageUtils.js";
import { createTabFromLocalData } from "./tabManagement.js";
import { renderGamesForTab } from "./entryManagement.js";

// --- Helper Function (Optional but Recommended) ---
async function apiFetch(url, options = {}) {
    const method = options.method || 'GET';
    // Ensure headers object exists
    options.headers = options.headers || {};

    if (['POST', 'PUT', 'DELETE'].includes(method.toUpperCase())) {
        // Assume JSON body if not specified otherwise
        if (!options.headers['Content-Type']) {
             options.headers['Content-Type'] = 'application/json';
        }
        // Add CSRF token if available globally
        if (typeof csrfToken === 'string' && csrfToken) {
            options.headers['X-CSRFToken'] = csrfToken;
        } else {
            console.warn("CSRF token variable not found for API request.");
        }
         // Stringify body if it's an object and content type is JSON
         if (options.body && typeof options.body === 'object' && options.headers['Content-Type'] === 'application/json') {
            options.body = JSON.stringify(options.body);
         }
    }

    console.log(`API Fetch: ${method} ${url}`); // Log the attempt

    const response = await fetch(url, options);

    if (!response.ok) {
        const errorData = await response.json().catch(() => null); // Try parsing error body
        const errorMessage = errorData?.error || errorData?.message || response.statusText || `HTTP error ${response.status}`;
        console.error(`API Error ${response.status} for ${url}:`, errorMessage, errorData);
        throw new Error(errorMessage); // Throw error to be caught by caller
    }

    // Handle potential no-content responses (like 204)
    if (response.status === 204) {
        return { status: 'ok', message: 'Operation successful (no content)' };
    }

    // Only parse JSON if content-type indicates it
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
        return await response.json();
    } else {
        // If not JSON, return success status (or potentially response text if needed)
         return { status: 'ok', message: 'Operation successful (non-JSON response)' };
    }
}


// --- Attach Handlers ---

export function attachSaveTabHandler() {
  const saveTabBtn = document.getElementById("saveTabBtn");
  if (!saveTabBtn) {
    // Don't warn if user isn't logged in (isLoggedIn checked in games.js)
    return;
  }
  console.log("Attaching Save Tab handler to #saveTabBtn");

  saveTabBtn.addEventListener("click", async () => {
    const activeTabLink = document.querySelector('#gamesTab .nav-link.active');
    if (!activeTabLink) { alert("No active tab found."); return; }
    const currentTabId = activeTabLink.getAttribute("href")?.substring(1);

    if (!currentTabId) { alert("Could not determine active tab ID."); return; }
    if (currentTabId === "default") { alert("The default tab cannot be saved."); return; }

    console.log(`Attempting to save tab: ${currentTabId}`);
    saveTabBtn.disabled = true; // Disable button during operation

    try {
        const allEntries = getLocalEntries();
        const currentTabEntries = allEntries[currentTabId] || [];

        const tabData = {
            tabId: currentTabId,
            tabName: activeTabLink.textContent.trim(),
            entries: currentTabEntries
        };

        const data = await apiFetch("/api/tabs/save", { // Correct URL
            method: "POST",
            body: tabData
        });

        if (data.status === "ok") {
            alert("Tab saved successfully.");
            console.log("Tab saved response:", data);
        } else {
            alert("Error saving tab: " + (data.error || "Unknown server response"));
        }
    } catch (error) {
        console.error("Error saving tab:", error);
        alert("Error saving tab: " + error.message);
    } finally {
        saveTabBtn.disabled = false; // Re-enable button
    }
  });
}

// *** ADDED attachDeleteTabHandler ***
export function attachDeleteTabHandler() {
    const deleteTabBtn = document.getElementById("deleteTabBtn");
    if (!deleteTabBtn) { return; } // Expected if not logged in
    console.log("Attaching Delete Tab handler to #deleteTabBtn");

    deleteTabBtn.addEventListener("click", async () => {
        const activeTabLink = document.querySelector('#gamesTab .nav-link.active');
        if (!activeTabLink) { alert("No active tab found."); return; }
        const currentTabId = activeTabLink.getAttribute("href")?.substring(1);

        if (!currentTabId) { alert("Could not determine active tab ID."); return; }
        if (currentTabId === "default") { alert("The default tab cannot be deleted."); return; }
        if (!confirm(`Are you sure you want to delete the tab "${activeTabLink.textContent.trim()}"? This action cannot be undone.`)) { return; }

        console.log(`Attempting to delete tab: ${currentTabId}`);
        deleteTabBtn.disabled = true; // Disable button

        try {
            // Send deletion request to the server
            const data = await apiFetch("/api/tabs/delete", { // Correct URL
                method: "POST",
                body: { tabId: currentTabId }
            });

             if (data.status === "ok") {
                console.log("Server confirmed tab deletion (or tab didn't exist).");
                // Delete locally *after* server confirmation
                try {
                    let localTabs = getLocalTabs() || {};
                    let localEntries = getLocalEntries() || {};
                    delete localTabs[currentTabId];
                    delete localEntries[currentTabId];
                    setLocalTabs(localTabs);
                    setLocalEntries(localEntries);
                    console.log("Deleted tab locally:", currentTabId);
                } catch(localError) {
                    console.error("Error deleting tab locally (server delete succeeded):", localError);
                    alert("Tab deleted on server, but failed to update local storage. Please reload.");
                }
                alert("Tab deleted successfully.");
                location.reload(); // Reload page to reflect changes and clean UI state
            } else {
                 alert("Error deleting tab on server: " + (data.error || "Unknown server response"));
            }
        } catch (error) {
            console.error("Error deleting tab:", error);
            alert("Error deleting tab: " + error.message);
            // Don't delete locally if server failed
        } finally {
            deleteTabBtn.disabled = false; // Re-enable button
        }
    });
}


export function attachLoadSavedTabsHandler() {
  const loadSavedBtn = document.getElementById("loadSavedTabsBtn");
  if (!loadSavedBtn) { return; } // Expected if not logged in
   console.log("Attaching Load Saved Tabs handler to #loadSavedTabsBtn");

  loadSavedBtn.addEventListener("click", async () => {
    if (!confirm("Loading saved tabs will overwrite any unsaved local changes in non-default tabs. Continue?")) { return; }
    console.log("Attempting to load saved tabs...");
    loadSavedBtn.disabled = true; // Disable button

    try {
        const tabsData = await apiFetch("/api/tabs/load"); // Correct URL (GET by default)

        if (typeof tabsData !== 'object' || tabsData === null) {
             throw new Error("Invalid data received from server.");
        }

        console.log("Received saved tabs data:", tabsData);

        // Prepare new local storage data, preserving default tab
        let localTabs = { "default": getLocalTabs()?.["default"] || { name: "Default" } };
        let localEntries = { "default": getLocalEntries()?.["default"] || [] };
        let loadedCount = 0;

        for (const clientTabId in tabsData) {
            if (clientTabId !== "default") {
                localTabs[clientTabId] = { name: tabsData[clientTabId].tab_name };
                try {
                    localEntries[clientTabId] = JSON.parse(tabsData[clientTabId].entries_json || "[]");
                    loadedCount++;
                } catch (e) {
                    console.error(`Error parsing entries JSON for loaded tab ${clientTabId}:`, e);
                    localEntries[clientTabId] = [];
                }
            }
        }
        setLocalTabs(localTabs);
        setLocalEntries(localEntries);

        console.log(`${loadedCount} saved tabs data loaded into localStorage.`);
        alert("Saved tabs loaded. Reloading page to apply changes.");
        location.reload(); // Reload page to rebuild UI

    } catch (error) {
        console.error("Error loading saved tabs:", error);
        alert("Error loading saved tabs: " + error.message);
         loadSavedBtn.disabled = false; // Re-enable only on error
    }
    // Don't re-enable on success because page reloads
  });
}

// Attach Tab Rename Handler (Local Only) - No changes needed here
export function attachTabRenameHandler() {
  const gamesTab = document.getElementById("gamesTab");
  if (!gamesTab) {
    console.error("Tab container ('gamesTab') not found. Cannot attach rename handler.");
    return;
  }
   console.log("Attaching Tab Rename handler to #gamesTab");
   // ... (rest of rename logic remains the same) ...
    gamesTab.addEventListener("dblclick", (e) => {
        const tabLink = e.target.closest(".nav-link");
        if (tabLink && tabLink.id !== "default-tab") {
            e.preventDefault();
            const currentName = tabLink.textContent.trim();
            const newName = prompt(`Enter new name for the tab "${currentName}":`, currentName);
            if (newName && newName.trim() && newName.trim() !== currentName) {
                const finalNewName = newName.trim();
                tabLink.textContent = finalNewName;
                const clientTabId = tabLink.getAttribute("data-tab") || tabLink.getAttribute("href")?.substring(1);
                if(clientTabId) {
                    try {
                        let localTabs = getLocalTabs() || {};
                        if (localTabs[clientTabId]) {
                            localTabs[clientTabId].name = finalNewName;
                            setLocalTabs(localTabs);
                            console.log(`Tab '${clientTabId}' renamed locally to '${finalNewName}'.`);
                        } else { console.warn(`Could not find tab ${clientTabId} in localTabs to rename.`); }
                    } catch (error) {
                        console.error("Error updating tab name in localStorage:", error);
                        alert("Failed to save rename locally.");
                        tabLink.textContent = currentName; // Revert UI
                    }
                } else {
                     console.error("Could not determine clientTabId for rename.");
                     tabLink.textContent = currentName; // Revert UI
                }
            }
        }
    });
}

// Attach Load Default Entries Button Handler (Modal Trigger + Confirmation Logic)
export function attachLoadDefaultEntriesHandler() {
  const loadDefaultBtn = document.getElementById("loadDefaultEntriesBtn");
  const confirmBtn = document.getElementById("confirmLoadDefaultBtn");

  if (!loadDefaultBtn) {
    console.warn("Load Default Entries button ('loadDefaultEntriesBtn') not found.");
    return;
  }
  if (!confirmBtn) {
       console.error("Confirmation button ('confirmLoadDefaultBtn') for load default not found.");
       return;
  }
  console.log("Attaching Load Default Entries handlers.");

  loadDefaultBtn.addEventListener("click", () => {
     try { $('#confirmLoadDefaultModal').modal('show'); }
     catch (e) { console.error("Error showing confirm load default modal:", e); alert("Could not open confirmation dialog.");}
  });

  confirmBtn.addEventListener("click", async () => {
    console.log("Load Default confirmed. Starting process.");
     try { $('#confirmLoadDefaultModal').modal('hide'); }
     catch(e) { console.warn("Could not hide confirm modal.", e);}

     loadDefaultBtn.disabled = true; // Disable button during load
     confirmBtn.disabled = true;

    try {
        const data = await apiFetch("/api/games/load_defaults"); // Correct URL, uses helper

        if (!data || !Array.isArray(data.entries)) {
             throw new Error("Invalid data structure received from server.");
        }
        console.log(`Received ${data.entries.length} default entries.`);

        const convertedEntries = data.entries.map(entry => ({
            id: entry.id,
            game: entry.Spiel || "",
            gameMode: entry.Spielmodus || "",
            difficulty: entry.Schwierigkeit,
            numberOfPlayers: entry.Spieleranzahl,
            tabName: "Default",
            weight: entry.weight || 1
        }));

        let localEntries = getLocalEntries() || {}; // Use getter which handles errors
        localEntries["default"] = convertedEntries;
        setLocalEntries(localEntries); // Use setter which handles errors
        console.log("Default entries updated in localStorage.");

        renderGamesForTab("default"); // Refresh UI
        console.log("Default tab UI refreshed.");
        alert("Default entries loaded successfully into the 'Default' tab.");

    } catch (error) {
        console.error("Error loading/processing default entries:", error);
        alert("Error loading default entries: " + error.message);
    } finally {
         loadDefaultBtn.disabled = false; // Re-enable buttons
         confirmBtn.disabled = false;
    }
  });
}