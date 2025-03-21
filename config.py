#config.py
import os
from dotenv import load_dotenv
load_dotenv()

# Application configuration
DEBUG = True
SECRET_KEY = os.getenv("SECRET_KEY")

# Database configuration
DATABASE_URL = os.getenv("DATABASE_URL")

# CSV and penalty file paths
CSV_FILE = "win_challenges.csv"
STRAFEN_CSV = "strafen.csv"

# reCAPTCHA keys
RECAPTCHA_PUBLIC_KEY = os.getenv("RECAPTCHA_PUBLIC_KEY")
RECAPTCHA_PRIVATE_KEY = os.getenv("RECAPTCHA_PRIVATE_KEY")

# Logging configuration
LOG_LEVEL = "DEBUG"
LOG_FORMAT = '%(asctime)s %(levelname)s: %(message)s'
