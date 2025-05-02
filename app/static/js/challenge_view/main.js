// static/js/challenge_view/main.js
// Main orchestrator for the unified challenge view page (challenge.html).
// Handles state, user interactions, API calls, coordinates UI updates, and timer.

// Import necessary modules (assuming these exist and are correct)
import { apiFetch } from '../utils/api.js';
import { setLoading, showError, escapeHtml, showFlash } from '../utils/helpers.js';
import {
    updateGroupCountDisplay, renderProgressItems, addGroupToDOM,
    updateUIAfterMembershipChange, // Use the imported version directly
    renderOrUpdateProgressBar,
    renderStaticChallengeDetailsJS, updatePenaltyDisplay, renderPlayerNameInputs
} from './ui.js';
import { getLocalChallengeById, updateLocalChallengeProgress } from '../utils/local_storage.js';
import { updatePenaltyConfig } from './penalty.js';
import { initializeTimer } from './timer.js';

// --- Module-level State ---
let challengeConfig = {
    id: null, isLocal: false, isMultigroup: false, maxGroups: 1, initialGroupCount: 0,
    userJoinedGroupId: null, coreChallengeStructure: null, progressData: {},
    csrfToken: null, numPlayersPerGroup: 1, initialGroups: [],
    urls: { // Updated URLs structure
        addGroup: null,
        updateProgressBase: null,
        joinLeaveBase: null,
        setPenaltyUrlBase: null,
        savePlayersBase: null,
        authorizeUser: null,
        removeUserBase: null
    },
    isLoggedIn: false,
    isCreator: false,
    isAuthorized: false
};

const requestControllers = { join: null, leave: null, create: null, savePlayers: null, authorize: null, removeAuth: null };

// --- DOM Element References ---
let myGroupContainerEl = null;
let otherGroupsContainerEl = null;
let statusDiv = null;
let pageContainer = null; // Added for event delegation

// --- Constants ---
const JOINED_GROUP_COL_CLASSES = ['col-md-8', 'col-lg-6', 'mx-auto', 'mb-4'];
const OTHER_GROUP_COL_CLASSES = ['col-lg-4', 'col-md-6', 'mb-4'];
const TIMER_ID = 'main';

// --- Helper Functions ---

function makeNewProgress(oldProgress, key, isComplete) {
    const next = { ...oldProgress };
    if (isComplete) next[key] = true;
    else delete next[key];
    return next;
}

function nextSignal(key) {
    requestControllers[key]?.abort?.();
    const ctrl = new AbortController();
    requestControllers[key] = ctrl;
    return ctrl.signal;
}

function lockButton(btn, label) {
    if (!btn) return;
    btn.disabled = true;
    const spinner = btn.querySelector('.spinner-border-sm');
    if (spinner) spinner.style.display = 'inline-block';
    // Store original text using firstChild assuming structure is <spinner><span>Text</span>
    const textSpan = btn.querySelector('span:not(.spinner-border-sm)');
    if (textSpan) {
        btn.dataset.prevText = textSpan.textContent;
        textSpan.textContent = label;
    }
}

function restoreButton(btn) {
    if (!btn) return;
    const spinner = btn.querySelector('.spinner-border-sm');
    if (spinner) spinner.style.display = 'none';
    // Restore original text
    const textSpan = btn.querySelector('span:not(.spinner-border-sm)');
    if (textSpan && typeof btn.dataset.prevText === 'string') {
        textSpan.textContent = btn.dataset.prevText;
        delete btn.dataset.prevText; // Clean up
    }
    btn.disabled = false;
}

async function handleShowOverlayLink() {
    // Get references to the relevant elements
    const errorDiv = document.getElementById('overlayLinkError');
    const copyBtn = document.getElementById('copyOverlayLinkBtn'); // The standalone copy button
    const showBtn = document.getElementById('showOverlayLinkBtn'); // The initial trigger button

    // Basic check for elements
    if (!errorDiv || !copyBtn || !showBtn) {
        console.error("Overlay link relevant DOM elements missing.");
        return;
    }

    // Check prerequisites from config
    if (challengeConfig.isLocal || !challengeConfig.isLoggedIn || !challengeConfig.isAuthorized) {
        showError(errorDiv, "Overlay links are only available for logged-in, authorized users on shared challenges.");
        return;
    }

    // Clear previous errors/state and show loading on trigger button
    errorDiv.innerHTML = ''; // Use innerHTML to allow links later
    errorDiv.style.display = 'none';
    copyBtn.style.display = 'none'; // Ensure copy button is hidden initially
    setLoading(showBtn, true, 'Loading...'); // Show loading state on the "Show" button

    let overlayUrl = null; // Store the generated URL

    try {
        // --- FETCH API KEY ---
        console.log("Fetching API key...");
        const keyData = await apiFetch('/api/profile/get_key', {}, challengeConfig.csrfToken); //
        const userApiKey = keyData?.api_key;

        if (!userApiKey) {
            // --- No Key Found ---
            const profileUrl = challengeConfig.urls.profile || '#'; // Get profile URL from config
            // Display message with link in the error div
            errorDiv.innerHTML = `No overlay key found. Please <a href="${profileUrl}" class="link-warning">generate one in your profile</a>.`; //
            errorDiv.style.display = 'block';
            showBtn.style.display = 'none'; // Hide the "Show" button after check
            console.log("API key not found.");
            setLoading(showBtn, false, 'Show/Copy Overlay Link'); // Reset show button state
            return; // Stop processing
        }
        // --- END No Key Found ---

        // --- Key Found - Construct URL ---
        const challengeId = challengeConfig.id;
        if (!challengeId) throw new Error("Challenge ID missing in config."); // Should not happen

        overlayUrl = `${window.location.origin}/overlay/${challengeId}?key=${encodeURIComponent(userApiKey)}`;
        console.log("Overlay URL constructed.");

        // --- Setup Copy Button ---
        // Remove previous listener by replacing the button
        const newCopyBtn = copyBtn.cloneNode(true);
        copyBtn.parentNode.replaceChild(newCopyBtn, copyBtn);
        // Set final button text
        newCopyBtn.querySelector('span:not(.spinner-border-sm)').innerHTML = '<i class="bi bi-clipboard me-1"></i> Copy Overlay Link';

        // Attach new listener to the *new* button
        newCopyBtn.addEventListener('click', async () => {
            if (!overlayUrl) return; // Should not happen if button is visible
            setLoading(newCopyBtn, true, 'Copying...');
            try {
                await navigator.clipboard.writeText(overlayUrl);
                showFlash('Overlay link copied!', 'success'); //
            } catch (err) {
                console.error('Clipboard API copy failed:', err);
                showFlash('Failed to copy link automatically.', 'danger'); //
                // Optionally show the link in errorDiv as fallback if copy fails
                errorDiv.innerHTML = `Auto-copy failed. Link: <input type='text' value='${escapeHtml(overlayUrl)}' readonly size='40' class='form-control form-control-sm d-inline-block w-auto'>`;
                errorDiv.style.display = 'block';
            } finally {
                setLoading(newCopyBtn, false, '<i class="bi bi-clipboard me-1"></i> Copy Overlay Link');
            }
        });

        // --- Update UI ---
        showBtn.style.display = 'none'; // Hide the "Show" button
        newCopyBtn.style.display = 'inline-block'; // Show the "Copy" button
        errorDiv.style.display = 'none'; // Hide error div

    } catch (error) {
        console.error("Error in handleShowOverlayLink:", error);
        // Show error message in the dedicated div
        errorDiv.textContent = `Error: ${error.message}`;
        errorDiv.style.display = 'block';
        // Hide both buttons on error
        showBtn.style.display = 'none';
        copyBtn.style.display = 'none';
        setLoading(showBtn, false, 'Show/Copy Overlay Link'); // Reset show button

    }
}

