// challenge.js
import { initLocalStorage, getLocalTabs } from "../games/localStorageUtils.js";
import { renderGamesForTab } from "../games/entryManagement.js";

// -------------------------
// Populate Game Source Dropdown on the challenge page
// -------------------------
export function populateGameSourceDropdown() {
  const dropdown = document.getElementById("gameSourceSelect");
  if (!dropdown) {
    console.error("Dropdown with id 'gameSourceSelect' not found.");
    return;
  }
  dropdown.innerHTML = "";
  const tabs = getLocalTabs();
  // Loop through all keys in the localTabs object
  for (const tabId in tabs) {
    const option = document.createElement("option");
    option.value = tabId;
    // Use the name property if available; otherwise use the key itself
    option.textContent = tabs[tabId].name || tabId;
    dropdown.appendChild(option);
  }
}

// -------------------------
// Update the Game Selection Card (Challenge Form)
// -------------------------
export function updateGameSelectionCard() {
  const dropdown = document.getElementById("gameSourceSelect");
  if (!dropdown) {
    console.error("Dropdown with id 'gameSourceSelect' not found.");
    return;
  }
  const selectedTab = dropdown.value;
  // Retrieve local entries from localStorage
  const allEntries = JSON.parse(localStorage.getItem("localEntries") || "{}");
  const entries = allEntries[selectedTab] || [];

  // Group entries by game name.
  const grouped = {};
  entries.forEach(entry => {
    const gameName = entry.game || "";
    if (!gameName) return;
    if (!grouped[gameName]) {
      grouped[gameName] = { weight: entry.weight || 1, availableModes: new Set() };
    }
    if (entry.gameMode) {
      grouped[gameName].availableModes.add(entry.gameMode);
    }
  });
  // Convert each set of available modes into an array.
  Object.keys(grouped).forEach(key => {
    grouped[key].availableModes = Array.from(grouped[key].availableModes);
  });

  let html = "";
  const gameNames = Object.keys(grouped);
  if (gameNames.length > 0) {
    gameNames.forEach((gameName, index) => {
      const group = grouped[gameName];
      const weightVal = group.weight;
      const modalId = `modesModal${index + 1}`;
      let modalHtml = "";
      group.availableModes.forEach((mode, i) => {
        const checkboxId = `modal-${index + 1}-${i + 1}`;
        modalHtml += `
          <div class="form-check mb-2">
            <input class="form-check-input" type="checkbox" name="allowed_modes_${gameName}[]" value="${mode}" id="${checkboxId}">
            <label class="form-check-label ml-1" for="${checkboxId}">${mode}</label>
          </div>
        `;
      });
      html += `
        <tr data-game="${gameName}">
          <td>
            <input class="form-check-input" type="checkbox" name="selected_games" value="${gameName}" id="game${index + 1}"
              style="margin-left: 3px; margin-top:10px; margin-right:8px; vertical-align: middle;">
            <label class="form-check-label" for="game${index + 1}" style="margin-left: 20px; font-weight:bold; vertical-align: middle;">
              ${gameName}
            </label>
          </td>
          <td>
            <input type="number" name="weights" value="${weightVal}" step="0.1" style="width:70px; background-color:#2B2B2B; color:#fff; border:none;">
          </td>
          <td>
            <button type="button" class="btn btn-sm btn-secondary" data-toggle="modal" data-target="#${modalId}">
              Select Mode
            </button>
            <div class="modal fade" id="${modalId}" tabindex="-1" role="dialog" aria-labelledby="${modalId}Label" aria-hidden="true">
              <div class="modal-dialog" role="document">
                <div class="modal-content" style="color:#000;">
                  <div class="modal-header">
                    <h5 class="modal-title" id="${modalId}Label">Gamemodes for ${gameName}</h5>
                    <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                      <span aria-hidden="true">&times;</span>
                    </button>
                  </div>
                  <div class="modal-body">
                    ${modalHtml}
                  </div>
                  <div class="modal-footer">
                    <button type="button" class="btn btn-primary" data-dismiss="modal">Save</button>
                  </div>
                </div>
              </div>
            </div>
          </td>
        </tr>
      `;
    });
  } else {
    html = `<tr><td colspan="3">No games found in the selected source.</td></tr>`;
  }
  const tbody = document.getElementById("gamesSelectionTbody");
  if (tbody) {
    tbody.innerHTML = html;
  } else {
    console.error("Table body with id 'gamesSelectionTbody' not found.");
  }
}

// -------------------------
// Gather Selected Allowed Modes from Checkboxes
// -------------------------
export function gatherSelectedModes() {
  const selectedModes = {};
  const rows = document.querySelectorAll("#gamesSelectionTbody tr");
  rows.forEach(row => {
    const gameName = row.getAttribute("data-game");
    if (gameName) {
      // Find all checked checkboxes for this game.
      const checkboxes = row.querySelectorAll(`input[name="allowed_modes_${gameName}[]"]:checked`);
      if (checkboxes.length > 0) {
        selectedModes[gameName.toLowerCase()] = Array.from(checkboxes).map(cb => cb.value);
      }
    }
  });
  return selectedModes;
}

