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

    // Specific DOM elements related to the overlay link section
    const overlaySection = button.closest('.overlay-link-section'); // Assuming a wrapper
    if (!overlaySection) {
        console.error("Overlay link section wrapper not found.");
        if (statusDiv) showError(statusDiv, "UI error for overlay link.", "warning");
        return;
    }

    const errorDiv = overlaySection.querySelector('.overlay-link-error'); // Error display specific to this section
    const copyBtnPlaceholder = overlaySection.querySelector('.copy-overlay-link-btn-placeholder'); // Placeholder for the copy button

    if (!errorDiv || !copyBtnPlaceholder) {
        console.error("Overlay link error display or copy button placeholder not found.");
        if (statusDiv) showError(statusDiv, "UI error for overlay link components.", "warning");
        return;
    }
    
    setLoading(button, true, 'Loading...');
    errorDiv.innerHTML = '';
    copyBtnPlaceholder.innerHTML = ''; // Clear any old button

    try {
        if (!challengeConfig.isLoggedIn || !challengeConfig.isAuthorized) {
            throw new Error("Login and authorization required for overlay links.");
        }
        if (!challengeConfig.urls.profile) { // Check if profile URL is available for link
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

        // Create the new copy button
        const newCopyBtn = document.createElement('button');
        newCopyBtn.className = 'btn btn-sm btn-outline-success copy-overlay-link-btn'; // Use a distinct class if needed
        newCopyBtn.innerHTML = `<span class="spinner-border spinner-border-sm" style="display: none;"></span><i class="bi bi-clipboard me-1"></i> Copy Overlay Link`;
        
        newCopyBtn.addEventListener('click', async () => {
            setLoading(newCopyBtn, true, 'Copying...');
            try {
                await navigator.clipboard.writeText(overlayUrl);
                showFlash('Overlay link copied!', 'success');
            } catch (err) {
                showFlash('Failed to copy link.', 'danger');
                errorDiv.innerHTML = `Link: <input type='text' value='${escapeHtml(overlayUrl)}' readonly class='form-control form-control-sm d-inline-block w-auto'>`;
                errorDiv.style.display = 'block';
            } finally {
                setLoading(newCopyBtn, false, '<i class="bi bi-clipboard me-1"></i> Copy Overlay Link');
            }
        });

        button.style.display = 'none'; // Hide the "Show/Copy" button
        copyBtnPlaceholder.appendChild(newCopyBtn); // Add the new button to the placeholder
        errorDiv.style.display = 'none';

    } catch (error) {
        console.error("Error showing overlay link:", error);
        showError(errorDiv, `Error: ${error.message}`); // Show error in the specific section
        button.style.display = 'none'; // Hide show button on error
    } finally {
        setLoading(button, false, 'Show/Copy Overlay Link');
    }
}
