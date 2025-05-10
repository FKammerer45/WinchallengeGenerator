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
    isMultigroup: false
};

// Function called by main.js to update config
export function updatePenaltyConfig(newChallengeConfig) {
    console.log("[Penalty Module] Received config update:", newChallengeConfig);
    penaltyPageConfig.userJoinedGroupId = newChallengeConfig.userJoinedGroupId;
    penaltyPageConfig.numPlayersPerGroup = newChallengeConfig.numPlayersPerGroup || 1;
    // Ensure initialGroups is always an array
    penaltyPageConfig.initialGroups = Array.isArray(newChallengeConfig.initialGroups) ? newChallengeConfig.initialGroups : [];
    penaltyPageConfig.isMultigroup = newChallengeConfig.isMultigroup === true;
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
    const resultDisplay = document.getElementById(`penaltyResult-${idx}`); // The main result display below wheels
    if (!resultDisplay) { console.error(`Result display not found for index ${idx}`); return; }

    let message = '';
    let type = 'info';
    let penaltyTextToSave = ''; // Text for backend and group card display

    // Determine message and text to save
    if (chosenEntity && chosenPenalty && chosenPenalty.name && chosenPenalty.name !== "No Penalty") {
        const baseText = `${escapeHtml(chosenEntity)} receives penalty: ${escapeHtml(chosenPenalty.name)}`;
        message = `<strong>${baseText}</strong>`;
        penaltyTextToSave = baseText; // Store the core penalty text
        if (chosenPenalty.description) {
            const escapedDesc = escapeHtml(chosenPenalty.description);
            message += `<br><small class="text-muted">(${escapedDesc})</small>`;
            penaltyTextToSave += ` (${escapedDesc})`; // Append description for saving/display
        }
        type = 'warning';
    } else {
        message = `<strong>${escapeHtml(chosenEntity || 'Participant')}</strong>: ${escapeHtml(chosenPenalty?.description || 'No penalty assigned.')}`;
        penaltyTextToSave = ''; // No penalty text if "No Penalty"
        type = 'success';
    }

    // Display result in the main result area below the wheels
    resultDisplay.innerHTML = message;
    resultDisplay.className = `mt-3 penalty-result-display alert alert-${type}`;
    resultDisplay.style.display = 'block';

    // --- START: Direct UI Update for Group Card ---
    const currentGroupId = penaltyPageConfig.userJoinedGroupId; // Get the ID of the group card to update
    if (currentGroupId !== null) {
        try {
            console.log(`[Penalty Result] Directly updating penalty display for group ${currentGroupId} with text: "${penaltyTextToSave}"`);
            updatePenaltyDisplay(currentGroupId, penaltyTextToSave); // Call the UI function directly

            // Also update the local state in main.js immediately (optional but good practice)
            const groupIndex = penaltyPageConfig.initialGroups.findIndex(g => g.id === currentGroupId);
            if (groupIndex !== -1) {
                penaltyPageConfig.initialGroups[groupIndex].active_penalty_text = penaltyTextToSave;
                 console.log(`[Penalty Result] Updated local state penalty for group ${currentGroupId}`);
            }

        } catch (uiError) {
            console.error(`[Penalty Result] Error directly updating group card UI for group ${currentGroupId}:`, uiError);
        }
    } else {
        console.warn("[Penalty Result] Cannot update group card display: userJoinedGroupId is null.");
    }
    // --- END: Direct UI Update ---


    // --- Backend Recording (remains the same logic) ---
    const dataEl = document.getElementById('challengeData');
    const csrfToken = dataEl?.dataset.csrfToken;
    const challengeId = dataEl?.dataset.challengeId;

    if (currentGroupId && challengeId && csrfToken) { // Use currentGroupId here too
        const recordUrl = `/api/challenge/groups/${currentGroupId}/penalty_spin_result`;
        const payload = { /* ... payload remains the same ... */
             penalty_result: {
                name: chosenPenalty?.name, description: chosenPenalty?.description || null, player: chosenEntity,
                stopAngle: getPenaltyWheel(idx)?.animation?.stopAngle, winningSegmentIndex: getPenaltyWheel(idx)?.getIndicatedSegmentNumber(),
                playerStopAngle: playerStopAngle, playerWinningSegmentIndex: playerWinningSegmentIndex,
                all_players: allPlayers || [], all_penalties: allPenaltiesForWheel || []
            }
         };
        try {
            console.log(`Recording penalty spin result to backend for group ${currentGroupId}:`, payload.penalty_result);
            await apiFetch(recordUrl, { method: 'POST', body: payload }, csrfToken);
            console.log("Backend penalty spin result recording successful.");
            // Backend will still emit WebSocket event for overlay/other users
        } catch (error) {
            console.error("Failed to record penalty spin result to backend:", error);
            // Append error to the main result display, not the group card display
            resultDisplay.innerHTML += `<br><small class="text-danger">Error recording spin result: ${error.message}</small>`;
        }
    } else {
        console.warn("Cannot record penalty spin result: Missing Group ID, Challenge ID, or CSRF token.");
    }

    if (button) button.disabled = false; // Re-enable original button
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


// --- Core Wheel Logic ---
function spinPenaltyWheel(idx, penaltyTabId, chosenEntity, button, participants, playerStopAngle, playerWinningSegmentIndex) {
    console.log("[Penalty Spin] Participant selected:", chosenEntity, "Preparing penalty wheel...");
    const resultDisplay = document.getElementById(`penaltyResult-${idx}`);
    const penaltyWheelContainer = document.getElementById(`penaltyWheelContainer-${idx}`);
    const penaltyCanvas = document.getElementById(`penaltyWheelCanvas-${idx}`);
    const errorTarget = resultDisplay || document.body;

    if (bailIfLibMissing(resultDisplay) || !resultDisplay || !penaltyWheelContainer || !penaltyCanvas) {
        showError(errorTarget, "Error: Penalty wheel elements missing or library not loaded.", 'danger');
        if (button) button.disabled = false; return;
    }

    resultDisplay.innerHTML = `<span class="text-warning"><strong>${escapeHtml(chosenEntity)}</strong> selected... Spinning for penalty...</span>`;
    resultDisplay.style.display = 'block';
    penaltyWheelContainer.style.display = 'block';

    let chosenPenalty, penaltyWheelSegments, wheelSegmentPenalties = [];
    const penaltyColors = ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#a65628', '#f781bf', '#999999'];
    const NUM_PENALTY_SEGMENTS = 8;

    try {
        const allPenalties = getLocalPenalties();
        const penaltyList = allPenalties[penaltyTabId] || [];
        chosenPenalty = selectWeightedPenalty(penaltyList);
        console.log("[Penalty Spin] Chosen Penalty (Weighted):", chosenPenalty);

        if (!chosenPenalty || chosenPenalty.name === "No Penalty") {
            displayFinalResult(idx, chosenEntity, chosenPenalty, participants, [], playerStopAngle, playerWinningSegmentIndex, button);
            penaltyWheelContainer.style.display = 'none'; return;
        }

        // --- Build wheelSegmentPenalties list ---
        let displayablePenalties = penaltyList.filter(p => p?.name && parseFloat(p.probability) > 0);
        if (displayablePenalties.length > 0) {
            wheelSegmentPenalties.push(chosenPenalty);
            let otherPenalties = displayablePenalties.filter(p => p.id !== chosenPenalty.id);
            shuffleArray(otherPenalties);
            let needed = NUM_PENALTY_SEGMENTS - wheelSegmentPenalties.length;
            wheelSegmentPenalties = wheelSegmentPenalties.concat(otherPenalties.slice(0, needed));
            let pool = otherPenalties.length > 0 ? otherPenalties : [chosenPenalty];
            let padIdx = 0;
            while (wheelSegmentPenalties.length < NUM_PENALTY_SEGMENTS && wheelSegmentPenalties.length > 0) {
                wheelSegmentPenalties.push(pool[padIdx % pool.length]); padIdx++;
            }
            if (wheelSegmentPenalties.length > NUM_PENALTY_SEGMENTS) {
                wheelSegmentPenalties = wheelSegmentPenalties.slice(0, NUM_PENALTY_SEGMENTS);
                if (!wheelSegmentPenalties.some(p => p.id === chosenPenalty.id)) { wheelSegmentPenalties[0] = chosenPenalty; }
            }
            if (wheelSegmentPenalties.length > 1) shuffleArray(wheelSegmentPenalties);
        } else { wheelSegmentPenalties.push(chosenPenalty); }
        // Ensure list has NUM_PENALTY_SEGMENTS
        while (wheelSegmentPenalties.length < NUM_PENALTY_SEGMENTS && wheelSegmentPenalties.length > 0) { wheelSegmentPenalties.push(wheelSegmentPenalties[0]); }
        if (wheelSegmentPenalties.length > NUM_PENALTY_SEGMENTS) { wheelSegmentPenalties = wheelSegmentPenalties.slice(0, NUM_PENALTY_SEGMENTS); }
        if (!wheelSegmentPenalties.some(p => p.id === chosenPenalty.id) && wheelSegmentPenalties.length > 0) { wheelSegmentPenalties[0] = chosenPenalty; }
        // --- End build list ---

        penaltyWheelSegments = createSegments(wheelSegmentPenalties.map(p => p.name), penaltyColors);
        if (penaltyWheelSegments.length === 0) throw new Error("Failed to create penalty segments.");

    } catch (e) { console.error("Error preparing penalty segments:", e); showError(errorTarget, "Error loading penalties!", 'danger'); if (button) button.disabled = false; penaltyWheelContainer.style.display = 'none'; return; }

    // Find the index based on the final segment list
    const penaltyWinningSegmentIndex = penaltyWheelSegments.findIndex(seg => seg.text === chosenPenalty.name) + 1;
    if (penaltyWinningSegmentIndex <= 0) {
        console.error("Chosen penalty missing from final visual segments!");
        displayFinalResult(idx, chosenEntity, chosenPenalty, participants, wheelSegmentPenalties, playerStopAngle, playerWinningSegmentIndex, button);
        penaltyWheelContainer.style.display = 'none'; return;
    }

    if (getPenaltyWheel(idx)) { getPenaltyWheel(idx).stopAnimation?.(false); setPenaltyWheel(idx, null); } // Clear old wheel

    try {
        const config = getPenaltyWheelConfig(penaltyWheelSegments, penaltyWinningSegmentIndex,
            () => displayFinalResult(idx, chosenEntity, chosenPenalty, participants, wheelSegmentPenalties, playerStopAngle, playerWinningSegmentIndex, button),
            idx, 'Penalty'
        );
        if (!config) { if (button) button.disabled = false; return; }
        const wheel = new Winwheel(config);
        setPenaltyWheel(idx, wheel);
        wheel.startAnimation();
        console.log("[Penalty Spin] Penalty wheel animation started.");
    } catch (e) { console.error("Error creating Penalty WinWheel:", e); showError(errorTarget, "Error initializing penalty wheel!", 'danger'); if (button) button.disabled = false; penaltyWheelContainer.style.display = 'none'; }
}


/** Main Handler for the "Lost Game" Button Click */
function handleLostGameClick(event) {
    const button = event.target.closest('.lostGameBtn-Shared, .lostGameBtn-local');
    if (!button) return; // Only proceed if the correct button was clicked

    console.log("[Lost Game] Button clicked.");

    if (bailIfLibMissing(document.body)) return; // Check if Winwheel library is loaded

    const idx = button.classList.contains('lostGameBtn-local') ? 'local' : 'shared';
    const penaltyTabId = button.dataset.penaltyTabId;
    const resultDisplay = document.getElementById(`penaltyResult-${idx}`);
    const playerWheelContainer = document.getElementById(`playerWheelContainer-${idx}`);
    const playerCanvas = document.getElementById(`playerWheelCanvas-${idx}`);
    const playerWheelTitle = document.getElementById(`playerWheelTitle-${idx}`);
    const penaltyWheelContainer = document.getElementById(`penaltyWheelContainer-${idx}`);
    const errorTarget = resultDisplay || document.getElementById('challengeViewContainer') || document.body;

    if (!resultDisplay || !playerWheelContainer || !playerCanvas || !playerWheelTitle || !penaltyWheelContainer) {
        showError(errorTarget, "Error: Penalty UI components missing.", "danger");
        return;
    }

    resetPenaltyUI(idx); // Clear previous state
    button.disabled = true;
    resultDisplay.style.display = 'block';
    resultDisplay.className = 'mt-3 penalty-result-display alert alert-info';
    resultDisplay.innerHTML = `<span class="text-info">Determining participants…</span>`;

    // --- Determine Participants List ---
    let participants = [];
    let titleText = "Challenge Participant";
    const { userJoinedGroupId, numPlayersPerGroup, isMultigroup, initialGroups } = penaltyPageConfig;

    if (userJoinedGroupId !== null && isMultigroup) {
        const group = initialGroups.find(g => g.id === userJoinedGroupId);
        if (group && Array.isArray(group.player_names)) {
            // --- FIX: Extract display_name from player slot objects ---
            const savedNames = group.player_names
                .map(slot => slot?.display_name?.trim()) // Get display_name, trim it
                .filter(name => name); // Filter out empty/null names
            // --- END FIX ---

            if (savedNames.length > 0) {
                participants = savedNames.slice(0, numPlayersPerGroup); // Use the extracted display names
                titleText = `Selecting Player (${participants.length}/${numPlayersPerGroup})`;
            } else {
                // Fallback if no valid display names found
                participants = Array.from({ length: numPlayersPerGroup }, (_, i) => `Player ${i + 1}`);
                titleText = `Selecting Player (Default Names)`;
            }
        } else {
            // Fallback if group data or player_names is missing/invalid
            participants = Array.from({ length: numPlayersPerGroup }, (_, i) => `Player ${i + 1}`);
            titleText = `Selecting Player (Default Names)`;
            console.warn(`Could not find valid group data or player_names for group ${userJoinedGroupId}. Using defaults.`);
        }
    } else if (idx === 'local') {
        // For local challenges, assume single participant
        participants = ['Participant'];
        titleText = "Selecting Player";
    } else {
        // Fallback for non-multigroup shared challenges (shouldn't happen with current logic?)
        participants = ['Participant'];
        titleText = "Selecting Player";
        console.warn("Penalty button clicked in unexpected state (shared, not multigroup, not joined?).");
    }
    // --- End Participant Determination ---

    playerWheelTitle.textContent = titleText;
    console.log("[Lost Game] Participants for player wheel:", participants);

    if (participants.length === 0) {
        showError(resultDisplay, "Error: No participants found to select from.", "danger");
        button.disabled = false; return;
    }

    const chosenEntity = participants[Math.floor(Math.random() * participants.length)];
    console.log("[Lost Game] Randomly chosen entity:", chosenEntity);

    const playerColors = ['#8dd3c7', '#ffffb3', '#bebada', '#fb8072', '#80b1d3', '#fdb462', '#b3de69', '#fccde5'];
    const entitySegments = createSegments(participants, playerColors);
    if (!entitySegments.length) { showError(resultDisplay, "Error creating player segments.", "danger"); button.disabled = false; return; }

    const playerWinningSegmentIndex = entitySegments.findIndex(s => s.text === chosenEntity) + 1;
    if (playerWinningSegmentIndex <= 0) { console.error("Chosen player not found in segments:", chosenEntity, entitySegments); showError(resultDisplay, "Internal error selecting player.", "danger"); button.disabled = false; return; }

    const playerStopAngle = calculateStopAngle(entitySegments.length, playerWinningSegmentIndex);

    // Clear old wheel if exists
    if (getPlayerWheel(idx)) { getPlayerWheel(idx).stopAnimation?.(false); setPlayerWheel(idx, null); }

    try {
        const cfg = getPenaltyWheelConfig(entitySegments, playerWinningSegmentIndex,
            // Callback: Pass necessary data to the next step
            () => spinPenaltyWheel(idx, penaltyTabId, chosenEntity, button, participants, playerStopAngle, playerWinningSegmentIndex),
            idx, 'Player'
        );
        if (!cfg) { button.disabled = false; return; } // Handle case where config fails

        // Set the calculated stop angle directly
        cfg.animation.stopAngle = playerStopAngle;

        const wheel = new Winwheel(cfg);
        setPlayerWheel(idx, wheel);
        playerWheelContainer.style.display = 'block';
        resultDisplay.className = 'mt-3 penalty-result-display alert alert-warning';
        resultDisplay.innerHTML = `<span class="text-warning">Spinning for participant...</span>`;
        wheel.startAnimation();
        console.log("[Lost Game] Player wheel animation started.");
    } catch (e) {
        console.error("Error creating Participant WinWheel:", e);
        showError(resultDisplay, "Error initializing participant wheel!", "danger");
        button.disabled = false;
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

