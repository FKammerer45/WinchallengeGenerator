// static/js/challenge_generator/form.js
// (Previously static/js/challenge/challenge_form.js)

// Assuming these paths are correct after restructuring
import {
  getLocalOnlyTabs as getGameTabs,
  getLocalOnlyEntries,
  initLocalStorage as initGameStorage,
} from "../games/localStorageUtils.js";
import {
  initLocalStorage as initPenaltiesLocalStorage, // Use 'as' to rename if desired, or use initLocalStorage directly
  getLocalOnlyTabs as getLocalPenaltyTabs,
  getLocalOnlyEntries as getLocalPenaltyEntries, // Use 'as' to rename if desired, or use getLocalOnlyTabs directly
} from "../penalties/penaltyLocalStorageUtils.js"; // Assuming local_storage.js is now in utils/
import { saveChallengeToLocalStorage } from "../utils/local_storage.js";
// Assuming helpers.js is in utils/
import { showError, escapeHtml, setLoading } from "../utils/helpers.js";
import { ensureUserDefaultGameTabs } from "../games/gamesExtensions.js";
import { ensureUserDefaultPenaltyTabs } from "../penalties/penaltyExtensions.js";
import { apiFetch } from "../utils/api.js";
// Flag to prevent recursion during mode change for anonymous users
const selectedGames = new Set();
let isForcingMode = false;
const PAGE_SIZE = 10; // how many games visible per click
let gamesShown = PAGE_SIZE; // current slice size
window.indexPageGameTabs = { tabs: {}, entries: {} };
window.indexPagePenaltyTabs = { tabs: {}, entries: {} };
//  helper to re‑apply checks
function restoreChecked(checkedSet) {
  document.querySelectorAll(".game-select-checkbox").forEach((cb) => {
    cb.checked = checkedSet.has(cb.value);
    cb.dispatchEvent(new Event("change")); // keep weight inputs in sync
  });
}
function updateB2BDisplay(value) {
  const b2bOutput = document.getElementById("b2bValueDisplay");
  if (!b2bOutput) return; // Exit if output element not found

  const numericValue = parseInt(value, 10);
  let levelText = "Medium"; // Default
  let levelClass = "level-medium"; // Default

  if (numericValue === 0) {
    levelText = "None";
    levelClass = "level-none";
  } else if (numericValue >= 1 && numericValue <= 3) {
    levelText = "Low";
    levelClass = "level-low";
  } else if (numericValue >= 4 && numericValue <= 7) {
    levelText = "Medium";
    levelClass = "level-medium";
  } else if (numericValue >= 8) {
    // 8, 9, 10
    levelText = "High";
    levelClass = "level-high";
  }

  b2bOutput.textContent = levelText;
  // Reset classes first, then add the specific level class
  b2bOutput.className = "range-value-display " + levelClass;
}
/**
 * Updates UI elements on the index form based on selections
 * (group mode, penalties enabled). Handles anonymous user restrictions.
 */
function updateIndexFormUI() {
  // ... (function content remains the same) ...
  if (isForcingMode) return; // Prevent loops

  // --- Mode Selection Logic ---
  const modeSelectedRadio = document.querySelector(
    'input[name="group_mode"]:checked'
  );
  const modeSelected = modeSelectedRadio?.value || "single";
  const maxGroupsContainer = document.getElementById("maxGroupsContainer");
  const numPlayersLabel = document.getElementById("numPlayersLabel");
  const loginRequiredMsg = document.querySelector(".login-required-msg");
  // Ensure IS_AUTHENTICATED is set globally in your template
  // (e.g., <script>window.IS_AUTHENTICATED = {{ current_user.is_authenticated|tojson }};</script> in index.html)
  const isAuthenticated = window.IS_AUTHENTICATED === true;

  if (modeSelected === "multi" && !isAuthenticated) {
    isForcingMode = true;
    const singleRadio = document.getElementById("modeSingleGroup");
    if (singleRadio) singleRadio.checked = true;
    if (loginRequiredMsg) loginRequiredMsg.classList.remove("d-none");
    if (maxGroupsContainer) maxGroupsContainer.classList.add("d-none");
    if (numPlayersLabel) numPlayersLabel.textContent = "Number of Players:";
    isForcingMode = false;
    return; // Exit early
  } else {
    if (loginRequiredMsg) loginRequiredMsg.classList.add("d-none");
  }

  // Update UI based on the *final* selected mode
  const finalModeSelected =
    document.querySelector('input[name="group_mode"]:checked')?.value ||
    "single";
  if (maxGroupsContainer)
    maxGroupsContainer.classList.toggle(
      "d-none",
      finalModeSelected !== "multi"
    );
  if (numPlayersLabel)
    numPlayersLabel.textContent =
      finalModeSelected === "multi"
        ? "Number of Players per group:"
        : "Number of Players:";

  // --- Penalty Tab Logic ---
  const enablePenaltiesCheckbox = document.getElementById("enablePenalties");
  const penaltySourceContainer = document.getElementById(
    "penaltySourceContainer"
  );
  if (enablePenaltiesCheckbox && penaltySourceContainer) {
    penaltySourceContainer.classList.toggle(
      "d-none",
      !enablePenaltiesCheckbox.checked
    );
  }
}

/**
 * Populates the penalty source dropdown from local storage tabs.
 */
function populatePenaltySourceDropdown() {
  const dropdown = document.getElementById("penaltySourceSelect");
  if (!dropdown) {
    console.error("Penalty source dropdown (#penaltySourceSelect) missing.");
    return;
  }
  dropdown.innerHTML = ""; // Clear previous options
  let defaultExists = false;

  try {
    // *** MODIFICATION START: Choose data source based on login status ***
    const isLoggedIn = window.IS_AUTHENTICATED === true;
    const tabs = isLoggedIn
      ? window.indexPagePenaltyTabs?.tabs || {}
      : getLocalPenaltyTabs();
    // *** MODIFICATION END ***

    if (!tabs || Object.keys(tabs).length === 0) {
      // Check if tabs object is empty
      console.warn("No penalty tabs data found for dropdown.");
      dropdown.innerHTML =
        '<option value="" disabled selected>No penalty tabs found</option>';
      return;
    }

    // Ensure SYSTEM_DEFAULT_PENALTY_TABS is available globally if you intend to sort/prioritize them
    // For simplicity, this version will just add what's in 'tabs'
    // You can enhance with sorting like in populateGameSourceDropdown if needed

    // Add default option if it exists in the retrieved tabs
    // The key for default in penalty definitions is "default-all-penalties"
    const defaultPenaltyTabKey = "default-all-penalties"; // Or your actual key
    if (tabs[defaultPenaltyTabKey]) {
      const option = document.createElement("option");
      option.value = defaultPenaltyTabKey; // Use the key as value
      option.textContent =
        tabs[defaultPenaltyTabKey].name || "All Penalties (Default)";
      dropdown.appendChild(option);
      defaultExists = true;
    }

    // Add other tabs, sorting by name
    Object.entries(tabs)
      .filter(([tabId]) => tabId !== defaultPenaltyTabKey) // Exclude the default if already added
      .sort(([, tabA], [, tabB]) =>
        (tabA.name || "").localeCompare(tabB.name || "")
      ) // Sort by name
      .forEach(([tabId, tabData]) => {
        const option = document.createElement("option");
        option.value = tabId;
        option.textContent = tabData?.name || tabId;
        dropdown.appendChild(option);
      });

    // Set dropdown value after adding all options
    if (defaultExists) {
      dropdown.value = defaultPenaltyTabKey;
    } else if (dropdown.options.length > 0) {
      dropdown.value = dropdown.options[0].value;
    } else {
      dropdown.innerHTML =
        '<option value="" disabled selected>No penalty tabs found</option>';
    }
  } catch (error) {
    console.error("Error populating penalty source dropdown:", error);
    dropdown.innerHTML =
      '<option value="" disabled selected>Error loading tabs</option>';
  }
}

/**
 * Populates the game source dropdown from local storage tabs.
 */
function populateGameSourceDropdown() {
  const dropdown = document.getElementById("gameSourceSelect");
  if (!dropdown) {
    console.error("Game source dropdown missing.");
    return;
  }
  dropdown.innerHTML = "";
  let defaultExists = false;

  try {
    // *** Read from correct source based on login ***
    const isLoggedIn = window.IS_AUTHENTICATED === true;
    const tabs = isLoggedIn
      ? window.indexPageGameTabs?.tabs || {}
      : getGameTabs();
    // *** End Read Source ***

    if (!tabs || Object.keys(tabs).length === 0) {
      dropdown.innerHTML =
        '<option value="" disabled selected>No game tabs found</option>';
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
      .filter(([tabId]) => tabId !== "default") // Exclude default
      .sort(([, tabA], [, tabB]) =>
        (tabA.name || "").localeCompare(tabB.name || "")
      ) // Sort by name
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
      dropdown.innerHTML =
        '<option value="" disabled selected>No game tabs found</option>';
    }
  } catch (error) {
    console.error("Error populating game source dropdown:", error);
    dropdown.innerHTML =
      '<option value="" disabled selected>Error loading tabs</option>';
  }
}

