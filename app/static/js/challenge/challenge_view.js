// static/js/challenge/challenge_view.js
// Main orchestrator for the shared challenge view page

// Import API utility and UI/Helper functions
import { apiFetch } from '../utils/api.js';
import { setLoading, showError, escapeHtml } from '../utils/helpers.js';
import { updateGroupCountDisplay, renderProgressItems, addGroupToDOM, updateUIAfterMembershipChange } from './challenge_ui.js';

// --- Module-level state ---
// Stores data read from the DOM and current user membership status
let challengeConfig = {
    publicId: null,
    maxGroups: 10,
    initialGroupCount: 0,
    userJoinedGroupId: null, // Holds the ID of the group the user joined, or null
    coreChallengeStructure: null,
    csrfToken: null,
    urls: {
        addGroup: null,
        updateProgressBase: null,
        joinLeaveBase: null
    }
};

// --- Event Handlers ---

async function handleCreateGroupSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const groupNameInput = form.elements.group_name;
    const groupName = groupNameInput.value.trim();
    const submitButton = form.querySelector('#addGroupBtn');
    const errorDiv = document.getElementById('addGroupError');

    showError(errorDiv, null); // Use imported helper
    if (!groupName) { showError(errorDiv, "Group name required."); return; }
    if (groupName.length > 80) { showError(errorDiv, "Group name max 80 chars."); return; }
    // Access count/max from config object
    if (challengeConfig.initialGroupCount >= challengeConfig.maxGroups) {
        showError(errorDiv, `Max groups (${challengeConfig.maxGroups}) reached.`); return;
    }

    setLoading(submitButton, true, 'Creating...'); // Use imported helper

    try {
        // Use config URL and token
        const data = await apiFetch(challengeConfig.urls.addGroup, {
            method: 'POST', body: { group_name: groupName }
        }, challengeConfig.csrfToken);

        if (data.status === 'success' && data.group) {
            addGroupToDOM(data.group, challengeConfig); // Pass config
            challengeConfig.initialGroupCount++; // Update state variable FIRST
            updateGroupCountDisplay(challengeConfig.initialGroupCount, challengeConfig.maxGroups); // Update display
            groupNameInput.value = '';
        } else { throw new Error(data.error || "Failed to add group."); }
    } catch (error) {
        console.error("Create group failed:", error);
        showError(errorDiv, "Error: " + error.message); // Use showError
    } finally {
        setLoading(submitButton, false); // Use imported helper
    }
}

async function handleJoinGroupClick(event) {
    const joinButton = event.target.closest('.join-group-btn');
    if (!joinButton) return;
    const groupId = joinButton.dataset.groupId;
    const buttonContainer = joinButton.closest('.card-footer'); // For error display

    if (!groupId) { showError(buttonContainer, "Missing group ID."); return; }

    console.log(`handleJoinGroupClick: Joining group ${groupId}`);
    setLoading(joinButton, true, 'Joining...');
    // Use config URL base and token
    const url = `${challengeConfig.urls.joinLeaveBase}/${groupId}/join`;

    try {
        const data = await apiFetch(url, { method: 'POST' }, challengeConfig.csrfToken);
        console.log("Join successful:", data.message);
        challengeConfig.userJoinedGroupId = parseInt(groupId, 10); // Update state IN CONFIG
        updateUIAfterMembershipChange(challengeConfig); // Update UI based on config
    } catch (error) {
        console.error("Failed to join group:", error);
        showError(buttonContainer, `Error: ${error.message}`); // Show error near button
        setLoading(joinButton, false); // Reset only this button on error
    }
}

async function handleLeaveGroupClick(event) {
    const leaveButton = event.target.closest('.leave-group-btn');
    if (!leaveButton) return;
    const groupId = leaveButton.dataset.groupId;
    const buttonContainer = leaveButton.closest('.card-footer'); // For error display

    if (!groupId) { showError(buttonContainer, "Missing group ID."); return; }

    console.log(`handleLeaveGroupClick: Leaving group ${groupId}`);
    setLoading(leaveButton, true, 'Leaving...');
    // Use config URL base and token
    const url = `${challengeConfig.urls.joinLeaveBase}/${groupId}/leave`;

    try {
        const data = await apiFetch(url, { method: 'POST' }, challengeConfig.csrfToken);
        console.log("Leave successful:", data.message);
        challengeConfig.userJoinedGroupId = null; // Update state IN CONFIG
        updateUIAfterMembershipChange(challengeConfig); // Update UI based on config
    } catch (error) {
        console.error("Failed to leave group:", error);
        showError(buttonContainer, `Error: ${error.message}`); // Show error near button
        setLoading(leaveButton, false); // Reset only this button on error
    }
}

