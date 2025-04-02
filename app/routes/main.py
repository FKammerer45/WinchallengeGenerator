# app/routes/main.py
import logging
from flask import Blueprint, render_template, jsonify, request, current_app, abort, flash, redirect, url_for
from flask_login import current_user, login_required
# --- REMOVE THIS LINE ---
# from app import db
# --- ADD THIS LINE (adjust path if database.py is elsewhere) ---
from app.database import SessionLocal
# --- Keep Model Imports ---
from app.models import SharedChallenge, ChallengeGroup
# --- Keep SQLAlchemy Imports ---
from sqlalchemy.orm import joinedload, selectinload

from sqlalchemy import desc
# --- Keep Logging ---
logger = logging.getLogger(__name__)

main_bp = Blueprint('main', __name__)

# In-memory storage for accepted challenges (Not persistent!)
# This list is no longer used by the /challenge/<public_id> route.
# Consider if it's needed elsewhere or should be removed/replaced with DB logic.
accepted_challenges_list = []

@main_bp.route("/")
def index():
    """Renders the main page (challenge generation form)."""
    logger.debug("Rendering index page.")
    # Game preferences are handled client-side via localStorage.
    # Pass an empty dict to avoid template errors if game_vars is expected.
    return render_template("index.html", game_vars={})

# <<< MODIFIED ROUTE AND FUNCTION >>>
# The original route @main_bp.route("/challenge") is replaced by this parameterized route.
@main_bp.route("/challenge/<public_id>")
def challenge_view(public_id):
    """
    Renders the page displaying a specific shared challenge, its groups,
    and determines which group the current user has joined for this challenge.
    """
    logger.debug(f"Request received for shared challenge with public_id: {public_id}")

    with SessionLocal() as session:
        try:
            # Eagerly load groups AND members for checks and display
            shared_challenge = session.query(SharedChallenge).options(
                selectinload(SharedChallenge.groups) # Use selectinload for groups...
                    .selectinload(ChallengeGroup.members) # ...and members within each group
            ).filter_by(public_id=public_id).first()

            if shared_challenge is None:
                logger.warning(f"Shared challenge with public_id '{public_id}' not found.")
                abort(404)

            # --- Find which group the current user joined (if any) ---
            user_joined_group_id = None
            if current_user.is_authenticated:
                logger.debug(f"Checking group membership for user {current_user.id} and challenge {shared_challenge.id}")
                # Iterate through the already loaded groups and their members
                for group in shared_challenge.groups:
                    # Efficient check using the loaded members list
                    if any(member.id == current_user.id for member in group.members):
                        user_joined_group_id = group.id
                        logger.debug(f"User {current_user.id} found in group {group.id}")
                        break # User can only be in one group per challenge
            # --- End membership check ---

            logger.debug(f"Found challenge '{shared_challenge.name or public_id}'. User joined group ID: {user_joined_group_id}. Rendering view.")
            # Pass the challenge object AND the user's joined group ID to the template
            return render_template(
                "challenge.html",
                shared_challenge=shared_challenge,
                user_joined_group_id=user_joined_group_id # Pass the ID (or None)
            )

        except Exception as e:
             logger.exception(f"Error loading shared challenge {public_id} in main.py")
             flash("Could not load the requested challenge due to a server error.", "danger")
             return "<h1>Error</h1><p>Could not load challenge.</p>", 500

@main_bp.route("/games")
def games_config():
    """Renders the games configuration page."""
    logger.debug("Rendering games config page.")
    # Data for this page (tabs, entries) is primarily managed client-side.
    # Pass empty structures to avoid template errors if variables are expected.
    return render_template(
        "games/games.html",
        games=[],              # Entries rendered by JS from localStorage
        existing_games=[],     # Datalist populated by JS from localStorage
        game_vars={}           # Preferences handled by JS from localStorage
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
    # NOTE: This still uses the in-memory accepted_challenges_list.
    # Consider if this logic needs to change (e.g., relate to user accounts or groups).
    data = request.get_json()
    # Basic validation: Check if it looks like challenge data
    if not data or not isinstance(data, dict) or 'result' not in data:
        logger.warning(f"Received invalid data structure for /accept_challenge: {type(data)}")
        return jsonify({"error": "Invalid challenge data provided"}), 400

    # Log acceptance, including penalty status
    p_info = data.get('penalty_info') # Will be dict or None
    log_msg = "Accepting challenge (in-memory)."
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



@main_bp.route("/my_challenges")
@login_required # Make sure only logged-in users can see this
def my_challenges_view():
    """Displays a list of challenges created by the current user."""
    logger.debug(f"Request received for /my_challenges by user {current_user.username}")

    user_challenges = []
    try:
        with SessionLocal() as session:
            # Query challenges created by the current user, order by most recent
            # Optionally load group count if needed: options(selectinload(SharedChallenge.groups))
            # But for a simple list, maybe skip loading groups for performance
            user_challenges = session.query(SharedChallenge)\
                .filter(SharedChallenge.creator_id == current_user.id)\
                .order_by(desc(SharedChallenge.created_at))\
                .all()
            logger.info(f"Found {len(user_challenges)} challenges for user {current_user.username}")

    except Exception as e:
        logger.exception(f"Error fetching challenges for user {current_user.username}")
        flash("Could not load your challenges due to a server error.", "danger")
        # Redirect home or render template with error? Redirect is simpler.
        return redirect(url_for('main.index'))

    # Pass the fetched challenges to the new template
    return render_template("my_challenges.html", user_challenges=user_challenges)