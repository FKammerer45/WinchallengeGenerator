// app/static/js/penalties/penaltyEntryManagement.js

// Use penalty-specific local storage functions
import {
  addLocalPenalty, updateLocalPenalty, removeLocalPenalty, getLocalPenalties, getLocalPenaltyTabs
} from "./penaltyLocalStorageUtils.js";
// Import shared helpers
import { escapeHtml, showError, confirmModal, showFlash } from "../utils/helpers.js";
// Import autosave trigger for penalties
import { triggerPenaltyAutosave } from "./penaltyExtensions.js";

// --- Alert Helpers ---
function showPenaltyFormAlert(message, type = 'danger', containerId = 'newPenaltyAlert') { /* ... */ }
function showEditPenaltyAlert(message, type = 'danger') { showPenaltyFormAlert(message, type, 'editPenaltyAlert'); }

// --- Render penalties into table (Modified for data source) ---
export function renderPenaltiesForTab(tabId) {
  let normalizedTabId = tabId;
  if (tabId && tabId !== "default" && !tabId.startsWith("penaltyPane-")) {
      normalizedTabId = "penaltyPane-" + tabId;
  } else if (!tabId) { console.error("renderPenaltiesForTab: Invalid tabId:", tabId); return; }

  let penalties = [];
  try {
      const isLoggedIn = window.isLoggedIn === true;
      if (isLoggedIn) {
          penalties = window.userPenaltyTabsData?.entries?.[tabId] || [];
      } else {
          penalties = getLocalPenalties()[tabId] || [];
      }
      // *** ADD LOGGING HERE ***
      console.log(`[Render Penalties] Rendering tab '${tabId}' (Normalized: '${normalizedTabId}'). Found ${penalties.length} entries in source:`, JSON.stringify(penalties));
      // *** END LOGGING ***
  }
  catch (e) { console.error(`Error getting penalties for tab ${tabId}:`, e); }

  const tbody = document.querySelector(`#${normalizedTabId} .penaltiesTable`);
  if (!tbody) {
      // It's possible the tab pane hasn't been fully added to the DOM yet during initial load.
      // console.warn(`[Render Penalties] Table body not found for selector: #${normalizedTabId} .penaltiesTable`);
      return;
  }

  tbody.innerHTML = ""; // Clear existing rows
  if (penalties.length > 0) {
      penalties.sort((a, b) => (a.name || '').localeCompare(b.name || '')); // Sort by name

      penalties.forEach(penalty => {
          const pProb = penalty.probability !== undefined ? parseFloat(penalty.probability).toFixed(2) : 'N/A';
          const row = document.createElement('tr');
          row.dataset.id = penalty.id || '';
          row.innerHTML = `
              <td>${escapeHtml(penalty.name || 'N/A')}</td>
              <td>${pProb}</td>
              <td>${escapeHtml(penalty.description || '')}</td>
          `;
          tbody.appendChild(row);
      });
  } else {
      tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-3">No penalties added to this tab yet.</td></tr>`;
  }
}

// --- NEW: Helper functions for conditional data update ---
function saveOrUpdatePenaltyData(tabId, penaltyData, isUpdate = false) {
   if (!tabId || !penaltyData) return false;
   const penaltyId = penaltyData.id;
   const isLoggedIn = window.isLoggedIn === true;

   if (isLoggedIn) {
       // Use penalty-specific state object
       if (!window.userPenaltyTabsData?.entries) return false;
       if (!Array.isArray(window.userPenaltyTabsData.entries[tabId])) window.userPenaltyTabsData.entries[tabId] = [];
       const entries = window.userPenaltyTabsData.entries[tabId];
       const existingIndex = entries.findIndex(p => String(p?.id) === String(penaltyId));

       if (isUpdate) {
           if (existingIndex !== -1) entries[existingIndex] = penaltyData;
           else return false; // Cannot update if not found
       } else {
           if (existingIndex === -1) entries.push(penaltyData);
           else entries[existingIndex] = penaltyData; // Overwrite if duplicate ID
       }
       console.log(`[Penalty Data State] ${isUpdate ? 'Updated' : 'Added'} penalty ${penaltyId} in state for tab ${tabId}`);
       return true;
   } else {
       try {
           if (isUpdate) updateLocalPenalty(tabId, penaltyId, penaltyData);
           else addLocalPenalty(tabId, penaltyData);
           return true;
       } catch (e) { return false; }
   }
}

function removePenaltyData(tabId, penaltyId) {
   if (!tabId || !penaltyId) { console.error("[removePenaltyData] Missing tabId or penaltyId"); return false;}
   const idToRemove = String(penaltyId);
   const isLoggedIn = window.isLoggedIn === true;
   console.log(`[removePenaltyData] Attempting removal. Tab: ${tabId}, ID: ${idToRemove}, LoggedIn: ${isLoggedIn}`);

   if (isLoggedIn) {
       // Use penalty-specific state object
       if (!window.userPenaltyTabsData?.entries?.[tabId] || !Array.isArray(window.userPenaltyTabsData.entries[tabId])) {
           console.error(`[removePenaltyData] Invalid state for tab ${tabId}`); return false;
       }
       const entries = window.userPenaltyTabsData.entries[tabId];
       const initialLength = entries.length;
       window.userPenaltyTabsData.entries[tabId] = entries.filter(p => String(p?.id) !== idToRemove);
       const removed = window.userPenaltyTabsData.entries[tabId].length < initialLength;
       if (removed) console.log(`[Penalty Data State] Removed penalty ${idToRemove} from state tab ${tabId}.`);
       else console.warn(`[Penalty Data State] Penalty ${idToRemove} not found in state tab ${tabId}.`);
       return removed;
   } else {
        try {
            const success = removeLocalPenalty(tabId, idToRemove); // Use penalty func
            if(success) console.log(`[Local Storage] Removed penalty ${idToRemove} from tab ${tabId}`);
            else console.warn(`[Local Storage] Penalty ${idToRemove} not found in tab ${tabId}`);
            return success;
        } catch (e) { console.error(`[removePenaltyData] Error removing local penalty:`, e); return false; }
   }
}
// --- End Helper functions ---


