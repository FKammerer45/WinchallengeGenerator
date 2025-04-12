import logging
import os
import sys
from sqlalchemy.exc import SQLAlchemyError

# --- Setup Path ---
# Add the project root to the Python path to allow imports from 'app'
# Adjust this path if your script is located elsewhere relative to the 'app' folder
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)
# --- End Setup Path ---

# Import necessary components from your app
try:
    # Using SessionLocal context manager is preferred
    from app.database import SessionLocal
    from app.models import GameEntry # Import your GameEntry model
except ImportError as e:
    print(f"Error importing app modules: {e}")
    print("Please ensure this script is run from the project root directory (where run.py is)")
    print(f"Current sys.path: {sys.path}")
    sys.exit(1)

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# --- Define Default Game Entries ---
# List of tuples: ('Spiel', 'Spielmodus', Schwierigkeit_Float, Spieleranzahl_Int)
# weight=1.0 and is_default=True will be added automatically
default_data = [
    # Your existing entries
    ('LeagueOfLegends', 'FlexQ', 6.0, 5),
    ('CSGO', 'Premier', 7.0, 5),
    ('CSGO', 'Ranked', 7.0, 5),
    ('Fallguys', 'normal', 2.0, 4),
    ('LeagueOfLegends', 'DuoQ', 8.0, 3),
    ('LeagueOfLegends', 'Aram', 3.0, 5),
    ('PUBG', 'squad', 8.0, 4),
    ('PUBG', 'Duos', 7.0, 2),
    ('RocketLeague', 'Duos', 2.0, 2),
    ('RocketLeague', 'Trios', 2.0, 3),
    ('AgeOfEmpires', 'Ranked', 5.0, 4),
    ('Rainbow6Siege', 'Ranked', 5.0, 5),
    ('LeagueOfLegends', 'URF', 4.0, 5),
    ('Valorant', 'Ranked', 6.0, 5),
    # --- Add NEW entries below ---
    ('Teamfight Tactics', 'Ranked', 6.0, 1),
    ('Teamfight Tactics', 'Hyper Roll', 4.0, 1),
    ('Apex Legends', 'Trios', 7.0, 3),
    ('Apex Legends', 'Duos', 7.0, 2),
    ('Overwatch 2', 'Quick Play', 5.0, 5),
    ('Overwatch 2', 'Competitive', 7.5, 5),
    ('Dota 2', 'All Pick', 8.0, 5),
    ('Dota 2', 'Turbo', 6.0, 5),
    ('Fortnite', 'Battle Royale (Solo)', 5.0, 1),
    ('Fortnite', 'Battle Royale (Duos)', 5.5, 2),
    ('Fortnite', 'Battle Royale (Squads)', 6.0, 4),
    # Add more entries here as needed following the tuple format
    # ('Game Name', 'Mode Name', Difficulty_Float, Players_Int),
]

def seed_database():
    """Deletes existing default entries and inserts the defined list."""
    logger.info("Starting database seeding for default game entries...")
    session = SessionLocal()
    try:
        # Delete existing default entries first to prevent duplicates
        # This makes the script idempotent (running it multiple times has the same effect)
        logger.info("Deleting existing default game entries...")
        num_deleted = session.query(GameEntry).delete(synchronize_session=False)
        session.commit() # Commit the deletion
        logger.info(f"Deleted {num_deleted} existing default game entries.")

        # Insert new default entries
        logger.info("Inserting new default game entries...")
        entries_to_add = []
        for item in default_data:
            # Basic validation of the tuple structure
            if isinstance(item, tuple) and len(item) == 4:
                # Use the exact attribute names from your GameEntry model
                game, mode, diff, players = item
                entry = GameEntry(
                    Spiel=str(game),           # Map to Spiel
                    Spielmodus=str(mode),      # Map to Spielmodus
                    Schwierigkeit=float(diff), # Map to Schwierigkeit
                    Spieleranzahl=int(players),# Map to Spieleranzahl
                )
                entries_to_add.append(entry)
            else:
                logger.warning(f"Skipping malformed data tuple: {item}")

        if entries_to_add:
            session.add_all(entries_to_add)
            session.commit() # Commit the insertions
            logger.info(f"Successfully added {len(entries_to_add)} new default game entries.")
        else:
            logger.info("No valid new entries found to add.")

    except SQLAlchemyError as e:
        session.rollback() # Roll back the transaction on error
        logger.exception(f"Database error during seeding: {e}")
        print(f"\nDATABASE ERROR: {e}\nCheck database connection and model definitions.")
    except Exception as e:
        session.rollback() # Roll back on any other error
        logger.exception(f"An unexpected error occurred during seeding: {e}")
        print(f"\nUNEXPECTED ERROR: {e}")
    finally:
        session.close() # Ensure session is closed
        logger.info("Database session closed.")

if __name__ == "__main__":
    # This allows the script to be run directly using 'python seed_defaults.py'
    seed_database()
