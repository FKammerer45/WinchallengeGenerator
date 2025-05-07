import random
import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG) # Ensure debug logging is enabled

# --- Constants ---
# Define B2B segment lengths and their corresponding weights
# Adjust weights as needed to fine-tune probabilities
# Example: 65% chance for length 2, 25% for 3, 8% for 4, 2% for 5 (if B2B is triggered)
B2B_LENGTHS = [2, 3, 4, 5]
B2B_WEIGHTS = [0.65, 0.25, 0.08, 0.02]

# Original constants (can be adjusted)
P_EFF_EXPONENT = 1.447
B2B_DIFFICULTY_MULTIPLIER_BASE = 1.5
MAX_GENERATION_ITERATIONS = 1000 # Safeguard
OVERSHOOT_THRESHOLD_FACTOR = 0.95 # Factor to check if we are close to desired_diff


def generate_challenge_logic(
    num_players: int,
    desired_diff: float,
    selected_games: List[str],
    weights: List[float],
    game_vars: Dict[str, Any],
    raw_b2b: int,
    entries: Optional[List[Dict[str, Any]]] = None,
    selected_modes: Optional[Dict[str, List[str]]] = None
) -> Optional[Dict[str, Any]]:
    """
    Generate a win challenge using provided game entries with improved difficulty
    control and graduated B2B length probability.

    Parameters:
      num_players: Minimum players required.
      desired_diff: Desired total difficulty.
      selected_games: List of selected game names (lowercase).
      weights: Corresponding weights.
      game_vars: Dictionary of game variables (including allowed modes).
      raw_b2b: Raw back-to-back parameter (0-10).
      entries: List of game entry dictionaries.
      selected_modes: Dict mapping game name to selected modes.

    Returns:
      A dictionary containing the generated challenge details or None on failure.
    """
    if entries is None:
        logger.error("No game entries provided.")
        return None

    # --- Filtering by player count and modes (remains the same) ---
    filtered = [entry for entry in entries if int(entry.get("Spieleranzahl", 0)) >= num_players]
    logger.debug("Filtered entries count by player number: %d out of %d", len(filtered), len(entries))
    if not filtered and entries:
        logger.warning("No entries passed the minimum player count requirement: %d", num_players)

    available_games = {}
    for game_name_lower in selected_games:
        if game_name_lower not in game_vars:
            logger.warning("Game '%s' not found in game_vars during mode filtering.", game_name_lower)
            continue

        allowed_modes_for_game = game_vars[game_name_lower].get("allowed_modes", [])
        if selected_modes and game_name_lower in selected_modes:
            client_selected_modes = selected_modes[game_name_lower]
            allowed_modes_for_game = list(set(allowed_modes_for_game) & set(client_selected_modes))
            logger.debug("Game '%s': Using client modes: %s", game_name_lower, allowed_modes_for_game)

        game_specific_entries = [
            entry for entry in filtered
            if entry.get("Spiel", "").strip().lower() == game_name_lower and \
               entry.get("Spielmodus", "").strip() in allowed_modes_for_game
        ]

        logger.debug("Game '%s': Found %d matching entries (Allowed modes: %s)",
                     game_name_lower, len(game_specific_entries), allowed_modes_for_game)
        if game_specific_entries:
            available_games[game_name_lower] = game_specific_entries

    logger.debug("Available games after all filtering: %s", list(available_games.keys()))

    valid_games = []
    valid_weights = []
    if not available_games:
        logger.warning("No games are available after filtering by player count and selected modes.")
        return None

    for game, weight in zip(selected_games, weights):
        if game in available_games:
            valid_games.append(game)
            valid_weights.append(weight)

    logger.debug("Valid games for generation: %s with weights: %s", valid_games, valid_weights)

    if not valid_games:
        logger.warning("No valid games to pick from after all filters. Selected: %s, Available: %s",
                       selected_games, list(available_games.keys()))
        return None
    # --- End Filtering ---

    # Calculate effective back-to-back probability (remains the same)
    p_eff_raw = max(0, min(10, raw_b2b)) / 10.0
    p_eff = p_eff_raw ** P_EFF_EXPONENT
    logger.debug("Effective back-to-back probability (p_eff from %s -> %s): %.4f", raw_b2b, p_eff_raw, p_eff)

    segments = []
    total_diff = 0.0
    iteration = 0
    while total_diff < desired_diff:
        iteration += 1
        if iteration > MAX_GENERATION_ITERATIONS:
            logger.warning(f"Challenge generation exceeded max iterations ({MAX_GENERATION_ITERATIONS}).")
            break

        # --- MODIFIED Segment Length Determination ---
        seg_length = 1 # Default to single win

        # Check if we are close to the target difficulty
        is_near_target = total_diff >= desired_diff * OVERSHOOT_THRESHOLD_FACTOR

        if is_near_target:
            logger.debug("Near target difficulty (%.2f / %.2f). Forcing next segment length to 1.",
                         total_diff, desired_diff)
            seg_length = 1
        else:
            # Determine if this segment should be B2B based on probability
            is_b2b_segment = random.uniform(0, 1) < p_eff
            if is_b2b_segment:
                # Use weighted choice for B2B lengths 2 to 5
                try:
                    chosen_lengths = random.choices(B2B_LENGTHS, weights=B2B_WEIGHTS, k=1)
                    seg_length = chosen_lengths[0]
                    logger.debug("B2B segment triggered. Chosen length: %d", seg_length)
                except ValueError as e:
                    logger.error(f"Error in random.choices for B2B length (weights okay?): {e}. Defaulting length to 2.")
                    seg_length = 2 # Fallback if weights are wrong
            else:
                 # It remains a single win segment
                 seg_length = 1
                 logger.debug("Normal segment (length 1) chosen.")
        # --- END MODIFIED Segment Length Determination ---

        # --- Segment Content Generation (largely unchanged) ---
        wins = []
        current_segment_game_names = []

        for i in range(seg_length):
            if not valid_games:
                logger.error("Ran out of valid_games during segment generation.")
                # Break inner loop, the outer loop might break if total_diff not met
                break

            chosen_game_name = random.choices(valid_games, weights=valid_weights, k=1)[0]

            if not available_games.get(chosen_game_name):
                logger.error(f"Chosen game '{chosen_game_name}' has no entries in available_games. Logic error.")
                continue # Skip this win attempt

            chosen_entry = random.choice(available_games[chosen_game_name])
            wins.append(chosen_entry)
            current_segment_game_names.append(f"{chosen_entry.get('Spiel', '?')} ({chosen_entry.get('Spielmodus','?')})") # Log game and mode

        # If segment generation failed to add any wins (e.g., due to errors), skip
        if not wins:
            logger.warning("A segment was generated with no wins. Skipping this segment.")
            continue
        # --- End Segment Content Generation ---

        # Calculate segment difficulty (remains the same)
        seg_sum = sum(float(win.get("Schwierigkeit", 0)) for win in wins)
        seg_diff = seg_sum * (B2B_DIFFICULTY_MULTIPLIER_BASE ** (seg_length - 1)) if seg_length > 1 else seg_sum

        # Append segment and update total difficulty
        segments.append({"wins": wins, "length": seg_length, "seg_diff": seg_diff})
        total_diff += seg_diff
        logger.debug("Iteration %d: Added Segment -> Length: %d, Games: [%s], Seg Diff: %.2f, New Total Diff: %.2f",
                     iteration, seg_length, ", ".join(current_segment_game_names), seg_diff, total_diff)

    # --- Post-processing and Grouping (remains the same) ---
    logger.info("Final generated difficulty: %.2f (Desired: %.2f) after %d iterations.",
                total_diff, desired_diff, iteration)

    normal_group = {}
    b2b_grouped = []

    # Group normal segments (length 1)
    for seg in [s for s in segments if s["length"] == 1]:
        win = seg["wins"][0]
        key = f"{win.get('Spiel', 'Unknown Game')} ({win.get('Spielmodus', 'Unknown Mode')})"
        if key not in normal_group:
            normal_group[key] = {"count": 0, "diff": 0.0}
        normal_group[key]["count"] += 1
        normal_group[key]["diff"] += float(win.get("Schwierigkeit", 0))

    # Group B2B segments (length > 1)
    for seg_idx, seg in enumerate([s for s in segments if s["length"] > 1]):
        group_counts_in_segment = {}
        for win in seg["wins"]:
            key = f"{win.get('Spiel', 'Unknown Game')} ({win.get('Spielmodus', 'Unknown Mode')})"
            group_counts_in_segment[key] = group_counts_in_segment.get(key, 0) + 1

        b2b_grouped.append({
            "segment_index_1_based": seg_idx + 1,
            "group": group_counts_in_segment,
            "length": seg["length"],
            "seg_diff": seg["seg_diff"]
        })
    # --- End Post-processing ---

    return {
        "normal": normal_group,
        "b2b": b2b_grouped,
        "total_difficulty": total_diff # Return the actual generated difficulty
    }