# app/routes/challenge_api.py
import logging
import json
import uuid
from flask import Blueprint, request, jsonify, current_app, url_for
from flask_login import login_required, current_user

# Import logic functions
from app.modules.challenge_generator import generate_challenge_logic
from app.modules.game_preferences import initialize_game_vars

# Import DB session and models
from app.database import SessionLocal
from app.models import SharedChallenge, ChallengeGroup, User

# Import SQLAlchemy components
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy import func
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy.orm import joinedload, selectinload, Session # Ensure Session is imported if type hinting

logger = logging.getLogger(__name__)

challenge_api_bp = Blueprint('challenge_api', __name__, url_prefix='/api/challenge')


# --- /generate endpoint ---
@challenge_api_bp.route("/generate", methods=["POST"])
def generate_challenge():
    """API endpoint to generate a new challenge."""
    logger.debug("Request received for /api/challenge/generate")
    generation_data = {}
    try:
        # --- 1. Parse Input Parameters ---
        if request.form and 'selected_games' in request.form:
            logger.debug("Parsing parameters from Form data.")
            generation_data['selected_games'] = request.form.getlist("selected_games")
            generation_data['weights_str'] = request.form.getlist("weights") # Get weights list
            generation_data['num_players'] = int(request.form.get("num_players", 1))
            generation_data['desired_diff'] = float(request.form.get("desired_diff", 10.0))
            generation_data['raw_b2b'] = int(request.form.get("raw_b2b", 1))
            # Parse JSON strings from form data
            generation_data['generation_pool_entries'] = json.loads(request.form.get("entries", "[]"))
            generation_data['selected_modes'] = json.loads(request.form.get("selected_modes", "{}"))
            generation_data['use_penalties'] = request.form.get('use_penalties') == 'on'
            generation_data['penalty_tab_id'] = request.form.get('penalty_tab_id', 'default')
            generation_data['challenge_name'] = request.form.get('challenge_name', None)
            generation_data['group_mode'] = request.form.get('group_mode', 'single')
            if generation_data['group_mode'] == 'multi':
                generation_data['max_groups'] = int(request.form.get('max_groups', 10))
            else:
                generation_data['max_groups'] = 1

        elif request.is_json:
             logger.debug("Parsing parameters from JSON data.")
             data = request.get_json()
             if not data: return jsonify({"error": "Invalid JSON data received."}), 400
             # Parse fields from JSON payload
             generation_data['selected_games'] = data.get("selected_games", [])
             # Assume weights correspond to selected_games if sent via JSON
             generation_data['weights_str'] = data.get("weights", []) # Expect list of numbers/strings
             generation_data['num_players'] = int(data.get("num_players", 1))
             generation_data['desired_diff'] = float(data.get("desired_diff", 10.0))
             generation_data['raw_b2b'] = int(data.get("raw_b2b", 1))
             generation_data['generation_pool_entries'] = data.get("entries", []) # Expect list of objects
             generation_data['selected_modes'] = data.get("selected_modes", {}) # Expect object
             generation_data['use_penalties'] = data.get('use_penalties', False)
             generation_data['penalty_tab_id'] = data.get('penalty_tab_id', 'default')
             generation_data['challenge_name'] = data.get('challenge_name', None)
             generation_data['group_mode'] = data.get('group_mode', 'single')
             if generation_data['group_mode'] == 'multi':
                generation_data['max_groups'] = int(data.get('max_groups', 10))
             else:
                generation_data['max_groups'] = 1
        else:
            return jsonify({"error": "Unsupported request format."}), 415

        # Determine num_players_per_group (used in share options)
        num_players_per_group = generation_data.get('num_players', 1) if generation_data['group_mode'] == 'multi' else 1

        # --- 2. Determine Game Variables ---
        game_vars_for_logic = initialize_game_vars(generation_data.get('generation_pool_entries', []))
        if not game_vars_for_logic:
             logger.warning("No valid game variables initialized from entries.")
             # Decide if this is an error or just means no challenge possible
             # return jsonify({"error": "No valid game data found in the provided entries."}), 400

        # --- 3. Process Weights ---
        selected_games = generation_data.get('selected_games', [])
        weights_str_list = generation_data.get('weights_str', []) # Get list of strings/numbers
        processed_weights = []
        if len(selected_games) == len(weights_str_list):
             try: processed_weights = [float(w) for w in weights_str_list]
             except ValueError: logger.warning("Invalid weights received, using 1.0."); processed_weights = [1.0] * len(selected_games)
        else: processed_weights = [1.0] * len(selected_games)
        # Filter weights to only include those for selected games? Assumes order matches.

        # --- 4. Prepare Final Parameters ---
        selected_games_lower = [str(g).lower() for g in selected_games if g] # Ensure strings and lowercase

        # --- 5. Call Challenge Generation Logic ---
        logger.debug("Calling generate_challenge_logic...")
        challenge_result_data = generate_challenge_logic(
            num_players=generation_data.get('num_players', 1),
            desired_diff=generation_data.get('desired_diff', 10.0),
            selected_games=selected_games_lower,
            weights=processed_weights,
            game_vars=game_vars_for_logic,
            raw_b2b=generation_data.get('raw_b2b', 1),
            entries=generation_data.get('generation_pool_entries', []), # Pass parsed entries
            selected_modes=generation_data.get('selected_modes', {}) # Pass parsed modes
        )

        # --- 6. Handle Result & Add Info ---
        if challenge_result_data is None:
            logger.error("generate_challenge_logic returned None. No matching entries found for criteria.")
            return jsonify({"error": "No matching entries found for challenge criteria."}), 400

        # Add penalty info if requested
        if generation_data.get('use_penalties'):
            challenge_result_data['penalty_info'] = {'tab_id': generation_data.get('penalty_tab_id', 'default')}
        else: challenge_result_data['penalty_info'] = None

        # Add share-related options
        challenge_result_data['share_options'] = {
            'challenge_name': generation_data.get('challenge_name'),
            'max_groups': generation_data.get('max_groups'),
            'num_players_per_group': num_players_per_group
        }

        logger.info("Challenge generated successfully.")
        return jsonify(challenge_result_data)

    except json.JSONDecodeError as e:
        logger.exception("Failed to decode JSON input (entries or selected_modes):")
        return jsonify({"error": f"Invalid JSON format in request: {e}"}), 400
    except ValueError as e:
        logger.exception("Invalid numeric value received:")
        return jsonify({"error": f"Invalid numeric value provided: {e}"}), 400
    except Exception as e:
        logger.exception("Unexpected error in generate_challenge:")
        return jsonify({"error": "Server error during challenge generation."}), 500


