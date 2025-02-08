# modules/csv_handler.py
import csv
import os
from config import CSV_FILE, STRAFEN_CSV

def ensure_csv_exists(filename, headers):
    if not os.path.exists(filename):
        with open(filename, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(headers)

def load_entries(filename):
    ensure_csv_exists(filename, ["Spiel", "Spielmodus", "Schwierigkeit", "Spieleranzahl"])
    entries = []
    with open(filename, "r", newline="", encoding="utf-8") as f:
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

def write_entries(filename, entries, headers):
    with open(filename, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        for entry in entries:
            writer.writerow([entry[h] for h in headers])
