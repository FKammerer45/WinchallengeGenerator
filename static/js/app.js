// app.js - Gemeinsame JavaScript-Funktionen

document.addEventListener("DOMContentLoaded", function() {
    console.log("app.js loaded");

    // Beispiel: AJAX-Submit für das Challenge-Formular (wenn Formular-ID "challengeForm" vorhanden)
    const challengeForm = document.getElementById("challengeForm");
    if (challengeForm) {
        challengeForm.addEventListener("submit", function(e) {
            e.preventDefault();
            const formData = new FormData(challengeForm);
            fetch("/generate_challenge", {
                method: "POST",
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                    //console.log("Challenge-Ergebnis (Response):", data);
                if (data.error) {
                    alert(data.error);
                } else {
                    // Ergebnis in einem Container anzeigen (z. B. mit ID "challengeResult")
                    document.getElementById("challengeResult").innerHTML = data.result;
                    // Hier kannst du zusätzliche Funktionen (z.B. Timer) initialisieren
                }
            })
            .catch(error => console.error("Error:", error));
            

        });
    }

    // Beispiel: Timer-Funktionalität (für challenge.html)
    let timerInterval;
    let elapsed = 0;
    const timerDisplay = document.getElementById("timerDisplay");
    const btnStart = document.getElementById("btnStart");
    const btnPause = document.getElementById("btnPause");
    const btnReset = document.getElementById("btnReset");

    if (btnStart && timerDisplay) {
        function updateTimer() {
            elapsed++;
            const hrs = String(Math.floor(elapsed / 3600)).padStart(2, '0');
            const mins = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
            const secs = String(elapsed % 60).padStart(2, '0');
            timerDisplay.textContent = `${hrs}:${mins}:${secs}`;
        }
        btnStart.addEventListener("click", function() {
            clearInterval(timerInterval);
            timerInterval = setInterval(updateTimer, 1000);
        });
        btnPause.addEventListener("click", function() {
            clearInterval(timerInterval);
        });
        btnReset.addEventListener("click", function() {
            clearInterval(timerInterval);
            elapsed = 0;
            timerDisplay.textContent = "00:00:00";
        });
    }
});
