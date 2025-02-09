# modules/game_management.py
from modules.csv_handler import load_entries, write_entries
from config import CSV_FILE

class GameManager:
    @staticmethod
    def get_all_entries():
        """
        Gibt alle Einträge aus der Spiele-CSV zurück.
        """
        return load_entries(CSV_FILE, ["Spiel", "Spielmodus", "Schwierigkeit", "Spieleranzahl"])
    
    @staticmethod
    def add_entry(spiel, spielmodus, schwierigkeit, spieleranzahl):
        """
        Fügt einen neuen Spieleintrag hinzu.
        Parameter:
          spiel: String
          spielmodus: String
          schwierigkeit: Zahl (0-10)
          spieleranzahl: Integer (>= 1)
        Liefert eine Erfolgsmeldung oder löst eine Exception aus.
        """
        if not (spiel and spielmodus and schwierigkeit is not None and spieleranzahl is not None):
            raise ValueError("Alle Felder müssen ausgefüllt werden.")
        try:
            schwierigkeit = float(schwierigkeit)
            if not (0 <= schwierigkeit <= 10):
                raise ValueError
        except ValueError:
            raise ValueError("Schwierigkeit muss eine Zahl zwischen 0 und 10 sein.")
        try:
            spieleranzahl = int(spieleranzahl)
            if spieleranzahl < 1:
                raise ValueError
        except ValueError:
            raise ValueError("Spieleranzahl muss eine ganze Zahl und mindestens 1 sein.")
        entries = load_entries(CSV_FILE, ["Spiel", "Spielmodus", "Schwierigkeit", "Spieleranzahl"])
        entries.append({
            "Spiel": spiel,
            "Spielmodus": spielmodus,
            "Schwierigkeit": schwierigkeit,
            "Spieleranzahl": spieleranzahl
        })
        write_entries(CSV_FILE, entries, ["Spiel", "Spielmodus", "Schwierigkeit", "Spieleranzahl"])
        return "Eintrag hinzugefügt"

    @staticmethod
    def update_entry(index, spiel, spielmodus, schwierigkeit, spieleranzahl):
        """
        Aktualisiert den Spieleintrag an der angegebenen Indexposition.
        Parameter:
          index: Integer, Index des Eintrags
          spiel, spielmodus, schwierigkeit, spieleranzahl: Neue Werte
        Liefert eine Erfolgsmeldung oder löst eine Exception aus.
        """
        if not (spiel and spielmodus and schwierigkeit is not None and spieleranzahl is not None):
            raise ValueError("Alle Felder müssen ausgefüllt werden.")
        try:
            schwierigkeit = float(schwierigkeit)
            if not (0 <= schwierigkeit <= 10):
                raise ValueError
        except ValueError:
            raise ValueError("Schwierigkeit muss eine Zahl zwischen 0 und 10 sein.")
        try:
            spieleranzahl = int(spieleranzahl)
            if spieleranzahl < 1:
                raise ValueError
        except ValueError:
            raise ValueError("Spieleranzahl muss eine ganze Zahl und mindestens 1 sein.")
        entries = load_entries(CSV_FILE, ["Spiel", "Spielmodus", "Schwierigkeit", "Spieleranzahl"])
        if index < 0 or index >= len(entries):
            raise IndexError("Ausgewählter Eintrag existiert nicht.")
        entries[index] = {
            "Spiel": spiel,
            "Spielmodus": spielmodus,
            "Schwierigkeit": schwierigkeit,
            "Spieleranzahl": spieleranzahl
        }
        write_entries(CSV_FILE, entries, ["Spiel", "Spielmodus", "Schwierigkeit", "Spieleranzahl"])
        return "Eintrag aktualisiert"

    @staticmethod
    def delete_entry(index):
        """
        Löscht den Spieleintrag an der angegebenen Indexposition.
        Liefert eine Erfolgsmeldung oder löst eine Exception aus.
        """
        entries = load_entries(CSV_FILE, ["Spiel", "Spielmodus", "Schwierigkeit", "Spieleranzahl"])
        if index < 0 or index >= len(entries):
            raise IndexError("Kein Eintrag ausgewählt oder Eintrag existiert nicht.")
        del entries[index]
        write_entries(CSV_FILE, entries, ["Spiel", "Spielmodus", "Schwierigkeit", "Spieleranzahl"])
        return "Eintrag gelöscht"
