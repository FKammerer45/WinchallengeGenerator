// app/static/js/challenge_view/config.js
import { showError } from '../utils/helpers.js'; // Adjusted path
import { getLocalChallengeById as getLocalChallengeByIdUtil } from '../utils/local_storage.js';

// --- Module-level State for Challenge Configuration ---
export let challengeConfig = {
    id: null, // public_id of the challenge
    currentUserId: null,        // ID of the currently logged-in user, if any
    currentUserUsername: null,  // Username of the currently logged-in user, if any
    creatorUsername: null,      // Username of the challenge creator
    isLocal: false,
    isMultigroup: false,
    maxGroups: 1,
    initialGroupCount: 0,
    userJoinedGroupId: null,    // DB ID of the group the current user is in, or null
    coreChallengeStructure: null, // The {normal, b2b} structure from challenge_data
    progressData: {},           // For local challenges: { progressKey: true }
    penaltyInfo: null,          // { source_tab_id, source_tab_name, penalties: [] }
    userPenaltyTabsData: null,  // User's saved penalty tabs data
    csrfToken: null,
    numPlayersPerGroup: 1,
    initialGroups: [],          // Array of group objects from server/localStorage
    urls: {
        addGroup: null,
        updateProgressBase: null,
        joinLeaveBase: null,
        setPenaltyUrlBase: null,
        savePlayersBase: null,
        authorizeUser: null,
        removeUserBase: null,
        profile: null, // Added from main.js
        timerStart: null,
        timerStop: null,
        timerReset: null
    },
    isLoggedIn: false,
    isCreator: false,
    isAuthorized: false, // Is the current user (if logged in) authorized for this specific challenge
    authorizedUsers: [],      // List of {id, username} objects for users authorized by the creator
    initialTimerState: {
        current_value_seconds: 0,
        is_running: false,
        last_started_at_utc: null
    }
    // Add other config properties as needed
};

/**
 * Initializes the challengeConfig object by reading data from the hidden #challengeData div in the HTML.
 * @returns {boolean} True if initialization is successful, false otherwise.
 */
