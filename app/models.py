# app/models.py
import logging
import datetime # Use datetime directly
from typing import Dict, Any
# Ensure all necessary types and functions are imported
from sqlalchemy import (Table, Column, Integer, String, Float, Text, DateTime,
                          ForeignKey, Index, Boolean) # Removed redundant spacing
from sqlalchemy.types import JSON
from sqlalchemy.orm import relationship # Import relationship
from werkzeug.security import check_password_hash, generate_password_hash # Added generate for completeness
# Import Base from your database setup
from .database import Base # Import Base from database module

logger = logging.getLogger(__name__)

# Defines the link between users and the specific groups they join
user_challenge_group_membership = Table('user_challenge_group_membership', Base.metadata,
    Column('user_id', Integer, ForeignKey('users.id'), primary_key=True),
    Column('group_id', Integer, ForeignKey('challenge_groups.id'), primary_key=True)
    
)

class SavedPenaltyTab(Base):
    __tablename__ = 'saved_penalty_tabs'
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    client_tab_id = Column(String(100), nullable=False, index=True)
    tab_name = Column(String(100), nullable=False)
    penalties_json = Column(Text, nullable=False)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.datetime.now(datetime.timezone.utc))

    def to_dict(self) -> Dict[str, Any]:
        return { "client_tab_id": self.client_tab_id, "tab_name": self.tab_name, "penalties_json": self.penalties_json, "timestamp": self.timestamp.isoformat() if self.timestamp else None }

class SavedGameTab(Base):
    __tablename__ = 'saved_game_tabs'
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    client_tab_id = Column(String(100), nullable=False, index=True)
    tab_name = Column(String(100), nullable=False)
    entries_json = Column(Text, nullable=False)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.datetime.now(datetime.timezone.utc))

    def to_dict(self) -> Dict[str, Any]:
        return { "client_tab_id": self.client_tab_id, "tab_name": self.tab_name, "entries_json": self.entries_json, "timestamp": self.timestamp.isoformat() if self.timestamp else None }


class GameEntry(Base):
    __tablename__ = 'game_entries'
    id = Column(Integer, primary_key=True, autoincrement=True)
    Spiel = Column(String(100), nullable=False, index=True)
    Spielmodus = Column(String(100), nullable=False)
    Schwierigkeit = Column(Float, nullable=False)
    Spieleranzahl = Column(Integer, nullable=False)

    def to_dict(self) -> Dict[str, Any]:
        return { "id": self.id, "Spiel": self.Spiel, "Spielmodus": self.Spielmodus, "Schwierigkeit": self.Schwierigkeit, "Spieleranzahl": self.Spieleranzahl }

class Penalty(Base):
    __tablename__ = 'penalties'
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(150), nullable=False, unique=True)
    probability = Column(Float, nullable=False)
    description = Column(String(255), nullable=True)

    def to_dict(self) -> Dict[str, Any]:
        return { "id": self.id, "name": self.name, "probability": self.probability, "description": self.description }


class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False) # Increased length for modern hashes

    # --- Define relationship to SharedChallenge ---
    # One User can create many SharedChallenges
    created_challenges = relationship("SharedChallenge", back_populates="creator", lazy="select")

        # Many Users can join Many ChallengeGroups (via the association table)
    joined_groups = relationship(
        "ChallengeGroup",
        secondary=user_challenge_group_membership, # Specify the association table
        back_populates="members",                  # Link to the 'members' relationship in ChallengeGroup
        lazy="select"                              # Load groups only when accessed
    )

    @property
    def is_active(self) -> bool: return True
    @property
    def is_authenticated(self) -> bool: return True
    @property
    def is_anonymous(self) -> bool: return False
    def get_id(self) -> str: return str(self.id)
    def check_password(self, password: str) -> bool: return check_password_hash(self.password_hash, password)
    # Helper for setting password might be useful
    # def set_password(self, password: str): self.password_hash = generate_password_hash(password)
    

