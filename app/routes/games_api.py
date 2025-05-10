# app/routes/games_api.py
import logging
import json
from flask import Blueprint, request, jsonify, current_app

# Import db instance from app
from app import db 
# Import necessary models
from app.models import GameEntry

# Import the new default game tab definitions
from app.modules.default_definitions import DEFAULT_GAME_TAB_DEFINITIONS

logger = logging.getLogger(__name__)

# Define the blueprint
games_api = Blueprint('games_api', __name__, url_prefix='/api/games') 

@games_api.route("/default_definitions", methods=["GET"])
def get_default_game_tab_definitions():
    """
    API endpoint to load the predefined default game tab structures and their entries.
    These are used to initialize tabs for new users or for users to reference.
    """
    logger.info("Request received for /api/games/default_definitions")
    try:
        # Directly return the imported dictionary.
        # Ensure it's serializable (it should be if it's dicts, lists, strings, numbers, booleans).
        if not DEFAULT_GAME_TAB_DEFINITIONS or not isinstance(DEFAULT_GAME_TAB_DEFINITIONS, dict):
            logger.error("DEFAULT_GAME_TAB_DEFINITIONS is not defined or not a dictionary.")
            return jsonify({"error": "Default game tab definitions are currently unavailable."}), 500
            
        logger.info(f"Serving {len(DEFAULT_GAME_TAB_DEFINITIONS)} default game tab definitions.")
        return jsonify(DEFAULT_GAME_TAB_DEFINITIONS)
        
    except Exception as e:
        logger.exception("Failed to serve default game tab definitions.")
        return jsonify({"error": "Failed to load default game tab definitions due to a server error."}), 500

@games_api.route("/load_defaults", methods=["GET"]) 
def load_default_entries():
    """
    API endpoint to load all game entries from the GameEntry database table.
    This represents the master list of all possible game entries.
    """
    logger.debug("Request received for /api/games/load_defaults (master list)")
    try:
        entries = db.session.query(GameEntry).order_by(GameEntry.Spiel, GameEntry.Spielmodus).all()
        entries_dict = [entry.to_dict() for entry in entries]
        logger.info(f"Loaded {len(entries_dict)} master game entries from database.")
        return jsonify({"entries": entries_dict})
        
    except Exception as e:
        db.session.rollback() 
        logger.exception("Failed to load master game entries from database.")
        return jsonify({"error": "Failed to load master game entries due to a server error."}), 500

# --- Existing /save, /update, /delete endpoints for GameEntry table ---
# These endpoints manage the global GameEntry table, not user-specific SavedGameTab entries.
# They are typically used by an admin interface or for initial seeding if not using commands.py

@games_api.route("/save", methods=["POST"])
def save_game():
    """API endpoint to save a NEW game entry to the GameEntry database table."""
    data = request.get_json()
    if not data:
        logger.warning("Received empty data for /api/games/save (GameEntry).")
        return jsonify({"error": "No game data provided."}), 400

    logger.debug(f"Request received for /api/games/save (GameEntry) with data: {data}")

    required_fields = ['Spiel', 'Spielmodus', 'Schwierigkeit', 'Spieleranzahl']
    if not all(field in data for field in required_fields):
        logger.warning(f"Missing required fields in GameEntry save request: {data}")
        return jsonify({"error": "Missing required fields (Spiel, Spielmodus, Schwierigkeit, Spieleranzahl)."}), 400

    try:
        difficulty = float(data['Schwierigkeit'])
        players = int(data['Spieleranzahl'])
        game_name = str(data['Spiel']).strip()
        game_mode = str(data['Spielmodus']).strip()

        if difficulty <= 0.1:
            logger.warning(f"Invalid difficulty value for GameEntry save: {difficulty}")
            return jsonify({"error": "Difficulty must be greater than 0.1."}), 400
        if difficulty > 10.0:
             return jsonify({"error": "Difficulty cannot exceed 10.0."}), 400
        if not game_name or not game_mode:
             return jsonify({"error": "Game name and game mode cannot be empty."}), 400
        if players < 1:
             return jsonify({"error": "Number of players must be at least 1."}), 400

        # Check for duplicates in GameEntry table
        existing_entry = db.session.query(GameEntry).filter_by(Spiel=game_name, Spielmodus=game_mode).first()
        if existing_entry:
            logger.warning(f"Attempted to save duplicate GameEntry: {game_name} - {game_mode}")
            return jsonify({"error": f"Game entry '{game_name} - {game_mode}' already exists in the master list."}), 409 # 409 Conflict

        new_entry = GameEntry(
            Spiel=game_name,
            Spielmodus=game_mode,
            Schwierigkeit=difficulty,
            Spieleranzahl=players
        )
        db.session.add(new_entry)
        db.session.flush() # To get ID before commit if needed, though not used here
        new_id = new_entry.id
        db.session.commit()

        logger.info(f"Successfully saved new GameEntry with ID {new_id} to master list.")
        return jsonify({'success': True, 'entry_id': new_id, 'message': 'Game entry added to master list.'}), 201

    except ValueError as e:
        db.session.rollback()
        logger.warning(f"Invalid numeric data for /api/games/save (GameEntry): {e}")
        return jsonify({"error": "Invalid numeric value for difficulty or players."}), 400
    except Exception as e:
        db.session.rollback()
        logger.exception("Failed to save game entry to GameEntry database table.")
        return jsonify({'error': "Failed to save game entry to master list due to a server error."}), 500

