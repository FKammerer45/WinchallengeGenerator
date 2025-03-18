
# modules/game_preferences.py

game_vars = {}

def initialize_game_vars(entries):
    unique_games = {entry["Spiel"].strip().lower() for entry in entries}
    gv = {}
    for game in unique_games:
        gv[game] = {
            "selected": False,
            "weight": 1.0,
            "allowed_modes": [],
            "available_modes": []
        }
    for entry in entries:
        game = entry["Spiel"].strip().lower()
        mode = entry["Spielmodus"].strip()
        if game in gv:
            if mode not in gv[game]["available_modes"]:
                gv[game]["available_modes"].append(mode)
            if mode not in gv[game]["allowed_modes"]:
                gv[game]["allowed_modes"].append(mode)
    return gv




# The rest of the functions remain unchanged

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
