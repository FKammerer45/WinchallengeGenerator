// static/js/games/gamesExtensions.js
// Handles server interaction for games tabs and default entries
//------------------------------------------------------------------

import {
    getLocalTabs,
    getLocalEntries,
    setLocalTabs,
    setLocalEntries
} from "./localStorageUtils.js";
import { createTabFromLocalData } from "./tabManagement.js";
import { renderGamesForTab } from "./entryManagement.js";
import { confirmModal, showFlash } from "../utils/helpers.js";

// ---------- generic fetch -----------------------------------------------------
async function apiFetch(url, options = {}) {
    const method = options.method || "GET";
    options.headers = options.headers || {};

    if (["POST", "PUT", "DELETE"].includes(method.toUpperCase())) {
        options.headers["Content-Type"] ??= "application/json";
        if (typeof csrfToken === "string" && csrfToken)
            options.headers["X-CSRFToken"] = csrfToken;
        if (
            options.body &&
            typeof options.body === "object" &&
            options.headers["Content-Type"] === "application/json"
        ) {
            options.body = JSON.stringify(options.body);
        }
    }

    console.log(`API Fetch: ${method} ${url}`);
    const res = await fetch(url, options);

    if (!res.ok) {
        const err = (await res.json().catch(() => null)) || {};
        const msg =
            err.error || err.message || res.statusText || `HTTP ${res.status}`;
        console.error(`API error ${res.status} for ${url}:`, msg);
        throw new Error(msg);
    }

    if (res.status === 204) return { status: "ok" };
    const ct = res.headers.get("content-type");
    return ct && ct.includes("application/json")
        ? await res.json()
        : { status: "ok" };
}

// ---------- SAVE TAB ----------------------------------------------------------
export function attachSaveTabHandler() {
    const btn = document.getElementById("saveTabBtn");
    if (!btn) return;

    btn.addEventListener("click", async () => {
        const link = document.querySelector("#gamesTab .nav-link.active");
        if (!link) return showFlash("No active tab found.", "warning");

        const tabId = link.getAttribute("href")?.substring(1);
        if (!tabId) return showFlash("Could not determine active tab ID.", "danger");
        if (tabId === "default")
            return showFlash("The default tab cannot be saved.", "info");

        btn.disabled = true;
        try {
            const payload = {
                tabId,
                tabName: link.textContent.trim(),
                entries: getLocalEntries()[tabId] || []
            };
            const res = await apiFetch("/api/tabs/save", {
                method: "POST",
                body: payload
            });
            res.status === "ok"
                ? showFlash("Tab saved successfully.", "success")
                : showFlash("Error saving tab: " + (res.error || "Unknown"), "danger");
        } catch (e) {
            console.error(e);
            showFlash("Error saving tab: " + e.message, "danger");
        } finally {
            btn.disabled = false;
        }
    });
}

// ---------- DELETE TAB --------------------------------------------------------
export function attachDeleteTabHandler() {
    const btn = document.getElementById("deleteTabBtn");
    if (!btn) return;

    btn.addEventListener("click", async () => {
        const link = document.querySelector("#gamesTab .nav-link.active");
        if (!link) return showFlash("No active tab found.", "warning");

        const tabId = link.getAttribute("href")?.substring(1);
        if (!tabId) return showFlash("Could not determine active tab ID.", "danger");
        if (tabId === "default")
            return showFlash("The default tab cannot be deleted.", "info");

        const ok = await confirmModal(
            `Delete tab “${link.textContent.trim()}”? This removes local and server copies.`,
            "Delete game tab?"
        );
        if (!ok) return;

        btn.disabled = true;
        try {
            const res = await apiFetch("/api/tabs/delete", {
                method: "POST",
                body: { tabId }
            });

            if (res.status === "ok") {
                const tabs = getLocalTabs() || {};
                const entries = getLocalEntries() || {};
                delete tabs[tabId];
                delete entries[tabId];
                setLocalTabs(tabs);
                setLocalEntries(entries);
                showFlash("Tab deleted.", "success");
                location.reload();
            } else {
                showFlash(
                    "Error deleting tab: " + (res.error || "Unknown response"),
                    "danger"
                );
            }
        } catch (e) {
            console.error(e);
            showFlash("Error deleting tab: " + e.message, "danger");
        } finally {
            btn.disabled = false;
        }
    });
}