# --- RENAMED and CORRECTED SharedChallenge Model ---
# Renamed from AcceptedChallenge to match imports
class SharedChallenge(Base):
    """Model for storing shared challenges."""
    __tablename__ = 'shared_challenges' # New table name

    id = Column(Integer, primary_key=True, index=True)
    # Added missing fields from previous design
    public_id = Column(String(36), unique=True, index=True, nullable=False) # For UUID4 strings
    creator_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True) # Link to the User who created it
    # Renamed user_id to creator_id for clarity

    name = Column(String(120), nullable=True) # Optional name for the challenge
    # Store the core generated challenge structure {result, normal, b2b}
    challenge_data = Column(JSON, nullable=False)
    # Store original penalty info: {tab_id, player_names} or null
    penalty_info = Column(JSON, nullable=True)
    # Max groups allowed for this instance
    max_groups = Column(Integer, default=10, nullable=False) # Default changed to 10 as used elsewhere
    # Timestamp when created/shared
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.datetime.now(datetime.timezone.utc), nullable=False)
    # Removed 'timestamp', using 'created_at'

    # --- Corrected Relationships ---
    # Relationship to groups participating
    # Renamed 'challenge_groups' to 'groups' to match usage in main.py (joinedload)
    groups = relationship(
        "ChallengeGroup",
        back_populates="shared_challenge", # Matches attribute name in ChallengeGroup
        cascade="all, delete-orphan",      # Delete groups if challenge is deleted
        lazy="select"                      # Load groups only when accessed
    )
    # Relationship back to User who created it
    creator = relationship("User", back_populates="created_challenges") # Matches attribute in User

    def __repr__(self):
        # Updated repr to use relevant fields
        return f"<SharedChallenge(id={self.id}, public_id='{self.public_id}', creator_id={self.creator_id})>"

    # Helper methods adjusted if needed (seem ok)
    def get_player_names(self):
        return self.penalty_info.get('player_names', []) if isinstance(self.penalty_info, dict) else []
    def get_penalty_tab_id(self):
        return self.penalty_info.get('tab_id') if isinstance(self.penalty_info, dict) else None


# --- ChallengeGroup Model ---
class ChallengeGroup(Base):
    """Represents a group participating in a specific SharedChallenge.""" # Updated docstring
    __tablename__ = 'challenge_groups'

    id = Column(Integer, primary_key=True, index=True) # Added index=True
    # Link back to the specific SHARED challenge instance
    # Renamed 'accepted_challenge_id' to 'shared_challenge_id'
    shared_challenge_id = Column(Integer, ForeignKey('shared_challenges.id'), nullable=False, index=True)
    # Name of the group (e.g., "Team Alpha")
    group_name = Column(String(80), nullable=False) # Reduced length slightly
    # Store progress as JSON: {'progress_key': bool, ...} using flat structure
    # Default to empty dict using lambda
    progress_data = Column(JSON, nullable=True, default=lambda: {})
    # Timestamp when the group was created
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.datetime.now(datetime.timezone.utc))

    # Relationship back to the parent SharedChallenge
    # Renamed 'accepted_challenge' to 'shared_challenge'
    # Ensure 'back_populates' matches the attribute name in SharedChallenge ('groups')

    shared_challenge = relationship("SharedChallenge", back_populates="groups", lazy="select")

    members = relationship(
        "User",
        secondary=user_challenge_group_membership, # Specify the association table
        back_populates="joined_groups",            # Link to the 'joined_groups' relationship in User
        lazy="select"                              # Load members only when accessed
    )
    # Ensure group name is unique within one shared challenge
    # Updated index name and column name
    __table_args__ = (
        Index('uq_shared_challenge_group_name', 'shared_challenge_id', 'group_name', unique=True),
    )

    def __repr__(self):
        # Updated repr
        return f"<ChallengeGroup(id={self.id}, name='{self.group_name}', shared_challenge_id={self.shared_challenge_id})>"