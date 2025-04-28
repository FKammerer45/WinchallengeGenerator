// static/js/challenge/challenge_penalty.js
// Handles the penalty wheel logic for the shared challenge view page.

// Import utility to get penalty data from local storage
import { getLocalPenalties } from "../penalties/penaltyLocalStorageUtils.js";
// Import shared helper functions
import { escapeHtml, showError } from '../utils/helpers.js'; // Use showError instead of local displayStatus
import { apiFetch } from '../utils/api.js';
import { updatePenaltyDisplay } from './ui.js';
// --- Library Checks ---
let winwheelLoaded = (typeof Winwheel !== 'undefined');
const animationOk = (typeof TweenMax !== 'undefined' || typeof gsap !== 'undefined');

function bailIfLibMissing(targetNode) {
    if (winwheelLoaded) return false;         // everything is fine
    // first call – tell the user only once
    winwheelLoaded = null;
    const msg = "Penalty wheel is unavailable because the Winwheel " +
        "library could not be loaded.";
    showError(targetNode || document.body, msg, "danger");
    console.error(msg);
    return true;                              // caller must abort
}

// ---------------------------------------------------------------------------
// 1.  Immutable, index‑keyed state  ------------------------------------------
// ---------------------------------------------------------------------------
// We might have several widgets on the same page (edge‑case: multi‑challenge
// view).  Each gets its *own* index (“shared”, “local”, …).
const playerWheels = new Map();   // index → wheel instance
const penaltyWheels = new Map();   // index → wheel instance

// small helpers
const getPlayerWheel = idx => playerWheels.get(idx);
const getPenaltyWheel = idx => penaltyWheels.get(idx);

function setPlayerWheel(idx, wheel) { playerWheels.set(idx, wheel); }
function setPenaltyWheel(idx, wheel) { penaltyWheels.set(idx, wheel); }
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

function resetPenaltyUI(idx) {
    const playerCont = document.getElementById(`playerWheelContainer-${idx}`);
    const penaltyCont = document.getElementById(`penaltyWheelContainer-${idx}`);
    const resultDisp = document.getElementById(`penaltyResult-${idx}`);

    if (playerCont) playerCont.style.display = 'none';
    if (penaltyCont) penaltyCont.style.display = 'none';
    if (resultDisp) { resultDisp.style.display = 'none'; showError(resultDisp, null); } // Use showError to clear
    if (getPlayerWheel(idx)) getPlayerWheel(idx).stopAnimation(false);
    if (getPenaltyWheel(idx)) getPenaltyWheel(idx).stopAnimation(false);
    setPlayerWheel(idx, null);
    setPenaltyWheel(idx, null);

    console.log("Penalty UI Reset");
}

async function displayFinalResult(idx, chosenEntity, chosenPenalty, allPlayers, allPenaltiesForWheel, playerStopAngle, playerWinningSegmentIndex, button) {
    const resultDisplay = document.getElementById(`penaltyResult-${idx}`);
    if (!resultDisplay) return;

    let message = '';
    let type = 'info';
    let penaltyTextToSave = '';

    // Construct display message and text to save (same as before)
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

    resultDisplay.innerHTML = message;
    resultDisplay.className = `mt-3 penalty-result-display alert alert-${type}`;
    resultDisplay.style.display = 'block';

    const dataEl = document.getElementById('challengeData');
    const csrfToken = dataEl?.dataset.csrfToken;
    const challengeId = dataEl?.dataset.challengeId;
    let userJoinedGroupId = null;
    try {
        const parsedId = JSON.parse(dataEl?.dataset.userJoinedGroupId || 'null');
        if (typeof parsedId === 'number') userJoinedGroupId = parsedId;
    } catch (e) { console.error("Error parsing userJoinedGroupId:", e); }

    if (userJoinedGroupId && challengeId && csrfToken) {
        const recordUrl = `/api/challenge/groups/${userJoinedGroupId}/penalty_spin_result`;

        // --- MODIFIED PAYLOAD ---
        const payload = {
            penalty_result: {
                // Existing winner info
                name: chosenPenalty.name,
                description: chosenPenalty.description || null,
                player: chosenEntity,
                // Existing penalty wheel animation info
                stopAngle: getPenaltyWheel(idx)?.animation?.stopAngle,
                winningSegmentIndex: getPenaltyWheel(idx)?.getIndicatedSegmentNumber(),
                // --- NEW DATA ---
                playerStopAngle: playerStopAngle,                   // Add player wheel angle
                playerWinningSegmentIndex: playerWinningSegmentIndex, // Add player wheel index
                all_players: allPlayers || [],                      // Add full player list used
                all_penalties: allPenaltiesForWheel || []           // Add full penalty list used
                // Note: all_penalties contains objects like {name:.., description:.., probability:..}
            }
        };
        // --- END MODIFICATION ---

        try {
            console.log(`Recording penalty spin result to backend for group ${userJoinedGroupId}:`, payload.penalty_result);
            await apiFetch(recordUrl, {
                method: 'POST',
                body: payload
            }, csrfToken);
            console.log("Backend penalty spin result recording successful.");
            // Backend will emit the full payload via WebSocket now
        } catch (error) {
            console.error("Failed to record penalty spin result to backend:", error);
            resultDisplay.innerHTML += `<br><small class="text-danger">Error recording spin result: ${error.message}</small>`;
        }
    } else {
        console.warn("Cannot record penalty spin result: Missing Group ID, Challenge ID, or CSRF token.");
    }

    if (button) button.disabled = false;
}

