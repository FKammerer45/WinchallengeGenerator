# app/sockets.py
import logging
from flask import request, session # Import request for sid
from flask_socketio import emit, join_room, leave_room, disconnect
from sqlalchemy.orm import joinedload, selectinload

# Import necessary components from your app
from app import socketio, db
from app.models import User, SharedChallenge, ChallengeGroup
from app.utils.auth_helpers import is_user_authorized

logger = logging.getLogger(__name__)




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
    if normal_wins: # Checks if normal_wins is not None, not empty dict/list etc.
        # Ensure normal_wins is iterable (like a dict)
        if isinstance(normal_wins, dict):
            for key, info in normal_wins.items():
                # Check if info is a dict before accessing 'count'
                count = info.get('count', 0) if isinstance(info, dict) else 0
                total += count
                for i in range(count):
                    progress_key = f"normal_{key}_{i}"
                    if progress_data.get(progress_key) is True:
                        completed += 1
        else:
             logger.warning(f"challenge_data['normal'] is not a dictionary: {type(normal_wins)}")


    # Check if challenge_data exists AND 'b2b' key exists and is truthy
    b2b_segments = challenge_data.get('b2b')
    if b2b_segments and isinstance(b2b_segments, list): # Check if it's a list
        for segIndex, seg in enumerate(b2b_segments):
            segmentIdx = segIndex # 0-based index for keys
            # Check if seg is a dict AND 'group' key exists and is truthy
            segment_group = seg.get('group') if isinstance(seg, dict) else None
            if segment_group and isinstance(segment_group, dict): # Check if group is a dict
                for key, count in segment_group.items():
                    count_val = count or 0 # Handle None count
                    total += count_val
                    for i in range(count_val):
                        progress_key = f"b2b_{segmentIdx}_{key}_{i}"
                        if progress_data.get(progress_key) is True:
                            completed += 1
            # else: logger.debug(f"Segment {segIndex} has no valid 'group' dictionary.") # Optional debug
    # else: logger.debug("No valid 'b2b' list found in challenge_data.") # Optional debug
    # --- END FIX ---

    percentage = round((completed / total) * 100) if total > 0 else 0
    logger.debug(f"Calculated Progress: {completed}/{total} ({percentage}%)")
    return {"completed": completed, "total": total, "percentage": percentage}

# ... (get_challenge_state_for_overlay function remains the same) ...
def get_challenge_state_for_overlay(challenge, user_id):
    """Fetches and formats the initial state needed by the overlay."""
    if not challenge: return None

    user_group_data = None
    other_groups_progress = []
    challenge_data_struct = challenge.challenge_data or {}

    # Find the user's group and calculate progress for others
    # Ensure groups are loaded
    groups = challenge.groups or []
    for group in groups:
        # Ensure members are loaded or handle potential error
        try:
             is_member = any(member.id == user_id for member in group.members) if group.members else False
        except Exception as e:
             logger.error(f"Error checking membership for group {group.id}: {e}")
             is_member = False

        group_progress_data = group.progress_data or {}
        progress_stats = calculate_progress(challenge_data_struct, group_progress_data)

        if is_member:
            user_group_data = {
                "id": group.id,
                "name": group.group_name,
                "progress_data": group_progress_data,
                "progress_stats": progress_stats,
                "active_penalty_text": group.active_penalty_text or ""
            }
        else:
            # Only include percentage for other groups
            other_groups_progress.append({
                "id": group.id,
                "name": group.group_name,
                "percentage": progress_stats['percentage']
            })

    return {
        "challenge_id": challenge.public_id,
        "challenge_name": challenge.name,
        "challenge_structure": challenge_data_struct,
        "penalty_info": challenge.penalty_info, # Needed for penalty wheel setup
        "user_group": user_group_data, # Details for the streamer's group
        "other_groups_progress": other_groups_progress # Percentages for others
        # Add timer state here if managed server-side
    }

