# app/routes/games_api.py
import logging
import json
from flask import Blueprint, request, jsonify, current_app
# Import db instance from app
from app import db 
# Import necessary models
from app.models import GameEntry

logger = logging.getLogger(__name__)

# Define the blueprint - RENAME VARIABLE to games_api
games_api = Blueprint('games_api', __name__, url_prefix='/api/games') 

# Update decorator to use the new blueprint name
@games_api.route("/load_defaults", methods=["GET"]) 
def load_default_entries():
    """API endpoint to load all game entries from the database."""
    logger.debug("Request received for /api/games/load_defaults")
    try:
        # Use db.session directly
        entries = db.session.query(GameEntry).order_by(GameEntry.Spiel, GameEntry.Spielmodus).all()
        # Convert model instances to dictionaries using the model's method
        entries_dict = [entry.to_dict() for entry in entries]
        logger.info(f"Loaded {len(entries_dict)} default entries from database.")
        return jsonify({"entries": entries_dict})
        
    except Exception as e:
        db.session.rollback() # Rollback on error
        logger.exception("Failed to load default entries from database.")
        return jsonify({"error": "Failed to load default entries due to a server error."}), 500

# Update decorator to use the new blueprint name

@games_api.route("/save", methods=["POST"])
def save_game():
    """API endpoint to save a NEW game entry to the database."""
    data = request.get_json()
    if not data:
        logger.warning("Received empty data for /api/games/save.")
        return jsonify({"error": "No game data provided."}), 400

    logger.debug(f"Request received for /api/games/save with data: {data}")

    required_fields = ['Spiel', 'Spielmodus', 'Schwierigkeit', 'Spieleranzahl']
    if not all(field in data for field in required_fields):
        logger.warning(f"Missing required fields in save request: {data}")
        return jsonify({"error": "Missing required fields (Spiel, Spielmodus, Schwierigkeit, Spieleranzahl)."}), 400

    try:
        difficulty = float(data['Schwierigkeit'])
        players = int(data['Spieleranzahl'])
        game_name = str(data['Spiel']).strip()
        game_mode = str(data['Spielmodus']).strip()

        # --- ADDED Difficulty Validation ---
        if difficulty <= 0.1:
            logger.warning(f"Invalid difficulty value for save: {difficulty}")
            return jsonify({"error": "Difficulty must be greater than 0.1."}), 400
        # --- END ADDED Validation ---
        if difficulty > 10.0: # Keep upper bound check
             return jsonify({"error": "Difficulty cannot exceed 10.0."}), 400

        if not game_name or not game_mode:
             return jsonify({"error": "Game name and game mode cannot be empty."}), 400
        if players < 1:
             return jsonify({"error": "Number of players must be at least 1."}), 400


        new_entry = GameEntry(
            Spiel=game_name,
            Spielmodus=game_mode,
            Schwierigkeit=difficulty, # Save the validated float
            Spieleranzahl=players
        )
        db.session.add(new_entry)
        db.session.flush()
        new_id = new_entry.id
        db.session.commit()

        logger.info(f"Successfully saved new GameEntry with final ID {new_id}.")
        return jsonify({'success': True, 'entry_id': new_id}), 201

    except ValueError as e:
        db.session.rollback()
        logger.warning(f"Invalid numeric data for /api/games/save: {e}")
        # More specific error message if possible
        if 'Schwierigkeit' in str(e) or 'Spieleranzahl' in str(e):
            return jsonify({"error": "Invalid numeric value for difficulty or players."}), 400
        else:
            return jsonify({"error": "Invalid data format."}), 400
    except Exception as e:
        db.session.rollback()
        logger.exception("Failed to save game entry to database.")
        return jsonify({'error': "Failed to save game entry due to a server error."}), 500

