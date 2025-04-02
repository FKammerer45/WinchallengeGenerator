// static/js/challenge/challenge_form.js

// Import localStorage utilities
import { getLocalTabs as getGameTabs, getLocalEntries, initLocalStorage as initGameStorage } from "../games/localStorageUtils.js";
import { getLocalPenaltyTabs, initPenaltiesLocalStorage } from "../penalties/penaltyLocalStorageUtils.js";

// --- Helper Functions (Internal to this module) ---

function populatePenaltySourceDropdown() {
    const dropdown = document.getElementById("penaltySourceSelect");
    if (!dropdown) return;
    dropdown.innerHTML = "";
    try {
        const tabs = getLocalPenaltyTabs();
        if (!tabs) return;
        for (const tabId in tabs) {
            const option = document.createElement("option");
            option.value = tabId;
            option.textContent = tabs[tabId]?.name || tabId;
            dropdown.appendChild(option);
        }
        console.log("Penalty source dropdown populated.");
    } catch (error) { console.error("Error populating penalty source dropdown:", error); }
}

function populateGameSourceDropdown() {
    const dropdown = document.getElementById("gameSourceSelect");
    if (!dropdown) return;
    dropdown.innerHTML = "";
    try {
        const tabs = getGameTabs();
        if (!tabs) return;
        for (const tabId in tabs) {
            const option = document.createElement("option");
            option.value = tabId;
            option.textContent = tabs[tabId]?.name || tabId;
            dropdown.appendChild(option);
        }
        console.log("Game source dropdown populated.");
    } catch (error) { console.error("Error populating game source dropdown:", error); }
}

function updateGameSelectionCard() {
    const dropdown = document.getElementById("gameSourceSelect");
    const tbody = document.getElementById("gamesSelectionTbody");
    if (!dropdown || !tbody) { console.error("Missing elements for game selection card."); return; }

    const selectedTab = dropdown.value;
    tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-3">Loading games for '${selectedTab}'...</td></tr>`; // Loading indicator

    let entries = [];
    try {
        const allEntries = JSON.parse(localStorage.getItem("localEntries") || "{}");
        entries = allEntries[selectedTab] || [];
    } catch (e) { console.error("Error parsing localEntries:", e); tbody.innerHTML = `<tr><td colspan="3" class="text-danger text-center">Error loading entries.</td></tr>`; return; }

    // Group entries by game name
    const grouped = {};
    entries.forEach(entry => {
        if (!entry?.game) return;
        const gameName = entry.game.trim(); if (!gameName) return;
        if (!grouped[gameName]) {
            grouped[gameName] = { weight: Number(entry.weight) || 1.0, availableModes: new Set() };
        }
        if (entry.gameMode?.trim()) grouped[gameName].availableModes.add(entry.gameMode.trim());
    });
    Object.keys(grouped).forEach(key => { grouped[key].availableModes = Array.from(grouped[key].availableModes).sort(); });

    // Generate HTML table rows
    let html = ""; const gameNames = Object.keys(grouped).sort();
    if (gameNames.length > 0) {
        gameNames.forEach((gameName, index) => {
            const group = grouped[gameName];
            const weightVal = group.weight.toFixed(1);
            const safeGameNameId = gameName.replace(/[^a-zA-Z0-9_-]/g, '-');
            const gameCheckboxId = `game-${safeGameNameId}-${index}`;
            const modalId = `modesModal-${safeGameNameId}-${index}`;
            let modalHtml = "";
            // Generate modal checkboxes
            if (group.availableModes.length > 0) {
                group.availableModes.forEach((mode, i) => { const cbId = `mode-${safeGameNameId}-${index}-${i}`; modalHtml += `<div class="form-check mb-2"><input class="form-check-input allowed-mode-checkbox" type="checkbox" name="allowed_modes_${gameName}[]" value="${mode.replace(/"/g, '&quot;')}" id="${cbId}"><label class="form-check-label ml-1" for="${cbId}">${mode}</label></div>`; });
            } else { modalHtml = "<p class='text-muted'>No specific modes found.</p>"; }
            // Generate table row
            html += `<tr data-game="${gameName}"><td class="align-middle"><input class="form-check-input game-select-checkbox" type="checkbox" name="selected_games" value="${gameName}" id="${gameCheckboxId}"><label class="form-check-label ml-4 font-weight-bold" for="${gameCheckboxId}">${gameName}</label></td><td class="align-middle"><input type="number" name="weights" value="${weightVal}" min="0.1" step="0.1" class="form-control form-control-sm game-weight-input" style="width: 75px;"></td><td class="align-middle">${group.availableModes.length > 0 ? `<button type="button" class="btn btn-sm btn-outline-secondary" data-toggle="modal" data-target="#${modalId}" title="Select modes for ${gameName}">Modes (${group.availableModes.length})</button><div class="modal fade" id="${modalId}" tabindex="-1"><div class="modal-dialog modal-dialog-centered"><div class="modal-content text-dark"><div class="modal-header"><h5 class="modal-title">${gameName} Modes</h5><button type="button" class="close" data-dismiss="modal">&times;</button></div><div class="modal-body">${modalHtml}</div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-dismiss="modal">Done</button></div></div></div></div>` : '<span class="text-muted">N/A</span>'}</td></tr>`;
        });
    } else { html = `<tr><td colspan="3" class="text-center text-muted py-4">No game entries found in this tab.</td></tr>`; }
    tbody.innerHTML = html;
    console.log(`Game selection card updated for tab: ${selectedTab}`);
}