// --- Winwheel Configuration Helper ---
function getPenaltyWheelConfig(segments, winningIndex, callbackFn, idx, wheelType = 'Penalty') {
    if (!winwheelLoaded) return null;  // library not available
    if (!Array.isArray(segments) || segments.length === 0 || winningIndex <= 0) {
        throw new Error(`Cannot configure ${wheelType} wheel: invalid segments or winningIndex.`);
    }

    const numSegments = segments.length;
    // pick a random angle within the winning segment
    const stopAngle = calculateStopAngle(numSegments, winningIndex);

    const isPlayerWheel = wheelType === 'Player';
    // size & canvas selection
    const outerRadius   = isPlayerWheel ? 100 : 140;
    const innerRadius   = 20;
    const textFontSize  = 12;
    const canvasId      = isPlayerWheel
        ? `playerWheelCanvas-${idx}`
        : `penaltyWheelCanvas-${idx}`;

    // animation params
    const duration = isPlayerWheel ? 5 : 8;  // seconds
    const spins    = isPlayerWheel ? 6 : 10;

    return {
        canvasId,
        numSegments,
        outerRadius,
        innerRadius,
        textFontSize,
        textMargin: 5,
        textFillStyle: '#ffffff',
        textStrokeStyle: 'rgba(0,0,0,0.2)',
        lineWidth: 2,
        strokeStyle: '#ffffff',
        segments,
        pointerGuide: { display: true, strokeStyle: '#ffc107', lineWidth: 3 },
        animation: {
            type: 'spinToStop',
            duration,
            spins,
            easing: 'Power4.easeOut',       // uses GSAP if available
            stopAngle,
            callbackFinished: callbackFn
        },
        pins: {
            number: Math.min(numSegments * 2, 36),
            outerRadius: 4,
            fillStyle: '#cccccc',
            strokeStyle: '#666666'
        }
    };
}


// --- Core Wheel Logic ---

