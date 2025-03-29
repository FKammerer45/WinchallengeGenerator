# app/routes/tabs_api.py
import logging
import json
from flask import Blueprint, request, jsonify, current_app
from flask_login import current_user, login_required
from app.database import get_db_session # Use the shared session context manager
from app.models import SavedGameTab      # Import the SavedGameTab model

logger = logging.getLogger(__name__)

# Using url_prefix for API clarity
tabs_api_bp = Blueprint('tabs_api', __name__, url_prefix='/api/tabs')

# Define constants if needed, e.g., max saved tabs
MAX_SAVED_TABS = 5

@tabs_api_bp.route("/save", methods=["POST"])
@login_required # Ensure user is logged in
def save_tab():
    """API endpoint to save or update a specific user tab configuration."""
    data = request.get_json()
    if not data:
        logger.warning("User %s: Received empty data for /api/tabs/save.", current_user.id)
        return jsonify({"error": "No data provided"}), 400

    # Extract data using client-side keys (tabId, tabName)
    client_tab_id = data.get("tabId")
    tab_name = data.get("tabName")
    entries = data.get("entries") # This should be the list of entry objects

    logger.debug(
        "User %s: Request to save tab. client_tab_id=%s, tab_name=%s, entries_count=%s",
        current_user.id, client_tab_id, tab_name, len(entries) if isinstance(entries, list) else 'N/A'
    )

    # Validate input
    if not client_tab_id or client_tab_id == "default":
        logger.warning("User %s: Attempt to save invalid tab ID: %s", current_user.id, client_tab_id)
        return jsonify({"error": "Invalid tab ID provided. Cannot save 'default'."}), 400
    if not tab_name:
        logger.warning("User %s: Missing tab name for saving tab ID: %s", current_user.id, client_tab_id)
        return jsonify({"error": "Tab name cannot be empty."}), 400
    if not isinstance(entries, list):
         logger.warning("User %s: Invalid 'entries' format for tab ID: %s", current_user.id, client_tab_id)
         return jsonify({"error": "'entries' field must be a list."}), 400

    try:
        # Serialize entries list to JSON string for database storage
        entries_json_string = json.dumps(entries)
    except TypeError as e:
        logger.error("User %s: Failed to serialize entries to JSON for tab ID %s: %s", current_user.id, client_tab_id, e)
        return jsonify({"error": "Invalid data found within entries list."}), 400

    try:
        with get_db_session() as db_session:
            # Check if the user is trying to add a new tab beyond the limit
            # Find existing tab first
            saved_tab = db_session.query(SavedGameTab).filter_by(
                user_id=current_user.id, client_tab_id=client_tab_id
            ).first()

            if saved_tab:
                # Update existing tab
                logger.debug("User %s: Updating existing SavedGameTab (ID: %s) for client_tab_id %s", current_user.id, saved_tab.id, client_tab_id)
                saved_tab.tab_name = tab_name
                saved_tab.entries_json = entries_json_string
                # timestamp updates automatically if using default=lambda...
            else:
                # Create new tab, but check limit first
                current_saved_count = db_session.query(SavedGameTab).filter_by(user_id=current_user.id).count()
                if current_saved_count >= MAX_SAVED_TABS:
                    logger.warning("User %s: Reached max saved tabs limit (%d).", current_user.id, MAX_SAVED_TABS)
                    return jsonify({"error": f"You have reached the maximum number of saved tabs ({MAX_SAVED_TABS})."}), 400

                logger.debug("User %s: Creating new SavedGameTab for client_tab_id %s", current_user.id, client_tab_id)
                saved_tab = SavedGameTab(
                    user_id=current_user.id,
                    client_tab_id=client_tab_id,
                    tab_name=tab_name,
                    entries_json=entries_json_string
                )
                db_session.add(saved_tab)
        # Commit happens automatically

        logger.info("User %s: Successfully saved tab data for client_tab_id %s.", current_user.id, client_tab_id)
        return jsonify({"status": "ok"})

    except Exception as e:
        # get_db_session handles rollback and logs exception details
        logger.error("User %s: Failed to save tab data for client_tab_id %s.", current_user.id, client_tab_id)
        return jsonify({"error": "Failed to save tab due to a server error."}), 500


@tabs_api_bp.route("/load", methods=["GET"])
@login_required # Ensure user is logged in
def load_saved_tabs():
    """API endpoint to load all saved tabs for the current user."""
    logger.debug("User %s: Request received for /api/tabs/load", current_user.id)
    try:
        with get_db_session() as db_session:
            # Query all saved tabs for the logged-in user
            saved_tabs_orm = db_session.query(SavedGameTab).filter_by(user_id=current_user.id).all()

            # Format data for the client, using client_tab_id as the key
            tabs_data = {
                tab.client_tab_id: tab.to_dict() # Use the model's to_dict method
                for tab in saved_tabs_orm
            }
            logger.info(f"User %s: Loaded {len(tabs_data)} saved tabs from database.", current_user.id)
            return jsonify(tabs_data) # Return the dictionary directly
    except Exception as e:
        logger.error("User %s: Failed to load saved tabs from database.", current_user.id)
        return jsonify({"error": "Failed to load saved tabs due to a server error."}), 500


@tabs_api_bp.route("/delete", methods=["POST"])
@login_required # Ensure user is logged in
def delete_tab():
    """API endpoint to delete a specific saved tab for the current user."""
    data = request.get_json()
    if not data or "tabId" not in data:
        logger.warning("User %s: Missing 'tabId' in request to /api/tabs/delete.", current_user.id)
        return jsonify({"error": "Missing required 'tabId' field."}), 400

    client_tab_id = data["tabId"]
    logger.debug("User %s: Request received for /api/tabs/delete for client_tab_id: %s", current_user.id, client_tab_id)

    if client_tab_id == "default":
        logger.warning("User %s: Attempted to delete 'default' tab via API.", current_user.id)
        return jsonify({"error": "The 'default' tab cannot be deleted."}), 400

    try:
        with get_db_session() as db_session:
            # Find the specific tab for the current user and client_tab_id
            tab_to_delete = db_session.query(SavedGameTab).filter_by(
                user_id=current_user.id, client_tab_id=client_tab_id
            ).first()

            if tab_to_delete:
                db_session.delete(tab_to_delete)
                logger.info("User %s: SavedGameTab for client_tab_id %s marked for deletion.", current_user.id, client_tab_id)
                # Commit happens automatically
                return jsonify({"status": "ok"})
            else:
                # Tab not found in DB for this user
                logger.warning("User %s: SavedGameTab for client_tab_id %s not found for deletion.", current_user.id, client_tab_id)
                # Still return success? Or 404? Let's return success as the end state (not present) is achieved.
                # Frontend already deleted locally according to comments in original app.py and games.html inline script
                return jsonify({"status": "ok", "message": "Tab not found in database, already deleted or never saved."})

    except Exception as e:
        logger.error("User %s: Failed to delete tab data for client_tab_id %s.", current_user.id, client_tab_id)
        return jsonify({"error": "Failed to delete tab due to a server error."}), 500