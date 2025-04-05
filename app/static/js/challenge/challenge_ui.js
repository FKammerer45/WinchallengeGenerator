// static/js/challenge/challenge_ui.js

// Import required helpers
import { setLoading, escapeHtml } from '../utils/helpers.js';

/**
 * Updates the displayed group count (e.g., "Groups: 2 / 10").
 * @param {number} currentCount - The current number of groups.
 * @param {number} maxGroups - The maximum allowed groups.
 */
export function updateGroupCountDisplay(currentCount, maxGroups) {
    const countSpan = document.getElementById('currentGroupCount');
    const limitInfo = document.getElementById('groupLimitInfo');
    // Ensure values are numbers before display
    const displayCount = Number(currentCount) || 0;
    const displayMax = Number(maxGroups) || '?'; // Show '?' if maxGroups is invalid

    if (countSpan && limitInfo) {
        console.log(`UI: Updating group count display: ${displayCount} / ${displayMax}`);
        countSpan.textContent = displayCount;
        limitInfo.textContent = `Groups: ${displayCount} / ${displayMax}`;
    } else {
        console.warn("UI: Count display elements not found.");
    }
    // Toggle 'no groups' message visibility
    const noGroupsMsg = document.getElementById('noGroupsMessageContainer');
    if(noGroupsMsg) {
        noGroupsMsg.classList.toggle('d-none', displayCount > 0);
    }
}

/**
 * Renders the interactive progress checkboxes within a given container element.
 * @param {HTMLElement} container - The parent element to render checkboxes into.
 * @param {object} challengeStructure - The core challenge structure (normal, b2b wins).
 * @param {number} groupId - The ID of the group this progress belongs to.
 * @param {object} groupProgress - The current progress data for this group.
 * @param {boolean} isMember - Whether the current viewing user is a member (for enabling/disabling).
 */
