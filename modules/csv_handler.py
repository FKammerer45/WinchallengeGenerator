# modules/csv_handler.py
import csv
import os
from config import CSV_FILE

def ensure_csv_exists():
    if not os.path.exists(CSV_FILE):
        with open(CSV_FILE, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["Spiel", "Spielmodus", "Schwierigkeit", "Spieleranzahl"])

def load_entries():
    ensure_csv_exists()
    entries = []
    with open(CSV_FILE, "r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                row["Schwierigkeit"] = float(row["Schwierigkeit"])
            except ValueError:
                row["Schwierigkeit"] = 0.0
            try:
                row["Spieleranzahl"] = int(row["Spieleranzahl"])
            except ValueError:
                row["Spieleranzahl"] = 1
            entries.append(row)
    return entries

def write_entries(entries):
    with open(CSV_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["Spiel", "Spielmodus", "Schwierigkeit", "Spieleranzahl"])
        for entry in entries:
            writer.writerow([entry["Spiel"], entry["Spielmodus"],
                             entry["Schwierigkeit"], entry["Spieleranzahl"]])
