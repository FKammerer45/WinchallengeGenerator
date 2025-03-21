# modules/game_management.py
import logging
from typing import List
from modules.models import GameEntry as Game, SessionLocal

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

class GameManager:
    @staticmethod
    def get_all_entries() -> List[dict]:
        """
        Returns all game entries from the SQL database as a list of dictionaries.
        """
        session = SessionLocal()
        try:
            entries = session.query(Game).all()
            logger.debug("Fetched %d game entries", len(entries))
            return [entry.to_dict() for entry in entries]
        except Exception as ex:
            logger.exception("Error fetching game entries: %s", ex)
            raise
        finally:
            session.close()

    @staticmethod
    def add_entry(spiel: str, spielmodus: str, schwierigkeit: float, spieleranzahl: int) -> str:
        """
        Adds a new game entry to the database.
        
        Parameters:
          spiel: Game name (String)
          spielmodus: Game mode (String)
          schwierigkeit: Difficulty (Number between 0 and 10)
          spieleranzahl: Number of players (Integer, >= 1)
        
        Returns:
          Success message or raises an Exception.
        """
        # Validate input
        if not (spiel and spielmodus and schwierigkeit is not None and spieleranzahl is not None):
            raise ValueError("Alle Felder müssen ausgefüllt werden.")
        try:
            schwierigkeit = float(schwierigkeit)
            if not (0 <= schwierigkeit <= 10):
                raise ValueError("Schwierigkeit muss eine Zahl zwischen 0 und 10 sein.")
        except ValueError:
            raise ValueError("Schwierigkeit muss eine Zahl zwischen 0 und 10 sein.")
        try:
            spieleranzahl = int(spieleranzahl)
            if spieleranzahl < 1:
                raise ValueError("Spieleranzahl muss mindestens 1 sein.")
        except ValueError:
            raise ValueError("Spieleranzahl muss eine ganze Zahl und mindestens 1 sein.")

        session = SessionLocal()
        try:
            new_entry = Game(
                Spiel=spiel,
                Spielmodus=spielmodus,
                Schwierigkeit=schwierigkeit,
                Spieleranzahl=spieleranzahl
            )
            session.add(new_entry)
            session.commit()
            logger.debug("Added new game entry with id %s", new_entry.id)
            return "Entry added"
        except Exception as ex:
            session.rollback()
            logger.exception("Error adding new game entry: %s", ex)
            raise
        finally:
            session.close()

    @staticmethod
    def update_entry(game_id: int, spiel: str, spielmodus: str, schwierigkeit: float, spieleranzahl: int) -> str:
        """
        Updates the game entry with the given game_id.
        
        Parameters:
          game_id: The ID of the game entry to update.
          spiel, spielmodus, schwierigkeit, spieleranzahl: New values.
        
        Returns:
          Success message or raises an Exception.
        """
        # Validate input
        if not (spiel and spielmodus and schwierigkeit is not None and spieleranzahl is not None):
            raise ValueError("Alle Felder müssen ausgefüllt werden.")
        try:
            schwierigkeit = float(schwierigkeit)
            if not (0 <= schwierigkeit <= 10):
                raise ValueError("Schwierigkeit muss eine Zahl zwischen 0 und 10 sein.")
        except ValueError:
            raise ValueError("Schwierigkeit muss eine Zahl zwischen 0 und 10 sein.")
        try:
            spieleranzahl = int(spieleranzahl)
            if spieleranzahl < 1:
                raise ValueError("Spieleranzahl muss mindestens 1 sein.")
        except ValueError:
            raise ValueError("Spieleranzahl muss eine ganze Zahl und mindestens 1 sein.")

        session = SessionLocal()
        try:
            game = session.query(Game).get(game_id)
            if not game:
                raise IndexError("Selected entry does not exist.")
            game.Spiel = spiel
            game.Spielmodus = spielmodus
            game.Schwierigkeit = schwierigkeit
            game.Spieleranzahl = spieleranzahl
            session.commit()
            logger.debug("Updated game entry with id %s", game_id)
            return "Entry updated"
        except Exception as ex:
            session.rollback()
            logger.exception("Error updating game entry with id %s: %s", game_id, ex)
            raise
        finally:
            session.close()

    @staticmethod
    def delete_entry(game_id: int) -> str:
        """
        Deletes the game entry with the given game_id.
        
        Parameters:
          game_id: The ID of the game entry to delete.
        
        Returns:
          Success message or raises an Exception.
        """
        session = SessionLocal()
        try:
            entry = session.query(Game).filter(Game.id == game_id).first()
            if not entry:
                raise IndexError("No entry selected or entry does not exist.")
            session.delete(entry)
            session.commit()
            logger.debug("Deleted game entry with id %s", game_id)
            return "Entry deleted"
        except Exception as ex:
            session.rollback()
            logger.exception("Error deleting game entry with id %s: %s", game_id, ex)
            raise
        finally:
            session.close()



