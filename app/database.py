# app/database.py
import logging
from contextlib import contextmanager
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from config import DATABASE_URL # Import from config at root

logger = logging.getLogger(__name__)

# Create the SQLAlchemy engine using the URL from config
# connect_args is needed for SQLite to work correctly with threads in Flask
engine_args = {}
if DATABASE_URL.startswith("sqlite"):
    engine_args["connect_args"] = {"check_same_thread": False}

try:
    engine = create_engine(DATABASE_URL, **engine_args)
    logger.info(f"Database engine created for URL: {DATABASE_URL}")
except ImportError:
    logger.error("SQLAlchemy not installed or database driver missing.")
    raise
except Exception as e:
    logger.error(f"Failed to create database engine: {e}")
    raise


# Create a configured "Session" class - a factory for Session objects
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create a Base class for declarative class definitions
Base = declarative_base()


@contextmanager
def get_db_session():
    """Provide a transactional scope around a series of operations."""
    session = SessionLocal()
    logger.debug("Database session opened.")
    try:
        yield session
        session.commit()
        logger.debug("Database session committed.")
    except Exception as e:
        session.rollback()
        logger.exception("Database error occurred, session rolled back:")
        raise e # Re-raise the exception after logging
    finally:
        session.close()
        logger.debug("Database session closed.")

def init_db():
    """
    Creates database tables from models.
    Warning: In production, use a migration tool like Alembic.
    """
    logger.warning("Initializing database schema. In production, use Alembic!")
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables checked/created.")
    except Exception as e:
        logger.error(f"Failed to initialize database schema: {e}")
        raise