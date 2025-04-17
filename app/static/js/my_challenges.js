// static/js/my_challenges.js
// Handles interactions on the “My Challenges” page
//------------------------------------------------------------------

import {
    getLocalChallenges,
    deleteLocalChallenge
  } from "./utils/local_storage.js";
  import { apiFetch } from "./utils/api.js";
  import {
    setLoading,
    escapeHtml,
    showError,
    showFlash,
    confirmModal
  } from "./utils/helpers.js";
  
  // ---------- DOM --------------------------------------------------------------
  let accountChallengesRow = null;    //   DB‑based cards (row)
  let localChallengesContainer = null;//   Local cards (row)
  let noChallengesMessage = null;     //   Big “no challenges” banner
  let pageContainer = null;           //   Delegation root
  let statusDiv = null;               //   Inline status (errors only)
  
  // ---------- PAGE CONFIG ------------------------------------------------------
  let pageConfig = {
    isAuthenticated: false,
    csrfToken: null,
    viewLocalUrl: "/challenge/"
  };
  
  // ---------- CARD CREATION ----------------------------------------------------
  function createLocalChallengeCard(ch) {
    const col = document.createElement("div");
    col.className = "col-md-6 col-lg-4 mb-4 local-challenge-item";
    col.dataset.localId = ch.localId;
  
    const href = `${pageConfig.viewLocalUrl}${ch.localId}`;
  
    col.innerHTML = `
      <div class="card challenge-card h-100">
        <a href="${href}" class="card-body-link" target="_blank">
          <div class="card-body">
            <h5 class="card-title">${escapeHtml(
              ch.name || "Unnamed Local Challenge"
            )}</h5>
            <h6 class="card-subtitle mb-2 text-muted">
              <code style="font-size:.9em;">${escapeHtml(
                ch.localId.slice(0, 12)
              )}…</code> (Local)
            </h6>
            <p class="card-text small">
              Saved: ${ch.createdAt
                ? new Date(ch.createdAt).toLocaleString()
                : "N/A"}
            </p>
          </div>
        </a>
        <div class="card-footer text-right">
          <button
            class="btn btn-sm btn-outline-danger delete-local-challenge-btn"
            data-local-id="${ch.localId}"
            data-challenge-name="${escapeHtml(
              ch.name || "Unnamed Local Challenge"
            )}">
            <span class="spinner-border spinner-border-sm" style="display:none;"></span>
            <span>Delete</span>
          </button>
        </div>
      </div>`;
    return col;
  }
  
  // ---------- RENDER LOCAL -----------------------------------------------------
  function renderLocalChallenges() {
    if (!localChallengesContainer) return;
  
    const list = getLocalChallenges();
    localChallengesContainer.innerHTML = "";
  
    if (list.length) {
      list
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .forEach(ch => localChallengesContainer.appendChild(createLocalChallengeCard(ch)));
    } else {
      localChallengesContainer.innerHTML =
        '<div class="col-12"><p class="empty-section-message">No challenges saved locally in this browser.</p></div>';
    }
    updateNoChallengesBanner();
  }
  
  // ---------- NO‑CHALLENGES BANNER --------------------------------------------
  function updateNoChallengesBanner() {
    const hasDB = !!accountChallengesRow?.querySelector(".challenge-list-item");
    const hasLocal = !!localChallengesContainer?.querySelector(
      ".local-challenge-item"
    );
    noChallengesMessage?.classList.toggle("d-none", hasDB || hasLocal);
  }
  
  // ---------- DELETE HANDLER ---------------------------------------------------
  async function handleDeleteClick(e) {
    const btn =
      e.target.closest(".delete-challenge-btn") ||
      e.target.closest(".delete-local-challenge-btn");
    if (!btn) return;
  
    const isLocal = btn.classList.contains("delete-local-challenge-btn");
    const id = isLocal ? btn.dataset.localId : btn.dataset.publicId;
    const name = btn.dataset.challengeName || "this challenge";
  
    if (!id)
      return showFlash("Cannot delete: missing ID.", "danger");
  
    if (!isLocal && pageConfig.isAuthenticated && !pageConfig.csrfToken)
      return showFlash(
        "Cannot delete shared challenge: security token missing.",
        "danger"
      );
  
    const ok = await confirmModal(
      `Delete “${name}” (${isLocal ? "Local" : "Shared"})? This cannot be undone.`,
      "Delete challenge?"
    );
    if (!ok) return;
  
    setLoading(btn, true, "Deleting…");
    showError(statusDiv, null);
  
    try {
      if (isLocal) {
        if (!deleteLocalChallenge(id)) throw new Error("Not found.");
      } else {
        await apiFetch(`/api/challenge/${id}`, {
          method: "DELETE",
          headers: { "X-CSRFToken": pageConfig.csrfToken }
        });
      }
  
      // Smooth fade‑out then remove
      const card = btn.closest(".challenge-list-item, .local-challenge-item");
      if (card) {
        card.style.transition = "opacity .4s ease, transform .4s ease";
        card.style.opacity = "0";
        card.style.transform = "scale(.95)";
        setTimeout(() => {
          card.remove();
          updateNoChallengesBanner();
          if (
            isLocal &&
            !localChallengesContainer.querySelector(".local-challenge-item")
          )
            renderLocalChallenges();
          if (
            !isLocal &&
            accountChallengesRow &&
            !accountChallengesRow.querySelector(".challenge-list-item")
          ) {
            accountChallengesRow.innerHTML =
              '<div class="col-12"><p class="empty-section-message">No challenges saved to your account yet.</p></div>';
          }
        }, 400);
      }
  
      showFlash("Challenge deleted.", "success");
    } catch (err) {
      console.error(err);
      showFlash("Error deleting: " + err.message, "danger");
      setLoading(btn, false);
    }
  }
  
  // ---------- INIT -------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", () => {
    accountChallengesRow = document.querySelector(
      "#accountChallengesCollapse .row"
    );
    localChallengesContainer = document.getElementById("localChallengesContainer");
    noChallengesMessage = document.getElementById("noChallengesMessageContainer");
    pageContainer = document.querySelector(".container.mt-4");
    statusDiv = document.getElementById("deleteStatus");
  
    const dataEl = document.getElementById("myData");
    if (!dataEl)
      return showFlash("Initialization error: data element missing.", "danger");
  
    pageConfig = {
      isAuthenticated: dataEl.dataset.isAuthenticated === "true",
      csrfToken: dataEl.dataset.csrfToken,
      viewLocalUrl: dataEl.dataset.viewLocalUrl || "/challenge/"
    };
  
    renderLocalChallenges();
    updateNoChallengesBanner();
    pageContainer?.addEventListener("click", handleDeleteClick);
  
    // optional: collapse caret toggle
    if (typeof $ !== "undefined") {
      $(".collapse").on("shown.bs.collapse hidden.bs.collapse", e => {
        $(`[data-target="#${e.target.id}"]`).attr(
          "aria-expanded",
          (e.type === "shown").toString()
        );
      });
    }
  });
  