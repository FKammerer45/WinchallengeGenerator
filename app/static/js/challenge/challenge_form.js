// static/js/challenge/challenge_form.js

import { getLocalTabs as getGameTabs, getLocalEntries, initLocalStorage as initGameStorage } from "../games/localStorageUtils.js";
import { getLocalPenaltyTabs, initPenaltiesLocalStorage } from "../penalties/penaltyLocalStorageUtils.js";
import { saveChallengeToLocalStorage } from './local_challenge_storage.js';
import { showError, escapeHtml, setLoading } from '../utils/helpers.js';

// Flag to prevent recursion during mode change for anonymous users
let isForcingMode = false;

function updateIndexFormUI() {
    if (isForcingMode) return; // Prevent loops

    // --- Mode Selection Logic ---
    const modeSelectedRadio = document.querySelector('input[name="group_mode"]:checked');
    const modeSelected = modeSelectedRadio?.value || 'single';
    const maxGroupsContainer = document.getElementById('maxGroupsContainer');
    const numPlayersLabel = document.getElementById('numPlayersLabel');
    const loginRequiredMsg = document.querySelector('.login-required-msg');
    const isAuthenticated = window.IS_AUTHENTICATED === true; // Read global flag

    if (modeSelected === 'multi' && !isAuthenticated) {
        isForcingMode = true;
        const singleRadio = document.getElementById('modeSingleGroup');
        if (singleRadio) singleRadio.checked = true;
        if (loginRequiredMsg) loginRequiredMsg.classList.remove('d-none');
        if (maxGroupsContainer) maxGroupsContainer.classList.add('d-none');
        if (numPlayersLabel) numPlayersLabel.textContent = 'Number of Players:';
        isForcingMode = false;
        return; // Exit early
    } else {
        if (loginRequiredMsg) loginRequiredMsg.classList.add('d-none');
    }

    // Update UI based on the *final* selected mode
    const finalModeSelected = document.querySelector('input[name="group_mode"]:checked')?.value || 'single';
    if (maxGroupsContainer) maxGroupsContainer.classList.toggle('d-none', finalModeSelected !== 'multi');
    if (numPlayersLabel) numPlayersLabel.textContent = (finalModeSelected === 'multi') ? 'Number of Players per group:' : 'Number of Players:';

    // --- Penalty Tab Logic ---
    const enablePenaltiesCheckbox = document.getElementById('enablePenalties');
    const penaltySourceContainer = document.getElementById('penaltySourceContainer');
    if (enablePenaltiesCheckbox && penaltySourceContainer) {
        penaltySourceContainer.classList.toggle('d-none', !enablePenaltiesCheckbox.checked);
    }
}

function populatePenaltySourceDropdown() {
    const dropdown = document.getElementById("penaltySourceSelect");
    if (!dropdown) return;
    dropdown.innerHTML = ''; // Clear previous options

    // *** FIX: Declare defaultExists *before* the try block ***
    let defaultExists = false;

    try {
        const tabs = getLocalPenaltyTabs();
        if (!tabs) throw new Error("Could not retrieve penalty tabs."); // Throw error if tabs are null/undefined

        // Add default option if it exists in the retrieved tabs
        if (tabs["default"]) {
             const option = document.createElement("option");
             option.value = "default";
             option.textContent = tabs["default"].name || "Default";
             dropdown.appendChild(option);
             defaultExists = true; // Mark that default was found and added
        }

        // Add other tabs
        for (const tabId in tabs) {
            if (tabId !== "default") { // Avoid duplicating default
                 const option = document.createElement("option");
                 option.value = tabId;
                 option.textContent = tabs[tabId]?.name || tabId;
                 dropdown.appendChild(option);
            }
        }

        // Set dropdown value after adding all options
        if (defaultExists) {
            dropdown.value = "default"; // Select "Default" if it was added
        } else if (dropdown.options.length > 0) {
            // Fallback: Select the first available option if "Default" wasn't found
            dropdown.value = dropdown.options[0].value;
        } else {
            // No tabs found at all, add a disabled placeholder
             dropdown.innerHTML = '<option value="" disabled selected>No penalty tabs found</option>';
        }

    } catch (error) {
        console.error("Error populating penalty source dropdown:", error);
        // Add a disabled error option
        dropdown.innerHTML = '<option value="" disabled selected>Error loading tabs</option>';
    }
}

