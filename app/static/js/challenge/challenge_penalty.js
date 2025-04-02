// static/js/challenge/challenge_penalty.js
// Handles the penalty wheel logic for the shared challenge view page.

// Import utility to get penalty data from local storage
// Ensure the relative path is correct
import { getLocalPenalties } from "../penalties/penaltyLocalStorageUtils.js";

// Check if Winwheel library is loaded (it should be included in the HTML)
if (typeof Winwheel === 'undefined') {
    console.error("Winwheel library not loaded. Penalty wheel cannot function.");
    // Optionally disable penalty feature entirely
}

// --- State Variables ---
let playerWheels = {};
let penaltyWheels = {};
const CHALLENGE_INDEX = 'shared'; // Fixed index for elements on this page

// --- Helper Functions ---
function createSegments(items, colors) {
    if (!items || items.length === 0) return [];
    // Ensure default color if colors array is empty
    const safeColors = colors && colors.length > 0 ? colors : ['#888888'];
    return items.map((item, index) => ({
      'fillStyle': safeColors[index % safeColors.length],
      'text': String(item)
    }));
}

function calculateStopAngle(numSegments, winningSegmentNumber) {
    if (numSegments <= 0 || winningSegmentNumber <= 0) return Math.random() * 360; // Spin randomly if invalid input
    const segmentAngle = 360 / numSegments;
    const randomAngleInSegment = segmentAngle * (0.1 + Math.random() * 0.8); // Stop between 10% and 90% into segment
    const stopAt = ((winningSegmentNumber - 1) * segmentAngle) + randomAngleInSegment;
    return stopAt;
}

function selectWeightedPenalty(penalties) {
    if (!Array.isArray(penalties) || penalties.length === 0) {
      console.warn("selectWeightedPenalty: No penalties provided.");
      // Return a specific object indicating no penalty applicable
      return { name: "No Penalty", description: "No penalties available in selected source." };
    }
    let totalWeight = 0;
    const validPenalties = penalties.filter(p => {
      const prob = parseFloat(p?.probability);
      if (!isNaN(prob) && prob > 0) {
        totalWeight += prob;
        return true;
      }
      return false;
    });

    if (totalWeight <= 0 || validPenalties.length === 0) {
      console.warn("No valid penalties found for weighted selection.");
      return { name: "No Penalty", description: "No applicable penalties found or probabilities too low." };
    }

    let randomThreshold = Math.random() * totalWeight;
    for (const penalty of validPenalties) {
      randomThreshold -= parseFloat(penalty.probability);
      if (randomThreshold <= 0) {
        return penalty; // This is the chosen penalty
      }
    }
    // Fallback (should rarely happen with correct logic)
    console.warn("Weighted selection fallback strategy used.");
    return validPenalties[validPenalties.length - 1];
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function escapeHtml(str) { // Keep local copy or import from shared utils
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>"']/g, match =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[match])
    );
}

/** Resets the UI elements for the penalty wheels */
function resetPenaltyUI() {
    const playerWheelContainer = document.getElementById(`playerWheelContainer-${CHALLENGE_INDEX}`);
    const penaltyWheelContainer = document.getElementById(`penaltyWheelContainer-${CHALLENGE_INDEX}`);
    const resultDisplay = document.getElementById(`penaltyResult-${CHALLENGE_INDEX}`);

    if (playerWheelContainer) playerWheelContainer.style.display = 'none';
    if (penaltyWheelContainer) penaltyWheelContainer.style.display = 'none';
    if (resultDisplay) { resultDisplay.style.display = 'none'; resultDisplay.innerHTML = ''; }

    // Optional: Explicitly stop/destroy wheels if Winwheel provides methods
    // if (playerWheels[CHALLENGE_INDEX]?.destroy) playerWheels[CHALLENGE_INDEX].destroy();
    // if (penaltyWheels[CHALLENGE_INDEX]?.destroy) penaltyWheels[CHALLENGE_INDEX].destroy();

    playerWheels[CHALLENGE_INDEX] = null;
    penaltyWheels[CHALLENGE_INDEX] = null;
}

