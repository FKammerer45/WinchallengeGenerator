import tkinter as tk
from tkinter import ttk, messagebox
import csv, os, random
from PIL import Image, ImageDraw, ImageFont
from io import BytesIO
import win32clipboard
import win32con

CSV_FILE = "win_challenges.csv"
if not os.path.exists(CSV_FILE):
    with open(CSV_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["Spiel", "Spielmodus", "Schwierigkeit", "Spieleranzahl"])

# Globale Variablen
selected_entry_index = None
# game_vars speichert für jedes Spiel:
# { "selected": BooleanVar, "weight": StringVar, "allowed_modes": set, "available_modes": set }
game_vars = {}

# ------------------ CSV Handling ------------------
def load_entries():
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

# ------------------ Games Tab Funktionen ------------------
def clear_entry_fields():
    entry_spiel.delete(0, tk.END)
    entry_spielmodus.delete(0, tk.END)
    entry_schwierigkeit.delete(0, tk.END)
    entry_spieler.delete(0, tk.END)

def add_entry():
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
    update_entry_tree()
    update_game_selection_panel()

def update_entry_tree():
    for row in tree_entries.get_children():
        tree_entries.delete(row)
    entries = load_entries()
    for index, entry in enumerate(entries):
        tree_entries.insert("", tk.END, iid=str(index),
                            values=(entry["Spiel"], entry["Spielmodus"],
                                    entry["Schwierigkeit"], entry["Spieleranzahl"]))

def delete_entry():
    item = tree_entries.focus()
    if not item:
        messagebox.showerror("Fehler", "Kein Eintrag ausgewählt!")
        return
    index = int(item)
    entries = load_entries()
    del entries[index]
    with open(CSV_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["Spiel", "Spielmodus", "Schwierigkeit", "Spieleranzahl"])
        for entry in entries:
            writer.writerow([entry["Spiel"], entry["Spielmodus"],
                             entry["Schwierigkeit"], entry["Spieleranzahl"]])
    messagebox.showinfo("Erfolg", "Eintrag gelöscht!")
    update_entry_tree()
    update_game_selection_panel()

def update_entry_in_csv():
    global selected_entry_index
    if selected_entry_index is None:
        messagebox.showerror("Fehler", "Kein Eintrag ausgewählt.")
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
    entries[selected_entry_index] = {"Spiel": spiel, "Spielmodus": spielmodus,
                                     "Schwierigkeit": schwierigkeit, "Spieleranzahl": spieleranzahl}
    with open(CSV_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["Spiel", "Spielmodus", "Schwierigkeit", "Spieleranzahl"])
        for entry in entries:
            writer.writerow([entry["Spiel"], entry["Spielmodus"],
                             entry["Schwierigkeit"], entry["Spieleranzahl"]])
    messagebox.showinfo("Erfolg", "Eintrag aktualisiert!")
    selected_entry_index = None
    clear_entry_fields()
    update_entry_tree()
    update_game_selection_panel()

# ------------------ Gamemode-Bearbeitung per Doppelklick ------------------
def edit_game_modes(game):
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

# ------------------ Scrollable Game Selection Panel ------------------
def update_game_selection_panel():
    # Leere alten Inhalt im frame_games_inner
    for widget in frame_games_inner.winfo_children():
        widget.destroy()
    entries = load_entries()
    unique_games = sorted({e["Spiel"] for e in entries})
    for game in unique_games:
        available_modes = {e["Spielmodus"] for e in entries if e["Spiel"] == game}
        if game not in game_vars:
            game_vars[game] = {
                "selected": tk.BooleanVar(value=False),
                "weight": tk.StringVar(value="1.0"),
                "allowed_modes": available_modes.copy(),
                "available_modes": available_modes.copy()
            }
        # Erstelle einen Rahmen mit Border für jeden Eintrag
        row = tk.Frame(frame_games_inner, bg="#2B2B2B", bd=1, relief="solid")
        row.pack(fill="x", padx=5, pady=2)
        # Doppelklick auf den Rahmen (oder den Label) öffnet das Bearbeitungsfenster
        row.bind("<Double-1>", lambda event, g=game: edit_game_modes(g))
        chk = tk.Checkbutton(row, variable=game_vars[game]["selected"], bg="#2B2B2B")
        chk.pack(side="left", padx=5)
        lbl = tk.Label(row, text=game, bg="#2B2B2B", fg="#FFFFFF", font=("Segoe UI", 12), width=20, anchor="w")
        lbl.pack(side="left", padx=5)
        lbl.bind("<Double-1>", lambda event, g=game: edit_game_modes(g))
        spn = ttk.Spinbox(row, from_=0.0, to=10.0, increment=0.1, textvariable=game_vars[game]["weight"], width=5, font=("Segoe UI", 12))
        spn.pack(side="left", padx=5)

