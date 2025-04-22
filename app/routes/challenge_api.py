# app/routes/challenge_api.py
import logging
import json
import uuid
from flask import Blueprint, render_template, request, jsonify, current_app, url_for
from flask_login import login_required, current_user

# Import logic functions
from app.modules.challenge_generator import generate_challenge_logic
from app.modules.game_preferences import initialize_game_vars
from app import csrf
# Import db instance from app
from app import db 
# Import necessary models
from app.models import SharedChallenge, ChallengeGroup, User

# Import SQLAlchemy components
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy import func
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy.orm import joinedload, selectinload 

logger = logging.getLogger(__name__)

# Define the blueprint - RENAME VARIABLE to challenge_api
challenge_api = Blueprint('challenge_api', __name__, url_prefix='/api/challenge') 


# --- /generate endpoint ---
# Update decorator to use the new blueprint name
@challenge_api.route("/generate", methods=["POST"])
def generate_challenge():
    """API endpoint to generate a new challenge."""
    logger.debug("Request received for /api/challenge/generate")
    try:
        # --- 1. Parse Input Parameters (Form or JSON) ---
        if request.form and 'selected_games' in request.form:
            data_src = request.form
            get = lambda k, default=None: data_src.get(k, default)
            getlist = lambda k: data_src.getlist(k)
            from_form = True
        elif request.is_json:
            js = request.get_json()
            if not js:
                return jsonify({"error": "Invalid JSON data."}), 400
            data_src = js
            get = lambda k, default=None: js.get(k, default)
            getlist = lambda k: js.get(k, [])
            from_form = False
        else:
            return jsonify({"error": "Unsupported format."}), 415

        # build generation_data dict
        gd = {}
        gd['selected_games']        = getlist("selected_games")
        gd['weights_str']          = getlist("weights")
        gd['num_players']          = int(get("num_players", 1))
        gd['desired_diff']         = float(get("desired_diff", 10.0))
        gd['raw_b2b']              = int(get("raw_b2b", 1))
        gd['generation_pool_entries'] = (json.loads(get("entries")) 
                                        if from_form else get("entries", []))
        gd['selected_modes']       = (json.loads(get("selected_modes")) 
                                        if from_form else get("selected_modes", {}))
        gd['use_penalties']        = (get('use_penalties') == 'on') if from_form else bool(get('use_penalties', False))
        gd['penalty_tab_id']       = get('penalty_tab_id', 'default')
        gd['challenge_name']       = get('challenge_name', None)
        gd['group_mode']           = get('group_mode', 'single')
        gd['max_groups']           = (int(get('max_groups')) 
                                     if gd['group_mode']=="multi" else 1)

        # --- 1a. Validate bounds ---
        if gd['desired_diff'] > 1500:
            return jsonify({"error": "desired_diff must be ≤ 1500."}), 400
        if gd['max_groups'] > 20:
            return jsonify({"error": "max_groups must be ≤ 20."}), 400

        # --- 2. Init & Validate Game Variables ---
        num_players_per_group = gd['num_players'] if gd['group_mode']=="multi" else 1
        game_vars = initialize_game_vars(gd['generation_pool_entries'])
        if not game_vars:
            return jsonify({"error": "No valid game entries."}), 400

        # --- 3. Process Weights ---
        sel = gd['selected_games']
        w_str = gd['weights_str']
        if len(sel)==len(w_str):
            try:
                weights = [float(w) for w in w_str]
            except ValueError:
                logger.warning("Bad weights, defaulting to 1.0")
                weights = [1.0]*len(sel)
        else:
            weights = [1.0]*len(sel)

        # --- 4. Call Core Logic ---
        result = generate_challenge_logic(
            num_players=gd['num_players'],
            desired_diff=gd['desired_diff'],
            selected_games=[g.lower() for g in sel if g],
            weights=weights,
            game_vars=game_vars,
            raw_b2b=gd['raw_b2b'],
            entries=gd['generation_pool_entries'],
            selected_modes=gd['selected_modes']
        )
        if result is None or result.get("error"):
            error_msg = result.get("error", "No challenge could be generated.") if isinstance(result, dict) else "Challenge generation failed."
            logger.warning(f"Challenge generation failed: {error_msg}")
            return jsonify({"error": error_msg}), 400

        # --- 5. Augment & Return ---
        result['penalty_info'] = {'tab_id': gd['penalty_tab_id']} if gd['use_penalties'] else None
        result['share_options'] = {
            'challenge_name':       gd['challenge_name'],
            'desired_diff':         gd['desired_diff'], # Original desired diff
            'group_mode':           gd['group_mode'],
            'max_groups':           gd['max_groups'],
            'num_players_per_group':num_players_per_group
        }
        logger.info("Challenge generated successfully.")

        rendered_html = render_template(
        "_challenge_result.html", # Use the new template name
        normal_group=result.get("normal", {}),
        b2b_grouped=result.get("b2b", []),
        total_difficulty=result.get("total_difficulty", 0.0), # Get calculated total diff
        share_options=result.get("share_options", {}), # Pass share options if needed in template
        penalty_info=result.get("penalty_info")      # Pass penalty info if needed
    )

        # --- Return JSON including the *newly rendered* HTML ---
        # Ensure the key for the rendered HTML is "result" so form.js works
        return jsonify({
            "result": rendered_html, # The HTML rendered from _challenge_result.html
            "normal": result.get("normal", {}), # Still include raw data for share.js
            "b2b": result.get("b2b", []),       # Still include raw data for share.js
            "share_options": result.get("share_options", {}),
            "penalty_info": result.get("penalty_info")
        })



    except (ValueError, json.JSONDecodeError) as e:
        logger.exception("Bad input:")
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.exception("Server error:")
        return jsonify({"error": "Server error."}), 500


