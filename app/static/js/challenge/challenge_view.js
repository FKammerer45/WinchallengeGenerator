// static/js/challenge/challenge_view.js
// Main orchestrator for the UNIFIED challenge view page

import { apiFetch } from '../utils/api.js';
import { setLoading, showError, escapeHtml } from '../utils/helpers.js';
import {
    updateGroupCountDisplay, renderProgressItems, addGroupToDOM,
    updateUIAfterMembershipChange, renderOrUpdateProgressBar, renderStaticChallengeDetailsJS
    // Ensure renderPlayerNameInputs is exported from challenge_ui.js if needed here,
    // but it's primarily called within updateUIAfterMembershipChange
} from './challenge_ui.js';
import { getLocalChallengeById, updateLocalChallengeProgress } from './local_challenge_storage.js'; // Use './' assuming same folder now
import { updatePenaltyConfig } from './challenge_penalty.js';

// --- Module-level state ---
let challengeConfig = {
    id: null, // public_id or localId
    isLocal: false,
    isMultigroup: false,
    maxGroups: 1,
    initialGroupCount: 0,
    userJoinedGroupId: null,
    coreChallengeStructure: null,
    progressData: {}, // Holds progress ONLY for local challenges
    csrfToken: null,
    numPlayersPerGroup: 1, // Added default
    initialGroups: [], // Added default, holds {id, name, progress, member_count, player_names} for DB challenges
    urls: { addGroup: null, updateProgressBase: null, joinLeaveBase: null }
};
// --- DOM Element Refs ---
let myGroupContainerEl = null;
let otherGroupsContainerEl = null;
let statusDiv = null; // For general page status/errors

// --- Event Handlers ---

async function handleCreateGroupSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const groupNameInput = form.elements.group_name;
    const groupName = groupNameInput.value.trim();
    const submitButton = form.querySelector('#addGroupBtn');
    const errorDiv = document.getElementById('addGroupError'); // Error display specific to this form

    showError(errorDiv, null);
    if (!groupName || groupName.length > 80) { showError(errorDiv, "Invalid group name (1-80 chars)."); return; }
    if (challengeConfig.initialGroupCount >= challengeConfig.maxGroups) { showError(errorDiv, `Max groups (${challengeConfig.maxGroups}) reached.`); return; }

    setLoading(submitButton, true, 'Creating...');

    try {
        const data = await apiFetch(challengeConfig.urls.addGroup, {
            method: 'POST', body: { group_name: groupName }
        }, challengeConfig.csrfToken);

        if (data.status === 'success' && data.group) {
            addGroupToDOM(data.group, challengeConfig); // Renders card, calls updateUIAfterMembershipChange
            challengeConfig.initialGroupCount++; // Update count state
            console.log("DOM Check before count update:", {
                countSpanExists: document.getElementById('currentGroupCount'),
                limitInfoExists: document.getElementById('groupLimitInfo')
            });
            updateGroupCountDisplay(challengeConfig.initialGroupCount, challengeConfig.maxGroups); // Update display
            groupNameInput.value = ''; // Clear input
        } else { throw new Error(data.error || "Failed to add group."); }
    } catch (error) {
        console.error("Create group failed:", error);
        showError(errorDiv, `Error: ${error.message}`);
    } finally {
        setLoading(submitButton, false);
    }
}

