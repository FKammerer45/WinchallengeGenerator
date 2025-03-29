// challenge.js
import { getLocalTabs, getLocalEntries, initLocalStorage } from "../games/localStorageUtils.js"; // Added initLocalStorage just in case
// import { renderGamesForTab } from "../games/entryManagement.js"; // Import seems unused here

// -------------------------
// Populate Game Source Dropdown
// -------------------------
export function populateGameSourceDropdown() {
  const dropdown = document.getElementById("gameSourceSelect");
  if (!dropdown) {
    console.error("Dropdown with id 'gameSourceSelect' not found.");
    return;
  }
  dropdown.innerHTML = ""; // Clear existing options
  try {
    const tabs = getLocalTabs(); // Assumes localStorage is initialized
    if (!tabs) {
        console.error("Failed to get tabs from local storage.");
        // Optionally add a default option or error message
        return;
    }
    // Add default tab first if desired, or just loop
    // const defaultOption = document.createElement("option");
    // defaultOption.value = "default";
    // defaultOption.textContent = tabs["default"]?.name || "Default"; // Use optional chaining
    // dropdown.appendChild(defaultOption);

    for (const tabId in tabs) {
        // if (tabId === "default") continue; // Skip if added above
        const option = document.createElement("option");
        option.value = tabId;
        option.textContent = tabs[tabId]?.name || tabId; // Use optional chaining
        dropdown.appendChild(option);
    }
  } catch (error) {
      console.error("Error populating game source dropdown:", error);
      // Display error to user?
  }
}

