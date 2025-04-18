// penalties/penaltyEntryManagement.js
// Manages rendering and CRUD operations for penalty entries in localStorage

import { addLocalPenalty, updateLocalPenalty, removeLocalPenalty, getLocalPenalties, getLocalPenaltyTabs } from "./penaltyLocalStorageUtils.js";
import { confirmModal } from "../utils/helpers.js";
// --- Alert Helper --- (Define or import shared helper)
function showPenaltyFormAlert(message, type = 'danger', containerId = 'newPenaltyAlert') {
    const alertContainer = document.getElementById(containerId);
    if (alertContainer) {
        alertContainer.innerHTML = `<div class="alert alert-${type} alert-dismissible fade show" role="alert">${message}<button type="button" class="close" data-dismiss="alert">&times;</button></div>`;
    } else { alert(message); } // Fallback
}
function showEditPenaltyAlert(message, type = 'danger') {
    showPenaltyFormAlert(message, type, 'editPenaltyAlert');
}

// --- Render penalties into table ---
export function renderPenaltiesForTab(tabId) {
  // Normalize the tab id for CSS selector (e.g., prepend penaltyPane-)
  let normalizedTabId = tabId;
  if (tabId && tabId !== "default" && !tabId.startsWith("penaltyPane-")) {
    normalizedTabId = "penaltyPane-" + tabId;
  } else if (!tabId) { console.error("renderPenaltiesForTab: Invalid tabId:", tabId); return; }

  let penalties = [];
  try {
      const allPenalties = getLocalPenalties();
      penalties = allPenalties[tabId] || [];
  } catch (e) { console.error(`Error getting local penalties for tab ${tabId}:`, e); }

  // Target the specific table body for penalties within the correct tab pane
  const tbody = document.querySelector(`#${normalizedTabId} .penaltiesTable`);
  if (!tbody) { return; } // Expected if pane doesn't exist yet

  tbody.innerHTML = ""; // Clear existing rows
  if (penalties.length > 0) {
    penalties.forEach(penalty => {
      const pName = penalty.name || 'N/A';
      const pProb = penalty.probability !== undefined ? parseFloat(penalty.probability).toFixed(2) : 'N/A'; // Format probability
      const pDesc = penalty.description || ''; // Default to empty string
      const pId = penalty.id || '';

      const row = document.createElement('tr');
      row.dataset.id = pId;
      // Use textContent for safety against XSS
      row.innerHTML = `<td></td><td></td><td></td>`;
      row.cells[0].textContent = pName;
      row.cells[1].textContent = pProb;
      row.cells[2].textContent = pDesc;
      tbody.appendChild(row);
    });
  } else {
    tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted">No penalties added to this tab yet.</td></tr>`;
  }
}

// --- Modal Handlers ---

export function handleSaveNewPenalty() {
  const form = document.getElementById("newPenaltyForm");
  if (!form) { console.error("New penalty form not found"); return; }

  const nameInput = form.elements.newPenaltyName;
  const probInput = form.elements.newProbability;
  const descInput = form.elements.newDescription;

  const name = nameInput?.value.trim();
  const probability = parseFloat(probInput?.value);
  const description = descInput?.value.trim();

  showPenaltyFormAlert("", "info", "newPenaltyAlert"); // Clear alerts

  let errors = [];
  if (!name) errors.push("Penalty name is required.");
  if (isNaN(probability)) errors.push("Probability must be a number.");
  if (!isNaN(probability) && (probability < 0.0 || probability > 1.0)) {
       errors.push("Probability must be between 0.0 and 1.0 (e.g., 0.05, 0.2).");
  }
  // Description is optional

  if (errors.length > 0) {
      showPenaltyFormAlert(errors.join("<br>"), 'danger', 'newPenaltyAlert');
      return;
  }

  const currentTab = window.currentPenaltyTab || "default"; // Need to set this global var
  let tabName = "Default";
  try {
      const tabs = getLocalPenaltyTabs(); // Use penalty tabs getter
      tabName = tabs[currentTab]?.name || tabName;
  } catch(e) { console.error("Error reading penalty tabs for tabName:", e); }

  const newPenalty = {
    id: "local-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7), // Unique local ID
    name,
    probability: parseFloat(probability.toFixed(4)), // Store with reasonable precision
    description,
    tabName // Store context if needed
  };
  console.log(`Adding new penalty to tab '${currentTab}':`, newPenalty);

  try {
      addLocalPenalty(currentTab, newPenalty); // Use penalty storage function
      renderPenaltiesForTab(currentTab); // Refresh UI table
      $('#newPenaltyModal').modal('hide'); // Hide modal
      form.reset(); // Reset form
  } catch (error) {
      console.error("Error saving penalty or rendering tab:", error);
      showPenaltyFormAlert("Failed to save penalty. Please try again.", 'danger', 'newPenaltyAlert');
  }
}


