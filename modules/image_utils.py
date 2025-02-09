# modules/image_utils.py
from PIL import Image, ImageDraw, ImageFont
from io import BytesIO

def create_result_image(result_text):
    """
    Erzeugt ein PIL-Image basierend auf dem result_text.
    """
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

def export_result_as_image(result_text, filename="challenge_result.jpg"):
    """
    Speichert das Bild, das aus result_text erstellt wurde, unter dem angegebenen Dateinamen.
    Gibt den Dateinamen zurück.
    """
    img = create_result_image(result_text)
    img.save(filename)
    return filename

# Clipboard-Funktionen entfallen in einer Web-Umgebung.
