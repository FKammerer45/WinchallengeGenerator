# config.py
import os
import logging # Import the logging module
from datetime import timedelta # Import timedelta
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
    # logging.warning(f"--- [BASE CONFIG] Config.RATELIMIT_DEFAULT_LIMITS initialized to: '{RATELIMIT_DEFAULT_LIMITS}'") # Removed
    RATELIMIT_HEADERS_ENABLED = True # Keep header setting if desired
    # --- End Rate Limiting ---

    # ... (Mailgun, Email Confirmation, Max Challenges settings) ...
    MAIL_SERVER = os.environ.get('MAILGUN_SMTP_SERVER') or 'smtp.mailgun.org'
    MAIL_PORT = int(os.environ.get('MAILGUN_SMTP_PORT') or 587)
    MAIL_USE_TLS = os.environ.get('MAIL_USE_TLS', 'true').lower() in ('true', '1', 't')
    MAIL_USE_SSL = os.environ.get('MAIL_USE_SSL', 'false').lower() in ('true', '1', 't')
    MAIL_USERNAME = os.environ.get('MAILGUN_SMTP_LOGIN')
    MAIL_PASSWORD = os.environ.get('MAILGUN_SMTP_PASSWORD')
    # Define sender name and email separately for clarity and robust parsing
    MAIL_SENDER_NAME = os.environ.get('MAIL_SENDER_NAME') or "WinChallenge"
    MAIL_SENDER_EMAIL = os.environ.get('MAIL_SENDER_EMAIL') or "please-configure@yourverifieddomain.com" # Ensure this is a valid sending email
    MAIL_DEFAULT_SENDER = (MAIL_SENDER_NAME, MAIL_SENDER_EMAIL) # Flask-Mail handles this tuple format
    EMAIL_CONFIRMATION_EXPIRATION = 3600
    PASSWORD_RESET_EXPIRATION = 1800
    EMAIL_CHANGE_EXPIRATION = 1800
    MAX_CHALLENGES_PER_USER = 15

    # --- PayPal Settings ---
    PAYPAL_MODE = os.environ.get('PAYPAL_MODE') or 'sandbox' # 'sandbox' or 'live'
    PAYPAL_CLIENT_ID = os.environ.get('PAYPAL_CLIENT_ID')
    PAYPAL_CLIENT_SECRET = os.environ.get('PAYPAL_CLIENT_SECRET')

    # --- Admin Panel Settings ---
    # For a single admin user, credentials stored in environment variables
    # IMPORTANT: ADMIN_PASSWORD_HASH should be a strong hash (e.g., Werkzeug's generate_password_hash)
    ADMIN_USERNAME = os.environ.get('ADMIN_USERNAME') or 'admin'
    ADMIN_PASSWORD_HASH = os.environ.get('ADMIN_PASSWORD_HASH') or 'default_hash_please_change' # User MUST change this
    
    # Session timeout for 'permanent' sessions (like admin login)
    PERMANENT_SESSION_LIFETIME = timedelta(hours=4) # e.g., 4 hours

    SERVER_NAME = os.environ.get('SERVER_NAME') # Add to base Config

    # Cookie Security Settings
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    SESSION_COOKIE_SECURE = False # Default to False, override in Production

class DevelopmentConfig(Config):
    """Development configuration."""
    DEBUG = True
    # Use a separate database file for development
    SQLALCHEMY_DATABASE_URI = os.environ.get('DEV_DATABASE_URL') or \
        'sqlite:///' + os.path.join(basedir, 'dev.db')
    RECAPTCHA_ENABLED = False # Often disabled for local dev
    # Development email settings might differ or use MAIL_SUPPRESS_SEND = True if not testing emails
    RATELIMIT_STORAGE_URL = "memory://" # Explicitly use in-memory storage for development
    # Explicitly inherit and log default limits for clarity during debugging
    RATELIMIT_DEFAULT_LIMITS = Config.RATELIMIT_DEFAULT_LIMITS
    # logging.warning(f"--- [DEV CONFIG] DevelopmentConfig.RATELIMIT_DEFAULT_LIMITS set to: '{RATELIMIT_DEFAULT_LIMITS}'") # Removed
    SESSION_COOKIE_SECURE = False
    SERVER_NAME = os.environ.get('DEV_SERVER_NAME') or Config.SERVER_NAME or 'localhost:5000'


