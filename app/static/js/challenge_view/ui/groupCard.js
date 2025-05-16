// app/static/js/challenge_view/ui/groupCard.js
import { escapeHtml, setLoading, showError } from '../../utils/helpers.js'; // Adjusted path
import { renderProgressItems, renderOrUpdateProgressBar } from './progressDisplay.js'; // Assuming progressDisplay.js
import { updatePenaltyDisplay, JOINED_GROUP_COL_CLASSES, OTHER_GROUP_COL_CLASSES } from './uiOrchestrator.js';

/**
 * Creates and appends a new group card to the appropriate container.
 * This combines some logic from the old addGroupToDOM and updateUIAfterMembershipChange.
 * @param {object} group - The group data object.
 * @param {object} challengeConfig - The main challenge configuration.
 * @param {HTMLElement} myGroupContainerEl - Container for the user's joined group.
 * @param {HTMLElement} otherGroupsContainerEl - Container for other available groups.
 * @returns {HTMLElement|null} The created card wrapper element or null on error.
 */
export function renderNewGroupCard(group, challengeConfig, myGroupContainerEl, otherGroupsContainerEl) {
    const template = document.getElementById('groupCardTemplate');
    if (!template) {
        console.error("DOM Error: Group card template (#groupCardTemplate) missing.");
        return null;
    }

    const clone = template.content.cloneNode(true);
    const cardWrapper = clone.querySelector('.group-card-wrapper'); // This is the outer div (e.g., with col-* classes)
    
    if (!cardWrapper) {
        console.error("DOM Error: #groupCardTemplate missing .group-card-wrapper.");
        return null;
    }

    // The actual card content is expected to be inside a .card.group-card element within the wrapper
    const cardElement = cardWrapper.querySelector('.card.group-card');
    if (!cardElement) {
        console.error("DOM Error: #groupCardTemplate .group-card-wrapper missing inner .card.group-card.");
        return null;
    }

    // All subsequent queries should be relative to cardElement
    const cardTitle = cardElement.querySelector('.card-title');
    const progressBarContainer = cardElement.querySelector('.group-progress-bar-container');
    const progressItemsContainer = cardElement.querySelector('.group-progress-container');
    const playerNamesSectionWrapper = cardElement.querySelector('.player-names-section-wrapper');
    const penaltyDisplayDiv = cardElement.querySelector('.active-penalty-display');
    const cardFooter = cardElement.querySelector('.card-footer.join-leave-footer');

    if (!cardTitle || !progressBarContainer || !progressItemsContainer || !playerNamesSectionWrapper || !penaltyDisplayDiv || !cardFooter) {
        console.error("DOM Error: New group card (.card.group-card) is missing required child elements (title, progress containers, player wrapper, penalty display, or footer).");
        return null;
    }

    cardWrapper.dataset.groupId = group.id; // Set groupId on the outer wrapper
    cardElement.dataset.groupId = group.id; // Also on the card itself for consistency if needed
    cardTitle.textContent = group.name || 'Unnamed Group';
    progressBarContainer.id = `progressBarContainer-${group.id}`; // Ensure unique ID

    // Initial content setup (empty or placeholders, will be filled by updateCardContents)
    progressItemsContainer.innerHTML = '<p class="text-muted small">Loading progress items...</p>';
    progressBarContainer.innerHTML = '<p class="text-muted small mb-0">Loading progress bar...</p>';
    playerNamesSectionWrapper.style.display = 'none'; // Hide player names wrapper initially
    penaltyDisplayDiv.style.display = 'none';
    cardFooter.innerHTML = ''; // Footer buttons will be set by updateCardContents

    // Determine initial placement (always to 'other' first, then updateUIAfterMembershipChange will move if needed)
    otherGroupsContainerEl.appendChild(clone);
    cardWrapper.classList.add(...OTHER_GROUP_COL_CLASSES); // Default classes

    // Update the full content of this new card
    updateGroupCardContents(cardWrapper, group, challengeConfig);

    return cardWrapper;
}

/**
 * Updates all dynamic content within a single group card.
 * @param {HTMLElement} cardWrapper - The .group-card-wrapper element.
 * @param {object} groupData - The specific data for this group.
 * @param {object} challengeConfig - The overall challenge configuration.
 */
