// app/static/js/challenge_view/actions/groupActions.js
import { apiFetch } from '../../utils/api.js';
import { setLoading, showError, showFlash, escapeHtml, getCommonDOMElements } from '../../utils/helpers.js'; // Added getCommonDOMElements
// Import the specific function for adding a group and the config object itself
import { challengeConfig, addGroupToConfig, updateGroupInConfig, updateUserJoinedGroupState } from '../config.js';
// uiOrchestrator will be called by main.js after the action completes or related event is dispatched
// import { orchestrateUIAfterStateChange, updateGroupCountDisplay } from '../ui/uiOrchestrator.js';

let requestControllers = { // Local to this module if only used here
    createGroup: null,
    joinLeaveGroup: null,
    savePlayers: null
};

function nextSignal(key) {
    requestControllers[key]?.abort?.();
    const ctrl = new AbortController();
    requestControllers[key] = ctrl;
    return ctrl.signal;
}

/**
 * Handles the creation of a new group.
 * @param {Event} event - The form submission event.
 * @param {HTMLElement} statusDiv - Element to display errors/status.
 * @param {HTMLElement} myGroupContainerEl - For UI updates (passed to orchestrator).
 * @param {HTMLElement} otherGroupsContainerEl - For UI updates (passed to orchestrator).
 */
export async function handleCreateGroup(event, currentChallengeConfig, pageStatusDiv, /* myGroupContainerEl, otherGroupsContainerEl */) {
    event.preventDefault();
    const form = event.currentTarget; // Should be the form element
    const groupNameEl = form.elements.group_name;
    const groupName = groupNameEl.value.trim();
    const submitBtn = form.querySelector('#addGroupBtn'); // Ensure this ID is on your button
    const errDiv = document.getElementById('addGroupError'); // Specific error div for this form

    if (!currentChallengeConfig.isCreator) {
        if(errDiv) showError(errDiv, 'Only the challenge creator can add groups.');
        return;
    }
    if (submitBtn && submitBtn.disabled) return;
    if(errDiv) showError(errDiv, null);

    if (!groupName || groupName.length > 80) {
        if(errDiv) showError(errDiv, 'Invalid group name (1-80 characters).');
        return;
    }
    // Use initialGroupCount from the imported challengeConfig
    if (currentChallengeConfig.initialGroupCount >= currentChallengeConfig.maxGroups) {
        if(errDiv) showError(errDiv, `Maximum groups (${currentChallengeConfig.maxGroups}) reached.`);
        return;
    }
    // Check for existing group name (case-insensitive)
    if (currentChallengeConfig.initialGroups.some(g => g.name.toLowerCase() === groupName.toLowerCase())) {
        if(errDiv) showError(errDiv, `Group name "${escapeHtml(groupName)}" is already taken.`);
        return;
    }


    if(submitBtn) setLoading(submitBtn, true, 'Creating…');

    try {
        const data = await apiFetch(
            currentChallengeConfig.urls.addGroup,
            { method: 'POST', body: { group_name: groupName }, signal: nextSignal('createGroup') },
            currentChallengeConfig.csrfToken
        );

        if (data.status !== 'success' || !data.group) {
            throw new Error(data.error || 'Unknown error creating group on server.');
        }

        const newGroupData = { // Prepare data for config and UI
            id: data.group.id,
            name: data.group.name,
            progress: data.group.progress || {},
            member_count: data.group.member_count ?? (data.creator_auto_joined ? 1 : 0),
            player_names: data.group.player_names || [], // Ensure it's an array
            active_penalty_text: data.group.active_penalty_text || ''
        };

        // Update the central configuration
        addGroupToConfig(newGroupData); // This updates challengeConfig.initialGroups & initialGroupCount

        groupNameEl.value = ''; // Clear input
        showFlash(`Group "${escapeHtml(newGroupData.name)}" created.`, 'success');

        // Dispatch an event that main.js can listen to, to trigger UI refresh
        document.dispatchEvent(new CustomEvent('configGroupAdded', { detail: { newGroup: newGroupData, creatorAutoJoined: data.creator_auto_joined } }));

    } catch (err) {
        console.error('Create group failed:', err);
        if(errDiv) showError(errDiv, `Error: ${err.message}`);
    } finally {
        if(submitBtn) setLoading(submitBtn, false); // Use submitBtn, setLoading handles original text restoration
    }
}

