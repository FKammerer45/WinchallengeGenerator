// app/static/js/challenge_view/timer.js

let displayInterval = null;
let serverData = { currentValueSeconds: 0, isRunning: false, lastStartedAtUTC: null };
let isUserAuthorized = false;
let timerIdSuffix = 'main';

let timerDisplayEl = null;
let startButtonEl = null;
let stopButtonEl = null;
let resetButtonEl = null;

let lastActionDispatchedTime = 0;
const MIN_INTERVAL_BETWEEN_ACTIONS_MS = 1000; // Cooldown

function formatTime(totalSeconds) {
    totalSeconds = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function updateTimerDisplay() {
    const currentTimerDisplayEl = document.getElementById(`timerDisplay-${timerIdSuffix}`); // Query fresh

    if (!currentTimerDisplayEl) {
        // This log will now correctly indicate if the element is missing AT THE TIME OF THE TICK
        console.warn(`[TimerJS TICK - ${timerIdSuffix}] updateTimerDisplay: DOM element #timerDisplay-${timerIdSuffix} not found! Cannot update display.`);
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
                console.warn(`[TimerJS - ${timerIdSuffix}] Invalid lastStartedAtUTC for display: ${serverData.lastStartedAtUTC}`);
            }
        } catch (e) {
            console.error(`[TimerJS - ${timerIdSuffix}] Error parsing lastStartedAtUTC during display update:`, e);
        }
    }
    const formattedTime = formatTime(displaySeconds);
    currentTimerDisplayEl.textContent = formattedTime; // Use the fresh reference

    // console.log(`[TimerJS TICK - ${timerIdSuffix}] isRunning: ${serverData.isRunning}, lastStarted: ${serverData.lastStartedAtUTC}, baseSec: ${serverData.currentValueSeconds}, calculatedDisplaySec: ${displaySeconds}, formatted: ${formattedTime}, targetEl ID: ${currentTimerDisplayEl.id}`);
}

function manageDisplayInterval() {
    console.log(`[TimerJS - ${timerIdSuffix}] manageDisplayInterval called. serverData.isRunning: ${serverData.isRunning}`); // New log

    if (displayInterval) clearInterval(displayInterval);
    displayInterval = null;
    if (serverData.isRunning) {
        updateTimerDisplay();
        displayInterval = setInterval(updateTimerDisplay, 1000);
        console.log(`[TimerJS - ${timerIdSuffix}] Started display interval. isRunning: ${serverData.isRunning}, lastStarted: ${serverData.lastStartedAtUTC}`);
    } else {
        updateTimerDisplay();
        console.log(`[TimerJS - ${timerIdSuffix}] Timer not running. Interval stopped. Value: ${serverData.currentValueSeconds}`);
    }
}

function updateButtonStates() {
    if (!startButtonEl || !stopButtonEl || !resetButtonEl) return;
    if (isUserAuthorized) {
        startButtonEl.disabled = serverData.isRunning;
        stopButtonEl.disabled = !serverData.isRunning;
        resetButtonEl.disabled = false; // Reset is usually always enabled if authorized
        console.log(`[VISUAL DEBUG] startButtonEl.id: ${startButtonEl.id}, startButtonEl.disabled: ${startButtonEl.disabled}`);

    } else {
        [startButtonEl, stopButtonEl, resetButtonEl].forEach(btn => btn.disabled = true);
    }
}

