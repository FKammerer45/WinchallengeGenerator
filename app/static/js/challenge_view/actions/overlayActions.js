// app/static/js/challenge_view/actions/overlayActions.js
import { apiFetch } from '../../utils/api.js';
import { setLoading, showError, showFlash, escapeHtml } from '../../utils/helpers.js';

/**
 * Handles showing and copying the OBS overlay link.
 * @param {Event} event - The click event.
 * @param {object} challengeConfig - The main challenge configuration object.
 * @param {HTMLElement} statusDiv - General status display div (optional, for broader errors).
 */
export async function handleShowOverlayLink(event, challengeConfig, statusDiv) {
    const button = event.target.closest('#showOverlayLinkBtn');
    if (!button) return;

    // Use the card-body as the section and get elements by ID
    const overlaySection = button.closest('.card-body');
    if (!overlaySection) {
        console.error("Overlay link section (.card-body) not found.");
        if (statusDiv) showError(statusDiv, "UI error for overlay link.", "warning");
        return;
    }

    const errorDiv = overlaySection.querySelector('#overlayLinkError'); // Use ID selector
    const copyBtn = overlaySection.querySelector('#copyOverlayLinkBtn'); // Get existing copy button by ID

    if (!errorDiv || !copyBtn) {
        console.error("Overlay link error display (#overlayLinkError) or copy button (#copyOverlayLinkBtn) not found.");
        if (statusDiv) showError(statusDiv, "UI error for overlay link components.", "warning");
        return;
    }
    
    setLoading(button, true, 'Loading...');
    errorDiv.innerHTML = '';
    errorDiv.style.display = 'none'; // Hide error div initially
    copyBtn.style.display = 'none'; // Hide copy button initially

    try {
        if (!challengeConfig.isLoggedIn || !challengeConfig.isAuthorized) {
            throw new Error("Login and authorization required for overlay links.");
        }
        if (!challengeConfig.urls.profile) {
            console.warn("Profile URL missing in challengeConfig. Cannot generate link to API key generation.");
        }

        const keyData = await apiFetch('/api/profile/get_key', {}, challengeConfig.csrfToken);
        const userApiKey = keyData?.api_key;

        if (!userApiKey) {
            const profileUrl = challengeConfig.urls.profile || '#';
            errorDiv.innerHTML = `No overlay key. <a href="${profileUrl}" class="link-warning" target="_blank" rel="noopener noreferrer">Generate one in your profile</a>.`;
            button.style.display = 'none'; // Hide show button
            errorDiv.style.display = 'block';
            return;
        }

        const overlayUrl = `${window.location.origin}/overlay/${challengeConfig.id}?key=${encodeURIComponent(userApiKey)}`;
        
        // Remove any existing click listener to prevent multiple attachments
        const newCopyBtn = copyBtn.cloneNode(true); // Clone to remove old listeners
        copyBtn.parentNode.replaceChild(newCopyBtn, copyBtn);
        
        newCopyBtn.addEventListener('click', async () => {
            setLoading(newCopyBtn, true, 'Copying...');
            try {
                await navigator.clipboard.writeText(overlayUrl);
                showFlash('Overlay link copied!', 'success');
                // Optionally display the link for a few seconds or provide visual feedback
                errorDiv.innerHTML = `<span class="text-success">Link: ${escapeHtml(overlayUrl)} (Copied!)</span>`;
                errorDiv.style.display = 'block';
                setTimeout(() => {
                    if (errorDiv.innerHTML.includes(overlayUrl)) { // Avoid clearing other messages
                         errorDiv.style.display = 'none';
                         errorDiv.innerHTML = '';
                    }
                }, 5000);


            } catch (err) {
                showFlash('Failed to copy link automatically.', 'warning');
                errorDiv.innerHTML = `Link: <input type='text' value='${escapeHtml(overlayUrl)}' readonly class='form-control form-control-sm d-inline-block w-auto is-valid' onclick='this.select();'>`;
                errorDiv.style.display = 'block';
            } finally {
                setLoading(newCopyBtn, false, '<i class="bi bi-clipboard me-1"></i> Copy Overlay Link');
            }
        });

        button.style.display = 'none'; // Hide the "Show/Copy" button
        newCopyBtn.style.display = 'inline-block'; // Show the copy button
        errorDiv.style.display = 'none'; // Ensure error div is hidden if successful

    } catch (error) {
        console.error("Error showing overlay link:", error);
        showError(errorDiv, `Error: ${error.message}`); // Show error in the specific section
        button.style.display = 'inline-block'; // Keep show button visible on error
        copyBtn.style.display = 'none'; // Keep copy button hidden on error
    } finally {
        setLoading(button, false, 'Show/Copy Overlay Link');
    }
}
