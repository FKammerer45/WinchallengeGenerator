# In modules/models.py

from sqlalchemy import create_engine, Column, Integer, String, Float
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from config import DATABASE_URL

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

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

# Create tables if they don't exist
Base.metadata.create_all(bind=engine)
