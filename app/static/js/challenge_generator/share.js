// static/js/challenge_generator/share.js

// Assuming helpers.js is in utils/
import { showError, escapeHtml, setLoading } from '../utils/helpers.js'; 
// Assuming api.js contains your fetch wrapper, otherwise use fetch directly
// import { postData } from '../utils/api.js'; 

/**
 * Handles the click event for the "Share Challenge" button.
 * Reads generated challenge data, sends it to the backend /api/challenge/share endpoint,
 * and displays the result (share URL or error message).
 */
async function handleShareButtonClick() {
    console.log("Share button clicked."); // Debug log
    const shareBtn = document.getElementById("shareChallengeBtn");
    const shareResultDiv = document.getElementById('shareResult');
    const errorDisplay = document.getElementById('formErrorDisplay'); // Use main form error display

    // Clear previous share results/errors
    if (shareResultDiv) {
        shareResultDiv.innerHTML = '';
        shareResultDiv.style.display = 'none';
    }
    showError(errorDisplay, null); // Clear main form errors too

    // Check if challenge data is available (should be set by form.js)
    // Ensure it has the necessary parts (normal/b2b and share_options)
    if (!window.currentChallengeData || 
        !(window.currentChallengeData.normal || window.currentChallengeData.b2b) || 
        !window.currentChallengeData.share_options) {
        console.error("No valid current challenge data found to share. Data:", window.currentChallengeData);
        showError(errorDisplay, "No valid challenge data available to share. Please generate a challenge first.");
        return;
    }

    setLoading(shareBtn, true, "Sharing..."); // Show loading state on button

    // --- MODIFICATION START: Correctly construct payload ---
    const generatedData = window.currentChallengeData;
    const shareOptions = generatedData.share_options;

    // Prepare payload for the backend API
    const payload = {
        // Construct challenge_data object expected by backend
        challenge_data: {
            normal: generatedData.normal || [], // Use generated data, default to empty array
            b2b: generatedData.b2b || []      // Use generated data, default to empty array
        },
        penalty_info: generatedData.penalty_info || null, // Use generated data or null
        name: shareOptions.challenge_name || null, // Use name from share_options or null
        max_groups: shareOptions.max_groups || 1,
        num_players_per_group: shareOptions.num_players_per_group || 1
    };
    // --- MODIFICATION END ---


    // Ensure the share URL is defined (passed from Flask template)
    const shareUrl = window.shareChallengeUrl || '/api/challenge/share'; // Fallback URL

    try {
        console.log("Sending share request to:", shareUrl, "with payload:", JSON.stringify(payload)); // Log the corrected payload

        // Use fetch API directly
        const response = await fetch(shareUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Include CSRF token header if your backend requires it for APIs
                // 'X-CSRFToken': getCsrfToken() // Assuming you have a function getCsrfToken()
            },
            body: JSON.stringify(payload) // Send the corrected payload
        });

        // Try to parse JSON regardless of status code first to get potential error messages
        let result;
        try {
             result = await response.json();
        } catch (jsonError) {
            // If response is not JSON (like an HTML error page), create a generic error
            console.error("Response was not valid JSON:", jsonError);
            // Use statusText if available, otherwise generic message
            throw new Error(response.statusText || `Server returned status ${response.status}`); 
        }

        console.log("Received share response:", { status: response.status, ok: response.ok, body: result }); // Debug log

        if (!response.ok) {
            // Throw error using message from JSON response if available
            throw new Error(result?.error || `Server error: ${response.status}`);
        }

        // --- Success ---
        if (shareResultDiv && result.share_url) {
             shareResultDiv.innerHTML = `
                <div class="alert alert-success alert-dismissible fade show" role="alert">
                    Challenge shared successfully! 
                    <br>
                    Share Link: <a href="${escapeHtml(result.share_url)}" target="_blank" class="alert-link">${escapeHtml(result.share_url)}</a>
                    <button type="button" class="close" data-dismiss="alert" aria-label="Close">
                        <span aria-hidden="true">&times;</span>
                    </button>
                </div>`;
            shareResultDiv.style.display = 'block';
        } else {
             // Handle success case where URL might be missing unexpectedly
             console.warn("Challenge shared successfully, but no share_url found in response:", result);
             showError(errorDisplay, "Challenge shared, but no URL returned.");
        }

    } catch (error) {
        console.error("Error sharing challenge:", error);
        // Display error message
         if (shareResultDiv) {
             shareResultDiv.innerHTML = `
                <div class="alert alert-danger" role="alert">
                    Failed to share challenge: ${escapeHtml(error.message)}
                </div>`;
             shareResultDiv.style.display = 'block';
         } else {
            // Fallback to main error display
            showError(errorDisplay, `Failed to share challenge: ${error.message}`);
         }

    } finally {
        setLoading(shareBtn, false, "Share Challenge"); // Restore button state
    }
}


/**
 * Initializes the Share Challenge button functionality.
 */
function initializeShareButton() {
    const shareBtn = document.getElementById("shareChallengeBtn");
    if (shareBtn) {
        shareBtn.addEventListener('click', handleShareButtonClick);
        console.log("Share button event listener attached."); // Debug log
    } else {
        console.warn("Share button (#shareChallengeBtn) not found on page load.");
    }
     // Ensure share URL is available
     if (typeof window.shareChallengeUrl === 'undefined') {
        console.error('CRITICAL ERROR: window.shareChallengeUrl is not defined. Check Flask template variable passing in index.html.');
    }
}

// --- Wait for DOM Ready and Initialize ---
// Ensures the share button exists before adding listener
document.addEventListener('DOMContentLoaded', () => {
    initializeShareButton();
});
