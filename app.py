#app.py
import logging
from flask import Flask, render_template, request, jsonify
from flask_wtf.csrf import CSRFProtect
from flask_login import LoginManager
from modules.auth import auth_bp
from modules.models import SessionLocal, GameEntry, Base, engine, User
from modules.challenge_generator import generate_challenge_logic
from modules.game_preferences import initialize_game_vars
from contextlib import contextmanager

# Initialize Flask app and load configuration from config.py
app = Flask(__name__)
app.config.from_object("config")

# Enable CSRF protection
csrf = CSRFProtect(app)

# Register Blueprints
app.register_blueprint(auth_bp)

# Global list for accepted challenges
accepted_challenges_list = []

# Configure logging
logging.basicConfig(
    level=app.config.get("LOG_LEVEL", "DEBUG"),
    format=app.config.get("LOG_FORMAT", '%(asctime)s %(levelname)s: %(message)s'),
    handlers=[logging.StreamHandler()]
)

# Setup Flask-Login
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = "auth.login"

@login_manager.user_loader
def load_user(user_id):
    with SessionLocal() as db_session:
        return db_session.query(User).get(user_id)

# Context managers for sessions
@contextmanager
def get_db_session():
    """Provide a transactional scope around a series of operations."""
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception as e:
        session.rollback()
        logging.exception("Database error:")
        raise e
    finally:
        session.close()

@app.context_processor
def inject_config():
    return dict(config=app.config)

@app.context_processor
def inject_recaptcha_key():
    return dict(RECAPTCHA_PUBLIC_KEY=app.config.get('RECAPTCHA_PUBLIC_KEY'))

@app.before_request
def ensure_db_schema():
    # Create all tables if they don't exist
    Base.metadata.create_all(bind=engine)

@app.route("/")
def index():
    # Instead of querying the database, send default empty values.
    game_preferences = {}  # Let the client initialize localStorage data
    return render_template("index.html", game_vars=game_preferences)

@app.route("/challenge")
def challenge():
    # Pass all accepted challenges to challenge.html
    return render_template("challenge.html", challenges=accepted_challenges_list)

@app.route("/games")
def games():
    # Since we are now using local storage on the client side,
    # we return empty/default values.
    existing_games = []        # No server-provided games for the datalist
    entries = []               # No game entries from the database
    game_preferences = {}      # Empty dictionary; the client will initialize local data
    return render_template("games/games.html", games=entries, existing_games=existing_games, game_vars=game_preferences)

@app.route("/add_game", methods=["POST"])
def add_game():
    try:
        data = request.get_json()
        with get_db_session() as db_session:
            new_entry = GameEntry(
                Spiel=data.get("spiel"),
                Spielmodus=data.get("spielmodus"),
                Schwierigkeit=float(data.get("schwierigkeit")),
                Spieleranzahl=int(data.get("spieleranzahl"))
            )
            db_session.add(new_entry)
            db_session.flush()  # To get new_entry.id before commit
            new_id = new_entry.id
        return jsonify({"entry_id": new_id})
    except Exception as e:
        logging.exception("Error adding game:")
        return jsonify({"error": str(e)}), 500

@app.route('/update_game', methods=['POST'])
def update_game():
    data = request.get_json()
    entry_id = data.get('id')
    try:
        with get_db_session() as db_session:
            entry = db_session.query(GameEntry).filter_by(id=entry_id).first()
            if not entry:
                raise IndexError("Selected entry does not exist.")
            entry.Spiel = data.get('spiel')
            entry.Spielmodus = data.get('spielmodus')
            entry.Schwierigkeit = float(data.get('schwierigkeit'))
            entry.Spieleranzahl = int(data.get('spieleranzahl'))
        return jsonify(success=True)
    except Exception as e:
        logging.exception("Error updating game:")
        return jsonify(error=str(e)), 500

@app.route('/delete_game', methods=['POST'])
def delete_game():
    data = request.get_json()
    entry_id = data.get('id')
    try:
        with get_db_session() as db_session:
            entry = db_session.query(GameEntry).filter_by(id=entry_id).first()
            if not entry:
                raise IndexError("No entry selected or entry does not exist.")
            db_session.delete(entry)
        return jsonify(success=True)
    except Exception as e:
        logging.exception("Error deleting game:")
        return jsonify(error=str(e)), 500

@app.route('/save_game', methods=['POST'])
def save_game():
    data = request.get_json()

    try:
        with get_db_session() as db_session:
            new_entry = GameEntry(
                Spiel=data['spiel'],
                Spielmodus=data['spielmodus'],
                Schwierigkeit=float(data['schwierigkeit']),
                Spieleranzahl=int(data['spieleranzahl'])
            )
            db_session.add(new_entry)
            db_session.flush()
            new_id = new_entry.id

        return jsonify({'success': True, 'entry_id': new_id})
    except Exception as e:
        logging.exception("Error saving game:")
        return jsonify({'error': str(e)}), 500

@app.route("/strafen")
def strafen():
    from modules.strafen import load_strafen
    entries = load_strafen()
    return render_template("strafen.html", strafen=entries)

import json  # Add at the top if not already imported

@app.route("/generate_challenge", methods=["POST"])
def generate_challenge():
    try:
        # Get JSON data if available, otherwise form data.
        if request.is_json:
            data = request.get_json()
        else:
            data = request.form.to_dict(flat=True)
    

        # Extract required parameters.
        num_players = int(data.get("num_players", 1))
        desired_diff = float(data.get("desired_diff", 10.0))
        raw_b2b = int(data.get("raw_b2b", 1))
        selected_games = data.get("selected_games", [])
        weights = [float(w) for w in data.get("weights", [])]


        # Retrieve game entries from the payload.
        entries = data.get("entries", [])
        if isinstance(entries, str):
            entries = json.loads(entries)

        if not entries:
            logging.error("No game entries provided.")
            return jsonify({"error": "No game entries provided here."}), 400

        # Initialize game preferences using the provided entries.
        game_preferences = initialize_game_vars(entries)
 

        # Optionally update allowed modes if provided.
        if "allowed_modes" in data:
            for game in selected_games:
                if game in game_preferences and game in data["allowed_modes"]:
                    game_preferences[game]["allowed_modes"] = data["allowed_modes"][game]

        # Generate challenge using the provided local entries.
        challenge_result = generate_challenge_logic(
            num_players, desired_diff, selected_games, weights, game_preferences, raw_b2b, entries=entries
        )
        if challenge_result is None:
            return jsonify({"error": "No matching entries found."})
        return jsonify(challenge_result)
    except Exception as e:
        logging.exception("Error in generate_challenge:")
        return jsonify({"error": str(e)}), 500





@app.route("/accept_challenge", methods=["POST"])
def accept_challenge():
    data = request.get_json() or {}
    accepted_challenges_list.append(data)
    return jsonify({"status": "ok"})


@app.route("/load_default_entries", methods=["GET"])
def load_default_entries():
    try:
        with SessionLocal() as db_session:
            entries = db_session.query(GameEntry).all()
            entries_dict = [entry.to_dict() for entry in entries]
        return jsonify({"entries": entries_dict})
    except Exception as e:
        logging.exception("Error loading default entries:")
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run()