# ------------------ Scrollable Frame Utility ------------------
def create_scrollable_frame(parent):
    canvas = tk.Canvas(parent, bg="#2B2B2B", highlightthickness=0)
    scrollbar = ttk.Scrollbar(parent, orient="vertical", command=canvas.yview)
    scrollable_frame = tk.Frame(canvas, bg="#2B2B2B")
    scrollable_frame.bind("<Configure>", lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
    canvas.create_window((0, 0), window=scrollable_frame, anchor="nw")
    canvas.configure(yscrollcommand=scrollbar.set)
    canvas.pack(side="left", fill="both", expand=True)
    scrollbar.pack(side="right", fill="y")
    return scrollable_frame

# ------------------ Bild-Erzeugung & Clipboard ------------------
def create_result_image(result_text):
    lines = result_text.split("\n")
    try:
        font = ImageFont.truetype("arial.ttf", 16)
    except IOError:
        font = ImageFont.load_default()
    max_width = max((font.getbbox(line)[2] - font.getbbox(line)[0]) for line in lines)
    bbox = font.getbbox("Ay")
    line_height = (bbox[3] - bbox[1]) + 5
    img_width = max_width + 20
    img_height = line_height * len(lines) + 20
    img = Image.new("RGB", (img_width, img_height), "white")
    draw = ImageDraw.Draw(img)
    y = 10
    for line in lines:
        draw.text((10, y), line, fill="black", font=font)
        y += line_height
    return img

def export_result_as_image(result_text):
    img = create_result_image(result_text)
    img.save("challenge_result.jpg")
    messagebox.showinfo("Erfolg", "Challenge als Bild gespeichert: challenge_result.jpg")

def send_to_clipboard(clip_type, data):
    win32clipboard.OpenClipboard()
    win32clipboard.EmptyClipboard()
    win32clipboard.SetClipboardData(clip_type, data)
    win32clipboard.CloseClipboard()

def copy_image_to_clipboard(result_text):
    img = create_result_image(result_text)
    output = BytesIO()
    img.convert("RGB").save(output, "BMP")
    data = output.getvalue()[14:]  # BMP-Header entfernen
    output.close()
    send_to_clipboard(win32con.CF_DIB, data)
    messagebox.showinfo("Erfolg", "Bild wurde in die Zwischenablage kopiert.")

# ------------------ Ergebnisfenster ------------------
def open_result_window(result_text):
    result_win = tk.Toplevel(root)
    result_win.title("Challenge Ergebnis")
    result_win.configure(bg="#2B2B2B")
    text_result_win = tk.Text(result_win, height=15, width=60, bg="#1E1E1E", fg="#DCDCDC", font=("Segoe UI", 12))
    text_result_win.pack(side="top", fill="both", expand=True, padx=10, pady=10)
    text_result_win.insert(tk.END, result_text)
    text_result_win.config(state=tk.DISABLED)
    button_frame = ttk.Frame(result_win)
    button_frame.pack(side="bottom", pady=10)
    def on_accept():
        btn_accept.destroy()
        btn_regenerate.destroy()
        btn_export = ttk.Button(button_frame, text="Als Bild exportieren",
                                command=lambda: export_result_as_image(result_text))
        btn_export.pack(side="left", padx=5)
        btn_copy = ttk.Button(button_frame, text="Bild in Zwischenablage kopieren",
                              command=lambda: copy_image_to_clipboard(result_text))
        btn_copy.pack(side="left", padx=5)
    def regenerate():
        result_win.destroy()
        generate_challenge()
    btn_accept = ttk.Button(button_frame, text="Akzeptieren", command=on_accept)
    btn_accept.pack(side="left", padx=5)
    btn_regenerate = ttk.Button(button_frame, text="Neu generieren", command=regenerate)
    btn_regenerate.pack(side="left", padx=5)

# ------------------ Challenge Generator ------------------
def generate_challenge():
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
    entries = load_entries()
    filtered = [e for e in entries if e["Spieleranzahl"] >= num_players]
    # Gruppiere nach Spiel
    available_games = {}
    selected_game_list = []
    weights = []
    for game, vars in game_vars.items():
        if vars["selected"].get():
            allowed = vars["allowed_modes"]
            game_entries = [e for e in filtered if e["Spiel"] == game and e["Spielmodus"] in allowed]
            if game_entries:
                available_games[game] = game_entries
                try:
                    w = float(vars["weight"].get())
                except ValueError:
                    w = 1.0
                selected_game_list.append(game)
                weights.append(w)
    if not available_games:
        messagebox.showerror("Fehler", "Keine Spiele ausgewählt oder keine passenden Einträge gefunden.")
        return
    raw_b2b = int(spin_b2b.get())
    p_eff = (raw_b2b / 10) ** 1.447
    segments = []
    total_diff = 0.0
    while total_diff < desired_diff:
        if random.uniform(0, 1) < p_eff:
            seg_length = random.choice([2, 3, 4])
        else:
            seg_length = 1
        wins = []
        for _ in range(seg_length):
            chosen_game = random.choices(selected_game_list, weights=weights, k=1)[0]
            chosen_entry = random.choice(available_games[chosen_game])
            wins.append(chosen_entry)
        seg_sum = sum(win["Schwierigkeit"] for win in wins)
        seg_diff = seg_sum * (1.5 ** (seg_length - 1)) if seg_length > 1 else seg_sum
        segments.append({"wins": wins, "length": seg_length, "seg_diff": seg_diff})
        total_diff += seg_diff
    normal_segments = [seg for seg in segments if seg["length"] == 1]
    normal_group = {}
    for seg in normal_segments:
        win = seg["wins"][0]
        key = f"{win['Spiel']} ({win['Spielmodus']})"
        if key not in normal_group:
            normal_group[key] = {"count": 0, "diff": 0.0}
        normal_group[key]["count"] += 1
        normal_group[key]["diff"] += win["Schwierigkeit"]
    b2b_segments = [seg for seg in segments if seg["length"] > 1]
    b2b_grouped = []
    for seg in b2b_segments:
        group = {}
        for win in seg["wins"]:
            key = f"{win['Spiel']} ({win['Spielmodus']})"
            group[key] = group.get(key, 0) + 1
        b2b_grouped.append({"group": group, "length": seg["length"], "seg_diff": seg["seg_diff"]})
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
    open_result_window(result)

# ------------------ GUI Aufbau & Styling ------------------
root = tk.Tk()
root.title("Win Challenge Generator")
root.geometry("900x600")
root.configure(bg="#2B2B2B")

style = ttk.Style(root)
style.theme_use("clam")
style.configure("TFrame", background="#2B2B2B")
style.configure("TLabel", background="#2B2B2B", foreground="#FFFFFF", font=("Segoe UI", 12))
style.configure("TButton", font=("Segoe UI", 12), padding=5)
style.map("TButton",
          background=[("active", "#357ABD")],
          foreground=[("active", "#FFFFFF")])

notebook = ttk.Notebook(root)
notebook.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)