@games_api.route('/update', methods=['POST'])
def update_game():
    """API endpoint to update an existing game entry in the GameEntry database table."""
    data = request.get_json()
    if not data:
        logger.warning("Received empty data for /api/games/update (GameEntry).")
        return jsonify({"error": "No game data provided."}), 400

    entry_id = data.get('id')
    logger.debug(f"Request received for /api/games/update (GameEntry) for ID: {entry_id}")

    if not entry_id:
        logger.warning("Missing 'id' field in GameEntry update request.")
        return jsonify({"error": "Missing 'id' field for update."}), 400

    required_fields = ['Spiel', 'Spielmodus', 'Schwierigkeit', 'Spieleranzahl']
    if not all(field in data for field in required_fields):
        logger.warning(f"Missing required fields in GameEntry update request for ID {entry_id}: {data}")
        return jsonify({"error": "Missing required fields."}), 400

    try:
        difficulty = float(data['Schwierigkeit'])
        players = int(data['Spieleranzahl'])
        game_name = str(data['Spiel']).strip()
        game_mode = str(data['Spielmodus']).strip()

        if difficulty <= 0.1:
            logger.warning(f"Invalid difficulty value for GameEntry update (ID: {entry_id}): {difficulty}")
            return jsonify({"error": "Difficulty must be greater than 0.1."}), 400
        if difficulty > 10.0:
             return jsonify({"error": "Difficulty cannot exceed 10.0."}), 400
        if not game_name or not game_mode:
             return jsonify({"error": "Game name and game mode cannot be empty."}), 400
        if players < 1:
             return jsonify({"error": "Number of players must be at least 1."}), 400

        entry = db.session.query(GameEntry).filter_by(id=entry_id).first()
        if not entry:
            logger.warning(f"GameEntry with ID {entry_id} not found for update.")
            return jsonify({"error": f"Game entry with ID {entry_id} not found in master list."}), 404

        # Check if the new name/mode combination conflicts with another existing entry
        if (entry.Spiel.lower() != game_name.lower() or entry.Spielmodus.lower() != game_mode.lower()):
            conflicting_entry = db.session.query(GameEntry).filter(
                GameEntry.id != entry_id,
                GameEntry.Spiel.ilike(game_name),
                GameEntry.Spielmodus.ilike(game_mode)
            ).first()
            if conflicting_entry:
                logger.warning(f"Update for GameEntry ID {entry_id} conflicts with existing entry ID {conflicting_entry.id} ({game_name} - {game_mode}).")
                return jsonify({"error": f"Another game entry '{game_name} - {game_mode}' already exists in the master list."}), 409


        entry.Spiel = game_name
        entry.Spielmodus = game_mode
        entry.Schwierigkeit = difficulty
        entry.Spieleranzahl = players
        db.session.commit()

        logger.info(f"GameEntry with ID {entry_id} updated successfully in master list.")
        return jsonify({'success': True, 'message': 'Game entry in master list updated.'})

    except ValueError as e:
        db.session.rollback()
        logger.warning(f"Invalid numeric data for /api/games/update (GameEntry ID: {entry_id}): {e}")
        return jsonify({"error": "Invalid numeric value for difficulty or players."}), 400
    except Exception as e:
        db.session.rollback()
        logger.exception(f"Failed to update GameEntry ID {entry_id} in database.")
        return jsonify({'error': "Failed to update game entry in master list due to a server error."}), 500

@games_api.route('/delete', methods=['POST']) 
def delete_game():
    """API endpoint to delete a game entry from the GameEntry database table."""
    data = request.get_json()
    if not data:
        logger.warning("Received empty data for /api/games/delete (GameEntry).")
        return jsonify({"error": "No game data provided."}), 400

    entry_id = data.get('id')
    logger.debug(f"Request received for /api/games/delete (GameEntry) for ID: {entry_id}")

    if not entry_id:
        logger.warning("Missing 'id' field in GameEntry delete request.")
        return jsonify({"error": "Missing 'id' field for delete."}), 400

    try:
        entry = db.session.query(GameEntry).filter_by(id=entry_id).first()
        if not entry:
            logger.warning(f"GameEntry with ID {entry_id} not found for deletion.")
            return jsonify({"error": f"Game entry with ID {entry_id} not found in master list."}), 404

        db.session.delete(entry)
        db.session.commit()
        
        logger.info(f"Successfully deleted GameEntry with ID {entry_id} from master list.")
        return jsonify({'success': True, 'message': 'Game entry deleted from master list.'})
        
    except Exception as e:
        db.session.rollback()
        logger.exception(f"Failed to delete GameEntry ID {entry_id} from database.")
        return jsonify({'error': "Failed to delete game entry from master list due to a server error."}), 500