async function autoJoinGroup(groupId) {
    if (!challengeConfig.urls.joinLeaveBase || !groupId) return;
    try {
        await apiFetch(
            `${challengeConfig.urls.joinLeaveBase}/${groupId}/join`,
            { method: 'POST' },
            challengeConfig.csrfToken
        );
        updateUserJoinedGroupState(groupId);
        const grp = challengeConfig.initialGroups.find(g => g.id === groupId);
        if (grp) grp.member_count = Math.min(
            (grp.member_count || 0) + 1,
            challengeConfig.numPlayersPerGroup
        );
        // Use the imported function
        updateUIAfterMembershipChange(
            challengeConfig, myGroupContainerEl, otherGroupsContainerEl
        ); //

    } catch (err) {
        console.error('Auto-join failed:', err);
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
    statusDiv = document.getElementById('pageStatusDisplay'); // Ensure statusDiv is accessible

    // 1. Check if the essential data element exists
    if (!dataEl?.dataset) { // Using optional chaining for safety
        console.error("CRITICAL: #challengeData element or its dataset is missing!");
        showError(statusDiv || document.body, "Initialization Error: Cannot read page data.", "danger");
        return false; // Stop initialization
    }

    try {
        // 2. Read all data attributes - store raw values first for debugging
        const rawData = {
            challengeId: dataEl.dataset.challengeId,
            isLocal: dataEl.dataset.isLocal,
            isMultigroup: dataEl.dataset.isMultigroup,
            maxGroups: dataEl.dataset.maxGroups,
            userJoinedGroupId: dataEl.dataset.userJoinedGroupId,
            challengeJson: dataEl.dataset.challengeJson,
            csrfToken: dataEl.dataset.csrfToken,
            numPlayersPerGroup: dataEl.dataset.numPlayersPerGroup,
            initialGroups: dataEl.dataset.initialGroups,
            // --- Flags ---
            isLoggedIn: dataEl.dataset.isLoggedIn,
            isCreator: dataEl.dataset.isCreator,
            isAuthorized: dataEl.dataset.isAuthorized, // Read the raw value
            // --- URLs ---
            addGroupUrl: dataEl.dataset.addGroupUrl,
            updateProgressUrlBase: dataEl.dataset.updateProgressUrlBase,
            joinLeaveUrlBase: dataEl.dataset.joinLeaveUrlBase,
            setPenaltyUrlBase: dataEl.dataset.setPenaltyUrlBase,
            savePlayersUrlBase: dataEl.dataset.savePlayersUrlBase,
            authorizeUserUrl: dataEl.dataset.authorizeUserUrl,
            removeUserUrlBase: dataEl.dataset.removeUserUrlBase,
            profileUrl: dataEl.dataset.profileUrl
        };

        // 4. Process and parse data into the challengeConfig object
        const joinedId = JSON.parse(rawData.userJoinedGroupId || 'null');
        const coreStructure = rawData.challengeJson && rawData.challengeJson !== 'null' ? JSON.parse(rawData.challengeJson) : null;
        const parsedMaxGroups = parseInt(rawData.maxGroups, 10);
        const parsedNumPlayers = parseInt(rawData.numPlayersPerGroup, 10);
        const initialGroupsData = rawData.initialGroups && rawData.initialGroups !== 'null' ? JSON.parse(rawData.initialGroups) : [];

        challengeConfig = {
            id: rawData.challengeId,
            isLocal: rawData.isLocal === 'true',
            isMultigroup: rawData.isMultigroup === 'true',
            maxGroups: (!isNaN(parsedMaxGroups) && parsedMaxGroups >= 1) ? parsedMaxGroups : 1,
            initialGroupCount: Array.isArray(initialGroupsData) ? initialGroupsData.length : 0,
            userJoinedGroupId: typeof joinedId === 'number' ? joinedId : null,
            coreChallengeStructure: coreStructure,
            progressData: {}, // Initialize progress data for local challenges if needed
            csrfToken: rawData.csrfToken,
            numPlayersPerGroup: (!isNaN(parsedNumPlayers) && parsedNumPlayers >= 1) ? parsedNumPlayers : 1,
            initialGroups: Array.isArray(initialGroupsData) ? initialGroupsData : [],
            urls: {
                addGroup: rawData.addGroupUrl,
                updateProgressBase: rawData.updateProgressUrlBase,
                joinLeaveBase: rawData.joinLeaveUrlBase,
                setPenaltyUrlBase: rawData.setPenaltyUrlBase,
                savePlayersBase: rawData.savePlayersUrlBase,
                authorizeUser: rawData.authorizeUserUrl,
                removeUserBase: rawData.removeUserUrlBase,
                profile: rawData.profileUrl
            },
            // --- Assign booleans using strict comparison ---
            isLoggedIn: rawData.isLoggedIn === 'true',
            isCreator: rawData.isCreator === 'true',
            isAuthorized: rawData.isAuthorized === 'true' // Correct assignment
        };

        // 6. Basic validation of essential config after processing
        if (!challengeConfig.id) {
            throw new Error("Essential config 'challengeId' missing or invalid.");
        }
        // Add other critical validations if needed

        return true; // Indicate success

    } catch (e) {
        console.error("challenge_view.js: Failed to parse or process initial data:", e);
        showError(statusDiv || document.body, `Initialization Error: ${e.message}`, 'danger');
        return false; // Indicate failure
    }
}

/**
 * Updates the userJoinedGroupId in the module state and the hidden DOM element.
 * Also triggers update to penalty module config.
 * @param {number | null} newGroupId - The new group ID or null if leaving.
 */
function updateUserJoinedGroupState(newGroupId) {
    challengeConfig.userJoinedGroupId = newGroupId;
    const dataEl = document.getElementById('challengeData');
    if (dataEl) {
        dataEl.dataset.userJoinedGroupId = JSON.stringify(newGroupId);
    }
    // Notify penalty module
    if (typeof updatePenaltyConfig === 'function') {
        updatePenaltyConfig(challengeConfig); // Pass the whole updated config //
    }
}

// --- Event Handlers ---

async function handleCreateGroupSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const groupNameEl = form.elements.group_name;
    const groupName = groupNameEl.value.trim();
    const submitBtn = form.querySelector('#addGroupBtn');
    const errDiv = document.getElementById('addGroupError');

    // Only creators should be able to submit this form (UI should prevent others)
    if (!challengeConfig.isCreator) {
        showError(errDiv, 'Only the creator can add groups.'); return;
    }
    if (submitBtn.disabled) return;
    showError(errDiv, null);

    if (!groupName || groupName.length > 80) {
        showError(errDiv, 'Invalid group name (1-80 chars).'); return;
    }
    if (challengeConfig.initialGroupCount >= challengeConfig.maxGroups) {
        showError(errDiv, `Maximum groups (${challengeConfig.maxGroups}) reached.`); return;
    }

    lockButton(submitBtn, 'Creating…');

    try {
        const data = await apiFetch(
            challengeConfig.urls.addGroup,
            {
                method: 'POST',
                body: { group_name: groupName },
                signal: nextSignal('create')
            },
            challengeConfig.csrfToken);

        if (data.status !== 'success' || !data.group) throw new Error(data.error || 'Unknown error.');

        // --- Group Created Successfully ---
        const newGroupData = { // Prepare data for local state and UI
            id: data.group.id,
            name: data.group.name,
            progress: {},
            member_count: data.creator_auto_joined ? 1 : 0, // Use backend flag
            player_names: [],
            active_penalty_text: ''
        };

        // Add to local state BEFORE adding to DOM
        challengeConfig.initialGroups.push(newGroupData);
        challengeConfig.initialGroupCount++;

        // Add card to the DOM (will initially go to 'other' groups)
        addGroupToDOM(newGroupData, challengeConfig, myGroupContainerEl, otherGroupsContainerEl);
        updateGroupCountDisplay(challengeConfig.initialGroupCount, challengeConfig.maxGroups);
        groupNameEl.value = ''; // Clear input
        console.log("[Create Group] API Success. isMultigroup:", challengeConfig.isMultigroup, "creator_auto_joined:", data.creator_auto_joined);

        // --- START: Handle Creator Auto-Join UI Update ---
        // Check if it was single group AND the creator was auto-joined (flag from backend)
        if (!challengeConfig.isMultigroup && data.creator_auto_joined) {
            console.log(`[Create Group] Creator auto-joined single group ${newGroupData.id}. Updating state...`);

            // 1. Update the frontend's state FIRST
            updateUserJoinedGroupState(newGroupData.id);
            console.log("[Create Group] State updated. challengeConfig.userJoinedGroupId is now:", challengeConfig.userJoinedGroupId);

            // 2. Find the newly added card element in the DOM (Optional but good for sanity check)
            const newCardElement = document.querySelector(`.group-card-wrapper[data-group-id="${newGroupData.id}"]`);
            if (!newCardElement) {
                console.error(`[Create Group] CRITICAL: Could not find newly added card element for ID ${newGroupData.id} in the DOM! UI might not update correctly.`);
                // If this happens, addGroupToDOM might have failed, or the selector is wrong.
            } else {
                console.log(`[Create Group] Found new card element for ID ${newGroupData.id}. Ready for UI update.`);
            }

            // 3. Call updateUIAfterMembershipChange AGAIN to visually move the card and update buttons
            console.log("[Create Group] Calling updateUIAfterMembershipChange to reflect auto-join...");
            updateUIAfterMembershipChange(challengeConfig, myGroupContainerEl, otherGroupsContainerEl);
            console.log("[Create Group] UI update called after auto-join.");

        } else {
            // If not auto-joined, still run the update once to ensure general UI consistency
            // (e.g., maybe max groups was reached, or it's multi-group mode)
            console.log("[Create Group] Not an auto-join scenario. Calling updateUIAfterMembershipChange once.");
            updateUIAfterMembershipChange(challengeConfig, myGroupContainerEl, otherGroupsContainerEl);
        }
        // --- END: Handle Creator Auto-Join UI Update ---

        showFlash(`Group "${escapeHtml(newGroupData.name)}" created.`, 'success');

    } catch (err) {
        console.error('create-group failed', err);
        showError(errDiv, `Error: ${err.message}`);
    } finally {
        restoreButton(submitBtn);
    }
}

