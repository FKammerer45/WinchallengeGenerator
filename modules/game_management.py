# modules/game_management.py
import logging
from typing import List, Tuple
from modules.models import GameEntry as Game, SessionLocal

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

class GameManager:
    @staticmethod
    def _validate_game_input(game_name: str, game_mode: str, difficulty: float, number_of_players: int) -> Tuple[float, int]:
        """
        Validates and converts input values for a game entry.
        
        Parameters:
          game_name: The game name.
          game_mode: The game mode.
          difficulty: The difficulty value (expected between 0 and 10).
          number_of_players: The number of players (integer, >= 1).
        
        Returns:
          A tuple (difficulty_val, number_of_players_val) as a float and an int.
          
        Raises:
          ValueError: If any of the inputs are missing or invalid.
        """
        if not (game_name and game_mode and difficulty is not None and number_of_players is not None):
            raise ValueError("All fields must be filled in.")
        try:
            difficulty_val = float(difficulty)
            if not (0 <= difficulty_val <= 10):
                raise ValueError("Difficulty must be a number between 0 and 10.")
        except ValueError:
            raise ValueError("Difficulty must be a number between 0 and 10.")
        try:
            number_of_players_val = int(number_of_players)
            if number_of_players_val < 1:
                raise ValueError("Number of players must be at least 1.")
        except ValueError:
            raise ValueError("Number of players must be an integer and at least 1.")
        return difficulty_val, number_of_players_val

    @staticmethod
    def get_all_entries() -> List[dict]:
        """
        Returns all game entries from the SQL database as a list of dictionaries.
        """
        session = SessionLocal()
        try:
            entries = session.query(Game).all()
            
            return [entry.to_dict() for entry in entries]
        except Exception as ex:
            logger.exception("Error fetching game entries: %s", ex)
            raise
        finally:
            session.close()

    @staticmethod
    def add_entry(game_name: str, game_mode: str, difficulty: float, number_of_players: int) -> str:
        """
        Adds a new game entry to the database.
        
        Parameters:
          game_name: Game name.
          game_mode: Game mode.
          difficulty: Difficulty (between 0 and 10).
          number_of_players: Number of players (>= 1).
        
        Returns:
          "Entry added" on success.
          
        Raises:
          Exception: If adding the entry fails.
        """
        difficulty_val, number_of_players_val = GameManager._validate_game_input(
            game_name, game_mode, difficulty, number_of_players
        )

        session = SessionLocal()
        try:
            new_entry = Game(
                Spiel=game_name,
                Spielmodus=game_mode,
                Schwierigkeit=difficulty_val,
                Spieleranzahl=number_of_players_val
            )
            session.add(new_entry)
            session.commit()
           
            return "Entry added"
        except Exception as ex:
            session.rollback()
            logger.exception("Error adding new game entry: %s", ex)
            raise
        finally:
            session.close()

    @staticmethod
    def update_entry(game_id: int, game_name: str, game_mode: str, difficulty: float, number_of_players: int) -> str:
        """
        Updates the game entry with the given game_id.
        
        Parameters:
          game_id: The ID of the game entry to update.
          game_name, game_mode, difficulty, number_of_players: New values.
        
        Returns:
          "Entry updated" on success.
          
        Raises:
          Exception: If the update fails or the entry doesn't exist.
        """
        difficulty_val, number_of_players_val = GameManager._validate_game_input(
            game_name, game_mode, difficulty, number_of_players
        )

        session = SessionLocal()
        try:
            game = session.query(Game).get(game_id)
            if not game:
                raise IndexError("Selected entry does not exist.")
            game.Spiel = game_name
            game.Spielmodus = game_mode
            game.Schwierigkeit = difficulty_val
            game.Spieleranzahl = number_of_players_val
            session.commit()
           
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
          "Entry deleted" on success.
          
        Raises:
          Exception: If deletion fails or the entry doesn't exist.
        """
        session = SessionLocal()
        try:
            entry = session.query(Game).filter(Game.id == game_id).first()
            if not entry:
                raise IndexError("No entry selected or entry does not exist.")
            session.delete(entry)
            session.commit()
            
            return "Entry deleted"
        except Exception as ex:
            session.rollback()
            logger.exception("Error deleting game entry with id %s: %s", game_id, ex)
            raise
        finally:
            session.close()