# --- /share endpoint ---
# Update decorator to use the new blueprint name
# --- /share endpoint ---
@challenge_api.route("/share", methods=["POST"]) 
@csrf.exempt # Keep exempt for this API endpoint called by fetch
@login_required # Keep login required
def share_challenge():
    """
    Creates a persistent SharedChallenge, now with a limit per user
    and saves the intended number of players per group.
    """
    # Removed the temporary manual login check - @login_required handles it
    logger.info(f"--- Share endpoint called by user {current_user.username} ---")
    
    MAX_CHALLENGES_PER_USER = current_app.config.get('MAX_CHALLENGES_PER_USER', 10)
    
    # --- Get and Log Parsed Data ---
    try:
        # force=True can sometimes help if content-type isn't exactly application/json
        data = request.get_json(force=True) 
    except Exception as json_err:
        logger.error(f"Failed to parse request JSON: {json_err}")
        return jsonify({"error": "Invalid JSON data received."}), 400

    # Optional: Add back logging if needed for further debugging
    # logger.debug(f"Parsed JSON data: {data}") 

    # --- Validate payload structure ---
    error_msg = None
    if not data:
        error_msg = "No JSON data received or failed to parse." 
    elif not isinstance(data.get('challenge_data'), dict):
         error_msg = "'challenge_data' is missing or not an object."
    elif 'normal' not in data['challenge_data'] and 'b2b' not in data['challenge_data']:
         error_msg = "'challenge_data' must contain at least 'normal' or 'b2b' key."

    if error_msg:
        logger.warning(f"Share validation failed: {error_msg}. Payload: {data}")
        return jsonify({"error": error_msg}), 400
    # --- End Validation ---

    challenge_data = data.get('challenge_data')
    penalty_info = data.get('penalty_info') # Optional
    name = data.get('name', None) # Optional

    # --- Robust Type Conversion and Validation ---
    try:
        max_groups = int(data.get('max_groups', 1)) 
        num_players_per_group = int(data.get('num_players_per_group', 1)) 
        if max_groups < 1: max_groups = 1
        if num_players_per_group < 1: num_players_per_group = 1
    except (ValueError, TypeError) as conv_err:
         logger.warning(f"Invalid numeric value for max_groups or num_players_per_group: {conv_err}. Data: {data}")
         return jsonify({"error": "Invalid value for max_groups or num_players_per_group."}), 400
    # --- End Type Conversion ---

    try:
        # Check user challenge limit
        current_challenge_count = db.session.query(func.count(SharedChallenge.id))\
            .filter(SharedChallenge.creator_id == current_user.id)\
            .scalar()
        if current_challenge_count >= MAX_CHALLENGES_PER_USER:
            logger.warning(f"User {current_user.username} reached challenge limit ({MAX_CHALLENGES_PER_USER}).")
            return jsonify({"error": f"Max challenges ({MAX_CHALLENGES_PER_USER}) reached."}), 403 # Use 403 Forbidden

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
            num_players_per_group=num_players_per_group
        )
        db.session.add(new_challenge)
        db.session.commit() # Commit transaction
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
        db.session.rollback() # Rollback on DB error
        logger.exception(f"DB Error sharing challenge for user {current_user.username}")
        return jsonify({"error": "Database error creating challenge."}), 500
    except Exception as e:
        db.session.rollback() # Rollback on unexpected error
        logger.exception(f"Unexpected error sharing challenge for user {current_user.username}")
        return jsonify({"error": "An unexpected server error occurred."}), 500