async function handleJoinGroupClick(_, joinBtn) {
    if (!joinBtn?.classList.contains('join-group-btn') || joinBtn.disabled) return;

    // Check authorization before proceeding
    if (!challengeConfig.isLoggedIn || !challengeConfig.isAuthorized) {
        showFlash("You must be logged in and authorized to join groups.", "warning");
        return;
    }

    const groupId = Number(joinBtn.dataset.groupId);
    if (Number.isNaN(groupId)) return;

    const cardWrapper = joinBtn.closest('.group-card-wrapper');
    const footer = joinBtn.closest('.card-footer');
    lockButton(joinBtn, 'Joining…');

    try {
        await apiFetch(
            `${challengeConfig.urls.joinLeaveBase}/${groupId}/join`,
            { method: 'POST', signal: nextSignal('join') },
            challengeConfig.csrfToken);

        // --- UI Update on Success ---
        if (cardWrapper && myGroupContainerEl && otherGroupsContainerEl) {
            cardWrapper.classList.remove(...OTHER_GROUP_COL_CLASSES);
            cardWrapper.classList.add(...JOINED_GROUP_COL_CLASSES);
            myGroupContainerEl.innerHTML = ''; // Clear previous content if any
            const h = Object.assign(document.createElement('h4'), { className: 'text-primary-accent mb-3 text-center', textContent: 'Your Group' });
            myGroupContainerEl.append(h, cardWrapper);
        } else {
            console.error("DOM structure error during join UI update.");
        }

        updateUserJoinedGroupState(groupId);
        const g = challengeConfig.initialGroups.find(x => x.id === groupId);
        if (g) g.member_count = Math.min((g.member_count || 0) + 1, challengeConfig.numPlayersPerGroup);

        // Refresh UI for all cards (enables checkboxes, updates buttons)
        // Use the imported function
        updateUIAfterMembershipChange(challengeConfig, myGroupContainerEl, otherGroupsContainerEl); //


    } catch (err) {
        console.error('join failed', err);
        showError(footer || statusDiv, `Error joining: ${err.message}`, 'danger');
    } finally {
        restoreButton(joinBtn); // Ensure button state is restored
    }
}