function populateGameSourceDropdown() {
    const dropdown = document.getElementById("gameSourceSelect");
    if (!dropdown) return;
    dropdown.innerHTML = ''; // Clear previous options

    // *** FIX: Declare defaultExists *before* the try block ***
    let defaultExists = false;

    try {
        const tabs = getGameTabs();
        if (!tabs) throw new Error("Could not retrieve game tabs.");

         // Add default option if it exists
         if (tabs["default"]) {
             const option = document.createElement("option");
             option.value = "default";
             option.textContent = tabs["default"].name || "Default";
             dropdown.appendChild(option);
             defaultExists = true;
        }

        // Add other tabs
        for (const tabId in tabs) {
             if (tabId !== "default") {
                 const option = document.createElement("option");
                 option.value = tabId;
                 option.textContent = tabs[tabId]?.name || tabId;
                 dropdown.appendChild(option);
             }
        }

        // Set dropdown value after adding all options
        if (defaultExists) {
            dropdown.value = "default";
        } else if (dropdown.options.length > 0) {
            dropdown.value = dropdown.options[0].value;
        } else {
             dropdown.innerHTML = '<option value="" disabled selected>No game tabs found</option>';
        }

    } catch (error) {
        console.error("Error populating game source dropdown:", error);
        dropdown.innerHTML = '<option value="" disabled selected>Error loading tabs</option>';
    }
}

