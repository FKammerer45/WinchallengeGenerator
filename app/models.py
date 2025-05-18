# app/models.py
import logging
import datetime
import secrets
from typing import Dict, Any
from sqlalchemy import (Table, Column, Integer, String, Float, Text, DateTime,
                        ForeignKey, Index, Boolean)
from sqlalchemy.types import JSON
from sqlalchemy.orm import relationship
from werkzeug.security import check_password_hash, generate_password_hash
# Removed: from .database import Base # No longer needed
from app import db # Import the db instance from app/__init__.py
from flask_login import UserMixin
logger = logging.getLogger(__name__)

# Association Table for User <-> SharedChallenge (Authorization)
challenge_authorized_users_table = db.Table('challenge_authorized_users', db.metadata,
    db.Column('user_id', db.Integer, db.ForeignKey('users.id', name='fk_auth_user_id'), primary_key=True),
    db.Column('challenge_id', db.Integer, db.ForeignKey('shared_challenges.id', name='fk_auth_challenge_id'), primary_key=True)
)

# Association Table for User <-> ChallengeGroup Membership
user_challenge_group_membership_table = db.Table('user_challenge_group_membership', db.metadata,
    db.Column('user_id', Integer, ForeignKey('users.id', name='fk_membership_user_id'), primary_key=True),
    db.Column('group_id', Integer, ForeignKey('challenge_groups.id', name='fk_membership_group_id'), primary_key=True)
)
# --- Basic Config/Entry Models ---

# Inherit from db.Model instead of Base
class SavedPenaltyTab(db.Model): 
    __tablename__ = 'saved_penalty_tabs'
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    client_tab_id = Column(String(100), nullable=False, index=True)
    tab_name = Column(String(100), nullable=False)
    penalties_json = Column(Text, nullable=False)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.datetime.now(datetime.timezone.utc))
    
    # Relationships (Optional but good practice)
    user = relationship("User", backref=db.backref("saved_penalty_tabs", lazy=True))

    def to_dict(self) -> Dict[str, Any]: 
        return { 
            "client_tab_id": self.client_tab_id, 
            "tab_name": self.tab_name, 
            "penalties_json": self.penalties_json, 
            "timestamp": self.timestamp.isoformat() if self.timestamp else None 
        }

# Inherit from db.Model instead of Base
class SavedGameTab(db.Model):
    __tablename__ = 'saved_game_tabs'
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    client_tab_id = Column(String(100), nullable=False, index=True)
    tab_name = Column(String(100), nullable=False)
    entries_json = Column(Text, nullable=False)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.datetime.now(datetime.timezone.utc))

    # Relationships (Optional but good practice)
    user = relationship("User", backref=db.backref("saved_game_tabs", lazy=True))

    def to_dict(self) -> Dict[str, Any]: 
        return { 
            "client_tab_id": self.client_tab_id, 
            "tab_name": self.tab_name, 
            "entries_json": self.entries_json, 
            "timestamp": self.timestamp.isoformat() if self.timestamp else None 
        }

# Inherit from db.Model instead of Base
class GameEntry(db.Model):
    __tablename__ = 'game_entries'
    # Consider adding user_id if these are user-specific, or perhaps these are global?
    # If global, maybe they belong in a different table or seeded data.
    id = Column(Integer, primary_key=True, autoincrement=True)
    Spiel = Column(String(100), nullable=False, index=True) # German for "Game"
    Spielmodus = Column(String(100), nullable=False) # German for "Game Mode"
    Schwierigkeit = Column(Float, nullable=False) # German for "Difficulty"
    Spieleranzahl = Column(Integer, nullable=False) # German for "Number of Players"
    
    def to_dict(self) -> Dict[str, Any]: 
        return { 
            "id": self.id, 
            "Spiel": self.Spiel, 
            "Spielmodus": self.Spielmodus, 
            "Schwierigkeit": self.Schwierigkeit, 
            "Spieleranzahl": self.Spieleranzahl 
        }

# Inherit from db.Model instead of Base
class Penalty(db.Model):
    __tablename__ = 'penalties'
    # Consider adding user_id if these are user-specific, or perhaps these are global?
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(150), nullable=False, unique=True)
    probability = Column(Float, nullable=False) # Probability might be better handled contextually
    description = Column(String(255), nullable=True)
    
    def to_dict(self) -> Dict[str, Any]: 
        return { 
            "id": self.id, 
            "name": self.name, 
            "probability": self.probability, 
            "description": self.description 
        }


# --- Core Application Models ---

# Inherit from db.Model instead of Base
# Consider adding UserMixin for Flask-Login standard methods
# from flask_login import UserMixin 
# class User(db.Model, UserMixin): 
class User(db.Model, UserMixin):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    twitch_id = Column(String(50), unique=True, nullable=True, index=True)
    password_hash = Column(String(255), nullable=False) 
    overlay_api_key = Column(String(64), unique=True, nullable=True, index=True)
    email = Column(String(120), unique=True, nullable=False, index=True)
    confirmed = Column(Boolean, nullable=False, default=False)
    confirmed_on = Column(DateTime(timezone=True), nullable=True)
    pro_plan_active = Column(Boolean, nullable=False, default=False)
    pro_plan_expiration_date = Column(DateTime(timezone=True), nullable=True)

    # Relationship to challenges created by this user
    created_challenges = db.relationship("SharedChallenge", back_populates="creator", lazy="select", cascade="all, delete-orphan")
    
    # Relationship to groups this user is a member of
    joined_groups = db.relationship(
        "ChallengeGroup",
        secondary=user_challenge_group_membership_table, # Use the table object
        back_populates="members",
        lazy="select"
    )

    # Relationship to challenges this user is authorized for
    authorized_for_challenges = db.relationship( # Renamed for clarity from User's perspective
        "SharedChallenge",
        secondary=challenge_authorized_users_table, # Use the table object
        back_populates="authorized_users_list", # Matches new name on SharedChallenge
        lazy="select" 
    )

    @property
    def is_active(self) -> bool: return True
    @property
    def is_authenticated(self) -> bool: return True
    @property
    def is_anonymous(self) -> bool: return False
    def get_id(self) -> str: return str(self.id) 

    @property
    def is_twitch_user(self) -> bool:
        return self.twitch_id is not None
    def set_password(self, password: str): 
        self.password_hash = generate_password_hash(password)
    def check_password(self, password: str) -> bool: 
        return check_password_hash(self.password_hash, password)
    def generate_overlay_key(self) -> str:
        new_key = secrets.token_urlsafe(32) 
        self.overlay_api_key = new_key
        return new_key
    def __repr__(self):
        return f"<User {self.username}>"


