# modules/strafen.py
import csv
import os
import logging
from typing import List, Dict, Any, Iterable
from config import STRAFEN_CSV

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

def ensure_strafen_csv() -> None:
    """
    Ensures that the strafen CSV file exists.
    If the file does not exist, it creates the file with default entries.
    """
    if not os.path.exists(STRAFEN_CSV):
        logger.debug("STRAFEN CSV file not found at '%s'. Creating default file.", STRAFEN_CSV)
        with open(STRAFEN_CSV, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["Name", "Wahrscheinlichkeit", "Beschreibung"])
            # Example default entries (can be adjusted later)
            writer.writerow(["Maus Sensitivität Verdoppeln", 0.5, "Die Mausgeschwindigkeit wird verdoppelt."])
            writer.writerow(["Maus Sensitivität Halbieren", 0.5, "Die Mausgeschwindigkeit wird halbiert."])
            writer.writerow(["Bildschirm Helligkeit auf 0", 0.3, "Der Bildschirm wird vollständig dunkel."])
            writer.writerow(["Caps Lock Entfernen (Q, W, E, A, S)", 0.4, "Caps Lock wird deaktiviert."])
            writer.writerow(["Invertierte Maus", 0.2, "Die Mausbewegung wird invertiert."])
            writer.writerow(["Langsame Maus", 0.3, "Die Maus reagiert langsamer."])
        logger.info("Default STRAFEN CSV file created at '%s'.", STRAFEN_CSV)
    else:
        logger.debug("STRAFEN CSV file found at '%s'.", STRAFEN_CSV)

def load_strafen() -> List[Dict[str, Any]]:
    """
    Loads the strafen entries from the CSV file.
    
    :return: A list of dictionaries representing each entry.
    """
    ensure_strafen_csv()
    entries: List[Dict[str, Any]] = []
    with open(STRAFEN_CSV, "r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                row["Wahrscheinlichkeit"] = float(row["Wahrscheinlichkeit"])
            except (ValueError, KeyError) as e:
                logger.warning("Error converting 'Wahrscheinlichkeit' in row %s: %s. Defaulting to 0.0.", row, e)
                row["Wahrscheinlichkeit"] = 0.0
            entries.append(row)
    logger.debug("Loaded %d entries from STRAFEN CSV.", len(entries))
    return entries

def write_strafen(entries: List[Dict[str, Any]]) -> None:
    """
    Writes the given strafen entries to the CSV file.
    
    :param entries: A list of dictionaries representing each entry.
    """
    with open(STRAFEN_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["Name", "Wahrscheinlichkeit", "Beschreibung"])
        for entry in entries:
            writer.writerow([
                entry.get("Name", ""),
                entry.get("Wahrscheinlichkeit", ""),
                entry.get("Beschreibung", "")
            ])
    logger.debug("Wrote %d entries to STRAFEN CSV.", len(entries))

def update_strafe(index: int, new_entry: Dict[str, Any]) -> None:
    """
    Aktualisiert den Strafen-Eintrag an der gegebenen Indexposition.
    
    :param index: Index des Eintrags.
    :param new_entry: Dictionary mit den Schlüsseln "Name", "Wahrscheinlichkeit" und "Beschreibung".
    :raises IndexError: Wenn der Index ungültig ist.
    """
    entries = load_strafen()
    if index < 0 or index >= len(entries):
        logger.error("Update failed: Index %d is out of range.", index)
        raise IndexError("Strafen-Eintrag existiert nicht.")
    entries[index] = new_entry
    write_strafen(entries)
    logger.info("Updated strafen entry at index %d.", index)

def delete_strafe(index: int) -> None:
    """
    Löscht den Strafen-Eintrag an der gegebenen Indexposition.
    
    :param index: Index des Eintrags.
    :raises IndexError: Wenn der Index ungültig ist.
    """
    entries = load_strafen()
    if index < 0 or index >= len(entries):
        logger.error("Delete failed: Index %d is out of range.", index)
        raise IndexError("Strafen-Eintrag existiert nicht.")
    del entries[index]
    write_strafen(entries)
    logger.info("Deleted strafen entry at index %d.", index)

def get_strafe(index: int) -> Dict[str, Any]:
    """
    Gibt den Strafen-Eintrag an der angegebenen Indexposition zurück.
    
    :param index: Index des gewünschten Eintrags.
    :return: Der Eintrag als Dictionary.
    :raises IndexError: Wenn der Index ungültig ist.
    """
    entries = load_strafen()
    if index < 0 or index >= len(entries):
        logger.error("Get failed: Index %d is out of range.", index)
        raise IndexError("Ausgewählter Eintrag existiert nicht.")
    logger.debug("Retrieved strafen entry at index %d.", index)
    return entries[index]