function updateGameSelectionCard() {
    const dropdown = document.getElementById("gameSourceSelect");
    const tbody = document.getElementById("gamesSelectionTbody");
    if (!dropdown || !tbody) { console.error("Missing elements for game selection card."); return; }

    const selectedTab = dropdown.value;
    if (!selectedTab) {
         tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-4">Select Game Source Tab above...</td></tr>`;
         return;
    }

    tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-3">Loading games...</td></tr>`;
    let entries = [];
    try { entries = JSON.parse(localStorage.getItem("localEntries") || "{}")[selectedTab] || []; }
    catch(e) { console.error("Error parsing localEntries:", e); tbody.innerHTML = `<tr><td colspan="3" class="text-danger text-center">Error loading games.</td></tr>`; return; }

    // Group entries by game name
    const grouped = {};
    entries.forEach(entry => {
        if (!entry?.game) return;
        const gameName = entry.game.trim();
        if (!gameName) return;
        if (!grouped[gameName]) {
            grouped[gameName] = { weight: Number(entry.weight) || 1.0, availableModes: new Set() };
        }
        if (entry.gameMode?.trim()) { grouped[gameName].availableModes.add(entry.gameMode.trim()); }
    });
    Object.keys(grouped).forEach(key => grouped[key].availableModes = Array.from(grouped[key].availableModes).sort());

    let tableHtml = "";
    const gameNames = Object.keys(grouped).sort();
    if (gameNames.length > 0) {
        gameNames.forEach((gameName, index) => {
            const group = grouped[gameName];
            const weightVal = group.weight.toFixed(1);
            const safeGameNameId = gameName.replace(/[^a-zA-Z0-9_-]/g, '-');
            const gameCheckboxId = `game-${safeGameNameId}-${index}`;
            const modalId = `modesModal-${safeGameNameId}-${index}`;
            const escapedGameName = escapeHtml(gameName); // Escape once for reuse

            // Build modal content
            let modalBodyHtml = "";
            if (group.availableModes.length > 0) {
                group.availableModes.forEach((mode, i) => {
                    const modeCheckboxId = `mode-${safeGameNameId}-${index}-${i}`;
                    const escapedModeValue = mode.replace(/"/g, '&quot;'); // Escape for value attribute
                    const escapedModeLabel = escapeHtml(mode); // Escape for display label
                    modalBodyHtml += `
                        <div class="custom-control custom-checkbox mb-2">
                            <input class="custom-control-input allowed-mode-checkbox" type="checkbox"
                                   name="allowed_modes_${escapedGameName}[]" value="${escapedModeValue}" id="${modeCheckboxId}" checked>
                            <label class="custom-control-label" for="${modeCheckboxId}">${escapedModeLabel}</label>
                        </div>`;
                });
            } else {
                modalBodyHtml = "<p class='text-muted'>No specific modes found for this game.</p>";
            }

            // Build table row
            tableHtml += `
                <tr data-game="${escapedGameName}">
                    <td class="align-middle">
                        <div class="custom-control custom-checkbox">
                           <input class="custom-control-input game-select-checkbox" type="checkbox" name="selected_games" value="${escapedGameName}" id="${gameCheckboxId}" checked>
                           <label class="custom-control-label font-weight-bold" for="${gameCheckboxId}">${escapedGameName}</label>
                        </div>
                    </td>
                    <td class="align-middle">
                        <input type="number" name="weights" value="${weightVal}" min="0.1" step="0.1" class="form-control form-control-sm game-weight-input">
                    </td>
                    <td class="align-middle text-center">
                        ${group.availableModes.length > 0 ? `
                            <button type="button" class="btn btn-sm btn-outline-secondary modes-btn" data-toggle="modal" data-target="#${modalId}" title="Select Modes">
                                Modes (${group.availableModes.length})
                            </button>
                            <div class="modal fade" id="${modalId}" tabindex="-1" role="dialog" aria-labelledby="${modalId}Label" aria-hidden="true">
                              <div class="modal-dialog modal-dialog-centered" role="document">
                                <div class="modal-content">
                                  <div class="modal-header">
                                    <h5 class="modal-title" id="${modalId}Label">${escapedGameName} - Allowed Modes</h5>
                                    <button type="button" class="close" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">&times;</span></button>
                                  </div>
                                  <div class="modal-body text-left">
                                    ${modalBodyHtml}
                                  </div>
                                  <div class="modal-footer">
                                    <button type="button" class="btn btn-secondary" data-dismiss="modal">Done</button>
                                  </div>
                                </div>
                              </div>
                            </div>
                        ` : '<span class="text-muted small">N/A</span>'}
                    </td>
                </tr>`;
        });
    } else {
        tableHtml = `<tr><td colspan="3" class="text-center text-muted py-4">No game entries found in the selected tab.</td></tr>`;
    }
    tbody.innerHTML = tableHtml;
}

function gatherSelectedModes() {
    const selectedModes = {};
    document.querySelectorAll("#gamesSelectionTbody tr[data-game]").forEach(row => {
        const gameSelectCheckbox = row.querySelector('.game-select-checkbox');
        if (gameSelectCheckbox?.checked) {
            const gameName = row.dataset.game;
            if (gameName) {
                const modalButton = row.querySelector('button[data-toggle="modal"]');
                const modalId = modalButton?.dataset.target;
                if (modalId) {
                    const modalElement = document.querySelector(modalId);
                    if (modalElement) {
                        const modeCheckboxes = modalElement.querySelectorAll(`input.allowed-mode-checkbox:checked`);
                        if (modeCheckboxes.length > 0) {
                            selectedModes[gameName.toLowerCase()] = Array.from(modeCheckboxes).map(cb => cb.value);
                        }
                    }
                }
            }
        }
    });
    return selectedModes;
}


/**
 * Handles the submission of the main challenge generation form.
 */
function handleChallengeFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const selectedMode = formData.get("group_mode") || 'single';
    const isAuthenticated = window.IS_AUTHENTICATED === true;
    const errorDisplay = document.getElementById('formErrorDisplay');
    const resultWrapper = document.getElementById("challengeResultWrapper");
    const resultDiv = document.getElementById("challengeResult");
    const submitButton = form.querySelector('button[type="submit"]');
    const shareBtn = document.getElementById("shareChallengeBtn");
    const shareResultDiv = document.getElementById('shareResult');
    const viewLocalBtn = document.getElementById('viewLocalChallengeBtn');

    // Clear previous errors and results
    showError(errorDisplay, null);
    if (resultWrapper) resultWrapper.style.display = "none";
    if (resultDiv) resultDiv.innerHTML = '';
    if (shareBtn) shareBtn.style.display = 'none';
    if (shareResultDiv) { shareResultDiv.style.display = 'none'; shareResultDiv.innerHTML = ''; }
    if (viewLocalBtn) viewLocalBtn.style.display = 'none';

    // Prevent submission if anonymous user selected multi
    if (selectedMode === 'multi' && !isAuthenticated) {
        showError(errorDisplay, "Login is required for Multigroup/Shared challenges.");
        const singleRadio = document.getElementById('modeSingleGroup');
        if (singleRadio) singleRadio.checked = true;
        updateIndexFormUI();
        return;
    }

    // Basic form validation
    if (!form.querySelector('input[name="selected_games"]:checked')) {
        showError(errorDisplay, "Please select at least one game."); return;
    }
    const selectedGameTab = formData.get("game_tab_id");
    if (!selectedGameTab) {
        showError(errorDisplay, "Please select a game source tab."); return;
    }

    // Process entries from LocalStorage
    let convertedEntries = [];
    try {
        const allEntries = JSON.parse(localStorage.getItem("localEntries") || "{}");
        const entries = allEntries[selectedGameTab] || [];
        if (entries.length === 0) throw new Error("No game entries found in the selected source tab.");
        convertedEntries = entries.map(entry => entry ? {
            id: entry.id, Spiel: String(entry.game || ''), Spielmodus: String(entry.gameMode || ''),
            Schwierigkeit: parseFloat(entry.difficulty) || 0, Spieleranzahl: parseInt(entry.numberOfPlayers) || 0
        } : null).filter(Boolean);
        if (convertedEntries.length === 0) throw new Error("Selected game entries are invalid or empty after processing.");
        formData.append("entries", JSON.stringify(convertedEntries));
    } catch (error) {
        showError(errorDisplay, `Error processing game entries: ${error.message}`); return;
    }

    // Append selected modes
    formData.append("selected_modes", JSON.stringify(gatherSelectedModes()));

    // UI Feedback
    // *** Use setLoading (now imported) ***
    setLoading(submitButton, true, 'Generating...');
    if (resultDiv) resultDiv.innerHTML = '<p class="text-info text-center p-3">Generating challenge, please wait...</p>';
    if (resultWrapper) resultWrapper.style.display = "block"; // Show wrapper for loading message


    // Call API
    fetch(window.generateChallengeUrl, { method: "POST", body: formData })
        .then(response => response.json().then(data => ({ ok: response.ok, status: response.status, data })))
        .then(({ ok, status, data }) => {
            if (!ok) throw new Error(data?.error || `Server responded with status ${status}`);
            if (!data.result || (!data.normal && !data.b2b)) throw new Error(data?.error || "Received an invalid response format from server.");

            // Display result
            if (resultDiv) resultDiv.innerHTML = data.result; // Inject HTML from backend
            if (resultWrapper) {
                // Use requestAnimationFrame to ensure display:block is applied before adding class
                requestAnimationFrame(() => {
                   resultWrapper.classList.add('visible');
                });
           }

            // Show relevant action buttons
            if (isAuthenticated) {
                window.currentChallengeData = data;
                if (shareBtn) shareBtn.style.display = "inline-block";
                if (viewLocalBtn) viewLocalBtn.style.display = 'none';
            } else {
                const localId = `local_${crypto.randomUUID()}`;
                const challengeToStore = {
                    localId: localId,
                    name: formData.get('challenge_name') || `Local Challenge ${new Date().toLocaleDateString()}`,
                    createdAt: new Date().toISOString(),
                    challengeData: { normal: data.normal, b2b: data.b2b },
                    penalty_info: data.penalty_info
                };
                const saved = saveChallengeToLocalStorage(challengeToStore);
                if (saved && viewLocalBtn) {
                    viewLocalBtn.href = `/challenge/${localId}`;
                    viewLocalBtn.style.display = 'inline-block';
                } else if (!saved) {
                    showError(errorDisplay,"Warning: Could not save challenge locally (storage might be full).");
                }
                 if (shareBtn) shareBtn.style.display = 'none';
            }
        })
        .catch(error => {
            console.error("Challenge Generation Error:", error);
            if (resultWrapper) resultWrapper.style.display = "block";
            requestAnimationFrame(() => {
                resultWrapper.classList.add('visible');
            });
            if (resultDiv) resultDiv.innerHTML = `<p class="text-danger text-center p-3">Failed to generate challenge: ${escapeHtml(error.message)}</p>`;
            showError(errorDisplay, "Failed to generate challenge: " + error.message);
        })
        .finally(() => {
            // *** Use setLoading (now imported) ***
            if (submitButton) setLoading(submitButton, false, 'Generate Challenge');
        });
}

