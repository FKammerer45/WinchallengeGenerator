// static/js/utils/helpers.js

/**
 * Sets the loading state for a button, displaying a spinner and updating text.
 * Assumes button HTML contains: <span class="spinner-border..."></span><span>Original Text</span>
 * @param {HTMLElement|null} buttonElement - The button element.
 * @param {boolean} isLoading - Whether to show the loading state.
 * @param {string} [loadingText='Processing...'] - Text to display when loading.
 */
export function setLoading(element, isLoading, loadingText = 'Processing...') {
    if (!(element instanceof HTMLElement)) {
        // console.warn("setLoading: Provided element is not an HTMLElement.", element);
        return;
    }

    const isButton = element.tagName === 'BUTTON';
    const originalTextSpan = element.querySelector('span:not(.spinner-border-sm)'); // Attempt to find text span
    const spinner = element.querySelector('.spinner-border-sm'); // Attempt to find spinner

    if (isLoading) {
        if (isButton) {
            element.disabled = true;
        }
        element.classList.add('loading'); // Generic loading class for element itself
        element.setAttribute('aria-busy', 'true');

        if (originalTextSpan) {
            if (!element.dataset.originalText) {
                element.dataset.originalText = originalTextSpan.textContent.trim();
            }
            originalTextSpan.textContent = loadingText;
        }
        if (spinner) {
            spinner.style.display = 'inline-block'; // Or manage via CSS .loading .spinner-border-sm
        }
    } else {
        if (isButton) {
            element.disabled = false;
        }
        element.classList.remove('loading');
        element.removeAttribute('aria-busy');

        if (originalTextSpan && typeof element.dataset.originalText === 'string') {
            originalTextSpan.textContent = element.dataset.originalText;
        } else if (originalTextSpan && isButton) { // Fallback text restoration only for buttons
            if (element.classList.contains('generate-btn') || element.textContent.toLowerCase().includes('generate')) {
                 originalTextSpan.textContent = 'Generate Challenge';
            } else if (element.classList.contains('join-group-btn')) {
                 originalTextSpan.textContent = 'Join Group';
            } else if (element.classList.contains('leave-group-btn')) {
                 originalTextSpan.textContent = 'Leave Group';
            } else if (element.id === 'addGroupBtn') {
                 originalTextSpan.textContent = 'Create Group';
            } else if (element.id === 'shareChallengeBtn') {
                originalTextSpan.textContent = 'Share Challenge';
            } else {
                originalTextSpan.textContent = 'Submit'; 
            }
        }
        if (spinner) {
            spinner.style.display = 'none'; // Or manage via CSS
        }
        delete element.dataset.originalText;
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
    div.className = `alert alert-${type} alert-dismissible fade show m-0`; // Added m-0 for consistency
    div.setAttribute('role', 'alert');
    // Ensure the message content is escaped before setting innerHTML
    div.innerHTML = `
        ${escapeHtml(String(message))}
        <button type="button" class="close" data-dismiss="alert" aria-label="Close">
            <span aria-hidden="true">&times;</span>
        </button>
    `;
    
    const container = document.getElementById('js-flash-message-container');
    if (container) {
        container.appendChild(div);
    } else {
        // Fallback if container is somehow not found
        document.body.appendChild(div);
        console.warn('#js-flash-message-container not found. Appending flash to body.');
    }
  
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

// --- Custom Row Tooltip Management ---
let tooltipElement = null;

function getTooltipElement() {
    if (!tooltipElement) {
        tooltipElement = document.getElementById('customRowTooltip');
    }
    return tooltipElement;
}

export function showRowTooltip(event) {
    const tooltip = getTooltipElement();
    if (!tooltip) {
        // console.log('CustomTooltip: Tooltip element not found.');
        return;
    }
    // console.log('CustomTooltip: showRowTooltip called', event);
    // Position the tooltip near the mouse cursor
    // Add a small offset so it doesn't directly cover the cursor
    tooltip.style.left = (event.pageX + 10) + 'px';
    tooltip.style.top = (event.pageY + 10) + 'px';
    tooltip.style.display = 'block';
    // console.log('CustomTooltip: Tooltip display set to block at', tooltip.style.left, tooltip.style.top);
}

export function hideRowTooltip() {
    const tooltip = getTooltipElement();
    if (!tooltip) {
        // console.log('CustomTooltip: Tooltip element not found for hide.');
        return;
    }
    // console.log('CustomTooltip: hideRowTooltip called');
    tooltip.style.display = 'none';
}

export function updateRowTooltipPosition(event) {
    const tooltip = getTooltipElement();
    if (!tooltip || tooltip.style.display === 'none') return;

    tooltip.style.left = (event.pageX + 10) + 'px';
    tooltip.style.top = (event.pageY + 10) + 'px';
}
/**
 * Generates a simple UUID (Universally Unique Identifier).
 * This is a fallback for environments where crypto.randomUUID is not available.
 * @returns {string} A UUID string.
 */
export function generateSimpleUUID() {
    return 'xxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// --- END Custom Row Tooltip Management ---
