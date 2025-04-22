# config.py
import os
from dotenv import load_dotenv

# Load environment variables from .env file, if it exists
# Useful for development environments
load_dotenv() 

# Determine the base directory of the application
basedir = os.path.abspath(os.path.dirname(__file__))

class Config:
    """Base config with common settings."""
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'a-default-hard-to-guess-string'
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

    RATELIMIT_STORAGE_URL = os.environ.get("RATELIMIT_STORAGE_URL", "redis://localhost:6379/0")


class DevelopmentConfig(Config):
    """Development configuration."""
    DEBUG = True

    SECRET_KEY = os.environ.get('SECRET_KEY')
    if not SECRET_KEY:
        raise ValueError("No SECRET_KEY set for testing environment")
    # Use a separate database file for development
    SQLALCHEMY_DATABASE_URI = os.environ.get('DEV_DATABASE_URL') or \
        'sqlite:///' + os.path.join(basedir, 'dev.db')

    RECAPTCHA_ENABLED = False 

    if not (os.environ.get('TWITCH_CLIENT_ID') and os.environ.get('TWITCH_CLIENT_SECRET') and os.environ.get('TWITCH_REDIRECT_URI')):
        raise ValueError("Twitch OAuth settings missing in production")
    
    RATELIMIT_STORAGE_URL = os.environ.get("RATELIMIT_STORAGE_URL", "redis://localhost:6379/0")


class TestingConfig(Config):
    """Testing configuration."""
    TESTING = True
    DEBUG = True 
    # Use a separate database file or in-memory database for tests
    SQLALCHEMY_DATABASE_URI = os.environ.get('TEST_DATABASE_URL') or \
        'sqlite:///' + os.path.join(basedir, 'test.db') # Or 'sqlite:///:memory:'
    
    # Disable CSRF protection in forms during testing
    WTF_CSRF_ENABLED = False 
    
    # Disable reCAPTCHA during testing
    RECAPTCHA_ENABLED = False


class ProductionConfig(Config):
    """Production configuration."""
    DEBUG = False
    TESTING = False
    
    # IMPORTANT: Ensure SECRET_KEY is set via environment variable in production!
    SECRET_KEY = os.environ.get('SECRET_KEY')
    if not SECRET_KEY:
        raise ValueError("No SECRET_KEY set for production environment")

    # IMPORTANT: Ensure DATABASE_URL is set via environment variable in production!
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL')
    if not SQLALCHEMY_DATABASE_URI:
        raise ValueError("No DATABASE_URL set for production environment")

    # IMPORTANT: Ensure reCAPTCHA keys are set via environment variables!
    RECAPTCHA_PUBLIC_KEY = os.environ.get('RECAPTCHA_PUBLIC_KEY')
    RECAPTCHA_PRIVATE_KEY = os.environ.get('RECAPTCHA_PRIVATE_KEY')
    if not RECAPTCHA_PUBLIC_KEY or not RECAPTCHA_PRIVATE_KEY:
         # Decide if reCAPTCHA is strictly required in production
        print("Warning: reCAPTCHA keys not set for production environment.") 
        RECAPTCHA_ENABLED = False
    else:
        RECAPTCHA_ENABLED = True

    # Ensure Twitch creds in prod
    if not (os.environ.get('TWITCH_CLIENT_ID') and os.environ.get('TWITCH_CLIENT_SECRET') and os.environ.get('TWITCH_REDIRECT_URI')):
        raise ValueError("Twitch OAuth settings missing in production")
    
    RATELIMIT_STORAGE_URL = os.environ.get("RATELIMIT_STORAGE_URL", "redis://localhost:6379/0")



# Dictionary to easily map environment names to config classes
config = {
    'development': DevelopmentConfig,
    'testing': TestingConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig # Default to development if FLASK_ENV is not set
}
