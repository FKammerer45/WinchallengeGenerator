// static/js/challenge/challenge_view.js
// Main orchestrator for the unified challenge view page (challenge.html).
// Handles state, user interactions, API calls, and coordinates UI updates.

import { apiFetch } from '../utils/api.js';
import { setLoading, showError, escapeHtml } from '../utils/helpers.js';
import {
    updateGroupCountDisplay, renderProgressItems, addGroupToDOM,
    updateUIAfterMembershipChange, renderOrUpdateProgressBar,
    renderStaticChallengeDetailsJS, updatePenaltyDisplay, renderPlayerNameInputs
} from './challenge_ui.js';
import { getLocalChallengeById, updateLocalChallengeProgress } from './local_challenge_storage.js';
import { updatePenaltyConfig } from './challenge_penalty.js';

// --- Module-level State ---
let challengeConfig = {
    id: null, isLocal: false, isMultigroup: false, maxGroups: 1, initialGroupCount: 0,
    userJoinedGroupId: null, coreChallengeStructure: null, progressData: {},
    csrfToken: null, numPlayersPerGroup: 1, initialGroups: [],
    urls: { addGroup: null, updateProgressBase: null, joinLeaveBase: null, setPenaltyUrlBase: null, savePlayersBase: null },
    isLoggedIn: false
};
let isProcessingClick = false;

// --- DOM Element References ---
let myGroupContainerEl = null;
let otherGroupsContainerEl = null;
let statusDiv = null;

// --- Constants for Column Classes ---
const JOINED_GROUP_COL_CLASSES = ['col-md-8', 'col-lg-6', 'mx-auto', 'mb-4']; // Classes for the single joined group
const OTHER_GROUP_COL_CLASSES = ['col-lg-4', 'col-md-6', 'mb-4']; // Standard grid classes for other groups

// --- Helper Functions --- (initializeConfigFromDOM, updateUserJoinedGroupState remain the same)
function initializeConfigFromDOM() {
    const dataEl = document.getElementById('challengeData');
    statusDiv = document.getElementById('pageStatusDisplay');
    if (!dataEl?.dataset) {
        console.error("CRITICAL: #challengeData element or its dataset is missing!");
        showError(statusDiv || document.body, "Initialization Error: Cannot read page data.", "danger");
        return false;
    }
    try {
        const joinedId = JSON.parse(dataEl.dataset.userJoinedGroupId || 'null');
        const structureJson = dataEl.dataset.challengeJson;
        const coreStructure = structureJson && structureJson !== 'null' ? JSON.parse(structureJson) : null;
        const parsedMaxGroups = parseInt(dataEl.dataset.maxGroups, 10);
        const maxGroupsValue = (!isNaN(parsedMaxGroups) && parsedMaxGroups >= 1) ? parsedMaxGroups : 1;
        const parsedNumPlayers = parseInt(dataEl.dataset.numPlayersPerGroup, 10);
        const initialGroupsJson = dataEl.dataset.initialGroups;
        const initialGroupsData = initialGroupsJson && initialGroupsJson !== 'null' ? JSON.parse(initialGroupsJson) : [];

        challengeConfig = {
            id: dataEl.dataset.challengeId,
            isLocal: dataEl.dataset.isLocal === 'true',
            isMultigroup: dataEl.dataset.isMultigroup === 'true',
            maxGroups: maxGroupsValue,
            initialGroupCount: initialGroupsData.length,
            userJoinedGroupId: typeof joinedId === 'number' ? joinedId : null,
            coreChallengeStructure: coreStructure,
            progressData: {},
            csrfToken: dataEl.dataset.csrfToken,
            numPlayersPerGroup: (!isNaN(parsedNumPlayers) && parsedNumPlayers >= 1) ? parsedNumPlayers : 1,
            initialGroups: Array.isArray(initialGroupsData) ? initialGroupsData : [],
            urls: {
                addGroup: dataEl.dataset.addGroupUrl,
                updateProgressBase: dataEl.dataset.updateProgressUrlBase,
                joinLeaveBase: dataEl.dataset.joinLeaveUrlBase,
                setPenaltyUrlBase: dataEl.dataset.setPenaltyUrlBase,
                savePlayersBase: dataEl.dataset.savePlayersUrlBase
            },
            isLoggedIn: dataEl.dataset.isLoggedIn === 'true'
        };
        if (!challengeConfig.id) throw new Error("Essential config 'challengeId' missing.");
        if (!challengeConfig.isLocal) {
            if(!challengeConfig.urls.addGroup) console.warn("Add Group URL missing.");
            if(!challengeConfig.urls.updateProgressBase) console.warn("Update Progress URL base missing.");
            if(!challengeConfig.urls.joinLeaveBase) console.warn("Join/Leave URL base missing.");
            if(!challengeConfig.urls.savePlayersBase) console.warn("Save Players URL base missing.");
        }
        return true;
    } catch (e) {
        console.error("challenge_view.js: Failed to parse initial data:", e);
        showError(statusDiv || document.body, `Initialization Error: ${e.message}`, 'danger');
        return false;
    }
}
function updateUserJoinedGroupState(newGroupId) {
    challengeConfig.userJoinedGroupId = newGroupId;
    const dataEl = document.getElementById('challengeData');
    if (dataEl) {
        dataEl.dataset.userJoinedGroupId = JSON.stringify(newGroupId);
    }
    if (typeof updatePenaltyConfig === 'function') {
        updatePenaltyConfig(challengeConfig);
    }
}


