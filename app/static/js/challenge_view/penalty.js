// static/js/challenge/challenge_penalty.js
// Handles the penalty wheel logic for the shared challenge view page.

// Import utility to get penalty data from local storage
import { getLocalPenalties } from "../penalties/penaltyLocalStorageUtils.js";
// Import shared helper functions
import { escapeHtml, showError } from '../utils/helpers.js'; // Use showError instead of local displayStatus
import { apiFetch } from '../utils/api.js';
import { updatePenaltyDisplay } from './ui.js';
// --- Library Checks ---
let winwheelLoaded = true;
if (typeof Winwheel === 'undefined') {
    console.error("Winwheel library not loaded. Penalty wheel cannot function.");
    winwheelLoaded = false;
}
if (typeof TweenMax === 'undefined' && typeof gsap === 'undefined') {
    console.warn("TweenMax/GSAP library not loaded. Winwheel animation might not be optimal.");
}

// --- Module State ---
let playerWheels = {};
let penaltyWheels = {};
const CHALLENGE_INDEX = 'shared'; // Fixed index for elements on this page
// Store config read from DOM
let penaltyPageConfig = { // Keep its own config, initialized on load
    userJoinedGroupId: null,
    numPlayersPerGroup: 1,
    initialGroups: [],
    isMultigroup: false
};

export function updatePenaltyConfig(newChallengeConfig) {
    console.log("Penalty module received config update:", newChallengeConfig);
    // Update only the relevant fields
    penaltyPageConfig.userJoinedGroupId = newChallengeConfig.userJoinedGroupId;
    penaltyPageConfig.numPlayersPerGroup = newChallengeConfig.numPlayersPerGroup || 1;
    penaltyPageConfig.initialGroups = Array.isArray(newChallengeConfig.initialGroups) ? newChallengeConfig.initialGroups : [];
    penaltyPageConfig.isMultigroup = newChallengeConfig.isMultigroup === true;
}

// --- Penalty Wheel Specific Helper Functions ---

function createSegments(items, colors) {
    if (!items || items.length === 0) return [];
    const safeColors = colors && colors.length > 0 ? colors : ['#888888'];
    return items.map((item, index) => ({
        'fillStyle': safeColors[index % safeColors.length],
        'text': String(item), // Ensure text is string
        'textFontSize': 12,
        'textFontFamily': 'Arial, Helvetica, sans-serif'
    }));
}

function calculateStopAngle(numSegments, winningSegmentNumber) {
    if (numSegments <= 0 || winningSegmentNumber <= 0) return Math.random() * 360;
    const segmentAngle = 360 / numSegments;
    const randomAngleInSegment = segmentAngle * (0.2 + Math.random() * 0.6);
    return ((winningSegmentNumber - 1) * segmentAngle) + randomAngleInSegment;
}

