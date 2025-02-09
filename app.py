# app.py
from flask import Flask, render_template, request, jsonify
from modules.challenge_generator import generate_challenge_logic
from modules.csv_handler import ensure_csv_exists, load_entries
from config import CSV_FILE, STRAFEN_CSV
from modules.game_preferences import initialize_game_vars, game_vars
from modules.strafen import ensure_strafen_csv
app = Flask(__name__)
app.config["DEBUG"] = True

# Sicherstellen, dass die CSV-Dateien existieren
ensure_csv_exists(CSV_FILE, ["Spiel", "Spielmodus", "Schwierigkeit", "Spieleranzahl"])
ensure_strafen_csv()

@app.route("/")
def index():
    entries = load_entries(CSV_FILE, ["Spiel", "Spielmodus", "Schwierigkeit", "Spieleranzahl"])
    
    gv = initialize_game_vars(entries)
    
    return render_template("index.html", game_vars=gv)

@app.route("/challenge")
def challenge():
    # Beispiel: Rendere eine Challenge-Seite (falls du diese separat möchtest)
    # challenge_data könnte über Session oder einen anderen Mechanismus übergeben werden.
    # Hier als Platzhalter:
    challenge_data = {}
    return render_template("challenge.html", challenge_data=challenge_data)

@app.route("/games")
def games():
    # Rendert die Games-Konfigurationsseite. 
    # Hier kannst du beispielsweise die bestehenden Spieleinträge anzeigen und bearbeiten.
    entries = load_entries(CSV_FILE, ["Spiel", "Spielmodus", "Schwierigkeit", "Spieleranzahl"])
    initialize_game_vars(entries)
    return render_template("games.html", games=entries, game_vars=game_vars)

@app.route("/strafen")
def strafen():
    # Rendert die Strafen-Konfigurationsseite.
    from modules.strafen import load_strafen
    entries = load_strafen()
    return render_template("strafen.html", strafen=entries)


@app.route("/generate_challenge", methods=["POST"])
def generate_challenge():
    try:
        print("==== DEBUG: /generate_challenge aufgerufen ====")

        # 1) Formulardaten
        num_players = int(request.form.get("num_players", 1))
        desired_diff = float(request.form.get("desired_diff", 10.0))
        raw_b2b = int(request.form.get("raw_b2b", 1))

        # 2) Spiele & Gewichte (keine Konvertierung zu Kleinbuchstaben/Leerzeichen entfernen)
        selected_games = request.form.getlist("selected_games")
        weights = [float(w) for w in request.form.getlist("weights")]

        # 3) CSV + game_vars
        entries = load_entries(CSV_FILE, ["Spiel", "Spielmodus", "Schwierigkeit", "Spieleranzahl"])
        gv = initialize_game_vars(entries)

        # 4) Modus-Checkboxen pro Spiel (mit [] im Parameternamen)
        for game in selected_games:
            param_name = f"allowed_modes_{game}[]"  # Hinzufügen von []
            chosen_modes = request.form.getlist(param_name)
            print(f"DEBUG: Modusauswahl für {game}: {chosen_modes}")

            # Fallback auf verfügbare Modi, falls keine ausgewählt
            if not chosen_modes:
                chosen_modes = gv.get(game, {}).get("available_modes", [])
            
            if game in gv:
                gv[game]["allowed_modes"] = chosen_modes

        # 5) Challenge erzeugen
        result = generate_challenge_logic(
            num_players, desired_diff, selected_games, weights, gv, raw_b2b
        )
        return jsonify(result if result else {"error": "Keine passenden Einträge gefunden."})

    except Exception as e:
        print("Fehler in /generate_challenge:", e)
        return jsonify({"error": str(e)})







if __name__ == "__main__":
    app.run()
