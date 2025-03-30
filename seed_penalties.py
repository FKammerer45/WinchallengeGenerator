# seed_penalties.py
import logging
import sys
import os

# --- Setup Path ---
# Add the project root to the path so we can import 'app' and 'config'
project_root = os.path.abspath(os.path.dirname(__file__))
sys.path.insert(0, project_root)
# --- End Setup Path ---

# Now import necessary components
try:
    from app.database import SessionLocal, engine, Base
    from app.models import Penalty
    from app.modules.default_data import DEFAULT_PENALTIES
    # Import config to ensure logging is set up if needed, although we configure basic below
    import config
except ImportError as e:
    print(f"Error importing application components: {e}", file=sys.stderr)
    print("Please ensure you run this script from the project root directory", file=sys.stderr)
    print("and that the necessary files (config.py, app/database.py, app/models.py, app/modules/default_data.py) exist.", file=sys.stderr)
    sys.exit(1)

# Configure basic logging for the script
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

def seed_database():
    """Checks if the penalties table is empty and seeds it if necessary."""
    logger.info("Attempting to seed default penalties...")
    db_session = SessionLocal()
    try:
        # Check if any penalties already exist
        existing_penalty_count = db_session.query(Penalty).count()

        if existing_penalty_count > 0:
            logger.info(f"Penalties table already contains {existing_penalty_count} entries. Seeding skipped.")
        else:
            logger.info("Penalties table is empty. Inserting default penalties...")
            penalties_to_add = []
            for p_data in DEFAULT_PENALTIES:
                 # Create model instance (** ensure keys match model fields **)
                 new_penalty = Penalty(
                     name=p_data['name'],
                     probability=p_data['probability'],
                     description=p_data.get('description')
                 )
                 penalties_to_add.append(new_penalty)

            if penalties_to_add:
                db_session.add_all(penalties_to_add)
                db_session.commit()
                logger.info(f"Successfully added {len(penalties_to_add)} default penalties to the database.")
            else:
                logger.info("No default penalties found to add.")

    except Exception as e:
        logger.exception("An error occurred during penalty seeding:")
        db_session.rollback() # Rollback any partial changes
    finally:
        db_session.close()
        logger.info("Database session closed.")

if __name__ == "__main__":
    # Optional: Create tables if they don't exist before seeding
    # This requires Base and engine to be imported correctly
    try:
        logger.info("Ensuring database tables exist...")
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables checked/created.")
    except Exception as e:
        logger.error(f"Failed to check/create database tables: {e}", exc_info=True)
        sys.exit(1)

    # Run the seeding function
    seed_database()