class TestingConfig(Config):
    TESTING = True
    DEBUG = True # Keep True for easier debugging of the test instance
    #SQLALCHEMY_DATABASE_URI = os.environ.get('TEST_DATABASE_URL') or 'sqlite:///:memory:' # Old line
    SQLALCHEMY_DATABASE_URI = os.environ.get('TEST_DATABASE_URL') 
    WTF_CSRF_ENABLED = False # Usually False for testing
    RECAPTCHA_ENABLED = False # Keep False for testing
    MAIL_SUPPRESS_SEND = True # Keep True for testing
    SECURITY_PASSWORD_SALT = 'testing-salt' # Keep as is or use an env var
    SECURITY_PASSWORD_RESET_SALT = 'testing-pw-reset-salt' # Keep as is or use an env var
    SECURITY_EMAIL_CHANGE_SALT = 'testing-email-change-salt' # Keep as is or use an env var
    RATELIMIT_ENABLED = False # Usually disable rate limiting for testing environment
    # Settings for correct external URL generation in testing
    SERVER_NAME = os.environ.get('TEST_SERVER_NAME') or '147.93.63.202:8081' # Your test server IP and Gunicorn port
    PREFERRED_URL_SCHEME = os.environ.get('TEST_URL_SCHEME') or 'http'
    # Ensure APPLICATION_ROOT is correct if your app is not served at the domain root
    # For example, if it's at http://147.93.63.202:8081/myapp/, then set:
    # APPLICATION_ROOT = '/myapp'
    # If it's at the root (http://147.93.63.202:8081/), then APPLICATION_ROOT = '/' or can be omitted.
    APPLICATION_ROOT = '/'
    SESSION_COOKIE_SECURE = False
    # SERVER_NAME is already set in TestingConfig from environment or default


class ProductionConfig(Config):
    DEBUG = False
    TESTING = False
    SECRET_KEY = os.environ.get('SECRET_KEY')
    SECURITY_PASSWORD_SALT = os.environ.get('SECURITY_PASSWORD_SALT')
    SECURITY_PASSWORD_RESET_SALT = os.environ.get('SECURITY_PASSWORD_RESET_SALT')
    SECURITY_EMAIL_CHANGE_SALT = os.environ.get('SECURITY_EMAIL_CHANGE_SALT')
    SERVER_NAME = os.environ.get('SERVER_NAME') # Explicitly get for production
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL')
    
    # Production rate limiting should ideally use a persistent store like Redis
    RATELIMIT_STORAGE_URL = os.environ.get("RATELIMIT_STORAGE_URL", "redis://localhost:6379/0") 
    _prod_ratelimit_env = os.environ.get("RATELIMIT_DEFAULT_LIMITS")
    RATELIMIT_DEFAULT_LIMITS = _prod_ratelimit_env or Config.RATELIMIT_DEFAULT_LIMITS
    SESSION_COOKIE_SECURE = True

    # reCAPTCHA, Twitch, Mailgun, PayPal settings are read from environment.
    # Checks for their presence will be done in app factory if config_name is 'production'.
    RECAPTCHA_PUBLIC_KEY = os.environ.get('RECAPTCHA_PUBLIC_KEY')
    RECAPTCHA_PRIVATE_KEY = os.environ.get('RECAPTCHA_PRIVATE_KEY')
    # RECAPTCHA_ENABLED will be determined in app factory based on key presence for production.
    # For other configs, it defaults or is set explicitly.
    # TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, TWITCH_REDIRECT_URI are read from env by base Config.
    # MAIL_SERVER, MAIL_PORT, etc. are read from env by base Config.
    # PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_MODE are read from env by base Config.
    # If PAYPAL_MODE is 'live' but credentials are NOT set, the first 'if' block already covers this.


# Dictionary to easily map environment names to config classes
config = {
    'development': DevelopmentConfig,
    'testing': TestingConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}