function gatherSelectedModes() {
    const selectedModes = {};
    document.querySelectorAll("#gamesSelectionTbody tr[data-game]").forEach(row => {
        const gameSelectCheckbox = row.querySelector('.game-select-checkbox');
        if (gameSelectCheckbox?.checked) {
            const gameName = row.dataset.game;
            if (gameName) {
                const checkboxes = row.querySelectorAll(`input.allowed-mode-checkbox:checked`); // Simpler query within row
                if (checkboxes.length > 0) {
                    selectedModes[gameName.toLowerCase()] = Array.from(checkboxes).map(cb => cb.value);
                }
            }
        }
    });
    console.log("Gathered selected modes:", selectedModes);
    return selectedModes;
}


function updateFormUI() {
    // --- Mode Selection Logic ---
    const modeSelected = document.querySelector('input[name="group_mode"]:checked')?.value || 'single';
    const maxGroupsContainer = document.getElementById('maxGroupsContainer');
    const numPlayersLabel = document.getElementById('numPlayersLabel');

    if (maxGroupsContainer) {
        maxGroupsContainer.classList.toggle('d-none', modeSelected !== 'multi');
    } else {
        console.warn("UI Update: #maxGroupsContainer not found");
    }

    if (numPlayersLabel) {
        numPlayersLabel.textContent = (modeSelected === 'multi') ? 'Number of Players per group:' : 'Number of Players:';
    } else {
        console.warn("UI Update: #numPlayersLabel not found");
    }

    // --- Penalty Tab Logic ---
    // Use the correct ID for the checkbox from index.html
    const enablePenaltiesCheckbox = document.getElementById('enablePenalties'); // *** CORRECTED ID HERE ***
    // Target the container div for the penalty dropdown, not a non-existent tab link
    const penaltySourceContainer = document.getElementById('penaltySourceContainer'); // *** CORRECTED ID HERE ***

    // Check if both elements were found
    if (enablePenaltiesCheckbox && penaltySourceContainer) {
        // Toggle visibility of the dropdown container based on checkbox state
        penaltySourceContainer.classList.toggle('d-none', !enablePenaltiesCheckbox.checked); // *** CORRECTED TARGET ***
    } else {
        // Log which specific element is missing
        if (!enablePenaltiesCheckbox) console.warn("UI Update: Penalty checkbox (#enablePenalties) not found");
        if (!penaltySourceContainer) console.warn("UI Update: Penalty source container (#penaltySourceContainer) not found");
    }
}

// --- Main Form Submission Handler ---
// In app/static/js/challenge/challenge_form.js

// Ensure gatherSelectedModes is defined in this file or imported correctly

