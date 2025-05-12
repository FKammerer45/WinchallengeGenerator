// app/static/js/challenge_view/socket_handler.js

// Imports from other modules
import { showError } from '../utils/helpers.js';
import {
    handleServerTimerStarted,
    handleServerTimerStopped,
    handleServerTimerReset
} from './timer.js';
import {
    renderProgressItems,
    renderOrUpdateProgressBar,
    updatePenaltyDisplay
    // Potentially other UI updaters if needed for other socket events
} from './ui.js';

let socket = null; // Module-scoped socket instance
let listenersAttached = false; // Flag to ensure listeners are attached only once per connection/room join

/**
 * Initializes the Socket.IO connection and sets up event listeners for a shared challenge.
 * @param {object} challengeConfig - The main challenge configuration object from main.js.
 * @param {HTMLElement} statusDisplayElement - The DOM element for displaying status/error messages.
 */
export function initializeChallengeSockets(challengeConfig, statusDisplayElement) {
    if (challengeConfig.isLocal || typeof window.io !== 'function') {
        if (!challengeConfig.isLocal) { // Only log/show error if it's a shared challenge expecting sockets
            console.warn("[SocketHandler] Socket.IO client (window.io) not found. Real-time updates will be unavailable.");
            if (statusDisplayElement && typeof window.io !== 'function') {
                showError(statusDisplayElement, "Real-time updates unavailable (Socket.IO library missing).", "danger");
            }
        }
        return; // Do not proceed if local or Socket.IO library is missing
    }
    console.info("[SocketHandler] Initializing WebSocket connection. Current socket state:", socket ? `ID: ${socket.id}, Connected: ${socket.connected}` : "null");

    // If a socket instance exists, disconnect and clear it to ensure fresh setup
    if (socket) {
        console.info(`[SocketHandler] Existing socket found (ID: ${socket.id}, Connected: ${socket.connected}). Disconnecting and clearing listeners.`);
        socket.disconnect();
        socket.off(); // Explicitly remove all listeners from the old socket instance
        socket = null;
        listenersAttached = false; // Reset flag
    }

    // Create a new socket instance for this initialization
    socket = io(window.location.origin, {
        path: '/socket.io/', // Ensure trailing slash matches server if it's sensitive
        transports: ['websocket', 'polling'], // Try websocket first
        reconnectionAttempts: 5,
        reconnectionDelay: 3000,
        timeout: 10000,
    });

    console.info("[SocketHandler] New Socket instance created. Attaching base listeners...");

    // --- Standard Connection Event Handlers ---
    socket.on('connect', () => {
        console.info(`[SocketHandler] EVENT: connect. Successfully connected. SID: ${socket.id}`);
        listenersAttached = false; // Reset flag on new connection before attempting to join room
        if (challengeConfig.id) { // challengeConfig.id should be the public_id
            socket.emit('join_challenge_room', { challenge_id: challengeConfig.id });
            console.info(`[SocketHandler] Emitted 'join_challenge_room' for challenge: ${challengeConfig.id} using SID: ${socket.id}`);
        } else {
            console.error('[SocketHandler] Cannot join room: challengeConfig.id is missing.');
        }
    });

    socket.on('disconnect', (reason) => {
        console.warn(`[SocketHandler] EVENT: disconnect. SID: ${socket?.id}. Reason: ${reason}`);
        listenersAttached = false; // Reset flag
        if (statusDisplayElement) {
            if (reason === 'io server disconnect') {
                showError(statusDisplayElement, 'Lost connection to real-time updates (server initiated).', 'warning');
            } else if (reason !== 'io client disconnect') {
                showError(statusDisplayElement, `Connection to real-time updates lost: ${reason}. Attempting to reconnect...`, 'warning');
            }
        }
    });

    socket.on('connect_error', (error) => {
        console.error(`[SocketHandler] EVENT: connect_error. SID: ${socket?.id}. Error: ${error.message}`, error);
        listenersAttached = false; // Reset flag
        if (statusDisplayElement) {
            showError(statusDisplayElement, `WebSocket Connection Error: ${error.message}. Real-time updates may be unavailable.`, 'warning');
        }
    });

    socket.io.on("reconnect_attempt", (attempt) => {
        console.info(`[SocketHandler] Reconnect attempt ${attempt}`);
    });

    socket.io.on("reconnect_failed", () => {
        console.error("[SocketHandler] Reconnection failed after multiple attempts.");
        if (statusDisplayElement) {
            showError(statusDisplayElement, "Failed to reconnect to real-time updates. Please refresh the page.", "danger");
        }
    });

    socket.io.on("reconnect_error", (error) => {
        console.error("[SocketHandler] Reconnection error:", error.message);
    });

    socket.io.on("error", (error) => { // General manager errors
        console.error("[SocketHandler Manager Error]:", error.message, error);
    });

    // --- Application-Specific Event Handlers ---
    socket.on('room_joined', (data) => {
        console.info(`[SocketHandler] EVENT: room_joined. Successfully joined room: ${data.room}. SID: ${socket.id}.`);

        if (!listenersAttached) {
            console.info(`[SocketHandler] Attaching application event listeners for room ${data.room} on SID ${socket.id}`);
            socket.on('initial_state', (data) => {
                console.log('[SocketHandler] Received initial_state:', data);
                // ...
                // Dispatch a custom event for main.js to update its general 'challengeConfig' if needed
                document.dispatchEvent(new CustomEvent('socketInitialStateReceived', { detail: data }));
            });
            socket.on('timer_started', (eventData) => {
                console.info("[SocketHandler] Received 'timer_started' event. Data:", eventData);
                if (eventData && eventData.challenge_id === challengeConfig.id) {
                    handleServerTimerStarted(eventData); // From timer.js
                } else {
                    console.warn("[SocketHandler] 'timer_started' event ignored (mismatched ID or no data).");
                }
            });

            socket.on('timer_stopped', (eventData) => {
                console.info("[SocketHandler] Received 'timer_stopped' event. Data:", eventData);
                if (eventData && eventData.challenge_id === challengeConfig.id) {
                    handleServerTimerStopped(eventData); // From timer.js
                } else {
                    console.warn("[SocketHandler] 'timer_stopped' event ignored (mismatched ID or no data).");
                }
            });

            socket.on('timer_reset', (eventData) => {
                console.info("[SocketHandler] Received 'timer_reset' event. Data:", eventData);
                if (eventData && eventData.challenge_id === challengeConfig.id) {
                    handleServerTimerReset(eventData); // From timer.js
                } else {
                    console.warn("[SocketHandler] 'timer_reset' event ignored (mismatched ID or no data).");
                }
            });

            socket.on('progress_update', (eventData) => {
                // console.debug('[SocketHandler] Received progress_update:', eventData); // Keep as debug if too noisy
                if (eventData && eventData.challenge_id === challengeConfig.id) {
                    const groupIndex = challengeConfig.initialGroups.findIndex(g => g.id === eventData.group_id);
                    if (groupIndex !== -1) {
                        challengeConfig.initialGroups[groupIndex].progress = eventData.progress_data || {};
                        const progressContainer = document.querySelector(`.group-card-wrapper[data-group-id="${eventData.group_id}"] .group-progress-container`);
                        if (progressContainer && challengeConfig.coreChallengeStructure) {
                            const canInteract = challengeConfig.isAuthorized && (challengeConfig.userJoinedGroupId === eventData.group_id);
                            renderProgressItems(progressContainer, challengeConfig.coreChallengeStructure, eventData.group_id, eventData.progress_data, canInteract); // From ui.js
                        }
                        const progressBarContainer = document.getElementById(`progressBarContainer-${eventData.group_id}`);
                        if (progressBarContainer && challengeConfig.coreChallengeStructure && eventData.progress_stats) {
                            renderOrUpdateProgressBar(progressBarContainer, challengeConfig.coreChallengeStructure, eventData.progress_stats); // From ui.js
                        }
                    }
                }
            });

            socket.on('active_penalty_update', (eventData) => {
                // console.debug('[SocketHandler] Received active_penalty_update:', eventData); // Keep as debug
                if (eventData && eventData.challenge_id === challengeConfig.id) {
                    const groupIndex = challengeConfig.initialGroups.findIndex(g => g.id === eventData.group_id);
                    if (groupIndex !== -1) {
                        challengeConfig.initialGroups[groupIndex].active_penalty_text = eventData.penalty_text || "";
                    }
                    updatePenaltyDisplay(eventData.group_id, eventData.penalty_text); // From ui.js
                }
            });

            socket.on('group_created', (eventData) => {
                console.log('[SocketHandler] Received group_created:', eventData);
                if (eventData && eventData.challenge_id === challengeConfig.id && eventData.new_group) {
                    // Dispatch a custom event for main.js to handle, or call a function directly
                    document.dispatchEvent(new CustomEvent('socketGroupCreated', { detail: eventData.new_group }));
                }
            });

            socket.on('group_membership_update', (eventData) => {
                console.log('[SocketHandler] Received group_membership_update:', eventData);
                if (eventData && eventData.challenge_id === challengeConfig.id) {
                    document.dispatchEvent(new CustomEvent('socketGroupMembershipUpdate', { detail: eventData }));
                }
            });

            socket.on('player_names_updated', (eventData) => {
                console.log('[SocketHandler] Received player_names_updated:', eventData);
                if (eventData && eventData.challenge_id === challengeConfig.id) {
                    document.dispatchEvent(new CustomEvent('socketPlayerNamesUpdated', { detail: eventData }));
                }
            });

            listenersAttached = true;
            console.info(`[SocketHandler] All application event listeners configured and active for room ${data.room} on SID ${socket.id}`);
        } else {
            console.info(`[SocketHandler] Listeners already attached for SID ${socket.id}, room ${data.room}. Skipping re-attachment.`);
        }
    });

    socket.on('room_join_error', (data) => {
        console.error(`[SocketHandler] EVENT: room_join_error. Error: ${data.error}. SID: ${socket.id}`);
        if (statusDisplayElement) {
            showError(statusDisplayElement, `Could not join challenge updates: ${data.error}`, 'warning');
        }
    });
}

/**
 * Disconnects the socket if it's active and clears the reference.
 */
export function disconnectChallengeSockets() {
    if (socket) {
        console.info("[SocketHandler] Explicitly disconnecting socket.");
        if (socket.connected) {
            socket.disconnect();
        }
        socket.off(); // Remove all listeners from this socket instance
        socket = null;
    }
    listenersAttached = false; // Reset flag
}
