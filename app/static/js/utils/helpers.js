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
    // const spinner = buttonElement.querySelector('.spinner-border-sm'); // spinner variable not strictly needed if CSS handles display

    if (isLoading) {
        // Store original text only if it's not already stored
        if (!buttonElement.dataset.originalText && originalTextSpan) {
            buttonElement.dataset.originalText = originalTextSpan.textContent.trim();
        }
        buttonElement.disabled = true; // Disable button when loading starts
        buttonElement.classList.add('loading'); // Add 'loading' class for CSS to show spinner
        if (originalTextSpan) originalTextSpan.textContent = loadingText;
   
    } else {
        // When loading is finished:
        buttonElement.disabled = false; // <<< --- ENSURE BUTTON IS RE-ENABLED ---
        buttonElement.classList.remove('loading'); // Remove 'loading' class to hide spinner via CSS

        // Restore original text if available
        if (originalTextSpan && typeof buttonElement.dataset.originalText === 'string') {
            originalTextSpan.textContent = buttonElement.dataset.originalText;
        } else if (originalTextSpan) {
            // Fallback text restoration (ensure your specific button's original text is covered)
            if (buttonElement.classList.contains('generate-btn') || buttonElement.textContent.toLowerCase().includes('generate')) {
                 originalTextSpan.textContent = 'Generate Challenge';
            } else if (buttonElement.classList.contains('join-group-btn')) {
                 originalTextSpan.textContent = 'Join Group';
            } else if (buttonElement.classList.contains('leave-group-btn')) {
                 originalTextSpan.textContent = 'Leave Group';
            } else if (buttonElement.id === 'addGroupBtn') {
                 originalTextSpan.textContent = 'Create Group';
            } else if (buttonElement.id === 'shareChallengeBtn') {
                originalTextSpan.textContent = 'Share Challenge';
            }
            // Add more specific fallbacks if needed for other buttons that use setLoading
            else {
                originalTextSpan.textContent = 'Submit'; // A generic fallback
            }
        }
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



export function showFlash(message, type = 'info', timeout = 4000) {
    // create alert element
    const div = document.createElement('div');
    div.className = `alert alert-${type} alert-dismissible fade show position-fixed`
                  + ` shadow-sm rounded`
                  + ` flash-top-center`;          // custom util → top:1rem; left:50%; transform:translateX(-50%)
    div.style.zIndex = 1080;                       // above navbars/modals
    div.innerHTML = `
        ${message}
        <button type="button" class="close" data-dismiss="alert">&times;</button>
    `;
    document.body.appendChild(div);
  
    // auto‑dismiss
    setTimeout(() => div.classList.remove('show'), timeout);
    setTimeout(() => div.remove(), timeout + 150); // allow fade‑out
  }


  export function confirmModal(message, title = "Please confirm") {
    const modalElement = document.getElementById('actionConfirmModal');
    const okBtn = document.getElementById("actionConfirmOk");
    // Bootstrap 4 uses data-dismiss="modal" on cancel buttons.
    const cancelBtn = modalElement ? modalElement.querySelector('.btn-secondary[data-dismiss="modal"]') : null;
    
    const previouslyFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    return new Promise(resolve => {
      if (!modalElement || !okBtn) {
        console.error("Confirmation modal DOM elements not found. Falling back to native confirm.");
        resolve(window.confirm(`${title}\n\n${message}`));
        return;
      }

      document.getElementById("actionConfirmTitle").textContent = title;
      document.getElementById("actionConfirmBody").textContent = message;
      
      let resolved = false;

      // Renamed 'event' parameter to 'clickEvent' for clarity and to avoid scope issues
      const resolveAndCleanup = (value, clickEvent) => { 
        if (resolved) return;
        resolved = true;

        // If hide was initiated by OK or explicit Cancel button click, try to restore focus immediately
        if (clickEvent && (value === true || value === false)) { 
            if (previouslyFocusedElement && typeof previouslyFocusedElement.focus === 'function') {
                previouslyFocusedElement.focus();
            }
        }
        
        $(modalElement).modal("hide"); // Ensure hide is called
        resolve(value);
      };
      
      const okButtonHandler = (e) => { // Renamed for clarity
        resolveAndCleanup(true, e); // Pass the event object
      };

      const cancelButtonHandler = (e) => { // For explicit cancel button in footer, renamed for clarity
        resolveAndCleanup(false, e); // Pass the event object
      };
      
      $(okBtn).one('click', okButtonHandler);
      if (cancelBtn) { 
        $(cancelBtn).one('click', cancelButtonHandler);
      }

      $(modalElement).one('hidden.bs.modal', () => {
        $(okBtn).off('click', okButtonHandler); // Use correct handler name
        if (cancelBtn) {
            $(cancelBtn).off('click', cancelButtonHandler); // Use correct handler name
        }
        
        if (!resolved) { 
            resolved = true;
            resolve(false); 
        }

        // Fallback focus restoration if not handled by button click path (e.g. Esc/backdrop)
        // Check if focus is still on a modal element or body, then restore.
        if (previouslyFocusedElement && typeof previouslyFocusedElement.focus === 'function') {
            if (document.activeElement === document.body || modalElement.contains(document.activeElement)) {
                 previouslyFocusedElement.focus();
            }
        }
      });

      $(modalElement).modal("show");
    });
  }

  export function showSuccess(messageElement, message) {
    if (!messageElement) {
         if (message) console.log("Success element not found:", message); // Log if element missing
        return;
    }
    if (message) {
        messageElement.textContent = message;
        // --- Apply success styling ---
        messageElement.className = 'player-name-error text-success small mt-1'; // Use text-success
        // --- End Apply success styling ---
        messageElement.style.display = 'block';
    } else {
        messageElement.textContent = '';
        messageElement.style.display = 'none';
    }
}

/**
 * Helper to get common DOM elements, reducing redundancy.
 * @returns {{statusDiv: HTMLElement|null}}
 */
export function getCommonDOMElements() {
    return {
        statusDiv: document.getElementById('pageStatusDisplay') // General page status
    };
}
