# app/modules/default_definitions.py

"""
This file defines the structure and content for the system-initialized default tabs
for Games and Penalties. These definitions are used to create these tabs for
users when they first interact with the respective configuration pages.
"""

# --- Default Game Tab Definitions ---

SHOOTER_GAMES_ENTRIES = [
    {'Spiel': 'CSGO', 'Spielmodus': 'Ranked', 'Schwierigkeit': 7.0, 'Spieleranzahl': 5, 'weight': 1.0, 'id': 'db-csgo-ranked', 'tags': ["FirstPerson"]},
    {'Spiel': 'CSGO', 'Spielmodus': 'Premier', 'Schwierigkeit': 7.0, 'Spieleranzahl': 5, 'weight': 1.0, 'id': 'db-csgo-premier', 'tags': ["FirstPerson"]},
    {'Spiel': 'Valorant', 'Spielmodus': 'Ranked', 'Schwierigkeit': 6.0, 'Spieleranzahl': 5, 'weight': 1.0, 'id': 'db-valorant-ranked', 'tags': ["FirstPerson"]},
    {'Spiel': 'Apex Legends', 'Spielmodus': 'Trios', 'Schwierigkeit': 7.0, 'Spieleranzahl': 3, 'weight': 1.0, 'id': 'db-apex-trios', 'tags': ["FirstPerson"]},
    {'Spiel': 'Apex Legends', 'Spielmodus': 'Duos', 'Schwierigkeit': 7.0, 'Spieleranzahl': 2, 'weight': 1.0, 'id': 'db-apex-duos', 'tags': ["FirstPerson"]},
    {'Spiel': 'Fortnite', 'Spielmodus': 'Battle Royale (Solo)', 'Schwierigkeit': 5.0, 'Spieleranzahl': 1, 'weight': 1.0, 'id': 'db-fortnite-solo', 'tags': ["FirstPerson"]},
    {'Spiel': 'Overwatch 2', 'Spielmodus': 'Competitive', 'Schwierigkeit': 7.5, 'Spieleranzahl': 5, 'weight': 1.0, 'id': 'db-overwatch2-comp', 'tags': ["FirstPerson"]},
    {'Spiel': 'PUBG', 'Spielmodus': 'Squad', 'Schwierigkeit': 8.0, 'Spieleranzahl': 4, 'weight': 1.0, 'id': 'db-pubg-squad', 'tags': ["FirstPerson"]},
    {'Spiel': 'Rainbow6Siege', 'Spielmodus': 'Ranked', 'Schwierigkeit': 5.0, 'Spieleranzahl': 5, 'weight': 1.0, 'id': 'db-r6s-ranked', 'tags': ["FirstPerson"]},
]

PARTY_GAMES_ENTRIES = [
    {'Spiel': 'Fallguys', 'Spielmodus': 'Normal', 'Schwierigkeit': 2.0, 'Spieleranzahl': 1, 'weight': 1.0, 'id': 'db-fallguys-normal', 'tags': ["Party"]},
    {'Spiel': 'LeagueOfLegends', 'Spielmodus': 'Aram', 'Schwierigkeit': 3.0, 'Spieleranzahl': 5, 'weight': 1.0, 'id': 'db-lol-aram', 'tags': ["Strategy", "Party"]},
    {'Spiel': 'LeagueOfLegends', 'Spielmodus': 'URF', 'Schwierigkeit': 4.0, 'Spieleranzahl': 5, 'weight': 1.0, 'id': 'db-lol-urf', 'tags': ["Strategy", "Party"]},
    {'Spiel': 'RocketLeague', 'Spielmodus': 'Duos', 'Schwierigkeit': 2.0, 'Spieleranzahl': 2, 'weight': 1.0, 'id': 'db-rl-duos', 'tags': ["Party"]},
    {'Spiel': 'RocketLeague', 'Spielmodus': 'Trios', 'Schwierigkeit': 2.0, 'Spieleranzahl': 3, 'weight': 1.0, 'id': 'db-rl-trios', 'tags': ["Party"]},
]

