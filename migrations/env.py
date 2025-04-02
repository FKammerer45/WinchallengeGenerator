# migrations/env.py
import logging
from logging.config import fileConfig
import sys
import os

# --- Add project root to sys.path ---
# This allows importing 'app' and 'config' from the script's location
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# --- Import necessary components ---
from sqlalchemy import engine_from_config # If using engine config from alembic.ini
from sqlalchemy import pool, create_engine # Need create_engine for online mode
from alembic import context

# --- Import your application's Base and DB URL ---
# This assumes your config.py and app/ package are in the parent directory
try:
    from app.database import Base # Import your SQLAlchemy Base object
    from config import DATABASE_URL # Import your database connection string
except ImportError as e:
     print(f"Error: Could not import Base or DATABASE_URL: {e}", file=sys.stderr)
     print("Ensure config.py is in the project root and app/database.py defines Base.", file=sys.stderr)
     sys.exit(1)

# --- Alembic Config Setup ---
# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)
logger = logging.getLogger('alembic.env')

# --- Configure target metadata ---
# Set this to your Base.metadata object for 'autogenerate' support
target_metadata = Base.metadata
logger.info(f"Using metadata from: {Base.__module__}")

# --- Remove functions relying on Flask-SQLAlchemy extension ---
# def get_engine(): ... (REMOVED)
# def get_engine_url(): ... (REMOVED)
# def get_metadata(): ... (REMOVED)
# target_db = ... (REMOVED)

# --- Set sqlalchemy.url based on imported config ---
# This tells Alembic how to connect for offline mode or if online connectable isn't made
logger.info(f"Setting Alembic sqlalchemy.url from config: {DATABASE_URL[:15]}...") # Log prefix only
config.set_main_option('sqlalchemy.url', DATABASE_URL.replace('%', '%%')) # Escape % for config parser


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well. By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    # Use the DATABASE_URL imported from config
    url = config.get_main_option("sqlalchemy.url") # Get URL set above
    logger.info(f"Running migrations offline against URL: {url[:15]}...")

    context.configure(
        url=url,
        target_metadata=target_metadata, # Use imported Base.metadata
        literal_binds=True,              # Render SQL without parameters bound
        dialect_opts={"paramstyle": "named"}, # Standard dialect options
        render_as_batch=DATABASE_URL.startswith("sqlite"), # Enable batch mode for SQLite compatibility
    )

    with context.begin_transaction():
        context.run_migrations()
    logger.info("Offline migrations finished.")


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    # --- Use engine/URL directly from config/database setup ---
    # Define engine arguments (e.g., for SQLite thread safety)
    engine_args = {}
    if DATABASE_URL.startswith("sqlite"):
        engine_args["connect_args"] = {"check_same_thread": False}
        logger.info("Configuring engine for SQLite with check_same_thread=False")

    # Create engine using the imported DATABASE_URL
    connectable = create_engine(DATABASE_URL, **engine_args)
    logger.info(f"Running migrations online using engine for URL: {DATABASE_URL[:15]}...")

    # Connect and run migrations within a transaction
    with connectable.connect() as connection:
        logger.debug("Configuring Alembic context...")
        context.configure(
            connection=connection,
            target_metadata=target_metadata, # Use imported Base.metadata
            compare_type=True,               # Detect column type changes
            render_as_batch=DATABASE_URL.startswith("sqlite"), # Enable batch mode for SQLite
        )
        logger.debug("Alembic context configured.")

        logger.info("Beginning Alembic transaction and running migrations...")
        with context.begin_transaction():
            context.run_migrations()
        logger.info("Online migrations finished.")


# --- Main execution block ---
if context.is_offline_mode():
    logger.info("Starting migrations in offline mode.")
    run_migrations_offline()
else:
    logger.info("Starting migrations in online mode.")
    run_migrations_online()