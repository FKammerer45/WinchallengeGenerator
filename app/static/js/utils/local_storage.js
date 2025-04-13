// static/js/local_challenge_storage.js
// Utility functions for managing challenges saved in browser localStorage

// Use a specific key for this application's challenges
const STORAGE_KEY = 'winGenLocalChallenges';

/**
 * Retrieves all locally stored challenges from localStorage.
 * @returns {Array<object>} An array of challenge objects, or an empty array if none are found or an error occurs.
 */
export function getLocalChallenges() {
    try {
        const storedData = localStorage.getItem(STORAGE_KEY);
        // Parse the data or return an empty array if nothing is stored
        return storedData ? JSON.parse(storedData) : [];
    } catch (e) {
        console.error("Error reading local challenges from localStorage:", e);
        // If parsing fails (e.g., corrupted data), maybe clear it? Or just return empty.
        // localStorage.removeItem(STORAGE_KEY); // Optional: Clear corrupted data
        return []; // Return empty array on error
    }
}

/**
 * Saves a new challenge object to the array in local storage.
 * @param {object} challengeObject - The challenge object to save. Must include a unique 'localId'.
 * @returns {boolean} True if the save was successful, false otherwise.
 */
export function saveChallengeToLocalStorage(challengeObject) {
    if (!challengeObject || !challengeObject.localId) {
        console.error("Cannot save challenge: Invalid challenge object or missing localId.");
        return false;
    }
    try {
        const challenges = getLocalChallenges(); // Get existing challenges

        // Optional: Check if a challenge with this ID already exists
        const exists = challenges.some(c => c.localId === challengeObject.localId);
        if (exists) {
            console.warn(`Challenge with localId ${challengeObject.localId} already exists. Skipping save.`);
            // Or implement update logic here if needed
            return true; // Consider it 'successful' as the data is present
        }

        challenges.push(challengeObject); // Add the new challenge object to the array

        // Save the updated array back to localStorage
        localStorage.setItem(STORAGE_KEY, JSON.stringify(challenges));

        console.log(`Challenge ${challengeObject.localId} saved to localStorage.`);
        return true;
    } catch (e) {
        console.error("Error saving challenge to localStorage:", e);
        // Check for QuotaExceededError specifically
        if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
            alert("Could not save challenge: Your browser's local storage is full. You may need to delete old challenges.");
        } else {
            alert("Could not save challenge due to a browser storage error.");
        }
        return false;
    }
}

/**
 * Retrieves a specific challenge from local storage by its local ID.
 * @param {string} localId - The unique local ID of the challenge to retrieve.
 * @returns {object|null} The challenge object if found, otherwise null.
 */
export function getLocalChallengeById(localId) {
    if (!localId) return null;
    try {
        const challenges = getLocalChallenges();
        return challenges.find(c => c.localId === localId) || null;
    } catch (e) {
        // getLocalChallenges already handles read errors, but catch just in case.
        console.error(`Error retrieving challenge ${localId} by ID:`, e);
        return null;
    }
}

/**
 * Deletes a challenge from local storage by its local ID.
 * @param {string} localId - The unique local ID of the challenge to delete.
 * @returns {boolean} True if a challenge was found and deletion was attempted successfully, false otherwise.
 */
export function deleteLocalChallenge(localId) {
    if (!localId) return false;
     try {
        let challenges = getLocalChallenges();
        const initialLength = challenges.length;
        // Create a new array excluding the challenge with the matching localId
        challenges = challenges.filter(c => c.localId !== localId);

        // Check if any challenge was actually removed
        if (challenges.length < initialLength) {
            // Save the filtered array back to localStorage
            localStorage.setItem(STORAGE_KEY, JSON.stringify(challenges));
            console.log(`Challenge ${localId} deleted from localStorage.`);
            return true;
        } else {
            console.warn(`Challenge ${localId} not found in localStorage for deletion.`);
            return false; // Not found, so technically not deleted
        }
    } catch (e) {
        console.error("Error deleting challenge from localStorage:", e);
        alert("Could not delete challenge due to a storage error.");
        return false;
    }
}

export function updateLocalChallengeProgress(localId, progressKey, isComplete) {
    if (!localId || typeof progressKey !== 'string') {
        console.error("Cannot update progress: Missing localId or progressKey.");
        return false;
    }

    try {
        let challenges = getLocalChallenges(); // Get all challenges
        let challengeUpdated = false;

        // Find and update the specific challenge
        challenges = challenges.map(challenge => {
            if (challenge.localId === localId) {
                // Ensure progressData exists and is an object
                if (!challenge.progressData || typeof challenge.progressData !== 'object') {
                    challenge.progressData = {};
                }
                // Update the specific key
                if (isComplete) {
                    challenge.progressData[progressKey] = true;
                } else {
                    // If unchecking, delete the key
                    delete challenge.progressData[progressKey];
                }
                challengeUpdated = true; // Mark that we found and modified it
                console.log(`Updated progress for ${localId}: Key ${progressKey} set to ${isComplete}`);
            }
            return challenge; // Return modified or original challenge
        });

        // Save back only if a challenge was actually updated
        if (challengeUpdated) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(challenges));
            return true;
        } else {
            console.warn(`Could not find local challenge with ID ${localId} to update progress.`);
            return false;
        }

    } catch (e) {
        console.error("Error updating challenge progress in localStorage:", e);
        alert("Could not save progress due to a storage error.");
        return false;
    }
}