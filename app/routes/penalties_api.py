# app/routes/penalties_api.py
import logging
import json
from flask import Blueprint, jsonify, current_app, request
from flask_login import login_required, current_user

# Import db instance from app
from app import db 
# Import necessary models
from app.models import Penalty, SavedPenaltyTab 

logger = logging.getLogger(__name__)

# Define the blueprint - RENAME VARIABLE to penalties_api
# Removed url_prefix here, assumes it's set during registration in __init__.py
penalties_api = Blueprint('penalties_api', __name__) 

# Define limits (consider moving these to config if they vary by environment)
MAX_SAVED_PENALTY_TABS = 5
MAX_PENALTIES_PER_TAB = 100

# Update decorator to use the new blueprint name
@penalties_api.route("/load_defaults", methods=["GET"]) 
def load_default_penalties():
    """
    API endpoint to load all penalties currently stored in the database's
    'penalties' table.
    """
    logger.debug("Request received for /api/penalties/load_defaults")
    try:
        # Use db.session directly
        penalties_orm = db.session.query(Penalty).order_by(Penalty.name).all()
        penalties_dict = [penalty.to_dict() for penalty in penalties_orm]

        if not penalties_orm:
            logger.info("No penalties found in the database table.")
        else:
            logger.info(f"Loaded {len(penalties_dict)} penalties from database.")

        return jsonify({"penalties": penalties_dict})

    except Exception as e:
        db.session.rollback() # Rollback on error
        logger.exception("Error loading penalties from database:")
        return jsonify({"error": "Failed to load penalties due to a server error."}), 500

# --- Implemented Tab Endpoints ---

# Update decorator to use the new blueprint name
@penalties_api.route("/save_tab", methods=["POST"]) 
@login_required
def save_penalty_tab():
    """API: Save or update a specific user penalty tab configuration."""
    data = request.get_json()
    if not data:
        logger.warning("User %s: Received empty data for /api/penalties/save_tab.", current_user.id)
        return jsonify({"error": "No data provided"}), 400

    client_tab_id = data.get("tabId")
    tab_name = data.get("tabName")
    penalties = data.get("penalties") # Expect list of penalty objects

    logger.debug(
        "User %s: Request save penalty tab. client_tab_id=%s, tab_name=%s, penalties_count=%s",
        current_user.id, client_tab_id, tab_name, len(penalties) if isinstance(penalties, list) else 'N/A'
    )

    # --- Validation ---
    if not client_tab_id or client_tab_id == "default":
        logger.warning("User %s: Attempt save invalid penalty tab ID: %s", current_user.id, client_tab_id)
        return jsonify({"error": "Invalid tab ID provided. Cannot save 'default'."}), 400
    if not tab_name or not tab_name.strip():
        logger.warning("User %s: Missing or empty tab name for penalty tab ID: %s", current_user.id, client_tab_id)
        return jsonify({"error": "Tab name cannot be empty."}), 400
    if not isinstance(penalties, list):
        logger.warning("User %s: Invalid 'penalties' format for tab ID: %s", current_user.id, client_tab_id)
        return jsonify({"error": "'penalties' field must be a list."}), 400
    if len(penalties) > MAX_PENALTIES_PER_TAB:
        logger.warning("User %s: Exceeded max penalties per tab (%d) for tab ID: %s", current_user.id, MAX_PENALTIES_PER_TAB, client_tab_id)
        return jsonify({"error": f"Cannot save tab with more than {MAX_PENALTIES_PER_TAB} penalties."}), 400

    try:
        penalties_json_string = json.dumps(penalties)
    except TypeError as e:
        logger.error("User %s: Failed to serialize penalties to JSON for tab ID %s: %s", current_user.id, client_tab_id, e)
        return jsonify({"error": "Invalid data found within penalties list."}), 400

    # --- Database Interaction ---
    try:
        # Use db.session directly
        saved_tab = db.session.query(SavedPenaltyTab).filter_by(
            user_id=current_user.id, client_tab_id=client_tab_id
        ).first()

        if saved_tab:
            # Update existing tab
            logger.debug("User %s: Updating existing SavedPenaltyTab (ID: %s) for client_tab_id %s", current_user.id, saved_tab.id, client_tab_id)
            saved_tab.tab_name = tab_name.strip()
            saved_tab.penalties_json = penalties_json_string
            # timestamp should auto-update if model default is lambda
        else:
            # Create new tab, check limit first
            current_saved_count = db.session.query(SavedPenaltyTab).filter_by(user_id=current_user.id).count()
            if current_saved_count >= MAX_SAVED_PENALTY_TABS:
                logger.warning("User %s: Reached max saved penalty tabs limit (%d).", current_user.id, MAX_SAVED_PENALTY_TABS)
                return jsonify({"error": f"You have reached the maximum number of saved penalty tabs ({MAX_SAVED_PENALTY_TABS})."}), 400

            logger.debug("User %s: Creating new SavedPenaltyTab for client_tab_id %s", current_user.id, client_tab_id)
            new_tab = SavedPenaltyTab( # Renamed variable to avoid confusion
                user_id=current_user.id,
                client_tab_id=client_tab_id,
                tab_name=tab_name.strip(),
                penalties_json=penalties_json_string
            )
            db.session.add(new_tab)
        
        # Commit the changes (add or update)
        db.session.commit() 

        logger.info("User %s: Successfully saved penalty tab data for client_tab_id %s.", current_user.id, client_tab_id)
        return jsonify({"status": "ok"})

    except Exception as e:
        db.session.rollback() # Rollback on any exception during DB interaction
        logger.error("User %s: Failed to save penalty tab data for client_tab_id %s.", current_user.id, client_tab_id, exc_info=True)
        return jsonify({"error": "Failed to save penalty tab due to a server error."}), 500

