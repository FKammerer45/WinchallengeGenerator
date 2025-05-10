// static/js/challenge_generator/form.js
// (Previously static/js/challenge/challenge_form.js)

// Assuming these paths are correct after restructuring
import { getLocalOnlyTabs as getGameTabs, getLocalOnlyEntries, initLocalStorage as initGameStorage } from "../games/localStorageUtils.js";
import { 
    initLocalStorage as initPenaltiesLocalStorage, // Use 'as' to rename if desired, or use initLocalStorage directly
    getLocalOnlyTabs as getLocalPenaltyTabs      // Use 'as' to rename if desired, or use getLocalOnlyTabs directly
} from "../penalties/penaltyLocalStorageUtils.js";// Assuming local_storage.js is now in utils/
import { saveChallengeToLocalStorage } from '../utils/local_storage.js';
// Assuming helpers.js is in utils/
import { showError, escapeHtml, setLoading } from '../utils/helpers.js';
import { ensureUserDefaultGameTabs } from '../games/gamesExtensions.js';
import { ensureUserDefaultPenaltyTabs } from '../penalties/penaltyExtensions.js';
import { apiFetch } from "../utils/api.js";
// Flag to prevent recursion during mode change for anonymous users
const selectedGames = new Set();
let isForcingMode = false;
const PAGE_SIZE = 10;        // how many games visible per click
let gamesShown = PAGE_SIZE;  // current slice size
window.indexPageGameTabs = { tabs: {}, entries: {} };
window.indexPagePenaltyTabs = { tabs: {}, entries: {} };
//  helper to re‑apply checks
function restoreChecked(checkedSet) {
    document.querySelectorAll('.game-select-checkbox').forEach(cb => {
        cb.checked = checkedSet.has(cb.value);
        cb.dispatchEvent(new Event('change'));  // keep weight inputs in sync
    });
}
function updateB2BDisplay(value) {
    const b2bOutput = document.getElementById('b2bValueDisplay');
    if (!b2bOutput) return; // Exit if output element not found

    const numericValue = parseInt(value, 10);
    let levelText = 'Medium'; // Default
    let levelClass = 'level-medium'; // Default

    if (numericValue === 0) {
        levelText = 'None';
        levelClass = 'level-none';
    } else if (numericValue >= 1 && numericValue <= 3) {
        levelText = 'Low';
        levelClass = 'level-low';
    } else if (numericValue >= 4 && numericValue <= 7) {
        levelText = 'Medium';
        levelClass = 'level-medium';
    } else if (numericValue >= 8) { // 8, 9, 10
        levelText = 'High';
        levelClass = 'level-high';
    }

    b2bOutput.textContent = levelText;
    // Reset classes first, then add the specific level class
    b2bOutput.className = 'range-value-display ' + levelClass;
}
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
    const dropdown = document.getElementById("gameSourceSelect");
    if (!dropdown) { console.error("Game source dropdown missing."); return; }
    dropdown.innerHTML = ''; let defaultExists = false;

    try {
        // *** Read from correct source based on login ***
        const isLoggedIn = window.IS_AUTHENTICATED === true;
        const tabs = isLoggedIn ? (window.indexPageGameTabs?.tabs || {}) : getGameTabs(); 
        // *** End Read Source ***

        if (!tabs || Object.keys(tabs).length === 0) {
            dropdown.innerHTML = '<option value="" disabled selected>No game tabs found</option>';
            return;
        }

        // Add default first if it exists
        if (tabs["default"]) {
            const option = document.createElement("option");
            option.value = "default";
            option.textContent = tabs["default"].name || "Default";
            dropdown.appendChild(option);
            defaultExists = true;
        }

        // Add other tabs, sorting by name
        Object.entries(tabs)
            .filter(([tabId]) => tabId !== 'default') // Exclude default
            .sort(([, tabA], [, tabB]) => (tabA.name || '').localeCompare(tabB.name || '')) // Sort by name
            .forEach(([tabId, tabData]) => {
                const option = document.createElement("option");
                option.value = tabId;
                option.textContent = tabData?.name || tabId;
                dropdown.appendChild(option);
            });

        // Set initial selection
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
        
        const isLoggedIn = window.IS_AUTHENTICATED === true;
        const sourceEntries = isLoggedIn ? (window.indexPageGameTabs?.entries || {}) : getLocalOnlyEntries(); // Use alias
       

        if (sourceEntries && sourceEntries.hasOwnProperty(selectedTab)) {
            const specificTabEntries = sourceEntries[selectedTab];
            if (Array.isArray(specificTabEntries)) { entries = specificTabEntries; }
            else { console.warn(`Data for tab '${selectedTab}' is not an array.`); }
        } else { console.warn(`No data found for tab '${selectedTab}'.`); }
    } catch (e) { console.error(`Error getting/parsing entries for tab '${selectedTab}':`, e); tbody.innerHTML = `<tr><td colspan="4" class="text-danger text-center">Error loading games.</td></tr>`; return; }


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
    let allModalsHtml = "";
    const gameNames = Object.keys(grouped).sort();
    gamesShown = Math.max(PAGE_SIZE, Math.min(gamesShown, gameNames.length));
    const visibleNames = gameNames.slice(0, gamesShown);

    if (visibleNames.length > 0) {
        visibleNames.forEach((gameName, index) => {
            const group = grouped[gameName];
            const weightVal = group.weight.toFixed(1);
            const safeGameNameId = gameName.replace(/[^a-zA-Z0-9_-]/g, '-');
            const gameCheckboxId = `game-${safeGameNameId}-${index}`;
            const modalId = `modesModal-${safeGameNameId}-${index}`;
            const modalLabelId = `modesModalLabel-${safeGameNameId}-${index}`; // Unique Label ID
            const escapedGameName = escapeHtml(gameName);

            // Generate table row HTML (button only, no modal div here)
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
                            <button type="button" class="btn btn-sm btn-outline-secondary modes-btn"
                                    data-toggle="modal"
                                    data-target="#${modalId}"
                                    title="Select Allowed Modes">
                                Modes (${group.availableModes.length}) <i class="bi bi-pencil-square ms-1"></i>
                            </button>
                        ` : '<span class="text-muted small">N/A</span>'}
                    </td>
                </tr>`;

            // --- MODIFICATION START: Generate Modal HTML separately ---
            if (group.availableModes.length > 0) {
                let modalBodyHtml = "";
                group.availableModes.forEach((mode, i) => {
                    const modeCheckboxId = `mode-${safeGameNameId}-${index}-${i}`;
                    const escapedModeValue = mode.replace(/"/g, '&quot;');
                    const escapedModeLabel = escapeHtml(mode);
                    modalBodyHtml += `
                        <div class="custom-control custom-checkbox mb-2">
                            <input class="custom-control-input allowed-mode-checkbox" type="checkbox"
                                   name="allowed_modes_${escapedGameName}[]" value="${escapedModeValue}" id="${modeCheckboxId}" checked>
                            <label class="custom-control-label" for="${modeCheckboxId}">${escapedModeLabel}</label>
                        </div>`;
                });

                // Append this modal's full HTML to the allModalsHtml string
                allModalsHtml += `
                    <div class="modal fade" id="${modalId}" tabindex="-1" role="dialog" aria-labelledby="${modalLabelId}" aria-hidden="true">
                      <div class="modal-dialog modal-dialog-centered" role="document">
                        <div class="modal-content">
                          <div class="modal-header">
                            <h5 class="modal-title" id="${modalLabelId}">${escapedGameName} - Allowed Modes</h5>
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
                    </div>`;
            }
            
        });
    } else {
        tableHtml = `<tr><td colspan="3" class="text-center text-muted py-4">No valid game entries found to display.</td></tr>`;
    }

    tbody.innerHTML = tableHtml;
    const modalsContainer = document.getElementById('gameModeModalsContainer');
    if (modalsContainer) {
        modalsContainer.innerHTML = allModalsHtml; 
    } else {
        console.error("Modal container '#gameModeModalsContainer' not found in index.html!");
    }
    tbody.querySelectorAll('.game-select-checkbox').forEach(cb => {
        cb.checked = selectedGames.has(cb.value); // Use the persistent Set
    });
    const moreBtn = document.getElementById("showMoreGamesBtn");
    const lessBtn = document.getElementById("showLessGamesBtn");
    const rowToggle = document.getElementById("showMoreGamesRow");

    if (rowToggle) {
        const moreNeeded = gameNames.length > gamesShown;
        const lessNeeded = gamesShown > PAGE_SIZE;
        rowToggle.classList.toggle("d-none", !moreNeeded && !lessNeeded);
        moreBtn?.classList.toggle("d-none", !moreNeeded);
        lessBtn?.classList.toggle("d-none", !lessNeeded);
    }
}


