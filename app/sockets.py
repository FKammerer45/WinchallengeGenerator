# app/sockets.py
import datetime
import json
import logging
from flask import request, session # Import request for sid
from flask_login import current_user
from flask_socketio import emit, join_room, leave_room, disconnect
from sqlalchemy.orm import joinedload, selectinload

# Import necessary components from your app
from app import socketio, db
from app.models import User, SharedChallenge, ChallengeGroup
from app.utils.auth_helpers import is_user_authorized # Assuming this helper exists and works

logger = logging.getLogger(__name__)
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(logging.DEBUG)



# In-memory store for connected overlays { sid: {'user_id': user_id, 'challenge_id': challenge_id} }
connected_overlays = {}

# --- Helper Functions ---

def calculate_progress(challenge_data, progress_data):
    """Calculates progress percentage based on challenge structure and progress data."""
    # Check if challenge_data is a dictionary before proceeding
    if not challenge_data or not isinstance(challenge_data, dict):
        logger.warning("calculate_progress called with invalid challenge_data")
        return {"completed": 0, "total": 0, "percentage": 0}
    if not progress_data or not isinstance(progress_data, dict):
        progress_data = {} # Default to empty dict if invalid

    total = 0
    completed = 0

    # --- FIX: Use standard Python checks ---
    # Check if challenge_data exists AND 'normal' key exists and is truthy
    normal_wins = challenge_data.get('normal')
    if normal_wins: 
        if isinstance(normal_wins, dict):
            for game_key, game_info_obj in normal_wins.items():
                actual_count = game_info_obj.get('count', 0) if isinstance(game_info_obj, dict) else 0
                progress_item_key = game_info_obj.get('id', game_key) if isinstance(game_info_obj, dict) else game_key
                total += actual_count
                for i in range(actual_count):
                    progress_key_str = f"normal_{progress_item_key}_{i}"
                    if progress_data.get(progress_key_str) is True:
                        completed += 1
        else:
             logger.warning(f"challenge_data['normal'] is not a dictionary: {type(normal_wins)}")

    b2b_segments = challenge_data.get('b2b')
    if b2b_segments and isinstance(b2b_segments, list):
        for segIndex, seg_data in enumerate(b2b_segments):
            segment_key_idx = segIndex 
            segment_group_dict = seg_data.get('group') if isinstance(seg_data, dict) else None
            if segment_group_dict and isinstance(segment_group_dict, dict):
                for game_key, game_info_obj_in_b2b in segment_group_dict.items():
                    actual_count_in_b2b = game_info_obj_in_b2b.get('count', 0) if isinstance(game_info_obj_in_b2b, dict) else 0
                    progress_item_key_b2b = game_info_obj_in_b2b.get('id', game_key) if isinstance(game_info_obj_in_b2b, dict) else game_key
                    total += actual_count_in_b2b
                    for i in range(actual_count_in_b2b):
                        progress_key_str = f"b2b_{segment_key_idx}_{progress_item_key_b2b}_{i}"
                        if progress_data.get(progress_key_str) is True:
                            completed += 1
            # else: logger.debug(f"Segment {segIndex} has no valid 'group' dictionary.") # Optional debug
    # else: logger.debug("No valid 'b2b' list found in challenge_data.") # Optional debug
    # --- END FIX ---

    percentage = round((completed / total) * 100) if total > 0 else 0
    return {"completed": completed, "total": total, "percentage": percentage}


