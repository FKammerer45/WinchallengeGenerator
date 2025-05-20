# app/routes/penalties_api.py
import logging
import json
from flask import Blueprint, jsonify, current_app, request
from flask_login import login_required, current_user

# Import db instance from app
from app import db 
# Import necessary models
from app.models import Penalty, SavedPenaltyTab 
from app.utils.subscription_helpers import get_user_limit # Import for plan limits

# Import the new default penalty tab definitions
from app.modules.default_definitions import DEFAULT_PENALTY_TAB_DEFINITIONS

logger = logging.getLogger(__name__)

# Define the blueprint
penalties_api = Blueprint('penalties_api', __name__, url_prefix='/api/penalties') 

# MAX_SAVED_PENALTY_TABS is now dynamic per user plan
MAX_PENALTIES_PER_TAB = 100

@penalties_api.route("/default_definitions", methods=["GET"])
def get_default_penalty_tab_definitions():
    """
    API endpoint to load the predefined default penalty tab structures and their entries.
    These are used to initialize tabs for new users or for users to reference.
    """
    logger.info("Request received for /api/penalties/default_definitions")
    try:
        # Directly return the imported dictionary.
        if not DEFAULT_PENALTY_TAB_DEFINITIONS or not isinstance(DEFAULT_PENALTY_TAB_DEFINITIONS, dict):
            logger.error("DEFAULT_PENALTY_TAB_DEFINITIONS is not defined or not a dictionary.")
            return jsonify({"error": "Default penalty tab definitions are currently unavailable."}), 500
            
        logger.info("Serving %s default penalty tab definitions.", len(DEFAULT_PENALTY_TAB_DEFINITIONS))
        return jsonify(DEFAULT_PENALTY_TAB_DEFINITIONS)
        
    except Exception as e:
        logger.exception("Failed to serve default penalty tab definitions.")
        return jsonify({"error": "Failed to load default penalty tab definitions due to a server error."}), 500

@penalties_api.route("/load_defaults", methods=["GET"]) 
def load_default_penalties():
    """
    API endpoint to load all penalties currently stored in the Penalty database table.
    This represents the master list of all possible penalty entries.
    """
    logger.debug("Request received for /api/penalties/load_defaults (master list)")
    try:
        penalties_orm = db.session.query(Penalty).order_by(Penalty.name).all()
        penalties_dict = [penalty.to_dict() for penalty in penalties_orm]

        if not penalties_orm:
            logger.info("No master penalties found in the database table.")
        else:
            logger.info("Loaded %s master penalties from database.", len(penalties_dict))

        return jsonify({"penalties": penalties_dict})

    except Exception as e:
        db.session.rollback()
        logger.exception("Error loading master penalties from database:")
        return jsonify({"error": "Failed to load master penalties due to a server error."}), 500

# --- User-Specific SavedPenaltyTab Endpoints ---

