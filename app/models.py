# app/models.py
import logging
import datetime
from typing import Dict, Any
from sqlalchemy import (Table, Column, Integer, String, Float, Text, DateTime,
                          ForeignKey, Index, Boolean)
from sqlalchemy.types import JSON
from sqlalchemy.orm import relationship
from werkzeug.security import check_password_hash, generate_password_hash
from .database import Base # Import Base from database module

logger = logging.getLogger(__name__)

# Association Table for User <-> ChallengeGroup Membership
user_challenge_group_membership = Table('user_challenge_group_membership', Base.metadata,
    Column('user_id', Integer, ForeignKey('users.id'), primary_key=True),
    Column('group_id', Integer, ForeignKey('challenge_groups.id'), primary_key=True)
)

# --- Basic Config/Entry Models ---

class SavedPenaltyTab(Base):
    
    __tablename__ = 'saved_penalty_tabs'
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    client_tab_id = Column(String(100), nullable=False, index=True)
    tab_name = Column(String(100), nullable=False)
    penalties_json = Column(Text, nullable=False)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.datetime.now(datetime.timezone.utc))
    def to_dict(self) -> Dict[str, Any]: return { "client_tab_id": self.client_tab_id, "tab_name": self.tab_name, "penalties_json": self.penalties_json, "timestamp": self.timestamp.isoformat() if self.timestamp else None }

class SavedGameTab(Base):
    
    __tablename__ = 'saved_game_tabs'
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    client_tab_id = Column(String(100), nullable=False, index=True)
    tab_name = Column(String(100), nullable=False)
    entries_json = Column(Text, nullable=False)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.datetime.now(datetime.timezone.utc))
    def to_dict(self) -> Dict[str, Any]: return { "client_tab_id": self.client_tab_id, "tab_name": self.tab_name, "entries_json": self.entries_json, "timestamp": self.timestamp.isoformat() if self.timestamp else None }

class GameEntry(Base):
     
    __tablename__ = 'game_entries'
    id = Column(Integer, primary_key=True, autoincrement=True)
    Spiel = Column(String(100), nullable=False, index=True)
    Spielmodus = Column(String(100), nullable=False)
    Schwierigkeit = Column(Float, nullable=False)
    Spieleranzahl = Column(Integer, nullable=False)
    def to_dict(self) -> Dict[str, Any]: return { "id": self.id, "Spiel": self.Spiel, "Spielmodus": self.Spielmodus, "Schwierigkeit": self.Schwierigkeit, "Spieleranzahl": self.Spieleranzahl }

class Penalty(Base):
     
    __tablename__ = 'penalties'
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(150), nullable=False, unique=True)
    probability = Column(Float, nullable=False)
    description = Column(String(255), nullable=True)
    def to_dict(self) -> Dict[str, Any]: return { "id": self.id, "name": self.name, "probability": self.probability, "description": self.description }


# --- Core Application Models ---

class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)

    created_challenges = relationship("SharedChallenge", back_populates="creator", lazy="select")
    joined_groups = relationship(
        "ChallengeGroup",
        secondary=user_challenge_group_membership,
        back_populates="members",
        lazy="select"
    )

    @property
    def is_active(self) -> bool: return True
    @property
    def is_authenticated(self) -> bool: return True
    @property
    def is_anonymous(self) -> bool: return False
    def get_id(self) -> str: return str(self.id)
    def check_password(self, password: str) -> bool: return check_password_hash(self.password_hash, password)
    # def set_password(self, password: str): self.password_hash = generate_password_hash(password)

class SharedChallenge(Base):
    """Model for storing shared challenges."""
    __tablename__ = 'shared_challenges'

    id = Column(Integer, primary_key=True, index=True)
    public_id = Column(String(36), unique=True, index=True, nullable=False)
    creator_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    name = Column(String(120), nullable=True)
    challenge_data = Column(JSON, nullable=False) # {normal:..., b2b:...}
    penalty_info = Column(JSON, nullable=True) # {tab_id:..., player_names:[...]} (player_names here is likely legacy)
    max_groups = Column(Integer, default=10, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.datetime.now(datetime.timezone.utc), nullable=False)
    num_players_per_group = Column(Integer, nullable=False, default=1, server_default='1')



    # Relationships
    groups = relationship("ChallengeGroup", back_populates="shared_challenge", cascade="all, delete-orphan", lazy="select")
    creator = relationship("User", back_populates="created_challenges")

    def __repr__(self): return f"<SharedChallenge id={self.id}>"
    def get_penalty_tab_id(self): return self.penalty_info.get('tab_id') if isinstance(self.penalty_info, dict) else None
    # get_player_names() might be less relevant now, group-specific names are stored on ChallengeGroup

class ChallengeGroup(Base):
    """Represents a group participating in a specific SharedChallenge."""
    __tablename__ = 'challenge_groups'

    id = Column(Integer, primary_key=True, index=True)
    shared_challenge_id = Column(Integer, ForeignKey('shared_challenges.id'), nullable=False, index=True)
    group_name = Column(String(80), nullable=False)
    progress_data = Column(JSON, nullable=True, default=lambda: {})
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.datetime.now(datetime.timezone.utc))
    active_penalty_text = Column(String(255), nullable=True)
    
    # --- ADDED: Store player names specific to this group ---
    # Stored as a JSON list, e.g., ["Player A", "Player B"]
    player_names = Column(JSON, nullable=True)
    # --- END ADDED ---

    # Relationships
    shared_challenge = relationship("SharedChallenge", back_populates="groups", lazy="select")
    members = relationship(
        "User",
        secondary=user_challenge_group_membership,
        back_populates="joined_groups",
        lazy="select"
    )

    # Constraints
    __table_args__ = (
        Index('uq_shared_challenge_group_name', 'shared_challenge_id', 'group_name', unique=True),
    )

    def __repr__(self): return f"<ChallengeGroup id={self.id} name='{self.group_name}'>"