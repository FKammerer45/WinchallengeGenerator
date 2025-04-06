// static/js/challenge/challenge_ui.js
// Handles DOM manipulation and rendering for the challenge view page

// Import required helpers
import { setLoading, escapeHtml, showError } from '../utils/helpers.js'; // Added showError


/**
 * Updates the displayed group count (e.g., "Groups: 2 / 10").
 * @param {number} currentCount - The current number of groups.
 * @param {number} maxGroups - The maximum allowed groups.
 */
export function updateGroupCountDisplay(currentCount, maxGroups) {
    const countSpan = document.getElementById('currentGroupCount');
    const maxSpan = document.getElementById('maxGroupCount'); // Find the new span for max count
    // No longer need to find the whole 'limitInfo' element

    const displayCount = Number(currentCount) || 0;
    const displayMax = Number(maxGroups) || '?'; // Use '?' if max is invalid/unavailable

    // Update current count span
    if (countSpan) {
        // console.log(`UI: Updating current group count display: ${displayCount}`); // Optional log
        countSpan.textContent = displayCount;
    } else {
        console.warn("UI: Count display element (#currentGroupCount) not found.");
    }

    // Update max count span
    if (maxSpan) {
        // console.log(`UI: Updating max group count display: ${displayMax}`); // Optional log
        maxSpan.textContent = displayMax;
    } else {
        // This might log initially if element isn't present when JS first runs, may not be critical
        console.warn("UI: Max group count display element (#maxGroupCount) not found.");
    }

    // Toggle 'no groups' message visibility
    const noGroupsMsg = document.getElementById('noGroupsMessageContainer');
    if (noGroupsMsg) {
        // Hide the "no groups" message if the current count is greater than 0
        noGroupsMsg.classList.toggle('d-none', displayCount > 0);
    }
}

/**
 * Calculates progress based on challenge structure and progress data.
 * @param {object} challengeData - The core challenge structure {normal, b2b}.
 * @param {object} [progressData={}] - The group/local progress object {'key': true,...}.
 * @returns {object} - Object like { completed: number, total: number, percentage: number }
 */
