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
        Object.entries(challengeData.normal).forEach(([gameKey, gameInfo]) => {
            const count = gameInfo?.count || 0;
            const progressItemKey = gameInfo?.id || gameKey; // Use gameInfo.id if available
            total += count;
            for (let i = 0; i < count; i++) {
                if (progressData[`normal_${progressItemKey}_${i}`] === true) completed++;
            }
        });
    }
    if (challengeData?.b2b) {
        challengeData.b2b.forEach((seg, segIndex) => { 
            if (seg?.group) {
                const segmentKeyIndex = segIndex; 
                Object.entries(seg.group).forEach(([gameKey, gameInfo]) => {
                    const count = gameInfo?.count || 0;
                    const progressItemKey = gameInfo?.id || gameKey; // Use gameInfo.id if available
                    total += count;
                    for (let i = 0; i < count; i++) {
                        if (progressData[`b2b_${segmentKeyIndex}_${progressItemKey}_${i}`] === true) completed++;
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
    const progressBarId = `prog-bar-${container.id || Math.random().toString(36).substring(7)}`;

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
 * Renders the interactive progress items (games with checkboxes) within a given container element.
 * @param {HTMLElement} container - The parent element to render items into.
 * @param {object} challengeStructure - The core challenge structure {normal, b2b}.
 * @param {string|number} groupId - The ID of the group or local challenge this progress belongs to.
 * @param {object} groupProgress - The current progress data for this group.
 * @param {boolean} isInteractive - Whether checkboxes and game selection should be enabled.
 * @param {object|null} currentGameInfo - Info about the currently selected game for this group {id, name, tags}.
 */
export function renderProgressItems(container, challengeStructure, groupId, groupProgress = {}, isInteractive, currentGameInfo = null) {
    if (!container) {
        console.error("renderProgressItems: Target container not provided.");
        return;
    }
    container.innerHTML = ''; // Clear previous content
    let html = '';
    const isDisabled = !isInteractive; // For checkboxes
    const canSelectGame = isInteractive; // Game selection tied to general interactivity
    const safeProgressData = groupProgress || {};

    // Helper to generate checkbox HTML for each win instance of a game
    const createCheckboxHtml = (itemType, gameIdForChallenge, gameName, itemIndex, isChecked, isDisabledFlag, segmentIndex_0based = null) => {
        const progressKey = segmentIndex_0based !== null
            ? `${itemType}_${segmentIndex_0based}_${gameIdForChallenge}_${itemIndex}`
            : `${itemType}_${gameIdForChallenge}_${itemIndex}`;
        
        const uniqueCheckboxId = `check_${groupId}_${progressKey.replace(/[^a-zA-Z0-9-_]/g, '_')}`;
        const segmentAttr = segmentIndex_0based !== null ? `data-segment-index="${segmentIndex_0based + 1}"` : '';
        // const completedClass = isChecked ? 'completed' : ''; // completedClass is applied to wrapper now
        
        return `
            <div class="custom-control custom-checkbox d-inline-block me-1 progress-item" 
                 data-progress-key="${progressKey}" 
                 title="Mark win ${itemIndex + 1} for ${escapeHtml(gameName)} as ${isChecked ? 'incomplete' : 'complete'}">
              <input type="checkbox"
                     class="custom-control-input progress-checkbox"
                     id="${uniqueCheckboxId}"
                     aria-label="Mark ${escapeHtml(gameName)} instance ${itemIndex + 1} as complete"
                     data-group-id="${groupId}"
                     data-item-type="${itemType}"
                     data-item-key="${escapeHtml(gameIdForChallenge)}"
                     data-item-index="${itemIndex}"
                     ${segmentAttr}
                     ${isChecked ? 'checked' : ''}
                     ${isDisabledFlag ? 'disabled' : ''}>
              <label class="custom-control-label" for="${uniqueCheckboxId}">
                <span class="sr-only">Win ${itemIndex + 1} for ${escapeHtml(gameName)}</span>
              </label>
            </div>`;
    };

    if (challengeStructure?.normal && Object.keys(challengeStructure.normal).length > 0) {
        html += `<div class="d-flex align-items-center mb-2 text-info"><i class="bi bi-joystick me-2 fs-5"></i><h6 class="mb-0 fw-bold small text-uppercase">Games</h6></div>`;
        Object.entries(challengeStructure.normal).sort((a, b) => String(a[0]).localeCompare(String(b[0]))).forEach(([gameKey, gameInfo]) => {
            const gameName = gameKey;
            const gameIdForChallenge = gameInfo.id || gameKey;
            const gameTags = gameInfo.tags || [];
            const count = gameInfo.count || 0;
            
            const isCurrentGame = currentGameInfo && currentGameInfo.id === gameIdForChallenge;
            // The .challenge-item-wrapper will get the highlight if it's the current game
            // Checkboxes also get 'completed' class individually.

            if (count > 0) {
                html += `<div class="progress-category mb-3">
                            <div class="challenge-item-wrapper d-flex align-items-center mb-1 ${isCurrentGame ? 'current-game-highlight' : ''}" 
                                 title="${canSelectGame ? `Click to select ${escapeHtml(gameName)} as current game.` : escapeHtml(gameName)}">
                                <i class="bi bi-joystick me-2 opacity-75 text-primary"></i>
                                <span class="${canSelectGame ? 'game-selectable-item' : ''} small text-light me-2" 
                                      role="${canSelectGame ? 'button' : ''}" tabindex="${canSelectGame ? '0' : '-1'}"
                                      data-game-id="${escapeHtml(gameIdForChallenge)}"
                                      data-game-name="${escapeHtml(gameName)}"
                                      data-game-tags='${escapeHtml(JSON.stringify(gameTags))}'
                                      data-group-id="${groupId}" 
                                      data-item-type="normal_header">
                                    ${escapeHtml(gameName)}
                                    ${gameTags.length > 0 ? gameTags.map(tag => `<span class="badge bg-secondary ms-1 small">${escapeHtml(tag)}</span>`).join('') : ''}
                                </span>
                                <span class="badge bg-secondary rounded-pill fw-normal ms-auto">${count} needed</span>
                            </div>
                            <div class="progress-markers ps-4">`;
                for (let i = 0; i < count; i++) {
                    const isChecked = safeProgressData[`normal_${gameIdForChallenge}_${i}`] === true;
                    html += createCheckboxHtml('normal', gameIdForChallenge, gameName, i, isChecked, isDisabled);
                }
                html += `</div></div>`;
            }
        });
    }

    if (challengeStructure?.b2b?.length > 0) {
        if (html) html += '<hr class="my-3 section-divider">';
        html += `<div class="d-flex align-items-center mb-2 text-secondary-accent"><i class="bi bi-arrow-repeat me-2 fs-5"></i><h6 class="mb-0 fw-bold small text-uppercase">B2B Segment Progress</h6></div>`;
        challengeStructure.b2b.forEach((seg, segIndex_0based) => {
            const displaySegmentIdx = segIndex_0based + 1;
            const gamesInSegment = seg?.group; 
            const segmentLength = seg?.length || (gamesInSegment ? Object.values(gamesInSegment).reduce((sum, game) => sum + (game.count || (typeof game === 'number' ? game : 0)), 0) : 0);

            if (gamesInSegment && Object.keys(gamesInSegment).length > 0) {
                html += `<div class="progress-category mb-3 ms-2"><strong class="small d-block text-light mb-1">Segment ${displaySegmentIdx} (${segmentLength} wins):</strong>`;
                Object.entries(gamesInSegment).sort((a, b) => String(a[0]).localeCompare(String(b[0]))).forEach(([gameKey, gameInfo]) => {
                    const gameName = gameKey;
                    const gameIdForChallenge = gameInfo.id || gameKey;
                    const gameTags = gameInfo.tags || [];
                    const count = gameInfo.count || (typeof gameInfo === 'number' ? gameInfo : 0);
                    const isCurrentGame = currentGameInfo && currentGameInfo.id === gameIdForChallenge;
                    const titleText = canSelectGame ? `Click to select ${escapeHtml(gameName)} as current game.` : escapeHtml(gameName);
                    
                    if (count > 0) {
                        html += `<div class="mb-2 ${isCurrentGame ? 'current-game-highlight' : ''}">
                                    <div class="challenge-item-wrapper d-flex align-items-center mb-1"
                                         title="${titleText}">
                                        <i class="bi bi-joystick me-2 opacity-75 text-warning"></i>
                                        <span class="${canSelectGame ? 'game-selectable-item' : ''} small text-light me-2"
                                              role="${canSelectGame ? 'button' : ''}" tabindex="${canSelectGame ? '0' : '-1'}"
                                              data-game-id="${escapeHtml(gameIdForChallenge)}"
                                              data-game-name="${escapeHtml(gameName)}"
                                              data-game-tags='${escapeHtml(JSON.stringify(gameTags))}'
                                              data-group-id="${groupId}" data-item-type="b2b_header"
                                              data-segment-index="${displaySegmentIdx}">
                                            ${escapeHtml(gameName)}
                                            ${gameTags.length > 0 ? gameTags.map(tag => `<span class="badge bg-secondary ms-1 small">${escapeHtml(tag)}</span>`).join('') : ''}
                                        </span>
                                        <span class="badge bg-secondary rounded-pill fw-normal ms-auto">${count} needed</span>
                                    </div>
                                    <div class="progress-markers ps-4">`;
                        for (let i = 0; i < count; i++) {
                             const isChecked = safeProgressData[`b2b_${segIndex_0based}_${gameIdForChallenge}_${i}`] === true;
                            html += createCheckboxHtml('b2b', gameIdForChallenge, gameName, i, isChecked, isDisabled, segIndex_0based);
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

    // After rendering, if there's a current game, ensure it's highlighted
    if (currentGameInfo && currentGameInfo.id) {
        highlightCurrentGame(container, currentGameInfo.id); // Call highlight after innerHTML is set
    }
}

export function highlightCurrentGame(progressItemsContainer, currentGameId) {
    if (!progressItemsContainer) {
        console.warn("[highlightCurrentGame] progressItemsContainer is null or undefined.");
        return;
    }
    console.log(`[highlightCurrentGame] Attempting to highlight game ID: ${currentGameId} in container:`, progressItemsContainer);

    progressItemsContainer.querySelectorAll('.current-game-highlight').forEach(el => {
        el.classList.remove('current-game-highlight');
    });

    // The .game-selectable-item is the span with the game name.
    // We want to highlight its parent .challenge-item-wrapper or the .progress-category / .mb-2 for B2B.
    const gameNameSpans = progressItemsContainer.querySelectorAll(`.game-selectable-item[data-game-id="${escapeHtml(currentGameId)}"]`);
    
    if (gameNameSpans.length > 0) {
        gameNameSpans.forEach(span => {
            // The direct parent of the span that groups the game name and its icon is '.challenge-item-wrapper'
            const itemWrapper = span.closest('.challenge-item-wrapper');
            if (itemWrapper) {
                itemWrapper.classList.add('current-game-highlight');
                console.log("[highlightCurrentGame] Applied highlight to .challenge-item-wrapper:", itemWrapper);
            } else {
                // Fallback if structure is unexpected, though less likely
                span.classList.add('current-game-highlight'); // Highlight the span itself
                console.log("[highlightCurrentGame] No .challenge-item-wrapper found, applied highlight to span itself:", span);
            }
        });
    } else {
        console.log(`[highlightCurrentGame] No game item span found for game ID: ${currentGameId}`);
    }
}
