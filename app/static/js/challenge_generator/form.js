// static/js/challenge_generator/form.js
// (Previously static/js/challenge/challenge_form.js)

import { ensureUserDefaultGameTabs } from "../games/gamesExtensions.js";
import { ensureUserDefaultPenaltyTabs } from "../penalties/penaltyExtensions.js";
import { initializeChallengeForm } from "./formCore.js";
import { initializeCustomChallengeBuilder } from "./customBuilderLogic.js";
import { showError } from "../utils/helpers.js"; // Only need showError for critical errors here

// --- Wait for DOM Ready and Initialize ---
document.addEventListener("DOMContentLoaded", async () => {
  if (typeof window.generateChallengeUrl === "undefined") {
    console.error(
      "CRITICAL ERROR: window.generateChallengeUrl is not defined."
    );
    const errorDisplay = document.getElementById("formErrorDisplay");
    if (errorDisplay)
      showError(
        errorDisplay,
        "Configuration error: Cannot generate challenges."
      );
    return;
  }
  if (typeof window.IS_AUTHENTICATED === "undefined") {
    console.error(
      "CRITICAL ERROR: window.IS_AUTHENTICATED flag is not defined."
    );
    const errorDisplay = document.getElementById("formErrorDisplay");
    if (errorDisplay)
      showError(
        errorDisplay,
        "Configuration error: Cannot determine user status."
      );
    return;
  }
  if (typeof window.csrfToken === "undefined") {
    console.error("CRITICAL ERROR: window.csrfToken is not defined.");
    const errorDisplay = document.getElementById("formErrorDisplay");
    if (errorDisplay)
      showError(
        errorDisplay,
        "Configuration error: CSRF token is missing."
      );
    return;
  }

  if (!localStorage.getItem("defaults_loaded")) {
    console.log("Loading default game entries and penalties from DB...");
    try {
      await ensureUserDefaultGameTabs();
      await ensureUserDefaultPenaltyTabs();
      localStorage.setItem("defaults_loaded", "true");
      console.log("Defaults loaded successfully. Reloading page.");
      window.location.reload();
    } catch (error) {
      console.error("Failed to load defaults:", error);
    }
  } else {
    console.log("Defaults already loaded.");
  }

  await initializeChallengeForm();
  initializeCustomChallengeBuilder();

  // Floating reminder box logic
  const loginReminderBox = document.getElementById('loginReminderBox');
  const closeLoginReminderBoxBtn = document.getElementById('closeLoginReminderBox');

  if (loginReminderBox && closeLoginReminderBoxBtn) {
    // Check if the box was closed previously in this session
    if (sessionStorage.getItem('loginReminderClosed') === 'true') {
      loginReminderBox.style.display = 'none';
    } else {
      loginReminderBox.style.display = 'block'; // Or 'flex' if it's a flex container
    }

    closeLoginReminderBoxBtn.addEventListener('click', () => {
      loginReminderBox.style.display = 'none';
      // Optionally, remember this for the session
      sessionStorage.setItem('loginReminderClosed', 'true');
    });
  }
});
