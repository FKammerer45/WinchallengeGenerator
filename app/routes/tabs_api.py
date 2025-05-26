
# app/routes/tabs_api.py
import logging
import json
from flask import Blueprint, request, jsonify, current_app
from flask_login import login_required, current_user

# Import db instance from app
from app import db
# Import necessary models
from app.models import SavedGameTab # Assuming this is your model for saved game tabs
from app.utils.subscription_helpers import get_user_limit # Import for plan limits

# Import the default game tab definitions to identify system default tabs
from app.modules.default_definitions import DEFAULT_GAME_TAB_DEFINITIONS


logger = logging.getLogger(__name__)

# Define the blueprint for game tabs API
tabs_api = Blueprint('tabs_api', __name__, url_prefix='/api/tabs')

# MAX_SAVED_TABS is now dynamic per user plan
MAX_ENTRIES_PER_TAB = 100 # Max entries per any single tab

@tabs_api.route("/save", methods=["POST"])
@login_required
def save_tab():
    """API: Save or update a specific user game tab configuration."""
    data = request.get_json()
    if not data:
        logger.warning("User %s: Received empty data for /api/tabs/save.", current_user.id)
        return jsonify({"error": "No data provided"}), 400

    client_tab_id_from_request = data.get("tabId")
    entries_list_from_client = data.get("entries")
    tab_name_from_client = data.get("tabName")

    if not client_tab_id_from_request:
        logger.warning("User %s: Attempt to save tab with missing client_tab_id", current_user.id)
        return jsonify({"error": "Tab ID (client_tab_id) is required."}), 400

    # Determine the tab name
    effective_tab_name = tab_name_from_client
    if not effective_tab_name: # If client didn't send a name
        # Check if it's a system default being initialized, use its predefined name
        if client_tab_id_from_request in DEFAULT_GAME_TAB_DEFINITIONS:
            effective_tab_name = DEFAULT_GAME_TAB_DEFINITIONS[client_tab_id_from_request].get("name", f"Game Tab {client_tab_id_from_request}")
        else: # Fallback for custom tabs if name somehow missing
            effective_tab_name = f"Unnamed Game Tab {client_tab_id_from_request}"
    
    if not effective_tab_name.strip():
        logger.warning("User %s: Missing or empty tab name for saving tab ID: %s", current_user.id, client_tab_id_from_request)
        return jsonify({"error": "Tab name cannot be empty."}), 400
    
    logger.debug(
        "User %s: Request save tab. client_tab_id=%s, effective_tab_name=%s, entries_count=%s",
        current_user.id, client_tab_id_from_request, effective_tab_name, len(entries_list_from_client) if isinstance(entries_list_from_client, list) else 'N/A'
    )

    if not isinstance(entries_list_from_client, list):
        logger.warning("User %s: Invalid 'entries' format for tab ID: %s", current_user.id, client_tab_id_from_request)
        return jsonify({"error": "'entries' field must be a list."}), 400
    if len(entries_list_from_client) > MAX_ENTRIES_PER_TAB:
        logger.warning("User %s: Exceeded max entries per tab (%s) for tab ID: %s", current_user.id, MAX_ENTRIES_PER_TAB, client_tab_id_from_request)
        return jsonify({"error": f"Cannot save tab with more than {MAX_ENTRIES_PER_TAB} entries."}), 400
    
    try:
        # Basic validation of entries (ensure they are dicts with at least an 'id' and 'game')
        # More thorough validation could be added here if needed.
        validated_entries = []
        for entry in entries_list_from_client:
            if isinstance(entry, dict) and 'id' in entry and 'game' in entry: # JS side uses 'game'
                # Ensure 'id' is present, even if it's a local one from frontend
                entry_id = entry.get('id') or f"servergen-g-{hash(entry['game'])}" # Fallback ID generation
                validated_entries.append({
                    'id': entry_id,
                    'game': str(entry.get('game','')).strip(),
                    'gameMode': str(entry.get('gameMode','')).strip(),
                    'difficulty': str(entry.get('difficulty','1.0')).strip(), # Store as string for consistency
                    'numberOfPlayers': int(entry.get('numberOfPlayers', 1)),
                    'weight': float(entry.get('weight', 1.0)),
                    'tags': entry.get('tags', []) # Add tags, default to empty list
                })
            else:
                logger.warning("User %s: Skipping invalid entry object during save for tab %s: %s", current_user.id, client_tab_id_from_request, entry)
        
        entries_json_string = json.dumps(validated_entries)

    except (TypeError, ValueError) as e: # Catch potential errors during validation/conversion
        logger.error("User %s: Failed to process entries for tab ID %s: %s", current_user.id, client_tab_id_from_request, e)
        return jsonify({"error": "Invalid data found within entries list."}), 400


    try:
        saved_tab = db.session.query(SavedGameTab).filter_by(
            user_id=current_user.id, client_tab_id=client_tab_id_from_request
        ).first()

        if saved_tab: # Updating an existing tab
            logger.debug("User %s: Updating existing SavedGameTab (ID: %s) for client_tab_id %s", current_user.id, saved_tab.id, client_tab_id_from_request)
            saved_tab.tab_name = effective_tab_name.strip()
            saved_tab.entries_json = entries_json_string
        else: # Creating a new tab
            # --- MODIFIED: Check limit ONLY for truly custom tabs ---
            # Get the client_tab_ids of all system default game tabs from the definitions
            system_default_client_ids = [
                details['client_tab_id'] for details in DEFAULT_GAME_TAB_DEFINITIONS.values()
            ]

            # A tab is custom if its client_tab_id_from_request is NOT one of the system default IDs
            is_creating_custom_tab = client_tab_id_from_request not in system_default_client_ids
            
            if is_creating_custom_tab:
                # Count only truly custom tabs already saved by the user in the database
                current_custom_tab_count_in_db = db.session.query(SavedGameTab).filter(
                    SavedGameTab.user_id == current_user.id,
                    ~SavedGameTab.client_tab_id.in_(system_default_client_ids) # Exclude system defaults
                ).count()
                
                user_max_game_tabs = get_user_limit(current_user, 'max_game_tabs')

                if current_custom_tab_count_in_db >= user_max_game_tabs:
                    logger.warning(f"User {current_user.id}: Reached max saved custom game tabs limit ({user_max_game_tabs}). Attempted to create {client_tab_id_from_request}.")
                    return jsonify({"error": f"You have reached the maximum number of custom saved tabs ({user_max_game_tabs})."}), 400
            # --- END MODIFICATION ---

            logger.debug("User %s: Creating new SavedGameTab for client_tab_id %s", current_user.id, client_tab_id_from_request)
            new_tab = SavedGameTab(
                user_id=current_user.id,
                client_tab_id=client_tab_id_from_request,
                tab_name=effective_tab_name.strip(),
                entries_json=entries_json_string
            )
            db.session.add(new_tab)

        db.session.commit()
        logger.info("User %s: Successfully saved tab data for client_tab_id %s.", current_user.id, client_tab_id_from_request)
        
        # Re-fetch to ensure response matches DB state, especially for entries_json
        final_tab_for_response = db.session.query(SavedGameTab).filter_by(
             user_id=current_user.id, client_tab_id=client_tab_id_from_request
        ).first()

        if final_tab_for_response:
             final_entries_list = json.loads(final_tab_for_response.entries_json or '[]')
             return jsonify({"status": "ok", "saved_tab": {
                 "client_tab_id": final_tab_for_response.client_tab_id,
                 "tab_name": final_tab_for_response.tab_name,
                 "entries": final_entries_list 
             }})
        else: # Should not happen if commit was successful
             logger.error("Failed to refetch saved tab after commit for response (client_tab_id: %s).", client_tab_id_from_request)
             return jsonify({"error": "Failed to confirm save operation."}), 500


    except Exception as e:
        db.session.rollback()
        logger.error("User %s: Failed to save tab data for client_tab_id %s.", current_user.id, client_tab_id_from_request, exc_info=True)
        return jsonify({"error": "Failed to save tab due to a server error."}), 500


