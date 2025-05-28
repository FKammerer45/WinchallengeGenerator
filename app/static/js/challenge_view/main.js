// app/static/js/challenge_view/main.js
// Main orchestrator for the unified challenge view page (challenge.html).

import { apiFetch } from '../utils/api.js';
import { setLoading, showError, showFlash, escapeHtml, confirmModal } from '../utils/helpers.js';
import { getLocalChallengeById, updateLocalChallengeProgress } from '../utils/local_storage.js';

// Configuration
import { challengeConfig, initializeConfigFromDOM, updateUserJoinedGroupState } from './config.js';

// UI Modules
import {
    orchestrateGroupUIRefresh as orchestrateUIAfterStateChange,
    updateGroupCountDisplay,
    updatePenaltyDisplay as updateGlobalPenaltyDisplay
} from './ui/uiOrchestrator.js';
import { renderChallengeRules, updateChallengeInfoDisplay } from './ui/challengeInfo.js';
import { updateGroupCardContents } from './ui/groupCard.js';


// Realtime Modules
import { initializeChallengeSockets, disconnectChallengeSockets } from './realtime/socketHandler.js';
import { initializeTimer, updateTimerStateFromServer } from './realtime/timerHandler.js';
import { updatePenaltyConfig as updatePenaltyHandlerConfig, triggerRemotePenaltySpinAnimation } from './realtime/penaltyHandler.js';


// Action Modules
import {
    handleCreateGroup,
    handleJoinLeaveGroup,
    handleSavePlayerNames,
    handleDeleteGroup
} from './actions/groupActions.js';
import {
    handleProgressUpdate,
    handleClearPenalty,
    handleAuthorizeUser,
    handleRemoveAuthorization,
    handleUpdateChallengePenalties,
    handleDisableChallengePenalties
} from './actions/challengeActions.js';
import { handleShowOverlayLink } from './actions/overlayActions.js';

import { removeGroupFromConfig } from './config.js';

let pageContainer = null;
let myGroupContainerEl = null;
let otherGroupsContainerEl = null;
let statusDiv = null;

const TIMER_ID = 'main';

async function autoJoinGroupIfApplicable() {
    if (challengeConfig.isLocal || 
        !challengeConfig.isLoggedIn || 
        !challengeConfig.isAuthorized || 
        challengeConfig.isCreator || // Do not auto-join if the current user is the creator
        challengeConfig.userJoinedGroupId !== null) {
        return;
    }
    const singleGroupToJoin = (!challengeConfig.isMultigroup && challengeConfig.initialGroups?.length === 1) ? challengeConfig.initialGroups[0] : null;

    if (singleGroupToJoin && singleGroupToJoin.member_count < challengeConfig.numPlayersPerGroup) {
        try {
            // Pass all required arguments to handleJoinLeaveGroup
            await handleJoinLeaveGroup(singleGroupToJoin.id, 'join', challengeConfig, statusDiv, myGroupContainerEl, otherGroupsContainerEl);
        } catch (err) {
            console.error('Auto-join failed:', err);
            if (statusDiv) showError(statusDiv, `Could not auto-join group: ${err.message}`, 'warning');
        }
    }
}

function handleSocketInitialState(event) {
    const freshInitialState = event.detail;
    if (freshInitialState && freshInitialState.challenge_id === challengeConfig.id) {
        challengeConfig.coreChallengeStructure = freshInitialState.challenge_structure || challengeConfig.coreChallengeStructure;
        challengeConfig.initialGroups = freshInitialState.all_groups_data || challengeConfig.initialGroups || [];
        challengeConfig.userJoinedGroupId = freshInitialState.user_group ? freshInitialState.user_group.id : null;
        challengeConfig.initialGroupCount = challengeConfig.initialGroups?.length || 0;
        challengeConfig.penaltyInfo = freshInitialState.penalty_info || challengeConfig.penaltyInfo;
        challengeConfig.name = freshInitialState.challenge_name || challengeConfig.name;
        challengeConfig.initialTimerState = freshInitialState.timer_state || challengeConfig.initialTimerState;
        if (freshInitialState.timer_state) {
            updateTimerStateFromServer(freshInitialState.timer_state);
        }
        if (myGroupContainerEl && otherGroupsContainerEl) {
            orchestrateUIAfterStateChange(challengeConfig, myGroupContainerEl, otherGroupsContainerEl);
            updateGroupCountDisplay(challengeConfig.initialGroupCount, challengeConfig.maxGroups);
            updateChallengeInfoDisplay(challengeConfig);
        }
        updatePenaltyHandlerConfig(challengeConfig);
    }
}