async function handleJoinGroupClick(event) {
    const joinButton = event.target.closest('.join-group-btn');
    if (!joinButton) return;
    const groupId = joinButton.dataset.groupId;
    const buttonContainer = joinButton.closest('.card-footer'); // Target for errors

    if (!groupId) { showError(buttonContainer, "Missing group ID."); return; }
    // Ensure container elements were found during initialization
    if (!myGroupContainerEl || !otherGroupsContainerEl) {
        console.error("Group containers not found, cannot move card on join.");
        showError(buttonContainer || statusDiv, "UI Error: Cannot move group.", "danger");
        return;
    }

    console.log(`handleJoinGroupClick: Joining group ${groupId}`);
    setLoading(joinButton, true, 'Joining...');
    const url = `${challengeConfig.urls.joinLeaveBase}/${groupId}/join`;

    try {
        const data = await apiFetch(url, { method: 'POST' }, challengeConfig.csrfToken);
        console.log("Join successful:", data.message);

        // Move Card and Update State
        const cardToMove = otherGroupsContainerEl.querySelector(`.group-card-wrapper[data-group-id="${groupId}"]`);
        if (cardToMove) {
            myGroupContainerEl.innerHTML = ''; // Clear placeholder/previous
            const heading = document.createElement('h4'); heading.className = 'text-warning mb-3'; heading.textContent = 'Your Group'; myGroupContainerEl.appendChild(heading);
            myGroupContainerEl.appendChild(cardToMove); // Move the card element
            console.log(`Moved group ${groupId} to My Group container.`);
        } else {
             console.error(`Could not find card ${groupId} in other groups container to move.`);
             // Don't block state update if card wasn't found (maybe already moved?)
         }

        challengeConfig.userJoinedGroupId = parseInt(groupId, 10); // Update state
        updateUIAfterMembershipChange(challengeConfig); // Update main UI (buttons, checkboxes, player inputs)

        // --- ADDED: Update penalty module's state ---
        if (typeof updatePenaltyConfig === 'function') {
            updatePenaltyConfig(challengeConfig);
        }
        // --- END ADDED ---

    } catch (error) {
        console.error("Failed to join group:", error);
        showError(buttonContainer, `Error: ${error.message}`);
        setLoading(joinButton, false); // Reset this button on error
    }
    // setLoading(false) is handled by updateUIAfterMembershipChange on success path
}
async function handleLeaveGroupClick(event) {
    const leaveButton = event.target.closest('.leave-group-btn');
    if (!leaveButton) return;
    const groupId = leaveButton.dataset.groupId;
    const buttonContainer = leaveButton.closest('.card-footer');

    if (!groupId) { showError(buttonContainer, "Missing group ID."); return; }
    if (!myGroupContainerEl || !otherGroupsContainerEl) {
        console.error("Group containers not found, cannot move card on leave.");
         showError(buttonContainer || statusDiv, "UI Error: Cannot move group.", "danger");
         return;
    }

    console.log(`handleLeaveGroupClick: Leaving group ${groupId}`);
    setLoading(leaveButton, true, 'Leaving...');
    const url = `${challengeConfig.urls.joinLeaveBase}/${groupId}/leave`;

    try {
        const data = await apiFetch(url, { method: 'POST' }, challengeConfig.csrfToken);
        console.log("Leave successful:", data.message);

        // Move Card and Update State
        const cardToMove = myGroupContainerEl.querySelector(`.group-card-wrapper[data-group-id="${groupId}"]`);
        if (cardToMove) {
             // Ensure the target row exists
             if (!otherGroupsContainerEl.querySelector('.row')) {
                 const row = document.createElement('div');
                 row.className = 'row';
                 otherGroupsContainerEl.appendChild(row);
             }
             otherGroupsContainerEl.querySelector('.row').appendChild(cardToMove); // Append to row inside other container
             myGroupContainerEl.innerHTML = ''; // Clear "Your Group" section
             console.log(`Moved group ${groupId} back to Other Groups container.`);
        } else {
             console.error(`Could not find card ${groupId} in your group container to move back.`);
             // Don't block state update if card wasn't found
        }

        challengeConfig.userJoinedGroupId = null; // Update state
        updateUIAfterMembershipChange(challengeConfig); // Update main UI

        // --- ADDED: Update penalty module's state ---
         if (typeof updatePenaltyConfig === 'function') {
            updatePenaltyConfig(challengeConfig);
        }
        // --- END ADDED ---

    } catch (error) {
        console.error("Failed to leave group:", error);
        showError(buttonContainer, `Error: ${error.message}`);
        setLoading(leaveButton, false); // Reset this button on error
    }
     // setLoading(false) is handled by updateUIAfterMembershipChange on success path
}