export function handleUpdatePenalty() {
  const form = document.getElementById("editPenaltyForm");
   if (!form) { console.error("Edit penalty form not found"); return; }

  const entryIdInput = form.elements.editPenaltyEntryId; // Use correct ID
  const nameInput = form.elements.editPenaltyName;
  const probInput = form.elements.editProbability;
  const descInput = form.elements.editDescription;

  const entryId = entryIdInput?.value;
  const name = nameInput?.value.trim();
  const probability = parseFloat(probInput?.value);
  const description = descInput?.value.trim();

  showEditPenaltyAlert("", "info"); // Clear alerts

  let errors = [];
  if (!entryId) errors.push("Penalty ID is missing. Cannot update.");
  if (!name) errors.push("Penalty name is required.");
  if (isNaN(probability)) errors.push("Probability must be a number.");
   if (!isNaN(probability) && (probability < 0.0 || probability > 1.0)) {
       errors.push("Probability must be between 0.0 and 1.0.");
  }

  if (errors.length > 0) {
      showEditPenaltyAlert(errors.join("<br>"), 'danger');
      return;
  }

  const currentTab = window.currentPenaltyTab || "default"; // Need to use penalty context var
  let tabName = "Default";
  try {
      const tabs = getLocalPenaltyTabs();
      tabName = tabs[currentTab]?.name || tabName;
  } catch(e) { console.error("Error reading penalty tabs for tabName:", e); }

  const updatedPenalty = {
    id: entryId, // Keep original ID
    name,
    probability: parseFloat(probability.toFixed(4)),
    description,
    tabName
  };
  console.log(`Updating penalty '${entryId}' in tab '${currentTab}':`, updatedPenalty);

  try {
      updateLocalPenalty(currentTab, entryId, updatedPenalty); // Use penalty storage function
      renderPenaltiesForTab(currentTab); // Refresh UI
      $('#editPenaltyModal').modal('hide'); // Hide modal
  } catch (error) {
      console.error("Error updating penalty or rendering tab:", error);
      showEditPenaltyAlert("Failed to update penalty. Please try again.", 'danger');
  }
}

export async function handleDeletePenalty() {
  const entryIdInput = document.getElementById("editPenaltyEntryId"); // Use correct ID
  const entryId = entryIdInput?.value;

  if (!entryId) {
    showEditPenaltyAlert("No penalty selected for deletion.");
    return;
  }

  const form = document.getElementById("editPenaltyForm");
  const penaltyName = form.elements.editPenaltyName?.value || "this penalty";

  const ok = await confirmModal(
              `Are you sure you want to delete the penalty "${penaltyName}"?`,
              "Please confirm deletion"
          );
  if (!ok) return;  // user cancelled
 

  const currentTab = window.currentPenaltyTab || "default"; // Need penalty context var
  console.log(`Deleting penalty '${entryId}' from tab '${currentTab}'`);

  try {
      removeLocalPenalty(currentTab, entryId); // Use penalty storage function
      renderPenaltiesForTab(currentTab); // Refresh UI
      $('#editPenaltyModal').modal('hide'); // Hide modal
  } catch (error) {
       console.error("Error deleting penalty or rendering tab:", error);
      showEditPenaltyAlert("Failed to delete penalty. Please try again.", 'danger');
  }
}