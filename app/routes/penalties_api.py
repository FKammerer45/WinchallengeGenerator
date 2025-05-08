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
    penalties = data.get("penalties") # Expect list of penalty objects

    # --- Validation for 'default' tab ---
    # Allow 'default', but reject None or empty strings
    if not client_tab_id:
        logger.warning("User %s: Attempt to save penalty tab with missing ID", current_user.id)
        return jsonify({"error": "Tab ID is required."}), 400

    # Default name for 'default' tab, require name otherwise
    tab_name = data.get("tabName", "Default" if client_tab_id == "default" else "Unnamed Tab")
    if client_tab_id != "default" and (not tab_name or not tab_name.strip()):
         logger.warning("User %s: Missing or empty penalty tab name for saving tab ID: %s", current_user.id, client_tab_id)
         return jsonify({"error": "Tab name cannot be empty for non-default penalty tabs."}), 400
    # Ensure the effective name for 'default' is always 'Default' when saving
    if client_tab_id == "default":
        tab_name = "Default"
    # --- End 'default' tab validation ---

    logger.debug(
        "User %s: Request save penalty tab. client_tab_id=%s, tab_name=%s, penalties_count=%s",
        current_user.id, client_tab_id, tab_name, len(penalties) if isinstance(penalties, list) else 'N/A'
    )

    # --- Rest of Validation ---
    if not isinstance(penalties, list):
        logger.warning("User %s: Invalid 'penalties' format for tab ID: %s", current_user.id, client_tab_id)
        return jsonify({"error": "'penalties' field must be a list."}), 400
    if len(penalties) > MAX_PENALTIES_PER_TAB:
        logger.warning("User %s: Exceeded max penalties per tab (%d) for tab ID: %s", current_user.id, MAX_PENALTIES_PER_TAB, client_tab_id)
        return jsonify({"error": f"Cannot save tab with more than {MAX_PENALTIES_PER_TAB} penalties."}), 400

    try:
        # --- Ensure penalty objects have expected keys (simple validation) ---
        validated_penalties = []
        for p in penalties:
            if isinstance(p, dict) and 'name' in p and 'probability' in p and 'id' in p:
                try:
                    validated_penalties.append({
                        'id': p['id'], # Keep original ID type from frontend
                        'name': str(p['name']),
                        'probability': float(p['probability']),
                        'description': str(p.get('description', ''))
                    })
                except (ValueError, TypeError) as conv_err:
                     logger.warning(f"Skipping penalty due to conversion error: {p}, Error: {conv_err}")
                     continue # Skip this invalid penalty
            else:
                 logger.warning(f"Skipping invalid penalty object during save: {p}")
        # --- Use the validated list ---
        penalties_json_string = json.dumps(validated_penalties)
        # We will re-parse from DB for the response later
        # --- End validation ---
    except TypeError as e:
        logger.error("User %s: Failed to serialize penalties to JSON for tab ID %s: %s", current_user.id, client_tab_id, e)
        return jsonify({"error": "Invalid data found within penalties list."}), 400

    # --- Database Interaction ---
    try:
        saved_tab = db.session.query(SavedPenaltyTab).filter_by(
            user_id=current_user.id, client_tab_id=client_tab_id
        ).first()

        if saved_tab:
            # Update existing tab
            logger.debug("Updating SavedPenaltyTab (ID: %s) for client_tab_id %s", saved_tab.id, client_tab_id)
            saved_tab.tab_name = tab_name.strip()
            saved_tab.penalties_json = penalties_json_string
        else:
            # Create new tab (check limit only if NOT default)
            if client_tab_id != "default":
                current_saved_count = db.session.query(SavedPenaltyTab).filter(
                    SavedPenaltyTab.user_id == current_user.id,
                    SavedPenaltyTab.client_tab_id != "default"
                ).count()
                if current_saved_count >= MAX_SAVED_PENALTY_TABS:
                    logger.warning("User %s: Reached max saved penalty tabs limit (%d).", current_user.id, MAX_SAVED_PENALTY_TABS)
                    return jsonify({"error": f"Max penalty tabs limit ({MAX_SAVED_PENALTY_TABS}) reached."}), 400

            logger.debug("Creating new SavedPenaltyTab for client_tab_id %s", current_user.id, client_tab_id)
            new_tab = SavedPenaltyTab(
                user_id=current_user.id,
                client_tab_id=client_tab_id,
                tab_name=tab_name.strip(),
                penalties_json=penalties_json_string
            )
            db.session.add(new_tab)

        db.session.commit() # Commit the change

        logger.info("Successfully saved penalty tab data for client_tab_id %s.", current_user.id, client_tab_id)

        # --- Re-fetch the saved object to ensure response matches DB state ---
        saved_tab_for_response = db.session.query(SavedPenaltyTab).filter_by(
             user_id=current_user.id, client_tab_id=client_tab_id
        ).first()

        if saved_tab_for_response:
             try:
                 # Parse the JSON from the DB *after* commit
                 final_penalties_list = json.loads(saved_tab_for_response.penalties_json or '[]')
             except json.JSONDecodeError:
                 logger.error(f"Failed to decode penalties_json after fetching saved tab {saved_tab_for_response.id}")
                 final_penalties_list = [] # Fallback to empty list

             return jsonify({"status": "ok", "saved_tab": {
                 "client_tab_id": saved_tab_for_response.client_tab_id,
                 "tab_name": saved_tab_for_response.tab_name,
                 "penalties": final_penalties_list # Return the ACTUAL saved list
             }})
        else:
             # This case indicates a potential issue with the commit or query logic
             logger.error("Failed to refetch saved tab after commit for response (client_tab_id: %s).", client_tab_id)
             # Return error if refetch fails
             return jsonify({"error": "Failed to confirm save operation."}), 500
        # --- End Re-fetch logic ---

    except Exception as e:
        db.session.rollback()
        logger.error("Failed to save penalty tab data for client_tab_id %s.", current_user.id, client_tab_id, exc_info=True)
        return jsonify({"error": "Failed to save penalty tab due to a server error."}), 500



@penalties_api.route("/load_tabs", methods=["GET"])
@login_required
def load_saved_penalty_tabs():
    """API: Load all saved penalty tabs for the current user."""
    logger.debug("User %s: Request received for /api/penalties/load_tabs", current_user.id)
    try:
        # Fetch all saved tabs for the user
        saved_tabs_orm = db.session.query(SavedPenaltyTab).filter_by(
            user_id=current_user.id
        ).order_by(SavedPenaltyTab.timestamp).all() # Optional order

        tabs_data = {}
        for tab in saved_tabs_orm:
           
            try:
                 # Parse the JSON string stored in the database
                 penalties_list = json.loads(tab.penalties_json or '[]')
            except json.JSONDecodeError:
                 logger.warning(f"User %s: Failed to parse penalties JSON for tab {tab.client_tab_id}. Using empty list.", current_user.id)
                 penalties_list = []

            # Construct the dictionary for this tab using the PARSED list
            tabs_data[tab.client_tab_id] = {
                 "client_tab_id": tab.client_tab_id,
                 "tab_name": tab.tab_name,
                 "penalties": penalties_list, # <<< Use the parsed list with key "penalties"
                 "timestamp": tab.timestamp.isoformat() if tab.timestamp else None
                 # Removed "penalties_json": tab.penalties_json # Don't send the raw string
            }
           

        logger.info(f"User %s: Loaded {len(tabs_data)} saved penalty tabs.", current_user.id)
        return jsonify(tabs_data) # Return the dictionary containing parsed lists

    except Exception as e:
        db.session.rollback()
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

