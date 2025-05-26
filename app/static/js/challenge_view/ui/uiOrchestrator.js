// app/static/js/challenge_view/ui/uiOrchestrator.js
import { escapeHtml, setLoading, showError } from '../../utils/helpers.js'; // Adjusted path
import { renderNewGroupCard, updateGroupCardContents, updateGroupFooterButtons, renderPlayerNameInputs } from './groupCard.js';
// Note: renderPlayerNameInputs is now directly imported. The alias 'originalRenderPlayerNameInputs' is removed.

// Constants for CSS classes
export const JOINED_GROUP_COL_CLASSES = ['col-md-8', 'col-lg-6', 'mx-auto', 'mb-4'];
export const OTHER_GROUP_COL_CLASSES = ['col-lg-4', 'col-md-6', 'mb-4'];

/**
 * Updates the displayed group count.
 * (Copied from original ui.js)
 * @param {number} currentCount - The current number of groups.
 * @param {number} maxGroups - The maximum allowed groups.
 */
export function updateGroupCountDisplay(currentCount, maxGroups) {
    const countSpan = document.getElementById('currentGroupCount');
    const maxSpan = document.getElementById('maxGroupCount');
    const noGroupsMsg = document.getElementById('noGroupsMessageContainer');
    const displayCount = Number(currentCount) || 0;
    const displayMax = Number(maxGroups) || '?';
    if (countSpan) countSpan.textContent = displayCount;
    if (maxSpan) maxSpan.textContent = displayMax;
    if (noGroupsMsg) noGroupsMsg.classList.toggle('d-none', displayCount > 0);
}


/**
 * Orchestrates UI updates after a group membership change or initial load.
 * This is the main function to call to refresh the group cards display.
 * @param {object} challengeConfig - The main configuration object.
 * @param {HTMLElement} myGroupContainerEl - Container for the user's joined group.
 * @param {HTMLElement} otherGroupsContainerEl - Container for other available groups.
 */
