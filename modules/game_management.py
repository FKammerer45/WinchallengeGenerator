# modules/game_management.py
from tkinter import messagebox
from modules.csv_handler import load_entries, write_entries
from config import CSV_FILE

class GameManager:
    def __init__(self, entry_widgets, tree_widget, update_selection_panel_callback):
        self.entry_spiel = entry_widgets["spiel"]
        self.entry_spielmodus = entry_widgets["spielmodus"]
        self.entry_schwierigkeit = entry_widgets["schwierigkeit"]
        self.entry_spieler = entry_widgets["spieleranzahl"]
        self.tree = tree_widget
        self.update_selection_panel = update_selection_panel_callback
        self.selected_index = None

    def clear_entry_fields(self):
        self.entry_spiel.delete(0, "end")
        self.entry_spielmodus.delete(0, "end")
        self.entry_schwierigkeit.delete(0, "end")
        self.entry_spieler.delete(0, "end")

    def add_entry(self):
        spiel = self.entry_spiel.get().strip()
        spielmodus = self.entry_spielmodus.get().strip()
        schwierigkeit_str = self.entry_schwierigkeit.get().strip()
        spieleranzahl_str = self.entry_spieler.get().strip()
        if not (spiel and spielmodus and schwierigkeit_str and spieleranzahl_str):
            messagebox.showerror("Fehler", "Alle Felder müssen ausgefüllt werden.")
            return
        try:
            schwierigkeit = float(schwierigkeit_str)
            if not (0 <= schwierigkeit <= 10):
                raise ValueError
        except ValueError:
            messagebox.showerror("Fehler", "Schwierigkeit muss eine Zahl zwischen 0 und 10 sein.")
            return
        try:
            spieleranzahl = int(spieleranzahl_str)
            if spieleranzahl < 1:
                raise ValueError
        except ValueError:
            messagebox.showerror("Fehler", "Spieleranzahl muss mindestens 1 sein.")
            return
        entries = load_entries(CSV_FILE)
        entries.append({
            "Spiel": spiel,
            "Spielmodus": spielmodus,
            "Schwierigkeit": schwierigkeit,
            "Spieleranzahl": spieleranzahl
        })
        write_entries(CSV_FILE, entries, ["Spiel", "Spielmodus", "Schwierigkeit", "Spieleranzahl"])
        messagebox.showinfo("Erfolg", "Eintrag hinzugefügt!")
        self.clear_entry_fields()
        self.update_entry_tree()
        self.update_selection_panel()

    def update_entry_tree(self):
        self.tree.delete(*self.tree.get_children())
        entries = load_entries(CSV_FILE)
        for index, entry in enumerate(entries):
            self.tree.insert("", "end", iid=str(index),
                             values=(entry["Spiel"], entry["Spielmodus"],
                                     entry["Schwierigkeit"], entry["Spieleranzahl"]))

    def delete_entry(self):
        item = self.tree.focus()
        if not item:
            messagebox.showerror("Fehler", "Kein Eintrag ausgewählt!")
            return
        index = int(item)
        entries = load_entries(CSV_FILE)
        del entries[index]
        write_entries(CSV_FILE, entries, ["Spiel", "Spielmodus", "Schwierigkeit", "Spieleranzahl"])
        messagebox.showinfo("Erfolg", "Eintrag gelöscht!")
        self.update_entry_tree()
        self.update_selection_panel()

    def update_entry_in_csv(self):
        if self.selected_index is None:
            messagebox.showerror("Fehler", "Kein Eintrag ausgewählt.")
            return
        spiel = self.entry_spiel.get().strip()
        spielmodus = self.entry_spielmodus.get().strip()
        schwierigkeit_str = self.entry_schwierigkeit.get().strip()
        spieleranzahl_str = self.entry_spieler.get().strip()
        if not (spiel and spielmodus and schwierigkeit_str and spieleranzahl_str):
            messagebox.showerror("Fehler", "Alle Felder müssen ausgefüllt werden.")
            return
        try:
            schwierigkeit = float(schwierigkeit_str)
            if not (0 <= schwierigkeit <= 10):
                raise ValueError
        except ValueError:
            messagebox.showerror("Fehler", "Schwierigkeit muss eine Zahl zwischen 0 und 10 sein.")
            return
        try:
            spieleranzahl = int(spieleranzahl_str)
            if spieleranzahl < 1:
                raise ValueError
        except ValueError:
            messagebox.showerror("Fehler", "Spieleranzahl muss mindestens 1 sein.")
            return
        entries = load_entries(CSV_FILE)
        if not (0 <= self.selected_index < len(entries)):
            messagebox.showerror("Fehler", "Ausgewählter Eintrag existiert nicht mehr.")
            return
        entries[self.selected_index] = {
            "Spiel": spiel,
            "Spielmodus": spielmodus,
            "Schwierigkeit": schwierigkeit,
            "Spieleranzahl": spieleranzahl
        }
        write_entries(CSV_FILE, entries, ["Spiel", "Spielmodus", "Schwierigkeit", "Spieleranzahl"])
        messagebox.showinfo("Erfolg", "Eintrag aktualisiert!")
        self.selected_index = None
        self.clear_entry_fields()
        self.update_entry_tree()
        self.update_selection_panel()

    def on_treeview_double_click(self, event):
        item = self.tree.focus()
        if not item:
            return
        self.selected_index = int(item)
        values = self.tree.item(item, "values")
        self.entry_spiel.delete(0, "end")
        self.entry_spiel.insert(0, values[0])
        self.entry_spielmodus.delete(0, "end")
        self.entry_spielmodus.insert(0, values[1])
        self.entry_schwierigkeit.delete(0, "end")
        self.entry_schwierigkeit.insert(0, values[2])
        self.entry_spieler.delete(0, "end")
        self.entry_spieler.insert(0, values[3])
