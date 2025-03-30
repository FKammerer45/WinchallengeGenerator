// challenge.js
import { getLocalTabs as getGameTabs, getLocalEntries, initLocalStorage as initGameStorage } from "../games/localStorageUtils.js";
import { getLocalPenaltyTabs, initPenaltiesLocalStorage } from "../penalties/penaltyLocalStorageUtils.js";

// -------------------------
// Populate Game Source Dropdown
// -------------------------
export function populatePenaltySourceDropdown() {
  const dropdown = document.getElementById("penaltySourceSelect");
  if (!dropdown) { console.warn("Penalty source dropdown not found."); return; }
  dropdown.innerHTML = "";
  try {
    const tabs = getLocalPenaltyTabs(); // Use penalty getter
    if (!tabs) { console.error("Failed to get penalty tabs."); return; }
    for (const tabId in tabs) {
      const option = document.createElement("option");
      option.value = tabId; // e.g., "default" or "penaltyPane-1"
      option.textContent = tabs[tabId]?.name || tabId;
      dropdown.appendChild(option);
    }
    console.log("Penalty source dropdown populated.");
  } catch (error) { console.error("Error populating penalty source dropdown:", error); }
}


export function populateGameSourceDropdown() {
  const dropdown = document.getElementById("gameSourceSelect");
  if (!dropdown) { console.error("Game source dropdown not found."); return; }
  dropdown.innerHTML = "";
  try {
    const tabs = getGameTabs(); // Use game getter
    if (!tabs) { console.error("Failed to get game tabs."); return; }
    for (const tabId in tabs) {
      const option = document.createElement("option");
      option.value = tabId;
      option.textContent = tabs[tabId]?.name || tabId;
      dropdown.appendChild(option);
    }
    console.log("Game source dropdown populated.");
  } catch (error) { console.error("Error populating game source dropdown:", error); }
}