export function orchestrateGroupUIRefresh(challengeConfig, myGroupContainerEl, otherGroupsContainerEl) {
    if (!myGroupContainerEl || !otherGroupsContainerEl || !challengeConfig || !Array.isArray(challengeConfig.initialGroups)) {
        console.error("[UI Orchestrator] Critical error: Missing elements or invalid config for UI refresh.");
        return;
    }

    const allGroupIdsInConfig = new Set(challengeConfig.initialGroups.map(g => g.id));
    const processedCardIds = new Set();

    // Phase 1: Update or create cards based on config
    challengeConfig.initialGroups.forEach(groupData => {
        processedCardIds.add(groupData.id);
        let cardWrapper = document.querySelector(`.group-card-wrapper[data-group-id="${groupData.id}"]`);

        if (!cardWrapper) { // Card doesn't exist, create it
            cardWrapper = renderNewGroupCard(groupData, challengeConfig, myGroupContainerEl, otherGroupsContainerEl);
            if (!cardWrapper) {
                console.warn(`[UI Orchestrator] Failed to create card for group ID: ${groupData.id}. Skipping.`);
                return;
            }
        } else { // Card exists, update its content
            updateGroupCardContents(cardWrapper, groupData, challengeConfig);
        }

        // Phase 1.5: Position the card correctly
        const isUserMemberThisGroup = challengeConfig.userJoinedGroupId === groupData.id;
        const targetParent = isUserMemberThisGroup ? myGroupContainerEl : otherGroupsContainerEl;
        const currentParent = cardWrapper.parentElement;

        if (currentParent !== targetParent) {
            // Apply correct column classes BEFORE moving
            if (isUserMemberThisGroup) {
                cardWrapper.classList.remove(...OTHER_GROUP_COL_CLASSES);
                cardWrapper.classList.add(...JOINED_GROUP_COL_CLASSES);
            } else {
                cardWrapper.classList.remove(...JOINED_GROUP_COL_CLASSES);
                cardWrapper.classList.add(...OTHER_GROUP_COL_CLASSES);
            }
            targetParent.appendChild(cardWrapper);
        } else { // Ensure classes are correct even if not moving
             if (isUserMemberThisGroup) {
                if (!cardWrapper.classList.contains(JOINED_GROUP_COL_CLASSES[0])) { // Check one representative class
                    cardWrapper.classList.remove(...OTHER_GROUP_COL_CLASSES);
                    cardWrapper.classList.add(...JOINED_GROUP_COL_CLASSES);
                }
            } else {
                 if (!cardWrapper.classList.contains(OTHER_GROUP_COL_CLASSES[0])) {
                    cardWrapper.classList.remove(...JOINED_GROUP_COL_CLASSES);
                    cardWrapper.classList.add(...OTHER_GROUP_COL_CLASSES);
                }
            }
        }
         // Ensure player name inputs are correctly rendered/updated after potential move or content update
        const playerNamesSectionWrapper = cardWrapper.querySelector('.player-names-section-wrapper');
        if (playerNamesSectionWrapper && (challengeConfig.isLocal || (challengeConfig.userJoinedGroupId === groupData.id && challengeConfig.isAuthorized))) {
            renderPlayerNameInputs(playerNamesSectionWrapper, groupData.id, groupData.player_names || [], challengeConfig.numPlayersPerGroup);
        } else if (playerNamesSectionWrapper) {
            playerNamesSectionWrapper.style.display = 'none'; // Hide if not interactive
        }


    });

    // Phase 2: Remove stale cards from DOM
    document.querySelectorAll('.group-card-wrapper').forEach(domCardWrapper => {
        const domGroupId = parseInt(domCardWrapper.dataset.groupId, 10);
        if (!allGroupIdsInConfig.has(domGroupId)) {
            console.warn(`[UI Orchestrator] Removing stale card from DOM: ID ${domGroupId}`);
            domCardWrapper.remove();
        }
    });

    // Phase 3: Update titles and "no groups" message
    // Remove any existing dynamic "Your Group" titles first to prevent duplicates
    myGroupContainerEl.querySelectorAll('h4.your-group-title').forEach(title => title.remove());

    if (challengeConfig.userJoinedGroupId !== null) { // If joined, add the title
        const h = Object.assign(document.createElement('h4'), {
            className: 'text-primary-accent mb-3 text-center your-group-title', // Ensure this class is unique to dynamically added titles
            textContent: 'Your Group'
        });
        myGroupContainerEl.prepend(h);
    }
    // If userJoinedGroupId is null, any existing title (which would have been dynamic) is already removed.

    const noGroupsMsg = document.getElementById('noGroupsMessageContainer');
    const anyVisibleCards = document.querySelector('#myGroupContainer .group-card-wrapper, #otherGroupsContainer .group-card-wrapper');
    if (noGroupsMsg) noGroupsMsg.classList.toggle('d-none', !!anyVisibleCards);

    updateGroupCountDisplay(challengeConfig.initialGroups.length, challengeConfig.maxGroups);
    // console.log("[UI Orchestrator] Refresh complete."); // Removed verbose log
}




/**
 * Updates the text and visibility of the active penalty display for a specific group.
 * (Copied from original ui.js and adapted)
 * @param {HTMLElement} penaltyDisplayDiv - The specific .active-penalty-display element for the group.
 * @param {string} penaltyText - The text of the penalty to display (empty string hides).
 * @param {boolean} canInteract - Whether the user can clear the penalty.
 * @param {number|null} durationSeconds - The duration of the penalty in seconds.
 * @param {string|null} appliedAtUtcIso - The ISO string timestamp when the penalty was applied.
 */
import { startPenaltyTimer, stopPenaltyTimer } from '../realtime/timerHandler.js'; // Import penalty timer functions