# --- /share endpoint ---
# --- /share endpoint ---
@challenge_api_bp.route("/share", methods=["POST"])
@login_required
def share_challenge():
    """
    Creates a persistent SharedChallenge, now with a limit per user
    and saves the intended number of players per group.
    """
    logger.info(f"'/api/challenge/share' endpoint called by user {current_user.username}")
    MAX_CHALLENGES_PER_USER = current_app.config.get('MAX_CHALLENGES_PER_USER', 10)
    data = request.get_json()

    # Validate payload structure
    if not data or not isinstance(data.get('challenge_data'), dict) or \
       ('normal' not in data['challenge_data'] and 'b2b' not in data['challenge_data']):
        return jsonify({"error": "Invalid or missing challenge data structure."}), 400

    challenge_data = data.get('challenge_data')
    penalty_info = data.get('penalty_info') # Optional
    name = data.get('name', None) # Optional
    max_groups = int(data.get('max_groups', 1)) # Default to 1 if not multigroup/passed
    # --- Read num_players_per_group from payload ---
    num_players_per_group = int(data.get('num_players_per_group', 1)) # Default to 1
    # Basic validation
    if max_groups < 1: max_groups = 1
    if num_players_per_group < 1: num_players_per_group = 1

    with SessionLocal() as session:
        try:
            # Check user challenge limit
            current_challenge_count = session.query(func.count(SharedChallenge.id))\
                .filter(SharedChallenge.creator_id == current_user.id)\
                .scalar()
            if current_challenge_count >= MAX_CHALLENGES_PER_USER:
                return jsonify({"error": f"Max challenges ({MAX_CHALLENGES_PER_USER}) reached."}), 403

            logger.debug(f"User {current_user.username} has {current_challenge_count} challenges. Limit is {MAX_CHALLENGES_PER_USER}. Proceeding.")

            # Create SharedChallenge object
            public_id = str(uuid.uuid4())
            new_challenge = SharedChallenge(
                public_id=public_id,
                creator_id=current_user.id,
                name=name,
                challenge_data=challenge_data,
                penalty_info=penalty_info,
                max_groups=max_groups,
                # --- Set the num_players_per_group field ---
                num_players_per_group=num_players_per_group
            )
            session.add(new_challenge)
            session.commit() # Commit transaction
            logger.info(f"Successfully created SharedChallenge {public_id} by user {current_user.username}")

            # Generate share URL using correct parameter name
            share_url = url_for('main.challenge_view', challenge_id=public_id, _external=True)

            return jsonify({
                "status": "success",
                "message": "Challenge shared successfully.",
                "public_id": public_id,
                "share_url": share_url
            }), 201

        except (IntegrityError, SQLAlchemyError) as e:
             session.rollback()
             logger.exception(f"DB Error sharing challenge for user {current_user.username}")
             return jsonify({"error": "Database error creating challenge."}), 500
        except Exception as e:
             session.rollback()
             logger.exception(f"Unexpected error sharing challenge for user {current_user.username}")
             return jsonify({"error": "An unexpected server error occurred."}), 500