/**
 * Gathers the selected modes for each checked game from the modals.
 * @returns {object} An object where keys are lowercase game names and values are arrays of selected modes.
 */
function gatherSelectedModes() {
    const selectedModes = {};
    // Selects ALL rows, regardless of whether the game checkbox is checked
    document.querySelectorAll("#gamesSelectionTbody tr[data-game]").forEach(row => {
        const gameSelectCheckbox = row.querySelector('.game-select-checkbox');
        // --- POTENTIAL ISSUE: This check might be missing or incorrect ---
        // It should only gather modes for games where gameSelectCheckbox is checked
        // Let's assume for now it *is* correctly checking gameSelectCheckbox.checked
        if (gameSelectCheckbox?.checked) { // <<< ENSURE THIS CHECK IS PRESENT AND CORRECT
            const gameName = row.dataset.game; // Original case game name
            if (gameName) {
                const modalButton = row.querySelector('button[data-target]'); // Use data-target for BS4
                const modalIdSelector = modalButton?.dataset.target;
                if (modalIdSelector) {
                    const modalElement = document.querySelector(modalIdSelector); // Directly use selector
                    if (modalElement) {
                        const modeCheckboxes = modalElement.querySelectorAll(`input.allowed-mode-checkbox:checked`);
                        if (modeCheckboxes.length > 0) {
                             // --- KEY POINT: Uses original case gameName ---
                            selectedModes[gameName] = Array.from(modeCheckboxes).map(cb => cb.value);
                        }
                        // If no modes are checked for a selected game, the key might not be added.
                        // This is likely OK, as the backend intersection would result in empty allowed modes anyway.
                    }
                }
            }
        }
    });
    // Log added in previous step: console.log("[Submit] Modes gathered from UI:", JSON.stringify(selectedModes));
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

    const checkedGames = Array.from(selectedGames);

    // Replace whatever `selected_games` FormData had
    formData.delete('selected_games');
    checkedGames.forEach(g => formData.append('selected_games', g));

    // --- validations ---
    if (formData.get("group_mode") === 'multi' && !isAuthenticated) {
        showError(errorDisplay, "Login required for multigroup.");
        return updateIndexFormUI();
    }
    if (checkedGames.length === 0) {
        showError(errorDisplay, "Please select at least one game.");
        return;
    }
    if (!formData.get("game_tab_id")) {
        showError(errorDisplay, "Please select a game source tab.");
        return;
    }
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
        const allTabsData = getLocalOnlyEntries(selectedGameTab);
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
                    showError(errorDisplay, "Warning: Could not save challenge locally (storage might be full).");
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
async function initializeChallengeForm() {
    console.log("Initializing challenge form script...");

    // Init storages
    initGameStorage();
    initPenaltiesLocalStorage();
    const isLoggedIn = window.IS_AUTHENTICATED === true;
    const csrfToken = window.csrfToken; // Assumes this is set globally
    if (isLoggedIn && csrfToken) {
        console.log("User logged in, attempting to fetch saved tabs for index page...");
        const loadingPromises = [];

        // Fetch Game Tabs
        loadingPromises.push(
            apiFetch('/api/tabs/load', {}, csrfToken)
                .then(data => {
                    console.log("[Index Init] Game Tabs API Response:", data);
                    if (typeof data === 'object' && data !== null) {
                        // Populate game state
                        window.indexPageGameTabs.tabs = {};
                        window.indexPageGameTabs.entries = {};
                        for (const tabId in data) {
                            window.indexPageGameTabs.tabs[tabId] = { name: data[tabId]?.tab_name || `Tab ${tabId}` };
                            // Normalize entries on load here as well
                            const rawEntries = data[tabId]?.entries;
                            window.indexPageGameTabs.entries[tabId] = Array.isArray(rawEntries) ? rawEntries.map(e => ({
                                id: e.id || `local-${Date.now()}-${Math.random().toString(36).substring(2,7)}`,
                                game: e.game || e.Spiel || '',
                                gameMode: e.gameMode || e.Spielmodus || '',
                                difficulty: (e.difficulty !== undefined ? parseFloat(e.difficulty) : (e.Schwierigkeit !== undefined ? parseFloat(e.Schwierigkeit) : 1.0)).toFixed(1),
                                numberOfPlayers: e.numberOfPlayers !== undefined ? parseInt(e.numberOfPlayers) : (e.Spieleranzahl !== undefined ? parseInt(e.Spieleranzahl) : 1),
                                weight: e.weight !== undefined ? parseFloat(e.weight) : 1.0
                            })) : [];
                        }
                        console.log("[Index Init] Populated window.indexPageGameTabs");
                    } else { throw new Error("Invalid game tab data format"); }
                })
                .catch(err => {
                    console.error("Failed to load game tabs for index page:", err);
                    showFlash("Could not load your saved game tabs.", "warning");
                    // Keep local storage as fallback
                })
        );

        // Fetch Penalty Tabs
        loadingPromises.push(
            apiFetch('/api/penalties/load_tabs', {}, csrfToken)
                .then(data => {
                    console.log("[Index Init] Penalty Tabs API Response:", data);
                    if (typeof data === 'object' && data !== null) {
                        // Populate penalty state
                        window.indexPagePenaltyTabs.tabs = {};
                        window.indexPagePenaltyTabs.entries = {};
                         for (const tabId in data) {
                            window.indexPagePenaltyTabs.tabs[tabId] = { name: data[tabId]?.tab_name || `Penalty Tab ${tabId}` };
                            // Normalize entries on load
                            const rawEntries = data[tabId]?.penalties; // Key is 'penalties' here
                            window.indexPagePenaltyTabs.entries[tabId] = Array.isArray(rawEntries) ? rawEntries.map(p => ({
                                id: p.id || `local-p-${Date.now()}-${Math.random().toString(36).substring(2,7)}`,
                                name: p.name || "",
                                probability: p.probability !== undefined ? parseFloat(p.probability).toFixed(4) : '0.0000',
                                description: p.description || ""
                            })) : [];
                        }
                        console.log("[Index Init] Populated window.indexPagePenaltyTabs");
                    } else { throw new Error("Invalid penalty tab data format"); }
                })
                .catch(err => {
                    console.error("Failed to load penalty tabs for index page:", err);
                    showFlash("Could not load your saved penalty tabs.", "warning");
                    // Keep local storage as fallback
                })
        );

        // Wait for both fetches to complete (or fail)
        await Promise.all(loadingPromises);
        console.log("API tab loading finished for index page.");

    } else {
        console.log("User not logged in, index page will use local storage for tabs.");
        // Ensure state objects are empty if not logged in
        window.indexPageGameTabs = { tabs: {}, entries: {} };
        window.indexPagePenaltyTabs = { tabs: {}, entries: {} };
    }
    // Grab elements
    const challengeForm = document.getElementById("challengeForm");
    const gameSourceSelect = document.getElementById("gameSourceSelect");
    const penaltySourceSelect = document.getElementById("penaltySourceSelect");
    const modeRadios = document.querySelectorAll('input[name="group_mode"]');
    const penaltyCheckbox = document.getElementById('enablePenalties');
    const gameSelectionTbody = document.getElementById('gamesSelectionTbody');
    const selectAllBtn = document.getElementById("selectAllGamesBtn");
    const deselectAllBtn = document.getElementById("deselectAllGamesBtn");
    const moreBtn = document.getElementById("showMoreGamesBtn");
    const lessBtn = document.getElementById("showLessGamesBtn");

    // --- : B2B Slider Initialization ---
    const b2bSlider = document.getElementById('spinB2B');
    if (b2bSlider) {
        // Update display when slider value changes
        b2bSlider.addEventListener('input', (event) => {
            updateB2BDisplay(event.target.value);
        });
        // Set initial display state (will be called again below if DOMContentLoaded hasn't fired)
        updateB2BDisplay(b2bSlider.value);
    } else {
        console.warn("B2B slider element (#spinB2B) not found during init.");
    }

    // Populate dropdowns + initial card
    if (gameSourceSelect) {
        populateGameSourceDropdown(); // Reads from window.indexPageGameTabs if logged in
        gameSourceSelect.addEventListener('change', () => {
             gamesShown = PAGE_SIZE; selectedGames.clear();
             updateGameSelectionCard(); // Reads from window.indexPageGameTabs if logged in
        });
         updateGameSelectionCard(); // Initial population
    }

    if (penaltySourceSelect) {
        populatePenaltySourceDropdown();
    }

    // Standard UI hooks
    modeRadios.forEach(r => r.addEventListener('change', updateIndexFormUI));
    if (penaltyCheckbox) penaltyCheckbox.addEventListener('change', updateIndexFormUI);

    // Form submission
    if (challengeForm) challengeForm.addEventListener('submit', handleChallengeFormSubmit);

    if (selectAllBtn) {
        selectAllBtn.addEventListener("click", () => {
            // 1. Get all game names for the CURRENTLY selected source tab
            const dropdown = document.getElementById("gameSourceSelect");
            const selectedTab = dropdown?.value;
            let allGameNames = [];
            // Ensure tab is selected and tbody exists before proceeding
            if (selectedTab && gameSelectionTbody) {
                try {
                    // Reuse logic similar to updateGameSelectionCard to get all unique game names
                    const allTabsData = getGameEntries();
                    let entries = [];
                    if (allTabsData && allTabsData.hasOwnProperty(selectedTab)) {
                        const specificTabEntries = allTabsData[selectedTab];
                        if (Array.isArray(specificTabEntries)) {
                            entries = specificTabEntries;
                        }
                    }
                    // Group entries just to get unique game names
                    const grouped = {};
                    entries.forEach(entry => {
                        // Ensure entry and its properties exist before trimming
                        const gameName = (entry?.Spiel || entry?.game)?.trim();
                        if (gameName) {
                            // We only need the key to exist for unique names
                            if (!grouped[gameName]) { grouped[gameName] = true; }
                        }
                    });
                    allGameNames = Object.keys(grouped); // Get all unique names for this tab
                } catch (e) {
                    console.error("Error getting game names for Select All:", e);
                    // Optionally display an error to the user here
                    return; // Stop execution if we couldn't get the names
                }
            } else {
                console.warn("Cannot Select All: No game source selected or table body not found.");
                return; // Stop if no source selected or table doesn't exist
            }

            // 2. Add ALL game names for this source to the persistent Set
            allGameNames.forEach(name => selectedGames.add(name));

            // 3. Update only the VISIBLE checkboxes' checked state and trigger change event
            //    (The change event handler will take care of enabling/disabling inputs)
            gameSelectionTbody?.querySelectorAll(".game-select-checkbox")
                .forEach(cb => {
                    // Since we added all games to selectedGames, all visible ones should be checked.
                    if (!cb.checked) { // Only change if it's not already checked
                        cb.checked = true;
                        // Dispatch the change event so the other listener updates the UI (weight/modes)
                        const event = new Event('change', { bubbles: true });
                        cb.dispatchEvent(event);
                    }
                });
        });
    }

    // Deselect All Button Logic
    if (deselectAllBtn) {
        deselectAllBtn.addEventListener("click", () => {
            // 1. Clear the persistent Set entirely
            selectedGames.clear();

            // 2. Update only the VISIBLE checkboxes' checked state and trigger change event
            //    (The change event handler will take care of enabling/disabling inputs)
            gameSelectionTbody?.querySelectorAll(".game-select-checkbox")
                .forEach(cb => {
                    if (cb.checked) { // Only change if it's currently checked
                        cb.checked = false;
                        // Dispatch the change event so the other listener updates the UI (weight/modes)
                        const event = new Event('change', { bubbles: true });
                        cb.dispatchEvent(event);
                    }
                });
        });
    }
    // Show more / less
    if (moreBtn) moreBtn.addEventListener("click", () => {
        gamesShown += PAGE_SIZE;
        updateGameSelectionCard(); // State restored inside using selectedGames
    });
    if (lessBtn) lessBtn.addEventListener("click", () => {
        gamesShown = Math.max(PAGE_SIZE, gamesShown - PAGE_SIZE);
        updateGameSelectionCard(); // State restored inside using selectedGames
    });

    // Delegate checkboxes to enable/disable weight & modes button
    if (gameSelectionTbody) {
        gameSelectionTbody.addEventListener('change', event => {
            if (!event.target.classList.contains('game-select-checkbox')) return;

            const checkbox = event.target;
            const gameValue = checkbox.value;
            const row = checkbox.closest('tr');
            const weightInp = row.querySelector('.game-weight-input');
            const modesBtn = row.querySelector('.modes-btn');
            const isChecked = checkbox.checked;

            // Update the persistent state
            if (isChecked) {
                selectedGames.add(gameValue); // Add to Set
            } else {
                selectedGames.delete(gameValue); // Remove from Set
            }

            // Update related inputs/buttons in the same row
            if (weightInp) weightInp.disabled = !isChecked;
           
        });
    }

    // Final UI fix
    updateIndexFormUI();
    if (b2bSlider) updateB2BDisplay(b2bSlider.value);
    console.log("Challenge form initialization complete.");
}



// --- Wait for DOM Ready and Initialize ---
// This ensures all HTML elements are loaded before the script tries to interact with them.
document.addEventListener('DOMContentLoaded', async () => { // <-- Add async here

    if (typeof window.generateChallengeUrl === 'undefined') { console.error('CRITICAL ERROR: window.generateChallengeUrl is not defined.'); /* ... */ return; }
    if (typeof window.IS_AUTHENTICATED === 'undefined') { console.error('CRITICAL ERROR: window.IS_AUTHENTICATED flag is not defined.'); /* ... */ return; }
    if (typeof window.csrfToken === 'undefined') { console.error('CRITICAL ERROR: window.csrfToken is not defined.'); /* ... */ return; } // Added CSRF check


    if (!localStorage.getItem('defaults_loaded')) {
        console.log("Loading default game entries and penalties from DB...");
        try {
            // Wait for both loading functions to complete
            await ensureUserDefaultGameTabs();
            await ensureUserDefaultPenaltyTabs();  
            //await loadAndSaveGlobalPenaltyDefaults(); 

            // Only set the flag and reload if both succeed
            localStorage.setItem('defaults_loaded', 'true');
            console.log("Defaults loaded successfully. Reloading page.");
            window.location.reload();

        } catch (error) {
            // Log the error if any of the loading functions fail
            console.error("Failed to load defaults:", error);
            // Decide if you still want to set the flag or reload on failure
            // Maybe clear the flag if it partially succeeded?
            // localStorage.removeItem('defaults_loaded');
        }
    } else {
        console.log("Defaults already loaded.");
        // Potentially render initial state from existing localStorage here if needed
    }
    // Pre-check: Ensure critical variables passed from Flask are defined
    if (typeof window.generateChallengeUrl === 'undefined') {
        console.error('CRITICAL ERROR: window.generateChallengeUrl is not defined. Check Flask template variable passing.');
        // Display a user-friendly error on the page
        const errorDisplay = document.getElementById('formErrorDisplay');
        if (errorDisplay) showError(errorDisplay, "Configuration error: Cannot generate challenges.");
        return; // Stop initialization
    }
    if (typeof window.IS_AUTHENTICATED === 'undefined') {
        console.error('CRITICAL ERROR: window.IS_AUTHENTICATED flag is not defined. Check Flask template variable passing.');
        // Display a user-friendly error or default to false? Defaulting might hide issues.
        const errorDisplay = document.getElementById('formErrorDisplay');
        if (errorDisplay) showError(errorDisplay, "Configuration error: Cannot determine user status.");
        return; // Stop initialization
    }

    // Call the main initialization function for the challenge form page
    await initializeChallengeForm();
});
