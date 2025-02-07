import tkinter as tk
from tkinter import ttk, messagebox
import csv, os, random

CSV_FILE = "win_challenges.csv"

# CSV anlegen, falls nicht vorhanden
if not os.path.exists(CSV_FILE):
    with open(CSV_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["Spiel", "Spielmodus", "Schwierigkeit", "Spieleranzahl"])

# Globaler Index für den aktuell ausgewählten Eintrag (für Update)
selected_entry_index = None

def load_entries():
    """Lädt alle CSV-Einträge als Liste von Dicts."""
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

def clear_entry_fields():
    """Leert die Eingabefelder im 'Eintrag hinzufügen'-Tab."""
    entry_spiel.delete(0, tk.END)
    entry_spielmodus.delete(0, tk.END)
    entry_schwierigkeit.delete(0, tk.END)
    entry_spieler.delete(0, tk.END)

def add_entry():
    """Fügt einen neuen Eintrag zur CSV hinzu und aktualisiert die Anzeige."""
    spiel = entry_spiel.get().strip()
    spielmodus = entry_spielmodus.get().strip()
    schwierigkeit_str = entry_schwierigkeit.get().strip()
    spieleranzahl_str = entry_spieler.get().strip()
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
    with open(CSV_FILE, "a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([spiel, spielmodus, schwierigkeit, spieleranzahl])
    messagebox.showinfo("Erfolg", "Eintrag hinzugefügt!")
    clear_entry_fields()
    update_game_listbox()
    update_entry_tree()

def update_entry_tree():
    """Aktualisiert die Treeview mit allen CSV-Einträgen (iid entspricht dem Index)."""
    for row in tree_entries.get_children():
        tree_entries.delete(row)
    entries = load_entries()
    for index, entry in enumerate(entries):
        tree_entries.insert("", tk.END, iid=str(index), values=(entry["Spiel"], entry["Spielmodus"],
                                                                 entry["Schwierigkeit"], entry["Spieleranzahl"]))

def update_game_listbox():
    """Aktualisiert die Listbox im Generator mit den verfügbaren Spielen."""
    entries = load_entries()
    games = sorted({e["Spiel"] for e in entries})
    listbox_games.delete(0, tk.END)
    for game in games:
        listbox_games.insert(tk.END, game)

def on_treeview_double_click(event):
    """Lädt per Doppelklick den gewählten Eintrag in die Eingabefelder zur Bearbeitung."""
    global selected_entry_index
    item = tree_entries.focus()
    if not item:
        return
    selected_entry_index = int(item)  # iid entspricht dem Index
    values = tree_entries.item(item, "values")
    entry_spiel.delete(0, tk.END); entry_spiel.insert(0, values[0])
    entry_spielmodus.delete(0, tk.END); entry_spielmodus.insert(0, values[1])
    entry_schwierigkeit.delete(0, tk.END); entry_schwierigkeit.insert(0, values[2])
    entry_spieler.delete(0, tk.END); entry_spieler.insert(0, values[3])

def update_entry():
    """Speichert die Änderungen des aktuell ausgewählten Eintrags in der CSV."""
    global selected_entry_index
    if selected_entry_index is None:
        messagebox.showerror("Fehler", "Kein Eintrag ausgewählt. Bitte doppelklicken Sie einen Eintrag in der Tabelle.")
        return
    spiel = entry_spiel.get().strip()
    spielmodus = entry_spielmodus.get().strip()
    schwierigkeit_str = entry_schwierigkeit.get().strip()
    spieleranzahl_str = entry_spieler.get().strip()
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
    entries = load_entries()
    if not (0 <= selected_entry_index < len(entries)):
        messagebox.showerror("Fehler", "Ausgewählter Eintrag existiert nicht mehr.")
        return
    entries[selected_entry_index] = {
        "Spiel": spiel,
        "Spielmodus": spielmodus,
        "Schwierigkeit": schwierigkeit,
        "Spieleranzahl": spieleranzahl
    }
    with open(CSV_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["Spiel", "Spielmodus", "Schwierigkeit", "Spieleranzahl"])
        for entry in entries:
            writer.writerow([entry["Spiel"], entry["Spielmodus"], entry["Schwierigkeit"], entry["Spieleranzahl"]])
    messagebox.showinfo("Erfolg", "Eintrag aktualisiert!")
    selected_entry_index = None
    clear_entry_fields()
    update_entry_tree()
    update_game_listbox()

def generate_challenge():
    """
    Generiert die Challenge als Folge von Segmenten.
    - Filter: Einträge mit Spieleranzahl >= gewählter Anzahl (optional nach Spiel).
    - Jedes Segment besteht aus 1 bis 4 Wins (Einträge können mehrfach genutzt werden).
    - Back-to-Back (Segmente mit >1 Win) berechnen die Schwierigkeit: Summe * (1.5^(n-1)).
    - Ausgabe: Normale Wins werden nach Spiel und Spielmodus gruppiert, Back-to-Back-Segmente separat aufgeführt.
    """
    try:
        num_players = int(combo_num_players.get())
    except ValueError:
        messagebox.showerror("Fehler", "Bitte wähle eine Anzahl an Spielern aus.")
        return
    desired_diff_str = entry_desired_diff.get().strip()
    if not desired_diff_str:
        messagebox.showerror("Fehler", "Bitte gewünschte Schwierigkeit eingeben.")
        return
    try:
        desired_diff = float(desired_diff_str)
        if desired_diff <= 0:
            raise ValueError
    except ValueError:
        messagebox.showerror("Fehler", "Gewünschte Schwierigkeit muss eine Zahl > 0 sein.")
        return
    selected_games = [listbox_games.get(i) for i in listbox_games.curselection()]
    entries = load_entries()
    filtered = [e for e in entries if e["Spieleranzahl"] >= num_players and (not selected_games or e["Spiel"] in selected_games)]
    if not filtered:
        messagebox.showerror("Fehler", "Keine passenden Einträge gefunden.")
        return

    segments = []
    total_diff = 0.0
    while total_diff < desired_diff:
        seg_length = random.choice([1, 2, 3, 4])
        wins = [random.choice(filtered) for _ in range(seg_length)]
        seg_sum = sum(win["Schwierigkeit"] for win in wins)
        seg_diff = seg_sum * (1.5 ** (seg_length - 1)) if seg_length > 1 else seg_sum
        segments.append({"wins": wins, "length": seg_length, "seg_diff": seg_diff})
        total_diff += seg_diff

    # Normal-Segmente (nur 1 Win) gruppieren – Schlüssel = "Spiel (Spielmodus)"
    normal_segments = [seg for seg in segments if seg["length"] == 1]
    normal_group = {}
    for seg in normal_segments:
        win = seg["wins"][0]
        key = f"{win['Spiel']} ({win['Spielmodus']})"
        if key not in normal_group:
            normal_group[key] = {"count": 0, "diff": 0.0}
        normal_group[key]["count"] += 1
        normal_group[key]["diff"] += win["Schwierigkeit"]

    # Back-to-Back Segmente gruppieren – hier erfolgt die Gruppierung pro Segment
    b2b_segments = [seg for seg in segments if seg["length"] > 1]
    b2b_grouped = []
    for seg in b2b_segments:
        group = {}
        for win in seg["wins"]:
            key = f"{win['Spiel']} ({win['Spielmodus']})"
            group[key] = group.get(key, 0) + 1
        b2b_grouped.append({"group": group, "length": seg["length"], "seg_diff": seg["seg_diff"]})

    # Erstelle die textuelle Ausgabe
    result = f"Gesamtschwierigkeit: {total_diff:.2f}\n\n"
    if normal_group:
        result += "Normal Wins:\n"
        for key, info in normal_group.items():
            result += f"  {key}: {info['count']} win(s) (Summe Schwierigkeit: {info['diff']:.2f})\n"
        result += "\n"
    if b2b_grouped:
        result += "Back-to-Back Wins:\n"
        for i, seg in enumerate(b2b_grouped, 1):
            result += f"  Segment {i} ({seg['length']} wins, berechnete Schwierigkeit: {seg['seg_diff']:.2f}):\n"
            for key, count in seg["group"].items():
                result += f"    {key}: {count} win(s)\n"
            result += "\n"

    text_result.config(state=tk.NORMAL)
    text_result.delete("1.0", tk.END)
    text_result.insert(tk.END, result)
    text_result.config(state=tk.DISABLED)

# --- GUI-Aufbau ---
root = tk.Tk()
root.title("Win Challenge Generator")

notebook = ttk.Notebook(root)
notebook.pack(fill=tk.BOTH, expand=True)

# Tab 1: Challenge Generator
tab_gen = ttk.Frame(notebook)
notebook.add(tab_gen, text="Challenge Generator")

ttk.Label(tab_gen, text="Anzahl Spieler:").grid(row=0, column=0, padx=5, pady=5, sticky=tk.W)
combo_num_players = ttk.Combobox(tab_gen, values=["1", "2", "3", "4", "5"], state="readonly", width=5)
combo_num_players.current(0)
combo_num_players.grid(row=0, column=1, padx=5, pady=5, sticky=tk.W)

ttk.Label(tab_gen, text="Gewünschte Spiele (optional):").grid(row=1, column=0, padx=5, pady=5, sticky=tk.W)
listbox_games = tk.Listbox(tab_gen, selectmode=tk.MULTIPLE, height=5)
listbox_games.grid(row=1, column=1, padx=5, pady=5, sticky=tk.W+tk.E)

ttk.Label(tab_gen, text="Gewünschte Schwierigkeit:").grid(row=2, column=0, padx=5, pady=5, sticky=tk.W)
entry_desired_diff = ttk.Entry(tab_gen)
entry_desired_diff.grid(row=2, column=1, padx=5, pady=5, sticky=tk.W)

ttk.Button(tab_gen, text="Challenge generieren", command=generate_challenge).grid(row=3, column=0, columnspan=2, padx=5, pady=10)

# Großes Textfeld mit Scrollbar für die Ausgabe
text_result = tk.Text(tab_gen, height=15, width=60, state=tk.DISABLED)
text_result.grid(row=4, column=0, columnspan=2, padx=5, pady=5, sticky=tk.W+tk.E)
scrollbar = ttk.Scrollbar(tab_gen, orient=tk.VERTICAL, command=text_result.yview)
text_result.config(yscrollcommand=scrollbar.set)
scrollbar.grid(row=4, column=2, sticky="ns")

update_game_listbox()

# Tab 2: Eintrag hinzufügen & anzeigen
tab_entries = ttk.Frame(notebook)
notebook.add(tab_entries, text="Eintrag hinzufügen")

tree_entries = ttk.Treeview(tab_entries, columns=("Spiel", "Spielmodus", "Schwierigkeit", "Spieleranzahl"), show="headings")
tree_entries.heading("Spiel", text="Spiel")
tree_entries.heading("Spielmodus", text="Spielmodus")
tree_entries.heading("Schwierigkeit", text="Schwierigkeit")
tree_entries.heading("Spieleranzahl", text="Spieleranzahl")
tree_entries.grid(row=0, column=0, columnspan=2, padx=5, pady=5, sticky=tk.W+tk.E)
tree_entries.bind("<Double-1>", on_treeview_double_click)

ttk.Label(tab_entries, text="Spiel:").grid(row=1, column=0, padx=5, pady=5, sticky=tk.W)
entry_spiel = ttk.Entry(tab_entries)
entry_spiel.grid(row=1, column=1, padx=5, pady=5)

ttk.Label(tab_entries, text="Spielmodus:").grid(row=2, column=0, padx=5, pady=5, sticky=tk.W)
entry_spielmodus = ttk.Entry(tab_entries)
entry_spielmodus.grid(row=2, column=1, padx=5, pady=5)

ttk.Label(tab_entries, text="Schwierigkeit (0-10):").grid(row=3, column=0, padx=5, pady=5, sticky=tk.W)
entry_schwierigkeit = ttk.Entry(tab_entries)
entry_schwierigkeit.grid(row=3, column=1, padx=5, pady=5)

ttk.Label(tab_entries, text="Spieleranzahl:").grid(row=4, column=0, padx=5, pady=5, sticky=tk.W)
entry_spieler = ttk.Entry(tab_entries)
entry_spieler.grid(row=4, column=1, padx=5, pady=5)

button_add_entry = ttk.Button(tab_entries, text="Eintrag hinzufügen", command=add_entry)
button_add_entry.grid(row=5, column=0, columnspan=2, padx=5, pady=5)

button_update_entry = ttk.Button(tab_entries, text="Eintrag aktualisieren", command=update_entry)
button_update_entry.grid(row=6, column=0, columnspan=2, padx=5, pady=5)

update_entry_tree()

root.mainloop()