// -------------------------
// Update the Game Selection Card (Challenge Form)
// -------------------------
export function updateGameSelectionCard() {
  const dropdown = document.getElementById("gameSourceSelect");
  const tbody = document.getElementById("gamesSelectionTbody"); // Target table body

  if (!dropdown || !tbody) {
    console.error("Required elements ('gameSourceSelect' or 'gamesSelectionTbody') not found for updateGameSelectionCard.");
    if(tbody) tbody.innerHTML = `<tr><td colspan="3">Error loading games list.</td></tr>`;
    return;
  }

  const selectedTab = dropdown.value;
  let entries = [];
  try {
      const allEntries = JSON.parse(localStorage.getItem("localEntries") || "{}");
      entries = allEntries[selectedTab] || [];
  } catch(e) {
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

// -------------------------
// Attach Challenge Form Handler (Main Logic)
// -------------------------
export function attachChallengeFormHandler() {
  const challengeForm = document.getElementById("challengeForm");
  if (!challengeForm) {
    console.error("Challenge form ('challengeForm') not found. Cannot attach submit handler.");
    return;
  }
  challengeForm.addEventListener("submit", function (e) {
    console.log("Challenge form submitted! Preventing default...");
    e.preventDefault(); // Prevent standard form submission

    const formData = new FormData(this); // Collects standard form fields (players, diff, b2b, checked games, weights)
    const selectedTab = document.getElementById("gameSourceSelect")?.value; // Safely get value

    if (!selectedTab) {
        alert("Error: No game source tab selected.");
        console.error("No value found for #gameSourceSelect");
        return;
    }

    // --- Retrieve and prepare entries ---
    let entries = [];
    let convertedEntries = [];
    try {
        const allEntries = JSON.parse(localStorage.getItem("localEntries") || "{}");
        entries = allEntries[selectedTab] || [];
        console.log(`Entries retrieved for selected tab '${selectedTab}':`, entries.length);

        if (entries.length === 0) {
            alert("No game entries found in the selected source tab. Please add entries on the 'Games' page or select a different source.");
            console.warn("JS Check: No entries found for tab", selectedTab);
            return; // Stop submission if no entries
        }

        // Convert keys for the backend
        convertedEntries = entries.map(entry => {
            if (!entry || typeof entry.id === 'undefined' || typeof entry.game === 'undefined' || typeof entry.gameMode === 'undefined' || typeof entry.difficulty === 'undefined' || typeof entry.numberOfPlayers === 'undefined') {
                console.warn("Skipping malformed entry during conversion:", entry);
                return null; // Skip malformed entries
            }
            // Ensure types are somewhat reasonable for backend (backend does final conversion)
            return {
                id: entry.id,
                Spiel: String(entry.game),
                Spielmodus: String(entry.gameMode),
                Schwierigkeit: parseFloat(entry.difficulty) || 0, // Default to 0 if conversion fails
                Spieleranzahl: parseInt(entry.numberOfPlayers) || 0 // Default to 0 if conversion fails
            };
        }).filter(entry => entry !== null); // Remove skipped entries

        console.log("Entries after key conversion:", convertedEntries.length);

        if (convertedEntries.length === 0 && entries.length > 0) {
             alert("Error processing entries. Check console for details about malformed entries.");
             console.error("All entries were considered malformed during conversion.");
             return; // Stop if conversion failed for all
        }

    } catch (error) {
        console.error("Error reading or processing entries from localStorage:", error);
        alert("Error reading game entries. Check console for details.");
        return;
    }

    // --- Append additional data to FormData ---
    const entriesJsonString = JSON.stringify(convertedEntries);
    formData.append("entries", entriesJsonString);
    console.log("Appended 'entries' JSON string:", entriesJsonString);

    const selectedModes = gatherSelectedModes();
    const selectedModesJsonString = JSON.stringify(selectedModes);
    formData.append("selected_modes", selectedModesJsonString);
    console.log("Appended 'selected_modes' JSON string:", selectedModesJsonString);

    // Optional: Log FormData contents for debugging before fetch
    // for (let [key, value] of formData.entries()) { console.log(`FormData Check: ${key}=${value}`); }

    // --- Perform Fetch Request ---
    const submitButton = challengeForm.querySelector('button[type="submit"]');
    if(submitButton) submitButton.disabled = true; // Disable button during request

    fetch(window.generateChallengeUrl, { // URL set in index.html
      method: "POST",
      body: formData
      // No 'Content-Type' header needed for FormData; browser sets it with boundary
      // CSRF token is sent as a hidden field in the form, collected by new FormData()
    })
    .then(response => {
        if (!response.ok) {
            // Try to get error message from JSON response body
            return response.json().catch(() => {
                 // If body isn't JSON or empty, use status text
                 throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
            }).then(errData => {
                 // Throw error with message from server JSON if available
                 throw new Error(errData.error || `HTTP error ${response.status}`);
            });
        }
        return response.json(); // Parse successful JSON response
    })
    .then(data => {
      console.log("Received challenge generation response:", data);
      if (data.error) {
        // Display server-side error message
        alert("Error generating challenge: " + data.error);
      } else if (data.result) {
        // Success! Display result.
        const resultDiv = document.getElementById("challengeResult");
        const acceptBtn = document.getElementById("acceptBtn");
        if(resultDiv && acceptBtn) {
            resultDiv.style.display = "block";
            resultDiv.innerHTML = data.result; // Assumes data.result is safe HTML from server
            window.currentChallengeData = data; // Store data for potential 'accept' action
            acceptBtn.style.display = "inline-block";
        } else {
            console.error("Result display elements ('challengeResult' or 'acceptBtn') not found.");
            alert("Challenge generated, but result area not found on page.");
        }
      } else {
           console.error("Received unexpected success response structure:", data);
           alert("Received an unexpected response from the server.");
      }
    })
    .catch(error => {
      console.error("Error during challenge generation fetch:", error);
      alert("Failed to generate challenge: " + error.message);
    })
    .finally(() => {
         if(submitButton) submitButton.disabled = false; // Re-enable button
    });
  });
  console.log("Challenge form submit handler attached.");
}


// -------------------------
// DOMContentLoaded Listener (Initialization)
// -------------------------
document.addEventListener("DOMContentLoaded", () => {
    console.log("challenge.js: DOMContentLoaded");
    // Ensure localStorage is initialized (safe to call multiple times)
    try {
      initLocalStorage();
    } catch (e) { console.error("Error initializing local storage:", e); }


    // Get references to elements needed for initialization
    const challengeForm = document.getElementById("challengeForm");
    const gameSourceSelect = document.getElementById("gameSourceSelect");
    const gamesSelectionTbody = document.getElementById("gamesSelectionTbody");

    // Populate dropdown and add listener for changes
    if (gameSourceSelect) {
        populateGameSourceDropdown();
        gameSourceSelect.addEventListener('change', updateGameSelectionCard);
        console.log("Game source dropdown populated and change listener added.");
    } else {
        console.error("Game source dropdown ('gameSourceSelect') not found.");
    }

    // Initial population of the game selection table
    if (gamesSelectionTbody) {
         updateGameSelectionCard();
         console.log("Initial game selection card populated.");
    } else {
         console.error("Game selection table body ('gamesSelectionTbody') not found.");
    }

    // Attach the form submit handler
    if (challengeForm) {
        attachChallengeFormHandler(); // <-- Ensure this is called
    } else {
        console.error("Challenge form ('challengeForm') not found. Cannot attach submit handler.");
    }
});