# --- /<public_id>/groups endpoint ---
# Update decorator to use the new blueprint name
@challenge_api.route("/<public_id>/groups", methods=["POST"]) 
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

    try:
        # Use db.session directly
        # Find the parent challenge
        challenge = db.session.query(SharedChallenge).filter_by(public_id=public_id).first()
        if not challenge:
            logger.warning(f"Attempt to add group to non-existent challenge {public_id}")
            return jsonify({"error": "Challenge not found."}), 404

        # Check group limit
        current_group_count = db.session.query(func.count(ChallengeGroup.id))\
            .filter(ChallengeGroup.shared_challenge_id == challenge.id)\
            .scalar() 

        if current_group_count >= challenge.max_groups:
            logger.warning(f"Max groups ({challenge.max_groups}) reached for challenge {public_id}. Cannot add '{group_name}'.")
            return jsonify({"error": f"Maximum number of groups ({challenge.max_groups}) already reached."}), 400

        # Check for duplicate group name within this challenge
        exists = db.session.query(ChallengeGroup.id)\
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
        db.session.add(new_group)
        db.session.commit() # Commit transaction

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
        db.session.rollback() # Rollback on DB error
        logger.exception(f"Database error adding group '{group_name}' to challenge {public_id}: {e}")
        return jsonify({"error": "An unexpected database error occurred while adding the group."}), 500
    except Exception as e:
        db.session.rollback() # Rollback on unexpected error
        logger.exception(f"Unexpected error adding group '{group_name}' to challenge {public_id}: {e}")
        return jsonify({"error": "An unexpected server error occurred."}), 500


# --- /<public_id>/groups/<int:group_id>/progress endpoint ---
# Update decorator to use the new blueprint name
@challenge_api.route("/<public_id>/groups/<int:group_id>/progress", methods=["POST"]) 
@login_required # Require login to update progress
def update_group_progress(public_id, group_id):
    """
    API endpoint to update progress for a specific group item.
    Requires the logged-in user to be a member of the target group.
    """
    data = request.get_json()

    # Validate payload
    required_keys = ['item_type', 'item_key', 'item_index', 'is_complete']
    if not data or not all(key in data for key in required_keys):
        return jsonify({"error": f"Invalid request. JSON with keys {required_keys} required."}), 400
    if not isinstance(data.get('is_complete'), bool):
        return jsonify({"error": "'is_complete' must be a boolean."}), 400

    # Extract data
    item_type = data['item_type']
    item_key = data['item_key']
    try:
        item_index = int(data['item_index'])
        segment_index = int(data['segment_index']) if 'segment_index' in data else None
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid index or segment_index provided."}), 400

    is_complete = data['is_complete']

    try:
        # Use db.session directly
        # Find the target group, ensuring it belongs to the correct challenge
        group = db.session.query(ChallengeGroup).options(
                selectinload(ChallengeGroup.members) # Eager load members for auth check
            ).join(SharedChallenge, SharedChallenge.id == ChallengeGroup.shared_challenge_id)\
             .filter(SharedChallenge.public_id == public_id, ChallengeGroup.id == group_id)\
             .first()

        if not group:
            return jsonify({"error": "Challenge or Group not found."}), 404

        # --- Authorization Check: User must be a member ---
        is_member = any(member.id == current_user.id for member in group.members)
        if not is_member:
            logger.warning(f"Forbidden: User {current_user.username} (ID: {current_user.id}) tried to update progress for group {group_id} but is not a member.")
            return jsonify({"error": "You are not authorized to update progress for this group."}), 403

        # --- Update Progress Logic ---
        if group.progress_data is None: # Initialize if null
            group.progress_data = {}

        progress = group.progress_data # Get current progress dict

        # Construct the progress key
        if item_type == 'b2b':
            if segment_index is None or segment_index < 1:
                return jsonify({"error": "'segment_index' (>= 1) is required for b2b items."}), 400
            progress_key = f"{item_type}_{segment_index}_{item_key}_{item_index}"
        elif item_type == 'normal':
            progress_key = f"{item_type}_{item_key}_{item_index}"
        else:
            return jsonify({"error": "Invalid progress item type specified."}), 400

        needs_update = False
        # Update the dictionary
        if is_complete:
            if progress.get(progress_key) is not True:
                progress[progress_key] = True
                needs_update = True
        else:
            if progress_key in progress:
                del progress[progress_key]
                needs_update = True

        # If the dictionary was changed, ensure SQLAlchemy detects it
        if needs_update:
            group.progress_data = progress # Reassign to trigger dirty state
            flag_modified(group, "progress_data") # Explicitly flag for safety
            db.session.commit() # Commit the changes
            logger.info(f"Progress updated for group {group_id} by user {current_user.username}. Key: {progress_key}, Complete: {is_complete}")
        # else: # No change needed, no commit needed
            # logger.debug(f"No change needed for progress data group {group_id}, key {progress_key}")

        return jsonify({"status": "success", "message": "Progress updated."}), 200

    except SQLAlchemyError as e:
        db.session.rollback() # Rollback on DB error
        logger.exception(f"Database error updating progress for {public_id}/group/{group_id}: {e}")
        return jsonify({"error": "Database error updating progress."}), 500
    except Exception as e:
        db.session.rollback() # Rollback on unexpected error
        logger.exception(f"Unexpected error updating progress for {public_id}/group/{group_id}: {e}")
        return jsonify({"error": "An unexpected server error occurred."}), 500

