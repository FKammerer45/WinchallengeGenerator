# app.py
import csv
from flask_wtf.csrf import CSRFProtect
from dotenv import load_dotenv
from flask import Flask, render_template, request, jsonify
from modules.challenge_generator import generate_challenge_logic
from modules.csv_handler import ensure_csv_exists, load_entries, write_entries
from config import CSV_FILE, STRAFEN_CSV
from modules.game_preferences import initialize_game_vars, game_vars
from modules.strafen import ensure_strafen_csv
import os
app = Flask(__name__)
# CSRF-Schutz aktivieren
csrf = CSRFProtect(app)
# Ein zufälliges Secret Key setzen (wichtig für CSRF)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')
app.config["DEBUG"] = True
accepted_challenges = [] 
# Sicherstellen, dass die CSV-Dateien existieren
ensure_csv_exists(CSV_FILE, ["Spiel", "Spielmodus", "Schwierigkeit", "Spieleranzahl"])
ensure_strafen_csv()
CSV_PATH = os.path.join(os.path.dirname(__file__), 'win_challenges.csv')


@app.route("/")
def index():
    entries = load_entries(CSV_FILE, ["Spiel", "Spielmodus", "Schwierigkeit", "Spieleranzahl"])
    
    gv = initialize_game_vars(entries)
    
    return render_template("index.html", game_vars=gv)

@app.route("/challenge")
def challenge():
    # Übergib alle akzeptierten Challenges an challenge.html
    return render_template("challenge.html", challenges=accepted_challenges)

@app.route("/games")
def games():
    entries = load_entries(CSV_FILE, ["Spiel", "Spielmodus", "Schwierigkeit", "Spieleranzahl"])
    # Extrahiere einzigartige Spielnamen (falls es Groß-/Kleinschreibung berücksichtigt)
    existing_games = sorted({entry["Spiel"] for entry in entries})
    gv = initialize_game_vars(entries)
    return render_template("games/games.html", games=entries, existing_games=existing_games, game_vars=gv)

@app.route("/add_game", methods=["POST"])
def add_game():
    try:
        data = request.get_json()  # Erwartet JSON-Daten vom Client
        entries = load_entries(CSV_FILE, ["Spiel", "Spielmodus", "Schwierigkeit", "Spieleranzahl"])
        
        # Neue ID generieren
        new_id = str(max(int(entry["id"]) for entry in entries) + 1) if entries else "1"
        
        new_entry = {
            "id": new_id,
            "Spiel": data.get("Spiel"),
            "Spielmodus": data.get("Spielmodus"),
            "Schwierigkeit": float(data.get("Schwierigkeit")),
            "Spieleranzahl": int(data.get("Spieleranzahl"))
        }
        entries.append(new_entry)
        write_entries(CSV_FILE, entries, ["Spiel", "Spielmodus", "Schwierigkeit", "Spieleranzahl"])
        return jsonify({"entry_id": new_id})
    except Exception as e:
        return jsonify({"error": str(e)})

@app.route('/update_game', methods=['POST'])
def update_game():
    data = request.get_json()
    print("Empfangene Daten (Update):", data)  # Debugging
    entry_id = data.get('id')
    spiel = data.get('spiel')
    spielmodus = data.get('spielmodus')
    schwierigkeit = data.get('schwierigkeit')
    spieleranzahl = data.get('spieleranzahl')

    try:
        entries = load_entries(CSV_FILE, ["Spiel", "Spielmodus", "Schwierigkeit", "Spieleranzahl"])
        for entry in entries:
            if entry["id"] == entry_id:
                entry["Spiel"] = spiel
                entry["Spielmodus"] = spielmodus
                entry["Schwierigkeit"] = schwierigkeit
                entry["Spieleranzahl"] = spieleranzahl
                break

        write_entries(CSV_FILE, entries, ["Spiel", "Spielmodus", "Schwierigkeit", "Spieleranzahl"])
        return jsonify(success=True)
    except Exception as e:
        print("Fehler beim Aktualisieren:", e)  # Debugging
        return jsonify(error=str(e)), 500

@app.route('/delete_game', methods=['POST'])
def delete_game():
    data = request.get_json()
    print("Empfangene Daten (Löschen):", data)  # Debugging
    entry_id = data.get('id')

    try:
        entries = load_entries(CSV_FILE, ["Spiel", "Spielmodus", "Schwierigkeit", "Spieleranzahl"])
        entries = [entry for entry in entries if entry["id"] != entry_id]
        write_entries(CSV_FILE, entries, ["Spiel", "Spielmodus", "Schwierigkeit", "Spieleranzahl"])
        return jsonify(success=True)
    except Exception as e:
        print("Fehler beim Löschen:", e)  # Debugging
        return jsonify(error=str(e)), 500
        
@app.route('/save_game', methods=['POST'])
def save_game():
    data = request.get_json()
    print("Empfangene Daten (Speichern):", data)  # Debugging

    try:
        entries = load_entries(CSV_FILE, ["Spiel", "Spielmodus", "Schwierigkeit", "Spieleranzahl"])
        
        # Neue ID generieren
        new_id = str(max(int(entry["id"]) for entry in entries) + 1) if entries else "1"
        
        new_entry = {
            "id": new_id,
            "Spiel": data['spiel'],
            "Spielmodus": data['spielmodus'],
            "Schwierigkeit": float(data['schwierigkeit']),
            "Spieleranzahl": int(data['spieleranzahl'])
        }
        entries.append(new_entry)
        write_entries(CSV_FILE, entries, ["Spiel", "Spielmodus", "Schwierigkeit", "Spieleranzahl"])
        print("Neuer Eintrag gespeichert:", new_entry)  # Debugging
        return jsonify({'success': True, 'entry_id': new_id})
    except Exception as e:
        print("Fehler beim Speichern:", e)  # Debugging
        return jsonify({'error': str(e)}), 500

@app.route("/strafen")
def strafen():
    # Rendert die Strafen-Konfigurationsseite.
    from modules.strafen import load_strafen
    entries = load_strafen()
    return render_template("strafen.html", strafen=entries)


@app.route("/generate_challenge", methods=["POST"])
def generate_challenge():
    try:
        #print("==== DEBUG: /generate_challenge aufgerufen ====")

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

@app.route("/accept_challenge", methods=["POST"])
def accept_challenge():
    # JSON mit Daten der Challenge
    data = request.json or {}

    # Hänge in die globale Liste:
    accepted_challenges.append(data)

    # Gebe OK zurück
    return jsonify({"status": "ok"})





if __name__ == "__main__":
    app.run()
