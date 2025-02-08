# modules/gui_components.py
import tkinter as tk
from tkinter import ttk, messagebox
from modules.image_utils import export_result_as_image, copy_image_to_clipboard

def open_result_window(root, challenge_data, generate_challenge_callback):
    """
    Öffnet ein Ergebnisfenster. Zunächst wird nur der Ergebnistext
    und unten die Buttons "Akzeptieren" und "Neu generieren" angezeigt.
    Nach Klick auf "Akzeptieren" erscheint der Timer-Steuerungsbereich
    (mit Start, Pause, Reset) sowie der schön formatierte Bereich zum 
    Markieren der erreichten Wins.
    """
    result_win = tk.Toplevel(root)
    result_win.title("Challenge Ergebnis")
    result_win.configure(bg="#2B2B2B")
    
    # Ergebnisanzeige (immer sichtbar)
    text_result_win = tk.Text(result_win, height=10, width=60, bg="#1E1E1E", fg="#DCDCDC", font=("Segoe UI", 12))
    text_result_win.pack(side="top", fill="both", expand=True, padx=10, pady=10)
    text_result_win.insert(tk.END, challenge_data["result"])
    text_result_win.config(state="disabled")
    
    # Der Control-Frame (Timer + Checkbox-Bereich) wird zunächst NICHT gepackt.
    control_frame = tk.Frame(result_win, bg="#2B2B2B")
    
    # Timer-Bereich in control_frame
    timer_frame = tk.Frame(control_frame, bg="#2B2B2B")
    timer_label = tk.Label(timer_frame, text="00:00:00", font=("Segoe UI", 12), bg="#2B2B2B", fg="#FFFFFF")
    timer_label.pack(side="left", padx=5)
    btn_start = ttk.Button(timer_frame, text="Start")
    btn_pause = ttk.Button(timer_frame, text="Pause")
    btn_reset = ttk.Button(timer_frame, text="Reset")
    btn_start.pack(side="left", padx=5)
    btn_pause.pack(side="left", padx=5)
    btn_reset.pack(side="left", padx=5)
    timer_frame.pack(fill="x", padx=10, pady=5)
    
    # Checkbox-Bereich (für erreichte Wins)
    wins_frame = tk.Frame(control_frame, bg="#2B2B2B")
    wins_title = tk.Label(wins_frame, text="Markiere die erreichten Wins:", font=("Segoe UI", 12, "bold"), bg="#2B2B2B", fg="#FFFFFF")
    wins_title.pack(anchor="w", padx=5, pady=(5,2))
    
    # Für Normal Wins:
    for key, info in challenge_data["normal"].items():
        row = tk.Frame(wins_frame, bg="#2B2B2B", bd=1, relief="groove")
        row.pack(fill="x", padx=10, pady=2)
        lbl = tk.Label(row, text=f"{key}:", font=("Segoe UI", 12), bg="#2B2B2B", fg="#FFFFFF", width=30, anchor="w")
        lbl.grid(row=0, column=0, padx=5, pady=5)
        for i in range(info["count"]):
            cb = tk.Checkbutton(row, bg="#2B2B2B")
            cb.grid(row=0, column=i+1, padx=3, pady=5)
            
    # Für Back-to-Back Wins:
    for i, seg in enumerate(challenge_data["b2b"], 1):
        for key, count in seg["group"].items():
            row = tk.Frame(wins_frame, bg="#2B2B2B", bd=1, relief="groove")
            row.pack(fill="x", padx=10, pady=2)
            lbl = tk.Label(row, text=f"Segment {i} – {key}:", font=("Segoe UI", 12), bg="#2B2B2B", fg="#FFFFFF", width=30, anchor="w")
            lbl.grid(row=0, column=0, padx=5, pady=5)
            for j in range(count):
                cb = tk.Checkbutton(row, bg="#2B2B2B")
                cb.grid(row=0, column=j+1, padx=3, pady=5)
    wins_frame.pack(fill="both", padx=10, pady=5)
    
    # Timer-Logik
    timer_data = {"running": False, "elapsed": 0}
    def update_timer():
        if timer_data["running"]:
            timer_data["elapsed"] += 1
            hrs = timer_data["elapsed"] // 3600
            mins = (timer_data["elapsed"] % 3600) // 60
            secs = timer_data["elapsed"] % 60
            timer_label.config(text=f"{hrs:02d}:{mins:02d}:{secs:02d}")
        result_win.after(1000, update_timer)
    def start_timer():
        timer_data["running"] = True
    def pause_timer():
        timer_data["running"] = False
    def reset_timer():
        timer_data["elapsed"] = 0
        timer_label.config(text="00:00:00")
    btn_start.config(command=start_timer)
    btn_pause.config(command=pause_timer)
    btn_reset.config(command=reset_timer)
    
    # Button-Frame (immer sichtbar)
    button_frame = ttk.Frame(result_win)
    button_frame.pack(side="bottom", pady=10)
    
    # Zunächst werden nur "Akzeptieren" und "Neu generieren" angezeigt.
    def on_accept():
        # Entferne diese beiden Buttons.
        btn_accept.destroy()
        btn_regenerate.destroy()
        # Jetzt wird der Steuerungsbereich eingeblendet.
        control_frame.pack(fill="both", expand=True)
        # Zusätzlich werden jetzt Steuerungsbuttons zum Exportieren etc. hinzugefügt.
        btn_export = ttk.Button(button_frame, text="Als Bild exportieren",
                                command=lambda: export_result_as_image(challenge_data["result"]))
        btn_export.pack(side="left", padx=5)
        btn_copy = ttk.Button(button_frame, text="Bild in Zwischenablage kopieren",
                              command=lambda: copy_image_to_clipboard(challenge_data["result"]))
        btn_copy.pack(side="left", padx=5)
        # Zusätzlich wird ein neuer "Start" Button (für den Timer) eingeblendet – allerdings befindet sich
        # unser Timer bereits in control_frame und die Buttons Start/Pause/Reset wurden initialisiert.
        # Wir können also den Timer sofort steuern.
    def regenerate():
        result_win.destroy()
        generate_challenge_callback()
    
    btn_accept = ttk.Button(button_frame, text="Akzeptieren", command=on_accept)
    btn_accept.pack(side="left", padx=5)
    btn_regenerate = ttk.Button(button_frame, text="Neu generieren", command=regenerate)
    btn_regenerate.pack(side="left", padx=5)
    
    # Der Start-Button für den Timer wird hier NICHT sofort angezeigt, sondern erst nachdem "Akzeptieren" gedrückt wurde.
    # (Die Timer-Steuerung ist bereits in control_frame enthalten und wird sichtbar, sobald on_accept() ausgeführt wird.)
    
    update_timer()
