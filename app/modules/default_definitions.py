# app/modules/default_definitions.py

"""
This file defines the structure and content for the system-initialized default tabs
for Games and Penalties. These definitions are used to create these tabs for
users when they first interact with the respective configuration pages.
"""

# --- Default Game Tab Definitions ---

# Define content for specific game categories first
SHOOTER_GAMES_ENTRIES = [
    {'Spiel': 'CSGO', 'Spielmodus': 'Ranked', 'Schwierigkeit': 7.0, 'Spieleranzahl': 5, 'weight': 1.0, 'id': 'db-csgo-ranked'},
    {'Spiel': 'CSGO', 'Spielmodus': 'Premier', 'Schwierigkeit': 7.0, 'Spieleranzahl': 5, 'weight': 1.0, 'id': 'db-csgo-premier'},
    {'Spiel': 'Valorant', 'Spielmodus': 'Ranked', 'Schwierigkeit': 6.0, 'Spieleranzahl': 5, 'weight': 1.0, 'id': 'db-valorant-ranked'},
    {'Spiel': 'Apex Legends', 'Spielmodus': 'Trios', 'Schwierigkeit': 7.0, 'Spieleranzahl': 3, 'weight': 1.0, 'id': 'db-apex-trios'},
    {'Spiel': 'Apex Legends', 'Spielmodus': 'Duos', 'Schwierigkeit': 7.0, 'Spieleranzahl': 2, 'weight': 1.0, 'id': 'db-apex-duos'},
    {'Spiel': 'Fortnite', 'Spielmodus': 'Battle Royale (Solo)', 'Schwierigkeit': 5.0, 'Spieleranzahl': 1, 'weight': 1.0, 'id': 'db-fortnite-solo'},
    {'Spiel': 'Overwatch 2', 'Spielmodus': 'Competitive', 'Schwierigkeit': 7.5, 'Spieleranzahl': 5, 'weight': 1.0, 'id': 'db-overwatch2-comp'},
    {'Spiel': 'PUBG', 'Spielmodus': 'Squad', 'Schwierigkeit': 8.0, 'Spieleranzahl': 4, 'weight': 1.0, 'id': 'db-pubg-squad'}, # Corrected 'squad'
    {'Spiel': 'Rainbow6Siege', 'Spielmodus': 'Ranked', 'Schwierigkeit': 5.0, 'Spieleranzahl': 5, 'weight': 1.0, 'id': 'db-r6s-ranked'},
]

PARTY_GAMES_ENTRIES = [
    {'Spiel': 'Fallguys', 'Spielmodus': 'Normal', 'Schwierigkeit': 2.0, 'Spieleranzahl': 1, 'weight': 1.0, 'id': 'db-fallguys-normal'}, # Corrected 'normal'
    {'Spiel': 'LeagueOfLegends', 'Spielmodus': 'Aram', 'Schwierigkeit': 3.0, 'Spieleranzahl': 5, 'weight': 1.0, 'id': 'db-lol-aram'},
    {'Spiel': 'LeagueOfLegends', 'Spielmodus': 'URF', 'Schwierigkeit': 4.0, 'Spieleranzahl': 5, 'weight': 1.0, 'id': 'db-lol-urf'},
    {'Spiel': 'RocketLeague', 'Spielmodus': 'Duos', 'Schwierigkeit': 2.0, 'Spieleranzahl': 2, 'weight': 1.0, 'id': 'db-rl-duos'},
    {'Spiel': 'RocketLeague', 'Spielmodus': 'Trios', 'Schwierigkeit': 2.0, 'Spieleranzahl': 3, 'weight': 1.0, 'id': 'db-rl-trios'},
]

STRATEGY_GAMES_ENTRIES = [
    {'Spiel': 'LeagueOfLegends', 'Spielmodus': 'FlexQ', 'Schwierigkeit': 6.0, 'Spieleranzahl': 5, 'weight': 1.0, 'id': 'db-lol-flexq'},
    {'Spiel': 'LeagueOfLegends', 'Spielmodus': 'DuoQ', 'Schwierigkeit': 8.0, 'Spieleranzahl': 2, 'weight': 1.0, 'id': 'db-lol-duoq'},
    {'Spiel': 'Dota 2', 'Spielmodus': 'All Pick', 'Schwierigkeit': 8.0, 'Spieleranzahl': 5, 'weight': 1.0, 'id': 'db-dota2-allpick'},
    {'Spiel': 'Dota 2', 'Spielmodus': 'Turbo', 'Schwierigkeit': 6.0, 'Spieleranzahl': 5, 'weight': 1.0, 'id': 'db-dota2-turbo'},
    {'Spiel': 'AgeOfEmpires', 'Spielmodus': 'Ranked', 'Schwierigkeit': 5.0, 'Spieleranzahl': 2, 'weight': 1.0, 'id': 'db-aoe-ranked'},
    {'Spiel': 'Teamfight Tactics', 'Spielmodus': 'Ranked', 'Schwierigkeit': 6.0, 'Spieleranzahl': 1, 'weight': 1.0, 'id': 'db-tft-ranked'},
    {'Spiel': 'Teamfight Tactics', 'Spielmodus': 'Hyper Roll', 'Schwierigkeit': 4.0, 'Spieleranzahl': 1, 'weight': 1.0, 'id': 'db-tft-hyperroll'},
]

# Combine all unique game entries for the "All Games" tab
# Using a dictionary to ensure uniqueness by a composite key (Spiel + Spielmodus) before creating the final list
temp_all_games_dict = {}
for entry_list in [SHOOTER_GAMES_ENTRIES, PARTY_GAMES_ENTRIES, STRATEGY_GAMES_ENTRIES]:
    for entry in entry_list:
        key = f"{entry['Spiel']}_{entry['Spielmodus']}" # Create a unique key
        if key not in temp_all_games_dict:
            temp_all_games_dict[key] = entry