def get_challenge_state_for_overlay(challenge, user_id):
    """Fetches and formats the initial state needed by the overlay (and main page)."""
    if not challenge:
        logger.error("[get_challenge_state_for_overlay] Challenge object provided is None!")
        return None

    # Log the state of the 'challenge' object as this function receives it
    # This is crucial for debugging the "timer not running on reload" issue's server side.
   

    user_group_data = None
    other_groups_progress = []
    challenge_data_struct = challenge.challenge_data or {} # Ensure it's at least an empty dict

    groups = challenge.groups or []
    for group in groups:
        try:
            # Ensure group.members is accessed safely, assuming it's loaded
            is_member = any(member.id == user_id for member in group.members) if group.members and hasattr(group.members[0], 'id') else False
        except Exception as e:
            logger.error(f"Error checking membership for group {group.id if hasattr(group, 'id') else 'Unknown'}: {e}")
            is_member = False

        group_progress_data = group.progress_data or {}
        # Assuming calculate_progress is defined and works correctly
        progress_stats = calculate_progress(challenge_data_struct, group_progress_data)

        if is_member:
            user_group_data = {
                "id": group.id,
                "name": group.group_name,
                "progress_data": group_progress_data,
                "progress_stats": progress_stats, # from calculate_progress
                "active_penalty_text": group.active_penalty_text or ""
            }
        else:
            other_groups_progress.append({
                "id": group.id,
                "name": group.group_name,
                "percentage": progress_stats['percentage'] if progress_stats else 0
            })
    
    # --- Revised Timer State Logic ---
    base_timer_value_seconds = challenge.timer_current_value_seconds # This is the DB field, the base accumulated time
    is_running_from_db = challenge.timer_is_running
    last_started_at_utc_from_db = challenge.timer_last_started_at_utc

    iso_formatted_last_started_utc = None
    if is_running_from_db and last_started_at_utc_from_db:
        aware_last_started_utc = last_started_at_utc_from_db
        # Ensure the datetime object is UTC aware before calling isoformat()
        if aware_last_started_utc.tzinfo is None or aware_last_started_utc.tzinfo.utcoffset(aware_last_started_utc) is None:
            # If naive, assume the numbers represent UTC time and make it aware.
            # This matches how it's set: datetime.now(datetime.timezone.utc)
            aware_last_started_utc = aware_last_started_utc.replace(tzinfo=datetime.timezone.utc)
            logger.warning(
                f"[get_challenge_state_for_overlay] timer_last_started_at_utc from DB was naive ('{last_started_at_utc_from_db}'). "
                f"Stamped as UTC: '{aware_last_started_utc}' for challenge {challenge.public_id}."
            )
        else:
            # If already aware, explicitly convert to UTC to standardize the offset in isoformat string (e.g., to +00:00 or Z)
            aware_last_started_utc = aware_last_started_utc.astimezone(datetime.timezone.utc)
        
        iso_formatted_last_started_utc = aware_last_started_utc.isoformat()

    timer_state_payload = {
        "current_value_seconds": base_timer_value_seconds, # Send the base value for client-side live calculation
        "is_running": is_running_from_db,
        "last_started_at_utc": iso_formatted_last_started_utc
    }
    # --- End Revised Timer State Logic ---
    

    return {
        "challenge_id": challenge.public_id,
        "challenge_name": challenge.name,
        "challenge_structure": challenge_data_struct,
        "penalty_info": challenge.penalty_info,
        "user_group": user_group_data,
        "other_groups_progress": other_groups_progress,
        "timer_state": timer_state_payload # Use the revised timer state
    }

# ... (handle_connect and handle_disconnect remain the same) ...
@socketio.on('connect')
def handle_connect():
    sid = request.sid
    api_key = request.args.get('apiKey')
    challenge_public_id_from_query = request.args.get('challengeId')

    if api_key and challenge_public_id_from_query:
        try:
            user = db.session.query(User).filter_by(overlay_api_key=api_key).first()
            if not user:
                logger.warning(f"[Socket Connect] OVERLAY SID={sid} REJECTED: Invalid API Key.")
                emit('auth_error', {'message': 'Invalid API Key.'}, room=sid)
                disconnect(sid)
                return False
            challenge = db.session.query(SharedChallenge).options(
                selectinload(SharedChallenge.authorized_users_list), # Corrected relationship name
                selectinload(SharedChallenge.groups).selectinload(ChallengeGroup.members)
            ).filter_by(public_id=challenge_public_id_from_query).first()
            if not challenge:
                logger.warning(f"[Socket Connect] OVERLAY SID={sid} REJECTED: Challenge '{challenge_public_id_from_query}' not found.")
                emit('auth_error', {'message': 'Challenge not found.'}, room=sid)
                disconnect(sid)
                return False
            if not is_user_authorized(challenge, user):
                logger.warning(f"[Socket Connect] OVERLAY SID={sid} REJECTED: User {user.username} not authorized for challenge {challenge_public_id_from_query}.")
                emit('auth_error', {'message': 'Not authorized for this challenge.'}, room=sid)
                disconnect(sid)
                return False
            connected_overlays[sid] = {'user_id': user.id, 'challenge_id': challenge.id, 'public_challenge_id': challenge.public_id }
            join_room(challenge.public_id)
            initial_state = get_challenge_state_for_overlay(challenge, user.id)
            if initial_state:
                emit('initial_state', initial_state, room=sid)
                logger.debug(f"[Socket Connect] Sent initial_state to OVERLAY SID={sid}")
            emit('connection_ack', {'sid': sid, 'message': 'Overlay connected and authenticated.'}, room=sid)
        except Exception as e:
            logger.error(f"[Socket Connect] OVERLAY SID={sid} CRITICAL ERROR during connect/auth: {e}", exc_info=True)
            disconnect(sid)
            return False
        emit('connection_ack', {'sid': sid, 'message': 'Page viewer connected. Please join a room.'}, room=sid)


@socketio.on('disconnect')
def handle_disconnect():
    sid = request.sid
    # General cleanup or logging for any client disconnecting


