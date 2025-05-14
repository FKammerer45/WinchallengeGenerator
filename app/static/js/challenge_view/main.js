// static/js/challenge_view/main.js
// Main orchestrator for the unified challenge view page (challenge.html).
// Handles state, user interactions, API calls, coordinates UI updates, and timer.

// Import necessary modules (assuming these exist and are correct)
import { apiFetch } from '../utils/api.js';
import { setLoading, showError, showSuccess, escapeHtml, showFlash } from '../utils/helpers.js';
import {
    updateGroupCountDisplay, renderProgressItems, addGroupToDOM,
    updateUIAfterMembershipChange, // Use the imported version directly
    renderOrUpdateProgressBar,
    renderStaticChallengeDetailsJS, updatePenaltyDisplay, renderPlayerNameInputs
} from './ui.js';
import { getLocalChallengeById, updateLocalChallengeProgress } from '../utils/local_storage.js';
import { updatePenaltyConfig } from './penalty.js';
import {
    initializeTimer,
    handleServerTimerStarted,
    handleServerTimerStopped,
    handleServerTimerReset,
    updateTimerStateFromServer
} from './timer.js';
import { initializeChallengeSockets } from './socket_handler.js';
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
        removeUserBase: null,
        timerStart: null,
        timerStop: null,
        timerReset: null
    },
    isLoggedIn: false,
    isCreator: false,
    isAuthorized: false,
    initialTimerState: {
        current_value_seconds: 0,
        is_running: false,
        last_started_at_utc: null
    }
};
let userPenaltyTabsData = { tabs: {}, entries: {} };
let requestControllers = { // For aborting API requests
    joinLeaveGroup: null,
    createGroup: null,
    updatePlayers: null,
    progress: null,
    penalty: null,
    timer: null,
    authorization: null
};
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

function lockButton(btn, label = "Processing...") {
    if (!btn) return;
    // Use the imported setLoading function for consistent behavior
    setLoading(btn, true, label);
    // console.log(`[MainJS lockButton] Button ${btn.id} locked.`);
}

function restoreButton(btn) {
    if (!btn) return;
    // Use the imported setLoading function
    setLoading(btn, false); // setLoading(false) should restore original text
    // console.log(`[MainJS restoreButton] Button ${btn.id} restored.`);
}


