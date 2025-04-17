// static/js/challenge/ui.js
// Handles DOM manipulation and rendering for the challenge view page.
// Receives data from challenge_view.js and updates the UI accordingly.

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
    // *** TEMPORARY LOGGING START ***
    console.log("Calculating Progress With:", {
        // Log stringified versions for easier inspection of structure and keys
        challengeData: JSON.stringify(challengeData),
        progressData: JSON.stringify(progressData)
    });
    // *** TEMPORARY LOGGING END ***

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
                const segmentIdx = segIndex + 1; // 1-based index
                Object.entries(seg.group).forEach(([key, count]) => {
                    total += count || 0;
                    for (let i = 0; i < (count || 0); i++) {
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
    // console.log("Calculation Result:", { completed, total, percentage }); // Optional log result
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
        // console.warn("Progress bar container not found."); // Less verbose
        return;
    }
    // Ensure challengeData has at least normal or b2b, otherwise progress is meaningless
    if (!challengeData || (!challengeData.normal && !challengeData.b2b)) {
        container.innerHTML = '<p class="text-muted small mb-0">Challenge structure unavailable for progress.</p>';
        return;
    }

    const progress = calculateProgress(challengeData, progressData); // Assumes calculateProgress is defined above
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
    if (!container) return;
    let html = '';
    const { normal: normalItems, b2b: b2bItems } = challengeData || {};

    if (normalItems && Object.keys(normalItems).length > 0) {
        html += '<h6 class="card-subtitle mb-2 text-info small">Normal Wins Required:</h6><ul class="list-unstyled mb-3">';
        Object.entries(normalItems).sort((a, b) => String(a[0]).localeCompare(String(b[0]))).forEach(([key, info]) => {
            html += `<li class="small">${info?.count || 0} x ${escapeHtml(key)} <span class="text-muted" style="font-size: 0.8em;">(Diff: ${info?.diff?.toFixed(2) || 'N/A'})</span></li>`;
        });
        html += '</ul>';
    }

    if (b2bItems?.length > 0) {
        if (html) html += '<hr class="border-secondary my-2">'; // Separator
        html += '<h6 class="mt-2 card-subtitle mb-2 text-warning small">Back-to-Back Segments Required:</h6><ul class="list-unstyled">';
        b2bItems.forEach((seg, segIndex) => {
            const segmentIdx = segIndex + 1;
            html += `<li class="mb-2"><strong class="small">Segment ${segmentIdx}</strong> <small class="text-muted">(${seg?.length || 0} wins, Diff: ${seg?.seg_diff?.toFixed(2) || 'N/A'})</small>:`;
            if (seg?.group) {
                html += '<ul class="list-unstyled ml-3 mt-1">';
                Object.entries(seg.group).sort((a, b) => String(a[0]).localeCompare(String(b[0]))).forEach(([key, count]) => {
                    html += `<li class="small">${count || 0} x ${escapeHtml(key)}</li>`;
                });
                html += '</ul>';
            }
            html += "</li>";
        });
        html += '</ul>';
    }

    if (!html) html = '<p class="text-muted small">Challenge structure details not available.</p>';
    container.innerHTML = html;
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
    // *** Checkboxes are disabled if not interactive ***
    const isDisabled = !isInteractive;
    const safeProgressData = groupProgress || {};

    // Helper to generate checkbox HTML
    const createCheckboxHtml = (itemType, itemKey, itemIndex, isChecked, isDisabledFlag, labelText, segmentIndex = null) => {
        const progressKey = segmentIndex !== null
            ? `${itemType}_${segmentIndex}_${itemKey}_${itemIndex}` : `${itemType}_${itemKey}_${itemIndex}`;
        // Sanitize key for use in HTML ID
        const safeProgressKey = progressKey.replace(/[^a-zA-Z0-9-_]/g, '_');
        const uniqueId = `check_${groupId}_${safeProgressKey}`;
        const segmentAttr = segmentIndex !== null ? `data-segment-index="${segmentIndex}"` : '';
        const escapedItemKey = escapeHtml(String(itemKey)); // Ensure string before escaping

        // Add the 'completed' class based on initial state
        const completedClass = isChecked ? 'completed' : '';

        return `
            <div class="form-check form-check-inline progress-item ${completedClass}" data-progress-key="${progressKey}">
              <input type="checkbox" class="form-check-input progress-checkbox" id="${uniqueId}"
                     aria-label="${escapeHtml(labelText)}"
                     data-group-id="${groupId}" data-item-type="${itemType}"
                     data-item-key="${escapedItemKey}" data-item-index="${itemIndex}"
                     ${segmentAttr}
                     ${isChecked ? 'checked' : ''}
                     ${isDisabledFlag ? 'disabled' : ''}>
              <label class="form-check-label" for="${uniqueId}"><span class="sr-only">${escapeHtml(labelText)}</span></label>
            </div>`;
    };

    // --- Render Normal Wins ---
    if (challengeStructure?.normal && Object.keys(challengeStructure.normal).length > 0) {
        html += '<h6 class="text-info small">Normal Wins Progress:</h6>';
        Object.entries(challengeStructure.normal).sort((a, b) => String(a[0]).localeCompare(String(b[0]))).forEach(([key, info]) => {
            const count = info?.count || 0;
            if (count > 0) {
                html += `<div class="mb-2"><strong class="small d-block">${escapeHtml(key)} (${count} needed):</strong><div class="progress-markers pl-2">`;
                for (let i = 0; i < count; i++) {
                    const progressKey = `normal_${key}_${i}`;
                    const isChecked = safeProgressData[progressKey] === true;
                    html += createCheckboxHtml('normal', key, i, isChecked, isDisabled, `Win ${i + 1} for ${key}`);
                }
                html += `</div></div>`;
            }
        });
    }

    // --- Render B2B Wins ---
    if (challengeStructure?.b2b?.length > 0) {
        if (html) html += '<hr class="border-secondary my-2">'; // Separator
        html += '<h6 class="text-warning small">B2B Segment Progress:</h6>';
        challengeStructure.b2b.forEach((seg, segIndex) => {
            const segmentIdx = segIndex + 1;
            if (seg?.group && Object.keys(seg.group).length > 0) {
                html += `<div class="mb-2"><strong class="small d-block">Segment ${segmentIdx} (${seg.length || 0} wins):</strong>`;
                Object.entries(seg.group).sort((a, b) => String(a[0]).localeCompare(String(b[0]))).forEach(([key, count]) => {
                    if (count > 0) {
                        html += `<div class="pl-2 mb-1"><span class="small d-inline-block mr-2">${escapeHtml(key)} (${count} needed):</span><div class="progress-markers d-inline-block">`;
                        for (let i = 0; i < count; i++) {
                            const progressKey = `b2b_${segmentIdx}_${key}_${i}`;
                            const isChecked = safeProgressData[progressKey] === true;
                            html += createCheckboxHtml('b2b', key, i, isChecked, isDisabled, `Segment ${segmentIdx} Win ${i + 1} for ${key}`, segmentIdx);
                        }
                        html += `</div></div>`;
                    }
                });
                html += `</div>`; // Close segment div
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
    const buttonContainer = clone.querySelector('.card-footer');
    const penaltyDisplayDiv = clone.querySelector('.active-penalty-display');
    const penaltyTextP = clone.querySelector('.penalty-text-content');
    const playerNamesSection = clone.querySelector('.player-names-section');

    // Check if essential template parts exist
    if (!wrapper || !title || !progressContainer || !buttonContainer || !playerNamesSection || !penaltyDisplayDiv || !penaltyTextP) {
        console.error("DOM Error: Group card template is missing required elements.");
        return;
    }

    // Populate the cloned template
    wrapper.dataset.groupId = group.id;
    title.textContent = group.name;
    playerNamesSection.style.display = 'none'; // Hide player names initially

    // Initialize penalty display
    const initialPenalty = group.active_penalty_text || '';
    penaltyTextP.textContent = initialPenalty;
    penaltyDisplayDiv.style.display = initialPenalty ? 'block' : 'none';
    penaltyDisplayDiv.dataset.groupId = group.id;

    // Render initial progress items (always disabled when first added)
    if (challengeConfig.coreChallengeStructure) {
        renderProgressItems(progressContainer, challengeConfig.coreChallengeStructure, group.id, group.progress || {}, false);
    } else {
        progressContainer.innerHTML = '<p class="text-muted small">Challenge structure unavailable.</p>';
    }

    // Add initial button state (will be updated by updateUIAfterMembershipChange)
    buttonContainer.innerHTML = ''; // Clear template footer

    // Append the new card to the 'other groups' container
    groupsContainer.appendChild(clone);

    // Update the overall UI state, which will set the correct button for the new card
    updateUIAfterMembershipChange(challengeConfig, myGroupContainerEl, otherGroupsContainerEl);
}

/**
 * Updates the UI state for all group cards after a membership change (join/leave) or initial load.
 * Handles card highlighting, layout, button states, checkbox interactivity, player names, and penalty display.
 * @param {object} challengeConfig - The main configuration object, including isLoggedIn status.
 * @param {HTMLElement} myGroupContainerEl - Container for the user's joined group.
 * @param {HTMLElement} otherGroupsContainerEl - Container for other available groups.
 */
export function updateUIAfterMembershipChange(challengeConfig, myGroupContainerEl, otherGroupsContainerEl) {
    const yourGroupCards = myGroupContainerEl ? Array.from(myGroupContainerEl.querySelectorAll('.group-card-wrapper')) : [];
    const otherGroupCards = otherGroupsContainerEl ? Array.from(otherGroupsContainerEl.querySelectorAll('.group-card-wrapper')) : [];
    const allGroupCards = [...yourGroupCards, ...otherGroupCards];

    const noGroupsMsg = document.getElementById('noGroupsMessageContainer');
    if (noGroupsMsg) noGroupsMsg.classList.toggle('d-none', allGroupCards.length > 0);

    if (allGroupCards.length === 0) return;

    allGroupCards.forEach(cardWrapper => {
        const card = cardWrapper.querySelector('.card.group-card');
        if (!card) return;

        const cardGroupId = parseInt(cardWrapper.dataset.groupId, 10);
        if (isNaN(cardGroupId)) return;

        const groupData = challengeConfig.initialGroups?.find(g => g.id === cardGroupId);
        // Use groupData.progress if available, otherwise default to empty object
        const groupProgress = groupData?.progress || {};
        const isJoinedGroup = (challengeConfig.userJoinedGroupId === cardGroupId);
        const memberCount = groupData?.member_count ?? 0;
        const maxPlayers = challengeConfig.numPlayersPerGroup || 1;
        const isFull = memberCount >= maxPlayers;

        // --- 1. Visual State (Highlighting ONLY) ---
        const activeHighlightClass = 'joined-group-active';
        cardWrapper.classList.toggle(activeHighlightClass, isJoinedGroup);

        // --- 2. Penalty Display & Clear Button ---
        const penaltyDisplayDiv = cardWrapper.querySelector('.active-penalty-display');
        if (penaltyDisplayDiv) {
            updatePenaltyDisplay(cardGroupId, groupData?.active_penalty_text || '');
            let clearButton = penaltyDisplayDiv.querySelector('.clear-penalty-btn');
            if (isJoinedGroup && challengeConfig.isLoggedIn) {
                if (!clearButton) {
                    clearButton = document.createElement('button');
                    clearButton.className = 'btn btn-sm btn-outline-light clear-penalty-btn mt-1';
                    clearButton.dataset.groupId = cardGroupId;
                    clearButton.innerHTML = '<span>Clear</span><span class="spinner-border spinner-border-sm" style="display: none;"></span>';
                    const penaltyTextP = penaltyDisplayDiv.querySelector('.penalty-text-content');
                    if (penaltyTextP) penaltyTextP.insertAdjacentElement('afterend', clearButton);
                    else penaltyDisplayDiv.appendChild(clearButton);
                }
            } else if (clearButton) {
                clearButton.remove();
            }
        }

        // --- 3. Progress Checkbox Interactivity ---
        const checkBoxes = cardWrapper.querySelectorAll('.progress-checkbox');
        const enableCheckboxes = challengeConfig.isLocal || (isJoinedGroup && challengeConfig.isLoggedIn);
        checkBoxes.forEach(cb => cb.disabled = !enableCheckboxes);

        // --- 4. Player Name Section ---
        const playerNamesSection = card.querySelector('.player-names-section');
        if (playerNamesSection) {
            if (challengeConfig.isMultigroup && challengeConfig.isLoggedIn && isJoinedGroup) {
                if (typeof renderPlayerNameInputs === "function") {
                    renderPlayerNameInputs(
                        playerNamesSection, cardGroupId,
                        groupData?.player_names || [], maxPlayers
                    );
                } else { console.error("renderPlayerNameInputs function is not available."); }
            } else {
                playerNamesSection.style.display = 'none';
                const inputsContainer = playerNamesSection.querySelector('.player-name-inputs');
                if (inputsContainer) inputsContainer.innerHTML = '';
            }
        }

        // --- 5. Footer Button State (Join/Leave/Full/Login) ---
        const footer = card.querySelector('.card-footer.join-leave-footer');
        if (footer) {
            footer.innerHTML = '';
            let buttonHtml = '';
            if (!challengeConfig.isMultigroup) { /* No button */ }
            else if (isJoinedGroup) {
                if (challengeConfig.isLoggedIn) buttonHtml = `<button class="btn btn-sm btn-danger leave-group-btn" data-group-id="${cardGroupId}"><span>Leave Group</span><span class="spinner-border spinner-border-sm"></span></button>`;
                else { const loginUrl = `/auth/login?next=/challenge/${challengeConfig.id}`; buttonHtml = `<a href="${loginUrl}" class="btn btn-sm btn-outline-primary">Log in</a>`; }
            } else if (!challengeConfig.isLoggedIn) {
                const loginUrl = `/auth/login?next=/challenge/${challengeConfig.id}`; buttonHtml = `<a href="${loginUrl}" class="btn btn-sm btn-outline-primary">Log in to Join</a>`;
            } else if (challengeConfig.userJoinedGroupId !== null) {
                buttonHtml = `<button class="btn btn-sm btn-outline-secondary" disabled data-group-id="${cardGroupId}"><span>Joined Other</span></button>`;
            } else if (isFull) {
                buttonHtml = `<button class="btn btn-sm btn-outline-secondary" disabled data-group-id="${cardGroupId}"><span>Full</span></button>`;
            } else {
                buttonHtml = `<button class="btn btn-sm btn-success join-group-btn" data-group-id="${cardGroupId}"><span>Join</span><span class="spinner-border spinner-border-sm"></span></button>`;
            }
            footer.innerHTML = buttonHtml;
        }


        const progressBarContainer = cardWrapper.querySelector(`#progressBarContainer-${cardGroupId}`);
        if (progressBarContainer && challengeConfig.coreChallengeStructure) {
            renderOrUpdateProgressBar(progressBarContainer, challengeConfig.coreChallengeStructure, groupProgress);
        } else if (progressBarContainer) {
            // Handle case where structure might be missing but container exists
            progressBarContainer.innerHTML = '<p class="text-muted small mb-0">Progress unavailable.</p>';
        }


    }); // End forEach card
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

    const inputsContainer = container.querySelector('.player-name-inputs');
    const errorContainer = container.querySelector('.player-name-error');
    const existingSaveBtn = container.querySelector('.save-player-names-btn');
    if (existingSaveBtn) existingSaveBtn.remove(); // Remove old save button

    if (!inputsContainer || !errorContainer) {
        console.error("Player name section missing '.player-name-inputs' or '.player-name-error'.");
        container.innerHTML = '<p class="text-danger small">UI Error.</p>';
        container.style.display = 'block';
        return;
    }

    inputsContainer.innerHTML = ''; // Clear previous inputs
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

    // Add Save Button
    const saveButtonHtml = `
        <button class="btn btn-primary btn-sm mt-2 save-player-names-btn" data-group-id="${groupId}">
            <span class="spinner-border spinner-border-sm"></span>
            <span>Save Names</span>
        </button>`;
    // Append button after the inputs container
    inputsContainer.insertAdjacentHTML('afterend', saveButtonHtml);

    container.style.display = 'block'; // Ensure section is visible
}

/**
 * Updates the text and visibility of the active penalty display for a specific group.
 * @param {number|string} groupId - The ID of the group.
 * @param {string} penaltyText - The text of the penalty to display (empty string hides).
 */
export function updatePenaltyDisplay(groupId, penaltyText) {
    const penaltyDisplayDiv = document.querySelector(`.active-penalty-display[data-group-id="${groupId}"]`);
    if (!penaltyDisplayDiv) return;

    const textContentP = penaltyDisplayDiv.querySelector('.penalty-text-content');
    const clearButton = penaltyDisplayDiv.querySelector('.clear-penalty-btn'); // Find clear button

    const hasPenalty = penaltyText && penaltyText.trim().length > 0;

    if (textContentP) {
        textContentP.textContent = hasPenalty ? penaltyText : ''; // Set text or clear
    }
    // Show/hide the whole div based on whether there's text
    penaltyDisplayDiv.style.display = hasPenalty ? 'block' : 'none';

    // Ensure clear button visibility matches penalty visibility (if button exists)
    if (clearButton) {
        clearButton.style.display = hasPenalty ? 'inline-block' : 'none';
    }
}
