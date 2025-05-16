// app/static/js/challenge_view/ui/challengeInfo.js
import { escapeHtml } from '../../utils/helpers.js'; // Adjusted path
import { getLocalChallengeById } from '../../utils/local_storage.js'; // Import for local challenge data

/**
 * Renders the static list of challenge rules/details.
 * (Copied and adapted from original ui.js - renderStaticChallengeDetailsJS)
 * @param {HTMLElement} container - The element to render the rules into.
 * @param {object} challengeData - The core challenge structure {normal, b2b}.
 */
export function renderChallengeRules(container, challengeData) {
    if (!container) return;
    container.innerHTML = ''; // Clear placeholder

    let listGroupHtml = '';
    const { normal: normalItems, b2b: b2bItems } = challengeData || {};

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
                    <i class="bi bi-list-stars me-2 fs-5"></i> Normal Wins Required
                </div>
                <ul class="list-group list-group-flush">${normalListItems}</ul>
            </div>`;
    }

    if (b2bItems?.length > 0) {
        if (listGroupHtml) listGroupHtml += '<hr class="my-4 section-divider">';
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
                            <i class="bi bi-arrow-repeat me-2 fs-5"></i> B2B Segment #${displaySegmentIdx} (${seg?.length || 0} wins)
                        </div>
                        <span class="badge bg-warning text-dark rounded-pill px-2 py-1">
                            <i class="bi bi-speedometer2 me-1 small"></i>Seg Diff: ${typeof seg?.seg_diff === 'number' ? seg.seg_diff.toFixed(1) : 'N/A'}
                        </span>
                    </div>
                    <ul class="list-group list-group-flush">${b2bListItems}</ul>
                </div>`;
        });
    }

    if (!listGroupHtml) {
        listGroupHtml = `<div class="alert alert-secondary glass-effect text-center">No specific win requirements found for this challenge.</div>`;
    }
    container.innerHTML = listGroupHtml;
}

/**
 * Updates the static information bar of the challenge (name, creator, mode, etc.).
 * This function populates elements likely defined in `_challenge_info_bar.html` or similar.
 * @param {object} challengeConfig - The main challenge configuration.
 */
export function updateChallengeInfoDisplay(challengeConfig) {
    const challengeNameEl = document.querySelector('.challenge-name-display');
    if (challengeNameEl && challengeConfig.name) {
        challengeNameEl.textContent = escapeHtml(challengeConfig.name);
    }

    const creatorNameEl = document.getElementById('challengeCreatorName'); // Example ID
    if (creatorNameEl && challengeConfig.creatorUsername) { // Assuming creatorUsername is in challengeConfig
        creatorNameEl.textContent = escapeHtml(challengeConfig.creatorUsername);
    } else if (creatorNameEl && challengeConfig.isLocal) {
        creatorNameEl.textContent = "Local User";
    }


    const groupModeEl = document.getElementById('challengeGroupMode'); // Example ID
    if (groupModeEl) {
        let modeText = challengeConfig.isMultigroup ? `Multi-Group (${challengeConfig.maxGroups} max)` : 'Single Group';
        modeText += `, ${challengeConfig.numPlayersPerGroup} player(s)/group`;
        groupModeEl.textContent = modeText;
    }

    const penaltyStatusEl = document.getElementById('challengePenaltyStatus'); // Example ID
    if (penaltyStatusEl) {
        if (challengeConfig.penaltyInfo && challengeConfig.penaltyInfo.penalties && challengeConfig.penaltyInfo.penalties.length > 0) {
            penaltyStatusEl.innerHTML = `Penalties: <span class="badge bg-success">Enabled</span> (Source: ${escapeHtml(challengeConfig.penaltyInfo.source_tab_name || 'Default')})`;
        } else {
            penaltyStatusEl.innerHTML = `Penalties: <span class="badge bg-secondary">Disabled</span>`;
        }
    }
    
    // For local challenges, some info might be different or simpler
    if (challengeConfig.isLocal) {
        const localTitleEl = document.getElementById('local-challenge-title'); // Specific title for local view
        if (localTitleEl) {
            // For local challenges, challengeConfig.name should already be set correctly by main.js
            localTitleEl.textContent = escapeHtml(challengeConfig.name || 'Local Challenge');
        }
        // Other local-specific info updates can go here.
        // e.g., hide elements that are only relevant for shared challenges.
        const sharedOnlyInfo = document.getElementById('sharedChallengeSpecificInfo'); // Example
        if(sharedOnlyInfo) sharedOnlyInfo.style.display = 'none';
    }

    // console.log("[ChallengeInfo] Info display update triggered."); // Removed verbose log
}
