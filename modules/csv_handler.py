# modules/csv_handler.py
import csv
import os
from config import CSV_FILE, STRAFEN_CSV

def ensure_csv_exists(filename, headers):
    if not os.path.exists(filename):
        with open(filename, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(headers)

def load_entries(csv_file, columns):
    entries = []
    if os.path.exists(csv_file):
        with open(csv_file, 'r', newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                entry = {col: row[col] for col in columns}
                entry["id"] = row["id"]  # ID hinzufügen
                entries.append(entry)
    return entries
def write_entries(csv_file, entries, columns):
    with open(csv_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=["id"] + columns)
        writer.writeheader()
        for entry in entries:
            writer.writerow(entry)
