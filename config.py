# config.py
import os
from dotenv import load_dotenv

# Load environment variables from .env file, if it exists
load_dotenv()

# Determine the base directory of the application
basedir = os.path.abspath(os.path.dirname(__file__))

class Config:

    # Add a salt for token generation (should also be kept secret in production)
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'a-default-hard-to-guess-string'
    SECURITY_PASSWORD_SALT = os.environ.get('SECURITY_PASSWORD_SALT') or 'a-default-hard-to-guess-salt'
    SECURITY_PASSWORD_RESET_SALT = os.environ.get('SECURITY_PASSWORD_RESET_SALT') or 'another-hard-to-guess-salt-pwreset'
    SECURITY_EMAIL_CHANGE_SALT = os.environ.get('SECURITY_EMAIL_CHANGE_SALT') or 'another-hard-to-guess-salt-emailchange'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or \
        'sqlite:///' + os.path.join(basedir, 'app.db')

    # ... (reCAPTCHA, Twitch settings) ...
    RECAPTCHA_PUBLIC_KEY  = os.environ.get('RECAPTCHA_PUBLIC_KEY')  or 'YOUR_RECAPTCHA_PUBLIC_KEY'
    RECAPTCHA_PRIVATE_KEY = os.environ.get('RECAPTCHA_PRIVATE_KEY') or 'YOUR_RECAPTCHA_PRIVATE_KEY'
    RECAPTCHA_ENABLED     = os.environ.get('RECAPTCHA_ENABLED', 'True').lower() in ('true','1','t')
    TWITCH_CLIENT_ID     = os.environ.get('TWITCH_CLIENT_ID')     or ''
    TWITCH_CLIENT_SECRET = os.environ.get('TWITCH_CLIENT_SECRET') or ''
    TWITCH_REDIRECT_URI  = os.environ.get('TWITCH_REDIRECT_URI')  or ''
    TWITCH_OAUTH_URL     = 'https://id.twitch.tv/oauth2'

    # --- Rate Limiting Settings ---
    RATELIMIT_STORAGE_URL = os.environ.get("RATELIMIT_STORAGE_URL", "memory://") # Keep this
    RATELIMIT_DEFAULT_LIMITS = "120 per minute" # Add the default limit setting here
    RATELIMIT_HEADERS_ENABLED = True # Keep header setting if desired
    # --- End Rate Limiting ---

    # ... (Mailgun, Email Confirmation, Max Challenges settings) ...
    MAIL_SERVER = os.environ.get('MAILGUN_SMTP_SERVER') or 'smtp.mailgun.org'
    MAIL_PORT = int(os.environ.get('MAILGUN_SMTP_PORT') or 587)
    MAIL_USE_TLS = os.environ.get('MAIL_USE_TLS', 'true').lower() in ('true', '1', 't')
    MAIL_USE_SSL = os.environ.get('MAIL_USE_SSL', 'false').lower() in ('true', '1', 't')
    MAIL_USERNAME = os.environ.get('MAILGUN_SMTP_LOGIN')
    MAIL_PASSWORD = os.environ.get('MAILGUN_SMTP_PASSWORD')
    MAIL_DEFAULT_SENDER = os.environ.get('MAIL_DEFAULT_SENDER') or '"WinChallenge" <mailgun@yourverifieddomain.com>'
    EMAIL_CONFIRMATION_EXPIRATION = 3600
    PASSWORD_RESET_EXPIRATION = 1800
    EMAIL_CHANGE_EXPIRATION = 1800
    MAX_CHALLENGES_PER_USER = 15
    

class DevelopmentConfig(Config):
    """Development configuration."""
    DEBUG = True
    # Use a separate database file for development
    SQLALCHEMY_DATABASE_URI = os.environ.get('DEV_DATABASE_URL') or \
        'sqlite:///' + os.path.join(basedir, 'dev.db')
    RECAPTCHA_ENABLED = False # Often disabled for local dev
    # Development email settings might differ or use MAIL_SUPPRESS_SEND = True if not testing emails


class TestingConfig(Config):
    TESTING = True
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = os.environ.get('TEST_DATABASE_URL') or 'sqlite:///:memory:'
    WTF_CSRF_ENABLED = False
    RECAPTCHA_ENABLED = False
    MAIL_SUPPRESS_SEND = True
    SECURITY_PASSWORD_SALT = 'testing-salt'
    SECURITY_PASSWORD_RESET_SALT = 'testing-pw-reset-salt'
    SECURITY_EMAIL_CHANGE_SALT = 'testing-email-change-salt'
    # Disable rate limiting during tests unless specifically testing it
    RATELIMIT_ENABLED = False

class ProductionConfig(Config):
    DEBUG = False
    TESTING = False
    SECRET_KEY = os.environ.get('SECRET_KEY')
    SECURITY_PASSWORD_SALT = os.environ.get('SECURITY_PASSWORD_SALT')
    SECURITY_PASSWORD_RESET_SALT = os.environ.get('SECURITY_PASSWORD_RESET_SALT')
    SECURITY_EMAIL_CHANGE_SALT = os.environ.get('SECURITY_EMAIL_CHANGE_SALT')
    if not SECRET_KEY or not SECURITY_PASSWORD_SALT or not SECURITY_PASSWORD_RESET_SALT:
        raise ValueError("SECRET_KEY, SECURITY_PASSWORD_SALT, and SECURITY_PASSWORD_RESET_SALT must be set for production")

    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL')
    if not SQLALCHEMY_DATABASE_URI:
        raise ValueError("No DATABASE_URL set for production environment")

    # Use Redis for rate limiting storage in production if available
    RATELIMIT_STORAGE_URL = os.environ.get("RATELIMIT_STORAGE_URL", "redis://localhost:6379/0") # Example Redis URL
    # Keep the default limits from base Config unless overridden by env var
    RATELIMIT_DEFAULT_LIMITS = os.environ.get("RATELIMIT_DEFAULT_LIMITS", "120 per minute")

    # ... (rest of ProductionConfig checks for reCAPTCHA, Twitch, Mailgun) ...
    RECAPTCHA_PUBLIC_KEY = os.environ.get('RECAPTCHA_PUBLIC_KEY')
    RECAPTCHA_PRIVATE_KEY = os.environ.get('RECAPTCHA_PRIVATE_KEY')
    if not RECAPTCHA_PUBLIC_KEY or not RECAPTCHA_PRIVATE_KEY:
        print("Warning: reCAPTCHA keys not set for production environment.")
        RECAPTCHA_ENABLED = False
    else:
        RECAPTCHA_ENABLED = True
    if not (os.environ.get('TWITCH_CLIENT_ID') and os.environ.get('TWITCH_CLIENT_SECRET') and os.environ.get('TWITCH_REDIRECT_URI')):
        raise ValueError("Twitch OAuth settings missing in production")
    if not (os.environ.get('MAILGUN_SMTP_SERVER') and os.environ.get('MAILGUN_SMTP_LOGIN') and os.environ.get('MAILGUN_SMTP_PASSWORD') and os.environ.get('MAIL_DEFAULT_SENDER')):
         raise ValueError("Mailgun SMTP settings (SERVER, LOGIN, PASSWORD, DEFAULT_SENDER) must be set for production")


# Dictionary to easily map environment names to config classes
config = {
    'development': DevelopmentConfig,
    'testing': TestingConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}
