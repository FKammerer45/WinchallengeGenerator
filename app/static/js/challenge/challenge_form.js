// static/js/challenge/challenge_form.js

// Import localStorage utilities
import { getLocalTabs as getGameTabs, getLocalEntries, initLocalStorage as initGameStorage } from "../games/localStorageUtils.js";
import { getLocalPenaltyTabs, initPenaltiesLocalStorage } from "../penalties/penaltyLocalStorageUtils.js";
// Import the local storage saver function
import { saveChallengeToLocalStorage } from './local_challenge_storage.js';

// --- Helper: Update Form UI based on Mode/Penalty selection ---
// Flag to prevent recursion during mode change for anonymous users
let isForcingMode = false;

function updateIndexFormUI() {
    if (isForcingMode) return; // Prevent loops if we force 'single' mode

    // --- Mode Selection Logic ---
    const modeSelectedRadio = document.querySelector('input[name="group_mode"]:checked');
    const modeSelected = modeSelectedRadio?.value || 'single';
    const maxGroupsContainer = document.getElementById('maxGroupsContainer');
    const numPlayersLabel = document.getElementById('numPlayersLabel');
    const loginRequiredMsg = document.querySelector('.login-required-msg');

    // Check auth status from global variable (set in index.html)
    const isAuthenticated = window.IS_AUTHENTICATED === true;

    if (modeSelected === 'multi' && !isAuthenticated) {
        console.warn("Anonymous user tried to select Multigroup. Reverting.");
        isForcingMode = true;
        const singleRadio = document.getElementById('modeSingleGroup');
        if (singleRadio) singleRadio.checked = true;
        if (loginRequiredMsg) loginRequiredMsg.classList.remove('d-none');
        // Force UI update to reflect 'single' state immediately
        if (maxGroupsContainer) maxGroupsContainer.classList.add('d-none');
        if (numPlayersLabel) numPlayersLabel.textContent = 'Number of Players:';
        // Optionally hide message after delay
        // setTimeout(() => { if (loginRequiredMsg) loginRequiredMsg.classList.add('d-none'); }, 4000);
        isForcingMode = false;
        return; // Exit early as we forced a state change
    } else {
        // Hide login required message if it was visible
        if (loginRequiredMsg) loginRequiredMsg.classList.add('d-none');
    }

    // Update label and max groups visibility based on the *final* selected mode
    const finalModeSelected = document.querySelector('input[name="group_mode"]:checked')?.value || 'single';
    if (maxGroupsContainer) {
        maxGroupsContainer.classList.toggle('d-none', finalModeSelected !== 'multi');
    } else { console.warn("UI Update: #maxGroupsContainer not found"); }

    if (numPlayersLabel) {
        numPlayersLabel.textContent = (finalModeSelected === 'multi') ? 'Number of Players per group:' : 'Number of Players:';
    } else { console.warn("UI Update: #numPlayersLabel not found"); }


    // --- Penalty Tab Logic ---
    const enablePenaltiesCheckbox = document.getElementById('enablePenalties');
    const penaltySourceContainer = document.getElementById('penaltySourceContainer');

    if (enablePenaltiesCheckbox && penaltySourceContainer) {
        penaltySourceContainer.classList.toggle('d-none', !enablePenaltiesCheckbox.checked);
    } else {
        if (!enablePenaltiesCheckbox) console.warn("UI Update: Penalty checkbox (#enablePenalties) not found");
        if (!penaltySourceContainer) console.warn("UI Update: Penalty source container (#penaltySourceContainer) not found");
    }
}

// --- Helper Functions (Internal - Populate dropdowns, gather modes, update game list) ---

function populatePenaltySourceDropdown() {
    const dropdown = document.getElementById("penaltySourceSelect");
    if (!dropdown) return;
    dropdown.innerHTML = "";
    try {
        const tabs = getLocalPenaltyTabs(); if (!tabs) return;
        for (const tabId in tabs) {
            const option = document.createElement("option");
            option.value = tabId; option.textContent = tabs[tabId]?.name || tabId;
            dropdown.appendChild(option);
        } console.log("Penalty source dropdown populated.");
    } catch (error) { console.error("Error populating penalty source dropdown:", error); }
}

function populateGameSourceDropdown() {
    const dropdown = document.getElementById("gameSourceSelect");
    if (!dropdown) return;
    dropdown.innerHTML = "";
    try {
        const tabs = getGameTabs(); if (!tabs) return;
        for (const tabId in tabs) {
            const option = document.createElement("option");
            option.value = tabId; option.textContent = tabs[tabId]?.name || tabId;
            dropdown.appendChild(option);
        } console.log("Game source dropdown populated.");
    } catch (error) { console.error("Error populating game source dropdown:", error); }
}

