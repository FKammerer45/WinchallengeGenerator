# app/routes/challenge_api.py
import logging
import json
import uuid
from flask import Blueprint, render_template, request, jsonify, current_app, url_for
from flask_login import login_required, current_user
import datetime
# Import logic functions
from app.modules.challenge_generator import generate_challenge_logic
from app.modules.game_preferences import initialize_game_vars
from app import csrf
# Import db instance from app
from app import db 
from app.sockets import (
    emit_progress_update, emit_active_penalty_update,
    emit_penalty_spin_result, connected_overlays,
    get_challenge_state_for_overlay, socketio,
    emit_group_created, emit_group_membership_update, emit_player_names_updated,
    emit_timer_update_to_room # Import new emitters
)
# Import necessary models
from app.models import SharedChallenge, ChallengeGroup, User
from app.utils.auth_helpers import is_user_authorized
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
      
        if isinstance(gd['selected_modes'], dict):
            gd['selected_modes'] = {k.lower(): v for k, v in gd['selected_modes'].items()}
            logger.debug(f"--- [API /generate] Converted selected_modes (lowercase keys): {gd['selected_modes']}")
        else:
            logger.warning(f"--- [API /generate] Received selected_modes is not a dict: {type(gd['selected_modes'])}. Resetting to empty dict.")
            gd['selected_modes'] = {} # Ensure it's a dict if parsing failed somehow
            
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
@challenge_api.route("/<public_id>/groups", methods=["POST"])
@login_required # Kept from original, assuming it's correct for your flow
def add_group_to_challenge(public_id):
    """
    API endpoint to add a new group to an existing SharedChallenge.
    Checks limits and name uniqueness. Emits 'group_created' event.
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
        challenge = db.session.query(SharedChallenge).options(
            selectinload(SharedChallenge.groups).selectinload(ChallengeGroup.members)
        ).filter_by(public_id=public_id).first()

        if not challenge:
            logger.warning(f"Attempt to add group to non-existent challenge {public_id}")
            return jsonify({"error": "Challenge not found."}), 404

        if challenge.creator_id != current_user.id:
            logger.warning(f"User {current_user.username} attempted to add group to challenge {public_id} but is not creator.")
            return jsonify({"error": "Only the challenge creator can add groups."}), 403

        current_group_count = len(challenge.groups)
        if current_group_count >= challenge.max_groups:
            logger.warning(f"Max groups ({challenge.max_groups}) reached for challenge {public_id}. Cannot add '{group_name}'.")
            return jsonify({"error": f"Maximum number of groups ({challenge.max_groups}) already reached."}), 400

        if any(g.group_name == group_name for g in challenge.groups):
            logger.warning(f"Group name '{group_name}' already exists for challenge {public_id}.")
            return jsonify({"error": f"The group name '{group_name}' is already taken for this challenge."}), 409

        new_group = ChallengeGroup(
            group_name=group_name,
            shared_challenge_id=challenge.id
        )
        # Initialize player_names as an empty list of correct size
        new_group.player_names = [{"display_name": "", "account_name": None} for _ in range(challenge.num_players_per_group)]

        db.session.add(new_group)
        db.session.flush()

        user_added_to_group = False
        if challenge.max_groups == 1 and challenge.creator_id == current_user.id:
            user_to_add = db.session.get(User, current_user.id)
            if user_to_add:
                new_group.members.append(user_to_add)
                user_added_to_group = True
                # Update player_names if creator auto-joins
                slots = new_group.player_names or _initialize_player_slots_for_emit(new_group, challenge.num_players_per_group)
                placed = False
                for slot in slots:
                    if not slot.get("account_name"):
                        slot["account_name"] = current_user.username
                        slot["display_name"] = current_user.username
                        placed = True
                        break
                if placed:
                    new_group.player_names = slots
                    flag_modified(new_group, "player_names") # Mark as modified if necessary
                logger.info(f"Auto-adding creator {current_user.username} to single group {new_group.id}")
            else:
                logger.error(f"Could not find user {current_user.id} to auto-add to single group.")

        db.session.commit()
        logger.info(f"Successfully added group '{group_name}' (ID: {new_group.id}) to challenge {public_id}")

        # --- EMIT SOCKET EVENT for group_created ---
        # Refresh group to get all relationships properly loaded for the emit payload
        db.session.refresh(new_group)
        db.session.refresh(challenge) # Refresh challenge to get updated groups list if needed for counts

        group_data_for_socket = {
            "id": new_group.id,
            "name": new_group.group_name,
            "progress": new_group.progress_data or {},
            "member_count": len(new_group.members),
            "player_names": new_group.player_names or _initialize_player_slots_for_emit(new_group, challenge.num_players_per_group),
            "active_penalty_text": new_group.active_penalty_text or ""
        }
        emit_group_created(challenge.public_id, group_data_for_socket)
        # --- END EMIT ---

        return jsonify({
            "status": "success",
            "message": "Group created successfully.",
            "group": group_data_for_socket,
            "creator_auto_joined": user_added_to_group
        }), 201

    except SQLAlchemyError as e:
        db.session.rollback()
        logger.exception(f"Database error adding group '{group_name}' to challenge {public_id}: {e}")
        return jsonify({"error": "An unexpected database error occurred while adding the group."}), 500
    except Exception as e:
        db.session.rollback()
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
    logger.info(f"User {current_user.username} attempting to join group {group_id}")
    user_overlay_sid = None # From original code, might be for OBS updates
    try:
        group = db.session.query(ChallengeGroup).options(
            selectinload(ChallengeGroup.members),
            joinedload(ChallengeGroup.shared_challenge) # Eager load challenge for num_players_per_group
                .selectinload(SharedChallenge.groups) # For checking other group memberships
                .selectinload(ChallengeGroup.members)
        ).get(group_id)

        if not group: return jsonify({"error": "Group not found."}), 404
        challenge = group.shared_challenge
        if not challenge: return jsonify({"error": "Challenge associated with group not found."}), 500

        if not is_user_authorized(challenge, current_user):
            return jsonify({"error": "You are not authorized to join groups for this challenge."}), 403

        is_already_member_this_group = any(member.id == current_user.id for member in group.members)
        num_current_members = len(group.members)

        if not is_already_member_this_group and num_current_members >= challenge.num_players_per_group:
             return jsonify({"error": "This group is already full."}), 409 # HTTP 409 Conflict

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
                 num_current_members +=1 # Increment for emit
                 logger.info(f"Adding user {current_user.username} to group {group_id} members list.")
            else:
                 logger.error(f"Could not re-fetch user {current_user.id} to add to members.")
                 return jsonify({"error": "Failed to process join request due to server error."}), 500

        # Use the existing _initialize_player_slots from the original file
        # Assuming it's defined in this file or imported correctly
        player_slots = _initialize_player_slots(group) # From your original code for this file
        assigned_slot_this_action = False
        is_already_in_slot = any(slot.get("account_name") == current_user.username for slot in player_slots)

        if not is_already_in_slot:
            for i, slot in enumerate(player_slots):
                if not slot.get("account_name"): # Find first empty slot
                    player_slots[i]["account_name"] = current_user.username
                    player_slots[i]["display_name"] = current_user.username # Default display name to account name
                    assigned_slot_this_action = True
                    logger.info(f"Assigned user {current_user.username} to slot {i} in group {group_id}.")
                    break
            if not assigned_slot_this_action:
                 logger.warning(f"Could not find an empty player slot for user {current_user.username} in group {group_id}, although group wasn't reported full earlier.")
                 # This might happen if num_players_per_group is small and all slots are filled by others
                 # even if the user is not yet a member formally.

        if user_needs_adding_to_members or assigned_slot_this_action:
            group.player_names = player_slots
            flag_modified(group, "player_names")
            db.session.commit()

            # --- EMIT SOCKET EVENT for group_membership_update ---
            emit_group_membership_update(
                challenge.public_id,
                group.id,
                num_current_members, # Send updated count
                group.player_names,    # Send updated slots
                num_current_members >= challenge.num_players_per_group
            )
            # --- END EMIT ---

            # ... (existing OBS overlay update logic) ...
            # This part for OBS overlay updates was in your original code
            user_id_to_notify = current_user.id
            challenge_to_update = group.shared_challenge # challenge object should be correct here
            for sid, info in connected_overlays.items():
                 if info.get('user_id') == user_id_to_notify and info.get('public_challenge_id') == challenge_to_update.public_id: # Compare public_id
                     user_overlay_sid = sid
                     break
            if user_overlay_sid:
                 logger.info(f"Found overlay SID {user_overlay_sid} for user {user_id_to_notify}. Emitting updated state.")
                 # Re-fetch challenge for the overlay state to ensure all relationships are fresh for get_challenge_state_for_overlay
                 challenge_reloaded_for_overlay = db.session.query(SharedChallenge).options(
                     selectinload(SharedChallenge.groups).selectinload(ChallengeGroup.members)
                 ).filter_by(id=challenge_to_update.id).first()

                 if challenge_reloaded_for_overlay:
                      new_state_data = get_challenge_state_for_overlay(challenge_reloaded_for_overlay, user_id_to_notify)
                      if new_state_data: socketio.emit('initial_state', new_state_data, to=user_overlay_sid); logger.debug(f"Sent updated initial_state to SID {user_overlay_sid}")
                      else: logger.error(f"Failed to generate updated state for user {user_id_to_notify}, SID {user_overlay_sid}")
                 else: logger.error(f"Failed to reload challenge {challenge_to_update.id} for state update.")
            else: logger.warning(f"Could not find active overlay SID for user {user_id_to_notify} in challenge {challenge_to_update.public_id} to send update.")


        response_data = {
            "status": "success",
            "message": f"Successfully joined group '{group.group_name}'." if (user_needs_adding_to_members or assigned_slot_this_action) else "You are already in this group's slots.",
            "group_data": {
                 "id": group.id,
                 "player_names": group.player_names,
                 "member_count": num_current_members
            }
        }
        return jsonify(response_data), 200

    except Exception as e:
        db.session.rollback()
        logger.exception(f"Error joining group {group_id} for user {current_user.username}: {e}")
        return jsonify({"error": "An unexpected server error occurred."}), 500




# --- /groups/<int:group_id>/leave endpoint ---
@challenge_api.route("/groups/<int:group_id>/leave", methods=["POST"])
@login_required
def leave_group(group_id):
    logger.info(f"User {current_user.username} attempting to leave group {group_id}")
    user_overlay_sid = None # From original code
    try:
        group = db.session.query(ChallengeGroup).options(
            selectinload(ChallengeGroup.members),
            joinedload(ChallengeGroup.shared_challenge) # Eager load challenge
        ).get(group_id)

        if not group: return jsonify({"error": "Group not found."}), 404
        challenge = group.shared_challenge
        if not challenge: return jsonify({"error": "Challenge not found."}), 500

        if not is_user_authorized(challenge, current_user):
            return jsonify({"error": "Not authorized for this challenge."}), 403

        user_to_remove_from_members = None
        for member in group.members:
            if member.id == current_user.id:
                user_to_remove_from_members = member
                break

        if user_to_remove_from_members:
            group.members.remove(user_to_remove_from_members)
            logger.info(f"Removing user {current_user.username} from group {group_id} members list.")
        else:
            logger.warning(f"User {current_user.username} tried to leave group {group_id} but was not in members list.")

        player_slots = _initialize_player_slots(group) # From your original code
        slot_cleared_this_action = False
        for i, slot in enumerate(player_slots):
            if slot.get("account_name") == current_user.username:
                player_slots[i]["account_name"] = None
                player_slots[i]["display_name"] = ""
                slot_cleared_this_action = True
                logger.info(f"Cleared user {current_user.username} from slot {i} in group {group_id}.")
                break

        if user_to_remove_from_members or slot_cleared_this_action:
            group.player_names = player_slots
            flag_modified(group, "player_names")
            db.session.commit()
            num_current_members = len(group.members) # Get after removal

            # --- EMIT SOCKET EVENT for group_membership_update ---
            emit_group_membership_update(
                challenge.public_id,
                group.id,
                num_current_members,
                group.player_names,
                num_current_members >= challenge.num_players_per_group
            )
            # --- END EMIT ---

            # ... (existing OBS overlay update logic) ...
            user_id_to_notify = current_user.id
            challenge_to_update = group.shared_challenge
            for sid, info in connected_overlays.items():
                 if info.get('user_id') == user_id_to_notify and info.get('public_challenge_id') == challenge_to_update.public_id: # Compare public_id
                     user_overlay_sid = sid
                     break
            if user_overlay_sid:
                 logger.info(f"Found overlay SID {user_overlay_sid} for user {user_id_to_notify} after leaving group. Emitting updated state.")
                 challenge_reloaded_for_overlay = db.session.query(SharedChallenge).options(selectinload(SharedChallenge.groups).selectinload(ChallengeGroup.members)).filter_by(id=challenge_to_update.id).first()
                 if challenge_reloaded_for_overlay:
                     new_state_data = get_challenge_state_for_overlay(challenge_reloaded_for_overlay, user_id_to_notify)
                     if new_state_data: socketio.emit('initial_state', new_state_data, to=user_overlay_sid); logger.debug(f"Sent updated initial_state to SID {user_overlay_sid} after leave")
                     else: logger.error(f"Failed to generate updated state after leave for SID {user_overlay_sid}")
                 else: logger.error(f"Failed to reload challenge {challenge_to_update.id} after leave.")
            else: logger.warning(f"Could not find active overlay SID for user {user_id_to_notify} after leave.")


            return jsonify({"status": "success", "message": f"Successfully left group '{group.group_name}'."}), 200
        else:
            return jsonify({"error": "You were not found in this group's member list or player slots."}), 403

    except Exception as e:
        db.session.rollback()
        logger.exception(f"Error leaving group {group_id} for user {current_user.username}: {e}")
        return jsonify({"error": "An unexpected server error occurred."}), 500



# --- /groups/<int:group_id>/players endpoint ---
@challenge_api.route("/groups/<int:group_id>/players", methods=["POST"])
@login_required
def update_group_players(group_id):
    logger.info(f"User {current_user.username} attempting to update player display names for group {group_id}")
    data = request.get_json()
    if data is None:
        logger.warning(f"Update players request for group {group_id} did not contain valid JSON or Content-Type.")
        return jsonify({"error": "Invalid request format. Expected JSON with Content-Type: application/json."}), 400
    if not isinstance(data.get('player_display_names'), list):
        logger.warning(f"Update players request for group {group_id} missing 'player_display_names' list. Received: {data}")
        return jsonify({"error": "Invalid request. JSON must contain 'player_display_names' (as a list)."}), 400

    new_display_names_from_client = data['player_display_names']
    logger.debug(f"Received display names for group {group_id}: {new_display_names_from_client}")

    try:
        group = db.session.query(ChallengeGroup).options(
            joinedload(ChallengeGroup.shared_challenge),
            selectinload(ChallengeGroup.members)
        ).get(group_id)

        if not group: return jsonify({"error": "Group not found."}), 404
        challenge = group.shared_challenge
        if not challenge: return jsonify({"error": "Challenge for group not found."}), 500

        if not is_user_authorized(challenge, current_user):
            return jsonify({"error": "Not authorized for this challenge."}), 403
        is_member = any(member.id == current_user.id for member in group.members)
        if not is_member:
            return jsonify({"error": "Not authorized to update this group's players."}), 403

        player_slots = _initialize_player_slots(group) # Uses your original helper from this file
        max_players = challenge.num_players_per_group

        if len(new_display_names_from_client) != len(player_slots):
            logger.warning(f"Mismatch in submitted player names ({len(new_display_names_from_client)}) and allowed slots ({len(player_slots)}) for group {group_id}.")
            return jsonify({"error": f"Incorrect number of player names submitted. Expected {len(player_slots)}."}), 400

        changes_made_to_db = False
        for i, slot_in_db in enumerate(player_slots):
            if i < len(new_display_names_from_client):
                new_name_for_slot = str(new_display_names_from_client[i] or '').strip()[:50]

                # Only allow user to change their own display name OR if they are the creator and the slot is empty/not theirs
                # More refined logic might be needed if non-members can be assigned display names by members.
                # For now, assume only the user occupying the slot (by account_name) or creator for empty slots can change.
                can_change_this_slot = False
                if slot_in_db.get("account_name") == current_user.username: # User changing their own name
                    can_change_this_slot = True
                    if not new_name_for_slot: # If user blanks their own name, default to account name
                        new_name_for_slot = current_user.username
                elif challenge.creator_id == current_user.id: # Creator can change any slot's display name
                    can_change_this_slot = True
                # Add more conditions if other users should be able to edit others' display names

                if can_change_this_slot:
                    if slot_in_db.get("display_name") != new_name_for_slot:
                        slot_in_db["display_name"] = new_name_for_slot
                        changes_made_to_db = True
                else:
                    logger.warning(f"User {current_user.username} not permitted to change display name for slot {i} (Account: {slot_in_db.get('account_name')}) in group {group_id}.")
                    # Optionally, you could revert this specific input if not allowed,
                    # or just ignore the change for this slot. Current logic ignores it.

        if changes_made_to_db:
            group.player_names = player_slots
            flag_modified(group, "player_names")
            db.session.commit()
            logger.info(f"User {current_user.username} updated player display names for group {group_id}")

            # --- EMIT SOCKET EVENT for player_names_updated ---
            emit_player_names_updated(
                challenge.public_id,
                group.id,
                group.player_names # Send the fully updated list of player slot objects
            )
            # --- END EMIT ---

            return jsonify({"status": "success", "message": "Player names updated."}), 200
        else:
            logger.info(f"No changes detected or permitted in player display names for group {group_id}.")
            return jsonify({"status": "ok", "message": "No changes made to player names."}), 200

    except SQLAlchemyError as e:
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




@challenge_api.route("/<public_id>/timer/start", methods=["POST"])
@login_required # Ensures current_user is populated
def timer_start(public_id):
    try:
        challenge = db.session.query(SharedChallenge).options(
            selectinload(SharedChallenge.authorized_users)
        ).filter_by(public_id=public_id).first_or_404("Challenge not found")

        if not is_user_authorized(challenge, current_user):
            logger.warning(f"User {current_user.id} not authorized for timer start on challenge {public_id}.")
            return jsonify({"status": "error", "error": "Not authorized to control this timer."}), 403

        if not challenge.timer_is_running:
            challenge.timer_is_running = True
            challenge.timer_last_started_at_utc = datetime.datetime.now(datetime.timezone.utc)
            db.session.commit()
            logger.info(f"Timer started for challenge {public_id} by user {current_user.id}. DB current value: {challenge.timer_current_value_seconds}, DB Last started: {challenge.timer_last_started_at_utc}")

            # Explicitly make it UTC aware if it came back from DB as naive
            final_last_started_utc = challenge.timer_last_started_at_utc
            if final_last_started_utc and (final_last_started_utc.tzinfo is None or final_last_started_utc.tzinfo.utcoffset(final_last_started_utc) is None):
                logger.warning(f"timer_last_started_at_utc for challenge {public_id} was naive after DB commit. Stamping as UTC. Original value: {final_last_started_utc}")
                final_last_started_utc = final_last_started_utc.replace(tzinfo=datetime.timezone.utc)

            payload = {
                'challenge_id': challenge.public_id,
                'current_value_seconds': challenge.timer_current_value_seconds,
                'is_running': True,
                'last_started_at_utc': final_last_started_utc.isoformat() if final_last_started_utc else None
            }
            emit_timer_update_to_room(challenge.public_id, 'timer_started', payload)
            
            # --- END EMIT ---

            return jsonify({"status": "success", "message": "Timer started."}), 200
        
        return jsonify({"status": "ok", "message": "Timer already running."}), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error in timer_start for challenge {public_id}: {e}", exc_info=True)
        return jsonify({"status": "error", "error": "An unexpected server error occurred."}), 500


@challenge_api.route("/<public_id>/timer/stop", methods=["POST"])
@login_required
def timer_stop(public_id):
    try:
        challenge = db.session.query(SharedChallenge).options(
            selectinload(SharedChallenge.authorized_users)
        ).filter_by(public_id=public_id).first_or_404("Challenge not found")

        if not is_user_authorized(challenge, current_user):
            return jsonify({"status": "error", "error": "Not authorized to control this timer."}), 403

        if challenge.timer_is_running:
            if challenge.timer_last_started_at_utc:
                # Ensure timer_last_started_at_utc is offset-aware for correct calculation
                last_started = challenge.timer_last_started_at_utc
                
                # THIS IS THE CRITICAL SECTION FOR TIMEZONE HANDLING AND ELAPSED TIME CALCULATION
                # ------------------------------------------------------------------------------------
                if last_started.tzinfo is None or last_started.tzinfo.utcoffset(last_started) is None:
                    # This assumes that if the datetime is naive, its numerical value represents UTC.
                    # This is generally true if SQLAlchemy stores DateTime(timezone=True) as naive UTC for SQLite.
                    last_started = last_started.replace(tzinfo=datetime.timezone.utc)
                
                current_time_utc = datetime.datetime.now(datetime.timezone.utc)
                elapsed_since_last_start = (current_time_utc - last_started).total_seconds()
                
                # Log these values for debugging the 2-hour jump:
                logger.info(f"Timer Stop DEBUG: public_id={public_id}")
                logger.info(f"  Raw challenge.timer_last_started_at_utc from DB: {challenge.timer_last_started_at_utc.isoformat() if challenge.timer_last_started_at_utc else 'None'}")
                logger.info(f"  Effective last_started (UTC-aware): {last_started.isoformat()}")
                logger.info(f"  Current time (datetime.now(timezone.utc)): {current_time_utc.isoformat()}")
                logger.info(f"  Calculated elapsed_since_last_start: {elapsed_since_last_start} seconds")
                logger.info(f"  challenge.timer_current_value_seconds (before add): {challenge.timer_current_value_seconds}")
                # ------------------------------------------------------------------------------------

                if elapsed_since_last_start < -1: # Allow for small clock skew, but large negative is an issue
                    logger.error(f"Timer Stop: Negative elapsed time calculated ({elapsed_since_last_start}s) for challenge {public_id}. This indicates a clock sync or timezone issue. NOT adding to timer_current_value_seconds.")
                    # Decide how to handle: maybe don't add, or add 0, or log and proceed.
                    # For now, we will not add negative elapsed time to prevent reducing the timer.
                else:
                    challenge.timer_current_value_seconds += int(elapsed_since_last_start)
                
                logger.info(f"  challenge.timer_current_value_seconds (after add): {challenge.timer_current_value_seconds}")

            challenge.timer_is_running = False
            challenge.timer_last_started_at_utc = None # Clear this when stopped
            db.session.commit()
            logger.info(f"Timer stopped for challenge {public_id} by user {current_user.id}. New value: {challenge.timer_current_value_seconds}")

            payload = {
                'challenge_id': challenge.public_id,
                'current_value_seconds': challenge.timer_current_value_seconds,
                'is_running': False
            }
            emit_timer_update_to_room(challenge.public_id, 'timer_stopped', payload)
            return jsonify({"status": "success", "message": "Timer stopped."}), 200

        logger.info(f"Timer stop requested for challenge {public_id}, but timer already stopped.")
        return jsonify({"status": "ok", "message": "Timer already stopped."}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error in timer_stop for challenge {public_id}: {e}", exc_info=True)
        return jsonify({"status": "error", "error": "An unexpected server error occurred."}), 500



@challenge_api.route("/<public_id>/timer/reset", methods=["POST"])
@login_required
def timer_reset(public_id):
    try:
        challenge = db.session.query(SharedChallenge).options(
            selectinload(SharedChallenge.authorized_users)
        ).filter_by(public_id=public_id).first_or_404("Challenge not found")

        if not is_user_authorized(challenge, current_user):
            return jsonify({"status": "error", "error": "Not authorized to control this timer."}), 403

        challenge.timer_current_value_seconds = 0
        challenge.timer_is_running = False
        challenge.timer_last_started_at_utc = None
        db.session.commit()

        # --- CRITICAL: Emit the update ---
        payload = {
            'challenge_id': challenge.public_id,
            'current_value_seconds': 0,
            'is_running': False
        }
        emit_timer_update_to_room(challenge.public_id, 'timer_reset', payload)
        # --- END EMIT ---
        return jsonify({"status": "success", "message": "Timer reset."}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error in timer_reset for challenge {public_id}: {e}", exc_info=True)
        return jsonify({"status": "error", "error": "An unexpected server error occurred."}), 500


# Helper (ensure this or similar is defined and accessible)
def _initialize_player_slots_for_emit(group_obj: ChallengeGroup, num_slots_expected: int) -> list:
    """
    Ensures player_names for a group object is a list of dicts matching num_slots_expected,
    suitable for socket emission. It prioritizes existing account_names.
    """
    if not group_obj:
        return [{"display_name": "", "account_name": None} for _ in range(num_slots_expected)]

    current_slots = group_obj.player_names
    # Initialize fresh if current_slots is not in the expected list-of-dicts format
    if not isinstance(current_slots, list) or not all(isinstance(s, dict) for s in current_slots):
        current_slots = [] # Start fresh if format is wrong

    # Create a new list ensuring all slots are present up to num_slots_expected
    final_slots = []
    # Populate with existing valid slots first
    for i in range(min(len(current_slots), num_slots_expected)):
        slot = current_slots[i]
        final_slots.append({
            "display_name": slot.get("display_name", ""),
            "account_name": slot.get("account_name", None)
        })

    # Add empty placeholder slots if needed
    while len(final_slots) < num_slots_expected:
        final_slots.append({"display_name": "", "account_name": None})

    # Truncate if there are somehow more slots than expected (should ideally not happen)
    if len(final_slots) > num_slots_expected:
        final_slots = final_slots[:num_slots_expected]

    return final_slots
