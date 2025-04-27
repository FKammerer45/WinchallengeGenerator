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

     const createRuleItemHtml = (key, count, completedCount, isB2B = false) => {
        let itemHtml = `<div class="progress-item ${completedCount >= count ? 'completed' : ''}">`;
        itemHtml += `<span class="checkbox-icons me-2">`;
        for(let i = 0; i < count; i++) {
            itemHtml += `<i class="${bi_icon_prefix}${i < completedCount ? 'check-square-fill' : 'square'}"></i> `;
        }
        itemHtml += `</span>`;
        itemHtml += `<span class="rule-text">${escapeHtml(key)}</span>`;
        itemHtml += `</div>`;
        return itemHtml;
     };

     // Normal Wins
     const normalItems = challengeStructure.normal || {};
     if (Object.keys(normalItems).length > 0) {
        html += `<h6 class="section-title small text-info">Normal Wins:</h6>`;
        Object.entries(normalItems).sort((a, b) => String(a[0]).localeCompare(String(b[0]))).forEach(([key, info]) => {
            const count = info?.count || 0;
            let completedCount = 0;
            for(let i = 0; i < count; i++) {
                if(groupProgressData[`normal_${key}_${i}`] === true) completedCount++;
            }
            html += createRuleItemHtml(key, count, completedCount);
        });
     }

     // B2B Wins
     const b2bItems = challengeStructure.b2b || [];
     if (b2bItems.length > 0) {
         if (html) html += '<hr class="my-2 opacity-25">';
         html += `<h6 class="section-title small text-warning">B2B Segments:</h6>`;
         b2bItems.forEach((seg, segIndex) => {
             const displaySegmentIdx = segIndex + 1;
             const groupItems = seg?.group || {};
             if (Object.keys(groupItems).length > 0) {
                 html += `<div class="mb-2 ms-2"><strong class="small d-block text-white-50 mb-1">Segment ${displaySegmentIdx}:</strong>`;
                 Object.entries(groupItems).sort((a, b) => String(a[0]).localeCompare(String(b[0]))).forEach(([key, count]) => {
                     let completedCount = 0;
                     for(let i = 0; i < count; i++) {
                         if(groupProgressData[`b2b_${segIndex}_${key}_${i}`] === true) completedCount++;
                     }
                     html += createRuleItemHtml(key, count, completedCount, true);
                 });
                 html += `</div>`;
             }
         });
     }

     if (!html) html = '<p class="loading-text small fst-italic text-white-50">No rules defined.</p>';
     container.innerHTML = html;

     // --- Restart scrolling after content update ---
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
// ... (setupWheels, triggerPenaltySpinAnimation remain the same) ...
function setupWheels() {
    if (!playerWheelCanvas || !penaltyWheelCanvas) {
        console.error("Cannot setup wheels, canvas element(s) missing.");
        return;
    }
    const commonWheelOptions = {
        'textFontSize': 10,
        'textFillStyle': '#ccc', // Lighter text for dark bg
        'lineWidth': 1,
        'strokeStyle': '#444',
        'animation': { 'type': 'spinToStop', 'easing': 'Power4.easeOut' }
    };
    const playerWheelConfig = {
        ...commonWheelOptions,
        'canvasId': playerWheelCanvas.id, // Use the actual ID
        'numSegments': 1,
        'outerRadius': 70,
        'innerRadius': 10,
        'fillStyle': '#666',    // Default segment color
        'animation': { ...commonWheelOptions.animation, 'duration': 5, 'spins': 6 }
    };
     const penaltyWheelConfig = {
        ...commonWheelOptions,
        'canvasId': penaltyWheelCanvas.id, // Use the actual ID
        'numSegments': 1,
        'outerRadius': 95,
        'innerRadius': 15,
        'fillStyle': '#555',
        'animation': { ...commonWheelOptions.animation, 'duration': 8, 'spins': 10 }
    };
    try {
        // Create placeholder wheels - need segments to draw initially
        playerWheel = new Winwheel({...playerWheelConfig, 'segments': [{'fillStyle': '#888', 'text': '?'}]}, false); // drawWheel = false
        penaltyWheel = new Winwheel({...penaltyWheelConfig, 'segments': [{'fillStyle': '#555', 'text': '?'}]}, false); // drawWheel = false
        console.log("WinWheel instances created.");
    } catch (e) {
        console.error("Error creating WinWheel instances:", e);
        // Disable penalty display if wheels fail?
        penaltyWheelsContainer?.classList.add('hidden');
    }
}

