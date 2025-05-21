// app/static/js/challenge_view/actions/challengeActions.js
import { apiFetch } from '../../utils/api.js'; // Adjusted path
import { setLoading, showError, showFlash, showSuccess, escapeHtml, getCommonDOMElements } from '../../utils/helpers.js'; // Added getCommonDOMElements
import { challengeConfig, updateGroupProgressInConfig, updateGroupPenaltyTextInConfig, addAuthorizedUserToConfig, removeAuthorizedUserFromConfig } from '../config.js';
// orchestrateUIAfterStateChange was unused here; main.js handles broad UI updates via events.
import { renderOrUpdateProgressBar } from '../ui/progressDisplay.js';
import { updatePenaltyDisplay } from '../ui/uiOrchestrator.js';

// getCommonDOMElements is now imported from helpers.js

/**
 * Handles updating the progress of a challenge item.
 * @param {object} itemData - Data attributes from the checkbox (itemType, itemKey, itemIndex, segmentIndex).
 * @param {boolean} isComplete - Whether the item is being marked as complete.
 * @param {HTMLElement} checkboxEl - The checkbox element.
 */
export async function handleProgressUpdate(itemData, isComplete, checkboxEl) { // Renamed
    // Use challengeConfig directly
    const { statusDiv } = getCommonDOMElements();
    const groupId = parseInt(itemData.groupId, 10);
    const itemDiv = checkboxEl.closest('.progress-item');

    // Authorization is already checked by the event listener in main.js before calling this

    let progressKey;
    let payload;
    try {
        const type = itemData.itemType;
        const key = itemData.itemKey;
        const index = parseInt(itemData.itemIndex, 10);
        payload = { item_type: type, item_key: key, item_index: index, is_complete: isComplete };

        if (type === 'b2b') {
            const segmentIndex_1based = parseInt(itemData.segmentIndex, 10);
            if (isNaN(segmentIndex_1based) || segmentIndex_1based < 1) throw new Error("Invalid segment index for B2B item.");
            payload.segment_index = segmentIndex_1based;
            progressKey = `${type}_${segmentIndex_1based - 1}_${key}_${index}`; // 0-based for local state
        } else if (type === 'normal') {
            progressKey = `${type}_${key}_${index}`;
        } else {
            throw new Error("Unknown progress item type.");
        }
        if (isNaN(index)) throw new Error("Invalid item index.");
    } catch (e) {
        console.error("Error constructing progress payload:", e);
        showError(statusDiv, `Cannot save progress: ${e.message}`, 'warning');
        checkboxEl.checked = !isComplete; // Revert checkbox
        return;
    }

    setLoading(checkboxEl, true); // Visually disable checkbox via a class or direct attribute
    if (itemDiv) itemDiv.style.opacity = '0.6';

    try {
        let progressDataForRender; // This will hold the data used for the immediate re-render

        if (challengeConfig.isLocal) {
            const { updateLocalChallengeProgress, getLocalChallengeById } = await import('../../utils/local_storage.js');
            
            // Ensure challengeConfig.id is used for localStorage operations
            const localChallengeId = challengeConfig.id;

            const success = updateLocalChallengeProgress(localChallengeId, progressKey, isComplete);
            if (!success) throw new Error("Failed to save progress locally.");
            
            const updatedLocalData = getLocalChallengeById(localChallengeId);
            if (updatedLocalData && updatedLocalData.progressData) {
                // Update the global challengeConfig.progressData for other parts of the app
                challengeConfig.progressData = updatedLocalData.progressData;
                // Use the freshly fetched progress data for this render
                progressDataForRender = updatedLocalData.progressData;
            } else {
                console.warn(`Could not re-fetch local challenge data (ID: ${localChallengeId}) after progress update. Progress bar may be stale.`);
                // Fallback to current config state, though it might be stale if re-fetch failed
                progressDataForRender = challengeConfig.progressData || {}; 
            }
        } else { // Shared challenge logic
            if (!challengeConfig.urls.updateProgressBase) throw new Error("API URL for progress update missing.");
            const url = `${challengeConfig.urls.updateProgressBase}/${groupId}/progress`; // groupId from itemData
            await apiFetch(url, { method: 'POST', body: payload }, challengeConfig.csrfToken);
            
            updateGroupProgressInConfig(groupId, progressKey, isComplete);
            const groupData = challengeConfig.initialGroups.find(g => g.id === groupId);
            progressDataForRender = groupData ? groupData.progress : {};
        }

        if (itemDiv) itemDiv.classList.toggle('completed', isComplete);

        // Determine the ID for the progress bar container.
        // For local challenges, itemData.groupId is a string like "local_uuid".
        // For shared challenges, itemData.groupId is a numeric string.
        let containerGroupIdString;
        if (challengeConfig.isLocal) {
            containerGroupIdString = itemData.groupId; // Use the string ID directly for local
        } else {
            containerGroupIdString = parseInt(itemData.groupId, 10).toString(); // Parse then convert back to string for shared, or just use itemData.groupId if it's always numeric string
        }
        // Ensure itemData.groupId is used consistently if it's already the correct string form.
        // The key is that `progressBarContainer-${id}` must match how it was set.
        // In main.js for local, it's `progressBarContainer-${challengeConfig.id}` (string).
        // For shared, group IDs are numbers, but DOM IDs are strings.
        
        const idForContainer = itemData.groupId; // itemData.groupId is already the string form needed.
                                                 // For local: "local_uuid", for shared: "123" (numeric string)
                                                 // parseInt was the issue for local.

        const progressBarContainer = document.getElementById(`progressBarContainer-${idForContainer}`);
        
        if (progressBarContainer && challengeConfig.coreChallengeStructure && Object.keys(challengeConfig.coreChallengeStructure).length > 0) {
            renderOrUpdateProgressBar(
                progressBarContainer, 
                challengeConfig.coreChallengeStructure, 
                progressDataForRender // Use the explicitly prepared data
            );
        } else {
            if (!progressBarContainer) console.warn(`Progress bar container not found for ID: progressBarContainer-${containerGroupId}`);
            if (!challengeConfig.coreChallengeStructure || Object.keys(challengeConfig.coreChallengeStructure).length === 0) console.warn(`Core challenge structure is missing, empty, or not yet loaded when attempting to update progress bar.`);
        }

    } catch (error) {
        console.error("Failed to update progress:", error);
        checkboxEl.checked = !isComplete; // Revert
        showError(statusDiv, `Error saving progress: ${error.message}`, 'danger');
        if (itemDiv) {
            itemDiv.classList.add('error-flash');
            setTimeout(() => itemDiv.classList.remove('error-flash'), 1500);
        }
    } finally {
        setLoading(checkboxEl, false);
        if (itemDiv) itemDiv.style.opacity = '1';
    }
}

