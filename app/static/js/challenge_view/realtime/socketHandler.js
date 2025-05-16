// app/static/js/challenge_view/socket_handler.js
import { showError } from '../../utils/helpers.js';
// Timer handlers are still directly called as they are specific state updates for that module
import {
    handleServerTimerStarted,
    handleServerTimerStopped,
    handleServerTimerReset,
    // updateTimerStateFromServer // This will be called by main.js via an event
} from './timerHandler.js';

let socket = null;
let listenersAttached = false; // To prevent attaching listeners multiple times per connection

/**
 * Initializes the Socket.IO connection and sets up event listeners for a shared challenge.
 * @param {string} challengeId - The public ID of the challenge to connect to.
 * @param {boolean} isLocal - Flag indicating if the challenge is local (no socket needed).
 * @param {HTMLElement} statusDisplayElement - For displaying connection status/errors.
 */
export function initializeChallengeSockets(challengeId, isLocal, statusDisplayElement) {
    if (isLocal || typeof window.io !== "function") {
        if (!isLocal && statusDisplayElement) {
            showError(statusDisplayElement, "Real-time updates unavailable (Socket.IO library missing or not applicable).", "warning");
        }
        return;
    }

    if (socket && socket.connected) {
        console.info("[SocketHandler] Existing socket connected. Disconnecting first for fresh setup.");
        socket.disconnect();
    }
    if (socket) {
        socket.off(); // Remove all previous listeners
        socket = null;
    }
    listenersAttached = false;

    console.info("[SocketHandler] Initializing new WebSocket connection...");
    socket = io(window.location.origin, {
        path: "/socket.io/",
        transports: ["websocket", "polling"],
        reconnectionAttempts: 5,
        reconnectionDelay: 3000,
        timeout: 10000,
    });

    socket.on("connect", () => {
        console.info(`[SocketHandler] Connected to WebSocket. SID: ${socket.id}`);
        listenersAttached = false; // Reset on new connection before joining room
        if (challengeId) {
            socket.emit("join_challenge_room", { challenge_id: challengeId });
        } else {
            console.error("[SocketHandler] Cannot join room: challengeId is missing.");
            showError(statusDisplayElement, "Error: Missing challenge ID for real-time updates.", "danger");
        }
    });

    socket.on("disconnect", (reason) => {
        console.warn(`[SocketHandler] Disconnected from WebSocket. Reason: ${reason}`);
        listenersAttached = false;
        if (statusDisplayElement) {
            const message = reason === "io server disconnect" ? "Lost real-time connection (server)." : `Real-time connection lost: ${reason}. Reconnecting...`;
            if (reason !== "io client disconnect") { // Avoid error on manual/programmatic disconnect
                showError(statusDisplayElement, message, "warning");
            }
        }
    });

    socket.on("connect_error", (error) => {
        console.error(`[SocketHandler] WebSocket Connection Error: ${error.message}`, error);
        listenersAttached = false;
        if (statusDisplayElement) {
            showError(statusDisplayElement, `Connection Error: ${error.message}. Updates may be unavailable.`, "danger");
        }
    });

    // Manager events for reconnection attempts
    socket.io.on("reconnect_attempt", (attempt) => console.info(`[SocketHandler] Reconnect attempt ${attempt}`));
    socket.io.on("reconnect_failed", () => {
        console.error("[SocketHandler] Reconnection failed permanently.");
        if (statusDisplayElement) showError(statusDisplayElement, "Failed to reconnect to real-time updates. Please refresh.", "danger");
    });
    socket.io.on("reconnect_error", (error) => console.error("[SocketHandler] Reconnection error:", error.message));
    socket.io.on("error", (error) => console.error("[SocketHandler Manager Error]:", error.message, error));


    // --- Application-Specific Event Handlers ---
    // These are only attached ONCE after a successful room join.
    socket.on("room_joined", (data) => {
        console.info(`[SocketHandler] Successfully joined room: ${data.room}. SID: ${socket.id}.`);
        if (statusDisplayElement) showError(statusDisplayElement, null); // Clear any previous errors

        if (!listenersAttached) {
            console.log("[SocketHandler] Attaching application-specific event listeners for room:", data.room);

            socket.on("initial_state", (initialStateData) => {
                console.debug("[SocketHandler] Event: initial_state", JSON.parse(JSON.stringify(initialStateData)));
                if (initialStateData && initialStateData.challenge_id === challengeId) {
                    document.dispatchEvent(new CustomEvent("socketInitialStateReceived", { detail: initialStateData }));
                }
            });

            socket.on("timer_started", (eventData) => {
                console.debug("[SocketHandler] Event: timer_started", eventData);
                if (eventData && eventData.challenge_id === challengeId) handleServerTimerStarted(eventData);
            });
            socket.on("timer_stopped", (eventData) => {
                console.debug("[SocketHandler] Event: timer_stopped", eventData);
                if (eventData && eventData.challenge_id === challengeId) handleServerTimerStopped(eventData);
            });
            socket.on("timer_reset", (eventData) => {
                console.debug("[SocketHandler] Event: timer_reset", eventData);
                if (eventData && eventData.challenge_id === challengeId) handleServerTimerReset(eventData);
            });

            socket.on("progress_update", (eventData) => {
                console.debug("[SocketHandler] Event: progress_update", eventData);
                if (eventData && eventData.challenge_id === challengeId) {
                    document.dispatchEvent(new CustomEvent("socketProgressUpdateReceived", { detail: eventData }));
                }
            });

            socket.on("active_penalty_update", (eventData) => {
                console.debug("[SocketHandler] Event: active_penalty_update", eventData);
                if (eventData && eventData.challenge_id === challengeId) {
                    document.dispatchEvent(new CustomEvent("socketActivePenaltyUpdateReceived", { detail: eventData }));
                }
            });

            socket.on("group_created", (eventData) => {
                console.debug("[SocketHandler] Event: group_created", eventData);
                if (eventData && eventData.challenge_id === challengeId && eventData.new_group) {
                    document.dispatchEvent(new CustomEvent("socketGroupCreatedReceived", { detail: eventData.new_group }));
                }
            });

            socket.on("group_membership_update", (eventData) => {
                console.debug("[SocketHandler] Event: group_membership_update", eventData);
                if (eventData && eventData.challenge_id === challengeId) {
                    document.dispatchEvent(new CustomEvent("socketGroupMembershipUpdateReceived", { detail: eventData }));
                }
            });

            socket.on("player_names_updated", (eventData) => {
                console.debug("[SocketHandler] Event: player_names_updated", eventData);
                if (eventData && eventData.challenge_id === challengeId) {
                    document.dispatchEvent(new CustomEvent("socketPlayerNamesUpdatedReceived", { detail: eventData }));
                }
            });

            socket.on("challenge_penalties_updated", (eventData) => {
                console.debug("[SocketHandler] Event: challenge_penalties_updated", eventData);
                if (eventData && eventData.challenge_id === challengeId) {
                    document.dispatchEvent(new CustomEvent("socketChallengePenaltiesUpdatedReceived", { detail: eventData }));
                }
            });
             socket.on("penalty_result", (eventData) => { // Listener for penalty wheel spin results
                console.debug("[SocketHandler] Event: penalty_result (for wheel animation)", eventData);
                if (eventData && eventData.challenge_id === challengeId && eventData.result) {
                    document.dispatchEvent(new CustomEvent("socketPenaltySpinResultReceived", { detail: eventData }));
                }
            });


            listenersAttached = true;
        } else {
            console.log("[SocketHandler] Listeners already attached for this connection.");
        }
    });

    socket.on("room_join_error", (data) => {
        console.error(`[SocketHandler] Room Join Error: ${data.error}. SID: ${socket?.id}`);
        if (statusDisplayElement) showError(statusDisplayElement, `Could not join challenge updates: ${data.error}`, "danger");
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
        socket.off(); // Remove all listeners
        socket = null;
    }
    listenersAttached = false;
}