function selectWeightedPenalty(penalties) {
    if (!Array.isArray(penalties) || penalties.length === 0) {
        console.warn("selectWeightedPenalty: No penalties available.");
        return { name: "No Penalty", description: "No penalties defined." };
    }
    let totalWeight = 0;
    const validPenalties = penalties.filter(p => {
        const prob = parseFloat(p?.probability);
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
    return validPenalties[validPenalties.length - 1]; // Fallback
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// --- Removed local escapeHtml function, using import ---

// --- UI Update Functions ---

function resetPenaltyUI() {
    const playerCont = document.getElementById(`playerWheelContainer-${CHALLENGE_INDEX}`);
    const penaltyCont = document.getElementById(`penaltyWheelContainer-${CHALLENGE_INDEX}`);
    const resultDisp = document.getElementById(`penaltyResult-${CHALLENGE_INDEX}`);

    if (playerCont) playerCont.style.display = 'none';
    if (penaltyCont) penaltyCont.style.display = 'none';
    if (resultDisp) { resultDisp.style.display = 'none'; showError(resultDisp, null); } // Use showError to clear

    if (winwheelLoaded) { // Only interact with wheels if library loaded
        playerWheels[CHALLENGE_INDEX]?.stopAnimation(false);
        penaltyWheels[CHALLENGE_INDEX]?.stopAnimation(false);
    }
    playerWheels[CHALLENGE_INDEX] = null;
    penaltyWheels[CHALLENGE_INDEX] = null;
    console.log("Penalty UI Reset");
}

async function displayFinalResult(chosenEntity, chosenPenalty, button) {
    const resultDisplay = document.getElementById(`penaltyResult-${CHALLENGE_INDEX}`);
    if (!resultDisplay) return;

    let message = '';
    let type = 'info';
    let penaltyTextToSave = '';

    // --- Construct display message and text to save ---
    if (chosenEntity && chosenPenalty && chosenPenalty.name && chosenPenalty.name !== "No Penalty") {
        const baseText = `${escapeHtml(chosenEntity)} receives penalty: ${escapeHtml(chosenPenalty.name)}`;
        message = `<strong>${baseText}</strong>`;
        penaltyTextToSave = baseText;
        if (chosenPenalty.description) {
            const escapedDesc = escapeHtml(chosenPenalty.description);
            message += `<br><small class="text-muted">(${escapedDesc})</small>`;
            penaltyTextToSave += ` (${escapedDesc})`;
        }
        type = 'warning';
    } else {
        message = `<strong>${escapeHtml(chosenEntity)}</strong>: ${escapeHtml(chosenPenalty?.description || 'No penalty assigned.')}`;
        penaltyTextToSave = '';
        type = 'success';
    }

    // --- Update result display UI ---
    resultDisplay.innerHTML = message;
    resultDisplay.className = `mt-3 penalty-result-display alert alert-${type}`;
    resultDisplay.style.display = 'block';

    // --- API Call to save the penalty ---
    const dataEl = document.getElementById('challengeData'); // Get the data div
    const setPenaltyUrlBase = dataEl?.dataset.setPenaltyUrlBase;
    const csrfToken = dataEl?.dataset.csrfToken;

    // *** FIX: Get userJoinedGroupId from dataEl dataset ***
    let userJoinedGroupId = null;
    try {
        // Parse the userJoinedGroupId from the data attribute
        const parsedId = JSON.parse(dataEl?.dataset.userJoinedGroupId || 'null');
        if (typeof parsedId === 'number') {
            userJoinedGroupId = parsedId;
        }
    } catch (e) {
        console.error("Error parsing userJoinedGroupId from data attribute:", e);
    }
    // *** END FIX ***

    // Determine which group ID to use (adjust logic if necessary)
    const targetGroupId = userJoinedGroupId;

    if (targetGroupId && setPenaltyUrlBase && csrfToken) {
        const url = `${setPenaltyUrlBase}/${targetGroupId}/penalty`;
        try {
            console.log(`Saving penalty to backend for group ${targetGroupId}: "${penaltyTextToSave}"`);
            await apiFetch(url, {
                method: 'POST',
                body: { penalty_text: penaltyTextToSave }
            }, csrfToken);
            console.log("Backend penalty save successful.");

            // Trigger UI update (assuming updatePenaltyDisplay is imported/available)
            // Make sure updatePenaltyDisplay is exported from challenge_ui.js and imported here,
            // or move the function if more appropriate.
            if (typeof updatePenaltyDisplay === "function") { // Check if function exists
                 updatePenaltyDisplay(targetGroupId, penaltyTextToSave);
            } else {
                 console.warn("updatePenaltyDisplay function not found/imported - UI won't update immediately.");
            }


        } catch (error) {
             console.error("Failed to save penalty state to backend:", error);
             resultDisplay.innerHTML += `<br><small class="text-danger">Error saving penalty state: ${error.message}</small>`;
        }
    } else {
         console.warn("Cannot save penalty state: Missing Group ID, URL base, or CSRF token.");
         if (!targetGroupId) console.warn("Reason: User is not in a group or target group determination failed.");
    }
    // --- End API Call ---

    if (button) button.disabled = false;
}

// --- Winwheel Configuration Helper ---
function getPenaltyWheelConfig(segments, winningIndex, callbackFn, wheelType = 'Penalty') {
    if (!winwheelLoaded) throw new Error("Winwheel library not loaded.");
    if (!Array.isArray(segments) || segments.length === 0 || winningIndex <= 0) {
        throw new Error(`Cannot configure ${wheelType} wheel with invalid segments or winning index.`);
    }
    const numSegments = segments.length;
    const stopAngle = calculateStopAngle(numSegments, winningIndex);

    const isPlayerWheel = wheelType === 'Player';
    const outerRadius = isPlayerWheel ? 100 : 140;
    const innerRadius = isPlayerWheel ? 20 : 20;
    const fontSize = isPlayerWheel ? 12 : 12;
    const duration = isPlayerWheel ? 5 : 8;
    const spins = isPlayerWheel ? 6 : 10;
    const canvasId = isPlayerWheel ? `playerWheelCanvas-${CHALLENGE_INDEX}` : `penaltyWheelCanvas-${CHALLENGE_INDEX}`;

    return {
        'canvasId': canvasId, 'numSegments': numSegments,
        'outerRadius': outerRadius, 'innerRadius': innerRadius, 'textFontSize': fontSize,
        'textMargin': 5, 'textFillStyle': '#ffffff', 'textStrokeStyle': 'rgba(0,0,0,0.2)',
        'lineWidth': 2, 'strokeStyle': '#ffffff',
        'segments': segments,
        'pointerGuide': { 'display': true, 'strokeStyle': '#ffc107', 'lineWidth': 3 },
        'animation': {
            'type': 'spinToStop', 'duration': duration, 'spins': spins,
            'easing': 'Power4.easeOut', // Uses GSAP if available
            'stopAngle': stopAngle, 'callbackFinished': callbackFn,
            'callbackSound': null, 'soundTrigger': 'pin'
        },
        'pins': { 'number': Math.min(numSegments * 2, 36), 'outerRadius': 4, 'fillStyle': '#cccccc', 'strokeStyle': '#666666' }
    };
}


// --- Core Wheel Logic ---

function spinPenaltyWheel(penaltyTabId, chosenEntity, button) {
    console.log("Participant selected, preparing penalty wheel...");
    const resultDisplay = document.getElementById(`penaltyResult-${CHALLENGE_INDEX}`);
    const penaltyWheelContainer = document.getElementById(`penaltyWheelContainer-${CHALLENGE_INDEX}`);
    const penaltyCanvas = document.getElementById(`penaltyWheelCanvas-${CHALLENGE_INDEX}`);
    const errorTarget = resultDisplay || document.body;

    if (!winwheelLoaded || !resultDisplay || !penaltyWheelContainer || !penaltyCanvas) {
        showError(errorTarget, "Error: Penalty wheel elements missing or library not loaded.", 'danger');
        if (button) button.disabled = false; return;
    }

    resultDisplay.innerHTML = `<span class="text-warning"><strong>${escapeHtml(chosenEntity)}</strong> selected... Spinning for penalty...</span>`;
    resultDisplay.style.display = 'block';
    penaltyWheelContainer.style.display = 'block';

    let chosenPenalty, penaltyWheelSegments;
    const penaltyColors = ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#a65628', '#f781bf', '#999999'];
    const NUM_PENALTY_SEGMENTS = 8;

    try {
        const allPenalties = getLocalPenalties();
        const penaltyList = allPenalties[penaltyTabId] || [];
        chosenPenalty = selectWeightedPenalty(penaltyList);
        console.log("Chosen Penalty (Weighted):", chosenPenalty);

        if (!chosenPenalty || chosenPenalty.name === "No Penalty") {
            displayFinalResult(chosenEntity, chosenPenalty, button);
            penaltyWheelContainer.style.display = 'none'; return;
        }

        let wheelSegmentPenalties = [];
        let displayablePenalties = penaltyList.filter(p => p?.name && parseFloat(p.probability) > 0);
        if (displayablePenalties.length > 0) {
            // Ensure chosen is included, add others, pad, shuffle
            // (Keeping the complex segment logic from previous version, assuming it worked)
            wheelSegmentPenalties.push(chosenPenalty); let otherPenalties = displayablePenalties.filter(p => p.id !== chosenPenalty.id); shuffleArray(otherPenalties); let needed = NUM_PENALTY_SEGMENTS - wheelSegmentPenalties.length; wheelSegmentPenalties = wheelSegmentPenalties.concat(otherPenalties.slice(0, needed)); let pool = otherPenalties.length > 0 ? otherPenalties : [chosenPenalty]; let padIdx = 0; while (wheelSegmentPenalties.length < NUM_PENALTY_SEGMENTS && wheelSegmentPenalties.length > 0) { wheelSegmentPenalties.push(pool[padIdx % pool.length]); padIdx++; } if (wheelSegmentPenalties.length > NUM_PENALTY_SEGMENTS) { wheelSegmentPenalties = wheelSegmentPenalties.slice(0, NUM_PENALTY_SEGMENTS); if (!wheelSegmentPenalties.some(p => p.id === chosenPenalty.id)) wheelSegmentPenalties[0] = chosenPenalty; } if (wheelSegmentPenalties.length > 1) shuffleArray(wheelSegmentPenalties);
        } else { wheelSegmentPenalties.push(chosenPenalty); }

        penaltyWheelSegments = createSegments(wheelSegmentPenalties.map(p => p.name), penaltyColors);
        if (penaltyWheelSegments.length === 0) throw new Error("Failed to create penalty segments.");

    } catch (e) { console.error("Error preparing penalty segments:", e); showError(errorTarget, "Error loading penalties!", 'danger'); if (button) button.disabled = false; penaltyWheelContainer.style.display = 'none'; return; }

    const penaltyWinningSegmentIndex = penaltyWheelSegments.findIndex(seg => seg.text === chosenPenalty.name) + 1;
    if (penaltyWinningSegmentIndex <= 0) { console.error("Chosen penalty missing from visual segments!"); displayFinalResult(chosenEntity, chosenPenalty, button); penaltyWheelContainer.style.display = 'none'; return; }

    // Create and start the wheel
    if (penaltyWheels[CHALLENGE_INDEX]) penaltyWheels[CHALLENGE_INDEX] = null;
    try {
        const config = getPenaltyWheelConfig(penaltyWheelSegments, penaltyWinningSegmentIndex, () => displayFinalResult(chosenEntity, chosenPenalty, button), 'Penalty');
        penaltyWheels[CHALLENGE_INDEX] = new Winwheel(config);
        penaltyWheels[CHALLENGE_INDEX].startAnimation();
        console.log("Penalty wheel animation started.");
    } catch (e) { console.error("Error creating Penalty WinWheel:", e); showError(errorTarget, "Error initializing penalty wheel!", 'danger'); if (button) button.disabled = false; penaltyWheelContainer.style.display = 'none'; }
}

/** Main Handler for the "Lost Game" Button Click */
function handleLostGameClick(event) {
    if (!winwheelLoaded) return; // Check if library loaded

    const button = event.target.closest('.lostGameBtn-Shared');
    if (!button) return;

    console.log("Penalty assignment initiated...");
    const penaltyTabId = button.dataset.penaltyTabId;
    const resultDisplay = document.getElementById(`penaltyResult-${CHALLENGE_INDEX}`); // Get result display early
    // Define potential targets for general errors
    const errorTarget = resultDisplay || document.getElementById('challengeViewContainer') || document.body;
    const playerWheelContainer = document.getElementById(`playerWheelContainer-${CHALLENGE_INDEX}`);
    const playerCanvas = document.getElementById(`playerWheelCanvas-${CHALLENGE_INDEX}`);
    const playerWheelTitle = document.getElementById(`playerWheelTitle-${CHALLENGE_INDEX}`);
    const penaltyWheelContainer = document.getElementById(`penaltyWheelContainer-${CHALLENGE_INDEX}`);
    const penaltyCanvas = document.getElementById(`penaltyWheelCanvas-${CHALLENGE_INDEX}`);

    // Check essential elements exist
    if (!resultDisplay || !playerWheelContainer || !playerCanvas || !penaltyWheelContainer || !penaltyCanvas || !playerWheelTitle) {
        showError(errorTarget, "Error: Penalty UI components missing.", "danger"); // Use showError for plain text error
        return;
    }

    resetPenaltyUI(); // Clear previous state

    // --- Directly set initial status HTML & Classes ---
    resultDisplay.innerHTML = `<span class="text-info">Determining participants...</span>`;
    resultDisplay.className = 'mt-3 penalty-result-display alert alert-info'; // Set classes
    resultDisplay.style.display = 'block'; // Ensure visible
    // --- End Status ---
    button.disabled = true;

    // --- Determine Participants for the First Wheel ---
    let participants = [];
    let wheelTitleText = "Participant";
    const joinedGroupId = penaltyPageConfig.userJoinedGroupId;
    const playersPerGroup = penaltyPageConfig.numPlayersPerGroup || 1;

    if (joinedGroupId !== null && penaltyPageConfig.isMultigroup) {
        const myGroupData = penaltyPageConfig.initialGroups?.find(g => g.id === joinedGroupId);
        const savedNames = (myGroupData?.player_names || [])
                            .map(name => typeof name === 'string' ? name.trim() : '')
                            .filter(name => name.length > 0)
                            .slice(0, playersPerGroup);

        if (savedNames.length > 0) {
            participants = savedNames;
            wheelTitleText = `Selecting Player from Your Group (${savedNames.length}/${playersPerGroup})`;
        } else {
            participants = Array.from({ length: playersPerGroup }, (_, i) => `Player ${i + 1}`);
            wheelTitleText = `Selecting Player (Default Names)`;
        }
    } else {
        participants = ['Participant'];
        wheelTitleText = "Challenge Participant";
    }
    // --- End Determining Participants ---

    console.log("Participants for wheel:", participants);
    playerWheelTitle.textContent = wheelTitleText; // Update the heading text

    // Continue with wheel setup...
    let chosenEntity = participants[Math.floor(Math.random() * participants.length)];
    const entityColors = ['#8dd3c7', '#ffffb3', '#bebada', '#fb8072', '#80b1d3', '#fdb462', '#b3de69', '#fccde5'];
    let entitySegments = createSegments(participants, entityColors);

    if(entitySegments.length === 0) {
         showError(resultDisplay, "Error creating segments.", 'danger'); // Use showError
         button.disabled = false; return;
     }

    const winningSegmentIndex = entitySegments.findIndex(seg => seg.text === chosenEntity) + 1 || 1;

    // Create and start participant wheel
    if (playerWheels[CHALLENGE_INDEX]) playerWheels[CHALLENGE_INDEX] = null;
    try {
        const config = getPenaltyWheelConfig( // Use helper for config
            entitySegments, winningSegmentIndex,
            () => spinPenaltyWheel(penaltyTabId, chosenEntity, button), // Callback
            'Player' // Wheel type
        );
        playerWheels[CHALLENGE_INDEX] = new Winwheel(config);
        playerWheelContainer.style.display = 'block';

        // --- Directly set spinning status HTML & Classes ---
        resultDisplay.innerHTML = `<span class="text-warning">Spinning for ${escapeHtml(chosenEntity)}...</span>`;
        resultDisplay.className = 'mt-3 penalty-result-display alert alert-warning'; // Update class
        // --- End Update ---

        playerWheels[CHALLENGE_INDEX].startAnimation();
     } catch (e) {
         console.error("Error creating Participant WinWheel:", e);
         showError(resultDisplay, "Error initializing participant wheel!", 'danger'); // Use showError
         button.disabled = false;
     }
}


// --- Initialize Penalty Logic ---
function initializePenaltyHandler() {
    if (!winwheelLoaded) { console.log("Penalty handler NOT initialized: Winwheel missing."); return; }
    const dataEl = document.getElementById('challengeData');
    const statusDiv = document.getElementById('pageStatusDisplay'); // For potential errors here

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
             console.log("Penalty module initial config read:", penaltyPageConfig);

             // Attach listener only if the button exists
             if (document.querySelector(`.lostGameBtn-Shared`)) {
                  document.addEventListener('click', handleLostGameClick);
                  console.log("Challenge Penalty Handler Initialized (delegated).");
             } else { console.log("Penalty button not found, skipping handler."); }

         } catch (e) { console.error("Penalty module failed to read initial config:", e); showError(statusDiv || document.body, "Penalty Init Error.", 'warning'); }
    } else { console.error("Penalty module could not find #challengeData."); }
}

// Initialize automatically when script loads
initializePenaltyHandler();