# ... (emit_progress_update, emit_active_penalty_update, emit_penalty_spin_result remain the same) ...
def emit_progress_update(challenge_public_id: str, group_id: int, updated_progress_data: dict):
    """Emits progress updates to all overlays connected to a challenge."""
    try:
        # Fetch fresh data within this operation context
        challenge = db.session.query(SharedChallenge).options(
             selectinload(SharedChallenge.groups).selectinload(ChallengeGroup.members) # Load necessary data
        ).filter_by(public_id=challenge_public_id).first()

        if not challenge or not challenge.challenge_data:
            logger.error(f"Cannot emit progress: Challenge {challenge_public_id} or its data not found.")
            return

        # Find the specific group that was updated
        updated_group = next((g for g in challenge.groups if g.id == group_id), None)
        if not updated_group:
             logger.error(f"Cannot emit progress: Group {group_id} not found in challenge {challenge_public_id}.")
             return

        # Recalculate progress for the updated group using the LATEST data passed in
        updated_group_stats = calculate_progress(challenge.challenge_data, updated_progress_data)

        # Calculate percentages for all other groups
        other_groups_progress = []
        for group in challenge.groups:
             if group.id != group_id: # Exclude the group that was just updated
                 progress_stats = calculate_progress(challenge.challenge_data, group.progress_data or {})
                 other_groups_progress.append({
                     "id": group.id,
                     "name": group.group_name,
                     "percentage": progress_stats['percentage']
                 })

        payload = {
            'event': 'progress_update', # Keep event name consistent
            'challenge_id': challenge_public_id,
            'group_id': group_id, # ID of the group whose progress changed
            'progress_data': updated_progress_data, # The full new progress dict for that group
            'progress_stats': updated_group_stats, # Calculated stats for the updated group
            'other_groups_progress': other_groups_progress # Percentages for other groups
        }
        socketio.emit('progress_update', payload, room=challenge_public_id)
    except Exception as e:
        logger.exception(f"Error emitting progress update for challenge {challenge_public_id}")


def emit_active_penalty_update(challenge_public_id: str, group_id: int, penalty_text: str):
    """Emits updates about the active penalty text for a group."""
    payload = {
        'event': 'active_penalty_update', # Keep event name consistent
        'challenge_id': challenge_public_id,
        'group_id': group_id,
        'penalty_text': penalty_text or "" # Ensure it's a string
    }
    socketio.emit('active_penalty_update', payload, room=challenge_public_id)

def emit_penalty_spin_result(challenge_public_id: str, group_id: int, penalty_result: dict):
    """
    Emits the result of a penalty spin, including animation details.
    'penalty_result' should contain keys like 'name', 'description',
    and animation controls like 'stopAngle' or 'winningSegmentIndex'.
    """
    if not isinstance(penalty_result, dict):
         logger.error(f"Cannot emit penalty_result: Invalid penalty_result data type for challenge {challenge_public_id}, group {group_id}")
         return

    payload = {
        'event': 'penalty_result', # Keep event name consistent
        'challenge_id': challenge_public_id,
        'group_id': group_id,
        'result': penalty_result # Send the whole result object
    }
    socketio.emit('penalty_result', payload, room=challenge_public_id)

# In app/sockets.py
# ... (other imports and logger setup) ...
# from app import socketio # Ensure socketio instance is imported

def emit_timer_update_to_room(challenge_public_id: str, event_name: str, data: dict):
    try:
        socketio.emit(event_name, data, room=challenge_public_id) # Use your socketio instance
    except Exception as e:
        logger.error(f"Error emitting '{event_name}' to room '{challenge_public_id}': {e}", exc_info=True)


