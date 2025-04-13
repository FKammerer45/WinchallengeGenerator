// static/js/my_challenges.js
// Handles interactions on the "My Challenges" page (my_challenges.html)

import { getLocalChallenges, deleteLocalChallenge } from './utils/local_storage.js';
import { apiFetch } from './utils/api.js';
import { setLoading, escapeHtml, showError } from './utils/helpers.js';

// --- DOM Element References ---
let accountChallengesRow = null; // The row inside the account collapse body
let localChallengesContainer = null; // The row inside the local collapse body
let noChallengesMessageContainer = null; // Overall message if both empty
let pageContainer = null; // Main container for event delegation
let statusDiv = null; // For displaying delete status messages

// --- State ---
let pageConfig = {
    isAuthenticated: false,
    csrfToken: null,
    viewLocalUrl: '/challenge/'
};

/**
 * Creates the HTML element structure for a single local challenge card.
 * @param {object} challenge - The local challenge object from localStorage.
 * @returns {HTMLElement} - The created column div containing the card.
 */
function createLocalChallengeCard(challenge) {
    const colDiv = document.createElement('div');
    // Use standard column classes consistent with DB challenges on this page
    colDiv.className = 'col-md-6 col-lg-4 mb-4 local-challenge-item';
    colDiv.dataset.localId = challenge.localId;

    const baseUrl = pageConfig.viewLocalUrl || '/challenge/';
    const href = `${baseUrl}${challenge.localId}`; // Construct path: /challenge/local_...

    // Use the same challenge-card class for consistent styling
    colDiv.innerHTML = `
        <div class="card challenge-card h-100">
             <a href="${href}" class="card-body-link" target="_blank" title="View Local Challenge Details">
                <div class="card-body">
                    <h5 class="card-title">${escapeHtml(challenge.name || "Unnamed Local Challenge")}</h5>
                    <h6 class="card-subtitle mb-2 text-muted">
                        <code style="font-size: 0.9em;">${escapeHtml(challenge.localId.substring(0, 12))}...</code> (Local)
                    </h6>
                    <p class="card-text small">
                        Saved: ${challenge.createdAt ? new Date(challenge.createdAt).toLocaleString() : 'N/A'}
                    </p>
                </div>
             </a>
             <div class="card-footer text-right">
                 <button class="btn btn-sm btn-outline-danger delete-local-challenge-btn"
                         data-local-id="${challenge.localId}"
                         data-challenge-name="${escapeHtml(challenge.name || 'Unnamed Local Challenge')}"
                         title="Delete this local challenge">
                     <span class="spinner-border spinner-border-sm" style="display: none;"></span>
                     <span>Delete</span>
                 </button>
             </div>
        </div>
    `;
    return colDiv;
}

/**
 * Renders challenges loaded from local storage into the designated container.
 */
function renderLocalChallenges() {
    if (!localChallengesContainer) {
        console.error("Local challenge container not found.");
        return;
    }
    // console.log("Rendering local challenges..."); // Less verbose logging
    const challenges = getLocalChallenges();
    localChallengesContainer.innerHTML = ''; // Clear placeholder/previous content

    if (challenges.length > 0) {
        // console.log(`Found ${challenges.length} local challenges.`); // Less verbose
        challenges.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // Sort newest first
        challenges.forEach(challenge => {
            const challengeCard = createLocalChallengeCard(challenge);
            localChallengesContainer.appendChild(challengeCard);
        });
    } else {
        // Display message *within* the local challenges container if empty
        localChallengesContainer.innerHTML = '<div class="col-12"><p class="empty-section-message">No challenges saved locally in this browser.</p></div>';
    }
    updateNoChallengesMessageVisibility(); // Update overall message visibility
}

/**
 * Checks if any challenges (DB or Local) are visible and updates the
 * visibility of the overall 'no challenges' message container.
 */
function updateNoChallengesMessageVisibility() {
    // Check if there are challenge items within each container
    const dbItemsVisible = accountChallengesRow?.querySelector('.challenge-list-item');
    const localItemsVisible = localChallengesContainer?.querySelector('.local-challenge-item');

    if (noChallengesMessageContainer) {
        const showOverallMessage = !dbItemsVisible && !localItemsVisible;
        // console.log(`Updating 'No Challenges' message visibility: ${showOverallMessage}`); // Less verbose
        noChallengesMessageContainer.classList.toggle('d-none', !showOverallMessage);
    }
}

/**
 * Handles clicks on delete buttons (delegated listener).
 * Differentiates between deleting local challenges and DB challenges.
 * @param {Event} event - The click event object.
 */
