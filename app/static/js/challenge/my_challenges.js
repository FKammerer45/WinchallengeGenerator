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
let statusDiv = null; // For displaying delete status messages

// --- State ---
let pageConfig = {
    isAuthenticated: false,
    csrfToken: null,
    viewLocalUrl: '/challenge/' // Default fallback, overridden by data attribute
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

    // --- CORRECTED: Define baseUrl and construct href ---
    const baseUrl = pageConfig.viewLocalUrl || '/challenge/'; // Read from config
    const href = `${baseUrl}${challenge.localId}`; // Construct path: /challenge/local_...
    // --- END CORRECTION ---

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
        localChallengesContainer.innerHTML = '<div class="col-12"><p class="text-muted fst-italic small text-center">No challenges saved locally in this browser.</p></div>';
    }
    updateNoChallengesMessageVisibility(); // Update overall message visibility
}

/**
 * Checks if any challenges (DB or Local) are visible and updates the
 * visibility and text of the 'no challenges' message container.
 */
function updateNoChallengesMessageVisibility() {
    const dbItemsVisible = myChallengesContainer?.querySelector('.challenge-list-item');
    const localItemsVisible = localChallengesContainer?.querySelector('.local-challenge-item');
    if (noChallengesMessageContainer) {
        const showMessage = !dbItemsVisible && !localItemsVisible;
        console.log(`Updating 'No Challenges' message visibility: ${showMessage}`);
        noChallengesMessageContainer.classList.toggle('d-none', !showMessage);
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
    const targetButton = deleteDbButton || deleteLocalButton;
    if (!targetButton) return;

    const isLocalDelete = !!deleteLocalButton;
    const id = isLocalDelete ? deleteLocalButton.dataset.localId : deleteDbButton.dataset.publicId;
    const challengeName = targetButton.dataset.challengeName || 'this challenge';
    const csrfToken = pageConfig.csrfToken;

    // Use statusDiv defined globally in module scope
    if (!id) { showError(statusDiv, `Cannot delete: Missing ID.`, 'danger'); return; }
    if (!isLocalDelete && !csrfToken) { showError(statusDiv, "Cannot delete: Token missing.", "danger"); return; }

    const confirmMsg = `Delete "${challengeName}" (${isLocalDelete ? 'Local' : 'Shared'})? This cannot be undone.`;
    if (!confirm(confirmMsg)) return;

    setLoading(targetButton, true, 'Deleting...');
    showError(statusDiv, null); // Clear previous status messages

    try {
        if (isLocalDelete) {
            await new Promise(resolve => setTimeout(resolve, 10)); // UI tick
            const deleted = deleteLocalChallenge(id);
            if (!deleted) throw new Error("Not found or delete failed.");
            console.log(`Deleted local challenge ${id}`);
            // Optional success message via showError
            // showError(statusDiv, `Local challenge deleted.`, 'success');

        } else { // DB Delete
            const url = `/api/challenge/${id}`;
            await apiFetch(url, { method: 'DELETE' }, csrfToken);
            console.log(`Deleted DB challenge ${id}`);
            showError(statusDiv, `Challenge "${escapeHtml(challengeName)}" deleted.`, 'success');
        }

        // Common UI removal
        const challengeItem = targetButton.closest('.challenge-list-item, .local-challenge-item');
        if (challengeItem) {
            challengeItem.style.transition = 'opacity 0.4s ease';
            challengeItem.style.opacity = '0';
            setTimeout(() => {
                challengeItem.remove();
                updateNoChallengesMessageVisibility();
            }, 400);
        }

    } catch (error) {
        console.error(`Failed to delete ${isLocalDelete ? 'local' : 'DB'} challenge:`, error);
        showError(statusDiv, `Error deleting: ${error.message}`, 'danger');
        setLoading(targetButton, false); // Reset button only on error
    }
}


// --- Initialize Page ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("my_challenges.js: Initializing...");

    // Assign DOM elements to module variables
    myChallengesContainer = document.getElementById('myChallengesContainer');
    localChallengesContainer = document.getElementById('localChallengesContainer');
    noChallengesMessageContainer = document.getElementById('noChallengesMessageContainer');
    pageContainer = document.querySelector('.container.mt-4');
    statusDiv = document.getElementById('deleteStatus'); // Element for showError messages

    // Read initial data from the dedicated data div
    const dataEl = document.getElementById('myData');
    if (dataEl?.dataset) {
        try {
             pageConfig = {
                 isAuthenticated: dataEl.dataset.isAuthenticated === 'true',
                 csrfToken: dataEl.dataset.csrfToken,
                 viewLocalUrl: dataEl.dataset.viewLocalUrl || '/challenge/' // Use correct fallback
             };
             console.log("my_challenges.js: Page config read:", pageConfig);
        } catch (e) { console.error("my_challenges.js: Failed to read page config:", e); showError(statusDiv, "Error reading config."); return; }
    } else { console.error("CRITICAL: #myData element missing."); showError(statusDiv, "Init Error: Data missing."); return; }

    // Render local challenges (handles empty case internally)
    renderLocalChallenges();

    // Initial check for the 'no challenges' message is done by renderLocalChallenges

    // Attach single delegated listener for delete clicks
    if (pageContainer) {
        pageContainer.addEventListener('click', handleDeleteClick);
        console.log("Delete listener attached via delegation.");
    } else { console.warn("Could not find main page container for delete listener."); }
});