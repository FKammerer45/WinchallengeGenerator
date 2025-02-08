# modules/image_utils.py
from PIL import Image, ImageDraw, ImageFont
from io import BytesIO
import win32clipboard
import win32con
from tkinter import messagebox

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
