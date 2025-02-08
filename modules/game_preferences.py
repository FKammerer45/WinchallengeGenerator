# modules/game_preferences.py
import tkinter as tk
from tkinter import ttk, messagebox

# game_vars speichert für jedes Spiel:
# { "selected": BooleanVar, "weight": StringVar, "allowed_modes": set, "available_modes": set }
# Diese Variable wird in main.py initialisiert und dann von diesem Modul genutzt.
game_vars = {}

def edit_game_modes(root, game):
    available = sorted(list(game_vars[game]["available_modes"]))
    current_allowed = game_vars[game]["allowed_modes"]
    mode_vars = {}
    win = tk.Toplevel(root)
    win.title(f"Gamemodes für {game}")
    win.configure(bg="#2B2B2B")
    tk.Label(win, text="Wähle die Spielmodi aus:", bg="#2B2B2B", fg="#FFFFFF", font=("Segoe UI", 12)).pack(padx=5, pady=5)
    for mode in available:
        var = tk.BooleanVar(value=(mode in current_allowed))
        chk = ttk.Checkbutton(win, text=mode, variable=var)
        chk.pack(anchor="w", padx=10, pady=2)
        mode_vars[mode] = var
    def save_modes():
        selected_modes = {mode for mode, var in mode_vars.items() if var.get()}
        if not selected_modes:
            messagebox.showerror("Fehler", "Mindestens ein Spielmodus muss ausgewählt sein.")
            return
        game_vars[game]["allowed_modes"] = selected_modes
        win.destroy()
    ttk.Button(win, text="Speichern", command=save_modes).pack(padx=5, pady=10)

def update_game_selection_panel(parent_frame, root):
    # Löscht den alten Inhalt des Panels
    for widget in parent_frame.winfo_children():
        widget.destroy()
    # Angenommen, du erhältst eine Liste aller Spiele aus der CSV
    from modules.csv_handler import load_entries
    entries = load_entries()
    unique_games = sorted({e["Spiel"] for e in entries})
    # Initialisiere game_vars, falls noch nicht vorhanden
    for game in unique_games:
        available_modes = {e["Spielmodus"] for e in entries if e["Spiel"] == game}
        if game not in game_vars:
            game_vars[game] = {
                "selected": tk.BooleanVar(value=False),
                "weight": tk.StringVar(value="1.0"),
                "allowed_modes": available_modes.copy(),
                "available_modes": available_modes.copy()
            }
        row = tk.Frame(parent_frame, bg="#2B2B2B", bd=1, relief="solid")
        row.pack(fill="x", padx=5, pady=2)
        row.bind("<Double-1>", lambda event, g=game: edit_game_modes(root, g))
        chk = tk.Checkbutton(row, variable=game_vars[game]["selected"], bg="#2B2B2B")
        chk.pack(side="left", padx=5)
        lbl = tk.Label(row, text=game, bg="#2B2B2B", fg="#FFFFFF", font=("Segoe UI", 12), width=20, anchor="w")
        lbl.pack(side="left", padx=5)
        lbl.bind("<Double-1>", lambda event, g=game: edit_game_modes(root, g))
        spn = ttk.Spinbox(row, from_=0.0, to=10.0, increment=0.1, textvariable=game_vars[game]["weight"], width=5, font=("Segoe UI", 12))
        spn.pack(side="left", padx=5)
