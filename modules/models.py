# modules/models.py
from sqlalchemy import create_engine, Column, Integer, String, Float
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from werkzeug.security import check_password_hash
from config import DATABASE_URL
import logging

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)
logger.debug("Using DATABASE_URL: %s", DATABASE_URL)

Base = declarative_base()

class GameEntry(Base):
    __tablename__ = 'game_entries'
    id = Column(Integer, primary_key=True, autoincrement=True)
    Spiel = Column(String(100), nullable=False)
    Spielmodus = Column(String(100), nullable=False)
    Schwierigkeit = Column(Float, nullable=False)
    Spieleranzahl = Column(Integer, nullable=False)

    def to_dict(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}

class Penalty(Base):
    __tablename__ = 'penaltys'
    id = Column(Integer, primary_key=True, autoincrement=True)
    Strafe = Column(String(100), nullable=False)  # The penalty name/description
    Wahrscheinlichkeit = Column(Float, nullable=False)  # The probability value

    def to_dict(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}
    
class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True)
    username = Column(String(50), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    # Additional methods omitted for brevity
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
    @property
    def is_active(self):
        # Return True if the user is active.
        return True

    @property
    def is_authenticated(self):
        # Return True if the user is authenticated.
        return True

    @property
    def is_anonymous(self):
        # Return True if the user is not logged in.
        return False

    def get_id(self):
        # Return the unique identifier of the user.
        return str(self.id)

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

# Create tables if they don't exist
Base.metadata.create_all(bind=engine)
