// app/static/js/challenge_view/main.js
// Main orchestrator for the unified challenge view page (challenge.html).

import { apiFetch } from '../utils/api.js'; // Though actions modules will use this primarily
import { setLoading, showError, showFlash, escapeHtml, confirmModal } from '../utils/helpers.js'; // Added confirmModal
import { getLocalChallengeById, updateLocalChallengeProgress } from '../utils/local_storage.js';

// Configuration
import { challengeConfig, initializeConfigFromDOM, updateUserJoinedGroupState } from './config.js';

// UI Modules
import {
    orchestrateGroupUIRefresh as orchestrateUIAfterStateChange, // Alias to match usage
    updateGroupCountDisplay,
    // renderPlayerNameInputs, // This function is called by uiOrchestrator/groupCard, not directly in main.js
    updatePenaltyDisplay as updateGlobalPenaltyDisplay // General penalty display update
} from './ui/uiOrchestrator.js';
import { renderChallengeRules, updateChallengeInfoDisplay } from './ui/challengeInfo.js';
import { updateGroupCardContents } from './ui/groupCard.js'; // Import for local challenge setup
// Progress display functions are now typically called from uiOrchestrator or groupCard
// import { renderProgressItems, renderOrUpdateProgressBar } from './ui/progressDisplay.js';


// Realtime Modules
import { initializeChallengeSockets, disconnectChallengeSockets } from './realtime/socketHandler.js';
import { initializeTimer, updateTimerStateFromServer } from './realtime/timerHandler.js';
import { updatePenaltyConfig as updatePenaltyHandlerConfig, triggerRemotePenaltySpinAnimation } from './realtime/penaltyHandler.js';


// Action Modules
import {
    handleCreateGroup,
    handleJoinLeaveGroup,
    handleSavePlayerNames,
    handleDeleteGroup // Added handleDeleteGroup
} from './actions/groupActions.js';
import {
    handleProgressUpdate,
    handleClearPenalty,
    handleAuthorizeUser,
    handleRemoveAuthorization,
    handleUpdateChallengePenalties, // For penalty set changes
    handleDisableChallengePenalties // For disabling penalties
} from './actions/challengeActions.js';
import { handleShowOverlayLink } from './actions/overlayActions.js';

// Import removeGroupFromConfig
import { removeGroupFromConfig } from './config.js';


// --- DOM Element References (fetched in DOMContentLoaded) ---
let pageContainer = null;
let myGroupContainerEl = null;
let otherGroupsContainerEl = null;
let statusDiv = null; // General page status/error display

// --- Constants ---
const TIMER_ID = 'main'; // Assuming a single main timer instance on this page

// --- Helper: Auto-join logic (simplified) ---
async function autoJoinGroupIfApplicable() {
    if (challengeConfig.isLocal || !challengeConfig.isLoggedIn || !challengeConfig.isAuthorized || challengeConfig.userJoinedGroupId !== null) {
        return;
    }
    const singleGroupToJoin = (!challengeConfig.isMultigroup && challengeConfig.initialGroups?.length === 1) ? challengeConfig.initialGroups[0] : null;

    if (singleGroupToJoin && singleGroupToJoin.member_count < challengeConfig.numPlayersPerGroup) {
        try {
            await handleJoinLeaveGroup(singleGroupToJoin.id, 'join'); // Uses the action handler
        } catch (err) {
            console.error('Auto-join failed:', err);
            if (statusDiv) showError(statusDiv, `Could not auto-join group: ${err.message}`, 'warning');
        }
    }
}


// --- Event Handlers for Sockets (dispatched by socketHandler.js) ---

