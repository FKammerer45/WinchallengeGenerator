# config.py
import os
from dotenv import load_dotenv

# Load environment variables from .env file, if it exists
load_dotenv()

# Determine the base directory of the application
basedir = os.path.abspath(os.path.dirname(__file__))

class Config:
    """Base config with common settings."""
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'a-default-hard-to-guess-string'
    # Add a salt for token generation (should also be kept secret in production)
    SECURITY_PASSWORD_SALT = os.environ.get('SECURITY_PASSWORD_SALT') or 'a-default-hard-to-guess-salt'
    SECURITY_PASSWORD_RESET_SALT = os.environ.get('SECURITY_PASSWORD_RESET_SALT') or 'another-hard-to-guess-salt-pwreset'

    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or \
        'sqlite:///' + os.path.join(basedir, 'app.db')

    # reCAPTCHA
    RECAPTCHA_PUBLIC_KEY  = os.environ.get('RECAPTCHA_PUBLIC_KEY')  or 'YOUR_RECAPTCHA_PUBLIC_KEY'
    RECAPTCHA_PRIVATE_KEY = os.environ.get('RECAPTCHA_PRIVATE_KEY') or 'YOUR_RECAPTCHA_PRIVATE_KEY'
    RECAPTCHA_ENABLED     = os.environ.get('RECAPTCHA_ENABLED', 'True').lower() in ('true','1','t')

    # Twitch OAuth2
    TWITCH_CLIENT_ID     = os.environ.get('TWITCH_CLIENT_ID')     or ''
    TWITCH_CLIENT_SECRET = os.environ.get('TWITCH_CLIENT_SECRET') or ''
    TWITCH_REDIRECT_URI  = os.environ.get('TWITCH_REDIRECT_URI')  or ''
    TWITCH_OAUTH_URL     = 'https://id.twitch.tv/oauth2'

    # Rate Limiting
    RATELIMIT_STORAGE_URL = "memory://" # Default for development

    # --- Flask-Mail Configuration ---
    # Ensure these are set via environment variables in production
    # For development, you might use Gmail (requires "less secure app access")
    # or a service like Mailtrap, SendGrid, Mailgun.
    MAIL_SERVER = os.environ.get('MAILGUN_SMTP_SERVER') or 'smtp.mailgun.org' # Or smtp.eu.mailgun.org
    MAIL_PORT = int(os.environ.get('MAILGUN_SMTP_PORT') or 587) # Default to 587 (TLS)
    MAIL_USE_TLS = os.environ.get('MAIL_USE_TLS', 'true').lower() in ('true', '1', 't') # Usually True for port 587
    MAIL_USE_SSL = os.environ.get('MAIL_USE_SSL', 'false').lower() in ('true', '1', 't') # Usually False if using TLS
    MAIL_USERNAME = os.environ.get('MAILGUN_SMTP_LOGIN') # Your Mailgun SMTP username (e.g., postmaster@yourdomain.com)
    MAIL_PASSWORD = os.environ.get('MAILGUN_SMTP_PASSWORD') # Your Mailgun SMTP password for that user
    MAIL_DEFAULT_SENDER = os.environ.get('MAIL_DEFAULT_SENDER') or '"WinChallenge" <mailgun@yourverifieddomain.com>' # IMPORTANT: Use an address from your verified Mailgun domain

    # --- Email Confirmation Setting ---
    EMAIL_CONFIRMATION_EXPIRATION = 3600 # Seconds (1 hour)

    # Max challenges per user (example)
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
    """Testing configuration."""
    TESTING = True
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = os.environ.get('TEST_DATABASE_URL') or 'sqlite:///:memory:'
    WTF_CSRF_ENABLED = False
    RECAPTCHA_ENABLED = False
    # Disable email sending during tests unless specifically testing emails
    MAIL_SUPPRESS_SEND = True
    SECURITY_PASSWORD_SALT = 'testing-salt'
    SECURITY_PASSWORD_RESET_SALT = 'testing-pw-reset-salt'

class ProductionConfig(Config):
    """Production configuration."""
    DEBUG = False
    TESTING = False

    # Ensure SECRET_KEY and SALT are set via environment variables
    SECRET_KEY = os.environ.get('SECRET_KEY')
    SECURITY_PASSWORD_SALT = os.environ.get('SECURITY_PASSWORD_SALT')
    SECURITY_PASSWORD_RESET_SALT = os.environ.get('SECURITY_PASSWORD_RESET_SALT') 
    if not SECRET_KEY or not SECURITY_PASSWORD_SALT:
        raise ValueError("SECRET_KEY and SECURITY_PASSWORD_SALT must be set for production")

    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL')
    if not SQLALCHEMY_DATABASE_URI:
        raise ValueError("No DATABASE_URL set for production environment")

    # Ensure reCAPTCHA keys are set
    RECAPTCHA_PUBLIC_KEY = os.environ.get('RECAPTCHA_PUBLIC_KEY')
    RECAPTCHA_PRIVATE_KEY = os.environ.get('RECAPTCHA_PRIVATE_KEY')
    if not RECAPTCHA_PUBLIC_KEY or not RECAPTCHA_PRIVATE_KEY:
        print("Warning: reCAPTCHA keys not set for production environment.")
        RECAPTCHA_ENABLED = False
    else:
        RECAPTCHA_ENABLED = True

    # Ensure Twitch creds
    if not (os.environ.get('TWITCH_CLIENT_ID') and os.environ.get('TWITCH_CLIENT_SECRET') and os.environ.get('TWITCH_REDIRECT_URI')):
        raise ValueError("Twitch OAuth settings missing in production")

    # Ensure Mailgun creds are set in production environment variables
    if not (os.environ.get('MAILGUN_SMTP_SERVER') and os.environ.get('MAILGUN_SMTP_LOGIN') and os.environ.get('MAILGUN_SMTP_PASSWORD') and os.environ.get('MAIL_DEFAULT_SENDER')):
         # Make this critical for production if email is essential
         raise ValueError("Mailgun SMTP settings (SERVER, LOGIN, PASSWORD, DEFAULT_SENDER) must be set for production")

    # Use Redis for rate limiting in production if available
    RATELIMIT_STORAGE_URL = os.environ.get("RATELIMIT_STORAGE_URL", "memory://") # Fallback to memory if Redis URL not set


# Dictionary to easily map environment names to config classes
config = {
    'development': DevelopmentConfig,
    'testing': TestingConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}
