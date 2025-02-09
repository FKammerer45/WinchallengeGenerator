# modules/strafen.py
import csv
import os
from config import STRAFEN_CSV

def ensure_strafen_csv():
    if not os.path.exists(STRAFEN_CSV):
        with open(STRAFEN_CSV, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["Name", "Wahrscheinlichkeit", "Beschreibung"])
            # Beispielhafte Standardeinträge (können später in der CSV angepasst werden):
            writer.writerow(["Maus Sensitivität Verdoppeln", 0.5, "Die Mausgeschwindigkeit wird verdoppelt."])
            writer.writerow(["Maus Sensitivität Halbieren", 0.5, "Die Mausgeschwindigkeit wird halbiert."])
            writer.writerow(["Bildschirm Helligkeit auf 0", 0.3, "Der Bildschirm wird vollständig dunkel."])
            writer.writerow(["Caps Lock Entfernen (Q, W, E, A, S)", 0.4, "Caps Lock wird deaktiviert."])
            writer.writerow(["Invertierte Maus", 0.2, "Die Mausbewegung wird invertiert."])
            writer.writerow(["Langsame Maus", 0.3, "Die Maus reagiert langsamer."])

def load_strafen():
    ensure_strafen_csv()
    entries = []
    with open(STRAFEN_CSV, "r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                row["Wahrscheinlichkeit"] = float(row["Wahrscheinlichkeit"])
            except ValueError:
                row["Wahrscheinlichkeit"] = 0.0
            entries.append(row)
    return entries

def write_strafen(entries):
    with open(STRAFEN_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["Name", "Wahrscheinlichkeit", "Beschreibung"])
        for entry in entries:
            writer.writerow([entry["Name"], entry["Wahrscheinlichkeit"], entry.get("Beschreibung", "")])

def update_strafe(index, new_entry):
    """
    Aktualisiert den Strafen-Eintrag an der gegebenen Indexposition.
    new_entry: dict mit den Schlüsseln "Name", "Wahrscheinlichkeit" und "Beschreibung".
    """
    entries = load_strafen()
    if index < 0 or index >= len(entries):
        raise IndexError("Strafen-Eintrag existiert nicht.")
    entries[index] = new_entry
    write_strafen(entries)

def delete_strafe(index):
    """
    Löscht den Strafen-Eintrag an der gegebenen Indexposition.
    """
    entries = load_strafen()
    if index < 0 or index >= len(entries):
        raise IndexError("Strafen-Eintrag existiert nicht.")
    del entries[index]
    write_strafen(entries)

def get_strafe(index):
    """
    Gibt den Strafen-Eintrag an der angegebenen Indexposition zurück.
    Wirft einen IndexError, wenn der Index ungültig ist.
    """
    entries = load_strafen()
    if index < 0 or index >= len(entries):
        raise IndexError("Ausgewählter Eintrag existiert nicht.")
    return entries[index]
