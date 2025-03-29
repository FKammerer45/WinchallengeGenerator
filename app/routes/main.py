# app/routes/main.py
import logging
from flask import Blueprint, render_template, jsonify, request, current_app
# Note: We don't need current_user or login_required for these specific routes yet
# from flask_login import current_user, login_required

# Import necessary logic or data loading functions
# For strafen, we still load from CSV via the module
from app.modules.strafen import load_strafen

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

@main_bp.route("/strafen") # Assuming 'strafen' means 'penalties'
def penalties_view():
    """Renders the page displaying penalties from the CSV file."""
    logger.debug("Rendering penalties page.")
    try:
        # Load penalties from the CSV file using the dedicated module.
        penalty_entries = load_strafen()
        return render_template("strafen.html", strafen=penalty_entries) # Pass as 'strafen' for template compatibility
    except FileNotFoundError:
        logger.error(f"Penalties CSV file not found at configured path.")
        # Render the template with an empty list and potentially flash a message (requires flash import)
        # from flask import flash
        # flash("Penalty data file not found.", "warning")
        return render_template("strafen.html", strafen=[])
    except Exception as e:
        logger.exception("Error loading penalties:")
        # Render template with empty list and indicate error
        return render_template("strafen.html", strafen=[], error="Could not load penalty data.")


@main_bp.route("/accept_challenge", methods=["POST"])
def accept_challenge():
    """API endpoint to accept a generated challenge."""
    # TODO: Persist accepted challenges in the database instead of memory.
    data = request.get_json()
    if not data:
        logger.warning("Received empty data for /accept_challenge.")
        # Decide if empty data is acceptable or an error
        # return jsonify({"error": "No challenge data provided"}), 400
        pass # Allowing empty for now

    logger.info(f"Accepting challenge data: {data.get('result', 'No result data')[:100]}...") # Log snippet
    accepted_challenges_list.append(data)
    # Maybe limit the size of accepted_challenges_list?
    return jsonify({"status": "ok"})