# Tab 1: Challenge Generator
tab_gen = ttk.Frame(notebook)
notebook.add(tab_gen, text="Challenge Generator")

ttk.Label(tab_gen, text="Anzahl Spieler:").grid(row=0, column=0, padx=5, pady=5, sticky=tk.W)
combo_num_players = ttk.Combobox(tab_gen, values=["1", "2", "3", "4", "5"], state="readonly", width=5, font=("Segoe UI", 12))
combo_num_players.current(0)
combo_num_players.grid(row=0, column=1, padx=5, pady=5, sticky=tk.W)

ttk.Label(tab_gen, text="Gewünschte Schwierigkeit:").grid(row=1, column=0, padx=5, pady=5, sticky=tk.W)
entry_desired_diff = ttk.Entry(tab_gen, font=("Segoe UI", 12))
entry_desired_diff.grid(row=1, column=1, padx=5, pady=5, sticky=tk.W)

ttk.Label(tab_gen, text="Back-to-Back Wahrscheinlichkeit (0 = keine, 10 = ausschließlich):").grid(row=2, column=0, padx=5, pady=5, sticky=tk.W)
spin_b2b = ttk.Spinbox(tab_gen, from_=0, to=10, width=5, font=("Segoe UI", 12))
spin_b2b.set(1)
spin_b2b.grid(row=2, column=1, padx=5, pady=5, sticky=tk.W)