// -------------------------
// Attach Challenge Form Handler (Challenge Page)
// -------------------------
export function attachChallengeFormHandler() {
  const challengeForm = document.getElementById("challengeForm");
  if (!challengeForm) {
    console.error("Challenge form with id 'challengeForm' not found.");
    return;
  }
  challengeForm.addEventListener("submit", function (e) {
    console.log("Submit event listener triggered!");
    e.preventDefault();
    const formData = new FormData(this);
    const selectedTab = document.getElementById("gameSourceSelect").value;

    // Retrieve and parse local entries from localStorage.
    // Inside attachChallengeFormHandler function

    // ... (after creating formData and getting selectedTab) ...

    // Retrieve and parse local entries from localStorage.
    let allEntries;
    try {
      console.log("Attempting to parse localEntries from localStorage"); // <-- ADD LOG
      const rawEntriesString = localStorage.getItem("localEntries"); // <-- Get raw string
      console.log("Raw localEntries string:", rawEntriesString); // <-- ADD LOG
      allEntries = JSON.parse(rawEntriesString || "{}");
      console.log("Parsed allEntries object:", allEntries); // <-- ADD LOG
    } catch (error) {
      console.error("Error parsing localEntries from localStorage:", error);
      allEntries = {};
    }
    const entries = allEntries[selectedTab] || [];
    console.log("Selected Tab ID:", selectedTab); // <-- ADD LOG (Should be "default")
    console.log("Entries retrieved for selected tab:", entries); // <-- ADD LOG (CRUCIAL: Does this show your entries?)

    if (entries.length === 0) {
      alert("JS Check: No game entries found for the selected tab. Please add entries before generating a challenge.");
      console.error("JS Check failed: No entries found for tab", selectedTab); // Log if JS check fails
      return;
    }

    // Convert keys for the server.
    const convertedEntries = entries.map(entry => {
      // Add log inside map to check each entry being converted
      console.log("Attempting to convert entry:", entry);
      if (!entry || typeof entry.id === 'undefined' || typeof entry.game === 'undefined' || typeof entry.gameMode === 'undefined' || typeof entry.difficulty === 'undefined' || typeof entry.numberOfPlayers === 'undefined') {
        console.error("Malformed entry found in localStorage during conversion:", entry);
        return null; // Return null for malformed entries
      }
      return {
        id: entry.id,
        Spiel: entry.game,
        Spielmodus: entry.gameMode,
        Schwierigkeit: entry.difficulty,
        Spieleranzahl: entry.numberOfPlayers
        // tabName might not be needed by the backend here
      };
    }).filter(entry => entry !== null); // Filter out any nulls from malformed entries

    console.log("Entries after key conversion:", convertedEntries); // <-- ADD LOG (Check the result of conversion)

    const entriesJsonString = JSON.stringify(convertedEntries);
    console.log("Final JSON string being sent for 'entries':", entriesJsonString); // <-- ADD LOG (Check the final string)

    formData.append("entries", entriesJsonString);

    // Gather selected allowed modes and add them to the form data.
    const selectedModes = gatherSelectedModes();
    formData.append("selected_modes", JSON.stringify(selectedModes));

    console.log("FormData 'entries' value check:", formData.get("entries")); // <-- ADD LOG (Check FormData)
    console.log("FormData 'selected_modes' value check:", formData.get("selected_modes")); // <-- ADD LOG (Check FormData)


    // fetch call follows...
    fetch(window.generateChallengeUrl, {
      //...
    })
    //...
    fetch(window.generateChallengeUrl, {
      method: "POST",
      body: formData
    })
      .then(response => response.json())
      .then(data => {
        if (data.error) {
          alert(data.error);
        } else {
          const resultDiv = document.getElementById("challengeResult");
          resultDiv.style.display = "block";
          resultDiv.innerHTML = data.result;
          window.currentChallengeData = data;
          document.getElementById("acceptBtn").style.display = "inline-block";
        }
      })
      .catch(error => console.error("Error during challenge generation:", error));
  });
}


document.addEventListener("DOMContentLoaded", () => {
  populateGameSourceDropdown();
  updateGameSelectionCard();
  attachChallengeFormHandler()
   // Populate dropdown and add listener for changes
   if (gameSourceSelect) {
    populateGameSourceDropdown();
    // Add listener to update game list when dropdown changes
    gameSourceSelect.addEventListener('change', updateGameSelectionCard);
} else {
    console.error("Game source dropdown ('gameSourceSelect') not found on page load.");
}

// Initial population of the game selection table
if (gamesSelectionTbody) {
     updateGameSelectionCard();
} else {
     console.error("Game selection table body ('gamesSelectionTbody') not found on page load.");
}

// Attach the crucial submit handler
if (challengeForm) {
    attachChallengeFormHandler(); // <-- THE MISSING CALL
} else {
    console.error("Challenge form ('challengeForm') not found on page load.");
}
});