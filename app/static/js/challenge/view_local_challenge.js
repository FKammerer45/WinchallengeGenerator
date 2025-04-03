// static/js/challenge/view_local_challenge.js

import { getLocalChallengeById, updateLocalChallengeProgress } from './local_challenge_storage.js';
import { renderProgressItems } from './challenge_ui.js'; // Assuming path is correct
import { escapeHtml, showError } from '../utils/helpers.js'; // Import showError

let currentChallenge = null; // Store loaded challenge data

function displayLocalChallenge() {
    const displayContainer = document.getElementById('localChallengeDisplay');
    const errorContainer = document.getElementById('localChallengeError'); // Assume this div exists for errors
    if (!displayContainer) { console.error("#localChallengeDisplay not found."); return; }

    showError(errorContainer, null); // Clear errors
    const urlParams = new URLSearchParams(window.location.search);
    const localId = urlParams.get('id');
    if (!localId) { showError(errorContainer, "Error: No challenge ID specified."); return; }

    currentChallenge = getLocalChallengeById(localId); // Read from storage
    if (!currentChallenge) { showError(errorContainer, "Error: Could not find specified local challenge."); return; }

    console.log("Loaded local challenge:", currentChallenge);
    displayContainer.innerHTML = ''; // Clear loading

    // Render basic info
    const header = document.createElement('div'); header.className = 'mb-4';
    header.innerHTML = `<h2>${escapeHtml(currentChallenge.name || 'Unnamed')}</h2><p class="text-muted">Saved: ${new Date(currentChallenge.createdAt).toLocaleString()}</p><hr>`;
    displayContainer.appendChild(header);

    // Render progress items
    const progressDiv = document.createElement('div'); progressDiv.className = 'local-challenge-progress';
    displayContainer.appendChild(progressDiv);
    renderProgressItems(
        progressDiv, currentChallenge.challengeData || {}, currentChallenge.localId,
        currentChallenge.progressData || {}, true // Always editable
    );

    // Add event listener for progress changes (delegated to container)
    displayContainer.addEventListener('change', handleLocalProgressChange);
    console.log("Attached progress change listener.");
}

function handleLocalProgressChange(event) {
    if (!event.target.matches('.progress-checkbox')) return;
    if (!currentChallenge) { console.error("No current challenge loaded for progress update."); return; } // Should not happen

    const checkbox = event.target;
    const itemData = checkbox.dataset;
    const isComplete = checkbox.checked;
    const localId = itemData.groupId; // Should match currentChallenge.localId
    const itemDiv = checkbox.closest('.progress-item');

    if (localId !== currentChallenge.localId /* ... other validation ... */) {
        showError(itemDiv, "Data mismatch!"); checkbox.checked = !isComplete; return;
    }

    // Construct progress key
    let progressKey; /* ... logic to build key based on itemData ... */
    if (itemData.itemType === 'b2b' && itemData.segmentIndex) progressKey = `${itemData.itemType}_${itemData.segmentIndex}_${itemData.itemKey}_${itemData.itemIndex}`;
    else if (itemData.itemType === 'normal') progressKey = `${itemData.itemType}_${itemData.itemKey}_${itemData.itemIndex}`;
    else { showError(itemDiv, "Unknown item type!"); checkbox.checked = !isComplete; return; }

    console.log(`Local Progress Change: Key=${progressKey}, Complete=${isComplete}`);
    if(itemDiv) itemDiv.classList.toggle('completed', isComplete); // Optimistic UI

    // Ensure progressData exists on the object in memory
    currentChallenge.progressData = currentChallenge.progressData || {};
     if (isComplete) {
         currentChallenge.progressData[progressKey] = true;
     } else {
         delete currentChallenge.progressData[progressKey];
     }

    // Persist the entire updated challenge object back to storage
    // Note: saveChallengeToLocalStorage needs to handle updates based on ID, or use a dedicated update function.
    // Assuming updateLocalChallengeProgress updates only the specific key:
    const success = updateLocalChallengeProgress(localId, progressKey, isComplete); // Use specific update func

    if (!success) {
        console.error("Failed to save progress update to local storage.");
        if (itemDiv) itemDiv.classList.toggle('completed', !isComplete); // Revert visual
        checkbox.checked = !isComplete; // Revert state
        showError(itemDiv, "Save Error!");
        setTimeout(()=>showError(itemDiv, null), 3000);
    }
}

document.addEventListener('DOMContentLoaded', displayLocalChallenge);