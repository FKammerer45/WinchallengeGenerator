# app/routes/shared_challenge_api.py
import logging
import json
from flask import Blueprint, request, jsonify, current_app
from flask_login import current_user, login_required

from app.database import get_db_session
from app.models import SharedChallenge, ChallengeGroup, User # Import necessary models

logger = logging.getLogger(__name__)
shared_challenge_api_bp = Blueprint('shared_challenge_api', __name__, url_prefix='/api/challenge') # Prefix matches challenge_api

@shared_challenge_api_bp.route("/share", methods=["POST"])
@login_required # Only logged-in users can share/create
def share_challenge():
    """Creates a persistent, shareable challenge instance."""
    data = request.get_json()
    # Basic validation of incoming challenge structure
    if not data or 'result' not in data or ('normal' not in data and 'b2b' not in data):
         return jsonify({"error": "Invalid challenge data provided."}), 400

    challenge_details = { # Extract only core challenge structure
         'result': data.get('result'),
         'normal': data.get('normal'),
         'b2b': data.get('b2b')
    }
    penalty_info = data.get('penalty_info') # Get penalty info {tab_id, player_names} if present

    try:
        with get_db_session() as db_session:
            # Create the main shared challenge record
            new_shared_challenge = SharedChallenge(
                creator_user_id=current_user.id,
                challenge_data=challenge_details,
                penalty_info=penalty_info,
                # name=data.get('name') # Optional: Allow user to name the shared challenge?
            )
            db_session.add(new_shared_challenge)
            db_session.flush() # To get the ID and default public_id

            # Optionally auto-create initial groups from player_names?
            initial_players = penalty_info.get('player_names', []) if penalty_info else []
            if initial_players:
                 # Limit to max_groups
                 groups_to_create = initial_players[:new_shared_challenge.max_groups]
                 for player_name in groups_to_create:
                      # Use player name as group name initially? Ensure uniqueness?
                      # For simplicity, let's assume unique names provided for now
                      if player_name and player_name.strip():
                           group = ChallengeGroup(
                               shared_challenge_id=new_shared_challenge.id,
                               group_name=player_name.strip(),
                               progress_data={} # Initialize empty progress
                           )
                           db_session.add(group)
                 logger.info(f"Auto-created {len(groups_to_create)} groups for challenge {new_shared_challenge.public_id}")

        # Commit happens automatically on exit
        logger.info(f"Shared challenge created by user {current_user.id} with public_id {new_shared_challenge.public_id}")
        # Return the public ID and maybe the full URL
        return jsonify({
            "status": "ok",
            "public_id": new_shared_challenge.public_id,
            "share_url": url_for('main.view_shared_challenge', public_id=new_shared_challenge.public_id, _external=True) # Generate absolute URL
        }), 201 # Created

    except Exception as e:
        logger.exception(f"Error creating shared challenge for user {current_user.id}")
        return jsonify({"error": "Failed to create shared challenge."}), 500


@shared_challenge_api_bp.route("/<public_id>/groups", methods=["POST"])
def add_group_to_challenge(public_id):
    """Adds a new group to an existing shared challenge."""
    data = request.get_json()
    group_name = data.get('group_name', '').strip()

    if not group_name:
        return jsonify({"error": "Group name cannot be empty."}), 400

    try:
        with get_db_session() as db_session:
            challenge = db_session.query(SharedChallenge).filter_by(public_id=public_id).first()
            if not challenge:
                return jsonify({"error": "Shared challenge not found."}), 404

            # Check group limit
            current_group_count = db_session.query(ChallengeGroup).filter_by(shared_challenge_id=challenge.id).count()
            if current_group_count >= challenge.max_groups:
                 return jsonify({"error": f"Maximum number of groups ({challenge.max_groups}) reached for this challenge."}), 400

            # Check if group name already exists for this challenge
            existing_group = db_session.query(ChallengeGroup).filter_by(
                shared_challenge_id=challenge.id,
                group_name=group_name
            ).first()
            if existing_group:
                 return jsonify({"error": f"Group name '{group_name}' already exists for this challenge."}), 409 # Conflict

            # Create new group
            new_group = ChallengeGroup(
                shared_challenge_id=challenge.id,
                group_name=group_name,
                progress_data={} # Initialize empty progress
            )
            db_session.add(new_group)
            db_session.flush() # Get ID if needed
            group_id = new_group.id
            # Commit happens automatically

        logger.info(f"Added group '{group_name}' (ID: {group_id}) to challenge '{public_id}'.")
        # Return the new group info (or just success status)
        return jsonify({
            "status": "ok",
            "group_id": group_id,
            "group_name": group_name
        }), 201

    except Exception as e:
        logger.exception(f"Error adding group '{group_name}' to challenge '{public_id}'")
        return jsonify({"error": "Failed to add group."}), 500


