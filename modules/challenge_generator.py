# modules/challenge_generator.py
import random
import logging
from typing import List, Dict, Any, Optional
from modules.models import SessionLocal, GameEntry as Game

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

def generate_challenge_logic(
    num_players: int,
    desired_diff: float,
    selected_games: List[str],
    weights: List[float],
    game_vars: Dict[str, Any],
    raw_b2b: int
) -> Optional[Dict[str, Any]]:
    logger.debug(
        "Starting challenge generation: num_players=%d, desired_diff=%.2f, raw_b2b=%d",
        num_players, desired_diff, raw_b2b
    )

    # Check for the 'query' attribute on the Game model.
    if not hasattr(Game, 'query'):
        logger.error("Game model missing 'query' attribute. Use SessionLocal().query(Game) instead.")
    else:
        logger.debug("Game model query attribute exists: %s", getattr(Game, 'query', None))

    # Query the database for game entries.
    try:
        logger.debug("Querying database for game entries")
        session = SessionLocal()
        entries = [entry.to_dict() for entry in session.query(Game).all()]
        logger.debug("Retrieved %d entries from the database", len(entries))
    except Exception as ex:
        logger.exception("Error querying game entries: %s", ex)
        raise
    finally:
        session.close()

    # Filter entries based on minimum player count.
    filtered_entries = [entry for entry in entries if int(entry.get("Spieleranzahl", 0)) >= num_players]
    logger.debug("Filtered entries count (Spieleranzahl >= %d): %d", num_players, len(filtered_entries))

    # Build dictionary of available games using allowed modes.
    available_games = {}
    for game in selected_games:
        if game not in game_vars:
            logger.warning("Selected game '%s' not found in game_vars", game)
            continue
        allowed_modes = game_vars[game].get("allowed_modes", [])
        game_entries = [
            entry for entry in filtered_entries 
            if entry.get("Spiel", "").strip().lower() == game and entry.get("Spielmodus", "").strip() in allowed_modes
        ]
        if game_entries:
            available_games[game] = game_entries
            logger.debug("Game '%s' has %d entries after filtering by allowed modes", game, len(game_entries))
        else:
            logger.debug("No entries found for game '%s' with allowed modes: %s", game, allowed_modes)

    # Validate games and weights.
    valid_games = []
    valid_weights = []
    for game, weight in zip(selected_games, weights):
        if game in available_games:
            valid_games.append(game)
            valid_weights.append(weight)
    if not valid_games:
        logger.warning("No valid games available after filtering.")
        return None
    logger.debug("Valid games: %s with weights: %s", valid_games, valid_weights)

    # Transform back-to-back probability.
    p_eff = (raw_b2b / 10) ** 1.447
    logger.debug("Calculated effective B2B probability (p_eff): %.4f", p_eff)

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
        logger.debug(
            "Iteration %d: seg_length=%d, seg_sum=%.2f, seg_diff=%.2f, total_diff=%.2f",
            iteration, seg_length, seg_sum, seg_diff, total_diff
        )

    # Group normal segments (single wins).
    normal_segments = [seg for seg in segments if seg["length"] == 1]
    normal_group = {}
    for seg in normal_segments:
        win = seg["wins"][0]
        key = f"{win.get('Spiel', '')} ({win.get('Spielmodus', '')})"
        if key not in normal_group:
            normal_group[key] = {"count": 0, "diff": 0.0}
        normal_group[key]["count"] += 1
        normal_group[key]["diff"] += float(win.get("Schwierigkeit", 0))
    logger.debug("Normal group: %s", normal_group)

    # Group back-to-back segments.
    b2b_segments = [seg for seg in segments if seg["length"] > 1]
    b2b_grouped = []
    for seg in b2b_segments:
        group = {}
        for win in seg["wins"]:
            key = f"{win.get('Spiel', '')} ({win.get('Spielmodus', '')})"
            group[key] = group.get(key, 0) + 1
        b2b_grouped.append({"group": group, "length": seg["length"], "seg_diff": seg["seg_diff"]})
    logger.debug("Back-to-back group: %s", b2b_grouped)

    # Format the result as HTML.
    result_html = f"<p><strong>Total Difficulty:</strong> {total_diff:.2f}</p>"
    if normal_group:
        result_html += "<h4>Normal Wins:</h4>"
        for key, info in normal_group.items():
            result_html += f"<p>{key}: {info['count']} win(s) (Total Difficulty: {info['diff']:.2f})</p>"
    if b2b_grouped:
        result_html += "<h4>Back-to-Back Wins:</h4>"
        for i, seg in enumerate(b2b_grouped, 1):
            result_html += f"<p>Segment {i} ({seg['length']} wins, Calculated Difficulty: {seg['seg_diff']:.2f}):</p>"
            for key, count in seg["group"].items():
                result_html += f"<p style='margin-left:20px;'>{key}: {count} win(s)</p>"

    logger.debug("Challenge generation completed. Total difficulty: %.2f", total_diff)
    return {"result": result_html, "normal": normal_group, "b2b": b2b_grouped}