export function initializeConfigFromDOM() {
    const dataEl = document.getElementById('challengeData');
    const statusDiv = document.getElementById('pageStatusDisplay'); // For showing errors

    if (!dataEl?.dataset) {
        console.error("CRITICAL: #challengeData element or its dataset is missing!");
        if (statusDiv) showError(statusDiv, "Initialization Error: Cannot read page data.", "danger");
        return false;
    }

    try {
        const rawData = dataEl.dataset;

        const parsedMaxGroups = parseInt(rawData.maxGroups, 10);
        const parsedNumPlayers = parseInt(rawData.numPlayersPerGroup, 10);
        const initialGroupsData = rawData.initialGroups && rawData.initialGroups !== 'null' ? JSON.parse(rawData.initialGroups) : [];
        const coreStructure = rawData.challengeJson && rawData.challengeJson !== 'null' ? JSON.parse(rawData.challengeJson) : null;
        const penaltyData = rawData.penaltyInfo && rawData.penaltyInfo !== 'null' ? JSON.parse(rawData.penaltyInfo) : null;
        const userJoinedGroupIdParsed = JSON.parse(rawData.userJoinedGroupId || 'null');
        const currentUserIdParsed = rawData.currentUserId ? parseInt(rawData.currentUserId, 10) : null;
        const userPenaltyTabsRaw = rawData.userPenaltyTabs; // Assuming data-user-penalty-tabs
        const parsedUserPenaltyTabs = userPenaltyTabsRaw && userPenaltyTabsRaw !== 'null' ? JSON.parse(userPenaltyTabsRaw) : null;
        const authorizedUsersRaw = rawData.authorizedUsers; // Assuming data-authorized-users as JSON string
        const parsedAuthorizedUsers = authorizedUsersRaw && authorizedUsersRaw !== 'null' ? JSON.parse(authorizedUsersRaw) : [];


        challengeConfig.id = rawData.challengeId;
        challengeConfig.currentUserId = !isNaN(currentUserIdParsed) && currentUserIdParsed > 0 ? currentUserIdParsed : null;
        challengeConfig.currentUserUsername = rawData.currentUserUsername && rawData.currentUserUsername !== 'null' ? rawData.currentUserUsername : null;
        challengeConfig.creatorUsername = rawData.creatorUsername && rawData.creatorUsername !== 'null' ? rawData.creatorUsername : null;
        challengeConfig.userPenaltyTabsData = parsedUserPenaltyTabs;
        challengeConfig.authorizedUsers = Array.isArray(parsedAuthorizedUsers) ? parsedAuthorizedUsers : [];
        challengeConfig.isLocal = rawData.isLocal === 'true';
        challengeConfig.isMultigroup = rawData.isMultigroup === 'true';
        challengeConfig.maxGroups = (!isNaN(parsedMaxGroups) && parsedMaxGroups >= 1) ? parsedMaxGroups : 1;
        challengeConfig.initialGroupCount = Array.isArray(initialGroupsData) ? initialGroupsData.length : 0;
        challengeConfig.userJoinedGroupId = typeof userJoinedGroupIdParsed === 'number' ? userJoinedGroupIdParsed : null;
        challengeConfig.coreChallengeStructure = coreStructure;
        challengeConfig.progressData = challengeConfig.isLocal ? (getLocalChallengeById(challengeConfig.id)?.progressData || {}) : {}; // Only for local
        challengeConfig.penaltyInfo = penaltyData;
        challengeConfig.csrfToken = rawData.csrfToken;
        challengeConfig.numPlayersPerGroup = (!isNaN(parsedNumPlayers) && parsedNumPlayers >= 1) ? parsedNumPlayers : 1;
        challengeConfig.initialGroups = Array.isArray(initialGroupsData) ? initialGroupsData : [];
        challengeConfig.isLoggedIn = rawData.isLoggedIn === 'true';
        challengeConfig.isCreator = rawData.isCreator === 'true';
        challengeConfig.isAuthorized = rawData.isAuthorized === 'true';

        challengeConfig.urls = {
            addGroup: rawData.addGroupUrl || null,
            updateProgressBase: rawData.updateProgressUrlBase || null,
            joinLeaveBase: rawData.joinLeaveUrlBase || null,
            setPenaltyUrlBase: rawData.setPenaltyUrlBase || null,
            savePlayersBase: rawData.savePlayersUrlBase || null,
            authorizeUser: rawData.authorizeUserUrl || null,
            removeUserBase: rawData.removeUserUrlBase || null,
            profile: rawData.profileUrl || null,
            timerStart: rawData.timerStartUrl || null,
            timerStop: rawData.timerStopUrl || null,
            timerReset: rawData.timerResetUrl || null
        };

        challengeConfig.initialTimerState = {
            current_value_seconds: parseInt(rawData.timerCurrentValue, 10) || 0,
            is_running: rawData.timerIsRunning === 'true',
            last_started_at_utc: rawData.timerLastStartedUtc || null
        };

        if (!challengeConfig.id && !challengeConfig.isLocal) { // Shared challenges MUST have an ID
            throw new Error("Essential config 'challengeId' (public_id) missing or invalid for shared challenge.");
        }
        if (challengeConfig.isLocal && !challengeConfig.id) { // Local challenges also need an ID
             throw new Error("Essential config 'challengeId' (local_id) missing or invalid for local challenge.");
        }


        console.log("[ConfigModule] Initialized challengeConfig from DOM:", JSON.parse(JSON.stringify(challengeConfig)));
        return true;

    } catch (e) {
        console.error("challenge_view/config.js: Failed to parse or process initial data:", e);
        if (statusDiv) showError(statusDiv, `Initialization Error: ${e.message}`, 'danger');
        return false;
    }
}

// Helper to get local challenge data if needed elsewhere, specific to this view's context
function getLocalChallengeById(localId) {
    // Uses the imported utility from local_storage.js
    try {
        return getLocalChallengeByIdUtil(localId);
    } catch (e) {
        console.error("Error calling getLocalChallengeByIdUtil for localId \"%s\":", localId, e);
        // Optionally, show an error to the user if this is critical path
        // showError(document.getElementById('pageStatusDisplay'), "Error accessing local challenge data.", "warning");
        return null;
    }
}

