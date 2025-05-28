// static/js/overlay.js

// --- Configuration ---
const RECONNECT_DELAY = 5000; // ms
const SOCKET_PATH = '/socket.io'; // Default Socket.IO path
const AUTO_SCROLL_DELAY = 45; // Milliseconds between scroll steps
const AUTO_SCROLL_STEP = 1; // Pixels to scroll each step
const AUTO_SCROLL_PAUSE = 3500; // Pause at top/bottom (ms)
const WHEEL_HIDE_DELAY = 1500; // Delay before hiding wheels after animation

// --- DOM Element References ---
const statusIndicator = document.getElementById('overlay-status');
const statusIcon = document.getElementById('status-icon');
const statusMessage = document.getElementById('status-message');
const challengeTitleEl = document.getElementById('challenge-title');
const timerDisplayEl = document.getElementById('timer-display');
const streamerProgressBar = document.getElementById('streamer-progress-bar');
const streamerProgressLabel = document.querySelector('#streamer-progress-bar-container .progress-label .value');
const rulesListEl = document.getElementById('rules-list');
const otherGroupsListEl = document.getElementById('other-groups-list');
const activePenaltyEl = document.getElementById('active-penalty');
const activePenaltyTextEl = document.getElementById('active-penalty-text');
const activePenaltyTimerEl = document.getElementById('active-penalty-timer'); // Added
const penaltyWheelsContainer = document.getElementById('penalty-wheels-container');
const playerWheelCanvas = document.getElementById('playerWheelCanvas-overlay');
const penaltyWheelCanvas = document.getElementById('penaltyWheelCanvas-overlay');
const timeWheelCanvas = document.getElementById('timeWheelCanvas-overlay'); // Added
const penaltyResultDisplay = document.getElementById('penalty-result-display'); // Will be used now
const playerWheelWrapper = document.getElementById('player-wheel-wrapper');
const penaltyWheelWrapper = document.getElementById('penalty-wheel-wrapper');
const timeWheelWrapper = document.getElementById('time-wheel-wrapper'); // Added

// --- State Variables ---
let socket = null;
let challengeId = null;
let apiKey = null;
let playerWheel = null;
let penaltyWheel = null;
let timeWheel = null; // Added
let currentChallengeStructure = null;
let streamerGroupId = null; // ID of the group this overlay is primarily displaying
let penaltyTimerInterval = null; // Added for penalty countdown
let scrollInterval = null;
let scrollDirection = 1; // 1 for down, -1 for up
let isPausedAtEdge = false;
let isHoveringScroll = false;
let isSpinAnimationActive = false;

let overlayTimerDisplayInterval = null;
let overlayServerTimerData = {
    currentValueSeconds: 0,
    isRunning: false,
    lastStartedAtUTC: null,
};

// --- Timer Functions ---
function formatOverlayTime(totalSeconds) {
    totalSeconds = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
}

function updateOverlayTimerDisplay() {
    if (!timerDisplayEl) return;

    let displaySeconds = overlayServerTimerData.currentValueSeconds;
    if (overlayServerTimerData.isRunning && overlayServerTimerData.lastStartedAtUTC) {
        try {
            const startTimeMillis = new Date(overlayServerTimerData.lastStartedAtUTC).getTime();
            if (!isNaN(startTimeMillis)) {
                const elapsedMillisSinceStart = Date.now() - startTimeMillis;
                displaySeconds = overlayServerTimerData.currentValueSeconds + Math.floor(elapsedMillisSinceStart / 1000);
            } else {
                // console.warn("[OverlayTimer] Invalid lastStartedAtUTC for display:", overlayServerTimerData.lastStartedAtUTC);
                timerDisplayEl.textContent = formatOverlayTime(overlayServerTimerData.currentValueSeconds); // Fallback
                return;
            }
        } catch (e) {
            console.error("[OverlayTimer] Error parsing lastStartedAtUTC:", e);
            timerDisplayEl.textContent = formatOverlayTime(overlayServerTimerData.currentValueSeconds); // Fallback
            return;
        }
    }
    timerDisplayEl.textContent = formatOverlayTime(displaySeconds);
}

function manageOverlayDisplayInterval() {
    if (overlayTimerDisplayInterval) {
        clearInterval(overlayTimerDisplayInterval);
        overlayTimerDisplayInterval = null;
    }
    if (overlayServerTimerData.isRunning) {
        updateOverlayTimerDisplay(); // Update immediately
        overlayTimerDisplayInterval = setInterval(updateOverlayTimerDisplay, 1000);
        // console.debug("[OverlayTimer] Interval started.");
    } else {
        updateOverlayTimerDisplay(); // Ensure display shows the final stopped value
        // console.debug("[OverlayTimer] Interval stopped.");
    }
}

