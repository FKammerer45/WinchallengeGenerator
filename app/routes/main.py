# app/routes/main.py
import logging
import uuid
from flask import Blueprint, render_template, request, abort, flash, redirect, url_for, current_app # Added current_app for potential config access
from flask_login import current_user # Removed unnecessary login_required here
from app.database import SessionLocal
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
    return render_template("games/games.html", games=[], existing_games=[], game_vars={})

@main_bp.route("/penalties")
def penalties_config():
    """Renders the penalties configuration page."""
    logger.debug("Rendering penalties config page shell.")
    return render_template("penalties.html")



# --- My Challenges Page ---
@main_bp.route("/my_challenges")
def my_challenges_view():
    """Displays DB challenges for logged-in users OR loads JS
       to display local challenges for anonymous users."""
    logger.debug(f"Request received for /my_challenges...")

    user_challenges = []
    is_authenticated = current_user.is_authenticated

    if is_authenticated:
        logger.debug(f"... by authenticated user {current_user.username}")
        try:
            with SessionLocal() as session:
                # Query challenges created by the current user
                user_challenges = session.query(SharedChallenge)\
                    .filter(SharedChallenge.creator_id == current_user.id)\
                    .order_by(desc(SharedChallenge.created_at))\
                    .options(selectinload(SharedChallenge.groups).selectinload(ChallengeGroup.members))\
                    .all() # <--- Line ~57 in your file?

                # --- CHECK INDENTATION HERE ---
                # This logger line (and subsequent lines) should be aligned
                # with the 'user_challenges = session.query...' line above,
                # NOT indented further than '.all()'.
                logger.info(f"Found {len(user_challenges)} DB challenges for user {current_user.username}")
        # --- Ensure except block is aligned with try ---
        except Exception as e:
            logger.exception(f"Error fetching DB challenges for user {current_user.username}")
            flash("Could not load your saved challenges due to a server error.", "danger")
            user_challenges = []
    else:
        logger.debug("... by anonymous user. Will rely on JS for local challenges.")

    # --- Ensure this return is aligned with the outer 'def' or 'if/else' block ---
    return render_template(
        "my_challenges.html",
        user_challenges=user_challenges,
        is_authenticated=is_authenticated
        )

# --- Unified Challenge View Route ---
@main_bp.route("/challenge/<string:challenge_id>")
def challenge_view(challenge_id):
    """Renders the view for DB or Local challenges."""
    logger.debug(f"Request received for /challenge/{challenge_id}")

    is_local = False
    is_multigroup = False
    shared_challenge = None
    user_joined_group_id = None
    initial_groups_data = None

    if challenge_id.startswith("local_"):
        is_local = True
        logger.debug(f"Identified as local challenge ID: {challenge_id}")
        # JS handles loading, is_multigroup=False, user_joined_group_id=None
    else:
        # Assume database public_id (UUID)
        is_local = False
        try:
            uuid.UUID(challenge_id, version=4) # Validate format
        except ValueError:
            logger.warning(f"Invalid public_id format provided: {challenge_id}")
            abort(404) # Invalid format -> Not Found

        logger.debug(f"Attempting to load DB challenge: {challenge_id}")
        # --- Remove outer try/except Exception block ---
        # Now, only specific DB errors or template errors will cause 500
        with SessionLocal() as session:
            # Query DB challenge with eager loading
            shared_challenge = session.query(SharedChallenge).options(
                selectinload(SharedChallenge.groups).selectinload(ChallengeGroup.members),
                joinedload(SharedChallenge.creator)
            ).filter(SharedChallenge.public_id == challenge_id).first()

            # --- This check now correctly triggers Flask's 404 handler ---
            if not shared_challenge:
                logger.warning(f"DB Challenge {challenge_id} not found in database.")
                abort(404)
            # --- End 404 check ---

            is_multigroup = shared_challenge.max_groups > 1

            # Determine user membership
            if current_user.is_authenticated:
                logger.debug(f"Checking membership for user {current_user.id}...")
                for group in shared_challenge.groups:
                    if any(member.id == current_user.id for member in group.members):
                        user_joined_group_id = group.id; break

            # Prepare initial group data
            initial_groups_data = [
                 {"id": g.id, "name": g.group_name, "progress": g.progress_data or {}, "member_count": len(g.members)}
                 for g in shared_challenge.groups
            ]
            logger.debug(f"Found DB challenge '{shared_challenge.name}'. Mode: {'Multi' if is_multigroup else 'Single'}. User joined: {user_joined_group_id}.")
        # --- End SessionLocal block ---
        # Note: A database connection/query error within the 'with' block would now
        # likely result in a 500 error handled by the global Flask error handler.

    # --- Render the template ---
    # A TemplateSyntaxError here would also result in a 500 error
    try:
        return render_template(
            "challenge.html",
            shared_challenge=shared_challenge,
            challenge_id=challenge_id,
            is_local=is_local,
            is_multigroup=is_multigroup,
            user_joined_group_id=user_joined_group_id,
            initial_groups=initial_groups_data
        )
    except Exception as render_error:
        # Log template rendering errors specifically
        logger.exception(f"Error rendering challenge.html for challenge_id {challenge_id}")
        abort(500) # Abort with 500 if template rendering fails