async function handleProgressChange(event) {
    if (!event.target.matches('.progress-checkbox')) return;
    const checkbox = event.target;
    const itemData = checkbox.dataset;
    const isComplete = checkbox.checked;
    const groupId = itemData.groupId;
    const itemDiv = checkbox.closest('.progress-item'); // For error/visuals

    if (!groupId || !itemData.itemType || !itemData.itemKey || typeof itemData.itemIndex === 'undefined') {
        showError(itemDiv, "Data missing!"); checkbox.checked = !isComplete; return;
    }

    if(itemDiv) itemDiv.classList.toggle('completed', isComplete); // Optimistic UI
    checkbox.disabled = true;

    const payload = {
        item_type: itemData.itemType, item_key: itemData.itemKey,
        item_index: parseInt(itemData.itemIndex, 10), is_complete: isComplete,
    };
    if (itemData.segmentIndex) payload.segment_index = parseInt(itemData.segmentIndex, 10);

    try {
        // Use config URL base and token
        const url = `${challengeConfig.urls.updateProgressBase}/${groupId}/progress`;
        const responseData = await apiFetch(url, { method: 'POST', body: payload }, challengeConfig.csrfToken);
        console.log("Progress update successful:", responseData.message);
    } catch (error) {
        console.error("Failed to update progress:", error);
        if(itemDiv) {
            itemDiv.classList.toggle('completed', !isComplete); // Revert visual
            showError(itemDiv, `Save failed!`); // Show small error near item
            setTimeout(() => showError(itemDiv, null), 3000); // Clear error
        } else {
            alert(`Error saving progress: ${error.message}`); // Fallback alert
        }
        checkbox.checked = !isComplete; // Revert state
    } finally {
        checkbox.disabled = false;
    }
}


// --- Initialize Page ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("challenge_view.js: Initializing...");

    const dataEl = document.getElementById('challengeData');
    const jsonScriptEl = document.getElementById('challengeJsonData'); // Get script tag

    if (!dataEl || !jsonScriptEl) { // Check both
        console.error("CRITICAL: #challengeData or #challengeJsonData element not found.");
        // Optionally display error in a known element if possible
        const body = document.querySelector('body');
        if(body) body.insertAdjacentHTML('afterbegin', '<div class="alert alert-danger m-3">Page initialization error: Data missing.</div>');
        return;
    }

    // --- Read ALL data into the config object ---
    try {
         const structure = JSON.parse(jsonScriptEl.textContent || '{}'); // Parse from script tag
         const joinedId = JSON.parse(dataEl.dataset.userJoinedGroupId || 'null');
         challengeConfig = {
             publicId: dataEl.dataset.publicId,
             maxGroups: parseInt(dataEl.dataset.maxGroups, 10) || 10,
             initialGroupCount: parseInt(dataEl.dataset.initialGroupCount, 10) || 0,
             userJoinedGroupId: typeof joinedId === 'number' ? joinedId : null,
             coreChallengeStructure: structure,
             csrfToken: dataEl.dataset.csrfToken,
             urls: {
                 addGroup: dataEl.dataset.addGroupUrl,
                 updateProgressBase: dataEl.dataset.updateProgressUrlBase,
                 joinLeaveBase: dataEl.dataset.joinLeaveUrlBase
             }
         };
         if (!challengeConfig.publicId || !challengeConfig.urls.addGroup || !challengeConfig.urls.updateProgressBase || !challengeConfig.urls.joinLeaveBase) {
              throw new Error("Essential configuration data missing.");
         }
         console.log("challenge_view.js: Parsed challengeConfig:", challengeConfig);
    } catch(e) { console.error("challenge_view.js: Failed to parse initial data:", e); return; }
    // --- End reading data ---

    // --- Find other elements & Attach listeners ---
    const addGroupForm = document.getElementById('addGroupForm');
    const groupsContainer = document.getElementById('groupsContainer');

    if(addGroupForm) {
        addGroupForm.addEventListener('submit', handleCreateGroupSubmit);
        console.log("challenge_view.js: Create Group listener attached.");
    } else { console.warn("challenge_view.js: Create group form not found."); }

    if (groupsContainer) {
        groupsContainer.addEventListener('click', (event) => {
            if (event.target.closest('.join-group-btn')) handleJoinGroupClick(event);
            else if (event.target.closest('.leave-group-btn')) handleLeaveGroupClick(event);
        });
        groupsContainer.addEventListener('change', handleProgressChange);
        console.log("challenge_view.js: Join/Leave/Progress listeners attached to #groupsContainer.");
    } else { console.error("challenge_view.js: Group display area (#groupsContainer) NOT FOUND!"); }

    // --- Initialize UI ---
    updateUIAfterMembershipChange(challengeConfig); // Pass config object
    updateGroupCountDisplay(challengeConfig.initialGroupCount, challengeConfig.maxGroups);

}); // End DOMContentLoaded