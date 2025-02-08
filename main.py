# main.py
import tkinter as tk
from tkinter import ttk, messagebox
from modules.csv_handler import ensure_csv_exists
from config import CSV_FILE, STRAFEN_CSV
from modules.game_management import GameManager
from modules.game_preferences import update_game_selection_panel, game_vars
from modules.challenge_generator import generate_challenge_logic
from modules.gui_components import open_result_window
from modules.image_utils import export_result_as_image, copy_image_to_clipboard
from modules.strafen import load_strafen, write_strafen, ensure_strafen_csv

# Sicherstellen, dass die CSV-Dateien existieren
ensure_csv_exists(CSV_FILE, ["Spiel", "Spielmodus", "Schwierigkeit", "Spieleranzahl"])
ensure_strafen_csv()
selected_strafe_index = None

root = tk.Tk()
root.title("Win Challenge Generator")
root.geometry("900x600")
root.configure(bg="#2B2B2B")

style = ttk.Style(root)
style.theme_use("clam")
style.configure("TFrame", background="#2B2B2B")
style.configure("TLabel", background="#2B2B2B", foreground="#FFFFFF", font=("Segoe UI", 12))
style.configure("TButton", font=("Segoe UI", 12), padding=5)
style.map("TButton", background=[("active", "#357ABD")], foreground=[("active", "#FFFFFF")])

notebook = ttk.Notebook(root)
notebook.pack(fill="both", expand=True, padx=10, pady=10)

# ----- Tab 1: Challenge Generator -----
tab_gen = ttk.Frame(notebook)
notebook.add(tab_gen, text="Challenge Generator")

ttk.Label(tab_gen, text="Anzahl Spieler:").grid(row=0, column=0, padx=5, pady=5, sticky="w")
combo_num_players = ttk.Combobox(tab_gen, values=["1", "2", "3", "4", "5"], state="readonly", width=5, font=("Segoe UI", 12))
combo_num_players.current(0)
combo_num_players.grid(row=0, column=1, padx=5, pady=5, sticky="w")

ttk.Label(tab_gen, text="Gewünschte Schwierigkeit:").grid(row=1, column=0, padx=5, pady=5, sticky="w")
entry_desired_diff = ttk.Entry(tab_gen, font=("Segoe UI", 12))
entry_desired_diff.grid(row=1, column=1, padx=5, pady=5, sticky="w")

ttk.Label(tab_gen, text="Back-to-Back Wahrscheinlichkeit (0 = keine, 10 = ausschließlich):").grid(row=2, column=0, padx=5, pady=5, sticky="w")
spin_b2b = ttk.Spinbox(tab_gen, from_=0, to=10, width=5, font=("Segoe UI", 12))
spin_b2b.set(1)
spin_b2b.grid(row=2, column=1, padx=5, pady=5, sticky="w")

ttk.Label(tab_gen, text="Wähle die Spiele aus:").grid(row=3, column=0, padx=5, pady=5, sticky="w")
frame_games = tk.Frame(tab_gen, bg="#2B2B2B")
frame_games.grid(row=4, column=0, columnspan=2, sticky="nsew", padx=5, pady=5)
canvas_games = tk.Canvas(frame_games, bg="#2B2B2B", highlightthickness=0)
canvas_games.pack(side="left", fill="both", expand=True)
scrollbar_games = ttk.Scrollbar(frame_games, orient="vertical", command=canvas_games.yview)
scrollbar_games.pack(side="right", fill="y")
frame_games_inner = tk.Frame(canvas_games, bg="#2B2B2B")
canvas_games.create_window((0, 0), window=frame_games_inner, anchor="nw")
frame_games_inner.bind("<Configure>", lambda e: canvas_games.configure(scrollregion=canvas_games.bbox("all")))
update_game_selection_panel(frame_games_inner, root)

ttk.Button(tab_gen, text="Challenge generieren", command=lambda: on_generate_challenge()).grid(row=5, column=0, columnspan=2, padx=5, pady=10)

text_result = tk.Text(tab_gen, height=15, width=60, state="disabled", bg="#1E1E1E", fg="#DCDCDC", font=("Segoe UI", 12))
text_result.grid(row=6, column=0, columnspan=2, padx=5, pady=5, sticky="wens")
scrollbar_text = ttk.Scrollbar(tab_gen, orient="vertical", command=text_result.yview)
text_result.configure(yscrollcommand=scrollbar_text.set)
scrollbar_text.grid(row=6, column=2, sticky="ns")

challenge_data = None  # Global zum Speichern der Challenge-Daten

def on_generate_challenge():
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
    selected_game_list = []
    weights = []
    for game, vars in game_vars.items():
        if vars["selected"].get():
            selected_game_list.append(game)
            try:
                weights.append(float(vars["weight"].get()))
            except ValueError:
                weights.append(1.0)
    if not selected_game_list:
        messagebox.showerror("Fehler", "Bitte wähle mindestens ein Spiel aus.")
        return
    raw_b2b = int(spin_b2b.get())
    data = generate_challenge_logic(num_players, desired_diff, selected_game_list, weights, game_vars, raw_b2b)
    if data is None:
        messagebox.showerror("Fehler", "Keine passenden Einträge gefunden.")
        return
    global challenge_data
    challenge_data = data
    text_result.config(state="normal")
    text_result.delete("1.0", "end")
    text_result.insert("end", data["result"])
    text_result.config(state="disabled")
    from modules.gui_components import open_result_window
    open_result_window(root, data, on_generate_challenge)

# ----- Tab 2: Games -----
tab_entries = ttk.Frame(notebook)
notebook.add(tab_entries, text="Games")

