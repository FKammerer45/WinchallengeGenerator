//static/js/games_scripts.js
// Dynamically added tab counter
let tabCount = 1;

// Initialize dynamic tab functionality
const initTabCreation = () => {
  const addTabBtn = document.getElementById("addTabBtn");
  if (!addTabBtn) {
    console.error("Element with id 'addTabBtn' not found.");
    return;
  }
  addTabBtn.addEventListener("click", (e) => {
    e.preventDefault();
    createNewTab();
  });
};

// Creates a new tab with associated pane
const createNewTab = () => {
  tabCount++;
  const newTabLink = document.createElement("a");
  newTabLink.classList.add("nav-link");
  newTabLink.id = `tab-${tabCount}`;
  newTabLink.setAttribute("data-toggle", "tab");
  newTabLink.href = `#tabPane-${tabCount}`;
  newTabLink.role = "tab";
  newTabLink.setAttribute("aria-controls", `tabPane-${tabCount}`);
  newTabLink.setAttribute("aria-selected", "false");
  newTabLink.textContent = `Tab ${tabCount}`;

  const newTabItem = document.createElement("li");
  newTabItem.classList.add("nav-item");
  newTabItem.appendChild(newTabLink);

  const addBtnParent = document.getElementById("addTabBtn").parentNode;
  addBtnParent.parentNode.insertBefore(newTabItem, addBtnParent);

  const newTabPane = document.createElement("div");
  newTabPane.classList.add("tab-pane", "fade");
  newTabPane.id = `tabPane-${tabCount}`;
  newTabPane.setAttribute("role", "tabpanel");
  newTabPane.setAttribute("aria-labelledby", `tab-${tabCount}`);
  newTabPane.innerHTML = `
    <div class="my-3">
      <button class="btn btn-primary insertGameBtn" data-tab="tabPane-${tabCount}">Einfügen</button>
    </div>
    <table class="table table-dark table-striped">
      <thead>
        <tr>
          <th>Spiel</th>
          <th>Spielmodus</th>
          <th>Schwierigkeit</th>
          <th>Spieleranzahl</th>
        </tr>
      </thead>
      <tbody class="gamesTable">
        <!-- Neue Einträge werden hier eingefügt -->
      </tbody>
    </table>
  `;
  document.getElementById("gamesTabContent").appendChild(newTabPane);
};

// Open modal on clicking any "insertGameBtn" button
const initInsertModal = () => {
  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("insertGameBtn")) {
      $("#newGameModal").modal("show");
      window.currentTargetTab = e.target.getAttribute("data-tab");
    }
  });
};

// Add double-click event to table rows for editing a game entry
const initEditOnDblClick = () => {
  document.addEventListener("dblclick", (e) => {
    const targetRow = e.target.closest("tr");
    if (targetRow && targetRow.parentElement.classList.contains("gamesTable")) {
      const cells = targetRow.querySelectorAll("td");
      const entryData = {
        id: targetRow.dataset.id,
        spiel: cells[0]?.textContent,
        spielmodus: cells[1]?.textContent,
        schwierigkeit: cells[2]?.textContent,
        spieleranzahl: cells[3]?.textContent
      };

      // Populate edit modal with the row's data
      document.getElementById("editEntryId").value = entryData.id || "";
      document.getElementById("editGameName").value = entryData.spiel || "";
      document.getElementById("editGameMode").value = entryData.spielmodus || "";
      document.getElementById("editDifficulty").value = entryData.schwierigkeit || "";
      document.getElementById("editPlayers").value = entryData.spieleranzahl || "";
      $("#editGameModal").modal("show");
    }
  });
};

// Helper function to display alert messages in a designated alert container
const showGameFormAlert = (message) => {
  const alertDiv = document.getElementById("gameFormAlert");
  if (alertDiv) {
    alertDiv.innerHTML = `
      <div class="alert alert-danger alert-dismissible fade show" role="alert">
        &#9888; ${message}
        <button type="button" class="close" data-dismiss="alert" aria-label="Close">
          <span aria-hidden="true">&times;</span>
        </button>
      </div>`;
  } else {
    console.error("Element with id 'gameFormAlert' not found!");
  }
};

// Initialize saving new game via modal submission using AJAX
const initSaveNewGame = () => {
  const saveNewGameBtn = document.getElementById("saveNewGameBtn");
  if (!saveNewGameBtn) return;
  saveNewGameBtn.addEventListener("click", () => {
    // Clear previous alert
    document.getElementById("gameFormAlert").innerHTML = "";
    const form = document.getElementById("newGameForm");
    const spiel = form.newGameName.value.trim();
    const spielmodus = form.newGameMode.value.trim();
    const schwierigkeit = parseFloat(form.newDifficulty.value);
    const spieleranzahl = parseInt(form.newPlayers.value);

    // Validate inputs
    if (!spiel || !spielmodus || isNaN(schwierigkeit) || isNaN(spieleranzahl)) {
      showGameFormAlert("Alle Felder müssen korrekt ausgefüllt werden!");
      return;
    }
    if (schwierigkeit < 1 || schwierigkeit > 10 || Math.round(schwierigkeit * 10) !== schwierigkeit * 10) {
      showGameFormAlert("Schwierigkeit muss zwischen 1 und 10 in 0,1-Schritten liegen!");
      return;
    }
    if (spieleranzahl < 1 || spieleranzahl > 20) {
      showGameFormAlert("Spieleranzahl muss zwischen 1 und 20 liegen!");
      return;
    }

    // AJAX request to add a new game
    fetch("/add_game", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": document.querySelector('input[name="csrf_token"]').value
      },
      body: JSON.stringify({
        spiel,
        spielmodus,
        schwierigkeit: schwierigkeit.toFixed(1),
        spieleranzahl
      })
    })
    .then(response => {
      if (!response.ok) throw new Error("Serverfehler: " + response.statusText);
      return response.json();
    })
    .then(data => {
      if (data.error) {
        showGameFormAlert(data.error);
      } else {
        // Append the new entry to the current tab's table
        const newRow = `<tr data-id="${data.entry_id}">
                          <td>${spiel}</td>
                          <td>${spielmodus}</td>
                          <td>${schwierigkeit.toFixed(1)}</td>
                          <td>${spieleranzahl}</td>
                        </tr>`;
        document.querySelector(`#${window.currentTargetTab} .gamesTable`)
                .insertAdjacentHTML('beforeend', newRow);
        $("#newGameModal").modal("hide");
        form.reset();
        document.getElementById("gameFormAlert").innerHTML = "";
      }
    })
    .catch(err => {
      console.error("Fehler beim Hinzufügen:", err);
      showGameFormAlert("Netzwerkfehler: " + err.message);
    });
  });
};

