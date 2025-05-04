// static/js/overlay.js

// --- Configuration ---
const RECONNECT_DELAY = 5000; // ms
const SOCKET_PATH = '/socket.io'; // Default Socket.IO path
const AUTO_SCROLL_DELAY = 45; // Milliseconds between scroll steps
const AUTO_SCROLL_STEP = 1; // Pixels to scroll each step
const AUTO_SCROLL_PAUSE = 3500; // Pause at top/bottom (ms)
const WHEEL_HIDE_DELAY = 1500;
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
const penaltyWheelsContainer = document.getElementById('penalty-wheels-container');
const playerWheelCanvas = document.getElementById('playerWheelCanvas-overlay');
const penaltyWheelCanvas = document.getElementById('penaltyWheelCanvas-overlay');
const penaltyResultDisplay = document.getElementById('penalty-result-display');
const playerWheelWrapper = document.getElementById('player-wheel-wrapper');
const penaltyWheelWrapper = document.getElementById('penalty-wheel-wrapper');

// --- State Variables ---
let socket = null;
let challengeId = null;
let apiKey = null;
let playerWheel = null;
let penaltyWheel = null;
let currentChallengeStructure = null;
let streamerGroupId = null;
let scrollInterval = null;
let scrollDirection = 1;
let isPausedAtEdge = false;
let isHoveringScroll = false;

// --- Helper Functions ---
function updateStatus(message, type = 'error') {
    console.log(`Overlay Status (${type}): ${message}`);
    if (!statusIndicator || !statusMessage || !statusIcon) return;
    statusMessage.textContent = message;
    statusIndicator.classList.remove('hidden', 'connected', 'connecting', 'error');
    if (type === 'error') { statusIcon.innerHTML = '<i class="bi bi-exclamation-triangle-fill text-danger"></i>'; statusIndicator.classList.add('error'); }
    else if (type === 'connecting') { statusIcon.innerHTML = '<div class="spinner-border spinner-border-sm text-light" role="status"><span class="visually-hidden">Loading...</span></div>'; statusIndicator.classList.add('connecting'); }
    else if (type === 'connected') { statusIcon.innerHTML = '<i class="bi bi-check-circle-fill text-success"></i>'; statusIndicator.classList.add('connected'); setTimeout(() => { statusIndicator.classList.add('hidden'); }, 3000); }
    else { statusIndicator.classList.add('hidden'); return; }
    statusIndicator.classList.remove('hidden');
}