async function handleLeaveGroupClick(_, leaveBtn) {
    if (!leaveBtn?.classList.contains('leave-group-btn') || leaveBtn.disabled) return;

    // Check authorization before proceeding (though only members should see leave)
    if (!challengeConfig.isLoggedIn || !challengeConfig.isAuthorized) {
        showFlash("Authorization error.", "warning"); // Should not happen if UI is correct
        return;
    }

    const groupId = Number(leaveBtn.dataset.groupId);
    if (Number.isNaN(groupId)) return;

    const cardWrapper = leaveBtn.closest('.group-card-wrapper');
    const footer = leaveBtn.closest('.card-footer');
    lockButton(leaveBtn, 'Leaving…');

    try {
        await apiFetch(
            `${challengeConfig.urls.joinLeaveBase}/${groupId}/leave`,
            { method: 'POST', signal: nextSignal('leave') },
            challengeConfig.csrfToken);

        // --- UI Update on Success ---
        if (cardWrapper && myGroupContainerEl && otherGroupsContainerEl) {
            cardWrapper.classList.remove(...JOINED_GROUP_COL_CLASSES);
            cardWrapper.classList.add(...OTHER_GROUP_COL_CLASSES);
            otherGroupsContainerEl.appendChild(cardWrapper); // Move to 'other' container
            myGroupContainerEl.innerHTML = ''; // Clear 'my group' container
        } else {
            console.error("DOM structure error during leave UI update.");
        }

        const groupName = challengeConfig.initialGroups.find(g => g.id === groupId)?.name || groupId;
        updateUserJoinedGroupState(null); // Update state to no group joined
        const g = challengeConfig.initialGroups.find(x => x.id === groupId);
        if (g) g.member_count = Math.max(0, (g.member_count || 0) - 1);

        // Refresh UI for all cards
        // Use the imported function
        updateUIAfterMembershipChange(challengeConfig, myGroupContainerEl, otherGroupsContainerEl); //


    } catch (err) {
        console.error('leave failed', err);
        showError(footer || statusDiv, `Error leaving: ${err.message}`, 'danger');
    } finally {
        restoreButton(leaveBtn); // Ensure button state is restored
    }
}

