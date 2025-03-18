# import_games.py
import csv
from modules.models import GameEntry, SessionLocal
from config import CSV_FILE

def import_games():
    session = SessionLocal()
    with open(CSV_FILE, newline="", encoding="utf-8") as f:
        # If your CSV has duplicate ID columns, the DictReader will pick the later occurrence.
        # Since the model uses autoincrement, we ignore the CSV id fields.
        reader = csv.DictReader(f)
        for row in reader:
            try:
                # Create a new GameEntry using the relevant columns
                game_entry = GameEntry(
                    Spiel=row["Spiel"],
                    Spielmodus=row["Spielmodus"],
                    Schwierigkeit=float(row["Schwierigkeit"]),
                    Spieleranzahl=int(row["Spieleranzahl"])
                )
                session.add(game_entry)
            except Exception as e:
                print(f"Error processing row {row}: {e}")
        session.commit()
    session.close()

if __name__ == "__main__":
    import_games()
    print("Games imported successfully.")
