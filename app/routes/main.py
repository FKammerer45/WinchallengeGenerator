# app/routes/main.py
import logging
from flask import Blueprint, render_template, jsonify, request, current_app
# Note: We don't need current_user or login_required for these specific routes yet
# from flask_login import current_user, login_required


logger = logging.getLogger(__name__)

main_bp = Blueprint('main', __name__)

# In-memory storage for accepted challenges (Not persistent!)
# TODO: Consider moving accepted challenges to the database for persistence.
accepted_challenges_list = []

@main_bp.route("/")
def index():
    """Renders the main page (challenge generation form)."""
    logger.debug("Rendering index page.")
    # Game preferences are handled client-side via localStorage.
    # Pass an empty dict to avoid template errors if game_vars is expected.
    return render_template("index.html", game_vars={})

@main_bp.route("/challenge")
def challenge_view():
    """Renders the page displaying accepted challenges."""
    logger.debug(f"Rendering challenge view page with {len(accepted_challenges_list)} accepted challenges.")
    # Pass the current list of accepted challenges to the template.
    return render_template("challenge.html", challenges=accepted_challenges_list)

@main_bp.route("/games")
def games_config():
    """Renders the games configuration page."""
    logger.debug("Rendering games config page.")
    # Data for this page (tabs, entries) is primarily managed client-side.
    # Pass empty structures to avoid template errors if variables are expected.
    return render_template(
        "games/games.html",
        games=[],                # Entries rendered by JS from localStorage
        existing_games=[],       # Datalist populated by JS from localStorage
        game_vars={}             # Preferences handled by JS from localStorage
    )

@main_bp.route("/penalties") # Route path remains /penalties
def penalties_config(): # Function name updated
    """Renders the penalties configuration page (data loaded client-side)."""
    logger.debug("Rendering penalties config page shell.")
    # Just render the template, JavaScript will fetch defaults or load from localStorage
    return render_template("penalties.html")


@main_bp.route("/accept_challenge", methods=["POST"])
def accept_challenge():
    """API endpoint to accept a generated challenge (potentially including penalty info)."""
    data = request.get_json()
    # Basic validation: Check if it looks like challenge data
    if not data or not isinstance(data, dict) or 'result' not in data:
        logger.warning(f"Received invalid data structure for /accept_challenge: {type(data)}")
        return jsonify({"error": "Invalid challenge data provided"}), 400

    # Log acceptance, including penalty status
    p_info = data.get('penalty_info') # Will be dict or None
    log_msg = "Accepting challenge."
    if p_info and isinstance(p_info, dict): # Check if it's the expected dict
        log_msg += f" Includes penalty info for tab '{p_info.get('tab_id')}' and players {p_info.get('player_names')}."
    else:
        log_msg += " No penalty info included."
    logger.info(log_msg)
    # Log challenge details snippet (optional)
    # logger.debug(f"Accepted challenge details (start): {data.get('result', '')[:100]}...")

    accepted_challenges_list.append(data)
    # Optional: Limit the size of the list
    MAX_ACCEPTED = 20 # Example limit
    if len(accepted_challenges_list) > MAX_ACCEPTED:
        accepted_challenges_list.pop(0) # Remove the oldest challenge

    return jsonify({"status": "ok"})