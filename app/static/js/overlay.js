// static/js/overlay.js

// --- Configuration ---
const RECONNECT_DELAY = 5000; // ms
const SOCKET_PATH = '/socket.io'; // Default Socket.IO path
const AUTO_SCROLL_DELAY = 45; // Milliseconds between scroll steps (slightly faster)
const AUTO_SCROLL_STEP = 1; // Pixels to scroll each step
const AUTO_SCROLL_PAUSE = 3500; // Pause at top/bottom (ms)

// --- DOM Element References ---
const statusIndicator = document.getElementById('overlay-status');
const statusIcon = document.getElementById('status-icon');
const statusMessage = document.getElementById('status-message');
const challengeTitleEl = document.getElementById('challenge-title');
const timerDisplayEl = document.getElementById('timer-display');
const streamerProgressBar = document.getElementById('streamer-progress-bar');
const streamerProgressLabel = document.querySelector('#streamer-progress-bar-container .progress-label .value');
const rulesListEl = document.getElementById('rules-list'); // <<< Target for scrolling
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
let scrollInterval = null; // Interval ID for auto-scrolling
let scrollDirection = 1; // 1 for down, -1 for up
let isPausedAtEdge = false; // Flag for scroll pausing
let isHoveringScroll = false; // Flag for hover pause

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
       for(let i = 0; i < count; i++) {
           // Construct progress key based on type and index
           const progressKey = segmentIndex !== null
               ? `${itemType}_${segmentIndex}_${key}_${i}`
               : `${itemType}_${key}_${i}`;
           const isChecked = groupProgressData[progressKey] === true;

           // Individual checkbox item (no d-inline-block needed)
           itemHtml += `<div class="progress-item ${isChecked ? 'completed' : ''}" title="Win ${i+1} for ${escapeHtml(key)}">`;
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
           for(let i = 0; i < count; i++) {
               if(groupProgressData[`normal_${key}_${i}`] === true) completedCount++;
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
                    for(let i = 0; i < count; i++) {
                        // Use 0-based segIndex for key matching backend/main.js
                        if(groupProgressData[`b2b_${segIndex}_${key}_${i}`] === true) completedCount++;
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
     if (!container) { console.error("Other groups container not found"); return; }
     if (!otherGroupsData || otherGroupsData.length === 0) {
         container.innerHTML = '<li class="loading-text small fst-italic text-white-50">No other groups active.</li>';
         return;
     }
     let listHtml = '';
     // Sort by percentage descending, then name ascending
     otherGroupsData.sort((a, b) => {
         if (b.percentage !== a.percentage) {
             return b.percentage - a.percentage;
         }
         return (a.name || '').localeCompare(b.name || '');
     });

     otherGroupsData.forEach(group => {
         listHtml += `<li class="small">
             <span class="group-name">${escapeHtml(group.name)}:</span>
             <span class="percentage">${group.percentage}%</span>
           </li>`;
     });
     container.innerHTML = listHtml;
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

function setupWheels() {
    if (!playerWheelCanvas || !penaltyWheelCanvas) {
        console.error("Cannot setup wheels, missing canvases.");
        return;
    }
    const baseAnim = { type: 'spinToStop', easing: 'Power4.easeOut' };
    try {
        playerWheel = new Winwheel({
            canvasId: playerWheelCanvas.id,
            numSegments: 1,
            outerRadius: 70,
            innerRadius: 10,
            fillStyle: '#666',
            textFontSize: 10,
            textFillStyle: '#ccc',
            lineWidth: 1,
            strokeStyle: '#444',
            animation: { ...baseAnim, duration: 5, spins: 6 }
        }, false);
        penaltyWheel = new Winwheel({
            canvasId: penaltyWheelCanvas.id,
            numSegments: 1,
            outerRadius: 95,
            innerRadius: 15,
            fillStyle: '#555',
            textFontSize: 10,
            textFillStyle: '#ccc',
            lineWidth: 1,
            strokeStyle: '#444',
            animation: { ...baseAnim, duration: 8, spins: 10 }
        }, false);
        console.log("Wheels ready (GSAP-aware).");
    } catch (e) {
        console.error("Wheel setup failed:", e);
        penaltyWheelsContainer?.classList.add('hidden');
    }
}

function triggerPenaltySpinAnimation(resultData) {
    if (!penaltyWheelsContainer || !resultData?.result) {
        return console.error("Missing data/container");
    }
    if (!playerWheel || !penaltyWheel) {
        console.error("Wheels not initialized");
        penaltyResultDisplay.textContent = resultData.result.name || 'Error';
        penaltyWheelsContainer.classList.remove('hidden');
        playerWheelWrapper.classList.add('hidden');
        penaltyWheelWrapper.classList.add('hidden');
        return;
    }

    const { player, name, description, stopAngle, winningSegmentIndex } = resultData.result;
    penaltyResultDisplay.textContent = 'Spinning...';
    penaltyWheelsContainer.classList.remove('hidden');
    playerWheelWrapper.classList.remove('hidden');
    penaltyWheelWrapper.classList.remove('hidden');

    // --- DRAW PLAYER wheel statically ---
    playerWheel.stopAnimation();              // safe now that GSAP is present
    playerWheel.rotationAngle = 0;
    playerWheel.segments = [
        null,                                  // dummy index 0
        { fillStyle: '#8dd3c7', text: escapeHtml(player || '?') }
    ];
    playerWheel.numSegments = 1;
    playerWheel.draw();

    // --- PREPARE PENALTY wheel animation ---
    if (name !== "No Penalty" && typeof stopAngle === 'number') {
        penaltyWheel.stopAnimation();
        penaltyWheel.rotationAngle = 0;
        const colors = ['#e41a1c','#377eb8','#4daf4a','#984ea3','#ff7f00','#a65628','#f781bf','#999999'];
        const baseSegments = Array.from({length: 8}, (_, i) => ({
            fillStyle: colors[i],
            text: '?'
        }));

        // insert winning text, highlight
        const idx = (winningSegmentIndex > 0 && winningSegmentIndex <= 8) ? winningSegmentIndex-1 : 0;
        baseSegments[idx].text = escapeHtml(name);
        baseSegments[idx].fillStyle = '#FFD700';

        // make it 1-indexed
        penaltyWheel.segments = [null, ...baseSegments];
        penaltyWheel.numSegments = 8;
        penaltyWheel.animation.stopAngle = stopAngle;
        penaltyWheel.animation.callbackFinished = () => {
            penaltyResultDisplay.textContent = `${escapeHtml(player)} receives: ${escapeHtml(name)}`;
        };

        penaltyWheel.draw();        // initial draw
        penaltyWheel.startAnimation();
    } else {
        // no penalty case
        const text = name === "No Penalty"
            ? `${escapeHtml(player)}: ${escapeHtml(description || 'No penalty.')}`
            : `${escapeHtml(player)}: ${escapeHtml(name)}`;
        penaltyResultDisplay.textContent = text;
        penaltyWheelWrapper.classList.add('hidden');
    }
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
        socket.on('connect', () => { updateStatus('Connected', 'connected'); console.log('WebSocket connected. SID:', socket.id); });
        socket.on('disconnect', (reason) => { updateStatus(`Disconnected: ${reason}`, 'error'); console.warn('WebSocket disconnected:', reason); stopAutoScroll(); }); // Stop scroll on disconnect
        socket.on('connect_error', (error) => { updateStatus(`Connection Error: ${error.message}`, 'error'); console.error('WebSocket connection error:', error); stopAutoScroll(); if (error.message === 'Invalid API Key.' || error.message === 'Not authorized for this challenge.') { socket.disconnect(); } });
        socket.on('auth_error', (data) => { updateStatus(`Auth Error: ${data.message}`, 'error'); console.error('WebSocket authentication error:', data.message); socket.disconnect(); stopAutoScroll(); });

        // Custom Event Handlers
        socket.on('initial_state', (data) => {
            console.log('Received initial_state:', data);
            try {
                if (!data || !data.challenge_structure) throw new Error("Invalid initial state data.");
                currentChallengeStructure = data.challenge_structure;
                streamerGroupId = data.user_group?.id;

                if (challengeTitleEl) challengeTitleEl.textContent = data.challenge_name || 'Challenge Overlay';
                // Add timer update here if needed

                const streamerGroup = data.user_group;
                if (streamerGroup) {
                    if (rulesListEl) renderOverlayRules(rulesListEl, currentChallengeStructure, streamerGroup.progress_data || {}); // This will trigger scroll start
                    if (streamerProgressBar && streamerProgressLabel) renderOverlayProgressBar(streamerProgressBar, streamerProgressLabel, streamerGroup.progress_stats || {});
                    if (activePenaltyEl && activePenaltyTextEl) updateActivePenalty(activePenaltyEl, activePenaltyTextEl, streamerGroup.active_penalty_text);
                } else {
                     if (rulesListEl) renderOverlayRules(rulesListEl, currentChallengeStructure, {});
                     if (streamerProgressBar && streamerProgressLabel) renderOverlayProgressBar(streamerProgressBar, streamerProgressLabel, {completed:0, total:0, percentage:0});
                     console.warn("Initial state received, but user is not in a group.");
                     stopAutoScroll(); // Stop scroll if no group data
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
                 if (data.group_id === streamerGroupId) {
                     if (streamerProgressBar && streamerProgressLabel && data.progress_stats) {
                         renderOverlayProgressBar(streamerProgressBar, streamerProgressLabel, data.progress_stats);
                     }
                     if (rulesListEl && data.progress_data) {
                         // --- No need to store/restore scroll position if startAutoScroll resets it ---
                         renderOverlayRules(rulesListEl, currentChallengeStructure, data.progress_data); // Re-render & restart scroll
                     }
                 }
                 if (otherGroupsListEl && data.other_groups_progress) {
                     renderOtherGroups(otherGroupsListEl, data.other_groups_progress);
                 }
            } catch (error) { console.error("Error processing progress_update:", error); }
        });

        socket.on('active_penalty_update', (data) => {
            console.log('Received active_penalty_update:', data);
             try {
                 if (!data || !data.challenge_id || data.challenge_id !== challengeId) return;
                 if (data.group_id === streamerGroupId && activePenaltyEl && activePenaltyTextEl) {
                    updateActivePenalty(activePenaltyEl, activePenaltyTextEl, data.penalty_text);
                 }
            } catch (error) { console.error("Error processing active_penalty_update:", error); }
        });

        socket.on('penalty_result', (data) => {
            console.log('Received penalty_result:', data);
             try {
                 if (!data || !data.challenge_id || data.challenge_id !== challengeId || !data.result) return;
                 if(data.group_id === streamerGroupId) {
                    triggerPenaltySpinAnimation(data);
                 }
            } catch (error) { console.error("Error processing penalty_result:", error); }
        });

    } catch(err) {
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

    connectWebSocket();

    // Add hover listener to pause/resume scrolling
    if(rulesListEl) {
        rulesListEl.addEventListener('mouseenter', () => {
            if (scrollInterval) { // Only set flag if currently scrolling
                 isHoveringScroll = true;
                 console.log("[Scroll] Hover detected, pausing scroll.");
                 // Optionally add a visual cue
                 // rulesListEl.style.outline = '1px solid red';
            }
        });
        rulesListEl.addEventListener('mouseleave', () => {
             if (isHoveringScroll) { // Only unset if it was paused by hover
                 isHoveringScroll = false;
                 console.log("[Scroll] Hover ended, resuming scroll.");
                 // Remove visual cue
                 // rulesListEl.style.outline = 'none';
             }
        });
    }
});