async function handleProgressChange(event) {
    if (!event.target.matches('.progress-checkbox')) return;
    const checkbox = event.target;

    // --- Authorization Check ---
    const groupId = parseInt(checkbox.dataset.groupId, 10);
    const isJoinedGroup = (challengeConfig.userJoinedGroupId === groupId);
    const canInteract = challengeConfig.isLocal || (challengeConfig.isLoggedIn && challengeConfig.isAuthorized && isJoinedGroup);

    if (checkbox.disabled || !canInteract) {
        console.warn("Progress change blocked by disabled checkbox or insufficient authorization.");
        checkbox.checked = !checkbox.checked;
        return;
    }

    // --- Get Data from Checkbox ---
    const itemData = checkbox.dataset;
    const isComplete = checkbox.checked;
    const itemDiv = checkbox.closest('.progress-item');

    if (!itemData.itemType || !itemData.itemKey || typeof itemData.itemIndex === 'undefined') {
        console.error("Progress checkbox missing required data attributes:", itemData);
        showError(statusDiv || document.body, "Cannot save progress: Checkbox data missing.", 'warning');
        checkbox.checked = !isComplete;
        return;
    }

    // --- Construct Progress Key and Payload ---
    let progressKey; // For local state/lookup
    let payload;     // For API call
    try {
        const type = itemData.itemType;
        const key = itemData.itemKey;
        const index = parseInt(itemData.itemIndex, 10); // 0-based item index within its group

        // Basic payload structure
        payload = {
            item_type: type,
            item_key: key,
            item_index: index,
            is_complete: isComplete,
        };

        if (type === 'b2b') {
            // --- FIX: Read the 1-based index from the data attribute ---
            const segmentIndex_1based = parseInt(itemData.segmentIndex, 10); // Read the attribute value

            // Validate the read value (should be >= 1 as set by ui.js)
            if (isNaN(segmentIndex_1based) || segmentIndex_1based < 1) {
                 throw new Error(`Invalid segment_index (${itemData.segmentIndex}) read from data attribute for b2b item.`);
            }

            // Use the 1-based index for the payload sent to the backend
            payload.segment_index = segmentIndex_1based;

            // --- Construct internal progressKey using 0-based index ---
            // (Assuming progress is stored/referenced using 0-based segment index locally)
            const segmentIndex_0based = segmentIndex_1based - 1;
            progressKey = `${type}_${segmentIndex_0based}_${key}_${index}`;
            // --- End Key Construction ---

        } else if (type === 'normal') {
            progressKey = `${type}_${key}_${index}`;
            // No segment_index in payload for normal items
        } else {
            throw new Error("Unknown progress item type.");
        }

        // Validate item index
        if (isNaN(index)) {
            throw new Error("Invalid item_index.");
        }

    } catch (e) {
        console.error("Error constructing progress key or payload:", e);
        showError(statusDiv || document.body, `Cannot save progress: ${e.message}`, 'warning');
        checkbox.checked = !isComplete;
        return;
    }

    // --- Disable UI during operation ---
    checkbox.disabled = true;
    if (itemDiv) itemDiv.style.opacity = '0.6';

    // --- Perform Update (Local or API) ---
    try {
        let currentProgressData = {};

        if (challengeConfig.isLocal) {
            // Local Storage Update (uses 0-based progressKey)
            const potentialNewProgressData = makeNewProgress(challengeConfig.progressData || {}, progressKey, isComplete);
            const success = updateLocalChallengeProgress(challengeConfig.id, progressKey, isComplete);
            if (!success) throw new Error("Failed to save progress locally.");
            challengeConfig.progressData = Object.freeze(potentialNewProgressData);
            currentProgressData = potentialNewProgressData;
            console.log(`Local progress updated for key: ${progressKey}`);

        } else {
            // API Update (sends payload with 1-based segment_index)
            if (!challengeConfig.urls.updateProgressBase) {
                 throw new Error("API URL for progress update is not configured.");
            }
            const url = `${challengeConfig.urls.updateProgressBase}/${groupId}/progress`;
            console.log("Sending API request to:", url, "with payload:", JSON.stringify(payload)); // Log payload
            await apiFetch(url, { method: 'POST', body: payload }, challengeConfig.csrfToken);
            console.log(`API progress update successful for key: ${progressKey}`);

            // Update local config state (using 0-based progressKey)
            const groupIndex = challengeConfig.initialGroups.findIndex(g => g.id === groupId);
            if (groupIndex !== -1) {
                challengeConfig.initialGroups[groupIndex].progress = challengeConfig.initialGroups[groupIndex].progress || {};
                if (isComplete) {
                    challengeConfig.initialGroups[groupIndex].progress[progressKey] = true;
                } else {
                    delete challengeConfig.initialGroups[groupIndex].progress[progressKey];
                }
                currentProgressData = challengeConfig.initialGroups[groupIndex].progress;
            }
        }

        // --- Update Visual State on Success ---
        if (itemDiv) itemDiv.classList.toggle('completed', isComplete);

        // Update Progress Bar
        let progressBarContainer = null;
        if (challengeConfig.isLocal) {
            const localCard = document.getElementById('local-group-card');
            progressBarContainer = localCard?.querySelector('.progress-bar-container');
        } else {
            progressBarContainer = document.getElementById(`progressBarContainer-${groupId}`);
        }
        if (progressBarContainer && challengeConfig.coreChallengeStructure) {
            renderOrUpdateProgressBar(progressBarContainer, challengeConfig.coreChallengeStructure, currentProgressData);
        } else if (!progressBarContainer) {
            console.warn("Progress bar container could not be found for update.");
        }

    } catch (error) {
        // --- Error Handling ---
        console.error("Failed to update progress:", error);
        checkbox.checked = !isComplete;
        showError(statusDiv, `Error saving progress: ${error.message}`, 'danger');
        if (itemDiv) {
            itemDiv.classList.add('error-flash');
            setTimeout(() => itemDiv.classList.remove('error-flash'), 1500);
        }

    } finally {
        // --- Re-enable UI ---
        checkbox.disabled = !canInteract;
        if (itemDiv) itemDiv.style.opacity = '1';
    }
}