# --- /<public_id>/groups endpoint ---
@challenge_api_bp.route("/<public_id>/groups", methods=["POST"])
def add_group_to_challenge(public_id):
    """
    API endpoint to add a new group to an existing SharedChallenge.
    Checks limits and name uniqueness.
    """
    logger.debug(f"Request to add group to challenge {public_id}")
    data = request.get_json()

    if not data or 'group_name' not in data:
        logger.warning(f"Add group request for {public_id} missing JSON or 'group_name'.")
        return jsonify({"error": "Invalid request. JSON data with 'group_name' required."}), 400

    group_name = data['group_name'].strip()
    if not group_name or len(group_name) > 80:
         logger.warning(f"Invalid group name provided for {public_id}: '{data['group_name']}'")
         return jsonify({"error": "Invalid group name provided (must not be empty and max 80 chars)."}), 400

    # --- Use SessionLocal context manager ---
    with SessionLocal() as session:
        try:
            # Find the parent challenge
            # Use with_for_update() if concurrent requests might cause race conditions on count/check
            challenge = session.query(SharedChallenge).filter_by(public_id=public_id).first()
            if not challenge:
                logger.warning(f"Attempt to add group to non-existent challenge {public_id}")
                return jsonify({"error": "Challenge not found."}), 404

            # Check group limit
            current_group_count = session.query(func.count(ChallengeGroup.id))\
                .filter(ChallengeGroup.shared_challenge_id == challenge.id)\
                .scalar() # Use filter() for relationship comparison

            if current_group_count >= challenge.max_groups:
                 logger.warning(f"Max groups ({challenge.max_groups}) reached for challenge {public_id}. Cannot add '{group_name}'.")
                 return jsonify({"error": f"Maximum number of groups ({challenge.max_groups}) already reached."}), 400

            # Check for duplicate group name within this challenge
            exists = session.query(ChallengeGroup.id)\
                .filter(ChallengeGroup.shared_challenge_id == challenge.id, ChallengeGroup.group_name == group_name)\
                .first() is not None

            if exists:
                logger.warning(f"Group name '{group_name}' already exists for challenge {public_id}.")
                return jsonify({"error": f"The group name '{group_name}' is already taken for this challenge."}), 409

            # Create the new group
            new_group = ChallengeGroup(
                group_name=group_name,
                shared_challenge_id=challenge.id # Set foreign key
            )
            session.add(new_group)
            session.commit() # Commit transaction

            logger.info(f"Successfully added group '{group_name}' (ID: {new_group.id}) to challenge {public_id}")
            # Return data including the generated ID and initial progress
            return jsonify({
                "status": "success",
                "message": "Group created successfully.",
                "group": {
                    "id": new_group.id,
                    "name": new_group.group_name,
                    "progress": new_group.progress_data or {}
                }
            }), 201

        except SQLAlchemyError as e:
            session.rollback()
            logger.exception(f"Database error adding group '{group_name}' to challenge {public_id}: {e}")
            return jsonify({"error": "An unexpected database error occurred while adding the group."}), 500
        except Exception as e:
            session.rollback()
            logger.exception(f"Unexpected error adding group '{group_name}' to challenge {public_id}: {e}")
            return jsonify({"error": "An unexpected server error occurred."}), 500


