// app/static/js/challenge_view/realtime/timerHandler.js
import { apiFetch } from '../../utils/api.js';
import { challengeConfig } from '../config.js'; // Get base URLs and CSRF token
import { setLoading, showError, showFlash } from '../../utils/helpers.js';

// --- Module-scoped variables ---
let displayInterval = null;
let serverData = { // This will be the authoritative state, updated by server events or init
    currentValueSeconds: 0,
    isRunning: false,
    lastStartedAtUTC: null
};
let isUserAuthorized = false; // Set by initializeTimer
let timerIdSuffix = 'main';   // Can be set during initialization

// DOM Element references - will be re-queried as needed or set in init
let timerDisplayEl = null;
let startButtonEl = null;
let stopButtonEl = null;
let resetButtonEl = null;

let lastActionDispatchedTime = 0;
const MIN_INTERVAL_BETWEEN_ACTIONS_MS = 1000; // Cooldown period for actions
let requestControllers = { timer: null }; // For aborting timer API requests

// --- Helper Functions ---
function nextSignal(key) {
    requestControllers[key]?.abort?.();
    const ctrl = new AbortController();
    requestControllers[key] = ctrl;
    return ctrl.signal;
}

function formatTime(totalSeconds) {
    totalSeconds = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function updateTimerDisplay() {
    // Use module-scoped timerDisplayEl (set in initializeTimer)
    if (!timerDisplayEl) {
        return;
    }

    let displaySeconds = serverData.currentValueSeconds;
    if (serverData.isRunning && serverData.lastStartedAtUTC) {
        try {
            const startTimeMillis = new Date(serverData.lastStartedAtUTC).getTime();
            if (!isNaN(startTimeMillis)) {
                const elapsedSinceStart = Math.floor((Date.now() - startTimeMillis) / 1000);
                displaySeconds = serverData.currentValueSeconds + elapsedSinceStart;
            }
        } catch (e) {
            console.error("[TimerHandler - %s] Error parsing lastStartedAtUTC for display:", timerIdSuffix, e);
        }
    }
    timerDisplayEl.textContent = formatTime(displaySeconds);
}

function updateButtonStates() {
    // Use module-scoped button elements (set in initializeTimer)
    if (!startButtonEl || !stopButtonEl || !resetButtonEl) {
        // If elements aren't found during init, this won't run, or they might be null.
        // This check is more of a safeguard if called before proper init, though unlikely.
        return;
    }

    if (isUserAuthorized) {
        startButtonEl.disabled = serverData.isRunning;
        stopButtonEl.disabled = !serverData.isRunning;
        resetButtonEl.disabled = false; // Generally always enabled if authorized
    } else {
        startButtonEl.disabled = true;
        stopButtonEl.disabled = true;
        resetButtonEl.disabled = true;
    }
}

function manageDisplayInterval(callOrigin = "unknown") {
    if (displayInterval) {
        clearInterval(displayInterval);
        displayInterval = null;
    }

    if (serverData.isRunning) {
        updateTimerDisplay(); // Update once immediately
        displayInterval = setInterval(updateTimerDisplay, 1000);
        // console.log(`[TimerHandler - ${timerIdSuffix}] Started display interval. Origin: ${callOrigin}`);
    } else {
        updateTimerDisplay(); // Update to final stopped value
        // console.log(`[TimerHandler - ${timerIdSuffix}] Display interval stopped. Origin: ${callOrigin}`);
    }
}

async function sendTimerAction(actionType) {
    if (challengeConfig.isLocal || !isUserAuthorized) return;

    const now = Date.now();
    if (now - lastActionDispatchedTime < MIN_INTERVAL_BETWEEN_ACTIONS_MS) {
        // console.warn(`[TimerHandler - ${timerIdSuffix}] ${actionType} action IGNORED (cooldown).`); // Optional: keep if useful for debugging rapid clicks
        return;
    }
    lastActionDispatchedTime = now;

    let url;
    let buttonToLock;

    switch (actionType) {
        case 'start':
            url = challengeConfig.urls.timerStart;
            buttonToLock = startButtonEl; // Use module-scoped reference
            // Optimistic UI for buttons
            setLoading(buttonToLock, true, "Starting...");
            // serverData.isRunning = true; // Let server event confirm this
            // updateButtonStates();
            break;
        case 'stop':
            url = challengeConfig.urls.timerStop;
            buttonToLock = stopButtonEl;
            setLoading(buttonToLock, true, "Stopping...");
            // serverData.isRunning = false;
            // updateButtonStates();
            break;
        case 'reset':
            url = challengeConfig.urls.timerReset;
            buttonToLock = resetButtonEl;
            setLoading(buttonToLock, true, "Resetting...");
            // serverData.isRunning = false;
            // serverData.currentValueSeconds = 0;
            // serverData.lastStartedAtUTC = null;
            // updateButtonStates();
            // manageDisplayInterval("sendTimerAction_reset_optimistic");
            break;
        default:
            console.error("[TimerHandler - %s] Unknown timer action: %s", timerIdSuffix, actionType);
            return;
    }

    if (!url) {
        showError(document.getElementById('pageStatusDisplay') || document.body, `Timer ${actionType} URL not configured.`, "danger"); // User-facing, template literal is fine
        if(buttonToLock) setLoading(buttonToLock, false);
        return;
    }

    try {
        await apiFetch(url, { method: 'POST', signal: nextSignal('timer') }, challengeConfig.csrfToken);
        // Backend will emit WebSocket event.
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error("[TimerHandler - %s] API Error for %s:", timerIdSuffix, actionType, error);
            showError(document.getElementById('pageStatusDisplay') || document.body, `Error ${actionType} timer: ${error.message}`, "danger"); // User-facing, template literal is fine
            // Revert optimistic UI if necessary, or wait for a full state sync from server
            // For simplicity, we'll rely on the next initial_state or a manual refresh if things get out of sync.
            // Or, explicitly call updateTimerStateFromServer with the PREVIOUS state if you stored it.
        }
    } finally {
         if(buttonToLock) setLoading(buttonToLock, false); // setLoading handles restoring original text
    }
}

