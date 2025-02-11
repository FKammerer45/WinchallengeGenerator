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
            # Konvertiere "Schwierigkeit" in Float; setze Standardwert, falls Umwandlung fehlschlägt.
            try:
                value = float(row.get("Schwierigkeit", 0))
                # Optional: Überprüfe, ob der Wert zwischen 1 und 10 liegt:
                if value < 1 or value > 10:
                    value = 0.0  # oder einen anderen Standardwert, oder logge einen Fehler
                row["Schwierigkeit"] = value
            except ValueError:
                row["Schwierigkeit"] = 0.0

            # Konvertiere "Spieleranzahl" in Integer; setze Standardwert, falls Umwandlung fehlschlägt.
            try:
                value = int(row.get("Spieleranzahl", 1))
                # Optional: Überprüfe, ob der Wert zwischen 1 und 20 liegt:
                if value < 1 or value > 20:
                    value = 1  # oder einen anderen Standardwert
                row["Spieleranzahl"] = value
            except ValueError:
                row["Spieleranzahl"] = 1

            entries.append(row)
    return entries

def write_entries(csv_file, entries, columns):
    with open(csv_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=["id"] + columns)
        writer.writeheader()
        for entry in entries:
            writer.writerow(entry)