async function handleSavePlayersClick(_, saveBtn) {
    if (!saveBtn?.classList.contains('save-player-names-btn') || saveBtn.disabled) return;

    // Authorization Check
    const groupId = Number(saveBtn.dataset.groupId);
    const isJoinedGroup = (challengeConfig.userJoinedGroupId === groupId);
    if (!challengeConfig.isLoggedIn || !challengeConfig.isAuthorized || !isJoinedGroup) {
        showFlash("You must be logged in, authorized, and in this group to save player names.", "warning");
        return;
    }
    if (Number.isNaN(groupId)) return;

    const section = saveBtn.closest('.player-names-section');
    if (!section) return; // Ensure section exists

    const inputs = section.querySelectorAll('.player-name-input');
    const errBox = section.querySelector('.player-name-error');
    const names = Array.from(inputs).map(i => i.value.trim()).filter(n => n && n.length <= 50);

    const max = challengeConfig.numPlayersPerGroup || 1;
    showError(errBox, null); // Clear previous errors
    if (names.length > max) { showError(errBox, `Max ${max} names allowed.`); return; }

    lockButton(saveBtn, 'Saving…');

    try {
        const url = `${challengeConfig.urls.savePlayersBase}/${groupId}/players`; // Use correct base URL
        const data = await apiFetch(
            url,
            { method: 'POST', body: { player_names: names }, signal: nextSignal('savePlayers') },
            challengeConfig.csrfToken
        );

        if (data.status !== 'success') throw new Error(data.error || 'Unknown error');

        showError(errBox, 'Names saved!', 'success'); // Use the error box for success message
        setTimeout(() => showError(errBox, null), 2500); // Clear after delay

        // Update local state
        const g = challengeConfig.initialGroups.find(x => x.id === groupId);
        if (g) g.player_names = names;
        updatePenaltyConfig(challengeConfig); // Notify penalty module if needed //

    } catch (err) {
        console.error('save players failed', err);
        showError(errBox, `Error: ${err.message}`); // Show error in designated box
    } finally {
        restoreButton(saveBtn);
    }
}

async function handleClearPenaltyClick(_, clearBtn) {
    if (!clearBtn?.classList.contains('clear-penalty-btn') || clearBtn.disabled) return;

    const groupId = Number(clearBtn.dataset.groupId);
    const penaltyDisplayDiv = clearBtn.closest('.active-penalty-display');
    const isJoinedGroup = (challengeConfig.userJoinedGroupId === groupId);

    // Authorization Check
    if (!challengeConfig.isLoggedIn || !challengeConfig.isAuthorized || !isJoinedGroup) {
        showFlash("You must be logged in, authorized, and in this group to clear penalties.", "warning");
        return;
    }
    if (Number.isNaN(groupId) || !penaltyDisplayDiv) return;

    if (!challengeConfig.urls.setPenaltyUrlBase || !challengeConfig.csrfToken) {
        showError(penaltyDisplayDiv, "Cannot clear penalty: configuration missing.", 'danger');
        return;
    }

    lockButton(clearBtn, 'Clearing…');

    try {
        const url = `${challengeConfig.urls.setPenaltyUrlBase}/${groupId}/penalty`;
        await apiFetch(
            url,
            { method: 'POST', body: { penalty_text: '' } }, // Send empty string to clear
            challengeConfig.csrfToken
        );
        updatePenaltyDisplay(groupId, ''); // Update UI //
        // Update local state
        const g = challengeConfig.initialGroups.find(x => x.id === groupId);
        if (g) g.active_penalty_text = '';
        showFlash("Penalty cleared.", "success"); // Feedback

    } catch (err) {
        console.error('clear penalty failed', err);
        showError(penaltyDisplayDiv, `Error: ${err.message}`, 'danger'); // Show error within the display div
    } finally {
        restoreButton(clearBtn);
    }
}


// --- NEW: Handler for Authorizing a User ---
async function handleAuthorizeUserClick(authorizeBtn) {
    if (authorizeBtn.disabled) return;

    const usernameInput = document.getElementById('addUsernameInput');
    const username = usernameInput?.value.trim();
    const errDiv = document.getElementById('manageUsersError');
    const userList = document.getElementById('authorizedUsersList');

    showError(errDiv, null); // Clear previous errors

    if (!username) {
        showError(errDiv, "Please enter a username to authorize.");
        return;
    }
    if (!challengeConfig.urls.authorizeUser || !challengeConfig.id) {
        showError(errDiv, "Configuration error: Cannot authorize user.");
        return;
    }

    lockButton(authorizeBtn, "Authorizing...");

    try {
        const data = await apiFetch(
            challengeConfig.urls.authorizeUser, // URL should be pre-constructed
            {
                method: 'POST',
                body: { username: username },
                signal: nextSignal('authorize') // Use new signal key
            },
            challengeConfig.csrfToken
        );

        if (data.status === 'success' && data.user) {
            // Add user to the list if not already present
            if (!userList.querySelector(`li[data-user-id="${data.user.id}"]`)) {
                const li = document.createElement('li');
                li.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center py-1 px-2 authorized-user-item';
                li.dataset.userId = data.user.id;
                li.innerHTML = `
                     <span class="username">${escapeHtml(data.user.username)}</span>
                     <button class="btn btn-xs btn-outline-danger remove-auth-user-btn" data-user-id="${data.user.id}" data-username="${escapeHtml(data.user.username)}" title="Remove Authorization">
                         <span class="spinner-border spinner-border-sm" style="display: none;"></span>
                         <span>&times;</span>
                     </button>
                 `;
                // Remove potential "no users" message before adding
                const noUsersMsg = userList.querySelector('.text-muted');
                if (noUsersMsg) noUsersMsg.remove();

                userList.appendChild(li);
                usernameInput.value = ''; // Clear input on success
                showFlash(`User "${escapeHtml(data.user.username)}" authorized.`, 'success');
            } else {
                showFlash(`User "${escapeHtml(data.user.username)}" is already authorized.`, 'info');
                usernameInput.value = ''; // Clear input even if already authorized
            }
        } else if (data.status === 'ok' && data.message.includes("already authorized")) {
            // Handle case where API confirms user was already authorized
            showFlash(data.message, 'info');
            usernameInput.value = '';
        }
        else {
            throw new Error(data.error || data.message || "Failed to authorize user.");
        }
    } catch (error) {
        console.error("Authorize user failed:", error);
        showError(errDiv, `Error: ${error.message}`);
    } finally {
        restoreButton(authorizeBtn);
    }
}

