# app/routes/challenge_api.py
import logging
import json
from flask import Blueprint, request, jsonify, current_app
# Import logic functions
from app.modules.challenge_generator import generate_challenge_logic
from app.modules.game_preferences import initialize_game_vars

logger = logging.getLogger(__name__)

challenge_api_bp = Blueprint('challenge_api', __name__, url_prefix='/api/challenge')

@challenge_api_bp.route("/generate", methods=["POST"])
def generate_challenge():
    """API endpoint to generate a new challenge, optionally including penalty info."""
    logger.debug("Request received for /api/challenge/generate")
    # Dictionary to hold parsed data and eventually the penalty info
    generation_data = {}
    try:
        # --- 1. Parse Input Parameters ---
        # Prioritize form data as sent by current JS
        if request.form and 'selected_games' in request.form:
            generation_data['selected_games'] = request.form.getlist("selected_games")
            generation_data['weights_str'] = request.form.getlist("weights")
            generation_data['num_players'] = int(request.form.get("num_players", 1))
            generation_data['desired_diff'] = float(request.form.get("desired_diff", 10.0))
            generation_data['raw_b2b'] = int(request.form.get("raw_b2b", 1))
            generation_data['generation_pool_entries'] = json.loads(request.form.get("entries", "[]"))
            generation_data['selected_modes'] = json.loads(request.form.get("selected_modes", "{}"))
            # New penalty/player fields from form
            generation_data['use_penalties'] = request.form.get('use_penalties') == 'on' # Checkbox value is 'on' if checked
            generation_data['penalty_tab_id'] = request.form.get('penalty_tab_id', 'default')
            generation_data['player_names'] = request.form.getlist('player_names[]') # Use [] for multiple inputs with same name
            logger.debug("Parsing parameters from Form data.")

        elif request.is_json:
             # Fallback for raw JSON POST (ensure frontend sends these keys if using JSON)
            data = request.get_json()
            if not data: return jsonify({"error": "Invalid JSON data received."}), 400
            generation_data['selected_games'] = data.get("selected_games", [])
            generation_data['weights_str'] = data.get("weights", [])
            generation_data['num_players'] = int(data.get("num_players", 1))
            generation_data['desired_diff'] = float(data.get("desired_diff", 10.0))
            generation_data['raw_b2b'] = int(data.get("raw_b2b", 1))
            generation_data['generation_pool_entries'] = data.get("entries", [])
            generation_data['selected_modes'] = data.get("selected_modes", {})
             # New penalty/player fields from JSON
            generation_data['use_penalties'] = data.get('use_penalties', False)
            generation_data['penalty_tab_id'] = data.get('penalty_tab_id', 'default')
            generation_data['player_names'] = data.get('player_names', [])
            logger.debug("Parsing parameters from JSON data.")
        else:
            logger.warning("Received request with unexpected content type or missing form data.")
            return jsonify({"error": "Unsupported request format. Use form data or JSON."}), 415

        # Log received data
        logger.debug(f"Received selected_games: {generation_data.get('selected_games')}")
        logger.debug(f"Received weights (str): {generation_data.get('weights_str')}")
        logger.debug(f"Received num_players: {generation_data.get('num_players')}")
        logger.debug(f"Received desired_diff: {generation_data.get('desired_diff')}")
        logger.debug(f"Received raw_b2b: {generation_data.get('raw_b2b')}")
        logger.debug(f"Number of entries in potential pool: {len(generation_data.get('generation_pool_entries', []))}")
        logger.debug(f"Received selected_modes: {generation_data.get('selected_modes')}")
        # Log new fields
        logger.debug(f"Received use_penalties: {generation_data.get('use_penalties')}")
        logger.debug(f"Received penalty_tab_id: {generation_data.get('penalty_tab_id')}")
        logger.debug(f"Received player_names: {generation_data.get('player_names')}")


        # --- 2. Determine Game Variables ---
        game_vars_for_logic = initialize_game_vars(generation_data.get('generation_pool_entries', []))
        logger.debug(f"Initialized game_vars based on submitted pool: {game_vars_for_logic}")
        # ... (checks for empty game_vars) ...
        if not game_vars_for_logic and generation_data.get('generation_pool_entries'):
             logger.warning("initialize_game_vars returned empty despite receiving entries.")
        elif not game_vars_for_logic and not generation_data.get('generation_pool_entries'):
             logger.warning("initialize_game_vars returned empty because no entries were submitted.")


        # --- 3. Process Weights ---
        selected_games = generation_data.get('selected_games', [])
        weights_str = generation_data.get('weights_str', [])
        processed_weights = []
        # ... (keep existing weight processing logic) ...
        if len(selected_games) == len(weights_str):
            try: processed_weights = [float(w) for w in weights_str]
            except ValueError: logger.warning(f"Invalid weights: {weights_str}. Using 1.0."); processed_weights = [1.0] * len(selected_games)
        else: logger.warning(f"Weights/Games count mismatch. Using 1.0."); processed_weights = [1.0] * len(selected_games)
        logger.debug(f"Processed weights: {processed_weights}")


        # --- 4. Prepare Final Parameters ---
        selected_games_lower = [g.lower() for g in selected_games]

        # --- 5. Call Challenge Generation Logic ---
        logger.debug("Calling generate_challenge_logic...")
        challenge_result_data = generate_challenge_logic(
            num_players=generation_data.get('num_players', 1),
            desired_diff=generation_data.get('desired_diff', 10.0),
            selected_games=selected_games_lower,
            weights=processed_weights,
            game_vars=game_vars_for_logic,
            raw_b2b=generation_data.get('raw_b2b', 1),
            entries=generation_data.get('generation_pool_entries', []),
            selected_modes=generation_data.get('selected_modes', {})
        )

        # --- 6. Handle Result & Add Penalty Info ---
        if challenge_result_data is None:
            # ... (keep existing error handling for no matching entries) ...
            available_keys = list(game_vars_for_logic.keys())
            logger.error("generate_challenge_logic returned None. Selected: %s, Available in Pool: %s", selected_games_lower, available_keys)
            error_msg = ("No matching entries found for challenge generation. Possible reasons...")
            return jsonify({"error": error_msg})

        # *** Add Penalty/Player info to the result payload if penalties enabled ***
        if generation_data.get('use_penalties'):
            # Validate player names received match number of players selected? Optional.
            num_players_selected = generation_data.get('num_players', 1)
            player_names_received = generation_data.get('player_names', [])
            # Basic check: ensure list has at least num_players items if > 1, trim/pad if necessary?
            # Or just pass through what was received. Let's pass through for now.
            if num_players_selected > 1 and len(player_names_received) != num_players_selected:
                 logger.warning(f"Number of player names ({len(player_names_received)}) doesn't match selected player count ({num_players_selected}).")
                 # Could return error, or just use the names provided.

            challenge_result_data['penalty_info'] = {
                'tab_id': generation_data.get('penalty_tab_id', 'default'),
                'player_names': player_names_received
            }
            logger.info(f"Challenge generated WITH penalty info for tab {challenge_result_data['penalty_info']['tab_id']}")
        else:
             challenge_result_data['penalty_info'] = None # Explicitly set to None if not used
             logger.info("Challenge generated WITHOUT penalties.")

        logger.info("Challenge generated successfully.")
        return jsonify(challenge_result_data) # Return combined result

    # --- Exception Handling ---
    except json.JSONDecodeError as e:
        logger.exception("Failed to decode JSON input:")
        return jsonify({"error": f"Invalid format for JSON data (entries or selected_modes). {e}"}), 400
    except ValueError as e:
        logger.exception("Invalid numeric value received:")
        return jsonify({"error": f"Invalid numeric value provided (e.g., for players, difficulty, b2b, weights). {e}"}), 400
    except Exception as e:
        logger.exception("Unexpected error in generate_challenge:")
        return jsonify({"error": "An unexpected server error occurred during challenge generation."}), 500