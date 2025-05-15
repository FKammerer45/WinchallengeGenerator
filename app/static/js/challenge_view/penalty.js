// static/js/challenge/challenge_penalty.js
// Handles the penalty wheel logic for the shared challenge view page.

// Import utility to get penalty data from local storage
import { getLocalOnlyEntries as getLocalPenalties } from "../penalties/penaltyLocalStorageUtils.js";
// Import shared helper functions
import { escapeHtml, showError } from '../utils/helpers.js'; // Use showError instead of local displayStatus
import { apiFetch } from '../utils/api.js';
import { updatePenaltyDisplay } from './ui.js';

// --- Library Checks ---
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

// --- State ---
const playerWheels = new Map();
const penaltyWheels = new Map();
const getPlayerWheel = idx => playerWheels.get(idx);
const getPenaltyWheel = idx => penaltyWheels.get(idx);
function setPlayerWheel(idx, wheel) { playerWheels.set(idx, wheel); }
function setPenaltyWheel(idx, wheel) { penaltyWheels.set(idx, wheel); }

// Store config read from DOM, updated by main.js
let penaltyPageConfig = {
    userJoinedGroupId: null,
    numPlayersPerGroup: 1,
    initialGroups: [],
    isMultigroup: false,
    isLocal: false, // Initialize isLocal
    challengeId: null // Add challengeId to store the ID of the current challenge view

};

// Function called by main.js to update config
export function updatePenaltyConfig(newChallengeConfig) {
    // console.log("[Penalty Module] Received config update:", newChallengeConfig);
    penaltyPageConfig.userJoinedGroupId = newChallengeConfig.userJoinedGroupId;
    penaltyPageConfig.numPlayersPerGroup = newChallengeConfig.numPlayersPerGroup || 1;
    penaltyPageConfig.initialGroups = Array.isArray(newChallengeConfig.initialGroups) ? newChallengeConfig.initialGroups : [];
    penaltyPageConfig.isMultigroup = newChallengeConfig.isMultigroup === true;
    penaltyPageConfig.isLocal = newChallengeConfig.isLocal === true;
    penaltyPageConfig.challengeId = newChallengeConfig.id || null;
    penaltyPageConfig.challengeConfigData = newChallengeConfig;

}

// --- Penalty Wheel Specific Helper Functions ---
function createSegments(items, colors) {
    if (!items || items.length === 0) return [];
    const safeColors = colors && colors.length > 0 ? colors : ['#888888'];
    return items.map((item, index) => ({
        'fillStyle': safeColors[index % safeColors.length],
        'text': String(item || '?'), // Ensure text is string, fallback to '?'
        'textFontSize': 12,
        'textFontFamily': 'Arial, Helvetica, sans-serif'
    }));
}

function calculateStopAngle(numSegments, winningSegmentNumber) {
    if (numSegments <= 0 || winningSegmentNumber <= 0 || winningSegmentNumber > numSegments) {
        console.warn(`Invalid input for calculateStopAngle: numSegments=${numSegments}, winningSegmentNumber=${winningSegmentNumber}. Returning random angle.`);
        return Math.random() * 360;
    }
    const segmentAngle = 360 / numSegments;
    // Ensure stop angle is within the segment boundaries (e.g., 10% to 90% into the segment)
    const randomAngleInSegment = segmentAngle * (0.1 + Math.random() * 0.8);
    // Calculate the start angle of the winning segment (0-based index)
    const winningSegmentStartAngle = (winningSegmentNumber - 1) * segmentAngle;
    return winningSegmentStartAngle + randomAngleInSegment;
}