export function updateGroupCardContents(cardWrapper, groupData, challengeConfig) {
    if (!cardWrapper || !groupData || !challengeConfig) {
        console.error("[GroupCard] Missing cardWrapper, groupData, or challengeConfig for update.", { cardWrapper, groupData, challengeConfig });
        return;
    }

    // Check if the cardWrapper itself is the card element, or find the card within it.
    const card = cardWrapper.classList.contains('card') && cardWrapper.classList.contains('group-card') ?
                 cardWrapper :
                 cardWrapper.querySelector('.card.group-card');

    if (!card) {
        console.error("[GroupCard] .card.group-card element not found for group:", groupData.id, "within cardWrapper:", cardWrapper);
        return;
    }

    const groupId = groupData.id;
    const isUserMember = challengeConfig.userJoinedGroupId === groupId;
    
    // General interaction capability (e.g., for progress, penalty clearing)
    const canInteractGenerally = challengeConfig.isLocal || (challengeConfig.isLoggedIn && challengeConfig.isAuthorized && isUserMember);

    // Specific capability for editing player names in this group (more relaxed)
    const canEditPlayerNames = challengeConfig.isLocal || (challengeConfig.isLoggedIn && isUserMember);

    // Update Card Title (though usually set on creation)
    const cardTitle = card.querySelector('.card-title');
    if (cardTitle) cardTitle.textContent = groupData.name || 'Unnamed Group';

    // 1. Update Progress Bar
    const progressBarContainer = card.querySelector(`#progressBarContainer-${groupId}`);
    if (progressBarContainer && challengeConfig.coreChallengeStructure) {
        renderOrUpdateProgressBar(progressBarContainer, challengeConfig.coreChallengeStructure, groupData.progress || {});
    } else if (progressBarContainer) {
        progressBarContainer.innerHTML = '<p class="text-muted small mb-0">Progress unavailable.</p>';
    }

    // 2. Update Progress Items (Checkboxes)
    const progressItemsContainer = card.querySelector('.group-progress-container');
    if (progressItemsContainer && challengeConfig.coreChallengeStructure) {
        renderProgressItems(progressItemsContainer, challengeConfig.coreChallengeStructure, groupId, groupData.progress || {}, canInteractGenerally); // Use general canInteract
    } else if (progressItemsContainer) {
        progressItemsContainer.innerHTML = '<p class="text-muted small">Challenge items unavailable.</p>';
    }

    // 3. Update Player Names Section
    const playerNamesSectionWrapper = card.querySelector('.player-names-section-wrapper');
    if (playerNamesSectionWrapper) {
        if (challengeConfig.numPlayersPerGroup > 0 && !challengeConfig.isLocal) { 
            playerNamesSectionWrapper.style.display = 'block';
            // Pass `canEditPlayerNames` to `renderPlayerNameInputs` to control editability
            renderPlayerNameInputs(playerNamesSectionWrapper, groupId, groupData.player_names || [], challengeConfig.numPlayersPerGroup, canEditPlayerNames);
        } else {
            playerNamesSectionWrapper.style.display = 'none';
        }
    }

        // 4. Update Penalty Display
        const penaltyDisplayDiv = card.querySelector('.active-penalty-display');
        if (penaltyDisplayDiv) {
            penaltyDisplayDiv.dataset.groupId = groupId; // Ensure group ID is set
            updatePenaltyDisplay(penaltyDisplayDiv, groupData.active_penalty_text || '', canInteractGenerally); // Use general canInteract for clearing penalty
        }

        // 5. Update Footer Buttons
        updateGroupFooterButtons(cardWrapper, groupData, challengeConfig);
    }
// This line containing the extra brace is removed.

/**
 * Updates the footer buttons (Join/Leave) for a group card.
 * @param {HTMLElement} cardWrapper - The .group-card-wrapper element.
 * @param {object} groupData - The specific data for this group.
 * @param {object} challengeConfig - The overall challenge configuration.
 */
export function updateGroupFooterButtons(cardWrapper, groupData, challengeConfig) {
    const footer = cardWrapper.querySelector('.card-footer.join-leave-footer');
    if (!footer) return;

    footer.innerHTML = ''; // Clear previous buttons
    let buttonHtml = '';
    const loginUrl = `/auth/login?next=${encodeURIComponent(window.location.pathname)}`;
    const memberCount = groupData.member_count ?? 0; // Use nullish coalescing for member_count
    const maxPlayers = challengeConfig.numPlayersPerGroup || 1;
    const isFull = memberCount >= maxPlayers;
    const isUserMemberThisGroup = challengeConfig.userJoinedGroupId === groupData.id;

    if (challengeConfig.isLocal) {
        // No join/leave buttons for local challenges
        return;
    }

    if (isUserMemberThisGroup) {
        if (challengeConfig.isLoggedIn && challengeConfig.isAuthorized) {
            buttonHtml = `<button class="btn btn-sm btn-danger leave-group-btn" data-group-id="${groupData.id}">
                            <span class="spinner-border spinner-border-sm" style="display: none;"></span>
                            <span>Leave Group</span>
                          </button>`;
        } else { // Should not happen if already a member, but defensive
            buttonHtml = `<a href="${loginUrl}" class="btn btn-sm btn-outline-primary">Log in to Leave</a>`;
        }
    } else { // User is NOT a member of THIS group
        if (!challengeConfig.isLoggedIn) {
            buttonHtml = `<a href="${loginUrl}" class="btn btn-sm btn-outline-primary">Log in to Join</a>`;
        } else if (!challengeConfig.isAuthorized) {
            buttonHtml = `<button class="btn btn-sm btn-outline-secondary" disabled title="Not authorized for this challenge.">
                            <span>Join (Unauthorized)</span>
                          </button>`;
        } else if (challengeConfig.userJoinedGroupId !== null) { // Already in another group
            buttonHtml = `<button class="btn btn-sm btn-outline-secondary" disabled title="Already in another group.">
                            <span>Joined Other</span>
                          </button>`;
        } else if (isFull) {
            buttonHtml = `<button class="btn btn-sm btn-outline-secondary" disabled>
                            <span>Full (${memberCount}/${maxPlayers})</span>
                          </button>`;
        } else {
            buttonHtml = `<button class="btn btn-sm btn-success join-group-btn" data-group-id="${groupData.id}">
                            <span class="spinner-border spinner-border-sm" style="display: none;"></span>
                            <span>Join (${memberCount}/${maxPlayers})</span>
                          </button>`;
        }
    }

    // Add Delete Group button for creator, but not for their own joined group if it's the only group (or other specific conditions)
    // For simplicity, always show if creator, except for local challenges.
    // The API will prevent deleting the last group if that's a desired rule, or if it has members etc.
    if (challengeConfig.isCreator && !challengeConfig.isLocal) {
        // Ensure there's a space if other buttons exist
        if (buttonHtml !== '') {
            buttonHtml += ' '; // Add a space separator
        }
        // Changed to btn-sm and removed ms-2 for a potentially smaller/tighter look
        buttonHtml += `<button class="btn btn-sm btn-outline-danger delete-group-btn" data-group-id="${groupData.id}" title="Delete Group">
                           <i class="bi bi-trash"></i>
                       </button>`;
    }

    footer.innerHTML = buttonHtml;
}