/**
 * Handles clearing an active penalty for a group.
 * @param {number} groupId - The ID of the group.
 * @param {HTMLElement} clearBtn - The button that triggered the action.
 */
export async function handleClearPenalty(groupId, clearBtn) {
    // Use challengeConfig directly
    const { statusDiv } = getCommonDOMElements();

    if (!(clearBtn instanceof HTMLElement)) {
        console.error("handleClearPenalty: clearBtn is not a valid HTMLElement.", clearBtn);
        showError(statusDiv, "Error processing penalty clear: Invalid button reference.", "danger");
        return;
    }
    const penaltyDisplayDiv = clearBtn.closest('.active-penalty-display');

    if (!challengeConfig.isLoggedIn || !challengeConfig.isAuthorized || challengeConfig.userJoinedGroupId !== groupId) {
        showFlash("You must be an authorized member of this group to clear penalties.", "warning");
        return;
    }
    if (!challengeConfig.urls.setPenaltyUrlBase || !challengeConfig.csrfToken) {
        showError(penaltyDisplayDiv || statusDiv, "Cannot clear penalty: configuration missing.", 'danger');
        return;
    }

    setLoading(clearBtn, true, 'Clearing…');

    try {
        const url = `${challengeConfig.urls.setPenaltyUrlBase}/${groupId}/penalty`;
        await apiFetch(url, { method: 'POST', body: { penalty_text: '' } }, challengeConfig.csrfToken);

        updateGroupPenaltyTextInConfig(groupId, ''); // Update central config
        // The updatePenaltyDisplay function in uiOrchestrator.js will be called by a higher-level UI refresh
        // or directly if this action is self-contained for UI updates.
        // For now, let's assume main.js or socket handler will trigger a broader UI refresh that includes this.
        const specificPenaltyDisplay = document.querySelector(`.active-penalty-display[data-group-id="${groupId}"]`);
        if(specificPenaltyDisplay) updatePenaltyDisplay(specificPenaltyDisplay, '', true);


        showFlash("Penalty cleared.", "success");
    } catch (err) {
        console.error('Clear penalty failed:', err);
        showError(penaltyDisplayDiv || statusDiv, `Error clearing penalty: ${err.message}`, 'danger');
    } finally {
        setLoading(clearBtn, false, 'Clear');
    }
}


