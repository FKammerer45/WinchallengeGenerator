# app/routes/main.py
import logging
import uuid
from flask import Blueprint, render_template, request, abort, flash, redirect, url_for, current_app
from flask_login import current_user
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
    """Displays DB challenges for logged-in users OR prepares shell for JS local view."""
    logger.debug(f"Request received for /my_challenges...")
    user_challenges = []
    is_authenticated = current_user.is_authenticated

    if is_authenticated:
        logger.debug(f"... by authenticated user {current_user.username}")
        try:
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
            user_challenges = []
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
    """Renders the view for DB or Local challenges."""
    logger.debug(f"Request received for /challenge/{challenge_id}")

    is_local = False
    is_multigroup = False
    shared_challenge = None
    user_joined_group_id = None
    initial_groups_data = None
    num_players_per_group = 1 # Default for local/single

    if challenge_id.startswith("local_"):
        is_local = True
        logger.debug(f"Identified as local challenge ID: {challenge_id}")
        # is_multigroup remains False, user_joined_group_id remains None
        # num_players_per_group remains 1 (local is always single effectively)
    else:
        # Assume database public_id (UUID)
        is_local = False
        try:
            uuid.UUID(challenge_id, version=4) # Validate format
        except ValueError:
            logger.warning(f"Invalid public_id format provided: {challenge_id}")
            abort(404)

        logger.debug(f"Attempting to load DB challenge: {challenge_id}")
        with SessionLocal() as session:
            shared_challenge = session.query(SharedChallenge).options(
                # Eager load groups, their members, and the creator
                selectinload(SharedChallenge.groups).selectinload(ChallengeGroup.members),
                joinedload(SharedChallenge.creator)
            ).filter(SharedChallenge.public_id == challenge_id).first()

            if not shared_challenge:
                logger.warning(f"DB Challenge {challenge_id} not found.")
                abort(404)

            # --- Get challenge config values ---
            is_multigroup = shared_challenge.max_groups > 1
            # --- Fetch num_players_per_group ---
            num_players_per_group = shared_challenge.num_players_per_group # Fetch from the loaded object

            # Determine user membership
            if current_user.is_authenticated:
                logger.debug(f"Checking membership for user {current_user.id}...")
                for group in shared_challenge.groups:
                    if any(member.id == current_user.id for member in group.members):
                        user_joined_group_id = group.id; break

            # Prepare initial group data, including player names
            initial_groups_data = [
                 {
                    "id": g.id,
                    "name": g.group_name,
                    "progress": g.progress_data or {},
                    "member_count": len(g.members),
                    "player_names": g.player_names or [], # Default to empty list if null
                    "active_penalty_text": g.active_penalty_text or ""
                 }
                 for g in shared_challenge.groups
            ]
            logger.debug(f"Found DB challenge '{shared_challenge.name}'. Mode: {'Multi' if is_multigroup else 'Single'}. Players/Group: {num_players_per_group}. User joined: {user_joined_group_id}.")
        # Handle potential DB errors during the session
        # (Assuming global error handler catches SQLAlchemyError now)

    # Render the single template
    try:
        return render_template(
            "challenge.html",
            shared_challenge=shared_challenge,
            challenge_id=challenge_id,
            is_local=is_local,
            is_multigroup=is_multigroup,
            user_joined_group_id=user_joined_group_id,
            initial_groups=initial_groups_data,
            num_players_per_group=num_players_per_group
        )
    except Exception as render_error:
        logger.exception(f"Error rendering challenge.html for challenge_id {challenge_id}")
        abort(500)