function spinPenaltyWheel(idx, penaltyTabId, chosenEntity, button, participants, playerStopAngle, playerWinningSegmentIndex) { // Added arguments
    console.log("Participant selected, preparing penalty wheel...");
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

    let chosenPenalty, penaltyWheelSegments, wheelSegmentPenalties = []; // Declare wheelSegmentPenalties here
    const penaltyColors = ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#a65628', '#f781bf', '#999999'];
    const NUM_PENALTY_SEGMENTS = 8;

    try {
        const allPenalties = getLocalPenalties();
        const penaltyList = allPenalties[penaltyTabId] || [];
        chosenPenalty = selectWeightedPenalty(penaltyList);
        console.log("Chosen Penalty (Weighted):", chosenPenalty);

        if (!chosenPenalty || chosenPenalty.name === "No Penalty") {
            // Pass necessary arguments even for no penalty
            displayFinalResult(idx, chosenEntity, chosenPenalty, participants, [], playerStopAngle, playerWinningSegmentIndex, button);
            penaltyWheelContainer.style.display = 'none'; return;
        }

        // --- Logic to build wheelSegmentPenalties (same as before) ---
        let displayablePenalties = penaltyList.filter(p => p?.name && parseFloat(p.probability) > 0);
        if (displayablePenalties.length > 0) {
            wheelSegmentPenalties.push(chosenPenalty); let otherPenalties = displayablePenalties.filter(p => p.id !== chosenPenalty.id); shuffleArray(otherPenalties); let needed = NUM_PENALTY_SEGMENTS - wheelSegmentPenalties.length; wheelSegmentPenalties = wheelSegmentPenalties.concat(otherPenalties.slice(0, needed)); let pool = otherPenalties.length > 0 ? otherPenalties : [chosenPenalty]; let padIdx = 0; while (wheelSegmentPenalties.length < NUM_PENALTY_SEGMENTS && wheelSegmentPenalties.length > 0) { wheelSegmentPenalties.push(pool[padIdx % pool.length]); padIdx++; } if (wheelSegmentPenalties.length > NUM_PENALTY_SEGMENTS) { wheelSegmentPenalties = wheelSegmentPenalties.slice(0, NUM_PENALTY_SEGMENTS); if (!wheelSegmentPenalties.some(p => p.id === chosenPenalty.id)) wheelSegmentPenalties[0] = chosenPenalty; } if (wheelSegmentPenalties.length > 1) shuffleArray(wheelSegmentPenalties);
        } else { wheelSegmentPenalties.push(chosenPenalty); }
        // --- End logic ---

        // Ensure the list has the correct number of segments (important for index calculation)
        while (wheelSegmentPenalties.length < NUM_PENALTY_SEGMENTS && wheelSegmentPenalties.length > 0) {
            wheelSegmentPenalties.push(wheelSegmentPenalties[0]); // Pad with first if needed
        }
        if(wheelSegmentPenalties.length > NUM_PENALTY_SEGMENTS) {
             wheelSegmentPenalties = wheelSegmentPenalties.slice(0, NUM_PENALTY_SEGMENTS);
        }
         // Ensure chosen penalty is still in the final list if truncated/padded
        if (!wheelSegmentPenalties.some(p => p.id === chosenPenalty.id)) {
            wheelSegmentPenalties[0] = chosenPenalty; // Replace first if missing
        }

        // Create segments using the names from the final list
        penaltyWheelSegments = createSegments(wheelSegmentPenalties.map(p => p.name), penaltyColors);
        if (penaltyWheelSegments.length === 0) throw new Error("Failed to create penalty segments.");

    } catch (e) { console.error("Error preparing penalty segments:", e); showError(errorTarget, "Error loading penalties!", 'danger'); if (button) button.disabled = false; penaltyWheelContainer.style.display = 'none'; return; }

    // Find the index based on the *final* segment list used for the wheel
    const penaltyWinningSegmentIndex = penaltyWheelSegments.findIndex(seg => seg.text === chosenPenalty.name) + 1;
    if (penaltyWinningSegmentIndex <= 0) {
        console.error("Chosen penalty missing from final visual segments!");
        // Pass necessary arguments
        displayFinalResult(idx, chosenEntity, chosenPenalty, participants, wheelSegmentPenalties, playerStopAngle, playerWinningSegmentIndex, button);
        penaltyWheelContainer.style.display = 'none'; return;
    }

    if (getPenaltyWheel(idx)) setPenaltyWheel(idx, null);
    try {
        const config = getPenaltyWheelConfig(
            penaltyWheelSegments,
            penaltyWinningSegmentIndex,
            // --- MODIFIED CALLBACK ---
            // Pass the captured lists and player wheel data to the final step
            () => displayFinalResult(idx, chosenEntity, chosenPenalty, participants, wheelSegmentPenalties, playerStopAngle, playerWinningSegmentIndex, button),
            // --- END MODIFICATION ---
            idx,
            'Penalty'
        );
        if (!config) { button.disabled = false; return; }
        const wheel = new Winwheel(config);
        setPenaltyWheel(idx, wheel);
        wheel.startAnimation();
        console.log("Penalty wheel animation started.");
    } catch (e) { console.error("Error creating Penalty WinWheel:", e); showError(errorTarget, "Error initializing penalty wheel!", 'danger'); if (button) button.disabled = false; penaltyWheelContainer.style.display = 'none'; }
}