@tabs_api.route("/load", methods=["GET"])
@login_required
def load_tabs():
    """API: Load all saved game tabs for the current user."""
    logger.debug("User %s: Request received for /api/tabs/load", current_user.id)
    try:
        saved_tabs_orm = db.session.query(SavedGameTab).filter_by(
            user_id=current_user.id
        ).order_by(SavedGameTab.timestamp).all() # Order by timestamp or name if preferred

        tabs_data = {} # Return a dictionary of tab objects, keyed by client_tab_id
        for tab in saved_tabs_orm:
            try:
                 entries_list = json.loads(tab.entries_json or '[]')
            except json.JSONDecodeError:
                 logger.warning(f"User %s: Failed to parse entries JSON for tab {tab.client_tab_id}. Using empty list.", current_user.id)
                 entries_list = []
            
            tabs_data[tab.client_tab_id] = {
                 "client_tab_id": tab.client_tab_id,
                 "tab_name": tab.tab_name,
                 "entries": entries_list,
                 "timestamp": tab.timestamp.isoformat() if tab.timestamp else None
            }
        logger.info(f"User %s: Loaded {len(tabs_data)} saved game tabs.", current_user.id)
        return jsonify(tabs_data)

    except Exception as e:
        db.session.rollback() # Good practice, though less critical for GET
        logger.exception("User %s: Failed to load saved game tabs.", current_user.id)
        return jsonify({"error": "Failed to load saved tabs due to a server error."}), 500


