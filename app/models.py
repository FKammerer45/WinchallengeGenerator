# app/models.py
import logging
from typing import Dict, Any
from sqlalchemy import Column, Integer, String, Float, Text, DateTime, ForeignKey
from werkzeug.security import check_password_hash
from datetime import datetime, timezone # Use timezone aware datetime
from app.database import Base # Import Base from database module

logger = logging.getLogger(__name__)

class SavedGameTab(Base):
    __tablename__ = 'saved_game_tabs'
    id = Column(Integer, primary_key=True, autoincrement=True)
    # Ensure user_id refers to the correct table name 'users'
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    client_tab_id = Column(String(100), nullable=False, index=True) # ID used by client JS
    tab_name = Column(String(100), nullable=False)
    entries_json = Column(Text, nullable=False) # Store entries as JSON string
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)) # Use timezone aware UTC time

    def to_dict(self) -> Dict[str, Any]:
        """Convert SavedGameTab instance to a dictionary for JSON serialization."""
        return {
            # Consider which fields the client actually needs
            "client_tab_id": self.client_tab_id,
            "tab_name": self.tab_name,
            "entries_json": self.entries_json, # Client will need to parse this
            "timestamp": self.timestamp.isoformat() if self.timestamp else None
        }


class GameEntry(Base):
    __tablename__ = 'game_entries'
    id = Column(Integer, primary_key=True, autoincrement=True)
    # Using original German names as defined, switch if desired
    Spiel = Column(String(100), nullable=False, index=True) # Game Name
    Spielmodus = Column(String(100), nullable=False)      # Game Mode
    Schwierigkeit = Column(Float, nullable=False)         # Difficulty
    Spieleranzahl = Column(Integer, nullable=False)       # Number of Players

    def to_dict(self) -> Dict[str, Any]:
        """Convert GameEntry instance to a dictionary."""
        # Return keys matching the model definition for consistency internally
        return {
            "id": self.id,
            "Spiel": self.Spiel,
            "Spielmodus": self.Spielmodus,
            "Schwierigkeit": self.Schwierigkeit,
            "Spieleranzahl": self.Spieleranzahl
        }

class Penalty(Base):
    # Consider renaming table to 'penalties' for convention
    __tablename__ = 'penaltys' # Original name
    id = Column(Integer, primary_key=True, autoincrement=True)
    # Using original German names
    Strafe = Column(String(100), nullable=False) # Penalty name/description
    Wahrscheinlichkeit = Column(Float, nullable=False) # Probability

    def to_dict(self) -> Dict[str, Any]:
        """Convert Penalty instance to a dictionary."""
        return {
            "id": self.id,
            "Strafe": self.Strafe,
            "Wahrscheinlichkeit": self.Wahrscheinlichkeit
        }


class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    # Add other user fields if needed (email, created_at, etc.)

    # Flask-Login integration
    @property
    def is_active(self) -> bool:
        return True # Assume all users are active

    @property
    def is_authenticated(self) -> bool:
        # This property should return True if the user is currently logged in.
        # Flask-Login manages this after successful login.
        # If using Flask-Login's current_user, this might not be needed directly,
        # but it's part of the expected interface. Let's keep it simple.
        return True

    @property
    def is_anonymous(self) -> bool:
        return False # No anonymous users supported

    def get_id(self) -> str:
        """Return the user ID as a string (required by Flask-Login)."""
        return str(self.id)

    # Password validation
    def check_password(self, password: str) -> bool:
        """Check if the provided password matches the stored hash."""
        return check_password_hash(self.password_hash, password)

    # Add a method to set password hash if not done elsewhere
    # from werkzeug.security import generate_password_hash
    # def set_password(self, password: str):
    #    self.password_hash = generate_password_hash(password)