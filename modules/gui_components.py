# modules/gui_components.py
import tkinter as tk
from tkinter import ttk, messagebox
from modules.image_utils import export_result_as_image, copy_image_to_clipboard

def open_result_window(root, result_text, generate_challenge_callback):
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
        generate_challenge_callback()
    btn_accept = ttk.Button(button_frame, text="Akzeptieren", command=on_accept)
    btn_accept.pack(side="left", padx=5)
    btn_regenerate = ttk.Button(button_frame, text="Neu generieren", command=regenerate)
    btn_regenerate.pack(side="left", padx=5)

def create_scrollable_frame(parent, bg_color="#2B2B2B"):
    canvas = tk.Canvas(parent, bg=bg_color, highlightthickness=0)
    scrollbar = ttk.Scrollbar(parent, orient="vertical", command=canvas.yview)
    scrollable_frame = tk.Frame(canvas, bg=bg_color)
    scrollable_frame.bind("<Configure>", lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
    canvas.create_window((0, 0), window=scrollable_frame, anchor="nw")
    canvas.configure(yscrollcommand=scrollbar.set)
    canvas.pack(side="left", fill="both", expand=True)
    scrollbar.pack(side="right", fill="y")
    return scrollable_frame