# --- /<public_id>/groups/<int:group_id>/progress endpoint ---
@challenge_api_bp.route("/<public_id>/groups/<int:group_id>/progress", methods=["POST"])
@login_required # Require login to update progress
def update_group_progress(public_id, group_id):
    """
    API endpoint to update progress for a specific group.
    NOW CHECKS if the logged-in user is a member of the group.
    """
    logger.debug(f"User {current_user.username} attempting update progress for challenge {public_id}, group {group_id}")
    data = request.get_json()
    # ... (keep existing payload validation) ...
    required_keys = ['item_type', 'item_key', 'item_index', 'is_complete']
    if not data or not all(key in data for key in required_keys):
        return jsonify({"error": f"Invalid request. JSON with keys {required_keys} required."}), 400
    if not isinstance(data['is_complete'], bool):
         return jsonify({"error": "'is_complete' must be a boolean."}), 400

    # ... (keep extraction of item data) ...
    item_type = data['item_type']
    item_key = data['item_key']
    item_index = data['item_index']
    is_complete = data['is_complete']
    segment_index = data.get('segment_index')

    with SessionLocal() as session:
        try:
            # Find group, ensure it belongs to the challenge, AND load members
            group = session.query(ChallengeGroup).options(
                 selectinload(ChallengeGroup.members) # Eagerly load members for check
            ).join(SharedChallenge, SharedChallenge.id == ChallengeGroup.shared_challenge_id)\
             .filter(SharedChallenge.public_id == public_id, ChallengeGroup.id == group_id)\
             .first()

            if not group:
                return jsonify({"error": "Challenge or Group not found."}), 404

            # --- *** AUTHORIZATION CHECK *** ---
            is_member = any(member.id == current_user.id for member in group.members)
            if not is_member:
                logger.warning(f"Forbidden: User {current_user.username} tried to update progress for group {group_id} but is not a member.")
                return jsonify({"error": "You are not a member of this group."}), 403 # Forbidden
            # --- *** END AUTHORIZATION CHECK *** ---

            # --- Keep existing progress update logic ---
            if group.progress_data is None: group.progress_data = {}
            progress = group.progress_data
            needs_flag_modified = False

            if item_type == 'b2b':
                if segment_index is None: return jsonify({"error": "'segment_index' is required for b2b items."}), 400
                progress_key = f"{item_type}_{segment_index}_{item_key}_{item_index}"
            elif item_type == 'normal':
                 progress_key = f"{item_type}_{item_key}_{item_index}"
            else:
                 return jsonify({"error": "Invalid progress item type specified."}), 400

            if is_complete:
                if progress.get(progress_key) is not True:
                    progress[progress_key] = True; needs_flag_modified = True
            else:
                if progress_key in progress:
                    del progress[progress_key]; needs_flag_modified = True

            if needs_flag_modified:
                flag_modified(group, "progress_data")
                logger.debug(f"Flagged progress_data modified for group {group_id}.")
            else:
                 logger.debug(f"No change needed for progress_data group {group_id}.")

            session.commit()
            logger.info(f"User {current_user.username} successfully updated progress for {public_id}/group/{group_id}.")
            return jsonify({"status": "success", "message": "Progress updated."}), 200
            # --- End existing progress update logic ---

        # Keep existing error handling...
        except (SQLAlchemyError) as e:
            session.rollback()
            logger.exception(f"Database error updating progress for {public_id}/group/{group_id}: {e}")
            return jsonify({"error": "Database error updating progress."}), 500
        except Exception as e:
             session.rollback()
             logger.exception(f"Unexpected error updating progress for {public_id}/group/{group_id}: {e}")
             return jsonify({"error": "An unexpected server error occurred."}), 500
        
