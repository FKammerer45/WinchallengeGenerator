// app/static/js/challenge_generator/formCore.js

import { getLocalOnlyTabs as getGameTabs, getLocalOnlyEntries, initLocalStorage as initGameStorage } from "../games/localStorageUtils.js";
import { initLocalStorage as initPenaltiesLocalStorage, getLocalOnlyTabs as getLocalPenaltyTabs, getLocalOnlyEntries as getLocalPenaltyEntries } from "../penalties/penaltyLocalStorageUtils.js";
import { saveChallengeToLocalStorage } from "../utils/local_storage.js";
import { showError, escapeHtml, setLoading, generateSimpleUUID, showFlash } from "../utils/helpers.js";
import { apiFetch } from "../utils/api.js";
import { selectedGames, PAGE_SIZE, formState } from "./formConstants.js"; // Updated import
import { initializeCustomChallengeBuilder, findGameData, updateCustomChallengeSummary } from "./customBuilderLogic.js";

// Ensure these global window objects are always defined before any async operations
window.indexPageGameTabs = window.indexPageGameTabs || { tabs: {}, entries: {} };
window.indexPagePenaltyTabs = window.indexPagePenaltyTabs || { tabs: {}, entries: {} };

export function restoreChecked(checkedSet) {
  document.querySelectorAll(".game-select-checkbox").forEach((cb) => {
    cb.checked = checkedSet.has(cb.value);
    cb.dispatchEvent(new Event("change")); // keep weight inputs in sync
  });
}

export function updateB2BDisplay(value) {
  const b2bOutput = document.getElementById("b2bValueDisplay");
  if (!b2bOutput) return;

  const numericValue = parseInt(value, 10);
  let levelText = "Medium";
  let levelClass = "level-medium";

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
    levelText = "High";
    levelClass = "level-high";
  }

  b2bOutput.textContent = levelText;
  b2bOutput.className = "range-value-display " + levelClass;
}

