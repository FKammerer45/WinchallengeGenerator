// static/js/challenge/ui.js
// Handles DOM manipulation and rendering for the challenge view page.
// Receives data from challenge_view.js and updates the UI accordingly.
const JOINED_GROUP_COL_CLASSES = ['col-md-8', 'col-lg-6', 'mx-auto', 'mb-4'];
const OTHER_GROUP_COL_CLASSES = ['col-lg-4', 'col-md-6', 'mb-4'];
import { setLoading, escapeHtml, showError } from '../utils/helpers.js';

/**
 * Updates the displayed group count (e.g., "Groups: 2 / 10").
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
 * Calculates progress based on challenge structure and progress data.
 * @param {object} challengeData - The core challenge structure {normal, b2b}.
 * @param {object} [progressData={}] - The group/local progress object {'key': true,...}.
 * @returns {{completed: number, total: number, percentage: number}}
 */
function calculateProgress(challengeData, progressData = {}) {
    // Removed console.log statements here

    let total = 0;
    let completed = 0;

    // Count normal wins
    if (challengeData?.normal) {
        Object.entries(challengeData.normal).forEach(([key, info]) => {
            const count = info?.count || 0;
            total += count;
            for (let i = 0; i < count; i++) {
                const progressKey = `normal_${key}_${i}`;
                if (progressData[progressKey] === true) {
                    completed++;
                }
            }
        });
    }
    // Count B2B wins
    if (challengeData?.b2b) {
        challengeData.b2b.forEach((seg, segIndex) => {
            if (seg?.group) {
                // Corrected: B2B segments are typically 1-indexed in keys, but array index is 0-based.
                // The key construction uses the segment index directly (e.g., b2b_0_key_0) if following array index.
                // If keys expect 1-based index, adjust here. Assuming key uses 0-based segIndex matching loop.
                const segmentIdx = segIndex; // Or segIndex + 1 if keys are 1-based
                Object.entries(seg.group).forEach(([key, count]) => {
                    total += count || 0;
                    for (let i = 0; i < (count || 0); i++) {
                        // Adjust segmentIdx in key if needed (e.g., `${segmentIdx + 1}`)
                        const progressKey = `b2b_${segmentIdx}_${key}_${i}`;
                        if (progressData[progressKey] === true) {
                            completed++;
                        }
                    }
                });
            }
        });
    }
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, total, percentage };
}


/**
 * Renders or updates a Bootstrap progress bar.
 * @param {HTMLElement} container - The element to render the progress bar into.
 * @param {object} challengeData - The core challenge structure {normal, b2b}.
 * @param {object} progressData - The group/local progress object {'key': true,...}.
 */