async function handleProgressChange(event) {
    if (!event.target.matches('.progress-checkbox')) return;
    const checkbox = event.target;
    const itemData = checkbox.dataset;
    const isComplete = checkbox.checked;
    const groupId = itemData.groupId; // Holds localId for local, groupId for DB
    const itemDiv = checkbox.closest('.progress-item');

    if (!groupId || !itemData.itemType || !itemData.itemKey || typeof itemData.itemIndex === 'undefined') {
        showError(itemDiv, "Data missing!"); checkbox.checked = !isComplete; return;
    }

    // Construct flat progress key
    let progressKey; /* ... build key logic ... */
    if (itemData.itemType === 'b2b' && itemData.segmentIndex) progressKey = `${itemData.itemType}_${itemData.segmentIndex}_${itemData.itemKey}_${itemData.itemIndex}`;
    else if (itemData.itemType === 'normal') progressKey = `${itemData.itemType}_${itemData.itemKey}_${itemData.itemIndex}`;
    else { showError(itemDiv, "Unknown type!"); checkbox.checked = !isComplete; return; }

    console.log(`Progress Change: ID=${groupId}, Key=${progressKey}, Complete=${isComplete}, IsLocal=${challengeConfig.isLocal}`);
    if (itemDiv) itemDiv.classList.toggle('completed', isComplete); // Optimistic UI
    checkbox.disabled = true; // Disable during save

    try {
        if (challengeConfig.isLocal) {
            // Update local state first
            challengeConfig.progressData = challengeConfig.progressData || {};
            if (isComplete) challengeConfig.progressData[progressKey] = true;
            else delete challengeConfig.progressData[progressKey];
            // Persist to localStorage
            const success = updateLocalChallengeProgress(challengeConfig.id, progressKey, isComplete);
            if (!success) throw new Error("Save failed.");
            console.log("Local progress saved.");
            // Update progress bar for local challenges
            const progressBarContainer = document.getElementById('localProgressBarContainer');
            if (progressBarContainer) renderOrUpdateProgressBar(progressBarContainer, challengeConfig.coreChallengeStructure, challengeConfig.progressData);
        } else { // DB Challenge
            const url = `${challengeConfig.urls.updateProgressBase}/${groupId}/progress`;
            const payload = { item_type: itemData.itemType, item_key: itemData.itemKey, item_index: parseInt(itemData.itemIndex, 10), is_complete: isComplete, };
            if (itemData.segmentIndex) payload.segment_index = parseInt(itemData.segmentIndex, 10);
            await apiFetch(url, { method: 'POST', body: payload }, challengeConfig.csrfToken);
            console.log("DB Progress update successful.");
            // Optionally update DB progress bar if implemented
        }
    } catch (error) {
        console.error("Failed to update progress:", error);
        if (itemDiv) { itemDiv.classList.toggle('completed', !isComplete); showError(itemDiv, `Save failed!`); setTimeout(() => showError(itemDiv, null), 3000); }
        else { alert(`Error saving progress: ${error.message}`); } // Fallback alert
        checkbox.checked = !isComplete; // Revert state
        // Revert local state if needed
        if (challengeConfig.isLocal && challengeConfig.progressData) { if (isComplete) delete challengeConfig.progressData[progressKey]; else challengeConfig.progressData[progressKey] = true; }
    } finally {
        // Re-enable only if interaction is allowed
        const canInteract = challengeConfig.isLocal || (challengeConfig.userJoinedGroupId === parseInt(groupId, 10));
        checkbox.disabled = !canInteract;
    }
}

