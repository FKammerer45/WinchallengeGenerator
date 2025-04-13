# app/routes/tabs_api.py
import logging
import json
from flask import Blueprint, request, jsonify, current_app
from flask_login import current_user, login_required
# Import db instance from app
from app import db 
# Import necessary models
from app.models import SavedGameTab

logger = logging.getLogger(__name__)

# Define the blueprint - RENAME VARIABLE to tabs_api
# Using url_prefix here as defined in original file
tabs_api = Blueprint('tabs_api', __name__, url_prefix='/api/tabs') 

# Define constants (consider moving to config)
MAX_SAVED_TABS = 5

# Update decorator to use the new blueprint name
@tabs_api.route("/save", methods=["POST"]) 
@login_required # Ensure user is logged in
def save_tab():
    """API endpoint to save or update a specific user game tab configuration."""
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

    # --- Validation ---
    if not client_tab_id or client_tab_id == "default":
        logger.warning("User %s: Attempt to save invalid tab ID: %s", current_user.id, client_tab_id)
        return jsonify({"error": "Invalid tab ID provided. Cannot save 'default'."}), 400
    if not tab_name or not tab_name.strip(): # Check for empty or whitespace-only names
        logger.warning("User %s: Missing or empty tab name for saving tab ID: %s", current_user.id, client_tab_id)
        return jsonify({"error": "Tab name cannot be empty."}), 400
    if not isinstance(entries, list):
        logger.warning("User %s: Invalid 'entries' format for tab ID: %s", current_user.id, client_tab_id)
        return jsonify({"error": "'entries' field must be a list."}), 400
    # Optional: Add validation for max number of entries per tab if needed

    try:
        # Serialize entries list to JSON string for database storage
        entries_json_string = json.dumps(entries)
    except TypeError as e:
        logger.error("User %s: Failed to serialize entries to JSON for tab ID %s: %s", current_user.id, client_tab_id, e)
        return jsonify({"error": "Invalid data found within entries list."}), 400

    # --- Database Interaction ---
    try:
        # Use db.session directly
        saved_tab = db.session.query(SavedGameTab).filter_by(
            user_id=current_user.id, client_tab_id=client_tab_id
        ).first()

        if saved_tab:
            # Update existing tab
            logger.debug("User %s: Updating existing SavedGameTab (ID: %s) for client_tab_id %s", current_user.id, saved_tab.id, client_tab_id)
            saved_tab.tab_name = tab_name.strip() # Save stripped name
            saved_tab.entries_json = entries_json_string
            # timestamp updates automatically if using default=lambda...
        else:
            # Create new tab, but check limit first
            current_saved_count = db.session.query(SavedGameTab).filter_by(user_id=current_user.id).count()
            if current_saved_count >= MAX_SAVED_TABS:
                logger.warning("User %s: Reached max saved tabs limit (%d).", current_user.id, MAX_SAVED_TABS)
                return jsonify({"error": f"You have reached the maximum number of saved tabs ({MAX_SAVED_TABS})."}), 400

            logger.debug("User %s: Creating new SavedGameTab for client_tab_id %s", current_user.id, client_tab_id)
            new_tab = SavedGameTab( # Use different variable name
                user_id=current_user.id,
                client_tab_id=client_tab_id,
                tab_name=tab_name.strip(), # Save stripped name
                entries_json=entries_json_string
            )
            db.session.add(new_tab)
        
        # Commit the changes (add or update)
        db.session.commit() 

        logger.info("User %s: Successfully saved tab data for client_tab_id %s.", current_user.id, client_tab_id)
        return jsonify({"status": "ok"})

    except Exception as e:
        db.session.rollback() # Rollback on any exception during DB interaction
        # Log the exception with traceback
        logger.error("User %s: Failed to save tab data for client_tab_id %s.", current_user.id, client_tab_id, exc_info=True) 
        return jsonify({"error": "Failed to save tab due to a server error."}), 500

# Update decorator to use the new blueprint name
@tabs_api.route("/load", methods=["GET"]) 
@login_required # Ensure user is logged in
def load_saved_tabs():
    """API endpoint to load all saved game tabs for the current user."""
    logger.debug("User %s: Request received for /api/tabs/load", current_user.id)
    try:
        # Use db.session directly
        saved_tabs_orm = db.session.query(SavedGameTab).filter_by(user_id=current_user.id).all()

        # Format data for the client, using client_tab_id as the key
        tabs_data = {
            tab.client_tab_id: tab.to_dict() # Use the model's to_dict method
            for tab in saved_tabs_orm
        }
        logger.info(f"User %s: Loaded {len(tabs_data)} saved tabs from database.", current_user.id)
        return jsonify(tabs_data) # Return the dictionary directly
        
    except Exception as e:
        db.session.rollback() # Rollback on error
        logger.exception("User %s: Failed to load saved tabs from database.", current_user.id)
        return jsonify({"error": "Failed to load saved tabs due to a server error."}), 500

# Update decorator to use the new blueprint name
@tabs_api.route("/delete", methods=["POST"]) 
@login_required # Ensure user is logged in
def delete_tab():
    """API endpoint to delete a specific saved game tab for the current user."""
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
        # Use db.session directly
        tab_to_delete = db.session.query(SavedGameTab).filter_by(
            user_id=current_user.id, client_tab_id=client_tab_id
        ).first()

        if tab_to_delete:
            db.session.delete(tab_to_delete)
            db.session.commit() # Commit the deletion
            logger.info("User %s: SavedGameTab for client_tab_id %s deleted.", current_user.id, client_tab_id)
            return jsonify({"status": "ok"})
        else:
            # Tab not found in DB for this user
            logger.warning("User %s: SavedGameTab for client_tab_id %s not found for deletion.", current_user.id, client_tab_id)
            # Still return success as the end state (not present) is achieved.
            return jsonify({"status": "ok", "message": "Tab not found (already deleted or never saved)."})

    except Exception as e:
        db.session.rollback() # Rollback on error during delete/commit
        logger.error("User %s: Failed to delete tab data for client_tab_id %s.", current_user.id, client_tab_id, exc_info=True)
        return jsonify({"error": "Failed to delete tab due to a server error."}), 500