/** Displays the final penalty result */
function displayFinalResult(chosenPlayer, chosenPenalty, button) {
    const resultDisplay = document.getElementById(`penaltyResult-${CHALLENGE_INDEX}`);
    if (!resultDisplay) { console.error("Result display element not found for penalty."); return; }

    if (chosenPlayer && chosenPenalty && chosenPenalty.name) {
        resultDisplay.innerHTML = `Player <strong>${escapeHtml(chosenPlayer)}</strong> receives penalty: <br><strong>${escapeHtml(chosenPenalty.name)}</strong> ${chosenPenalty.description ? `<br><small class="text-muted">(${escapeHtml(chosenPenalty.description)})</small>` : ''}`;
    } else {
        resultDisplay.innerHTML = `Could not assign penalty to <strong>${escapeHtml(chosenPlayer)}</strong>. ${chosenPenalty?.name ? escapeHtml(chosenPenalty.name) : 'No penalty determined.'} ${chosenPenalty?.description ? `<small class="text-muted">(${escapeHtml(chosenPenalty.description)})</small>` : ''}`;
        console.warn("Final penalty assignment resulted in No Penalty or missing data. Player:", chosenPlayer, "Penalty:", chosenPenalty);
    }
    resultDisplay.style.display = 'block';
    if (button) button.disabled = false; // Re-enable the 'Lost Game' button
}

