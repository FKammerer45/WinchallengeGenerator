# modules/challenge_generator.py
import random
from modules.csv_handler import load_entries
from config import CSV_FILE

def generate_challenge_logic(num_players, desired_diff, selected_game_list, weights, game_vars, raw_b2b):
    # Lade alle Einträge, die die Mindestspielerzahl erfüllen.
    entries = load_entries(CSV_FILE, ["Spiel", "Spielmodus", "Schwierigkeit", "Spieleranzahl"])

    filtered = [e for e in entries if e["Spieleranzahl"] >= num_players]
    
    # Erstelle ein Dictionary verfügbarer Spiele, basierend auf den erlaubten Gamemodes.
    available_games = {}
    for game in selected_game_list:
        allowed = game_vars[game]["allowed_modes"]

        game_entries = [e for e in filtered if e["Spiel"].strip().lower() == game and e["Spielmodus"].strip() in allowed]

        if game_entries:
            available_games[game] = game_entries
    
    # Filtere die ausgewählten Spiele (und deren Gewichte) so, dass nur Spiele mit verfügbaren Einträgen bleiben.
    valid_games = []
    valid_weights = []
    for game, weight in zip(selected_game_list, weights):
        if game in available_games:
            valid_games.append(game)
            valid_weights.append(weight)
    if not valid_games:
        return None  # Keine Spiele gefunden

    # Back-to-Back Wahrscheinlichkeit transformieren
    p_eff = (raw_b2b / 10) ** 1.447

    segments = []
    total_diff = 0.0
    while total_diff < desired_diff:
        if random.uniform(0, 1) < p_eff:
            seg_length = random.choice([2, 3, 4])
        else:
            seg_length = 1
        wins = []
        for _ in range(seg_length):
            chosen_game = random.choices(valid_games, weights=valid_weights, k=1)[0]
            chosen_entry = random.choice(available_games[chosen_game])
            wins.append(chosen_entry)
        seg_sum = sum(win["Schwierigkeit"] for win in wins)
        seg_diff = seg_sum * (1.5 ** (seg_length - 1)) if seg_length > 1 else seg_sum
        segments.append({"wins": wins, "length": seg_length, "seg_diff": seg_diff})
        total_diff += seg_diff
    
    # Gruppiere Normal Wins
    normal_segments = [seg for seg in segments if seg["length"] == 1]
    normal_group = {}
    for seg in normal_segments:
        win = seg["wins"][0]
        key = f"{win['Spiel']} ({win['Spielmodus']})"
        if key not in normal_group:
            normal_group[key] = {"count": 0, "diff": 0.0}
        normal_group[key]["count"] += 1
        normal_group[key]["diff"] += win["Schwierigkeit"]

    # Gruppiere Back-to-Back Segmente
    b2b_segments = [seg for seg in segments if seg["length"] > 1]
    b2b_grouped = []
    for seg in b2b_segments:
        group = {}
        for win in seg["wins"]:
            key = f"{win['Spiel']} ({win['Spielmodus']})"
            group[key] = group.get(key, 0) + 1
        b2b_grouped.append({"group": group, "length": seg["length"], "seg_diff": seg["seg_diff"]})

    # Formatieren des Ergebnisses als HTML
    result = f"<p><strong>Gesamtschwierigkeit:</strong> {total_diff:.2f}</p>"
    if normal_group:
        result += "<h4>Normal Wins:</h4>"
        for key, info in normal_group.items():
            result += f"<p>{key}: {info['count']} win(s) (Summe Schwierigkeit: {info['diff']:.2f})</p>"
    if b2b_grouped:
        result += "<h4>Back-to-Back Wins:</h4>"
        for i, seg in enumerate(b2b_grouped, 1):
            result += f"<p>Segment {i} ({seg['length']} wins, berechnete Schwierigkeit: {seg['seg_diff']:.2f}):</p>"
            for key, count in seg["group"].items():
                result += f"<p style='margin-left:20px;'>{key}: {count} win(s)</p>"
    
            
    return {"result": result, "normal": normal_group, "b2b": b2b_grouped}

