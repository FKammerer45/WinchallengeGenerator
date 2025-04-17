// static/js/challenge/challenge_view.js
// Main orchestrator for the unified challenge view page (challenge.html).
// Handles state, user interactions, API calls, coordinates UI updates, and timer.

import { apiFetch } from '../utils/api.js';
import { setLoading, showError, escapeHtml } from '../utils/helpers.js';
import {
    updateGroupCountDisplay, renderProgressItems, addGroupToDOM,
    updateUIAfterMembershipChange, renderOrUpdateProgressBar,
    renderStaticChallengeDetailsJS, updatePenaltyDisplay, renderPlayerNameInputs
} from './ui.js';
import { getLocalChallengeById, updateLocalChallengeProgress } from '../utils/local_storage.js';
import { updatePenaltyConfig } from './penalty.js';
// Import timer initializer
import { initializeTimer } from './timer.js';

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

// --- Constants ---
const JOINED_GROUP_COL_CLASSES = ['col-md-8', 'col-lg-6', 'mx-auto', 'mb-4'];
const OTHER_GROUP_COL_CLASSES = ['col-lg-4', 'col-md-6', 'mb-4'];
const TIMER_ID = 'main';

// --- Helper Functions ---

// Helper: join the given group and then refresh UI
async function autoJoinGroup(groupId) {
    if (!challengeConfig.urls.joinLeaveBase || !groupId) return;

    try {
        await apiFetch(
            `${challengeConfig.urls.joinLeaveBase}/${groupId}/join`,
            { method: 'POST' },
            challengeConfig.csrfToken
        );

        // update local state
        updateUserJoinedGroupState(groupId);
        const grp = challengeConfig.initialGroups.find(g => g.id === groupId);
        if (grp) grp.member_count = Math.min(
            (grp.member_count || 0) + 1,
            challengeConfig.numPlayersPerGroup
        );

        // refresh UI (checkbox enable, buttons, etc.)
        updateUIAfterMembershipChange(
            challengeConfig, myGroupContainerEl, otherGroupsContainerEl
        );

        console.log(`Auto‑joined group ${groupId} successfully.`);
    } catch (err) {
        console.error('Auto‑join failed:', err);
        showError(
            statusDiv,
            `Could not join the group automatically – ${err.message}`,
            'danger'
        );
    }
}
/**
 * Reads configuration data from the hidden #challengeData div in the HTML
 * and populates the challengeConfig object.
 * @returns {boolean} True if initialization is successful, false otherwise.
 */
function initializeConfigFromDOM() {
    const dataEl = document.getElementById('challengeData');
    statusDiv = document.getElementById('pageStatusDisplay'); // Assign statusDiv early

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
            if (!challengeConfig.urls.addGroup) console.warn("Add Group URL missing.");
            if (!challengeConfig.urls.updateProgressBase) console.warn("Update Progress URL base missing.");
            if (!challengeConfig.urls.joinLeaveBase) console.warn("Join/Leave URL base missing.");
            if (!challengeConfig.urls.savePlayersBase) console.warn("Save Players URL base missing.");
        }
        return true;
    } catch (e) {
        console.error("challenge_view.js: Failed to parse initial data:", e);
        showError(statusDiv || document.body, `Initialization Error: ${e.message}`, 'danger');
        return false;
    }
}

/**
 * Updates the userJoinedGroupId in the module state and the hidden DOM element.
 * @param {number | null} newGroupId - The new group ID or null if leaving.
 */