/**
 * Handles deleting a group.
 * @param {number} groupId - The ID of the group to delete.
 * @param {HTMLElement} deleteBtn - The delete button element for loading state.
 */
export async function handleDeleteGroup(groupId, deleteBtn) {
    const { statusDiv } = getCommonDOMElements(); // Get common status display
    showError(statusDiv, null); // Clear previous general errors

    if (!challengeConfig.isCreator) {
        showFlash("Only the challenge creator can delete groups.", "warning");
        return;
    }
    if (!challengeConfig.id || !challengeConfig.csrfToken) {
        showError(statusDiv, "Configuration error: Cannot delete group.", "danger");
        return;
    }
    // Note: The API URL for deleting a group is not explicitly in challengeConfig.urls.
    // We'll construct it based on a pattern, assuming /api/challenge/<challenge_id>/groups/<group_id>
    const deleteUrl = `/api/challenge/${challengeConfig.id}/groups/${groupId}`;

    setLoading(deleteBtn, true, "Deleting...");

    try {
        const response = await apiFetch(deleteUrl, { method: 'DELETE' }, challengeConfig.csrfToken);

        if (response.status === 'success') {
            showFlash(response.message || `Group ${groupId} deleted successfully.`, 'success');
            // Dispatch a local event for immediate UI update on the deleter's client
            document.dispatchEvent(new CustomEvent('localGroupSuccessfullyDeleted', { detail: { groupId } }));
            // Other clients will update via the WebSocket event ('group_deleted' -> 'socketGroupDeletedReceived')
        } else {
            throw new Error(response.error || response.message || "Failed to delete group.");
        }
    } catch (error) {
        console.error("Delete group failed:", error);
        showError(statusDiv, `Error deleting group: ${error.message}`, "danger");
        // No need to re-enable button here if it's removed with the card on socket event.
        // If socket event fails or is not implemented, re-enabling might be needed.
        setLoading(deleteBtn, false, '<i class="bi bi-trash"></i>'); // Restore original content if it had icon
    }
    // setLoading(deleteBtn, false, 'Delete'); // Or a generic "Delete" text
}


export async function handleJoinLeaveGroup(groupId, action, currentChallengeConfig, pageStatusDiv, /* myGroupContainerEl, otherGroupsContainerEl */) {
    const isJoin = action === 'join';
    const buttonSelector = isJoin ? `.join-group-btn[data-group-id="${groupId}"]` : `.leave-group-btn[data-group-id="${groupId}"]`;
    const actionButton = document.querySelector(buttonSelector);

    if (actionButton && actionButton.disabled) return;

    if (!currentChallengeConfig.isLoggedIn || !currentChallengeConfig.isAuthorized) {
        showFlash("You must be logged in and authorized for this challenge to manage group membership.", "warning");
        return;
    }
    if (Number.isNaN(groupId)) {
        showError(pageStatusDiv, "Invalid group ID.", "danger");
        return;
    }

    const url = `${currentChallengeConfig.urls.joinLeaveBase}/${groupId}/${action}`;
    if(actionButton) setLoading(actionButton, true, isJoin ? 'Joining…' : 'Leaving…');

    try {
        const responseData = await apiFetch(
            url,
            { method: 'POST', signal: nextSignal('joinLeaveGroup') },
            currentChallengeConfig.csrfToken
        );

        if (responseData.status !== 'success') {
            throw new Error(responseData.error || responseData.message || `Failed to ${action} group.`);
        }
        
        // Update the central userJoinedGroupId state
        updateUserJoinedGroupState(isJoin ? groupId : null);

        // Update the specific group's member_count and player_names in challengeConfig
        if (responseData.group_data) {
            updateGroupInConfig(responseData.group_data); // This will update the group in challengeConfig.initialGroups
        } else {
            // If no group_data, manually adjust member count (less ideal)
            const groupIndex = currentChallengeConfig.initialGroups.findIndex(g => g.id === groupId);
            if (groupIndex !== -1) {
                let currentMemberCount = currentChallengeConfig.initialGroups[groupIndex].member_count || 0;
                currentChallengeConfig.initialGroups[groupIndex].member_count = isJoin ? currentMemberCount + 1 : Math.max(0, currentMemberCount - 1);
                // Player names would ideally come from server on join/leave or be cleared
                if (!isJoin && currentChallengeConfig.currentUserId) { // If current user left, check against their ID
                    // Find the player slot that matches the current user's username to clear it.
                    // This assumes player_names has { display_name, account_name } and account_name is the persistent username.
                    const userSlot = currentChallengeConfig.initialGroups[groupIndex].player_names.find(
                        p => p.account_name === (currentChallengeConfig.currentUserUsername || '')
                    );
                    if (userSlot) {
                        // Instead of just clearing, it might be better if the server handles player_names updates entirely.
                        // For now, clear the display name. The server should ideally send the authoritative list.
                        userSlot.display_name = ""; 
                        // Optionally, nullify account_name if the slot is now truly empty,
                        // but this depends on how empty slots vs named-but-left slots are handled.
                        // userSlot.account_name = null; 
                    }
                }
            }
        }

        showFlash(responseData.message || `Successfully ${action}ed group!`, 'success');
        // Dispatch an event for main.js to refresh UI
        document.dispatchEvent(new CustomEvent('configGroupMembershipChanged', { detail: { groupId, action, responseData } }));

    } catch (err) {
        console.error("'%s' group failed:", action, err);
        showError(pageStatusDiv, `Error ${action}ing group: ${err.message}`, 'danger'); // User-facing, template literal is fine if err.message is escaped by showError
    } finally {
        if(actionButton) setLoading(actionButton, false);
    }
}