STRATEGY_GAMES_ENTRIES = [
    {'Spiel': 'LeagueOfLegends', 'Spielmodus': 'FlexQ', 'Schwierigkeit': 6.0, 'Spieleranzahl': 5, 'weight': 1.0, 'id': 'db-lol-flexq', 'tags': ["Strategy"]},
    {'Spiel': 'LeagueOfLegends', 'Spielmodus': 'DuoQ', 'Schwierigkeit': 8.0, 'Spieleranzahl': 2, 'weight': 1.0, 'id': 'db-lol-duoq', 'tags': ["Strategy"]},
    {'Spiel': 'Dota 2', 'Spielmodus': 'All Pick', 'Schwierigkeit': 8.0, 'Spieleranzahl': 5, 'weight': 1.0, 'id': 'db-dota2-allpick', 'tags': ["Strategy"]},
    {'Spiel': 'Dota 2', 'Spielmodus': 'Turbo', 'Schwierigkeit': 6.0, 'Spieleranzahl': 5, 'weight': 1.0, 'id': 'db-dota2-turbo', 'tags': ["Strategy"]},
    {'Spiel': 'AgeOfEmpires', 'Spielmodus': 'Ranked', 'Schwierigkeit': 5.0, 'Spieleranzahl': 2, 'weight': 1.0, 'id': 'db-aoe-ranked', 'tags': ["Strategy"]},
    {'Spiel': 'Teamfight Tactics', 'Spielmodus': 'Ranked', 'Schwierigkeit': 6.0, 'Spieleranzahl': 1, 'weight': 1.0, 'id': 'db-tft-ranked', 'tags': ["Strategy"]},
    {'Spiel': 'Teamfight Tactics', 'Spielmodus': 'Hyper Roll', 'Schwierigkeit': 4.0, 'Spieleranzahl': 1, 'weight': 1.0, 'id': 'db-tft-hyperroll', 'tags': ["Strategy"]},
]

temp_all_games_dict = {}
for entry_list in [SHOOTER_GAMES_ENTRIES, PARTY_GAMES_ENTRIES, STRATEGY_GAMES_ENTRIES]:
    for entry in entry_list:
        key = f"{entry['Spiel']}_{entry['Spielmodus']}"
        if key not in temp_all_games_dict:
            if 'tags' not in entry: entry['tags'] = []
            temp_all_games_dict[key] = entry
ALL_GAMES_ENTRIES = list(temp_all_games_dict.values())

DEFAULT_GAME_TAB_DEFINITIONS = {
    "default-all-games": {"client_tab_id": "default-all-games", "name": "All Games", "entries": ALL_GAMES_ENTRIES},
    "default-shooters": {"client_tab_id": "default-shooters", "name": "Shooters", "entries": SHOOTER_GAMES_ENTRIES},
    "default-party-games": {"client_tab_id": "default-party-games", "name": "Party Games", "entries": PARTY_GAMES_ENTRIES},
    "default-strategy-games": {"client_tab_id": "default-strategy-games", "name": "Strategy Games", "entries": STRATEGY_GAMES_ENTRIES}
}

# --- New Default Penalty Tab Definitions ---

EASY_PENALTIES_ENTRIES = [
    {'id': 'db-p-easy-brightness-low', 'name': 'Dim Monitor', 'description': 'Set monitor brightness to 50%.', 'probability': 1.0, 'tags': ["Universal"]},
    {'id': 'db-p-keycap-1', 'name': 'Keycap Removal ', 'description': 'Remove 1 keycap of a key you use ingame.', 'probability': 1.0, 'tags': ["Universal"]},
    {'id': 'db-p-hard-narrate', 'name': 'Sports Commentator', 'description': 'Describe all your in-game actions out loud like a sports commentator.', 'probability': 1.0, 'tags': ["Universal"]},
    {'id': 'db-p-easy-no-minimap', 'name': 'No Minimap', 'description': 'Disable Minimap/Map.', 'probability': 1.0, 'tags': ["Universal"]}, 
    {'id': 'db-p-easy-polite-gamer', 'name': 'Polite Gamer', 'description': 'Must say "please" and "thank you" in all team communications.', 'probability': 1.0, 'tags': ["Universal"]},
    {'id': 'db-p-easy-suboptimal-weapon', 'name': 'Suboptimal Weapon', 'description': 'If your game allows, you must primarily use your secondary or least favorite weapon.', 'probability': 1.0, 'tags': ["FirstPerson"]},
    {'id': 'db-p-easy-emote-action', 'name': 'Emote After Action', 'description': 'After your next kill or significant game action, perform an in-game emote or taunt.', 'probability': 1.0, 'tags': ["FirstPerson"]}, 
]