# ... (handle_connect and handle_disconnect remain the same) ...
@socketio.on('connect')
def handle_connect():
    """Handles new WebSocket connections from overlays."""
    sid = request.sid
    logger.info(f"Overlay client attempting connection: {sid}")

    # Get parameters sent by the client during connection
    api_key = request.args.get('apiKey')
    challenge_public_id = request.args.get('challengeId')

    logger.debug(f"Connect attempt details: sid={sid}, apiKey={'Present' if api_key else 'Missing'}, challengeId={challenge_public_id}")

    if not api_key or not challenge_public_id:
        logger.warning(f"Connection rejected (sid={sid}): Missing apiKey or challengeId in query.")
        disconnect(sid)
        return False # Reject connection

    # --- Authentication & Authorization within App Context ---
    try:
        # Find user by API Key
        user = db.session.query(User).filter_by(overlay_api_key=api_key).first()
        if not user:
            logger.warning(f"Connection rejected (sid={sid}): Invalid API Key provided.")
            disconnect(sid)
            return False

        # Find challenge and eager load relationships needed for auth and state
        challenge = db.session.query(SharedChallenge).options(
            selectinload(SharedChallenge.authorized_users),
            selectinload(SharedChallenge.groups).selectinload(ChallengeGroup.members) # Load groups and their members
        ).filter_by(public_id=challenge_public_id).first()

        if not challenge:
            logger.warning(f"Connection rejected (sid={sid}): Challenge '{challenge_public_id}' not found.")
            disconnect(sid)
            return False

        # Check if the user associated with the API key is authorized for this challenge
        # Pass the user object directly to the helper
        if not is_user_authorized(challenge, user):
            logger.warning(f"Connection rejected (sid={sid}): User {user.username} not authorized for challenge {challenge_public_id}.")
            disconnect(sid)
            return False

        # --- Connection Accepted ---
        logger.info(f"Overlay authenticated: sid={sid}, user={user.username}, challenge={challenge_public_id}")

        # Store connection info (Use internal challenge ID for consistency)
        connected_overlays[sid] = {'user_id': user.id, 'challenge_id': challenge.id}

        # Join a room specific to the challenge's *public* ID for easy targeting
        join_room(challenge.public_id)
        logger.debug(f"Socket {sid} joined room '{challenge.public_id}'")

        # Send initial state to the newly connected overlay
        initial_state = get_challenge_state_for_overlay(challenge, user.id)
        if initial_state:
            emit('initial_state', initial_state, to=sid)
            logger.debug(f"Sent initial_state to {sid} for challenge {challenge.public_id}")
        else:
             logger.error(f"Failed to generate initial state for sid={sid}, challenge={challenge_public_id}")
             emit('connect_error', {'message': 'Failed to load initial challenge state.'}, to=sid)
             disconnect(sid)
             return False

    except Exception as e:
        logger.exception(f"Error during overlay connect/auth (sid={sid}): {e}")
        # Don't emit here as connection might not be fully established
        disconnect(sid)
        return False

@socketio.on('disconnect')
def handle_disconnect():
    """Handles overlay disconnections."""
    sid = request.sid
    if sid in connected_overlays:
        challenge_info = connected_overlays.pop(sid)
        challenge_id = challenge_info.get('challenge_id')
        user_id = challenge_info.get('user_id')
        logger.info(f"Overlay disconnected: sid={sid}. User: {user_id}, Challenge ID: {challenge_id}")

        # Leave the room associated with the challenge's public ID
        if challenge_id:
            try:
                 challenge = db.session.get(SharedChallenge, challenge_id)
                 if challenge:
                     leave_room(challenge.public_id)
                     logger.debug(f"Socket {sid} left room '{challenge.public_id}'.")
                 else:
                     logger.warning(f"Challenge {challenge_id} not found when trying to leave room for disconnected socket {sid}.")
            except Exception as e:
                 logger.exception(f"Error leaving room for disconnected socket {sid}: {e}")
        else:
             logger.warning(f"No challenge_id found for disconnected sid {sid}")

    else:
        logger.info(f"Unknown or already removed socket disconnected: {sid}")


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
        logger.info(f"Emitted 'progress_update' to room '{challenge_public_id}' for group {group_id}")
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
    logger.info(f"Emitted 'active_penalty_update' to room '{challenge_public_id}' for group {group_id}")

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
    logger.info(f"Emitted 'penalty_result' to room '{challenge_public_id}' for group {group_id}")