/** Spins the second wheel (penalty selection) */
function spinPenaltyWheel(penaltyTabId, chosenPlayer, button) {
    console.log("Player wheel finished. Preparing penalty wheel...");
    const resultDisplay = document.getElementById(`penaltyResult-${CHALLENGE_INDEX}`);
    const penaltyWheelContainer = document.getElementById(`penaltyWheelContainer-${CHALLENGE_INDEX}`);
    const penaltyCanvas = document.getElementById(`penaltyWheelCanvas-${CHALLENGE_INDEX}`);

    if (!resultDisplay || !penaltyWheelContainer || !penaltyCanvas) {
        console.error("Penalty wheel elements missing."); if(button) button.disabled = false; return;
    }

    resultDisplay.innerHTML = `<span class="text-warning">Player <strong>${escapeHtml(chosenPlayer)}</strong> selected... Spinning for penalty...</span>`;
    penaltyWheelContainer.style.display = 'block';

    let chosenPenalty = null; let penaltyWheelSegments = [];
    const penaltyColors = ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#ffff33', '#a65628', '#f781bf'];
    const NUM_PENALTY_SEGMENTS = 8; // Use 8 for variety

    try {
        const allPenalties = getLocalPenalties(); // Fetch from localStorage
        const penaltyList = allPenalties[penaltyTabId] || [];
        chosenPenalty = selectWeightedPenalty(penaltyList); // Determine actual outcome first
        console.log("Chosen Penalty (Weighted):", chosenPenalty);

        if (!chosenPenalty || chosenPenalty.name === "No Penalty") {
            displayFinalResult(chosenPlayer, chosenPenalty, button);
            penaltyWheelContainer.style.display = 'none'; return;
        }

        // --- Prepare Segments for Visual Wheel ---
        let wheelSegmentPenalties = [];
        let displayablePenalties = penaltyList.filter(p => p?.name && parseFloat(p.probability) > 0);
        if (displayablePenalties.length > 0) {
             if (!displayablePenalties.some(p => p.id === chosenPenalty.id)) wheelSegmentPenalties.push(chosenPenalty); // Ensure chosen is possible to display
             else wheelSegmentPenalties.push(chosenPenalty);
             let otherPenalties = displayablePenalties.filter(p => p.id !== chosenPenalty.id); shuffleArray(otherPenalties);
             let needed = NUM_PENALTY_SEGMENTS - wheelSegmentPenalties.length;
             wheelSegmentPenalties = wheelSegmentPenalties.concat(otherPenalties.slice(0, needed));
             let validPool = displayablePenalties.length > 0 ? displayablePenalties : [chosenPenalty]; let padIdx = 0;
             while (wheelSegmentPenalties.length < NUM_PENALTY_SEGMENTS && wheelSegmentPenalties.length > 0) { wheelSegmentPenalties.push(validPool[padIdx % validPool.length]); padIdx++; }
             if (wheelSegmentPenalties.length > NUM_PENALTY_SEGMENTS) { wheelSegmentPenalties = wheelSegmentPenalties.slice(0, NUM_PENALTY_SEGMENTS); if (!wheelSegmentPenalties.some(p=>p.id===chosenPenalty.id)) wheelSegmentPenalties[0]=chosenPenalty;} // Ensure chosen still present
             if (wheelSegmentPenalties.length > 1) shuffleArray(wheelSegmentPenalties);
        } else { wheelSegmentPenalties.push(chosenPenalty); } // Only chosen one available
        penaltyWheelSegments = createSegments(wheelSegmentPenalties.map(p => p.name), penaltyColors);
        if(penaltyWheelSegments.length === 0) throw new Error("Failed to create any penalty segments.");

    } catch (e) { console.error("Error loading/preparing penalty segments:", e); resultDisplay.innerHTML = '<span class="text-danger">Error loading penalties!</span>'; if(button) button.disabled = false; return; }

    // Find where the actual chosen penalty landed in the shuffled visual wheel
    const penaltyWinningSegmentIndex = penaltyWheelSegments.findIndex(seg => seg.text === chosenPenalty.name) + 1;
    if (penaltyWinningSegmentIndex <= 0) { console.error("Chosen penalty not found in final visual wheel segments!", chosenPenalty.name, penaltyWheelSegments); displayFinalResult(chosenPlayer, chosenPenalty, button); return; }

    // Create and start the wheel
    if (penaltyWheels[CHALLENGE_INDEX]) penaltyWheels[CHALLENGE_INDEX] = null;
    try {
         penaltyWheels[CHALLENGE_INDEX] = new Winwheel({
             'canvasId': `penaltyWheelCanvas-${CHALLENGE_INDEX}`,
             'numSegments': penaltyWheelSegments.length,
             'outerRadius': 150, 'innerRadius': 30, 'textFontSize': 14,'textMargin': 8, 'textFillStyle': '#fff',
             'segments': penaltyWheelSegments,
             'pointerGuide': { 'display': true, 'strokeStyle': '#ffc107', 'lineWidth': 3 },
             'animation': {
                 'type': 'spinToStop', 'duration': 7, 'spins': 8,
                 'stopAngle': calculateStopAngle(penaltyWheelSegments.length, penaltyWinningSegmentIndex),
                 'callbackFinished': () => displayFinalResult(chosenPlayer, chosenPenalty, button)
             },
             'pins': { 'number': Math.min(penaltyWheelSegments.length * 2, 36), 'outerRadius': 4, 'fillStyle': 'silver' } // Limit pins
         });
         penaltyWheels[CHALLENGE_INDEX].startAnimation();
    } catch(e) {
        console.error("Error creating WinWheel instance:", e);
        resultDisplay.innerHTML = '<span class="text-danger">Error initializing penalty wheel!</span>';
        if(button) button.disabled = false;
    }
}