from modules.game_management import GameManager
tree_entries = ttk.Treeview(tab_entries, columns=("Spiel", "Spielmodus", "Schwierigkeit", "Spieleranzahl"), show="headings")
for col in ("Spiel", "Spielmodus", "Schwierigkeit", "Spieleranzahl"):
    tree_entries.heading(col, text=col)
tree_entries.grid(row=0, column=0, columnspan=3, padx=5, pady=5, sticky="wens")

ttk.Label(tab_entries, text="Spiel:").grid(row=1, column=0, padx=5, pady=5, sticky="w")
entry_spiel = ttk.Entry(tab_entries, font=("Segoe UI", 12))
entry_spiel.grid(row=1, column=1, padx=5, pady=5)

ttk.Label(tab_entries, text="Spielmodus:").grid(row=2, column=0, padx=5, pady=5, sticky="w")
entry_spielmodus = ttk.Entry(tab_entries, font=("Segoe UI", 12))
entry_spielmodus.grid(row=2, column=1, padx=5, pady=5)

ttk.Label(tab_entries, text="Schwierigkeit (0-10):").grid(row=3, column=0, padx=5, pady=5, sticky="w")
entry_schwierigkeit = ttk.Entry(tab_entries, font=("Segoe UI", 12))
entry_schwierigkeit.grid(row=3, column=1, padx=5, pady=5)

ttk.Label(tab_entries, text="Spieleranzahl:").grid(row=4, column=0, padx=5, pady=5, sticky="w")
entry_spieler = ttk.Entry(tab_entries, font=("Segoe UI", 12))
entry_spieler.grid(row=4, column=1, padx=5, pady=5)

gm = GameManager(
    {"spiel": entry_spiel, "spielmodus": entry_spielmodus, "schwierigkeit": entry_schwierigkeit, "spieleranzahl": entry_spieler},
    tree_entries,
    lambda: update_game_selection_panel(frame_games_inner, root)
)
gm.update_entry_tree()

# Hier den Double-Click binden:
tree_entries.bind("<Double-1>", gm.on_treeview_double_click)

ttk.Button(tab_entries, text="Eintrag hinzufügen", command=gm.add_entry).grid(row=5, column=0, columnspan=2, padx=5, pady=5)
ttk.Button(tab_entries, text="Eintrag aktualisieren", command=gm.update_entry_in_csv).grid(row=6, column=0, columnspan=2, padx=5, pady=5)
ttk.Button(tab_entries, text="Eintrag löschen", command=gm.delete_entry).grid(row=7, column=0, columnspan=2, padx=5, pady=5)

# ----- Tab 3: Strafen ein -----
tab_strafen = ttk.Frame(notebook)
notebook.add(tab_strafen, text="Strafen")

from modules.strafen import load_strafen, write_strafen
def update_strafen_tree(tree):
    tree.delete(*tree.get_children())
    entries = load_strafen()
    for index, entry in enumerate(entries):
        tree.insert("", "end", iid=str(index),
                    values=(entry["Name"], entry["Wahrscheinlichkeit"], entry.get("Beschreibung", "")))

tree_strafen = ttk.Treeview(tab_strafen, columns=("Name", "Wahrscheinlichkeit", "Beschreibung"), show="headings")
for col in ("Name", "Wahrscheinlichkeit", "Beschreibung"):
    tree_strafen.heading(col, text=col)
tree_strafen.grid(row=0, column=0, columnspan=3, padx=5, pady=5, sticky="wens")
update_strafen_tree(tree_strafen)

ttk.Label(tab_strafen, text="Name:").grid(row=1, column=0, padx=5, pady=5, sticky="w")
entry_strafe_name = ttk.Entry(tab_strafen, font=("Segoe UI", 12))
entry_strafe_name.grid(row=1, column=1, padx=5, pady=5)

ttk.Label(tab_strafen, text="Wahrscheinlichkeit:").grid(row=2, column=0, padx=5, pady=5, sticky="w")
entry_strafe_wahrscheinlichkeit = ttk.Entry(tab_strafen, font=("Segoe UI", 12))
entry_strafe_wahrscheinlichkeit.grid(row=2, column=1, padx=5, pady=5)

ttk.Label(tab_strafen, text="Beschreibung (optional):").grid(row=3, column=0, padx=5, pady=5, sticky="w")
entry_strafe_beschreibung = ttk.Entry(tab_strafen, font=("Segoe UI", 12))
entry_strafe_beschreibung.grid(row=3, column=1, padx=5, pady=5)

def add_strafe_callback():
    name = entry_strafe_name.get().strip()
    wahrscheinlichkeit = entry_strafe_wahrscheinlichkeit.get().strip()
    beschreibung = entry_strafe_beschreibung.get().strip()
    if not name or not wahrscheinlichkeit:
        messagebox.showerror("Fehler", "Name und Wahrscheinlichkeit sind Pflichtfelder.")
        return
    try:
        w = float(wahrscheinlichkeit)
    except ValueError:
        messagebox.showerror("Fehler", "Wahrscheinlichkeit muss eine Zahl sein.")
        return
    from modules.strafen import load_strafen, write_strafen
    entries = load_strafen()
    entries.append({"Name": name, "Wahrscheinlichkeit": w, "Beschreibung": beschreibung})
    write_strafen(entries)
    messagebox.showinfo("Erfolg", "Strafe hinzugefügt!")
    update_strafen_tree(tree_strafen)

ttk.Button(tab_strafen, text="Strafe hinzufügen", command=add_strafe_callback).grid(row=4, column=0, columnspan=2, padx=5, pady=5)

root.mainloop()
