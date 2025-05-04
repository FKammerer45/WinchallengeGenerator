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
from ..sockets import (emit_progress_update, emit_active_penalty_update,
                       emit_penalty_spin_result, connected_overlays, # Import the dictionary
                       get_challenge_state_for_overlay, socketio) # Import helper and socketio instance

logger = logging.getLogger(__name__)

# Define the blueprint - RENAME VARIABLE to challenge_api
challenge_api = Blueprint('challenge_api', __name__, url_prefix='/api/challenge') 

def _initialize_player_slots(group):
    """Ensures player_names is a list of dicts matching num_players_per_group."""
    if not group or not group.shared_challenge:
        return [] # Cannot initialize without challenge context

    num_slots = group.shared_challenge.num_players_per_group
    current_slots = group.player_names

    # Check if it's already in the new format (list of dicts)
    if isinstance(current_slots, list) and all(isinstance(s, dict) for s in current_slots):
        # Pad or truncate if needed
        if len(current_slots) < num_slots:
            current_slots.extend([{"display_name": "", "account_name": None} for _ in range(num_slots - len(current_slots))])
        elif len(current_slots) > num_slots:
            current_slots = current_slots[:num_slots]
        return current_slots
    else:
        # If it's old format (list of strings) or None/invalid, create fresh list
        logger.warning(f"Player names for group {group.id} not in expected format. Initializing fresh.")
        return [{"display_name": "", "account_name": None} for _ in range(num_slots)]