@challenge_api_bp.route("/groups/<int:group_id>/join", methods=["POST"])
@login_required
def join_group(group_id):
    """Allows the logged-in user to join a specific group for its challenge."""
    logger.info(f"User {current_user.username} attempting to join group {group_id}")
    with SessionLocal() as session:
        try:
            # Find the group and eagerly load related data needed for checks
            group = session.query(ChallengeGroup).options(
                selectinload(ChallengeGroup.members), # Load current members
                joinedload(ChallengeGroup.shared_challenge) # Need parent challenge
                    .selectinload(SharedChallenge.groups) # Need all groups of the challenge
                    .selectinload(ChallengeGroup.members) # Need members of sibling groups
            ).get(group_id)

            if not group:
                return jsonify({"error": "Group not found."}), 404

            challenge = group.shared_challenge
            if not challenge: # Should not happen if FK is set
                return jsonify({"error": "Challenge associated with group not found."}), 500

            # --- Business Logic Checks ---
            # 1. Is the group full? (Assuming 1 member per group for this example)
            #    Adjust logic if multiple members allowed per group.
            if len(group.members) >= 1:
                 # Check if the only member is the current user trying to rejoin (benign)
                 if not any(member.id == current_user.id for member in group.members):
                      logger.warning(f"Join failed: Group {group_id} is full.")
                      return jsonify({"error": "This group is already full."}), 409 # 409 Conflict

            # 2. Is the user already in *another* group for *this same challenge*?
            user_already_in_group = False
            current_challenge_group_id = None
            for sibling_group in challenge.groups:
                if any(member.id == current_user.id for member in sibling_group.members):
                    user_already_in_group = True
                    current_challenge_group_id = sibling_group.id
                    break

            if user_already_in_group and current_challenge_group_id != group_id:
                 logger.warning(f"Join failed: User {current_user.username} already in group {current_challenge_group_id} for challenge {challenge.public_id}")
                 return jsonify({"error": "You are already in another group for this challenge."}), 409 # 409 Conflict

            # --- Add user to group if not already a member ---
            if not any(member.id == current_user.id for member in group.members):
                 group.members.append(current_user)
                 logger.info(f"Adding user {current_user.username} to group {group_id}")
                 session.commit()
                 return jsonify({"status": "success", "message": f"Successfully joined group '{group.group_name}'."}), 200 # OK or 201 Created
            else:
                 logger.info(f"User {current_user.username} is already a member of group {group_id}.")
                 return jsonify({"status": "success", "message": "You are already in this group."}), 200 # OK, idempotent

        except (SQLAlchemyError) as e:
            session.rollback()
            logger.exception(f"Database error joining group {group_id} for user {current_user.username}: {e}")
            return jsonify({"error": "Database error processing request."}), 500
        except Exception as e:
             session.rollback()
             logger.exception(f"Unexpected error joining group {group_id} for user {current_user.username}: {e}")
             return jsonify({"error": "An unexpected server error occurred."}), 500


