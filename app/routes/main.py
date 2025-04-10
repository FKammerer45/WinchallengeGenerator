# app/routes/main.py
import logging
import uuid
from flask import Blueprint, render_template, request, abort, flash, redirect, url_for, current_app
from flask_login import current_user
from app.database import SessionLocal # Use SessionLocal context manager
from app.models import SharedChallenge, ChallengeGroup, User
from sqlalchemy.orm import joinedload, selectinload
from sqlalchemy import desc

logger = logging.getLogger(__name__)
main_bp = Blueprint('main', __name__)


@main_bp.route("/")
def index():
    """Renders the main page (challenge generation form)."""
    logger.debug("Rendering index page.")
    return render_template("index.html", game_vars={})

@main_bp.route("/games")
def games_config():
    """Renders the games configuration page."""
    logger.debug("Rendering games config page.")
    # Pass empty lists/dicts initially, JS will populate from localStorage/API
    return render_template("games/games.html", games=[], existing_games=[], game_vars={})

@main_bp.route("/penalties")
def penalties_config():
    """Renders the penalties configuration page."""
    logger.debug("Rendering penalties config page shell.")
    return render_template("penalties.html")

# --- My Challenges Page ---
@main_bp.route("/my_challenges")
def my_challenges_view():
    """Displays DB challenges for logged-in users OR prepares shell for JS local view."""
    logger.debug(f"Request received for /my_challenges...")
    user_challenges = []
    is_authenticated = current_user.is_authenticated

    if is_authenticated:
        logger.debug(f"... by authenticated user {current_user.username}")
        try:
            # Use context manager for session handling
            with SessionLocal() as session:
                user_challenges = session.query(SharedChallenge)\
                .filter(SharedChallenge.creator_id == current_user.id)\
                .order_by(desc(SharedChallenge.created_at))\
                .options(selectinload(SharedChallenge.groups))\
                .all()
                logger.info(f"Found {len(user_challenges)} DB challenges for user {current_user.username}")
        except Exception as e:
            logger.exception(f"Error fetching DB challenges for user {current_user.username}")
            flash("Could not load your saved challenges due to a server error.", "danger")
            user_challenges = [] # Ensure it's an empty list on error
    else:
        logger.debug("... by anonymous user. Will rely on JS for local challenges.")

    return render_template(
        "my_challenges.html",
        user_challenges=user_challenges,
        is_authenticated=is_authenticated
        )

# --- Unified Challenge View Route ---
@main_bp.route("/challenge/<string:challenge_id>")
def challenge_view(challenge_id):
    """
    Renders the view for DB or Local challenges.
    Ensures fresh group data is loaded for DB challenges.
    """
    logger.debug(f"Request received for /challenge/{challenge_id}")

    is_local = False
    shared_challenge = None
    initial_groups_data = None # Will hold data prepared for template
    user_joined_group_id = None

    if challenge_id.startswith("local_"):
        is_local = True
        logger.debug(f"Identified as local challenge ID: {challenge_id}")
        # For local challenges, JS handles loading data and rendering
        # Pass minimal necessary info
        num_players_per_group = 1 # Not relevant for local, but provide default
        is_multigroup = False

    else:
        # --- Database Challenge Logic ---
        is_local = False
        is_multigroup = False # Default
        num_players_per_group = 1 # Default

        # Validate UUID format
        try:
            uuid.UUID(challenge_id, version=4)
        except ValueError:
            logger.warning(f"Invalid public_id format provided: {challenge_id}")
            abort(404)

        logger.debug(f"Attempting to load DB challenge: {challenge_id}")
        try:
            with SessionLocal() as session:
                # Query challenge with related data
                shared_challenge = session.query(SharedChallenge).options(
                    selectinload(SharedChallenge.groups).selectinload(ChallengeGroup.members),
                    joinedload(SharedChallenge.creator)
                ).filter(SharedChallenge.public_id == challenge_id).first()

                if not shared_challenge:
                    logger.warning(f"DB Challenge {challenge_id} not found.")
                    abort(404)

                # --- *** FIX: Refresh group objects to get latest state *** ---
                logger.debug(f"Refreshing group data for challenge {challenge_id}...")
                refreshed_groups = []
                for group in shared_challenge.groups:
                    try:
                        session.refresh(group)
                        refreshed_groups.append(group)
                        # Log the progress data *after* refresh
                        # logger.debug(f"  Group ID {group.id} refreshed. Progress: {group.progress_data}")
                    except Exception as refresh_err:
                        # Log error but continue if possible
                        logger.error(f"Failed to refresh group {group.id}: {refresh_err}")
                        refreshed_groups.append(group) # Append original if refresh fails? Or skip? Let's append original.
                # --- *** END FIX *** ---

                # Use the potentially refreshed group objects from the list
                shared_challenge.groups = refreshed_groups # Update the relationship list if needed elsewhere

                # Get challenge config values from the loaded object
                is_multigroup = shared_challenge.max_groups > 1
                num_players_per_group = shared_challenge.num_players_per_group

                # Determine user membership in any group of this challenge
                if current_user.is_authenticated:
                    for group in shared_challenge.groups: # Use refreshed groups
                        if any(member.id == current_user.id for member in group.members):
                            user_joined_group_id = group.id
                            break # Found the group user is in

                # Prepare data specifically for the template, using refreshed group data
                initial_groups_data = [
                     {
                        "id": g.id,
                        "name": g.group_name,
                        "progress": g.progress_data or {}, # Use refreshed progress data
                        "member_count": len(g.members),
                        "player_names": g.player_names or [],
                        "active_penalty_text": g.active_penalty_text or ""
                     }
                     # Iterate over the refreshed groups list obtained earlier
                     for g in shared_challenge.groups
                ]
                logger.debug(f"Prepared initial_groups_data with {len(initial_groups_data)} groups.")

        except Exception as db_err:
            # Handle potential database errors during query or refresh
            logger.exception(f"Database error loading challenge {challenge_id}: {db_err}")
            # Show a generic error page or flash message
            flash("Failed to load challenge details due to a database error.", "danger")
            # Render a minimal error state or redirect? Let's abort for now.
            abort(500) # Internal Server Error

    # Render the single template, passing calculated/fetched data
    try:
        return render_template(
            "challenge.html",
            # Pass the main challenge object (needed for some template logic)
            shared_challenge=shared_challenge,
            # Pass specific variables needed by template/JS data attributes
            challenge_id=challenge_id,
            is_local=is_local,
            is_multigroup=is_multigroup,
            user_joined_group_id=user_joined_group_id,
            initial_groups=initial_groups_data, # Pass the prepared list
            num_players_per_group=num_players_per_group
        )
    except Exception as render_error:
        logger.exception(f"Error rendering challenge.html for challenge_id {challenge_id}")
        abort(500)


