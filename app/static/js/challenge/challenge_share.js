// static/js/challenge/challenge_share.js

// Import shared API utility
import { apiFetch } from '../utils/api.js';

function setLoadingShare(buttonElement, isLoading) {
    if (!buttonElement) return;
    const originalTextSpan = buttonElement.querySelector('span:not(.spinner-border-sm)');
    const spinner = buttonElement.querySelector('.spinner-border-sm');
    if (isLoading) {
        if (!buttonElement.dataset.originalText && originalTextSpan) buttonElement.dataset.originalText = originalTextSpan.textContent.trim();
        buttonElement.disabled = true;
        buttonElement.classList.add('loading');
        if (originalTextSpan) originalTextSpan.textContent = 'Sharing...'; // Specific text
        if (spinner) spinner.style.display = 'inline-block';
    } else {
        buttonElement.disabled = false;
        buttonElement.classList.remove('loading');
        if (originalTextSpan && buttonElement.dataset.originalText) originalTextSpan.textContent = buttonElement.dataset.originalText;
        else if (originalTextSpan) originalTextSpan.textContent = 'Share Challenge'; // Default text
        if (spinner) spinner.style.display = 'none';
        delete buttonElement.dataset.originalText;
    }
}

function displayShareResult(message, type = 'danger') {
    const shareResultDiv = document.getElementById("shareResult");
    if (!shareResultDiv) { alert(message); return; } // Fallback
    // Use innerHTML to allow links
    shareResultDiv.innerHTML = `<div class="alert alert-${type} mt-2">${message}</div>`;
    shareResultDiv.style.display = 'block';
}

function handleShareButtonClick() {
    console.log("Share Challenge button clicked.");
    if (!window.currentChallengeData) { alert("No challenge generated yet."); return; }
    if (!window.currentChallengeData.normal && !window.currentChallengeData.b2b) { alert("Generated challenge data incomplete."); return; }

    const shareBtn = document.getElementById("shareChallengeBtn");

    // --- *** GET CSRF TOKEN FROM THE FORM ON INDEX.HTML *** ---
    const csrfTokenInput = document.querySelector('#challengeForm input[name="csrf_token"]');
    const csrfToken = csrfTokenInput ? csrfTokenInput.value : null;
    if (!csrfToken) {
         console.error("CSRF token input not found in #challengeForm or has no value.");
         alert("Security token missing, cannot share.");
         return;
    }
    // --- *** END GET CSRF TOKEN *** ---

    const payload = { /* ... construct payload as before ... */
        challenge_data: {
            normal: window.currentChallengeData.normal || null,
            b2b: window.currentChallengeData.b2b || null,
        },
        penalty_info: window.currentChallengeData.penalty_info,
        name: document.getElementById('challengeName')?.value || window.currentChallengeData.share_options?.challenge_name || null,
        max_groups: parseInt(document.getElementById('maxGroups')?.value || window.currentChallengeData.share_options?.max_groups || 10, 10),
        auto_create_groups: document.getElementById('autoCreateGroups')?.checked || window.currentChallengeData.share_options?.auto_create_groups || false,
        player_names: window.currentChallengeData.share_options?.player_names || []
    };
    if (isNaN(payload.max_groups) || payload.max_groups < 1) payload.max_groups = 1;

    console.log("Sharing payload:", payload);
    setLoadingShare(shareBtn, true);
    displayShareResult('<p class="text-info m-0">Sharing challenge...</p>', 'info');

    // Call API using apiFetch, passing the token
    apiFetch(window.shareChallengeUrl, {
        method: "POST",
        body: payload // apiFetch handles stringify for JSON
    }, csrfToken) // <-- *** PASS TOKEN AS THIRD ARGUMENT ***
        .then(resData => {
            console.log("Share response:", resData);
            const successMsg = `Challenge shared! <br>Link: <a href="${resData.share_url}" target="_blank" class="alert-link user-select-all">${resData.share_url}</a> <br><small class="text-muted">(ID: ${resData.public_id})</small>`;
            displayShareResult(successMsg, 'success');
            if(shareBtn) {
                shareBtn.style.display = 'none';
                console.log("Share button hidden after successful share.");
            }
        })
        .catch(err => {
            console.error("Share Fetch Error:", err);
            displayShareResult(`Error sharing challenge: ${err.message}`, 'danger');
        })
        .finally(() => {
            setLoadingShare(shareBtn, false);
        });
}

// Initialization function for the share button part
export function initializeShareButton() {
    const shareBtn = document.getElementById("shareChallengeBtn");
    if (shareBtn) {
        shareBtn.addEventListener("click", handleShareButtonClick);
        console.log("Share button listener attached.");
    } else {
        console.log("Share button not found (user might not be logged in).");
    }
}