/**
 * Handles authorizing a new user for the challenge.
 * @param {string} username - Username of the user to authorize.
 * @param {HTMLElement} authorizeBtn - The button that triggered the action.
 * @param {HTMLElement} errorDisplayElement - DOM element for errors.
 * @param {HTMLInputElement} usernameInputElement - The input field for username.
 * @param {HTMLElement} userListElement - The UL element displaying authorized users.
 */
export async function handleAuthorizeUser(username, authorizeBtn, errorDisplayElement, usernameInputElement, userListElement) { // Renamed
    // Use challengeConfig directly
    const { statusDiv } = getCommonDOMElements();

    if (!challengeConfig.isCreator) {
        showError(errorDisplayElement, "Only the challenge creator can authorize users.");
        return;
    }
    showError(errorDisplayElement, null);
    if (!username) {
        showError(errorDisplayElement, "Please enter a username to authorize.");
        return;
    }
    if (!challengeConfig.urls.authorizeUser || !challengeConfig.id || !challengeConfig.csrfToken) {
        showError(errorDisplayElement, "Configuration error: Cannot authorize user.");
        return;
    }

    setLoading(authorizeBtn, true, "Authorizing...");

    try {
        const data = await apiFetch(
            challengeConfig.urls.authorizeUser, // URL should be for challengeConfig.id
            { method: 'POST', body: { username: username } },
            challengeConfig.csrfToken
        );

        if (data.status === 'success' && data.user) {
            addAuthorizedUserToConfig(data.user); // Add to local config state

            // Update UI (directly manipulate the list or trigger a broader UI refresh)
            if (!userListElement.querySelector(`li[data-user-id="${data.user.id}"]`)) {
                const li = document.createElement('li');
                li.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center py-1 px-2 authorized-user-item';
                li.dataset.userId = data.user.id;
                li.innerHTML = `
                    <span class="username">${escapeHtml(data.user.username)}</span>
                    <button class="btn btn-xs btn-outline-danger remove-auth-user-btn" data-user-id="${data.user.id}" data-username="${escapeHtml(data.user.username)}" title="Remove Authorization">
                        <span class="spinner-border spinner-border-sm" style="display: none;"></span>
                        <span>&times;</span>
                    </button>`;
                const noUsersMsg = userListElement.querySelector('.text-muted');
                if (noUsersMsg) noUsersMsg.remove();
                userListElement.appendChild(li);
            }
            if(usernameInputElement) usernameInputElement.value = '';
            showFlash(`User "${escapeHtml(data.user.username)}" authorized.`, 'success');
        } else if (data.status === 'ok' && data.message && data.message.includes("already authorized")) {
             if(usernameInputElement) usernameInputElement.value = '';
            showFlash(data.message, 'info');
        }
        else {
            throw new Error(data.error || data.message || "Failed to authorize user.");
        }
    } catch (error) {
        console.error("Authorize user failed:", error);
        showError(errorDisplayElement, `Error: ${error.message}`);
    } finally {
        setLoading(authorizeBtn, false, "Authorize");
    }
}

/**
 * Handles removing authorization for a user.
 * @param {string} userIdToRemove - ID of the user whose authorization is to be removed.
 * @param {HTMLElement} removeBtn - The button that triggered the action.
 * @param {HTMLElement} errorDisplayElement - DOM element for errors.
 */
