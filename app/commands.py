# app/commands.py
import click
import logging
import datetime # Added for datetime operations
from flask.cli import with_appcontext

# Import db instance and models from your app package
from . import db
from .models import GameEntry, Penalty, User # Added User for generate-key

# Import the new default definitions
from .modules.default_definitions import DEFAULT_GAME_TAB_DEFINITIONS, DEFAULT_PENALTY_TAB_DEFINITIONS

# Setup logger for this module
logger = logging.getLogger(__name__)

# --- Default Data Definitions are now in app/modules/default_definitions.py ---
# The old DEFAULT_GAMES and DEFAULT_PENALTIES lists are removed from here.

@click.command("seed-db")
@with_appcontext # Ensures the command runs within the Flask application context
def seed_db_command():
    """Populates the GameEntry and Penalty tables with unique entries from default_definitions."""
    logger.info("Seeding database with entries from default_definitions.py...")

    try:
        # --- Seed GameEntry Table ---
        # Consolidate all unique game entries from DEFAULT_GAME_TAB_DEFINITIONS
        all_defined_game_entries = {} # Use a dict to ensure uniqueness by (Spiel, Spielmodus)
        for tab_key, tab_data in DEFAULT_GAME_TAB_DEFINITIONS.items():
            for entry in tab_data.get("entries", []):
                # Create a unique key for the dictionary
                game_identifier = (entry.get('Spiel'), entry.get('Spielmodus'))
                if None not in game_identifier and game_identifier not in all_defined_game_entries:
                    # Store the first occurrence of this game/mode combination
                    all_defined_game_entries[game_identifier] = {
                        'Spiel': entry.get('Spiel'),
                        'Spielmodus': entry.get('Spielmodus'),
                        'Schwierigkeit': entry.get('Schwierigkeit', 1.0), # Default if missing
                        'Spieleranzahl': entry.get('Spieleranzahl', 1)    # Default if missing
                    }
        
        existing_db_games = { 
            (g.Spiel, g.Spielmodus) for g in db.session.query(GameEntry.Spiel, GameEntry.Spielmodus).all() 
        }
        
        games_to_add_to_db = []
        for game_identifier, game_data in all_defined_game_entries.items():
            if game_identifier not in existing_db_games:
                games_to_add_to_db.append(GameEntry(**game_data))
                existing_db_games.add(game_identifier) # Add to set to prevent duplicates within this run

        if games_to_add_to_db:
            db.session.add_all(games_to_add_to_db)
            logger.info(f"Adding {len(games_to_add_to_db)} new unique game entries to GameEntry table.")
        else:
            logger.info("No new unique game entries to add to GameEntry table from definitions.")

        # --- Seed Penalty Table ---
        # Consolidate all unique penalty entries from DEFAULT_PENALTY_TAB_DEFINITIONS
        all_defined_penalty_entries = {} # Use a dict to ensure uniqueness by name
        for tab_key, tab_data in DEFAULT_PENALTY_TAB_DEFINITIONS.items():
            for entry in tab_data.get("penalties", []):
                penalty_name = entry.get('name')
                if penalty_name and penalty_name not in all_defined_penalty_entries:
                    all_defined_penalty_entries[penalty_name] = {
                        'name': penalty_name,
                        'probability': entry.get('probability', 0.1), # Default if missing
                        'description': entry.get('description', '')   # Default if missing
                    }

        existing_db_penalties = { p.name for p in db.session.query(Penalty.name).all() }
        
        penalties_to_add_to_db = []
        for penalty_name, penalty_data in all_defined_penalty_entries.items():
            if penalty_name not in existing_db_penalties:
                penalties_to_add_to_db.append(Penalty(**penalty_data))
                existing_db_penalties.add(penalty_name)

        if penalties_to_add_to_db:
            db.session.add_all(penalties_to_add_to_db)
            logger.info(f"Adding {len(penalties_to_add_to_db)} new unique penalties to Penalty table.")
        else:
            logger.info("No new unique penalties to add to Penalty table from definitions.")

        # Commit changes if anything was added
        if games_to_add_to_db or penalties_to_add_to_db:
            db.session.commit()
            logger.info("Database seeding committed.")
        else:
            logger.info("No new data from definitions to seed into master tables.")

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error seeding database from definitions: {e}", exc_info=True)
        print(f"Error seeding database: {e}")
    finally:
        # db.session.remove() # Optional, depending on your session management
        pass
    print("Database seeding from definitions finished.")


@click.command("generate-key")
@click.argument("username")
@with_appcontext
def generate_key_command(username):
    """Generates or regenerates an overlay API key for a user."""
    user = db.session.query(User).filter_by(username=username).first()
    if not user:
        print(f"Error: User '{username}' not found.")
        logger.warning(f"generate-key command failed: User '{username}' not found.")
        return

    try:
        old_key = user.overlay_api_key
        new_key = user.generate_overlay_key() # Call the method on the User model
        db.session.commit()
        if old_key:
            print(f"Successfully regenerated overlay API key for user '{username}'.")
            print(f"New Key: {new_key}")
            logger.info(f"Regenerated overlay key for user '{username}'.")
        else:
            print(f"Successfully generated overlay API key for user '{username}'.")
            print(f"Key: {new_key}")
            logger.info(f"Generated initial overlay key for user '{username}'.")
    except Exception as e:
        db.session.rollback()
        print(f"Error generating key for user '{username}': {e}")
    logger.exception(f"Error generating key for user '{username}'")


@click.command("backfill-created-at")
@with_appcontext
def backfill_created_at_command():
    """Sets the created_at field to the current UTC time for all users where it is NULL."""
    users_to_update = User.query.filter(User.created_at.is_(None)).all()
    
    if not users_to_update:
        print("No users found with NULL created_at field.")
        logger.info("No users found with NULL created_at field.")
        return

    current_time_utc = datetime.datetime.now(datetime.timezone.utc)
    updated_count = 0
    
    try:
        for user in users_to_update:
            user.created_at = current_time_utc
            updated_count += 1
        
        db.session.commit()
        print(f"Successfully updated created_at for {updated_count} user(s).")
        logger.info(f"Successfully updated created_at for {updated_count} user(s).")
    except Exception as e:
        db.session.rollback()
        print(f"Error updating created_at for users: {e}")
        logger.error(f"Error updating created_at for users: {e}", exc_info=True)

# Function to register command(s) with the Flask app
def register_commands(app):
    app.cli.add_command(seed_db_command)
    app.cli.add_command(generate_key_command)
    app.cli.add_command(backfill_created_at_command) # Register new command
    # Add other custom commands here if you create more
