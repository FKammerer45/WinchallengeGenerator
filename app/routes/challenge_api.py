# app/routes/challenge_api.py
import logging
import json
from flask import Blueprint, request, jsonify, current_app
# Import logic functions
from app.modules.challenge_generator import generate_challenge_logic
from app.modules.game_preferences import initialize_game_vars

# Consider if you need DB access here, e.g., to load all entries for game_vars
# from app.database import get_db_session
# from app.models import GameEntry

logger = logging.getLogger(__name__)

challenge_api_bp = Blueprint('challenge_api', __name__, url_prefix='/api/challenge')

@challenge_api_bp.route("/generate", methods=["POST"])
def generate_challenge():
    """API endpoint to generate a new challenge."""
    logger.debug("Request received for /api/challenge/generate")
    try:
        # --- 1. Parse Input Parameters ---
        # Prioritize form data as sent by current JS
        if request.form and 'selected_games' in request.form:
            selected_games = request.form.getlist("selected_games")
            weights_str = request.form.getlist("weights")
            num_players = int(request.form.get("num_players", 1))
            desired_diff = float(request.form.get("desired_diff", 10.0))
            raw_b2b = int(request.form.get("raw_b2b", 1))
            generation_pool_entries = json.loads(request.form.get("entries", "[]"))
            selected_modes = json.loads(request.form.get("selected_modes", "{}"))
            logger.debug("Parsing parameters from Form data.")
        elif request.is_json:
             # Fallback for raw JSON POST
            data = request.get_json()
            if not data: return jsonify({"error": "Invalid JSON data received."}), 400
            selected_games = data.get("selected_games", [])
            weights_str = data.get("weights", [])
            num_players = int(data.get("num_players", 1))
            desired_diff = float(data.get("desired_diff", 10.0))
            raw_b2b = int(data.get("raw_b2b", 1))
            generation_pool_entries = data.get("entries", [])
            selected_modes = data.get("selected_modes", {})
            logger.debug("Parsing parameters from JSON data.")
        else:
            logger.warning("Received request with unexpected content type or missing form data.")
            return jsonify({"error": "Unsupported request format. Use form data or JSON."}), 415 # Unsupported Media Type

        # Log received data (be mindful of potentially large 'entries')
        logger.debug(f"Received selected_games: {selected_games}")
        logger.debug(f"Received weights (str): {weights_str}")
        logger.debug(f"Received num_players: {num_players}")
        logger.debug(f"Received desired_diff: {desired_diff}")
        logger.debug(f"Received raw_b2b: {raw_b2b}")
        logger.debug(f"Number of entries in potential pool: {len(generation_pool_entries)}")
        logger.debug(f"Received selected_modes: {selected_modes}")


        # --- 2. Determine Game Variables (Available Modes/Games) ---
        # Using Option A: Initialize based on the submitted pool, assuming client sent all relevant entries.
        # This approach has limitations if the submitted pool is incomplete or empty.
        # Consider Option B (loading from DB) for more robustness if needed later.
        game_vars_for_logic = initialize_game_vars(generation_pool_entries)
        logger.debug(f"Initialized game_vars based on submitted pool: {game_vars_for_logic}")

        # Check if initialization resulted in usable game vars
        if not game_vars_for_logic and generation_pool_entries:
             logger.warning("initialize_game_vars returned empty despite receiving entries. Check entry structure ('Spiel' key?).")
        elif not game_vars_for_logic and not generation_pool_entries:
             logger.warning("initialize_game_vars returned empty because no entries were submitted.")
             # This will lead to the "No matching entries" error down the line, which is correct in this case.


        # --- 3. Process Weights ---
        processed_weights = []
        if len(selected_games) == len(weights_str):
            try:
                processed_weights = [float(w) for w in weights_str]
            except ValueError:
                logger.warning(f"Invalid value in weights list: {weights_str}. Using default weight 1.0 for all.")
                processed_weights = [1.0] * len(selected_games)
        else:
             logger.warning(f"Mismatch between #selected_games ({len(selected_games)}) and #weights ({len(weights_str)}). Using default 1.0.")
             processed_weights = [1.0] * len(selected_games)
        logger.debug(f"Processed weights: {processed_weights}")

        # --- 4. Prepare Final Parameters for Logic ---
        selected_games_lower = [g.lower() for g in selected_games]

        # --- 5. Call Challenge Generation Logic ---
        logger.debug("Calling generate_challenge_logic...")
        challenge_result = generate_challenge_logic(
            num_players=num_players,
            desired_diff=desired_diff,
            selected_games=selected_games_lower,
            weights=processed_weights,
            game_vars=game_vars_for_logic, # Use derived game_vars
            raw_b2b=raw_b2b,
            entries=generation_pool_entries, # The pool submitted by client
            selected_modes=selected_modes # Mode selections from client
        )

        # --- 6. Handle Result ---
        if challenge_result is None:
            available_keys = list(game_vars_for_logic.keys())
            logger.error("generate_challenge_logic returned None. Selected: %s, Available in Derived game_vars: %s",
                         selected_games_lower, available_keys)
            error_msg = ("No matching entries found for challenge generation. "
                         "Possible reasons: "
                         "1. The selected source tab has no entries for the chosen game(s). "
                         "2. Submitted entries don't meet the minimum player count. "
                         "3. Submitted entries don't match the selected game modes.")
            return jsonify({"error": error_msg})

        logger.info("Challenge generated successfully.")
        return jsonify(challenge_result)

    # --- Specific Exception Handling ---
    except json.JSONDecodeError as e:
        logger.exception("Failed to decode JSON input:") # Log stack trace
        return jsonify({"error": f"Invalid format for JSON data (entries or selected_modes). {e}"}), 400
    except ValueError as e:
        logger.exception("Invalid numeric value received:") # Log stack trace
        return jsonify({"error": f"Invalid numeric value provided (e.g., players, difficulty, b2b, weights). {e}"}), 400
    except Exception as e:
        logger.exception("Unexpected error in generate_challenge:") # Log stack trace
        return jsonify({"error": "An unexpected server error occurred during challenge generation."}), 500