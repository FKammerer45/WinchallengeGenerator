// static/js/challenge_generator/form.js
// (Previously static/js/challenge/challenge_form.js)

// Assuming these paths are correct after restructuring
import { getLocalTabs as getGameTabs, getLocalEntries, initLocalStorage as initGameStorage } from "../games/localStorageUtils.js";
import { getLocalPenaltyTabs, initPenaltiesLocalStorage } from "../penalties/penaltyLocalStorageUtils.js";
// Assuming local_storage.js is now in utils/
import { saveChallengeToLocalStorage } from '../utils/local_storage.js'; 
// Assuming helpers.js is in utils/
import { showError, escapeHtml, setLoading } from '../utils/helpers.js'; 

// Flag to prevent recursion during mode change for anonymous users
let isForcingMode = false;

/**
 * Updates UI elements on the index form based on selections 
 * (group mode, penalties enabled). Handles anonymous user restrictions.
 */
function updateIndexFormUI() {
    // ... (function content remains the same) ...
    if (isForcingMode) return; // Prevent loops

    // --- Mode Selection Logic ---
    const modeSelectedRadio = document.querySelector('input[name="group_mode"]:checked');
    const modeSelected = modeSelectedRadio?.value || 'single';
    const maxGroupsContainer = document.getElementById('maxGroupsContainer');
    const numPlayersLabel = document.getElementById('numPlayersLabel');
    const loginRequiredMsg = document.querySelector('.login-required-msg');
    // Ensure IS_AUTHENTICATED is set globally in your template 
    // (e.g., <script>window.IS_AUTHENTICATED = {{ current_user.is_authenticated|tojson }};</script> in index.html)
    const isAuthenticated = window.IS_AUTHENTICATED === true; 

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

/**
 * Populates the penalty source dropdown from local storage tabs.
 */
function populatePenaltySourceDropdown() {
    // ... (function content remains the same) ...
    const dropdown = document.getElementById("penaltySourceSelect");
    if (!dropdown) {
        console.error("Penalty source dropdown (#penaltySourceSelect) missing.");
        return;
    }
    dropdown.innerHTML = ''; // Clear previous options

    let defaultExists = false; // Declare before try

    try {
        const tabs = getLocalPenaltyTabs(); // Assumes this returns {} or null/undefined if none
        if (!tabs) {
             console.warn("No penalty tabs data found in local storage.");
             dropdown.innerHTML = '<option value="" disabled selected>No penalty tabs found</option>';
             return; // Exit if no tabs object
        }

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
                option.textContent = tabs[tabId]?.name || tabId; // Use name, fallback to ID
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
            // No tabs found at all (neither default nor others)
            dropdown.innerHTML = '<option value="" disabled selected>No penalty tabs found</option>';
        }

    } catch (error) {
        console.error("Error populating penalty source dropdown:", error);
        dropdown.innerHTML = '<option value="" disabled selected>Error loading tabs</option>';
    }
}

/**
 * Populates the game source dropdown from local storage tabs.
 */
function populateGameSourceDropdown() {
    // ... (function content remains the same) ...
    const dropdown = document.getElementById("gameSourceSelect");
     if (!dropdown) {
        console.error("Game source dropdown (#gameSourceSelect) missing.");
        return;
    }
    dropdown.innerHTML = ''; // Clear previous options

    let defaultExists = false; // Declare before try

    try {
        const tabs = getGameTabs(); // Assumes this returns {} or null/undefined if none
         if (!tabs) {
             console.warn("No game tabs data found in local storage.");
             dropdown.innerHTML = '<option value="" disabled selected>No game tabs found</option>';
             return; // Exit if no tabs object
        }

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
                option.textContent = tabs[tabId]?.name || tabId; // Use name, fallback to ID
                dropdown.appendChild(option);
            }
        }

        // Set dropdown value after adding all options
        if (defaultExists) {
            dropdown.value = "default";
        } else if (dropdown.options.length > 0) {
            dropdown.value = dropdown.options[0].value;
        } else {
             // No tabs found at all (neither default nor others)
            dropdown.innerHTML = '<option value="" disabled selected>No game tabs found</option>';
        }

    } catch (error) {
        console.error("Error populating game source dropdown:", error);
        dropdown.innerHTML = '<option value="" disabled selected>Error loading tabs</option>';
    }
}

/**
 * Updates the game selection table based on the selected game source tab.
 */