// --- *** NEW: Handler for Saving Player Names *** ---
async function handleSavePlayersClick(event) {
    const saveButton = event.target.closest('.save-player-names-btn');
    // Event delegation should handle this, but double check
    if (!saveButton || !challengeConfig.isMultigroup) return;

    const groupId = saveButton.dataset.groupId;
    const playerNamesSection = saveButton.closest('.player-names-section');
    const errorContainer = playerNamesSection?.querySelector('.player-name-error');
    const inputsContainer = playerNamesSection?.querySelector('.player-name-inputs');

    if (!groupId || !playerNamesSection || !inputsContainer || !errorContainer) {
        console.error("Save Players: Could not find necessary elements for group", groupId);
        showError(statusDiv || document.body, "Error preparing to save player names.", "danger");
        return;
    }

    showError(errorContainer, null); // Clear specific error area for this group

    // Collect non-empty, trimmed names from input fields
    const nameInputs = inputsContainer.querySelectorAll('.player-name-input');
    const playerNames = Array.from(nameInputs)
                             .map(input => input.value.trim())
                             .filter(name => name.length > 0); // Only save non-empty names

    // Validate against allowed number (read from config)
    const maxAllowed = challengeConfig.numPlayersPerGroup || 1;
    if (playerNames.length > maxAllowed) {
        showError(errorContainer, `You can only enter up to ${maxAllowed} player names.`, 'warning');
        return;
    }

    console.log(`Saving player names for group ${groupId}:`, playerNames);
    setLoading(saveButton, true, 'Saving...');

    try {
        const url = `/api/challenge/groups/${groupId}/players`; // API endpoint
        const data = await apiFetch(url, {
            method: 'POST',
            body: { player_names: playerNames } // Send validated list
        }, challengeConfig.csrfToken); // Pass CSRF token

        if (data.status === 'success') {
             console.log("Player names saved successfully via API.");
             showError(errorContainer, "Names saved!", 'success');
             setTimeout(() => showError(errorContainer, null), 2500); // Clear success message

             // --- Update client-side state ---
             const groupIndex = challengeConfig.initialGroups.findIndex(g => g.id === parseInt(groupId, 10));
             if (groupIndex !== -1) {
                 challengeConfig.initialGroups[groupIndex].player_names = playerNames; // Update array in config
                 console.log("Updated challengeConfig.initialGroups with new player names.");

                 // --- ADDED: Update penalty module's state ---
                 if (typeof updatePenaltyConfig === 'function') {
                     updatePenaltyConfig(challengeConfig);
                 }
                 // --- END ADDED ---

             } else {
                 console.warn("Could not find group in local config state to update player names.");
             }
             // --- End client-side state update ---

        } else { throw new Error(data.error || "Unknown error saving names."); } // Handle API error response
    } catch (error) {
        console.error("Failed to save player names:", error);
        showError(errorContainer, `Error: ${error.message}`, 'danger'); // Show error in the specific group card
    } finally {
        setLoading(saveButton, false); // Reset save button loading state
    }
}