/**
 * Updates the userJoinedGroupId in the module state and the hidden DOM element.
 * @param {number | null} newGroupId - The new group ID or null if leaving.
 */
export function updateUserJoinedGroupState(newGroupId) {
    // Ensure newGroupId is stored as a number or null
    const numericGroupId = (newGroupId === null || newGroupId === undefined || isNaN(Number(newGroupId))) ? null : Number(newGroupId);
    challengeConfig.userJoinedGroupId = numericGroupId;
    
    const dataEl = document.getElementById('challengeData');
    if (dataEl) {
        dataEl.dataset.userJoinedGroupId = JSON.stringify(numericGroupId); // Store as JSON string
    }
    // Any module interested in this change (like penalty.js) should subscribe to an event
    // or have its config updated by main.js when this changes.
    document.dispatchEvent(new CustomEvent('userGroupMembershipChanged', { detail: { newGroupId } }));
}

export function addGroupToConfig(newGroupData) {
    if (!newGroupData || typeof newGroupData.id === 'undefined') {
        console.error("[ConfigModule] Invalid new group data provided to addGroupToConfig:", newGroupData);
        return;
    }
    if (!Array.isArray(challengeConfig.initialGroups)) {
        console.warn("[ConfigModule] challengeConfig.initialGroups was not an array. Initializing.");
        challengeConfig.initialGroups = [];
    }
    // Avoid duplicates if somehow called multiple times with the same group
    if (!challengeConfig.initialGroups.some(g => g.id === newGroupData.id)) {
        challengeConfig.initialGroups.push(newGroupData);
        challengeConfig.initialGroupCount = challengeConfig.initialGroups.length;
        console.log("[ConfigModule] Group added to config. New count:", challengeConfig.initialGroupCount, newGroupData);
    } else {
        console.warn("[ConfigModule] Group already exists in config:", newGroupData.id);
    }
}

export function updateGroupInConfig(updatedGroupData) {
    if (!updatedGroupData || typeof updatedGroupData.id === 'undefined') {
        console.error("[ConfigModule] Invalid group data for updateGroupInConfig:", updatedGroupData);
        return false;
    }
    if (!Array.isArray(challengeConfig.initialGroups)) {
        challengeConfig.initialGroups = []; // Should not happen if initialized properly
        return false;
    }
    const groupIndex = challengeConfig.initialGroups.findIndex(g => g.id === updatedGroupData.id);
    if (groupIndex !== -1) {
        // Correctly merge updatedGroupData into the existing group
        challengeConfig.initialGroups[groupIndex] = { 
            ...challengeConfig.initialGroups[groupIndex], 
            ...updatedGroupData 
        };
        // console.log(`[Config] Group ${updatedGroupData.id} updated in local config.`);
        return true; // Indicate success
    } else {
        console.warn(`[ConfigModule] Group ${updatedGroupData.id} not found for update.`);
        return false; // Indicate failure
    }
}

/**
 * Removes a group from the local challengeConfig.initialGroups array.
 * @param {number|string} groupId - The ID of the group to remove.
 */
export function removeGroupFromConfig(groupId) {
    const groupIdNum = Number(groupId);
    const groupIndex = challengeConfig.initialGroups.findIndex(g => g.id === groupIdNum);
    if (groupIndex !== -1) {
        challengeConfig.initialGroups.splice(groupIndex, 1);
        challengeConfig.initialGroupCount = challengeConfig.initialGroups.length;
        // console.log(`[Config] Group ${groupIdNum} removed from local config. New count: ${challengeConfig.initialGroupCount}`);

        // If the deleted group was the user's joined group, update that too
        if (challengeConfig.userJoinedGroupId === groupIdNum) {
            updateUserJoinedGroupState(null); // User is no longer in any group
            // console.log(`[Config] User was in deleted group ${groupIdNum}, now not in any group.`);
        }
    } else {
        // console.warn(`[Config] Cannot remove group: Group ${groupIdNum} not found in local config.`);
    }
}
// Stray lines that were here are now removed by the above correction to updateGroupInConfig
// and ensuring removeGroupFromConfig is self-contained.

/**
 * Adds an authorized user to the challengeConfig.authorizedUsers list.
 * @param {object} userData - The user object {id, username}.
 */