function updateUserJoinedGroupState(newGroupId) {
    challengeConfig.userJoinedGroupId = newGroupId;
    const dataEl = document.getElementById('challengeData');
    if (dataEl) {
        dataEl.dataset.userJoinedGroupId = JSON.stringify(newGroupId);
    }
    // Notify penalty module about potential player list changes
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
            if (!challengeConfig.isMultigroup) {
                const newId = data.group.id;

                // move card under “Your Group” section
                const newCard = otherGroupsContainerEl
                    .querySelector(`.group-card-wrapper[data-group-id="${newId}"]`);
                if (newCard) {
                    myGroupContainerEl.innerHTML = '';
                    const h = document.createElement('h4');
                    h.className = 'text-warning mb-3'; h.textContent = 'Your Group';
                    myGroupContainerEl.appendChild(h);
                    myGroupContainerEl.appendChild(newCard);
                }

                // join it on the backend
                await autoJoinGroup(newId);
            }
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

        // Update classes BEFORE moving
        cardWrapper.classList.remove(...OTHER_GROUP_COL_CLASSES);
        cardWrapper.classList.add(...JOINED_GROUP_COL_CLASSES);

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
        // Revert classes if move failed
        if (cardWrapper) {
            cardWrapper.classList.remove(...JOINED_GROUP_COL_CLASSES);
            cardWrapper.classList.add(...OTHER_GROUP_COL_CLASSES);
        }
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

        // Update classes BEFORE moving
        cardWrapper.classList.remove(...JOINED_GROUP_COL_CLASSES);
        cardWrapper.classList.add(...OTHER_GROUP_COL_CLASSES);

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
        // Revert classes if move failed
        if (cardWrapper) {
            cardWrapper.classList.remove(...OTHER_GROUP_COL_CLASSES);
            cardWrapper.classList.add(...JOINED_GROUP_COL_CLASSES);
        }
    } finally { isProcessingClick = false; }
}

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
    if (itemDiv) itemDiv.style.opacity = '0.6';

    try {
        let currentGroupProgress = {};
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
            const groupIndex = challengeConfig.initialGroups.findIndex(g => g.id === parseInt(groupId, 10));
            if (groupIndex !== -1) {
                // Update the progress state in the config object first
                challengeConfig.initialGroups[groupIndex].progress = challengeConfig.initialGroups[groupIndex].progress || {};
                if (isComplete) {
                    challengeConfig.initialGroups[groupIndex].progress[progressKey] = true;
                } else {
                    delete challengeConfig.initialGroups[groupIndex].progress[progressKey];
                }
                currentGroupProgress = challengeConfig.initialGroups[groupIndex].progress;

                // Now find the container and update the bar
                const groupProgressBarContainer = document.getElementById(`progressBarContainer-${groupId}`);
                if (groupProgressBarContainer && challengeConfig.coreChallengeStructure) {
                    renderOrUpdateProgressBar(groupProgressBarContainer, challengeConfig.coreChallengeStructure, currentGroupProgress);
                }
            }
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
        if (itemDiv) itemDiv.style.opacity = '1';
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

/**
 * Renders the UI specifically for a local challenge, mimicking the shared challenge layout.
 * @param {object} challenge - The local challenge data object from localStorage.
 */
function renderLocalChallengeView(challenge) {
    const displayContainer = document.getElementById('localChallengeDisplay');
    if (!displayContainer) {
        console.error("#localChallengeDisplay container is missing!");
        showError(statusDiv || document.body, "UI Error: Cannot display local challenge.", "danger");
        return;
    }

    displayContainer.innerHTML = ''; // Clear loading/previous content

    try {
        const challengeData = challenge.challengeData || {};
        const progressData = challenge.progressData || {};

        // --- Create Info/Rules Row ---
        const infoRulesRow = document.createElement('div');
        infoRulesRow.className = 'row mb-4';

        // --- Create Info Card ---
        const infoCol = document.createElement('div');
        infoCol.className = 'col-lg-5 mb-4 mb-lg-0';
        const infoCard = document.createElement('div');
        infoCard.className = 'card h-100 shadow-md info-card glass-effect'; // Use same class as DB view
        infoCard.innerHTML = `
            <div class="card-header"><h3 class="h5 mb-0">Challenge Info</h3></div>
            <div class="card-body d-flex flex-column">
                <h4 class="card-title text-secondary-accent mb-3">${escapeHtml(challenge.name || 'Unnamed Local Challenge')}</h4>
                <p class="card-text mb-2">
                    <strong class="text-muted" style="min-width: 80px; display: inline-block;">Mode:</strong>
                    Local Challenge
                </p>
                <p class="card-text mb-auto">
                     <strong class="text-muted" style="min-width: 80px; display: inline-block;">Saved:</strong>
                     ${challenge.createdAt ? new Date(challenge.createdAt).toLocaleString() : 'N/A'}
                </p>
                <div class="mt-3 pt-3 border-top border-secondary">
                    <p class="card-text small mb-0">
                        <strong class="text-muted">ID:</strong>
                        <code class="user-select-all bg-secondary p-1 rounded" style="font-size: 0.9em;">${escapeHtml(challenge.localId)}</code> (Local)
                    </p>
                </div>
            </div>`;
        infoCol.appendChild(infoCard);
        infoRulesRow.appendChild(infoCol);

        // --- Create Rules Card ---
        const rulesCol = document.createElement('div');
        rulesCol.className = 'col-lg-7';
        const rulesCard = document.createElement('div');
        rulesCard.className = 'card h-100 shadow-md rules-card glass-effect'; // Use same class as DB view
        const rulesHeader = document.createElement('div');
        rulesHeader.className = 'card-header';
        rulesHeader.innerHTML = '<h3 class="h5 mb-0">Challenge Rules</h3>';
        const rulesBody = document.createElement('div');
        rulesBody.className = 'card-body challenge-rules-body'; // Use same class as DB view
        rulesCard.appendChild(rulesHeader);
        rulesCard.appendChild(rulesBody);
        renderStaticChallengeDetailsJS(rulesBody, challengeData); // Populate rules using UI helper
        rulesCol.appendChild(rulesCard);
        infoRulesRow.appendChild(rulesCol);

        // Append Info/Rules Row to the main container
        displayContainer.appendChild(infoRulesRow);
        if (challenge.penalty_info) {
            const penaltyWrapper = document.createElement('div');
            penaltyWrapper.id = 'penaltySectionContainer-local';
            penaltyWrapper.className = 'mb-5 card shadow-sm glass-effect';

            penaltyWrapper.innerHTML = `
              <div class="card-header d-flex justify-content-between align-items-center">
                <h3 class="h5 mb-0">Penalties</h3>
                <button class="btn btn-sm btn-outline-secondary" type="button" data-toggle="collapse"
                        data-target="#penaltyBody-local" aria-expanded="true" aria-controls="penaltyBody-local">
                  <i class="bi bi-chevron-expand"></i>
                </button>
              </div>
              <div id="penaltyBody-local" class="card-body collapse show">
        <!-- wrapper for the *participant* wheel -->
        <div id="playerWheelContainer-local" style="display:none" class="text-center mb-3">
        <canvas id="playerWheelCanvas-local" width="220" height="220"></canvas>
        <h6 id="playerWheelTitle-local" class="text-center mt-2"></h6>
        </div>

        <!-- wrapper for the *penalty* wheel -->
        <div id="penaltyWheelContainer-local" style="display:none" class="text-center">
            <canvas id="penaltyWheelCanvas-local" width="300" height="300"></canvas>
         </div>
                <div id="penaltyResult-local" class="mt-3" style="display:none"></div>
                <button class="btn btn-warning lostGameBtn-local" data-penalty-tab-id="${challenge.penalty_info.tab_id}">
                  Lost Game – Spin!
                </button>
              </div>`;
            displayContainer.appendChild(penaltyWrapper);
        }
        // --- Render Progress Bar (wrapped in a simple card) ---
        const progressWrapperCard = document.createElement('div');
        // Use standard card styling, maybe slightly less prominent than info/rules
        progressWrapperCard.className = 'card shadow-md glass-effect mb-4';
        const progressBarContainer = document.createElement('div');
        progressBarContainer.id = 'localProgressBarContainer'; // Specific ID for local bar
        progressBarContainer.className = 'card-body p-2'; // Add padding inside card body
        progressWrapperCard.appendChild(progressBarContainer);
        displayContainer.appendChild(progressWrapperCard);
        renderOrUpdateProgressBar(progressBarContainer, challengeData, progressData); // Populate bar

        // --- Render Progress Items Card ---
        const progressItemsCard = document.createElement('div');
        progressItemsCard.className = 'mb-4 card group-card glass-effect shadow-md'; // Standard card style
        const progressItemsHeader = document.createElement('div');
        progressItemsHeader.className = 'card-header';
        progressItemsHeader.innerHTML = '<h3 class="mb-0 h5">Your Progress</h3>';
        const progressItemsBody = document.createElement('div');
        progressItemsBody.className = 'card-body';
        progressItemsBody.id = `progress-items-${challenge.localId}`; // Unique ID for items container
        progressItemsCard.appendChild(progressItemsHeader);
        progressItemsCard.appendChild(progressItemsBody);
        displayContainer.appendChild(progressItemsCard);
        // Render checkboxes, passing true for isInteractive since local is always interactive
        renderProgressItems(progressItemsBody, challengeData, challenge.localId, progressData, true);

    } catch (renderError) {
        console.error("Error during dynamic render of local challenge:", renderError);
        showError(displayContainer, "Error displaying challenge details.", "danger");
    }
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

    // Initialize Timer
    try {
        initializeTimer(TIMER_ID); // Initialize timer using ID 'main'
    } catch (timerError) {
        console.error("Failed to initialize timer:", timerError);
        showError(statusDiv, "Timer could not be initialized.", "warning");
    }

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
            if (!challengeConfig.isMultigroup &&
                challengeConfig.initialGroupCount === 1 &&
                challengeConfig.userJoinedGroupId === null) {

                const firstId = challengeConfig.initialGroups[0]?.id;
                if (firstId) {
                    // visually move card first (so UI doesn’t “jump” later)
                    const card = otherGroupsContainerEl
                        .querySelector(`.group-card-wrapper[data-group-id="${firstId}"]`);
                    if (card) {
                        myGroupContainerEl.innerHTML = '';
                        const h = document.createElement('h4');
                        h.className = 'text-warning mb-3'; h.textContent = 'Your Group';
                        myGroupContainerEl.appendChild(h);
                        myGroupContainerEl.appendChild(card);
                    }
                    // now do the real join on the server
                    autoJoinGroup(firstId);
                }
            }
            updateGroupCountDisplay(challengeConfig.initialGroupCount, challengeConfig.maxGroups);
        } catch (uiError) {
            console.error("Error during initial UI update:", uiError);
            showError(statusDiv, "Error initializing UI state.", "danger");
        }

        // Attach Create Group Form Listener
        if (addGroupForm) {
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
                if (buttonClasses.contains('join-group-btn')) handleJoinGroupClick(event, closestButton);
                else if (buttonClasses.contains('leave-group-btn')) handleLeaveGroupClick(event, closestButton);
                else if (buttonClasses.contains('save-player-names-btn')) handleSavePlayersClick(event, closestButton);
                else if (buttonClasses.contains('clear-penalty-btn')) handleClearPenaltyClick(event, closestButton);
                else isProcessingClick = false;
            } catch (handlerError) {
                console.error("Error occurred inside click event handler:", handlerError);
                showError(statusDiv, "An unexpected error occurred processing your click.", "danger");
                isProcessingClick = false;
            }
        });

        // Attach change listener for progress checkboxes
        pageContainer.addEventListener('change', handleProgressChange);
    }
}); // End DOMContentLoaded