# --- *** NEW: LEAVE GROUP ENDPOINT *** ---
@challenge_api_bp.route("/groups/<int:group_id>/leave", methods=["POST"])
@login_required
def leave_group(group_id):
    """Allows the logged-in user to leave a specific group they are a member of."""
    logger.info(f"User {current_user.username} attempting to leave group {group_id}")
    with SessionLocal() as session:
        try:
            # Find the group and load members relationship efficiently
            group = session.query(ChallengeGroup).options(
                 selectinload(ChallengeGroup.members)
            ).get(group_id)

            if not group:
                return jsonify({"error": "Group not found."}), 404

            # Find the user in the group's members
            user_to_remove = None
            for member in group.members:
                if member.id == current_user.id:
                    user_to_remove = member
                    break

            if user_to_remove:
                group.members.remove(user_to_remove) # Remove from relationship
                logger.info(f"Removing user {current_user.username} from group {group_id}")
                session.commit()
                return jsonify({"status": "success", "message": f"Successfully left group '{group.group_name}'."}), 200 # OK
            else:
                # User was not a member, return appropriate status
                logger.warning(f"Leave failed: User {current_user.username} is not a member of group {group_id}.")
                return jsonify({"error": "You are not a member of this group."}), 403 # Forbidden or 404 Not Found

        except (SQLAlchemyError) as e:
            session.rollback()
            logger.exception(f"Database error leaving group {group_id} for user {current_user.username}: {e}")
            return jsonify({"error": "Database error processing request."}), 500
        except Exception as e:
             session.rollback()
             logger.exception(f"Unexpected error leaving group {group_id} for user {current_user.username}: {e}")
             return jsonify({"error": "An unexpected server error occurred."}), 500

@challenge_api_bp.route("/groups/<int:group_id>/players", methods=["POST"])
@login_required
def update_group_players(group_id):
    """Updates the list of player names for a specific group."""
    logger.info(f"User {current_user.username} attempting to update players for group {group_id}")
    data = request.get_json()

    if not data or not isinstance(data.get('player_names'), list):
        return jsonify({"error": "Invalid request. JSON data with 'player_names' (list) required."}), 400

    player_names = [str(name).strip() for name in data['player_names'] if isinstance(name, str) and str(name).strip()]
    logger.debug(f"Received player names for group {group_id}: {player_names}")

    with SessionLocal() as session:
        try:
            # Find group and eagerly load parent challenge and current members
            group = session.query(ChallengeGroup).options(
                joinedload(ChallengeGroup.shared_challenge),
                selectinload(ChallengeGroup.members)
            ).get(group_id)

            if not group:
                return jsonify({"error": "Group not found."}), 404

            challenge = group.shared_challenge
            if not challenge: # Should not happen
                 return jsonify({"error": "Challenge for group not found."}), 500

            # Authorization: Check if current user is a member of the group
            is_member = any(member.id == current_user.id for member in group.members)
            if not is_member:
                logger.warning(f"Forbidden: User {current_user.username} not member of group {group_id}, cannot update players.")
                return jsonify({"error": "Not authorized to update this group's players."}), 403

            # Validation: Check against num_players_per_group stored on the challenge
            max_players = challenge.num_players_per_group
            if len(player_names) > max_players:
                 logger.warning(f"Too many players ({len(player_names)}) submitted for group {group_id}. Max allowed: {max_players}")
                 return jsonify({"error": f"Too many player names submitted. Maximum allowed is {max_players}."}), 400

            # Update the player_names JSON column
            group.player_names = player_names
            flag_modified(group, "player_names") # Mark as modified
            session.commit()

            logger.info(f"User {current_user.username} updated player names for group {group_id}")
            return jsonify({"status": "success", "message": "Player names updated."}), 200

        except (SQLAlchemyError) as e:
             session.rollback(); logger.exception("DB Error updating group players"); return jsonify({"error": "Database error."}), 500
        except Exception as e:
             session.rollback(); logger.exception("Unexpected error updating group players"); return jsonify({"error": "Server error."}), 500