@shared_challenge_api_bp.route("/<public_id>/groups/<int:group_id>/progress", methods=["POST"])
# No @login_required, allow anonymous updates if they know the URL? Or add simple group password?
# For now, allow anonymous updates. Add auth later if needed.
def update_group_progress(public_id, group_id):
    """Updates the completion status of a specific item for a group."""
    data = request.get_json()
    if not data: return jsonify({"error": "Invalid data"}), 400

    item_type = data.get('item_type') # e.g., 'normal', 'b2b'
    item_key = data.get('item_key')   # e.g., 'Game (Mode)', 'Segment 1 - Game (Mode)'
    item_index = data.get('item_index') # e.g., 0, 1, 2... (checkbox index)
    is_complete = data.get('is_complete') # boolean true/false

    # Validate input
    if not all([item_type, item_key, isinstance(item_index, int), isinstance(is_complete, bool)]):
         return jsonify({"error": "Missing or invalid progress data."}), 400

    logger.debug(f"Update progress request: Challenge={public_id}, Group={group_id}, Type={item_type}, Key={item_key}, Idx={item_index}, State={is_complete}")

    try:
        with get_db_session() as db_session:
             # Find the specific group
             group = db_session.query(ChallengeGroup).filter_by(id=group_id).first()
             if not group: return jsonify({"error": "Group not found."}), 404
             # Optionally verify group belongs to challenge public_id? Assumed correct URL structure for now.

             # Load current progress JSON
             progress = group.progress_data or {} # Default to empty dict if null

             # Update the progress structure based on item type
             if item_type == 'normal':
                 if item_key not in progress: progress[item_key] = []
                 # Ensure array is long enough
                 while len(progress[item_key]) <= item_index: progress[item_key].append(False)
                 progress[item_key][item_index] = is_complete
             elif item_type == 'b2b':
                 # Assume item_key format "Segment X - Game (Mode)" - need segment index and game key
                 # This requires a more complex structure or parsing logic.
                 # Simpler structure might be better: progress['b2b'][segment_idx][item_key][item_idx] = is_complete
                 # Let's use a flat key for now for simplicity:
                 flat_key = f"b2b_{item_key}_{item_index}" # e.g., b2b_Segment 1 - Game A (Mode X)_0
                 progress[flat_key] = is_complete
                 # TODO: Refine the structure for storing B2B progress more effectively later.
             else:
                  return jsonify({"error": "Invalid item type."}), 400

             # Mark the JSON column as modified for SQLAlchemy
             from sqlalchemy.orm.attributes import flag_modified
             flag_modified(group, "progress_data")

             # Save the updated JSON (commit happens automatically)
             logger.info(f"Updated progress for Group {group_id} on Challenge '{public_id}': {flat_key if item_type=='b2b' else item_key}[{item_index}] = {is_complete}")

        return jsonify({"status": "ok"})

    except Exception as e:
        logger.exception(f"Error updating progress for Group {group_id}")
        return jsonify({"error": "Failed to update progress."}), 500

# Optional: Endpoint to log penalty assignment?
# @shared_challenge_api_bp.route("/<public_id>/groups/<int:group_id>/penalty", methods=["POST"]) ...