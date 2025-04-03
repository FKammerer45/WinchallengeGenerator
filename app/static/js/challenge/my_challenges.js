// static/js/my_challenges.js
// Handles interactions on the "My Challenges" page (my_challenges.html)

// Import functions for local storage
import { getLocalChallenges, deleteLocalChallenge } from './local_challenge_storage.js';
// Import API fetch utility (for deleting DB challenges)
import { apiFetch } from '../utils/api.js';
// Import helpers
import { setLoading, escapeHtml, showError } from '../utils/helpers.js';

// --- DOM Element Variables ---
let myChallengesContainer = null;
let localChallengesContainer = null;
let noChallengesMessageContainer = null;
let pageContainer = null;
let statusDiv = null;

// --- State ---
let pageConfig = {
    isAuthenticated: false,
    csrfToken: null,
    viewLocalUrl: '/view_local' // Default fallback
};

/**
 * Creates the HTML element structure for a single local challenge card.
 * @param {object} challenge - The local challenge object from localStorage.
 * @returns {HTMLElement} - The created column div containing the card.
 */
function createLocalChallengeCard(challenge) {
    const colDiv = document.createElement('div');
    colDiv.className = 'col-md-6 col-lg-4 mb-4 local-challenge-item';
    colDiv.dataset.localId = challenge.localId;

    // Construct link to the local viewer page using configured base URL
    const viewUrl = new URL(pageConfig.viewLocalUrl, window.location.origin);
    viewUrl.searchParams.set('id', challenge.localId);
    const href = viewUrl.pathname + viewUrl.search;

    colDiv.innerHTML = `
        <div class="card challenge-card h-100">
             <a href="${href}" class="card-body-link" target="_blank" title="View Local Challenge Details">
                <div class="card-body">
                    <h5 class="card-title">${escapeHtml(challenge.name || "Unnamed Local Challenge")}</h5>
                    <h6 class="card-subtitle mb-2 text-muted">
                        <code style="font-size: 0.9em;">${escapeHtml(challenge.localId.substring(0, 12))}...</code> (Local)
                    </h6>
                    <p class="card-text">
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
    if (!localChallengesContainer) { console.error("Local challenge container not found."); return; }

    console.log("Rendering local challenges...");
    const challenges = getLocalChallenges();
    localChallengesContainer.innerHTML = ''; // Clear placeholder/previous content

    if (challenges.length > 0) {
        console.log(`Found ${challenges.length} local challenges.`);
        challenges.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // Sort newest first
        challenges.forEach(challenge => {
            const challengeCard = createLocalChallengeCard(challenge);
            localChallengesContainer.appendChild(challengeCard);
        });
    } else {
        console.log("No local challenges found in storage.");
        // Display message only within the local section if desired
        localChallengesContainer.innerHTML = '<div class="col-12"><p class="text-muted fst-italic small text-center">No challenges saved locally in this browser.</p></div>';
    }
    // Update the visibility of the main "no challenges" message
    updateNoChallengesMessageVisibility();
}

/**
 * Checks if any challenges (DB or Local) are visible and updates the
 * visibility of the main 'no challenges' message container.
 */
function updateNoChallengesMessageVisibility() {
    const dbItemsVisible = myChallengesContainer?.querySelector('.challenge-list-item');
    const localItemsVisible = localChallengesContainer?.querySelector('.local-challenge-item');
    if (noChallengesMessageContainer) {
        const showMessage = !dbItemsVisible && !localItemsVisible;
        console.log(`Updating 'No Challenges' message visibility: ${showMessage}`);
        noChallengesMessageContainer.classList.toggle('d-none', !showMessage);
        // Set appropriate text if message is shown
        if (showMessage) {
             const pTag = noChallengesMessageContainer.querySelector('p');
             if (pTag) {
                  pTag.textContent = pageConfig.isAuthenticated
                    ? 'You haven\'t created and shared any challenges yet. Go to the generator!'
                    : 'You have no locally saved challenges. Generate one on the home page!';
             }
        }
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

    // Determine target based on which button was clicked
    const targetButton = deleteDbButton || deleteLocalButton;
    if (!targetButton) return; // Click wasn't on a delete button

    const isLocalDelete = !!deleteLocalButton; // True if local, false if DB
    const id = isLocalDelete ? deleteLocalButton.dataset.localId : deleteDbButton.dataset.publicId;
    const challengeName = targetButton.dataset.challengeName || (isLocalDelete ? 'this local challenge' : 'this challenge');
    const csrfToken = pageConfig.csrfToken; // Use token from config

    if (!id) {
        showError(statusDiv, `Cannot delete challenge: Missing ${isLocalDelete ? 'local' : 'public'} ID.`, 'danger');
        return;
    }
    // CSRF only needed for DB deletes (API call)
    if (!isLocalDelete && !csrfToken) {
        showError(statusDiv, "Cannot delete challenge: Security token missing.", "danger");
        return;
    }

    // Confirmation
    const confirmMsg = `Are you sure you want to delete "${challengeName}" (${isLocalDelete ? 'Local' : 'Shared'})?\n\nThis ${isLocalDelete ? 'removes it only from this browser' : 'is permanent and removes all group progress'}.`;
    if (!confirm(confirmMsg)) {
        console.log("Delete cancelled by user.");
        return;
    }

    console.log(`Attempting to delete ${isLocalDelete ? 'local' : 'DB'} challenge ${id}`);
    setLoading(targetButton, true, 'Deleting...'); // Show loading state on the correct button
    showError(statusDiv, null); // Clear previous status messages

    try {
        if (isLocalDelete) {
            // --- Handle Local Delete ---
             // Use setTimeout to ensure spinner shows before potential sync storage access
            await new Promise(resolve => setTimeout(resolve, 10));
            const deleted = deleteLocalChallenge(localId);
            if (!deleted) throw new Error("Challenge not found in local storage or delete failed.");
            console.log(`Successfully deleted local challenge ${id}`);
            // displayStatus(`Local challenge "${escapeHtml(challengeName)}" deleted.`, 'success'); // Optional

        } else {
            // --- Handle DB Delete ---
            const url = `/api/challenge/${id}`; // publicId is used in URL
            await apiFetch(url, { method: 'DELETE' }, csrfToken); // Call API
            console.log(`Successfully deleted DB challenge ${id}`);
            displayStatus(`Challenge "${escapeHtml(challengeName)}" deleted.`, 'success');
        }

        // --- Common Success UI Update ---
        const challengeItem = targetButton.closest('.challenge-list-item, .local-challenge-item');
        if (challengeItem) {
            challengeItem.style.transition = 'opacity 0.4s ease';
            challengeItem.style.opacity = '0';
            setTimeout(() => {
                challengeItem.remove();
                updateNoChallengesMessageVisibility(); // Update overall empty message visibility
            }, 400);
        }

    } catch (error) {
        console.error(`Failed to delete ${isLocalDelete ? 'local' : 'DB'} challenge:`, error);
        showError(statusDiv, `Error deleting challenge: ${error.message}`, 'danger');
        setLoading(targetButton, false); // Reset button only on error
    }
}


// --- Initialize Page ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("my_challenges.js: Initializing...");

    // Find main containers
    myChallengesContainer = document.getElementById('myChallengesContainer');
    localChallengesContainer = document.getElementById('localChallengesContainer');
    noChallengesMessageContainer = document.getElementById('noChallengesMessageContainer');
    pageContainer = document.querySelector('.container.mt-4'); // For delegated listener
    statusDiv = document.getElementById('deleteStatus'); // For messages

    // Read initial data from the dedicated data div
    const dataEl = document.getElementById('myData'); // Assumes this ID exists in my_challenges.html
    if (dataEl?.dataset) {
        try {
            pageConfig.isAuthenticated = dataEl.dataset.isAuthenticated === 'true';
            pageConfig.csrfToken = dataEl.dataset.csrfToken;
            pageConfig.viewLocalUrl = dataEl.dataset.viewLocalUrl || '/view_local';
            console.log("my_challenges.js: Page config read:", pageConfig);
        } catch (e) {
            console.error("my_challenges.js: Failed to read page config from data attributes:", e);
            showError(statusDiv, "Error reading page configuration.", "danger");
            // Potentially stop further execution if config is critical
            // return;
        }
    } else {
        console.error("CRITICAL: #myData element not found. Cannot initialize page properly.");
        // Display error to user?
        if (statusDiv) showError(statusDiv, "Error initializing page: Cannot find data element.", "danger");
        return; // Stop if essential data container is missing
    }


    renderLocalChallenges(); // Handles empty case internally


    // Update the 'no challenges' message based on initial render state
    updateNoChallengesMessageVisibility();

    // Attach single delegated listener for delete clicks
    if (pageContainer) {
        pageContainer.addEventListener('click', handleDeleteClick);
        console.log("Delete listener attached via delegation.");
    } else {
        console.warn("Could not find main page container for delete listener delegation.");
        // Add specific listeners as fallback (less efficient)
        myChallengesContainer?.addEventListener('click', handleDeleteClick);
        localChallengesContainer?.addEventListener('click', handleDeleteClick);
    }
});