export function addAuthorizedUserToConfig(userData) {
    if (!userData || typeof userData.id === 'undefined' || typeof userData.username === 'undefined') {
        console.error("[ConfigModule] Invalid user data provided to addAuthorizedUserToConfig:", userData);
        return;
    }
    if (!Array.isArray(challengeConfig.authorizedUsers)) {
        challengeConfig.authorizedUsers = [];
    }
    // Avoid duplicates
    if (!challengeConfig.authorizedUsers.some(u => u.id === userData.id)) {
        challengeConfig.authorizedUsers.push(userData);
        // console.log("[ConfigModule] Authorized user added:", userData, "New list:", challengeConfig.authorizedUsers);
        // Optionally, dispatch an event if other modules need to react to this change directly
        // document.dispatchEvent(new CustomEvent('authorizedUsersChanged', { detail: { authorizedUsers: challengeConfig.authorizedUsers } }));
    } else {
        // console.warn("[ConfigModule] User already authorized:", userData.id);
    }
}

/**
 * Removes an authorized user from the challengeConfig.authorizedUsers list.
 * @param {number|string} userIdToRemove - The ID of the user to remove.
 */
export function removeAuthorizedUserFromConfig(userIdToRemove) {
    const idToRemove = parseInt(String(userIdToRemove), 10);
    if (isNaN(idToRemove)) {
        console.error("[ConfigModule] Invalid userIdToRemove provided to removeAuthorizedUserFromConfig:", userIdToRemove);
        return;
    }
    if (!Array.isArray(challengeConfig.authorizedUsers)) {
        challengeConfig.authorizedUsers = [];
        return;
    }
    const initialLength = challengeConfig.authorizedUsers.length;
    challengeConfig.authorizedUsers = challengeConfig.authorizedUsers.filter(u => u.id !== idToRemove);
    
    if (challengeConfig.authorizedUsers.length < initialLength) {
        // console.log(`[ConfigModule] Authorized user ${idToRemove} removed. New list:`, challengeConfig.authorizedUsers);
        // Optionally, dispatch an event
        // document.dispatchEvent(new CustomEvent('authorizedUsersChanged', { detail: { authorizedUsers: challengeConfig.authorizedUsers } }));
    } else {
        // console.warn(`[ConfigModule] User ${idToRemove} not found in authorized list for removal.`);
    }
}

/**
 * Updates the progress for a specific item within a group's progress data.
 * @param {number} groupId - The ID of the group to update.
 * @param {string} progressKey - The key of the progress item (e.g., 'normal_itemName_0').
 * @param {boolean} isComplete - The new completion status.
 */
export function updateGroupProgressInConfig(groupId, progressKey, isComplete) {
    if (!Array.isArray(challengeConfig.initialGroups)) {
        console.error("[ConfigModule] initialGroups is not an array.");
        return;
    }
    const group = challengeConfig.initialGroups.find(g => g.id === groupId);
    if (group) {
        if (!group.progress) {
            group.progress = {};
        }
        group.progress[progressKey] = isComplete;
        // console.log(`[ConfigModule] Progress updated for group ${groupId}, item ${progressKey}: ${isComplete}`);
    } else {
        console.warn(`[ConfigModule] Group ${groupId} not found for progress update.`);
    }
}

/**
 * Updates the active penalty text for a specific group.
 * @param {number} groupId - The ID of the group to update.
 * @param {string} penaltyText - The new penalty text.
 */
export function updateGroupPenaltyTextInConfig(groupId, penaltyText) {
    if (!Array.isArray(challengeConfig.initialGroups)) {
        console.error("[ConfigModule] initialGroups is not an array.");
        return;
    }
    const group = challengeConfig.initialGroups.find(g => g.id === groupId);
    if (group) {
        group.active_penalty_text = penaltyText;
        // console.log(`[ConfigModule] Penalty text updated for group ${groupId}: "${penaltyText}"`);
    } else {
        console.warn(`[ConfigModule] Group ${groupId} not found for penalty text update.`);
    }
}

// NOTE: The duplicate removeGroupFromConfig function that was causing the SyntaxError
// has been removed from this full file content.
// The first definition (around line 212) is the correct one and is retained.
