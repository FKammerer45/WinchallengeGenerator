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

class DevelopmentConfig(Config):
    """Development configuration."""
    DEBUG = True
    # Use a separate database file for development
    SQLALCHEMY_DATABASE_URI = os.environ.get('DEV_DATABASE_URL') or \
        'sqlite:///' + os.path.join(basedir, 'dev.db')
    RECAPTCHA_ENABLED = False # Often disabled for local dev
    # Development email settings might differ or use MAIL_SUPPRESS_SEND = True if not testing emails
    RATELIMIT_STORAGE_URL = "memory://" # Explicitly use in-memory storage for development


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
    # Use Redis for rate limiting storage in production if available
    # The next line was the corrected one, the debug lines were added by you after it.
    # RATELIMIT_STORAGE_URL = os.environ.get("RATELIMIT_STORAGE_URL", "redis://localhost:6379/0") 

    # Your debug lines, changed to use logging: # Removing these debug lines
    # RATELIMIT_STORAGE_URL_FROM_ENV = os.environ.get("RATELIMIT_STORAGE_URL")
    # logging.warning(f"--- [PROD CONFIG DEBUG] RATELIMIT_STORAGE_URL from env: {RATELIMIT_STORAGE_URL_FROM_ENV}")
    RATELIMIT_STORAGE_URL = os.environ.get("RATELIMIT_STORAGE_URL", "redis://localhost:6379/0") # Keep the corrected line
    # logging.warning(f"--- [PROD CONFIG DEBUG] Final RATELIMIT_STORAGE_URL for Flask-Limiter: {RATELIMIT_STORAGE_URL}")

    # Keep the default limits from base Config unless overridden by env var
    RATELIMIT_DEFAULT_LIMITS = os.environ.get("RATELIMIT_DEFAULT_LIMITS", Config.RATELIMIT_DEFAULT_LIMITS)

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
    
    # PayPal checks for production
    if not (Config.PAYPAL_CLIENT_ID and Config.PAYPAL_CLIENT_SECRET):
        print("Warning: PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET not set for production. PayPal integration will not work.")
        # If credentials are not set, PAYPAL_MODE being 'sandbox' is less critical than if it were 'live' with no creds.
        # However, it's still an issue if PayPal is intended to be functional.
    elif Config.PAYPAL_MODE != 'live': # Credentials are set, but mode is not 'live'
        print("Warning: PAYPAL_MODE is configured as '{}' in production, but credentials are set. It should typically be 'live'.".format(Config.PAYPAL_MODE))
    # If PAYPAL_MODE is 'live' but credentials are NOT set, the first 'if' block already covers this.


# Dictionary to easily map environment names to config classes
config = {
    'development': DevelopmentConfig,
    'testing': TestingConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}
