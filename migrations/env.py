# migrations/env.py
import os 
from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# --- START Flask App Context Setup ---
# Import your Flask app factory and db instance
# Adjust the import path if your app factory or db are located differently
from app import create_app, db 

# Create a Flask app instance for context
# This initializes db and makes app.config available
app = create_app(os.getenv('FLASK_ENV') or 'development') 

# --- REMOVED: app.app_context().push() --- 
# Flask-Migrate/Alembic handle the context needed for run_migrations_online/offline

# --- END Flask App Context Setup ---


# add your model's MetaData object here
# for 'autogenerate' support
# from myapp import mymodel
# target_metadata = mymodel.Base.metadata

# --- Set target_metadata using db.metadata from Flask-SQLAlchemy ---
# db is initialized via create_app above
target_metadata = db.metadata
# --- END Metadata Setup ---


# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    # Use the database URL from Flask app config (app instance created above)
    url = app.config.get('SQLALCHEMY_DATABASE_URI') 
    context.configure(
        url=url,
        target_metadata=target_metadata, # Use the metadata we set above
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    # Use the engine from the Flask-SQLAlchemy db object (db instance initialized above)
    connectable = db.engine 

    with connectable.connect() as connection:
        context.configure(
            connection=connection, 
            target_metadata=target_metadata # Use the metadata we set above
        )

        # Flask-Migrate typically runs migrations within the app context it sets up
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