export function renderOrUpdateProgressBar(container, challengeData, progressData) {
    if (!container) {
        return;
    }
    if (!challengeData || (!challengeData.normal && !challengeData.b2b)) {
        container.innerHTML = '<p class="text-muted small mb-0">Challenge structure unavailable for progress.</p>';
        return;
    }

    const progress = calculateProgress(challengeData, progressData);
    const progressBarId = `prog-bar-${container.id || Math.random().toString(36).substring(2)}`; // Unique ID for the bar itself

    container.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-1 small">
            <span class="text-muted">Group Progress:</span>
            <span class="font-weight-bold text-light">${progress.completed} / ${progress.total} (${progress.percentage}%)</span>
        </div>
        <div class="progress" style="height: 8px; background-color: #495057;">
            <div id="${progressBarId}"
                 class="progress-bar bg-warning progress-bar-striped"
                 role="progressbar"
                 style="width: ${progress.percentage}%;"
                 aria-valuenow="${progress.percentage}"
                 aria-valuemin="0" aria-valuemax="100">
            </div>
        </div>`;

    // Optional animation effect
    requestAnimationFrame(() => {
        const bar = document.getElementById(progressBarId);
        if (bar) {
            bar.classList.add('progress-bar-animated');
            setTimeout(() => { bar.classList.remove('progress-bar-animated'); }, 1500);
        }
    });
}

/**
 * Renders the static list of challenge rules.
 * @param {HTMLElement} container - The element to render the rules into.
 * @param {object} challengeData - The core challenge structure {normal, b2b}.
 */
export function renderStaticChallengeDetailsJS(container, challengeData) {
    if (!container) {
        console.error("renderStaticChallengeDetailsJS: Target container not provided.");
        return;
    }
    // Clear placeholder
    container.innerHTML = '';

    let listGroupHtml = ''; // Build HTML for list groups
    const { normal: normalItems, b2b: b2bItems } = challengeData || {};

    // --- Normal Wins Section ---
    if (normalItems && Object.keys(normalItems).length > 0) {
        let normalListItems = '';
        Object.entries(normalItems).sort((a, b) => String(a[0]).localeCompare(String(b[0]))).forEach(([key, info]) => {
            normalListItems += `
                <li class="list-group-item px-3 py-2 d-flex flex-wrap justify-content-between align-items-center gap-2">
                    <div class="d-flex align-items-center me-auto">
                        <i class="bi bi-joystick me-2 text-primary opacity-75 fs-5"></i>
                        <span class="win-name fw-semibold">${escapeHtml(key)}</span>
                    </div>
                    <div class="text-end d-flex gap-1">
                        <span class="badge bg-light text-dark rounded-pill px-2 py-1">
                            ${info?.count || 0}x Wins
                        </span>
                        <span class="badge bg-secondary rounded-pill px-2 py-1">
                            Diff: ${typeof info?.diff === 'number' ? info.diff.toFixed(1) : 'N/A'}
                        </span>
                    </div>
                </li>`;
        });

        listGroupHtml += `
            <div class="card glass-effect mb-4 result-section shadow-sm">
                <div class="card-header h6 d-flex align-items-center fw-bold text-info">
                    <i class="bi bi-list-stars me-2 fs-5"></i>
                    Normal Wins Required
                </div>
                <ul class="list-group list-group-flush">${normalListItems}</ul>
            </div>`;
    }

    // --- Back-to-Back Wins Section ---
    if (b2bItems?.length > 0) {
        if (listGroupHtml) listGroupHtml += '<hr class="my-4 section-divider">'; // Add divider if normal wins exist

        b2bItems.forEach((seg, segIndex) => {
            const displaySegmentIdx = segIndex + 1;
            let b2bListItems = '';
            if (seg?.group) {
                Object.entries(seg.group).sort((a, b) => String(a[0]).localeCompare(String(b[0]))).forEach(([key, count]) => {
                    b2bListItems += `
                        <li class="list-group-item px-3 py-2 d-flex justify-content-between align-items-center gap-2">
                            <div class="d-flex align-items-center me-auto">
                                <i class="bi bi-joystick me-2 text-warning opacity-75 fs-5"></i>
                                <span class="win-name fw-semibold">${escapeHtml(key)}</span>
                            </div>
                            <div class="text-end">
                                <span class="badge bg-light text-dark rounded-pill px-2 py-1">
                                    ${count || 0}x Wins
                                </span>
                            </div>
                        </li>`;
                });
            }

            listGroupHtml += `
                <div class="card glass-effect mb-4 result-section shadow-sm">
                    <div class="card-header h6 d-flex flex-wrap align-items-center justify-content-between gap-2 fw-bold text-secondary-accent">
                        <div class="d-flex align-items-center">
                            <i class="bi bi-arrow-repeat me-2 fs-5"></i>
                            B2B Segment #${displaySegmentIdx} (${seg?.length || 0} wins)
                        </div>
                        <span class="badge bg-warning text-dark rounded-pill px-2 py-1">
                            <i class="bi bi-speedometer2 me-1 small"></i>Seg Diff: ${typeof seg?.seg_diff === 'number' ? seg.seg_diff.toFixed(1) : 'N/A'}
                        </span>
                    </div>
                    <ul class="list-group list-group-flush">${b2bListItems}</ul>
                </div>`;
        });
    }

    // --- Fallback Message ---
    if (!listGroupHtml) {
        listGroupHtml = `
            <div class="alert alert-secondary glass-effect text-center">
                No specific win requirements found for this challenge.
            </div>`;
    }

    container.innerHTML = listGroupHtml; // Render the generated list groups
}

/**
 * Renders the interactive progress checkboxes within a given container element.
 * @param {HTMLElement} container - The parent element to render checkboxes into.
 * @param {object} challengeStructure - The core challenge structure {normal, b2b}.
 * @param {string|number} groupId - The ID of the group or local challenge this progress belongs to.
 * @param {object} groupProgress - The current progress data for this group.
 * @param {boolean} isInteractive - Whether checkboxes should be enabled (true if local challenge or user is member and logged in).
 */
export function renderProgressItems(container, challengeStructure, groupId, groupProgress = {}, isInteractive) {
    if (!container) {
        console.error("renderProgressItems: Target container not provided.");
        return;
    }
    container.innerHTML = ''; // Clear previous content
    let html = '';
    const isDisabled = !isInteractive;
    const safeProgressData = groupProgress || {};

    // Helper to generate checkbox HTML
    const createCheckboxHtml = (itemType, itemKey, itemIndex, isChecked, isDisabledFlag, labelText, segmentIndex_0based = null) => {
        // Use 0-based segment index for internal key construction (consistent with original logic)
        const progressKey = segmentIndex_0based !== null
            ? `${itemType}_${segmentIndex_0based}_${itemKey}_${itemIndex}`
            : `${itemType}_${itemKey}_${itemIndex}`;

        const safeProgressKey = progressKey.replace(/[^a-zA-Z0-9-_]/g, '_');
        const uniqueId = `check_${groupId}_${safeProgressKey}`;

        // --- FIX: Store 1-based index in the data attribute ---
        const segmentAttr = segmentIndex_0based !== null ? `data-segment-index="${segmentIndex_0based + 1}"` : ''; // Add 1 for 1-based index

        const escapedItemKey = escapeHtml(String(itemKey));
        const completedClass = isChecked ? 'completed' : '';

        // Ensure segmentAttr is included in the input tag
        return `
            <div class="custom-control custom-checkbox d-inline-block me-1 progress-item ${completedClass}"
                 data-progress-key="${progressKey}"
                 title="${escapeHtml(labelText)}">
              <input type="checkbox"
                     class="custom-control-input progress-checkbox"
                     id="${uniqueId}"
                     aria-label="${escapeHtml(labelText)}"
                     data-group-id="${groupId}"
                     data-item-type="${itemType}"
                     data-item-key="${escapedItemKey}"
                     data-item-index="${itemIndex}"
                     ${segmentAttr}  /* Include the attribute here */
                     ${isChecked ? 'checked' : ''}
                     ${isDisabledFlag ? 'disabled' : ''}>
              <label class="custom-control-label" for="${uniqueId}">
                <span class="sr-only">${escapeHtml(labelText)}</span>
              </label>
            </div>`;
    };

    // --- Render Normal Wins ---
    if (challengeStructure?.normal && Object.keys(challengeStructure.normal).length > 0) {
        // ... (existing normal wins rendering logic - no segmentIndex needed) ...
         html += `
            <div class="d-flex align-items-center mb-2 text-info">
                <i class="bi bi-check-circle-fill me-2 fs-5"></i>
                <h6 class="mb-0 fw-bold small text-uppercase">Normal Wins Progress</h6>
            </div>`;
        Object.entries(challengeStructure.normal).sort((a, b) => String(a[0]).localeCompare(String(b[0]))).forEach(([key, info]) => {
            const count = info?.count || 0;
            if (count > 0) {
                html += `<div class="progress-category mb-3">
                            <div class="d-flex align-items-center mb-1">
                                <i class="bi bi-joystick me-2 opacity-75 text-primary"></i>
                                <strong class="small text-light me-2">${escapeHtml(key)}</strong>
                                <span class="badge bg-secondary rounded-pill fw-normal">${count} needed</span>
                            </div>
                            <div class="progress-markers ps-4">`;
                for (let i = 0; i < count; i++) {
                    const progressKey = `normal_${key}_${i}`;
                    const isChecked = safeProgressData[progressKey] === true;
                    // Pass null for segmentIndex for normal items
                    html += createCheckboxHtml('normal', key, i, isChecked, isDisabled, `Win ${i + 1} for ${key}`, null);
                }
                html += `</div></div>`;
            }
        });
    }


    // --- Render B2B Wins ---
    if (challengeStructure?.b2b?.length > 0) {
        if (html) html += '<hr class="my-3 section-divider">';
        html += `
            <div class="d-flex align-items-center mb-2 text-secondary-accent">
                <i class="bi bi-arrow-repeat me-2 fs-5"></i>
                <h6 class="mb-0 fw-bold small text-uppercase">B2B Segment Progress</h6>
            </div>`;
        challengeStructure.b2b.forEach((seg, segIndex_0based) => { // Use 0-based index from loop
            const displaySegmentIdx = segIndex_0based + 1; // 1-based for display text
            if (seg?.group && Object.keys(seg.group).length > 0) {
                html += `<div class="progress-category mb-3 ms-2">
                            <strong class="small d-block text-light mb-1">Segment ${displaySegmentIdx} (${seg.length || 0} wins):</strong>`;
                Object.entries(seg.group).sort((a, b) => String(a[0]).localeCompare(String(b[0]))).forEach(([key, count]) => {
                    if (count > 0) {
                        html += `<div class="mb-2">
                                    <div class="d-flex align-items-center mb-1">
                                        <i class="bi bi-joystick me-2 opacity-75 text-warning"></i>
                                        <span class="small text-light me-2">${escapeHtml(key)}</span>
                                        <span class="badge bg-secondary rounded-pill fw-normal">${count} needed</span>
                                    </div>
                                    <div class="progress-markers ps-4">`;
                        for (let i = 0; i < count; i++) {
                            const progressKey = `b2b_${segIndex_0based}_${key}_${i}`; // Key still uses 0-based
                            const isChecked = safeProgressData[progressKey] === true;
                            // --- FIX: Pass the 0-based index to the helper ---
                            html += createCheckboxHtml('b2b', key, i, isChecked, isDisabled, `Segment ${displaySegmentIdx} Win ${i + 1} for ${key}`, segIndex_0based);
                        }
                        html += `</div></div>`;
                    }
                });
                html += `</div>`;
            }
        });
    }

    if (!html) html = '<p class="text-muted small">No progress items defined.</p>';
    container.innerHTML = html;
}

/**
 * Adds a new group card to the DOM based on API response.
 * Assumes the card template exists in the HTML.
 * @param {object} group - The group object {id, name, progress, active_penalty_text}.
 * @param {object} challengeConfig - The main configuration object.
 * @param {HTMLElement} myGroupContainerEl - Container for the user's joined group.
 * @param {HTMLElement} otherGroupsContainerEl - Container for other available groups.
 */
export function addGroupToDOM(group, challengeConfig, myGroupContainerEl, otherGroupsContainerEl) {
    const template = document.getElementById('groupCardTemplate');
    const groupsContainer = otherGroupsContainerEl; // New groups always start in 'other'
    if (!template || !groupsContainer) {
        console.error("DOM Error: Cannot add group card - template or container missing.");
        return;
    }

    // Hide the "no groups" message if it's visible
    document.getElementById('noGroupsMessageContainer')?.classList.add('d-none');

    const clone = template.content.cloneNode(true);
    const wrapper = clone.querySelector('.group-card-wrapper');
    const title = clone.querySelector('.card-title');
    const progressContainer = clone.querySelector('.group-progress-container');
    const progressBarContainer = clone.querySelector('.group-progress-bar-container'); // Added for consistency
    const buttonContainer = clone.querySelector('.card-footer.join-leave-footer'); // Target specific footer
    const penaltyDisplayDiv = clone.querySelector('.active-penalty-display');
    const penaltyTextP = clone.querySelector('.penalty-text-content');
    const playerNamesSection = clone.querySelector('.player-names-section');


    // Check if essential template parts exist
    if (!wrapper || !title || !progressContainer || !progressBarContainer || !buttonContainer || !playerNamesSection || !penaltyDisplayDiv || !penaltyTextP) {
        console.error("DOM Error: Group card template is missing required elements.");
        return;
    }

    // Populate the cloned template
    wrapper.dataset.groupId = group.id;
    // Assign unique ID to the progress bar container within the clone
    progressBarContainer.id = `progressBarContainer-${group.id}`;
    title.textContent = group.name;
    playerNamesSection.style.display = 'none'; // Hide player names initially

    // Initialize penalty display
    const initialPenalty = group.active_penalty_text || '';
    penaltyTextP.textContent = initialPenalty;
    penaltyDisplayDiv.style.display = initialPenalty ? 'block' : 'none';
    penaltyDisplayDiv.dataset.groupId = group.id; // Ensure group ID is set

    if (progressContainer) progressContainer.innerHTML = ''; // Ensure it's empty initially
    if (progressBarContainer) progressBarContainer.innerHTML = ''; // Ensure it's empty initially



    // Clear template button and rely on updateUIAfterMembershipChange to add the correct one
    buttonContainer.innerHTML = '';

    // Append the new card to the 'other groups' container
    groupsContainer.appendChild(clone);

    // Update the overall UI state, which will set the correct button and states for the new card
    updateUIAfterMembershipChange(challengeConfig, myGroupContainerEl, otherGroupsContainerEl);


}

/**
 * Updates the UI state for all group cards after a membership change (join/leave) or initial load.
 * Handles card highlighting, layout, button states, checkbox interactivity, player names, and penalty display.
 * This is the single source of truth for updating group card UI based on state.
 * @param {object} challengeConfig - The main configuration object from main.js.
 * @param {HTMLElement} myGroupContainerEl - Container for the user's joined group.
 * @param {HTMLElement} otherGroupsContainerEl - Container for other available groups.
 */
export function updateUIAfterMembershipChange(config, myGroupEl, otherGroupsEl) {
    console.log("[UI Update Overhaul] Running. userJoinedGroupId:", config.userJoinedGroupId);

    // Ensure containers exist
    if (!myGroupEl || !otherGroupsEl) {
        console.error("[UI Update Overhaul] Critical error: Missing myGroupEl or otherGroupsEl. Cannot update UI.");
        return; // Stop execution if essential containers are missing
    }

    // Get all potential group IDs from the config
    const allGroupIds = config.initialGroups?.map(g => g.id) || [];
    const processedCardIds = new Set(); // Keep track of cards updated this run

    // --- Phase 1: Process and Place Cards Based on Config ---
    allGroupIds.forEach(cardGroupId => {
        processedCardIds.add(cardGroupId); // Mark this ID as processed

        // Find the corresponding card wrapper element in the DOM
        const cardWrapper = document.querySelector(`.group-card-wrapper[data-group-id="${cardGroupId}"]`);
        const card = cardWrapper?.querySelector('.card.group-card');

        if (!cardWrapper || !card) {
            console.warn(`[UI Update Overhaul] Card wrapper/card not found in DOM for group ID: ${cardGroupId}. Skipping placement/update.`);
            return; // Skip if the card element doesn't exist
        }

        // Get group data and determine user membership for THIS card
        const groupData = config.initialGroups.find(g => g.id === cardGroupId); // Should find since ID came from config
        if (!groupData) {
            console.warn(`[UI Update Overhaul] Config data missing for group ID: ${cardGroupId}. Skipping.`);
            return;
        }
        const isUserMember = (config.userJoinedGroupId === cardGroupId);
        const groupProgress = groupData.progress || {};
        const memberCount = groupData.member_count ?? 0;
        const maxPlayers = config.numPlayersPerGroup || 1;
        const isFull = memberCount >= maxPlayers;
        const canInteractWithGroupItems = config.isLoggedIn && config.isAuthorized && isUserMember;

        console.log(`[UI Update Overhaul] Processing Card ID: ${cardGroupId}. Is member? ${isUserMember}. Can interact? ${canInteractWithGroupItems}`);

        // Update Highlighting (can happen regardless of placement)
        cardWrapper.classList.toggle('joined-group-active', isUserMember);

        // --- Handle Card Placement ---
        const currentParent = cardWrapper.parentElement;
        const targetParent = isUserMember ? myGroupEl : otherGroupsEl;
        const needsMove = currentParent !== targetParent;

        if (needsMove) {
            console.log(`[UI Update Overhaul] Moving card ${cardGroupId} to ${isUserMember ? 'My Group' : 'Other Groups'} container.`);

            // Apply correct column classes BEFORE moving
            if (isUserMember) {
                cardWrapper.classList.remove(...OTHER_GROUP_COL_CLASSES);
                cardWrapper.classList.add(...JOINED_GROUP_COL_CLASSES);
            } else {
                cardWrapper.classList.remove(...JOINED_GROUP_COL_CLASSES);
                cardWrapper.classList.add(...OTHER_GROUP_COL_CLASSES);
            }

            // Prepend "Your Group" title if moving TO myGroupEl and title doesn't exist
            if (isUserMember && !myGroupEl.querySelector('h4.your-group-title')) {
                 const h = Object.assign(document.createElement('h4'), {
                     className: 'text-primary-accent mb-3 text-center your-group-title', // Added specific class
                     textContent: 'Your Group'
                 });
                 myGroupEl.prepend(h); // Prepend title
            }

            // Move the element
            targetParent.appendChild(cardWrapper);

            // Remove "Your Group" title if moving FROM myGroupEl and it becomes empty
             if (!isUserMember && currentParent === myGroupEl && !myGroupEl.querySelector('.group-card-wrapper')) {
                  const titleH4 = myGroupEl.querySelector('h4.your-group-title');
                  if (titleH4) titleH4.remove();
             }
        } else {
            // Even if not moving, ensure correct classes are set (handles initial load case)
             if (isUserMember) {
                cardWrapper.classList.remove(...OTHER_GROUP_COL_CLASSES);
                cardWrapper.classList.add(...JOINED_GROUP_COL_CLASSES);
            } else {
                cardWrapper.classList.remove(...JOINED_GROUP_COL_CLASSES);
                cardWrapper.classList.add(...OTHER_GROUP_COL_CLASSES);
            }
        }
        // --- End Card Placement ---


        // --- Update Inner Content (Penalty, Progress, Players, Footer) ---

        // Penalty Display & Clear Button
        const penaltyDisplayDiv = cardWrapper.querySelector('.active-penalty-display');
        if (penaltyDisplayDiv) {
            penaltyDisplayDiv.dataset.groupId = cardGroupId; // Ensure ID is set
            updatePenaltyDisplay(cardGroupId, groupData.active_penalty_text || ''); // Call helper
            let clearButton = penaltyDisplayDiv.querySelector('.clear-penalty-btn');
            if (canInteractWithGroupItems) {
                if (!clearButton) { // Create if doesn't exist
                    clearButton = document.createElement('button');
                    clearButton.className = 'btn btn-xs btn-outline-light clear-penalty-btn mt-1';
                    clearButton.dataset.groupId = cardGroupId;
                    clearButton.innerHTML = `<span class="spinner-border spinner-border-sm" style="display: none;"></span><span>Clear</span>`;
                    const btnContainer = penaltyDisplayDiv.querySelector('.penalty-clear-button-container'); // Target specific container
                    if (btnContainer) btnContainer.appendChild(clearButton);
                    else penaltyDisplayDiv.appendChild(clearButton); // Fallback append
                }
                clearButton.style.display = (groupData.active_penalty_text) ? 'inline-block' : 'none';
            } else if (clearButton) {
                clearButton.remove();
            }
        }

        // Progress Checkboxes
        const progressContainer = cardWrapper.querySelector('.group-progress-container');
        if (progressContainer && config.coreChallengeStructure) {
            renderProgressItems(progressContainer, config.coreChallengeStructure, cardGroupId, groupProgress, canInteractWithGroupItems);
        } else if (progressContainer) {
            progressContainer.innerHTML = '<p class="text-muted small">Challenge structure unavailable.</p>';
        }

        // Player Names Section
        const playerNamesSection = card.querySelector('.player-names-section');
         if (playerNamesSection) {
            // Show player names section if user is a member and authorized
             if (canInteractWithGroupItems) {
                 if (typeof renderPlayerNameInputs === "function") {
                     renderPlayerNameInputs(playerNamesSection, cardGroupId, groupData.player_names || [], maxPlayers);
                 } else {
                     console.error("renderPlayerNameInputs function is not defined or imported.");
                     playerNamesSection.innerHTML = '<p class="text-danger small">UI Error: Cannot render player inputs.</p>';
                     playerNamesSection.style.display = 'block';
                 }
             } else { // Hide otherwise
                 playerNamesSection.style.display = 'none';
                 const inputsContainer = playerNamesSection.querySelector('.player-name-inputs');
                 if (inputsContainer) inputsContainer.innerHTML = '';
             }
        }

        // Footer Button State
        const footer = card.querySelector('.card-footer.join-leave-footer');
        if (footer) {
            footer.innerHTML = ''; // Clear previous
            let buttonHtml = '';
            const loginUrl = `/auth/login?next=${encodeURIComponent(window.location.pathname)}`; // Ensure path is encoded

            // Only show buttons for SHARED challenges
            if (!config.isLocal) {
                 if (isUserMember) { // User IS a member of THIS group
                     if (config.isLoggedIn && config.isAuthorized) {
                         buttonHtml = `<button class="btn btn-sm btn-danger leave-group-btn" data-group-id="${cardGroupId}"><span class="spinner-border spinner-border-sm" style="display: none;"></span><span>Leave Group</span></button>`;
                     } else { buttonHtml = `<a href="${loginUrl}" class="btn btn-sm btn-outline-primary">Log in to Leave</a>`; }
                 } else { // User is NOT a member of THIS group
                     if (!config.isLoggedIn) { buttonHtml = `<a href="${loginUrl}" class="btn btn-sm btn-outline-primary">Log in to Join</a>`; }
                     else if (!config.isAuthorized) { buttonHtml = `<button class="btn btn-sm btn-outline-secondary" disabled title="Not authorized for this challenge."><span>Join (Unauthorized)</span></button>`; }
                     else if (config.userJoinedGroupId !== null) { buttonHtml = `<button class="btn btn-sm btn-outline-secondary" disabled title="Already in another group."><span>Joined Other</span></button>`; }
                     else if (isFull) { buttonHtml = `<button class="btn btn-sm btn-outline-secondary" disabled><span>Full (${memberCount}/${maxPlayers})</span></button>`; }
                     else { buttonHtml = `<button class="btn btn-sm btn-success join-group-btn" data-group-id="${cardGroupId}"><span class="spinner-border spinner-border-sm" style="display: none;"></span><span>Join (${memberCount}/${maxPlayers})</span></button>`; }
                 }
             }
            footer.innerHTML = buttonHtml;
        }

        // Progress Bar Update
        const progressBarContainer = cardWrapper.querySelector(`#progressBarContainer-${cardGroupId}`);
         if (progressBarContainer && config.coreChallengeStructure) {
            renderOrUpdateProgressBar(progressBarContainer, config.coreChallengeStructure, groupProgress);
        } else if (progressBarContainer) {
            progressBarContainer.innerHTML = '<p class="text-muted small mb-0">Progress unavailable.</p>';
        }

    }); // End forEach group ID

    // --- Phase 2: Cleanup - Remove any card elements in the DOM that are no longer in the config ---
    const allCurrentCardElements = document.querySelectorAll('.group-card-wrapper');
    allCurrentCardElements.forEach(cardEl => {
        const cardId = parseInt(cardEl.dataset.groupId, 10);
        if (!processedCardIds.has(cardId)) {
            console.warn(`[UI Update Overhaul] Removing stale card element from DOM: ID ${cardId}`);
            cardEl.remove();
        }
    });

    // --- Phase 3: Final UI State Checks ---
    // Ensure "Your Group" title is removed if myGroupEl is empty after all updates/cleanup
    if (!myGroupEl.querySelector('.group-card-wrapper')) {
        const titleH4 = myGroupEl.querySelector('h4.your-group-title');
        if (titleH4) titleH4.remove();
    }
    // Update the "No Groups" message based on final visibility of cards
    const anyVisibleCards = document.querySelector('.group-card-wrapper');
    const noGroupsMsg = document.getElementById('noGroupsMessageContainer');
    if (noGroupsMsg) noGroupsMsg.classList.toggle('d-none', !!anyVisibleCards);

    console.log("[UI Update Overhaul] Finished.");
}


