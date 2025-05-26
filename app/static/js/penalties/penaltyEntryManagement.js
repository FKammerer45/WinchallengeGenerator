// app/static/js/penalties/penaltyEntryManagement.js

import {
    addLocalOnlyPenaltyEntry,
    updateLocalOnlyPenaltyEntry,
    removeLocalOnlyPenaltyEntry,
    getLocalOnlyEntries as getLocalOnlyPenaltyEntries
} from "./penaltyLocalStorageUtils.js";
import { escapeHtml, confirmModal, showFlash } from "../utils/helpers.js";
import { triggerAutosavePenalties } from "./penaltyExtensions.js"; // To be created

// --- Alert Helpers ---
function showPenaltyModalAlert(message, type = 'danger', containerId = 'newPenaltyAlert') {
    const alertContainer = document.getElementById(containerId);
    if (!alertContainer) {
        if (message) alert(`(${type.toUpperCase()}) ${message.replace(/<br>/g, '\n')}`);
        return;
    }
    if (message) {
        alertContainer.innerHTML = `
            <div class="alert alert-${type} alert-dismissible fade show" role="alert" style="margin-bottom: 0;">
                ${message}
                <button type="button" class="close" data-dismiss="alert" aria-label="Close">
                    <span aria-hidden="true">&times;</span>
                </button>
            </div>`;
        alertContainer.style.display = 'block';
    } else {
        alertContainer.innerHTML = '';
        alertContainer.style.display = 'none';
    }
}

function showNewPenaltyAlert(message, type = 'danger') {
    showPenaltyModalAlert(message, type, 'newPenaltyAlert');
}

function showEditPenaltyAlert(message, type = 'danger') {
    showPenaltyModalAlert(message, type, 'editPenaltyAlert');
}
// --- END Alert Helpers ---

// --- Data Abstraction Helpers ---
function saveOrUpdatePenaltyEntryData(tabId, entryData, isUpdate = false) {
    if (!tabId || !entryData || !entryData.id) {
        console.error("saveOrUpdatePenaltyEntryData: Missing tabId, entryData, or entryData.id");
        return false;
    }
    const isLoggedIn = window.isLoggedIn === true;

    if (isLoggedIn) {
        if (!window.userPenaltyTabsData || !window.userPenaltyTabsData.entries) { // Use 'entries' to match games structure
            console.error("saveOrUpdatePenaltyEntryData: window.userPenaltyTabsData.entries not initialized.");
            return false;
        }
        if (!Array.isArray(window.userPenaltyTabsData.entries[tabId])) {
            window.userPenaltyTabsData.entries[tabId] = [];
        }
        const entries = window.userPenaltyTabsData.entries[tabId];
        const existingIndex = entries.findIndex(e => String(e?.id) === String(entryData.id));

        if (isUpdate) {
            if (existingIndex !== -1) {
                entries[existingIndex] = { ...entries[existingIndex], ...entryData };
            } else { return false; }
        } else {
            if (existingIndex !== -1) entries[existingIndex] = entryData;
            else entries.push(entryData);
        }
        return true;
    } else {
        try {
            if (isUpdate) updateLocalOnlyPenaltyEntry(tabId, entryData.id, entryData);
            else addLocalOnlyPenaltyEntry(tabId, entryData);
            return true;
        } catch (e) { return false; }
    }
}

function removePenaltyEntryData(tabId, entryId) {
    if (!tabId || !entryId) return false;
    const idToRemove = String(entryId);
    const isLoggedIn = window.isLoggedIn === true;

    if (isLoggedIn) {
        if (!window.userPenaltyTabsData?.entries?.[tabId] || !Array.isArray(window.userPenaltyTabsData.entries[tabId])) return false;
        const entries = window.userPenaltyTabsData.entries[tabId];
        const initialLength = entries.length;
        window.userPenaltyTabsData.entries[tabId] = entries.filter(e => String(e?.id) !== idToRemove);
        return window.userPenaltyTabsData.entries[tabId].length < initialLength;
    } else {
        return removeLocalOnlyPenaltyEntry(tabId, idToRemove);
    }
}
// --- END Data Abstraction Helpers ---

