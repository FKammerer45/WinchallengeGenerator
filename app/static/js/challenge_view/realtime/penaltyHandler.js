// app/static/js/challenge_view/realtime/penaltyHandler.js
import { getLocalOnlyEntries as getLocalPenalties } from '../../penalties/penaltyLocalStorageUtils.js';
import { escapeHtml, showError, showFlash } from '../../utils/helpers.js';
import { apiFetch } from '../../utils/api.js';
import { updatePenaltyDisplay } from '../ui/uiOrchestrator.js';

let winwheelLoaded = (typeof Winwheel !== 'undefined');
const animationOk = (typeof TweenMax !== 'undefined' || typeof gsap !== 'undefined');

function bailIfLibMissing(targetNode) {
    if (winwheelLoaded) return false;
    winwheelLoaded = null;
    const msg = "Penalty wheel is unavailable because the Winwheel library could not be loaded.";
    showError(targetNode || document.body, msg, "danger");
    console.error(msg);
    return true;
}

const playerWheels = new Map();
const penaltyWheels = new Map();
const getPlayerWheel = idx => playerWheels.get(idx);
const getPenaltyWheel = idx => penaltyWheels.get(idx);
function setPlayerWheel(idx, wheel) { playerWheels.set(idx, wheel); }
function setPenaltyWheel(idx, wheel) { penaltyWheels.set(idx, wheel); }

let penaltyPageConfig = {
    userJoinedGroupId: null,
    numPlayersPerGroup: 1,
    initialGroups: [],
    isMultigroup: false,
    isLocal: false,
    challengeId: null,
    challengeConfigData: {} // Full config
};

export function updatePenaltyConfig(newChallengeConfig) {
    penaltyPageConfig.userJoinedGroupId = newChallengeConfig.userJoinedGroupId;
    penaltyPageConfig.numPlayersPerGroup = newChallengeConfig.numPlayersPerGroup || 1;
    penaltyPageConfig.initialGroups = Array.isArray(newChallengeConfig.initialGroups) ? newChallengeConfig.initialGroups : [];
    penaltyPageConfig.isMultigroup = newChallengeConfig.isMultigroup === true;
    penaltyPageConfig.isLocal = newChallengeConfig.isLocal === true;
    penaltyPageConfig.challengeId = newChallengeConfig.id || null;
    penaltyPageConfig.challengeConfigData = newChallengeConfig;
}

function createSegments(items, colors) {
    if (!items || items.length === 0) return [];
    const safeColors = colors && colors.length > 0 ? colors : ['#888888'];
    return items.map((item, index) => ({
        'fillStyle': safeColors[index % safeColors.length],
        'text': String(item || '?'),
        'textFontSize': 12,
        'textFontFamily': 'Arial, Helvetica, sans-serif'
    }));
}

function calculateStopAngle(numSegments, winningSegmentNumber) {
    if (numSegments <= 0 || winningSegmentNumber <= 0 || winningSegmentNumber > numSegments) {
        return Math.random() * 360;
    }
    const segmentAngle = 360 / numSegments;
    const randomAngleInSegment = segmentAngle * (0.1 + Math.random() * 0.8);
    const winningSegmentStartAngle = (winningSegmentNumber - 1) * segmentAngle;
    return winningSegmentStartAngle + randomAngleInSegment;
}