def is_user_authorized(challenge, user):
    """Checks if a user is the creator or in the authorized list."""
    if not user or not user.is_authenticated:
        return False
    if challenge.creator_id == user.id:
        return True
    # Check if user is in the collection. This requires the relationship to be loaded.
    # Ensure 'authorized_users' is loaded efficiently if needed frequently (e.g., using joinedload or selectinload options in the query)
    return user in challenge.authorized_users

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

        if current_user.is_authenticated: # Ensure user is logged in
            user_to_add = db.session.get(User, current_user.id) # Get user object in session
            if user_to_add:
                new_challenge.authorized_users.append(user_to_add)
                logger.info(f"Automatically authorized creator {current_user.username} for challenge {public_id}")
            else:
                logger.warning(f"Could not re-fetch user {current_user.id} to auto-authorize.")

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
@login_required
@challenge_api.route("/<public_id>/groups", methods=["POST"])
def add_group_to_challenge(public_id):
    """
    API endpoint to add a new group to an existing SharedChallenge.
    Checks limits and name uniqueness. Automatically adds creator if single-group.
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
        # Find the parent challenge - Eager load groups and their members for checks
        # Load authorized users as well if needed for other checks (not strictly needed here)
        challenge = db.session.query(SharedChallenge).options(
            selectinload(SharedChallenge.groups).selectinload(ChallengeGroup.members)
        ).filter_by(public_id=public_id).first()

        if not challenge:
            logger.warning(f"Attempt to add group to non-existent challenge {public_id}")
            return jsonify({"error": "Challenge not found."}), 404

        # --- Authorization Check (Creator Only) ---
        if challenge.creator_id != current_user.id:
            logger.warning(f"User {current_user.username} attempted to add group to challenge {public_id} but is not creator.")
            return jsonify({"error": "Only the challenge creator can add groups."}), 403

        # Check group limit (using eager-loaded groups)
        current_group_count = len(challenge.groups) # Efficient check on loaded relationship
        if current_group_count >= challenge.max_groups:
            logger.warning(f"Max groups ({challenge.max_groups}) reached for challenge {public_id}. Cannot add '{group_name}'.")
            return jsonify({"error": f"Maximum number of groups ({challenge.max_groups}) already reached."}), 400

        # Check for duplicate group name (using eager-loaded groups)
        if any(g.group_name == group_name for g in challenge.groups):
            logger.warning(f"Group name '{group_name}' already exists for challenge {public_id}.")
            return jsonify({"error": f"The group name '{group_name}' is already taken for this challenge."}), 409

        # Create the new group
        new_group = ChallengeGroup(
            group_name=group_name,
            shared_challenge_id=challenge.id # Set foreign key
        )
        db.session.add(new_group)
        db.session.flush() # Flush to get the new_group.id before adding members

        # --- Auto-add creator logic ---
        user_added_to_group = False # Initialize flag
        if challenge.max_groups == 1 and challenge.creator_id == current_user.id:
            # Ensure user object is in session
            user_to_add = db.session.get(User, current_user.id)
            if user_to_add:
                # Check if user is *not* already a member (shouldn't be, but safe check)
                # Note: new_group.members will be empty here unless relationship was pre-populated
                # It's safe to just append.
                new_group.members.append(user_to_add)
                user_added_to_group = True # Set flag
                logger.info(f"Auto-adding creator {current_user.username} to single group {new_group.id} for challenge {public_id}")
            else:
                logger.error(f"Could not find user {current_user.id} to auto-add to single group.")
                # Continue without auto-adding, but log the error.

        # Commit transaction (group creation and potential membership)
        db.session.commit()
        logger.info(f"Successfully added group '{group_name}' (ID: {new_group.id}) to challenge {public_id}")

        # --- Return data including the generated ID and the auto-join flag ---
        return jsonify({
            "status": "success",
            "message": "Group created successfully.",
            "group": {
                "id": new_group.id,
                "name": new_group.group_name,
                "progress": new_group.progress_data or {},
                "member_count": 1 if user_added_to_group else 0, # Reflect immediate membership
                # Add other fields if needed by addGroupToDOM JS function
                "player_names": [current_user.username] if user_added_to_group else [],
                "active_penalty_text": None
            },
            "creator_auto_joined": user_added_to_group # <<< THIS FLAG IS NOW INCLUDED
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
        challenge = group.shared_challenge # Get the challenge via the relationship
        if not challenge:
            # This case should ideally not happen if database constraints are correct
            logger.error(f"Challenge object missing for group {group_id}")
            return jsonify({"error": "Internal Server Error: Cannot find challenge for group."}), 500
        
        if not is_user_authorized(challenge, current_user):
            logger.warning(f"User {current_user.username} unauthorized to update progress for challenge {challenge.public_id}.")
            return jsonify({"error": "You are not authorized for this challenge."}), 403

        

        # --- Authorization Check: User must be a member ---
        is_member = any(member.id == current_user.id for member in group.members)
        if not is_member:
            logger.warning(f"Forbidden: User {current_user.username} (ID: {current_user.id}) tried to update progress for group {group_id} but is not a member.")
            return jsonify({"error": "You must be a member of this group to update its progress."}), 403

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
            emit_progress_update(public_id, group_id, group.progress_data)
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
    """Allows the logged-in user to join a specific group and assigns them to a player slot."""
    logger.info(f"User {current_user.username} attempting to join group {group_id}")
    user_overlay_sid = None
    try:
        group = db.session.query(ChallengeGroup).options(
            selectinload(ChallengeGroup.members),
            joinedload(ChallengeGroup.shared_challenge)
                .selectinload(SharedChallenge.groups)
                .selectinload(ChallengeGroup.members)
        ).get(group_id)

        if not group: return jsonify({"error": "Group not found."}), 404
        challenge = group.shared_challenge
        if not challenge: return jsonify({"error": "Challenge associated with group not found."}), 500

        if not is_user_authorized(challenge, current_user):
            return jsonify({"error": "You are not authorized to join groups for this challenge."}), 403

        is_already_member_this_group = any(member.id == current_user.id for member in group.members)

        if not is_already_member_this_group and len(group.members) >= challenge.num_players_per_group:
             return jsonify({"error": "This group is already full."}), 409

        user_already_in_another_group = False
        for sibling_group in challenge.groups:
            if sibling_group.id != group_id and any(member.id == current_user.id for member in sibling_group.members):
                user_already_in_another_group = True
                break
        if user_already_in_another_group:
            return jsonify({"error": "You are already in another group for this challenge."}), 409

        user_needs_adding_to_members = not is_already_member_this_group
        if user_needs_adding_to_members:
            user_to_add = db.session.get(User, current_user.id)
            if user_to_add:
                 group.members.append(user_to_add)
                 logger.info(f"Adding user {current_user.username} to group {group_id} members list.")
            else:
                 logger.error(f"Could not re-fetch user {current_user.id} to add to members.")
                 return jsonify({"error": "Failed to process join request due to server error."}), 500

        player_slots = _initialize_player_slots(group)
        assigned_slot = False
        is_already_in_slot = any(slot.get("account_name") == current_user.username for slot in player_slots)

        if not is_already_in_slot:
            for i, slot in enumerate(player_slots):
                if not slot.get("account_name"):
                    player_slots[i]["account_name"] = current_user.username
                    player_slots[i]["display_name"] = current_user.username
                    assigned_slot = True
                    logger.info(f"Assigned user {current_user.username} to slot {i} in group {group_id}.")
                    break
            if not assigned_slot:
                 logger.warning(f"Could not find an empty player slot for user {current_user.username} in group {group_id}, although group wasn't full.")

        if user_needs_adding_to_members or assigned_slot:
            group.player_names = player_slots
            flag_modified(group, "player_names")
            db.session.commit()
            # --- Emit WebSocket Update (existing logic) ---
            # ...
            user_id_to_notify = current_user.id
            challenge_to_update = group.shared_challenge
            for sid, info in connected_overlays.items():
                 if info.get('user_id') == user_id_to_notify and info.get('challenge_id') == challenge_to_update.id:
                     user_overlay_sid = sid
                     break
            if user_overlay_sid:
                 logger.info(f"Found overlay SID {user_overlay_sid} for user {user_id_to_notify}. Emitting updated state.")
                 challenge_reloaded = db.session.query(SharedChallenge).options(selectinload(SharedChallenge.groups).selectinload(ChallengeGroup.members)).get(challenge_to_update.id)
                 if challenge_reloaded:
                      new_state_data = get_challenge_state_for_overlay(challenge_reloaded, user_id_to_notify)
                      if new_state_data: socketio.emit('initial_state', new_state_data, to=user_overlay_sid); logger.debug(f"Sent updated initial_state to SID {user_overlay_sid}")
                      else: logger.error(f"Failed to generate updated state for user {user_id_to_notify}, SID {user_overlay_sid}")
                 else: logger.error(f"Failed to reload challenge {challenge_to_update.id} for state update.")
            else: logger.warning(f"Could not find active overlay SID for user {user_id_to_notify} in challenge {challenge_to_update.id} to send update.")


        # --- UPDATED RESPONSE ---
        # Return the updated player_names list along with success status
        response_data = {
            "status": "success",
            "message": f"Successfully joined group '{group.group_name}'." if user_needs_adding_to_members else "You are already in this group.",
            "group_data": { # Include updated group data
                 "id": group.id,
                 "player_names": player_slots, # Send the latest player slots
                 "member_count": len(group.members) # Send the latest member count
            }
        }
        return jsonify(response_data), 200
        # --- END UPDATED RESPONSE ---

    except Exception as e:
        db.session.rollback()
        logger.exception(f"Error joining group {group_id} for user {current_user.username}: {e}")
        return jsonify({"error": "An unexpected server error occurred."}), 500



@challenge_api.route("/groups/<int:group_id>/leave", methods=["POST"])
@login_required
def leave_group(group_id):
    """Allows the logged-in user to leave a specific group and clears their player slot."""
    logger.info(f"User {current_user.username} attempting to leave group {group_id}")
    user_overlay_sid = None
    try:
        # Eager load relationships
        group = db.session.query(ChallengeGroup).options(
            selectinload(ChallengeGroup.members),
            joinedload(ChallengeGroup.shared_challenge)
        ).get(group_id)

        if not group: return jsonify({"error": "Group not found."}), 404
        challenge = group.shared_challenge
        if not challenge: return jsonify({"error": "Challenge not found."}), 500

        # Authorization Check
        if not is_user_authorized(challenge, current_user):
            return jsonify({"error": "Not authorized for this challenge."}), 403

        # --- Remove User from Members List ---
        user_to_remove = None
        for member in group.members:
            if member.id == current_user.id:
                user_to_remove = member
                break

        if user_to_remove:
            group.members.remove(user_to_remove)
            logger.info(f"Removing user {current_user.username} from group {group_id} members list.")
        else:
            # User wasn't in members list, maybe just clearing slot? Allow proceeding.
            logger.warning(f"User {current_user.username} tried to leave group {group_id} but was not in members list.")
            # Return error if you want to prevent leaving if not a member:
            # return jsonify({"error": "You are not a member of this group."}), 403

        # --- Clear User from Player Slot ---
        player_slots = _initialize_player_slots(group) # Get normalized list
        slot_cleared = False
        for i, slot in enumerate(player_slots):
            if slot.get("account_name") == current_user.username:
                player_slots[i]["account_name"] = None
                player_slots[i]["display_name"] = "" # Clear display name too
                slot_cleared = True
                logger.info(f"Cleared user {current_user.username} from slot {i} in group {group_id}.")
                break # Assuming user can only occupy one slot

        # --- Update Database ---
        if user_to_remove or slot_cleared: # Only commit if something changed
            group.player_names = player_slots # Assign the potentially modified list
            flag_modified(group, "player_names") # Mark JSON column as modified
            db.session.commit() # Commit membership and slot changes

            # --- Emit WebSocket Update ---
            # ... (existing SID finding and emit logic) ...
            user_id_to_notify = current_user.id
            challenge_to_update = group.shared_challenge
            for sid, info in connected_overlays.items():
                 if info.get('user_id') == user_id_to_notify and info.get('challenge_id') == challenge_to_update.id:
                     user_overlay_sid = sid
                     break
            if user_overlay_sid:
                 logger.info(f"Found overlay SID {user_overlay_sid} for user {user_id_to_notify} after leaving group. Emitting updated state.")
                 challenge_reloaded = db.session.query(SharedChallenge).options(selectinload(SharedChallenge.groups).selectinload(ChallengeGroup.members)).get(challenge_to_update.id)
                 if challenge_reloaded:
                     new_state_data = get_challenge_state_for_overlay(challenge_reloaded, user_id_to_notify)
                     if new_state_data: socketio.emit('initial_state', new_state_data, to=user_overlay_sid); logger.debug(f"Sent updated initial_state to SID {user_overlay_sid} after leave")
                     else: logger.error(f"Failed to generate updated state after leave for SID {user_overlay_sid}")
                 else: logger.error(f"Failed to reload challenge {challenge_to_update.id} after leave.")
            else: logger.warning(f"Could not find active overlay SID for user {user_id_to_notify} after leave.")
            # --- End Emit Logic ---

            return jsonify({"status": "success", "message": f"Successfully left group '{group.group_name}'."}), 200
        else:
            # If user wasn't a member and wasn't in a slot, return appropriate message
            return jsonify({"error": "You were not found in this group's member list or player slots."}), 403


    except Exception as e:
        db.session.rollback()
        logger.exception(f"Error leaving group {group_id} for user {current_user.username}: {e}")
        return jsonify({"error": "An unexpected server error occurred."}), 500


# Update decorator to use the new blueprint name
@challenge_api.route("/groups/<int:group_id>/players", methods=["POST"])
@login_required
def update_group_players(group_id):
    """Updates ONLY the display names for player slots in a specific group."""
    logger.info(f"User {current_user.username} attempting to update player display names for group {group_id}")

    # --- Refined Validation ---
    data = request.get_json()
    if data is None:
        logger.warning(f"Update players request for group {group_id} did not contain valid JSON data or correct Content-Type header.")
        # Return a more specific error message
        return jsonify({"error": "Invalid request format. Expected JSON data with Content-Type: application/json."}), 400

    # Check specifically for the 'player_display_names' key and if it's a list
    if not isinstance(data.get('player_display_names'), list):
        logger.warning(f"Update players request for group {group_id} missing 'player_display_names' list in JSON payload. Received: {data}")
        # Update the error message to reflect the expected key
        return jsonify({"error": "Invalid request. JSON data must contain 'player_display_names' (as a list)."}), 400
    # --- End Refined Validation ---

    new_display_names = data['player_display_names']
    logger.debug(f"Received display names for group {group_id}: {new_display_names}")

    try:
        # Find group and eagerly load parent challenge and current members
        group = db.session.query(ChallengeGroup).options(
            joinedload(ChallengeGroup.shared_challenge),
            selectinload(ChallengeGroup.members)
        ).get(group_id)

        if not group: return jsonify({"error": "Group not found."}), 404
        challenge = group.shared_challenge
        if not challenge: return jsonify({"error": "Challenge for group not found."}), 500

        # Authorization Checks
        if not is_user_authorized(challenge, current_user):
            return jsonify({"error": "Not authorized for this challenge."}), 403
        is_member = any(member.id == current_user.id for member in group.members)
        if not is_member:
            return jsonify({"error": "Not authorized to update this group's players."}), 403

        # Get current slots, initialize if needed
        player_slots = _initialize_player_slots(group)
        max_players = challenge.num_players_per_group

        # Validate input length against the actual number of slots
        if len(new_display_names) != len(player_slots):
            logger.warning(f"Mismatch in submitted player names ({len(new_display_names)}) and allowed slots ({len(player_slots)}) for group {group_id}.")
            return jsonify({"error": f"Incorrect number of player names submitted. Expected {len(player_slots)}."}), 400

        # Update ONLY the display_name for each slot
        changes_made = False
        for i, slot in enumerate(player_slots):
            # Ensure index exists in submitted data before accessing
            if i < len(new_display_names):
                new_name = str(new_display_names[i] or '').strip()[:50] # Sanitize
                # Keep original account name if user tries to blank out their own display name
                if slot.get("account_name") == current_user.username and not new_name:
                    new_name = current_user.username
                # Update if different
                if slot.get("display_name") != new_name:
                    slot["display_name"] = new_name
                    changes_made = True
            else:
                # This case shouldn't happen due to the length check above, but log if it does
                logger.error(f"Index {i} out of bounds for submitted display names in group {group_id}.")

        # Save if changes were made
        if changes_made:
            group.player_names = player_slots
            flag_modified(group, "player_names")
            db.session.commit()
            logger.info(f"User {current_user.username} updated player display names for group {group_id}")
            # emit_player_names_update(challenge.public_id, group_id, player_slots) # Optional: Emit changes
            return jsonify({"status": "success", "message": "Player names updated."}), 200
        else:
            logger.info(f"No changes detected in player display names for group {group_id}.")
            return jsonify({"status": "ok", "message": "No changes detected."}), 200

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

        challenge = group.shared_challenge # Get the challenge via the relationship
        if not challenge:
            # This case should ideally not happen if database constraints are correct
            logger.error(f"Challenge object missing for group {group_id}")
            return jsonify({"error": "Internal Server Error: Cannot find challenge for group."}), 500
        
        if not is_user_authorized(challenge, current_user):
            logger.warning(f"User {current_user.username} unauthorized to set penalty for challenge {challenge.public_id}.")
            return jsonify({"error": "Not authorized for this challenge."}), 403




        # Authorization Check (Example: must be a member to set penalty)
        is_member = any(member.id == current_user.id for member in group.members)
        if not is_member:
            logger.warning(f"Forbidden: User {current_user.id} tried to set penalty for group {group_id} but is not member.")
            return jsonify({"error": "You are not authorized to set penalties for this group."}), 403

        # Update the penalty text (allow empty string to clear)
        stripped_penalty_text = penalty_text.strip()
        if group.active_penalty_text != stripped_penalty_text:
            group.active_penalty_text = stripped_penalty_text if stripped_penalty_text else None
            flag_modified(group, "active_penalty_text")
            db.session.commit() # Commit FIRST
            logger.info(f"Set penalty for group {group_id} to: '{group.active_penalty_text}'")


            emit_active_penalty_update(challenge.public_id, group_id, group.active_penalty_text)

        else:
             logger.debug(f"No change needed for active penalty text for group {group_id}")

        return jsonify({"status": "success", "message": "Penalty updated."}), 200

    except SQLAlchemyError as e:
        db.session.rollback() # Rollback on DB error
        logger.exception(f"Database error setting penalty for group {group_id}: {e}")
        return jsonify({"error": "Database error setting penalty."}), 500
    except Exception as e:
        db.session.rollback() # Rollback on unexpected error
        logger.exception(f"Unexpected error setting penalty for group {group_id}: {e}")
        return jsonify({"error": "An unexpected server error occurred."}), 500

@challenge_api.route("/<public_id>/authorize", methods=["POST"])
@login_required
def add_authorized_user(public_id):
    challenge = db.session.query(SharedChallenge).options(
        selectinload(SharedChallenge.authorized_users) # Eager load for check
    ).filter_by(public_id=public_id).first_or_404()

    if challenge.creator_id != current_user.id:
        return jsonify({"error": "Only the creator can authorize users."}), 403

    data = request.get_json()
    username_to_add = data.get('username')
    if not username_to_add:
        return jsonify({"error": "Username required."}), 400

    user_to_add = db.session.query(User).filter(User.username.ilike(username_to_add)).first()
    if not user_to_add:
        return jsonify({"error": f"User '{username_to_add}' not found."}), 404
    if user_to_add.id == challenge.creator_id:
         # Return ok status, but maybe indicate they are creator
         return jsonify({"status": "ok", "message": "Creator is always authorized."}), 200

    if user_to_add not in challenge.authorized_users:
        challenge.authorized_users.append(user_to_add)
        db.session.commit()
        logger.info(f"User {user_to_add.username} authorized for challenge {public_id} by {current_user.username}.")
        # ----> MODIFIED RETURN START <----
        return jsonify({
            "status": "success",
            "message": f"User {user_to_add.username} authorized.",
            "user": {"id": user_to_add.id, "username": user_to_add.username} # Include user info
        }), 200
        # ----> MODIFIED RETURN END <----
    else:
        # ----> MODIFIED RETURN START (Optional: Include user info even if already authorized) <----
        return jsonify({
            "status": "ok",
            "message": f"User {user_to_add.username} already authorized.",
            "user": {"id": user_to_add.id, "username": user_to_add.username} # Optionally include info
        }), 200
        # ----> MODIFIED RETURN END <----

# The remove_authorized_user function likely doesn't need modification
# unless you want to return the details of the removed user.
# Existing implementation seems fine.
@challenge_api.route("/<public_id>/authorize/<int:user_id>", methods=["DELETE"])
@login_required
def remove_authorized_user(public_id, user_id):
    # ... (existing implementation is likely okay) ...
     challenge = db.session.query(SharedChallenge).options(selectinload(SharedChallenge.authorized_users)).filter_by(public_id=public_id).first_or_404()
     if challenge.creator_id != current_user.id:
         return jsonify({"error": "Only the creator can remove users."}), 403

     user_to_remove = None
     for user in challenge.authorized_users:
          if user.id == user_id:
                user_to_remove = user
                break

     if not user_to_remove:
         return jsonify({"error": "User not found in authorized list."}), 404
     if user_to_remove.id == challenge.creator_id:
          return jsonify({"error": "Cannot remove the creator."}), 400

     challenge.authorized_users.remove(user_to_remove)
     db.session.commit()
     logger.info(f"User {user_to_remove.username} authorization revoked for challenge {public_id} by {current_user.username}.")
     return jsonify({"status": "success", "message": f"User {user_to_remove.username} removed."}), 200


@challenge_api.route("/groups/<int:group_id>/penalty_spin_result", methods=["POST"])
@login_required
def record_penalty_spin_result(group_id):
    """Records the penalty result determined client-side and emits it."""
    data = request.get_json()
    penalty_result = data.get('penalty_result') # Expect object like {'name':.., 'description':.., 'stopAngle':.., 'winningSegmentIndex':..}

    if not penalty_result or not isinstance(penalty_result, dict) or 'name' not in penalty_result:
        return jsonify({"error": "Invalid 'penalty_result' data provided."}), 400

    logger.info(f"Received penalty spin result for group {group_id} from user {current_user.id}: {penalty_result.get('name')}")

    try:
        # Find group, check authorization (user must be member)
        group = db.session.query(ChallengeGroup).options(
             selectinload(ChallengeGroup.members),
             joinedload(ChallengeGroup.shared_challenge) # Need challenge for auth/emit
        ).filter(ChallengeGroup.id == group_id).first()

        if not group: return jsonify({"error": "Group not found."}), 404
        challenge = group.shared_challenge
        if not challenge: return jsonify({"error": "Challenge not found."}), 500

        if not is_user_authorized(challenge, current_user):
             return jsonify({"error": "Not authorized for this challenge."}), 403

        is_member = any(member.id == current_user.id for member in group.members)
        if not is_member:
             return jsonify({"error": "Not authorized to record penalties for this group."}), 403

        # Construct the text to save (similar to penalty.js logic)
        penalty_text_to_save = ""
        if penalty_result.get('name') and penalty_result['name'] != "No Penalty":
             baseText = f"{penalty_result.get('player', 'Participant')} receives penalty: {penalty_result['name']}" # Assume player name might be in result?
             penalty_text_to_save = baseText
             if penalty_result.get('description'):
                 penalty_text_to_save += f" ({penalty_result['description']})"

        # Save the text to the group's active_penalty_text field
        if group.active_penalty_text != penalty_text_to_save:
             group.active_penalty_text = penalty_text_to_save if penalty_text_to_save else None
             flag_modified(group, "active_penalty_text")
             db.session.commit() # Commit FIRST
             logger.info(f"Saved active penalty text for group {group_id}: '{group.active_penalty_text}'")
             # Emit update for the text display as well
             emit_active_penalty_update(challenge.public_id, group_id, group.active_penalty_text)
        else:
             logger.debug(f"No change needed for active penalty text after spin result for group {group_id}")

        # --- Emit WebSocket Event with Full Result (including animation data) ---
        emit_penalty_spin_result(challenge.public_id, group_id, penalty_result)
        # --- End Emit ---

        return jsonify({"status": "success", "message": "Penalty result recorded."}), 200

    except Exception as e:
        db.session.rollback()
        logger.exception(f"Error recording penalty spin result for group {group_id}: {e}")
        return jsonify({"error": "Server error recording penalty result."}), 500
