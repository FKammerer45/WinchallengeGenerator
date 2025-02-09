# modules/csv_handler.py
import csv
import os
from config import CSV_FILE, STRAFEN_CSV

def ensure_csv_exists(filename, headers):
    if not os.path.exists(filename):
        with open(filename, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(headers)

def load_entries(filename, headers):
    ensure_csv_exists(filename, headers)
    entries = []
    with open(filename, "r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Passe die Datentypen anhand der Header an.
            if "Spieleranzahl" in headers:
                try:
                    row["Schwierigkeit"] = float(row.get("Schwierigkeit", 0))
                except ValueError:
                    row["Schwierigkeit"] = 0.0
                try:
                    row["Spieleranzahl"] = int(row.get("Spieleranzahl", 1))
                except ValueError:
                    row["Spieleranzahl"] = 1
            elif "Wahrscheinlichkeit" in headers:
                try:
                    row["Wahrscheinlichkeit"] = float(row.get("Wahrscheinlichkeit", 0))
                except ValueError:
                    row["Wahrscheinlichkeit"] = 0.0
            entries.append(row)
    return entries

def write_entries(filename, entries, headers):
    with open(filename, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        for entry in entries:
            writer.writerow([entry.get(h, "") for h in headers])