/**
 * Updates the game selection table based on the selected game source tab.
 */
function updateGameSelectionCard() {
  const dropdown = document.getElementById("gameSourceSelect");
  const tbody = document.getElementById("gamesSelectionTbody");
  if (!dropdown || !tbody) {
    console.error(
      "Missing elements for game selection card (#gameSourceSelect or #gamesSelectionTbody)."
    );
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
    const sourceEntries = isLoggedIn
      ? window.indexPageGameTabs?.entries || {}
      : getLocalOnlyEntries(); // Use alias

    if (sourceEntries && sourceEntries.hasOwnProperty(selectedTab)) {
      const specificTabEntries = sourceEntries[selectedTab];
      if (Array.isArray(specificTabEntries)) {
        entries = specificTabEntries;
      } else {
        console.warn(`Data for tab '${selectedTab}' is not an array.`);
      }
    } else {
      console.warn("No data found for tab '%s'.", selectedTab);
    }
  } catch (e) {
    console.error("Error getting/parsing entries for tab '%s':", selectedTab, e);
    tbody.innerHTML = `<tr><td colspan="4" class="text-danger text-center">Error loading games.</td></tr>`;
    return;
  }

  const grouped = {};
  entries.forEach((entry) => {
    const gameName = (entry?.Spiel || entry?.game)?.trim();
    const gameMode = (entry?.Spielmodus || entry?.gameMode)?.trim();
    const weight = 1.0;
    if (!gameName) {
      return;
    }
    if (!grouped[gameName]) {
      grouped[gameName] = { weight: weight, availableModes: new Set() };
    }
    if (gameMode) {
      grouped[gameName].availableModes.add(gameMode);
    }
  });

  // console.log("[updateGameSelectionCard] Grouped game data:", JSON.stringify(grouped, null, 2));

  Object.keys(grouped).forEach(
    (key) =>
      (grouped[key].availableModes = Array.from(
        grouped[key].availableModes
      ).sort())
  );

  let tableHtml = "";
  let allModalsHtml = "";
  const gameNames = Object.keys(grouped).sort();
  gamesShown = Math.max(PAGE_SIZE, Math.min(gamesShown, gameNames.length));
  const visibleNames = gameNames.slice(0, gamesShown);

  if (visibleNames.length > 0) {
    visibleNames.forEach((gameName, index) => {
      const group = grouped[gameName];
      const weightVal = group.weight.toFixed(1);
      const safeGameNameId = gameName.replace(/[^a-zA-Z0-9_-]/g, "-");
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
                        ${
                          group.availableModes.length > 0
                            ? `
                            <button type="button" class="btn btn-sm btn-outline-secondary modes-btn"
                                    data-toggle="modal"
                                    data-target="#${modalId}"
                                    title="Select Allowed Modes">
                                Modes (${group.availableModes.length}) <i class="bi bi-pencil-square ms-1"></i>
                            </button>
                        `
                            : '<span class="text-muted small">N/A</span>'
                        }
                    </td>
                </tr>`;

      // --- MODIFICATION START: Generate Modal HTML separately ---
      if (group.availableModes.length > 0) {
        let modalBodyHtml = "";
        group.availableModes.forEach((mode, i) => {
          const modeCheckboxId = `mode-${safeGameNameId}-${index}-${i}`;
          const escapedModeValue = mode.replace(/"/g, "&quot;");
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
  const modalsContainer = document.getElementById("gameModeModalsContainer");
  if (modalsContainer) {
    modalsContainer.innerHTML = allModalsHtml;
  } else {
    console.error(
      "Modal container '#gameModeModalsContainer' not found in index.html!"
    );
  }
  tbody.querySelectorAll(".game-select-checkbox").forEach((cb) => {
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
  document
    .querySelectorAll("#gamesSelectionTbody tr[data-game]")
    .forEach((row) => {
      const gameSelectCheckbox = row.querySelector(".game-select-checkbox");
      // --- POTENTIAL ISSUE: This check might be missing or incorrect ---
      // It should only gather modes for games where gameSelectCheckbox is checked
      // Let's assume for now it *is* correctly checking gameSelectCheckbox.checked
      if (gameSelectCheckbox?.checked) {
        // <<< ENSURE THIS CHECK IS PRESENT AND CORRECT
        const gameName = row.dataset.game; // Original case game name
        if (gameName) {
          const modalButton = row.querySelector("button[data-target]"); // Use data-target for BS4
          const modalIdSelector = modalButton?.dataset.target;
          if (modalIdSelector) {
            const modalElement = document.querySelector(modalIdSelector); // Directly use selector
            if (modalElement) {
              const modeCheckboxes = modalElement.querySelectorAll(
                `input.allowed-mode-checkbox:checked`
              );
              if (modeCheckboxes.length > 0) {
                // --- KEY POINT: Uses original case gameName ---
                selectedModes[gameName] = Array.from(modeCheckboxes).map(
                  (cb) => cb.value
                );
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
  event.preventDefault();

  // Hide custom challenge builder if it's open
  const customBuilderWrapper = document.getElementById("customChallengeBuilderWrapper");
  if (customBuilderWrapper) {
    customBuilderWrapper.style.display = "none";
  }

  // Helper function for fallback UUID
  function generateSimpleUUID() {
    return 'xxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  const form = event.target;
  const formData = new FormData(form);
  const selectedMode = formData.get("group_mode") || "single";
  const isAuthenticated = window.IS_AUTHENTICATED === true;
  const errorDisplay = document.getElementById("formErrorDisplay");
  const resultWrapper = document.getElementById("challengeResultWrapper");
  const resultDiv = document.getElementById("challengeResult");
  const submitButton = form.querySelector('button[type="submit"]');
  const shareBtn = document.getElementById("shareChallengeBtn");
  const shareResultDiv = document.getElementById("shareResult");
  const viewLocalBtn = document.getElementById("viewLocalChallengeBtn");

  const checkedGames = Array.from(selectedGames);
  formData.delete("selected_games");
  checkedGames.forEach((g) => formData.append("selected_games", g));

  if (formData.get("group_mode") === "multi" && !isAuthenticated) {
    showError(errorDisplay, "Login required for multigroup.");
    updateIndexFormUI(); // Call the UI update function
    return;
  }
  if (checkedGames.length === 0) {
    showError(errorDisplay, "Please select at least one game.");
    return;
  }
  if (!formData.get("game_tab_id")) {
    showError(errorDisplay, "Please select a game source tab.");
    return;
  }

  // --- NEW CLIENT-SIDE VALIDATION: Player Count vs Selected Games ---
  const selectedPlayerCount = parseInt(formData.get("num_players"), 10);
  const selectedGameTabForValidation = formData.get("game_tab_id");
  let allGameEntriesForValidation = [];

  try {
      const allGameTabsDataForValidation = isAuthenticated
          ? window.indexPageGameTabs?.entries || {}
          : getLocalOnlyEntries();

      if (allGameTabsDataForValidation && allGameTabsDataForValidation.hasOwnProperty(selectedGameTabForValidation)) {
          const specificTabEntriesForValidation = allGameTabsDataForValidation[selectedGameTabForValidation];
          if (Array.isArray(specificTabEntriesForValidation)) {
              allGameEntriesForValidation = specificTabEntriesForValidation;
          }
      }
  } catch (error) {
      console.error("[Submit Form] Error fetching game entries for client-side validation:", error);
      // Continue without client-side validation if data fetching fails, rely on backend
  }

  const compatibleGamesSelected = checkedGames.some(gameName => {
      // Find entries for this selected game name in the current tab
      const gameEntries = allGameEntriesForValidation.filter(entry =>
          (entry?.Spiel || entry?.game)?.trim() === gameName
      );
      // Check if any of these entries support the selected player count
      return gameEntries.some(entry =>
          parseInt(entry?.Spieleranzahl || entry?.numberOfPlayers) >= selectedPlayerCount
      );
  });

  if (!compatibleGamesSelected) {
      const userMessage = `Challenge generation failed: You selected ${selectedPlayerCount} players, but none of the selected games/modes support this player count. Please select games that fit your player count or reduce the player count.`;
      showError(errorDisplay, userMessage);
      // Do NOT proceed with fetch if client-side validation fails
      setLoading(submitButton, false, "Generate Challenge");
      if (resultWrapper) resultWrapper.style.display = "none"; // Hide previous result if any
      if (resultDiv) resultDiv.innerHTML = "";
      return;
  }
  // --- END NEW CLIENT-SIDE VALIDATION ---


  showError(errorDisplay, null); // Clear previous errors if validation passed
  if (resultWrapper) {
    resultWrapper.style.display = "none";
    resultWrapper.classList.remove("visible");
  }
  if (resultDiv) resultDiv.innerHTML = "";

  if (shareBtn) {
    shareBtn.style.display = "none";
    shareBtn.disabled = true;
    shareBtn.classList.remove("btn-secondary");
    shareBtn.classList.add("btn-primary");
    const shareBtnText = shareBtn.querySelector("span:not(.spinner-border-sm)");
    if (shareBtnText) shareBtnText.textContent = "Share Challenge";
    shareBtn.title = "Share this generated challenge";
  }
  if (shareResultDiv) {
    shareResultDiv.style.display = "none";
    shareResultDiv.innerHTML = "";
  }
  if (viewLocalBtn) viewLocalBtn.style.display = "none";

  const selectedGameTab = formData.get("game_tab_id");
  if (!selectedGameTab) {
    showError(errorDisplay, "Please select a game source tab.");
    return;
  }

  let convertedGameEntries = [];
  try {
    const allGameTabsData = isAuthenticated
      ? window.indexPageGameTabs?.entries || {}
      : getLocalOnlyEntries();
    let currentGameEntries = [];
    if (allGameTabsData && allGameTabsData.hasOwnProperty(selectedGameTab)) {
      const specificTabEntries = allGameTabsData[selectedGameTab];
      if (Array.isArray(specificTabEntries)) {
        currentGameEntries = specificTabEntries;
      } else {
        throw new Error(
          `Game data for tab '${selectedGameTab}' is not an array.`
        );
      }
    } else {
      throw new Error(`No game data found for tab '${selectedGameTab}'.`);
    }

    if (currentGameEntries.length === 0) {
      throw new Error("No game entries found in the selected source tab.");
    }
    convertedGameEntries = currentGameEntries
      .map((entry) =>
        entry
          ? {
              id: entry.id,
              Spiel: String(entry.Spiel || entry.game || ""),
              Spielmodus: String(entry.Spielmodus || entry.gameMode || ""),
              Schwierigkeit:
                parseFloat(entry.Schwierigkeit || entry.difficulty) || 0,
              Spieleranzahl:
                parseInt(entry.Spieleranzahl || entry.numberOfPlayers) || 0,
            }
          : null
      )
      .filter(Boolean);

    if (convertedGameEntries.length === 0)
      throw new Error(
        "Selected game entries are invalid or empty after processing."
      );
    formData.append("entries", JSON.stringify(convertedGameEntries));
  } catch (error) {
    console.error("[Submit Form] Error processing game entries:", error);
    showError(errorDisplay, `Error processing game entries: ${error.message}`);
    return;
  }

  formData.append("selected_modes", JSON.stringify(gatherSelectedModes()));

  // --- MODIFIED PENALTY HANDLING ---
  const usePenalties = formData.get("use_penalties") === "on";
  if (usePenalties) {
    const penaltyTabId = formData.get("penalty_tab_id");
    const penaltySourceSelect = document.getElementById("penaltySourceSelect");
    const penaltyTabName = penaltySourceSelect
      ? penaltySourceSelect.options[penaltySourceSelect.selectedIndex]?.text
      : "Unknown Tab";

    if (!penaltyTabId) {
      showError(
        errorDisplay,
        "Please select a penalty source tab when penalties are enabled."
      );
      setLoading(submitButton, false, "Generate Challenge"); // Re-enable generate button
      return;
    }

    let penaltyEntriesList = [];
    try {
      // window.indexPagePenaltyTabs should be populated by initializeChallengeForm
      if (
        isAuthenticated &&
        window.indexPagePenaltyTabs &&
        window.indexPagePenaltyTabs.entries
      ) {
        penaltyEntriesList =
          window.indexPagePenaltyTabs.entries[penaltyTabId] || [];
      } else {
        // Anonymous user
        const localPenaltyData = getLocalPenaltyEntries();
        penaltyEntriesList = localPenaltyData[penaltyTabId] || [];
      }

      if (!Array.isArray(penaltyEntriesList)) {
        console.warn(
          `Penalty entries for tab ${penaltyTabId} is not an array, defaulting to empty.`
        );
        penaltyEntriesList = [];
      }

      // Filter out penalties with zero or invalid probability before sending to /generate
      const validPenaltyEntries = penaltyEntriesList.filter((p) => {
        const prob =
          p && p.probability !== undefined ? parseFloat(p.probability) : NaN;
        return !isNaN(prob) && prob > 0;
      });

      if (validPenaltyEntries.length === 0 && penaltyEntriesList.length > 0) {
        // If original list had items but all were invalid
        showError(
          errorDisplay,
          `The selected penalty tab "${escapeHtml(
            penaltyTabName
          )}" has no penalties with a probability greater than 0. Please add some or choose a different tab.`
        );
        setLoading(submitButton, false, "Generate Challenge"); // Re-enable generate button
        return;
      }
      // It's okay to send an empty 'penalties' array if the tab itself was empty or only had zero-prob items.
      // The backend /share endpoint will handle if penalty_info is null or has empty penalties.

      const penaltyInfoPayload = {
        source_tab_id: penaltyTabId,
        source_tab_name: penaltyTabName,
        penalties: validPenaltyEntries, // Send only valid entries
      };
      formData.append("penalty_info_full", JSON.stringify(penaltyInfoPayload));
      console.log(
        "[Submit Form] Appending full penalty_info:",
        penaltyInfoPayload
      );
    } catch (e) {
      showError(errorDisplay, `Error processing penalty entries: ${e.message}`);
      setLoading(submitButton, false, "Generate Challenge"); // Re-enable generate button
      return;
    }
  } else {
    formData.delete("penalty_info_full");
    formData.delete("penalty_tab_id");
  }
  // --- END MODIFICATION FOR PENALTIES ---

  setLoading(submitButton, true, "Generating...");
  if (resultDiv)
    resultDiv.innerHTML =
      '<p class="text-info text-center p-3">Generating challenge, please wait...</p>';
  if (resultWrapper) resultWrapper.style.display = "block";

  const generateUrl = window.generateChallengeUrl || "/api/challenge/generate";

  fetch(generateUrl, { method: "POST", body: formData })
    .then((response) =>
      response
        .json()
        .then((data) => ({ ok: response.ok, status: response.status, data }))
    )
    .then(({ ok, status, data }) => {
      if (!ok) {
        throw new Error(
          data?.error || `Server responded with status ${status}`
        );
      }
      if (!data.result || (!data.normal && !data.b2b)) {
        throw new Error(
          data?.error || "Received an invalid response format from server."
        );
      }

      if (resultDiv) resultDiv.innerHTML = data.result;
      if (resultWrapper) {
        requestAnimationFrame(() => {
          resultWrapper.classList.add("visible");
        });
      }

      // Store full data (including potentially full penalty_info) for sharing
      window.currentChallengeData = data;

      console.log("[FormJS] In handleChallengeFormSubmit: isAuthenticated =", isAuthenticated, "data.share_options =", data.share_options); // DEBUG LOG

      if (isAuthenticated && data.share_options) {
        if (shareBtn) {
          shareBtn.style.display = "inline-block";
          shareBtn.disabled = false; // Explicitly enable
          shareBtn.classList.remove("btn-secondary", "disabled"); // Remove any potentially disabling classes
          shareBtn.classList.add("btn-primary"); // Ensure primary styling
          shareBtn.removeAttribute("aria-disabled"); // Ensure accessibility state is correct
          console.log("shareChallengeBtn IS being enabled and styled primary in form.js"); // UPDATED DEBUG LOG

          const shareBtnText = shareBtn.querySelector(
            "span:not(.spinner-border-sm)"
          );
          // Ensure the icon is also updated if it was changed from the default
          const shareBtnIcon = shareBtn.querySelector("i.bi");
          if (shareBtnText) shareBtnText.textContent = "Accept Challenge";
          if (shareBtnIcon) { // Change icon to suit "Accept Challenge"
            shareBtnIcon.classList.remove("bi-share-fill");
            shareBtnIcon.classList.add("bi-check-circle-fill");
          }
          shareBtn.title = "Accept and share this generated challenge"; // Update title
        }
        if (viewLocalBtn) viewLocalBtn.style.display = "none";
      } else {
        let uuid;
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
          uuid = crypto.randomUUID();
        } else {
          // Fallback for non-secure contexts or older browsers
          console.warn("crypto.randomUUID not available, using fallback UUID generator.");
          uuid = generateSimpleUUID();
        }
        const localId = `local_${uuid}`;
        const challengeToStore = {
          localId: localId,
          name:
            formData.get("challenge_name") ||
            `Local Challenge ${new Date().toLocaleDateString()}`,
          createdAt: new Date().toISOString(),
          challengeData: { normal: data.normal, b2b: data.b2b },
          // For local save, store the penalty_info as received from /generate
          penalty_info: data.penalty_info,
        };
        const saved = saveChallengeToLocalStorage(challengeToStore);
        if (saved && viewLocalBtn) {
          viewLocalBtn.href = `/challenge/${localId}`;
          viewLocalBtn.style.display = "inline-block";
        } else if (!saved) {
          showError(
            errorDisplay,
            "Warning: Could not save challenge locally (storage might be full)."
          );
        }
        if (shareBtn) shareBtn.style.display = "none";
      }
    })
    .catch((error) => {
      console.error("Challenge Generation Fetch Error:", error); // error object is fine here
      if (resultWrapper) resultWrapper.style.display = "block";
      requestAnimationFrame(() => {
        if (resultWrapper) resultWrapper.classList.add("visible");
      });

      let userMessage = "Failed to generate challenge. Please try again."; // Default generic message
      const specificErrorMatch = error.message.match(/^No games found that support (\d+) players\.$/);

      if (specificErrorMatch) {
          const playerCount = specificErrorMatch[1];
          userMessage = `Challenge generation failed: You selected ${playerCount} players, but none of the selected games/modes support this player count. Please select games that fit your player count or reduce the player count.`;
      } else {
          // Use the generic error message from the backend if available, otherwise the default
          userMessage = `Failed to generate challenge: ${error.message}`; // Raw error message for showError
      }


      if (resultDiv)
        resultDiv.innerHTML = `<p class="text-danger text-center p-3">${escapeHtml(userMessage)}</p>`; // Escape for innerHTML
      showError(errorDisplay, userMessage); // showError likely handles its own escaping or is textContent based
    })
    .finally(() => {
      if (submitButton) setLoading(submitButton, false, "Generate Challenge");
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
    console.log(
      "User logged in, attempting to fetch saved tabs for index page..."
    );
    const loadingPromises = [];

    // Fetch Game Tabs
    loadingPromises.push(
      apiFetch("/api/tabs/load", {}, csrfToken)
        .then((data) => {
          console.log("[Index Init] Game Tabs API Response:", data);
          if (typeof data === "object" && data !== null) {
            // Populate game state
            window.indexPageGameTabs.tabs = {};
            window.indexPageGameTabs.entries = {};
            for (const tabId in data) {
              window.indexPageGameTabs.tabs[tabId] = {
                name: data[tabId]?.tab_name || `Tab ${tabId}`,
              };
              // Normalize entries on load here as well
              const rawEntries = data[tabId]?.entries;
              window.indexPageGameTabs.entries[tabId] = Array.isArray(
                rawEntries
              )
                ? rawEntries.map((e) => ({
                    id:
                      e.id ||
                      `local-${Date.now()}-${Math.random()
                        .toString(36)
                        .substring(2, 7)}`,
                    game: e.game || e.Spiel || "",
                    gameMode: e.gameMode || e.Spielmodus || "",
                    difficulty: (e.difficulty !== undefined
                      ? parseFloat(e.difficulty)
                      : e.Schwierigkeit !== undefined
                      ? parseFloat(e.Schwierigkeit)
                      : 1.0
                    ).toFixed(1),
                    numberOfPlayers:
                      e.numberOfPlayers !== undefined
                        ? parseInt(e.numberOfPlayers)
                        : e.Spieleranzahl !== undefined
                        ? parseInt(e.Spieleranzahl)
                        : 1,
                    weight: e.weight !== undefined ? parseFloat(e.weight) : 1.0,
                  }))
                : [];
            }
            console.log("[Index Init] Populated window.indexPageGameTabs");
          } else {
            throw new Error("Invalid game tab data format");
          }
        })
        .catch((err) => {
          console.error("Failed to load game tabs for index page:", err);
          showFlash("Could not load your saved game tabs.", "warning");
          // Keep local storage as fallback
        })
    );

    // Fetch Penalty Tabs
    loadingPromises.push(
      apiFetch("/api/penalties/load_tabs", {}, csrfToken)
        .then((data) => {
          console.log("[Index Init] Penalty Tabs API Response:", data);
          if (typeof data === "object" && data !== null) {
            // Populate penalty state
            window.indexPagePenaltyTabs.tabs = {};
            window.indexPagePenaltyTabs.entries = {};
            for (const tabId in data) {
              window.indexPagePenaltyTabs.tabs[tabId] = {
                name: data[tabId]?.tab_name || `Penalty Tab ${tabId}`,
              };
              // Normalize entries on load
              const rawEntries = data[tabId]?.penalties; // Key is 'penalties' here
              window.indexPagePenaltyTabs.entries[tabId] = Array.isArray(
                rawEntries
              )
                ? rawEntries.map((p) => ({
                    id:
                      p.id ||
                      `local-p-${Date.now()}-${Math.random()
                        .toString(36)
                        .substring(2, 7)}`,
                    name: p.name || "",
                    probability:
                      p.probability !== undefined
                        ? parseFloat(p.probability).toFixed(4)
                        : "0.0000",
                    description: p.description || "",
                  }))
                : [];
            }
            console.log("[Index Init] Populated window.indexPagePenaltyTabs");
          } else {
            throw new Error("Invalid penalty tab data format");
          }
        })
        .catch((err) => {
          console.error("Failed to load penalty tabs for index page:", err);
          showFlash("Could not load your saved penalty tabs.", "warning");
          // Keep local storage as fallback
        })
    );

    // Wait for both fetches to complete (or fail)
    await Promise.all(loadingPromises);
    console.log("API tab loading finished for index page.");
  } else {
    console.log(
      "User not logged in, index page will use local storage for tabs."
    );
    // Ensure state objects are empty if not logged in
    window.indexPageGameTabs = { tabs: {}, entries: {} };
    window.indexPagePenaltyTabs = { tabs: {}, entries: {} };
  }
  // Grab elements
  const challengeForm = document.getElementById("challengeForm");
  const gameSourceSelect = document.getElementById("gameSourceSelect");
  const penaltySourceSelect = document.getElementById("penaltySourceSelect");
  const modeRadios = document.querySelectorAll('input[name="group_mode"]');
  const penaltyCheckbox = document.getElementById("enablePenalties");
  const gameSelectionTbody = document.getElementById("gamesSelectionTbody");
  const selectAllBtn = document.getElementById("selectAllGamesBtn");
  const deselectAllBtn = document.getElementById("deselectAllGamesBtn");
  const moreBtn = document.getElementById("showMoreGamesBtn");
  const lessBtn = document.getElementById("showLessGamesBtn");

  // --- : B2B Slider Initialization ---
  const b2bSlider = document.getElementById("spinB2B");
  if (b2bSlider) {
    // Update display when slider value changes
    b2bSlider.addEventListener("input", (event) => {
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
    gameSourceSelect.addEventListener("change", () => {
      gamesShown = PAGE_SIZE;
      selectedGames.clear();
      updateGameSelectionCard(); // Reads from window.indexPageGameTabs if logged in
    });
    updateGameSelectionCard(); // Initial population
  }

  if (penaltySourceSelect) {
    populatePenaltySourceDropdown();
  }

  // Standard UI hooks
  modeRadios.forEach((r) => r.addEventListener("change", updateIndexFormUI));
  if (penaltyCheckbox)
    penaltyCheckbox.addEventListener("change", updateIndexFormUI);

  // Form submission
  if (challengeForm)
    challengeForm.addEventListener("submit", handleChallengeFormSubmit);

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
          const allTabsData = getLocalOnlyEntries();
          let entries = [];
          if (allTabsData && allTabsData.hasOwnProperty(selectedTab)) {
            const specificTabEntries = allTabsData[selectedTab];
            if (Array.isArray(specificTabEntries)) {
              entries = specificTabEntries;
            }
          }
          // Group entries just to get unique game names
          const grouped = {};
          entries.forEach((entry) => {
            // Ensure entry and its properties exist before trimming
            const gameName = (entry?.Spiel || entry?.game)?.trim();
            if (gameName) {
              // We only need the key to exist for unique names
              if (!grouped[gameName]) {
                grouped[gameName] = true;
              }
            }
          });
          allGameNames = Object.keys(grouped); // Get all unique names for this tab
        } catch (e) {
          console.error("Error getting game names for Select All:", e);
          // Optionally display an error to the user here
          return; // Stop execution if we couldn't get the names
        }
      } else {
        console.warn(
          "Cannot Select All: No game source selected or table body not found."
        );
        return; // Stop if no source selected or table doesn't exist
      }

      // 2. Add ALL game names for this source to the persistent Set
      allGameNames.forEach((name) => selectedGames.add(name));

      // 3. Update only the VISIBLE checkboxes' checked state and trigger change event
      //    (The change event handler will take care of enabling/disabling inputs)
      gameSelectionTbody
        ?.querySelectorAll(".game-select-checkbox")
        .forEach((cb) => {
          // Since we added all games to selectedGames, all visible ones should be checked.
          if (!cb.checked) {
            // Only change if it's not already checked
            cb.checked = true;
            // Dispatch the change event so the other listener updates the UI (weight/modes)
            const event = new Event("change", { bubbles: true });
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
      gameSelectionTbody
        ?.querySelectorAll(".game-select-checkbox")
        .forEach((cb) => {
          if (cb.checked) {
            // Only change if it's currently checked
            cb.checked = false;
            // Dispatch the change event so the other listener updates the UI (weight/modes)
            const event = new Event("change", { bubbles: true });
            cb.dispatchEvent(event);
          }
        });
    });
  }
  // Show more / less
  if (moreBtn)
    moreBtn.addEventListener("click", () => {
      gamesShown += PAGE_SIZE;
      updateGameSelectionCard(); // State restored inside using selectedGames
    });
  if (lessBtn)
    lessBtn.addEventListener("click", () => {
      gamesShown = Math.max(PAGE_SIZE, gamesShown - PAGE_SIZE);
      updateGameSelectionCard(); // State restored inside using selectedGames
    });

  // Delegate checkboxes to enable/disable weight & modes button
  if (gameSelectionTbody) {
    gameSelectionTbody.addEventListener("change", (event) => {
      if (!event.target.classList.contains("game-select-checkbox")) return;

      const checkbox = event.target;
      const gameValue = checkbox.value;
      const row = checkbox.closest("tr");
      const weightInp = row.querySelector(".game-weight-input");
      const modesBtn = row.querySelector(".modes-btn");
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
document.addEventListener("DOMContentLoaded", async () => {
  // <-- Add async here

  if (typeof window.generateChallengeUrl === "undefined") {
    console.error(
      "CRITICAL ERROR: window.generateChallengeUrl is not defined."
    );
    /* ... */ return;
  }
  if (typeof window.IS_AUTHENTICATED === "undefined") {
    console.error(
      "CRITICAL ERROR: window.IS_AUTHENTICATED flag is not defined."
    );
    /* ... */ return;
  }
  if (typeof window.csrfToken === "undefined") {
    console.error("CRITICAL ERROR: window.csrfToken is not defined.");
    /* ... */ return;
  } // Added CSRF check

  if (!localStorage.getItem("defaults_loaded")) {
    console.log("Loading default game entries and penalties from DB...");
    try {
      // Wait for both loading functions to complete
      await ensureUserDefaultGameTabs();
      await ensureUserDefaultPenaltyTabs();
      //await loadAndSaveGlobalPenaltyDefaults();

      // Only set the flag and reload if both succeed
      localStorage.setItem("defaults_loaded", "true");
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
  if (typeof window.generateChallengeUrl === "undefined") {
    console.error(
      "CRITICAL ERROR: window.generateChallengeUrl is not defined. Check Flask template variable passing."
    );
    // Display a user-friendly error on the page
    const errorDisplay = document.getElementById("formErrorDisplay");
    if (errorDisplay)
      showError(
        errorDisplay,
        "Configuration error: Cannot generate challenges."
      );
    return; // Stop initialization
  }
  if (typeof window.IS_AUTHENTICATED === "undefined") {
    console.error(
      "CRITICAL ERROR: window.IS_AUTHENTICATED flag is not defined. Check Flask template variable passing."
    );
    // Display a user-friendly error or default to false? Defaulting might hide issues.
    const errorDisplay = document.getElementById("formErrorDisplay");
    if (errorDisplay)
      showError(
        errorDisplay,
        "Configuration error: Cannot determine user status."
      );
    return; // Stop initialization
  }

  // Call the main initialization function for the challenge form page
  await initializeChallengeForm();
  initializeCustomChallengeBuilder(); // Initialize custom builder logic
});

// --- Custom Challenge Builder Logic ---
function getSelectedGamesFromMainTable() {
  const gameSourceSelect = document.getElementById("gameSourceSelect");
  const selectedTabId = gameSourceSelect?.value;
  if (!selectedTabId) return [];

  const isLoggedIn = window.IS_AUTHENTICATED === true;
  const sourceEntries = isLoggedIn
    ? window.indexPageGameTabs?.entries || {}
    : getLocalOnlyEntries();

  const entriesForSelectedTab = sourceEntries[selectedTabId] || [];
  const gameNames = new Set();
  entriesForSelectedTab.forEach(entry => {
    const gameName = (entry?.Spiel || entry?.game)?.trim();
    if (gameName) {
      gameNames.add(gameName);
    }
  });
  return Array.from(gameNames).sort();
}

function addNormalWinGameRow() {
  const normalWinsContainer = document.getElementById("normalWinsContainer");
  if (!normalWinsContainer) return;
  // Call the generic function, ensuring isB2B is false
  addSingleGameRowToContainer(normalWinsContainer, false);
}

function updateCustomChallengeSummary() {
  const normalWinsContainer = document.getElementById("normalWinsContainer");
  const b2bSegmentsContainer = document.getElementById("b2bSegmentsContainer");
  const totalDifficultyDisplay = document.getElementById("customChallengeTotalDifficultyDisplay");
  const groupTypeDisplay = document.getElementById("customChallengeGroupTypeDisplay");
  const penaltiesEnabledDisplay = document.getElementById("customChallengePenaltiesEnabledDisplay"); // Assuming you add this element

  if (!totalDifficultyDisplay || !groupTypeDisplay) return;

  let totalDifficulty = 0;
  let hasB2bSegments = false;
  
  // Read from main form
  const mainForm = document.getElementById("challengeForm");
  const mainFormData = new FormData(mainForm);
  const mainFormGroupMode = mainFormData.get("group_mode") || "single";
  const mainFormPenaltiesEnabled = mainFormData.get("use_penalties") === "on";

  // Calculate difficulty from Normal Wins
  normalWinsContainer.querySelectorAll(".normal-win-game-row").forEach(row => {
    const winsInput = row.querySelector(".game-wins-input");
    const gameSelect = row.querySelector(".custom-game-select");
    const modeSelect = row.querySelector(".custom-game-mode-select");
    const customDifficultyInput = row.querySelector(".custom-game-difficulty");
    
    const wins = parseInt(winsInput.value) || 0;
    let gameDifficulty = 0;

    if (gameSelect.value === "custom") {
      // For custom games, the difficulty is directly from its input
      gameDifficulty = parseFloat(customDifficultyInput.value) || 0;
    } else if (gameSelect.value) {
      const selectedMode = modeSelect ? modeSelect.value : null;
      const gameData = findGameData(gameSelect.value, selectedMode);
      gameDifficulty = gameData ? parseFloat(gameData.difficulty) : 0;
    }
    totalDifficulty += wins * gameDifficulty;
  });

  // Calculate difficulty from B2B Segments
  if (b2bSegmentsContainer && b2bSegmentsContainer.children.length > 0) {
    const b2bSegmentElements = b2bSegmentsContainer.querySelectorAll(".b2b-segment");
    for (const segmentElement of b2bSegmentElements) {
      if (segmentElement.querySelector(".b2b-segment-game-row")) {
        hasB2bSegments = true;
        break;
      }
    }

    b2bSegmentsContainer.querySelectorAll(".b2b-segment-game-row").forEach(row => {
      const winsInput = row.querySelector(".game-wins-input");
      const gameSelect = row.querySelector(".custom-game-select");
      const modeSelect = row.querySelector(".custom-game-mode-select");
      // Correctly get the custom difficulty input for *this specific row*
      const customDifficultyInput = row.querySelector(".custom-game-difficulty"); 
      
      const wins = parseInt(winsInput.value) || 0;
      let gameDifficulty = 0;

      if (gameSelect.value === "custom") {
        gameDifficulty = parseFloat(customDifficultyInput.value) || 0;
      } else if (gameSelect.value) {
        const selectedMode = modeSelect ? modeSelect.value : null;
        const gameData = findGameData(gameSelect.value, selectedMode);
        gameDifficulty = gameData ? parseFloat(gameData.difficulty) : 0;
      }
      totalDifficulty += wins * gameDifficulty; 
    });
  }

  totalDifficultyDisplay.textContent = totalDifficulty.toFixed(1);
  
  let groupModeText = "Single Group";
  if (mainFormGroupMode === "multi") {
      groupModeText = "Multi-Group";
  } else if (hasB2bSegments) { // Fallback to B2B if main form is single but B2B segments exist
      groupModeText = "Multi-Group (B2B)";
  }
  
  let penaltiesText = "";
  if (mainFormPenaltiesEnabled) {
      const penaltySourceSelectMain = document.getElementById("penaltySourceSelect");
      const penaltyTabNameMain = penaltySourceSelectMain ? penaltySourceSelectMain.options[penaltySourceSelectMain.selectedIndex]?.text : "Default Penalties";
      penaltiesText = ` w/ ${escapeHtml(penaltyTabNameMain)}`;
  }
  
  groupTypeDisplay.textContent = `${groupModeText}${penaltiesText}`;
  // if (penaltiesEnabledDisplay) { // Optional separate display for penalties
  //   penaltiesEnabledDisplay.textContent = mainFormPenaltiesEnabled ? "Penalties: Enabled" : "Penalties: Disabled";
  // }
}


// Finds game data including difficulty for a specific game and mode.
function findGameData(gameName, gameMode = null) {
    const gameSourceSelect = document.getElementById("gameSourceSelect");
    const selectedTabId = gameSourceSelect?.value;
    if (!selectedTabId) return null;

    const isLoggedIn = window.IS_AUTHENTICATED === true;
    const sourceEntries = isLoggedIn
        ? window.indexPageGameTabs?.entries || {}
        : getLocalOnlyEntries();
    
    const entriesForSelectedTab = sourceEntries[selectedTabId] || [];
    
    let foundEntry = null;
    if (gameMode && gameMode !== "N/A" && gameMode !== "custom") { // Ensure gameMode is a valid mode string
        foundEntry = entriesForSelectedTab.find(entry => 
            (entry?.Spiel || entry?.game)?.trim() === gameName &&
            (entry?.Spielmodus || entry?.gameMode)?.trim() === gameMode
        );
    }
    
    // Fallback to first entry if specific mode not found or not specified, to get available modes
    if (!foundEntry) {
        foundEntry = entriesForSelectedTab.find(entry => (entry?.Spiel || entry?.game)?.trim() === gameName);
    }

    if (foundEntry) {
        const modes = new Set();
        entriesForSelectedTab.forEach(entry => {
            if ((entry?.Spiel || entry?.game)?.trim() === gameName) {
                const mode = (entry?.Spielmodus || entry?.gameMode)?.trim();
                if (mode) {
                    modes.add(mode);
                }
            }
        });

        // Determine the difficulty: use the specific mode's entry if found, otherwise the first entry for the game.
        let difficultyToUse = 1.0;
        if (gameMode && gameMode !== "N/A" && gameMode !== "custom") {
            const specificModeEntry = entriesForSelectedTab.find(entry => 
                (entry?.Spiel || entry?.game)?.trim() === gameName &&
                (entry?.Spielmodus || entry?.gameMode)?.trim() === gameMode
            );
            if (specificModeEntry) {
                 difficultyToUse = specificModeEntry.difficulty !== undefined ? parseFloat(specificModeEntry.difficulty) : 
                                   specificModeEntry.Schwierigkeit !== undefined ? parseFloat(specificModeEntry.Schwierigkeit) : 1.0;
            } else { // Fallback if specific mode entry not found (should ideally not happen if mode is in dropdown)
                 difficultyToUse = foundEntry.difficulty !== undefined ? parseFloat(foundEntry.difficulty) : 
                                   foundEntry.Schwierigkeit !== undefined ? parseFloat(foundEntry.Schwierigkeit) : 1.0;
            }
        } else { // No specific mode, or it's N/A/custom - use the first found entry for the game
            difficultyToUse = foundEntry.difficulty !== undefined ? parseFloat(foundEntry.difficulty) : 
                              foundEntry.Schwierigkeit !== undefined ? parseFloat(foundEntry.Schwierigkeit) : 1.0;
        }

        return {
            name: gameName,
            difficulty: difficultyToUse.toFixed(1),
            availableModes: Array.from(modes).sort()
        };
    }
    return null;
}

function populateGameModeDropdown(selectElement, modes, defaultMode = null) {
    selectElement.innerHTML = ""; // Clear existing options
    if (!modes || modes.length === 0) {
        selectElement.innerHTML = '<option value="">N/A</option>';
        selectElement.disabled = true;
        return;
    }
    selectElement.disabled = false;
    modes.forEach(mode => {
        const option = document.createElement("option");
        option.value = escapeHtml(mode);
        option.textContent = escapeHtml(mode);
        selectElement.appendChild(option);
    });
    if (defaultMode && modes.includes(defaultMode)) {
        selectElement.value = escapeHtml(defaultMode);
    } else if (modes.length > 0) {
        selectElement.value = escapeHtml(modes[0]); // Default to first mode
    }
}

function initializeCustomChallengeBuilder() {
  const showBuilderBtn = document.getElementById("showCustomChallengeBuilderBtn");
  const customBuilderWrapper = document.getElementById("customChallengeBuilderWrapper");
  const challengeResultWrapper = document.getElementById("challengeResultWrapper");
  const addNormalWinGameBtn = document.getElementById("addNormalWinGameBtn");

  if (showBuilderBtn && customBuilderWrapper) {
    showBuilderBtn.addEventListener("click", () => {
      const isHidden = customBuilderWrapper.style.display === "none";
      customBuilderWrapper.style.display = isHidden ? "block" : "none";
      if (isHidden && challengeResultWrapper) {
        challengeResultWrapper.style.display = "none";
        challengeResultWrapper.classList.remove("visible");
      }
    });
  }

  if (addNormalWinGameBtn) {
    addNormalWinGameBtn.addEventListener("click", addNormalWinGameRow);
  }
  
  const addB2bSegmentBtn = document.getElementById("addB2bSegmentBtn");
  const createCustomChallengeBtn = document.getElementById("createCustomChallengeBtn");

  if (addB2bSegmentBtn) {
    addB2bSegmentBtn.addEventListener("click", addB2bSegmentRow);
  }
  if (createCustomChallengeBtn) {
    createCustomChallengeBtn.addEventListener("click", handleCreateCustomChallenge); 
  }
  
  // Add event listeners to main form controls to update custom summary dynamically
  const mainFormControlsToWatch = [
    "enablePenalties", 
    "penaltySourceSelect",
    // "num_players", // num_players from main form is now used in payload
    // "max_groups" // max_groups from main form is now used in payload
  ];
  mainFormControlsToWatch.forEach(controlId => {
    const element = document.getElementById(controlId);
    if (element) {
      element.addEventListener("change", updateCustomChallengeSummary);
    }
  });
  document.querySelectorAll('input[name="group_mode"]').forEach(radio => {
    radio.addEventListener("change", updateCustomChallengeSummary);
  });
  // Also listen to num_players and max_groups if their display affects the custom summary directly
  const numPlayersInput = document.getElementById("num_players");
  if (numPlayersInput) numPlayersInput.addEventListener("input", updateCustomChallengeSummary);
  const maxGroupsInput = document.getElementById("max_groups");
  if (maxGroupsInput) maxGroupsInput.addEventListener("input", updateCustomChallengeSummary);


  updateCustomChallengeSummary(); // Initial call to set display
}

let b2bSegmentCounter = 0;

function addB2bSegmentRow() {
  const b2bSegmentsContainer = document.getElementById("b2bSegmentsContainer");
  if (!b2bSegmentsContainer) return;

  b2bSegmentCounter++;
  const segmentDiv = document.createElement("div");
  segmentDiv.className = "b2b-segment card mb-3 p-3"; // Added card styling for visual separation
  segmentDiv.dataset.segmentId = b2bSegmentCounter;

  segmentDiv.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-2">
      <h6 class="mb-0">B2B Segment ${b2bSegmentCounter}</h6>
      <button type="button" class="btn btn-danger btn-sm remove-b2b-segment-btn">
        <i class="bi bi-x-lg"></i> Remove Segment
      </button>
    </div>
    <div class="b2b-game-rows-container">
      <!-- Game rows for this B2B segment will be added here -->
    </div>
    <button type="button" class="btn btn-outline-success btn-sm mt-2 add-game-to-b2b-btn">
      <i class="bi bi-plus-circle"></i> Add Game to Segment
    </button>
  `;
  b2bSegmentsContainer.appendChild(segmentDiv);

  segmentDiv.querySelector(".remove-b2b-segment-btn").addEventListener("click", function() {
    segmentDiv.remove();
    updateCustomChallengeSummary();
  });

  segmentDiv.querySelector(".add-game-to-b2b-btn").addEventListener("click", function() {
    addSingleGameRowToContainer(segmentDiv.querySelector(".b2b-game-rows-container"), true);
  });
  
  // Add one game row by default to the new B2B segment
  addSingleGameRowToContainer(segmentDiv.querySelector(".b2b-game-rows-container"), true);
  updateCustomChallengeSummary();
}

// Generic function to add a game row, adaptable for normal or B2B
function addSingleGameRowToContainer(container, isB2B = false) {
  if (!container) return;

  const gameRow = document.createElement("div");
  // Add an extra class for B2B rows for potential specific styling or easier selection
  gameRow.className = `row mb-2 align-items-center ${isB2B ? 'b2b-segment-game-row' : 'normal-win-game-row'}`;


  const availableGames = getSelectedGamesFromMainTable();
  let gameOptionsHtml = '<option value="" selected disabled>Select Game</option>';
  availableGames.forEach(gameName => {
    gameOptionsHtml += `<option value="${escapeHtml(gameName)}">${escapeHtml(gameName)}</option>`;
  });
  gameOptionsHtml += '<option value="custom">Add Custom Game...</option>';

  gameRow.innerHTML = `
    <div class="col-md-4">
      <select class="form-control form-control-sm custom-game-select">
        ${gameOptionsHtml}
      </select>
      <div class="custom-game-inputs mt-2" style="display: none;">
        <input type="text" class="form-control form-control-sm mb-1 custom-game-name" placeholder="Game Name">
        <input type="number" class="form-control form-control-sm custom-game-difficulty" placeholder="Difficulty" min="0.1" step="0.1">
      </div>
    </div>
    <div class="col-md-3">
      <select class="form-control form-control-sm custom-game-mode-select" disabled>
        <option value="">N/A</option>
      </select>
    </div>
    <div class="col-md-2">
      <input type="number" class="form-control form-control-sm game-wins-input" value="1" min="1" placeholder="Wins">
    </div>
    <div class="col-md-1">
      <p class="mb-0 game-difficulty-display text-muted small" style="font-size: 0.75rem;">Diff: -</p>
    </div>
    <div class="col-md-2 text-end">
      <button type="button" class="btn btn-outline-danger btn-sm remove-game-row-btn">
        <i class="bi bi-trash"></i>
      </button>
    </div>
  `;
  container.appendChild(gameRow);

  const customGameSelect = gameRow.querySelector(".custom-game-select");
  const customGameModeSelect = gameRow.querySelector(".custom-game-mode-select");
  const customGameInputs = gameRow.querySelector(".custom-game-inputs");
  const gameDifficultyDisplay = gameRow.querySelector(".game-difficulty-display");
  const customGameNameInput = gameRow.querySelector(".custom-game-name");
  const customGameDifficultyInput = gameRow.querySelector(".custom-game-difficulty");

  function updateRowDisplayAndTotalDifficulty() {
    const selectedGameName = customGameSelect.value;
    const selectedGameMode = customGameModeSelect.value;

    if (selectedGameName === "custom") {
      customGameInputs.style.display = "block";
      gameDifficultyDisplay.textContent = `Diff: ${customGameDifficultyInput.value || '-'}`;
      populateGameModeDropdown(customGameModeSelect, []); 
    } else {
      customGameInputs.style.display = "none";
      if (selectedGameName) {
        const gameData = findGameData(selectedGameName, selectedGameMode);
        gameDifficultyDisplay.textContent = `Diff: ${gameData ? gameData.difficulty : '-'}`;
        // If modes were just populated and one is now selected, this will use it.
        // If no mode selected (e.g. game has no modes), findGameData handles it.
      } else {
        gameDifficultyDisplay.textContent = "Diff: -";
        populateGameModeDropdown(customGameModeSelect, []);
      }
    }
    updateCustomChallengeSummary();
  }

  customGameSelect.addEventListener("change", function() {
    const selectedGameName = this.value;
    if (selectedGameName === "custom") {
      customGameNameInput.value = ""; 
      customGameDifficultyInput.value = "";
      populateGameModeDropdown(customGameModeSelect, []);
    } else if (selectedGameName) {
      const gameData = findGameData(selectedGameName); // Get available modes
      populateGameModeDropdown(customGameModeSelect, gameData ? gameData.availableModes : []);
    } else {
      populateGameModeDropdown(customGameModeSelect, []);
    }
    updateRowDisplayAndTotalDifficulty(); // Update difficulty based on new game/mode
  });
  
  customGameModeSelect.addEventListener("change", updateRowDisplayAndTotalDifficulty);

  customGameDifficultyInput.addEventListener('input', function() {
    if (customGameSelect.value === 'custom') {
        gameDifficultyDisplay.textContent = `Diff: ${this.value || '-'}`; // Update row display
        updateCustomChallengeSummary(); // Update total summary
    }
  });
  
  customGameNameInput.addEventListener('input', updateCustomChallengeSummary); 
  gameRow.querySelector(".game-wins-input").addEventListener("input", updateCustomChallengeSummary); 

  gameRow.querySelector(".remove-game-row-btn").addEventListener("click", function() {
    gameRow.remove();
    updateCustomChallengeSummary();
  });
  
  // Initial population of modes if a game is pre-selected (e.g. if we implement editing later)
  if (customGameSelect.value && customGameSelect.value !== "custom") {
      const initialGameData = findGameData(customGameSelect.value);
      populateGameModeDropdown(customGameModeSelect, initialGameData ? initialGameData.availableModes : []);
  }
  updateRowDisplayAndTotalDifficulty(); // Initial call to set difficulty and total
}


function handleCreateCustomChallenge() {
  const challengeNameInput = document.getElementById("challengeName");
  const customChallengeName = challengeNameInput ? challengeNameInput.value.trim() : "Custom Challenge";
  
  const normalWinsContainer = document.getElementById("normalWinsContainer");
  const b2bSegmentsContainer = document.getElementById("b2bSegmentsContainer");
  const resultDiv = document.getElementById("challengeResult");
  const resultWrapper = document.getElementById("challengeResultWrapper");
  const customBuilderWrapper = document.getElementById("customChallengeBuilderWrapper");
  const errorDisplay = document.getElementById("formErrorDisplay");
  const viewLocalBtn = document.getElementById("viewLocalChallengeBtn");
  const shareBtn = document.getElementById("shareChallengeBtn");
  const shareResultDiv = document.getElementById("shareResult");


  if (!resultDiv || !resultWrapper || !customBuilderWrapper) {
    console.error("One or more critical display elements are missing.");
    return;
  }
  
  showError(errorDisplay, null); // Clear previous errors

  const challengeDataForDisplay = { // Keep this for the immediate display
    name: customChallengeName || `Custom Challenge ${new Date().toLocaleDateString()}`,
    normal: [],
    b2b: [],
    totalDifficulty: parseFloat(document.getElementById("customChallengeTotalDifficultyDisplay").textContent) || 0,
    groupType: document.getElementById("customChallengeGroupTypeDisplay").textContent || "Single Group"
  };

  const payloadChallengeData = { // This will be structured for the /api/challenge/share endpoint
      normal: {},
      b2b: []
  };

  // Gather Normal Wins
  normalWinsContainer.querySelectorAll(".normal-win-game-row").forEach(row => {
    const gameSelect = row.querySelector(".custom-game-select");
    const modeSelect = row.querySelector(".custom-game-mode-select");
    const winsInput = row.querySelector(".game-wins-input");
    const customNameInput = row.querySelector(".custom-game-name");
    const customDiffInput = row.querySelector(".custom-game-difficulty");

    const wins = parseInt(winsInput.value) || 1;
    let gameName, gameDifficulty, gameMode, isCustomGame = false;

    if (gameSelect.value === "custom") {
      gameName = customNameInput.value.trim() || "Custom Game";
      gameDifficulty = parseFloat(customDiffInput.value) || 1.0;
      gameMode = "custom"; // Or leave undefined/null if custom games don't have modes
      isCustomGame = true;
    } else if (gameSelect.value) {
      gameName = gameSelect.value;
      const selectedMode = modeSelect ? modeSelect.value : null;
      const gameData = findGameData(gameName, selectedMode);
      gameDifficulty = gameData ? parseFloat(gameData.difficulty) : 1.0;
      gameMode = selectedMode || (gameData && gameData.availableModes && gameData.availableModes.length > 0 ? gameData.availableModes[0] : "N/A");
    } else {
      return; // Skip if no game selected
    }
    // For display
    challengeDataForDisplay.normal.push({ game: gameName, wins: wins, difficulty: gameDifficulty, mode: gameMode, custom: isCustomGame });
    // For payload
    const payloadKeyNormal = `${gameName} (${gameMode === "custom" || gameMode === "N/A" ? "Default" : gameMode})`;
    payloadChallengeData.normal[payloadKeyNormal] = { count: wins, diff: gameDifficulty };
  });

  // Gather B2B Segments
  let segmentIndex = 0;
  b2bSegmentsContainer.querySelectorAll(".b2b-segment").forEach(segmentElement => {
    const segmentGamesForDisplay = [];
    const segmentGamesForPayloadGroup = {};
    let segmentTotalWins = 0;
    let segmentTotalDifficulty = 0;

    segmentElement.querySelectorAll(".b2b-segment-game-row").forEach(row => {
      const gameSelect = row.querySelector(".custom-game-select");
      const modeSelect = row.querySelector(".custom-game-mode-select");
      const winsInput = row.querySelector(".game-wins-input");
      const customNameInput = row.querySelector(".custom-game-name");
      const customDiffInput = row.querySelector(".custom-game-difficulty");

      const wins = parseInt(winsInput.value) || 1;
      let gameName, gameDifficulty, gameMode, isCustomGame = false;

      if (gameSelect.value === "custom") {
        gameName = customNameInput.value.trim() || "Custom Game";
        gameDifficulty = parseFloat(customDiffInput.value) || 1.0;
        gameMode = "custom";
        isCustomGame = true;
      } else if (gameSelect.value) {
        gameName = gameSelect.value;
        const selectedMode = modeSelect ? modeSelect.value : null;
        const gameData = findGameData(gameName, selectedMode);
        gameDifficulty = gameData ? parseFloat(gameData.difficulty) : 1.0;
      gameMode = selectedMode || (gameData && gameData.availableModes && gameData.availableModes.length > 0 ? gameData.availableModes[0] : "N/A");
      } else {
        return; // Skip if no game selected in B2B row
      }
      // For display
      segmentGamesForDisplay.push({ game: gameName, wins: wins, difficulty: gameDifficulty, mode: gameMode, custom: isCustomGame });
      // For payload
      const payloadKeyB2B = `${gameName} (${gameMode === "custom" || gameMode === "N/A" ? "Default" : gameMode})`;
      segmentGamesForPayloadGroup[payloadKeyB2B] = wins; // Store wins directly
      segmentTotalWins += wins;
      segmentTotalDifficulty += wins * gameDifficulty;
    });

    if (segmentGamesForDisplay.length > 0) {
      challengeDataForDisplay.b2b.push(segmentGamesForDisplay);
      payloadChallengeData.b2b.push({
        group: segmentGamesForPayloadGroup,
        length: segmentTotalWins,
        seg_diff: parseFloat(segmentTotalDifficulty.toFixed(1)), // Ensure it's a number
        segment_index_1_based: ++segmentIndex
      });
    }
  });
  
  if (challengeDataForDisplay.normal.length === 0 && payloadChallengeData.b2b.length === 0) { // Check payload's b2b
    showError(errorDisplay, "Please add at least one game to your custom challenge.");
    return;
  }

  // Determine if to save locally or send to backend
  const isAuthenticated = window.IS_AUTHENTICATED === true;
  const createCustomChallengeButton = document.getElementById("createCustomChallengeBtn");


  if (isAuthenticated) {
    // Read main form settings for payload
    const mainForm = document.getElementById("challengeForm");
    const mainFormData = new FormData(mainForm);

    const usePenaltiesMain = mainFormData.get("use_penalties") === "on";
    let penaltyInfoPayload = null;
    if (usePenaltiesMain) {
        const penaltyTabIdMain = mainFormData.get("penalty_tab_id");
        const penaltySourceSelectMain = document.getElementById("penaltySourceSelect");
        const penaltyTabNameMain = penaltySourceSelectMain ? penaltySourceSelectMain.options[penaltySourceSelectMain.selectedIndex]?.text : "Unknown Tab";
        
        if (penaltyTabIdMain) {
            let penaltyEntriesListMain = [];
            if (window.indexPagePenaltyTabs && window.indexPagePenaltyTabs.entries) {
                penaltyEntriesListMain = window.indexPagePenaltyTabs.entries[penaltyTabIdMain] || [];
            } else { 
                const localPenaltyData = getLocalPenaltyEntries();
                penaltyEntriesListMain = localPenaltyData[penaltyTabIdMain] || [];
            }
            const validPenaltyEntriesMain = (Array.isArray(penaltyEntriesListMain) ? penaltyEntriesListMain : []).filter(p => {
                const prob = p && p.probability !== undefined ? parseFloat(p.probability) : NaN;
                return !isNaN(prob) && prob > 0;
            });
            penaltyInfoPayload = {
                source_tab_id: penaltyTabIdMain,
                source_tab_name: penaltyTabNameMain,
                penalties: validPenaltyEntriesMain,
            };
        }
    }

    const groupModeMain = mainFormData.get("group_mode") || "single";
    const maxGroupsMain = groupModeMain === "multi" ? (parseInt(mainFormData.get("max_groups")) || 1) : 1;
    const numPlayersPerGroupMain = parseInt(mainFormData.get("num_players")) || 1;

    const sharePayload = {
      challenge_data: payloadChallengeData,
      penalty_info: penaltyInfoPayload,
      name: challengeDataForDisplay.name, 
      max_groups: maxGroupsMain,
      num_players_per_group: numPlayersPerGroupMain,
      is_custom_built: true 
    };

    if (viewLocalBtn) viewLocalBtn.style.display = "none";
    if (shareResultDiv) { 
        shareResultDiv.style.display = "none";
        shareResultDiv.innerHTML = "";
    }
    
    setLoading(createCustomChallengeButton, true, "Creating...");

    const shareUrl = window.shareChallengeUrl || "/api/challenge/share";
    
    apiFetch(shareUrl, { method: "POST", body: sharePayload }, window.csrfToken)
      .then(sharedResponse => {
        setLoading(createCustomChallengeButton, false); 
        if (sharedResponse.status === "success" && sharedResponse.public_id && sharedResponse.share_url) {
            if (createCustomChallengeButton) {
                createCustomChallengeButton.innerHTML = '<i class="bi bi-check-circle-fill me-1"></i> Accept Challenge';
                createCustomChallengeButton.classList.remove("btn-primary");
                createCustomChallengeButton.classList.add("btn-success"); 
                createCustomChallengeButton.disabled = true; 
                createCustomChallengeButton.onclick = () => { window.open(sharedResponse.share_url, '_blank'); };
            }
        } else {
          const errorMessage = sharedResponse.error || "Failed to share custom challenge. Server error.";
          throw new Error(errorMessage); 
        }
      })
      .catch(error => {
        setLoading(createCustomChallengeButton, false, "Create Challenge"); 
        console.error("Error sharing custom challenge:", error);
        if (createCustomChallengeButton) {
            createCustomChallengeButton.innerHTML = '<i class="bi bi-check-circle-fill me-1"></i> Accept Challenge'; 
            createCustomChallengeButton.classList.remove("btn-primary");
            createCustomChallengeButton.classList.add("btn-success"); 
            createCustomChallengeButton.disabled = true;
        }
      });

  } else {
    // User is not logged in, save locally
    setLoading(createCustomChallengeButton, false); 
    let uuid;
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      uuid = crypto.randomUUID();
    } else {
      uuid = 'xxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }
    const localId = `local_custom_${uuid}`;
    const challengeToStore = {
        localId: localId,
        name: challengeDataForDisplay.name, 
        createdAt: new Date().toISOString(),
        challengeData: { 
            normal: challengeDataForDisplay.normal.map(n => ({ game: n.game, wins: n.wins, difficulty: n.difficulty, mode: n.mode, custom: n.custom })),
            b2b: challengeDataForDisplay.b2b.map(seg => seg.map(g => ({ game: g.game, wins: g.wins, difficulty: g.difficulty, mode: g.mode, custom: g.custom }))),
        },
        isCustom: true, 
    };
    
    const saved = saveChallengeToLocalStorage(challengeToStore);

    if (createCustomChallengeButton) {
        createCustomChallengeButton.innerHTML = '<i class="bi bi-check-circle-fill me-1"></i> Accept Challenge'; 
        createCustomChallengeButton.classList.remove("btn-primary");
        createCustomChallengeButton.classList.add("btn-success"); 
        createCustomChallengeButton.disabled = true;
        if (saved) {
            createCustomChallengeButton.onclick = () => { window.open(`/challenge/${localId}`, '_blank'); };
        }
    }
  }
}
