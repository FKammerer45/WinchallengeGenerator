// app/static/js/app.js - Common JavaScript functions

document.addEventListener("DOMContentLoaded", () => {
    console.log("app.js loaded");

    // Handle AJAX submission for the challenge form (if it exists)
    // NOTE: This handler is likely REDUNDANT if challenge.js is used on index.html
    // Commenting it out to prevent potential conflicts. If you need this specific
    // simple handler elsewhere, uncomment it or ensure challenge.js isn't loaded there.
    /*
    const challengeForm = document.getElementById("challengeForm");
    if (challengeForm) {
        challengeForm.addEventListener("submit", (e) => {
            console.log("app.js: Challenge form submit detected (potentially redundant).");
            e.preventDefault();
            submitChallengeForm(challengeForm);
        });
    }
    */

    // Initialize timer functionality if timer elements are present on the current page
    // This timer logic seems generic (using hardcoded IDs) and might conflict
    // with the multi-timer logic in challenge.html. Consider removing if unused
    // or making IDs more specific if needed on multiple pages.
    initializeTimer();
});

/**
 * Submits the challenge form via AJAX (Simpler Version - LIKELY REDUNDANT)
 * @param {HTMLFormElement} form - The challenge form element.
 */
/*
const submitChallengeForm = (form) => {
    const formData = new FormData(form);
    // This uses the old, non-namespaced URL and doesn't include entries/modes
    fetch("/generate_challenge", { // Problematic URL and logic if challenge.js is primary
        method: "POST",
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            alert(data.error);
        } else {
            const resultContainer = document.getElementById("challengeResult");
            if (resultContainer) {
                resultContainer.innerHTML = data.result;
                console.log("app.js: Challenge result updated.");
            } else {
                console.error("Element with id 'challengeResult' not found.");
            }
        }
    })
    .catch(error => console.error("Error during app.js challenge generation:", error));
};
*/

/**
 * Initializes the timer functionality: start, pause, and reset.
 * NOTE: This uses generic IDs (timerDisplay, btnStart etc.) which might conflict
 * with dynamically generated IDs (e.g., on challenge.html).
 * Review if this timer is actually needed or if IDs should be parameterized.
 */
const initializeTimer = () => {
    let timerInterval = null;
    let elapsedSeconds = 0;

    // Use more specific selectors if these IDs are reused elsewhere
    const timerDisplay = document.getElementById("timerDisplay");
    const btnStart = document.getElementById("btnStart");
    const btnPause = document.getElementById("btnPause"); // Check if btnStop exists instead/as well
    const btnReset = document.getElementById("btnReset");

    if (btnStart && btnPause && btnReset && timerDisplay) { // Check all buttons exist
        const updateTimer = () => {
            elapsedSeconds++;
            const hrs = String(Math.floor(elapsedSeconds / 3600)).padStart(2, '0');
            const mins = String(Math.floor((elapsedSeconds % 3600) / 60)).padStart(2, '0');
            const secs = String(elapsedSeconds % 60).padStart(2, '0');
            timerDisplay.textContent = `${hrs}:${mins}:${secs}`;
        };

        btnStart.addEventListener("click", () => {
            clearInterval(timerInterval); // Clear any existing interval
            timerInterval = setInterval(updateTimer, 1000);
            console.log("Generic Timer started.");
        });
        btnPause.addEventListener("click", () => {
            clearInterval(timerInterval);
            console.log("Generic Timer paused.");
        });
        btnReset.addEventListener("click", () => {
            clearInterval(timerInterval);
            elapsedSeconds = 0;
            timerDisplay.textContent = "00:00:00";
            console.log("Generic Timer reset.");
        });
         console.log("Generic Timer initialized.");
    } else {
        // This is normal if the current page doesn't have the timer elements
        // console.warn("Generic timer elements not found; skipping timer initialization.");
    }
};