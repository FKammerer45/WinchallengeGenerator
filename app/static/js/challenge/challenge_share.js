// static/js/challenge/challenge_share.js

// Import shared API utility and helpers
import { apiFetch } from '../utils/api.js';
import { setLoading, showError, escapeHtml } from '../utils/helpers.js'; // Use common helpers



function handleShareButtonClick() {
    console.log("Share Challenge button clicked.");
    const shareBtn = document.getElementById("shareChallengeBtn");
    // --- Use #shareResult for errors/status ---
    const shareResultDiv = document.getElementById("shareResult");

    // Clear previous results/errors
    showError(shareResultDiv, null);

    if (!window.currentChallengeData) { showError(shareResultDiv, "Generate challenge first."); return; }
    if (!window.currentChallengeData.normal && !window.currentChallengeData.b2b) { showError(shareResultDiv, "Generated data incomplete."); return; }

    const csrfTokenInput = document.querySelector('#challengeForm input[name="csrf_token"]');
    const csrfToken = csrfTokenInput?.value;
    if (!csrfToken) { showError(shareResultDiv, "Security token missing."); return; }

    const payload = { /* ... construct payload ... */
         challenge_data: { normal: window.currentChallengeData.normal, b2b: window.currentChallengeData.b2b },
         penalty_info: window.currentChallengeData.penalty_info,
         name: document.getElementById('challengeName')?.value || null,
         max_groups: parseInt(document.getElementById('maxGroups')?.value || 10, 10),
    };
     if (isNaN(payload.max_groups) || payload.max_groups < 1) payload.max_groups = 1;

    console.log("Sharing payload:", payload);
    setLoading(shareBtn, true, 'Sharing...'); // Use common helper
    shareResultDiv.innerHTML = '<p class="text-info m-0 p-2">Sharing...</p>'; // Show loading text here
    shareResultDiv.style.display = 'block';

    apiFetch(window.shareChallengeUrl, { method: "POST", body: payload }, csrfToken)
        .then(resData => {
            console.log("Share response:", resData);
            const successMsg = `Challenge shared! <br>Link: <a href="${resData.share_url}" target="_blank" class="alert-link user-select-all">${escapeHtml(resData.share_url)}</a> <br><small class="text-muted">(ID: ${escapeHtml(resData.public_id)})</small>`;
            // Display result HTML using innerHTML within an alert structure
            shareResultDiv.innerHTML = `<div class="alert alert-success mt-2">${successMsg}</div>`;
            if(shareBtn) shareBtn.style.display = 'none';
        })
        .catch(err => {
            console.error("Share Fetch Error:", err);
            showError(shareResultDiv, `Error sharing: ${err.message}`, 'danger'); // Use helper for errors
        })
        .finally(() => {
            // Reset loading only if button wasn't hidden on success
            if (shareBtn && shareBtn.style.display !== 'none') {
                setLoading(shareBtn, false);
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