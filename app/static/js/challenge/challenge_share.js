// static/js/challenge/challenge_share.js

// Import shared API utility and helpers
import { apiFetch } from '../utils/api.js';
import { setLoading, showError, escapeHtml } from '../utils/helpers.js'; // Use common helpers

// --- REMOVED setLoadingShare and displayShareResult ---

function handleShareButtonClick() {
    console.log("Share Challenge button clicked.");
    // Use window.currentChallengeData set by challenge_form.js
    if (!window.currentChallengeData) { alert("Generate challenge first."); return; } // Use alert or showError
    if (!window.currentChallengeData.normal && !window.currentChallengeData.b2b) { alert("Generated data incomplete."); return; }

    const shareBtn = document.getElementById("shareChallengeBtn");
    const shareResultDiv = document.getElementById("shareResult"); // Target for results/errors
    const csrfTokenInput = document.querySelector('#challengeForm input[name="csrf_token"]');
    const csrfToken = csrfTokenInput?.value;

    if (!csrfToken) { showError(shareResultDiv, "Security token missing."); return; }

    // Construct payload
    const payload = {
        challenge_data: { normal: window.currentChallengeData.normal, b2b: window.currentChallengeData.b2b },
        penalty_info: window.currentChallengeData.penalty_info,
        name: document.getElementById('challengeName')?.value || null, // Read directly from form
        max_groups: parseInt(document.getElementById('maxGroups')?.value || 10, 10), // Read directly
        // auto_create_groups and player_names removed
    };
    if (isNaN(payload.max_groups) || payload.max_groups < 1) payload.max_groups = 1;

    console.log("Sharing payload:", payload);
    setLoading(shareBtn, true, 'Sharing...'); // Use common helper
    showError(shareResultDiv, null); // Clear previous result/error
    shareResultDiv.innerHTML = '<p class="text-info m-0">Sharing...</p>'; // Show loading text here
    shareResultDiv.style.display = 'block';


    apiFetch(window.shareChallengeUrl, { method: "POST", body: payload }, csrfToken)
        .then(resData => {
            console.log("Share response:", resData);
            // Display success message and link
            const successMsg = `Challenge shared! <br>Link: <a href="${resData.share_url}" target="_blank" class="alert-link user-select-all">${escapeHtml(resData.share_url)}</a> <br><small class="text-muted">(ID: ${escapeHtml(resData.public_id)})</small>`;
            // Use showError with success type (assumes alert structure)
            showError(shareResultDiv, `<div class="alert alert-success mt-2">${successMsg}</div>`); // Wrap message
             if(shareBtn) shareBtn.style.display = 'none'; // Hide button on success
        })
        .catch(err => {
            console.error("Share Fetch Error:", err);
            showError(shareResultDiv, `Error sharing: ${err.message}`); // Use showError
        })
        .finally(() => {
            // Only reset loading if button still exists (i.e., on error)
            if (shareBtn && !shareBtn.disabled) { // Check if it wasn't hidden
                setLoading(shareBtn, false);
            } else if (shareBtn && shareBtn.style.display !== 'none') {
                setLoading(shareBtn, false); // Ensure reset if error occurred before hide
            }
        });
}

// Initialization function
export function initializeShareButton() {
    const shareBtn = document.getElementById("shareChallengeBtn");
    if (shareBtn) {
        shareBtn.addEventListener("click", handleShareButtonClick);
        console.log("Share button listener attached.");
    } else {
        console.log("Share button not found (user might not be logged in).");
    }
}