# In modules/models.py

from sqlalchemy import create_engine, Column, Integer, String, Float
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from config import DATABASE_URL
from werkzeug.security import generate_password_hash, check_password_hash
from flask_login import UserMixin

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

class User(Base, UserMixin):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True)
    username = Column(String(50), unique=True, nullable=False)
    password_hash = Column(String(128), nullable=False)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def get_id(self):
        return str(self.id)

    def to_dict(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}
    
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

# Create tables if they don't exist
Base.metadata.create_all(bind=engine)