function handleSocketInitialState(event) {
    const freshInitialState = event.detail;

    if (freshInitialState && freshInitialState.challenge_id === challengeConfig.id) {
        // Update challengeConfig with the fresh state
        challengeConfig.coreChallengeStructure = freshInitialState.challenge_structure || challengeConfig.coreChallengeStructure;
        challengeConfig.initialGroups = freshInitialState.all_groups_data || challengeConfig.initialGroups || [];
        challengeConfig.userJoinedGroupId = freshInitialState.user_group ? freshInitialState.user_group.id : null;
        challengeConfig.initialGroupCount = challengeConfig.initialGroups?.length || 0;
        challengeConfig.penaltyInfo = freshInitialState.penalty_info || challengeConfig.penaltyInfo;
        challengeConfig.name = freshInitialState.challenge_name || challengeConfig.name; // Update name if provided

        // Update initialTimerState in config.js as well, for consistency
        challengeConfig.initialTimerState = freshInitialState.timer_state || challengeConfig.initialTimerState;
        if (freshInitialState.timer_state) {
            updateTimerStateFromServer(freshInitialState.timer_state); // Update timer module
        }

        // Refresh the main UI
        if (myGroupContainerEl && otherGroupsContainerEl) {
            orchestrateUIAfterStateChange(challengeConfig, myGroupContainerEl, otherGroupsContainerEl);
            updateGroupCountDisplay(challengeConfig.initialGroupCount, challengeConfig.maxGroups);
            updateChallengeInfoDisplay(challengeConfig); // Update info bar
        }
        updatePenaltyHandlerConfig(challengeConfig); // Update penalty module's view of the config
    }
}

function handleSocketGroupCreated(event) {
    const newGroupData = event.detail;

    if (!challengeConfig.initialGroups.some(g => g.id === newGroupData.id)) {
        challengeConfig.initialGroups.push(newGroupData);
        challengeConfig.initialGroupCount = challengeConfig.initialGroups.length;

        if (myGroupContainerEl && otherGroupsContainerEl) {
            // addGroupToDOM is now part of uiOrchestrator logic or createGroupCardElement
            // orchestrateUIAfterStateChange will handle rendering new cards.
            orchestrateUIAfterStateChange(challengeConfig, myGroupContainerEl, otherGroupsContainerEl);
            updateGroupCountDisplay(challengeConfig.initialGroupCount, challengeConfig.maxGroups);
        }
    }
}

function handleSocketGroupMembershipUpdate(event) {
    const updateData = event.detail;

    const groupIndex = challengeConfig.initialGroups.findIndex(g => g.id === updateData.group_id);
    if (groupIndex !== -1) {
        challengeConfig.initialGroups[groupIndex].member_count = updateData.member_count;
        challengeConfig.initialGroups[groupIndex].player_names = updateData.player_names || [];

        // If this update concerns the current user joining/leaving
        if (updateData.user_id === challengeConfig.currentUserId) {
             updateUserJoinedGroupState(updateData.is_member_now ? updateData.group_id : null);
        }
         // Check if the current user joined *this* specific group
        if (updateData.joined_user_id && updateData.joined_user_id === challengeConfig.currentUserId) {
             updateUserJoinedGroupState(updateData.group_id);
        } else if (updateData.left_user_id && updateData.left_user_id === challengeConfig.currentUserId && challengeConfig.userJoinedGroupId === updateData.group_id) {
             updateUserJoinedGroupState(null);
        }


        if (myGroupContainerEl && otherGroupsContainerEl) {
            orchestrateUIAfterStateChange(challengeConfig, myGroupContainerEl, otherGroupsContainerEl);
        }
        updatePenaltyHandlerConfig(challengeConfig); // Player names might affect penalty wheel
    }
}

function handleSocketPlayerNamesUpdated(event) {
    const updateData = event.detail;

    const groupIndex = challengeConfig.initialGroups.findIndex(g => g.id === updateData.group_id);
    if (groupIndex !== -1) {
        challengeConfig.initialGroups[groupIndex].player_names = updateData.player_names || [];
        if (myGroupContainerEl && otherGroupsContainerEl) {
            orchestrateUIAfterStateChange(challengeConfig, myGroupContainerEl, otherGroupsContainerEl);
        }
        updatePenaltyHandlerConfig(challengeConfig); // Update penalty module as player names changed
    }
}

function handleSocketProgressUpdate(event) {
    const eventData = event.detail;

    const groupIndex = challengeConfig.initialGroups.findIndex(g => g.id === eventData.group_id);
    if (groupIndex !== -1) {
        challengeConfig.initialGroups[groupIndex].progress = eventData.progress_data || {};
        // The progress_stats from eventData can be used directly if uiOrchestrator's progress bar expects it
        // or uiOrchestrator can recalculate. Let's assume it recalculates or takes full progress_data.
        if (myGroupContainerEl && otherGroupsContainerEl) {
            orchestrateUIAfterStateChange(challengeConfig, myGroupContainerEl, otherGroupsContainerEl);
        }
    }
}

