import random
import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

def generate_challenge_logic(
    num_players: int,
    desired_diff: float,
    selected_games: List[str],
    weights: List[float],
    game_vars: Dict[str, Any],
    raw_b2b: int,
    entries: Optional[List[Dict[str, Any]]] = None
) -> Optional[Dict[str, Any]]:
    """
    Generate a win challenge using provided game entries (from local storage).
    
    Parameters:
      num_players: Minimum players required.
      desired_diff: Desired total difficulty.
      selected_games: List of selected game names (lowercase).
      weights: Corresponding weights.
      game_vars: Dictionary of game variables (including allowed modes).
      raw_b2b: Raw back-to-back parameter.
      entries: List of game entry dictionaries.
      
    Returns:
      A dictionary with the challenge result (as HTML) and grouped wins,
      or None if no valid games are available.
    """
   
    
    if entries is None:
        logger.error("No game entries provided.")
        return None

    

    # Filter entries by minimum player count.
    filtered = [entry for entry in entries if int(entry.get("Spieleranzahl", 0)) >= num_players]
    

    # Build dictionary of available games using allowed modes.
    available_games = {}
    for game in selected_games:
        if game not in game_vars:
            logger.warning("Game '%s' not found in game_vars", game)
            continue
        allowed = game_vars[game].get("allowed_modes", [])
        game_entries = [
            entry for entry in filtered 
            if entry.get("Spiel", "").strip().lower() == game and 
               entry.get("Spielmodus", "").strip() in allowed
        ]
        if game_entries:
            available_games[game] = game_entries
            
    # Validate games and weights.
    valid_games = []
    valid_weights = []
    for game, weight in zip(selected_games, weights):
        if game in available_games:
            valid_games.append(game)
            valid_weights.append(weight)
    if not valid_games:
        logger.warning("No valid games after filtering.")
        return None
    

    # Calculate effective back-to-back probability.
    p_eff = (raw_b2b / 10) ** 1.447
    

    segments = []
    total_diff = 0.0
    iteration = 0
    while total_diff < desired_diff:
        iteration += 1
        seg_length = random.choice([2, 3, 4]) if random.uniform(0, 1) < p_eff else 1
        wins = []
        for _ in range(seg_length):
            chosen_game = random.choices(valid_games, weights=valid_weights, k=1)[0]
            chosen_entry = random.choice(available_games[chosen_game])
            wins.append(chosen_entry)
        seg_sum = sum(float(win.get("Schwierigkeit", 0)) for win in wins)
        seg_diff = seg_sum * (1.5 ** (seg_length - 1)) if seg_length > 1 else seg_sum
        segments.append({"wins": wins, "length": seg_length, "seg_diff": seg_diff})
        total_diff += seg_diff
        

    # Group normal segments.
    normal_group = {}
    for seg in [s for s in segments if s["length"] == 1]:
        win = seg["wins"][0]
        key = f"{win.get('Spiel', '')} ({win.get('Spielmodus', '')})"
        if key not in normal_group:
            normal_group[key] = {"count": 0, "diff": 0.0}
        normal_group[key]["count"] += 1
        normal_group[key]["diff"] += float(win.get("Schwierigkeit", 0))
    

    # Group back-to-back segments.
    b2b_grouped = []
    for seg in [s for s in segments if s["length"] > 1]:
        group = {}
        for win in seg["wins"]:
            key = f"{win.get('Spiel', '')} ({win.get('Spielmodus', '')})"
            group[key] = group.get(key, 0) + 1
        b2b_grouped.append({"group": group, "length": seg["length"], "seg_diff": seg["seg_diff"]})
    

    # Format result as HTML.
    result_html = f"<p><strong>Total Difficulty:</strong> {total_diff:.2f}</p>"
    if normal_group:
        result_html += "<h4>Normal Wins:</h4>"
        for key, info in normal_group.items():
            result_html += f"<p>{key}: {info['count']} win(s) (Diff: {info['diff']:.2f})</p>"
    if b2b_grouped:
        result_html += "<h4>Back-to-Back Wins:</h4>"
        for i, seg in enumerate(b2b_grouped, 1):
            result_html += f"<p>Segment {i} ({seg['length']} wins, Diff: {seg['seg_diff']:.2f}):</p>"
            for key, count in seg["group"].items():
                result_html += f"<p style='margin-left:20px;'>{key}: {count} win(s)</p>"

    
    return {"result": result_html, "normal": normal_group, "b2b": b2b_grouped}