// --- Event Handlers ---

async function handleCreateGroupSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const groupNameInput = form.elements.group_name;
    const groupName = groupNameInput.value.trim();
    const submitButton = form.querySelector('#addGroupBtn');
    const errorDiv = document.getElementById('addGroupError');

    showError(errorDiv, null);
    if (!groupName || groupName.length > 80) {
        showError(errorDiv, "Invalid group name (1-80 characters)."); return;
    }
    if (challengeConfig.initialGroupCount >= challengeConfig.maxGroups) {
        showError(errorDiv, `Maximum number of groups (${challengeConfig.maxGroups}) reached.`); return;
    }

    setLoading(submitButton, true, 'Creating...');
    try {
        const data = await apiFetch(challengeConfig.urls.addGroup, {
            method: 'POST', body: { group_name: groupName }
        }, challengeConfig.csrfToken);

        if (data.status === 'success' && data.group) {
            challengeConfig.initialGroups.push({
                id: data.group.id, name: data.group.name, progress: data.group.progress || {},
                member_count: 0, player_names: [], active_penalty_text: ''
            });
            challengeConfig.initialGroupCount++;
            addGroupToDOM(data.group, challengeConfig, myGroupContainerEl, otherGroupsContainerEl);
            updateGroupCountDisplay(challengeConfig.initialGroupCount, challengeConfig.maxGroups);
            groupNameInput.value = '';
            showError(errorDiv, null);
        } else { throw new Error(data.error || "Failed to add group."); }
    } catch (error) {
        console.error("Create group failed:", error);
        showError(errorDiv, `Error: ${error.message}`);
    } finally { setLoading(submitButton, false); }
}

async function handleJoinGroupClick(event, joinButton) {
    if (!joinButton || !joinButton.classList.contains('join-group-btn')) {
        isProcessingClick = false; return;
    }
    const groupId = parseInt(joinButton.dataset.groupId, 10);
    if (isNaN(groupId)) { isProcessingClick = false; return; }

    const buttonContainer = joinButton.closest('.card-footer');
    const cardWrapper = joinButton.closest('.group-card-wrapper');
    if (!cardWrapper || !myGroupContainerEl) {
        console.error("Cannot join group: Missing card wrapper or target container.");
        isProcessingClick = false; return;
    }

    setLoading(joinButton, true, 'Joining...');
    const url = `${challengeConfig.urls.joinLeaveBase}/${groupId}/join`;

    try {
        await apiFetch(url, { method: 'POST' }, challengeConfig.csrfToken);

        // --- FIX: Update classes BEFORE moving ---
        cardWrapper.classList.remove(...OTHER_GROUP_COL_CLASSES);
        cardWrapper.classList.add(...JOINED_GROUP_COL_CLASSES);
        // --- End Fix ---

        // Move Card
        myGroupContainerEl.innerHTML = ''; // Clear placeholder/old
        const heading = document.createElement('h4');
        heading.className = 'text-warning mb-3'; heading.textContent = 'Your Group';
        myGroupContainerEl.appendChild(heading);
        myGroupContainerEl.appendChild(cardWrapper);

        // Update State
        updateUserJoinedGroupState(groupId);
        const groupIndex = challengeConfig.initialGroups.findIndex(g => g.id === groupId);
        if (groupIndex !== -1) {
            challengeConfig.initialGroups[groupIndex].member_count = Math.min(
                (challengeConfig.initialGroups[groupIndex].member_count || 0) + 1,
                challengeConfig.numPlayersPerGroup
            );
        }

        // Refresh UI
        updateUIAfterMembershipChange(challengeConfig, myGroupContainerEl, otherGroupsContainerEl);

    } catch (error) {
        console.error("Failed to join group:", error);
        showError(buttonContainer || statusDiv, `Error joining: ${error.message}`);
        setLoading(joinButton, false); // Reset button only on error
        // --- FIX: Revert classes if move failed ---
        cardWrapper.classList.remove(...JOINED_GROUP_COL_CLASSES);
        cardWrapper.classList.add(...OTHER_GROUP_COL_CLASSES);
        // --- End Fix ---
    } finally { isProcessingClick = false; }
}