# Update decorator to use the new blueprint name
@penalties_api.route("/load_tabs", methods=["GET"]) 
@login_required
def load_saved_penalty_tabs():
    """API: Load all saved penalty tabs for the current user."""
    logger.debug("User %s: Request received for /api/penalties/load_tabs", current_user.id)
    try:
        # Use db.session directly
        saved_tabs_orm = db.session.query(SavedPenaltyTab).filter_by(user_id=current_user.id).all()
        # Format using model's to_dict, keyed by client_tab_id
        tabs_data = { tab.client_tab_id: tab.to_dict() for tab in saved_tabs_orm }

        logger.info(f"User %s: Loaded {len(tabs_data)} saved penalty tabs.", current_user.id)
        return jsonify(tabs_data) # Return dict directly
        
    except Exception as e:
        db.session.rollback() # Rollback on error
        logger.exception("User %s: Failed to load saved penalty tabs.", current_user.id)
        return jsonify({"error": "Failed to load saved penalty tabs due to a server error."}), 500

# Update decorator to use the new blueprint name
@penalties_api.route("/delete_tab", methods=["POST"]) 
@login_required
def delete_saved_penalty_tab():
    """API: Delete a specific saved penalty tab for the current user."""
    data = request.get_json()
    if not data or "tabId" not in data:
        logger.warning("User %s: Missing 'tabId' in request to /api/penalties/delete_tab.", current_user.id)
        return jsonify({"error": "Missing required 'tabId' field."}), 400

    client_tab_id = data["tabId"]
    logger.debug("User %s: Request delete penalty tab. client_tab_id: %s", current_user.id, client_tab_id)

    if client_tab_id == "default": # Default tab cannot be deleted server-side
        logger.warning("User %s: Attempted to delete 'default' penalty tab via API.", current_user.id)
        return jsonify({"error": "The 'default' penalty tab cannot be deleted."}), 400

    try:
        # Use db.session directly
        tab_to_delete = db.session.query(SavedPenaltyTab).filter_by(
            user_id=current_user.id, client_tab_id=client_tab_id
        ).first()

        if tab_to_delete:
            db.session.delete(tab_to_delete)
            db.session.commit() # Commit the deletion
            logger.info("User %s: SavedPenaltyTab for client_tab_id %s deleted.", current_user.id, client_tab_id)
            return jsonify({"status": "ok"})
        else:
            logger.warning("User %s: SavedPenaltyTab for client_tab_id %s not found for deletion.", current_user.id, client_tab_id)
            # Return success even if not found, as the desired state (not existing) is achieved
            return jsonify({"status": "ok", "message": "Penalty tab not found (already deleted or never saved)."})

    except Exception as e:
        db.session.rollback() # Rollback on error during delete/commit
        logger.error("User %s: Failed to delete penalty tab data for client_tab_id %s.", current_user.id, client_tab_id, exc_info=True)
        return jsonify({"error": "Failed to delete penalty tab due to a server error."}), 500