function selectWeightedPenalty(penalties) {
    console.log('[PenaltyHandler] selectWeightedPenalty received penalties:', JSON.parse(JSON.stringify(penalties)));
    if (!Array.isArray(penalties) || penalties.length === 0) {
        console.log('[PenaltyHandler] selectWeightedPenalty: No penalties or not an array, returning "No Penalty".');
        return { name: "No Penalty", description: "No penalties defined." };
    }
    let totalWeight = 0;
    // Ensure penalties considered valid also have a non-empty name
    const validPenalties = penalties.filter(p => {
        const prob = p && p.probability !== undefined ? parseFloat(p.probability) : NaN;
        // Penalty must have a name (non-empty string) and positive probability
        if (p && typeof p.name === 'string' && p.name.trim() !== "" && !isNaN(prob) && prob > 0) {
            totalWeight += prob;
            return true;
        }
        return false;
    });
    console.log('[PenaltyHandler] selectWeightedPenalty: validPenalties:', JSON.parse(JSON.stringify(validPenalties)), 'totalWeight:', totalWeight);

    if (totalWeight <= 0 || validPenalties.length === 0) {
        console.log('[PenaltyHandler] selectWeightedPenalty: No valid penalties or totalWeight is zero, returning "No Penalty".');
        return { name: "No Penalty", description: "No applicable penalties with names found." }; // Updated message
    }
    let randomThreshold = Math.random() * totalWeight;
    for (const penalty of validPenalties) {
        randomThreshold -= parseFloat(penalty.probability);
        if (randomThreshold <= 0) return penalty;
    }
    return validPenalties[validPenalties.length - 1];
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function resetPenaltyUI(idx) {
    const playerCont = document.getElementById(`playerWheelContainer-${idx}`);
    const penaltyCont = document.getElementById(`penaltyWheelContainer-${idx}`);
    const resultDisp = document.getElementById(`penaltyResult-${idx}`);
    if (playerCont) playerCont.style.display = 'none';
    if (penaltyCont) penaltyCont.style.display = 'none';
    if (resultDisp) { resultDisp.style.display = 'none'; showError(resultDisp, null); }
    getPlayerWheel(idx)?.stopAnimation?.(false);
    getPenaltyWheel(idx)?.stopAnimation?.(false);
    setPlayerWheel(idx, null);
    setPenaltyWheel(idx, null);
}

function displayPenaltyResultUI(idx, groupIdToUpdate, chosenEntity, chosenPenalty, buttonToReEnable) {
    const resultDisplay = document.getElementById(`penaltyResult-${idx}`);
    if (!resultDisplay) {
        console.error(`[DisplayPenaltyUI] Result display element #penaltyResult-${idx} not found.`);
        if (buttonToReEnable) buttonToReEnable.disabled = false;
        return;
    }
    let message = '';
    let type = 'info';
    let penaltyTextToSaveForUI = '';
    if (chosenEntity && chosenPenalty && chosenPenalty.name && chosenPenalty.name !== "No Penalty") {
        const baseText = `${escapeHtml(chosenEntity)} receives penalty: ${escapeHtml(chosenPenalty.name)}`;
        message = `<strong>${baseText}</strong>`;
        penaltyTextToSaveForUI = baseText;
        if (chosenPenalty.description) {
            const escapedDesc = escapeHtml(chosenPenalty.description);
            message += `<br><small class="text-muted">(${escapedDesc})</small>`;
            penaltyTextToSaveForUI += ` (${escapedDesc})`;
        }
        type = 'warning';
    } else {
        message = `<strong>${escapeHtml(chosenEntity || 'Participant')}</strong>: ${escapeHtml(chosenPenalty?.description || 'No penalty assigned.')}`;
        penaltyTextToSaveForUI = '';
        type = 'success';
    }
    resultDisplay.innerHTML = message;
    resultDisplay.className = `mt-3 penalty-result-display alert alert-${type}`;
    resultDisplay.style.display = 'block';

    if (groupIdToUpdate !== null) {
        const groupCardWrapper = document.querySelector(`.group-card-wrapper[data-group-id="${groupIdToUpdate}"]`);
        if (groupCardWrapper) {
            const penaltyDivElement = groupCardWrapper.querySelector('.active-penalty-display');
            if (penaltyDivElement) {
                const canInteract = penaltyPageConfig.isLocal || 
                                    (penaltyPageConfig.isLoggedIn && 
                                     penaltyPageConfig.isAuthorized && 
                                     penaltyPageConfig.userJoinedGroupId === groupIdToUpdate);
                updatePenaltyDisplay(penaltyDivElement, penaltyTextToSaveForUI, canInteract);
            }
        }
        const groupInConfig = penaltyPageConfig.initialGroups.find(g => g.id === groupIdToUpdate);
        if (groupInConfig) {
            groupInConfig.active_penalty_text = penaltyTextToSaveForUI;
        }
    } else if (penaltyPageConfig.isLocal && idx === 'local') { 
        const localCard = document.getElementById('local-group-card');
        const localPenaltyDisplayEl = localCard?.querySelector('.active-penalty-display');
        if (localPenaltyDisplayEl) {
            updatePenaltyDisplay(localPenaltyDisplayEl, penaltyTextToSaveForUI, true);
        }
    }
    if (buttonToReEnable) {
        buttonToReEnable.disabled = false;
    }
}

function getPenaltyWheelConfig(segments, winningIndex, callbackFn, idx, wheelType = 'Penalty', customStopAngle = null) {
    if (!winwheelLoaded) return null;
    if (!Array.isArray(segments) || segments.length === 0 || winningIndex <= 0 || winningIndex > segments.length) {
        console.error(`Cannot configure ${wheelType} wheel: invalid segments or winningIndex. Segments:`, segments, `Winning Index:`, winningIndex);
        throw new Error(`Cannot configure ${wheelType} wheel: invalid segments or winningIndex.`);
    }
    const numSegments = segments.length;
    const stopAngle = customStopAngle !== null ? customStopAngle : calculateStopAngle(numSegments, winningIndex);
    const isPlayerWheel = wheelType === 'Player';
    const outerRadius = isPlayerWheel ? 100 : 140;
    const innerRadius = isPlayerWheel ? 10 : 20;
    const textFontSize = 12;
    const canvasId = isPlayerWheel ? `playerWheelCanvas-${idx}` : `penaltyWheelCanvas-${idx}`;
    const duration = isPlayerWheel ? 3 : 5; // Shorter animation for quicker feedback
    const spins = isPlayerWheel ? 5 : 8;
    return {
        canvasId, numSegments, outerRadius, innerRadius, textFontSize,
        textMargin: 5, textFillStyle: '#ffffff', textStrokeStyle: 'rgba(0,0,0,0.2)',
        lineWidth: 2, strokeStyle: '#ffffff', segments,
        pointerGuide: { display: true, strokeStyle: '#ffc107', lineWidth: 3 },
        animation: { type: 'spinToStop', duration, spins, easing: 'Power4.easeOut', stopAngle, callbackFinished: callbackFn },
        pins: { number: Math.min(numSegments * 2, 36), outerRadius: 4, fillStyle: '#cccccc', strokeStyle: '#666666' }
    };
}

async function handleLostGameClick(event) {
    console.log('[PenaltyHandler] handleLostGameClick triggered. Event target:', event.target);
    const clickedElement = event.target;
    const button = clickedElement.closest('.lostGameBtn-Shared, .lostGameBtn-Local');

    if (!button || button.disabled) {
        return;
    }
    event.stopPropagation();
    if (bailIfLibMissing(document.body)) return;

    const isLocalClick = button.classList.contains('lostGameBtn-Local');
    const idx = isLocalClick ? 'local' : 'shared';
    const penaltyTabId = button.dataset.penaltyTabId;
    const resultDisplay = document.getElementById(`penaltyResult-${idx}`);
    const errorTarget = resultDisplay || document.body;

    resetPenaltyUI(idx);
    button.disabled = true;
    if(resultDisplay) {
        resultDisplay.style.display = 'block';
        resultDisplay.className = 'mt-3 penalty-result-display alert alert-info';
        resultDisplay.innerHTML = `<span class="text-info">Determining penalty...</span>`;
    }

    let participants = [];
    if (idx === 'local') {
        participants = ['Participant'];
    } else if (penaltyPageConfig.userJoinedGroupId !== null && penaltyPageConfig.isMultigroup) {
        const group = penaltyPageConfig.initialGroups.find(g => g.id === penaltyPageConfig.userJoinedGroupId);
        if (group && Array.isArray(group.player_names)) {
            const savedNames = group.player_names.map(slot => slot?.display_name?.trim()).filter(name => name);
            participants = savedNames.length > 0 ? savedNames.slice(0, penaltyPageConfig.numPlayersPerGroup) : Array.from({ length: penaltyPageConfig.numPlayersPerGroup }, (_, i) => `Player ${i + 1}`);
        } else {
            participants = Array.from({ length: penaltyPageConfig.numPlayersPerGroup }, (_, i) => `Player ${i + 1}`);
        }
    } else {
        participants = ['Participant'];
    }
    if (participants.length === 0) {
        showError(errorTarget, "Error: No participants found.", "danger");
        button.disabled = false; return;
    }
    const chosenEntity = participants[Math.floor(Math.random() * participants.length)];
    const playerEntitySegments = createSegments(participants, ['#8dd3c7', '#ffffb3']);
    const playerWinningSegmentIndex = participants.length > 1 ? (playerEntitySegments.findIndex(s => s.text === chosenEntity) + 1) : 0;
    const playerStopAngle = participants.length > 1 ? calculateStopAngle(playerEntitySegments.length, playerWinningSegmentIndex) : 0;

    let penaltyList = [];
    if (penaltyPageConfig.isLocal) {
        const embedded = penaltyPageConfig.challengeConfigData?.penaltyInfo;
        if (embedded?.penalties?.length) {
            penaltyList = embedded.penalties;
            console.log('[PenaltyHandler] Using embedded penalties for local challenge:', JSON.parse(JSON.stringify(penaltyList)));
        } else if (penaltyTabId) {
            penaltyList = (getLocalPenalties()[penaltyTabId] || []);
            console.log(`[PenaltyHandler] Using local penalties from tab ${penaltyTabId} for local challenge:`, JSON.parse(JSON.stringify(penaltyList)));
        }
    } else {
        const embedded = penaltyPageConfig.challengeConfigData?.penaltyInfo;
        if (embedded?.penalties?.length) {
            penaltyList = embedded.penalties;
            console.log('[PenaltyHandler] Using embedded penalties for shared challenge:', JSON.parse(JSON.stringify(penaltyList)));
        } else if (penaltyPageConfig.challengeConfigData?.isLoggedIn && penaltyPageConfig.challengeConfigData?.userPenaltyTabsData?.entries?.[penaltyTabId]) {
            penaltyList = penaltyPageConfig.challengeConfigData.userPenaltyTabsData.entries[penaltyTabId];
            console.log(`[PenaltyHandler] Using user's saved penalties from tab ${penaltyTabId} for shared challenge:`, JSON.parse(JSON.stringify(penaltyList)));
        } else {
            console.log(`[PenaltyHandler] No specific penalty list found for shared challenge with tabId ${penaltyTabId}. Defaulting to empty list.`);
        }
    }
    if (!Array.isArray(penaltyList)) {
        console.warn('[PenaltyHandler] penaltyList was not an array, resetting to empty. Original:', penaltyList);
        penaltyList = [];
    }
    console.log('[PenaltyHandler] Final penaltyList before selectWeightedPenalty:', JSON.parse(JSON.stringify(penaltyList)));
    const chosenPenalty = selectWeightedPenalty(penaltyList);
    console.log('[PenaltyHandler] chosenPenalty after selectWeightedPenalty:', JSON.parse(JSON.stringify(chosenPenalty)));

    let wheelSegmentPenalties = [];
    let penaltyWheelSegmentsForAnim = [];
    const NUM_PENALTY_SEGMENTS = 8;
    if (chosenPenalty && chosenPenalty.name !== "No Penalty") {
        wheelSegmentPenalties.push(chosenPenalty);
        let displayable = penaltyList.filter(p => p?.name && parseFloat(p.probability) > 0);
        if (displayable.length > 0) {
            let others = displayable.filter(p => p.id !== chosenPenalty?.id);
            shuffleArray(others);
            wheelSegmentPenalties = wheelSegmentPenalties.concat(others.slice(0, NUM_PENALTY_SEGMENTS - wheelSegmentPenalties.length));
            let pool = wheelSegmentPenalties.length > 0 ? wheelSegmentPenalties : displayable;
            if (pool.length > 0) {
                for (let i = 0; wheelSegmentPenalties.length < NUM_PENALTY_SEGMENTS && wheelSegmentPenalties.length > 0; i++) {
                    wheelSegmentPenalties.push(pool[i % pool.length]);
                }
            }
        }
        if (wheelSegmentPenalties.length > NUM_PENALTY_SEGMENTS) wheelSegmentPenalties = wheelSegmentPenalties.slice(0, NUM_PENALTY_SEGMENTS);
        if (wheelSegmentPenalties.length === 0) wheelSegmentPenalties.push(chosenPenalty);
        while (wheelSegmentPenalties.length < NUM_PENALTY_SEGMENTS && wheelSegmentPenalties.length > 0 && wheelSegmentPenalties.length < 2) {
             wheelSegmentPenalties.push(wheelSegmentPenalties[0]);
        }
    }
    if (wheelSegmentPenalties.length === 0 && chosenPenalty.name !== "No Penalty") {
        wheelSegmentPenalties.push(chosenPenalty);
        wheelSegmentPenalties.push({name: "Safe", description:"Almost..."});
    }

    penaltyWheelSegmentsForAnim = createSegments(wheelSegmentPenalties.map(p => p.name), ['#e41a1c', '#377eb8']);
    const penaltyWinningSegmentIndex = chosenPenalty.name !== "No Penalty" && penaltyWheelSegmentsForAnim.length > 0 ? (penaltyWheelSegmentsForAnim.findIndex(seg => seg.text === chosenPenalty.name) + 1) : 0;
    const penaltyStopAngle = chosenPenalty.name !== "No Penalty" && penaltyWinningSegmentIndex > 0 ? calculateStopAngle(penaltyWheelSegmentsForAnim.length, penaltyWinningSegmentIndex) : 0;

    console.log('[PenaltyHandler] Data for payload: chosenPenalty:', JSON.parse(JSON.stringify(chosenPenalty)), 
                'wheelSegmentPenalties:', JSON.parse(JSON.stringify(wheelSegmentPenalties)),
                'penaltyWinningSegmentIndex:', penaltyWinningSegmentIndex,
                'penaltyStopAngle:', penaltyStopAngle);

    const penaltyResultPayload = {
        player: chosenEntity,
        name: chosenPenalty.name,
        description: chosenPenalty.description || null,
        all_players: participants,
        playerWinningSegmentIndex: playerWinningSegmentIndex,
        playerStopAngle: playerStopAngle,
        all_penalties: wheelSegmentPenalties,
        penaltyWinningSegmentIndex: penaltyWinningSegmentIndex,
        penaltyStopAngle: penaltyStopAngle
    };

    if (isLocalClick) {
        if(resultDisplay) resultDisplay.innerHTML = `<span class="text-info">Spinning locally...</span>`;
        const mockEventData = {
            challenge_id: penaltyPageConfig.challengeId,
            group_id: penaltyPageConfig.challengeId,
            result: penaltyResultPayload, // This is the actual penalty data
            initiator_user_id: 'local_user'
        };
        // For local, we directly pass penaltyResultPayload as the 'result' part of the event
        triggerRemotePenaltySpinAnimation({
            group_id: mockEventData.group_id,
            result: { // Nest it to match server structure
                result: mockEventData.result,
                initiator_user_id: mockEventData.initiator_user_id
            }
        }, button);
    } else {
        if (!penaltyPageConfig.userJoinedGroupId) {
            showError(errorTarget, "You must be in a group to spin for a shared challenge.", "danger");
            button.disabled = false; return;
        }
        if(resultDisplay) resultDisplay.innerHTML = `<span class="text-info">Sending spin to server...</span>`;
        const recordUrl = `/api/challenge/groups/${penaltyPageConfig.userJoinedGroupId}/penalty_spin_result`;
        try {
            // The backend expects { "penalty_result": penaltyResultPayload }
            await apiFetch(recordUrl, { method: 'POST', body: { penalty_result: penaltyResultPayload } }, penaltyPageConfig.challengeConfigData.csrfToken);
        } catch (error) {
            console.error("[PENALTY_CLICK - Shared] Failed to send penalty spin to backend:", error);
            showError(errorTarget, `Error sending spin: ${error.message}`, "danger");
            button.disabled = false;
        }
    }
}

function initializePenaltyHandler() {
    if (bailIfLibMissing(document.body)) { return; }
    const dataEl = document.getElementById('challengeData');
    const statusDiv = document.getElementById('pageStatusDisplay');
    if (dataEl?.dataset) {
        try {
            const joinedId = JSON.parse(dataEl.dataset.userJoinedGroupId || 'null');
            const initialGroups = JSON.parse(dataEl.dataset.initialGroups || 'null');
            const numPlayers = parseInt(dataEl.dataset.numPlayersPerGroup, 10);
            penaltyPageConfig = { 
                userJoinedGroupId: typeof joinedId === 'number' ? joinedId : null,
                numPlayersPerGroup: (!isNaN(numPlayers) && numPlayers >= 1) ? numPlayers : 1,
                initialGroups: Array.isArray(initialGroups) ? initialGroups : [],
                isMultigroup: dataEl.dataset.isMultigroup === 'true'
            };
            const challengeViewContainer = document.getElementById('challengeViewContainer');
            if (challengeViewContainer) {
                challengeViewContainer.addEventListener('click', handleLostGameClick);
            } else {
                console.error("[Penalty Module] Could not find 'challengeViewContainer'. Attaching to document.");
                document.addEventListener('click', handleLostGameClick);
            }
        } catch (e) { console.error("Penalty module failed to read initial config:", e); showError(statusDiv || document.body, "Penalty Init Error.", 'warning'); }
    } else { console.error("Penalty module could not find #challengeData."); }
}

initializePenaltyHandler();

export function triggerRemotePenaltySpinAnimation(eventData, initiatorButton = null) {
    if (bailIfLibMissing(document.body)) return;

    // eventData is the full payload from socket: { group_id, result: { result: actual_payload, initiator_user_id: X } }
    const { group_id, result: eventResultContainer } = eventData; 
    
    // The actual penalty data is nested inside eventResultContainer.result
    const actualPenaltyData = eventResultContainer?.result;
    // The initiator_user_id is also inside eventResultContainer
    const received_initiator_user_id = eventResultContainer?.initiator_user_id;

    console.log('[PenaltyHandler] triggerRemotePenaltySpinAnimation: typeof actualPenaltyData?.name:', typeof actualPenaltyData?.name, 'actualPenaltyData?.name value:', actualPenaltyData?.name);
    console.log('[PenaltyHandler] triggerRemotePenaltySpinAnimation: Full eventResultContainer object:', JSON.parse(JSON.stringify(eventResultContainer)));
    console.log('[PenaltyHandler] triggerRemotePenaltySpinAnimation: actualPenaltyData (eventResultContainer.result):', JSON.parse(JSON.stringify(actualPenaltyData)));
    console.log('[PenaltyHandler] triggerRemotePenaltySpinAnimation: received_initiator_user_id from eventResultContainer:', received_initiator_user_id);

    const currentUserIdStr = penaltyPageConfig.challengeConfigData?.currentUserId?.toString();
    // Use received_initiator_user_id for comparisons
    const eventInitiatorIsCurrentUser = received_initiator_user_id === currentUserIdStr;
    const isLocalSpinInitiatedByThisClient = received_initiator_user_id === 'local_user';

    const idx = (penaltyPageConfig.isLocal && penaltyPageConfig.challengeId === group_id) ? 'local' : 'shared';
    
    let buttonOnThisClient = null;
    if (isLocalSpinInitiatedByThisClient) {
        buttonOnThisClient = initiatorButton;
    } else if (idx === 'shared') {
        if (penaltyPageConfig.userJoinedGroupId === group_id) {
             buttonOnThisClient = document.querySelector(`.lostGameBtn-Shared[data-group-id="${group_id}"]`) || document.querySelector('.lostGameBtn-Shared');
        }
    }

    if (buttonOnThisClient && !isLocalSpinInitiatedByThisClient) {
        buttonOnThisClient.disabled = true;
    }

    // Extract properties from actualPenaltyData
    const chosenEntity = actualPenaltyData?.player;
    const penaltyName = actualPenaltyData?.name; 
    const penaltyDescription = actualPenaltyData?.description;
    const playerStopAngle = actualPenaltyData?.playerStopAngle;
    const playerWinningSegmentIndex = actualPenaltyData?.playerWinningSegmentIndex;
    const participants = actualPenaltyData?.all_players;
    const penaltyStopAngle = actualPenaltyData?.penaltyStopAngle;
    const penaltyWinningSegmentIndex = actualPenaltyData?.penaltyWinningSegmentIndex;
    const wheelSegmentPenaltiesData = actualPenaltyData?.all_penalties;

    console.log('[PenaltyHandler] triggerRemotePenaltySpinAnimation: Extracted penaltyName from actualPenaltyData:', penaltyName);

    const finalPenaltyName = (penaltyName && typeof penaltyName === 'string' && penaltyName.trim() !== "") ? penaltyName : "No Penalty";
    const finalPenaltyDescription = (finalPenaltyName === "No Penalty" && !penaltyDescription) ? "No penalty assigned." : penaltyDescription;

    const chosenPenalty = { name: finalPenaltyName, description: finalPenaltyDescription };
    console.log('[PenaltyHandler] triggerRemotePenaltySpinAnimation: finalPenaltyName:', finalPenaltyName, 'chosenPenalty for animation:', JSON.parse(JSON.stringify(chosenPenalty)));

    const playerWheelContainer = document.getElementById(`playerWheelContainer-${idx}`);
    const playerWheelTitle = document.getElementById(`playerWheelTitle-${idx}`);
    const penaltyWheelContainer = document.getElementById(`penaltyWheelContainer-${idx}`);
    const resultDisplay = document.getElementById(`penaltyResult-${idx}`);
    const errorTarget = resultDisplay || document.body;

    if (!resultDisplay || !playerWheelContainer || !penaltyWheelContainer) {
        console.error(`[RemotePenaltyAnim] DOM Error: Missing UI for index '${idx}'.`);
        if (initiatorButton) initiatorButton.disabled = false;
        return;
    }
    resetPenaltyUI(idx);
    if(resultDisplay) {
        resultDisplay.style.display = 'block';
        resultDisplay.className = 'mt-3 penalty-result-display alert alert-info';
        resultDisplay.innerHTML = `<span class="text-info">Spinning penalty for ${escapeHtml(chosenEntity)} in group ${escapeHtml(group_id)}...</span>`;
    }

    if (participants && participants.length > 0 && playerWinningSegmentIndex > 0) {
        if (playerWheelTitle) playerWheelTitle.textContent = `Player: ${escapeHtml(chosenEntity)}`;
        const playerColors = ['#8dd3c7', '#ffffb3', '#bebada', '#fb8072', '#80b1d3', '#fdb462', '#b3de69', '#fccde5'];
        const entitySegments = createSegments(participants, playerColors);
        if (!entitySegments || entitySegments.length === 0) {
            showError(errorTarget, "Error creating remote player segments.", "danger");
            if (buttonOnThisClient) buttonOnThisClient.disabled = false; return;
        }
        if (getPlayerWheel(idx)) { getPlayerWheel(idx).stopAnimation?.(false); setPlayerWheel(idx, null); }
        try {
            const playerCfg = getPenaltyWheelConfig(entitySegments, playerWinningSegmentIndex,
                () => {
                    if (penaltyWheelContainer) penaltyWheelContainer.style.display = 'block';
                    animateActualPenaltyWheelRemote(idx, group_id, chosenEntity, chosenPenalty, penaltyStopAngle, penaltyWinningSegmentIndex, wheelSegmentPenaltiesData, resultDisplay, errorTarget, participants, playerStopAngle, playerWinningSegmentIndex, buttonOnThisClient);
                }, idx, 'Player', playerStopAngle);
            if (!playerCfg) { showError(errorTarget, "Failed to configure remote player wheel.", "danger"); if (buttonOnThisClient) buttonOnThisClient.disabled = false; return; }
            const pWheel = new Winwheel(playerCfg);
            setPlayerWheel(idx, pWheel);
            if (playerWheelContainer) playerWheelContainer.style.display = 'block';
            if(resultDisplay) resultDisplay.innerHTML = `<span class="text-warning">Animating player selection...</span>`;
            pWheel.startAnimation();
        } catch (e) {
            console.error("Error creating remote Player WinWheel:", e);
            showError(errorTarget, "Error initializing remote participant wheel!", "danger");
            if (buttonOnThisClient) buttonOnThisClient.disabled = false;
        }
    } else {
        if (penaltyWheelContainer) penaltyWheelContainer.style.display = 'block';
        animateActualPenaltyWheelRemote(idx, group_id, chosenEntity, chosenPenalty, penaltyStopAngle, penaltyWinningSegmentIndex, wheelSegmentPenaltiesData, resultDisplay, errorTarget, participants, playerStopAngle, playerWinningSegmentIndex, buttonOnThisClient);
    }
}

function animateActualPenaltyWheelRemote(idx, groupIdForPenalty, chosenEntity, chosenPenalty, actualPenaltyWheelStopAngle, actualPenaltyWheelWinningSegmentIndex, wheelSegmentPenaltiesData, resultDisplay, errorTarget, _p, _psa, _pwsi, buttonToReEnable) {
    if (!resultDisplay) { console.error("[RemotePenaltyAnim] resultDisplay missing."); if (buttonToReEnable) buttonToReEnable.disabled = false; return; }
    resultDisplay.innerHTML = `<span class="text-warning"><strong>${escapeHtml(chosenEntity)}</strong> selected. Animating penalty...</span>`;

    if (!chosenPenalty || chosenPenalty.name === "No Penalty" || !wheelSegmentPenaltiesData || wheelSegmentPenaltiesData.length === 0 || typeof actualPenaltyWheelWinningSegmentIndex !== 'number' || actualPenaltyWheelWinningSegmentIndex <= 0) {
        displayPenaltyResultUI(idx, groupIdForPenalty, chosenEntity, chosenPenalty, buttonToReEnable);
        const penaltyWheelContainer = document.getElementById(`penaltyWheelContainer-${idx}`);
        if (penaltyWheelContainer) penaltyWheelContainer.style.display = 'none';
        return;
    }
    const penaltyColors = ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#a65628', '#f781bf', '#999999'];
    const penaltySegmentNames = wheelSegmentPenaltiesData.map(p => p.name || p.text || '?');
    const penaltyWheelSegments = createSegments(penaltySegmentNames, penaltyColors);

    if (penaltyWheelSegments.length === 0) {
        showError(errorTarget, "Failed to create remote penalty segments.", "danger");
        if (buttonToReEnable) buttonToReEnable.disabled = false; return;
    }
    if (actualPenaltyWheelWinningSegmentIndex > penaltyWheelSegments.length) {
        console.error(`Remote penalty: Winning index ${actualPenaltyWheelWinningSegmentIndex} out of bounds for ${penaltyWheelSegments.length} segments.`);
        showError(errorTarget, "Error with remote penalty animation data.", "danger");
        displayPenaltyResultUI(idx, groupIdForPenalty, chosenEntity, chosenPenalty, buttonToReEnable);
        if (buttonToReEnable) buttonToReEnable.disabled = false; return;
    }
    if (getPenaltyWheel(idx)) { getPenaltyWheel(idx).stopAnimation?.(false); setPenaltyWheel(idx, null); }
    try {
        const penaltyCfg = getPenaltyWheelConfig(penaltyWheelSegments, actualPenaltyWheelWinningSegmentIndex,
            () => displayPenaltyResultUI(idx, groupIdForPenalty, chosenEntity, chosenPenalty, buttonToReEnable),
            idx, 'Penalty', actualPenaltyWheelStopAngle);
        if (!penaltyCfg) { showError(errorTarget, "Failed to configure remote penalty wheel.", "danger"); if (buttonToReEnable) buttonToReEnable.disabled = false; return; }
        const penWheel = new Winwheel(penaltyCfg);
        setPenaltyWheel(idx, penWheel);
        penWheel.startAnimation();
    } catch (e) {
        console.error("Error creating remote Penalty WinWheel:", e);
        showError(errorTarget, "Error initializing remote penalty wheel display!", "danger");
        if (buttonToReEnable) buttonToReEnable.disabled = false;
    }
}