// ---------- LOAD SAVED TABS ---------------------------------------------------
export function attachLoadSavedTabsHandler() {
    const btn = document.getElementById("loadSavedTabsBtn");
    if (!btn) return;

    btn.addEventListener("click", async () => {
        const ok = await confirmModal(
            "Load saved tabs? Unsaved local changes in non‑default tabs will be overwritten.",
            "Load saved tabs?"
        );
        if (!ok) return;

        btn.disabled = true;
        try {
            const data = await apiFetch("/api/tabs/load"); // GET
            if (typeof data !== "object") throw new Error("Invalid data");

            const newTabs = {
                default: getLocalTabs()?.default || { name: "Default" }
            };
            const newEntries = {
                default: getLocalEntries()?.default || []
            };

            let count = 0;
            for (const id in data) {
                if (id === "default") continue;
                newTabs[id] = { name: data[id].tab_name };
                try {
                    newEntries[id] = JSON.parse(data[id].entries_json || "[]");
                } catch {
                    newEntries[id] = [];
                }
                count++;
            }
            setLocalTabs(newTabs);
            setLocalEntries(newEntries);
            showFlash(`${count} saved tab(s) loaded.`, "success");
            location.reload();
        } catch (e) {
            console.error(e);
            showFlash("Error loading saved tabs: " + e.message, "danger");
            btn.disabled = false;
        }
    });
}

// ---------- TAB RENAME (local only) ------------------------------------------
export function attachTabRenameHandler() {
    const container = document.getElementById("gamesTab");
    if (!container) return;
  
    let activeLink, activeId;
  
    // On double-click, open modal and prefill input
    container.addEventListener("dblclick", (e) => {
      const link = e.target.closest(".nav-link");
      if (!link || link.id === "default-tab") return;
  
      activeLink = link;
      activeId = link.dataset.tab || link.getAttribute("href").substring(1);
      const currentName = link.textContent.trim();
  
      // Prefill and show the modal
      document.getElementById("renameGameTabInput").value = currentName;
      $("#renameGameTabModal").modal("show");
    });
  
    // Handle modal form submission
    document
      .getElementById("renameGameTabForm")
      .addEventListener("submit", (e) => {
        e.preventDefault();
        const newName = document
          .getElementById("renameGameTabInput")
          .value.trim();
  
        // Close modal if no change
        if (!newName || newName === activeLink.textContent.trim()) {
          return $("#renameGameTabModal").modal("hide");
        }
  
        try {
          const tabs = getLocalTabs() || {};
          if (!tabs[activeId]) throw new Error("Local tab not found.");
  
          // Persist change locally and update UI
          tabs[activeId].name = newName;
          setLocalTabs(tabs);
          activeLink.textContent = newName;
          showFlash("Game tab renamed.", "success");
        } catch (err) {
          console.error(err);
          showFlash("Failed to rename game tab.", "danger");
        } finally {
          $("#renameGameTabModal").modal("hide");
        }
      });
  }

// ---------- DEFAULT ENTRIES ---------------------------------------------------
export async function loadDefaultEntriesFromDB() {
    const data = await apiFetch("/api/games/load_defaults");
    if (!Array.isArray(data.entries))
        throw new Error("Invalid data structure from server.");

    const defaults = data.entries.map(e => ({
        id: e.id,
        game: e.Spiel || "",
        gameMode: e.Spielmodus || "",
        difficulty: e.Schwierigkeit,
        numberOfPlayers: e.Spieleranzahl,
        tabName: "Default",
        weight: e.weight || 1
    }));

    const entries = getLocalEntries() || {};
    entries.default = defaults;
    setLocalEntries(entries);
    renderGamesForTab("default");
}

// ---------- LOAD DEFAULT BUTTON (uses existing modal) ------------------------
export function attachLoadDefaultEntriesHandler() {
    const loadBtn = document.getElementById("loadDefaultEntriesBtn");
    const okBtn = document.getElementById("confirmLoadDefaultBtn");
    if (!loadBtn || !okBtn) return;

    loadBtn.addEventListener("click", () =>
        $("#confirmLoadDefaultModal").modal("show")
    );

    okBtn.addEventListener("click", async () => {
        $("#confirmLoadDefaultModal").modal("hide");
        loadBtn.disabled = okBtn.disabled = true;
        try {
            await loadDefaultEntriesFromDB();
            showFlash("Default entries loaded.", "success");
        } catch (e) {
            console.error(e);
            showFlash("Error loading default entries: " + e.message, "danger");
        } finally {
            loadBtn.disabled = okBtn.disabled = false;
        }
    });
}