async function loadPenaltyDataForChallengeView(currentChallengeConfig) {
    if (!currentChallengeConfig.isLoggedIn || !currentChallengeConfig.penaltyInfo?.tab_id) {
        console.log("[MainJS CV] Skipping penalty data load: Not logged in or no penalty tab ID for this challenge.");
        // Ensure penaltyPageConfig in penalty.js is updated even if no data is loaded
        if (typeof updatePenaltyConfig === 'function') {
            updatePenaltyConfig(currentChallengeConfig);
        }
        return;
    }

    console.log("[MainJS CV] Penalties are active. Fetching user's penalty tabs for window.userPenaltyTabsData.");
    const csrfToken = currentChallengeConfig.csrfToken;

    try {
        // 1. Fetch system default penalty definitions (if not already globally available or needed for merge logic)
        // For challenge view, primarily for reference if SYSTEM_DEFAULT_PENALTY_TABS is used elsewhere in this view's logic.
        if (Object.keys(systemDefaultPenaltyTabs).length === 0) { // Changed to use module-scoped variable
            const systemDefaultsApiResponse = await apiFetch('/api/penalties/default_definitions');
            if (typeof systemDefaultsApiResponse === 'object' && systemDefaultsApiResponse !== null) {
                systemDefaultPenaltyTabs = systemDefaultsApiResponse; // Assign to module-scoped
            } else {
                systemDefaultPenaltyTabs = {};
            }
        }

        // 2. Fetch user's saved penalty tabs
        const userSavedPenaltyTabsApi = await apiFetch('/api/penalties/load_tabs', {}, csrfToken);
        
        // Reset module-scoped userPenaltyTabsData before populating
        userPenaltyTabsData.tabs = {};
        userPenaltyTabsData.entries = {};

        if (typeof userSavedPenaltyTabsApi === 'object' && userSavedPenaltyTabsApi !== null) {
            for (const tabId in userSavedPenaltyTabsApi) {
                const tabData = userSavedPenaltyTabsApi[tabId];
                if (tabData) { 
                    userPenaltyTabsData.tabs[tabId] = { name: tabData.tab_name || `Penalty Tab ${tabId}` };
                    userPenaltyTabsData.entries[tabId] = tabData.penalties || [];
                }
            }
            console.log("[MainJS CV] Populated module-scoped userPenaltyTabsData with API data:", JSON.parse(JSON.stringify(userPenaltyTabsData)));
            
            // Make it available globally IF penalty.js absolutely needs it globally.
            // It's better if penalty.js can accept this data or access it via a getter.
            // For now, let's ensure window.userPenaltyTabsData is updated as penalty.js expects.
            window.userPenaltyTabsData = userPenaltyTabsData;

        } else {
            console.warn("[MainJS CV] No saved penalty tabs returned from API or invalid format for userPenaltyTabsData.");
             window.userPenaltyTabsData = { tabs: {}, entries: {} }; // Ensure it's an empty object
        }
    } catch (error) {
        console.error("[MainJS CV] Error fetching user's penalty tab data:", error);
        if(statusDiv) showPageError(statusDiv, "Could not load your penalty configurations.", "warning");
        window.userPenaltyTabsData = { tabs: {}, entries: {} }; // Ensure it's an empty object on error
    }

    // After data is potentially loaded, update penalty.js's config
    if (typeof updatePenaltyConfig === 'function') {
        updatePenaltyConfig(currentChallengeConfig); // Pass the main challengeConfig
    }
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
function handleSocketInitialState(event) {
    const freshInitialState = event.detail;
    console.log('[MainJS] Handling socketInitialStateReceived:', JSON.parse(JSON.stringify(freshInitialState)));
    // Update the global challengeConfig with the fresh state
    if (freshInitialState) {
        challengeConfig.coreChallengeStructure = freshInitialState.challenge_structure || challengeConfig.coreChallengeStructure;
        // Use 'all_groups_data' if present from initial_state, otherwise keep existing 'initialGroups'
        challengeConfig.initialGroups = freshInitialState.all_groups_data || challengeConfig.initialGroups || [];
        challengeConfig.userJoinedGroupId = freshInitialState.user_group ? freshInitialState.user_group.id : null;
        challengeConfig.initialGroupCount = challengeConfig.initialGroups?.length || 0;
        challengeConfig.penaltyInfo = freshInitialState.penalty_info || challengeConfig.penaltyInfo;
        // Update initialTimerState in config as well, for consistency if other parts need it
        challengeConfig.initialTimerState = freshInitialState.timer_state || challengeConfig.initialTimerState;

        // Explicitly update timer.js module with the fresh timer state
        if (freshInitialState.timer_state) {
            console.log("[MainJS] Calling updateTimerStateFromServer with data from socket 'initial_state'.");
            updateTimerStateFromServer(freshInitialState.timer_state);
        } else {
             console.warn("[MainJS] 'initial_state' received from socket is missing 'timer_state'. Timer might not reflect server status.");
        }
        // Refresh the main UI based on the new comprehensive state
        // Ensure containers are defined before calling UI updates
        if (myGroupContainerEl && otherGroupsContainerEl) {
             updateUIAfterMembershipChange(challengeConfig, myGroupContainerEl, otherGroupsContainerEl);
             updateGroupCountDisplay(challengeConfig.initialGroupCount, challengeConfig.maxGroups);
        }
        if (typeof updatePenaltyConfig === 'function') updatePenaltyConfig(challengeConfig); // Update penalty module too
    }
}

function handleSocketGroupCreated(newGroupData) {
    console.log("[MainJS] Handling socketGroupCreated:", newGroupData);
    if (!challengeConfig || !challengeConfig.initialGroups) return;
    if (challengeConfig.initialGroups.some(g => g.id === newGroupData.id)) return; // Avoid duplicates

    challengeConfig.initialGroups.push(newGroupData);
    challengeConfig.initialGroupCount = challengeConfig.initialGroups.length;

    if (myGroupContainerEl && otherGroupsContainerEl) {
        addGroupToDOM(newGroupData, challengeConfig, myGroupContainerEl, otherGroupsContainerEl); // Assuming addGroupToDOM exists in ui.js
        updateGroupCountDisplay(challengeConfig.initialGroupCount, challengeConfig.maxGroups);
        updateUIAfterMembershipChange(challengeConfig, myGroupContainerEl, otherGroupsContainerEl); // Re-sort/style
    }
}

function handleSocketGroupMembershipUpdate(updateData) {
    console.log("[MainJS] Handling socketGroupMembershipUpdate:", updateData);
    if (!challengeConfig || !challengeConfig.initialGroups) return;
    const groupIndex = challengeConfig.initialGroups.findIndex(g => g.id === updateData.group_id);
    if (groupIndex !== -1) {
        challengeConfig.initialGroups[groupIndex].member_count = updateData.member_count;
        challengeConfig.initialGroups[groupIndex].player_names = updateData.player_names || [];
        if (myGroupContainerEl && otherGroupsContainerEl) {
            updateUIAfterMembershipChange(challengeConfig, myGroupContainerEl, otherGroupsContainerEl);
        }
    }
}

function handleSocketPlayerNamesUpdated(updateData) {
    console.log("[MainJS] Handling socketPlayerNamesUpdated:", updateData);
    if (!challengeConfig || !challengeConfig.initialGroups) return;
    const groupIndex = challengeConfig.initialGroups.findIndex(g => g.id === updateData.group_id);
    if (groupIndex !== -1) {
        challengeConfig.initialGroups[groupIndex].player_names = updateData.player_names || [];
        if (myGroupContainerEl && otherGroupsContainerEl) {
            // This should handle re-rendering the player name inputs within the specific card
            updateUIAfterMembershipChange(challengeConfig, myGroupContainerEl, otherGroupsContainerEl);
        }
    }
}

/**
 * Reads configuration data from the hidden #challengeData div in the HTML
 * and populates the challengeConfig object.
 * @returns {boolean} True if initialization is successful, false otherwise.
 */
function initializeConfigFromDOM() {
    const dataEl = document.getElementById('challengeData');
    statusDiv = document.getElementById('pageStatusDisplay');

    if (!dataEl?.dataset) {
        console.error("CRITICAL: #challengeData element or its dataset is missing!");
        showError(statusDiv || document.body, "Initialization Error: Cannot read page data.", "danger");
        return false;
    }
    try {
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
            isLoggedIn: dataEl.dataset.isLoggedIn,
            isCreator: dataEl.dataset.isCreator,
            isAuthorized: dataEl.dataset.isAuthorized,
            penaltyInfo: dataEl.dataset.penaltyInfo,
            addGroupUrl: dataEl.dataset.addGroupUrl,
            updateProgressUrlBase: dataEl.dataset.updateProgressUrlBase,
            joinLeaveUrlBase: dataEl.dataset.joinLeaveUrlBase,
            setPenaltyUrlBase: dataEl.dataset.setPenaltyUrlBase,
            savePlayersUrlBase: dataEl.dataset.savePlayersUrlBase,
            authorizeUserUrl: dataEl.dataset.authorizeUserUrl,
            removeUserUrlBase: dataEl.dataset.removeUserUrlBase,
            profileUrl: dataEl.dataset.profileUrl,
            timerCurrentValue: dataEl.dataset.timerCurrentValue,
            timerIsRunning: dataEl.dataset.timerIsRunning,
            timerLastStartedUtc: dataEl.dataset.timerLastStartedUtc,
            timerStartUrl: dataEl.dataset.timerStartUrl,
            timerStopUrl: dataEl.dataset.timerStopUrl,
            timerResetUrl: dataEl.dataset.timerResetUrl
        };

        const joinedId = JSON.parse(rawData.userJoinedGroupId || 'null');
        const coreStructure = rawData.challengeJson && rawData.challengeJson !== 'null' ? JSON.parse(rawData.challengeJson) : null;
        const parsedMaxGroups = parseInt(rawData.maxGroups, 10);
        const parsedNumPlayers = parseInt(rawData.numPlayersPerGroup, 10);
        const initialGroupsData = rawData.initialGroups && rawData.initialGroups !== 'null' ? JSON.parse(rawData.initialGroups) : [];

        challengeConfig = {
            id: rawData.challengeId, // This is the public_id
            isLocal: rawData.isLocal === 'true',
            isMultigroup: rawData.isMultigroup === 'true',
            maxGroups: (!isNaN(parsedMaxGroups) && parsedMaxGroups >= 1) ? parsedMaxGroups : 1,
            initialGroupCount: Array.isArray(initialGroupsData) ? initialGroupsData.length : 0,
            userJoinedGroupId: typeof joinedId === 'number' ? joinedId : null,
            coreChallengeStructure: coreStructure,
            progressData: {}, // Only for local challenges
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
                profile: rawData.profileUrl,
                timerStart: rawData.timerStartUrl,
                timerStop: rawData.timerStopUrl,
                timerReset: rawData.timerResetUrl
            },
            isLoggedIn: rawData.isLoggedIn === 'true',
            isCreator: rawData.isCreator === 'true',
            isAuthorized: rawData.isAuthorized === 'true',
            initialTimerState: {
                current_value_seconds: parseInt(rawData.timerCurrentValue, 10) || 0,
                is_running: rawData.timerIsRunning === 'true',
                last_started_at_utc: rawData.timerLastStartedUtc || null
            }
        };

        if (!challengeConfig.id) {
            throw new Error("Essential config 'challengeId' (public_id) missing or invalid.");
        }
        console.log("[MainJS] Initial Challenge Config:", JSON.parse(JSON.stringify(challengeConfig)));
        return true;

    } catch (e) {
        console.error("challenge_view.js: Failed to parse or process initial data:", e);
        showError(statusDiv || document.body, `Initialization Error: ${e.message}`, 'danger');
        return false;
    }
}

