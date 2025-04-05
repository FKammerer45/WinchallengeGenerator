// static/js/challenge/challenge_view.js
// Main orchestrator for the shared challenge view page

// Import API utility and UI/Helper functions
import { apiFetch } from '../utils/api.js';
import { setLoading, showError, escapeHtml } from '../utils/helpers.js';
import { updateGroupCountDisplay, renderProgressItems, addGroupToDOM, updateUIAfterMembershipChange } from './challenge_ui.js';
import { getLocalChallengeById, updateLocalChallengeProgress } from './local_challenge_storage.js'; // Import local storage utils

// --- Module-level state ---
// Stores data read from the DOM and current user membership status
let challengeConfig = {
    id: null, // Can be public_id or localId
    isLocal: false,
    isMultigroup: false,
    maxGroups: 1,
    initialGroupCount: 0, // Only relevant for DB multigroup
    userJoinedGroupId: null, // Only relevant for DB multigroup
    coreChallengeStructure: null, // Loaded from data attribute (DB) or localStorage (Local)
    progressData: {}, // Holds progress for local challenges
    csrfToken: null,
    urls: {
        addGroup: null, // Only for DB multigroup
        updateProgressBase: null, // Only for DB
        joinLeaveBase: null // Only for DB multigroup
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
    // groupId might be DB group ID or local challenge ID, depending on context
    const groupId = itemData.groupId;
    const itemDiv = checkbox.closest('.progress-item');

    if (!groupId || !itemData.itemType || !itemData.itemKey || typeof itemData.itemIndex === 'undefined') {
        showError(itemDiv, "Data missing!"); checkbox.checked = !isComplete; return;
    }

    // Construct the flat progress key
    let progressKey;
    if (itemData.itemType === 'b2b' && itemData.segmentIndex) {
        progressKey = `${itemData.itemType}_${itemData.segmentIndex}_${itemData.itemKey}_${itemData.itemIndex}`;
    } else if (itemData.itemType === 'normal') {
        progressKey = `${itemData.itemType}_${itemData.itemKey}_${itemData.itemIndex}`;
    } else { showError(itemDiv, "Unknown type!"); checkbox.checked = !isComplete; return; }

    console.log(`Progress Change: ID=${groupId}, Key=${progressKey}, Complete=${isComplete}, IsLocal=${challengeConfig.isLocal}`);

    // Optimistic UI update
    if(itemDiv) itemDiv.classList.toggle('completed', isComplete);
    checkbox.disabled = true;

    try {
        let success = false;
        if (challengeConfig.isLocal) {
            // --- Save Progress Locally ---
            console.log("Saving progress to localStorage...");
            // Update the progressData within the config object first
            challengeConfig.progressData = challengeConfig.progressData || {};
             if (isComplete) {
                 challengeConfig.progressData[progressKey] = true;
             } else {
                 delete challengeConfig.progressData[progressKey];
             }
            // Use the specific update function from storage utils
            success = updateLocalChallengeProgress(challengeConfig.id, progressKey, isComplete);
            if (!success) throw new Error("Failed to save progress to local storage.");
            console.log("Local progress update successful.");

        } else {
            // --- Save Progress via API (DB Challenge) ---
            const url = `${challengeConfig.urls.updateProgressBase}/${groupId}/progress`;
            const payload = {
                item_type: itemData.itemType, item_key: itemData.itemKey,
                item_index: parseInt(itemData.itemIndex, 10), is_complete: isComplete,
            };
            if (itemData.segmentIndex) payload.segment_index = parseInt(itemData.segmentIndex, 10);

            console.log("Sending progress update to API:", url);
            const responseData = await apiFetch(url, { method: 'POST', body: payload }, challengeConfig.csrfToken);
            console.log("DB Progress update successful:", responseData.message);
            success = true;
        }
    } catch (error) {
        console.error("Failed to update progress:", error);
        if(itemDiv) {
            itemDiv.classList.toggle('completed', !isComplete); // Revert visual
            showError(itemDiv, `Save failed!`);
            setTimeout(() => showError(itemDiv, null), 3000);
        } else { alert(`Error saving progress: ${error.message}`); }
        checkbox.checked = !isComplete; // Revert state
    } finally {
        // Re-enable checkbox only if user is allowed to interact
        const canInteract = challengeConfig.isLocal || (challengeConfig.userJoinedGroupId === parseInt(groupId, 10));
        checkbox.disabled = !canInteract;
    }
}

/**
 * Renders the view for a local challenge.
 */
function renderLocalChallengeView(challenge) {
    // --- ADD LOG ---
    console.log("renderLocalChallengeView: Starting rendering for", challenge?.localId);
    const displayContainer = document.getElementById('localChallengeDisplay');
    if (!displayContainer) {
         console.error("renderLocalChallengeView: #localChallengeDisplay not found!");
         return; // Cannot render
    }

    displayContainer.innerHTML = ''; // Clear loading message

    // Render Header
    const header = document.createElement('div');
    header.className = 'mb-4';
    header.innerHTML = `
        <h2>${escapeHtml(challenge.name || 'Unnamed Local Challenge')}</h2>
        <p class="text-muted">
            Saved Locally: ${challenge.createdAt ? new Date(challenge.createdAt).toLocaleString() : 'Unknown Date'}<br>
            <small>ID: ${escapeHtml(challenge.localId)}</small>
        </p>
        <hr>
    `;
    displayContainer.appendChild(header);

    // --- Render Static Details (Optional Enhancement) ---
    // You could add a simple display of rules here if desired
    // const detailsDiv = document.createElement('div');
    // detailsDiv.innerHTML = '<h3>Challenge Rules</h3>... build HTML from challenge.challengeData ...';
    // displayContainer.appendChild(detailsDiv);

    // Render Progress Items Container
    const progressContainer = document.createElement('div');
    progressContainer.id = `progress-local-${challenge.localId}`;
    progressContainer.className = 'local-challenge-progress';
    displayContainer.appendChild(progressContainer);

    // Call the UI function to render items
    try {
        console.log("renderLocalChallengeView: Calling renderProgressItems...");
        renderProgressItems(
            progressContainer,
            challenge.challengeData || {},
            challenge.localId, // Use localId as the 'group ID' for data attributes
            challenge.progressData || {},
            true // Always enabled for local challenges
        );
         console.log("renderLocalChallengeView: renderProgressItems finished.");
    } catch(e) {
         console.error("renderLocalChallengeView: Error calling renderProgressItems", e);
         progressContainer.innerHTML = '<p class="text-danger">Error rendering progress items.</p>';
    }

    // --- ADD LOG ---
    console.log("renderLocalChallengeView: Rendering complete.");
}


// --- Initialize Page ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("challenge_view.js: Initializing...");

    // Find the single element holding server-passed data
    const dataEl = document.getElementById('challengeData');
    // Find potential status display area (used by showError)
    const statusDiv = document.getElementById('pageStatusDisplay'); // Assumes <div id="pageStatusDisplay"> exists somewhere

    if (!dataEl?.dataset) { // Check if element and dataset exist
        console.error("CRITICAL: #challengeData element or its dataset is missing. Cannot initialize page.");
        // Attempt to display error on page if possible
        const body = document.querySelector('body');
        const errorMsg = "Error initializing page: Cannot read configuration data.";
        if (statusDiv) showError(statusDiv, errorMsg, 'danger');
        else if (body) body.insertAdjacentHTML('afterbegin', `<div class="alert alert-danger m-3">${errorMsg}</div>`);
        else alert(errorMsg); // Fallback
        return; // Stop initialization
    }

    // --- Read ALL data from the data-* attributes into challengeConfig ---
    try {
         // Parse potentially null/numeric JSON value for joined ID
         const joinedId = JSON.parse(dataEl.dataset.userJoinedGroupId || 'null');
         // Parse challenge structure JSON (might be null if is_local is true)
         const structureJson = dataEl.dataset.challengeJson;
         const coreStructure = structureJson && structureJson !== 'null' ? JSON.parse(structureJson) : null;

         // Populate the module-level config object
         challengeConfig = {
             id: dataEl.dataset.challengeId, // public_id or localId
             isLocal: dataEl.dataset.isLocal === 'true',
             isMultigroup: dataEl.dataset.isMultigroup === 'true',
             maxGroups: parseInt(dataEl.dataset.maxGroups, 10) || 1,
             initialGroupCount: parseInt(dataEl.dataset.initialGroupCount, 10) || 0,
             userJoinedGroupId: typeof joinedId === 'number' ? joinedId : null,
             coreChallengeStructure: coreStructure, // Initially null if local
             progressData: {}, // Will be populated if local
             csrfToken: dataEl.dataset.csrfToken,
             urls: {
                 addGroup: dataEl.dataset.addGroupUrl,
                 updateProgressBase: dataEl.dataset.updateProgressUrlBase,
                 joinLeaveBase: dataEl.dataset.joinLeaveUrlBase
             }
         };

         // Basic validation of essential config
         if (!challengeConfig.id) throw new Error("Challenge ID missing.");
         if (!challengeConfig.isLocal) { // URLs only required for DB challenges
             if (challengeConfig.isMultigroup && (!challengeConfig.urls.addGroup || !challengeConfig.urls.joinLeaveBase)) {
                  throw new Error("Essential Multigroup API URLs missing.");
             }
             if (!challengeConfig.urls.updateProgressBase) {
                 throw new Error("Update progress URL missing.");
             }
         }
         console.log("challenge_view.js: Parsed challengeConfig:", challengeConfig);

    } catch(e) {
         console.error("challenge_view.js: Failed to parse initial data from #challengeData:", e);
         showError(statusDiv || document.body, `Error initializing page: ${e.message}`, 'danger');
         return; // Stop initialization
    }
    // --- End reading data ---


    // --- Branch based on Local vs DB ---
    if (challengeConfig.isLocal) {
        // --- LOCAL CHALLENGE ---
        console.log("Mode: Local Challenge. ID:", challengeConfig.id);
        const localData = getLocalChallengeById(challengeConfig.id); // Fetch from LS
        console.log("Local data fetched from storage:", localData); // Log what was fetched

        if (localData) {
            // Store fetched local data in config
            challengeConfig.coreChallengeStructure = localData.challengeData;
            challengeConfig.progressData = localData.progressData || {};
            console.log("Local challenge found, proceeding to render...");

            // Render the view dynamically using the fetched local data
            renderLocalChallengeView(localData); // Assumes this function exists and renders into #localChallengeDisplay

            // Attach the change listener for progress AFTER rendering
            const displayContainer = document.getElementById('localChallengeDisplay');
            if (displayContainer) {
                 displayContainer.addEventListener('change', handleProgressChange); // Ensure handleProgressChange checks isLocal
                 console.log("challenge_view.js: Local progress listener attached to #localChallengeDisplay.");
            } else {
                 console.error("Could not attach local progress listener: #localChallengeDisplay missing after render attempt.");
            }
        } else {
            // Handle case where local challenge ID exists in URL but data is missing in LS
            const displayContainer = document.getElementById('localChallengeDisplay');
            const errorMsg = `Error: Could not load local challenge data for ID ${challengeConfig.id}. Was it deleted?`;
             if(displayContainer) displayContainer.innerHTML = `<div class="alert alert-danger">${errorMsg}</div>`;
             else console.error(errorMsg);
        }

    } else {
        // --- DATABASE CHALLENGE ---
        console.log(`Mode: DB Challenge (Multigroup: ${challengeConfig.isMultigroup})`);
        const addGroupForm = document.getElementById('addGroupForm');
        const groupsContainer = document.getElementById('groupsContainer');

        // Initial UI state sync (buttons/checkboxes based on server render + user state)
        updateUIAfterMembershipChange(challengeConfig);
        updateGroupCountDisplay(challengeConfig.initialGroupCount, challengeConfig.maxGroups);

        // Attach listeners relevant for DB challenges
        if (challengeConfig.isMultigroup && addGroupForm) {
            addGroupForm.addEventListener('submit', handleCreateGroupSubmit);
            console.log("challenge_view.js: Create Group listener attached.");
        } else if (challengeConfig.isMultigroup) {
            console.warn("challenge_view.js: Create group form (#addGroupForm) missing but expected for multigroup mode.");
        }

        if (groupsContainer) {
            // Attach listeners via delegation
            if (challengeConfig.isMultigroup) { // Only need join/leave for multigroup
                 groupsContainer.addEventListener('click', (event) => {
                    if (event.target.closest('.join-group-btn')) handleJoinGroupClick(event);
                    else if (event.target.closest('.leave-group-btn')) handleLeaveGroupClick(event);
                 });
                 console.log("challenge_view.js: Join/Leave listeners attached.");
            }
            // Progress listener needed for both single (DB) and multi (DB)
            groupsContainer.addEventListener('change', handleProgressChange); // Ensure handleProgressChange checks isLocal
            console.log("challenge_view.js: DB Progress listener attached.");
        } else { console.error("challenge_view.js: Group display area (#groupsContainer) NOT FOUND!"); }
    }

}); // End DOMContentLoaded