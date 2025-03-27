# modules/models.py
import logging
from typing import Dict, Any
from sqlalchemy import create_engine, Column, Integer, String, Float, Text, DateTime, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from werkzeug.security import check_password_hash
from config import DATABASE_URL
from datetime import datetime

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)
logger.debug("Using DATABASE_URL: %s", DATABASE_URL)

Base = declarative_base()

class SavedGameTab(Base):
    __tablename__ = 'saved_game_tabs'
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    client_tab_id = Column(String(100), nullable=False)  # NEW: stores the local tab id (e.g. "tabPane-3")
    tab_name = Column(String(100), nullable=False)
    entries_json = Column(Text, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)

class GameEntry(Base):
    __tablename__ = 'game_entries'
    id = Column(Integer, primary_key=True, autoincrement=True)
    Spiel = Column(String(100), nullable=False)
    Spielmodus = Column(String(100), nullable=False)
    Schwierigkeit = Column(Float, nullable=False)
    Spieleranzahl = Column(Integer, nullable=False)

    def to_dict(self) -> Dict[str, Any]:
        """Convert GameEntry instance to a dictionary."""
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}

class Penalty(Base):
    __tablename__ = 'penaltys'
    id = Column(Integer, primary_key=True, autoincrement=True)
    Strafe = Column(String(100), nullable=False)  # The penalty name/description
    Wahrscheinlichkeit = Column(Float, nullable=False)  # The probability value

    def to_dict(self) -> Dict[str, Any]:
        """Convert Penalty instance to a dictionary."""
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}

class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True)
    username = Column(String(50), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)

    def check_password(self, password: str) -> bool:
        """Check if the provided password matches the stored hash."""
        return check_password_hash(self.password_hash, password)

    @property
    def is_active(self) -> bool:
        """Return True if the user is active."""
        return True

    @property
    def is_authenticated(self) -> bool:
        """Return True if the user is authenticated."""
        return True

    @property
    def is_anonymous(self) -> bool:
        """Return False as anonymous users are not supported."""
        return False

    def get_id(self) -> str:
        """Return the unique identifier of the user as a string."""
        return str(self.id)

# Create the SQLAlchemy engine and session factory.
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

# Create tables if they don't exist. In production, use a migration tool.
Base.metadata.create_all(bind=engine)
