# modules/challenge_generator.py
import random
from modules.models import SessionLocal, GameEntry as Game
import logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)


def generate_challenge_logic(num_players, desired_diff, selected_game_list, weights, game_vars, raw_b2b):
    logger.debug("Starting generate_challenge_logic")
    # Check if Game has a 'query' attribute
    if not hasattr(Game, 'query'):
        logger.error("Game model does not have a 'query' attribute. Use SessionLocal().query(Game) instead.")
    else:
        logger.debug("Game model has 'query': %s", getattr(Game, 'query', None))
    try:
        logger.debug("Starting database query using SessionLocal")
        session = SessionLocal()
        entries = [e.to_dict() for e in session.query(Game).all()]
        session.close()
        logger.debug("Retrieved %d entries from the database", len(entries))
    except Exception as ex:
        logger.error("Error querying Game.query.all(): %s", ex)
        raise


    # Use dictionary-style key access
    filtered = [e for e in entries if int(e["Spieleranzahl"]) >= num_players]

    # Build available games dictionary with allowed modes
    available_games = {}
    for game in selected_game_list:
        allowed_modes = game_vars[game]["allowed_modes"]
        game_entries = [
            e for e in filtered 
            if e["Spiel"].strip().lower() == game and e["Spielmodus"].strip() in allowed_modes
        ]
        if game_entries:
            available_games[game] = game_entries

    # Validate games and weights
    valid_games = []
    valid_weights = []
    for game, weight in zip(selected_game_list, weights):
        if game in available_games:
            valid_games.append(game)
            valid_weights.append(weight)
    if not valid_games:
        return None

    # Back-to-Back probability transform
    p_eff = (raw_b2b / 10) ** 1.447

    segments = []
    total_diff = 0.0
    while total_diff < desired_diff:
        seg_length = random.choice([2, 3, 4]) if random.uniform(0, 1) < p_eff else 1
        wins = []
        for _ in range(seg_length):
            chosen_game = random.choices(valid_games, weights=valid_weights, k=1)[0]
            chosen_entry = random.choice(available_games[chosen_game])
            wins.append(chosen_entry)
        seg_sum = sum(float(win["Schwierigkeit"]) for win in wins)
        seg_diff = seg_sum * (1.5 ** (seg_length - 1)) if seg_length > 1 else seg_sum
        segments.append({"wins": wins, "length": seg_length, "seg_diff": seg_diff})
        total_diff += seg_diff

    # Group normal segments
    normal_segments = [seg for seg in segments if seg["length"] == 1]
    normal_group = {}
    for seg in normal_segments:
        win = seg["wins"][0]
        key = f"{win['Spiel']} ({win['Spielmodus']})"
        if key not in normal_group:
            normal_group[key] = {"count": 0, "diff": 0.0}
        normal_group[key]["count"] += 1
        normal_group[key]["diff"] += float(win["Schwierigkeit"])

    # Group back-to-back segments
    b2b_segments = [seg for seg in segments if seg["length"] > 1]
    b2b_grouped = []
    for seg in b2b_segments:
        group = {}
        for win in seg["wins"]:
            key = f"{win['Spiel']} ({win['Spielmodus']})"
            group[key] = group.get(key, 0) + 1
        b2b_grouped.append({"group": group, "length": seg["length"], "seg_diff": seg["seg_diff"]})

    # Format the result as HTML
    result = f"<p><strong>Total Difficulty:</strong> {total_diff:.2f}</p>"
    if normal_group:
        result += "<h4>Normal Wins:</h4>"
        for key, info in normal_group.items():
            result += f"<p>{key}: {info['count']} win(s) (Total Difficulty: {info['diff']:.2f})</p>"
    if b2b_grouped:
        result += "<h4>Back-to-Back Wins:</h4>"
        for i, seg in enumerate(b2b_grouped, 1):
            result += f"<p>Segment {i} ({seg['length']} wins, Calculated Difficulty: {seg['seg_diff']:.2f}):</p>"
            for key, count in seg["group"].items():
                result += f"<p style='margin-left:20px;'>{key}: {count} win(s)</p>"
    
    return {"result": result, "normal": normal_group, "b2b": b2b_grouped}