/** Renders the view for a local challenge */
function renderLocalChallengeView(challenge) {
    console.log("renderLocalChallengeView: Rendering", challenge?.localId);
    const displayContainer = document.getElementById('localChallengeDisplay');
    const statusDivLocal = document.getElementById('pageStatusDisplay'); // Use main status div
    if (!displayContainer) { console.error("#localChallengeDisplay missing!"); return; }

    displayContainer.innerHTML = ''; // Clear loading

    try {
        // Render Header Card
        const headerCard = document.createElement('div'); /* ... set class, innerHTML ... */
        headerCard.className = 'mb-4 card bg-dark text-light';
        headerCard.innerHTML = `<div class="card-header"><h2 class="h3 mb-0">${escapeHtml(challenge.name || 'Unnamed')}</h2></div><div class="card-body"><p class="text-muted small mb-0">Saved: ${new Date(challenge.createdAt).toLocaleString()}<br><span class="d-inline-block mt-1">ID: <code>${escapeHtml(challenge.localId)}</code></span></p></div>`;
        displayContainer.appendChild(headerCard);

        // Render Static Details Card
        const detailsCard = document.createElement('div'); /* ... set class, innerHTML ... */
        detailsCard.className = 'mb-4 card bg-dark text-light'; detailsCard.innerHTML = '<div class="card-header"><h3 class="mb-0 h5">Challenge Rules</h3></div>'; const detailsBody = document.createElement('div'); detailsBody.className = 'card-body'; detailsCard.appendChild(detailsBody); displayContainer.appendChild(detailsCard);
        renderStaticChallengeDetailsJS(detailsBody, challenge.challengeData || {}); // Call UI helper

        // Render Progress Bar
        const progressBarContainer = document.createElement('div'); /* ... set id, class ... */
        progressBarContainer.id = 'localProgressBarContainer'; progressBarContainer.className = 'mb-3'; displayContainer.appendChild(progressBarContainer);
        renderOrUpdateProgressBar(progressBarContainer, challenge.challengeData || {}, challenge.progressData || {}); // Call UI helper

        // Render Progress Items Card
        const progressCard = document.createElement('div'); /* ... set class, innerHTML ... */
        progressCard.className = 'mb-4 card bg-dark text-light'; progressCard.innerHTML = '<div class="card-header"><h3 class="mb-0 h5">Your Progress</h3></div>'; const progressBody = document.createElement('div'); progressBody.className = 'card-body'; progressBody.id = `progress-local-${challenge.localId}`; progressCard.appendChild(progressBody); displayContainer.appendChild(progressCard);
        renderProgressItems(progressBody, challenge.challengeData || {}, challenge.localId, challenge.progressData || {}, true); // Call UI helper

        console.log("renderLocalChallengeView: Render complete.");
    } catch (renderError) {
        console.error("Error during dynamic render of local challenge:", renderError);
        showError(statusDiv || displayContainer, "Error displaying challenge details.", "danger");
    }
}