ALL_GAMES_ENTRIES = list(temp_all_games_dict.values())


DEFAULT_GAME_TAB_DEFINITIONS = {
    "default-all-games": {
        "client_tab_id": "default-all-games", # This will be the key in SavedGameTab.client_tab_id
        "name": "All Games",
        "entries": ALL_GAMES_ENTRIES
    },
    "default-shooters": {
        "client_tab_id": "default-shooters",
        "name": "Shooters",
        "entries": SHOOTER_GAMES_ENTRIES
    },
    "default-party-games": {
        "client_tab_id": "default-party-games",
        "name": "Party Games",
        "entries": PARTY_GAMES_ENTRIES
    },
    "default-strategy-games": {
        "client_tab_id": "default-strategy-games",
        "name": "Strategy Games",
        "entries": STRATEGY_GAMES_ENTRIES
    }
}

# --- Default Penalty Tab Definitions ---

EASY_PENALTIES_ENTRIES = [
    {'name': 'Hydration Check', 'description': 'Take a good sip of water!', 'probability': 1.0, 'id': 'db-p-hydrate'},
    {'name': 'Posture Check', 'description': 'Sit up straight, shoulders back!', 'probability': 1.0, 'id': 'db-p-posture'},
    {'name': 'Quick Stretch', 'description': 'Stretch your arms, neck, or back for 10 seconds.', 'probability': 1.0, 'id': 'db-p-stretch'},
    {'name': 'Deep Breath', 'description': 'Take 3 slow, deep breaths.', 'probability': 1.0, 'id': 'db-p-breath'},
    {'name': 'Stand Up', 'description': 'Briefly stand up from your chair.', 'probability': 1.0, 'id': 'db-p-standup'},
]

MEDIUM_PENALTIES_ENTRIES = [
    {'name': 'Compliment Teammate', 'description': 'Give a genuine compliment to a teammate (in voice or chat).', 'probability': 0.75, 'id': 'db-p-compteam'},
    {'name': 'Compliment Opponent', 'description': 'Acknowledge a good play by an opponent (in chat).', 'probability': 0.6, 'id': 'db-p-compopp'},
    {'name': 'Laugh it Off', 'description': 'Force a smile or a chuckle, even if tilted.', 'probability': 0.8, 'id': 'db-p-laugh'},
    {'name': 'Positive Affirmation', 'description': 'Say one positive thing about your own gameplay out loud.', 'probability': 0.8, 'id': 'db-p-affirm'},
    {'name': 'Clean Your Space', 'description': 'Quickly tidy one small thing near your keyboard/mouse.', 'probability': 0.5, 'id': 'db-p-clean'},
]

HARD_PENALTIES_ENTRIES = [
    {'name': 'One-Handed Play (1 min)', 'description': 'Play using only one hand for the next minute.', 'probability': 0.2, 'id': 'db-p-onehand'},
    {'name': 'Inverted Mouse (30s)', 'description': 'Invert your mouse Y-axis for 30 seconds (if game supports).', 'probability': 0.1, 'id': 'db-p-invertmouse'},
    {'name': 'No Minimap (1 round/2 mins)', 'description': 'Play without looking at the minimap for the next round or 2 minutes.', 'probability': 0.25, 'id': 'db-p-nomap'},
    {'name': 'Sing a Song', 'description': 'Sing a short song out loud (if streaming, to your audience).', 'probability': 0.15, 'id': 'db-p-singsong'},
    {'name': 'Push-ups x5', 'description': 'Do 5 push-ups (or jumping jacks).', 'probability': 0.3, 'id': 'db-p-pushups'},
]

# Combine all unique penalty entries for the "All Penalties" tab
temp_all_penalties_dict = {}
for entry_list in [EASY_PENALTIES_ENTRIES, MEDIUM_PENALTIES_ENTRIES, HARD_PENALTIES_ENTRIES]:
    for entry in entry_list:
        key = entry['name'] # Assuming name is unique enough for this purpose
        if key not in temp_all_penalties_dict:
            temp_all_penalties_dict[key] = entry
ALL_PENALTIES_ENTRIES = list(temp_all_penalties_dict.values())


DEFAULT_PENALTY_TAB_DEFINITIONS = {
    "default-all-penalties": {
        "client_tab_id": "default-all-penalties",
        "name": "All Penalties",
        "penalties": ALL_PENALTIES_ENTRIES # Note the key is 'penalties'
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

# Helper function to ensure all game entries have a unique 'id' if not provided.
# This is more for the seed_db command if it were to directly use these.
# For frontend initialization, the JS will generate local IDs if needed.
def _ensure_ids(entries, prefix="game"):
    for i, entry in enumerate(entries):
        if 'id' not in entry:
            entry['id'] = f"def-{prefix}-{i}-{entry.get('Spiel', entry.get('name', 'unknown')).replace(' ', '-').lower()}"
    return entries

# You could call _ensure_ids on your entry lists if you want them to have IDs here,
# but it's not strictly necessary if the `seed-db` command handles ID generation
# for the master GameEntry/Penalty tables, and the frontend handles IDs for user tabs.
# For clarity, I've added example 'id' fields (like 'db-csgo-ranked') to the definitions above.
# These would correspond to IDs you might give them in your `GameEntry`/`Penalty` master tables
# if you want these default tab entries to directly reference those master records.
# If they are just initial content that becomes user-owned, the IDs are less critical at this definition stage.
