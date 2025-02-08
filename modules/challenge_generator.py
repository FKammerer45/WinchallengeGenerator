# modules/challenge_generator.py
import random
from modules.csv_handler import load_entries

def generate_challenge_logic(num_players, desired_diff, selected_game_list, weights, game_vars, spin_b2b_value):
    """
    Erzeugt die Challenge.
    num_players: int, Mindestspielerzahl
    desired_diff: float, gewünschte Schwierigkeit
    selected_game_list: Liste der ausgewählten Spiele (Keys aus game_vars)
    weights: Liste von Gewichtungen, korrespondierend zu selected_game_list
    game_vars: globales Dictionary mit den Einstellungen für jedes Spiel
    spin_b2b_value: int (0-10) aus der Back-to-Back-Spinbox

    Liefert:
      result_str: String mit der Ergebnisformatierung
    """
    # Lade alle Einträge, die die Mindestspielerzahl erfüllen
    entries = load_entries()
    filtered = [e for e in entries if e["Spieleranzahl"] >= num_players]
    # Gruppiere Einträge nach Spiel, berücksichtige erlaubte Gamemodes aus game_vars
    available_games = {}
    for game in selected_game_list:
        allowed = game_vars[game]["allowed_modes"]
        game_entries = [e for e in filtered if e["Spiel"] == game and e["Spielmodus"] in allowed]
        if game_entries:
            available_games[game] = game_entries
    if not available_games:
        return None  # Kein passender Eintrag
    # Back-to-Back Wahrscheinlichkeit transformieren
    p_eff = (spin_b2b_value / 10) ** 1.447
    segments = []
    total_diff = 0.0
    while total_diff < desired_diff:
        if random.uniform(0, 1) < p_eff:
            seg_length = random.choice([2, 3, 4])
        else:
            seg_length = 1
        wins = []
        for _ in range(seg_length):
            chosen_game = random.choices(selected_game_list, weights=weights, k=1)[0]
            chosen_entry = random.choice(available_games[chosen_game])
            wins.append(chosen_entry)
        seg_sum = sum(win["Schwierigkeit"] for win in wins)
        seg_diff = seg_sum * (1.5 ** (seg_length - 1)) if seg_length > 1 else seg_sum
        segments.append({"wins": wins, "length": seg_length, "seg_diff": seg_diff})
        total_diff += seg_diff

    # Gruppiere Ergebnisse
    normal_segments = [seg for seg in segments if seg["length"] == 1]
    normal_group = {}
    for seg in normal_segments:
        win = seg["wins"][0]
        key = f"{win['Spiel']} ({win['Spielmodus']})"
        if key not in normal_group:
            normal_group[key] = {"count": 0, "diff": 0.0}
        normal_group[key]["count"] += 1
        normal_group[key]["diff"] += win["Schwierigkeit"]
    b2b_segments = [seg for seg in segments if seg["length"] > 1]
    b2b_grouped = []
    for seg in b2b_segments:
        group = {}
        for win in seg["wins"]:
            key = f"{win['Spiel']} ({win['Spielmodus']})"
            group[key] = group.get(key, 0) + 1
        b2b_grouped.append({"group": group, "length": seg["length"], "seg_diff": seg["seg_diff"]})
    # Formatieren des Ergebnisses
    result = f"Gesamtschwierigkeit: {total_diff:.2f}\n\n"
    if normal_group:
        result += "Normal Wins:\n"
        for key, info in normal_group.items():
            result += f"  {key}: {info['count']} win(s) (Summe Schwierigkeit: {info['diff']:.2f})\n"
        result += "\n"
    if b2b_grouped:
        result += "Back-to-Back Wins:\n"
        for i, seg in enumerate(b2b_grouped, 1):
            result += f"  Segment {i} ({seg['length']} wins, berechnete Schwierigkeit: {seg['seg_diff']:.2f}):\n"
            for key, count in seg["group"].items():
                result += f"    {key}: {count} win(s)\n"
            result += "\n"
    return result
