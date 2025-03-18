
// Zähler für dynamisch hinzugefügte Tabs
let tabCount = 1;

// Plus-Button klick: Neuen Tab hinzufügen
document.getElementById("addTabBtn").addEventListener("click", function (e) {
  e.preventDefault();
  tabCount++;
  const newTabLink = document.createElement("a");
  newTabLink.classList.add("nav-link");
  newTabLink.id = "tab-" + tabCount;
  newTabLink.setAttribute("data-toggle", "tab");
  newTabLink.href = "#tabPane-" + tabCount;
  newTabLink.role = "tab";
  newTabLink.setAttribute("aria-controls", "tabPane-" + tabCount);
  newTabLink.setAttribute("aria-selected", "false");
  newTabLink.textContent = "Tab " + tabCount;

  const newTabItem = document.createElement("li");
  newTabItem.classList.add("nav-item");
  newTabItem.appendChild(newTabLink);

  const addBtnParent = document.getElementById("addTabBtn").parentNode;
  addBtnParent.parentNode.insertBefore(newTabItem, addBtnParent);

  const newTabPane = document.createElement("div");
  newTabPane.classList.add("tab-pane", "fade");
  newTabPane.id = "tabPane-" + tabCount;
  newTabPane.setAttribute("role", "tabpanel");
  newTabPane.setAttribute("aria-labelledby", "tab-" + tabCount);
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
});

// Öffne Modal beim Klick auf den "Einfügen"-Button
document.addEventListener("click", function (e) {
  if (e.target.classList.contains("insertGameBtn")) {
    $("#newGameModal").modal("show");
    window.currentTargetTab = e.target.getAttribute("data-tab");
  }
});

// Doppelklick auf einen Tabelleneintrag
document.addEventListener("dblclick", function (e) {
  const targetRow = e.target.closest("tr");
  if (targetRow && targetRow.parentElement.classList.contains("gamesTable")) {
    const cells = targetRow.querySelectorAll("td");
    const entryData = {
      id: targetRow.dataset.id,
      spiel: cells[0].textContent,
      spielmodus: cells[1].textContent,
      schwierigkeit: cells[2].textContent,
      spieleranzahl: cells[3].textContent
    };

    // Modal mit den Daten füllen
    document.getElementById("editEntryId").value = entryData.id || "";
    document.getElementById("editGameName").value = entryData.spiel;
    document.getElementById("editGameMode").value = entryData.spielmodus;
    document.getElementById("editDifficulty").value = entryData.schwierigkeit;
    document.getElementById("editPlayers").value = entryData.spieleranzahl;

    // Modal anzeigen
    $("#editGameModal").modal("show");
  }
});


// Beim Speichern im Modal: Neuen Eintrag zum jeweiligen Tab hinzufügen und in CSV speichern
document.getElementById("saveNewGameBtn").addEventListener("click", function () {
  // Leere vorherige Fehlermeldung
  document.getElementById("gameFormAlert").innerHTML = "";

  const form = document.getElementById("newGameForm");
  const spiel = form.newGameName.value.trim();
  const spielmodus = form.newGameMode.value.trim();
  const schwierigkeit = parseFloat(form.newDifficulty.value);
  const spieleranzahl = parseInt(form.newPlayers.value);

  // Validierung (wie bereits implementiert)
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

  // AJAX-Request an die neue Route /add_game
  fetch("/add_game", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": document.querySelector('input[name="csrf_token"]').value
    },
    body: JSON.stringify({
      spiel: spiel,
      spielmodus: spielmodus,
      schwierigkeit: schwierigkeit.toFixed(1),
      spieleranzahl: spieleranzahl
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
        // Füge den neuen Eintrag zur Tabelle im aktuellen Tab hinzu
        const newRow = `<tr data-id="${data.entry_id}">
                        <td>${spiel}</td>
                        <td>${spielmodus}</td>
                        <td>${schwierigkeit.toFixed(1)}</td>
                        <td>${spieleranzahl}</td>
                      </tr>`;
        document.querySelector(`#${window.currentTargetTab} .gamesTable`).insertAdjacentHTML('beforeend', newRow);
        // Modal schließen und Formular zurücksetzen
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

function showGameFormAlert(message) {
  const alertDiv = document.getElementById("gameFormAlert");
  if (alertDiv) {
    alertDiv.innerHTML = `<div class="alert alert-danger alert-dismissible fade show" role="alert">
      &#9888; ${message}
      <button type="button" class="close" data-dismiss="alert" aria-label="Close">
        <span aria-hidden="true">&times;</span>
      </button>
    </div>`;
  } else {
    console.error("Element with id 'gameFormAlert' not found!");
  }
}

// Speichern-Button im Bearbeiten-Modal
document.getElementById("updateGameBtn").addEventListener("click", function () {

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
      spiel: spiel,
      spielmodus: spielmodus,
      schwierigkeit: schwierigkeit.toFixed(1),
      spieleranzahl: spieleranzahl
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



// Löschen-Button im Bearbeiten-Modal
document.getElementById("deleteGameBtn").addEventListener("click", function () {
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

// Hilfsfunktion für Alerts
function showAlert(message, alertId) {
  const alertDiv = document.getElementById(alertId);
  alertDiv.innerHTML = `
    <div class="alert alert-danger alert-dismissible fade show" role="alert">
      ${message}
      <button type="button" class="close" data-dismiss="alert" aria-label="Close">
        <span aria-hidden="true">&times;</span>
      </button>
    </div>
  `;
}