// -------------------------
// Update the Game Selection Card (Challenge Form)
// -------------------------
export function updateGameSelectionCard() {
  const dropdown = document.getElementById("gameSourceSelect");
  const tbody = document.getElementById("gamesSelectionTbody"); // Target table body

  if (!dropdown || !tbody) {
    console.error("Required elements ('gameSourceSelect' or 'gamesSelectionTbody') not found for updateGameSelectionCard.");
    if (tbody) tbody.innerHTML = `<tr><td colspan="3">Error loading games list.</td></tr>`;
    return;
  }

  const selectedTab = dropdown.value;
  let entries = [];
  try {
    const allEntries = JSON.parse(localStorage.getItem("localEntries") || "{}");
    entries = allEntries[selectedTab] || [];
  } catch (e) {
    console.error("Error parsing localEntries:", e);
    tbody.innerHTML = `<tr><td colspan="3">Error loading entries from storage.</td></tr>`;
    return;
  }

  // Group entries by game name.
  const grouped = {};
  entries.forEach(entry => {
    // Basic check for valid entry structure
    if (!entry || typeof entry.game !== 'string' || !entry.game) return;
    const gameName = entry.game.trim();
    if (!gameName) return;

    if (!grouped[gameName]) {
      // Ensure weight is a number, default to 1
      const weight = (typeof entry.weight === 'number' && !isNaN(entry.weight)) ? entry.weight : 1;
      grouped[gameName] = { weight: weight, availableModes: new Set() };
    }
    if (entry.gameMode && typeof entry.gameMode === 'string' && entry.gameMode.trim()) {
      grouped[gameName].availableModes.add(entry.gameMode.trim());
    }
  });

  // Convert Set to Array
  Object.keys(grouped).forEach(key => {
    grouped[key].availableModes = Array.from(grouped[key].availableModes).sort(); // Sort modes alphabetically
  });

  // Generate HTML
  let html = "";
  const gameNames = Object.keys(grouped).sort(); // Sort game names alphabetically

  if (gameNames.length > 0) {
    gameNames.forEach((gameName, index) => {
      const group = grouped[gameName];
      const weightVal = group.weight;
      // Generate unique IDs based on gameName (safer than index if list changes)
      const safeGameNameId = gameName.replace(/[^a-zA-Z0-9]/g, '-'); // Sanitize name for ID
      const gameCheckboxId = `game-${safeGameNameId}`;
      const modalId = `modesModal-${safeGameNameId}`;
      let modalHtml = "";

      // Generate modal checkboxes
      if (group.availableModes.length > 0) {
        group.availableModes.forEach((mode, i) => {
          const checkboxId = `mode-${safeGameNameId}-${i}`;
          // Ensure mode value is properly escaped for HTML attributes if needed
          const escapedMode = mode.replace(/"/g, '&quot;');
          modalHtml += `
                <div class="form-check mb-2">
                  <input class="form-check-input" type="checkbox" name="allowed_modes_${gameName}[]" value="${escapedMode}" id="${checkboxId}">
                  <label class="form-check-label ml-1" for="${checkboxId}">${mode}</label>
                </div>`;
        });
      } else {
        modalHtml = "<p>No specific modes found for this game.</p>";
      }

      // Generate table row HTML
      html += `
        <tr data-game="${gameName}">
          <td>
            <input class="form-check-input game-select-checkbox" type="checkbox" name="selected_games" value="${gameName}" id="${gameCheckboxId}"
                   style="margin-left: 3px; margin-top:10px; margin-right:8px; vertical-align: middle;">
            <label class="form-check-label" for="${gameCheckboxId}" style="margin-left: 20px; font-weight:bold; vertical-align: middle;">
              ${gameName}
            </label>
          </td>
          <td>
            <input type="number" name="weights" value="${weightVal}" min="0.1" step="0.1" class="form-control form-control-sm game-weight-input"
                   style="width:70px; background-color:#2B2B2B; color:#fff; border:none;">
          </td>
          <td>
            ${group.availableModes.length > 0 ? `
            <button type="button" class="btn btn-sm btn-secondary" data-toggle="modal" data-target="#${modalId}">
              Select Modes (${group.availableModes.length})
            </button>
            <div class="modal fade" id="${modalId}" tabindex="-1" role="dialog" aria-labelledby="${modalId}Label" aria-hidden="true">
              <div class="modal-dialog" role="document">
                <div class="modal-content text-dark"> <div class="modal-header">
                    <h5 class="modal-title" id="${modalId}Label">Select Modes for ${gameName}</h5>
                    <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                      <span aria-hidden="true">&times;</span>
                    </button>
                  </div>
                  <div class="modal-body">
                    ${modalHtml}
                  </div>
                  <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
                    </div>
                </div>
              </div>
            </div>
            ` : '<span class="text-muted">N/A</span>'}
          </td>
        </tr>`;
    });
  } else {
    html = `<tr><td colspan="3" class="text-center text-muted">No game entries found in the selected source tab. Add entries on the 'Games' page.</td></tr>`;
  }

  tbody.innerHTML = html; // Update table body
}


// -------------------------
// Gather Selected Allowed Modes from Checkboxes
// -------------------------
export function gatherSelectedModes() {
  const selectedModes = {};
  // Ensure querySelectorAll runs *after* updateGameSelectionCard potentially updated the DOM
  const rows = document.querySelectorAll("#gamesSelectionTbody tr[data-game]"); // More specific selector

  rows.forEach(row => {
    const gameName = row.getAttribute("data-game");
    if (gameName) {
      // Find all checked checkboxes within this row's scope (or related modal if structure changes)
      const checkboxes = row.querySelectorAll(`input[name="allowed_modes_${gameName}[]"]:checked`);
      if (checkboxes.length > 0) {
        selectedModes[gameName.toLowerCase()] = Array.from(checkboxes).map(cb => cb.value);
      }
      // If no checkboxes are checked for a selected game, backend should treat as 'all allowed' (per its logic)
    }
  });
  console.log("Gathered selected modes:", selectedModes); // Keep log for debugging
  return selectedModes;
}


function updatePlayerNameInputs() {
  console.log("updatePlayerNameInputs called"); // Log function call
  const numPlayersSelect = document.getElementById('numPlayers');
  const container = document.getElementById('playerNamesContainer');

  // Ensure elements exist before proceeding
  if (!numPlayersSelect) {
    console.error("#numPlayers select element not found!");
    return;
  }
  if (!container) {
    console.error("#playerNamesContainer div not found!");
    return;
  }

  let numPlayers = 1; // Default to 1
  try {
    numPlayers = parseInt(numPlayersSelect.value, 10);
    if (isNaN(numPlayers)) { // Handle case where value is not a number
      console.warn("Could not parse number of players, defaulting to 1.");
      numPlayers = 1;
    }
  } catch (e) {
    console.error("Error parsing number of players:", e);
    numPlayers = 1; // Default on error
  }

  console.log("Number of players selected:", numPlayers);

  const body = container.querySelector('.card-body') || container; // Use container itself if no card-body found
  const existingLabel = body.querySelector('label'); // Find label if exists

  // Clear only existing player input groups (more specific than innerHTML='')
  body.querySelectorAll('.player-name-input-group').forEach(group => group.remove());

  if (numPlayers > 1) {
    container.style.display = 'block'; // Show container
    // Ensure label exists
    if (!existingLabel) {
      const newLabel = document.createElement('label');
      newLabel.classList.add('font-weight-bold', 'd-block', 'mb-2'); // Make label block for spacing
      newLabel.textContent = "Enter Player Names:";
      body.insertBefore(newLabel, body.firstChild); // Add label at the start
    }

    // Add new input groups
    for (let i = 1; i <= numPlayers; i++) {
      const div = document.createElement('div');
      // Add specific class for easy removal later
      div.classList.add('form-group', 'form-group-sm', 'player-name-input-group');
      div.innerHTML = `
              <label for="playerName${i}" class="sr-only">Player ${i} Name</label> <input type="text" class="form-control form-control-sm" id="playerName${i}" name="player_names[]" placeholder="Player ${i} Name" required>
           `;
      body.appendChild(div);
    }
    console.log(`Showing ${numPlayers} player name inputs.`);
  } else {
    container.style.display = 'none'; // Hide container
    console.log("Hiding player name inputs.");
  }
}

// -------------------------
// Attach Challenge Form Handler (Main Logic)
// -------------------------
export function attachChallengeFormHandler() {
  // ... (Keep the version from the previous step that includes parsing all form data correctly) ...
  const challengeForm = document.getElementById("challengeForm"); if (!challengeForm) { /*...*/ return; }
  challengeForm.addEventListener("submit", function (e) {
    console.log("Challenge form submit listener triggered.");
    e.preventDefault();
    const formData = new FormData(this);
    const selectedGameTab = document.getElementById("gameSourceSelect")?.value;
    if (!selectedGameTab) { /*...*/ return; }
    let entries = []; let convertedEntries = [];
    try { /*... get/parse/check/convert entries ...*/ const allEntries = JSON.parse(localStorage.getItem("localEntries") || "{}"); entries = allEntries[selectedGameTab] || []; if (entries.length === 0) { alert("No game entries in selected source."); return; } convertedEntries = entries.map(entry => { if (!entry || typeof entry.id === 'undefined' || typeof entry.game === 'undefined' || typeof entry.gameMode === 'undefined' || typeof entry.difficulty === 'undefined' || typeof entry.numberOfPlayers === 'undefined') { console.warn("Skipping malformed entry:", entry); return null; } return { id: entry.id, Spiel: String(entry.game), Spielmodus: String(entry.gameMode), Schwierigkeit: parseFloat(entry.difficulty) || 0, Spieleranzahl: parseInt(entry.numberOfPlayers) || 0 }; }).filter(entry => entry !== null); if (convertedEntries.length === 0 && entries.length > 0) { alert("Error processing entries."); return; } } catch (error) { console.error("Error processing game entries:", error); alert("Error reading game entries."); return; }
    formData.append("entries", JSON.stringify(convertedEntries));
    const selectedModes = gatherSelectedModes(); formData.append("selected_modes", JSON.stringify(selectedModes));
    const usePenaltiesCheckbox = document.getElementById("usePenaltiesCheckbox"); if (usePenaltiesCheckbox?.checked) { const selectedPenaltyTab = document.getElementById("penaltySourceSelect")?.value; if (!selectedPenaltyTab) { alert("Penalties checked, but no penalty source selected."); return; } }
    console.log("Submitting challenge generation request..."); const submitButton = challengeForm.querySelector('button[type="submit"]'); if (submitButton) submitButton.disabled = true;
    fetch(window.generateChallengeUrl, { method: "POST", body: formData })
      .then(response => { /*...*/ if (!response.ok) { return response.json().catch(() => ({})).then(err => { throw new Error(err.error || `HTTP ${response.status}`) }) } return response.json(); })
      .then(data => { /*...*/ console.log("Challenge response:", data); if (data.error) { alert("Error: " + data.error); } else if (data.result) { const resultDiv = document.getElementById("challengeResult"); const acceptBtn = document.getElementById("acceptBtn"); if (resultDiv && acceptBtn) { resultDiv.style.display = "block"; resultDiv.innerHTML = data.result; window.currentChallengeData = data; acceptBtn.style.display = "inline-block"; } else { alert("Challenge generated, but result area not found."); } } else { alert("Unexpected response."); } })
      .catch(error => { console.error("Fetch Error:", error); alert("Failed to generate challenge: " + error.message); })
      .finally(() => { if (submitButton) submitButton.disabled = false; });
  });
  console.log("Challenge form submit handler attached.");
}


// --- DOMContentLoaded Listener (Initialization) --- (No changes needed from previous version)
document.addEventListener("DOMContentLoaded", () => {
  console.log("challenge.js: DOMContentLoaded");
  try { initGameStorage(); initPenaltiesLocalStorage(); } catch (e) { console.error("Error initializing storage:", e); }
  const challengeForm = document.getElementById("challengeForm"); const gameSourceSelect = document.getElementById("gameSourceSelect"); const penaltySourceSelect = document.getElementById("penaltySourceSelect"); const gamesSelectionTbody = document.getElementById("gamesSelectionTbody"); const numPlayersSelect = document.getElementById('numPlayers');
  if (gameSourceSelect) { populateGameSourceDropdown(); gameSourceSelect.addEventListener('change', updateGameSelectionCard); } else { console.error("Game source dropdown not found."); }
  if (penaltySourceSelect) { populatePenaltySourceDropdown(); } else { console.error("Penalty source dropdown not found."); }
  if (gamesSelectionTbody) { updateGameSelectionCard(); } else { console.error("Game selection table body not found."); }
  if (numPlayersSelect) { numPlayersSelect.addEventListener('change', updatePlayerNameInputs); updatePlayerNameInputs(); } else { console.error("Number of players select not found."); }
  if (challengeForm) { attachChallengeFormHandler(); } else { console.error("Challenge form not found."); }
});