export function initializeTimer(idSuffix, initialTimerState, authorized) {
    timerIdSuffix = idSuffix;
    isUserAuthorized = authorized;

    timerDisplayEl = document.getElementById(`timerDisplay-${timerIdSuffix}`);
    startButtonEl = document.getElementById(`btnStart-${timerIdSuffix}`);
    stopButtonEl = document.getElementById(`btnStop-${timerIdSuffix}`);
    resetButtonEl = document.getElementById(`btnReset-${timerIdSuffix}`);

    if (startButtonEl && resetButtonEl && startButtonEl === resetButtonEl) {
        console.error(`[TimerJS - ${timerIdSuffix}] CRITICAL: Start and Reset buttons are SAME DOM ELEMENT!`);
    }

    if (initialTimerState) {
        serverData.currentValueSeconds = parseInt(initialTimerState.current_value_seconds, 10) || 0;
        serverData.isRunning = initialTimerState.is_running === true || String(initialTimerState.is_running).toLowerCase() === 'true';
        serverData.lastStartedAtUTC = initialTimerState.last_started_at_utc || null;
    } else {
        serverData = { currentValueSeconds: 0, isRunning: false, lastStartedAtUTC: null };
    }
    console.log(`[TimerJS - ${timerIdSuffix}] Initialized. Authorized: ${isUserAuthorized}, State:`, JSON.parse(JSON.stringify(serverData)));
    updateButtonStates();
    manageDisplayInterval();

    if (isUserAuthorized) {
        if (startButtonEl) {
            startButtonEl.addEventListener('click', (event) => {
                if (event.currentTarget !== startButtonEl || startButtonEl.disabled) return; // Check if already disabled
                const now = Date.now();
                if (now - lastActionDispatchedTime < MIN_INTERVAL_BETWEEN_ACTIONS_MS) {
                    console.warn(`[TimerJS - ${timerIdSuffix}] Start click IGNORED (cooldown).`);
                    return;
                }
                if (!serverData.isRunning) { // Condition to start
                    lastActionDispatchedTime = now;

                    // --- OPTIMISTIC UI UPDATE ---
                    serverData.isRunning = true; // Assume it will start
                    updateButtonStates(); // Immediately disable Start, enable Stop
                    // We don't set serverData.lastStartedAtUTC here, server will provide it
                    // --- END OPTIMISTIC UI UPDATE ---
                    if (startButtonEl.disabled && document.activeElement === startButtonEl) {
                        startButtonEl.blur(); // Force the button to lose focus
                        console.log("[TimerJS Test] Blurred startButtonEl after disabling");
                    }
                    console.log(`[TimerJS - ${timerIdSuffix}] Dispatching requestTimerStart.`);
                    document.dispatchEvent(new CustomEvent('requestTimerStart', { detail: { timerId: timerIdSuffix } }));
                }
            });
        }

        if (stopButtonEl) {
            stopButtonEl.addEventListener('click', (event) => {
                if (event.currentTarget !== stopButtonEl || stopButtonEl.disabled) return;
                const now = Date.now();
                if (now - lastActionDispatchedTime < MIN_INTERVAL_BETWEEN_ACTIONS_MS) {
                    console.warn(`[TimerJS - ${timerIdSuffix}] Stop click IGNORED (cooldown).`);
                    return;
                }
                if (serverData.isRunning) { // Condition to stop
                    lastActionDispatchedTime = now;

                    // --- OPTIMISTIC UI UPDATE ---
                    serverData.isRunning = false; // Assume it will stop
                    // Simulate the accumulation locally for immediate display if desired,
                    // but server will send the authoritative current_value_seconds.
                    // For button state, isRunning = false is enough.
                    updateButtonStates(); // Immediately disable Stop, enable Start
                    // --- END OPTIMISTIC UI UPDATE ---

                    console.log(`[TimerJS - ${timerIdSuffix}] Dispatching requestTimerStop.`);
                    document.dispatchEvent(new CustomEvent('requestTimerStop', { detail: { timerId: timerIdSuffix } }));
                }
            });
        }

        if (resetButtonEl) {
            resetButtonEl.addEventListener('click', (event) => {
                if (event.currentTarget !== resetButtonEl || resetButtonEl.disabled) return; // Though reset is rarely disabled if authorized
                const now = Date.now();
                if (now - lastActionDispatchedTime < MIN_INTERVAL_BETWEEN_ACTIONS_MS) {
                    console.warn(`[TimerJS - ${timerIdSuffix}] Reset click IGNORED (cooldown).`);
                    return;
                }
                lastActionDispatchedTime = now;

                // --- OPTIMISTIC UI UPDATE ---
                serverData.isRunning = false;
                serverData.currentValueSeconds = 0;
                serverData.lastStartedAtUTC = null;
                updateButtonStates(); // Update buttons immediately
                manageDisplayInterval(); // Update display immediately to 00:00:00
                // --- END OPTIMISTIC UI UPDATE ---

                console.log(`[TimerJS - ${timerIdSuffix}] Dispatching requestTimerReset.`);
                document.dispatchEvent(new CustomEvent('requestTimerReset', { detail: { timerId: timerIdSuffix } }));
            });
        }
    }
}
export function handleServerTimerStarted(data) {
    if (!data) { console.error("[TimerJS] handleServerTimerStarted: no data."); return; }
    console.log(`[TimerJS - ${timerIdSuffix}] Received timer_started from server:`, data);
    serverData.currentValueSeconds = parseInt(data.current_value_seconds, 10) || 0; // Use 0 as fallback
    serverData.isRunning = true;
    serverData.lastStartedAtUTC = data.last_started_at_utc;
    if (!serverData.lastStartedAtUTC) console.warn(`[TimerJS] timer_started event missing last_started_at_utc.`);
    updateButtonStates(); // Confirm button states
    manageDisplayInterval();
}

export function handleServerTimerStopped(data) {
    if (!data) { console.error("[TimerJS] handleServerTimerStopped: no data."); return; }
    console.log(`[TimerJS - ${timerIdSuffix}] Received timer_stopped from server:`, data);
    serverData.currentValueSeconds = parseInt(data.current_value_seconds, 10) || 0;
    serverData.isRunning = false;
    serverData.lastStartedAtUTC = null;
    updateButtonStates(); // Confirm button states
    manageDisplayInterval();
}

export function handleServerTimerReset(data) { // data might just confirm the action or send the new state
    if (!data) { console.error("[TimerJS] handleServerTimerReset: no data."); return; }
    console.log(`[TimerJS - ${timerIdSuffix}] Received timer_reset from server:`, data);
    serverData.currentValueSeconds = 0; // Server confirms it's 0
    serverData.isRunning = false;
    serverData.lastStartedAtUTC = null;
    updateButtonStates(); // Confirm button states
    manageDisplayInterval();
}

export function updateTimerStateFromServer(newState) {
    if (!newState) {
        console.warn(`[TimerJS - ${timerIdSuffix}] updateTimerStateFromServer called with no state.`);
        return;
    }
    console.log(`[TimerJS - ${timerIdSuffix}] Updating timer state from full server push:`, newState);

    serverData.currentValueSeconds = parseInt(newState.current_value_seconds || newState.base_value_seconds, 10) || 0; // Use base_value_seconds if available from corrected initial_state
    const isRunningString = String(newState.is_running).toLowerCase();
    serverData.isRunning = newState.is_running === true || isRunningString === 'true';
    serverData.lastStartedAtUTC = newState.last_started_at_utc || null;

    updateButtonStates();
    manageDisplayInterval(); // This is key to restart/stop the interval
}