function updateGameSelectionCard() {
    const dropdown = document.getElementById("gameSourceSelect");
    const tbody = document.getElementById("gamesSelectionTbody");
    if (!dropdown || !tbody) { 
        console.error("Missing elements for game selection card (#gameSourceSelect or #gamesSelectionTbody)."); 
        return; 
    }

    const selectedTab = dropdown.value;
    if (!selectedTab) {
        tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-4">Select Game Source Tab above...</td></tr>`;
        return;
    }

    tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-3">Loading games...</td></tr>`;
    
    let entries = []; // Initialize as empty array
    try { 
        const allTabsData = getLocalEntries(selectedTab); 
        if (allTabsData && allTabsData.hasOwnProperty(selectedTab)) {
            const specificTabEntries = allTabsData[selectedTab]; 
            if (Array.isArray(specificTabEntries)) {
                entries = specificTabEntries; 
                console.log(`[updateGameSelectionCard] Found ${entries.length} entries for tab '${selectedTab}'.`); 
                if (entries.length > 0) {
                    // console.log("First entry structure:", JSON.stringify(entries[0])); 
                }
            } else {
                 console.warn(`[updateGameSelectionCard] Data for tab '${selectedTab}' is not an array. Received:`, specificTabEntries);
            }
        } else {
            console.warn(`[updateGameSelectionCard] No data found for tab '${selectedTab}' in the retrieved object. Received:`, allTabsData);
        }
    }
    catch(e) { 
        console.error(`[updateGameSelectionCard] Error getting/parsing local entries for tab '${selectedTab}':`, e); 
        tbody.innerHTML = `<tr><td colspan="3" class="text-danger text-center">Error loading games. Check console.</td></tr>`; 
        return; 
    }

    const grouped = {};
    entries.forEach(entry => {
        const gameName = (entry?.Spiel || entry?.game)?.trim(); 
        const gameMode = (entry?.Spielmodus || entry?.gameMode)?.trim(); 
        const weight = 1.0; 
        if (!gameName) { return; }
        if (!grouped[gameName]) { grouped[gameName] = { weight: weight, availableModes: new Set() }; }
        if (gameMode) { grouped[gameName].availableModes.add(gameMode); }
    });

    // console.log("[updateGameSelectionCard] Grouped game data:", JSON.stringify(grouped, null, 2)); 

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
            const escapedGameName = escapeHtml(gameName); 

            let modalBodyHtml = "";
            if (group.availableModes.length > 0) {
                group.availableModes.forEach((mode, i) => {
                    const modeCheckboxId = `mode-${safeGameNameId}-${index}-${i}`;
                    const escapedModeValue = mode.replace(/"/g, '&quot;'); 
                    const escapedModeLabel = escapeHtml(mode); 
                    // Use Bootstrap 4 Checkbox structure
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

            // Build table row using Bootstrap 4 modal attributes - REMOVED COMMENTS
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
                                    <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                                        <span aria-hidden="true">&times;</span>
                                    </button>
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
        tableHtml = `<tr><td colspan="3" class="text-center text-muted py-4">No valid game entries found to display.</td></tr>`;
    }
    
    tbody.innerHTML = tableHtml; 
}


/**
 * Gathers the selected modes for each checked game from the modals.
 * @returns {object} An object where keys are lowercase game names and values are arrays of selected modes.
 */
function gatherSelectedModes() {
    // ... (function content remains the same) ...
    const selectedModes = {};
    document.querySelectorAll("#gamesSelectionTbody tr[data-game]").forEach(row => {
        const gameSelectCheckbox = row.querySelector('.game-select-checkbox');
        if (gameSelectCheckbox?.checked) {
            const gameName = row.dataset.game;
            if (gameName) {
                // Find modal based on button's data-bs-target (Bootstrap 5)
                const modalButton = row.querySelector('button[data-bs-target]');
                const modalIdSelector = modalButton?.dataset.bsTarget; 
                if (modalIdSelector) {
                    // Ensure selector is valid (e.g., starts with #)
                    const modalElement = document.querySelector(modalIdSelector.startsWith('#') ? modalIdSelector : `#${modalIdSelector}`); 
                    if (modalElement) {
                        // Find checked mode checkboxes within this specific modal
                        const modeCheckboxes = modalElement.querySelectorAll(`input.allowed-mode-checkbox:checked`);
                        if (modeCheckboxes.length > 0) {
                            // Store modes under lowercase game name key
                            selectedModes[gameName.toLowerCase()] = Array.from(modeCheckboxes).map(cb => cb.value);
                        }
                    } else {
                         console.warn(`Modal element not found for selector: ${modalIdSelector}`);
                    }
                } 
            }
        }
    });
    return selectedModes;
}


/**
 * Handles the submission of the main challenge generation form.
 * Sends data to the backend API and displays the result or errors.
 */
function handleChallengeFormSubmit(event) {
    event.preventDefault(); // Prevent default form submission
    const form = event.target;
    const formData = new FormData(form); // Use FormData for easy access
    const selectedMode = formData.get("group_mode") || 'single';
    const isAuthenticated = window.IS_AUTHENTICATED === true; // Read global flag
    const errorDisplay = document.getElementById('formErrorDisplay');
    const resultWrapper = document.getElementById("challengeResultWrapper");
    const resultDiv = document.getElementById("challengeResult");
    const submitButton = form.querySelector('button[type="submit"]');
    const shareBtn = document.getElementById("shareChallengeBtn");
    const shareResultDiv = document.getElementById('shareResult');
    const viewLocalBtn = document.getElementById('viewLocalChallengeBtn');

    // --- Clear previous state ---
    showError(errorDisplay, null); // Clear previous errors
    if (resultWrapper) {
        resultWrapper.style.display = "none"; 
        resultWrapper.classList.remove('visible'); // Reset animation class
    }
    if (resultDiv) resultDiv.innerHTML = '';
    if (shareBtn) shareBtn.style.display = 'none';
    if (shareResultDiv) { shareResultDiv.style.display = 'none'; shareResultDiv.innerHTML = ''; }
    if (viewLocalBtn) viewLocalBtn.style.display = 'none';

    // --- Pre-submission Checks ---
    if (selectedMode === 'multi' && !isAuthenticated) {
        showError(errorDisplay, "Login is required for Multigroup/Shared challenges.");
        const singleRadio = document.getElementById('modeSingleGroup');
        if (singleRadio) singleRadio.checked = true; // Reset to single mode
        updateIndexFormUI(); // Update UI to reflect change
        return; // Stop submission
    }
    if (!form.querySelector('input[name="selected_games"]:checked')) {
        showError(errorDisplay, "Please select at least one game."); return;
    }
    const selectedGameTab = formData.get("game_tab_id"); // Get selected game source tab
    if (!selectedGameTab) {
        showError(errorDisplay, "Please select a game source tab."); return;
    }

    // --- Prepare Data for Backend ---
    // 1. Get game entries from selected tab in localStorage
    let convertedEntries = [];
    try {
        // --- Add logging and use identical logic ---
        console.log(`[Submit] Getting entries for selected tab: ${selectedGameTab}`); // DEBUG
        const allTabsData = getLocalEntries(selectedGameTab); 
        console.log("[Submit] Raw data received from getLocalEntries:", JSON.stringify(allTabsData)); // DEBUG

        let currentEntries = []; 
        // Use the same logic as in updateGameSelectionCard to extract entries
        if (allTabsData && allTabsData.hasOwnProperty(selectedGameTab)) {
            const specificTabEntries = allTabsData[selectedGameTab]; 
             console.log(`[Submit] Data for key '${selectedGameTab}':`, JSON.stringify(specificTabEntries)); // DEBUG
            if (Array.isArray(specificTabEntries)) {
                currentEntries = specificTabEntries;
                console.log(`[Submit] Successfully extracted ${currentEntries.length} entries.`); // DEBUG
            } else {
                 // Throw error if the property exists but isn't an array
                 console.error(`[Submit] Data for tab '${selectedGameTab}' is not an array.`); // Log as error
                 throw new Error(`Data for tab '${selectedGameTab}' is not an array.`);
            }
        } else {
             // Throw error if the main object or the specific tab key doesn't exist
             console.error(`[Submit] No data found for tab '${selectedGameTab}' in the retrieved object.`); // Log as error
             throw new Error(`No data found for tab '${selectedGameTab}' in the retrieved object.`);
        }
        // --- End modification ---


         if (currentEntries.length === 0) { // Check if the extracted array is empty
             throw new Error("No game entries found in the selected source tab.");
         }
        // Convert entries to the format expected by the Python backend
        convertedEntries = currentEntries.map(entry => entry ? {
            id: entry.id, // Pass ID if available/needed
            Spiel: String(entry.Spiel || entry.game || ''), // Use Spiel or game
            Spielmodus: String(entry.Spielmodus || entry.gameMode || ''), // Use Spielmodus or gameMode
            Schwierigkeit: parseFloat(entry.Schwierigkeit || entry.difficulty) || 0, // Use Schwierigkeit or difficulty
            Spieleranzahl: parseInt(entry.Spieleranzahl || entry.numberOfPlayers) || 0 // Use Spieleranzahl or numberOfPlayers
        } : null).filter(Boolean); // Filter out any null entries

        if (convertedEntries.length === 0) throw new Error("Selected game entries are invalid or empty after processing.");
        // Append the processed entries as a JSON string to FormData
        formData.append("entries", JSON.stringify(convertedEntries)); 
        console.log("[Submit] Appending converted entries to FormData."); // DEBUG

    } catch (error) {
        console.error("[Submit] Error processing game entries:", error); // DEBUG
        showError(errorDisplay, `Error processing game entries: ${error.message}`); 
        return; // Stop submission
    }

    // 2. Append selected modes as JSON string
    formData.append("selected_modes", JSON.stringify(gatherSelectedModes()));

    // --- UI Feedback & API Call ---
    setLoading(submitButton, true, 'Generating...'); // Show loading state
    if (resultDiv) resultDiv.innerHTML = '<p class="text-info text-center p-3">Generating challenge, please wait...</p>';
    if (resultWrapper) resultWrapper.style.display = "block"; // Show wrapper for loading message

    // Ensure the backend URL is correctly passed from Flask template
    const generateUrl = window.generateChallengeUrl || '/api/challenge/generate'; // Fallback URL

    console.log("[Submit] Sending fetch request to:", generateUrl); // DEBUG
    fetch(generateUrl, { method: "POST", body: formData })
        .then(response => response.json().then(data => ({ ok: response.ok, status: response.status, data })))
        .then(({ ok, status, data }) => {
            console.log("[Submit] Received response:", { ok, status, data }); // DEBUG
            if (!ok) { // Handle HTTP errors (4xx, 5xx)
                throw new Error(data?.error || `Server responded with status ${status}`);
            }
            // Validate expected data structure from backend
            if (!data.result || (!data.normal && !data.b2b)) { 
                throw new Error(data?.error || "Received an invalid response format from server.");
            }

            // --- Success: Display Result & Actions ---
            if (resultDiv) resultDiv.innerHTML = data.result; // Inject generated HTML
            if (resultWrapper) {
                // Use rAF to ensure display:block is rendered before adding class for transition
                requestAnimationFrame(() => { 
                   resultWrapper.classList.add('visible');
                });
            }

            // Show appropriate buttons based on login status and response
            if (isAuthenticated && data.share_options) { 
                window.currentChallengeData = data; // Store data for potential sharing
                if (shareBtn) shareBtn.style.display = "inline-block"; // Show Share button
                if (viewLocalBtn) viewLocalBtn.style.display = 'none';
            } else { // Anonymous user or no share options provided
                const localId = `local_${crypto.randomUUID()}`; // Generate unique local ID
                const challengeToStore = { // Prepare data for local storage
                    localId: localId,
                    name: formData.get('challenge_name') || `Local Challenge ${new Date().toLocaleDateString()}`,
                    createdAt: new Date().toISOString(),
                    challengeData: { normal: data.normal, b2b: data.b2b }, // Core challenge items
                    penalty_info: data.penalty_info // Include penalty info if generated
                };
                const saved = saveChallengeToLocalStorage(challengeToStore); // Save using utility
                if (saved && viewLocalBtn) {
                    // Construct URL correctly - assumes /challenge/<id> route exists
                    viewLocalBtn.href = `/challenge/${localId}`; 
                    viewLocalBtn.style.display = 'inline-block'; // Show View Local button
                } else if (!saved) {
                    // Warn user if local save failed
                    showError(errorDisplay,"Warning: Could not save challenge locally (storage might be full).");
                }
                if (shareBtn) shareBtn.style.display = 'none'; // Hide Share button for anon
            }
        })
        .catch(error => {
            // --- Error Handling ---
            console.error("Challenge Generation Fetch Error:", error);
            // Ensure wrapper is visible to show error message
            if (resultWrapper) resultWrapper.style.display = "block";
             requestAnimationFrame(() => {
                 if (resultWrapper) resultWrapper.classList.add('visible');
             });
            // Display error message safely
            if (resultDiv) resultDiv.innerHTML = `<p class="text-danger text-center p-3">Failed to generate challenge: ${escapeHtml(error.message)}</p>`;
            showError(errorDisplay, "Failed to generate challenge: " + error.message); // Show in dedicated error area too
        })
        .finally(() => {
            // --- Reset UI ---
            if (submitButton) setLoading(submitButton, false, 'Generate Challenge'); // Restore button state
        });
}


// --- Initialization Function ---
// This function sets up the event listeners and initial state for the generation form.
// It is NOT exported because it's called directly by the DOMContentLoaded listener below.
function initializeChallengeForm() {
    // ... (function content remains the same) ...
    console.log("Initializing challenge form script..."); // Log start

    // Initialize local storage utilities (safe to call multiple times)
    try { 
        initGameStorage(); 
        initPenaltiesLocalStorage(); 
    } catch (e) { 
        console.error("Error initializing storage:", e); 
        // Potentially show a user-facing error if storage is critical
    }

    // --- Get DOM Elements ---
    const challengeForm = document.getElementById("challengeForm");
    const gameSourceSelect = document.getElementById("gameSourceSelect");
    const penaltySourceSelect = document.getElementById("penaltySourceSelect");
    const modeRadios = document.querySelectorAll('input[name="group_mode"]');
    const penaltyCheckbox = document.getElementById('enablePenalties');
    const gameSelectionTbody = document.getElementById('gamesSelectionTbody'); // For event delegation

    // --- Setup Dropdowns and Initial Game Card ---
    if (gameSourceSelect) {
        populateGameSourceDropdown(); // Populate game tabs
        gameSourceSelect.addEventListener('change', updateGameSelectionCard); // Update card on change
        // Update card on initial load after dropdown is populated
        // Use setTimeout to allow dropdown rendering before updating card
        setTimeout(updateGameSelectionCard, 0); 
    } else { console.error("Required element missing: #gameSourceSelect"); }

    if (penaltySourceSelect) { 
        populatePenaltySourceDropdown(); // Populate penalty tabs
    } else { console.error("Required element missing: #penaltySourceSelect"); }

    // --- Setup Event Listeners for Form Controls ---
    if (modeRadios.length > 0) {
        modeRadios.forEach(radio => radio.addEventListener('change', updateIndexFormUI));
    } else { console.warn("Mode selection radios (input[name='group_mode']) missing."); }
    
    if (penaltyCheckbox) { 
        penaltyCheckbox.addEventListener('change', updateIndexFormUI); 
    } else { console.warn("Penalty checkbox (#enablePenalties) missing."); }

    // --- Setup Form Submission ---
    if (challengeForm) { 
        challengeForm.addEventListener('submit', handleChallengeFormSubmit); 
    } else { console.error("Required element missing: #challengeForm"); }

    // --- Setup Event Delegation for Dynamic Elements (Game Selection Table) ---
     if (gameSelectionTbody) {
         gameSelectionTbody.addEventListener('change', (event) => {
             // Handle clicks on game selection checkboxes
             if (event.target.classList.contains('game-select-checkbox')) {
                 const row = event.target.closest('tr');
                 if (!row) return;
                 const weightInput = row.querySelector('.game-weight-input');
                 const modesBtn = row.querySelector('.modes-btn');
                 const isChecked = event.target.checked;
                 // Enable/disable weight input and modes button based on checkbox
                 if(weightInput) weightInput.disabled = !isChecked;
                 if(modesBtn) modesBtn.disabled = !isChecked; // Or visually indicate disabled state
             } 
             // Add handling for mode checkboxes within modals if needed
             // else if (event.target.classList.contains('allowed-mode-checkbox')) { ... }
         });
     } else { console.error("Required element missing: #gamesSelectionTbody for event delegation."); }

     // --- Initial UI State ---
    updateIndexFormUI(); // Set initial visibility based on default form values

    console.log("Challenge form initialization complete."); // Log end
}


// --- Wait for DOM Ready and Initialize ---
// This ensures all HTML elements are loaded before the script tries to interact with them.
document.addEventListener('DOMContentLoaded', () => {
    // Pre-check: Ensure critical variables passed from Flask are defined
    if (typeof window.generateChallengeUrl === 'undefined') {
        console.error('CRITICAL ERROR: window.generateChallengeUrl is not defined. Check Flask template variable passing.');
        // Display a user-friendly error on the page
        const errorDisplay = document.getElementById('formErrorDisplay');
        if(errorDisplay) showError(errorDisplay, "Configuration error: Cannot generate challenges.");
        return; // Stop initialization
    }
     if (typeof window.IS_AUTHENTICATED === 'undefined') {
        console.error('CRITICAL ERROR: window.IS_AUTHENTICATED flag is not defined. Check Flask template variable passing.');
        // Display a user-friendly error or default to false? Defaulting might hide issues.
        const errorDisplay = document.getElementById('formErrorDisplay');
        if(errorDisplay) showError(errorDisplay, "Configuration error: Cannot determine user status.");
        return; // Stop initialization
    }

    // Call the main initialization function for the challenge form page
    initializeChallengeForm();
});
