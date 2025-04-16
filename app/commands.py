# /srv/myflaskapp/WinchallengeGenerator/app/commands.py
import click
from flask.cli import with_appcontext

# Import db instance and models from your app package
from . import db 
from .models import GameEntry, Penalty

# --- Define Default Data --- 
# (You can keep this here, or move it to a separate data file and import it)
DEFAULT_GAMES = [
    # CSGO
    {'Spiel': 'CSGO', 'Spielmodus': 'Ranked', 'Schwierigkeit': 7.0, 'Spieleranzahl': 5},
    {'Spiel': 'CSGO', 'Spielmodus': 'Premier', 'Schwierigkeit': 7.0, 'Spieleranzahl': 5},
    # League of Legends
    {'Spiel': 'LeagueOfLegends', 'Spielmodus': 'Aram', 'Schwierigkeit': 3.0, 'Spieleranzahl': 5},
    {'Spiel': 'LeagueOfLegends', 'Spielmodus': 'FlexQ', 'Schwierigkeit': 6.0, 'Spieleranzahl': 5},
    {'Spiel': 'LeagueOfLegends', 'Spielmodus': 'DuoQ', 'Schwierigkeit': 8.0, 'Spieleranzahl': 2}, 
    {'Spiel': 'LeagueOfLegends', 'Spielmodus': 'URF', 'Schwierigkeit': 4.0, 'Spieleranzahl': 5},
    # Valorant
    {'Spiel': 'Valorant', 'Spielmodus': 'Ranked', 'Schwierigkeit': 6.0, 'Spieleranzahl': 5},
    # Age of Empires
    {'Spiel': 'AgeOfEmpires', 'Spielmodus': 'Ranked', 'Schwierigkeit': 5.0, 'Spieleranzahl': 2}, 
    # Apex Legends
    {'Spiel': 'Apex Legends', 'Spielmodus': 'Trios', 'Schwierigkeit': 7.0, 'Spieleranzahl': 3},
    {'Spiel': 'Apex Legends', 'Spielmodus': 'Duos', 'Schwierigkeit': 7.0, 'Spieleranzahl': 2},
     # Dota 2
    {'Spiel': 'Dota 2', 'Spielmodus': 'All Pick', 'Schwierigkeit': 8.0, 'Spieleranzahl': 5},
    {'Spiel': 'Dota 2', 'Spielmodus': 'Turbo', 'Schwierigkeit': 6.0, 'Spieleranzahl': 5},
    # Fall Guys
    {'Spiel': 'Fallguys', 'Spielmodus': 'normal', 'Schwierigkeit': 2.0, 'Spieleranzahl': 1}, 
    # Fortnite
    {'Spiel': 'Fortnite', 'Spielmodus': 'Battle Royale (Solo)', 'Schwierigkeit': 5.0, 'Spieleranzahl': 1},
    {'Spiel': 'Fortnite', 'Spielmodus': 'Battle Royale (Duos)', 'Schwierigkeit': 5.5, 'Spieleranzahl': 2},
    {'Spiel': 'Fortnite', 'Spielmodus': 'Battle Royale (Squads)', 'Schwierigkeit': 6.0, 'Spieleranzahl': 4},
     # Overwatch 2
    {'Spiel': 'Overwatch 2', 'Spielmodus': 'Quick Play', 'Schwierigkeit': 5.0, 'Spieleranzahl': 5},
    {'Spiel': 'Overwatch 2', 'Spielmodus': 'Competitive', 'Schwierigkeit': 7.5, 'Spieleranzahl': 5},
    # PUBG
    {'Spiel': 'PUBG', 'Spielmodus': 'Duos', 'Schwierigkeit': 7.0, 'Spieleranzahl': 2},
    {'Spiel': 'PUBG', 'Spielmodus': 'squad', 'Schwierigkeit': 8.0, 'Spieleranzahl': 4},
    # Rainbow Six Siege
    {'Spiel': 'Rainbow6Siege', 'Spielmodus': 'Ranked', 'Schwierigkeit': 5.0, 'Spieleranzahl': 5},
     # Rocket League
    {'Spiel': 'RocketLeague', 'Spielmodus': 'Duos', 'Schwierigkeit': 2.0, 'Spieleranzahl': 2},
    {'Spiel': 'RocketLeague', 'Spielmodus': 'Trios', 'Schwierigkeit': 2.0, 'Spieleranzahl': 3},
    # Teamfight Tactics
    {'Spiel': 'Teamfight Tactics', 'Spielmodus': 'Ranked', 'Schwierigkeit': 6.0, 'Spieleranzahl': 1},
    {'Spiel': 'Teamfight Tactics', 'Spielmodus': 'Hyper Roll', 'Schwierigkeit': 4.0, 'Spieleranzahl': 1},
    # Add more games as needed
]

