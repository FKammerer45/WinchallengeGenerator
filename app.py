#app.py
import logging
from flask import Flask, render_template, request, jsonify
from flask_wtf.csrf import CSRFProtect
from flask_login import LoginManager, current_user, login_required
from sqlalchemy import JSON
from modules.auth import auth_bp
from modules.models import SessionLocal, GameEntry, Base, engine, User , SavedGameTab
from modules.challenge_generator import generate_challenge_logic
from modules.game_preferences import initialize_game_vars
from sqlalchemy.exc import SQLAlchemyError

from contextlib import contextmanager
import json

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
        if request.is_json:
            data = request.get_json()
            selected_games = data.get("selected_games", [])
            weights = data.get("weights", [])
            num_players = int(data.get("num_players", 1))
            desired_diff = float(data.get("desired_diff", 10.0))
            raw_b2b = int(data.get("raw_b2b", 1))
            entries = data.get("entries", [])
            selected_modes = data.get("selected_modes", {})  # New parameter
        else:
            selected_games = request.form.getlist("selected_games")
            weights = request.form.getlist("weights")
            num_players = int(request.form.get("num_players", 1))
            desired_diff = float(request.form.get("desired_diff", 10.0))
            raw_b2b = int(request.form.get("raw_b2b", 1))
            import json
            entries = json.loads(request.form.get("entries", "[]"))
            selected_modes_str = request.form.get("selected_modes", "{}")
            try:
                selected_modes = json.loads(selected_modes_str)
            except Exception as e:
                selected_modes = {}

        # Convert selected_games to lowercase for matching.
        selected_games = [g.lower() for g in selected_games]

        # Initialize game preferences using the provided entries.
        from modules.game_preferences import initialize_game_vars
        game_preferences = initialize_game_vars(entries)

        # Generate the challenge including the selected_modes parameter.
        from modules.challenge_generator import generate_challenge_logic
        challenge_result = generate_challenge_logic(
            num_players,
            desired_diff,
            selected_games,
            [float(w) for w in weights],
            game_preferences,
            raw_b2b,
            entries=entries,
            selected_modes=selected_modes  # New parameter passed to the generator
        )
        if challenge_result is None:
            return jsonify({"error": "No matching entries found."})
        return jsonify(challenge_result)
    except Exception as e:
        app.logger.exception("Error in generate_challenge:")
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
    
@app.route("/save_tab", methods=["POST"])
@login_required
def save_tab():
    data = request.get_json()
    if not data:
        app.logger.error("No data provided to /save_tab endpoint.")
        return jsonify({"error": "No data provided"}), 400

    # Debug: Print the received data.
    app.logger.debug("Data received for saving tab: %s", data)

    # Use keys "tabId" and "tabName" as provided by the client.
    tab_id = data.get("tabId")
    tab_name = data.get("tabName")
    entries = data.get("entries")


    if not tab_id or tab_id == "default":
        app.logger.error("Attempt to save default tab or missing tabId: %s", tab_id)
        return jsonify({"error": "Cannot save the default tab"}), 400

    # Log the values we are about to save.
    app.logger.debug("Attempting to save tab. tabId (client): %s, tabName: %s, entries: %s", 
                       tab_id, tab_name, entries)

    session = SessionLocal()
    try:
        # Check how many saved tabs the user already has.
        saved_count = session.query(SavedGameTab).filter_by(user_id=current_user.id).count()
        if saved_count >= 5:
            app.logger.error("User %s has reached the maximum number of saved tabs.", current_user.id)
            return jsonify({"error": "You have reached the maximum number of saved tabs (5)."}), 400

        # Try to find an existing saved tab for this client_tab_id.
        saved_tab = session.query(SavedGameTab).filter_by(
            user_id=current_user.id, client_tab_id=tab_id
        ).first()

        # Debug: Log if we found an existing tab.
        if saved_tab:
            app.logger.debug("Found existing SavedGameTab: id=%s", saved_tab.id)
            saved_tab.tab_name = tab_name
            saved_tab.entries_json = json.dumps(entries)
        else:
            app.logger.debug("No existing SavedGameTab found; creating a new one.")
            saved_tab = SavedGameTab(
                user_id=current_user.id,
                client_tab_id=tab_id,
                tab_name=tab_name,
                entries_json=json.dumps(entries)
            )
            session.add(saved_tab)
        session.commit()
        app.logger.debug("SavedGameTab committed to DB with id: %s", saved_tab.id)
        return jsonify({"status": "ok"})
    except Exception as e:
        session.rollback()
        app.logger.exception("Error saving tab:")
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()

@app.route("/delete_tab", methods=["POST"])
@login_required
def delete_tab():
    data = request.get_json()
    if not data or "tabId" not in data:
        return jsonify({"error": "Missing tabId"}), 400

    client_tab_id = data["tabId"]
    # First delete locally (client code does that) then attempt to delete in DB
    try:
        with SessionLocal() as db_session:
            tab = db_session.query(SavedGameTab).filter_by(
                user_id=current_user.id, client_tab_id=client_tab_id
            ).first()
            if tab:
                db_session.delete(tab)
                db_session.commit()
        return jsonify({"status": "ok"})
    except Exception as e:
        app.logger.exception("Error deleting tab:")
        return jsonify({"error": "Server error while deleting tab."}), 500



@app.route("/load_saved_tabs", methods=["GET"])
@login_required
def load_saved_tabs():
    try:
        with SessionLocal() as db_session:
            saved_tabs = db_session.query(SavedGameTab).filter_by(user_id=current_user.id).all()
            tabs_data = {}
            

            for tab in saved_tabs:
                
                # Use client_tab_id as the key
                tabs_data[tab.client_tab_id] = {
                    "tab_name": tab.tab_name,
                    "entries_json": tab.entries_json,
                    "timestamp": tab.timestamp.isoformat() if tab.timestamp else None,
                }
        return jsonify(tabs_data)
    except Exception as e:
        app.logger.exception("Error loading saved tabs:")
        return jsonify({"error": str(e)}), 500



if __name__ == "__main__":
    app.run()
