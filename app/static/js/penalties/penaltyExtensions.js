// penalties/penaltyExtensions.js
// Handles server interactions for penalty tabs and loading defaults
// – All plain alerts replaced by reusable toast helper `showFlash()` –
//   confirm() dialogs (user‑decisions) kept unchanged.

import {
    getLocalPenaltyTabs,
    getLocalPenalties,
    setLocalPenaltyTabs,
    setLocalPenalties
} from "./penaltyLocalStorageUtils.js";
import { createPenaltyTabFromLocalData } from "./penaltyTabManagement.js";
import { renderPenaltiesForTab } from "./penaltyEntryManagement.js";
import { confirmModal, showFlash } from "../utils/helpers.js";


// ---------- reusable API fetch ------------------------------------------------
async function apiFetch(url, options = {}) {
    const method = options.method || "GET";
    options.headers = options.headers || {};

    if (["POST", "PUT", "DELETE"].includes(method.toUpperCase())) {
        if (!options.headers["Content-Type"])
            options.headers["Content-Type"] = "application/json";
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

    console.log(`Penalty API Fetch: ${method} ${url}`);
    const resp = await fetch(url, options);

    if (!resp.ok) {
        const errData = await resp.json().catch(() => null);
        const msg =
            errData?.error ||
            errData?.message ||
            resp.statusText ||
            `HTTP error ${resp.status}`;
        console.error(`API error ${resp.status} ${url}:`, msg, errData);
        throw new Error(msg);
    }
    if (resp.status === 204) return { status: "ok", message: "no content" };

    return resp.headers.get("content-type")?.includes("application/json")
        ? await resp.json()
        : { status: "ok", message: "non‑JSON response" };
}

// ---------- SAVE TAB ----------------------------------------------------------
export function attachSavePenaltyTabHandler() {
    const btn = document.getElementById("savePenaltyTabBtn");
    if (!btn) return;

    btn.addEventListener("click", async () => {
        const activeLink = document.querySelector(
            "#penaltiesTab .nav-link.active"
        );
        if (!activeLink)
            return showFlash("No active penalty tab found.", "warning");

        const tabId = activeLink.getAttribute("href")?.substring(1);
        if (tabId === "default")
            return showFlash("The default penalty tab cannot be saved.", "info");

        btn.disabled = true;
        try {
            const allPen = getLocalPenalties();
            const payload = {
                tabId,
                tabName: activeLink.textContent.trim(),
                penalties: allPen[tabId] || []
            };
            const res = await apiFetch("/api/penalties/save_tab", {
                method: "POST",
                body: payload
            });
            res.status === "ok"
                ? showFlash("Penalty tab saved successfully.", "success")
                : showFlash(
                    "Error saving penalty tab: " + (res.error || "Unknown response"),
                    "danger"
                );
        } catch (e) {
            console.error(e);
            showFlash("Error saving penalty tab: " + e.message, "danger");
        } finally {
            btn.disabled = false;
        }
    });
}

/* ---------- DELETE TAB ---------------------------------------------- */
export function attachDeletePenaltyTabHandler() {
    const btn = document.getElementById("deletePenaltyTabBtn");
    if (!btn) return;
  
    btn.addEventListener("click", async () => {
      const activeLink = document.querySelector("#penaltiesTab .nav-link.active");
      if (!activeLink) return showFlash("No active penalty tab found.", "warning");
  
      const tabId = activeLink.getAttribute("href")?.substring(1);
      if (!tabId || tabId === "penaltyPane-default")
        return showFlash("The default penalty tab cannot be deleted.", "info");
  
      /* new modal confirm */
      const ok = await confirmModal(
        `Delete tab “${activeLink.textContent.trim()}”? This removes both local and server copies.`,
        "Delete penalty tab?"
      );
      if (!ok) return;
  
      btn.disabled = true;
      try {
        const res = await apiFetch("/api/penalties/delete_tab", {
          method: "POST",
          body: { tabId }
        });
  
        if (res.status === "ok") {
          const tabs = getLocalPenaltyTabs() || {};
          const pen = getLocalPenalties() || {};
          delete tabs[tabId];
          delete pen[tabId];
          setLocalPenaltyTabs(tabs);
          setLocalPenalties(pen);
          showFlash("Penalty tab deleted.", "success");
          location.reload();
        } else {
          showFlash(
            "Error deleting penalty tab: " + (res.error || "Unknown response"),
            "danger"
          );
        }
      } catch (e) {
        console.error(e);
        showFlash("Error deleting penalty tab: " + e.message, "danger");
      } finally {
        btn.disabled = false;
      }
    });
  }
  
  /* ---------- LOAD SAVED TABS ----------------------------------------- */
  export function attachLoadSavedPenaltyTabsHandler() {
    const btn = document.getElementById("loadSavedPenaltyTabsBtn");
    if (!btn) return;
  
    btn.addEventListener("click", async () => {
      const ok = await confirmModal(
        "Load saved penalty tabs? Unsaved local changes in non‑default tabs will be overwritten.",
        "Load saved tabs?"
      );
      if (!ok) return;
  
      btn.disabled = true;
      try {
        const data = await apiFetch("/api/penalties/load_tabs");
        if (typeof data !== "object") throw new Error("Invalid data from server.");
  
        const newTabs = {
          default: getLocalPenaltyTabs()?.default || { name: "Default" }
        };
        const newPenalties = {
          default: getLocalPenalties()?.default || []
        };
  
        let count = 0;
        for (const id in data) {
          if (id === "default") continue;
          newTabs[id] = { name: data[id].tab_name };
          try {
            newPenalties[id] = JSON.parse(data[id].penalties_json || "[]");
          } catch (e) {
            console.error("Parse penalties JSON", id, e);
            newPenalties[id] = [];
          }
          count++;
        }
        setLocalPenaltyTabs(newTabs);
        setLocalPenalties(newPenalties);
        showFlash(`${count} saved penalty tab(s) loaded.`, "success");
        location.reload();
      } catch (e) {
        console.error(e);
        showFlash("Error loading saved tabs: " + e.message, "danger");
        btn.disabled = false;
      }
    });
  }

// ---------- RENAME TAB (local only) ------------------------------------------
export function attachPenaltyTabRenameHandler() {
    const container = document.getElementById("penaltiesTab");
    if (!container) return;

    container.addEventListener("dblclick", (e) => {
        const link = e.target.closest(".nav-link");
        if (!link) return;

        if (link.id === "default-penalty-tab")
            return showFlash("The default penalty tab cannot be renamed.", "info");

        const current = link.textContent.trim();
        const newName = prompt("New tab name:", current);
        if (!newName || !newName.trim() || newName.trim() === current) return;

        const id =
            link.dataset.tab || link.getAttribute("href")?.substring(1) || null;
        if (!id) return;

        try {
            const tabs = getLocalPenaltyTabs() || {};
            if (!tabs[id]) throw new Error("Local tab not found.");

            tabs[id].name = newName.trim();
            setLocalPenaltyTabs(tabs);
            link.textContent = newName.trim();
            showFlash("Tab renamed locally.", "success");
        } catch (e) {
            console.error(e);
            showFlash("Failed to save rename locally.", "danger");
        }
    });
}

// ---------- LOAD DEFAULT PENALTIES from DB -----------------------------------
export async function loadDefaultPenaltiesFromDB() {
    const data = await apiFetch("/api/penalties/load_defaults");
    if (!data || !Array.isArray(data.penalties))
        throw new Error("Invalid data structure from server.");

    const defaults = data.penalties.map((p) => ({
        id: p.id,
        name: p.name || "",
        probability:
            p.probability !== undefined ? p.probability : 0.0,
        description: p.description || "",
        tabName: "Default"
    }));

    const pen = getLocalPenalties() || {};
    pen.default = defaults;
    setLocalPenalties(pen);
    renderPenaltiesForTab("default");
    showFlash("Default penalties loaded.", "success");
}

// ---------- LOAD‑DEFAULT button + confirm modal ------------------------------
export function attachLoadDefaultPenaltiesHandler() {
    const loadBtn = document.getElementById("loadDefaultPenaltiesBtn");
    const okBtn = document.getElementById("confirmLoadDefaultPenaltiesBtn");
    if (!loadBtn || !okBtn) return;

    loadBtn.addEventListener("click", () =>
        $("#confirmLoadDefaultPenaltiesModal").modal("show")
    );

    okBtn.addEventListener("click", async () => {
        $("#confirmLoadDefaultPenaltiesModal").modal("hide");
        loadBtn.disabled = okBtn.disabled = true;
        try {
            await loadDefaultPenaltiesFromDB();
        } catch (e) {
            showFlash("Error loading default penalties: " + e.message, "danger");
        } finally {
            loadBtn.disabled = okBtn.disabled = false;
        }
    });
}