@challenge_api_bp.route("/<public_id>", methods=["DELETE"])
@login_required
def delete_shared_challenge(public_id):
    """Deletes a shared challenge if the current user is the creator."""
    logger.info(f"User {current_user.username} attempting to delete challenge {public_id}")

    with SessionLocal() as session:
        try:
            # Find the challenge by public ID
            challenge = session.query(SharedChallenge).filter_by(public_id=public_id).first()

            if not challenge:
                logger.warning(f"Delete failed: Challenge {public_id} not found.")
                return jsonify({"error": "Challenge not found."}), 404

            # --- Authorization Check ---
            if challenge.creator_id != current_user.id:
                logger.warning(f"Forbidden: User {current_user.username} tried to delete challenge {public_id} created by user {challenge.creator_id}.")
                return jsonify({"error": "You are not authorized to delete this challenge."}), 403 # Forbidden
            # --- End Authorization Check ---

            # Delete the challenge
            # SQLAlchemy cascade should handle associated groups and memberships if configured
            session.delete(challenge)
            session.commit()

            logger.info(f"User {current_user.username} successfully deleted challenge {public_id}")
            # Return success - 204 No Content is common for DELETE success
            return '', 204

        except (SQLAlchemyError) as e:
            session.rollback()
            logger.exception(f"Database error deleting challenge {public_id} for user {current_user.username}: {e}")
            return jsonify({"error": "Database error while deleting challenge."}), 500
        except Exception as e:
             session.rollback()
             logger.exception(f"Unexpected error deleting challenge {public_id} for user {current_user.username}: {e}")
             return jsonify({"error": "An unexpected server error occurred."}), 500

@challenge_api_bp.route("/groups/<int:group_id>/penalty", methods=["POST"])
@login_required # Or adjust authorization as needed
def set_group_penalty(group_id):
    """Sets the active penalty text for a specific group."""
    logger.info(f"User {current_user.id} setting penalty for group {group_id}")
    data = request.get_json()
    penalty_text = data.get('penalty_text') # Expecting {'penalty_text': 'Player X gets Y...'}

    # Basic validation - allow empty string to clear penalty
    if penalty_text is None: # Check for None specifically
        return jsonify({"error": "Missing 'penalty_text' in request body."}), 400
    if not isinstance(penalty_text, str) or len(penalty_text) > 255:
         return jsonify({"error": "Invalid 'penalty_text' format or length."}), 400

    with SessionLocal() as session:
        try:
            # Find the group and verify user permission (e.g., user is member)
            group = session.query(ChallengeGroup).options(
                 selectinload(ChallengeGroup.members) # Load members for auth check
            ).filter(ChallengeGroup.id == group_id).first()

            if not group:
                return jsonify({"error": "Group not found."}), 404

            # Authorization Check (Example: must be a member to set penalty)
            is_member = any(member.id == current_user.id for member in group.members)
            if not is_member:
                 logger.warning(f"Forbidden: User {current_user.id} tried to set penalty for group {group_id} but is not member.")
                 return jsonify({"error": "You are not authorized to set penalties for this group."}), 403

            # Update the penalty text (allow empty string to clear)
            group.active_penalty_text = penalty_text.strip() if penalty_text else None # Store None if empty
            flag_modified(group, "active_penalty_text") # Important for JSON mutation if using that
            session.commit()

            logger.info(f"Successfully set penalty for group {group_id} by user {current_user.id}")
            return jsonify({"status": "success", "message": "Penalty updated."}), 200

        except SQLAlchemyError as e:
            session.rollback()
            logger.exception(f"Database error setting penalty for group {group_id}: {e}")
            return jsonify({"error": "Database error setting penalty."}), 500
        except Exception as e:
            session.rollback()
            logger.exception(f"Unexpected error setting penalty for group {group_id}: {e}")
            return jsonify({"error": "An unexpected server error occurred."}), 500