function calculateProgress(challengeData, progressData = {}) {
    let total = 0;
    let completed = 0;
    const safeProgressData = progressData || {}; // Ensure it's an object

    // Count normal wins
    if (challengeData?.normal) {
        Object.values(challengeData.normal).forEach(info => { total += info.count || 0; }); // Sum counts for total
        Object.entries(challengeData.normal).forEach(([key, info]) => {
            for (let i = 0; i < (info.count || 0); i++) {
                const progressKey = `normal_${key}_${i}`;
                if (safeProgressData[progressKey] === true) completed++;
            }
        });
    }
    // Count B2B wins
    if (challengeData?.b2b) {
        challengeData.b2b.forEach((seg, segIndex) => {
            if(seg?.group){
               Object.values(seg.group).forEach(count => { total += count || 0; }); // Sum counts
               const segmentIndex = segIndex + 1;
               Object.entries(seg.group).forEach(([key, count]) => {
                   for (let i = 0; i < count; i++) {
                        const progressKey = `b2b_${segmentIndex}_${key}_${i}`;
                        if (safeProgressData[progressKey] === true) completed++;
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
    if (!container) return;
    const progress = calculateProgress(challengeData, progressData);
    const progressBarId = container.id || `prog-${Math.random().toString(36).substring(2)}`; // Ensure ID exists or generate one
    container.dataset.progressBarId = progressBarId; // Store ID if needed

    container.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-1 small">
            <span class="text-muted">Overall Progress:</span>
            <span class="font-weight-bold text-light">${progress.completed} / ${progress.total} (${progress.percentage}%)</span>
        </div>
        <div class="progress" style="height: 10px; background-color: #495057;">
            <div id="${progressBarId}-bar" {# Give bar itself an ID #}
                 class="progress-bar bg-warning progress-bar-striped" {# Start without animation initially #}
                 role="progressbar"
                 style="width: ${progress.percentage}%;"
                 aria-valuenow="${progress.percentage}"
                 aria-valuemin="0" aria-valuemax="100">
            </div>
        </div>
    `;
     // Add animation class briefly for update effect if it wasn't just created
     requestAnimationFrame(() => { // Ensure bar exists in DOM
          const bar = document.getElementById(`${progressBarId}-bar`);
          if (bar) {
              bar.classList.add('progress-bar-animated');
              setTimeout(() => { bar.classList.remove('progress-bar-animated'); }, 1500);
          }
     });
}

/**
 * Renders the static rules list (similar to _challenge_details.html).
 * @param {HTMLElement} container - The element to render the rules into.
 * @param {object} challengeData - The core challenge structure {normal, b2b}.
 */
export function renderStaticChallengeDetailsJS(container, challengeData) {
     if (!container) return;
     let html = '';

     // Use optional chaining and nullish coalescing for safety
     const normalItems = challengeData?.normal;
     const b2bItems = challengeData?.b2b;

     if (normalItems && Object.keys(normalItems).length > 0) {
        html += '<h6 class="card-subtitle mb-2 text-info small">Normal Wins Required:</h6><ul class="list-unstyled mb-3">';
        Object.entries(normalItems).sort((a,b) => a[0].localeCompare(b[0])).forEach(([key, info]) => {
             html += `<li class="small">${info.count || 0} x ${escapeHtml(key)} <span class="text-muted" style="font-size: 0.8em;">(Diff: ${info.diff?.toFixed(2) || 'N/A'})</span></li>`;
        }); html += '</ul>';
     }

      if (b2bItems?.length > 0) {
        if(normalItems && Object.keys(normalItems).length > 0) html += '<hr class="border-secondary my-2">';
        html += '<h6 class="mt-2 card-subtitle mb-2 text-warning small">Back-to-Back Segments Required:</h6><ul class="list-unstyled">';
        b2bItems.forEach((seg, segIndex) => {
             html += `<li class="mb-2"><strong class="small">Segment ${segIndex + 1}</strong> <small class="text-muted">(${seg.length || 0} wins, Diff: ${seg.seg_diff?.toFixed(2) || 'N/A'})</small>:<ul class="list-unstyled ml-3 mt-1">`;
             if(seg.group){
                 Object.entries(seg.group).sort((a,b) => a[0].localeCompare(b[0])).forEach(([key, count]) => { html += `<li class="small">${count || 0} x ${escapeHtml(key)}</li>`; });
             }
             html += "</ul></li>";
        }); html += '</ul>';
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
 * @param {boolean} isMemberOrLocal - Whether checkboxes should be enabled (true if local challenge or user is member).
 */
export function renderProgressItems(container, challengeStructure, groupId, groupProgress, isMemberOrLocal) {
    container.innerHTML = ''; // Clear previous
    let html = '';
    const isDisabled = !isMemberOrLocal; // Checkboxes disabled if NOT member/local

    // Helper to generate checkbox HTML
    const createCheckboxHtml = (itemType, itemKey, itemIndex, isChecked, labelText, segmentIndex = null) => {
        const progressKey = segmentIndex !== null
            ? `${itemType}_${segmentIndex}_${itemKey}_${itemIndex}` : `${itemType}_${itemKey}_${itemIndex}`;
        const safeProgressKey = progressKey.replace(/[^a-zA-Z0-9-_]/g, '_');
        const uniqueId = `check_${groupId}_${safeProgressKey}`;
        const segmentAttr = segmentIndex !== null ? `data-segment-index="${segmentIndex}"` : '';

        return `
            <div class="form-check form-check-inline progress-item ${isChecked ? 'completed' : ''}">
              <input type="checkbox" class="form-check-input progress-checkbox" id="${uniqueId}"
                     aria-label="${labelText}"
                     data-group-id="${groupId}" data-item-type="${itemType}"
                     data-item-key="${escapeHtml(itemKey)}" data-item-index="${itemIndex}"
                     ${segmentAttr}
                     ${isChecked ? 'checked' : ''} ${isDisabled ? 'disabled' : ''}>
              <label class="form-check-label" for="${uniqueId}"><span class="sr-only">${labelText}</span></label>
            </div>`;
    };

    // Render Normal Wins
    if (challengeStructure?.normal) { /* ... loop using createCheckboxHtml(..., isDisabled, ...) ... */ }
    // Render B2B Wins
    if (challengeStructure?.b2b?.length > 0) { /* ... loop using createCheckboxHtml(..., isDisabled, ...) ... */ }

    // Simplified rendering loops (full code omitted for brevity, same logic as before but pass isDisabled)
     if (challengeStructure?.normal) {
        html += '<h6 class="text-info small">Normal Wins Progress:</h6>';
        Object.entries(challengeStructure.normal).sort((a, b) => a[0].localeCompare(b[0])).forEach(([key, info]) => {
            html += `<div class="mb-2"><strong class="small d-block">${escapeHtml(key)} (${info.count} needed):</strong><div class="progress-markers pl-2">`;
            for (let i = 0; i < (info.count || 0); i++) {
                const progressKey = `normal_${key}_${i}`; const isChecked = groupProgress[progressKey] === true;
                html += createCheckboxHtml('normal', key, i, isChecked, isDisabled, `Win ${i + 1} for ${escapeHtml(key)}`);
            } html += `</div></div>`;
        });
     }
     if (challengeStructure?.b2b?.length > 0) {
        if(challengeStructure.normal) html += '<hr class="border-secondary my-2">';
        html += '<h6 class="text-warning small">B2B Segment Progress:</h6>';
        challengeStructure.b2b.forEach((seg, segIndex) => {
            const segmentIndex = segIndex + 1;
            html += `<div class="mb-2"><strong class="small d-block">Segment ${segmentIndex}:</strong>`;
            if (seg?.group) {
                Object.entries(seg.group).sort().forEach(([key, count]) => {
                    html += `<div class="pl-2 mb-1"><span class="small d-inline-block mr-2">${escapeHtml(key)} (${count} needed):</span><div class="progress-markers d-inline-block">`;
                    for (let i = 0; i < count; i++) {
                        const progressKey = `b2b_${segmentIndex}_${key}_${i}`; const isChecked = groupProgress[progressKey] === true;
                        html += createCheckboxHtml('b2b', key, i, isChecked, isDisabled, `Segment ${segmentIndex} Win ${i + 1} for ${escapeHtml(key)}`, segmentIndex);
                    } html += `</div></div>`;
                 });
             } html += `</div>`;
        });
     }

    if (!html) html = '<p class="text-muted small">No progress items defined.</p>';
    container.innerHTML = html;
}


/**
 * Adds a new group card to the DOM (used only for Multigroup DB challenges).
 * @param {object} group - The group object returned from API {id, name, progress}.
 * @param {object} challengeConfig - The main configuration object.
 */
export function addGroupToDOM(group, challengeConfig) {
    const template = document.getElementById('groupCardTemplate');
    const groupsContainer = document.getElementById('otherGroupsContainer'); // New groups always start here
    if (!template || !groupsContainer) { console.error("DOM Error: Cannot add group card."); return; }

    document.getElementById('noGroupsMessageContainer')?.classList.add('d-none');

    const clone = template.content.cloneNode(true);
    const wrapper = clone.querySelector('.group-card-wrapper');
    const title = clone.querySelector('.card-title');
    const progressContainer = clone.querySelector('.group-progress-container');
    const buttonContainer = clone.querySelector('.card-footer');
    // --- Find player names section in template ---
    const playerNamesSection = clone.querySelector('.player-names-section');

    if (!wrapper || !title || !progressContainer || !buttonContainer || !playerNamesSection) {
        console.error("DOM Error: Card template missing elements (wrapper, title, progress, footer, or player-names-section).");
        return;
    }

    wrapper.dataset.groupId = group.id;
    title.textContent = group.name;
    progressContainer.innerHTML = ''; // Clear placeholder
    playerNamesSection.style.display = 'none'; // Ensure hidden by default

    // Render initial progress items (always disabled initially)
    if (challengeConfig.coreChallengeStructure) {
        renderProgressItems(progressContainer, challengeConfig.coreChallengeStructure, group.id, group.progress || {}, false);
    } else { progressContainer.innerHTML = '<p class="text-muted small">Error: Structure unavailable.</p>'; }

    // Add initial button state for multigroup mode
    if (challengeConfig.isMultigroup) {
        buttonContainer.innerHTML = ''; // Clear template footer content
        const initialButton = document.createElement('button');
        initialButton.dataset.groupId = group.id;
        if (challengeConfig.userJoinedGroupId === null) {
            initialButton.className = 'btn btn-sm btn-success join-group-btn';
            initialButton.innerHTML = '<span class="spinner-border spinner-border-sm" style="display: none;"></span><span>Join Group</span>';
        } else {
            initialButton.className = 'btn btn-sm btn-outline-secondary';
            initialButton.disabled = true;
            initialButton.innerHTML = '<span>Joined Other</span>';
        }
        buttonContainer.appendChild(initialButton);
    } else {
         buttonContainer.remove(); // Remove footer entirely if not multigroup
    }

    groupsContainer.appendChild(clone);
    console.log(`UI: Group card added for ${group.name}`);
    // Call the main UI update function AFTER adding the element to ensure it's included
    updateUIAfterMembershipChange(challengeConfig);
}
/**
 * Updates buttons and checkboxes across all group cards based on membership state and mode.
 * @param {object} challengeConfig - Contains userJoinedGroupId, isMultigroup.
 */
export function updateUIAfterMembershipChange(challengeConfig) {
    console.log(`UI: Updating based on userJoinedGroupId: ${challengeConfig.userJoinedGroupId}, isMultigroup: ${challengeConfig.isMultigroup}`);
    const allGroupCards = document.querySelectorAll('#myGroupContainer .group-card-wrapper, #otherGroupsContainer .group-card-wrapper');

    allGroupCards.forEach(cardWrapper => { // Iterate through the wrapper divs
        const card = cardWrapper.querySelector('.card.group-card'); // Get the actual card element inside
        if (!card) return; // Skip if card element not found

        const cardGroupId = parseInt(cardWrapper.dataset.groupId, 10);
        const buttonContainer = card.querySelector('.card-footer');
        const checkBoxes = card.querySelectorAll('.progress-checkbox');
        const playerNamesSection = card.querySelector('.player-names-section');

        if (isNaN(cardGroupId)) return;

        const isJoinedGroup = (challengeConfig.userJoinedGroupId === cardGroupId);

        // --- **NEW: Add/Remove Highlight Class** ---
        if (isJoinedGroup && challengeConfig.isMultigroup) {
            cardWrapper.classList.add('joined-group-active'); // Add class to the wrapper
        } else {
            cardWrapper.classList.remove('joined-group-active'); // Remove class from others/if not joined
        }
        // --- **END NEW** ---

        // Checkbox Enable/Disable
        const enableCheckboxes = !challengeConfig.isMultigroup || isJoinedGroup;
        checkBoxes.forEach(cb => cb.disabled = !enableCheckboxes);

        // Player Name Section Visibility and Content
        if (playerNamesSection) {
             const existingSaveBtn = playerNamesSection.querySelector('.save-player-names-btn');
             if(existingSaveBtn) existingSaveBtn.remove();

            if (isJoinedGroup && challengeConfig.isMultigroup) {
                const groupData = Array.isArray(challengeConfig.initialGroups) ? challengeConfig.initialGroups.find(g => g.id === cardGroupId) : null;
                // Only call render if the element is actually visible in the DOM
                // (prevents unnecessary work if card is hidden for some reason)
                if (cardWrapper.offsetParent !== null) {
                     renderPlayerNameInputs(playerNamesSection, cardGroupId, groupData?.player_names || [], challengeConfig.numPlayersPerGroup || 1);
                 } else {
                      playerNamesSection.style.display = 'none'; // Ensure hidden if parent isn't visible
                 }
            } else {
                playerNamesSection.style.display = 'none';
                const inputsContainer = playerNamesSection.querySelector('.player-name-inputs');
                if(inputsContainer) inputsContainer.innerHTML = '';
            }
        }
         // --- End Player Name Section Update ---

        // Handle join/leave button visibility/state only for multigroup mode
        if (challengeConfig.isMultigroup) {
            if (!buttonContainer) { console.warn(`Button container missing for group ${cardGroupId}`); return; }
            let currentButton = buttonContainer.querySelector('button');
            if (!currentButton) { /* Create placeholder if needed */ /*...*/ }
            const buttonTextSpan = currentButton.querySelector('span:not(.spinner-border-sm)');

            let btnClass = 'btn btn-sm'; let btnText = ''; let btnDisabled = false;
            // ... (button state logic based on isJoinedGroup, userJoinedGroupId) ...
             if (isJoinedGroup) { btnClass += ' btn-danger leave-group-btn'; btnText = 'Leave Group'; }
             else if (challengeConfig.userJoinedGroupId !== null) { btnClass += ' btn-outline-secondary'; btnText = 'Joined Other'; btnDisabled = true; }
             else { const isFull = currentButton.textContent.includes('Full'); if(isFull){ btnClass += ' btn-outline-secondary'; btnText = 'Full'; btnDisabled = true; } else { btnClass += ' btn-success join-group-btn'; btnText = 'Join Group'; } }
            currentButton.className = btnClass; currentButton.disabled = btnDisabled;
            if (buttonTextSpan) buttonTextSpan.textContent = btnText;
            currentButton.dataset.groupId = cardGroupId;
            setLoading(currentButton, false);
        } else { // Single group mode
            if (buttonContainer) buttonContainer.style.display = 'none';
        }
    });
}

function renderPlayerNameInputs(container, groupId, currentNames = [], numPlayersAllowed = 1) {
    if (!container) return;

    const inputsContainer = container.querySelector('.player-name-inputs');
    const errorContainer = container.querySelector('.player-name-error');
    const existingSaveBtn = container.querySelector('.save-player-names-btn');

    // Clear previous state cleanly
    if(existingSaveBtn) existingSaveBtn.remove();
    if (!inputsContainer || !errorContainer) {
        console.error("Player name section sub-elements missing.");
        container.innerHTML = '<p class="text-danger small">Error rendering player name inputs.</p>'; // Show error
        container.style.display = 'block';
        return;
    }
    inputsContainer.innerHTML = '';
    showError(errorContainer, null); // Use helper to clear error

    if (numPlayersAllowed <= 0) { // Should not happen based on model default, but good check
         container.style.display = 'none';
         return;
    }

    // Generate input fields
    let inputsHtml = '';
    for (let i = 0; i < numPlayersAllowed; i++) {
        const currentName = currentNames?.[i] || '';
        // --- REMOVED Jinja comment from here ---
        inputsHtml += `
            <input type="text"
                   class="form-control form-control-sm mb-1 player-name-input"
                   value="${escapeHtml(currentName)}"
                   placeholder="Player ${i + 1}"
                   data-index="${i}"
                   maxlength="50">
        `;
    }
    inputsContainer.innerHTML = inputsHtml;

    // Add Save Button
    const saveButtonHtml = `
        <button class="btn btn-primary btn-sm mt-2 save-player-names-btn" data-group-id="${groupId}">
            <span class="spinner-border spinner-border-sm" style="display: none;"></span>
            <span>Save Names</span>
        </button>`;
    inputsContainer.insertAdjacentHTML('afterend', saveButtonHtml);

    container.style.display = 'block'; // Make section visible
    // console.log(`UI: Rendered player name inputs for group ${groupId}`); // Optional log
}