function escapeHtml(str) {
    if (typeof str !== 'string') return String(str);
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return str.replace(/[&<>"']/g, m => map[m]);
}

// --- Rendering Functions ---
function renderOverlayRules(container, challengeStructure, groupProgressData) {
    if (!container) { console.error("Rules container not found"); return; }
    if (!challengeStructure || (!challengeStructure.normal && !challengeStructure.b2b)) {
        container.innerHTML = '<p class="loading-text small fst-italic text-white-50">No rules defined.</p>';
        stopAutoScroll(); // Stop scroll if no rules
        return;
    }
    if (!groupProgressData) groupProgressData = {};

    container.innerHTML = ''; // Clear loading/previous
    let html = '';
    const bi_icon_prefix = 'bi bi-';

    // Helper to create list item HTML - NOW includes a wrapper for markers
    const createRuleItemHtml = (key, count, completedCount, itemType, segmentIndex = null) => {
        let itemHtml = `<div class="progress-category mb-2">`; // Container for one rule type
        // Rule Text Label
        itemHtml += `<div class="rule-label mb-1">`;
        itemHtml += `<i class="${bi_icon_prefix}joystick me-2 opacity-75"></i>`; // Generic icon
        itemHtml += `<span class="rule-text fw-semibold">${escapeHtml(key)}</span>`;
        itemHtml += `<span class="badge bg-secondary rounded-pill fw-normal ms-2">${count} needed</span>`;
        itemHtml += `</div>`;

        // Container for Checkboxes (Markers) - Apply flex wrap via CSS to this class
        itemHtml += `<div class="overlay-progress-markers">`;
        for (let i = 0; i < count; i++) {
            // Construct progress key based on type and index
            const progressKey = segmentIndex !== null
                ? `${itemType}_${segmentIndex}_${key}_${i}`
                : `${itemType}_${key}_${i}`;
            const isChecked = groupProgressData[progressKey] === true;

            // Individual checkbox item (no d-inline-block needed)
            itemHtml += `<div class="progress-item ${isChecked ? 'completed' : ''}" title="Win ${i + 1} for ${escapeHtml(key)}">`;
            itemHtml += `<i class="${bi_icon_prefix}${isChecked ? 'check-square-fill' : 'square'}"></i>`;
            itemHtml += `</div>`; // Close progress-item
        }
        itemHtml += `</div>`; // Close overlay-progress-markers
        itemHtml += `</div>`; // Close progress-category
        return itemHtml;
    };

    // --- Render Normal Wins ---
    const normalItems = challengeStructure.normal || {};
    if (Object.keys(normalItems).length > 0) {
        html += `<h6 class="section-title small text-info">Normal Wins:</h6>`;
        Object.entries(normalItems).sort((a, b) => String(a[0]).localeCompare(String(b[0]))).forEach(([key, info]) => {
            const count = info?.count || 0;
            let completedCount = 0;
            for (let i = 0; i < count; i++) {
                if (groupProgressData[`normal_${key}_${i}`] === true) completedCount++;
            }
            // Pass 'normal' as itemType
            html += createRuleItemHtml(key, count, completedCount, 'normal');
        });
    }

    // --- Render B2B Wins ---
    const b2bItems = challengeStructure.b2b || [];
    if (b2bItems.length > 0) {
        if (html) html += '<hr class="my-2 opacity-25">';
        html += `<h6 class="section-title small text-warning">B2B Segments:</h6>`;
        b2bItems.forEach((seg, segIndex) => {
            const displaySegmentIdx = segIndex + 1;
            const groupItems = seg?.group || {};
            if (Object.keys(groupItems).length > 0) {
                html += `<div class="mb-3 ms-2"><strong class="small d-block text-white-50 mb-2">Segment ${displaySegmentIdx}:</strong>`; // Segment title
                Object.entries(groupItems).sort((a, b) => String(a[0]).localeCompare(String(b[0]))).forEach(([key, count]) => {
                    let completedCount = 0;
                    for (let i = 0; i < count; i++) {
                        // Use 0-based segIndex for key matching backend/main.js
                        if (groupProgressData[`b2b_${segIndex}_${key}_${i}`] === true) completedCount++;
                    }
                    // Pass 'b2b' as itemType and segIndex
                    html += createRuleItemHtml(key, count, completedCount, 'b2b', segIndex);
                });
                html += `</div>`; // Close segment container
            }
        });
    }

    if (!html) html = '<p class="loading-text small fst-italic text-white-50">No rules defined.</p>';
    container.innerHTML = html;

    // Restart scrolling after content update
    startAutoScroll(container);
}

// ... (renderOverlayProgressBar, renderOtherGroups, updateActivePenalty remain the same) ...
function renderOverlayProgressBar(barElement, labelElement, progressStats) {
    if (!barElement || !labelElement || !progressStats) {
        console.warn("Missing elements or data for progress bar render");
        return;
    }
    const percentage = progressStats.percentage !== undefined ? progressStats.percentage : 0;
    const completed = progressStats.completed !== undefined ? progressStats.completed : 0;
    const total = progressStats.total !== undefined ? progressStats.total : 0;

    barElement.style.width = `${percentage}%`;
    barElement.setAttribute('aria-valuenow', percentage);
    labelElement.textContent = `${percentage}% (${completed}/${total})`;
}

function renderOtherGroups(container, otherGroupsData) {
    console.log("Container:", container);
    console.log("Data:", otherGroupsData);

    if (!container) {
        console.error("Container is null or undefined");
        return;
    }

    const groups = Array.isArray(otherGroupsData) ? otherGroupsData : [];
    console.log("Processed groups:", groups);

    if (groups.length === 0) {
        console.log("No groups to display");
        container.innerHTML = '<p>No groups to display</p>';
        return;
    }

    // Sort by percentage descending, then name ascending
    groups.sort((a, b) => {
        const percentA = a?.percentage ?? 0;
        const percentB = b?.percentage ?? 0;
        if (percentB !== percentA) {
            return percentB - percentA;
        }
        return String(a?.name || '').localeCompare(String(b?.name || ''));
    });

    let listHtml = '';
    groups.forEach(group => {
        const groupId = group?.id;
        const groupName = escapeHtml(group?.name || 'Unnamed Group');
        let percentage = parseInt(group?.percentage, 10);
        if (isNaN(percentage) || percentage < 0) percentage = 0;
        else if (percentage > 100) percentage = 100;

        // --- Generate NEW list item HTML - Matching "Your Progress" Structure ---
        listHtml += `
  <li class="other-group-item small mb-2" data-group-id="${groupId || ''}">
    <div class="d-flex justify-content-between align-items-center mb-1">
      <span class="group-name text-truncate" title="${groupName}">${groupName}</span>
      <span class="percentage fw-bold text-light">${percentage}%</span>
    </div>
    <div class="progress" style="height: 10px; width: 100%; max-width: 100%; overflow: hidden;">
      <div class="progress-bar bg-info progress-bar-striped progress-bar-animated" 
           role="progressbar" 
           style="width: ${percentage}%; overflow: hidden;" 
           aria-valuenow="${percentage}" 
           aria-valuemin="0" 
           aria-valuemax="100">
      </div>
    </div>
  </li>`;
    });

    container.innerHTML = listHtml;
    console.log("Progress bars in DOM:", container.querySelectorAll('.progress-bar').length);
    console.log("First progress bar:", container.querySelector('.progress-bar'));
}

function updateActivePenalty(container, textEl, penaltyText) {
    if (!container || !textEl) { console.error("Active penalty elements not found"); return; }
    const textToShow = penaltyText?.trim();
    if (textToShow) {
        textEl.textContent = textToShow;
        // Optionally add icon based on content?
        container.classList.remove('hidden');
    } else {
        textEl.textContent = '';
        container.classList.add('hidden');
    }
}

// static/js/overlay.js

// ... (imports, config, DOM refs, helpers like updateStatus, escapeHtml, createSegments remain the same) ...

// --- Make sure setupWheels is defined correctly (it looked fine before) ---
function setupWheels() {
    if (!playerWheelCanvas || !penaltyWheelCanvas) {
        console.error("Cannot setup wheels, missing canvases.");
        return;
    }
    const baseAnim = { type: 'spinToStop', easing: 'Power4.easeOut' };

    // --- NEW: Define common text styles ---
    const commonTextStyles = {
        textFontFamily: 'Inter, Arial, sans-serif', // Use Inter first, fallback to Arial
        textFontSize: 12, // << INCREASED slightly more (Adjust 14-16 based on your wheel size/text length)
        textFontWeight: '600', // Semi-bold is usually good
        textFillStyle: '#FFFFFF', // White text for contrast
        textStrokeStyle: 'rgba(0, 0, 0, 0.5)', // << CHANGED to semi-transparent BLACK stroke
        textLineWidth: 0.2, // << REDUCED stroke width for subtlety
        textMargin: 10, // << INCREASED margin slightly (adjust based on visual preference)
        textAlignment: 'center',
        textOrientation: 'horizontal'
    };
    // --- END NEW ---

    try {
        // Player Wheel Instance (using common styles)
        playerWheel = new Winwheel({
            canvasId: playerWheelCanvas.id,
            numSegments: 1,
        
            outerRadius: 150, // Initial - Update based on canvas size later
            innerRadius: 10,
            
            fillStyle: '#666', // Default segment fill if not specified
            lineWidth: 1,
            strokeStyle: '#444',
            animation: { ...baseAnim },
            pointerGuide: { display: true, strokeStyle: '#ffc107', lineWidth: 3 },
            // --- Apply common text styles ---
            ...commonTextStyles
            // --- END Apply ---
        }, false);

        // Penalty Wheel Instance (using common styles)
        penaltyWheel = new Winwheel({
            canvasId: penaltyWheelCanvas.id,
            numSegments: 1,
           
            outerRadius: 150, // Initial - Update based on canvas size later
            innerRadius: 15,
         
            fillStyle: '#555',
            lineWidth: 1,
            strokeStyle: '#444',
            animation: { ...baseAnim },
            pointerGuide: { display: true, strokeStyle: '#ffc107', lineWidth: 3 },
            pins: { number: 16, outerRadius: 3, fillStyle: '#cccccc', strokeStyle: '#666666' },
            // --- Apply common text styles ---
            ...commonTextStyles
            // --- END Apply ---
        }, false);

        console.log("Fresh wheels initialized by setupWheels with updated text styles.");

    } catch (e) {
        console.error("Wheel setup failed:", e);
        playerWheel = null;
        penaltyWheel = null;
        penaltyWheelsContainer?.classList.add('hidden');
    }
}


function triggerPenaltySpinAnimation(resultData) {
    console.log("[Overlay Spin] Triggering penalty spin animation");

    // --- FIX: Safely stop existing animations ---
    // Check if the wheel instance exists AND if its internal tween likely exists
    // (Winwheel library uses 'tween' property for the GSAP animation object)
    if (playerWheel && playerWheel.tween) {
        console.log("[Overlay Spin] Stopping existing player wheel animation.");
        try {
            playerWheel.stopAnimation(false); // Call stopAnimation only if tween exists
        } catch (e) {
            console.error("[Overlay Spin] Error calling playerWheel.stopAnimation:", e);
            // Reset manually if stop fails
            playerWheel.rotationAngle = playerWheel.animation?.stopAngle ?? 0; // Go to stop angle if possible
            playerWheel.tween = null; // Clear tween reference
            playerWheel.draw();
        }
    }
    if (penaltyWheel && penaltyWheel.tween) {
        console.log("[Overlay Spin] Stopping existing penalty wheel animation.");
         try {
            penaltyWheel.stopAnimation(false);
        } catch (e) {
            console.error("[Overlay Spin] Error calling penaltyWheel.stopAnimation:", e);
            penaltyWheel.rotationAngle = penaltyWheel.animation?.stopAngle ?? 0;
            penaltyWheel.tween = null;
            penaltyWheel.draw();
        }
    }
    // --- END FIX ---

    // Ensure wheel instances exist, setup if needed
    if (!playerWheel || !penaltyWheel) {
        console.log("[Overlay Spin] Wheels not initialized or cleared, setting up fresh...");
        setupWheels();
        if (!playerWheel || !penaltyWheel) {
            console.error("[Overlay Spin] Cannot trigger spin: Fresh wheel instances failed to initialize after setup.");
            penaltyWheelsContainer?.classList.add('hidden');
            return;
        }
    } else {
         // Reset rotation angle for existing wheels if they weren't recreated
         console.log("[Overlay Spin] Resetting rotation angle for existing wheels.");
         playerWheel.rotationAngle = 0;
         penaltyWheel.rotationAngle = 0;
         // Optionally redraw them in their base state immediately?
         // playerWheel.draw();
         // penaltyWheel.draw();
    }


    // Hide result display initially
    if (penaltyResultDisplay) {
        penaltyResultDisplay.textContent = '';
        penaltyResultDisplay.style.display = 'none';
    }

    // Show relevant containers
    penaltyWheelsContainer?.classList.remove('hidden');
    playerWheelWrapper?.classList.remove('hidden');
    penaltyWheelWrapper?.classList.add('hidden');

    // Get data from payload
    const penaltyResult = resultData.result;
    const allPlayers = penaltyResult.all_players || [];
    const allPenalties = penaltyResult.all_penalties || [];

    // --- Define Penalty Wheel Spin Logic ---
    const startPenaltyWheelSpin = () => {
        console.log("[Overlay Spin] Player wheel finished. Starting penalty wheel phase.");
        setTimeout(() => {
            playerWheelWrapper?.classList.add('hidden');
            console.log("[Overlay Spin] Player wheel hidden.");

            if (penaltyResult.name !== "No Penalty" && penaltyResult.stopAngle !== undefined) {
                penaltyWheelWrapper?.classList.remove('hidden');

                try {
                    console.log("[Overlay Spin] Configuring Penalty Wheel...");
                    const penaltyColors = ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#a65628', '#f781bf', '#999999'];
                    const penaltyNames = allPenalties.map(p => p.name || '?');
                    const penaltySegmentsData = createSegments(penaltyNames, penaltyColors);

                    if (penaltySegmentsData.length > 0) {
                        penaltyWheel.numSegments = 0;
                        penaltyWheel.segments = [];
                        penaltyWheel.animation.callbackFinished = null;

                        penaltySegmentsData.forEach(segmentData => penaltyWheel.addSegment(segmentData));
                        console.log(`[Overlay Spin] Penalty segments added. Final numSegments: ${penaltyWheel.numSegments}`);

                        let actualWinningIndex = -1;
                        for (let i = 1; i <= penaltyWheel.numSegments; i++) {
                            if (penaltyWheel.segments[i]?.text === penaltyResult.name) {
                                actualWinningIndex = i; break;
                            }
                        }

                        if (actualWinningIndex > 0) {
                            penaltyWheel.animation.callbackFinished = () => {
                                console.log("[Overlay Spin] Penalty animation finished.");
                                let indicatedSegment = penaltyWheel.getIndicatedSegment();
                                console.log("[Overlay Spin] Penalty wheel landed on:", indicatedSegment);

                                // Hide the entire wheels container after delay
                                setTimeout(() => {
                                    playerWheelWrapper?.classList.add('hidden');
                                    penaltyWheelWrapper?.classList.add('hidden');
                                    penaltyWheelsContainer?.classList.add('hidden');
                                    console.log("[Overlay Spin] Penalty wheels container hidden after delay.");
                                }, WHEEL_HIDE_DELAY);
                            };

                            penaltyWheel.animation.spins = 10;
                            penaltyWheel.animation.duration = 8;
                            penaltyWheel.animation.stopAngle = penaltyResult.stopAngle;

                            penaltyWheel.draw();
                            penaltyWheel.startAnimation();
                            console.log(`[Overlay Spin] Penalty wheel spinning to: ${penaltyResult.stopAngle}`);

                        } else { throw new Error("Winning penalty segment mismatch after configuration."); }
                    } else { throw new Error("Cannot create penalty wheel segments."); }
                } catch (error) {
                    console.error("[Overlay Spin] Error configuring/starting penalty wheel:", error);
                    playerWheelWrapper?.classList.add('hidden');
                    penaltyWheelWrapper?.classList.add('hidden');
                    penaltyWheelsContainer?.classList.add('hidden');
                }
            } else {
                console.log("[Overlay Spin] No penalty to spin for. Hiding wheels container.");
                playerWheelWrapper?.classList.add('hidden');
                penaltyWheelsContainer?.classList.add('hidden');
                penaltyWheelWrapper?.classList.add('hidden');
            }
        }, 500);
    };
    // --- End Definition of startPenaltyWheelSpin ---


    // --- Player Wheel Configuration ---
    try {
        console.log("[Overlay Spin] Configuring Player Wheel...");
        const playerColors = ['#8dd3c7', '#ffffb3', '#bebada', '#fb8072', '#80b1d3', '#fdb462', '#b3de69', '#fccde5'];
        const playerSegmentsData = createSegments(allPlayers, playerColors);

        if (playerSegmentsData.length > 0) {
            playerWheel.numSegments = 0;
            playerWheel.segments = [];
            playerWheel.animation.callbackFinished = null;

            playerSegmentsData.forEach(segmentData => playerWheel.addSegment(segmentData));
             console.log(`[Overlay Spin] Player segments added. Final numSegments: ${playerWheel.numSegments}`);

            playerWheel.animation.spins = 6;
            playerWheel.animation.duration = 5;
            playerWheel.animation.stopAngle = penaltyResult.playerStopAngle;
            playerWheel.animation.callbackFinished = startPenaltyWheelSpin; // Trigger next step

            playerWheel.draw();
            playerWheel.startAnimation();
            console.log(`[Overlay Spin] Player wheel spinning to: ${penaltyResult.playerStopAngle}`);
        } else {
            console.warn("[Overlay Spin] No valid player segments, skipping player spin.");
            playerWheelWrapper?.classList.add('hidden');
            startPenaltyWheelSpin();
        }
    } catch (playerWheelError) {
        console.error("[Overlay Spin] Error configuring/starting player wheel:", playerWheelError);
        playerWheelWrapper?.classList.add('hidden');
        penaltyWheelWrapper?.classList.add('hidden');
        penaltyWheelsContainer?.classList.add('hidden');
    }
}

function createSegments(items, colors) {
    if (!Array.isArray(items) || items.length === 0) return [];
    const safeColors = Array.isArray(colors) && colors.length > 0 ? colors : ['#888888'];
    return items.map((item, index) => ({
        'fillStyle': safeColors[index % safeColors.length],
        'text': String(item || '?'),
        // --- Text Style Updates within Segment Data (Overrides defaults if needed) ---
        // You could override specific segment text styles here,
        // but setting defaults in setupWheels is usually sufficient.
        // 'textFillStyle': '#FFFFFF', // Example: Force white text for this specific segment
    }));
}


// --- Auto-Scrolling Function ---
function startAutoScroll(element) {
    if (!element) {
        console.error("[Scroll] startAutoScroll called without a valid element.");
        return;
    }
    // --- ALWAYS clear previous interval first ---
    stopAutoScroll();
    // --- Reset state flags ---
    isPausedAtEdge = false;
    // isHoveringScroll = false; // Don't reset hover flag here, mouse might still be over

    // Check if content actually overflows AFTER rendering might have happened
    // Use requestAnimationFrame to check after browser has painted
    requestAnimationFrame(() => {
        const needsScroll = element.scrollHeight > element.clientHeight;
        console.log(`[Scroll] Check for ${element.id}: scrollHeight=${element.scrollHeight}, clientHeight=${element.clientHeight}, needsScroll=${needsScroll}`);

        if (needsScroll) {
            // Reset scroll position and direction only when starting fresh
            element.scrollTop = 0;
            scrollDirection = 1;
            console.log(`[Scroll] Starting new auto-scroll interval for: ${element.id}`);

            scrollInterval = setInterval(() => {
                // Check pause flags *inside* the interval callback
                if (isPausedAtEdge || isHoveringScroll) {
                    // console.log("[Scroll] Interval running but paused (edge/hover)."); // Debug log if needed
                    return;
                }

                const currentScroll = element.scrollTop;
                const maxScroll = element.scrollHeight - element.clientHeight;

                // Check edges with tolerance
                if (scrollDirection === 1 && currentScroll >= maxScroll - AUTO_SCROLL_STEP) {
                    element.scrollTop = maxScroll;
                    console.log("[Scroll] Reached bottom, pausing.");
                    scrollDirection = -1;
                    isPausedAtEdge = true;
                    setTimeout(() => { isPausedAtEdge = false; console.log("[Scroll] Resuming scroll upwards."); }, AUTO_SCROLL_PAUSE);
                } else if (scrollDirection === -1 && currentScroll <= AUTO_SCROLL_STEP) {
                    element.scrollTop = 0;
                    console.log("[Scroll] Reached top, pausing.");
                    scrollDirection = 1;
                    isPausedAtEdge = true;
                    setTimeout(() => { isPausedAtEdge = false; console.log("[Scroll] Resuming scroll downwards."); }, AUTO_SCROLL_PAUSE);
                } else {
                    element.scrollTop += scrollDirection * AUTO_SCROLL_STEP;
                }
            }, AUTO_SCROLL_DELAY);
            console.log("[Scroll] New interval ID set:", scrollInterval); // Log the new ID
        } else {
            console.log("[Scroll] Auto-scroll not needed for:", element.id);
            element.scrollTop = 0; // Ensure it's at the top
        }
    }); // End requestAnimationFrame
}

function stopAutoScroll() {
    // Check if interval ID exists before trying to clear
    if (scrollInterval !== null) {
        clearInterval(scrollInterval);
        console.log("[Scroll] Cleared interval ID:", scrollInterval); // Log cleared ID
        scrollInterval = null; // Explicitly set to null
    } else {
        // console.log("[Scroll] stopAutoScroll called, but no active interval found."); // Optional log
    }
}


// --- WebSocket Connection ---
function connectWebSocket() {
    if (socket && socket.connected) { socket.disconnect(); }
    if (!apiKey || !challengeId) { updateStatus('Missing API Key or Challenge ID.', 'error'); return; }

    updateStatus('Connecting...', 'connecting');
    console.log(`Attempting WebSocket connection to server with key: ${apiKey ? 'Provided' : 'Missing'} and challenge: ${challengeId}`);

    try {
        socket = io(window.location.origin, {
            path: SOCKET_PATH,
            query: { apiKey: apiKey, challengeId: challengeId },
            reconnectionAttempts: 5,
            reconnectionDelay: RECONNECT_DELAY,
            transports: ['websocket']
        });

        // Standard Event Handlers
        socket.on('connect', () => {
             updateStatus('Connected', 'connected');
             console.log('WebSocket connected. SID:', socket.id);
             // Join room after connection established
             if (challengeId) {
                 socket.emit('join_challenge_room', { challenge_id: challengeId });
                 console.log(`[WebSocket Overlay] Attempted to join room: ${challengeId}`);
             }
        });
        socket.on('disconnect', (reason) => { updateStatus(`Disconnected: ${reason}`, 'error'); console.warn('WebSocket disconnected:', reason); stopAutoScroll(); });
        socket.on('connect_error', (error) => { updateStatus(`Connection Error: ${error.message}`, 'error'); console.error('WebSocket connection error:', error); stopAutoScroll(); if (error.message === 'Invalid API Key.' || error.message === 'Not authorized for this challenge.') { socket.disconnect(); } });
        socket.on('auth_error', (data) => { updateStatus(`Auth Error: ${data.message}`, 'error'); console.error('WebSocket authentication error:', data.message); socket.disconnect(); stopAutoScroll(); });
        socket.on('room_joined', (data) => { console.log(`[WebSocket Overlay] Successfully joined room: ${data.room}`); });
        socket.on('room_join_error', (data) => { console.error(`[WebSocket Overlay] Error joining room: ${data.error}`); });


        // Custom Event Handlers
        socket.on('initial_state', (data) => {
            console.log('Received initial_state:', data);
            try {
                if (!data || !data.challenge_structure) throw new Error("Invalid initial state data.");
                currentChallengeStructure = data.challenge_structure;
                streamerGroupId = data.user_group?.id; // Store the streamer's group ID

                if (challengeTitleEl) challengeTitleEl.textContent = data.challenge_name || 'Challenge Overlay';

                const streamerGroup = data.user_group;
                if (streamerGroup) {
                    if (rulesListEl) renderOverlayRules(rulesListEl, currentChallengeStructure, streamerGroup.progress_data || {});
                    if (streamerProgressBar && streamerProgressLabel) renderOverlayProgressBar(streamerProgressBar, streamerProgressLabel, streamerGroup.progress_stats || {});
                    // --- Update penalty display on initial load ---
                    if (activePenaltyEl && activePenaltyTextEl) {
                        updateActivePenalty(activePenaltyEl, activePenaltyTextEl, streamerGroup.active_penalty_text);
                    }
                } else {
                    if (rulesListEl) renderOverlayRules(rulesListEl, currentChallengeStructure, {});
                    if (streamerProgressBar && streamerProgressLabel) renderOverlayProgressBar(streamerProgressBar, streamerProgressLabel, { completed: 0, total: 0, percentage: 0 });
                    // --- Clear penalty display if no group ---
                    if (activePenaltyEl && activePenaltyTextEl) {
                        updateActivePenalty(activePenaltyEl, activePenaltyTextEl, null); // Clear it
                    }
                    console.warn("Initial state received, but user is not in a group.");
                    stopAutoScroll();
                }
                if (otherGroupsListEl) renderOtherGroups(otherGroupsListEl, data.other_groups_progress || []);
                if (data.penalty_info && playerWheelCanvas && penaltyWheelCanvas) { setupWheels(); }
                else { penaltyWheelsContainer?.classList.add('hidden'); }
            } catch (error) { console.error("Error processing initial_state:", error); updateStatus(`Error processing initial data: ${error.message}`, 'error'); stopAutoScroll(); }
        });

        socket.on('progress_update', (data) => {
            console.log('Received progress_update:', data);
            try {
                if (!data || !data.challenge_id || data.challenge_id !== challengeId || !currentChallengeStructure) return;
                if (data.group_id === streamerGroupId) { // Only update if it's for the streamer's group
                    if (streamerProgressBar && streamerProgressLabel && data.progress_stats) {
                        renderOverlayProgressBar(streamerProgressBar, streamerProgressLabel, data.progress_stats);
                    }
                    if (rulesListEl && data.progress_data) {
                        renderOverlayRules(rulesListEl, currentChallengeStructure, data.progress_data);
                    }
                }
                if (otherGroupsListEl && data.other_groups_progress) {
                    renderOtherGroups(otherGroupsListEl, data.other_groups_progress);
                }
            } catch (error) { console.error("Error processing progress_update:", error); }
        });

        // --- MODIFIED active_penalty_update Listener ---
        socket.on('active_penalty_update', (data) => {
            console.log('[WebSocket Overlay] Received active_penalty_update:', data);
            try {
                // Basic validation
                if (!data || !data.challenge_id || data.challenge_id !== challengeId || data.group_id === undefined) return;

                // Update ONLY if the penalty is for the streamer's group
                if (data.group_id === streamerGroupId) {
                    console.log(`[WebSocket Overlay] Updating penalty display for streamer's group (${streamerGroupId})`);
                    // Directly call the UI update function with the received text
                    if (activePenaltyEl && activePenaltyTextEl) {
                        updateActivePenalty(activePenaltyEl, activePenaltyTextEl, data.penalty_text); // Pass text directly
                    }
                } else {
                     console.log(`[WebSocket Overlay] Penalty update ignored (group ${data.group_id} is not streamer's group ${streamerGroupId}).`);
                }
            } catch (error) { console.error("[WebSocket Overlay] Error processing active_penalty_update:", error); }
        });
        // --- END MODIFICATION ---

        socket.on('penalty_result', (data) => {
            console.log('[WebSocket Overlay] Received penalty_result DATA:', JSON.stringify(data, null, 2));
            try {
                if (!data || !data.challenge_id || data.challenge_id !== challengeId || !data.result) return;
                if (data.group_id === streamerGroupId) { // Only trigger spin for streamer's group
                    triggerPenaltySpinAnimation(data);
                }
            } catch (error) { console.error("[WebSocket Overlay] Error processing penalty_result:", error); }
        });

    } catch (err) {
        console.error("Socket.IO client connection failed:", err);
        updateStatus('Connection failed.', 'error');
    }
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("Overlay DOM loaded.");

    const urlParams = new URLSearchParams(window.location.search);
    apiKey = urlParams.get('key');
    const pathSegments = window.location.pathname.split('/');
    challengeId = pathSegments[pathSegments.length - 1];

    console.log(`Parsed - Challenge ID: ${challengeId}, API Key: ${apiKey ? 'Present' : 'MISSING'}`);

    if (!challengeId || !apiKey) {
        updateStatus('Missing Challenge ID or API Key in URL.', 'error');
        console.error("Overlay URL must be in the format /overlay/{challenge_id}?key={api_key}");
        document.getElementById('overlay-container').innerHTML = '<div class="alert alert-danger m-4">Configuration Error: Invalid Overlay URL. Please check the link provided.</div>';
        return;
    }

    // Add hover listener to pause/resume scrolling for the rules list
    if (rulesListEl) {
        rulesListEl.addEventListener('mouseenter', () => {
            if (scrollInterval) { isHoveringScroll = true; console.log("[Scroll] Hover detected, pausing scroll."); }
        });
        rulesListEl.addEventListener('mouseleave', () => {
            if (isHoveringScroll) { isHoveringScroll = false; console.log("[Scroll] Hover ended, resuming scroll."); }
        });
    }

    connectWebSocket(); // Initial connection attempt
});