export function updateIndexFormUI() {
  if (formState.isForcingMode) return; // Use formState

  const modeSelectedRadio = document.querySelector(
    'input[name="group_mode"]:checked'
  );
  const modeSelected = modeSelectedRadio?.value || "single";
  const maxGroupsContainer = document.getElementById("maxGroupsContainer");
  const numPlayersLabel = document.getElementById("numPlayersLabel");
  const loginRequiredMsg = document.querySelector(".login-required-msg");
  const isAuthenticated = window.IS_AUTHENTICATED === true;

  if (modeSelected === "multi" && !isAuthenticated) {
    formState.isForcingMode = true; // Use formState
    const singleRadio = document.getElementById("modeSingleGroup");
    if (singleRadio) singleRadio.checked = true;
    if (loginRequiredMsg) loginRequiredMsg.classList.remove("d-none");
    if (maxGroupsContainer) maxGroupsContainer.classList.add("d-none");
    if (numPlayersLabel) numPlayersLabel.textContent = "Number of Players:";
    formState.isForcingMode = false; // Use formState
    return;
  } else {
    if (loginRequiredMsg) loginRequiredMsg.classList.add("d-none");
  }

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

export function populatePenaltySourceDropdown() {
  const dropdown = document.getElementById("penaltySourceSelect");
  if (!dropdown) {
    console.error("Penalty source dropdown (#penaltySourceSelect) missing.");
    return;
  }
  dropdown.innerHTML = "";
  let defaultExists = false;

  try {
    const isLoggedIn = window.IS_AUTHENTICATED === true;
    const tabs = isLoggedIn
      ? window.indexPagePenaltyTabs?.tabs || {}
      : getLocalPenaltyTabs();

    if (!tabs || Object.keys(tabs).length === 0) {
      console.warn("No penalty tabs data found for dropdown.");
      dropdown.innerHTML =
        '<option value="" disabled selected>No penalty tabs found</option>';
      return;
    }

    const defaultPenaltyTabKey = "default-all-penalties";
    if (tabs[defaultPenaltyTabKey]) {
      const option = document.createElement("option");
      option.value = defaultPenaltyTabKey;
      option.textContent =
        tabs[defaultPenaltyTabKey].name || "All Penalties (Default)";
      dropdown.appendChild(option);
      defaultExists = true;
    }

    Object.entries(tabs)
      .filter(([tabId]) => tabId !== defaultPenaltyTabKey)
      .sort(([, tabA], [, tabB]) =>
        (tabA.name || "").localeCompare(tabB.name || "")
      )
      .forEach(([tabId, tabData]) => {
        const option = document.createElement("option");
        option.value = tabId;
        option.textContent = tabData?.name || tabId;
        dropdown.appendChild(option);
      });

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

export function populateGameSourceDropdown() {
  const dropdown = document.getElementById("gameSourceSelect");
  if (!dropdown) {
    console.error("Game source dropdown missing.");
    return;
  }
  dropdown.innerHTML = "";
  let defaultExists = false;

  try {
    const isLoggedIn = window.IS_AUTHENTICATED === true;
    const tabs = isLoggedIn
      ? window.indexPageGameTabs?.tabs || {}
      : getGameTabs();

    if (!tabs || Object.keys(tabs).length === 0) {
      dropdown.innerHTML =
        '<option value="" disabled selected>No game tabs found</option>';
      return;
    }

    if (tabs["default"]) {
      const option = document.createElement("option");
      option.value = "default";
      option.textContent = tabs["default"].name || "Default";
      dropdown.appendChild(option);
      defaultExists = true;
    }

    Object.entries(tabs)
      .filter(([tabId]) => tabId !== "default")
      .sort(([, tabA], [, tabB]) =>
        (tabA.name || "").localeCompare(tabB.name || "")
      )
      .forEach(([tabId, tabData]) => {
        const option = document.createElement("option");
        option.value = tabId;
        option.textContent = tabData?.name || tabId;
        dropdown.appendChild(option);
      });

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

export function updateGameSelectionCard() {
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

  let entries = [];
  try {
    const isLoggedIn = window.IS_AUTHENTICATED === true;
    const sourceEntries = isLoggedIn
      ? window.indexPageGameTabs?.entries || {}
      : getLocalOnlyEntries();

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

  Object.keys(grouped).forEach(
    (key) =>
      (grouped[key].availableModes = Array.from(
        grouped[key].availableModes
      ).sort())
  );

  let tableHtml = "";
  let allModalsHtml = "";
  const gameNames = Object.keys(grouped).sort();
  formState.gamesShown = Math.max(PAGE_SIZE, Math.min(formState.gamesShown, gameNames.length)); // Use formState
  const visibleNames = gameNames.slice(0, formState.gamesShown); // Use formState

  if (visibleNames.length > 0) {
    visibleNames.forEach((gameName, index) => {
      const group = grouped[gameName];
      const weightVal = group.weight.toFixed(1);
      const safeGameNameId = gameName.replace(/[^a-zA-Z0-9_-]/g, "-");
      const gameCheckboxId = `game-${safeGameNameId}-${index}`;
      const modalId = `modesModal-${safeGameNameId}-${index}`;
      const modalLabelId = `modesModalLabel-${safeGameNameId}-${index}`;
      const escapedGameName = escapeHtml(gameName);

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

      if (group.availableModes.length > 0) {
        let modalBodyHtml = "";
        group.availableModes.forEach((mode, i) => {
          const modeCheckboxId = `mode-${safeGameNameId}-${index}-${i}`;
          const escapedModeValue = mode.replace(/"/g, "&quot;");
          const escapedModeLabel = escapeHtml(mode); // Added this line
          modalBodyHtml += `
                        <div class="custom-control custom-checkbox mb-2">
                            <input class="custom-control-input allowed-mode-checkbox" type="checkbox"
                                   name="allowed_modes_${escapedGameName}[]" value="${escapedModeValue}" id="${modeCheckboxId}" checked>
                            <label class="custom-control-label" for="${modeCheckboxId}">${escapedModeLabel}</label>
                        </div>`;
        });

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
    cb.checked = selectedGames.has(cb.value);
  });
  const moreBtn = document.getElementById("showMoreGamesBtn");
  const lessBtn = document.getElementById("showLessGamesBtn");
  const rowToggle = document.getElementById("showMoreGamesRow");

  if (rowToggle) {
    const moreNeeded = gameNames.length > formState.gamesShown; // Use formState
    const lessNeeded = formState.gamesShown > PAGE_SIZE; // Use formState
    rowToggle.classList.toggle("d-none", !moreNeeded && !lessNeeded);
    moreBtn?.classList.toggle("d-none", !moreNeeded);
    lessBtn?.classList.toggle("d-none", !lessNeeded);
  }
}

export function gatherSelectedModes() {
  const selectedModes = {};
  document
    .querySelectorAll("#gamesSelectionTbody tr[data-game]")
    .forEach((row) => {
      const gameSelectCheckbox = row.querySelector(".game-select-checkbox");
      if (gameSelectCheckbox?.checked) {
        const gameName = row.dataset.game;
        if (gameName) {
          const modalButton = row.querySelector("button[data-target]");
          const modalIdSelector = modalButton?.dataset.target;
          if (modalIdSelector) {
            const modalElement = document.querySelector(modalIdSelector);
            if (modalElement) {
              const modeCheckboxes = modalElement.querySelectorAll(
                `input.allowed-mode-checkbox:checked`
              );
              if (modeCheckboxes.length > 0) {
                selectedModes[gameName] = Array.from(modeCheckboxes).map(
                  (cb) => cb.value
                );
              }
            }
          }
        }
      }
    });
  return selectedModes;
}

export function handleChallengeFormSubmit(event) {
  event.preventDefault();

  const customBuilderWrapper = document.getElementById("customChallengeBuilderWrapper");
  if (customBuilderWrapper) {
    customBuilderWrapper.style.display = "none";
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
    updateIndexFormUI();
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
  }

  const compatibleGamesSelected = checkedGames.some(gameName => {
      const gameEntries = allGameEntriesForValidation.filter(entry =>
          (entry?.Spiel || entry?.game)?.trim() === gameName
      );
      return gameEntries.some(entry =>
          parseInt(entry?.Spieleranzahl || entry?.numberOfPlayers) >= selectedPlayerCount
      );
  });

  if (!compatibleGamesSelected) {
      const userMessage = `Challenge generation failed: You selected ${selectedPlayerCount} players, but none of the selected games/modes support this player count. Please select games that fit your player count or reduce the player count.`;
      showError(errorDisplay, userMessage);
      setLoading(submitButton, false, "Generate Challenge");
      if (resultWrapper) resultWrapper.style.display = "none";
      if (resultDiv) resultDiv.innerHTML = "";
      return;
  }

  showError(errorDisplay, null);
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
          `Game data for tab '${selectedTab}' is not an array.`
        );
      }
    } else {
      throw new Error(`No game data found for tab '${selectedTab}'.`);
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
      setLoading(submitButton, false, "Generate Challenge");
      return;
    }

    let penaltyEntriesList = [];
    try {
      if (
        isAuthenticated &&
        window.indexPagePenaltyTabs &&
        window.indexPagePenaltyTabs.entries
      ) {
        penaltyEntriesList =
          window.indexPagePenaltyTabs.entries[penaltyTabId] || [];
      } else {
        const localPenaltyData = getLocalPenaltyEntries();
        penaltyEntriesList = localPenaltyData[penaltyTabId] || [];
      }

      if (!Array.isArray(penaltyEntriesList)) {
        console.warn(
          `Penalty entries for tab ${penaltyTabId} is not an array, defaulting to empty.`
        );
        penaltyEntriesList = [];
      }

      const validPenaltyEntries = penaltyEntriesList.filter((p) => {
        const prob =
          p && p.probability !== undefined ? parseFloat(p.probability) : NaN;
        return !isNaN(prob) && prob > 0;
      });

      if (validPenaltyEntries.length === 0 && penaltyEntriesList.length > 0) {
        showError(
          errorDisplay,
          `The selected penalty tab "${escapeHtml(
            penaltyTabName
          )}" has no penalties with a probability greater than 0. Please add some or choose a different tab.`
        );
        setLoading(submitButton, false, "Generate Challenge");
        return;
      }

      const penaltyInfoPayload = {
        source_tab_id: penaltyTabId,
        source_tab_name: penaltyTabName,
        penalties: validPenaltyEntries,
      };
      formData.append("penalty_info_full", JSON.stringify(penaltyInfoPayload));
      console.log(
        "[Submit Form] Appending full penalty_info:",
        penaltyInfoPayload
      );
    } catch (e) {
      showError(errorDisplay, `Error processing penalty entries: ${e.message}`);
      setLoading(submitButton, false, "Generate Challenge");
      return;
    }
  } else {
    formData.delete("penalty_info_full");
    formData.delete("penalty_tab_id");
  }

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

      window.currentChallengeData = data;

      console.log("[FormJS] In handleChallengeFormSubmit: isAuthenticated =", isAuthenticated, "data.share_options =", data.share_options);

      if (isAuthenticated && data.share_options) {
        if (shareBtn) {
          shareBtn.style.display = "inline-block";
          shareBtn.disabled = false;
          shareBtn.classList.remove("btn-secondary", "disabled", "btn-primary");
          shareBtn.classList.add("btn-success");
          shareBtn.removeAttribute("aria-disabled");
          console.log("shareChallengeBtn IS being enabled and styled success (green) in form.js");

          const shareBtnText = shareBtn.querySelector(
            "span:not(.spinner-border-sm)"
          );
          const shareBtnIcon = shareBtn.querySelector("i.bi");
          if (shareBtnText) shareBtnText.textContent = "create challenge";
          if (shareBtnIcon) {
            shareBtnIcon.classList.remove("bi-share-fill");
            shareBtnIcon.classList.add("bi-check-circle-fill");
          }
          shareBtn.title = "Create and view this generated challenge";

          shareBtn.addEventListener('click', function() {
              if (window.currentChallengeData && window.currentChallengeData.share_url) {
                  window.location.href = window.currentChallengeData.share_url;
              } else {
                  console.error("Challenge URL not available for redirection.");
              }
          });
        }
        if (viewLocalBtn) viewLocalBtn.style.display = "none";
      } else {
        let uuid;
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
          uuid = crypto.randomUUID();
        } else {
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
      console.error("Challenge Generation Fetch Error:", error);
      if (resultWrapper) resultWrapper.style.display = "block";
      requestAnimationFrame(() => {
        if (resultWrapper) resultWrapper.classList.add("visible");
      });

      let userMessage = "Failed to generate challenge. Please try again.";
      const specificErrorMatch = error.message.match(/^No games found that support (\d+) players\.$/);

      if (specificErrorMatch) {
          const playerCount = specificErrorMatch[1];
          userMessage = `Challenge generation failed: You selected ${playerCount} players, but none of the selected games/modes support this player count. Please select games that fit your player count or reduce the player count.`;
      } else {
          userMessage = `Failed to generate challenge: ${error.message}`;
      }


      if (resultDiv)
        resultDiv.innerHTML = `<p class="text-danger text-center p-3">${escapeHtml(userMessage)}</p>`;
      showError(errorDisplay, userMessage);
    })
    .finally(() => {
      if (submitButton) setLoading(submitButton, false, "Generate Challenge");
    });
}

export async function initializeChallengeForm() {
  console.log("Initializing challenge form script...");

  initGameStorage();
  initPenaltiesLocalStorage();
  const isLoggedIn = window.IS_AUTHENTICATED === true;
  const csrfToken = window.csrfToken;
  if (isLoggedIn && csrfToken) {
    console.log(
      "User logged in, attempting to fetch saved tabs for index page..."
    );
    const loadingPromises = [];

    loadingPromises.push(
      apiFetch("/api/tabs/load", {}, csrfToken)
        .then((data) => {
          console.log("[Index Init] Game Tabs API Response:", data);
          if (typeof data === "object" && data !== null) {
            window.indexPageGameTabs.tabs = {};
            window.indexPageGameTabs.entries = {};
            for (const tabId in data) {
              window.indexPageGameTabs.tabs[tabId] = {
                name: data[tabId]?.tab_name || `Tab ${tabId}`,
              };
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
        })
    );

    loadingPromises.push(
      apiFetch("/api/penalties/load_tabs", {}, csrfToken)
        .then((data) => {
          console.log("[Index Init] Penalty Tabs API Response:", data);
          if (typeof data === "object" && data !== null) {
            window.indexPagePenaltyTabs.tabs = {};
            window.indexPagePenaltyTabs.entries = {};
            for (const tabId in data) {
              window.indexPagePenaltyTabs.tabs[tabId] = {
                name: data[tabId]?.tab_name || `Penalty Tab ${tabId}`,
              };
              const rawEntries = data[tabId]?.penalties;
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
        })
    );

    await Promise.all(loadingPromises);
    console.log("API tab loading finished for index page.");
  } else {
    console.log(
      "User not logged in, index page will use local storage for tabs."
    );
    // These lines are now redundant due to global initialization at the top of the file
    // window.indexPageGameTabs = { tabs: {}, entries: {} };
    // window.indexPagePenaltyTabs = { tabs: {}, entries: {} };
  }
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

  const b2bSlider = document.getElementById("spinB2B");
  if (b2bSlider) {
    b2bSlider.addEventListener("input", (event) => {
      updateB2BDisplay(event.target.value);
    });
    updateB2BDisplay(b2bSlider.value);
  } else {
    console.warn("B2B slider element (#spinB2B) not found during init.");
  }

  if (gameSourceSelect) {
    populateGameSourceDropdown();
    gameSourceSelect.addEventListener("change", () => {
      formState.gamesShown = PAGE_SIZE; // Use formState
      selectedGames.clear();
      updateGameSelectionCard();
    });
    updateGameSelectionCard();
  }

  if (penaltySourceSelect) {
    populatePenaltySourceDropdown();
  }

  modeRadios.forEach((r) => r.addEventListener("change", updateIndexFormUI));
  if (penaltyCheckbox)
    penaltyCheckbox.addEventListener("change", updateIndexFormUI);

  if (challengeForm)
    challengeForm.addEventListener("submit", handleChallengeFormSubmit);

  if (selectAllBtn) {
    selectAllBtn.addEventListener("click", () => {
      const dropdown = document.getElementById("gameSourceSelect");
      const selectedTab = dropdown?.value;
      let allGameNames = [];
      if (selectedTab && gameSelectionTbody) {
        try {
          const allTabsData = getLocalOnlyEntries();
          let entries = [];
          if (allTabsData && allTabsData.hasOwnProperty(selectedTab)) {
            const specificTabEntries = allTabsData[selectedTab];
            if (Array.isArray(specificTabEntries)) {
              entries = specificTabEntries;
            }
          }
          const grouped = {};
          entries.forEach((entry) => {
            const gameName = (entry?.Spiel || entry?.game)?.trim();
            if (gameName) {
              if (!grouped[gameName]) {
                grouped[gameName] = true;
              }
            }
          });
          allGameNames = Object.keys(grouped);
        } catch (e) {
          console.error("Error getting game names for Select All:", e);
          return;
        }
      } else {
        console.warn(
          "Cannot Select All: No game source selected or table body not found."
        );
        return;
      }

      allGameNames.forEach((name) => selectedGames.add(name));

      gameSelectionTbody
        ?.querySelectorAll(".game-select-checkbox")
        .forEach((cb) => {
          if (!cb.checked) {
            cb.checked = true;
            const event = new Event("change", { bubbles: true });
            cb.dispatchEvent(event);
          }
        });
    });
  }

  if (deselectAllBtn) {
    deselectAllBtn.addEventListener("click", () => {
      selectedGames.clear();

      gameSelectionTbody
        ?.querySelectorAll(".game-select-checkbox")
        .forEach((cb) => {
          if (cb.checked) {
            cb.checked = false;
            const event = new Event("change", { bubbles: true });
            cb.dispatchEvent(event);
          }
        });
    });
  }
  if (moreBtn)
    moreBtn.addEventListener("click", () => {
      formState.gamesShown += PAGE_SIZE; // Use formState
      updateGameSelectionCard();
    });
  if (lessBtn)
    lessBtn.addEventListener("click", () => {
      formState.gamesShown = Math.max(PAGE_SIZE, formState.gamesShown - PAGE_SIZE); // Use formState
      updateGameSelectionCard();
    });

  if (gameSelectionTbody) {
    gameSelectionTbody.addEventListener("change", (event) => {
      if (!event.target.classList.contains("game-select-checkbox")) return;

      const checkbox = event.target;
      const gameValue = checkbox.value;
      const row = checkbox.closest("tr");
      const weightInp = row.querySelector(".game-weight-input");
      const modesBtn = row.querySelector(".modes-btn");
      const isChecked = checkbox.checked;

      if (isChecked) {
        selectedGames.add(gameValue);
      } else {
        selectedGames.delete(gameValue);
      }

      if (weightInp) weightInp.disabled = !isChecked;
    });
  }

  updateIndexFormUI();
  if (b2bSlider) updateB2BDisplay(b2bSlider.value);
  console.log("Challenge form initialization complete.");
}