// --- Initialize Page ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("challenge_view.js: Initializing...");

    // Assign elements needed early or frequently
    myGroupContainerEl = document.getElementById('myGroupContainer');
    otherGroupsContainerEl = document.getElementById('otherGroupsContainer');
    statusDiv = document.getElementById('pageStatusDisplay');

    const dataEl = document.getElementById('challengeData');
    if (!dataEl?.dataset) { /* ... error handling ... */ return; }

    // Read data into challengeConfig
    try {
         const joinedId = JSON.parse(dataEl.dataset.userJoinedGroupId || 'null');
         const structureJson = dataEl.dataset.challengeJson;
         const coreStructure = structureJson && structureJson !== 'null' ? JSON.parse(structureJson) : null;
         const parsedMaxGroups = parseInt(dataEl.dataset.maxGroups, 10);
         const maxGroupsValue = (!isNaN(parsedMaxGroups) && parsedMaxGroups >= 1) ? parsedMaxGroups : 1;
         const parsedInitialCount = parseInt(dataEl.dataset.initialGroupCount, 10);
         const initialCountValue = (!isNaN(parsedInitialCount) && parsedInitialCount >= 0) ? parsedInitialCount : 0;
         // --- ADDED Reading for numPlayersPerGroup and initialGroups (with player names) ---
         const parsedNumPlayers = parseInt(dataEl.dataset.numPlayersPerGroup, 10);
         const initialGroupsJson = dataEl.dataset.initialGroups;
         const initialGroupsData = initialGroupsJson && initialGroupsJson !== 'null' ? JSON.parse(initialGroupsJson) : [];

         challengeConfig = {
             id: dataEl.dataset.challengeId,
             isLocal: dataEl.dataset.isLocal === 'true',
             isMultigroup: dataEl.dataset.isMultigroup === 'true',
             maxGroups: maxGroupsValue,
             initialGroupCount: initialCountValue,
             userJoinedGroupId: typeof joinedId === 'number' ? joinedId : null,
             coreChallengeStructure: coreStructure,
             progressData: {},
             csrfToken: dataEl.dataset.csrfToken,
             // Store the new config value
             numPlayersPerGroup: (!isNaN(parsedNumPlayers) && parsedNumPlayers >= 1) ? parsedNumPlayers : 1,
             // Store the initial groups data (includes player names)
             initialGroups: Array.isArray(initialGroupsData) ? initialGroupsData : [],
             urls: {
                 addGroup: dataEl.dataset.addGroupUrl,
                 updateProgressBase: dataEl.dataset.updateProgressUrlBase,
                 joinLeaveBase: dataEl.dataset.joinLeaveUrlBase
             }
         };
         // --- End Reading Additions ---
         if (!challengeConfig.id /*|| ... other validation ...*/) throw new Error("Essential config missing.");
         console.log("challenge_view.js: Parsed challengeConfig:", challengeConfig);

    } catch(e) { console.error("challenge_view.js: Failed to parse initial data:", e); showError(statusDiv || document.body, `Init Error: ${e.message}`); return; }

    // --- Branch based on Local vs DB ---
    if (challengeConfig.isLocal) {
        // --- LOCAL CHALLENGE ---
        console.log("Mode: Local Challenge. ID:", challengeConfig.id);
        const localData = getLocalChallengeById(challengeConfig.id); // Fetch from LS
        console.log("Local data fetched from storage:", localData);

        if (localData) {
            // Store fetched local data in config
            challengeConfig.coreChallengeStructure = localData.challengeData;
            challengeConfig.progressData = localData.progressData || {};
            console.log("Local challenge found, proceeding to render...");

            // Render the view dynamically using the fetched local data
            renderLocalChallengeView(localData); // Assumes this function exists

            // Attach the change listener for progress AFTER rendering
            const displayContainer = document.getElementById('localChallengeDisplay');
            if (displayContainer) {
                displayContainer.addEventListener('change', handleProgressChange); // Ensure handleProgressChange checks isLocal
                console.log("challenge_view.js: Local progress listener attached.");
            } else {
                console.error("Could not attach local progress listener: #localChallengeDisplay missing after render attempt.");
            }
        } else {
            // Handle case where local challenge ID exists in URL but data is missing in LS
            const displayContainer = document.getElementById('localChallengeDisplay');
            const errorMsg = `Error: Could not load local challenge data (ID: ${escapeHtml(challengeConfig.id)}). Was it deleted?`; // Escape ID
            if (displayContainer) showError(displayContainer, errorMsg, 'danger'); // Use showError
            else console.error(errorMsg);
        }

    } else {
        // --- DATABASE CHALLENGE ---
        console.log(`Mode: DB Challenge (Multigroup: ${challengeConfig.isMultigroup})`);
        const addGroupForm = document.getElementById('addGroupForm');
        const pageContainer = document.getElementById('challengeViewContainer'); // Use this for delegation

        updateUIAfterMembershipChange(challengeConfig); // Initial UI state sync
        updateGroupCountDisplay(challengeConfig.initialGroupCount, challengeConfig.maxGroups); // Initial count

        // Attach Listeners
        if (challengeConfig.isMultigroup && addGroupForm) {
            addGroupForm.addEventListener('submit', handleCreateGroupSubmit);
            console.log("Listener attached: Create Group");
        }

        if (pageContainer) {
             // --- Consolidated Click Listener ---
             pageContainer.addEventListener('click', (event) => {
                if (challengeConfig.isMultigroup && event.target.closest('.join-group-btn')) {
                    handleJoinGroupClick(event);
                } else if (challengeConfig.isMultigroup && event.target.closest('.leave-group-btn')) {
                    handleLeaveGroupClick(event);
                } else if (challengeConfig.isMultigroup && event.target.closest('.save-player-names-btn')) {
                    handleSavePlayersClick(event);
                }
             });
             console.log("Listeners attached: Join/Leave/Save Players (delegated)");

             // Progress listener needed for all DB modes
             pageContainer.addEventListener('change', handleProgressChange);
             console.log("Listener attached: DB Progress (delegated)");
        } else { console.error("Main view container (#challengeViewContainer) NOT FOUND!"); }
    }

}); // End DOMContentLoaded