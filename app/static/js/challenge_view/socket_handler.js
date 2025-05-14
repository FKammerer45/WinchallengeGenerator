// app/static/js/challenge_view/socket_handler.js

// Imports from other modules
import { showError } from "../utils/helpers.js";
import {
  handleServerTimerStarted,
  handleServerTimerStopped,
  handleServerTimerReset,
} from "./timer.js";
import {
  renderProgressItems,
  renderOrUpdateProgressBar,
  updatePenaltyDisplay,
  // No direct import of addGroupToDOM as it's handled via main.js custom event
} from "./ui.js";

let socket = null; // Module-scoped socket instance
let listenersAttached = false; // Flag to ensure listeners are attached only once per connection/room join

/**
 * Initializes the Socket.IO connection and sets up event listeners for a shared challenge.
 * @param {object} challengeConfig - The main challenge configuration object from main.js.
 * @param {HTMLElement} statusDisplayElement - The DOM element for displaying status/error messages.
 */
export function initializeChallengeSockets(
  challengeConfig,
  statusDisplayElement
) {
  if (challengeConfig.isLocal || typeof window.io !== "function") {
    if (!challengeConfig.isLocal) {
      console.warn(
        "[SocketHandler] Socket.IO client (window.io) not found. Real-time updates unavailable."
      );
      if (statusDisplayElement && typeof window.io !== "function") {
        showError(
          statusDisplayElement,
          "Real-time updates unavailable (Socket.IO library missing).",
          "danger"
        );
      }
    }
    return;
  }
  // console.info("[SocketHandler] Initializing WebSocket connection. Current socket state:", socket ? `ID: ${socket.id}, Connected: ${socket.connected}` : "null");

  if (socket) {
    // console.info(`[SocketHandler] Existing socket found (ID: ${socket.id}, Connected: ${socket.connected}). Disconnecting.`);
    socket.disconnect();
    socket.off(); // Remove all listeners from the old instance
    socket = null;
    listenersAttached = false;
  }

  socket = io(window.location.origin, {
    path: "/socket.io/",
    transports: ["websocket", "polling"],
    reconnectionAttempts: 5,
    reconnectionDelay: 3000,
    timeout: 10000,
  });

  // console.info("[SocketHandler] New Socket instance created. Attaching base listeners...");

  socket.on("connect", () => {
    console.info(`[SocketHandler] Connected. SID: ${socket.id}`);
    listenersAttached = false; // Reset on new connection before joining room
    if (challengeConfig && challengeConfig.id) {
      socket.emit("join_challenge_room", { challenge_id: challengeConfig.id });
      // console.info(`[SocketHandler] Emitted 'join_challenge_room' for challenge: ${challengeConfig.id}`);
    } else {
      console.error(
        "[SocketHandler] Cannot join room: challengeConfig.id is missing or challengeConfig is not fully initialized."
      );
    }
  });

  socket.on("disconnect", (reason) => {
    console.warn(
      `[SocketHandler] Disconnected. SID: ${socket?.id}. Reason: ${reason}`
    );
    listenersAttached = false;
    if (statusDisplayElement) {
      if (reason === "io server disconnect") {
        showError(
          statusDisplayElement,
          "Lost real-time connection (server).",
          "warning"
        );
      } else if (reason !== "io client disconnect") {
        // Avoid showing error on manual/programmatic disconnect
        showError(
          statusDisplayElement,
          `Real-time connection lost: ${reason}. Reconnecting...`,
          "warning"
        );
      }
    }
  });

  socket.on("connect_error", (error) => {
    console.error(
      `[SocketHandler] Connection Error. SID: ${socket?.id}. Error: ${error.message}`,
      error
    );
    listenersAttached = false;
    if (statusDisplayElement) {
      showError(
        statusDisplayElement,
        `WebSocket Connection Error: ${error.message}. Updates may be unavailable.`,
        "warning"
      );
    }
  });

  socket.io.on("reconnect_attempt", (attempt) => {
    // console.info(`[SocketHandler] Reconnect attempt ${attempt}`);
  });

  socket.io.on("reconnect_failed", () => {
    console.error("[SocketHandler] Reconnection failed.");
    if (statusDisplayElement) {
      showError(
        statusDisplayElement,
        "Failed to reconnect to real-time updates. Please refresh.",
        "danger"
      );
    }
  });

  socket.io.on("reconnect_error", (error) => {
    console.error("[SocketHandler] Reconnection error:", error.message);
  });

  socket.io.on("error", (error) => {
    // General manager errors
    console.error("[SocketHandler Manager Error]:", error.message, error);
  });

  // --- Application-Specific Event Handlers ---
  socket.on("room_joined", (data) => {
    console.info(
      `[SocketHandler] Joined room: ${data.room}. SID: ${socket.id}.`
    );

    if (!listenersAttached) {
      // console.info(`[SocketHandler] Attaching application event listeners for room ${data.room}`);

      socket.on("initial_state", (initialStateData) => {
        // console.debug(`[SocketHandler] Received initial_state:`, JSON.parse(JSON.stringify(initialStateData)));
        if (
          initialStateData &&
          challengeConfig &&
          initialStateData.challenge_id === challengeConfig.id
        ) {
          document.dispatchEvent(
            new CustomEvent("socketInitialStateReceived", {
              detail: initialStateData,
            })
          );
        } else {
          console.warn(
            "[SocketHandler] 'initial_state' ignored (challengeConfig not ready, mismatched ID, or no data)."
          );
        }
      });

      socket.on("timer_started", (eventData) => {
        // console.debug("[SocketHandler] Received 'timer_started'. Data:", eventData);
        if (
          eventData &&
          challengeConfig &&
          eventData.challenge_id === challengeConfig.id
        ) {
          handleServerTimerStarted(eventData);
        }
      });

      socket.on("timer_stopped", (eventData) => {
        // console.debug("[SocketHandler] Received 'timer_stopped'. Data:", eventData);
        if (
          eventData &&
          challengeConfig &&
          eventData.challenge_id === challengeConfig.id
        ) {
          handleServerTimerStopped(eventData);
        }
      });

      socket.on("timer_reset", (eventData) => {
        // console.debug("[SocketHandler] Received 'timer_reset'. Data:", eventData);
        if (
          eventData &&
          challengeConfig &&
          eventData.challenge_id === challengeConfig.id
        ) {
          handleServerTimerReset(eventData);
        }
      });

      socket.on("progress_update", (eventData) => {
        // console.debug('[SocketHandler] Received progress_update:', eventData);
        if (
          eventData &&
          challengeConfig &&
          eventData.challenge_id === challengeConfig.id
        ) {
          if (!challengeConfig.initialGroups) {
            console.warn(
              "[SocketHandler] progress_update: challengeConfig.initialGroups not ready."
            );
            return;
          }
          const groupIndex = challengeConfig.initialGroups.findIndex(
            (g) => g.id === eventData.group_id
          );
          if (groupIndex !== -1) {
            challengeConfig.initialGroups[groupIndex].progress =
              eventData.progress_data || {};
            const progressContainer = document.querySelector(
              `.group-card-wrapper[data-group-id="${eventData.group_id}"] .group-progress-container`
            );
            if (progressContainer && challengeConfig.coreChallengeStructure) {
              const canInteract =
                challengeConfig.isAuthorized &&
                challengeConfig.userJoinedGroupId === eventData.group_id;
              renderProgressItems(
                progressContainer,
                challengeConfig.coreChallengeStructure,
                eventData.group_id,
                eventData.progress_data,
                canInteract
              );
            }
            const progressBarContainer = document.getElementById(
              `progressBarContainer-${eventData.group_id}`
            );
            if (
              progressBarContainer &&
              challengeConfig.coreChallengeStructure &&
              eventData.progress_stats
            ) {
              renderOrUpdateProgressBar(
                progressBarContainer,
                challengeConfig.coreChallengeStructure,
                eventData.progress_stats
              );
            }
          }
        }
      });

      socket.on("active_penalty_update", (eventData) => {
        // console.debug('[SocketHandler] Received active_penalty_update:', eventData);
        if (
          eventData &&
          challengeConfig &&
          eventData.challenge_id === challengeConfig.id
        ) {
          if (challengeConfig.initialGroups) {
            // Ensure initialGroups exists
            const groupIndex = challengeConfig.initialGroups.findIndex(
              (g) => g.id === eventData.group_id
            );
            if (groupIndex !== -1) {
              challengeConfig.initialGroups[groupIndex].active_penalty_text =
                eventData.penalty_text || "";
            }
          }
          updatePenaltyDisplay(eventData.group_id, eventData.penalty_text);
        }
      });

      socket.on("group_created", (eventData) => {
        // console.debug('[SocketHandler] Received group_created:', eventData);
        if (
          eventData &&
          challengeConfig &&
          eventData.challenge_id === challengeConfig.id &&
          eventData.new_group
        ) {
          document.dispatchEvent(
            new CustomEvent("socketGroupCreated", {
              detail: eventData.new_group,
            })
          );
        }
      });

      socket.on("group_membership_update", (eventData) => {
        // console.debug('[SocketHandler] Received group_membership_update:', eventData);
        if (
          eventData &&
          challengeConfig &&
          eventData.challenge_id === challengeConfig.id
        ) {
          document.dispatchEvent(
            new CustomEvent("socketGroupMembershipUpdate", {
              detail: eventData,
            })
          );
        }
      });

      socket.on("player_names_updated", (eventData) => {
        // console.debug('[SocketHandler] Received player_names_updated:', eventData);
        if (
          eventData &&
          challengeConfig &&
          eventData.challenge_id === challengeConfig.id
        ) {
          document.dispatchEvent(
            new CustomEvent("socketPlayerNamesUpdated", { detail: eventData })
          );
        }
      });
      socket.on("challenge_penalties_updated", (eventData) => {
        console.debug(
          "[SocketHandler] Received challenge_penalties_updated:",
          eventData
        );
        if (
          eventData &&
          challengeConfig &&
          eventData.challenge_id === challengeConfig.id
        ) {
          // Update the local challengeConfig's penaltyInfo
          challengeConfig.penaltyInfo = eventData.penalty_info; // This will be the new structure or null

          // Notify penalty.js so it can update its internal penaltyPageConfig
          // which includes the challengeConfigData (used to get embedded penalties)
          if (typeof updatePenaltyConfig === "function") {
            // from penalty.js
            updatePenaltyConfig(challengeConfig);
          }

          // Update any direct display of the penalty source tab name on the page
          const currentSourceDisplay = document.getElementById(
            "currentPenaltySourceDisplay"
          );
          const disableBtn = document.getElementById(
            "btnDisableChallengePenalties"
          );

          if (currentSourceDisplay) {
            if (
              challengeConfig.penaltyInfo &&
              challengeConfig.penaltyInfo.penalties &&
              challengeConfig.penaltyInfo.penalties.length > 0
            ) {
              currentSourceDisplay.textContent =
                challengeConfig.penaltyInfo.source_tab_name ||
                challengeConfig.penaltyInfo.source_tab_id ||
                "Embedded Set";
              if (disableBtn) disableBtn.style.display = "inline-block";
            } else {
              currentSourceDisplay.textContent = "Penalties Disabled";
              if (disableBtn) disableBtn.style.display = "none";
            }
          }

          console.log(
            "[SocketHandler] Penalty info for current challenge updated via socket."
          );
          showFlash(
            "This challenge's penalty set has been updated by the creator.",
            "info"
          );

          // If the user whose penalty set was changed is currently viewing the penalty wheel UI for this challenge,
          // it might be good to reset or hide the wheel as the underlying penalties have changed.
          // This is more complex UI state management. For now, the next spin will use new penalties.
        }
      });
      listenersAttached = true;
      // console.info(`[SocketHandler] Application event listeners configured for room ${data.room}`);
    } else {
      // console.info(`[SocketHandler] Listeners already attached for SID ${socket.id}, room ${data.room}.`);
    }
  });

  socket.on("room_join_error", (data) => {
    console.error(
      `[SocketHandler] Room Join Error: ${data.error}. SID: ${socket?.id}`
    );
    if (statusDisplayElement) {
      showError(
        statusDisplayElement,
        `Could not join challenge updates: ${data.error}`,
        "warning"
      );
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
    socket.off(); // Remove all listeners
    socket = null;
  }
  listenersAttached = false;
}
