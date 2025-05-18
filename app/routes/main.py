# app/routes/main.py
import logging
import uuid
from flask import Blueprint, render_template, request, abort, flash, redirect, url_for, current_app, send_from_directory
from flask_login import current_user, login_required
# Import db instance and csrf from app
from app import db, csrf
# Import necessary models
from app.models import SharedChallenge, ChallengeGroup, User, SavedGameTab, SavedPenaltyTab
# Removed: from app.database import SessionLocal # No longer needed
import os
# Import SQLAlchemy functions/helpers if needed (like desc, selectinload, etc.)
from sqlalchemy.orm import joinedload, selectinload
from sqlalchemy import desc, func
# Import subscription helpers
from app.utils.subscription_helpers import grant_pro_plan, get_user_limit, is_pro_plan_active
# Import default definitions for tab counting
from app.modules.default_definitions import DEFAULT_GAME_TAB_DEFINITIONS, DEFAULT_PENALTY_TAB_DEFINITIONS
from app.plan_config import PLAN_LIMITS # Import PLAN_LIMITS

logger = logging.getLogger(__name__)
# Rename blueprint to 'main' for consistency with common registration patterns
main = Blueprint('main', __name__)


@main.route("/")
def index():
    """Renders the main page (challenge generation form)."""
    challenge_count = 0
    max_challenges = get_user_limit(None, 'max_challenges') # Default for anonymous
    user_is_pro = False

    if current_user.is_authenticated:
        challenge_count = db.session.query(func.count(SharedChallenge.id)).filter(SharedChallenge.creator_id == current_user.id).scalar()
        max_challenges = get_user_limit(current_user, 'max_challenges')
        user_is_pro = is_pro_plan_active(current_user)

    return render_template(
        "index.html",
        game_vars={},
        challenge_count=challenge_count,
        max_challenges=max_challenges,
        user_is_pro=user_is_pro,
        PLAN_LIMITS=PLAN_LIMITS  # Pass PLAN_LIMITS to the template
    )

@main.route('/sitemap.xml')
def sitemap():
    # Construct the path to the static folder relative to the app instance
    static_folder = current_app.static_folder
    return send_from_directory(static_folder, 'sitemap.xml')

@main.route('/robots.txt')
def robots_txt():
    """Serves the robots.txt file from the static directory."""
    # Construct the path to the static folder relative to the app instance
    static_folder = current_app.static_folder
    if static_folder is None:
         # Handle case where static folder isn't configured (shouldn't happen in standard Flask)
         logger.error("Static folder not found in current_app configuration.")
         abort(404)
    # Use send_from_directory - it handles security checks
    return send_from_directory(static_folder, 'robots.txt')

@main.route("/games")
@login_required # This page likely requires login to manage user-specific tabs
def games_config():
    """Renders the games configuration page."""
    custom_game_tab_count = 0
    max_game_tabs = get_user_limit(None, 'max_game_tabs') # Default for anonymous, though login is required
    user_is_pro = False

    if current_user.is_authenticated:
        system_default_game_tab_client_ids = [details['client_tab_id'] for details in DEFAULT_GAME_TAB_DEFINITIONS.values()]
        custom_game_tab_count = db.session.query(func.count(SavedGameTab.id)).filter(
            SavedGameTab.user_id == current_user.id,
            ~SavedGameTab.client_tab_id.in_(system_default_game_tab_client_ids)
        ).scalar()
        max_game_tabs = get_user_limit(current_user, 'max_game_tabs')
        user_is_pro = is_pro_plan_active(current_user)

    return render_template(
        "games/games.html",
        games=[],
        existing_games=[],
        game_vars={},
        custom_tab_count=custom_game_tab_count,
        max_custom_tabs=max_game_tabs,
        user_is_pro=user_is_pro,
        PLAN_LIMITS=PLAN_LIMITS  # Pass PLAN_LIMITS to the template
    )