// --- Main Form Submission Handler ---
function handleChallengeFormSubmit(event) {
    event.preventDefault(); // Prevent default form submission
    const form = event.target;
    const formData = new FormData(form);

    // Basic validation
    if (!form.querySelector('input[name="selected_games"]:checked')) {
        alert("Please select at least one game."); return;
    }
    const selectedGameTab = formData.get("game_tab_id");
    if (!selectedGameTab) { alert("Error: No game source tab selected."); return; }

    // Get and process entries from LocalStorage
    let convertedEntries = [];
    try {
        const allEntries = JSON.parse(localStorage.getItem("localEntries") || "{}");
        const entries = allEntries[selectedGameTab] || [];
        if (entries.length === 0) { alert("No game entries in selected source tab."); return; }
        // Convert keys (ensure this matches backend expectations)
        convertedEntries = entries.map(entry => entry ? { id: entry.id, Spiel: String(entry.game || ''), Spielmodus: String(entry.gameMode || ''), Schwierigkeit: parseFloat(entry.difficulty) || 0, Spieleranzahl: parseInt(entry.numberOfPlayers) || 0 } : null).filter(Boolean);
        if (convertedEntries.length === 0) throw new Error("Entries invalid or empty after conversion.");
        formData.append("entries", JSON.stringify(convertedEntries));
    } catch (error) {
        alert(`Error processing game entries: ${error.message}`);
        console.error("Error processing game entries:", error); // Log error too
        return;
    }

    // Append selected modes (ensure gatherSelectedModes function exists in this scope)
    formData.append("selected_modes", JSON.stringify(gatherSelectedModes()));

    // UI Feedback before fetch
    const submitButton = form.querySelector('button[type="submit"]');
    const resultDiv = document.getElementById("challengeResult");
    const shareBtn = document.getElementById("shareChallengeBtn"); // Get share button ref
    const shareResultDiv = document.getElementById('shareResult'); // Get share result ref

    if (submitButton) { submitButton.disabled = true; submitButton.textContent = 'Generating...'; }
    if (resultDiv) { resultDiv.style.display = "block"; resultDiv.innerHTML = '<p class="text-center text-info">Generating challenge, please wait...</p>'; }
    // --- Hide share button and results initially for new generation ---
    if (shareBtn) { shareBtn.style.display = 'none'; }
    if (shareResultDiv) { shareResultDiv.style.display = 'none'; shareResultDiv.innerHTML = ''; }
    // --- End Hide ---

    console.log("Submitting challenge generation request...");

    // Use standard Fetch for FormData
    fetch(window.generateChallengeUrl, { method: "POST", body: formData })
        .then(response => {
            // Try to parse JSON regardless of status for error messages
            return response.json().then(data => ({ ok: response.ok, status: response.status, data }));
        })
        .then(({ ok, status, data }) => { // Destructure the response object
            console.log("Challenge response received:", data);
            if (!ok) { // Handle non-2xx responses
                throw new Error(data?.error || `HTTP ${status}`);
            }

            // Handle potential success response structure variations
            if (data.result) {
                if (resultDiv) resultDiv.innerHTML = data.result; // Display the actual challenge HTML/Text
                // Store FULL response globally for the share button module
                window.currentChallengeData = data;
                // Show the share button again IF it exists (user is logged in)
                if (shareBtn) {
                    console.log("Generation success, showing Share button.");
                    shareBtn.style.display = "inline-block";
                }
            } else if (data.error) { // Handle cases where API returns 2xx but with an error field
                console.error("API returned success status but contained an error:", data.error);
                if (resultDiv) resultDiv.innerHTML = `<p class="text-danger text-center">Error: ${data.error}</p>`;
                alert("Error generating challenge: " + data.error);
            }
            else { // Handle unexpected success response format
                console.warn("Unexpected success response format:", data);
                if (resultDiv) resultDiv.innerHTML = '<p class="text-warning text-center">Received an unexpected response from server.</p>';
                alert("Received an unexpected response from server.");
            }
        })
        .catch(error => {
            console.error("Challenge Generation Fetch/Processing Error:", error);
            if (resultDiv) resultDiv.innerHTML = `<p class="text-danger text-center">Failed to generate challenge: ${error.message}</p>`;
            alert("Failed to generate challenge: " + error.message);
        })
        .finally(() => {
            // Always re-enable submit button
            if (submitButton) { submitButton.disabled = false; submitButton.textContent = 'Generate Challenge'; }
        });
}

// --- Initialization Function ---
export function initializeChallengeForm() {
    // Initialize storage (safe to call multiple times)
    try {
        initGameStorage();
        initPenaltiesLocalStorage();
    } catch (e) { console.error("Error initializing storage:", e); }

    // Find elements
    const challengeForm = document.getElementById("challengeForm");
    const gameSourceSelect = document.getElementById("gameSourceSelect");
    const penaltySourceSelect = document.getElementById("penaltySourceSelect");
    const numPlayersSelect = document.getElementById('numPlayers');

    // Setup UI elements and listeners
    if (gameSourceSelect) {
        populateGameSourceDropdown();
        gameSourceSelect.addEventListener('change', updateGameSelectionCard);
        updateGameSelectionCard(); // Initial population
    } else { console.error("Game source dropdown not found."); }

    if (penaltySourceSelect) {
        populatePenaltySourceDropdown();
    } else { console.error("Penalty source dropdown not found."); }



    if (challengeForm) {
        challengeForm.addEventListener('submit', handleChallengeFormSubmit);
    } else { console.error("Challenge form not found."); }

    console.log("Challenge form initialized.");
}



document.addEventListener('DOMContentLoaded', () => {
    // Listener for Mode radio buttons
    document.querySelectorAll('input[name="group_mode"]').forEach(radio => {
        radio.addEventListener('change', updateFormUI);
    });

    // Listener for Penalty checkbox
    const penaltyCheckbox = document.getElementById('enablePenalties');
    if (penaltyCheckbox) {
        penaltyCheckbox.addEventListener('change', updateFormUI);
    }

    // Initial UI setup on page load
    updateFormUI();

    // ... rest of your existing challenge_form.js listeners (validation, etc.) ...
});
