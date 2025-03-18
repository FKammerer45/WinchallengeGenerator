# app.py
import logging
from flask_wtf.csrf import CSRFProtect
from dotenv import load_dotenv
from flask import Flask, render_template, request, jsonify
from modules.models import SessionLocal, GameEntry, Base, engine
from modules.challenge_generator import generate_challenge_logic
from modules.game_preferences import initialize_game_vars, game_vars
import os
app = Flask(__name__)
DATABASE_URL = os.getenv("DATABASE_URL", os.getenv('DATABASE_URL'))
# CSRF-Schutz aktivieren
csrf = CSRFProtect(app)
# Ein zufälliges Secret Key setzen (wichtig für CSRF)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')

app.config["DEBUG"] = True
accepted_challenges = [] 

logging.basicConfig(level=logging.DEBUG, 
                    format='%(asctime)s %(levelname)s: %(message)s',
                    handlers=[logging.StreamHandler()])

@app.before_request
def init_db():
    Base.metadata.create_all(bind=engine)

@app.route("/")
def index():
    logging.debug("Starting database query for GameEntry")
    session = SessionLocal()
    db_entries = session.query(GameEntry).all()
    logging.debug(f"Retrieved {len(db_entries)} game entries")
    entries = [entry.to_dict() for entry in db_entries]  # Convert to dict
    gv = initialize_game_vars(entries)
    session.close()
    return render_template("index.html", game_vars=gv)


@app.route("/challenge")
def challenge():
    # Übergib alle akzeptierten Challenges an challenge.html
    return render_template("challenge.html", challenges=accepted_challenges)

@app.route("/games")
def games():
    session = SessionLocal()
    db_entries = session.query(GameEntry).all()
    # Extrahiere einzigartige Spielnamen (z. B. aus dem Attribut "Spiel" der DB-Objekte)
    existing_games = sorted({entry.Spiel for entry in db_entries})
    entries = [entry.to_dict() for entry in db_entries]
    gv = initialize_game_vars(entries)
    session.close()
    return render_template("games/games.html", games=entries, existing_games=existing_games, game_vars=gv)


@app.route("/add_game", methods=["POST"])
def add_game():
    try:
        data = request.get_json()  # Erwartet JSON-Daten vom Client
        session = SessionLocal()
        new_entry = GameEntry(
            Spiel=data.get("spiel"),
            Spielmodus=data.get("spielmodus"),
            Schwierigkeit=float(data.get("schwierigkeit")),
            Spieleranzahl=int(data.get("spieleranzahl"))
        )
        session.add(new_entry)
        session.commit()
        new_id = new_entry.id  # Automatisch generierte ID aus der DB
        session.close()
        return jsonify({"entry_id": new_id})
    except Exception as e:
        return jsonify({"error": str(e)})


@app.route('/update_game', methods=['POST'])
def update_game():
    data = request.get_json()
    entry_id = data.get('id')
    session = SessionLocal()
    try:
        entry = session.query(GameEntry).filter_by(id=entry_id).first()
        if not entry:
            raise IndexError("Ausgewählter Eintrag existiert nicht.")
        entry.Spiel = data.get('spiel')
        entry.Spielmodus = data.get('spielmodus')
        entry.Schwierigkeit = float(data.get('schwierigkeit'))
        entry.Spieleranzahl = int(data.get('spieleranzahl'))
        session.commit()
        return jsonify(success=True)
    except Exception as e:
        session.rollback()
        print("Fehler beim Aktualisieren:", e)
        return jsonify(error=str(e)), 500
    finally:
        session.close()


@app.route('/delete_game', methods=['POST'])
def delete_game():
    data = request.get_json()
    entry_id = data.get('id')
    session = SessionLocal()
    try:
        entry = session.query(GameEntry).filter_by(id=entry_id).first()
        if not entry:
            raise IndexError("Kein Eintrag ausgewählt oder Eintrag existiert nicht.")
        session.delete(entry)
        session.commit()
        return jsonify(success=True)
    except Exception as e:
        session.rollback()
        print("Fehler beim Löschen:", e)
        return jsonify(error=str(e)), 500
    finally:
        session.close()
        
@app.route('/save_game', methods=['POST'])
def save_game():
    data = request.get_json()
    print("Empfangene Daten (Speichern):", data)  # Debugging

    try:
        session = SessionLocal()
        new_entry = GameEntry(
            Spiel=data['spiel'],
            Spielmodus=data['spielmodus'],
            Schwierigkeit=float(data['schwierigkeit']),
            Spieleranzahl=int(data['spieleranzahl'])
        )
        session.add(new_entry)
        session.commit()
        new_id = new_entry.id  # Automatisch generierte ID
        session.close()
        print("Neuer Eintrag gespeichert:", new_entry)
        return jsonify({'success': True, 'entry_id': new_id})
    except Exception as e:
        print("Fehler beim Speichern:", e)
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
        # 1) Get form data
        num_players = int(request.form.get("num_players", 1))
        desired_diff = float(request.form.get("desired_diff", 10.0))
        raw_b2b = int(request.form.get("raw_b2b", 1))

        # 2) Get selected games and weights
        selected_games = request.form.getlist("selected_games")
        weights = [float(w) for w in request.form.getlist("weights")]

        # 3) Query the database once here
        session = SessionLocal()
        db_entries = session.query(GameEntry).all()
        session.close()
        # Convert entries to dicts
        entries = [entry.to_dict() for entry in db_entries]

        # Initialize game preferences with these entries
        gv = initialize_game_vars(entries)

        # 4) Process allowed modes from form (using same logic)
        for game in selected_games:
            param_name = f"allowed_modes_{game}[]"  # with [] in the parameter name
            chosen_modes = request.form.getlist(param_name)
            if game in gv:
                gv[game]["allowed_modes"] = chosen_modes

        # 5) Generate the challenge based on these entries and game preferences
        result = generate_challenge_logic(
            num_players, desired_diff, selected_games, weights, gv, raw_b2b
        )
        return jsonify(result if result else {"error": "No matching entries found."})
    except Exception as e:
        print("Error in /generate_challenge:", e)
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