export async function handleSavePlayerNames(event, groupId, currentChallengeConfig, pageStatusDiv) {
    const saveBtn = event.target.closest('.save-player-names-btn');
    if (!saveBtn || saveBtn.disabled) return;

    const isJoinedGroup = currentChallengeConfig.userJoinedGroupId === groupId;
    if (!currentChallengeConfig.isLoggedIn || !currentChallengeConfig.isAuthorized || !isJoinedGroup) {
        showFlash("Not authorized to save names for this group.", "warning");
        return;
    }

    const sectionWrapper = saveBtn.closest('.player-names-section-wrapper');
    if (!sectionWrapper) return;
    const inputsContainer = sectionWrapper.querySelector('.player-name-inputs');
    const errBox = sectionWrapper.querySelector('.player-name-error');
    if (!inputsContainer || !errBox) return;

    const displayNames = Array.from(inputsContainer.querySelectorAll('.player-name-input')).map(input => input.value.trim());

    if (displayNames.some(name => name.length > 50)) {
        showError(errBox, `Display names cannot exceed 50 characters.`);
        return;
    }
    showError(errBox, null);
    setLoading(saveBtn, true, 'Saving…');

    try {
        const url = `${currentChallengeConfig.urls.savePlayersBase}/${groupId}/players`;
        const payload = { player_display_names: displayNames };
        const data = await apiFetch(url, { method: 'POST', body: payload, signal: nextSignal('savePlayers') }, currentChallengeConfig.csrfToken);

        if (data.status !== 'success' && data.status !== 'ok') {
            throw new Error(data.error || 'Unknown error saving names');
        }

        // Update central config
        const groupIndex = currentChallengeConfig.initialGroups.findIndex(g => g.id === groupId);
        if (groupIndex !== -1) {
            // The server response `data.player_names` (if present) should be the source of truth
            // for the new player_names structure (array of objects {display_name, account_name})
            if (data.player_names && Array.isArray(data.player_names)) {
                currentChallengeConfig.initialGroups[groupIndex].player_names = data.player_names;
            } else {
                // Fallback: Update display_name part of existing slots if server doesn't return full structure
                let slots = currentChallengeConfig.initialGroups[groupIndex].player_names || [];
                // Ensure slots array is the correct length
                while(slots.length < displayNames.length) slots.push({display_name: "", account_name: null});
                if(slots.length > displayNames.length) slots = slots.slice(0, displayNames.length);

                displayNames.forEach((name, i) => {
                    if (slots[i]) slots[i].display_name = name;
                    else slots[i] = { display_name: name, account_name: null };
                });
                currentChallengeConfig.initialGroups[groupIndex].player_names = slots;
            }
        }
        
        showFlash(data.message || 'Names saved!', 'success');
        // Dispatch event for main.js to refresh UI based on updated config
        document.dispatchEvent(new CustomEvent('configPlayerNamesUpdated', { detail: { groupId, playerNames: currentChallengeConfig.initialGroups[groupIndex]?.player_names } }));

    } catch (err) {
        console.error('Save player names failed:', err);
        showError(errBox, `Error saving names: ${err.message}`);
    } finally {
        setLoading(saveBtn, false);
    }
}