# Update decorator to use the new blueprint name
@challenge_api.route("/groups/<int:group_id>/join", methods=["POST"]) 
@login_required
def join_group(group_id):
    """Allows the logged-in user to join a specific group for its challenge."""
    logger.info(f"User {current_user.username} attempting to join group {group_id}")
    try:
        # Use db.session directly
        # Find the group and eagerly load related data needed for checks
        group = db.session.query(ChallengeGroup).options(
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
        # 1. Is the group full based on num_players_per_group?
        if len(group.members) >= challenge.num_players_per_group:
             # Check if the user is already the member trying to rejoin (benign)
            if not any(member.id == current_user.id for member in group.members):
                logger.warning(f"Join failed: Group {group_id} is full ({len(group.members)}/{challenge.num_players_per_group}).")
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
            # Re-fetch user object within the current session to avoid detached instance error
            user_to_add = db.session.get(User, current_user.id) 
            if user_to_add:
                 group.members.append(user_to_add)
                 logger.info(f"Adding user {current_user.username} to group {group_id}")
                 db.session.commit() # Commit the membership change
                 return jsonify({"status": "success", "message": f"Successfully joined group '{group.group_name}'."}), 200 # OK or 201 Created
            else:
                 # Should not happen if user is logged in, but handle defensively
                 logger.error(f"Failed to re-fetch logged in user {current_user.id} within session.")
                 db.session.rollback()
                 return jsonify({"error": "Failed to process join request due to server error."}), 500
        else:
            logger.info(f"User {current_user.username} is already a member of group {group_id}.")
            return jsonify({"status": "success", "message": "You are already in this group."}), 200 # OK, idempotent

    except (SQLAlchemyError) as e:
        db.session.rollback() # Rollback on DB error
        logger.exception(f"Database error joining group {group_id} for user {current_user.username}: {e}")
        return jsonify({"error": "Database error processing request."}), 500
    except Exception as e:
        db.session.rollback() # Rollback on unexpected error
        logger.exception(f"Unexpected error joining group {group_id} for user {current_user.username}: {e}")
        return jsonify({"error": "An unexpected server error occurred."}), 500


# --- *** NEW: LEAVE GROUP ENDPOINT *** ---
# Update decorator to use the new blueprint name
@challenge_api.route("/groups/<int:group_id>/leave", methods=["POST"]) 
@login_required
def leave_group(group_id):
    """Allows the logged-in user to leave a specific group they are a member of."""
    logger.info(f"User {current_user.username} attempting to leave group {group_id}")
    try:
        # Use db.session directly
        # Find the group and load members relationship efficiently
        group = db.session.query(ChallengeGroup).options(
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
            db.session.commit() # Commit the change
            return jsonify({"status": "success", "message": f"Successfully left group '{group.group_name}'."}), 200 # OK
        else:
            # User was not a member, return appropriate status
            logger.warning(f"Leave failed: User {current_user.username} is not a member of group {group_id}.")
            return jsonify({"error": "You are not a member of this group."}), 403 # Forbidden or 404 Not Found

    except (SQLAlchemyError) as e:
        db.session.rollback() # Rollback on DB error
        logger.exception(f"Database error leaving group {group_id} for user {current_user.username}: {e}")
        return jsonify({"error": "Database error processing request."}), 500
    except Exception as e:
        db.session.rollback() # Rollback on unexpected error
        logger.exception(f"Unexpected error leaving group {group_id} for user {current_user.username}: {e}")
        return jsonify({"error": "An unexpected server error occurred."}), 500

# Update decorator to use the new blueprint name
@challenge_api.route("/groups/<int:group_id>/players", methods=["POST"]) 
@login_required
def update_group_players(group_id):
    """Updates the list of player names for a specific group."""
    logger.info(f"User {current_user.username} attempting to update players for group {group_id}")
    data = request.get_json()

    if not data or not isinstance(data.get('player_names'), list):
        return jsonify({"error": "Invalid request. JSON data with 'player_names' (list) required."}), 400

    player_names = [str(name).strip() for name in data['player_names'] if isinstance(name, str) and str(name).strip()]
    logger.debug(f"Received player names for group {group_id}: {player_names}")

    try:
        # Use db.session directly
        # Find group and eagerly load parent challenge and current members
        group = db.session.query(ChallengeGroup).options(
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
        db.session.commit() # Commit the change

        logger.info(f"User {current_user.username} updated player names for group {group_id}")
        return jsonify({"status": "success", "message": "Player names updated."}), 200

    except (SQLAlchemyError) as e:
        db.session.rollback(); logger.exception("DB Error updating group players"); return jsonify({"error": "Database error."}), 500
    except Exception as e:
        db.session.rollback(); logger.exception("Unexpected error updating group players"); return jsonify({"error": "Server error."}), 500

# Update decorator to use the new blueprint name
@challenge_api.route("/<public_id>", methods=["DELETE"]) 
@login_required
def delete_shared_challenge(public_id):
    """Deletes a shared challenge if the current user is the creator."""
    logger.info(f"User {current_user.username} attempting to delete challenge {public_id}")

    try:
        # Use db.session directly
        # Find the challenge by public ID
        challenge = db.session.query(SharedChallenge).filter_by(public_id=public_id).first()

        if not challenge:
            logger.warning(f"Delete failed: Challenge {public_id} not found.")
            return jsonify({"error": "Challenge not found."}), 404

        # --- Authorization Check ---
        if challenge.creator_id != current_user.id:
            logger.warning(f"Forbidden: User {current_user.username} tried to delete challenge {public_id} created by user {challenge.creator_id}.")
            return jsonify({"error": "You are not authorized to delete this challenge."}), 403 # Forbidden
        # --- End Authorization Check ---

        # Delete the challenge
        # SQLAlchemy cascade should handle associated groups if configured correctly in the model
        db.session.delete(challenge)
        db.session.commit() # Commit the deletion

        logger.info(f"User {current_user.username} successfully deleted challenge {public_id}")
        # Return success - 204 No Content is common for DELETE success
        return '', 204

    except (SQLAlchemyError) as e:
        db.session.rollback() # Rollback on DB error
        logger.exception(f"Database error deleting challenge {public_id} for user {current_user.username}: {e}")
        return jsonify({"error": "Database error while deleting challenge."}), 500
    except Exception as e:
        db.session.rollback() # Rollback on unexpected error
        logger.exception(f"Unexpected error deleting challenge {public_id} for user {current_user.username}: {e}")
        return jsonify({"error": "An unexpected server error occurred."}), 500

# Update decorator to use the new blueprint name
@challenge_api.route("/groups/<int:group_id>/penalty", methods=["POST"]) 
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

    try:
        # Use db.session directly
        # Find the group and verify user permission (e.g., user is member)
        group = db.session.query(ChallengeGroup).options(
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
        stripped_penalty_text = penalty_text.strip()
        group.active_penalty_text = stripped_penalty_text if stripped_penalty_text else None # Store None if empty/whitespace only
        
        flag_modified(group, "active_penalty_text") # Ensure modification is tracked
        db.session.commit() # Commit the change

        logger.info(f"Successfully set penalty for group {group_id} by user {current_user.id}")
        return jsonify({"status": "success", "message": "Penalty updated."}), 200

    except SQLAlchemyError as e:
        db.session.rollback() # Rollback on DB error
        logger.exception(f"Database error setting penalty for group {group_id}: {e}")
        return jsonify({"error": "Database error setting penalty."}), 500
    except Exception as e:
        db.session.rollback() # Rollback on unexpected error
        logger.exception(f"Unexpected error setting penalty for group {group_id}: {e}")
        return jsonify({"error": "An unexpected server error occurred."}), 500

