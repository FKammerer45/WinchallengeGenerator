# modules/game_preferences.py
import logging
from typing import List, Dict, Iterable, Any

logger = logging.getLogger(__name__)

# Global dictionary for game preferences
game_vars: Dict[str, Dict[str, Any]] = {}

def initialize_game_vars(entries: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """
    Initializes game preferences based on provided entries.

    :param entries: A list of dictionaries with game entry data.
    :return: A dictionary mapping each game (in lowercase) to its preferences.
    """
    # Gather unique game names (lowercased)
    unique_games = {entry["Spiel"].strip().lower() for entry in entries if "Spiel" in entry}
    prefs: Dict[str, Dict[str, Any]] = {}
    for game in unique_games:
        prefs[game] = {
            "selected": False,
            "weight": 1.0,
            "allowed_modes": [],
            "available_modes": []
        }
    # Populate available and allowed modes for each game
    for entry in entries:
        game_name = entry.get("Spiel", "").strip().lower()
        mode = entry.get("Spielmodus", "").strip()
        if game_name in prefs:
            if mode and mode not in prefs[game_name]["available_modes"]:
                prefs[game_name]["available_modes"].append(mode)
            if mode and mode not in prefs[game_name]["allowed_modes"]:
                prefs[game_name]["allowed_modes"].append(mode)
    
    return prefs

def update_allowed_modes(game: str, new_allowed_modes: Iterable[str]) -> bool:
    """
    Aktualisiert für das angegebene Spiel die erlaubten Spielmodi.

    :param game: Name des Spiels (String)
    :param new_allowed_modes: Iterable von Strings (neue erlaubte Modi)
    :return: True, wenn erfolgreich; sonst False.
    """
    if game in game_vars:
        # Convert the new allowed modes to a unique list
        game_vars[game]["allowed_modes"] = list(set(new_allowed_modes))
        
        return True
    logger.warning("Game '%s' not found in game_vars during update_allowed_modes", game)
    return False

def set_game_weight(game: str, weight: float) -> bool:
    """
    Setzt für das angegebene Spiel das Gewicht.

    :param game: Name des Spiels (String)
    :param weight: Zahl (wird in float umgewandelt)
    :return: True, wenn erfolgreich; sonst False.
    """
    if game in game_vars:
        try:
            game_vars[game]["weight"] = float(weight)
           
            return True
        except ValueError:
            logger.error("Invalid weight value for game '%s': %s", game, weight)
            return False
    logger.warning("Game '%s' not found in game_vars during set_game_weight", game)
    return False

def select_game(game: str, selected: bool = True) -> bool:
    """
    Setzt den Selektionsstatus für das angegebene Spiel.

    :param game: Name des Spiels (String)
    :param selected: Boolean (True, wenn ausgewählt, sonst False)
    :return: True, wenn erfolgreich; sonst False.
    """
    if game in game_vars:
        game_vars[game]["selected"] = bool(selected)
        
        return True
    logger.warning("Game '%s' not found in game_vars during select_game", game)
    return False