function selectWeightedPenalty(penalties) {
    if (!Array.isArray(penalties) || penalties.length === 0) {
        console.warn("selectWeightedPenalty: No penalties available.");
        return { name: "No Penalty", description: "No penalties defined." };
    }
    let totalWeight = 0;
    const validPenalties = penalties.filter(p => {
        // Ensure p exists and probability is a valid positive number
        const prob = p && p.probability !== undefined ? parseFloat(p.probability) : NaN;
        if (!isNaN(prob) && prob > 0) { totalWeight += prob; return true; }
        return false;
    });

    if (totalWeight <= 0 || validPenalties.length === 0) {
        console.warn("No valid penalties (with weight > 0) found.");
        return { name: "No Penalty", description: "No applicable penalties found." };
    }
    let randomThreshold = Math.random() * totalWeight;
    for (const penalty of validPenalties) {
        randomThreshold -= parseFloat(penalty.probability);
        if (randomThreshold <= 0) return penalty;
    }
    // Fallback to the last valid penalty if rounding errors occur
    return validPenalties[validPenalties.length - 1];
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// --- UI Update Functions ---
function resetPenaltyUI(idx) {
    const playerCont = document.getElementById(`playerWheelContainer-${idx}`);
    const penaltyCont = document.getElementById(`penaltyWheelContainer-${idx}`);
    const resultDisp = document.getElementById(`penaltyResult-${idx}`);

    if (playerCont) playerCont.style.display = 'none';
    if (penaltyCont) penaltyCont.style.display = 'none';
    if (resultDisp) { resultDisp.style.display = 'none'; showError(resultDisp, null); }
    getPlayerWheel(idx)?.stopAnimation?.(false); // Use optional chaining
    getPenaltyWheel(idx)?.stopAnimation?.(false);
    setPlayerWheel(idx, null);
    setPenaltyWheel(idx, null);
    console.log(`[Penalty UI Reset] Index: ${idx}`);
}

async function displayFinalResult(idx, chosenEntity, chosenPenalty, allPlayers, allPenaltiesForWheel, playerStopAngle, playerWinningSegmentIndex, button) {
    const resultDisplay = document.getElementById(`penaltyResult-${idx}`);
    if (!resultDisplay) {
        console.error(`[PENALTY_RESULT] Result display element not found for index ${idx}`);
        if (button) button.disabled = false;
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
        penaltyTextToSaveForUI = ''; // No penalty text for "No Penalty"
        type = 'success';
    }

    resultDisplay.innerHTML = message;
    resultDisplay.className = `mt-3 penalty-result-display alert alert-${type}`;
    resultDisplay.style.display = 'block';

    // Update UI (local card or shared group card)
    // For local, idx is 'local', which penaltyPageConfig.challengeId would be (e.g., local_uuid)
    // For shared, userJoinedGroupId is the relevant group ID.
    const targetGroupIdForUI = penaltyPageConfig.isLocal ? penaltyPageConfig.challengeId : penaltyPageConfig.userJoinedGroupId;
    if (targetGroupIdForUI !== null) { // Check if we have a valid target for UI update
        updatePenaltyDisplay(targetGroupIdForUI, penaltyTextToSaveForUI);
        if (!penaltyPageConfig.isLocal) { // Update local state for shared challenge's joined group
            const groupIndex = penaltyPageConfig.initialGroups.findIndex(g => g.id === targetGroupIdForUI);
            if (groupIndex !== -1) {
                penaltyPageConfig.initialGroups[groupIndex].active_penalty_text = penaltyTextToSaveForUI;
            }
        }
        // If local, active_penalty_text persistence would need specific localStorage handling if desired beyond session.
    }


    // Backend recording ONLY for SHARED challenges
    if (!penaltyPageConfig.isLocal) {
        const currentGroupId = penaltyPageConfig.userJoinedGroupId; // Integer DB ID
        const sharedChallengePublicId = penaltyPageConfig.challengeId; // Public UUID
        const csrfToken = penaltyPageConfig.challengeConfigData?.csrfToken;

        if (currentGroupId && sharedChallengePublicId && csrfToken) {
            const recordUrl = `/api/challenge/groups/${currentGroupId}/penalty_spin_result`;
            const payload = {
                penalty_result: {
                    name: chosenPenalty?.name,
                    description: chosenPenalty?.description || null,
                    player: chosenEntity,
                    stopAngle: getPenaltyWheel(idx)?.animation?.stopAngle,
                    winningSegmentIndex: getPenaltyWheel(idx)?.getIndicatedSegmentNumber(),
                    playerStopAngle: playerStopAngle,
                    playerWinningSegmentIndex: playerWinningSegmentIndex,
                    all_players: allPlayers || [],
                    all_penalties: allPenaltiesForWheel || []
                }
            };
            try {
                await apiFetch(recordUrl, { method: 'POST', body: payload }, csrfToken);
                // Backend will emit WebSocket event.
            } catch (error) {
                console.error("[PENALTY_RESULT - Shared] Failed to record penalty spin to backend:", error);
                resultDisplay.innerHTML += `<br><small class="text-danger">Error recording spin result: ${error.message}</small>`;
            }
        } else {
            console.warn("[PENALTY_RESULT - Shared] Cannot record spin: Missing Group ID, Challenge Public ID, or CSRF token.");
        }
    } else {
        // console.log(`[PENALTY_RESULT - Local] Spin result for local challenge ${penaltyPageConfig.challengeId} not sent to backend.`);
    }

    if (button) {
        button.disabled = false;
    }
}


// --- Winwheel Configuration Helper ---
function getPenaltyWheelConfig(segments, winningIndex, callbackFn, idx, wheelType = 'Penalty') {
    if (!winwheelLoaded) return null;
    if (!Array.isArray(segments) || segments.length === 0 || winningIndex <= 0 || winningIndex > segments.length) {
        console.error(`Cannot configure ${wheelType} wheel: invalid segments or winningIndex. Segments:`, segments, `Winning Index:`, winningIndex);
        throw new Error(`Cannot configure ${wheelType} wheel: invalid segments or winningIndex.`);
    }

    const numSegments = segments.length;
    const stopAngle = calculateStopAngle(numSegments, winningIndex);

    const isPlayerWheel = wheelType === 'Player';
    const outerRadius = isPlayerWheel ? 100 : 140;
    const innerRadius = isPlayerWheel ? 10 : 20; // Slightly different inner radius
    const textFontSize = 12;
    const canvasId = isPlayerWheel ? `playerWheelCanvas-${idx}` : `penaltyWheelCanvas-${idx}`;
    const duration = isPlayerWheel ? 5 : 8;
    const spins = isPlayerWheel ? 6 : 10;

    return {
        canvasId, numSegments, outerRadius, innerRadius, textFontSize,
        textMargin: 5, textFillStyle: '#ffffff', textStrokeStyle: 'rgba(0,0,0,0.2)',
        lineWidth: 2, strokeStyle: '#ffffff', segments,
        pointerGuide: { display: true, strokeStyle: '#ffc107', lineWidth: 3 },
        animation: { type: 'spinToStop', duration, spins, easing: 'Power4.easeOut', stopAngle, callbackFinished: callbackFn },
        pins: { number: Math.min(numSegments * 2, 36), outerRadius: 4, fillStyle: '#cccccc', strokeStyle: '#666666' }
    };
}


function spinPenaltyWheel(idx, penaltyTabIdFromButton, chosenEntity, button, participants, playerStopAngle, playerWinningSegmentIndex) {
    const resultDisplay = document.getElementById(`penaltyResult-${idx}`);
    const penaltyWheelContainer = document.getElementById(`penaltyWheelContainer-${idx}`);
    const penaltyCanvas = document.getElementById(`penaltyWheelCanvas-${idx}`); // Corrected variable name used for getElementById
    const errorTarget = resultDisplay || document.body;

    // This check is already done in handleLostGameClick, but good for safety if called directly
    if (bailIfLibMissing(errorTarget) || !resultDisplay || !penaltyWheelContainer || !penaltyCanvas) {
        effectiveShowError(errorTarget, "Error: Penalty wheel elements missing or library not loaded for penalty spin.", 'danger');
        if (button) button.disabled = false;
        return;
    }

    resultDisplay.innerHTML = `<span class="text-warning"><strong>${escapeHtml(chosenEntity)}</strong> selected... Spinning for penalty...</span>`;
    resultDisplay.style.display = 'block'; // Ensure it's visible
    resultDisplay.className = 'mt-3 penalty-result-display alert alert-warning'; // Ensure class for styling
    
    if (penaltyWheelContainer) penaltyWheelContainer.style.display = 'block';


    let chosenPenalty, penaltyWheelSegments = [], wheelSegmentPenalties = [];
    const penaltyColors = ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#a65628', '#f781bf', '#999999'];
    const NUM_PENALTY_SEGMENTS = 8;

    try {
        let penaltyList = [];
        // let sourceDescription = "Unknown Source"; // Not strictly needed without logging

        if (penaltyPageConfig.isLocal) {
            const embeddedPenaltyInfo = penaltyPageConfig.challengeConfigData?.penaltyInfo;
            const hasEmbedded = embeddedPenaltyInfo && Array.isArray(embeddedPenaltyInfo.penalties) && embeddedPenaltyInfo.penalties.length > 0;
            if (hasEmbedded) {
                penaltyList = embeddedPenaltyInfo.penalties;
                // sourceDescription = `Embedded in Local Challenge`;
            } else if (penaltyTabIdFromButton && String(penaltyTabIdFromButton).trim() !== "") {
                const localPenaltyData = getLocalPenalties(); // from penaltyLocalStorageUtils.js
                penaltyList = localPenaltyData[penaltyTabIdFromButton] || [];
                // sourceDescription = `LocalStorage for local (Tab ID: ${penaltyTabIdFromButton})`;
            }
        } else { // Shared challenge
            const embeddedPenaltyInfo = penaltyPageConfig.challengeConfigData?.penaltyInfo;
            if (embeddedPenaltyInfo && Array.isArray(embeddedPenaltyInfo.penalties)) {
                penaltyList = embeddedPenaltyInfo.penalties;
                // sourceDescription = `Embedded in Shared Challenge`;
            }
            // Fallback for shared if embedded is missing (should be rare)
            else if (window.isLoggedIn && window.userPenaltyTabsData?.entries?.[penaltyTabIdFromButton]) {
                 penaltyList = window.userPenaltyTabsData.entries[penaltyTabIdFromButton];
                //  sourceDescription = `User's saved tab for shared (Tab ID: ${penaltyTabIdFromButton})`;
            }
        }

        if (!Array.isArray(penaltyList)) penaltyList = [];
        
        chosenPenalty = selectWeightedPenalty(penaltyList);

        if (!chosenPenalty || chosenPenalty.name === "No Penalty") {
            displayFinalResult(idx, chosenEntity, chosenPenalty, participants, [], playerStopAngle, playerWinningSegmentIndex, button);
            if (penaltyWheelContainer) penaltyWheelContainer.style.display = 'none';
            return;
        }

        wheelSegmentPenalties = [];
        let displayablePenalties = penaltyList.filter(p => p?.name && parseFloat(p.probability) > 0);

        if (chosenPenalty && chosenPenalty.name !== "No Penalty") {
            wheelSegmentPenalties.push(chosenPenalty);
        }

        if (displayablePenalties.length > 0) {
            let otherPenalties = displayablePenalties.filter(p => p.id !== chosenPenalty?.id);
            shuffleArray(otherPenalties);
            let needed = NUM_PENALTY_SEGMENTS - wheelSegmentPenalties.length;
            wheelSegmentPenalties = wheelSegmentPenalties.concat(otherPenalties.slice(0, needed));
            
            let pool = wheelSegmentPenalties.length > 0 ? wheelSegmentPenalties :
                       (displayablePenalties.length > 0 ? displayablePenalties :
                       (chosenPenalty && chosenPenalty.name !== "No Penalty" ? [chosenPenalty] : []));
            if (pool.length > 0) {
                let padIdx = 0;
                while (wheelSegmentPenalties.length < NUM_PENALTY_SEGMENTS && wheelSegmentPenalties.length > 0) {
                    wheelSegmentPenalties.push(pool[padIdx % pool.length]);
                    padIdx++;
                }
            }
        }
        if (wheelSegmentPenalties.length > NUM_PENALTY_SEGMENTS) {
            wheelSegmentPenalties = wheelSegmentPenalties.slice(0, NUM_PENALTY_SEGMENTS);
        }
        if (wheelSegmentPenalties.length === 0 && chosenPenalty && chosenPenalty.name !== "No Penalty") {
            wheelSegmentPenalties.push(chosenPenalty);
            while (wheelSegmentPenalties.length < NUM_PENALTY_SEGMENTS && wheelSegmentPenalties.length > 0) {
                wheelSegmentPenalties.push(wheelSegmentPenalties[0]);
            }
        }

        if (wheelSegmentPenalties.length === 0) {
             displayFinalResult(idx, chosenEntity, { name: "No Penalty", description: "No penalties available for wheel." }, participants, [], playerStopAngle, playerWinningSegmentIndex, button);
             if (penaltyWheelContainer) penaltyWheelContainer.style.display = 'none';
             if (button) button.disabled = false;
             return;
        }
        penaltyWheelSegments = createSegments(wheelSegmentPenalties.map(p => p.name), penaltyColors);
        if (penaltyWheelSegments.length === 0) {
            throw new Error("Failed to create penalty segments for the wheel.");
        }

    } catch (e) {
        console.error("Error preparing penalty segments:", e);
        effectiveShowError(errorTarget, "Error loading penalties for the wheel!", 'danger');
        if (button) button.disabled = false;
        if (penaltyWheelContainer) penaltyWheelContainer.style.display = 'none';
        return;
    }

    const penaltyWinningSegmentIndex = penaltyWheelSegments.findIndex(seg => seg.text === chosenPenalty.name) + 1;
    if (penaltyWinningSegmentIndex <= 0) {
        // This case means the chosenPenalty.name wasn't found in the segments, which is an issue.
        // Default to displaying the chosen penalty without spinning, or pick a random segment for spin.
        // For safety, display result directly.
        displayFinalResult(idx, chosenEntity, chosenPenalty, participants, wheelSegmentPenalties, playerStopAngle, playerWinningSegmentIndex, button);
        if (penaltyWheelContainer) penaltyWheelContainer.style.display = 'none';
        return;
    }

    if (getPenaltyWheel(idx)) {
        getPenaltyWheel(idx).stopAnimation?.(false);
        setPenaltyWheel(idx, null);
    }

    try {
        const config = getPenaltyWheelConfig(penaltyWheelSegments, penaltyWinningSegmentIndex,
            () => displayFinalResult(idx, chosenEntity, chosenPenalty, participants, wheelSegmentPenalties, playerStopAngle, playerWinningSegmentIndex, button),
            idx, 'Penalty'
        );
        if (!config) {
            effectiveShowError(errorTarget, "Failed to configure penalty wheel.", 'danger');
            if (button) button.disabled = false;
            if (penaltyWheelContainer) penaltyWheelContainer.style.display = 'none';
            return;
        }
        const wheel = new Winwheel(config);
        setPenaltyWheel(idx, wheel);
        wheel.startAnimation();
    } catch (e) {
        console.error("Error creating Penalty WinWheel:", e);
        effectiveShowError(errorTarget, "Error initializing penalty wheel display!", 'danger');
        if (button) button.disabled = false;
        if (penaltyWheelContainer) penaltyWheelContainer.style.display = 'none';
    }
}


/** Main Handler for the "Lost Game" Button Click */
function handleLostGameClick(event) {
    const clickedElement = event.target;
    const button = clickedElement.closest('.lostGameBtn-Shared, .lostGameBtn-Local'); // Use .lostGameBtn-Local (capital L)


    if (!button) {
        console.log("[PENALTY_CLICK] Click was not on or within a relevant button. Exiting.");
        return;
    }


    if (button.disabled) {
        console.log("[PENALTY_CLICK] Button is explicitly disabled (attribute=true). Action prevented.");
        if (typeof showFlash === 'function') showFlash("Penalty spin is currently unavailable.", "info");
        return;
    }

    if (bailIfLibMissing(document.getElementById('challengeViewContainer') || document.body)) {
        console.error("[PENALTY_CLICK] Aborted: Winwheel library is missing or failed to load.");
        return;
    }

    const isLocalClick = button.classList.contains('lostGameBtn-Local'); // Check for capital L
    const idx = isLocalClick ? 'local' : 'shared';
    const penaltyTabId = button.dataset.penaltyTabId;


    // Fetch DOM elements using the correct idx.
    // These names match your original function.
    const resultDisplay = document.getElementById(`penaltyResult-${idx}`);
    const playerWheelContainer = document.getElementById(`playerWheelContainer-${idx}`);
    const playerCanvas = document.getElementById(`playerWheelCanvas-${idx}`);
    const playerWheelTitle = document.getElementById(`playerWheelTitle-${idx}`); // Original variable name
    const penaltyWheelContainer = document.getElementById(`penaltyWheelContainer-${idx}`);
    // Let's also add the penalty canvas element, as it's needed by WinWheel, even if not in your original check
    const penaltyCanvasEl = document.getElementById(`penaltyWheelCanvas-${idx}`);





    const errorTarget = resultDisplay || document.getElementById('challengeViewContainer') || document.body;

    // Conditional check based on your original snippet (penaltyCanvasEl added for robustness)
    if (!resultDisplay || !playerWheelContainer || !playerCanvas || !playerWheelTitle || !penaltyWheelContainer || !penaltyCanvasEl ) {
        let missingElements = [];
        if (!resultDisplay) missingElements.push(`penaltyResult-${idx}`);
        if (!playerWheelContainer) missingElements.push(`playerWheelContainer-${idx}`);
        if (!playerCanvas) missingElements.push(`playerWheelCanvas-${idx}`);
        if (!playerWheelTitle) missingElements.push(`playerWheelTitle-${idx}`);
        if (!penaltyWheelContainer) missingElements.push(`penaltyWheelContainer-${idx}`);
        if (!penaltyCanvasEl) missingElements.push(`penaltyWheelCanvas-${idx}`); // Check added element

        console.error(`[PENALTY_CLICK] DOM Error: Missing one or more UI components for index '${idx}'. Missing: ${missingElements.join(', ')}. Aborting.`);
        effectiveShowError(errorTarget, `Error: Penalty UI components missing (${missingElements.join(', ')}). Please ensure 'challenge_index' is correctly set to '${idx}' in the HTML template for this section.`, "danger");
        return;
    }

    resetPenaltyUI(idx); // Clear previous state
    
    // Disable button AFTER all checks pass and before starting operations
    button.disabled = true;

    resultDisplay.style.display = 'block';
    resultDisplay.className = 'mt-3 penalty-result-display alert alert-info';
    resultDisplay.innerHTML = `<span class="text-info">Determining participants…</span>`;

    // --- Determine Participants List ---
    let participants = [];
    let titleText = "Challenge Participant";
    // Destructure from penaltyPageConfig; ensure penaltyPageConfig is correctly populated by main.js
    const { userJoinedGroupId, numPlayersPerGroup, isMultigroup, initialGroups } = penaltyPageConfig;

    if (idx === 'local') { // Simplified participant logic for local
        participants = ['Participant'];
        titleText = "Spinning for Participant"; // Or "Selecting Player"
        // console.log("[Lost Game] Local challenge: Defaulting to single 'Participant'. penaltyPageConfig:", penaltyPageConfig);
    } else if (userJoinedGroupId !== null && isMultigroup) { // Shared, multigroup, user is in a group
        const group = initialGroups.find(g => g.id === userJoinedGroupId);
        if (group && Array.isArray(group.player_names)) {
            const savedNames = group.player_names
                .map(slot => slot?.display_name?.trim())
                .filter(name => name);
            if (savedNames.length > 0) {
                participants = savedNames.slice(0, numPlayersPerGroup);
                titleText = `Selecting Player (${participants.length}/${numPlayersPerGroup})`;
            } else {
                participants = Array.from({ length: numPlayersPerGroup }, (_, i) => `Player ${i + 1}`);
                titleText = `Selecting Player (Default Names)`;
            }
        } else {
            participants = Array.from({ length: numPlayersPerGroup }, (_, i) => `Player ${i + 1}`);
            titleText = `Selecting Player (Default Names)`;
            // console.warn(`Could not find valid group data or player_names for group ${userJoinedGroupId}. Using defaults.`);
        }
    } else { // Shared, single group, or user not in a group (less likely for 'shared' idx if UI is correct)
        participants = ['Participant'];
        titleText = "Spinning for Participant";
        // console.warn("Penalty button clicked in shared mode but not multigroup or user not joined? Defaulting to single participant.");
    }
    // --- End Participant Determination ---

    playerWheelTitle.textContent = titleText; // Uses your original variable name
    // console.log("[Lost Game] Participants for player wheel:", participants);

    if (participants.length === 0) {
        effectiveShowError(resultDisplay, "Error: No participants found to select from.", "danger");
        button.disabled = false; // Re-enable
        return;
    }

    const chosenEntity = participants[Math.floor(Math.random() * participants.length)];
    // console.log("[Lost Game] Randomly chosen entity:", chosenEntity);

    const playerColors = ['#8dd3c7', '#ffffb3', '#bebada', '#fb8072', '#80b1d3', '#fdb462', '#b3de69', '#fccde5'];
    const entitySegments = createSegments(participants, playerColors);

    if (!entitySegments || entitySegments.length === 0) { // Check for empty or null
        effectiveShowError(resultDisplay, "Error creating player segments.", "danger");
        button.disabled = false; // Re-enable
        return;
    }

    const playerWinningSegmentIndex = entitySegments.findIndex(s => s.text === chosenEntity) + 1;
    if (playerWinningSegmentIndex <= 0) {
        console.error("Chosen player not found in segments:", chosenEntity, entitySegments);
        effectiveShowError(resultDisplay, "Internal error selecting player.", "danger");
        button.disabled = false; // Re-enable
        return;
    }

    const playerStopAngle = calculateStopAngle(entitySegments.length, playerWinningSegmentIndex);

    if (getPlayerWheel(idx)) {
        getPlayerWheel(idx).stopAnimation?.(false);
        setPlayerWheel(idx, null);
    }

    try {
        const cfg = getPenaltyWheelConfig(entitySegments, playerWinningSegmentIndex,
            () => spinPenaltyWheel(idx, penaltyTabId, chosenEntity, button, participants, playerStopAngle, playerWinningSegmentIndex),
            idx, 'Player'
        );
        if (!cfg) {
            effectiveShowError(resultDisplay, "Failed to configure player wheel.", "danger");
            button.disabled = false; // Re-enable
            return;
        }
        cfg.animation.stopAngle = playerStopAngle;

        const wheel = new Winwheel(cfg);
        setPlayerWheel(idx, wheel);
        playerWheelContainer.style.display = 'block';
        resultDisplay.className = 'mt-3 penalty-result-display alert alert-warning';
        resultDisplay.innerHTML = `<span class="text-warning">Spinning for participant...</span>`;
        wheel.startAnimation();
        // console.log("[Lost Game] Player wheel animation started.");
    } catch (e) {
        console.error("Error creating Participant WinWheel:", e);
        effectiveShowError(resultDisplay, "Error initializing participant wheel!", "danger");
        button.disabled = false; // Re-enable
    }
}


// --- Initialize Penalty Logic ---
function initializePenaltyHandler() {
    if (bailIfLibMissing(document.body)) { console.log("Penalty handler NOT initialized: Winwheel missing."); return; }
    const dataEl = document.getElementById('challengeData');
    const statusDiv = document.getElementById('pageStatusDisplay');

    // Read INITIAL config data from the DOM
    if (dataEl?.dataset) {
        try {
            const joinedId = JSON.parse(dataEl.dataset.userJoinedGroupId || 'null');
            const initialGroups = JSON.parse(dataEl.dataset.initialGroups || 'null');
            const numPlayers = parseInt(dataEl.dataset.numPlayersPerGroup, 10);

            penaltyPageConfig = { // Populate its own config object ONCE
                userJoinedGroupId: typeof joinedId === 'number' ? joinedId : null,
                numPlayersPerGroup: (!isNaN(numPlayers) && numPlayers >= 1) ? numPlayers : 1,
                initialGroups: Array.isArray(initialGroups) ? initialGroups : [],
                isMultigroup: dataEl.dataset.isMultigroup === 'true'
            };
            console.log("[Penalty Module] Initial config read:", penaltyPageConfig);

            // Attach listener using event delegation on a parent container
            const challengeViewContainer = document.getElementById('challengeViewContainer');
            if (challengeViewContainer) {
                challengeViewContainer.addEventListener('click', handleLostGameClick);
                console.log('[Penalty Module] Delegated click listener attached to challengeViewContainer.');
            } else {
                console.error("[Penalty Module] Could not find 'challengeViewContainer' to attach delegated listener.");
                // Fallback to document listener if container not found
                document.addEventListener('click', handleLostGameClick);
                console.warn('[Penalty Module] Attaching click listener to document as fallback.');
            }

        } catch (e) { console.error("Penalty module failed to read initial config:", e); showError(statusDiv || document.body, "Penalty Init Error.", 'warning'); }
    } else { console.error("Penalty module could not find #challengeData."); }
}

// Initialize automatically when script loads
initializePenaltyHandler();

