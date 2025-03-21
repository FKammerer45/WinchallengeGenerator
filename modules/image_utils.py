# modules/image_utils.py
import logging
from PIL import Image, ImageDraw, ImageFont
from typing import Union

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

def create_result_image(result_text: str) -> Image.Image:
    """
    Erzeugt ein PIL-Image basierend auf dem result_text.

    :param result_text: Der Text, der in ein Bild umgewandelt werden soll.
    :return: Ein PIL.Image Objekt mit dem gerenderten Text.
    """
    lines = result_text.split("\n")
    logger.debug("Creating image from result text with %d lines.", len(lines))
    
    try:
        font = ImageFont.truetype("arial.ttf", 16)
        logger.debug("Loaded truetype font 'arial.ttf'.")
    except IOError:
        font = ImageFont.load_default()
        logger.warning("Failed to load 'arial.ttf'. Using default font.")
    
    try:
        # Berechne die maximale Breite der Zeilen
        max_width = max((font.getbbox(line)[2] - font.getbbox(line)[0]) for line in lines)
    except Exception as e:
        logger.exception("Error calculating max width: %s", e)
        max_width = 0

    bbox = font.getbbox("Ay")
    line_height = (bbox[3] - bbox[1]) + 5
    img_width = max_width + 20
    img_height = line_height * len(lines) + 20

    logger.debug("Calculated image dimensions: width=%d, height=%d", img_width, img_height)

    img = Image.new("RGB", (img_width, img_height), "white")
    draw = ImageDraw.Draw(img)
    y = 10
    for line in lines:
        draw.text((10, y), line, fill="black", font=font)
        y += line_height
    logger.debug("Finished drawing text on image.")
    return img

def export_result_as_image(result_text: str, filename: str = "challenge_result.jpg") -> str:
    """
    Speichert das Bild, das aus result_text erstellt wurde, unter dem angegebenen Dateinamen.
    Gibt den Dateinamen zurück.

    :param result_text: Der Text, der als Bild gespeichert werden soll.
    :param filename: Der Name der Datei, unter der das Bild gespeichert wird.
    :return: Der Dateiname, in dem das Bild gespeichert wurde.
    """
    img = create_result_image(result_text)
    try:
        img.save(filename)
        logger.debug("Image saved successfully as '%s'.", filename)
    except Exception as e:
        logger.exception("Error saving image to file '%s': %s", filename, e)
        raise e
    return filename

# Clipboard-Funktionen entfallen in einer Web-Umgebung.