@penalties_api.route("/save_tab", methods=["POST"])
@login_required
def save_penalty_tab():
    """API: Save or update a specific user penalty tab configuration."""
    data = request.get_json()
    if not data:
        logger.warning("User %s: Received empty data for /api/penalties/save_tab.", current_user.id)
        return jsonify({"error": "No data provided"}), 400

    client_tab_id = data.get("tabId") # e.g., "default-all-penalties", "penaltyPane-123"
    penalties_list_from_client = data.get("penalties")
    tab_name_from_client = data.get("tabName")

    if not client_tab_id:
        logger.warning("User %s: Attempt to save penalty tab with missing client_tab_id", current_user.id)
        return jsonify({"error": "Tab ID (client_tab_id) is required."}), 400

    # Determine the tab name: use provided, or derive from definitions for system defaults, or fallback
    effective_tab_name = tab_name_from_client
    if not effective_tab_name:
        if client_tab_id in DEFAULT_PENALTY_TAB_DEFINITIONS:
            effective_tab_name = DEFAULT_PENALTY_TAB_DEFINITIONS[client_tab_id].get("name", f"Penalty Tab {client_tab_id}")
        else:
            effective_tab_name = f"Unnamed Penalty Tab {client_tab_id}"
    
    if not effective_tab_name.strip(): # Final check for empty name
        logger.warning("User %s: Missing or empty penalty tab name for saving tab ID: %s", current_user.id, client_tab_id)
        return jsonify({"error": "Tab name cannot be empty."}), 400

    logger.debug(
        "User %s: Request save penalty tab. client_tab_id=%s, effective_tab_name=%s, penalties_count=%s",
        current_user.id, client_tab_id, effective_tab_name, len(penalties_list_from_client) if isinstance(penalties_list_from_client, list) else 'N/A'
    )

    if not isinstance(penalties_list_from_client, list):
        logger.warning("User %s: Invalid 'penalties' format for tab ID: %s", current_user.id, client_tab_id)
        return jsonify({"error": "'penalties' field must be a list."}), 400
    if len(penalties_list_from_client) > MAX_PENALTIES_PER_TAB: # Check against max penalties
        logger.warning("User %s: Exceeded max penalties per tab (%s) for tab ID: %s", current_user.id, MAX_PENALTIES_PER_TAB, client_tab_id)
        return jsonify({"error": f"Cannot save tab with more than {MAX_PENALTIES_PER_TAB} penalties."}), 400

    try:
        validated_penalties = []
        for p in penalties_list_from_client:
            if isinstance(p, dict) and 'name' in p and 'probability' in p: # 'id' is not strictly required from client for saving
                try:
                    # Ensure 'id' is present for consistency, even if it's a new local one
                    # The frontend should generate this for new local entries.
                    # For entries derived from DB master list, it might be `db-p-ID`.
                    penalty_id = p.get('id') or f"local-p-{hash(p['name'])}" # Fallback ID generation
                    
                    validated_penalties.append({
                        'id': penalty_id,
                        'name': str(p['name']).strip(),
                        'probability': float(p['probability']),
                        'description': str(p.get('description', '')).strip()
                    })
                except (ValueError, TypeError) as conv_err:
                     logger.warning("Skipping penalty due to conversion error: %s, Error: %s", p, conv_err)
                     continue
            else:
                 logger.warning("Skipping invalid penalty object during save: %s", p)
        
        penalties_json_string = json.dumps(validated_penalties)

    except TypeError as e:
        logger.error("User %s: Failed to serialize penalties to JSON for tab ID %s: %s", current_user.id, client_tab_id, e)
        return jsonify({"error": "Invalid data found within penalties list."}), 400

    try:
        saved_tab = db.session.query(SavedPenaltyTab).filter_by(
            user_id=current_user.id, client_tab_id=client_tab_id
        ).first()

        if saved_tab:
            logger.debug("User %s: Updating existing SavedPenaltyTab (ID: %s) for client_tab_id %s", current_user.id, saved_tab.id, client_tab_id)
            saved_tab.tab_name = effective_tab_name.strip()
            saved_tab.penalties_json = penalties_json_string
        else:
            # Check limit ONLY if it's NOT one of the system default IDs being initialized
            # System default IDs (like "default-all-penalties") should always be creatable on first setup.
            is_system_default_init = client_tab_id in DEFAULT_PENALTY_TAB_DEFINITIONS 
            
            if not is_system_default_init: # This is a new *custom* tab being created by the user
                current_custom_tab_count = db.session.query(SavedPenaltyTab).filter(
                    SavedPenaltyTab.user_id == current_user.id,
                    ~SavedPenaltyTab.client_tab_id.in_(DEFAULT_PENALTY_TAB_DEFINITIONS.keys()) # Exclude system default IDs from count
                ).count()
                
                user_max_penalty_tabs = get_user_limit(current_user, 'max_penalty_tabs')

                if current_custom_tab_count >= user_max_penalty_tabs:
                    logger.warning("User %s: Reached max saved custom penalty tabs limit (%d).", current_user.id, user_max_penalty_tabs)
                    return jsonify({"error": f"Max custom penalty tabs limit ({user_max_penalty_tabs}) reached."}), 400

            logger.debug("User %s: Creating new SavedPenaltyTab for client_tab_id %s", current_user.id, client_tab_id)
            new_tab = SavedPenaltyTab(
                user_id=current_user.id,
                client_tab_id=client_tab_id,
                tab_name=effective_tab_name.strip(),
                penalties_json=penalties_json_string
            )
            db.session.add(new_tab)

        db.session.commit()
        logger.info("User %s: Successfully saved penalty tab data for client_tab_id %s.", current_user.id, client_tab_id)
        
        # Re-fetch to ensure response matches DB state, especially for penalties_json
        final_tab_for_response = db.session.query(SavedPenaltyTab).filter_by(
             user_id=current_user.id, client_tab_id=client_tab_id
        ).first()

        if final_tab_for_response:
             final_penalties_list = json.loads(final_tab_for_response.penalties_json or '[]')
             return jsonify({"status": "ok", "saved_tab": {
                 "client_tab_id": final_tab_for_response.client_tab_id,
                 "tab_name": final_tab_for_response.tab_name,
                 "penalties": final_penalties_list 
             }})
        else:
             logger.error("Failed to refetch saved penalty tab after commit for response (client_tab_id: %s).", client_tab_id)
             return jsonify({"error": "Failed to confirm save operation."}), 500

    except Exception as e:
        db.session.rollback()
        logger.error("User %s: Failed to save penalty tab data for client_tab_id %s.", current_user.id, client_tab_id, exc_info=True)
        return jsonify({"error": "Failed to save penalty tab due to a server error."}), 500