// Initialize update game functionality for the edit modal
const initUpdateGame = () => {
  const updateGameBtn = document.getElementById("updateGameBtn");
  if (!updateGameBtn) return;
  updateGameBtn.addEventListener("click", () => {
    const form = document.getElementById("editGameForm");
    const alertDiv = document.getElementById("editGameAlert");
    const csrfToken = document.querySelector('input[name="csrf_token"]').value;
    const spiel = form.editGameName.value.trim();
    const spielmodus = form.editGameMode.value.trim();
    const schwierigkeit = parseFloat(form.editDifficulty.value);
    const spieleranzahl = parseInt(form.editPlayers.value);
    const entryId = form.editEntryId.value;

    if (!spiel || !spielmodus || isNaN(schwierigkeit) || isNaN(spieleranzahl)) {
      showAlert("Alle Felder müssen korrekt ausgefüllt werden!", alertDiv);
      return;
    }
    if (schwierigkeit < 1 || schwierigkeit > 10) {
      showAlert("Schwierigkeit muss zwischen 1 und 10 liegen!", alertDiv);
      return;
    }
    if (spieleranzahl < 1 || spieleranzahl > 20) {
      showAlert("Spieleranzahl muss zwischen 1 und 20 liegen!", alertDiv);
      return;
    }

    fetch("/update_game", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": csrfToken
      },
      body: JSON.stringify({
        id: entryId,
        spiel,
        spielmodus,
        schwierigkeit: schwierigkeit.toFixed(1),
        spieleranzahl
      })
    })
    .then(response => {
      if (!response.ok) throw new Error('Serverfehler: ' + response.statusText);
      return response.json();
    })
    .then(data => {
      if (data.success) {
        const targetRow = document.querySelector(`tr[data-id="${entryId}"]`);
        if (targetRow) {
          const cells = targetRow.querySelectorAll("td");
          cells[0].textContent = spiel;
          cells[1].textContent = spielmodus;
          cells[2].textContent = schwierigkeit.toFixed(1);
          cells[3].textContent = spieleranzahl;
        }
        $("#editGameModal").modal("hide");
      } else {
        showAlert("Fehler beim Aktualisieren: " + data.error, alertDiv);
      }
    })
    .catch(error => {
      showAlert("Netzwerkfehler: " + error.message, alertDiv);
    });
  });
};

// Initialize delete game functionality for the edit modal
const initDeleteGame = () => {
  const deleteGameBtn = document.getElementById("deleteGameBtn");
  if (!deleteGameBtn) return;
  deleteGameBtn.addEventListener("click", () => {
    const entryId = document.getElementById("editEntryId").value;
    const csrfToken = document.querySelector('input[name="csrf_token"]').value;
    if (confirm("Möchten Sie diesen Eintrag wirklich löschen?")) {
      fetch("/delete_game", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrfToken
        },
        body: JSON.stringify({ id: entryId })
      })
      .then(response => {
        if (!response.ok) throw new Error('Serverfehler: ' + response.statusText);
        return response.json();
      })
      .then(data => {
        if (data.success) {
          const targetRow = document.querySelector(`tr[data-id="${entryId}"]`);
          if (targetRow) {
            targetRow.remove();
          }
          $("#editGameModal").modal("hide");
        } else {
          showAlert("Fehler beim Löschen: " + data.error, "editGameAlert");
        }
      })
      .catch(error => {
        showAlert("Netzwerkfehler: " + error.message, "editGameAlert");
      });
    }
  });
};

// Generic alert display function for modals
const showAlert = (message, alertContainer) => {
  if (typeof alertContainer === "string") {
    alertContainer = document.getElementById(alertContainer);
  }
  if (alertContainer) {
    alertContainer.innerHTML = `
      <div class="alert alert-danger alert-dismissible fade show" role="alert">
        ${message}
        <button type="button" class="close" data-dismiss="alert" aria-label="Close">
          <span aria-hidden="true">&times;</span>
        </button>
      </div>`;
  } else {
    console.error("Alert container not found!");
  }
};

// Initialize all event listeners for dynamic tabs and game management
document.addEventListener("DOMContentLoaded", () => {
  initTabCreation();
  initInsertModal();
  initEditOnDblClick();
  initSaveNewGame();
  initUpdateGame();
  initDeleteGame();
});