# Update decorator to use the new blueprint name
@games_api.route('/update', methods=['POST'])
def update_game():
    """API endpoint to update an existing game entry in the database."""
    data = request.get_json()
    if not data:
        logger.warning("Received empty data for /api/games/update.")
        return jsonify({"error": "No game data provided."}), 400

    entry_id = data.get('id')
    logger.debug(f"Request received for /api/games/update for ID: {entry_id}")

    if not entry_id:
        logger.warning("Missing 'id' field in update request.")
        return jsonify({"error": "Missing 'id' field for update."}), 400

    required_fields = ['Spiel', 'Spielmodus', 'Schwierigkeit', 'Spieleranzahl']
    if not all(field in data for field in required_fields):
        logger.warning(f"Missing required fields in update request for ID {entry_id}: {data}")
        return jsonify({"error": "Missing required fields (Spiel, Spielmodus, Schwierigkeit, Spieleranzahl)."}), 400

    try:
        difficulty = float(data['Schwierigkeit'])
        players = int(data['Spieleranzahl'])
        game_name = str(data['Spiel']).strip()
        game_mode = str(data['Spielmodus']).strip()

        # --- ADDED Difficulty Validation ---
        if difficulty <= 0.1:
            logger.warning(f"Invalid difficulty value for update (ID: {entry_id}): {difficulty}")
            return jsonify({"error": "Difficulty must be greater than 0.1."}), 400
        # --- END ADDED Validation ---
        if difficulty > 10.0:
             return jsonify({"error": "Difficulty cannot exceed 10.0."}), 400

        if not game_name or not game_mode:
             return jsonify({"error": "Game name and game mode cannot be empty."}), 400
        if players < 1:
             return jsonify({"error": "Number of players must be at least 1."}), 400

        entry = db.session.query(GameEntry).filter_by(id=entry_id).first()
        if not entry:
            logger.warning(f"Game entry with ID {entry_id} not found for update.")
            return jsonify({"error": f"Game entry with ID {entry_id} not found."}), 404

        entry.Spiel = game_name
        entry.Spielmodus = game_mode
        entry.Schwierigkeit = difficulty # Save validated float
        entry.Spieleranzahl = players

        db.session.commit()

        logger.info(f"GameEntry with ID {entry_id} updated successfully.")
        return jsonify(success=True)

    except ValueError as e:
        db.session.rollback()
        logger.warning(f"Invalid numeric data for /api/games/update (ID: {entry_id}): {e}")
        if 'Schwierigkeit' in str(e) or 'Spieleranzahl' in str(e):
             return jsonify({"error": "Invalid numeric value for difficulty or players."}), 400
        else:
             return jsonify({"error": "Invalid data format."}), 400
    except Exception as e:
        db.session.rollback()
        logger.exception(f"Failed to update game entry ID {entry_id} in database.")
        return jsonify(error="Failed to update game entry due to a server error."), 500


# Update decorator to use the new blueprint name
@games_api.route('/delete', methods=['POST']) 
def delete_game():
    """API endpoint to delete a game entry from the database."""
    data = request.get_json()
    if not data:
        logger.warning("Received empty data for /api/games/delete.")
        return jsonify({"error": "No game data provided."}), 400

    entry_id = data.get('id')
    logger.debug(f"Request received for /api/games/delete for ID: {entry_id}")

    if not entry_id:
        logger.warning("Missing 'id' field in delete request.")
        return jsonify({"error": "Missing 'id' field for delete."}), 400

    try:
        # Use db.session directly
        entry = db.session.query(GameEntry).filter_by(id=entry_id).first()
        if not entry:
            logger.warning(f"Game entry with ID {entry_id} not found for deletion.")
            return jsonify({"error": f"Game entry with ID {entry_id} not found."}), 404

        db.session.delete(entry)
        db.session.commit() # Commit the deletion
        
        logger.info(f"Successfully deleted GameEntry with ID {entry_id}.")
        return jsonify(success=True)
        
    except Exception as e:
        db.session.rollback() # Rollback on error during delete/commit
        logger.exception(f"Failed to delete game entry ID {entry_id} from database.")
        return jsonify(error="Failed to delete game entry due to a server error."), 500

