# modules/game_preferences.py

# Globales Dictionary, das die Spielpräferenzen speichert.

game_vars = {}

# modules/game_preferences.py

game_vars = {}

def initialize_game_vars(entries):
    global game_vars
    game_vars = {}  # Zurücksetzen
    # Standardisiere jeden Spielnamen: entferne Leerzeichen und, falls gewünscht, wandle in Kleinbuchstaben um
    unique_games = {entry["Spiel"].strip().lower() for entry in entries}
    for game in unique_games:
        available_modes = {entry["Spielmodus"].strip() for entry in entries if entry["Spiel"].strip().lower() == game}
        game_vars[game] = {
            "selected": False,
            "weight": 1.0,
            "allowed_modes": list(available_modes),
            "available_modes": list(available_modes)
        }
    return game_vars

def update_allowed_modes(game, new_allowed_modes):
    """
    Aktualisiert für das angegebene Spiel die erlaubten Spielmodi.
    
    Parameters:
      - game: Name des Spiels (String)
      - new_allowed_modes: Iterable von Strings (neue erlaubte Modi)
    
    Rückgabe:
      True, wenn erfolgreich; sonst False.
    """
    if game in game_vars:
        game_vars[game]["allowed_modes"] = set(new_allowed_modes)
        return True
    return False

def set_game_weight(game, weight):
    """
    Setzt für das angegebene Spiel das Gewicht.
    
    Parameters:
      - game: Name des Spiels (String)
      - weight: Zahl (wird in float umgewandelt)
    
    Rückgabe:
      True, wenn erfolgreich; sonst False.
    """
    if game in game_vars:
        try:
            game_vars[game]["weight"] = float(weight)
            return True
        except ValueError:
            return False
    return False

def select_game(game, selected=True):
    """
    Setzt den Selektionsstatus für das angegebene Spiel.
    
    Parameters:
      - game: Name des Spiels (String)
      - selected: Boolean (True, wenn ausgewählt, sonst False)
    
    Rückgabe:
      True, wenn erfolgreich; sonst False.
    """
    if game in game_vars:
        game_vars[game]["selected"] = bool(selected)
        return True
    return False