export function renderProgressItems(container, challengeStructure, groupId, groupProgress, isMember) {
    container.innerHTML = ''; // Clear previous
    let html = '';

    // Function to generate HTML for a single checkbox item
    const createCheckboxHtml = (itemType, itemKey, itemIndex, isChecked, isDisabled, labelText, segmentIndex = null) => {
        const progressKey = segmentIndex !== null
            ? `${itemType}_${segmentIndex}_${itemKey}_${itemIndex}` // B2B key
            : `${itemType}_${itemKey}_${itemIndex}`; // Normal key
        const safeProgressKey = progressKey.replace(/[^a-zA-Z0-9-_]/g, '_'); // Sanitize for ID
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
    if (challengeStructure?.normal) {
        html += '<h6 class="text-info small">Normal Wins Progress:</h6>';
        Object.entries(challengeStructure.normal).sort((a, b) => a[0].localeCompare(b[0])).forEach(([key, info]) => {
            html += `<div class="mb-2"><strong class="small d-block">${escapeHtml(key)} (${info.count} needed):</strong><div class="progress-markers pl-2">`;
            for (let i = 0; i < info.count; i++) {
                const progressKey = `normal_${key}_${i}`;
                const isChecked = groupProgress[progressKey] === true;
                html += createCheckboxHtml('normal', key, i, isChecked, !isMember, `Win ${i + 1} for ${escapeHtml(key)}`);
            } html += `</div></div>`;
        });
    }

     // Render B2B Wins
     if (challengeStructure?.b2b?.length > 0) {
        if(challengeStructure.normal) html += '<hr class="border-secondary my-2">';
        html += '<h6 class="text-warning small">B2B Segment Progress:</h6>';
        challengeStructure.b2b.forEach((seg, segIndex) => {
            const segmentIndex = segIndex + 1; // 1-based
            html += `<div class="mb-2"><strong class="small d-block">Segment ${segmentIndex}:</strong>`;
            if (seg?.group) {
                Object.entries(seg.group).sort((a, b) => a[0].localeCompare(b[0])).forEach(([key, count]) => {
                    html += `<div class="pl-2 mb-1"><span class="small d-inline-block mr-2">${escapeHtml(key)} (${count} needed):</span><div class="progress-markers d-inline-block">`;
                    for (let i = 0; i < count; i++) {
                        const progressKey = `b2b_${segmentIndex}_${key}_${i}`;
                        const isChecked = groupProgress[progressKey] === true;
                        html += createCheckboxHtml('b2b', key, i, isChecked, !isMember, `Segment ${segmentIndex} Win ${i + 1} for ${escapeHtml(key)}`, segmentIndex);
                    } html += `</div></div>`;
                 });
             }
            html += `</div>`;
        });
     }

     if (!html) { // If neither normal nor b2b produced HTML
         html = '<p class="text-muted small">No progress items defined.</p>';
     }
     container.innerHTML = html;
}


/**
 * Adds a new group card to the DOM.
 * @param {object} group - The group object returned from API {id, name, progress}.
 * @param {object} challengeConfig - The main configuration object.
 */
export function addGroupToDOM(group, challengeConfig) {
    const template = document.getElementById('groupCardTemplate');
    const groupsContainer = document.getElementById('groupsContainer');
    if (!template || !groupsContainer) { console.error("DOM Error: Cannot add group card."); return; }

    document.getElementById('noGroupsMessageContainer')?.classList.add('d-none'); // Hide msg

    const clone = template.content.cloneNode(true);
    const wrapper = clone.querySelector('.group-card-wrapper');
    const title = clone.querySelector('.card-title');
    const progressContainer = clone.querySelector('.group-progress-container');
    const buttonContainer = clone.querySelector('.card-footer');

    if (!wrapper || !title || !progressContainer || !buttonContainer) { console.error("DOM Error: Card template missing elements."); return; }

    wrapper.dataset.groupId = group.id;
    title.textContent = group.name;
    progressContainer.innerHTML = ''; // Clear placeholder

    // Render initial progress items (user is never a member of a newly created group)
    if (challengeConfig.coreChallengeStructure) {
        renderProgressItems(progressContainer, challengeConfig.coreChallengeStructure, group.id, group.progress || {}, false);
    } else { progressContainer.innerHTML = '<p class="text-muted small">Error: Challenge structure unavailable.</p>'; }

    // Add initial button state (always 'Join' unless user already in another group)
    buttonContainer.innerHTML = ''; // Clear template footer
    const initialButton = document.createElement('button');
    initialButton.dataset.groupId = group.id;
    if (challengeConfig.isMultigroup) {
        buttonContainer.innerHTML = ''; // Clear footer
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
         buttonContainer.remove(); // Remove footer entirely for single group mode
    }

    groupsContainer.appendChild(clone);
    console.log(`Group card added for ${group.name}`);
    // Call the main UI update function AFTER adding the element to ensure it's included
    updateUIAfterMembershipChange(challengeConfig);
}

/**
 * Updates buttons and checkboxes across all group cards based on membership state.
 * @param {object} challengeConfig - The main configuration object containing userJoinedGroupId.
 */
export function updateUIAfterMembershipChange(challengeConfig) {
    console.log(`UI: Updating based on userJoinedGroupId: ${challengeConfig.userJoinedGroupId}, isMultigroup: ${challengeConfig.isMultigroup}`);
    const groupsContainer = document.getElementById('groupsContainer');
    if (!groupsContainer) return;

    groupsContainer.querySelectorAll('.group-card-wrapper').forEach(card => {
        const cardGroupId = parseInt(card.dataset.groupId, 10);
        const buttonContainer = card.querySelector('.card-footer'); // Should have .join-leave-footer class?
        const checkBoxes = card.querySelectorAll('.progress-checkbox');
        if (isNaN(cardGroupId)) return; // Skip if ID invalid

        let isMember = (challengeConfig.userJoinedGroupId === cardGroupId);

        // --- Checkbox Enable/Disable ---
        // For multigroup, disable if not member. For single group, always enable.
        const disableCheckboxes = challengeConfig.isMultigroup && !isMember;
        checkBoxes.forEach(cb => cb.disabled = disableCheckboxes);

        // --- Button Update (Only for Multigroup) ---
        if (challengeConfig.isMultigroup) {
            if (!buttonContainer) { console.warn(`Button container missing for group ${cardGroupId}`); return; }
            let currentButton = buttonContainer.querySelector('button');
            if (!currentButton) { /* Create placeholder */ /* ... */ }
            const buttonTextSpan = currentButton.querySelector('span:not(.spinner-border-sm)');

            let btnClass = 'btn btn-sm'; let btnText = ''; let btnDisabled = false;

            if (challengeConfig.userJoinedGroupId === null) { // Can join any group
                btnClass += ' btn-success join-group-btn'; btnText = 'Join Group';
            } else if (isMember) { // Joined this group
                btnClass += ' btn-danger leave-group-btn'; btnText = 'Leave Group';
            } else { // Joined another group
                btnClass += ' btn-outline-secondary'; btnText = 'Joined Other'; btnDisabled = true;
            }
            currentButton.className = btnClass; currentButton.disabled = btnDisabled;
            if (buttonTextSpan) buttonTextSpan.textContent = btnText;
            currentButton.dataset.groupId = cardGroupId;
            setLoading(currentButton, false);
        } else {
            // If single group mode, ensure no button container exists or is empty/hidden
            if(buttonContainer) buttonContainer.style.display = 'none';
        }
    });
}