@main.route("/penalties")
@login_required # This page likely requires login to manage user-specific tabs
def penalties_config():
    """Renders the penalties configuration page."""
    custom_penalty_tab_count = 0
    max_penalty_tabs = get_user_limit(None, 'max_penalty_tabs') # Default for anonymous
    user_is_pro = False

    if current_user.is_authenticated:
        system_default_penalty_tab_client_ids = [details['client_tab_id'] for details in DEFAULT_PENALTY_TAB_DEFINITIONS.values()]
        custom_penalty_tab_count = db.session.query(func.count(SavedPenaltyTab.id)).filter(
            SavedPenaltyTab.user_id == current_user.id,
            ~SavedPenaltyTab.client_tab_id.in_(system_default_penalty_tab_client_ids)
        ).scalar()
        max_penalty_tabs = get_user_limit(current_user, 'max_penalty_tabs')
        user_is_pro = is_pro_plan_active(current_user)
        
    return render_template(
        "penalties/penalties.html",
        custom_tab_count=custom_penalty_tab_count,
        max_custom_tabs=max_penalty_tabs,
        user_is_pro=user_is_pro,
        PLAN_LIMITS=PLAN_LIMITS  # Pass PLAN_LIMITS to the template
    )

@main.route('/impressum')
def impressum():
    """Rendert die Impressumsseite."""
    # Passe den Pfad an, falls du einen Unterordner (z.B. 'legal/') verwendet hast:
    # return render_template('legal/impressum.html')
    return render_template('legal/impressum.html')

@main.route('/datenschutz')
def datenschutz():
    """Rendert die Datenschutzerklärungsseite."""
    # Passe den Pfad an, falls du einen Unterordner (z.B. 'legal/') verwendet hast:
    # return render_template('legal/datenschutz.html')
    return render_template('legal/datenschutz.html')

@main.route('/termsofservice')
def termsofservice():
    """Rendert die Terms of Service Seite."""
    # Passe den Pfad an, falls du einen Unterordner (z.g. 'legal/') verwendet hast:
    # return render_template('legal/datenschutz.html')
    return render_template('legal/termsofservice.html')




# --- My Challenges Page ---
@main.route("/my_challenges")
def my_challenges_view():
    """Displays DB challenges for logged-in users OR prepares shell for JS local view."""
    user_challenges_list = []
    challenge_count = 0
    max_challenges = get_user_limit(None, 'max_challenges') # Default for anonymous
    user_is_pro = False
    is_authenticated = current_user.is_authenticated

    if is_authenticated:
        user_is_pro = is_pro_plan_active(current_user)
        max_challenges = get_user_limit(current_user, 'max_challenges')
        try:
            # Use db.session directly for database operations
            user_challenges_list = db.session.query(SharedChallenge)\
                .filter(SharedChallenge.creator_id == current_user.id)\
                .order_by(desc(SharedChallenge.created_at))\
                .options(selectinload(SharedChallenge.groups))\
                .all()
            challenge_count = len(user_challenges_list) # Get count from the fetched list
            logger.info(f"Found {challenge_count} DB challenges for user {current_user.username}")

        except Exception as e:
            db.session.rollback()
            logger.exception(f"Error fetching DB challenges for user {current_user.username}")
            flash("Could not load your saved challenges due to a server error.", "danger")
            user_challenges_list = [] # Ensure it's an empty list on error
            challenge_count = 0


    return render_template(
        "my_challenges.html",
        user_challenges=user_challenges_list,
        is_authenticated=is_authenticated,
        challenge_count=challenge_count,
        max_challenges=max_challenges,
        user_is_pro=user_is_pro,
        PLAN_LIMITS=PLAN_LIMITS
        )