async function handleLeaveGroupClick(event, leaveButton) {
    if (!leaveButton || !leaveButton.classList.contains('leave-group-btn')) {
        isProcessingClick = false; return;
    }
    const groupId = parseInt(leaveButton.dataset.groupId, 10);
    if (isNaN(groupId)) { isProcessingClick = false; return; }

    const buttonContainer = leaveButton.closest('.card-footer');
    const cardWrapper = leaveButton.closest('.group-card-wrapper');
    if (!cardWrapper || !otherGroupsContainerEl || !myGroupContainerEl) {
         console.error("Cannot leave group: Missing card wrapper or target container.");
         isProcessingClick = false; return;
    }

    setLoading(leaveButton, true, 'Leaving...');
    const url = `${challengeConfig.urls.joinLeaveBase}/${groupId}/leave`;

    try {
        await apiFetch(url, { method: 'POST' }, challengeConfig.csrfToken);

        // --- FIX: Update classes BEFORE moving ---
        cardWrapper.classList.remove(...JOINED_GROUP_COL_CLASSES);
        cardWrapper.classList.add(...OTHER_GROUP_COL_CLASSES);
        // --- End Fix ---

        // Move Card
        otherGroupsContainerEl.appendChild(cardWrapper);
        myGroupContainerEl.innerHTML = ''; // Clear "Your Group" section

        // Update State
        updateUserJoinedGroupState(null);
        const groupIndex = challengeConfig.initialGroups.findIndex(g => g.id === groupId);
        if (groupIndex !== -1) {
            challengeConfig.initialGroups[groupIndex].member_count = Math.max(0, (challengeConfig.initialGroups[groupIndex].member_count || 0) - 1);
        }

        // Refresh UI
        updateUIAfterMembershipChange(challengeConfig, myGroupContainerEl, otherGroupsContainerEl);

    } catch (error) {
        console.error("Failed to leave group:", error);
        showError(buttonContainer || statusDiv, `Error leaving: ${error.message}`);
        setLoading(leaveButton, false); // Reset button only on error
         // --- FIX: Revert classes if move failed ---
        cardWrapper.classList.remove(...OTHER_GROUP_COL_CLASSES);
        cardWrapper.classList.add(...JOINED_GROUP_COL_CLASSES);
        // --- End Fix ---
    } finally { isProcessingClick = false; }
}