export function renderPenaltiesForTab(tabId) {
    if (!tabId) {
        console.error("renderPenaltiesForTab: tabId is undefined or null.");
        return;
    }
    const paneId = tabId;
    const tbody = document.querySelector(`#${paneId} .penaltiesTable`);

    if (!tbody) {
        return;
    }

    let entries = [];
    const isLoggedIn = window.isLoggedIn === true;
    try {
        if (isLoggedIn) {
            entries = window.userPenaltyTabsData?.entries?.[tabId] || []; // Use 'entries' key
        } else {
            entries = getLocalOnlyPenaltyEntries()[tabId] || [];
        }
    } catch (e) {
        console.error("Error getting penalty entries for rendering tab %s:", tabId, e);
    }
    
    tbody.innerHTML = ""; // Clear existing rows

    if (entries.length > 0) {
        // Sort penalties by name, for example
        entries.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

        entries.forEach(penalty => {
            const row = document.createElement('tr');
            row.dataset.penaltyId = penalty.id; // For editing/deleting later

            let probabilityDisplay = "N/A";
            const prob = parseFloat(penalty.probability);
            if (!isNaN(prob)) {
                probabilityDisplay = (prob * 100).toFixed(0) + "%";
            }

            const tagsHtml = Array.isArray(penalty.tags) && penalty.tags.length > 0
                ? penalty.tags.map(tag => `<span class="badge bg-secondary me-1">${escapeHtml(tag)}</span>`).join(' ')
                : 'N/A';

            row.innerHTML = `
                <td data-label="Name">${escapeHtml(penalty.name || 'N/A')}</td>
                <td data-label="Probability">${escapeHtml(probabilityDisplay)}</td>
                <td data-label="Description" class="text-break">${escapeHtml(penalty.description || 'N/A')}</td>
                <td data-label="Tags">${tagsHtml}</td>
            `;
            row.addEventListener('dblclick', () => handleEditPenaltyModalOpen(tabId, penalty.id));
            tbody.appendChild(row);
        });
    } else {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-secondary py-3">No penalties added to this tab yet.</td></tr>`; // colspan updated to 4
    }
}

export function handleSaveNewPenalty() {
    const form = document.getElementById("newPenaltyForm");
    const nameInput = form.elements.newPenaltyName;
    const probInput = form.elements.newPenaltyProbability;
    const descInput = form.elements.newPenaltyDescription;
    const tagsSelect = form.elements.newPenaltyTags; // Get tags select element

    const name = nameInput?.value.trim();
    const probability = parseFloat(probInput?.value);
    const description = descInput?.value.trim();
    const tags = tagsSelect ? Array.from(tagsSelect.selectedOptions).map(option => option.value) : [];

    showNewPenaltyAlert(null);
    let errors = [];
    if (!name) errors.push("Penalty name is required.");
    if (isNaN(probability) || probability < 0.0 || probability > 1.0) {
        errors.push("Probability must be a number between 0.0 and 1.0 (e.g., 0.75 for 75%).");
    }
    // Description can be optional

    if (errors.length > 0) {
        showNewPenaltyAlert(errors.join("<br>"), 'danger');
        return;
    }

    const currentTab = window.currentPenaltyTargetTab; // Set by penalties.js
    if (!currentTab) {
        showNewPenaltyAlert("Could not determine the current tab. Please try again.", "danger");
        return;
    }

    const newEntryId = "local-p-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9);
    const newEntry = {
        id: newEntryId,
        name,
        probability: probability, // Store as decimal
        description,
        tags // Add tags to the new entry object
    };

    if (saveOrUpdatePenaltyEntryData(currentTab, newEntry, false)) {
        renderPenaltiesForTab(currentTab);
        if (typeof $ !== 'undefined' && $.fn.modal) $('#newPenaltyModal').modal('hide');
        form.reset();
        if (window.isLoggedIn) {
            triggerAutosavePenalties(currentTab); // To be created in penaltyExtensions.js
        }
    } else {
        showNewPenaltyAlert("Failed to save new penalty. Please try again.", 'danger');
    }
}

function handleEditPenaltyModalOpen(tabId, penaltyId) {
    window.currentPenaltyTargetTab = tabId; // Set context for save
    const isLoggedIn = window.isLoggedIn === true;
    const entries = isLoggedIn 
        ? (window.userPenaltyTabsData?.entries?.[tabId] || []) 
        : (getLocalOnlyPenaltyEntries()[tabId] || []);
    
    const penaltyToEdit = entries.find(p => String(p.id) === String(penaltyId));

    if (!penaltyToEdit) {
        showFlash("Could not find the penalty to edit.", "danger");
        return;
    }

    const form = document.getElementById("editPenaltyForm");
    if (!form) {
        console.error("Edit penalty form not found!");
        return;
    }
    form.elements.editPenaltyId.value = penaltyToEdit.id;
    form.elements.editPenaltyName.value = penaltyToEdit.name || "";
    form.elements.editPenaltyProbability.value = penaltyToEdit.probability !== undefined ? penaltyToEdit.probability : "";
    form.elements.editPenaltyDescription.value = penaltyToEdit.description || "";
    
    const editTagsSelect = form.elements.editPenaltyTags;
    if (editTagsSelect && editTagsSelect.options) {
        const tagsToSelect = Array.isArray(penaltyToEdit.tags) ? penaltyToEdit.tags : [];
        for (let i = 0; i < editTagsSelect.options.length; i++) {
            editTagsSelect.options[i].selected = tagsToSelect.includes(editTagsSelect.options[i].value);
        }
    }
    
    showEditPenaltyAlert(null); // Clear previous alerts in edit modal
    if (typeof $ !== 'undefined' && $.fn.modal) $('#editPenaltyModal').modal('show');
}


