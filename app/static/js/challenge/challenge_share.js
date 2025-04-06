// static/js/challenge/challenge_share.js

// Import shared API utility and helpers
import { apiFetch } from '../utils/api.js';
import { setLoading, showError, escapeHtml } from '../utils/helpers.js'; // Use common helpers



function handleShareButtonClick() {
    console.log("Share Challenge button clicked.");
    const shareBtn = document.getElementById("shareChallengeBtn");
    const shareResultDiv = document.getElementById("shareResult");

    showError(shareResultDiv, null); // Clear previous

    // Check if data exists from generation step
    if (!window.currentChallengeData || (!window.currentChallengeData.normal && !window.currentChallengeData.b2b)) {
        showError(shareResultDiv, "Generate challenge data first or data is incomplete.", "warning");
        return;
    }

    // Get CSRF token
    const csrfTokenInput = document.querySelector('#challengeForm input[name="csrf_token"]');
    const csrfToken = csrfTokenInput?.value;
    if (!csrfToken) { showError(shareResultDiv, "Security token missing.", "danger"); return; }

    // --- Construct Payload - Ensure all fields are included ---
    const payload = {
        challenge_data: {
            normal: window.currentChallengeData.normal || null, // Include null if missing
            b2b: window.currentChallengeData.b2b || null
        },
        penalty_info: window.currentChallengeData.penalty_info || null, // Can be null
        name: document.getElementById('challengeName')?.value || null,
        // Read max_groups and num_players_per_group from the data returned by /generate
        max_groups: parseInt(window.currentChallengeData.share_options?.max_groups || 10, 10),
        num_players_per_group: parseInt(window.currentChallengeData.share_options?.num_players_per_group || 1, 10) // <-- ADD THIS
    };
    // --- End Payload Construction ---

    // Basic validation on parsed values
    if (isNaN(payload.max_groups) || payload.max_groups < 1) payload.max_groups = 1;
    if (isNaN(payload.num_players_per_group) || payload.num_players_per_group < 1) payload.num_players_per_group = 1;

    console.log("Sharing payload:", payload); // Log the complete payload
    setLoading(shareBtn, true, 'Sharing...');
    shareResultDiv.innerHTML = '<p class="text-info m-0 p-2">Sharing...</p>';
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