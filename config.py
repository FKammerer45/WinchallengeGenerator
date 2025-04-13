# config.py
import os
from dotenv import load_dotenv

# Load environment variables from .env file, if it exists
# Useful for development environments
load_dotenv() 

# Determine the base directory of the application
basedir = os.path.abspath(os.path.dirname(__file__))

class Config:
    """Base configuration settings."""
    # Secret key for session management, CSRF protection, etc.
    # IMPORTANT: Load from environment variable in production!
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'a-default-hard-to-guess-string' 
    
    # Disable SQLAlchemy event system if not needed, saves resources
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # Database configuration (will be overridden in specific configs)
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or \
        'sqlite:///' + os.path.join(basedir, 'app.db') # Default to SQLite in base dir

    # reCAPTCHA Keys (Consider loading from environment variables too)
    RECAPTCHA_PUBLIC_KEY = os.environ.get('RECAPTCHA_PUBLIC_KEY') or 'YOUR_RECAPTCHA_PUBLIC_KEY'
    RECAPTCHA_PRIVATE_KEY = os.environ.get('RECAPTCHA_PRIVATE_KEY') or 'YOUR_RECAPTCHA_PRIVATE_KEY'
    RECAPTCHA_ENABLED = os.environ.get('RECAPTCHA_ENABLED', 'True').lower() in ('true', '1', 't')


class DevelopmentConfig(Config):
    """Development configuration."""
    DEBUG = True
    # Use a separate database file for development
    SQLALCHEMY_DATABASE_URI = os.environ.get('DEV_DATABASE_URL') or \
        'sqlite:///' + os.path.join(basedir, 'dev.db')
    # Optionally disable reCAPTCHA for local development ease
    # RECAPTCHA_ENABLED = False 


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


# Dictionary to easily map environment names to config classes
config = {
    'development': DevelopmentConfig,
    'testing': TestingConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig # Default to development if FLASK_ENV is not set
}