function triggerPenaltySpinAnimation(resultData) {
     if (!penaltyWheelsContainer || !resultData || !resultData.result) {
         console.error("Cannot trigger penalty spin: Missing container or result data.");
         return;
     }
     if (!playerWheel || !penaltyWheel) {
          console.error("Cannot trigger penalty spin: Wheel instances not initialized.");
          penaltyResultDisplay.textContent = resultData.result.name || 'Error';
          penaltyWheelsContainer.classList.remove('hidden'); // Show result area
          playerWheelWrapper?.classList.add('hidden');
          penaltyWheelWrapper?.classList.add('hidden');
          return;
     }

     console.log("Triggering penalty spin animation with data:", resultData);
     penaltyResultDisplay.textContent = 'Spinning...'; // Clear previous result text
     penaltyWheelsContainer.classList.remove('hidden');
     playerWheelWrapper?.classList.remove('hidden');
     penaltyWheelWrapper?.classList.remove('hidden');


     const penaltyResult = resultData.result;
     const finalPenaltyText = penaltyResult.name === "No Penalty"
         ? `${escapeHtml(penaltyResult.player || 'Participant')}: ${escapeHtml(penaltyResult.description || 'No penalty.')}`
         : `${escapeHtml(penaltyResult.player || 'Participant')} receives: ${escapeHtml(penaltyResult.name)}`;

     // --- Player Wheel (Static Display) ---
     playerWheel.stopAnimation(false); // Stop any previous animation
     playerWheel.rotationAngle = 0;
     playerWheel.numSegments = 1;
     playerWheel.segments = [{'fillStyle': '#8dd3c7', 'text': escapeHtml(penaltyResult.player || '?')}];
     playerWheel.draw(); // Draw static wheel showing the player

     // --- Penalty Wheel Animation ---
     if (penaltyResult.name !== "No Penalty" && penaltyResult.stopAngle !== undefined) {
         penaltyWheel.stopAnimation(false); // Stop previous
         penaltyWheel.rotationAngle = 0; // Reset angle

         // Reconfigure penalty wheel - Use dummy segments for visual spin
         // Ideally, backend would send actual segments used if they vary.
         penaltyWheel.numSegments = 8; // Assume 8 segments visually
         const dummySegments = Array.from({length: 8}, (_, i) => ({
             'fillStyle': ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#a65628', '#f781bf', '#999999'][i % 8],
             'text': `?` // Placeholder text
         }));
         // Place the actual result name in the winning segment if index provided
         const winIndex = penaltyResult.winningSegmentIndex;
         if (winIndex !== undefined && winIndex > 0 && winIndex <= 8) {
              dummySegments[winIndex - 1].text = escapeHtml(penaltyResult.name);
              dummySegments[winIndex - 1].fillStyle = '#FFD700'; // Highlight winning segment
         } else {
             dummySegments[0].text = escapeHtml(penaltyResult.name); // Fallback
         }
         penaltyWheel.segments = dummySegments;

         // Set animation properties
         penaltyWheel.animation.stopAngle = penaltyResult.stopAngle;
         penaltyWheel.animation.callbackFinished = () => {
             console.log("Penalty animation finished.");
             penaltyResultDisplay.textContent = finalPenaltyText;
             // Optionally hide wheels after a delay
             // setTimeout(() => { penaltyWheelsContainer.classList.add('hidden'); }, 5000);
         };
         penaltyWheel.draw(); // Draw initial state before spin
         penaltyWheel.startAnimation();
         console.log(`Starting penalty wheel animation to stop at: ${penaltyResult.stopAngle}`);
     } else {
         // No penalty or no animation data - just show the result text immediately
         console.log("No penalty or missing animation data, showing text result.");
         penaltyResultDisplay.textContent = finalPenaltyText;
         penaltyWheelWrapper?.classList.add('hidden'); // Hide penalty wheel canvas
         // Keep player wheel visible to show who got "No Penalty"
     }
}

