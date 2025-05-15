// app/static/js/challenge_view/timer.js

// --- Module-scoped variables ---
let displayInterval = null;
let serverData = { currentValueSeconds: 0, isRunning: false, lastStartedAtUTC: null };
let isUserAuthorized = false;
let timerIdSuffix = 'main'; // Default suffix, can be changed by initializeTimer

// DOM Element references - will be initialized
let timerDisplayEl = null;
let startButtonEl = null;
let stopButtonEl = null;
let resetButtonEl = null;

let lastActionDispatchedTime = 0;
const MIN_INTERVAL_BETWEEN_ACTIONS_MS = 1000; // Cooldown period for actions

// --- Helper Functions ---
function formatTime(totalSeconds) {
    totalSeconds = Math.max(0, Math.floor(totalSeconds)); // Ensure non-negative integer
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function updateTimerDisplay() {
    // Query for the element every time in case the DOM is re-rendered by other UI logic
    const currentTimerDisplayEl = document.getElementById(`timerDisplay-${timerIdSuffix}`);

    if (!currentTimerDisplayEl) {
        // This log will now correctly indicate if the element is missing AT THE TIME OF THE TICK
        // console.warn(`[TimerJS TICK - ${timerIdSuffix}] updateTimerDisplay: DOM element #timerDisplay-${timerIdSuffix} not found! Cannot update display.`);
        return;
    }

    let displaySeconds = serverData.currentValueSeconds;
    if (serverData.isRunning && serverData.lastStartedAtUTC) {
        try {
            const startTimeMillis = new Date(serverData.lastStartedAtUTC).getTime();
            if (!isNaN(startTimeMillis)) {
                const elapsedSinceStart = Math.floor((Date.now() - startTimeMillis) / 1000);
                displaySeconds = serverData.currentValueSeconds + elapsedSinceStart;
            } else {
                // console.warn(`[TimerJS - ${timerIdSuffix}] Invalid lastStartedAtUTC for display: ${serverData.lastStartedAtUTC}`);
            }
        } catch (e) {
            console.error(`[TimerJS - ${timerIdSuffix}] Error parsing lastStartedAtUTC during display update:`, e);
        }
    }
    const formattedTime = formatTime(displaySeconds);
    currentTimerDisplayEl.textContent = formattedTime;

    // console.log(`[TimerJS TICK - ${timerIdSuffix}] isRunning: ${serverData.isRunning}, lastStarted: ${serverData.lastStartedAtUTC}, baseSec: ${serverData.currentValueSeconds}, calculatedDisplaySec: ${displaySeconds}, formatted: ${formattedTime}, targetEl ID: ${currentTimerDisplayEl.id}`);
}

function updateButtonStates() {
    // Re-fetch buttons each time to ensure references are current if DOM is manipulated externally
    const currentStartButtonEl = document.getElementById(`btnStart-${timerIdSuffix}`);
    const currentStopButtonEl = document.getElementById(`btnStop-${timerIdSuffix}`);
    const currentResetButtonEl = document.getElementById(`btnReset-${timerIdSuffix}`);

    if (!currentStartButtonEl || !currentStopButtonEl || !currentResetButtonEl) {
        // console.warn(`[TimerJS - ${timerIdSuffix}] updateButtonStates: One or more button elements not found.`);
        return;
    }

    if (isUserAuthorized) {
        currentStartButtonEl.disabled = serverData.isRunning;
        currentStopButtonEl.disabled = !serverData.isRunning;
        currentResetButtonEl.disabled = false; // Reset button is generally always enabled if authorized
    } else {
        currentStartButtonEl.disabled = true;
        currentStopButtonEl.disabled = true;
        currentResetButtonEl.disabled = true;
    }
    // console.log(`[TimerJS - ${timerIdSuffix}] updateButtonStates finished. serverData.isRunning: ${serverData.isRunning}, Start disabled: ${currentStartButtonEl.disabled}`);
}

function manageDisplayInterval(callOrigin = "unknown") {
    // console.log(`[TimerJS - ${timerIdSuffix}] manageDisplayInterval called from: ${callOrigin}. serverData.isRunning: ${serverData.isRunning}`);
    if (displayInterval) {
        clearInterval(displayInterval);
        // console.log(`[TimerJS - ${timerIdSuffix}] Cleared existing interval ID: ${displayInterval}`);
        displayInterval = null;
    }

    if (serverData.isRunning) {
        updateTimerDisplay(); // Update once immediately
        displayInterval = setInterval(updateTimerDisplay, 1000);
        console.log(`[TimerJS - ${timerIdSuffix}] Started display interval. ID: ${displayInterval}. isRunning: ${serverData.isRunning}, lastStarted: ${serverData.lastStartedAtUTC}, baseSec: ${serverData.currentValueSeconds}. Origin: ${callOrigin}`);
    } else {
        updateTimerDisplay(); // Update to final stopped value
        console.log(`[TimerJS - ${timerIdSuffix}] Display interval STOPPED (or not started as isRunning is false). Value: ${serverData.currentValueSeconds}. Origin: ${callOrigin}`);
    }
}

export function initializeTimer(idSuffixProvided, initialTimerState, authorized) {
    timerIdSuffix = idSuffixProvided || 'main';
    isUserAuthorized = authorized;

    // Get static references to buttons for attaching listeners
    timerDisplayEl = document.getElementById(`timerDisplay-${timerIdSuffix}`)
    startButtonEl = document.getElementById(`btnStart-${timerIdSuffix}`);
    stopButtonEl = document.getElementById(`btnStop-${timerIdSuffix}`);
    resetButtonEl = document.getElementById(`btnReset-${timerIdSuffix}`);

    if (!timerDisplayEl) { // Log only if expected (e.g., shared challenge)
        // This log is fine as a warning if current_user.is_authenticated was true in template
        // but the element is still missing, or if it's local and we don't expect it.
        // For local without login, this is expected.
        console.warn(`[TimerJS - ${timerIdSuffix}] Initial Timer display element #timerDisplay-${timerIdSuffix} not found.`);
        return;
    }
    // Check for the display element for an initial log, but it's re-queried in updateTimerDisplay
    const initialDisplayEl = document.getElementById(`timerDisplay-${timerIdSuffix}`);
    if (!initialDisplayEl){
        console.error(`[TimerJS - ${timerIdSuffix}] CRITICAL: Initial Timer display element #timerDisplay-${timerIdSuffix} not found during init!`);
    }
    if (!startButtonEl || !stopButtonEl || !resetButtonEl) {
        console.warn(`[TimerJS - ${timerIdSuffix}] Initializing: One or more timer control buttons not found. User interaction for timer will be broken.`);
    }

    // Set internal serverData from initialTimerState
    if (initialTimerState) {
        let baseSeconds;
        if (typeof initialTimerState.current_value_seconds !== 'undefined') {
            baseSeconds = parseInt(initialTimerState.current_value_seconds, 10);
        } else {
            baseSeconds = 0; // Default if not present
        }
        serverData.currentValueSeconds = isNaN(baseSeconds) ? 0 : baseSeconds;

        const isRunningString = String(initialTimerState.is_running).toLowerCase();
        serverData.isRunning = initialTimerState.is_running === true || isRunningString === 'true';
        serverData.lastStartedAtUTC = initialTimerState.last_started_at_utc || null;
    } else {
        serverData = { currentValueSeconds: 0, isRunning: false, lastStartedAtUTC: null };
    }

    console.log(`[TimerJS - ${timerIdSuffix}] Initialized. Authorized: ${isUserAuthorized}, Initial serverData:`, JSON.parse(JSON.stringify(serverData)));

    updateButtonStates();       // Set initial button states based on serverData
    manageDisplayInterval("initializeTimer"); // Start/stop interval based on initial serverData.isRunning

    // Attach event listeners to buttons if they exist and user is authorized
    if (isUserAuthorized && startButtonEl && stopButtonEl && resetButtonEl) {
        startButtonEl.addEventListener('click', () => {
            if (startButtonEl.disabled) return;
            const now = Date.now();
            if (now - lastActionDispatchedTime < MIN_INTERVAL_BETWEEN_ACTIONS_MS) {
                console.warn(`[TimerJS - ${timerIdSuffix}] Start click IGNORED (cooldown).`); return;
            }
            if (!serverData.isRunning) {
                lastActionDispatchedTime = now;
                // Optimistic UI Update for buttons
                serverData.isRunning = true; // Assume start will succeed for button state
                updateButtonStates();        // Visually disable Start, enable Stop
                // Actual timer display will update when server confirms 'timer_started' event

                console.log(`[TimerJS - ${timerIdSuffix}] Dispatching requestTimerStart.`);
                document.dispatchEvent(new CustomEvent('requestTimerStart', { detail: { timerId: timerIdSuffix } }));
            }
        });

        stopButtonEl.addEventListener('click', () => {
            if (stopButtonEl.disabled) return;
            const now = Date.now();
            if (now - lastActionDispatchedTime < MIN_INTERVAL_BETWEEN_ACTIONS_MS) {
                console.warn(`[TimerJS - ${timerIdSuffix}] Stop click IGNORED (cooldown).`); return;
            }
            if (serverData.isRunning) {
                lastActionDispatchedTime = now;
                // Optimistic UI Update
                serverData.isRunning = false; // Assume stop will succeed for button state
                // If you want the timer to stop ticking optimistically:
                // manageDisplayInterval("stopButton_optimistic"); // This will update display to last calculated value
                updateButtonStates();         // Visually disable Stop, enable Start

                console.log(`[TimerJS - ${timerIdSuffix}] Dispatching requestTimerStop.`);
                document.dispatchEvent(new CustomEvent('requestTimerStop', { detail: { timerId: timerIdSuffix } }));
            }
        });

        resetButtonEl.addEventListener('click', () => {
            if (resetButtonEl.disabled && !serverData.isRunning) return; // Allow reset if timer stopped, even if button was briefly disabled
            const now = Date.now();
            if (now - lastActionDispatchedTime < MIN_INTERVAL_BETWEEN_ACTIONS_MS) {
                console.warn(`[TimerJS - ${timerIdSuffix}] Reset click IGNORED (cooldown).`); return;
            }
            lastActionDispatchedTime = now;
            // Optimistic UI Update
            serverData.isRunning = false;
            serverData.currentValueSeconds = 0;
            serverData.lastStartedAtUTC = null;
            updateButtonStates();         // Reflect new state on buttons
            manageDisplayInterval("resetButton_optimistic"); // Update display to 00:00:00 & stop interval

            console.log(`[TimerJS - ${timerIdSuffix}] Dispatching requestTimerReset.`);
            document.dispatchEvent(new CustomEvent('requestTimerReset', { detail: { timerId: timerIdSuffix } }));
        });
    } else {
        if (isUserAuthorized) {
            console.warn(`[TimerJS - ${timerIdSuffix}] Not attaching button listeners because one or more button elements are missing.`);
        }
    }
}

// Function to update timer state based on comprehensive state push (e.g., from initial_state)
export function updateTimerStateFromServer(newState) {
    if (!newState) {
        console.warn(`[TimerJS - ${timerIdSuffix}] updateTimerStateFromServer called with no state.`);
        return;
    }

    // console.log(`[TimerJS - ${timerIdSuffix}] updateTimerStateFromServer RAW INPUT newState:`, JSON.stringify(newState));

    let baseSeconds = 0;
    if (typeof newState.current_value_seconds !== 'undefined') {
        const parsedSec = parseInt(newState.current_value_seconds, 10);
        if (!isNaN(parsedSec)) {
            baseSeconds = parsedSec;
        } else {
            // console.warn(`[TimerJS - ${timerIdSuffix}] newState.current_value_seconds ('${newState.current_value_seconds}') is not a valid number.`);
        }
    } else {
        // console.warn(`[TimerJS - ${timerIdSuffix}] newState.current_value_seconds is undefined. Defaulting baseSeconds.`);
    }
    serverData.currentValueSeconds = baseSeconds;

    if (typeof newState.is_running !== 'undefined') {
        if (typeof newState.is_running === 'boolean') {
            serverData.isRunning = newState.is_running;
        } else {
            serverData.isRunning = String(newState.is_running).toLowerCase() === 'true';
        }
    } else {
        // console.warn(`[TimerJS - ${timerIdSuffix}] newState.is_running is undefined. serverData.isRunning not changed from current: ${serverData.isRunning}`);
    }
    
    if (typeof newState.last_started_at_utc !== 'undefined') {
        serverData.lastStartedAtUTC = newState.last_started_at_utc || null;
    } else {
        // console.warn(`[TimerJS - ${timerIdSuffix}] newState.last_started_at_utc is undefined. serverData.lastStartedAtUTC not changed from current: ${serverData.lastStartedAtUTC}`);
    }
    
    // console.log(`[TimerJS - ${timerIdSuffix}] FINAL serverData after processing newState: isRunning=${serverData.isRunning}, lastStarted=${serverData.lastStartedAtUTC}, baseSec=${serverData.currentValueSeconds}`);

    updateButtonStates(); 
    manageDisplayInterval("updateTimerStateFromServer"); 
}

// Functions called by socket_handler.js upon receiving specific server events
export function handleServerTimerStarted(data) {
    // console.log(`[TimerJS - ${timerIdSuffix}] handleServerTimerStarted received data:`, JSON.stringify(data));
    // This data directly reflects the new "current run" state
    if (data && typeof data.is_running !== 'undefined') { // Ensure data is somewhat valid
        serverData.currentValueSeconds = parseInt(data.current_value_seconds, 10) || 0;
        serverData.isRunning = true; // Event implies it IS running
        serverData.lastStartedAtUTC = data.last_started_at_utc;
        // console.log(`[TimerJS - ${timerIdSuffix}] ServerData updated by 'timer_started' event:`, JSON.parse(JSON.stringify(serverData)));
        updateButtonStates();
        manageDisplayInterval("handleServerTimerStarted");
    } else {
        console.warn(`[TimerJS - ${timerIdSuffix}] 'timer_started' event received invalid data or missing is_running:`, data);
    }
}

export function handleServerTimerStopped(data) {
    // console.log(`[TimerJS - ${timerIdSuffix}] handleServerTimerStopped received data:`, JSON.stringify(data));
    if (data && typeof data.is_running !== 'undefined') { // Ensure data is somewhat valid
        serverData.currentValueSeconds = parseInt(data.current_value_seconds, 10) || 0;
        serverData.isRunning = false; // Event implies it IS stopped
        serverData.lastStartedAtUTC = null;
        // console.log(`[TimerJS - ${timerIdSuffix}] ServerData updated by 'timer_stopped' event:`, JSON.parse(JSON.stringify(serverData)));
        updateButtonStates();
        manageDisplayInterval("handleServerTimerStopped");
    } else {
         console.warn(`[TimerJS - ${timerIdSuffix}] 'timer_stopped' event received invalid data or missing is_running:`, data);
    }
}

export function handleServerTimerReset(data) {
    // console.log(`[TimerJS - ${timerIdSuffix}] handleServerTimerReset received data:`, JSON.stringify(data));
    if (data && typeof data.is_running !== 'undefined') { // Ensure data is somewhat valid
        serverData.currentValueSeconds = parseInt(data.current_value_seconds, 10) || 0; // Should be 0 from server
        serverData.isRunning = false; // Event implies it IS stopped
        serverData.lastStartedAtUTC = null;
        // console.log(`[TimerJS - ${timerIdSuffix}] ServerData updated by 'timer_reset' event:`, JSON.parse(JSON.stringify(serverData)));
        updateButtonStates();
        manageDisplayInterval("handleServerTimerReset");
    } else {
        console.warn(`[TimerJS - ${timerIdSuffix}] 'timer_reset' event received invalid data or missing is_running:`, data);
    }
}