// --- Helper Functions ---
function updateStatus(message, type = 'error') {
    // console.debug(`Overlay Status (${type}): ${message}`); // Changed to debug
    if (!statusIndicator || !statusMessage || !statusIcon) return;

    statusMessage.textContent = message;
    statusIndicator.className = 'overlay-status-indicator'; // Reset classes

    switch (type) {
        case 'error':
            statusIcon.innerHTML = '<i class="bi bi-exclamation-triangle-fill text-danger"></i>';
            statusIndicator.classList.add('error');
            break;
        case 'connecting':
            statusIcon.innerHTML = '<div class="spinner-border spinner-border-sm text-light" role="status"><span class="visually-hidden">Loading...</span></div>';
            statusIndicator.classList.add('connecting');
            break;
        case 'connected':
            statusIcon.innerHTML = '<i class="bi bi-check-circle-fill text-success"></i>';
            statusIndicator.classList.add('connected');
            setTimeout(() => statusIndicator.classList.add('hidden'), 3000);
            break;
        default: // 'hidden' or unknown
            statusIndicator.classList.add('hidden');
            return;
    }
    statusIndicator.classList.remove('hidden');
}

function escapeHtml(str) {
    if (typeof str !== 'string') return String(str); // Handle non-string inputs gracefully
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return str.replace(/[&<>"']/g, m => map[m]);
}

function createSegments(items, colors) {
    if (!Array.isArray(items) || items.length === 0) return [];
    const safeColors = Array.isArray(colors) && colors.length > 0 ? colors : ['#888888']; // Default color if none provided
    return items.map((item, index) => ({
        'fillStyle': safeColors[index % safeColors.length],
        'text': String(item || '?').substring(0, 20), // Ensure text is string, fallback, and truncate
    }));
}

// --- Rendering Functions ---
function renderOverlayRules(container, challengeStructure, groupProgressData = {}) {
    if (!container) { console.error("Rules container element not found for rendering."); return; }
    if (!challengeStructure || (!challengeStructure.normal && !challengeStructure.b2b)) {
        container.innerHTML = '<p class="loading-text small fst-italic text-white-50">No rules defined for this challenge.</p>';
        stopAutoScroll();
        return;
    }

    container.innerHTML = ''; // Clear previous content
    let html = '';
    const biIconPrefix = 'bi bi-'; // Use local const

    const createRuleItemHtml = (key, count, itemType, segmentIndex0Based = null) => {
        let itemHtml = `<div class="progress-category mb-2">`;
        itemHtml += `<div class="rule-label mb-1 d-flex align-items-center">`; // Added flex for alignment
        itemHtml += `<i class="${biIconPrefix}joystick me-2 opacity-75" style="font-size: 0.9em;"></i>`; // Slightly smaller icon
        itemHtml += `<span class="rule-text fw-semibold small">${escapeHtml(key)}</span>`; // Added 'small'
        itemHtml += `<span class="badge bg-secondary rounded-pill fw-normal ms-2 small">${count} needed</span>`;
        itemHtml += `</div>`;
        itemHtml += `<div class="overlay-progress-markers ms-1">`; // Added margin-start
        for (let i = 0; i < count; i++) {
            let lookupKey = key; // Use original key by default
            // Attempt a specific workaround for "AgeOfEmpires (Ranked)"
            if (key === "AgeOfEmpires (Ranked)") {
                lookupKey = "db-aoe-ranked";
                // console.log(`[Overlay renderOverlayRules] Applying workaround for key: "${key}" -> "${lookupKey}"`); // Removed log
            }

            const progressKey = segmentIndex0Based !== null
                ? `${itemType}_${segmentIndex0Based}_${lookupKey}_${i}` 
                : `${itemType}_${lookupKey}_${i}`;
            
            const isChecked = groupProgressData[progressKey] === true;
            // console.log("[Overlay renderOverlayRules] Item DisplayKey:", key, "LookupKey:", lookupKey, "GeneratedProgressKey:", progressKey, "IsChecked:", isChecked, "RawValue:", groupProgressData[progressKey]); // Removed log
            itemHtml += `<div class="progress-item ${isChecked ? 'completed' : ''}" title="Win ${i + 1} for ${escapeHtml(key)}">`;
            itemHtml += `<i class="${biIconPrefix}${isChecked ? 'check-square-fill' : 'square'}"></i>`;
            itemHtml += `</div>`;
        }
        itemHtml += `</div></div>`;
        return itemHtml;
    };

    const { normal: normalItems = {}, b2b: b2bItems = [] } = challengeStructure;

    if (Object.keys(normalItems).length > 0) {
        html += `<h6 class="section-title small text-info">Normal Wins:</h6>`;
        Object.entries(normalItems).sort((a, b) => String(a[0]).localeCompare(String(b[0])))
            .forEach(([key, info]) => {
                html += createRuleItemHtml(key, info?.count || 0, 'normal');
            });
    }

    if (b2bItems.length > 0) {
        if (html) html += '<hr class="my-2 opacity-25">';
        html += `<h6 class="section-title small text-warning">B2B Segments:</h6>`;
        b2bItems.forEach((seg, segIndex0Based) => { // Use 0-based for consistency with keys
            const displaySegmentIdx = segIndex0Based + 1;
            const { group: groupItems = {}, length: segmentLength = 0 } = seg || {};
            if (Object.keys(groupItems).length > 0) {
                html += `<div class="mb-3 ms-2"><strong class="small d-block text-white-50 mb-2">Segment ${displaySegmentIdx} (${segmentLength} wins):</strong>`;
                Object.entries(groupItems).sort((a, b) => String(a[0]).localeCompare(String(b[0])))
                    .forEach(([key, itemInfo]) => { // Changed 'count' to 'itemInfo'
                        // Assuming itemInfo could be an object like { count: X } or just X
                        const actualCount = (typeof itemInfo === 'object' && itemInfo !== null && itemInfo.hasOwnProperty('count')) ? itemInfo.count : itemInfo;
                        html += createRuleItemHtml(key, actualCount || 0, 'b2b', segIndex0Based);
                    });
                html += `</div>`;
            }
        });
    }

    if (!html) html = '<p class="loading-text small fst-italic text-white-50">No rules defined.</p>';
    container.innerHTML = html;
    startAutoScroll(container);
}

function renderOverlayProgressBar(barElement, labelElement, progressStats = {}) {
    if (!barElement || !labelElement) return;
    const percentage = progressStats.percentage !== undefined ? Math.max(0, Math.min(100, progressStats.percentage)) : 0;
    const completed = progressStats.completed !== undefined ? progressStats.completed : 0;
    const total = progressStats.total !== undefined ? progressStats.total : 0;

    barElement.style.width = `${percentage}%`;
    barElement.setAttribute('aria-valuenow', percentage);
    labelElement.textContent = `${percentage}% (${completed}/${total})`;
}

function renderOtherGroups(container, otherGroupsData = []) {
    if (!container) return;
    const groups = Array.isArray(otherGroupsData) ? otherGroupsData : [];

    if (groups.length === 0) {
        container.innerHTML = '<li class="small text-white-50 fst-italic">No other active groups.</li>'; // Use li for consistency if ul
        return;
    }

    groups.sort((a, b) => (b?.percentage ?? 0) - (a?.percentage ?? 0) || String(a?.name || '').localeCompare(String(b?.name || '')));

    container.innerHTML = groups.map(group => {
        const groupName = escapeHtml(group?.name || 'Unnamed Group');
        const percentage = Math.max(0, Math.min(100, parseInt(group?.percentage, 10) || 0));
        return `
            <li class="other-group-item small mb-2" data-group-id="${group?.id || ''}">
                <div class="d-flex justify-content-between align-items-center mb-1">
                    <span class="group-name text-truncate" title="${groupName}">${groupName}</span>
                    <span class="percentage fw-bold text-light">${percentage}%</span>
                </div>
                <div class="progress" style="height: 8px;">
                    <div class="progress-bar bg-info" role="progressbar" style="width: ${percentage}%;" 
                         aria-valuenow="${percentage}" aria-valuemin="0" aria-valuemax="100">
                    </div>
                </div>
            </li>`;
    }).join('');
}

function updateActivePenalty(container, textEl, fullPenaltyString) {
    if (!container || !textEl) return;
    
    const trimmedFullPenaltyString = fullPenaltyString?.trim();

    if (trimmedFullPenaltyString) {
        let player = "Participant"; // Default
        let penaltyName = trimmedFullPenaltyString; // Default to full string if parsing fails

        // Attempt to parse "Player receives penalty: Penalty Name (Description)"
        const parts = trimmedFullPenaltyString.split(" receives penalty: ");
        if (parts.length === 2) {
            player = parts[0].trim();
            const penaltyAndDesc = parts[1];
            const firstParen = penaltyAndDesc.indexOf(" (");
            if (firstParen !== -1) {
                penaltyName = penaltyAndDesc.substring(0, firstParen).trim();
                // Duration and timer starting from initial_state is complex without applied_at_utc and original duration.
                // For now, we just display the parsed name. Timer is handled by penalty_result event.
            } else {
                penaltyName = penaltyAndDesc.trim(); // No description/duration part
            }
        } else {
            // Simpler parsing if it's just "Penalty: Penalty Name"
            const penaltyPrefix = "Penalty: ";
            if (trimmedFullPenaltyString.startsWith(penaltyPrefix)) {
                penaltyName = trimmedFullPenaltyString.substring(penaltyPrefix.length).trim();
                // Player might not be specified in this format, stick to default or parse if available
            }
        }
        
        const displayText = `${escapeHtml(player)}: ${escapeHtml(penaltyName)}`;
        textEl.textContent = displayText;
        container.classList.remove('hidden');

        // Note: This function is called on initial_state and active_penalty_update.
        // Starting/stopping the timer accurately from these events (especially on reload)
        // would require more data from the backend (original duration, applied_at_utc).
        // The timer is primarily started correctly via the 'penalty_result' event.
        // If penaltyText is cleared (empty string), the 'else' block below handles timer stopping.

    } else { // Penalty cleared
        textEl.textContent = '';
        container.classList.add('hidden');
        stopOverlayPenaltyTimer(); 
        if (activePenaltyTimerEl) activePenaltyTimerEl.style.display = 'none';
    }
}


// --- Penalty Timer Functions for Overlay ---
function formatPenaltyTime(totalSeconds) {
    totalSeconds = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    return `${mm}:${ss}`;
}

function startOverlayPenaltyTimer(durationSeconds, displayElement, onExpiryCallback) {
    if (!displayElement) return;
    stopOverlayPenaltyTimer(); // Clear any existing timer

    let remainingSeconds = Math.max(0, durationSeconds);
    displayElement.textContent = formatPenaltyTime(remainingSeconds);
    displayElement.style.display = 'inline-block';

    penaltyTimerInterval = setInterval(() => {
        remainingSeconds--;
        if (remainingSeconds >= 0) {
            displayElement.textContent = formatPenaltyTime(remainingSeconds);
        } else {
            stopOverlayPenaltyTimer();
            displayElement.textContent = "00:00"; // Or "Expired"
            displayElement.style.display = 'none'; // Optionally hide after expiry
            if (typeof onExpiryCallback === 'function') {
                onExpiryCallback();
            }
        }
    }, 1000);
}

function stopOverlayPenaltyTimer() {
    if (penaltyTimerInterval) {
        clearInterval(penaltyTimerInterval);
        penaltyTimerInterval = null;
    }
}
// --- End Penalty Timer Functions ---


function setupWheels() {
    if (!playerWheelCanvas || !penaltyWheelCanvas || typeof Winwheel === 'undefined') {
        console.error("Cannot setup wheels: Missing canvases or Winwheel library.");
        penaltyWheelsContainer?.classList.add('hidden');
        return;
    }
    const baseAnim = { type: 'spinToStop', easing: 'Power4.easeOut' };
        const commonTextStyles = {
            textFontFamily: 'Inter, Arial, sans-serif', textFontSize: 11,
            textFontWeight: '500', textFillStyle: '#FFFFFF',
            textStrokeStyle: 'rgba(0,0,0,0.4)', textLineWidth: 0.5,
            textMargin: 8, textAlignment: 'center', textOrientation: 'horizontal'
        };
        // Removed redundant const baseAnim here

        try {
            if (playerWheel) playerWheel.clearCanvas();
        playerWheel = new Winwheel({
            canvasId: playerWheelCanvas.id, numSegments: 1,
            outerRadius: playerWheelCanvas.width / 2 - 5, innerRadius: 10,
            fillStyle: '#6c757d', lineWidth: 1, strokeStyle: '#343a40',
            animation: { ...baseAnim, duration: 3, spins: 5 }, // Shorter duration for player
            pointerGuide: { display: true, strokeStyle: '#ffc107', lineWidth: 2 },
            ...commonTextStyles
        }, false);

        if (penaltyWheel) penaltyWheel.clearCanvas();
        penaltyWheel = new Winwheel({
            canvasId: penaltyWheelCanvas.id, numSegments: 1,
            outerRadius: penaltyWheelCanvas.width / 2 - 5, innerRadius: 15,
            fillStyle: '#495057', lineWidth: 1, strokeStyle: '#343a40',
            animation: { ...baseAnim, duration: 5, spins: 8 }, // Standard duration
            pointerGuide: { display: true, strokeStyle: '#ffc107', lineWidth: 2 },
            pins: { number: 16, outerRadius: 3, fillStyle: '#adb5bd', strokeStyle: '#6c757d' },
            ...commonTextStyles
        }, false);

        if (timeWheel) timeWheel.clearCanvas();
        timeWheel = new Winwheel({ // Initialize timeWheel
            canvasId: timeWheelCanvas.id, numSegments: 1,
            outerRadius: timeWheelCanvas.width / 2 - 5, innerRadius: 12,
            fillStyle: '#343a40', lineWidth: 1, strokeStyle: '#212529',
            animation: { ...baseAnim, duration: 4, spins: 6 }, // Medium duration
            pointerGuide: { display: true, strokeStyle: '#ffc107', lineWidth: 2 },
            textFillStyle: '#dee2e6', // Lighter text for dark background
            ...commonTextStyles
        }, false);

    } catch (e) {
        console.error("Winwheel setup failed:", e);
        playerWheel = penaltyWheel = timeWheel = null;
        penaltyWheelsContainer?.classList.add('hidden');
    }
}


const TIME_SEGMENTS_DATA_OVERLAY = [ // Simplified for overlay, or use full if needed
    { text: "1 Min", seconds: 60, fillStyle: '#FFFACD' },
    { text: "3 Mins", seconds: 180, fillStyle: '#FFB6C1' },
    { text: "5 Mins", seconds: 300, fillStyle: '#ADD8E6' },
    { text: "10 Mins", seconds: 600, fillStyle: '#98FB98' },
    { text: "15 Mins", seconds: 900, fillStyle: '#FFDEAD' },
    { text: "20 Mins", seconds: 1200, fillStyle: '#DDA0DD' },
    { text: "25 Mins", seconds: 1500, fillStyle: '#B0E0E6' },
    { text: "30 Mins", seconds: 1800, fillStyle: '#FFA07A' }
];


function triggerPenaltySpinAnimation(data) {
    if (typeof Winwheel === 'undefined') {
        console.error("[Overlay Spin] Winwheel library not loaded.");
        penaltyWheelsContainer?.classList.add('hidden');
        return;
    }
    if (!playerWheel || !penaltyWheel || !timeWheel) {
        setupWheels();
        if (!playerWheel || !penaltyWheel || !timeWheel) {
            console.error("[Overlay Spin] Wheels not available after setup.");
            penaltyWheelsContainer?.classList.add('hidden');
            return;
        }
    }

    isSpinAnimationActive = true;

    [playerWheel, penaltyWheel, timeWheel].forEach(wheel => {
        if (wheel.tween) wheel.stopAnimation(false);
        wheel.rotationAngle = 0;
    });

    // Hide all wrappers initially, show main container
    if (penaltyResultDisplay) penaltyResultDisplay.classList.add('hidden'); // Ensure hidden at the very start
    penaltyWheelsContainer?.classList.remove('hidden');
    playerWheelWrapper?.classList.add('hidden');
    penaltyWheelWrapper?.classList.add('hidden');
    timeWheelWrapper?.classList.add('hidden');
    if (activePenaltyEl) activePenaltyEl.classList.add('hidden'); // Hide current active penalty display area during spin

    const eventResultContainer = data.result;
    if (!eventResultContainer || !eventResultContainer.result) {
        console.error("[Overlay Spin] Invalid penalty data received.");
        penaltyWheelsContainer?.classList.add('hidden');
        isSpinAnimationActive = false;
        return;
    }
    const actualPenaltyData = eventResultContainer.result;
    // console.log("[Overlay Spin] Full penalty data for animation:", JSON.parse(JSON.stringify(actualPenaltyData))); // Removed log

    const {
        player: chosenPlayerName, name: chosenPenaltyName, description: chosenPenaltyDescription,
        duration_seconds: chosenDurationSeconds, chosenTimeText,
        all_players: participants, playerWinningSegmentIndex, playerStopAngle,
        all_penalties_for_wheel: wheelSegmentPenaltiesData, penaltyWinningSegmentIndex, penaltyStopAngle,
        timeWinningSegmentIndex, timeStopAngle // Assuming these are now in actualPenaltyData
    } = actualPenaltyData;


    const finalDisplay = () => {
        // Hide all wheel wrappers first
        playerWheelWrapper?.classList.add('hidden');
        penaltyWheelWrapper?.classList.add('hidden');
        timeWheelWrapper?.classList.add('hidden');
        
        // Explicitly hide the temporary result display box
        if (penaltyResultDisplay) {
            penaltyResultDisplay.classList.add('hidden');
        }

        // Display final result without duration in parentheses for the main text
        const resultTextOnlyName = `${escapeHtml(chosenPlayerName)}: ${escapeHtml(chosenPenaltyName)}`;

        if (activePenaltyTextEl && activePenaltyEl) {
            activePenaltyTextEl.textContent = resultTextOnlyName; // Main display shows only name
            activePenaltyEl.classList.remove('hidden'); // Now show the main penalty line
        }

        // Start the penalty countdown timer if duration is present
        if (chosenDurationSeconds > 0 && activePenaltyTimerEl) {
            startOverlayPenaltyTimer(chosenDurationSeconds, activePenaltyTimerEl, () => {
                // Optional: Callback when timer expires on overlay
                if (activePenaltyTimerEl) activePenaltyTimerEl.textContent = "Done!";
                // Consider hiding or changing style after expiry
            });
        } else if (activePenaltyTimerEl) {
            activePenaltyTimerEl.style.display = 'none'; // Hide if no duration
        }
        
        isSpinAnimationActive = false;
        setTimeout(() => {
            penaltyWheelsContainer?.classList.add('hidden');
            if (penaltyResultDisplay) penaltyResultDisplay.classList.add('hidden'); // Ensure this is also hidden
            // activePenaltyEl and activePenaltyTimerEl remain visible as per their state
        }, WHEEL_HIDE_DELAY + 2000);
    };

    const startTimeWheelSpin = () => {
        penaltyWheelWrapper?.classList.add('hidden');
        if (penaltyResultDisplay) penaltyResultDisplay.classList.add('hidden'); 
        document.getElementById('penalty-wheel-title-overlay').textContent = `Penalty: ${escapeHtml(chosenPenaltyName)}`; 

        if (chosenPenaltyName && chosenPenaltyName.toLowerCase() !== "no penalty" && timeStopAngle !== undefined) {
            timeWheelWrapper?.classList.remove('hidden');
            document.getElementById('time-wheel-title-overlay').textContent = "Spinning for Duration...";
            try {
                const timeSegments = createSegments(TIME_SEGMENTS_DATA_OVERLAY.map(t => t.text), TIME_SEGMENTS_DATA_OVERLAY.map(t => t.fillStyle));
                timeWheel.clearCanvas(); timeWheel.numSegments = 0; timeWheel.segments = [];
                timeSegments.forEach(seg => timeWheel.addSegment(seg));
                if (timeWheel.numSegments === 0) throw new Error("Time wheel has no segments.");
                
                timeWheel.animation.stopAngle = timeStopAngle;
                timeWheel.animation.callbackFinished = () => {
                    document.getElementById('time-wheel-title-overlay').textContent = `Duration: ${escapeHtml(chosenTimeText)}`;
                    finalDisplay();
                };
                timeWheel.draw();
                timeWheel.startAnimation();
            } catch (e) { console.error("[Overlay Spin] Time wheel error:", e); finalDisplay(); }
        } else {
            finalDisplay(); // No penalty or no time wheel needed
        }
    };

    const startPenaltyWheelSpin = () => {
        playerWheelWrapper?.classList.add('hidden');
        if (penaltyResultDisplay) penaltyResultDisplay.classList.add('hidden'); 
        if (participants && participants.length > 1) {
             document.getElementById('player-wheel-title-overlay').textContent = `Player: ${escapeHtml(chosenPlayerName)}`; 
        }

        if (chosenPenaltyName && chosenPenaltyName.toLowerCase() !== "no penalty" && penaltyStopAngle !== undefined && wheelSegmentPenaltiesData && wheelSegmentPenaltiesData.length > 0) {
            penaltyWheelWrapper?.classList.remove('hidden');
            document.getElementById('penalty-wheel-title-overlay').textContent = "Spinning for Penalty...";
            try {
                const penaltyColors = ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#a65628', '#f781bf', '#999999'].sort(() => 0.5 - Math.random());
                const penaltySegments = createSegments(wheelSegmentPenaltiesData.map(p => p.name || '?'), penaltyColors);
                
                penaltyWheel.clearCanvas(); penaltyWheel.numSegments = 0; penaltyWheel.segments = [];
                penaltySegments.forEach(seg => penaltyWheel.addSegment(seg));
                if (penaltyWheel.numSegments === 0) throw new Error("Penalty wheel has no segments.");

                penaltyWheel.animation.stopAngle = penaltyStopAngle;
                penaltyWheel.animation.callbackFinished = startTimeWheelSpin;
                penaltyWheel.draw();
                penaltyWheel.startAnimation();
            } catch (e) { console.error("[Overlay Spin] Penalty wheel error:", e); startTimeWheelSpin(); }
        } else {
            startTimeWheelSpin(); // No penalty to spin for, or "No Penalty"
        }
    };

    if (participants && participants.length > 1 && playerStopAngle !== undefined) {
        playerWheelWrapper?.classList.remove('hidden');
        document.getElementById('player-wheel-title-overlay').textContent = "Spinning for Player...";
        try {
            const playerColors = ['#8dd3c7', '#ffffb3', '#bebada', '#fb8072', '#80b1d3', '#fdb462', '#b3de69', '#fccde5'].sort(() => 0.5 - Math.random());
            const playerSegments = createSegments(participants, playerColors);

            playerWheel.clearCanvas(); playerWheel.numSegments = 0; playerWheel.segments = [];
            playerSegments.forEach(seg => playerWheel.addSegment(seg));
            if (playerWheel.numSegments === 0) throw new Error("Player wheel has no segments.");

            playerWheel.animation.stopAngle = playerStopAngle;
            playerWheel.animation.callbackFinished = startPenaltyWheelSpin;
            playerWheel.draw();
            playerWheel.startAnimation();
        } catch (e) { console.error("[Overlay Spin] Player wheel error:", e); startPenaltyWheelSpin(); }
    } else {
        startPenaltyWheelSpin(); // Skip player wheel
    }
}

// --- Auto-Scrolling Functions ---
function startAutoScroll(element) {
    if (!element) return;
    stopAutoScroll(); // Clear existing interval first
    isPausedAtEdge = false;

    requestAnimationFrame(() => {
        if (element.scrollHeight <= element.clientHeight) {
            // console.debug(`[Scroll] Auto-scroll not needed for: ${element.id}`);
            element.scrollTop = 0;
            return;
        }
        element.scrollTop = 0;
        scrollDirection = 1;
        // console.debug(`[Scroll] Starting auto-scroll for: ${element.id}`);
        scrollInterval = setInterval(() => {
            if (isPausedAtEdge || isHoveringScroll) return;
            const { scrollTop, scrollHeight, clientHeight } = element;
            const maxScroll = scrollHeight - clientHeight;
            if (scrollDirection === 1 && scrollTop >= maxScroll - AUTO_SCROLL_STEP) {
                element.scrollTop = maxScroll; scrollDirection = -1; isPausedAtEdge = true;
                setTimeout(() => { isPausedAtEdge = false; }, AUTO_SCROLL_PAUSE);
            } else if (scrollDirection === -1 && scrollTop <= AUTO_SCROLL_STEP) {
                element.scrollTop = 0; scrollDirection = 1; isPausedAtEdge = true;
                setTimeout(() => { isPausedAtEdge = false; }, AUTO_SCROLL_PAUSE);
            } else {
                element.scrollTop += scrollDirection * AUTO_SCROLL_STEP;
            }
        }, AUTO_SCROLL_DELAY);
    });
}

function stopAutoScroll() {
    if (scrollInterval !== null) {
        clearInterval(scrollInterval);
        scrollInterval = null;
    }
}

// --- WebSocket Connection & Event Handling ---
function connectWebSocket() {
    if (socket && socket.connected) {
        // console.debug("[OverlayWS] Already connected. Disconnecting first for fresh setup.");
        socket.disconnect();
    }
    if (!apiKey || !challengeId) {
        updateStatus('Missing API Key or Challenge ID.', 'error');
        return;
    }

    updateStatus('Connecting...', 'connecting');
    // console.debug(`[OverlayWS] Attempting connection. Key: ${apiKey ? 'Set' : 'Not Set'}, Challenge: ${challengeId}`);

    try {
        socket = io(window.location.origin, {
            path: SOCKET_PATH,
            query: { apiKey: apiKey, challengeId: challengeId },
            reconnectionAttempts: 5,
            reconnectionDelay: RECONNECT_DELAY,
            transports: ['websocket'] // Prefer websocket
        });

        socket.on('connect', () => {
            updateStatus('Connected', 'connected');
            console.info('[OverlayWS] Connected. SID:', socket.id);
            if (challengeId) { // Ensure challengeId is available
                socket.emit('join_challenge_room', { challenge_id: challengeId });
            }
        });

        socket.on('disconnect', (reason) => {
            updateStatus(`Disconnected: ${reason}`, 'error');
            console.warn('[OverlayWS] Disconnected:', reason);
            stopAutoScroll();
        });

        socket.on('connect_error', (error) => {
            updateStatus(`Connection Error: ${error.message}`, 'error');
            console.error('[OverlayWS] Connection error:', error);
            stopAutoScroll();
            if (error.message.includes('Invalid API Key') || error.message.includes('Not authorized')) {
                socket.disconnect(); // Prevent further attempts if auth fails
            }
        });

        socket.on('auth_error', (data) => {
            updateStatus(`Auth Error: ${data.message}`, 'error');
            console.error('[OverlayWS] Authentication error:', data.message);
            socket.disconnect();
            stopAutoScroll();
        });
        
        socket.on('room_joined', (data) => { /* console.debug(`[OverlayWS] Joined room: ${data.room}`); */ });
        socket.on('room_join_error', (data) => { console.error(`[OverlayWS] Error joining room: ${data.error}`); });

        // Timer events
        socket.on('timer_started', (data) => {
            if (data.challenge_id !== challengeId) return;
            // console.log('[OverlayWS] Received timer_started:', JSON.parse(JSON.stringify(data))); // Removed log
            // Ensure all necessary fields are updated, especially current_value_seconds if provided
            overlayServerTimerData = { 
                ...overlayServerTimerData, // Keep existing values like lastStartedAtUTC if not in data
                currentValueSeconds: data.current_value_seconds !== undefined ? parseInt(data.current_value_seconds, 10) : overlayServerTimerData.currentValueSeconds,
                lastStartedAtUTC: data.last_started_at_utc || overlayServerTimerData.lastStartedAtUTC, // Use new if available
                isRunning: true 
            };
            manageOverlayDisplayInterval();
        });
        socket.on('timer_stopped', (data) => {
            if (data.challenge_id !== challengeId) return;
            // console.log('[OverlayWS] Received timer_stopped:', JSON.parse(JSON.stringify(data))); // Removed log
            overlayServerTimerData = { 
                ...overlayServerTimerData, 
                currentValueSeconds: data.current_value_seconds !== undefined ? parseInt(data.current_value_seconds, 10) : overlayServerTimerData.currentValueSeconds, // Crucial: update to the time it was stopped
                isRunning: false, 
                lastStartedAtUTC: null 
            };
            manageOverlayDisplayInterval();
        });
        socket.on('timer_reset', (data) => {
            if (data.challenge_id !== challengeId) return;
            // console.log('[OverlayWS] Received timer_reset:', JSON.parse(JSON.stringify(data))); // Removed log
            overlayServerTimerData = { 
                currentValueSeconds: 0, 
                isRunning: false, 
                lastStartedAtUTC: null 
            };
            manageOverlayDisplayInterval();
        });

        // Main state and updates
        socket.on('initial_state', (data) => {
            // console.debug('[OverlayWS] Received initial_state:', data);
            try {
                if (!data || !data.challenge_structure || data.challenge_id !== challengeId) {
                    console.warn("[OverlayWS] Invalid or mismatched initial_state data received.");
                    return;
                }
                currentChallengeStructure = data.challenge_structure;
                streamerGroupId = data.user_group?.id;

                if (challengeTitleEl) challengeTitleEl.textContent = data.challenge_name || 'Challenge Overlay';
                
                // Update timer state from initial_state
                if (data.timer_state) {
                    overlayServerTimerData = { // Ensure all fields are present
                        currentValueSeconds: parseInt(data.timer_state.current_value_seconds, 10) || 0,
                        isRunning: data.timer_state.is_running === true || String(data.timer_state.is_running).toLowerCase() === 'true',
                        lastStartedAtUTC: data.timer_state.last_started_at_utc || null
                    };
                    manageOverlayDisplayInterval(); // Manage interval based on this state
                }


                const streamerGroup = data.user_group;
                if (streamerGroup) {
                    if (rulesListEl) renderOverlayRules(rulesListEl, currentChallengeStructure, streamerGroup.progress_data);
                    if (streamerProgressBar && streamerProgressLabel) renderOverlayProgressBar(streamerProgressBar, streamerProgressLabel, streamerGroup.progress_stats);
                    if (activePenaltyEl && activePenaltyTextEl) updateActivePenalty(activePenaltyEl, activePenaltyTextEl, streamerGroup.active_penalty_text);
                } else {
                    if (rulesListEl) renderOverlayRules(rulesListEl, currentChallengeStructure, {});
                    if (streamerProgressBar && streamerProgressLabel) renderOverlayProgressBar(streamerProgressBar, streamerProgressLabel, { completed: 0, total: 0, percentage: 0 });
                    if (activePenaltyEl && activePenaltyTextEl) updateActivePenalty(activePenaltyEl, activePenaltyTextEl, null);
                    // console.warn("[OverlayWS] Initial state: User not in a group.");
                    stopAutoScroll();
                }
                if (otherGroupsListEl) renderOtherGroups(otherGroupsListEl, data.other_groups_progress);
                if (data.penalty_info && playerWheelCanvas && penaltyWheelCanvas && typeof Winwheel !== 'undefined') { setupWheels(); }
                else { penaltyWheelsContainer?.classList.add('hidden'); }
            } catch (error) {
                console.error("[OverlayWS] Error processing initial_state:", error);
                updateStatus(`Error processing initial data: ${error.message}`, 'error');
                stopAutoScroll();
            }
        });

        socket.on('progress_update', (data) => {
            // console.debug('[OverlayWS] Received progress_update:', data);
            try {
                if (!data || data.challenge_id !== challengeId || !currentChallengeStructure) return;
                if (data.group_id === streamerGroupId) {
                    if (streamerProgressBar && streamerProgressLabel && data.progress_stats) {
                        renderOverlayProgressBar(streamerProgressBar, streamerProgressLabel, data.progress_stats);
                    }
                    if (rulesListEl && data.progress_data) {
                        // console.log("[OverlayWS progress_update] Received progress_data for streamer's group:", JSON.parse(JSON.stringify(data.progress_data))); // Removed log
                        renderOverlayRules(rulesListEl, currentChallengeStructure, data.progress_data);
                    }
                }
                if (otherGroupsListEl && data.other_groups_progress) { // other_groups_progress could be an array
                    renderOtherGroups(otherGroupsListEl, data.other_groups_progress);
                }
            } catch (error) { console.error("[OverlayWS] Error processing progress_update:", error); }
        });

        socket.on('active_penalty_update', (data) => {
        // console.debug('[OverlayWS] Received active_penalty_update:', data);
        try {
            if (!data || data.challenge_id !== challengeId || data.group_id === undefined) return;

            if (data.group_id === streamerGroupId) {
                if (isSpinAnimationActive) {
                    // If a spin animation is happening (triggered by 'penalty_result'),
                    // we might want to show an intermediate message or nothing,
                    // because the final result will be displayed by triggerPenaltySpinAnimation's callback.
                    // For example, show "Spinning..." if the text indicates a choice is being made.
                    if (data.penalty_text && data.penalty_text.toLowerCase().includes("choosing")) {
                        if (activePenaltyEl && activePenaltyTextEl) {
                            updateActivePenalty(activePenaltyEl, activePenaltyTextEl, data.penalty_text);
                        }
                    } else {
                        // A spin is active, and this is likely the final result text.
                        // Let triggerPenaltySpinAnimation handle displaying it after the spin.
                        // console.debug("[OverlayWS] Spin animation active, deferring display of final penalty text from 'active_penalty_update'.");
                    }
                } else {
                    // No spin animation active, so display the text from active_penalty_update directly.
                    // This handles cases where penalty is set without a wheel spin, or to clear the penalty.
                    if (activePenaltyEl && activePenaltyTextEl) {
                        updateActivePenalty(activePenaltyEl, activePenaltyTextEl, data.penalty_text);
                    }
                }
            }
        } catch (error) { console.error("[OverlayWS] Error processing active_penalty_update:", error); }
    });


        socket.on('penalty_result', (data) => {
            // console.debug('[OverlayWS] Received penalty_result:', data);
            try {
                if (!data || data.challenge_id !== challengeId || !data.result) return;
                if (data.group_id === streamerGroupId && typeof Winwheel !== 'undefined') {
                    triggerPenaltySpinAnimation(data);
                }
            } catch (error) { console.error("[OverlayWS] Error processing penalty_result:", error); }
        });

    } catch (err) {
        console.error("[OverlayWS] Socket.IO client instantiation failed:", err);
        updateStatus('Connection setup failed.', 'error');
    }
}

// --- DOMContentLoaded Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // console.debug("Overlay DOM loaded.");

    const urlParams = new URLSearchParams(window.location.search);
    apiKey = urlParams.get('key');
    const pathSegments = window.location.pathname.split('/');
    challengeId = pathSegments.length > 1 ? pathSegments[pathSegments.length - 1] : null; // Ensure challengeId is extracted

    // console.debug(`Parsed - Challenge ID: ${challengeId}, API Key: ${apiKey ? 'Set' : 'MISSING'}`);

    if (!challengeId || !apiKey) {
        updateStatus('Missing Challenge ID or API Key in URL.', 'error');
        console.error("Overlay URL must be in the format /overlay/{challenge_id}?key={api_key}");
        const overlayContainer = document.getElementById('overlay-container');
        if (overlayContainer) {
            overlayContainer.innerHTML = '<div class="alert alert-danger m-3 small">Config Error: Invalid Overlay URL. Check link.</div>';
        }
        return;
    }

    if (rulesListEl) {
        rulesListEl.addEventListener('mouseenter', () => { if (scrollInterval) isHoveringScroll = true; });
        rulesListEl.addEventListener('mouseleave', () => { if (isHoveringScroll) isHoveringScroll = false; });
    }

    connectWebSocket();
});