ttk.Label(tab_gen, text="Wähle die Spiele aus:").grid(row=3, column=0, padx=5, pady=5, sticky=tk.W)
frame_games = tk.Frame(tab_gen, bg="#2B2B2B")
frame_games.grid(row=4, column=0, columnspan=2, sticky="nsew", padx=5, pady=5)
canvas_games = tk.Canvas(frame_games, bg="#2B2B2B", highlightthickness=0)
canvas_games.pack(side="left", fill="both", expand=True)
scrollbar_games = ttk.Scrollbar(frame_games, orient="vertical", command=canvas_games.yview)
scrollbar_games.pack(side="right", fill="y")
frame_games_inner = tk.Frame(canvas_games, bg="#2B2B2B")
canvas_games.create_window((0, 0), window=frame_games_inner, anchor="nw")
frame_games_inner.bind("<Configure>", lambda e: canvas_games.configure(scrollregion=canvas_games.bbox("all")))
update_game_selection_panel()

ttk.Button(tab_gen, text="Challenge generieren", command=generate_challenge).grid(row=5, column=0, columnspan=2, padx=5, pady=10)

text_result = tk.Text(tab_gen, height=15, width=60, state=tk.DISABLED, bg="#1E1E1E", fg="#DCDCDC", font=("Segoe UI", 12))
text_result.grid(row=6, column=0, columnspan=2, padx=5, pady=5, sticky=tk.W+tk.E)
scrollbar_text = ttk.Scrollbar(tab_gen, orient=tk.VERTICAL, command=text_result.yview)
text_result.config(yscrollcommand=scrollbar_text.set)
scrollbar_text.grid(row=6, column=2, sticky="ns")

# Tab 2: Games
tab_entries = ttk.Frame(notebook)
notebook.add(tab_entries, text="Games")

tree_entries = ttk.Treeview(tab_entries, columns=("Spiel", "Spielmodus", "Schwierigkeit", "Spieleranzahl"), show="headings")
tree_entries.heading("Spiel", text="Spiel")
tree_entries.heading("Spielmodus", text="Spielmodus")
tree_entries.heading("Schwierigkeit", text="Schwierigkeit")
tree_entries.heading("Spieleranzahl", text="Spieleranzahl")
tree_entries.grid(row=0, column=0, columnspan=3, padx=5, pady=5, sticky=tk.W+tk.E)
tree_entries.bind("<Double-1>", lambda event: on_treeview_double_click(event))

ttk.Label(tab_entries, text="Spiel:").grid(row=1, column=0, padx=5, pady=5, sticky=tk.W)
entry_spiel = ttk.Entry(tab_entries, font=("Segoe UI", 12))
entry_spiel.grid(row=1, column=1, padx=5, pady=5)

ttk.Label(tab_entries, text="Spielmodus:").grid(row=2, column=0, padx=5, pady=5, sticky=tk.W)
entry_spielmodus = ttk.Entry(tab_entries, font=("Segoe UI", 12))
entry_spielmodus.grid(row=2, column=1, padx=5, pady=5)

ttk.Label(tab_entries, text="Schwierigkeit (0-10):").grid(row=3, column=0, padx=5, pady=5, sticky=tk.W)
entry_schwierigkeit = ttk.Entry(tab_entries, font=("Segoe UI", 12))
entry_schwierigkeit.grid(row=3, column=1, padx=5, pady=5)

ttk.Label(tab_entries, text="Spieleranzahl:").grid(row=4, column=0, padx=5, pady=5, sticky=tk.W)
entry_spieler = ttk.Entry(tab_entries, font=("Segoe UI", 12))
entry_spieler.grid(row=4, column=1, padx=5, pady=5)

ttk.Button(tab_entries, text="Eintrag hinzufügen", command=add_entry).grid(row=5, column=0, columnspan=2, padx=5, pady=5)
ttk.Button(tab_entries, text="Eintrag aktualisieren", command=update_entry_in_csv).grid(row=6, column=0, columnspan=2, padx=5, pady=5)
ttk.Button(tab_entries, text="Eintrag löschen", command=delete_entry).grid(row=7, column=0, columnspan=2, padx=5, pady=5)

update_entry_tree()

root.mainloop()