/**
 * Initializes the timer module.
 * @param {string} idSuffix - Suffix for DOM element IDs (e.g., 'main').
 * @param {object} initialTimerState - Initial state from server/config.
 * @param {boolean} authorized - Whether the current user is authorized to control the timer.
 */
export function initializeTimer(idSuffix, initialTimerStateFromConfig, authorized) {
    timerIdSuffix = idSuffix || 'main';
    isUserAuthorized = authorized;

    // Set module-scoped DOM element references
    timerDisplayEl = document.getElementById(`timerDisplay-${timerIdSuffix}`);
    startButtonEl = document.getElementById(`btnStart-${timerIdSuffix}`);
    stopButtonEl = document.getElementById(`btnStop-${timerIdSuffix}`);
    resetButtonEl = document.getElementById(`btnReset-${timerIdSuffix}`);

    // Update internal serverData from the initial state passed from config.js
    updateTimerStateFromServer(initialTimerStateFromConfig); // This also calls updateButtonStates and manageDisplayInterval

    // Attach event listeners if authorized and elements exist
    if (isUserAuthorized) {
        if (startButtonEl) startButtonEl.addEventListener('click', () => sendTimerAction('start'));
        if (stopButtonEl) stopButtonEl.addEventListener('click', () => sendTimerAction('stop'));
        if (resetButtonEl) resetButtonEl.addEventListener('click', () => sendTimerAction('reset'));
    }
}

/**
 * Updates the timer state based on comprehensive state push (e.g., from initial_state or direct update).
 * This is the primary way the timer's internal `serverData` should be updated from external sources.
 * @param {object} newState - The new state object {current_value_seconds, is_running, last_started_at_utc}.
 */
export function updateTimerStateFromServer(newState) {
    if (!newState) {
        // console.warn(`[TimerHandler - ${timerIdSuffix}] updateTimerStateFromServer called with no state.`);
        // If no state is provided, we might want to ensure buttons reflect current (potentially default) serverData.
        updateButtonStates();
        manageDisplayInterval("updateTimerStateFromServer_no_newState");
        return;
    }

    let baseSeconds = serverData.currentValueSeconds; // Default to current if not in newState
    if (typeof newState.current_value_seconds !== 'undefined') {
        const parsedSec = parseInt(newState.current_value_seconds, 10);
        baseSeconds = isNaN(parsedSec) ? 0 : parsedSec;
    }
    serverData.currentValueSeconds = baseSeconds;

    let runningState = serverData.isRunning; // Default to current
    if (typeof newState.is_running !== 'undefined') {
        runningState = typeof newState.is_running === 'boolean' ? newState.is_running : String(newState.is_running).toLowerCase() === 'true';
    }
    serverData.isRunning = runningState;

    let lastStarted = serverData.lastStartedAtUTC; // Default to current
    if (typeof newState.last_started_at_utc !== 'undefined') { // Allows setting to null
        lastStarted = newState.last_started_at_utc || null;
    }
    serverData.lastStartedAtUTC = lastStarted;

    updateButtonStates();
    manageDisplayInterval("updateTimerStateFromServer");
}


// --- Functions called by socket_handler.js upon receiving specific server events ---
export function handleServerTimerStarted(data) {
    if (data && typeof data.is_running !== 'undefined') {
        serverData.currentValueSeconds = parseInt(data.current_value_seconds, 10) || 0;
        serverData.isRunning = true; // Event implies it IS running
        serverData.lastStartedAtUTC = data.last_started_at_utc;
        updateButtonStates();
        manageDisplayInterval("handleServerTimerStarted");
    } else {
        console.warn(`[TimerHandler - ${timerIdSuffix}] 'timer_started' event received invalid data. State may be inconsistent.`);
    }
}

export function handleServerTimerStopped(data) {
    if (data && typeof data.is_running !== 'undefined') {
        serverData.currentValueSeconds = parseInt(data.current_value_seconds, 10) || 0;
        serverData.isRunning = false; // Event implies it IS stopped
        serverData.lastStartedAtUTC = null;
        updateButtonStates();
        manageDisplayInterval("handleServerTimerStopped");
    } else {
        console.warn(`[TimerHandler - ${timerIdSuffix}] 'timer_stopped' event received invalid data. State may be inconsistent.`);
    }
}

export function handleServerTimerReset(data) {
    if (data && typeof data.is_running !== 'undefined') { // Server should confirm it's not running
        serverData.currentValueSeconds = parseInt(data.current_value_seconds, 10) || 0; // Should be 0
        serverData.isRunning = false;
        serverData.lastStartedAtUTC = null;
        updateButtonStates();
        manageDisplayInterval("handleServerTimerReset");
    } else {
         console.warn(`[TimerHandler - ${timerIdSuffix}] 'timer_reset' event received invalid data. State may be inconsistent.`);
    }
}