// --- handleProgressChange, handleSavePlayersClick, renderLocalChallengeView, handleClearPenaltyClick ---
// remain the same as the previous corrected version (no changes needed here for layout)
async function handleProgressChange(event) {
    if (!event.target.matches('.progress-checkbox')) return;
    const checkbox = event.target;
    if (checkbox.disabled) { return; }

    const itemData = checkbox.dataset;
    const isComplete = checkbox.checked;
    const groupId = itemData.groupId;
    const itemDiv = checkbox.closest('.progress-item');

    if (!groupId || !itemData.itemType || !itemData.itemKey || typeof itemData.itemIndex === 'undefined') {
        console.error("Progress checkbox missing required data attributes:", itemData);
        showError(statusDiv || document.body, "Cannot save progress: Checkbox data missing.", 'warning');
        checkbox.checked = !isComplete; return;
    }

    let progressKey;
    try {
        const type = itemData.itemType; const key = itemData.itemKey;
        const index = parseInt(itemData.itemIndex, 10);
        const segmentIndex = itemData.segmentIndex ? parseInt(itemData.segmentIndex, 10) : null;
        if (isNaN(index) || (segmentIndex !== null && isNaN(segmentIndex))) throw new Error("Invalid index.");
        if (type === 'b2b' && segmentIndex !== null) progressKey = `${type}_${segmentIndex}_${key}_${index}`;
        else if (type === 'normal') progressKey = `${type}_${key}_${index}`;
        else throw new Error("Unknown progress item type.");
    } catch (e) {
        console.error("Error constructing progress key:", e);
        showError(statusDiv || document.body, "Cannot save progress: Invalid item data.", 'warning');
        checkbox.checked = !isComplete; return;
    }

    checkbox.disabled = true;
    if(itemDiv) itemDiv.style.opacity = '0.6';

    try {
        if (challengeConfig.isLocal) {
            challengeConfig.progressData = challengeConfig.progressData || {};
            if (isComplete) challengeConfig.progressData[progressKey] = true;
            else delete challengeConfig.progressData[progressKey];
            const success = updateLocalChallengeProgress(challengeConfig.id, progressKey, isComplete);
            if (!success) throw new Error("Failed to save progress locally.");
            if (itemDiv) itemDiv.classList.toggle('completed', isComplete);
            const progressBarContainer = document.getElementById('localProgressBarContainer');
            if (progressBarContainer) renderOrUpdateProgressBar(progressBarContainer, challengeConfig.coreChallengeStructure, challengeConfig.progressData);
        } else {
            const url = `${challengeConfig.urls.updateProgressBase}/${groupId}/progress`;
            const payload = {
                item_type: itemData.itemType, item_key: itemData.itemKey,
                item_index: parseInt(itemData.itemIndex, 10), is_complete: isComplete,
            };
            if (itemData.segmentIndex) payload.segment_index = parseInt(itemData.segmentIndex, 10);
            await apiFetch(url, { method: 'POST', body: payload }, challengeConfig.csrfToken);
            if (itemDiv) itemDiv.classList.toggle('completed', isComplete);
        }
    } catch (error) {
        console.error("Failed to update progress:", error);
        checkbox.checked = !isComplete;
        showError(statusDiv, `Error saving progress: ${error.message}`, 'danger');
        if (itemDiv) {
            itemDiv.classList.add('error-flash');
            setTimeout(() => itemDiv.classList.remove('error-flash'), 1500);
        }
        if (challengeConfig.isLocal && challengeConfig.progressData) {
            if (isComplete) delete challengeConfig.progressData[progressKey];
            else challengeConfig.progressData[progressKey] = true;
        }
    } finally {
        const canInteract = challengeConfig.isLocal || (challengeConfig.userJoinedGroupId === parseInt(groupId, 10));
        checkbox.disabled = !canInteract;
        if(itemDiv) itemDiv.style.opacity = '1';
    }
}
async function handleSavePlayersClick(event, saveButton) {
    if (!saveButton || !saveButton.classList.contains('save-player-names-btn') || !challengeConfig.isMultigroup) {
        isProcessingClick = false; return;
    }
    const groupId = parseInt(saveButton.dataset.groupId, 10);
    if (isNaN(groupId)) { isProcessingClick = false; return; }

    const playerNamesSection = saveButton.closest('.player-names-section');
    const errorContainer = playerNamesSection?.querySelector('.player-name-error');
    const inputsContainer = playerNamesSection?.querySelector('.player-name-inputs');
    if (!playerNamesSection || !inputsContainer || !errorContainer) {
        showError(statusDiv || document.body, "UI Error: Cannot save player names.", "danger");
        isProcessingClick = false; return;
    }

    showError(errorContainer, null);
    const nameInputs = inputsContainer.querySelectorAll('.player-name-input');
    const playerNames = Array.from(nameInputs)
        .map(input => input.value.trim())
        .filter(name => name.length > 0 && name.length <= 50);

    const maxAllowed = challengeConfig.numPlayersPerGroup || 1;
    if (playerNames.length > maxAllowed) {
        showError(errorContainer, `You can only enter up to ${maxAllowed} player names.`, 'warning');
        isProcessingClick = false; return;
    }

    setLoading(saveButton, true, 'Saving...');
    try {
        if (!challengeConfig.urls.savePlayersBase) throw new Error("API endpoint for saving player names is not configured.");
        const url = `${challengeConfig.urls.savePlayersBase}/${groupId}/players`;
        const data = await apiFetch(url, { method: 'POST', body: { player_names: playerNames } }, challengeConfig.csrfToken);

        if (data.status === 'success') {
            showError(errorContainer, "Names saved!", 'success');
            setTimeout(() => showError(errorContainer, null), 2500);
            const groupIndex = challengeConfig.initialGroups.findIndex(g => g.id === groupId);
            if (groupIndex !== -1) {
                challengeConfig.initialGroups[groupIndex].player_names = playerNames;
                if (typeof updatePenaltyConfig === 'function') updatePenaltyConfig(challengeConfig);
            } else console.warn("Could not find group in local config state to update player names.");
        } else throw new Error(data.error || "Unknown error saving names.");
    } catch (error) {
        console.error("Failed to save player names:", error);
        showError(errorContainer, `Error: ${error.message}`, 'danger');
    } finally { setLoading(saveButton, false); isProcessingClick = false; }
}
function renderLocalChallengeView(challenge) {
    const displayContainer = document.getElementById('localChallengeDisplay');
    if (!displayContainer) { showError(statusDiv || document.body, "UI Error: Cannot display local challenge.", "danger"); return; }
    displayContainer.innerHTML = '';
    try {
        const challengeData = challenge.challengeData || {}; const progressData = challenge.progressData || {};
        const headerCard = document.createElement('div'); headerCard.className = 'mb-4 card bg-dark text-light shadow-sm';
        headerCard.innerHTML = `<div class="card-header"><h2 class="h3 mb-0">${escapeHtml(challenge.name || 'Unnamed Local Challenge')}</h2></div><div class="card-body"><p class="text-muted small mb-0">Saved: ${challenge.createdAt ? new Date(challenge.createdAt).toLocaleString() : 'N/A'}<br><span class="d-inline-block mt-1">ID: <code class="user-select-all" style="font-size: 0.9em;">${escapeHtml(challenge.localId)}</code> (Local)</span></p></div>`;
        displayContainer.appendChild(headerCard);
        const detailsCard = document.createElement('div'); detailsCard.className = 'mb-4 card bg-dark text-light shadow-sm';
        detailsCard.innerHTML = '<div class="card-header"><h3 class="mb-0 h5">Challenge Rules</h3></div>'; const detailsBody = document.createElement('div'); detailsBody.className = 'card-body challenge-rules-list'; detailsCard.appendChild(detailsBody); displayContainer.appendChild(detailsCard);
        renderStaticChallengeDetailsJS(detailsBody, challengeData);
        const progressBarContainer = document.createElement('div'); progressBarContainer.id = 'localProgressBarContainer'; progressBarContainer.className = 'mb-4'; displayContainer.appendChild(progressBarContainer);
        renderOrUpdateProgressBar(progressBarContainer, challengeData, progressData);
        const progressCard = document.createElement('div'); progressCard.className = 'mb-4 card bg-dark text-light shadow-sm';
        progressCard.innerHTML = '<div class="card-header"><h3 class="mb-0 h5">Your Progress</h3></div>'; const progressBody = document.createElement('div'); progressBody.className = 'card-body'; progressBody.id = `progress-items-${challenge.localId}`; progressCard.appendChild(progressBody); displayContainer.appendChild(progressCard);
        renderProgressItems(progressBody, challengeData, challenge.localId, progressData, true);
    } catch (renderError) { console.error("Error during dynamic render of local challenge:", renderError); showError(displayContainer, "Error displaying challenge details.", "danger"); }
}
async function handleClearPenaltyClick(event, clearButton) {
    if (!clearButton || !clearButton.classList.contains('clear-penalty-btn')) { isProcessingClick = false; return; }
    const groupId = parseInt(clearButton.dataset.groupId, 10);
    if (isNaN(groupId)) { isProcessingClick = false; return; }
    const penaltyDisplayDiv = clearButton.closest('.active-penalty-display');
    if (!challengeConfig.urls.setPenaltyUrlBase || !challengeConfig.csrfToken) {
        showError(penaltyDisplayDiv || statusDiv, "Cannot clear penalty: Configuration missing.", "danger");
        isProcessingClick = false; return;
    }
    setLoading(clearButton, true, 'Clearing...');
    showError(penaltyDisplayDiv || statusDiv, null);
    const url = `${challengeConfig.urls.setPenaltyUrlBase}/${groupId}/penalty`;
    const payload = { penalty_text: "" };
    try {
        const data = await apiFetch(url, { method: 'POST', body: payload }, challengeConfig.csrfToken);
        if (data.status === 'success') {
            updatePenaltyDisplay(groupId, '');
            const groupIndex = challengeConfig.initialGroups.findIndex(g => g.id === groupId);
            if (groupIndex !== -1) challengeConfig.initialGroups[groupIndex].active_penalty_text = '';
        } else throw new Error(data.error || "Unknown error from server.");
    } catch (error) {
        console.error("Failed to clear penalty:", error);
        showError(penaltyDisplayDiv || statusDiv, `Error: ${error.message}`, 'danger');
        setLoading(clearButton, false);
    } finally { isProcessingClick = false; }
}