function updateGameSelectionCard() {
    const dropdown = document.getElementById("gameSourceSelect");
    const tbody = document.getElementById("gamesSelectionTbody");
    if (!dropdown || !tbody) { console.error("Missing elements for game selection card."); return; }
    const selectedTab = dropdown.value;
    tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-3">Loading games...</td></tr>`;
    let entries = [];
    try { entries = JSON.parse(localStorage.getItem("localEntries") || "{}")[selectedTab] || []; }
    catch(e) { console.error("Error parsing localEntries:", e); tbody.innerHTML = `<tr><td colspan="3" class="text-danger text-center">Error loading.</td></tr>`; return; }
    const grouped = {};
    entries.forEach(entry => { /* ... grouping logic ... */ if (!entry?.game) return; const gameName = entry.game.trim(); if (!gameName) return; if (!grouped[gameName]) grouped[gameName] = { weight: Number(entry.weight) || 1.0, availableModes: new Set() }; if (entry.gameMode?.trim()) grouped[gameName].availableModes.add(entry.gameMode.trim()); });
    Object.keys(grouped).forEach(key => grouped[key].availableModes = Array.from(grouped[key].availableModes).sort());
    let html = ""; const gameNames = Object.keys(grouped).sort();
    if (gameNames.length > 0) {
        gameNames.forEach((gameName, index) => { /* ... complex HTML/Modal generation ... */ const group = grouped[gameName]; const weightVal = group.weight.toFixed(1); const safeGameNameId = gameName.replace(/[^a-zA-Z0-9_-]/g, '-'); const gameCheckboxId = `game-${safeGameNameId}-${index}`; const modalId = `modesModal-${safeGameNameId}-${index}`; let modalHtml = ""; if (group.availableModes.length > 0) { group.availableModes.forEach((mode, i) => { const cbId = `mode-${safeGameNameId}-${index}-${i}`; modalHtml += `<div class="form-check mb-2"><input class="form-check-input allowed-mode-checkbox" type="checkbox" name="allowed_modes_${gameName}[]" value="${mode.replace(/"/g, '&quot;')}" id="${cbId}"><label class="form-check-label ml-1" for="${cbId}">${mode}</label></div>`; }); } else { modalHtml = "<p class='text-muted'>No modes found.</p>"; } html += `<tr data-game="${gameName}"><td class="align-middle"><input class="form-check-input game-select-checkbox" type="checkbox" name="selected_games" value="${gameName}" id="${gameCheckboxId}"><label class="form-check-label ml-4 font-weight-bold" for="${gameCheckboxId}">${gameName}</label></td><td class="align-middle"><input type="number" name="weights" value="${weightVal}" min="0.1" step="0.1" class="form-control form-control-sm game-weight-input" style="width: 75px;"></td><td class="align-middle">${group.availableModes.length > 0 ? `<button type="button" class="btn btn-sm btn-outline-secondary" data-toggle="modal" data-target="#${modalId}" title="Modes">Modes (${group.availableModes.length})</button><div class="modal fade" id="${modalId}" tabindex="-1"><div class="modal-dialog modal-dialog-centered"><div class="modal-content text-dark"><div class="modal-header"><h5 class="modal-title">${gameName} Modes</h5><button type="button" class="close" data-dismiss="modal">&times;</button></div><div class="modal-body">${modalHtml}</div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-dismiss="modal">Done</button></div></div></div></div>` : '<span class="text-muted">N/A</span>'}</td></tr>`;});
    } else { html = `<tr><td colspan="3" class="text-center text-muted py-4">No entries found in this tab.</td></tr>`; }
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
                const checkboxes = row.querySelectorAll(`input.allowed-mode-checkbox:checked`);
                if (checkboxes.length > 0) {
                    selectedModes[gameName.toLowerCase()] = Array.from(checkboxes).map(cb => cb.value);
                }
            }
        }
    });
    console.log("Gathered selected modes:", selectedModes);
    return selectedModes;
}

// --- REMOVED updatePlayerNameInputs function ---


