// static/js/challenge/challenge_timer.js
// Handles the functionality of the timer widget on the challenge view page.

// --- Module State ---
let timerInterval = null; // Holds the interval ID
let timerStartTime = 0;   // Timestamp when timer started
let timerElapsedTime = 0; // Time elapsed *before* the current start (for pause/resume)
let isTimerRunning = false;

// --- DOM Element References (scoped within the module) ---
let timerDisplayEl = null;
let startButtonEl = null;
let stopButtonEl = null;
let resetButtonEl = null;

// --- Timer Functions ---

/** Formats milliseconds into HH:MM:SS */
function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    // Pad with leading zeros
    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
}

/** Updates the timer display element */
function updateTimerDisplay() {
    if (!timerDisplayEl) return;
    const currentTime = Date.now();
    // Calculate total elapsed time: time already elapsed + time since current start
    const totalElapsed = timerElapsedTime + (isTimerRunning ? (currentTime - timerStartTime) : 0);
    timerDisplayEl.textContent = formatTime(totalElapsed);
}

/** Starts the timer */
function startTimer() {
    if (isTimerRunning) return; // Don't start if already running
    isTimerRunning = true;
    timerStartTime = Date.now(); // Record start time of this interval
    // Update immediately, then set interval
    updateTimerDisplay();
    // Clear any existing interval just in case
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(updateTimerDisplay, 1000); // Update every second

    // Update button states
    if(startButtonEl) startButtonEl.disabled = true;
    if(stopButtonEl) stopButtonEl.disabled = false;
}

/** Stops (pauses) the timer */
function stopTimer() {
    if (!isTimerRunning) return; // Don't stop if not running
    clearInterval(timerInterval); // Stop the interval
    timerInterval = null;
    // Add the time elapsed during this interval to the total elapsed time
    timerElapsedTime += Date.now() - timerStartTime;
    isTimerRunning = false;

    // Update button states
     if(startButtonEl) startButtonEl.disabled = false;
     if(stopButtonEl) stopButtonEl.disabled = true;
}

/** Resets the timer */
function resetTimer() {
    stopTimer(); // Stop first if running
    timerElapsedTime = 0; // Reset elapsed time
    updateTimerDisplay(); // Update display to 00:00:00

    // Reset button states (enable start, disable stop)
     if(startButtonEl) startButtonEl.disabled = false;
     if(stopButtonEl) stopButtonEl.disabled = true; // Stop should be disabled when reset
}

/**
 * Initializes the timer functionality for a given timer ID.
 * Finds elements and attaches listeners.
 * @param {string} timerId - The unique identifier used in the HTML element IDs (e.g., 'main').
 */
export function initializeTimer(timerId) {
    // Find elements using the provided ID
    timerDisplayEl = document.getElementById(`timerDisplay-${timerId}`);
    startButtonEl = document.getElementById(`btnStart-${timerId}`);
    stopButtonEl = document.getElementById(`btnStop-${timerId}`);
    resetButtonEl = document.getElementById(`btnReset-${timerId}`);

    if (timerDisplayEl && startButtonEl && stopButtonEl && resetButtonEl) {
        // Attach event listeners
        startButtonEl.addEventListener('click', startTimer);
        stopButtonEl.addEventListener('click', stopTimer);
        resetButtonEl.addEventListener('click', resetTimer);

        // Set initial state
        stopButtonEl.disabled = true; // Stop is initially disabled
        updateTimerDisplay(); // Set initial display to 00:00:00
        console.log(`Timer UI initialized for ID: ${timerId}`);
    } else {
        console.warn(`Timer elements not found for ID: ${timerId}. Timer functionality disabled.`);
    }
}
