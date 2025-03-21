import csv
from modules.models import Penalty, SessionLocal
from config import STRAFEN_CSV

def import_penalties():
    session = SessionLocal()
    with open(STRAFEN_CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                penalty_entry = Penalty(
                    Strafe=row["Strafe"],  # Assumes your CSV header is "Strafe"
                    Wahrscheinlichkeit=float(row["Wahrscheinlichkeit"])  # Assumes header "Wahrscheinlichkeit"
                )
                session.add(penalty_entry)
            except Exception as e:
                print(f"Error processing row {row}: {e}")
        session.commit()
    session.close()

if __name__ == "__main__":
    import_penalties()
    print("Penalties imported successfully.")