// --- MODIFIED Modal Handlers ---

export function handleSaveNewPenalty() {
const form = document.getElementById("newPenaltyForm");
// ... (Validation logic remains the same) ...
const nameInput = form.elements.newPenaltyName;
const probInput = form.elements.newProbability;
const descInput = form.elements.newDescription;
const name = nameInput?.value.trim();
const probability = parseFloat(probInput?.value);
const description = descInput?.value.trim();
showPenaltyFormAlert("", "info", "newPenaltyAlert"); // Clear alerts
let errors = [];
if (!name) errors.push("Penalty name is required.");
if (isNaN(probability) || probability < 0.0 || probability > 1.0) { errors.push("Probability must be between 0.0 and 1.0."); }
if (errors.length > 0) { showPenaltyFormAlert(errors.join("<br>"), 'danger', 'newPenaltyAlert'); return; }

const currentTab = window.currentPenaltyTab || "default"; // Use penalty context
const newPenaltyId = "local-p-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9);
const newPenalty = {
  id: newPenaltyId, name,
  probability: parseFloat(probability.toFixed(4)), // Use consistent precision
  description
  // No need for tabName here if context is handled correctly
};

if (saveOrUpdatePenaltyData(currentTab, newPenalty, false)) { // Use helper
    renderPenaltiesForTab(currentTab); // Refresh UI table
    $('#newPenaltyModal').modal('hide'); // Hide modal
    form.reset(); // Reset form
    triggerPenaltyAutosave(currentTab); // <<< Trigger Penalty Autosave
} else {
    showPenaltyFormAlert("Failed to save penalty data.", 'danger', 'newPenaltyAlert');
}
}


export function handleUpdatePenalty() {
const form = document.getElementById("editPenaltyForm");
// ... (Validation logic remains the same) ...
const entryIdInput = form.elements.editPenaltyEntryId;
const nameInput = form.elements.editPenaltyName;
const probInput = form.elements.editProbability;
const descInput = form.elements.editDescription;
const entryId = entryIdInput?.value;
const name = nameInput?.value.trim();
const probability = parseFloat(probInput?.value);
const description = descInput?.value.trim();
showEditPenaltyAlert("", "info"); // Clear alerts
let errors = [];
if (!entryId) errors.push("Penalty ID is missing.");
if (!name) errors.push("Penalty name required.");
if (isNaN(probability) || probability < 0.0 || probability > 1.0) { errors.push("Probability must be between 0.0 and 1.0."); }
if (errors.length > 0) { showEditPenaltyAlert(errors.join("<br>"), 'danger'); return; }

const currentTab = window.currentPenaltyTab || "default"; // Use penalty context
const updatedPenalty = {
  id: entryId, name,
  probability: parseFloat(probability.toFixed(4)), description
};

if (saveOrUpdatePenaltyData(currentTab, updatedPenalty, true)) { // Use helper (isUpdate=true)
    renderPenaltiesForTab(currentTab); // Refresh UI
    $('#editPenaltyModal').modal('hide'); // Hide modal
    triggerPenaltyAutosave(currentTab); // <<< Trigger Penalty Autosave
} else {
    showEditPenaltyAlert("Failed to update penalty data.", 'danger');
}
}

export async function handleDeletePenalty() {
const entryIdInput = document.getElementById("editPenaltyEntryId");
const entryId = entryIdInput?.value;
const form = document.getElementById("editPenaltyForm");
const penaltyName = form.elements.editPenaltyName?.value || "this penalty";
const alertContainer = document.getElementById("editPenaltyAlert"); // Target edit modal's alert

if (!entryId) { showEditPenaltyAlert("No penalty selected for deletion."); return; }

const ok = await confirmModal(`Delete "${escapeHtml(penaltyName)}"?`, "Confirm deletion");
if (!ok) return;

const currentTab = window.currentPenaltyTab || "default"; // Use penalty context
const button = document.getElementById("deletePenaltyBtn"); // Get the button itself
if(button) button.disabled = true; // Disable during operation

if (removePenaltyData(currentTab, entryId)) { // Use helper
    renderPenaltiesForTab(currentTab); // Refresh UI
    $('#editPenaltyModal').modal('hide'); // Hide modal
    triggerPenaltyAutosave(currentTab); // <<< Trigger Penalty Autosave
    showFlash(`Penalty "${escapeHtml(penaltyName)}" deleted.`, "success");
} else {
    showEditPenaltyAlert(`Failed to delete penalty "${escapeHtml(penaltyName)}".`, 'danger');
    if(button) button.disabled = false; // Re-enable on failure
}
}