async function handleDeleteClick(event) {
    const deleteDbButton = event.target.closest('.delete-challenge-btn');
    const deleteLocalButton = event.target.closest('.delete-local-challenge-btn');
    const targetButton = deleteDbButton || deleteLocalButton;
    if (!targetButton) return; // Ignore clicks not on delete buttons

    const isLocalDelete = !!deleteLocalButton;
    const id = isLocalDelete ? deleteLocalButton.dataset.localId : deleteDbButton.dataset.publicId;
    const challengeName = targetButton.dataset.challengeName || 'this challenge';
    const csrfToken = pageConfig.csrfToken;

    if (!id) {
        showError(statusDiv, `Cannot delete: Missing ID.`, 'danger'); return;
    }
    // CSRF token only needed for DB deletes
    if (!isLocalDelete && !csrfToken && pageConfig.isAuthenticated) {
        showError(statusDiv, "Cannot delete shared challenge: Security token missing.", "danger"); return;
    }

    const confirmMsg = `Delete "${challengeName}" (${isLocalDelete ? 'Local' : 'Shared'})? This cannot be undone.`;
    if (!confirm(confirmMsg)) return;

    setLoading(targetButton, true, 'Deleting...');
    showError(statusDiv, null); // Clear previous status messages

    try {
        if (isLocalDelete) {
            // Simulate slight delay for UI feedback if needed
            // await new Promise(resolve => setTimeout(resolve, 10));
            const deleted = deleteLocalChallenge(id);
            if (!deleted) throw new Error("Not found or delete failed.");
            // console.log(`Deleted local challenge ${id}`); // Less verbose
            // Optional success message (can be annoying if deleting many)
            // showError(statusDiv, `Local challenge deleted.`, 'success');
        } else { // DB Delete
            const url = `/api/challenge/${id}`; // Assumes API endpoint structure
            await apiFetch(url, { method: 'DELETE' }, csrfToken);
            // console.log(`Deleted DB challenge ${id}`); // Less verbose
            showError(statusDiv, `Challenge "${escapeHtml(challengeName)}" deleted.`, 'success');
        }

        // Common UI removal with fade effect
        const challengeItem = targetButton.closest('.challenge-list-item, .local-challenge-item');
        if (challengeItem) {
            challengeItem.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
            challengeItem.style.opacity = '0';
            challengeItem.style.transform = 'scale(0.95)';
            setTimeout(() => {
                challengeItem.remove();
                updateNoChallengesMessageVisibility(); // Check if overall message needed
                // Check if the specific section is now empty
                if (isLocalDelete && !localChallengesContainer?.querySelector('.local-challenge-item')) {
                     renderLocalChallenges(); // Re-render to show empty message
                }
                if (!isLocalDelete && !accountChallengesRow?.querySelector('.challenge-list-item')) {
                    // Optionally add empty message for account section if needed (or rely on server render)
                    if(accountChallengesRow) accountChallengesRow.innerHTML = '<div class="col-12"><p class="empty-section-message">No challenges saved to your account yet.</p></div>';
                }
            }, 400);
        }

    } catch (error) {
        console.error(`Failed to delete ${isLocalDelete ? 'local' : 'DB'} challenge:`, error);
        showError(statusDiv, `Error deleting: ${error.message}`, 'danger');
        setLoading(targetButton, false); // Reset button only on error
    }
    // Don't reset loading on success, button is removed with card
}


// --- Initialize Page ---
document.addEventListener('DOMContentLoaded', () => {
    // console.log("my_challenges.js: Initializing..."); // Less verbose

    // Assign DOM elements to module variables
    // Get the ROWS where cards are placed
    accountChallengesRow = document.querySelector('#accountChallengesCollapse .row');
    localChallengesContainer = document.getElementById('localChallengesContainer'); // This is the row itself
    noChallengesMessageContainer = document.getElementById('noChallengesMessageContainer');
    pageContainer = document.querySelector('.container.mt-4'); // Main container
    statusDiv = document.getElementById('deleteStatus');

    // Check essential containers exist
    if (!localChallengesContainer || !pageContainer || !statusDiv) {
         console.error("Essential elements missing: localChallengesContainer, pageContainer, or deleteStatus.");
         // Don't necessarily stop execution, local challenges might still render
    }
     // accountChallengesRow might be null if user isn't logged in or has no challenges, which is fine

    // Read initial data from the dedicated data div
    const dataEl = document.getElementById('myData');
    if (dataEl?.dataset) {
        try {
             pageConfig = {
                 isAuthenticated: dataEl.dataset.isAuthenticated === 'true',
                 csrfToken: dataEl.dataset.csrfToken,
                 viewLocalUrl: dataEl.dataset.viewLocalUrl || '/challenge/'
             };
             // console.log("my_challenges.js: Page config read:", pageConfig); // Less verbose
        } catch (e) {
            console.error("my_challenges.js: Failed to read page config:", e);
            showError(statusDiv, "Error reading page configuration.");
            // Potentially return if config is critical
        }
    } else {
        console.error("CRITICAL: #myData element missing.");
        showError(statusDiv, "Initialization Error: Data element missing.");
        return; // Stop if data element is missing
    }

    // Render local challenges (handles empty case internally now)
    renderLocalChallenges();

    // Initial check for the overall 'no challenges' message
    updateNoChallengesMessageVisibility();

    // Attach single delegated listener for delete clicks
    if (pageContainer) {
        pageContainer.addEventListener('click', handleDeleteClick);
        // console.log("Delete listener attached via delegation."); // Less verbose
    } else {
        console.warn("Could not find main page container for delete listener.");
    }

    // Add listeners for Bootstrap collapse events to toggle indicators (optional but nice)
    // Requires jQuery for Bootstrap 4 events
    if (typeof $ !== 'undefined') {
        $('.collapse').on('shown.bs.collapse hidden.bs.collapse', function (e) {
            const headerButton = $(`[data-target="#${e.target.id}"]`);
            if (headerButton) {
                const isExpanded = e.type === 'shown';
                headerButton.attr('aria-expanded', isExpanded.toString());
                // The CSS handles the indicator change based on aria-expanded
            }
        });
    } else {
        console.warn("jQuery not found, collapse indicator toggle via JS events disabled.");
    }
});