@main.route('/subscribe')
def subscribe():
    """Renders the subscription pricing page."""
    # You might pass additional data if needed, e.g., user's current plan status
    return render_template('pricing/pricing_section.html', PLAN_LIMITS=PLAN_LIMITS)

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
    is_creator = False
    is_authorized = False
    authorized_user_list_for_template = []

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
                selectinload(SharedChallenge.authorized_users_list),
                joinedload(SharedChallenge.creator) # Load the creator user
            ).filter(SharedChallenge.public_id == challenge_id).first()

            if not shared_challenge:
                logger.warning(f"DB Challenge {challenge_id} not found.")
                abort(404)


            if current_user.is_authenticated:
                # Use the helper function (ensure it's accessible or redefined here)
                from .challenge_api import is_user_authorized # Assuming helper is in challenge_api.py
                is_creator = (shared_challenge.creator_id == current_user.id)
                # Pass the fetched challenge (with eager-loaded authorized_users) to the helper
                is_authorized = is_user_authorized(shared_challenge, current_user)

                # If the viewer is the creator, prepare the list of authorized users for the template
                if is_creator:
                    authorized_user_list_for_template = [ # Renamed template variable for clarity
                    {'id': u.id, 'username': u.username}
                    for u in shared_challenge.authorized_users_list # MODIFIED HERE
                    ]
                    # Optional: Sort the list alphabetically by username
                    authorized_user_list_for_template.sort(key=lambda x: x['username'].lower())
            else: # Ensure variable exists even if user not authenticated
                authorized_user_list_for_template = []
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
            import sys, traceback
            print(f"--- ERROR IN challenge_view (DB_ERR) FOR {challenge_id} ---", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
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
            authorized_user_list=authorized_user_list_for_template
        )
    except Exception as render_error:
        import sys, traceback
        print(f"--- ERROR IN challenge_view (RENDER_ERR) FOR {challenge_id} ---", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        logger.exception(f"Error rendering challenge.html for challenge_id {challenge_id}")
        abort(500)

# --- Test Pro Plan Acquisition Route (Development Only) ---
@main.route("/test_acquire_pro", methods=['POST'])
@login_required
@csrf.exempt # Exempt from CSRF for testing convenience
def test_acquire_pro():
    """Grants the pro plan to the current user for testing purposes."""
    if current_app.config['TESTING'] or current_app.config['DEBUG']:
        if grant_pro_plan(current_user):
            flash("Pro plan acquired successfully for testing!", "success")
        else:
            flash("Failed to acquire pro plan for testing.", "danger")
        return redirect(url_for('payment.checkout')) # Redirect back to checkout page
    else:
        abort(404) # Not found in production

# --- Test Pro Plan Removal Route (Development Only) ---
@main.route("/test_remove_pro", methods=['POST'])
@login_required
@csrf.exempt # Exempt from CSRF for testing convenience
def test_remove_pro():
    """Removes the pro plan from the current user for testing purposes."""
    if current_app.config['TESTING'] or current_app.config['DEBUG']:
        if current_user:
            current_user.pro_plan_active = False
            current_user.pro_plan_expiration_date = None
            db.session.commit()
            flash("Pro plan removed successfully for testing.", "success")
        else:
            flash("Failed to remove pro plan for testing.", "danger")
        return redirect(url_for('payment.checkout')) # Redirect back to checkout page
    else:
        abort(404) # Not found in production

# --- Test Pro Plan Page Route (Development Only) ---
# This route is no longer needed and has been removed.


@main.route("/overlay/<string:challenge_public_id>")
def overlay_view(challenge_public_id):
    """Renders the minimal HTML page for the OBS Browser Source overlay."""
    # This route doesn't need to fetch challenge data itself.
    # It just renders the HTML shell. JS will handle data fetching via WebSockets.
    # We pass the challenge ID just so the template *could* use it if needed,
    # but primarily the JS will get it from the URL.
    logger.info(f"Serving overlay page for challenge ID: {challenge_public_id}")
    # We don't need to validate the API key here; the WebSocket connection will do that.
    return render_template("overlay/overlay.html", challenge_public_id=challenge_public_id)