// --- Page Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // console.log("challenge_view.js: Initializing..."); // Minimal log

    // Assign and check essential elements
    const dataEl = document.getElementById('challengeData');
    const pageContainer = document.getElementById('challengeViewContainer');
    statusDiv = document.getElementById('pageStatusDisplay');

    if (!dataEl || !pageContainer) {
        console.error("CRITICAL: #challengeData or #challengeViewContainer element missing!");
        showError(statusDiv || document.body, "Initialization Error: Core page structure missing.", "danger");
        return;
    }

    // Read configuration
    if (!initializeConfigFromDOM()) { return; }
    // console.log(`Challenge Initialized: ${challengeConfig.isLocal ? "Local" : "DB"}, ID: ${challengeConfig.id}`); // Minimal log

    // --- Branch Logic: Local vs. Database Challenge ---
    if (challengeConfig.isLocal) {
        // --- LOCAL CHALLENGE ---
        const localData = getLocalChallengeById(challengeConfig.id);
        if (localData) {
            challengeConfig.coreChallengeStructure = localData.challengeData || {};
            challengeConfig.progressData = localData.progressData || {};
            renderLocalChallengeView(localData);
            const displayContainer = document.getElementById('localChallengeDisplay');
            if (displayContainer) displayContainer.addEventListener('change', handleProgressChange);
            else console.error("Could not attach local progress listener.");
        } else {
            const errorMsg = `Error: Could not load local challenge data (ID: ${escapeHtml(challengeConfig.id)}). It might have been deleted.`;
            showError(document.getElementById('localChallengeDisplay') || statusDiv, errorMsg, 'danger');
        }
    } else {
        // --- DATABASE CHALLENGE ---
        // Assign group containers only if DB challenge
        myGroupContainerEl = document.getElementById('myGroupContainer');
        otherGroupsContainerEl = document.getElementById('otherGroupsContainer');
        if (!myGroupContainerEl || !otherGroupsContainerEl) {
             console.error("Essential DB challenge elements missing (#myGroupContainer or #otherGroupsContainer)!");
             showError(statusDiv || document.body, "Initialization Error: Page structure for shared challenge is incomplete.", "danger");
             return;
        }

        const addGroupForm = document.getElementById('addGroupForm');

        // Initial UI setup
        try {
            updateUIAfterMembershipChange(challengeConfig, myGroupContainerEl, otherGroupsContainerEl);
            updateGroupCountDisplay(challengeConfig.initialGroupCount, challengeConfig.maxGroups);
        } catch (uiError) {
            console.error("Error during initial UI update:", uiError);
            showError(statusDiv, "Error initializing UI state.", "danger");
        }

        // Attach Create Group Form Listener
        if (challengeConfig.isMultigroup && addGroupForm) {
            addGroupForm.addEventListener('submit', handleCreateGroupSubmit);
        }

        // --- Attach Delegated Event Listeners to the Main Container ---
        pageContainer.addEventListener('click', (event) => {
            if (isProcessingClick) { event.preventDefault(); return; }
            const closestButton = event.target.closest('button[data-group-id]');
            if (!closestButton) return;

            const buttonClasses = closestButton.classList;
            isProcessingClick = true;
            try {
                if (challengeConfig.isMultigroup && buttonClasses.contains('join-group-btn')) handleJoinGroupClick(event, closestButton);
                else if (challengeConfig.isMultigroup && buttonClasses.contains('leave-group-btn')) handleLeaveGroupClick(event, closestButton);
                else if (challengeConfig.isMultigroup && buttonClasses.contains('save-player-names-btn')) handleSavePlayersClick(event, closestButton);
                else if (buttonClasses.contains('clear-penalty-btn')) handleClearPenaltyClick(event, closestButton);
                else isProcessingClick = false; // Reset if no action matched
            } catch (handlerError) {
                console.error("Error occurred inside click event handler:", handlerError);
                showError(statusDiv, "An unexpected error occurred processing your click.", "danger");
                isProcessingClick = false; // Reset on error
            }
        });

        // Attach change listener for progress checkboxes
        pageContainer.addEventListener('change', handleProgressChange);
    }
}); // End DOMContentLoaded