// --- NEW: Handler for Removing User Authorization ---
async function handleRemoveUserClick(removeBtn) {
    if (removeBtn.disabled) return;

    const userId = removeBtn.dataset.userId;
    const username = removeBtn.dataset.username || 'this user'; // Fallback username for message
    const listItem = removeBtn.closest('li');
    const errDiv = document.getElementById('manageUsersError'); // Use same error div

    if (!userId) {
        showError(errDiv, "Cannot remove user: Missing user ID.");
        return;
    }
    if (!challengeConfig.urls.removeUserBase || !challengeConfig.id) {
        showError(errDiv, "Configuration error: Cannot remove user authorization.");
        return;
    }

    // Construct the specific URL for this user
    const removeUrl = `${challengeConfig.urls.removeUserBase}/${userId}`;

    // Optional: Confirmation dialog
    // const confirmed = await confirmModal(`Are you sure you want to remove authorization for "${username}"?`, "Confirm Removal");
    // if (!confirmed) return;

    lockButton(removeBtn, "..."); // Use short loading text for small button

    try {
        const data = await apiFetch(
            removeUrl,
            {
                method: 'DELETE',
                signal: nextSignal('removeAuth') // Use new signal key
            },
            challengeConfig.csrfToken
        );

        if (data.status === 'success') {
            if (listItem) {
                listItem.style.transition = 'opacity 0.3s ease'; // Optional fade out
                listItem.style.opacity = '0';
                setTimeout(() => {
                    listItem.remove();
                    // Add back "no users" message if list becomes empty (excluding creator)
                    const userList = document.getElementById('authorizedUsersList');
                    if (userList && !userList.querySelector('.authorized-user-item')) {
                        userList.innerHTML = '<li class="list-group-item list-group-item-action py-1 px-2 text-muted small">(Only you)</li>';
                    }
                }, 300);
            }
            showFlash(`Authorization removed for "${escapeHtml(username)}".`, 'success');
            showError(errDiv, null); // Clear error display
        } else {
            throw new Error(data.error || data.message || "Failed to remove authorization.");
        }
    } catch (error) {
        console.error("Remove authorization failed:", error);
        showError(errDiv, `Error removing user: ${error.message}`);
        restoreButton(removeBtn); // Restore button only on failure here
    }
    // Don't need finally restore here if item is removed on success
}