export function handleUpdatePenalty() {
    const form = document.getElementById("editPenaltyForm");
    const id = form.elements.editPenaltyId.value;
    const name = form.elements.editPenaltyName.value.trim();
    const probability = parseFloat(form.elements.editPenaltyProbability.value);
    const description = form.elements.editPenaltyDescription.value.trim();
    const tagsSelect = form.elements.editPenaltyTags;
    const tags = tagsSelect ? Array.from(tagsSelect.selectedOptions).map(option => option.value) : [];
    const currentTab = window.currentPenaltyTargetTab;

    showEditPenaltyAlert(null);
    let errors = [];
    if (!id) errors.push("Penalty ID missing. Cannot update.");
    if (!name) errors.push("Penalty name is required.");
    if (isNaN(probability) || probability < 0.0 || probability > 1.0) {
        errors.push("Probability must be a number between 0.0 and 1.0.");
    }

    if (errors.length > 0) {
        showEditPenaltyAlert(errors.join("<br>"), 'danger');
        return;
    }
    if (!currentTab) {
        showEditPenaltyAlert("Could not determine current tab for update.", "danger");
        return;
    }

    const updatedEntry = { id, name, probability, description, tags }; // Add tags to the updated entry object

    if (saveOrUpdatePenaltyEntryData(currentTab, updatedEntry, true)) { // isUpdate = true
        renderPenaltiesForTab(currentTab);
        if (typeof $ !== 'undefined' && $.fn.modal) $('#editPenaltyModal').modal('hide');
        if (window.isLoggedIn) {
            triggerAutosavePenalties(currentTab);
        }
    } else {
        showEditPenaltyAlert("Failed to update penalty. Please try again.", 'danger');
    }
}

export async function handleDeleteSinglePenalty(tabId, penaltyId, penaltyName) {
    // This function is called from a confirm modal, so tabId and penaltyId should be passed.
    if (!tabId || !penaltyId) {
        showFlash("Cannot delete penalty: missing ID information.", "danger");
        return;
    }
    
    // Confirmation should happen before calling this, or be integrated here.
    // For now, assuming confirmation happened.

    if (removePenaltyEntryData(tabId, penaltyId)) {
        renderPenaltiesForTab(tabId);
        showFlash(`Penalty "${escapeHtml(penaltyName || 'Entry')}" deleted.`, "success");
        if (window.isLoggedIn) {
            triggerAutosavePenalties(tabId);
        }
    } else {
        showFlash(`Failed to delete penalty "${escapeHtml(penaltyName || 'Entry')}".`, "danger");
    }
}
export async function handleDeleteSinglePenaltyFromModal() {
    const form = document.getElementById("editPenaltyForm");
    const penaltyId = form.elements.editPenaltyId.value;
    const penaltyName = form.elements.editPenaltyName.value.trim() || "this penalty"; // For confirm message
    const currentTab = window.currentPenaltyTargetTab; // Should be set when modal opens

    if (!penaltyId || !currentTab) {
        showEditPenaltyAlert("Cannot delete: Penalty ID or current tab context is missing.", "danger");
        return;
    }

    const ok = await confirmModal(
        `Are you sure you want to delete the penalty "${escapeHtml(penaltyName)}"? This action cannot be undone.`,
        "Confirm Penalty Deletion"
    );

    if (!ok) return;

    const deleteButton = document.getElementById('deleteSinglePenaltyBtn');
        if (deleteButton) deleteButton.disabled = true; // Disable button

    try {
        if (removePenaltyEntryData(currentTab, penaltyId)) {
            renderPenaltiesForTab(currentTab); // Refresh the main table for the current tab
            showFlash(`Penalty "${escapeHtml(penaltyName)}" deleted successfully.`, "success");
            if (window.isLoggedIn) {
                triggerAutosavePenalties(currentTab); // Trigger autosave if logged in
            }
            if (typeof $ !== 'undefined' && $.fn.modal) {
                $('#editPenaltyModal').modal('hide'); // Close the modal
            }
        } else {
            throw new Error("Failed to remove penalty data. It might have already been removed.");
        }
    } catch (error) {
        console.error("Error deleting penalty %s from modal:", penaltyId, error);
        showEditPenaltyAlert(`Failed to delete penalty: ${error.message}`, "danger"); // User-facing, template literal is fine
    } finally {
        if (deleteButton) deleteButton.disabled = false; // Re-enable button
    }
}
