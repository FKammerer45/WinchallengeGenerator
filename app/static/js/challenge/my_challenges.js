// static/js/challenge/my_challenges.js

// Assuming apiFetch is globally available or import it
// If api.js exists in ../utils/api.js:
import { apiFetch } from '../utils/api.js';
// Assuming helpers exist:
import { setLoading } from '../utils/helpers.js';

function displayStatus(message, type = 'danger') {
    const statusDiv = document.getElementById('deleteStatus');
    if (!statusDiv) { console.warn("Status display area not found."); alert(message); return; }
    statusDiv.innerHTML = `<div class="alert alert-${type} alert-dismissible fade show" role="alert">
                             ${message}
                             <button type="button" class="close" data-dismiss="alert" aria-label="Close">
                               <span aria-hidden="true">&times;</span>
                             </button>
                           </div>`;
    // Auto-dismiss success messages after a delay
    if (type === 'success') {
        setTimeout(() => {
             const alertInstance = bootstrap?.Alert?.getInstance(statusDiv.querySelector('.alert'));
             if(alertInstance) alertInstance.close();
             else statusDiv.innerHTML = ''; // Fallback clear
        }, 4000);
    }
}


async function handleDeleteClick(event) {
    const deleteButton = event.target.closest('.delete-challenge-btn');
    if (!deleteButton) return;

    const publicId = deleteButton.dataset.publicId;
    const challengeName = deleteButton.dataset.challengeName || 'this challenge';
    const csrfToken = window.csrfToken; // Read from global var set in template

    if (!publicId) {
        console.error("Delete button clicked, but missing public ID.");
        displayStatus("Could not delete challenge: ID missing.", "danger");
        return;
    }
    if (!csrfToken) {
         console.error("CSRF Token not found, cannot delete.");
         displayStatus("Could not delete challenge: Security token missing.", "danger");
         return;
    }


    // --- Confirmation Dialog ---
    const confirmationMessage = `Are you sure you want to delete "${challengeName}" (${publicId.substring(0, 8)}...)?\n\nThis will remove the challenge and all associated group progress permanently. This cannot be undone.`;
    if (!confirm(confirmationMessage)) {
        console.log("Delete cancelled by user.");
        return; // Stop if user cancels
    }
    // --- End Confirmation ---


    console.log(`Attempting to delete challenge ${publicId}`);
    setLoading(deleteButton, true, 'Deleting...'); // Show loading state

    try {
        // Construct API URL (assuming API blueprint prefix is /api/challenge)
        const url = `/api/challenge/${publicId}`;

        // Use apiFetch helper (ensure it's imported/available)
        // Pass token to apiFetch
        await apiFetch(url, { method: 'DELETE' }, csrfToken);

        // --- Success ---
        console.log(`Successfully deleted challenge ${publicId}`);
        // Find the parent card element to remove from the DOM
        const challengeItem = deleteButton.closest('.challenge-list-item');
        if (challengeItem) {
            challengeItem.style.transition = 'opacity 0.5s ease';
            challengeItem.style.opacity = '0';
            setTimeout(() => {
                challengeItem.remove();
                // Update count display if needed (requires count elements on page)
                const remainingItems = document.querySelectorAll('.challenge-list-item').length;
                // Optionally update a counter display element
                console.log(`Remaining challenges: ${remainingItems}`);
                 if (remainingItems === 0) {
                    document.getElementById('myChallengesContainer').innerHTML = '<div class="alert alert-info">You haven\'t created any challenges yet...</div>'; // Show empty message
                 }

            }, 500); // Remove after fade out
        }
        displayStatus(`Challenge "${challengeName}" deleted successfully.`, 'success');


    } catch (error) {
        console.error("Failed to delete challenge:", error);
        displayStatus(`Error deleting challenge: ${error.message}`, 'danger');
        setLoading(deleteButton, false); // Reset button state only on error
    }
    // No 'finally' needed here if setLoading(false) is handled by success (element removal) or error path.
}


// --- Initialize Page ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("my_challenges.js: Initializing...");

    const container = document.getElementById('myChallengesContainer');
    if (container) {
        container.addEventListener('click', handleDeleteClick);
        console.log("Delete challenge listener attached via delegation.");
    } else {
        console.warn("Challenge container (#myChallengesContainer) not found.");
    }
});