MEDIUM_PENALTIES_ENTRIES = [
    {'id': 'db-p-med-brightness-low', 'name': 'Dim Monitor', 'description': 'Set monitor brightness to 30%.', 'probability': 1.0, 'tags': ["Universal"]},
    {'id': 'db-p-easy-onecolor', 'name': 'Monochrome Mode', 'description': 'If possible with OS/filter, set screen to grayscale.', 'probability': 1.0, 'tags': ["Universal"]},
    {'id': 'db-p-easy-standup', 'name': 'Stand Up & Play', 'description': 'If you normally sit, stand up while playing.', 'probability': 1.0, 'tags': ["Universal"]},
    {'id': 'db-p-med-sens-change', 'name': 'Mouse Sensitivity Change', 'description': 'Increase or decrease your mouse sensitivity by 50%.', 'probability': 1.0, 'tags': ["FirstPerson", "Universal"]},
    {'id': 'db-p-med-key-swap-ad', 'name': 'Swap A & D Keys', 'description': 'Remap your A and D (strafe left/right) keys.', 'probability': 1.0, 'tags': ["FirstPerson"]},
    {'id': 'db-p-med-monitor-close', 'name': 'Monitor Too Close', 'description': 'Move your monitor 15 cm closer than usual.', 'probability': 1.0, 'tags': ["Universal"]},
    {'id': 'db-p-med-voice-change', 'name': 'Funny Voice', 'description': 'Use a silly voice for all comms.', 'probability': 1.0, 'tags': ["Universal"]},
    {'id': 'db-p-keycap-2', 'name': 'Keycap Removal ', 'description': 'Remove 2 keycaps of keys you use ingame.', 'probability': 1.0, 'tags': ["Universal"]},
    {'id': 'db-p-med-one-eye', 'name': 'One-Eye Challenge', 'description': 'Play with one eye closed until you next score or get a kill.', 'probability': 1.0, 'tags': ["Universal"]}, 
]

HARD_PENALTIES_ENTRIES = [
    {'id': 'db-p-hard-brightness-low', 'name': 'Dim Monitor', 'description': 'Set monitor brightness to 10%.', 'probability': 1.0, 'tags': ["Universal"]},
    {'id': 'db-p-hard-sens-change', 'name': 'Mouse Sensitivity Change', 'description': 'Increase or decrease your mouse sensitivity by 100%.', 'probability': 1.0, 'tags': ["FirstPerson", "Universal"]},
    {'id': 'db-p-med-no-zoom', 'name': 'No Scope/ADS', 'description': 'Cannot use scope or Aim Down Sights.', 'probability': 1.0, 'tags': ["FirstPerson"]},
    {'id': 'db-p-hard-mouse-sideways', 'name': 'Mouse Sideways', 'description': 'Hold and use your mouse turned 90 degrees.', 'probability': 1.0, 'tags': ["Universal"]},
    {'id': 'db-p-hard-key-swap-ws', 'name': 'Swap W & S Keys', 'description': 'Remap your W and S (move forward/backward) keys.', 'probability': 1.0, 'tags': ["FirstPerson"]},
    {'id': 'db-p-hard-monitor-far', 'name': 'Monitor Far Away', 'description': 'Move your monitor 30cm further away.', 'probability': 1.0, 'tags': ["Universal"]},
    {'id': 'db-p-hard-inverted-mouse', 'name': 'Inverted Mouse Y-Axis', 'description': 'Play with inverted mouse Y-axis.', 'probability': 1.0, 'tags': ["Universal"]},
    {'id': 'db-p-hard-no-sound', 'name': 'No Game Sound', 'description': 'Mute all game sounds.', 'probability': 1.0, 'tags': ["FirstPerson", "Universal"]},
    {'id': 'db-p-keycap-3', 'name': 'Keycap Removal ', 'description': 'Remove 3 keycaps of keys you use ingame.', 'probability': 1.0, 'tags': ["Universal"]},     
]

ALL_PENALTIES_ENTRIES = EASY_PENALTIES_ENTRIES + MEDIUM_PENALTIES_ENTRIES + HARD_PENALTIES_ENTRIES

DEFAULT_PENALTY_TAB_DEFINITIONS = {
    "default-all-penalties": { # Changed key to match old structure if necessary, or keep new if it's fine
        "client_tab_id": "default-all-penalties",
        "name": "All Penalties",
        "penalties": ALL_PENALTIES_ENTRIES
    },
    "default-easy-penalties": {
        "client_tab_id": "default-easy-penalties",
        "name": "Easy Penalties",
        "penalties": EASY_PENALTIES_ENTRIES
    },
    "default-medium-penalties": {
        "client_tab_id": "default-medium-penalties",
        "name": "Medium Penalties",
        "penalties": MEDIUM_PENALTIES_ENTRIES
    },
    "default-hard-penalties": {
        "client_tab_id": "default-hard-penalties",
        "name": "Hard Penalties",
        "penalties": HARD_PENALTIES_ENTRIES
    }
}
