# modules/gui_components.py
from flask import render_template

def render_challenge_page(challenge_data):
    """
    Rendert die Challenge-Ergebnis-Seite mithilfe des Templates 'challenge.html'.
    Das Template erhält die Challenge-Daten (z.B. das HTML-formatierte Ergebnis,
    sowie strukturierte Daten für die Checkboxes) und baut daraus die Seite.
    """
    return render_template("challenge.html", challenge_data=challenge_data)