// --- Initialization Function ---
export function initializeChallengeForm() {
    try { initGameStorage(); initPenaltiesLocalStorage(); }
    catch (e) { console.error("Error initializing storage:", e); }

    const challengeForm = document.getElementById("challengeForm");
    const gameSourceSelect = document.getElementById("gameSourceSelect");
    const penaltySourceSelect = document.getElementById("penaltySourceSelect");
    const modeRadios = document.querySelectorAll('input[name="group_mode"]');
    const penaltyCheckbox = document.getElementById('enablePenalties');

    if (gameSourceSelect) {
        populateGameSourceDropdown();
        gameSourceSelect.addEventListener('change', updateGameSelectionCard);
        setTimeout(updateGameSelectionCard, 0); // Use timeout to ensure options are populated
    } else { console.error("Game source dropdown missing."); }

    if (penaltySourceSelect) { populatePenaltySourceDropdown(); }
    else { console.error("Penalty source dropdown missing."); }

    modeRadios.forEach(radio => radio.addEventListener('change', updateIndexFormUI));
    if (penaltyCheckbox) { penaltyCheckbox.addEventListener('change', updateIndexFormUI); }
    else { console.warn("Penalty checkbox (#enablePenalties) missing."); }

    updateIndexFormUI(); // Initial UI setup

    if (challengeForm) { challengeForm.addEventListener('submit', handleChallengeFormSubmit); }
    else { console.error("Challenge form missing."); }
}