class SharedChallenge(db.Model):
    __tablename__ = 'shared_challenges'
    id = Column(Integer, primary_key=True, index=True)
    public_id = Column(String(36), unique=True, index=True, nullable=False) 
    creator_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    name = Column(String(120), nullable=True) 
    challenge_data = Column(JSON, nullable=False) 
    penalty_info = Column(JSON, nullable=True) 
    max_groups = Column(Integer, default=10, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.datetime.now(datetime.timezone.utc), nullable=False)
    num_players_per_group = Column(Integer, nullable=False, default=1, server_default='1') 
    timer_current_value_seconds = Column(Integer, nullable=False, default=0, server_default='0')
    timer_is_running = Column(Boolean, nullable=False, default=False, server_default='0')
    timer_last_started_at_utc = Column(DateTime(timezone=True), nullable=True)
    
    groups = db.relationship("ChallengeGroup", back_populates="shared_challenge", cascade="all, delete-orphan", lazy="select")
    creator = db.relationship("User", back_populates="created_challenges")

    # MODIFIED: Renamed relationship attribute and used back_populates
    authorized_users_list = db.relationship( # Changed from 'authorized_users'
        "User",
        secondary=challenge_authorized_users_table, # Use the table object
        back_populates="authorized_for_challenges", # Matches new name on User
        lazy="select"
    )
    def __repr__(self): 
        return f"<SharedChallenge id={self.id} public_id='{self.public_id}'>"
        
    def get_penalty_tab_id(self): 
        """Returns the original source_tab_id if penalties are enabled and info is present."""
        if isinstance(self.penalty_info, dict):
            return self.penalty_info.get('source_tab_id')
        return None

    def get_penalties(self):
        """Returns the list of actual penalty entries embedded in this challenge."""
        if isinstance(self.penalty_info, dict):
            # Ensure 'penalties' key exists and is a list
            penalties_list = self.penalty_info.get('penalties', [])
            return penalties_list if isinstance(penalties_list, list) else []
        return []

    def get_penalty_source_tab_name(self):
        """Returns the name of the original source penalty tab."""
        if isinstance(self.penalty_info, dict):
            return self.penalty_info.get('source_tab_name')
        return None
    
    def get_current_timer_value(self) -> int:
        """Returns the current effective value of the timer in seconds."""
        if self.timer_is_running and self.timer_last_started_at_utc:
            last_started_utc = self.timer_last_started_at_utc
            if last_started_utc.tzinfo is None or last_started_utc.tzinfo.utcoffset(last_started_utc) is None:
                try:
                    last_started_utc = last_started_utc.replace(tzinfo=datetime.timezone.utc)
                except Exception as e:
                    logger.error(f"Error making naive datetime offset-aware for timer_last_started_at_utc: {e}. Value: {self.timer_last_started_at_utc}")
                    return self.timer_current_value_seconds
            try:
                current_utc_time = datetime.datetime.now(datetime.timezone.utc)
                elapsed_since_start = (current_utc_time - last_started_utc).total_seconds()
                return self.timer_current_value_seconds + int(elapsed_since_start)
            except TypeError as te: 
                logger.error(f"TypeError during timer calculation: {te}. current_utc_time: {current_utc_time.isoformat() if current_utc_time else 'None'}, last_started_utc: {last_started_utc.isoformat() if last_started_utc else 'None'}")
                return self.timer_current_value_seconds 
            except Exception as e_calc:
                logger.error(f"Unexpected error during timer elapsed calculation: {e_calc}")
                return self.timer_current_value_seconds 
        return self.timer_current_value_seconds
    
# Inherit from db.Model instead of Base
class ChallengeGroup(db.Model):
    __tablename__ = 'challenge_groups'
    id = Column(Integer, primary_key=True, index=True)
    shared_challenge_id = Column(Integer, ForeignKey('shared_challenges.id'), nullable=False, index=True) 
    group_name = Column(String(80), nullable=False)
    progress_data = Column(JSON, nullable=True, default=lambda: {})
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.datetime.now(datetime.timezone.utc))
    active_penalty_text = Column(String(255), nullable=True)
    player_names = Column(JSON, nullable=True) 
    
    shared_challenge = db.relationship("SharedChallenge", back_populates="groups", lazy="select")
    members = db.relationship( "User", secondary=user_challenge_group_membership_table, back_populates="joined_groups", lazy="select" ) # Use table object
    
    __table_args__ = ( Index('uq_shared_challenge_group_name', 'shared_challenge_id', 'group_name', unique=True), )
    def __repr__(self): return f"<ChallengeGroup id={self.id} name='{self.group_name}' challenge_id={self.shared_challenge_id}>"