export async function handleRemoveAuthorization(userIdToRemove, removeBtn, errorDisplayElement) { // Renamed
    // Use challengeConfig directly
    const { statusDiv } = getCommonDOMElements();
    const username = removeBtn.dataset.username || 'this user';
    const listItem = removeBtn.closest('li.authorized-user-item');

    if (!challengeConfig.isCreator) {
        showError(errorDisplayElement, "Only the challenge creator can remove authorization.");
        return;
    }
    if (!userIdToRemove) {
        showError(errorDisplayElement, "Cannot remove user: Missing user ID.");
        return;
    }
    if (!challengeConfig.urls.removeUserBase || !challengeConfig.id || !challengeConfig.csrfToken) {
        showError(errorDisplayElement, "Configuration error: Cannot remove user authorization.");
        return;
    }

    setLoading(removeBtn, true, "...");

    try {
        const removeUrl = `${challengeConfig.urls.removeUserBase}/${userIdToRemove}`;
        const data = await apiFetch(removeUrl, { method: 'DELETE' }, challengeConfig.csrfToken);

        if (data.status === 'success') {
            removeAuthorizedUserFromConfig(userIdToRemove); // Remove from local config state

            if (listItem) { // Animate and remove from UI list
                listItem.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                listItem.style.opacity = '0';
                listItem.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    listItem.remove();
                    const userList = document.getElementById('authorizedUsersList'); // Assuming this ID
                    if (userList && !userList.querySelector('.authorized-user-item')) {
                        userList.innerHTML = '<li class="list-group-item list-group-item-action py-1 px-2 text-muted small">(Only you are authorized)</li>';
                    }
                }, 300);
            }
            showFlash(`Authorization removed for "${escapeHtml(username)}".`, 'success');
            showError(errorDisplayElement, null);
        } else {
            throw new Error(data.error || data.message || "Failed to remove authorization.");
        }
    } catch (error) {
        console.error("Remove authorization failed:", error);
        showError(errorDisplayElement, `Error removing user: ${error.message}`);
    } finally {
        // Button is part of the list item which gets removed on success, so no explicit restore needed for it.
        // If it was a global button, then setLoading(removeBtn, false, 'Remove') would be here.
    }
}

/**
 * Handles updating the challenge's penalty set.
 * @param {string} newPenaltyTabId - The ID of the new penalty tab to apply.
 * @param {object} currentChallengeConfig - The main challenge configuration object.
 * @param {HTMLElement} statusDiv - Element to display errors/status.
 */
export async function handleUpdateChallengePenalties(newPenaltyTabId, currentChallengeConfig, statusDiv) {
    if (!currentChallengeConfig.isCreator) {
        showError(statusDiv, "Only the challenge creator can update penalty sets.", "warning");
        return;
    }
    if (!newPenaltyTabId) {
        showError(statusDiv, "No penalty set selected.", "warning");
        return;
    }
    // Assuming an API endpoint structure. This URL might need to be added to challengeConfig.urls
    const url = `/api/challenge/${currentChallengeConfig.id}/penalties/set`;
    const btn = document.getElementById('btnUpdateChallengePenalties');

    if(btn) setLoading(btn, true, "Updating...");

    try {
        const response = await apiFetch(url, {
            method: 'POST',
            body: { penalty_tab_id: newPenaltyTabId }
        }, currentChallengeConfig.csrfToken);

        if (response.status !== 'success') {
            throw new Error(response.error || response.message || "Failed to update penalty set.");
        }
        showFlash(response.message || "Challenge penalties updated successfully!", "success");
        // The backend should emit a 'challenge_penalties_updated' socket event,
        // which main.js will handle to update challengeConfig.penaltyInfo and UI.
    } catch (error) {
        console.error("Update challenge penalties failed:", error);
        showError(statusDiv, `Error updating penalties: ${error.message}`, "danger");
    } finally {
        if(btn) setLoading(btn, false);
    }
}

/**
 * Handles disabling penalties for the challenge.
 * @param {object} currentChallengeConfig - The main challenge configuration object.
 * @param {HTMLElement} statusDiv - Element to display errors/status.
 */
export async function handleDisableChallengePenalties(currentChallengeConfig, statusDiv) {
    if (!currentChallengeConfig.isCreator) {
        showError(statusDiv, "Only the challenge creator can disable penalties.", "warning");
        return;
    }
    // Assuming an API endpoint structure. This URL might need to be added to challengeConfig.urls
    const url = `/api/challenge/${currentChallengeConfig.id}/penalties/disable`;
    const btn = document.getElementById('btnDisableChallengePenalties');

    if(btn) setLoading(btn, true, "Disabling...");

    try {
        const response = await apiFetch(url, {
            method: 'POST'
            // No body needed, or perhaps { enabled: false } if API expects it
        }, currentChallengeConfig.csrfToken);

        if (response.status !== 'success') {
            throw new Error(response.error || response.message || "Failed to disable penalties.");
        }
        showFlash(response.message || "Challenge penalties disabled successfully!", "success");
        // Backend should emit 'challenge_penalties_updated' socket event.
    } catch (error) {
        console.error("Disable challenge penalties failed:", error);
        showError(statusDiv, `Error disabling penalties: ${error.message}`, "danger");
    } finally {
        if(btn) setLoading(btn, false);
    }
}