function handleSocketActivePenaltyUpdate(event) {
    const eventData = event.detail;

    const groupIndex = challengeConfig.initialGroups.findIndex(g => g.id === eventData.group_id);
    if (groupIndex !== -1) {
        challengeConfig.initialGroups[groupIndex].active_penalty_text = eventData.penalty_text || "";
        // UI update will be handled by orchestrateUIAfterStateChange if it checks this field
        // or a more specific call if needed.
        const cardWrapper = document.querySelector(`.group-card-wrapper[data-group-id="${eventData.group_id}"]`);
        if (cardWrapper) {
            const penaltyDisplayDiv = cardWrapper.querySelector('.active-penalty-display');
            const canInteract = challengeConfig.isLocal || (challengeConfig.isLoggedIn && challengeConfig.isAuthorized && challengeConfig.userJoinedGroupId === eventData.group_id);
            if (penaltyDisplayDiv) updateGlobalPenaltyDisplay(penaltyDisplayDiv, eventData.penalty_text || "", canInteract);
        }
    }
}

function handleSocketChallengePenaltiesUpdated(event) {
    const eventData = event.detail;

    if (eventData.challenge_id === challengeConfig.id) {
        challengeConfig.penaltyInfo = eventData.penalty_info;
        updatePenaltyHandlerConfig(challengeConfig); // Inform penaltyHandler.js
        updateChallengeInfoDisplay(challengeConfig); // Update general info display if it shows penalty source

        showFlash("This challenge's penalty set has been updated by the creator.", "info");
        // Potentially reset penalty wheel UI if user is in a group.
        // This is complex as it depends on current UI state of the wheel.
        // For now, the penaltyHandler will use the new set on next spin.
        if (challengeConfig.userJoinedGroupId) {
            const groupCard = document.querySelector(`.group-card-wrapper[data-group-id="${challengeConfig.userJoinedGroupId}"]`);
            const penaltySection = groupCard?.querySelector('.active-penalty-display'); // or wheel container
            if (penaltySection) {
                // Could call a reset function in penaltyHandler if one exists to clear current wheel display
                console.log("Penalty set changed, consider resetting wheel UI if active.");
            }
        }
    }
}
function handleSocketPenaltySpinResult(event) {
    const eventData = event.detail; 

    if (eventData.challenge_id === challengeConfig.id) {
        if (typeof triggerRemotePenaltySpinAnimation === "function") {
            triggerRemotePenaltySpinAnimation(eventData);
        } else {
            console.error("triggerRemotePenaltySpinAnimation is not available from penaltyHandler.js");
        }
    }
}

function handleSocketGroupDeleted(event) {
    const { challenge_id, group_id: deletedGroupId } = event.detail;

    if (challenge_id !== challengeConfig.id) {
        // console.log(`[MainJS] Received group_deleted event for a different challenge (${challenge_id}). Ignoring.`);
        return;
    }
    if (deletedGroupId === undefined) {
        console.error("[MainJS] Received socketGroupDeletedReceived event without group_id.");
        return;
    }

    console.log(`[MainJS] Received event to delete group: ${deletedGroupId} for current challenge.`);
    removeGroupFromConfig(deletedGroupId); // Update local config

    if (myGroupContainerEl && otherGroupsContainerEl) {
        orchestrateUIAfterStateChange(challengeConfig, myGroupContainerEl, otherGroupsContainerEl);
        updateGroupCountDisplay(challengeConfig.initialGroupCount, challengeConfig.maxGroups);
    }
    showFlash(`Group ${deletedGroupId} has been deleted.`, 'info');
}

// Handler for the local event dispatched by groupActions.js after successful API delete
function handleLocalGroupDeletionSuccess(event) {
    const { groupId: deletedGroupId } = event.detail;
    if (deletedGroupId === undefined) {
        console.error("[MainJS] Received localGroupSuccessfullyDeleted event without groupId.");
        return;
    }
    console.log(`[MainJS] Locally handling successful deletion of group: ${deletedGroupId}`);
    removeGroupFromConfig(deletedGroupId); 

    if (myGroupContainerEl && otherGroupsContainerEl) {
        orchestrateUIAfterStateChange(challengeConfig, myGroupContainerEl, otherGroupsContainerEl);
        updateGroupCountDisplay(challengeConfig.initialGroupCount, challengeConfig.maxGroups);
    }
    // Flash message is already shown by handleDeleteGroup in groupActions.js
}