// --- Page Initialization ---
document.addEventListener('DOMContentLoaded', () => {

    pageContainer = document.getElementById('challengeViewContainer'); // Assign pageContainer
    if (!pageContainer) { console.error("CRITICAL: #challengeViewContainer missing!"); return; }

    if (!initializeConfigFromDOM()) { return; } // Read config, exit if failed

    // Initialize Timer
    try { initializeTimer(TIMER_ID); } //
    catch (timerError) { console.error("Failed to initialize timer:", timerError); showError(statusDiv, "Timer could not be initialized.", "warning"); }

    // --- Branch Logic: Local vs. Database Challenge ---
    if (challengeConfig.isLocal) {
        // --- LOCAL CHALLENGE ---
        const localData = getLocalChallengeById(challengeConfig.id); // [cite: 1]

        if (localData) {
            challengeConfig.coreChallengeStructure = localData.challengeData || {};
            challengeConfig.progressData = localData.progressData || {};
            challengeConfig.penaltyInfo = localData.penalty_info || null; // Store penalty info

            // --- Target new placeholder elements ---
            const titleEl = document.getElementById('local-challenge-title');
            const rulesContainer = document.getElementById('local-rules-content');
            const progressBarContainer = document.getElementById('local-group-card')?.querySelector('.progress-bar-container'); // Find within card
            const progressItemsContainer = document.getElementById('local-group-card')?.querySelector('.group-progress-container'); // Find within card
            const penaltySectionContainer = document.getElementById('local-penalty-section-container');
            const penaltyBody = document.getElementById('local-penalty-body');
            const penaltyButton = penaltyBody?.querySelector('.lostGameBtn-local');
            const activePenaltyDisplay = document.getElementById('local-group-card')?.querySelector('.active-penalty-display');

            // Populate Title
            if (titleEl) {
                titleEl.textContent = localData.name || 'Local Challenge';
            }

            // Populate Rules
            if (rulesContainer && challengeConfig.coreChallengeStructure) {
                renderStaticChallengeDetailsJS(rulesContainer, challengeConfig.coreChallengeStructure); // [cite: 1]
            } else if (rulesContainer) {
                rulesContainer.innerHTML = '<p class="text-muted small">Rules not available.</p>';
            }


            // Populate Progress Bar
            if (progressBarContainer && challengeConfig.coreChallengeStructure) {
                renderOrUpdateProgressBar(progressBarContainer, challengeConfig.coreChallengeStructure, challengeConfig.progressData); // [cite: 1]
            } else if (progressBarContainer) {
                progressBarContainer.innerHTML = '<p class="text-muted small">Progress bar unavailable.</p>';
            }

            // Populate Progress Items (ensure container is found)
            if (progressItemsContainer && challengeConfig.coreChallengeStructure) {
                renderProgressItems(progressItemsContainer, challengeConfig.coreChallengeStructure, challengeConfig.id, challengeConfig.progressData, true); // [cite: 1]
                // Attach change listener to the specific card or a parent container
                const localCard = document.getElementById('local-group-card');
                if (localCard) {
                    localCard.addEventListener('change', handleProgressChange);
                } else {
                    console.error("Cannot attach progress listener: local card not found.");
                }
            } else if (progressItemsContainer) {
                progressItemsContainer.innerHTML = '<p class="text-muted small">Progress items unavailable.</p>';
                console.error("Could not render local progress items. Container or structure missing.");
            } else {
                console.error("Progress items container '.group-progress-container' not found within '#local-group-card'.");
            }

            // Populate/Show Penalty Section (if applicable)
            if (penaltySectionContainer && penaltyBody && penaltyButton && challengeConfig.penaltyInfo) {
                const tabId = challengeConfig.penaltyInfo.tab_id;
                if (tabId) {
                    penaltyButton.dataset.penaltyTabId = tabId;
                    penaltySectionContainer.style.display = 'block'; // Show the section
                    // Maybe clear placeholder text
                    // penaltyBody.querySelector('p.text-secondary')?.remove();
                    // Penalty JS should initialize based on presence of elements
                } else {
                    console.warn("Local challenge has penalty info but no tab_id");
                }
            }

            // Populate Active Penalty Display (if needed)
            if (activePenaltyDisplay && localData.active_penalty_text) { // Check if local storage stores this
                updatePenaltyDisplay(challengeConfig.id, localData.active_penalty_text); // [cite: 1]
            }


            // Initialize Timer (using placeholder)
            initializeTimer('main'); // [cite: 1] Assuming the timer in the placeholder uses 'main' ID


            // Initialize penalty module config if needed
            if (challengeConfig.penaltyInfo && typeof updatePenaltyConfig === 'function') {
                updatePenaltyConfig({ // [cite: 1]
                    userJoinedGroupId: challengeConfig.id,
                    numPlayersPerGroup: 1,
                    isMultigroup: false,
                    initialGroups: [{ id: challengeConfig.id, player_names: ['You'] }]
                });
            }

        } else {
            const errorMsg = `Error: Could not load local challenge data (ID: ${escapeHtml(challengeConfig.id)}). It might have been deleted.`;
            // Try to display error in a general status area if local structure failed
            const statusDisplay = document.getElementById('pageStatusDisplay');
            showError(statusDisplay || document.body, errorMsg, 'danger');
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

        // Initial UI setup for DB challenge
        try {
            // Render initial group cards and their states
            updateUIAfterMembershipChange(challengeConfig, myGroupContainerEl, otherGroupsContainerEl);


            const theOnlyGroup = challengeConfig.initialGroups?.[0]; // Get the first (only) group's data if it exists

            if (
                !challengeConfig.isMultigroup &&                     // It IS a single-group challenge
                theOnlyGroup &&                                      // The group data actually exists
                challengeConfig.isLoggedIn &&                        // The VIEWING user is logged in
                challengeConfig.isAuthorized &&                      // The VIEWING user is authorized for THIS challenge
                challengeConfig.userJoinedGroupId === null &&      // The VIEWING user is NOT currently joined
                theOnlyGroup.member_count < challengeConfig.numPlayersPerGroup // The group is not full
            ) {
                console.log(`Auto-joining authorized user to single group ${theOnlyGroup.id}...`); // Optional log
                // Visually move the card immediately for better UX (if it exists in 'other' container)
                const card = otherGroupsContainerEl?.querySelector(`.group-card-wrapper[data-group-id="${theOnlyGroup.id}"]`);
                if (card) {
                    console.log("Moving card to 'Your Group' section visually.");
                    myGroupContainerEl.innerHTML = ''; // Clear any previous placeholder/content
                    const h = document.createElement('h4');
                    h.className = 'text-primary-accent mb-3 text-center';
                    h.textContent = 'Your Group';
                    myGroupContainerEl.appendChild(h);
                    // Move the card - ensure classes are correct for the joined view
                    card.classList.remove(...OTHER_GROUP_COL_CLASSES);
                    card.classList.add(...JOINED_GROUP_COL_CLASSES);
                    myGroupContainerEl.appendChild(card);
                } else {
                    console.warn("Could not find card visually for single group auto-join move.");
                }
                // Attempt the API join in the background
                autoJoinGroup(theOnlyGroup.id);
            }
            updateGroupCountDisplay(challengeConfig.initialGroupCount, challengeConfig.maxGroups); //
            // Update penalty module config initially
            if (typeof updatePenaltyConfig === 'function') {
                updatePenaltyConfig(challengeConfig); //
            }

        } catch (uiError) {
            console.error("Error during initial UI update:", uiError);
            showError(statusDiv, "Error initializing UI state.", "danger");
        }


        // Attach Create Group Form Listener (only if creator)
        if (addGroupForm && challengeConfig.isCreator) {
            addGroupForm.addEventListener('submit', handleCreateGroupSubmit);
        } else if (addGroupForm) {
            addGroupForm.style.display = 'none'; // Hide form if not creator
        }

        // --- Attach Delegated Event Listeners to the Main Container ---
        pageContainer.addEventListener('click', (evt) => {
            const btn = evt.target.closest('button'); // Target buttons specifically
            if (!btn || btn.disabled) return;

            // User Management Buttons (inside challenge view)
            const authorizeBtn = btn.closest('#authorizeUserBtn');
            const removeBtn = btn.closest('.remove-auth-user-btn');
            // Group Interaction Buttons
            const joinBtn = btn.closest('.join-group-btn');
            const leaveBtn = btn.closest('.leave-group-btn');
            // Player Name Save Button
            const savePlayersBtn = btn.closest('.save-player-names-btn');
            // Penalty Clear Button
            const clearPenaltyBtn = btn.closest('.clear-penalty-btn');
            const showOverlayBtn = document.getElementById('showOverlayLinkBtn');
            if (showOverlayBtn) {
                showOverlayBtn.addEventListener('click', handleShowOverlayLink);
                console.log("Attached listener for showOverlayLinkBtn");
            } else {
                // Only log warning if it's NOT a local challenge page
                const dataEl = document.getElementById('challengeData');
                const isLocal = dataEl?.dataset?.isLocal === 'true';
                if (!isLocal) { // Only warn if it's expected (shared challenge)
                    console.warn("showOverlayLinkBtn not found (expected on shared challenge view).");
                }
            }
            if (authorizeBtn) { handleAuthorizeUserClick(authorizeBtn); return; }
            if (removeBtn) { handleRemoveUserClick(removeBtn); return; }
            if (joinBtn) { handleJoinGroupClick(evt, joinBtn); return; }
            if (leaveBtn) { handleLeaveGroupClick(evt, leaveBtn); return; }
            if (savePlayersBtn) { handleSavePlayersClick(evt, savePlayersBtn); return; }
            if (clearPenaltyBtn) { handleClearPenaltyClick(evt, clearPenaltyBtn); return; }



        });

        // Attach change listener for progress checkboxes (delegated)
        pageContainer.addEventListener('change', handleProgressChange);
    }

}); // End DOMContentLoaded