/**
 * Renders player name input fields and a save button within the specified container.
 * @param {HTMLElement} container - The '.player-names-section' element.
 * @param {number} groupId - The ID of the group.
 * @param {string[]} [currentNames=[]] - Array of current player names.
 * @param {number} [numPlayersAllowed=1] - Maximum number of players allowed.
 */
export function renderPlayerNameInputs(container, groupId, currentNames = [], numPlayersAllowed = 1) {
    if (!container) return;

    // Ensure sub-elements exist or create them if necessary (more robust)
    let inputsContainer = container.querySelector('.player-name-inputs');
    let errorContainer = container.querySelector('.player-name-error');
    let saveBtnContainer = container.querySelector('.player-name-save-btn-container'); // Container for button

    if (!inputsContainer) {
        inputsContainer = document.createElement('div');
        inputsContainer.className = 'player-name-inputs mb-2'; // Added margin
        container.appendChild(inputsContainer);
    }
    if (!errorContainer) {
        errorContainer = document.createElement('div');
        errorContainer.className = 'player-name-error text-danger small mt-1';
        container.appendChild(errorContainer); // Append error after inputs
    }
    if (!saveBtnContainer) {
        saveBtnContainer = document.createElement('div');
        saveBtnContainer.className = 'player-name-save-btn-container mt-2'; // Add class for styling if needed
        container.appendChild(saveBtnContainer); // Append button container last
    }

    inputsContainer.innerHTML = ''; // Clear previous inputs
    saveBtnContainer.innerHTML = ''; // Clear previous save button
    showError(errorContainer, null); // Clear previous errors

    if (numPlayersAllowed <= 0) {
        container.style.display = 'none'; // Hide if no players allowed
        return;
    }

    // Generate input fields
    let inputsHtml = '';
    for (let i = 0; i < numPlayersAllowed; i++) {
        const currentName = currentNames?.[i] || '';
        inputsHtml += `
            <input type="text"
                   class="form-control form-control-sm mb-1 player-name-input"
                   value="${escapeHtml(currentName)}"
                   placeholder="Player ${i + 1}"
                   data-index="${i}"
                   maxlength="50">`; // Added maxlength
    }
    inputsContainer.innerHTML = inputsHtml;

    // Add Save Button into its container
    const saveButtonHtml = `
        <button class="btn btn-primary btn-sm save-player-names-btn" data-group-id="${groupId}">
            <span class="spinner-border spinner-border-sm"></span>
            <span>Save Names</span>
        </button>`;
    saveBtnContainer.innerHTML = saveButtonHtml;


    container.style.display = 'block'; // Ensure section is visible
}