// --- Main Form Submission Handler ---
function handleChallengeFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const selectedMode = formData.get("group_mode") || 'single';
    const isAuthenticated = window.IS_AUTHENTICATED === true;

    // Prevent submission if anonymous user selected multi (safeguard)
    if (selectedMode === 'multi' && !isAuthenticated) {
        alert("Login is required for Multigroup/Shared challenges.");
        // Force UI back just in case
        const singleRadio = document.getElementById('modeSingleGroup');
        if(singleRadio) singleRadio.checked = true;
        updateIndexFormUI();
        return;
    }

    // Basic form validation
    if (!form.querySelector('input[name="selected_games"]:checked')) { alert("Please select game(s)."); return; }
    const selectedGameTab = formData.get("game_tab_id");
    if (!selectedGameTab) { alert("No game source selected."); return; }

    // Process entries
    let convertedEntries = [];
    try {
        const allEntries = JSON.parse(localStorage.getItem("localEntries") || "{}");
        const entries = allEntries[selectedGameTab] || [];
        if (entries.length === 0) { alert("No game entries in source tab."); return; }
        convertedEntries = entries.map(entry => entry ? { id: entry.id, Spiel: String(entry.game || ''), Spielmodus: String(entry.gameMode || ''), Schwierigkeit: parseFloat(entry.difficulty) || 0, Spieleranzahl: parseInt(entry.numberOfPlayers) || 0 } : null).filter(Boolean);
        if (convertedEntries.length === 0) throw new Error("Entries invalid.");
        formData.append("entries", JSON.stringify(convertedEntries));
    } catch (error) { alert(`Error processing entries: ${error.message}`); return; }

    // Append selected modes
    formData.append("selected_modes", JSON.stringify(gatherSelectedModes()));

    // UI Feedback
    const submitButton = form.querySelector('button[type="submit"]');
    const resultDiv = document.getElementById("challengeResult");
    const shareBtn = document.getElementById("shareChallengeBtn");
    const shareResultDiv = document.getElementById('shareResult');
    const viewLocalBtn = document.getElementById('viewLocalChallengeBtn');
    if (submitButton) { submitButton.disabled = true; submitButton.textContent = 'Generating...'; }
    if (resultDiv) { resultDiv.style.display = "block"; resultDiv.innerHTML = '<p class="text-info text-center">Generating...</p>'; }
    if (shareBtn) shareBtn.style.display = 'none';
    if (shareResultDiv) { shareResultDiv.style.display = 'none'; shareResultDiv.innerHTML = ''; }
    if (viewLocalBtn) viewLocalBtn.style.display = 'none';

    console.log("Submitting generation request...");

    fetch(window.generateChallengeUrl, { method: "POST", body: formData })
        .then(response => response.json().then(data => ({ ok: response.ok, status: response.status, data })))
        .then(({ ok, status, data }) => {
            if (!ok) throw new Error(data?.error || `HTTP ${status}`);
            if (!data.result || (!data.normal && !data.b2b)) throw new Error(data?.error || "Invalid response format.");

            if (resultDiv) resultDiv.innerHTML = data.result;

            if (isAuthenticated) {
                console.log("User logged in. Enabling Share button.");
                window.currentChallengeData = data; // Store data for share module
                if (shareBtn) shareBtn.style.display = "inline-block";
                if (viewLocalBtn) viewLocalBtn.style.display = 'none';
            } else {
                console.log("User anonymous. Saving locally.");
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
                     const viewUrl = new URL(window.viewLocalChallengeBaseUrl, window.location.origin);
                     viewUrl.searchParams.set('id', localId);
                     viewLocalBtn.href = viewUrl.pathname + viewUrl.search;
                     viewLocalBtn.style.display = 'inline-block';
                } else if (!saved && resultDiv) {
                    resultDiv.innerHTML += '<p class="text-danger mt-2">Warning: Could not save challenge locally.</p>';
                }
                if (shareBtn) shareBtn.style.display = 'none';
            }
        })
        .catch(error => {
            console.error("Challenge Generation Error:", error);
            if (resultDiv) resultDiv.innerHTML = `<p class="text-danger text-center">Failed: ${error.message}</p>`;
            alert("Failed to generate challenge: " + error.message);
        })
        .finally(() => {
            if (submitButton) { submitButton.disabled = false; submitButton.textContent = 'Generate Challenge'; }
        });
}

// --- Initialization Function ---
export function initializeChallengeForm() {
    // Init storage
    try { initGameStorage(); initPenaltiesLocalStorage(); }
    catch (e) { console.error("Error initializing storage:", e); }

    // Find elements
    const challengeForm = document.getElementById("challengeForm");
    const gameSourceSelect = document.getElementById("gameSourceSelect");
    const penaltySourceSelect = document.getElementById("penaltySourceSelect");
    const modeRadios = document.querySelectorAll('input[name="group_mode"]');
    const penaltyCheckbox = document.getElementById('enablePenalties');

    // Setup UI elements & listeners
    if (gameSourceSelect) { populateGameSourceDropdown(); gameSourceSelect.addEventListener('change', updateGameSelectionCard); updateGameSelectionCard(); }
    else { console.error("Game source dropdown missing."); }

    if (penaltySourceSelect) { populatePenaltySourceDropdown(); }
    else { console.error("Penalty source dropdown missing."); }

    // Attach listeners for Mode and Penalty UI updates
    modeRadios.forEach(radio => radio.addEventListener('change', updateIndexFormUI));
    if (penaltyCheckbox) { penaltyCheckbox.addEventListener('change', updateIndexFormUI); }
    else { console.warn("Penalty checkbox (#enablePenalties) missing."); }

    // Initial UI setup call
    updateIndexFormUI();

    // Attach main form submit handler
    if (challengeForm) { challengeForm.addEventListener('submit', handleChallengeFormSubmit); }
    else { console.error("Challenge form missing."); }

    console.log("Challenge form initialized.");
}