export function renderPlayerNameInputs(sectionWrapper, groupId, playerSlots = [], numPlayersAllowed = 1, canInteract = false) { // Added canInteract
    const container = sectionWrapper?.querySelector('.player-names-section');
    // const collapseTarget = sectionWrapper?.querySelector('.collapse'); // Not used, can be removed if not needed for other logic

    // if (!sectionWrapper || !container || !collapseTarget) { // Removed collapseTarget from check
    if (!sectionWrapper || !container ) {
        if (sectionWrapper) sectionWrapper.style.display = 'none'; // Hide if incomplete
        return;
    }

    let inputsContainer = container.querySelector('.player-name-inputs');
    let errorContainer = container.querySelector('.player-name-error');
    let saveBtnContainer = container.querySelector('.player-name-save-btn-container');

    if (!inputsContainer) { inputsContainer = document.createElement('div'); inputsContainer.className = 'player-name-inputs mb-2'; container.appendChild(inputsContainer); }
    if (!errorContainer) { errorContainer = document.createElement('div'); errorContainer.className = 'player-name-error text-danger small mt-1'; container.appendChild(errorContainer); }
    if (!saveBtnContainer) { saveBtnContainer = document.createElement('div'); saveBtnContainer.className = 'player-name-save-btn-container mt-2'; container.appendChild(saveBtnContainer); }

    inputsContainer.innerHTML = '';
    saveBtnContainer.innerHTML = '';
    showError(errorContainer, null);

    const numberOfSlotsToRender = playerSlots.length > 0 ? playerSlots.length : numPlayersAllowed;
    console.log(`[GroupCard] renderPlayerNameInputs for group ${groupId}: numberOfSlotsToRender = ${numberOfSlotsToRender}`);


    if (numberOfSlotsToRender <= 0) {
        sectionWrapper.style.display = 'none';
        return;
    }
    sectionWrapper.style.display = 'block'; // Ensure visible if slots exist

    let inputsHtml = '';
    for (let i = 0; i < numberOfSlotsToRender; i++) {
        const slotData = playerSlots[i] || { display_name: "", account_name: null };
        const displayName = slotData.display_name || "";
        const accountName = slotData.account_name || null;

        const placeholderText = `Player ${i + 1}${accountName ? '' : ' (Empty)'}`;
        // Always render input field
        inputsHtml += `
            <div class="player-slot mb-2 d-flex align-items-center">
                <input type="text"
                       class="form-control form-control-sm player-name-input"
                       value="${escapeHtml(displayName)}"
                       placeholder="${placeholderText}"
                       data-slot-index="${i}"
                       maxlength="50"
                       aria-label="Player ${i + 1} display name">`;
        if (accountName) {
            inputsHtml += `<small class="text-muted account-name-hint ms-2" title="Account Name"> 
                               (<i class="bi bi-person-check-fill"></i> ${escapeHtml(accountName)})
                           </small>`;
        }
        inputsHtml += `</div>`;
    }
    inputsContainer.innerHTML = inputsHtml;

    // Always show save button within the player names section
    saveBtnContainer.innerHTML = `
        <button class="btn btn-primary btn-sm save-player-names-btn" data-group-id="${groupId}">
            <span class="spinner-border spinner-border-sm" style="display: none;"></span>
            <span>Save Display Names</span>
        </button>`;
    saveBtnContainer.style.display = 'block'; // Ensure container is visible
}
