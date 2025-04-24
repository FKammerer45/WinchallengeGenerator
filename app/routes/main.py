# app/routes/main.py
import logging
import uuid
from flask import Blueprint, render_template, request, abort, flash, redirect, url_for, current_app
from flask_login import current_user
# Import db instance from app
from app import db 
# Import necessary models
from app.models import SharedChallenge, ChallengeGroup, User 
# Removed: from app.database import SessionLocal # No longer needed

# Import SQLAlchemy functions/helpers if needed (like desc, selectinload, etc.)
from sqlalchemy.orm import joinedload, selectinload
from sqlalchemy import desc

logger = logging.getLogger(__name__)
# Rename blueprint to 'main' for consistency with common registration patterns
main = Blueprint('main', __name__)


@main.route("/")
def index():
    """Renders the main page (challenge generation form)."""
    # Pass any necessary context for the template
    return render_template("index.html", game_vars={}) # Assuming game_vars might be used

@main.route("/games")
def games_config():
    """Renders the games configuration page."""
    # Pass empty lists/dicts initially, JS will populate from localStorage/API
    return render_template("games/games.html", games=[], existing_games=[], game_vars={})

@main.route("/penalties")
def penalties_config():
    """Renders the penalties configuration page."""
    # Pass any necessary context for the template
    return render_template("penalties.html")

# --- My Challenges Page ---
@main.route("/my_challenges")
def my_challenges_view():
    """Displays DB challenges for logged-in users OR prepares shell for JS local view."""
    user_challenges = []
    is_authenticated = current_user.is_authenticated

    if is_authenticated:
        try:
            # Use db.session directly for database operations
            user_challenges = db.session.query(SharedChallenge)\
                .filter(SharedChallenge.creator_id == current_user.id)\
                .order_by(desc(SharedChallenge.created_at))\
                .options(selectinload(SharedChallenge.groups))\
                .all()
            logger.info(f"Found {len(user_challenges)} DB challenges for user {current_user.username}")
            
            # Note: No explicit commit needed for read operations.
            # Flask-SQLAlchemy typically handles session lifecycle per request.

        except Exception as e:
            # Rollback in case of error during query/processing
            db.session.rollback() 
            logger.exception(f"Error fetching DB challenges for user {current_user.username}")
            flash("Could not load your saved challenges due to a server error.", "danger")
            user_challenges = [] # Ensure it's an empty list on error
   

    return render_template(
        "my_challenges.html",
        user_challenges=user_challenges,
        is_authenticated=is_authenticated
        )

@main.route('/subscribe')
def subscribe():
    """Renders the subscription pricing page."""
    # You might pass additional data if needed, e.g., user's current plan status
    return render_template('pricing/pricing_section.html')

# --- Unified Challenge View Route ---
@main.route("/challenge/<string:challenge_id>")
def challenge_view(challenge_id):
    """
    Renders the view for DB or Local challenges.
    Ensures fresh group data is loaded for DB challenges.
    """
    
    is_local = False
    shared_challenge = None
    initial_groups_data = None # Will hold data prepared for template
    user_joined_group_id = None
    is_multigroup = False # Default
    num_players_per_group = 1 # Default

    if challenge_id.startswith("local_"):
        is_local = True
        # For local challenges, JS handles loading data and rendering
        # Pass minimal necessary info

    else:
        # --- Database Challenge Logic ---
        is_local = False

        # Validate UUID format
        try:
            uuid.UUID(challenge_id, version=4)
        except ValueError:
            logger.warning(f"Invalid public_id format provided: {challenge_id}")
            abort(404)
        try:
            # Use db.session directly for database operations
            # Query challenge with related data efficiently loaded
            shared_challenge = db.session.query(SharedChallenge).options(
                selectinload(SharedChallenge.groups).selectinload(ChallengeGroup.members), # Load groups and their members
                selectinload(SharedChallenge.authorized_users),
                joinedload(SharedChallenge.creator) # Load the creator user
            ).filter(SharedChallenge.public_id == challenge_id).first()

            if not shared_challenge:
                logger.warning(f"DB Challenge {challenge_id} not found.")
                abort(404)
            
           
    


            is_creator = False
            is_authorized = False
            authorized_user_list = [] # Initialize

            if current_user.is_authenticated:
                # Use the helper function (ensure it's accessible or redefined here)
                from .challenge_api import is_user_authorized # Assuming helper is in challenge_api.py
                is_creator = (shared_challenge.creator_id == current_user.id)
                # Pass the fetched challenge (with eager-loaded authorized_users) to the helper
                is_authorized = is_user_authorized(shared_challenge, current_user)

                # If the viewer is the creator, prepare the list of authorized users for the template
                if is_creator:
                    authorized_user_list = [
                        {'id': u.id, 'username': u.username}
                        for u in shared_challenge.authorized_users # Iterate over the pre-loaded list
                    ]
                    # Optional: Sort the list alphabetically by username
                    authorized_user_list.sort(key=lambda x: x['username'].lower())

            # Refresh group objects to ensure latest state within this session
            # This is useful if other requests might have modified groups concurrently
            # although less critical if you just loaded them. Can be intensive.
            
            refreshed_groups = []
            for group in shared_challenge.groups:
                try:
                    db.session.refresh(group) # Use db.session.refresh
                    refreshed_groups.append(group)
                    # logger.debug(f"  Group ID {group.id} refreshed. Progress: {group.progress_data}")
                except Exception as refresh_err:
                    logger.error(f"Failed to refresh group {group.id}: {refresh_err}")
                    # Decide how to handle refresh failure: append original or skip?
                    refreshed_groups.append(group) # Append original for now

            # Update the challenge's groups attribute to the list of (potentially) refreshed objects
            # This ensures subsequent code uses the most up-to-date objects available in the session
            shared_challenge.groups = refreshed_groups 

            # Get challenge config values from the loaded object
            is_multigroup = shared_challenge.max_groups > 1
            num_players_per_group = shared_challenge.num_players_per_group

            # Determine user membership in any group of this challenge
            if current_user.is_authenticated:
                for group in shared_challenge.groups: # Iterate over the refreshed list
                    # Check if current_user is in the members list loaded via selectinload
                    if any(member.id == current_user.id for member in group.members):
                        user_joined_group_id = group.id
                        break # Found the group user is in

            # Prepare data specifically for the template, using refreshed group data
            initial_groups_data = [
                {
                    "id": g.id,
                    "name": g.group_name,
                    "progress": g.progress_data or {}, # Use refreshed progress data
                    "member_count": len(g.members), # Count loaded members
                    "player_names": g.player_names or [],
                    "active_penalty_text": g.active_penalty_text or ""
                }
                # Iterate over the refreshed groups list
                for g in shared_challenge.groups 
            ]

        except Exception as db_err:
            # Rollback in case of any error during DB operations or processing
            db.session.rollback() 
            logger.exception(f"Database error loading challenge {challenge_id}: {db_err}")
            flash("Failed to load challenge details due to a database error.", "danger")
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
            num_players_per_group=num_players_per_group,
            is_creator=is_creator, 
            is_authorized=is_authorized, 
            authorized_user_list=authorized_user_list 
        )
    except Exception as render_error:
        logger.exception(f"Error rendering challenge.html for challenge_id {challenge_id}")
        abort(500)