function handleSocketGroupCreated(event) {
    const newGroupData = event.detail;
    if (!challengeConfig.initialGroups.some(g => g.id === newGroupData.id)) {
        challengeConfig.initialGroups.push(newGroupData);
        challengeConfig.initialGroupCount = challengeConfig.initialGroups.length;
        if (myGroupContainerEl && otherGroupsContainerEl) {
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
        if (updateData.user_id === challengeConfig.currentUserId) {
             updateUserJoinedGroupState(updateData.is_member_now ? updateData.group_id : null);
        }
        if (updateData.joined_user_id && updateData.joined_user_id === challengeConfig.currentUserId) {
             updateUserJoinedGroupState(updateData.group_id);
        } else if (updateData.left_user_id && updateData.left_user_id === challengeConfig.currentUserId && challengeConfig.userJoinedGroupId === updateData.group_id) {
             updateUserJoinedGroupState(null);
        }
        if (myGroupContainerEl && otherGroupsContainerEl) {
            orchestrateUIAfterStateChange(challengeConfig, myGroupContainerEl, otherGroupsContainerEl);
        }
        updatePenaltyHandlerConfig(challengeConfig);
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
        updatePenaltyHandlerConfig(challengeConfig);
    }
}

function handleSocketProgressUpdate(event) {
    const eventData = event.detail;
    const groupIndex = challengeConfig.initialGroups.findIndex(g => g.id === eventData.group_id);
    if (groupIndex !== -1) {
        challengeConfig.initialGroups[groupIndex].progress = eventData.progress_data || {};
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
        challengeConfig.initialGroups[groupIndex].active_penalty_duration_seconds = null;
        challengeConfig.initialGroups[groupIndex].penalty_applied_at_utc = null;
        const cardWrapper = document.querySelector(`.group-card-wrapper[data-group-id="${eventData.group_id}"]`);
        if (cardWrapper) {
            const penaltyDisplayDiv = cardWrapper.querySelector('.active-penalty-display');
            const canInteract = challengeConfig.isLocal || (challengeConfig.isLoggedIn && challengeConfig.isAuthorized && challengeConfig.userJoinedGroupId === eventData.group_id);
            if (penaltyDisplayDiv) updateGlobalPenaltyDisplay(penaltyDisplayDiv, eventData.penalty_text || "", canInteract, null, null);
        }
    }
}

function handleSocketTimedPenaltyApplied(event) {
    const { challenge_id, group_id, penalty_text, duration_seconds, applied_at_utc } = event.detail;
    if (challenge_id !== challengeConfig.id) return;
    const groupIndex = challengeConfig.initialGroups.findIndex(g => g.id === group_id);
    if (groupIndex !== -1) {
        challengeConfig.initialGroups[groupIndex].active_penalty_text = penalty_text || "";
        challengeConfig.initialGroups[groupIndex].active_penalty_duration_seconds = duration_seconds;
        challengeConfig.initialGroups[groupIndex].penalty_applied_at_utc = applied_at_utc;
        
        // The visual update is now handled by triggerRemotePenaltySpinAnimation's final callback in penaltyHandler.js
        // to ensure it happens AFTER the animation.
        // We still update the config here so the data is consistent with what the server has.
        // console.log(`[MainJS handleSocketTimedPenaltyApplied] Updated challengeConfig for group ${group_id} with penalty. Visual update deferred to penaltyHandler animation end.`);
    }
}

function handleSocketChallengePenaltiesUpdated(event) {
    const eventData = event.detail;
    if (eventData.challenge_id === challengeConfig.id) {
        challengeConfig.penaltyInfo = eventData.penalty_info;
        updatePenaltyHandlerConfig(challengeConfig);
        updateChallengeInfoDisplay(challengeConfig);
        showFlash("This challenge's penalty set has been updated by the creator.", "info");
        if (challengeConfig.userJoinedGroupId) {
            const groupCard = document.querySelector(`.group-card-wrapper[data-group-id="${challengeConfig.userJoinedGroupId}"]`);
            // if (groupCard?.querySelector('.active-penalty-display')) {
                // console.log("Penalty set changed, consider resetting wheel UI if active.");
            // }
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
    if (challenge_id !== challengeConfig.id) return;
    if (deletedGroupId === undefined) return;
    removeGroupFromConfig(deletedGroupId);
    if (myGroupContainerEl && otherGroupsContainerEl) {
        orchestrateUIAfterStateChange(challengeConfig, myGroupContainerEl, otherGroupsContainerEl);
        updateGroupCountDisplay(challengeConfig.initialGroupCount, challengeConfig.maxGroups);
    }
    showFlash(`Group ${deletedGroupId} has been deleted.`, 'info');
}

function handleLocalGroupDeletionSuccess(event) {
    const { groupId: deletedGroupId } = event.detail;
    if (deletedGroupId === undefined) return;
    removeGroupFromConfig(deletedGroupId); 
    if (myGroupContainerEl && otherGroupsContainerEl) {
        orchestrateUIAfterStateChange(challengeConfig, myGroupContainerEl, otherGroupsContainerEl);
        updateGroupCountDisplay(challengeConfig.initialGroupCount, challengeConfig.maxGroups);
    }
}

function handleSocketUserKickedFromGroup(event) {
    const { challenge_id, group_id, user_id } = event.detail;
    if (challenge_id !== challengeConfig.id) return;
    if (user_id === challengeConfig.currentUserId && challengeConfig.userJoinedGroupId === group_id) {
        updateUserJoinedGroupState(null);
        showFlash("You have been removed from the group.", "warning");
        if (myGroupContainerEl && otherGroupsContainerEl) {
            orchestrateUIAfterStateChange(challengeConfig, myGroupContainerEl, otherGroupsContainerEl);
        }
    }
}

function handleSocketCurrentGameUpdated(event) {
    // console.log("[MainJS] Entered handleSocketCurrentGameUpdated. Event detail:", event.detail); 
    const { challenge_id, group_id, current_game_info } = event.detail;
    if (challenge_id !== challengeConfig.id) {
        // console.log(`[MainJS handleSocketCurrentGameUpdated] Event for wrong challenge ID. Expected ${challengeConfig.id}, got ${challenge_id}. Ignoring.`);
        return;
    }
    const groupIndex = challengeConfig.initialGroups.findIndex(g => g.id === group_id);
    if (groupIndex !== -1) {
        challengeConfig.initialGroups[groupIndex].currentGameInfo = current_game_info;
        
        const updatedGroupInMainConfig = challengeConfig.initialGroups[groupIndex];
        // console.log(`[MainJS handleSocketCurrentGameUpdated] Log A - Group ${group_id} currentGameInfo in main.js challengeConfig:`, JSON.parse(JSON.stringify(updatedGroupInMainConfig.currentGameInfo || null)));

        updatePenaltyHandlerConfig(challengeConfig); 

        if (myGroupContainerEl && otherGroupsContainerEl) {
            orchestrateUIAfterStateChange(challengeConfig, myGroupContainerEl, otherGroupsContainerEl);
        }
    }
}

async function handleSelectGame(groupId, gameInfo, targetElement) {
    if (!challengeConfig.isLoggedIn || !challengeConfig.isAuthorized || challengeConfig.userJoinedGroupId !== groupId) {
        showFlash("You must be a member of this group to select a game.", "warning");
        return;
    }
    if (!gameInfo || !gameInfo.id || !gameInfo.name || !Array.isArray(gameInfo.tags)) {
        showFlash("Invalid game data for selection.", "error");
        return;
    }
    const apiEndpoint = `/api/challenge/${challengeConfig.id}/groups/${groupId}/select_game`;
    const payload = { game_info: gameInfo };
    if (targetElement) targetElement.classList.add('selecting-game'); 
    try {
        setLoading(true, targetElement);
        const response = await apiFetch(apiEndpoint, { method: 'POST', body: payload }, challengeConfig.csrfToken);
        if (response.status === 'success') {
            showFlash(`Game "${escapeHtml(gameInfo.name)}" selected.`, 'success', 1500);
        } else {
            throw new Error(response.error || "Failed to select game.");
        }
    } catch (error) {
        showFlash(`Error selecting game: ${error.message}`, 'danger');
    } finally {
        setLoading(false, targetElement);
        if (targetElement) targetElement.classList.remove('selecting-game');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    pageContainer = document.getElementById('challengeViewContainer');
    myGroupContainerEl = document.getElementById('myGroupContainer');
    otherGroupsContainerEl = document.getElementById('otherGroupsContainer');
    statusDiv = document.getElementById('pageStatusDisplay');

    if (!pageContainer) return;
    if (!initializeConfigFromDOM()) return;
    initializeTimer(TIMER_ID, challengeConfig.initialTimerState, challengeConfig.isAuthorized);

    if (challengeConfig.isLocal) {
        const localData = getLocalChallengeById(challengeConfig.id);
        if (localData) {
            challengeConfig.coreChallengeStructure = localData.challengeData || {};
            challengeConfig.progressData = localData.progressData || {};
            challengeConfig.name = localData.name || "Local Challenge";
            challengeConfig.penaltyInfo = localData.penalty_info || null;
            updateChallengeInfoDisplay(challengeConfig);
            const rulesContainer = document.getElementById('local-rules-content');
            if (rulesContainer) renderChallengeRules(rulesContainer, challengeConfig.coreChallengeStructure);
            const localCard = document.getElementById('local-group-card');
            if (localCard) {
                const localGroupId = challengeConfig.id;
                const localProgressBarContainer = localCard.querySelector('.progress-bar-container');
                if (localProgressBarContainer) localProgressBarContainer.id = `progressBarContainer-${localGroupId}`;
                const localGroupData = {
                    id: localGroupId, name: "Your Progress", progress: challengeConfig.progressData,
                    member_count: 1, player_names: [{display_name: "Player 1", account_name: null}],
                    active_penalty_text: "",
                    currentGameInfo: null 
                };
                challengeConfig.initialGroups = [localGroupData]; 
                updateGroupCardContents(localCard, localGroupData, challengeConfig);
            }
            // Listener for local challenge progress checkboxes
            pageContainer.addEventListener('change', async (event) => {
                if (event.target.matches('.progress-checkbox')) {
                    const checkboxEl = event.target;
                    await handleProgressUpdate(checkboxEl.dataset, checkboxEl.checked, checkboxEl);
                }
            });
        } else {
            if(statusDiv) showError(statusDiv, "Error: Could not load local challenge data.", "danger");
        }
    } else { // Shared (Database) Challenge
        document.addEventListener('socketInitialStateReceived', handleSocketInitialState);
        document.addEventListener('socketGroupCreatedReceived', handleSocketGroupCreated);
        document.addEventListener('socketGroupMembershipUpdateReceived', handleSocketGroupMembershipUpdate);
        document.addEventListener('socketPlayerNamesUpdatedReceived', handleSocketPlayerNamesUpdated);
        document.addEventListener('socketProgressUpdateReceived', handleSocketProgressUpdate);
        document.addEventListener('socketActivePenaltyUpdateReceived', handleSocketActivePenaltyUpdate);
        document.addEventListener('socketTimedPenaltyAppliedReceived', handleSocketTimedPenaltyApplied);
        document.addEventListener('socketChallengePenaltiesUpdatedReceived', handleSocketChallengePenaltiesUpdated);
        document.addEventListener('socketPenaltySpinResultReceived', handleSocketPenaltySpinResult);
        document.addEventListener('socketGroupDeletedReceived', handleSocketGroupDeleted);
        document.addEventListener('localGroupSuccessfullyDeleted', handleLocalGroupDeletionSuccess);
        document.addEventListener('socketUserKickedFromGroupReceived', handleSocketUserKickedFromGroup);
        document.addEventListener('socketCurrentGameUpdatedReceived', handleSocketCurrentGameUpdated);

        updateChallengeInfoDisplay(challengeConfig);
        const rulesContainer = document.getElementById('rulesBody')?.querySelector('.challenge-rules-list');
        if (rulesContainer && challengeConfig.coreChallengeStructure) {
            renderChallengeRules(rulesContainer, challengeConfig.coreChallengeStructure);
        } else if(rulesContainer) {
            rulesContainer.innerHTML = '<p class="text-muted small">Challenge rules not available.</p>';
        }
        orchestrateUIAfterStateChange(challengeConfig, myGroupContainerEl, otherGroupsContainerEl);
        updateGroupCountDisplay(challengeConfig.initialGroupCount, challengeConfig.maxGroups);
        // autoJoinGroupIfApplicable(); // Auto-join removed as per user request
        initializeChallengeSockets(challengeConfig.id, challengeConfig.isLocal, statusDiv);
    }

    updatePenaltyHandlerConfig(challengeConfig);

    // Conditionally show/hide penalty section
    const penaltyContainer = document.getElementById('local-penalty-section-container');
    if (penaltyContainer) {
        const hasPenalties = challengeConfig.penaltyInfo && 
                             challengeConfig.penaltyInfo.penalties && 
                             challengeConfig.penaltyInfo.penalties.length > 0;
        if (!hasPenalties) {
            penaltyContainer.style.display = 'none';
        } else {
            penaltyContainer.style.display = ''; // Or 'block' if it's a block-level element by default
        }
    }

    const addGroupForm = document.getElementById('addGroupForm');
    if (addGroupForm && challengeConfig.isCreator && !challengeConfig.isLocal) {
        addGroupForm.addEventListener('submit', async (event) => {
            await handleCreateGroup(event, challengeConfig, statusDiv, myGroupContainerEl, otherGroupsContainerEl);
            if (myGroupContainerEl && otherGroupsContainerEl) {
                orchestrateUIAfterStateChange(challengeConfig, myGroupContainerEl, otherGroupsContainerEl);
                updateGroupCountDisplay(challengeConfig.initialGroupCount, challengeConfig.maxGroups);
            }
        });
    } else if (addGroupForm) {
        addGroupForm.style.display = 'none';
    }

    pageContainer.addEventListener('click', async (event) => {
        const target = event.target;
        const button = target.closest('button');

        if (button && !button.disabled) {
            if (button.classList.contains('join-group-btn')) {
                await handleJoinLeaveGroup(Number(button.dataset.groupId), 'join', challengeConfig, statusDiv, myGroupContainerEl, otherGroupsContainerEl);
            } else if (button.classList.contains('leave-group-btn')) {
                await handleJoinLeaveGroup(Number(button.dataset.groupId), 'leave', challengeConfig, statusDiv, myGroupContainerEl, otherGroupsContainerEl);
            } else if (button.classList.contains('save-player-names-btn')) {
                await handleSavePlayerNames(event, Number(button.dataset.groupId), challengeConfig, statusDiv);
            } else if (button.classList.contains('delete-group-btn') && challengeConfig.isCreator && !challengeConfig.isLocal) {
                const groupCardElement = button.closest('.group-card-wrapper');
                const groupId = groupCardElement ? Number(groupCardElement.dataset.groupId) : NaN;
                if (!isNaN(groupId) && groupId > 0) {
                    const confirmed = await confirmModal(`Are you sure you want to delete group ${groupId}? This action cannot be undone.`, "Confirm Deletion");
                    if (confirmed) await handleDeleteGroup(groupId, button);
                }
            } else if (button.classList.contains('clear-penalty-btn')) {
                await handleClearPenalty(Number(button.dataset.groupId), button);
            } else if (button.id === 'authorizeUserBtn' && !challengeConfig.isLocal) {
                const authSection = button.closest('.authorize-user-section');
                const usernameInput = authSection?.querySelector('#authUsernameInput');
                const errorDisplay = authSection?.querySelector('#authUserErrorDisplay');
                const userList = document.getElementById('authorizedUsersList');
                if (usernameInput && errorDisplay && userList) {
                    await handleAuthorizeUser(usernameInput.value.trim(), button, errorDisplay, usernameInput, userList);
                }
            } else if (button.classList.contains('remove-auth-user-btn') && !challengeConfig.isLocal) {
                const authSection = button.closest('.authorize-user-section');
                const errorDisplay = authSection?.querySelector('#authUserErrorDisplay');
                await handleRemoveAuthorization(Number(button.dataset.userId), button, errorDisplay || statusDiv);
            } else if (button.id === 'btnUpdateChallengePenalties' && !challengeConfig.isLocal && challengeConfig.isCreator) {
                const selectEl = document.getElementById('penaltySetSelectForChallenge');
                if (selectEl?.value) await handleUpdateChallengePenalties(selectEl.value, challengeConfig, statusDiv);
                else showFlash("Please select a penalty set.", "warning");
            } else if (button.id === 'btnDisableChallengePenalties' && !challengeConfig.isLocal && challengeConfig.isCreator) {
                await handleDisableChallengePenalties(challengeConfig, statusDiv);
            } else if (button.id === 'showOverlayLinkBtn' && !challengeConfig.isLocal) {
                await handleShowOverlayLink(event, challengeConfig, statusDiv);
            }
            if (myGroupContainerEl && otherGroupsContainerEl && 
                (button.classList.contains('join-group-btn') || button.classList.contains('leave-group-btn') || button.classList.contains('clear-penalty-btn'))) {
                orchestrateUIAfterStateChange(challengeConfig, myGroupContainerEl, otherGroupsContainerEl);
                updatePenaltyHandlerConfig(challengeConfig);
            }
        }

        const gameItemSpan = target.closest('.game-selectable-item');
        if (gameItemSpan) {
            // console.log("[MainJS Click Handler] Clicked on .game-selectable-item:", gameItemSpan);
            // console.log("[MainJS Click Handler] challengeConfig.isLocal:", challengeConfig.isLocal);

            if (!challengeConfig.isLocal) { 
                const groupIdString = gameItemSpan.dataset.groupId;
                const gameId = gameItemSpan.dataset.gameId;
                const gameName = gameItemSpan.dataset.gameName;
                const gameTagsString = gameItemSpan.dataset.gameTags;

                // console.log("[MainJS Click Handler] Data attributes - groupId:", groupIdString, "gameId:", gameId, "gameName:", gameName, "gameTagsString:", gameTagsString);

                if (groupIdString && gameId && gameName && gameTagsString) {
                    const groupId = parseInt(groupIdString, 10);
                    if (isNaN(groupId)) {
                        // console.error("[MainJS Click Handler] Invalid groupId:", groupIdString);
                        showFlash("Error: Invalid group identifier for game selection.", "danger");
                        return;
                    }
                    try {
                        const tags = JSON.parse(gameTagsString);
                        if (Array.isArray(tags)) {
                            const gameInfo = { id: gameId, name: gameName, tags: tags };
                            // console.log("[MainJS Click Handler] Calling handleSelectGame with gameInfo:", gameInfo, "and groupId:", groupId);
                            await handleSelectGame(groupId, gameInfo, gameItemSpan);
                        } else { 
                            // console.error("[MainJS Click Handler] Parsed gameTags is not an array:", tags);
                            showFlash("Error processing game data (tags format).", "danger"); 
                        }
                    } catch (e) { 
                        // console.error("[MainJS Click Handler] Error parsing gameTags JSON:", e, "Raw string:", gameTagsString);
                        showFlash("Error processing game data (JSON parse failed).", "danger"); 
                    }
                } else {
                    // console.warn("[MainJS Click Handler] Game item span clicked, but one or more critical data attributes are missing/empty.");
                    showFlash("Cannot select game: missing essential game data.", "warning");
                }
            } else {
                // console.log("[MainJS Click Handler] Game item span clicked in LOCAL challenge. Game selection via click is disabled for local challenges.");
            }
        }
    });

    if (!challengeConfig.isLocal) { 
        pageContainer.addEventListener('change', async (event) => { 
             if (event.target.matches('.progress-checkbox')) {
                const checkboxEl = event.target;
                await handleProgressUpdate(checkboxEl.dataset, checkboxEl.checked, checkboxEl);
            }
        });
    }
});

window.addEventListener('beforeunload', () => {
    if (!challengeConfig.isLocal) {
        disconnectChallengeSockets();
    }
});