// --- Auto-Scrolling Function ---
function startAutoScroll(element) {
    if (!element) return;
    stopAutoScroll(); // Clear existing interval before starting new one
    isPausedAtEdge = false;

    // Check if content actually overflows AFTER rendering (wait slight delay)
    setTimeout(() => {
        const needsScroll = element.scrollHeight > element.clientHeight;
        console.log(`[Scroll] Check for ${element.id}: scrollHeight=${element.scrollHeight}, clientHeight=${element.clientHeight}, needsScroll=${needsScroll}`);

        if (needsScroll) {
            console.log(`[Scroll] Starting auto-scroll for: ${element.id}`);
            // Reset scroll position to top before starting
            element.scrollTop = 0;
            scrollDirection = 1; // Start going down

            scrollInterval = setInterval(() => {
                if (isPausedAtEdge || isHoveringScroll) return; // Do nothing if paused or hovered

                const currentScroll = element.scrollTop;
                const maxScroll = element.scrollHeight - element.clientHeight;

                // Check edges with a small tolerance (e.g., 1 pixel)
                if (scrollDirection === 1 && currentScroll >= maxScroll - AUTO_SCROLL_STEP) { // Reached bottom
                    element.scrollTop = maxScroll; // Ensure it's exactly at the bottom
                    console.log("[Scroll] Reached bottom, pausing.");
                    scrollDirection = -1; // Change direction
                    isPausedAtEdge = true;
                    setTimeout(() => { isPausedAtEdge = false; console.log("[Scroll] Resuming scroll upwards."); }, AUTO_SCROLL_PAUSE);
                } else if (scrollDirection === -1 && currentScroll <= AUTO_SCROLL_STEP) { // Reached top
                    element.scrollTop = 0; // Ensure it's exactly at the top
                    console.log("[Scroll] Reached top, pausing.");
                    scrollDirection = 1; // Change direction
                    isPausedAtEdge = true;
                    setTimeout(() => { isPausedAtEdge = false; console.log("[Scroll] Resuming scroll downwards."); }, AUTO_SCROLL_PAUSE);
                } else {
                    // Scroll smoothly
                    element.scrollTop += scrollDirection * AUTO_SCROLL_STEP;
                }
            }, AUTO_SCROLL_DELAY);
        } else {
            console.log("[Scroll] Auto-scroll not needed for:", element.id);
            element.scrollTop = 0; // Ensure it's at the top if no scroll needed
        }
    }, 100); // Short delay to allow DOM update
}

function stopAutoScroll() {
     if (scrollInterval) {
        clearInterval(scrollInterval);
        scrollInterval = null;
        console.log("[Scroll] Auto-scroll stopped.");
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
                 // Check if the update is for the streamer's group
                 if (data.group_id === streamerGroupId) {
                     if (streamerProgressBar && streamerProgressLabel && data.progress_stats) {
                         renderOverlayProgressBar(streamerProgressBar, streamerProgressLabel, data.progress_stats);
                     }
                     if (rulesListEl && data.progress_data) {
                         // Store current scroll position before re-rendering
                         const currentScrollTop = rulesListEl.scrollTop;
                         const currentDirection = scrollDirection; // Store direction too
                         const currentlyPaused = isPausedAtEdge;

                         renderOverlayRules(rulesListEl, currentChallengeStructure, data.progress_data);

                         // Restore scroll position and direction if not paused at edge
                         if (!currentlyPaused) {
                             rulesListEl.scrollTop = currentScrollTop;
                             scrollDirection = currentDirection; // Keep scrolling same way
                         } else {
                             // If paused at edge, restart logic will handle it
                             console.log("[Scroll] Was paused at edge during progress update, letting restart handle position.");
                         }
                         // Restart scroll logic after render (startAutoScroll handles check if needed)
                         startAutoScroll(rulesListEl);
                     }
                 }
                 // Update other groups list regardless
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