@penalties_api.route("/load_tabs", methods=["GET"])
@login_required
def load_saved_penalty_tabs():
    """API: Load all saved penalty tabs for the current user."""
    logger.debug("User %s: Request received for /api/penalties/load_tabs", current_user.id)
    try:
        saved_tabs_orm = db.session.query(SavedPenaltyTab).filter_by(
            user_id=current_user.id
        ).order_by(SavedPenaltyTab.timestamp).all()

        tabs_data = {} # This will be a dictionary of tab objects, keyed by client_tab_id
        for tab in saved_tabs_orm:
            try:
                 penalties_list = json.loads(tab.penalties_json or '[]')
            except json.JSONDecodeError:
                 logger.warning(f"User %s: Failed to parse penalties JSON for tab {tab.client_tab_id}. Using empty list.", current_user.id)
                 penalties_list = []
            
            tabs_data[tab.client_tab_id] = {
                 "client_tab_id": tab.client_tab_id, # Redundant but fine for client
                 "tab_name": tab.tab_name,
                 "penalties": penalties_list, 
                 "timestamp": tab.timestamp.isoformat() if tab.timestamp else None
            }
        logger.info(f"User %s: Loaded {len(tabs_data)} saved penalty tabs.", current_user.id)
        return jsonify(tabs_data) 

    except Exception as e:
        db.session.rollback()
        logger.exception("User %s: Failed to load saved penalty tabs.", current_user.id)
        return jsonify({"error": "Failed to load saved penalty tabs due to a server error."}), 500


@penalties_api.route("/delete_tab", methods=["POST"]) 
@login_required
def delete_saved_penalty_tab():
    """API: Delete a specific saved penalty tab for the current user."""
    data = request.get_json()
    if not data or "tabId" not in data:
        logger.warning("User %s: Missing 'tabId' in request to /api/penalties/delete_tab.", current_user.id)
        return jsonify({"error": "Missing required 'tabId' field."}), 400

    client_tab_id_to_delete = data["tabId"]
    logger.debug("User %s: Request delete penalty tab. client_tab_id: %s", current_user.id, client_tab_id_to_delete)

    # Prevent deletion of system default tabs if they were ever saved this way
    # (though they should be re-creatable by frontend if missing for a user)
    if client_tab_id_to_delete in DEFAULT_PENALTY_TAB_DEFINITIONS:
        logger.warning("User %s: Attempted to delete a system-defined penalty tab ID '%s' via API.", current_user.id, client_tab_id_to_delete)
        return jsonify({"error": "System-defined penalty tabs cannot be deleted this way."}), 400

    try:
        tab_to_delete = db.session.query(SavedPenaltyTab).filter_by(
            user_id=current_user.id, client_tab_id=client_tab_id_to_delete
        ).first()

        if tab_to_delete:
            tab_name_deleted = tab_to_delete.tab_name
            db.session.delete(tab_to_delete)
            db.session.commit()
            logger.info("User %s: SavedPenaltyTab '%s' (client_tab_id %s) deleted.", current_user.id, tab_name_deleted, client_tab_id_to_delete)
            return jsonify({"status": "ok", "deleted_tab_id": client_tab_id_to_delete})
        else:
            logger.warning("User %s: SavedPenaltyTab for client_tab_id %s not found for deletion.", current_user.id, client_tab_id_to_delete)
            return jsonify({"status": "ok", "message": "Penalty tab not found (already deleted or never saved).", "deleted_tab_id": client_tab_id_to_delete})

    except Exception as e:
        db.session.rollback()
        logger.error("User %s: Failed to delete penalty tab data for client_tab_id %s.", current_user.id, client_tab_id_to_delete, exc_info=True)
        return jsonify({"error": "Failed to delete penalty tab due to a server error."}), 500