@socketio.on('join_challenge_room')
def handle_join_challenge_room(data):
    sid = request.sid
    challenge_public_id = data.get('challenge_id')

    if not challenge_public_id:
        logger.warning(f"[Join Room] SID {sid} FAILED PRE-CHECK: 'challenge_id' not provided.")
        emit('room_join_error', {'error': "'challenge_id' is required."}, room=sid)
        return

    is_overlay_client = sid in connected_overlays and connected_overlays[sid].get('public_challenge_id') == challenge_public_id
    user_for_log = "Overlay" if is_overlay_client else (current_user.username if hasattr(current_user, 'is_authenticated') and current_user.is_authenticated else "AnonymousPageViewer")

    try:
        user_to_auth = None
        if not is_overlay_client:
            client_user_id = data.get('user_id')
            if client_user_id:
                try:
                    user_to_auth = db.session.get(User, int(client_user_id))
                    if user_to_auth:
                        logger.debug(f"[Join Room] SID {sid} - Loaded user {user_to_auth.username} (ID: {user_to_auth.id}) from client-provided user_id.")
                    else:
                        logger.warning(f"[Join Room] SID {sid} - User ID {client_user_id} provided by client not found in DB.")
                except ValueError:
                    logger.warning(f"[Join Room] SID {sid} - Invalid user_id format provided by client: {client_user_id}")
            
            if not user_to_auth: # Fallback to current_user if client_user_id fails or not provided
                user_to_auth = current_user
                if hasattr(user_to_auth, 'is_authenticated'):
                    logger.debug(f"[Join Room] SID {sid} - Using current_user.is_authenticated: {user_to_auth.is_authenticated}, User ID: {user_to_auth.id if user_to_auth.is_authenticated else 'N/A'}")
                else:
                    logger.debug(f"[Join Room] SID {sid} - current_user does not have is_authenticated. Type: {type(user_to_auth)}")
            
            if not user_to_auth or not user_to_auth.is_authenticated:
                logger.warning(f"[Join Room] PAGE VIEWER SID={sid} DENIED for challenge '{challenge_public_id}': User not authenticated for room join. User object: {str(user_to_auth)}")
                emit('room_join_error', {'error': 'Authentication required to join this challenge room.'}, room=sid)
                return False
        
        # --- Explicitly log before and after join_room ---
        join_room(challenge_public_id)
        
        emit('room_joined', {'room': challenge_public_id, 'message': f'Successfully joined room {challenge_public_id}. SID: {sid}'}, room=sid)


        if not is_overlay_client and user_to_auth and user_to_auth.is_authenticated: # Use the determined user_to_auth
            challenge = db.session.query(SharedChallenge).filter_by(public_id=challenge_public_id).first()
            if challenge:
                initial_state_data = get_challenge_state_for_overlay(challenge, user_to_auth.id) # Use ID from user_to_auth
                if initial_state_data:
                    emit('initial_state', initial_state_data, room=sid)
                    logger.debug(f"[Join Room] Sent initial_state to PAGE VIEWER SID={sid} (User ID: {user_to_auth.id}) for challenge {challenge.public_id}")
            else:
                logger.warning(f"[Join Room] Challenge {challenge_public_id} not found when trying to send initial_state to page viewer SID={sid}")

    except Exception as e:
        logger.error(f"[Join Room] SID {sid} (User: {user_for_log}) CRITICAL ERROR joining room '{challenge_public_id}': {e}", exc_info=True)
        emit('room_join_error', {'error': f'Server error: {str(e)}'}, room=sid)


@socketio.on('leave_challenge_room')
def handle_leave_challenge_room(data):
    # ... (same as your provided sockets.py) ...
    sid = request.sid
    challenge_public_id = data.get('challenge_id')
    if challenge_public_id:
        leave_room(challenge_public_id)
        emit('room_left', {'room': challenge_public_id}, room=sid)
    else:
        logger.warning(f"[Leave Room] SID {sid} 'challenge_id' not provided.")

def emit_group_created(challenge_public_id: str, group_data: dict):
    """Emits an event when a new group is created for a challenge."""
    payload = {
        'challenge_id': challenge_public_id,
        'new_group': group_data  # Contains id, name, member_count, player_names, etc.
    }
    socketio.emit('group_created', payload, room=challenge_public_id)

def emit_group_membership_update(challenge_public_id: str, group_id: int, member_count: int, player_names: list, is_full: bool):
    """Emits when a user joins or leaves a group, updating member count and player names."""
    payload = {
        'challenge_id': challenge_public_id,
        'group_id': group_id,
        'member_count': member_count,
        'player_names': player_names, # List of player slot objects
        'is_full': is_full
    }
    socketio.emit('group_membership_update', payload, room=challenge_public_id)

def emit_player_names_updated(challenge_public_id: str, group_id: int, player_names: list):
    """Emits when player display names within a group are updated."""
    payload = {
        'challenge_id': challenge_public_id,
        'group_id': group_id,
        'player_names': player_names # Updated list of player slot objects
    }
    socketio.emit('player_names_updated', payload, room=challenge_public_id)

def emit_current_game_updated(challenge_public_id: str, group_id: int, game_info: dict):
    """Emits when the current game for a group is updated."""
    payload = {
        'challenge_id': challenge_public_id,
        'group_id': group_id,
        'current_game_info': game_info # Contains id, name, tags
    }
    socketio.emit('current_game_updated', payload, room=challenge_public_id)

def emit_timed_penalty_applied(challenge_public_id: str, group_id: int, penalty_text: str, duration_seconds: int, applied_at_utc_iso: str):
    """Emits when a penalty with a duration is applied to a group."""
    payload = {
        'challenge_id': challenge_public_id,
        'group_id': group_id,
        'penalty_text': penalty_text or "",
        'duration_seconds': duration_seconds,
        'applied_at_utc': applied_at_utc_iso
    }
    socketio.emit('timed_penalty_applied', payload, room=challenge_public_id)
