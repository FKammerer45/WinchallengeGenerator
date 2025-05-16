// app/static/js/challenge_view/ui/progressDisplay.js
import { escapeHtml } from '../../utils/helpers.js'; // Adjusted path

/**
 * Calculates progress based on challenge structure and progress data.
 * @param {object} challengeData - The core challenge structure {normal, b2b}.
 * @param {object} [progressData={}] - The group/local progress object {'key': true,...}.
 * @returns {{completed: number, total: number, percentage: number}}
 */
function calculateProgress(challengeData, progressData = {}) {
    let total = 0;
    let completed = 0;

    if (challengeData?.normal) {
        Object.entries(challengeData.normal).forEach(([key, info]) => {
            const count = info?.count || 0;
            total += count;
            for (let i = 0; i < count; i++) {
                if (progressData[`normal_${key}_${i}`] === true) completed++;
            }
        });
    }
    if (challengeData?.b2b) {
        challengeData.b2b.forEach((seg, segIndex) => { // segIndex is 0-based
            if (seg?.group) {
                const segmentKeyIndex = segIndex; // Use 0-based index for key construction
                Object.entries(seg.group).forEach(([key, count]) => {
                    total += count || 0;
                    for (let i = 0; i < (count || 0); i++) {
                        if (progressData[`b2b_${segmentKeyIndex}_${key}_${i}`] === true) completed++;
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
    if (!challengeData || (!challengeData.normal && !challengeData.b2b)) {
        container.innerHTML = '<p class="text-muted small mb-0">Challenge structure unavailable for progress.</p>';
        return;
    }

    const progress = calculateProgress(challengeData, progressData);
    const progressBarId = `prog-bar-${container.id || Math.random().toString(36).substring(7)}`; // Suffix for uniqueness

    container.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-1 small">
            <span class="text-muted">Group Progress:</span>
            <span class="font-weight-bold text-light">${progress.completed} / ${progress.total} (${progress.percentage}%)</span>
        </div>
        <div class="progress" style="height: 8px; background-color: var(--surface-border, #495057);">
            <div id="${progressBarId}"
                 class="progress-bar bg-warning progress-bar-striped" 
                 role="progressbar"
                 style="width: ${progress.percentage}%;"
                 aria-valuenow="${progress.percentage}"
                 aria-valuemin="0" aria-valuemax="100">
            </div>
        </div>`;

    requestAnimationFrame(() => {
        const bar = document.getElementById(progressBarId);
        if (bar) {
            bar.classList.add('progress-bar-animated');
            setTimeout(() => { bar.classList.remove('progress-bar-animated'); }, 1500);
        }
    });
}

/**
 * Renders the interactive progress checkboxes within a given container element.
 * @param {HTMLElement} container - The parent element to render checkboxes into.
 * @param {object} challengeStructure - The core challenge structure {normal, b2b}.
 * @param {string|number} groupId - The ID of the group or local challenge this progress belongs to.
 * @param {object} groupProgress - The current progress data for this group.
 * @param {boolean} isInteractive - Whether checkboxes should be enabled.
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
        const progressKey = segmentIndex_0based !== null
            ? `${itemType}_${segmentIndex_0based}_${itemKey}_${itemIndex}` // Key uses 0-based
            : `${itemType}_${itemKey}_${itemIndex}`;
        const safeProgressKeyForId = progressKey.replace(/[^a-zA-Z0-9-_]/g, '_');
        const uniqueId = `check_${groupId}_${safeProgressKeyForId}`;
        const segmentAttr = segmentIndex_0based !== null ? `data-segment-index="${segmentIndex_0based + 1}"` : ''; // Data attr is 1-based
        const escapedItemKey = escapeHtml(String(itemKey));
        const completedClass = isChecked ? 'completed' : '';

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
                     ${segmentAttr}
                     ${isChecked ? 'checked' : ''}
                     ${isDisabledFlag ? 'disabled' : ''}>
              <label class="custom-control-label" for="${uniqueId}">
                <span class="sr-only">${escapeHtml(labelText)}</span>
              </label>
            </div>`;
    };

    if (challengeStructure?.normal && Object.keys(challengeStructure.normal).length > 0) {
        html += `<div class="d-flex align-items-center mb-2 text-info"><i class="bi bi-check-circle-fill me-2 fs-5"></i><h6 class="mb-0 fw-bold small text-uppercase">Normal Wins Progress</h6></div>`;
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
                    html += createCheckboxHtml('normal', key, i, safeProgressData[progressKey] === true, isDisabled, `Win ${i + 1} for ${key}`, null);
                }
                html += `</div></div>`;
            }
        });
    }

    if (challengeStructure?.b2b?.length > 0) {
        if (html) html += '<hr class="my-3 section-divider">';
        html += `<div class="d-flex align-items-center mb-2 text-secondary-accent"><i class="bi bi-arrow-repeat me-2 fs-5"></i><h6 class="mb-0 fw-bold small text-uppercase">B2B Segment Progress</h6></div>`;
        challengeStructure.b2b.forEach((seg, segIndex_0based) => {
            const displaySegmentIdx = segIndex_0based + 1; // For display
            if (seg?.group && Object.keys(seg.group).length > 0) {
                html += `<div class="progress-category mb-3 ms-2"><strong class="small d-block text-light mb-1">Segment ${displaySegmentIdx} (${seg.length || 0} wins):</strong>`;
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
                            const progressKey = `b2b_${segIndex_0based}_${key}_${i}`;
                            html += createCheckboxHtml('b2b', key, i, safeProgressData[progressKey] === true, isDisabled, `Segment ${displaySegmentIdx} Win ${i + 1} for ${key}`, segIndex_0based);
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