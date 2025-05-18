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
  
  // Bulk Delete DOM Elements
  let startBulkDeleteBtn = null;
  let confirmBulkDeleteBtn = null;
  let cancelBulkDeleteBtn = null;
  let myChallengesContainer = null; // The container for account challenges
  
  // ---------- PAGE CONFIG ------------------------------------------------------
  let pageConfig = {
    isAuthenticated: false,
    csrfToken: null,
    viewLocalUrl: "/challenge/"
  };

  // ---------- BULK DELETE STATE -------------------------------------------------
  let bulkDeleteModeActive = false;
  const selectedChallengeIds = new Set();
  
  // ---------- CARD CREATION ----------------------------------------------------
  function createLocalChallengeCard(ch) {
    const col = document.createElement("div");
    col.className = "col-md-6 col-lg-4 mb-4 local-challenge-item challenge-card-item"; // Added common class
    col.dataset.localId = ch.localId; // Keep ID for deletion logic
    col.dataset.publicId = ch.localId; // For consistency in selection logic

    const href = `${pageConfig.viewLocalUrl || '/challenge/'}${ch.localId}`;

    col.innerHTML = `
      <div class="card list-card h-100 glass-effect challenge-card-hover"> 
        <a href="${href}" class="card-body-link text-light" style="text-decoration: none;" target="_blank">
          <div class="card-body d-flex flex-column"> 
            <h5 class="card-title mb-3 d-flex align-items-center">
                <i class="bi bi-pc-display-horizontal me-2 text-info fs-5"></i> 
                <span>${escapeHtml(ch.name || "Unnamed Local Challenge")}</span>
            </h5>
            <div class="mt-auto small text-secondary"> 
                <p class="mb-1">
                    <i class="bi bi-calendar-event me-1 opacity-75"></i>Created: ${
                      ch.createdAt
                        ? new Date(ch.createdAt).toLocaleString()
                        : "N/A"
                    }
                </p>
           </div>
          </div>
        </a>
        <div class="card-footer d-flex justify-content-end align-items-center py-2 px-3">
            <button class="btn btn-sm btn-outline-danger delete-local-challenge-btn d-flex align-items-center"
                    data-local-id="${ch.localId}"
                    data-challenge-name="${escapeHtml(ch.name || "Unnamed Local Challenge")}"
                    title="Delete Local Challenge">
                <span class="spinner-border spinner-border-sm me-1" style="display: none;"></span>
                <i class="bi bi-trash me-1"></i>
                <span class="button-text">Delete</span> 
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
    const hasDB = !!myChallengesContainer?.querySelector(".challenge-list-item"); // Use myChallengesContainer
    const hasLocal = !!localChallengesContainer?.querySelector(
      ".local-challenge-item"
    );
    noChallengesMessage?.classList.toggle("d-none", hasDB || hasLocal);
  }

  // ---------- BULK DELETE FUNCTIONS --------------------------------------------
  function toggleBulkDeleteMode(activate) {
    bulkDeleteModeActive = activate;
    selectedChallengeIds.clear();

    startBulkDeleteBtn.style.display = activate ? 'none' : 'inline-block';
    confirmBulkDeleteBtn.style.display = activate ? 'inline-block' : 'none';
    cancelBulkDeleteBtn.style.display = activate ? 'inline-block' : 'none';

    document.querySelectorAll('#myChallengesContainer .challenge-list-item .card').forEach(card => {
        card.classList.remove('selected-for-delete');
        // Disable single delete buttons during bulk mode
        const singleDeleteBtn = card.querySelector('.delete-challenge-btn');
        if (singleDeleteBtn) {
            singleDeleteBtn.disabled = activate;
            singleDeleteBtn.style.opacity = activate ? '0.5' : '1';
        }
    });
    
    if (myChallengesContainer) {
        myChallengesContainer.classList.toggle('bulk-delete-mode', activate);
    }
    // Also disable local delete buttons if bulk mode is active for account challenges
    document.querySelectorAll('#localChallengesContainer .delete-local-challenge-btn').forEach(btn => {
        btn.disabled = activate;
        btn.style.opacity = activate ? '0.5' : '1';
    });
  }

  function handleChallengeCardClickInBulkMode(event) {
    if (!bulkDeleteModeActive) return;

    const cardListItem = event.target.closest('.challenge-list-item');
    if (!cardListItem || !myChallengesContainer.contains(cardListItem)) return; // Only for account challenges

    const card = cardListItem.querySelector('.card');
    const deleteButton = cardListItem.querySelector('.delete-challenge-btn');
    const publicId = deleteButton?.dataset.publicId;

    if (!publicId || !card) return;

    event.preventDefault(); // Prevent navigation if card link is clicked

    if (selectedChallengeIds.has(publicId)) {
        selectedChallengeIds.delete(publicId);
        card.classList.remove('selected-for-delete');
    } else {
        selectedChallengeIds.add(publicId);
        card.classList.add('selected-for-delete');
    }
    confirmBulkDeleteBtn.textContent = `Confirm Delete (${selectedChallengeIds.size}) Selected`;
    confirmBulkDeleteBtn.disabled = selectedChallengeIds.size === 0;
  }

  async function handleConfirmBulkDelete() {
    if (selectedChallengeIds.size === 0) {
        showFlash("No challenges selected for deletion.", "info");
        return;
    }

    const ok = await confirmModal(
        `Are you sure you want to delete ${selectedChallengeIds.size} selected challenge(s)? This cannot be undone.`,
        "Confirm Bulk Delete"
    );
    if (!ok) return;

    setLoading(confirmBulkDeleteBtn, true, "Deleting...");
    showError(statusDiv, null);

    try {
        const response = await apiFetch('/api/challenge/bulk_delete', {
            method: 'POST',
            body: { public_ids: Array.from(selectedChallengeIds) }
        }, pageConfig.csrfToken);

        if (response.status === 'success' || response.status === 'partial_success') {
            showFlash(response.message || `${response.deleted_ids.length} challenge(s) deleted.`, "success");
            response.deleted_ids.forEach(id => {
                const cardListItem = myChallengesContainer.querySelector(`.challenge-list-item .delete-challenge-btn[data-public-id="${id}"]`)?.closest('.challenge-list-item');
                if (cardListItem) {
                    cardListItem.style.transition = "opacity .4s ease, transform .4s ease";
                    cardListItem.style.opacity = "0";
                    cardListItem.style.transform = "scale(.95)";
                    setTimeout(() => {
                        cardListItem.remove();
                        updateNoChallengesBanner();
                         if (myChallengesContainer && !myChallengesContainer.querySelector(".challenge-list-item")) {
                            myChallengesContainer.innerHTML = '<div class="col-12"><p class="empty-section-message">No challenges saved to your account yet.</p></div>';
                        }
                    }, 400);
                }
            });
            if (response.failed_details && response.failed_details.length > 0) {
                let errorMsg = "Some challenges could not be deleted: ";
                response.failed_details.forEach(detail => {
                    errorMsg += `ID ${detail[0]}: ${detail[1]}; `;
                });
                showFlash(errorMsg, "warning", 10000); // Longer display for partial errors
            }
        } else {
            throw new Error(response.error || response.message || "Unknown error during bulk delete.");
        }
    } catch (err) {
        console.error("Bulk delete error:", err);
        showFlash("Error during bulk deletion: " + err.message, "danger");
    } finally {
        setLoading(confirmBulkDeleteBtn, false, "Confirm Delete Selected");
        toggleBulkDeleteMode(false); // Exit bulk delete mode
    }
  }
  
  // ---------- DELETE HANDLER (Single) ------------------------------------------
  async function handleDeleteClick(e) {
    if (bulkDeleteModeActive) return; // Ignore single delete clicks in bulk mode

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
            localChallengesContainer && // Check if container exists
            !localChallengesContainer.querySelector(".local-challenge-item")
          )
            renderLocalChallenges(); // Re-render to show "no local" message if needed
          if (
            !isLocal &&
            myChallengesContainer && // Check if container exists
            !myChallengesContainer.querySelector(".challenge-list-item")
          ) {
            myChallengesContainer.innerHTML =
              '<div class="col-12"><p class="empty-section-message">No challenges saved to your account yet.</p></div>';
          }
        }, 400);
      }
  
      showFlash("Challenge deleted.", "success");
    } catch (err) {
      console.error(err);
      showFlash("Error deleting: " + err.message, "danger");
    } finally {
        setLoading(btn, false); // Ensure loading state is reset
    }
  }
  
  // ---------- INIT -------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", () => {
    // accountChallengesRow is not used anymore, myChallengesContainer is used for DB challenges
    myChallengesContainer = document.getElementById("myChallengesContainer"); 
    localChallengesContainer = document.getElementById("localChallengesContainer");
    noChallengesMessage = document.getElementById("noChallengesMessageContainer");
    pageContainer = document.querySelector(".container.mt-4.my-challenges-page"); // More specific
    statusDiv = document.getElementById("deleteStatus");

    startBulkDeleteBtn = document.getElementById('startBulkDeleteBtn');
    confirmBulkDeleteBtn = document.getElementById('confirmBulkDeleteBtn');
    cancelBulkDeleteBtn = document.getElementById('cancelBulkDeleteBtn');
  
    const dataEl = document.getElementById("myData");
    if (!dataEl)
      return showFlash("Initialization error: data element missing.", "danger");
  
    pageConfig = {
      isAuthenticated: dataEl.dataset.isAuthenticated === "true",
      csrfToken: dataEl.dataset.csrfToken,
      viewLocalUrl: dataEl.dataset.viewLocalUrl || "/challenge/"
    };
  
    renderLocalChallenges();
    updateNoChallengesBanner(); // Initial check

    // Event listeners
    pageContainer?.addEventListener("click", handleDeleteClick); // For single delete
    
    if (myChallengesContainer) { // Add click listener for card selection only if container exists
        myChallengesContainer.addEventListener('click', handleChallengeCardClickInBulkMode);
    }

    startBulkDeleteBtn?.addEventListener('click', () => toggleBulkDeleteMode(true));
    cancelBulkDeleteBtn?.addEventListener('click', () => toggleBulkDeleteMode(false));
    confirmBulkDeleteBtn?.addEventListener('click', handleConfirmBulkDelete);
  
    // optional: collapse caret toggle (if used on this page)
    if (typeof $ !== 'undefined' && $.fn.collapse) { // Check for collapse specifically
      $('.collapse').on('shown.bs.collapse hidden.bs.collapse', function (e) {
        const trigger = $(`[data-toggle="collapse"][data-target="#${e.target.id}"], [data-toggle="collapse"][href="#${e.target.id}"]`);
        trigger.attr('aria-expanded', (e.type === 'shown').toString());
        // Optional: Change icon if using chevron
        // trigger.find('.bi').toggleClass('bi-chevron-expand bi-chevron-contract'); 
      });
    }
  });