@tabs_api.route("/delete", methods=["POST"])
@login_required
def delete_tab():
    """API: Delete a specific saved game tab for the current user."""
    data = request.get_json()
    if not data or "tabId" not in data:
        logger.warning("User %s: Missing 'tabId' in request to /api/tabs/delete.", current_user.id)
        return jsonify({"error": "Missing required 'tabId' field."}), 400

    client_tab_id_to_delete = data["tabId"]
    logger.debug("User %s: Request delete tab. client_tab_id: %s", current_user.id, client_tab_id_to_delete)

    # Get the client_tab_ids of all system default game tabs
    system_default_client_ids = [
        details['client_tab_id'] for details in DEFAULT_GAME_TAB_DEFINITIONS.values()
    ]

    # Prevent deletion of system default tabs
    if client_tab_id_to_delete in system_default_client_ids:
        logger.warning("User %s: Attempted to delete a system-defined tab ID '%s' via API.", current_user.id, client_tab_id_to_delete)
        return jsonify({"error": "System-defined tabs (like 'All Games', 'Shooters') cannot be deleted."}), 400

    try:
        tab_to_delete = db.session.query(SavedGameTab).filter_by(
            user_id=current_user.id, client_tab_id=client_tab_id_to_delete
        ).first()

        if tab_to_delete:
            tab_name_deleted = tab_to_delete.tab_name
            db.session.delete(tab_to_delete)
            db.session.commit()
            logger.info("User %s: SavedGameTab '%s' (client_tab_id %s) deleted.", current_user.id, tab_name_deleted, client_tab_id_to_delete)
            return jsonify({"status": "ok", "deleted_tab_id": client_tab_id_to_delete})
        else:
            logger.warning("User %s: SavedGameTab for client_tab_id %s not found for deletion.", current_user.id, client_tab_id_to_delete)
            # Still return ok, as the desired state (tab doesn't exist) is achieved
            return jsonify({"status": "ok", "message": "Tab not found (already deleted or never saved).", "deleted_tab_id": client_tab_id_to_delete})

    except Exception as e:
        db.session.rollback()
        logger.error("User %s: Failed to delete tab data for client_tab_id %s.", current_user.id, client_tab_id_to_delete, exc_info=True)
        return jsonify({"error": "Failed to delete tab due to a server error."}), 500