DEFAULT_PENALTIES = [
    {'name': 'Hydration Check', 'description': 'Take a good sip of water!'},
    {'name': 'Posture Check', 'description': 'Sit up straight, shoulders back!'},
    {'name': 'Quick Stretch', 'description': 'Stretch your arms, neck, or back for 10 seconds.'},
    {'name': 'Compliment Teammate', 'description': 'Give a genuine compliment to a teammate (in voice or chat).'},
    {'name': 'Compliment Opponent', 'description': 'Acknowledge a good play by an opponent (in chat).'},
    {'name': 'Deep Breath', 'description': 'Take 3 slow, deep breaths.'},
    {'name': 'Laugh it Off', 'description': 'Force a smile or a chuckle, even if tilted.'},
    {'name': 'Positive Affirmation', 'description': 'Say one positive thing about your own gameplay out loud.'},
    {'name': 'Clean Your Space', 'description': 'Quickly tidy one small thing near your keyboard/mouse.'},
    {'name': 'Stand Up', 'description': 'Briefly stand up from your chair.'},
    # Add more penalties
]
# --- End Default Data ---


# Define the CLI command using click decorators
@click.command("seed-db")
@with_appcontext # Ensures the command runs within the Flask application context
def seed_db_command():
    """Populates the database with default game entries and penalties."""
    print("Seeding database...")
    
    try:
        # Seed Games
        # Check existing to avoid duplicates
        existing_games = { (g.Spiel, g.Spielmodus) for g in db.session.query(GameEntry).with_entities(GameEntry.Spiel, GameEntry.Spielmodus).all() }
        games_to_add = []
        for game_data in DEFAULT_GAMES:
            # Create tuple for checking existence
            game_key = (game_data['Spiel'], game_data['Spielmodus'])
            if game_key not in existing_games:
                games_to_add.append(GameEntry(**game_data))
                existing_games.add(game_key) # Add to set to prevent duplicates within this run
        
        if games_to_add:
            db.session.add_all(games_to_add)
            print(f"Adding {len(games_to_add)} new default game entries.")
        else:
            print("Default game entries already seem to exist or none provided.")

        # Seed Penalties
        # Check existing to avoid duplicates
        existing_penalties = { p.name for p in db.session.query(Penalty).with_entities(Penalty.name).all() }
        penalties_to_add = []
        for penalty_data in DEFAULT_PENALTIES:
             if penalty_data['name'] not in existing_penalties:
                 penalties_to_add.append(Penalty(**penalty_data))
                 existing_penalties.add(penalty_data['name']) # Add to set

        if penalties_to_add:
            db.session.add_all(penalties_to_add)
            print(f"Adding {len(penalties_to_add)} new default penalties.")
        else:
             print("Default penalties already seem to exist or none provided.")

        # Commit changes if anything was added
        if games_to_add or penalties_to_add:
            db.session.commit()
            print("Database seeding committed.")
        else:
            print("No new default data needed.")

    except Exception as e:
        db.session.rollback() # Rollback on error
        print(f"Error seeding database: {e}")
    finally:
        # It's good practice to remove the session in CLI commands
        # although Flask-SQLAlchemy often handles this.
        # db.session.remove() 
        pass

# Function to register command(s) with the Flask app
def register_commands(app):
    app.cli.add_command(seed_db_command)
    # Add other custom commands here if you create more
    # app.cli.add_command(another_command)
