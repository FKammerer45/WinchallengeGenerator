// static/js/utils/helpers.js

/**
 * Sets the loading state for a button, displaying a spinner and updating text.
 * Assumes button HTML contains: <span class="spinner-border..."></span><span>Original Text</span>
 * @param {HTMLElement|null} buttonElement - The button element.
 * @param {boolean} isLoading - Whether to show the loading state.
 * @param {string} [loadingText='Processing...'] - Text to display when loading.
 */
export function setLoading(buttonElement, isLoading, loadingText = 'Processing...') {
    if (!buttonElement) return;
    const originalTextSpan = buttonElement.querySelector('span:not(.spinner-border-sm)');
    const spinner = buttonElement.querySelector('.spinner-border-sm');

    if (isLoading) {
        // Store original text only if it's not already stored (prevents overwriting during rapid clicks)
        if (!buttonElement.dataset.originalText && originalTextSpan) {
            buttonElement.dataset.originalText = originalTextSpan.textContent.trim();
        }
        buttonElement.disabled = true;
        buttonElement.classList.add('loading'); // Class used by CSS to show spinner
        if (originalTextSpan) originalTextSpan.textContent = loadingText;
        // Spinner display is handled by CSS '.loading .spinner-border-sm { display: inline-block; }'
    } else {
        buttonElement.disabled = false;
        buttonElement.classList.remove('loading');
        // Restore original text if available
        if (originalTextSpan && typeof buttonElement.dataset.originalText === 'string') {
            originalTextSpan.textContent = buttonElement.dataset.originalText;
        } else if (originalTextSpan) {
             // Fallback text determination if original wasn't stored or is missing
             if (buttonElement.classList.contains('join-group-btn')) originalTextSpan.textContent = 'Join Group';
             else if (buttonElement.classList.contains('leave-group-btn')) originalTextSpan.textContent = 'Leave Group';
             else if (buttonElement.id === 'addGroupBtn') originalTextSpan.textContent = 'Create Group';
             // else leave text as is
        }
        // Spinner display handled by CSS removing .loading class
        delete buttonElement.dataset.originalText; // Clean up stored text
    }
}

/**
 * Displays or hides an error message in a dedicated element.
 * @param {HTMLElement|null} errorElement - The container element for the error message.
 * @param {string|null} message - The error message text, or null/empty to hide.
 */
export function showError(errorElement, message) {
    if (!errorElement) {
        // Fallback if error element doesn't exist for specific contexts
        if (message) alert(message); // Use alert as last resort
        return;
    }
    if (message) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    } else {
        errorElement.textContent = '';
        errorElement.style.display = 'none';
    }
}

/**
 * Escapes HTML special characters in a string.
 * @param {string} str - The input string.
 * @returns {string} - The escaped string.
 */
export function escapeHtml(str) {
    if (typeof str !== 'string') return String(str); // Convert non-strings before replace
    return str.replace(/[&<>"']/g, match =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[match])
    );
}