export function updatePenaltyDisplay(penaltyDisplayDiv, penaltyText, canInteract, durationSeconds = null, appliedAtUtcIso = null) {
    if (!penaltyDisplayDiv) return;

    const groupId = penaltyDisplayDiv.dataset.groupId; // Assuming groupId is available for unique timer IDs
    const penaltyTimerId = `penalty-timer-group-${groupId}`;

    // Clear any existing timer for this specific penalty display
    stopPenaltyTimer(penaltyTimerId); // Use the new centralized stop function

    const textContentP = penaltyDisplayDiv.querySelector('.penalty-text-content');
    let timerDisplaySpan = penaltyDisplayDiv.querySelector('.penalty-timer-countdown');
    let clearButton = penaltyDisplayDiv.querySelector('.clear-penalty-btn');
    const btnContainer = penaltyDisplayDiv.querySelector('.penalty-clear-button-container');

    const hasPenalty = penaltyText && penaltyText.trim().length > 0;

    if (textContentP) {
        textContentP.textContent = hasPenalty ? penaltyText : '';
    }

    if (hasPenalty && durationSeconds && appliedAtUtcIso && groupId) {
        if (!timerDisplaySpan) {
            timerDisplaySpan = document.createElement('span');
            timerDisplaySpan.className = 'penalty-timer-countdown ms-2 badge bg-danger';
            if (btnContainer) {
                textContentP.parentNode.insertBefore(timerDisplaySpan, btnContainer);
            } else {
                textContentP.parentNode.appendChild(timerDisplaySpan);
            }
        }
        timerDisplaySpan.style.display = 'inline-block';
        
        const appliedTime = new Date(appliedAtUtcIso).getTime();
        const totalDurationMs = durationSeconds * 1000;
        const now = Date.now();
        const elapsedMs = now - appliedTime;
        const initialRemainingSeconds = Math.max(0, Math.floor((totalDurationMs - elapsedMs) / 1000));

        console.log(`[updatePenaltyDisplay] Timer Values for group ${groupId}:`);
        console.log(`  - appliedAtUtcIso: ${appliedAtUtcIso}`);
        console.log(`  - durationSeconds: ${durationSeconds}`);
        console.log(`  - appliedTime (ms): ${appliedTime}`);
        console.log(`  - now (ms): ${now}`);
        console.log(`  - elapsedMs: ${elapsedMs}`);
        console.log(`  - totalDurationMs: ${totalDurationMs}`);
        console.log(`  - initialRemainingSeconds: ${initialRemainingSeconds}`);

        startPenaltyTimer(penaltyTimerId, initialRemainingSeconds, timerDisplaySpan, () => {
            // Optional: Callback when timer expires naturally
            if (timerDisplaySpan) timerDisplaySpan.textContent = "Expired";
            console.log(`[updatePenaltyDisplay] Penalty timer ${penaltyTimerId} expired naturally.`);
        });

    } else if (timerDisplaySpan) {
        timerDisplaySpan.style.display = 'none';
        timerDisplaySpan.textContent = '';
    }

    penaltyDisplayDiv.style.display = hasPenalty ? 'block' : 'none';
    penaltyDisplayDiv.style.backgroundColor = hasPenalty ? 'rgba(255, 193, 7, 0.1)' : 'transparent';

    if (canInteract && hasPenalty) {
        if (!clearButton && btnContainer) {
            clearButton = document.createElement('button');
            clearButton.className = 'btn btn-xs btn-outline-light clear-penalty-btn mt-1';
            clearButton.dataset.groupId = penaltyDisplayDiv.dataset.groupId;
            clearButton.innerHTML = `<span class="spinner-border spinner-border-sm" style="display: none;"></span><span>Clear</span>`;
            btnContainer.appendChild(clearButton);
        } else if (clearButton) {
            clearButton.style.display = 'inline-block';
        }
    } else if (clearButton) {
        clearButton.style.display = 'none';
    }
}
