// static/js/app.js - Gemeinsame JavaScript-Funktionen

document.addEventListener("DOMContentLoaded", () => {
    console.log("app.js loaded");

    // Handle AJAX submission for the challenge form (if it exists)
    const challengeForm = document.getElementById("challengeForm");
    if (challengeForm) {
        challengeForm.addEventListener("submit", (e) => {
            e.preventDefault();
            submitChallengeForm(challengeForm);
        });
    }

    // Initialize timer functionality for challenge.html
    initializeTimer();
});

/**
 * Submits the challenge form via AJAX and updates the result container.
 * @param {HTMLFormElement} form - The challenge form element.
 */
const submitChallengeForm = (form) => {
    const formData = new FormData(form);
    fetch("/generate_challenge", {
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
                console.log("Challenge result updated.");
            } else {
                console.error("Element with id 'challengeResult' not found.");
            }
        }
    })
    .catch(error => console.error("Error during challenge generation:", error));
};

/**
 * Initializes the timer functionality: start, pause, and reset.
 */
const initializeTimer = () => {
    let timerInterval = null;
    let elapsedSeconds = 0;

    const timerDisplay = document.getElementById("timerDisplay");
    const btnStart = document.getElementById("btnStart");
    const btnPause = document.getElementById("btnPause");
    const btnReset = document.getElementById("btnReset");

    if (btnStart && timerDisplay) {
        const updateTimer = () => {
            elapsedSeconds++;
            const hrs = String(Math.floor(elapsedSeconds / 3600)).padStart(2, '0');
            const mins = String(Math.floor((elapsedSeconds % 3600) / 60)).padStart(2, '0');
            const secs = String(elapsedSeconds % 60).padStart(2, '0');
            timerDisplay.textContent = `${hrs}:${mins}:${secs}`;
        };

        btnStart.addEventListener("click", () => {
            clearInterval(timerInterval);
            timerInterval = setInterval(updateTimer, 1000);
            console.log("Timer started.");
        });
        btnPause.addEventListener("click", () => {
            clearInterval(timerInterval);
            console.log("Timer paused.");
        });
        btnReset.addEventListener("click", () => {
            clearInterval(timerInterval);
            elapsedSeconds = 0;
            timerDisplay.textContent = "00:00:00";
            console.log("Timer reset.");
        });
    } else {
        console.warn("Timer elements not found; skipping timer initialization.");
    }
};