/** Main Handler for the "Lost Game" Button Click */
function handleLostGameClick(event) {
    if (!winwheelLoaded) return;

    const button = event.target.closest('.lostGameBtn-Shared, .lostGameBtn-local');
    if (!button) return;

    const idx = button.classList.contains('lostGameBtn-local') ? 'local' : 'shared';
    const penaltyTabId = button.dataset.penaltyTabId;
    const resultDisplay = document.getElementById(`penaltyResult-${idx}`);
    const errorTarget   = resultDisplay || document.getElementById('challengeViewContainer') || document.body;
    const playerWheelContainer = document.getElementById(`playerWheelContainer-${idx}`);
    const playerCanvas = document.getElementById(`playerWheelCanvas-${idx}`);
    const playerWheelTitle = document.getElementById(`playerWheelTitle-${idx}`);
    const penaltyWheelContainer = document.getElementById(`penaltyWheelContainer-${idx}`);

    if (!resultDisplay || !playerWheelContainer || !playerCanvas || !playerWheelTitle || !penaltyWheelContainer) {
        showError(errorTarget, "Error: Penalty UI components missing.", "danger");
        return;
    }

    resetPenaltyUI(idx);
    button.disabled = true;
    resultDisplay.style.display = 'block';
    resultDisplay.className = 'mt-3 penalty-result-display alert alert-info';
    resultDisplay.innerHTML = `<span class="text-info">Determining participants…</span>`;

    // --- CAPTURE PARTICIPANTS LIST ---
    let participants = [];
    let titleText = "Challenge Participant";
    const { userJoinedGroupId, numPlayersPerGroup, isMultigroup, initialGroups } = penaltyPageConfig;

    if (userJoinedGroupId !== null && isMultigroup) {
        const group = initialGroups.find(g => g.id === userJoinedGroupId) || {};
        const saved = (group.player_names||[]).map(n=>n?.trim()).filter(n=>n);
        if (saved.length) {
            participants = saved.slice(0, numPlayersPerGroup);
            titleText = `Selecting Player (${saved.length}/${numPlayersPerGroup})`;
        } else {
            participants = Array.from({length: numPlayersPerGroup}, (_,i)=>`Player ${i+1}`);
            titleText = `Selecting Player (Default Names)`;
        }
    } else {
        participants = ['Participant']; // Single player mode or local
    }
    playerWheelTitle.textContent = titleText;
    console.log("Participants for player wheel:", participants);
    // --- END CAPTURE ---

    if (participants.length === 0) { // Add check for empty participants list
         showError(resultDisplay, "Error: No participants found to select from.", "danger");
         button.disabled = false;
         return;
    }

    const chosen = participants[Math.floor(Math.random()*participants.length)];
    const playerColors = ['#8dd3c7','#ffffb3','#bebada','#fb8072', '#80b1d3','#fdb462','#b3de69','#fccde5'];
    const entitySegments = createSegments(participants, playerColors);
    if (!entitySegments.length) {
        showError(resultDisplay, "Error creating player segments.", "danger");
        button.disabled = false;
        return;
    }
    const playerWinningSegmentIndex = entitySegments.findIndex(s=>s.text===chosen)+1;
    if (playerWinningSegmentIndex <= 0) { // Add check if winner not found in segments
         console.error("Chosen player not found in segments:", chosen, entitySegments);
         showError(resultDisplay, "Internal error selecting player.", "danger");
         button.disabled = false;
         return;
    }
    // --- CALCULATE PLAYER STOP ANGLE ---
    const playerStopAngle = calculateStopAngle(entitySegments.length, playerWinningSegmentIndex);
    // --- END CALCULATION ---

    const oldWheel = getPlayerWheel(idx);
    if (oldWheel) {
        oldWheel.stopAnimation(false);
        setPlayerWheel(idx, null);
    }

    try {
        const cfg = getPenaltyWheelConfig(
            entitySegments,
            playerWinningSegmentIndex, // Use the calculated index
             // --- MODIFIED CALLBACK ---
             // Pass required data to the next step (spinPenaltyWheel)
             () => spinPenaltyWheel(idx, penaltyTabId, chosen, button, participants, playerStopAngle, playerWinningSegmentIndex),
             // --- END MODIFICATION ---
            idx,
            'Player'
        );
         // --- Set the calculated player stopAngle in the config ---
         cfg.animation.stopAngle = playerStopAngle;
         // --- End Set ---

        const wheel = new Winwheel(cfg);
        setPlayerWheel(idx, wheel);
        playerWheelContainer.style.display = 'block';
        resultDisplay.className = 'mt-3 penalty-result-display alert alert-warning';
        resultDisplay.innerHTML = `<span class="text-warning">Spinning for participant...</span>`; // Updated text
        wheel.startAnimation();
    } catch (e) {
        console.error("Error creating Participant WinWheel:", e);
        showError(resultDisplay, "Error initializing participant wheel!", "danger");
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
            document.addEventListener('click', handleLostGameClick);
            console.log('Challenge Penalty Handler Initialised (delegated).');


        } catch (e) { console.error("Penalty module failed to read initial config:", e); showError(statusDiv || document.body, "Penalty Init Error.", 'warning'); }
    } else { console.error("Penalty module could not find #challengeData."); }
}

// Initialize automatically when script loads
initializePenaltyHandler();