/**
 * Updates the text and visibility of the active penalty display for a specific group.
 * Also ensures the clear button's visibility matches.
 * @param {number|string} groupId - The ID of the group.
 * @param {string} penaltyText - The text of the penalty to display (empty string hides).
 */
export function updatePenaltyDisplay(groupId, penaltyText) {
    const penaltyDisplayDiv = document.querySelector(`.active-penalty-display[data-group-id="${groupId}"]`);
    if (!penaltyDisplayDiv) {
        // console.warn(`Penalty display not found for group ID: ${groupId}`);
        return;
    }

    const textContentP = penaltyDisplayDiv.querySelector('.penalty-text-content');
    const clearButton = penaltyDisplayDiv.querySelector('.clear-penalty-btn');

    const hasPenalty = penaltyText && penaltyText.trim().length > 0;

    if (textContentP) {
        textContentP.textContent = hasPenalty ? penaltyText : ''; // Set text or clear
    } else {
        console.warn(`'.penalty-text-content' element missing within penalty display for group ${groupId}.`);
        // Optionally create the element if it's missing
    }

    // Show/hide the whole div based on whether there's text
    penaltyDisplayDiv.style.display = hasPenalty ? 'block' : 'none';

    // Ensure clear button visibility matches penalty visibility (if button exists)
    if (clearButton) {
        clearButton.style.display = hasPenalty ? 'inline-block' : 'none';
    }
}