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
    const errorDisplay = document.getElementById('formErrorDisplay'); 

    // Clear previous share results/errors
    if (shareResultDiv) {
        shareResultDiv.innerHTML = '';
        shareResultDiv.style.display = 'none';
    }
    showError(errorDisplay, null); 

    if (!window.currentChallengeData || 
        !(window.currentChallengeData.normal || window.currentChallengeData.b2b) || 
        !window.currentChallengeData.share_options) {
        console.error("No valid current challenge data found to share. Data:", window.currentChallengeData);
        showError(errorDisplay, "No valid challenge data available to share. Please generate a challenge first.");
        return;
    }

    setLoading(shareBtn, true, "Sharing..."); 

    const generatedData = window.currentChallengeData;
    const shareOptions = generatedData.share_options;

    const payload = {
        challenge_data: {
            normal: generatedData.normal || [], 
            b2b: generatedData.b2b || []      
        },
        penalty_info: generatedData.penalty_info || null, 
        name: shareOptions.challenge_name || null, 
        max_groups: shareOptions.max_groups || 1,
        num_players_per_group: shareOptions.num_players_per_group || 1
    };
    
    const shareUrl = window.shareChallengeUrl || '/api/challenge/share'; 

    try {
        console.log("Sending share request to:", shareUrl, "with payload:", JSON.stringify(payload)); 

        const response = await fetch(shareUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // 'X-CSRFToken': getCsrfToken() // Assuming you have a function getCsrfToken()
            },
            body: JSON.stringify(payload) 
        });

        let result;
        try {
             result = await response.json();
        } catch (jsonError) {
            console.error("Response was not valid JSON:", jsonError);
            throw new Error(response.statusText || `Server returned status ${response.status}`); 
        }

        console.log("Received share response:", { status: response.status, ok: response.ok, body: result }); 

        if (!response.ok) {
            throw new Error(result?.error || `Server error: ${response.status}`);
        }

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
             console.warn("Challenge shared successfully, but no share_url found in response:", result);
             showError(errorDisplay, "Challenge shared, but no URL returned.");
        }

    } catch (error) {
        console.error("Error sharing challenge:", error);
         if (shareResultDiv) {
             shareResultDiv.innerHTML = `
                <div class="alert alert-danger" role="alert">
                    Failed to share challenge: ${escapeHtml(error.message)}
                </div>`;
             shareResultDiv.style.display = 'block';
         } else {
            showError(errorDisplay, `Failed to share challenge: ${error.message}`);
         }

    } finally {
        if (shareBtn) {
            // Restore button to "Accept Challenge" but keep it disabled as action is complete/attempted
            setLoading(shareBtn, false, 'Accept Challenge'); 
            shareBtn.disabled = true;
            shareBtn.classList.add('btn-secondary'); 
            shareBtn.classList.remove('btn-primary'); 
            shareBtn.title = "Challenge accepted or attempt made. Generate a new challenge to accept again.";
            
            const originalTextSpan = shareBtn.querySelector('span:not(.spinner-border-sm)');
            if (originalTextSpan) originalTextSpan.textContent = "Accepted"; // Or "Accept Attempted"

            const shareBtnIcon = shareBtn.querySelector("i.bi");
            if (shareBtnIcon) { // Ensure icon is checkmark
                shareBtnIcon.classList.remove("bi-share-fill");
                shareBtnIcon.classList.add("bi-check-circle-fill");
            }
            const spinner = shareBtn.querySelector('.spinner-border-sm');
            if(spinner) spinner.style.display = 'none';
        }
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
     if (typeof window.shareChallengeUrl === 'undefined') {
        console.error('CRITICAL ERROR: window.shareChallengeUrl is not defined. Check Flask template variable passing in index.html.');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initializeShareButton();
});
