// app/static/js/challenge_view/realtime/penaltyHandler.js
import { getLocalOnlyEntries as getLocalPenalties } from '../../penalties/penaltyLocalStorageUtils.js';
import { escapeHtml, showError, showFlash } from '../../utils/helpers.js';
import { apiFetch } from '../../utils/api.js';
import { updatePenaltyDisplay as updateGlobalPenaltyDisplay } from '../ui/uiOrchestrator.js';
import { updateGroupCardContents } from '../ui/groupCard.js'; // Added import

let winwheelLoaded = (typeof Winwheel !== 'undefined');

function bailIfLibMissing(targetNode) {
    if (winwheelLoaded) return false;
    winwheelLoaded = null; // Prevent repeated errors
    const msg = "Penalty wheel is unavailable because the Winwheel library could not be loaded.";
    showError(targetNode || document.body, msg, "danger");
    console.error(msg);
    return true;
}

const wheels = { player: new Map(), penalty: new Map(), time: new Map() };
const getWheel = (type, idx) => wheels[type].get(idx);
const setWheel = (type, idx, wheel) => wheels[type].set(idx, wheel);

let penaltyPageConfig = {
    userJoinedGroupId: null,
    numPlayersPerGroup: 1,
    initialGroups: [],
    isMultigroup: false,
    isLocal: false,
    challengeId: null,
    challengeConfigData: {}
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

const TIME_SEGMENTS_DATA = [
    { text: "1 Min", seconds: 60, fillStyle: '#FFFACD', textFontSize: 10 },
    { text: "3 Mins", seconds: 180, fillStyle: '#FFB6C1', textFontSize: 10 },
    { text: "5 Mins", seconds: 300, fillStyle: '#ADD8E6', textFontSize: 10 },
    { text: "10 Mins", seconds: 600, fillStyle: '#98FB98', textFontSize: 10 },
    { text: "15 Mins", seconds: 900, fillStyle: '#FFDEAD', textFontSize: 10 },
    { text: "20 Mins", seconds: 1200, fillStyle: '#DDA0DD', textFontSize: 10 },
    { text: "25 Mins", seconds: 1500, fillStyle: '#B0E0E6', textFontSize: 10 },
    { text: "30 Mins", seconds: 1800, fillStyle: '#FFA07A', textFontSize: 10 }
];

function createSegments(items, defaultColors, useItemFillStyle = false) {
    if (!items || items.length === 0) return [];
    const safeColors = defaultColors && defaultColors.length > 0 ? defaultColors : ['#888888'];
    return items.map((item, index) => ({
        'fillStyle': useItemFillStyle && item.fillStyle ? item.fillStyle : safeColors[index % safeColors.length],
        'text': String(item.text || item.name || item || '?'),
        'textFontSize': item.textFontSize || 12,
        'textFontFamily': 'Arial, Helvetica, sans-serif',
        'originalData': typeof item === 'object' ? item : { text: String(item || '?') }
    }));
}

function calculateStopAngle(numSegments, winningSegmentNumber) {
    if (numSegments <= 0 || winningSegmentNumber <= 0 || winningSegmentNumber > numSegments) return Math.random() * 360;
    const segmentAngle = 360 / numSegments;
    return (winningSegmentNumber - 1) * segmentAngle + (segmentAngle * (0.1 + Math.random() * 0.8));
}

function selectWeightedPenalty(penalties) {
    if (!Array.isArray(penalties) || penalties.length === 0) return { name: "No Penalty", description: "No penalties defined." };
    let totalWeight = 0;
    const validPenalties = penalties.filter(p => {
        const prob = p?.probability !== undefined ? parseFloat(p.probability) : NaN;
        if (p?.name?.trim() && !isNaN(prob) && prob > 0) { totalWeight += prob; return true; }
        return false;
    });
    if (totalWeight <= 0 || validPenalties.length === 0) return { name: "No Penalty", description: "No applicable penalties found." };
    let r = Math.random() * totalWeight;
    for (const p of validPenalties) { if ((r -= parseFloat(p.probability)) <= 0) return p; }
    return validPenalties[validPenalties.length - 1];
}

function shuffleArray(array) { for (let i = array.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[array[i], array[j]] = [array[j], array[i]]; } return array; }

function resetPenaltyUI(idx) {
    ['player', 'penalty', 'time'].forEach(type => {
        const container = document.getElementById(`${type}WheelContainer-${idx}`);
        if (container) container.style.display = 'none';
        getWheel(type, idx)?.stopAnimation?.(false);
        setWheel(type, idx, null);
    });
    const resultDisp = document.getElementById(`penaltyResult-${idx}`);
    if (resultDisp) { resultDisp.style.display = 'none'; showError(resultDisp, null); }
}

function configureWheel(segments, winningIndex, callbackFn, idx, wheelType = 'Penalty', customStopAngle = null) {
    if (!winwheelLoaded || !Array.isArray(segments) || segments.length === 0 || winningIndex < 0 || winningIndex > segments.length) {
        console.error(`Cannot configure ${wheelType} wheel: invalid params. Segments:`, segments, "Winning Index:", winningIndex);
        throw new Error(`Config error for ${wheelType} wheel.`);
    }
    const numSegments = segments.length;
    let stopAngle = customStopAngle ?? (winningIndex === 0 ? Math.random() * 360 : calculateStopAngle(numSegments, winningIndex));
    
    // console.log(`[configureWheel - ${wheelType}-${idx}] Received customStopAngle: ${customStopAngle}, winningIndex: ${winningIndex}. Calculated stopAngle: ${stopAngle}`); // Removed log

    let canvasId, outerRadius, innerRadius, duration, spins, textFontSize = 12, textFillStyle = '#ffffff';
    if (wheelType === 'Player') { canvasId = `playerWheelCanvas-${idx}`; outerRadius = 100; innerRadius = 10; duration = 3; spins = 5; }
    else if (wheelType === 'Penalty') { canvasId = `penaltyWheelCanvas-${idx}`; outerRadius = 140; innerRadius = 20; duration = 5; spins = 8; }
    else { canvasId = `timeWheelCanvas-${idx}`; outerRadius = 120; innerRadius = 15; duration = 4; spins = 6; textFontSize = 10; textFillStyle = '#333333'; }

    const canvasElement = document.getElementById(canvasId);
    if (!canvasElement) {
        console.error(`Wheel canvas element with ID '${canvasId}' not found in the DOM.`);
        throw new Error(`Canvas element '${canvasId}' not found for ${wheelType} wheel.`); 
    }

    return {
        canvasId, numSegments, outerRadius, innerRadius, textFontSize, textFillStyle,
        textMargin: 5, textStrokeStyle: 'rgba(0,0,0,0.1)', lineWidth: 2, strokeStyle: '#ffffff', segments,
        pointerGuide: { display: true, strokeStyle: '#ffc107', lineWidth: 3 },
        animation: { type: 'spinToStop', duration, spins, easing: 'Power4.easeOut', stopAngle, callbackFinished: callbackFn },
        pins: { number: Math.min(numSegments * 2, 32), outerRadius: 4, fillStyle: '#cccccc', strokeStyle: '#666666' }
    };
}

async function handleLostGameClick(event) {
    const clickedElement = event.target;
    let button = clickedElement.closest('.lostGameBtn-Shared, .lostGameBtn-Local');
    if (!button || button.disabled) return;
    event.stopPropagation();
    if (bailIfLibMissing(document.body)) return;

    const isLocalClick = button.classList.contains('lostGameBtn-Local');
    const idx = isLocalClick ? 'local' : 'shared';
    const resultDisplay = document.getElementById(`penaltyResult-${idx}`);
    const errorTarget = resultDisplay || document.body;

    resetPenaltyUI(idx);
    button.disabled = true;
    if(resultDisplay) { resultDisplay.style.display = 'block'; resultDisplay.className = 'mt-3 penalty-result-display alert alert-info'; resultDisplay.innerHTML = `<span class="text-info">Preparing penalty spin...</span>`; }

    let participants = ['Participant'];
    if (!isLocalClick && penaltyPageConfig.userJoinedGroupId && penaltyPageConfig.isMultigroup) {
        const group = penaltyPageConfig.initialGroups.find(g => g.id === penaltyPageConfig.userJoinedGroupId);
        const names = group?.player_names?.map(s => s?.display_name?.trim()).filter(Boolean);
        participants = names?.length ? names.slice(0, penaltyPageConfig.numPlayersPerGroup) : Array.from({ length: penaltyPageConfig.numPlayersPerGroup }, (_, i) => `Player ${i + 1}`);
    }
    if (participants.length === 0) { showError(errorTarget, "No participants.", "danger"); button.disabled = false; return; }
    
    const chosenEntity = participants.length > 1 ? participants[Math.floor(Math.random() * participants.length)] : participants[0];
    
    const penaltyInfo = penaltyPageConfig.challengeConfigData?.penaltyInfo;
    let penaltyList = penaltyInfo?.penalties?.length ? penaltyInfo.penalties : [];

    let finalPenaltyListForSelection = penaltyList;
    if (!isLocalClick && penaltyPageConfig.userJoinedGroupId) {
        const currentGroup = penaltyPageConfig.initialGroups.find(g => g.id === penaltyPageConfig.userJoinedGroupId);
        if (!currentGroup?.currentGameInfo) {
            showFlash("Please click a game name to select it as 'current' before spinning for a penalty.", "info", 5000);
            button.disabled = false; return;
        }
        if (currentGroup.currentGameInfo.tags?.length) {
            const gameTags = currentGroup.currentGameInfo.tags.map(t => t.toLowerCase());
            finalPenaltyListForSelection = penaltyList.filter(p => p?.tags && (p.tags.map(t => String(t).toLowerCase()).includes("universal") || p.tags.map(t => String(t).toLowerCase()).some(pt => gameTags.includes(pt))));
            if (finalPenaltyListForSelection.length === 0 && penaltyList.length > 0) console.warn("No penalties match game tags or Universal.");
        }
    }

    const chosenPenalty = selectWeightedPenalty(finalPenaltyListForSelection);
    if (!chosenPenalty?.name) { showError(errorTarget, "Could not determine penalty.", "danger"); button.disabled = false; return; }

    const chosenPlayer = participants.length > 1 
        ? participants[Math.floor(Math.random() * participants.length)] 
        : participants[0];
    const playerSegments = createSegments(participants, ['#8dd3c7', '#ffffb3', '#bebada']);
    const playerWinningSegmentIndex = participants.length > 1 
        ? (playerSegments.findIndex(s => s.text === chosenPlayer) + 1)
        : 0; 
    const playerStopAngle = playerWinningSegmentIndex > 0 
        ? calculateStopAngle(playerSegments.length, playerWinningSegmentIndex) 
        : 0;

    let segmentsForPenaltyWheel = [];
    const NUM_PENALTY_SEGMENTS = 8;
    if (chosenPenalty.name !== "No Penalty") {
        segmentsForPenaltyWheel.push({name: chosenPenalty.name, id: chosenPenalty.id, description: chosenPenalty.description});
        let others = finalPenaltyListForSelection.filter(p => p?.name && parseFloat(p.probability) > 0 && p.id !== chosenPenalty.id);
        shuffleArray(others);
        segmentsForPenaltyWheel = segmentsForPenaltyWheel.concat(others.slice(0, NUM_PENALTY_SEGMENTS - 1));
        while (segmentsForPenaltyWheel.length < Math.min(NUM_PENALTY_SEGMENTS, 2) && segmentsForPenaltyWheel.length > 0) {
             segmentsForPenaltyWheel.push({...segmentsForPenaltyWheel[0], name: segmentsForPenaltyWheel[0].name + "\u00A0"});
        }
        if (segmentsForPenaltyWheel.length === 0) segmentsForPenaltyWheel.push({name: chosenPenalty.name, id: chosenPenalty.id, description: chosenPenalty.description});
    }
    if (segmentsForPenaltyWheel.length === 0) { segmentsForPenaltyWheel.push({name: "No Penalty"}); segmentsForPenaltyWheel.push({name: "Lucky Break"});}
    
    const penaltyWheelAnimSegments = createSegments(segmentsForPenaltyWheel, ['#e41a1c', '#377eb8', '#4daf4a']);
    const penaltyWinningSegmentIndex = penaltyWheelAnimSegments.findIndex(s => s.text.trim() === chosenPenalty.name.trim()) + 1;
    const penaltyStopAngle = calculateStopAngle(penaltyWheelAnimSegments.length, penaltyWinningSegmentIndex);

    const chosenTimeSegmentData = TIME_SEGMENTS_DATA[Math.floor(Math.random() * TIME_SEGMENTS_DATA.length)];
    const timeSegmentsForAnim = createSegments(TIME_SEGMENTS_DATA, [], true);
    const timeWinningSegmentIndex = TIME_SEGMENTS_DATA.findIndex(t => t.seconds === chosenTimeSegmentData.seconds) + 1;
    const timeStopAngle = calculateStopAngle(timeSegmentsForAnim.length, timeWinningSegmentIndex);

    const finalPayloadForBackend = {
        player: chosenPlayer,
        name: chosenPenalty.name,
        description: chosenPenalty.description,
        id: chosenPenalty.id,
        duration_seconds: chosenTimeSegmentData.seconds,
        chosenTimeText: chosenTimeSegmentData.text,
        all_players: participants,
        playerWinningSegmentIndex: playerWinningSegmentIndex,
        playerStopAngle: playerStopAngle,
        all_penalties_for_wheel: segmentsForPenaltyWheel, 
        penaltyWinningSegmentIndex: penaltyWinningSegmentIndex,
        penaltyStopAngle: penaltyStopAngle,
        timeWinningSegmentIndex: timeWinningSegmentIndex,
        timeStopAngle: timeStopAngle
    };
    
    // console.log(`[handleLostGameClick - ${idx}] Determined payload:`, JSON.parse(JSON.stringify(finalPayloadForBackend))); // Removed log

    if (isLocalClick) {
        if(resultDisplay) resultDisplay.innerHTML = `<span class="text-info">Spinning...</span>`;
        triggerRemotePenaltySpinAnimation({
            group_id: penaltyPageConfig.challengeId, 
            result: { result: finalPayloadForBackend, initiator_user_id: 'local_user' }
        }, button);
    } else {
        if (!penaltyPageConfig.userJoinedGroupId) {
            showError(errorTarget, "You must be in a group to spin for a shared challenge.", "danger");
            button.disabled = false; return;
        }
        if(resultDisplay) resultDisplay.innerHTML = `<span class="text-info">Sending spin data to server...</span>`;
        const recordUrl = `/api/challenge/groups/${penaltyPageConfig.userJoinedGroupId}/penalty_spin_result`;
        try {
            await apiFetch(recordUrl, { method: 'POST', body: { penalty_result: finalPayloadForBackend } }, penaltyPageConfig.challengeConfigData.csrfToken);
        } catch (error) {
            console.error("[LostGameClick - Shared] Failed to send penalty data to backend:", error);
            showError(errorTarget, `Error sending spin data: ${error.message}`, "danger");
            if (button) button.disabled = false; 
        }
    }
}

function initializePenaltyHandler() {
    if (bailIfLibMissing(document.body)) return;
    const challengeViewContainer = document.getElementById('challengeViewContainer');
    if (challengeViewContainer) {
        challengeViewContainer.addEventListener('click', handleLostGameClick);
    }
}
initializePenaltyHandler();

export function triggerRemotePenaltySpinAnimation(eventData, initiatorButton = null) {
    if (bailIfLibMissing(document.body)) return;

    const { group_id, result: eventResultContainer } = eventData; 
    const actualPenaltyData = eventResultContainer?.result; 
    const received_initiator_user_id = eventResultContainer?.initiator_user_id;
    
    const isLocalSpin = received_initiator_user_id === 'local_user';
    const idx = (penaltyPageConfig.isLocal && penaltyPageConfig.challengeId === group_id) ? 'local' : 'shared';
    
    let buttonOnThisClient = null;
    if (isLocalSpin && initiatorButton) {
        buttonOnThisClient = initiatorButton;
        // console.log(`[PenaltyHandler triggerRemotePenaltySpinAnimation] Local spin, buttonOnThisClient set from initiatorButton:`, buttonOnThisClient); // Removed log
    } else if (idx === 'shared') { 
        // For shared challenges, the button is global, not per-card.
        // The group_id check is relevant for *if* this client's joined group is affected,
        // but the button element itself is singular for ".lostGameBtn-Shared".
        buttonOnThisClient = document.querySelector('.lostGameBtn-Shared');
        // console.log(`[PenaltyHandler triggerRemotePenaltySpinAnimation] Shared spin, buttonOnThisClient queried globally:`, buttonOnThisClient); // Removed log
    }
    
    // This logic correctly disables the button if another user initiated the spin for the current user's group.
    // It should only apply if the penalty event's group_id matches the current user's joined group.
    if (buttonOnThisClient && !isLocalSpin && 
        penaltyPageConfig.userJoinedGroupId === group_id && // Only disable if it's for *my* group
        received_initiator_user_id !== penaltyPageConfig.challengeConfigData?.currentUserId?.toString()) {
        buttonOnThisClient.disabled = true;
    }

    const {
        player: chosenEntity, name: penaltyName, description: penaltyDescription,
        duration_seconds: finalDurationSeconds, chosenTimeText,
        all_players: participants, playerWinningSegmentIndex, playerStopAngle,
        all_penalties_for_wheel: wheelSegmentPenaltiesData, penaltyWinningSegmentIndex, penaltyStopAngle,
        timeWinningSegmentIndex, timeStopAngle
    } = actualPenaltyData;

    const resultDisplay = document.getElementById(`penaltyResult-${idx}`);
    resetPenaltyUI(idx); 

    if (!resultDisplay) { if (buttonOnThisClient) buttonOnThisClient.disabled = false; return; }
    resultDisplay.style.display = 'block'; 
    resultDisplay.className = 'mt-3 penalty-result-display alert alert-info text-center fs-5 fw-semibold glass-effect shadow';
    // Initial message before any wheel spins for replayed sequence
    // resultDisplay.innerHTML = `<span class="text-info">Replaying penalty sequence for ${escapeHtml(chosenEntity)}...</span>`; // Original generic message

    const afterAllSpinsReplay = () => {
        // console.log("[PenaltyHandler afterAllSpinsReplay] Entered. buttonOnThisClient:", buttonOnThisClient); // Removed log
        if (buttonOnThisClient) {
            // console.log("[PenaltyHandler afterAllSpinsReplay] buttonOnThisClient found. Current disabled state BEFORE change:", buttonOnThisClient.disabled); // Removed log
            buttonOnThisClient.disabled = false;
            // console.log("[PenaltyHandler afterAllSpinsReplay] buttonOnThisClient.disabled set to false. New state AFTER change:", buttonOnThisClient.disabled); // Removed log
        } else {
            // console.log("[PenaltyHandler afterAllSpinsReplay] buttonOnThisClient is null or undefined, cannot re-enable."); // Removed log
        }

        if (resultDisplay) {
            resultDisplay.innerHTML = `<span class="text-success h5">Penalty for ${escapeHtml(chosenEntity)}: ${escapeHtml(actualPenaltyData.name)} (${actualPenaltyData.chosenTimeText})</span>`;
            resultDisplay.className = 'mt-3 penalty-result-display alert alert-success text-center fs-5 fw-semibold glass-effect shadow';
            resultDisplay.style.display = 'block';
            setTimeout(() => {
                if (resultDisplay) resultDisplay.style.display = 'none';
            }, 5000);
        }

        // --- New logic to refresh the entire card ---
        let targetGroupDataForRefresh = null;
        let cardWrapperForRefresh = null;
        const fullChallengeConfig = penaltyPageConfig.challengeConfigData;

        if (isLocalSpin) {
            // Attempt to find a card wrapper for the local challenge.
            // Example: document.getElementById('local-group-card-wrapper'); or query by data-group-id if applicable
            cardWrapperForRefresh = document.querySelector(`.group-card-wrapper[data-group-id="${group_id}"]`);
            if (!cardWrapperForRefresh) { // Fallback if a specific ID is used for local card wrapper
                cardWrapperForRefresh = document.getElementById('local-challenge-card-wrapper'); // Hypothetical ID
            }

            // Construct groupData for local challenge to pass to updateGroupCardContents
            targetGroupDataForRefresh = {
                id: group_id, // This is penaltyPageConfig.challengeId for local
                name: fullChallengeConfig.name || "Local Challenge",
                active_penalty_text: actualPenaltyData?.name ? `Penalty: ${actualPenaltyData.name}` : "",
                active_penalty_description: actualPenaltyData?.description || null,
                active_penalty_duration_seconds: actualPenaltyData?.duration_seconds,
                penalty_applied_at_utc: actualPenaltyData?.final_applied_at_utc || new Date().toISOString(),
                progress: fullChallengeConfig.localProgress || {}, // Placeholder
                player_names: [{ display_name: chosenEntity, account_name: null }], // Placeholder
                member_count: 1, // Placeholder
                currentGameInfo: fullChallengeConfig.localCurrentGameInfo || null, // Placeholder
                // Ensure all fields required by updateGroupCardContents are present
            };
        } else { // Shared challenge
            cardWrapperForRefresh = document.querySelector(`.group-card-wrapper[data-group-id="${group_id}"]`);
            const groupFromConfig = penaltyPageConfig.initialGroups.find(g => g.id === group_id);
            if (groupFromConfig) {
                // ASSUMPTION: groupFromConfig is already updated by a socket event handler
                // with the new penalty information and any other consequential state changes.
                targetGroupDataForRefresh = groupFromConfig;
            } else {
                console.error(`[afterAllSpinsReplay] Shared group ${group_id} not found in penaltyPageConfig.initialGroups.`);
            }
        }

        if (cardWrapperForRefresh && targetGroupDataForRefresh) {
            // console.log(`[afterAllSpinsReplay] Performing full card refresh for group ${targetGroupDataForRefresh.id}.`); // Removed log
            updateGroupCardContents(cardWrapperForRefresh, targetGroupDataForRefresh, fullChallengeConfig);
        } else {
            // console.warn(`[afterAllSpinsReplay] Could not perform full card refresh for group ${group_id}. Falling back to direct penalty display update. CardWrapper: ${!!cardWrapperForRefresh}, GroupData: ${!!targetGroupDataForRefresh}`); // Removed log
            const penaltyDisplayEl = cardWrapperForRefresh 
                ? cardWrapperForRefresh.querySelector('.active-penalty-display') 
                : document.querySelector(`.group-card-wrapper[data-group-id="${group_id}"] .active-penalty-display`);
                
            if (penaltyDisplayEl) {
                const canInteract = penaltyPageConfig.isLocal || (fullChallengeConfig.isLoggedIn && fullChallengeConfig.isAuthorized && fullChallengeConfig.userJoinedGroupId === group_id);
                const penaltyTextForCard = actualPenaltyData?.name ? `Penalty: ${actualPenaltyData.name}` : "";
                const penaltyDescriptionForTooltip = actualPenaltyData?.description || "";
                updateGlobalPenaltyDisplay(penaltyDisplayEl, penaltyTextForCard, canInteract, actualPenaltyData?.duration_seconds, actualPenaltyData?.final_applied_at_utc || new Date().toISOString(), penaltyDescriptionForTooltip);
            } else {
                console.error(`[afterAllSpinsReplay] Fallback failed: .active-penalty-display not found for group ${group_id}`);
            }
        }
    };

    const afterTimeWheelReplay = () => {
        const timeWheelContainer = document.getElementById(`timeWheelContainer-${idx}`);
        if (timeWheelContainer) timeWheelContainer.style.display = 'none';
        // The final result display and card refresh is now handled in afterAllSpinsReplay
        afterAllSpinsReplay(); 
    };
    
    const afterPenaltyWheelReplay = () => {
        const penaltyWheelContainer = document.getElementById(`penaltyWheelContainer-${idx}`);
        if (penaltyWheelContainer) penaltyWheelContainer.style.display = 'none';
        if (resultDisplay) resultDisplay.innerHTML = `<span class="text-info">Spinning duration...</span>`;

        const timeWheelContainer = document.getElementById(`timeWheelContainer-${idx}`);
        if (timeWheelContainer) timeWheelContainer.style.display = 'block';
        // Make title generic during spin
        document.getElementById(`timeWheelTitle-${idx}`).textContent = `Spinning for Duration...`; 
        
        const timeSegments = createSegments(TIME_SEGMENTS_DATA, [], true);
        if (getWheel('time', idx)) { getWheel('time', idx).stopAnimation?.(false); setWheel('time', idx, null); }
        try {
            const timeCfg = configureWheel(timeSegments, timeWinningSegmentIndex, afterTimeWheelReplay, idx, 'Time', timeStopAngle);
            if (!timeCfg) throw new Error("Failed to config time wheel replay.");
            const tWheel = new Winwheel(timeCfg); setWheel('time', idx, tWheel); tWheel.startAnimation();
        } catch (e) { console.error("Error replaying Time Wheel:", e); afterAllSpinsReplay(); }
    };

    const afterPlayerWheelReplay = () => {
        const playerWheelContainer = document.getElementById(`playerWheelContainer-${idx}`);
        if (playerWheelContainer) playerWheelContainer.style.display = 'none';
        if (resultDisplay) resultDisplay.innerHTML = `<span class="text-info">Spinning penalty...</span>`;

        const penaltyWheelContainer = document.getElementById(`penaltyWheelContainer-${idx}`);
        if (penaltyWheelContainer) penaltyWheelContainer.style.display = 'block';
        // Make title generic during spin
        document.getElementById(`penaltyWheelTitle-${idx}`).textContent = `Spinning for Penalty...`;
        
        const penaltySegs = createSegments(wheelSegmentPenaltiesData, ['#e41a1c', '#377eb8']);
        if (getWheel('penalty', idx)) { getWheel('penalty', idx).stopAnimation?.(false); setWheel('penalty', idx, null); }
        try {
            const penaltyCfg = configureWheel(penaltySegs, penaltyWinningSegmentIndex, afterPenaltyWheelReplay, idx, 'Penalty', penaltyStopAngle);
            if (!penaltyCfg) throw new Error("Failed to config penalty wheel replay.");
            const penWheel = new Winwheel(penaltyCfg); setWheel('penalty', idx, penWheel); penWheel.startAnimation();
        } catch (e) { console.error("Error replaying Penalty Wheel:", e); afterAllSpinsReplay(); }
    };

    if (participants && participants.length > 1 && playerWinningSegmentIndex > 0) {
        const playerWheelContainer = document.getElementById(`playerWheelContainer-${idx}`);
        if (playerWheelContainer) playerWheelContainer.style.display = 'block';
        // Make title generic during spin
        document.getElementById(`playerWheelTitle-${idx}`).textContent = `Spinning for Player...`;
        if (resultDisplay) resultDisplay.innerHTML = `<span class="text-info">Spinning for player...</span>`; 
        
        const playerSegs = createSegments(participants, ['#8dd3c7', '#ffffb3']);
        if (getWheel('player', idx)) { getWheel('player', idx).stopAnimation?.(false); setWheel('player', idx, null); }
        try {
            const playerCfg = configureWheel(playerSegs, playerWinningSegmentIndex, afterPlayerWheelReplay, idx, 'Player', playerStopAngle);
            if (!playerCfg) throw new Error("Failed to config player wheel replay.");
            const pWheel = new Winwheel(playerCfg); setWheel('player', idx, pWheel); pWheel.startAnimation();
        } catch (e) { console.error("Error replaying Player Wheel:", e); afterAllSpinsReplay(); }
    } else {
        if (resultDisplay) resultDisplay.innerHTML = `<span class="text-info">Spinning penalty...</span>`;
        afterPlayerWheelReplay(); 
    }
}
