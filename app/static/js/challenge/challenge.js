// static/js/challenge/challenge.js
// Main entry point for the challenge generator page (index.html)

import { initializeChallengeForm } from './challenge_form.js';
import { initializeShareButton } from './challenge_share.js';

// Global variable to bridge form generation and share button
window.currentChallengeData = null;

document.addEventListener("DOMContentLoaded", () => {
    console.log("challenge.js: Initializing page...");

    // Initialize form setup, listeners, and generate logic
    initializeChallengeForm();

    // Initialize share button listener
    initializeShareButton();

    console.log("challenge.js: Page initialization complete.");
});