async function handleRequestTimerStart(event) {
    const timerIdSuffix = event.detail?.timerId || 'main';
    if (challengeConfig.isLocal || !challengeConfig.urls.timerStart || !challengeConfig.isAuthorized) return;
    const btn = document.getElementById(`btnStart-${timerIdSuffix}`);
    if (!btn) { console.error(`[MainJS] Start button for timer ${timerIdSuffix} not found.`); return; }

    lockButton(btn, 'Starting...');
    try {
        await apiFetch(challengeConfig.urls.timerStart, { method: 'POST', signal: nextSignal('timer', requestControllers) }, challengeConfig.csrfToken);
        console.log(`[MainJS] Timer start request successful for ${timerIdSuffix}. Waiting for WebSocket event.`);
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error(`[MainJS] Failed to start timer ${timerIdSuffix} API:`, error);
            showError(statusDiv, `Error starting timer: ${error.message}`, 'danger');
            // Revert optimistic UI update in timer.js if API fails
            // Send a mock "stopped" state based on current data
            // Note: Need access to the current state before the failed attempt
            updateTimerStateFromServer({
                current_value_seconds: challengeConfig.initialTimerState?.current_value_seconds || 0, // Use a known value
                is_running: false,
                last_started_at_utc: null
            });
        }
    } finally {
        if (btn) restoreButton(btn);
    }
}
async function handleRequestTimerStop(event) {
    const timerIdSuffix = event.detail?.timerId || 'main';
    if (challengeConfig.isLocal || !challengeConfig.urls.timerStop || !challengeConfig.isAuthorized) return;
    const btn = document.getElementById(`btnStop-${timerIdSuffix}`);
    if (!btn) { console.error(`[MainJS] Stop button for timer ${timerIdSuffix} not found.`); return; }

    lockButton(btn, 'Stopping...');
    try {
        await apiFetch(challengeConfig.urls.timerStop, { method: 'POST', signal: nextSignal('timer', requestControllers) }, challengeConfig.csrfToken);
        console.log(`[MainJS] Timer stop request successful for ${timerIdSuffix}. Waiting for WebSocket event.`);
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error(`[MainJS] Failed to stop timer ${timerIdSuffix} API:`, error);
            showError(statusDiv, `Error stopping timer: ${error.message}`, 'danger');
            // Revert optimistic stop if API fails
            updateTimerStateFromServer({
                current_value_seconds: challengeConfig.initialTimerState?.current_value_seconds || 0, // Revert to a known good state
                is_running: true, // Assume it was running before failed stop
                last_started_at_utc: challengeConfig.initialTimerState?.last_started_at_utc || null
            });
        }
    } finally {
        if (btn) restoreButton(btn);
    }
}
async function handleRequestTimerReset(event) {
    const timerIdSuffix = event.detail?.timerId || 'main';
    if (challengeConfig.isLocal || !challengeConfig.urls.timerReset || !challengeConfig.isAuthorized) return;
    const btn = document.getElementById(`btnReset-${timerIdSuffix}`);
    if (!btn) { console.error(`[MainJS] Reset button for timer ${timerIdSuffix} not found.`); return; }

    lockButton(btn, 'Resetting...');
    try {
        await apiFetch(challengeConfig.urls.timerReset, { method: 'POST', signal: nextSignal('timer', requestControllers) }, challengeConfig.csrfToken);
        console.log(`[MainJS] Timer reset request successful for ${timerIdSuffix}. Waiting for WebSocket event.`);
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error(`[MainJS] Failed to reset timer ${timerIdSuffix} API:`, error);
            showError(statusDiv, `Error resetting timer: ${error.message}`, 'danger');
            // If reset fails, UI might be optimistically at 0. Server state is unknown.
            // A full state refresh might be best, or revert to previous known state.
        }
    } finally {
        if (btn) restoreButton(btn);
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
        // Make the API call
        const data = await apiFetch(
            `${challengeConfig.urls.joinLeaveBase}/${groupId}/join`,
            { method: 'POST', signal: nextSignal('join') },
            challengeConfig.csrfToken);

        // --- START: Update Frontend State from API Response ---
        if (data && data.status === 'success' && data.group_data) {
            const updatedGroupData = data.group_data;

            // Find the index of the group in our local config array
            const groupIndex = challengeConfig.initialGroups.findIndex(g => g.id === groupId);

            if (groupIndex !== -1) {
                // Update the player_names and member_count for this group in the local state
                challengeConfig.initialGroups[groupIndex].player_names = updatedGroupData.player_names || [];
                challengeConfig.initialGroups[groupIndex].member_count = updatedGroupData.member_count ?? (challengeConfig.initialGroups[groupIndex].member_count || 0); // Use count from response
                console.log(`[Join Success] Updated local state for group ${groupId}:`, challengeConfig.initialGroups[groupIndex]);
            } else {
                console.warn(`[Join Success] Could not find group ${groupId} in local state to update player names.`);
                // Potentially add the group if it was missing? Less likely scenario.
            }

            // Update the central state variable for the joined group ID
            updateUserJoinedGroupState(groupId);

        } else if (data && data.status === 'success' && data.message.includes("already in this group")) {
            // If user was already in the group, still update the joined state just in case
            updateUserJoinedGroupState(groupId);
            console.log("[Join] User already in group, ensuring state is correct.");
        } else {
            // Handle cases where API call succeeded but didn't return expected data
            throw new Error(data?.message || data?.error || 'Join request completed but response was unclear.');
        }
        // --- END: Update Frontend State ---


        // --- UI Update (Moving card is handled by updateUIAfterMembershipChange now) ---
        // The updateUIAfterMembershipChange function will now read the updated
        // challengeConfig (with the correct userJoinedGroupId and player_names)
        // and render everything correctly, including moving the card and showing the names.
        console.log("[Join Success] Calling updateUIAfterMembershipChange to refresh UI...");
        updateUIAfterMembershipChange(challengeConfig, myGroupContainerEl, otherGroupsContainerEl);
        showFlash(data.message || "Joined group!", 'success'); // Show success flash


    } catch (err) {
        console.error('join failed', err);
        showError(footer || statusDiv, `Error joining: ${err.message}`, 'danger');
        // Optional: If join failed, maybe refresh UI to revert any optimistic changes?
        // updateUIAfterMembershipChange(challengeConfig, myGroupContainerEl, otherGroupsContainerEl);
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

    const groupId = Number(saveBtn.dataset.groupId);
    // ... (Authorization checks remain the same) ...
    const isJoinedGroup = (challengeConfig.userJoinedGroupId === groupId);
    if (!challengeConfig.isLoggedIn || !challengeConfig.isAuthorized || !isJoinedGroup) {
        showFlash("You must be logged in, authorized, and in this group to save player names.", "warning");
        return;
    }
    if (Number.isNaN(groupId)) return;


    const section = saveBtn.closest('.player-names-section');
    if (!section) return;

    const inputs = section.querySelectorAll('.player-name-input');
    const errBox = section.querySelector('.player-name-error');

    // --- FIX: Read display names from inputs ---
    // Create an array matching the number of slots expected
    const displayNames = Array.from({ length: challengeConfig.numPlayersPerGroup || 1 }, (_, i) => {
        const input = section.querySelector(`.player-name-input[data-slot-index="${i}"]`);
        // Return trimmed value or empty string if input not found for a slot
        return input ? input.value.trim() : "";
    });
    // --- END FIX ---

    showError(errBox, null); // Clear previous errors

    // Optional: Add validation for name length if desired
    if (displayNames.some(name => name.length > 50)) {
        showError(errBox, `Display names cannot exceed 50 characters.`);
        return;
    }

    lockButton(saveBtn, 'Saving…');

    try {
        const url = `${challengeConfig.urls.savePlayersBase}/${groupId}/players`;
        // --- FIX: Send only display names ---
        const payload = { player_display_names: displayNames };
        // --- END FIX ---
        console.log("Saving player display names:", payload); // Debug log
        const data = await apiFetch(url, { method: 'POST', body: payload, signal: nextSignal('savePlayers') }, challengeConfig.csrfToken);

        if (data.status !== 'success' && data.status !== 'ok') { // Check for 'ok' too if no changes
            throw new Error(data.error || 'Unknown error saving names');
        }

        showSuccess(errBox, data.message || 'Names saved!');
        setTimeout(() => showSuccess(errBox, null), 2500);

        // --- Update local state ---
        const groupIndex = challengeConfig.initialGroups.findIndex(x => x.id === groupId);
        if (groupIndex !== -1) {
            // Ensure the player_names array exists and has the right structure
            let slots = challengeConfig.initialGroups[groupIndex].player_names;
            if (!Array.isArray(slots) || slots.length !== displayNames.length || !slots.every(s => typeof s === 'object')) {
                // If format is wrong, re-initialize based on current members (less ideal but fallback)
                console.warn("Re-initializing player_names structure in local state during save.");
                slots = Array.from({ length: displayNames.length }, () => ({ display_name: "", account_name: null }));
                // Ideally, fetch fresh group data here instead of guessing
            }
            // Update display names in the local state
            for (let i = 0; i < displayNames.length; i++) {
                if (slots[i]) { // Check if slot object exists
                    slots[i].display_name = displayNames[i];
                }
            }
            challengeConfig.initialGroups[groupIndex].player_names = slots; // Assign back
            updatePenaltyConfig(challengeConfig); // Notify penalty module if needed
        }
        // --- End Update local state ---

    } catch (err) {
        console.error('save players failed', err);
        showError(errBox, `Error: ${err.message}`);
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
document.addEventListener('DOMContentLoaded', async() => {
    pageContainer = document.getElementById('challengeViewContainer');
    if (!pageContainer) { console.error("CRITICAL: #challengeViewContainer missing!"); return; }

    // 1. Read config from DOM (sets challengeConfig, statusDiv)
    if (!initializeConfigFromDOM()) { return; }
    if (challengeConfig.isLoggedIn && challengeConfig.isCreator && challengeConfig.penaltyInfo?.source_tab_id) {
        await loadPenaltyDataForChallengeView(challengeConfig); 
    } else if (typeof updatePenaltyConfig === 'function') {
        // For non-creators or if penalties are disabled, still pass config for isLocal, etc.
        updatePenaltyConfig(challengeConfig);
    }
    let initialTimerStateForSetup;
    let isAuthorizedForSetup;
    if (challengeConfig.isLocal) {
        const localChallengeData = typeof getLocalChallengeById === 'function' ? getLocalChallengeById(challengeConfig.id) : null;
        initialTimerStateForSetup = localChallengeData?.timerState || challengeConfig.initialTimerState || { currentValueSeconds: 0, isRunning: false, lastStartedAtUTC: null }; // Provide default
        isAuthorizedForSetup = true;
        console.log("[MainJS] Initializing LOCAL timer with data:", initialTimerStateForSetup);
    } else {
        initialTimerStateForSetup = challengeConfig.initialTimerState || { currentValueSeconds: 0, isRunning: false, lastStartedAtUTC: null }; // Provide default
        isAuthorizedForSetup = challengeConfig.isAuthorized;
        console.log("[MainJS] Initializing SHARED timer with HTML data:", initialTimerStateForSetup);
    }
    // Call initializeTimer which sets up internal state and starts interval if needed
    initializeTimer(TIMER_ID, initialTimerStateForSetup, isAuthorizedForSetup);

    // --- Branch Logic: Local vs. Database Challenge ---
    if (challengeConfig.isLocal) {
        // --- LOCAL CHALLENGE SETUP ---
        console.log("[MainJS] Setting up UI and listeners for LOCAL challenge.");
        const localData = typeof getLocalChallengeById === 'function' ? getLocalChallengeById(challengeConfig.id) : null;
        if (localData) {
            challengeConfig.coreChallengeStructure = localData.challengeData || {};
            challengeConfig.progressData = localData.progressData || {};
            challengeConfig.penaltyInfo = localData.penalty_info || null

            const titleEl = document.getElementById('local-challenge-title');
            const rulesContainer = document.getElementById('local-rules-content');
            const progressBarContainer = document.getElementById('local-group-card')?.querySelector('.progress-bar-container');
            const progressItemsContainer = document.getElementById('local-group-card')?.querySelector('.group-progress-container');
            const penaltySectionContainer = document.getElementById('local-penalty-section-container');
            const penaltyBody = document.getElementById('local-penalty-body');
            const penaltyButton = penaltyBody?.querySelector('.lostGameBtn-local');
            const activePenaltyDisplay = document.getElementById('local-group-card')?.querySelector('.active-penalty-display');

            if (titleEl) titleEl.textContent = localData.name || 'Local Challenge';
            if (rulesContainer && challengeConfig.coreChallengeStructure) renderStaticChallengeDetailsJS(rulesContainer, challengeConfig.coreChallengeStructure);
            else if (rulesContainer) rulesContainer.innerHTML = '<p class="text-muted small">Rules not available.</p>';
            if (progressBarContainer && challengeConfig.coreChallengeStructure) renderOrUpdateProgressBar(progressBarContainer, challengeConfig.coreChallengeStructure, challengeConfig.progressData);
            else if (progressBarContainer) progressBarContainer.innerHTML = '<p class="text-muted small">Progress bar unavailable.</p>';

            if (progressItemsContainer && challengeConfig.coreChallengeStructure) {
                renderProgressItems(progressItemsContainer, challengeConfig.coreChallengeStructure, challengeConfig.id, challengeConfig.progressData, true);
                const localCard = document.getElementById('local-group-card');
                if (localCard) localCard.addEventListener('change', handleProgressChange);
                else console.error("Cannot attach progress listener: local card not found.");
            } else if (progressItemsContainer) {
                progressItemsContainer.innerHTML = '<p class="text-muted small">Progress items unavailable.</p>';
            }

            if (penaltySectionContainer && penaltyBody && penaltyButton && challengeConfig.penaltyInfo) {
                const tabId = challengeConfig.penaltyInfo.tab_id;
                if (tabId) {
                    penaltyButton.dataset.penaltyTabId = tabId;
                    penaltySectionContainer.style.display = 'block';
                } else console.warn("Local challenge has penalty info but no tab_id");
            }
            if (activePenaltyDisplay && localData.active_penalty_text) updatePenaltyDisplay(challengeConfig.id, localData.active_penalty_text);
            // initializeTimer('main') was already called above for local challenges.
            if (challengeConfig.penaltyInfo && typeof updatePenaltyConfig === 'function') {
                updatePenaltyConfig({
                    userJoinedGroupId: challengeConfig.id, numPlayersPerGroup: 1,
                    isMultigroup: false, initialGroups: [{ id: challengeConfig.id, player_names: ['You'] }]
                });
            }
        } else {
            const errorMsg = `Error: Could not load local challenge data (ID: ${escapeHtml(challengeConfig.id)}).`;
            showError(statusDiv || document.body, errorMsg, 'danger');
        }
    } else {
        // --- SHARED (DATABASE) CHALLENGE SETUP ---
        console.log("[MainJS] Setting up UI and listeners for SHARED challenge.");
        myGroupContainerEl = document.getElementById('myGroupContainer');
        otherGroupsContainerEl = document.getElementById('otherGroupsContainer');

        if (!myGroupContainerEl || !otherGroupsContainerEl) {
            console.error("Essential DB challenge elements missing (#myGroupContainer or #otherGroupsContainer)!");
            showError(statusDiv || document.body, "Initialization Error: Page structure for shared challenge is incomplete.", "danger");
            return;
        }

        // Attach listeners for socket events (dispatched by socket_handler)
        document.addEventListener('socketInitialStateReceived', handleSocketInitialState);
        document.addEventListener('socketGroupCreated', (event) => handleSocketGroupCreated(event.detail));
        document.addEventListener('socketGroupMembershipUpdate', (event) => handleSocketGroupMembershipUpdate(event.detail));
        document.addEventListener('socketPlayerNamesUpdated', (event) => handleSocketPlayerNamesUpdated(event.detail));

        // Attach listeners for timer requests (dispatched by timer.js)
        document.addEventListener('requestTimerStart', handleRequestTimerStart);
        document.addEventListener('requestTimerStop', handleRequestTimerStop);
        document.addEventListener('requestTimerReset', handleRequestTimerReset);
        console.log("[MainJS] Listeners for socket events and timer requests attached.");

        try {
            updateUIAfterMembershipChange(challengeConfig, myGroupContainerEl, otherGroupsContainerEl);
            const theOnlyGroup = challengeConfig.initialGroups?.[0];
            if (!challengeConfig.isMultigroup && theOnlyGroup && challengeConfig.isLoggedIn &&
                challengeConfig.isAuthorized && challengeConfig.userJoinedGroupId === null &&
                theOnlyGroup.member_count < challengeConfig.numPlayersPerGroup
            ) {
                console.log(`Auto-joining authorized user to single group ${theOnlyGroup.id}...`);
                const card = otherGroupsContainerEl?.querySelector(`.group-card-wrapper[data-group-id="${theOnlyGroup.id}"]`);
                if (card) {
                    myGroupContainerEl.innerHTML = '';
                    const h = document.createElement('h4');
                    h.className = 'text-primary-accent mb-3 text-center';
                    h.textContent = 'Your Group';
                    myGroupContainerEl.appendChild(h);
                    card.classList.remove(...OTHER_GROUP_COL_CLASSES);
                    card.classList.add(...JOINED_GROUP_COL_CLASSES);
                    myGroupContainerEl.appendChild(card);
                } else console.warn("Could not find card visually for single group auto-join move.");
                autoJoinGroup(theOnlyGroup.id);
            }
            updateGroupCountDisplay(challengeConfig.initialGroupCount, challengeConfig.maxGroups);
            if (typeof updatePenaltyConfig === 'function') updatePenaltyConfig(challengeConfig);
        } catch (uiError) {
            console.error("Error during initial UI update for DB challenge:", uiError);
            showError(statusDiv, "Error initializing UI state for shared challenge.", "danger");
        }

        // Add Group Form listener
        const addGroupForm = document.getElementById('addGroupForm');
        if (addGroupForm && challengeConfig.isCreator) {
            addGroupForm.addEventListener('submit', handleCreateGroupSubmit);
        } else if (addGroupForm) {
            addGroupForm.style.display = 'none';
        }

        // Initialize Socket Connection AFTER setting up listeners that depend on socket events
        initializeChallengeSockets(challengeConfig, statusDiv);
    } // End shared challenge setup

    // --- Common Setup (Listeners attached to pageContainer) ---
    const showOverlayBtn = document.getElementById('showOverlayLinkBtn');
    if (showOverlayBtn) {
        showOverlayBtn.addEventListener('click', handleShowOverlayLink);
    } else {
        if (!challengeConfig.isLocal) {
            console.warn("showOverlayLinkBtn not found (expected on shared challenge view).");
        }
    }

    // Delegated event listeners for actions within pageContainer
    pageContainer.addEventListener('click', (evt) => {
        const btn = evt.target.closest('button');
        if (!btn || btn.disabled) return;
        if (btn.id === 'authorizeUserBtn') { handleAuthorizeUserClick(btn); return; }
        if (btn.classList.contains('remove-auth-user-btn')) { handleRemoveUserClick(btn); return; }
        if (btn.classList.contains('join-group-btn')) { handleJoinGroupClick(evt, btn); return; }
        if (btn.classList.contains('leave-group-btn')) { handleLeaveGroupClick(evt, btn); return; }
        if (btn.classList.contains('save-player-names-btn')) { handleSavePlayersClick(evt, btn); return; }
        if (btn.classList.contains('clear-penalty-btn')) { handleClearPenaltyClick(evt, btn); return; }
    });

    // Delegated change listener for progress checkboxes (shared challenges)
    // Local challenge progress listener is attached specifically to its card above
    if (!challengeConfig.isLocal) {
        pageContainer.addEventListener('change', handleProgressChange);
    }

}); // End DOMContentLoaded