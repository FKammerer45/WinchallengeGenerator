// app/static/js/challenge_generator/customBuilderLogic.js

import { escapeHtml, showError, setLoading, generateSimpleUUID } from "../utils/helpers.js";
import { getLocalOnlyEntries } from "../games/localStorageUtils.js";
import { getLocalOnlyEntries as getLocalPenaltyEntries } from "../penalties/penaltyLocalStorageUtils.js";
import { saveChallengeToLocalStorage } from "../utils/local_storage.js";
import { apiFetch } from "../utils/api.js";
import { selectedGames, formState } from "./formConstants.js"; // Updated import

export function getSelectedGamesFromMainTable() {
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

export function addNormalWinGameRow() {
  const normalWinsContainer = document.getElementById("normalWinsContainer");
  if (!normalWinsContainer) return;
  addSingleGameRowToContainer(normalWinsContainer, false);
}

export function updateCustomChallengeSummary() {
  const normalWinsContainer = document.getElementById("normalWinsContainer");
  const b2bSegmentsContainer = document.getElementById("b2bSegmentsContainer");
  const totalDifficultyDisplay = document.getElementById("customChallengeTotalDifficultyDisplay");
  const groupTypeDisplay = document.getElementById("customChallengeGroupTypeDisplay");
  const penaltiesEnabledDisplay = document.getElementById("customChallengePenaltiesEnabledDisplay");

  if (!totalDifficultyDisplay || !groupTypeDisplay) return;

  let totalDifficulty = 0;
  let hasB2bSegments = false;
  
  const mainForm = document.getElementById("challengeForm");
  const mainFormData = new FormData(mainForm);
  const mainFormGroupMode = mainFormData.get("group_mode") || "single";
  const mainFormPenaltiesEnabled = mainFormData.get("use_penalties") === "on";

  normalWinsContainer.querySelectorAll(".normal-win-game-row").forEach(row => {
    const winsInput = row.querySelector(".game-wins-input");
    const gameSelect = row.querySelector(".custom-game-select");
    const modeSelect = row.querySelector(".custom-game-mode-select");
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
  } else if (hasB2bSegments) {
      groupModeText = "Multi-Group (B2B)";
  }
  
  let penaltiesText = "";
  if (mainFormPenaltiesEnabled) {
      const penaltySourceSelectMain = document.getElementById("penaltySourceSelect");
      const penaltyTabNameMain = penaltySourceSelectMain ? penaltySourceSelectMain.options[penaltySourceSelectMain.selectedIndex]?.text : "Default Penalties";
      penaltiesText = ` w/ ${escapeHtml(penaltyTabNameMain)}`;
  }
  
  groupTypeDisplay.textContent = `${groupModeText}${penaltiesText}`;
}

export function findGameData(gameName, gameMode = null) {
    const gameSourceSelect = document.getElementById("gameSourceSelect");
    const selectedTabId = gameSourceSelect?.value;
    if (!selectedTabId) return null;

    const isLoggedIn = window.IS_AUTHENTICATED === true;
    const sourceEntries = isLoggedIn
        ? window.indexPageGameTabs?.entries || {}
        : getLocalOnlyEntries();
    
    const entriesForSelectedTab = sourceEntries[selectedTabId] || [];
    
    let foundEntry = null;
    if (gameMode && gameMode !== "N/A" && gameMode !== "custom") {
        foundEntry = entriesForSelectedTab.find(entry => 
            (entry?.Spiel || entry?.game)?.trim() === gameName &&
            (entry?.Spielmodus || entry?.gameMode)?.trim() === gameMode
        );
    }
    
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

        let difficultyToUse = 1.0;
        if (gameMode && gameMode !== "N/A" && gameMode !== "custom") {
            const specificModeEntry = entriesForSelectedTab.find(entry => 
                (entry?.Spiel || entry?.game)?.trim() === gameName &&
                (entry?.Spielmodus || entry?.gameMode)?.trim() === gameMode
            );
            if (specificModeEntry) {
                 difficultyToUse = specificModeEntry.difficulty !== undefined ? parseFloat(specificModeEntry.difficulty) : 
                                   specificModeEntry.Schwierigkeit !== undefined ? parseFloat(specificModeEntry.Schwierigkeit) : 1.0;
            } else {
                 difficultyToUse = foundEntry.difficulty !== undefined ? parseFloat(foundEntry.difficulty) : 
                                   foundEntry.Schwierigkeit !== undefined ? parseFloat(foundEntry.Schwierigkeit) : 1.0;
            }
        } else {
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

export function populateGameModeDropdown(selectElement, modes, defaultMode = null) {
    selectElement.innerHTML = "";
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
        selectElement.value = escapeHtml(modes[0]);
    }
}

export function initializeCustomChallengeBuilder() {
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
  
  const mainFormControlsToWatch = [
    "enablePenalties", 
    "penaltySourceSelect",
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
  const numPlayersInput = document.getElementById("num_players");
  if (numPlayersInput) numPlayersInput.addEventListener("input", updateCustomChallengeSummary);
  const maxGroupsInput = document.getElementById("max_groups");
  if (maxGroupsInput) maxGroupsInput.addEventListener("input", updateCustomChallengeSummary);


  updateCustomChallengeSummary();
}

export function addB2bSegmentRow() {
  const b2bSegmentsContainer = document.getElementById("b2bSegmentsContainer");
  if (!b2bSegmentsContainer) return;

  formState.b2bSegmentCounter++; // Use formState
  const segmentDiv = document.createElement("div");
  segmentDiv.className = "b2b-segment card mb-2 p-2";
  segmentDiv.dataset.segmentId = formState.b2bSegmentCounter; // Use formState

  segmentDiv.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-2">
      <h6 class="mb-0">B2B Segment ${formState.b2bSegmentCounter}</h6> 
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
  
  addSingleGameRowToContainer(segmentDiv.querySelector(".b2b-game-rows-container"), true);
  updateCustomChallengeSummary();
}

export function addSingleGameRowToContainer(container, isB2B = false) {
  if (!container) return;

  const gameRow = document.createElement("div");
  gameRow.className = `row mb-1 align-items-center ${isB2B ? 'b2b-segment-game-row' : 'normal-win-game-row'}`;


  const availableGames = getSelectedGamesFromMainTable();
  let gameOptionsHtml = '<option value="" selected disabled>Select Game</option>';
  availableGames.forEach(gameName => {
    gameOptionsHtml += `<option value="${escapeHtml(gameName)}">${escapeHtml(gameName)}</option>`;
  });
  gameOptionsHtml += '<option value="custom">Add Custom Game...</option>';

  gameRow.innerHTML = `
    <div class="col-md-6" data-col-type="game-selection-area">
      <select class="form-control form-control-sm custom-game-select">
        ${gameOptionsHtml}
      </select>
      <div class="custom-game-inputs mt-2" style="display: none; gap: 0.5rem;">
        <input type="text" class="form-control form-control-sm custom-game-name" placeholder="Game Name" style="flex-grow: 1;">
        <input type="number" class="form-control form-control-sm custom-game-difficulty" placeholder="Difficulty" min="0.1" step="0.1" style="width: 60px;">
      </div>
    </div>
    <div class="col-md-2" data-col-type="wins-input">
      <input type="number" class="form-control form-control-sm game-wins-input" value="1" min="1" placeholder="Wins">
    </div>
    <div class="col-md-1" data-col-type="difficulty-display">
      <p class="mb-0 game-difficulty-display text-muted small" style="font-size: 0.75rem;">Diff: -</p>
    </div>
    <div class="col-md-3 text-end" data-col-type="remove-button">
      <button type="button" class="btn btn-outline-danger btn-sm remove-game-row-btn">
        <i class="bi bi-trash"></i>
      </button>
    </div>
  `;
  container.appendChild(gameRow);

  const gameSelectionArea = gameRow.querySelector('[data-col-type="game-selection-area"]');
  const customGameSelect = gameRow.querySelector(".custom-game-select");
  const customGameInputs = gameRow.querySelector(".custom-game-inputs");
  const winsInputColumn = gameRow.querySelector('[data-col-type="wins-input"]');
  const gameDifficultyDisplayColumn = gameRow.querySelector('[data-col-type="difficulty-display"]');
  const removeButtonColumn = gameRow.querySelector('[data-col-type="remove-button"]');

  const customGameNameInput = gameRow.querySelector(".custom-game-name");
  const customGameDifficultyInput = gameRow.querySelector(".custom-game-difficulty");
  const gameDifficultyDisplay = gameRow.querySelector(".game-difficulty-display");

  function updateRowDisplayAndTotalDifficulty() {
    const selectedGameName = customGameSelect.value;
    const winsInput = gameRow.querySelector(".game-wins-input");
    const wins = parseInt(winsInput.value) || 0;

    if (selectedGameName === "custom") {
      customGameSelect.style.display = "none";
      customGameInputs.style.display = "flex";
      gameSelectionArea.classList.remove('col-md-6');
      gameSelectionArea.classList.add('col-md-8');

      winsInputColumn.classList.remove('col-md-2');
      winsInputColumn.classList.add('col-md-2');
      gameDifficultyDisplayColumn.classList.remove('col-md-1');
      gameDifficultyDisplayColumn.classList.add('col-md-1');
      removeButtonColumn.classList.remove('col-md-3');
      removeButtonColumn.classList.add('col-md-1');


      const customDifficulty = parseFloat(customGameDifficultyInput.value) || 0;
      gameDifficultyDisplay.textContent = `Diff: ${(customDifficulty * wins).toFixed(1) || '-'}`;
    } else {
      customGameSelect.style.display = "block";
      customGameInputs.style.display = "none";
      gameSelectionArea.classList.remove('col-md-8');
      gameSelectionArea.classList.add('col-md-6');

      winsInputColumn.classList.remove('col-md-2');
      winsInputColumn.classList.add('col-md-2');
      gameDifficultyDisplayColumn.classList.remove('col-md-1');
      gameDifficultyDisplayColumn.classList.add('col-md-1');
      removeButtonColumn.classList.remove('col-md-1');
      removeButtonColumn.classList.add('col-md-3');


      if (selectedGameName) {
        const gameData = findGameData(selectedGameName);
        const baseDifficulty = gameData ? parseFloat(gameData.difficulty) : 0;
        gameDifficultyDisplay.textContent = `Diff: ${(baseDifficulty * wins).toFixed(1) || '-'}`;
      } else {
        gameDifficultyDisplay.textContent = "Diff: -";
      }
    }
    updateCustomChallengeSummary();
  }

  customGameSelect.addEventListener("change", function() {
    const selectedGameName = this.value;
    if (selectedGameName === "custom") {
      customGameNameInput.value = ""; 
      customGameDifficultyInput.value = "";
    } else if (selectedGameName) {
      const gameData = findGameData(selectedGameName);
    } else {
    }
    updateRowDisplayAndTotalDifficulty();
  });
  
  customGameDifficultyInput.addEventListener('input', function() {
    if (customGameSelect.value === 'custom') {
        updateRowDisplayAndTotalDifficulty();
    }
  });
  
  customGameNameInput.addEventListener('input', updateCustomChallengeSummary);
  gameRow.querySelector(".game-wins-input").addEventListener("input", function() {
    updateRowDisplayAndTotalDifficulty();
    updateCustomChallengeSummary();
  });

  gameRow.querySelector(".remove-game-row-btn").addEventListener("click", function() {
    gameRow.remove();
    updateCustomChallengeSummary();
  });

  if (customGameSelect.value && customGameSelect.value !== "custom") {
      const initialGameData = findGameData(customGameSelect.value);
  }
  updateRowDisplayAndTotalDifficulty();
}

export function handleCreateCustomChallenge() {
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
  
  showError(errorDisplay, null);

  const challengeDataForDisplay = {
    name: customChallengeName || `Custom Challenge ${new Date().toLocaleDateString()}`,
    normal: [],
    b2b: [],
    totalDifficulty: parseFloat(document.getElementById("customChallengeTotalDifficultyDisplay").textContent) || 0,
    groupType: document.getElementById("customChallengeGroupTypeDisplay").textContent || "Single Group"
  };

  const payloadChallengeData = {
      normal: {},
      b2b: []
  };

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
      gameMode = "custom";
      isCustomGame = true;
    } else if (gameSelect.value) {
      gameName = gameSelect.value;
      const selectedMode = modeSelect ? modeSelect.value : null;
      const gameData = findGameData(gameName, selectedMode);
      gameDifficulty = gameData ? parseFloat(gameData.difficulty) : 1.0;
      gameMode = selectedMode || (gameData && gameData.availableModes && gameData.availableModes.length > 0 ? gameData.availableModes[0] : "N/A");
    } else {
      return;
    }
    challengeDataForDisplay.normal.push({ game: gameName, wins: wins, difficulty: gameDifficulty, mode: gameMode, custom: isCustomGame });
    const payloadKeyNormal = `${gameName} (${gameMode === "custom" || gameMode === "N/A" ? "Default" : gameMode})`;
    payloadChallengeData.normal[payloadKeyNormal] = { count: wins, diff: gameDifficulty };
  });

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
        return;
      }
      segmentGamesForDisplay.push({ game: gameName, wins: wins, difficulty: gameDifficulty, mode: gameMode, custom: isCustomGame });
      const payloadKeyB2B = `${gameName} (${gameMode === "custom" || gameMode === "N/A" ? "Default" : gameMode})`;
      segmentGamesForPayloadGroup[payloadKeyB2B] = wins;
      segmentTotalWins += wins;
      segmentTotalDifficulty += wins * gameDifficulty;
    });

    if (segmentGamesForDisplay.length > 0) {
      challengeDataForDisplay.b2b.push(segmentGamesForDisplay);
      payloadChallengeData.b2b.push({
        group: segmentGamesForPayloadGroup,
        length: segmentTotalWins,
        seg_diff: parseFloat(segmentTotalDifficulty.toFixed(1)),
        segment_index_1_based: ++segmentIndex
      });
    }
  });
  
  if (challengeDataForDisplay.normal.length === 0 && payloadChallengeData.b2b.length === 0) {
    showError(errorDisplay, "Please add at least one game to your custom challenge.");
    return;
  }

  const isAuthenticated = window.IS_AUTHENTICATED === true;
  const createCustomChallengeButton = document.getElementById("createCustomChallengeBtn");


  if (isAuthenticated) {
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
        const userMessage = error.message || "An unknown error occurred while creating the custom challenge.";
        showError(errorDisplay, userMessage);
      });

  } else {
    setLoading(createCustomChallengeButton, false);
    let uuid;
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      uuid = crypto.randomUUID();
    } else {
      uuid = generateSimpleUUID();
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