function handleSocketUserKickedFromGroup(event) {
    const { challenge_id, group_id, user_id, reason } = event.detail;

    if (challenge_id !== challengeConfig.id) return; // Event not for this challenge

    if (user_id === challengeConfig.currentUserId && challengeConfig.userJoinedGroupId === group_id) {
        updateUserJoinedGroupState(null); // Update that user is no longer in this group
        showFlash("You have been removed from the group as it is being deleted.", "warning");
        
        // Trigger a UI refresh to reflect being out of the group
        if (myGroupContainerEl && otherGroupsContainerEl) {
            orchestrateUIAfterStateChange(challengeConfig, myGroupContainerEl, otherGroupsContainerEl);
            // Group count will be updated when the group_deleted event is processed
        }
    }
    // Other users don't need to do anything specific for this event,
    // as the subsequent 'group_deleted' event will handle the UI update for the group disappearing.
}


// --- DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', async () => {
    pageContainer = document.getElementById('challengeViewContainer');
    myGroupContainerEl = document.getElementById('myGroupContainer');
    otherGroupsContainerEl = document.getElementById('otherGroupsContainer');
    statusDiv = document.getElementById('pageStatusDisplay'); // For general page errors

    if (!pageContainer) {
        console.error("CRITICAL: #challengeViewContainer missing! Challenge view main script cannot run.");
        return;
    }

    // 1. Initialize configuration from DOM
    if (!initializeConfigFromDOM()) {
        // Error already shown by initializeConfigFromDOM
        return;
    }

    // 2. Initialize Timer (critical to do this early, uses config.initialTimerState)
    initializeTimer(TIMER_ID, challengeConfig.initialTimerState, challengeConfig.isAuthorized);


    // 3. Specific setup for Local vs. Shared Challenges
    if (challengeConfig.isLocal) {
        const localData = getLocalChallengeById(challengeConfig.id);
        if (localData) {
            challengeConfig.coreChallengeStructure = localData.challengeData || {};
            challengeConfig.progressData = localData.progressData || {}; // Used by progressActions
            challengeConfig.name = localData.name || "Local Challenge"; // Update name in config
            challengeConfig.penaltyInfo = localData.penalty_info || null;


            updateChallengeInfoDisplay(challengeConfig); // Update title etc.
            const rulesContainer = document.getElementById('local-rules-content');
            if (rulesContainer) renderChallengeRules(rulesContainer, challengeConfig.coreChallengeStructure);

            // Setup the single "group" card for local challenge
            const localCard = document.getElementById('local-group-card'); // Template specific ID
            if (localCard) {
                const localGroupId = challengeConfig.id; // Use challengeId as groupId for local
                
                // Ensure the progress bar container in the local card has the expected ID
                const localProgressBarContainer = localCard.querySelector('.progress-bar-container');
                if (localProgressBarContainer) {
                    localProgressBarContainer.id = `progressBarContainer-${localGroupId}`;
                }

                const localGroupData = { // Mock group data structure
                    id: localGroupId,
                    name: "Your Progress",
                    progress: challengeConfig.progressData,
                    member_count: 1, // Assume 1 player for local
                    player_names: [{display_name: "Player 1", account_name: null}],
                    active_penalty_text: "" // Local challenges might not persist this easily
                };
                // Update the single local card directly
                 updateGroupCardContents(localCard, localGroupData, challengeConfig);
            }

            pageContainer.addEventListener('change', (event) => { // Listener for progress
                if (event.target.matches('.progress-checkbox')) {
                    const checkboxEl = event.target;
                    // Pass dataset, checked status, and the element itself to handleProgressUpdate
                    handleProgressUpdate(checkboxEl.dataset, checkboxEl.checked, checkboxEl);
                }
            });
        } else {
        if(statusDiv) showError(statusDiv, "Error: Could not load local challenge data.", "danger");
        }
    } else { // Shared (Database) Challenge
        // Attach listeners for custom socket events
        document.addEventListener('socketInitialStateReceived', handleSocketInitialState);
        document.addEventListener('socketGroupCreatedReceived', (event) => handleSocketGroupCreated(event));
        document.addEventListener('socketGroupMembershipUpdateReceived', (event) => handleSocketGroupMembershipUpdate(event));
        document.addEventListener('socketPlayerNamesUpdatedReceived', (event) => handleSocketPlayerNamesUpdated(event));
        document.addEventListener('socketProgressUpdateReceived', (event) => handleSocketProgressUpdate(event));
        document.addEventListener('socketActivePenaltyUpdateReceived', (event) => handleSocketActivePenaltyUpdate(event));
        document.addEventListener('socketChallengePenaltiesUpdatedReceived', (event) => handleSocketChallengePenaltiesUpdated(event));
        document.addEventListener('socketPenaltySpinResultReceived', (event) => handleSocketPenaltySpinResult(event));
        document.addEventListener('socketGroupDeletedReceived', handleSocketGroupDeleted); // Listener for remote group deletion
        document.addEventListener('localGroupSuccessfullyDeleted', handleLocalGroupDeletionSuccess); // Listener for local group deletion success
        document.addEventListener('socketUserKickedFromGroupReceived', handleSocketUserKickedFromGroup); // Listener for user kicked event


        updateChallengeInfoDisplay(challengeConfig); // Render static info like title, rules
        const rulesContainer = document.getElementById('rulesBody')?.querySelector('.challenge-rules-list');
        if (rulesContainer && challengeConfig.coreChallengeStructure) {
            renderChallengeRules(rulesContainer, challengeConfig.coreChallengeStructure);
        } else if(rulesContainer) {
            rulesContainer.innerHTML = '<p class="text-muted small">Challenge rules not available.</p>';
        }


        orchestrateUIAfterStateChange(challengeConfig, myGroupContainerEl, otherGroupsContainerEl);
        updateGroupCountDisplay(challengeConfig.initialGroupCount, challengeConfig.maxGroups);
        autoJoinGroupIfApplicable();

        // Initialize Socket.IO connection
        initializeChallengeSockets(challengeConfig.id, challengeConfig.isLocal, statusDiv);
    }

    // 4. Update Penalty Handler Config (common for local and shared, but data sources differ)
    updatePenaltyHandlerConfig(challengeConfig);


    // 5. Common Event Listeners (delegated to pageContainer)
    const addGroupForm = document.getElementById('addGroupForm');
    if (addGroupForm && challengeConfig.isCreator && !challengeConfig.isLocal) {
        addGroupForm.addEventListener('submit', async (event) => { // Make callback async
            await handleCreateGroup(event, challengeConfig, statusDiv, myGroupContainerEl, otherGroupsContainerEl);
            // After group creation, challengeConfig is updated. Refresh UI.
            if (myGroupContainerEl && otherGroupsContainerEl) {
                orchestrateUIAfterStateChange(challengeConfig, myGroupContainerEl, otherGroupsContainerEl);
                updateGroupCountDisplay(challengeConfig.initialGroupCount, challengeConfig.maxGroups);
            }
        });
    } else if (addGroupForm) {
        addGroupForm.style.display = 'none'; // Hide if not creator or local
    }

    pageContainer.addEventListener('click', async (event) => {
        const button = event.target.closest('button');
        if (!button || button.disabled) return;

        // Group Actions
        if (button.classList.contains('join-group-btn')) {
            await handleJoinLeaveGroup(Number(button.dataset.groupId), 'join', challengeConfig, statusDiv, myGroupContainerEl, otherGroupsContainerEl);
            orchestrateUIAfterStateChange(challengeConfig, myGroupContainerEl, otherGroupsContainerEl);
            updatePenaltyHandlerConfig(challengeConfig); // Update penalty handler's config
        } else if (button.classList.contains('leave-group-btn')) {
            await handleJoinLeaveGroup(Number(button.dataset.groupId), 'leave', challengeConfig, statusDiv, myGroupContainerEl, otherGroupsContainerEl);
            orchestrateUIAfterStateChange(challengeConfig, myGroupContainerEl, otherGroupsContainerEl);
            updatePenaltyHandlerConfig(challengeConfig); // Update penalty handler's config
        } else if (button.classList.contains('save-player-names-btn')) {
            await handleSavePlayerNames(event, Number(button.dataset.groupId), challengeConfig, statusDiv);
            // Note: handleSavePlayerNames dispatches 'configPlayerNamesUpdated', which main.js listens for
            // via socketPlayerNamesUpdatedReceived, which then calls orchestrateUIAfterStateChange.
        }
        else if (button.classList.contains('delete-group-btn') && challengeConfig.isCreator && !challengeConfig.isLocal) {
            const groupCardElement = button.closest('.group-card-wrapper'); // The delete button is in the footer of .card.group-card, which is inside .group-card-wrapper
            const groupId = groupCardElement ? Number(groupCardElement.dataset.groupId) : NaN;

            if (isNaN(groupId) || groupId <= 0) {
                console.error("Delete Group: Could not get a valid group ID from button context.", button);
                if(statusDiv) showError(statusDiv, "Error: Could not identify the group to delete.", "danger");
                return; // Exit if groupId is not valid
            }

            const confirmed = await confirmModal(`Are you sure you want to delete group ${groupId}? This action cannot be undone.`, "Confirm Deletion");
            if (confirmed) {
                await handleDeleteGroup(groupId, button);
            }
        }
        // Challenge Actions
        else if (button.classList.contains('clear-penalty-btn')) {
            await handleClearPenalty(Number(button.dataset.groupId), button);
            // After penalty is cleared, challengeConfig is updated. Refresh UI.
            if (myGroupContainerEl && otherGroupsContainerEl) {
                orchestrateUIAfterStateChange(challengeConfig, myGroupContainerEl, otherGroupsContainerEl);
            }
        } else if (button.id === 'authorizeUserBtn' && !challengeConfig.isLocal) {
            // Assumes HTML structure for user authorization:
            // - Input field with id="authUsernameInput"
            // - Error display with id="authUserErrorDisplay"
            // - User list with id="authorizedUsersList" (already assumed by challengeActions.js)
            const authSection = button.closest('.authorize-user-section'); // Assuming a wrapper for these elements
            const usernameInput = authSection ? authSection.querySelector('#authUsernameInput') : document.getElementById('authUsernameInput');
            const username = usernameInput ? usernameInput.value.trim() : '';
            const errorDisplay = authSection ? authSection.querySelector('#authUserErrorDisplay') : document.getElementById('authUserErrorDisplay');
            const userList = document.getElementById('authorizedUsersList'); // challengeActions expects this ID

            if (!usernameInput || !errorDisplay || !userList) {
                console.error("DOM elements for user authorization not found. Cannot proceed.");
                if (statusDiv) showError(statusDiv, "UI elements for authorization are missing.", "danger");
            } else {
                await handleAuthorizeUser(username, button, errorDisplay, usernameInput, userList);
            }
        } else if (button.classList.contains('remove-auth-user-btn') && !challengeConfig.isLocal) {
            // For remove authorization, challengeActions.js expects: userIdToRemove, removeBtn, errorDisplayElement
            // The errorDisplayElement could be a specific one near the list or the general statusDiv.
            // Let's assume an error display within the list item's parent or a general one.
            const authSection = button.closest('.authorize-user-section'); // Or a more specific parent of the list
            const errorDisplay = authSection ? authSection.querySelector('#authUserErrorDisplay') : document.getElementById('authUserErrorDisplay');
            await handleRemoveAuthorization(Number(button.dataset.userId), button, errorDisplay || statusDiv);
        }
        // Penalty set update buttons
        else if (button.id === 'btnUpdateChallengePenalties' && !challengeConfig.isLocal && challengeConfig.isCreator) {
             const selectEl = document.getElementById('penaltySetSelectForChallenge');
             const newPenaltyTabId = selectEl ? selectEl.value : null;
             if (newPenaltyTabId) {
                await handleUpdateChallengePenalties(newPenaltyTabId, challengeConfig, statusDiv);
             } else {
                showFlash("Please select a penalty set to apply.", "warning");
             }
        } else if (button.id === 'btnDisableChallengePenalties' && !challengeConfig.isLocal && challengeConfig.isCreator) {
             await handleDisableChallengePenalties(challengeConfig, statusDiv);
        }


        // OBS Overlay Link
        else if (button.id === 'showOverlayLinkBtn' && !challengeConfig.isLocal) {
            await handleShowOverlayLink(event, challengeConfig, statusDiv);
        }
    });

     // Delegated change listener for progress checkboxes (shared challenges)
    if (!challengeConfig.isLocal) {
        pageContainer.addEventListener('change', (event) => {
             if (event.target.matches('.progress-checkbox')) {
                const checkboxEl = event.target;
                // Pass dataset, checked status, and the element itself to handleProgressUpdate
                handleProgressUpdate(checkboxEl.dataset, checkboxEl.checked, checkboxEl);
            }
        });
    }

}); // End DOMContentLoaded


// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (!challengeConfig.isLocal) {
        disconnectChallengeSockets();
    }
});