/** Main Handler for the "Lost Game" Button Click */
function handleLostGameClick(event) {
    // Use specific class for the button in the penalty section partial
    const button = event.target.closest('.lostGameBtn-Shared'); // Make sure button in partial has this class
    if (!button) return;

    console.log("Penalty assignment initiated...");

    // Get data from button needed for penalty wheels
    const penaltyTabId = button.dataset.penaltyTabId;
    const playersJsonString = button.dataset.players || '[]';
    let players = [];
    try { players = JSON.parse(playersJsonString); if (!Array.isArray(players)) players = []; }
    catch (e) { console.error("Error parsing player data for penalty:", e); players = []; }

    // Find necessary UI elements using the shared suffix
    const resultDisplay = document.getElementById(`penaltyResult-${CHALLENGE_INDEX}`);
    const playerWheelContainer = document.getElementById(`playerWheelContainer-${CHALLENGE_INDEX}`);
    const penaltyWheelContainer = document.getElementById(`penaltyWheelContainer-${CHALLENGE_INDEX}`);
    const playerCanvas = document.getElementById(`playerWheelCanvas-${CHALLENGE_INDEX}`);
    const penaltyCanvas = document.getElementById(`penaltyWheelCanvas-${CHALLENGE_INDEX}`);

    // Check if essential elements exist
    if (!resultDisplay || !playerWheelContainer || !penaltyWheelContainer || !playerCanvas || !penaltyCanvas) {
        console.error(`Missing shared penalty UI elements (IDs ending with ${CHALLENGE_INDEX})`);
        alert("Error: UI components for penalty wheels not found.");
        return;
    }

    resetSharedPenaltyUI(); // Clear previous state
    resultDisplay.innerHTML = '<span class="text-warning">Spinning for player...</span>';
    resultDisplay.style.display = 'block';
    button.disabled = true;

    // Step 1: Select Player & Setup/Spin Player Wheel
    let chosenPlayer = "Player"; let playerSegments = [];
    const playerColors = ['#8dd3c7', '#ffffb3', '#bebada', '#fb8072', '#80b1d3', '#fdb462', '#b3de69', '#fccde5'];
    if (players.length > 0) {
        chosenPlayer = players[Math.floor(Math.random() * players.length)];
        playerSegments = createSegments(players, playerColors);
    } else {
        console.warn("No player names provided for penalty wheel.");
        playerSegments = createSegments(['Player'], playerColors); // Default wheel
    }

    if(playerSegments.length === 0) { // Handle case where createSegments fails
         console.error("Failed to create player segments.");
         resultDisplay.innerHTML = '<span class="text-danger">Error setting up player wheel!</span>';
         button.disabled = false;
         return;
     }

    const playerWinningSegmentIndex = playerSegments.findIndex(seg => seg.text === chosenPlayer) + 1 || 1;

    // Create and start player wheel
    if (playerWheels[CHALLENGE_INDEX]) playerWheels[CHALLENGE_INDEX] = null; // Clear old instance
    try {
         playerWheels[CHALLENGE_INDEX] = new Winwheel({
             'canvasId': `playerWheelCanvas-${CHALLENGE_INDEX}`,
             'numSegments': playerSegments.length,
             'outerRadius': 100, 'innerRadius': 20, 'textFontSize': 12,
             'segments': playerSegments,
             'animation': {
                 'type': 'spinToStop', 'duration': 4, 'spins': 5,
                 'stopAngle': calculateStopAngle(playerSegments.length, playerWinningSegmentIndex),
                 'callbackFinished': () => spinPenaltyWheel(penaltyTabId, chosenPlayer, button) // Proceed to penalty wheel
             },
             'pins': { 'number': Math.min(playerSegments.length * 2, 36), 'outerRadius': 4, 'fillStyle': 'silver' }
         });
         playerWheelContainer.style.display = 'block';
         playerWheels[CHALLENGE_INDEX].startAnimation();
     } catch (e) {
         console.error("Error creating Player WinWheel instance:", e);
         resultDisplay.innerHTML = '<span class="text-danger">Error initializing player wheel!</span>';
         button.disabled = false;
     }
}

// --- Initialize Penalty Logic ---
// Use event delegation on the document to catch clicks on the specific button
function initializePenaltyHandler() {
    // Check if the penalty section exists on the page at all
    if (document.getElementById(`penaltyResult-${CHALLENGE_INDEX}`)) {
         document.addEventListener('click', handleLostGameClick);
         console.log("Challenge Penalty Handler Initialized (delegated).");
    } else {
        console.log("Penalty section not found, skipping penalty handler initialization.");
    }
}

// Initialize when the module loads (assuming DOM might already be ready for module scripts)
// or rely on the main challenge_view.js to call this if needed after DOM ready.
// Let's self-initialize assuming it's loaded after DOM ready or penalty elements exist.
initializePenaltyHandler();