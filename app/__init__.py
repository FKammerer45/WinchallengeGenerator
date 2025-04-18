# app/__init__.py

import os
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
from flask_wtf.csrf import CSRFProtect
from flask_migrate import Migrate 

from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
# Import the configuration dictionary
from config import config

# Initialize extensions globally but without app context initially
# These should start at column 1 in your file
db = SQLAlchemy()
login_manager = LoginManager()
csrf = CSRFProtect() 
migrate = Migrate() 


limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["20 per minute"],
    headers_enabled=True
)

# Configure login manager
# These should start at column 1 in your file
login_manager.login_view = 'auth.login' 
login_manager.login_message_category = 'info' 

# User loader callback for Flask-Login
# This decorator and function definition should start at column 1
@login_manager.user_loader
def load_user(user_id):
    """Loads user object from user ID stored in the session."""
    # Code inside the function IS indented (usually 4 spaces)
    from .models import User 
    try:
        return User.query.get(int(user_id))
    except (TypeError, ValueError):
        return None 

# This function definition should start at column 1
def create_app(config_name=None):
   
    if config_name is None:
        config_name = os.environ.get('FLASK_ENV', 'development')
        if config_name not in config:
            print(f"Warning: Invalid FLASK_ENV value '{config_name}'. Using 'default' config.")
            config_name = 'default'

    print(f"--- Loading configuration: '{config_name}' ---") 

    app = Flask(__name__)

    try:
        app.config.from_object(config[config_name])
        print(f"--- Configuration loaded successfully for '{config_name}' ---")
        print(f"--- DEBUG: {app.config.get('DEBUG')} ---")
        print(f"--- TESTING: {app.config.get('TESTING')} ---")
        print(f"--- DB URI Set: {'Yes' if app.config.get('SQLALCHEMY_DATABASE_URI') else 'No'} ---")
        print(f"--- RECAPTCHA Enabled: {app.config.get('RECAPTCHA_ENABLED')} ---")
    except KeyError:
        print(f"Error: Configuration name '{config_name}' not found in config dictionary. Using 'default'.")
        config_name = 'default'
        app.config.from_object(config[config_name])

    # Initialize extensions with the app instance
    db.init_app(app)
    login_manager.init_app(app)
    csrf.init_app(app) 
    migrate.init_app(app, db)
    limiter.init_app(app)
    # Import and register blueprints
    # --- Main Routes ---
    from .routes.main import main # Use the correct blueprint variable name 'main'
    app.register_blueprint(main)

    # --- Authentication Routes ---
    # Still showing warning, ensure auth.py exists and defines 'auth' blueprint
    try:
        from .routes.auth import auth as auth_blueprint
        app.register_blueprint(auth_blueprint, url_prefix='/auth')
    except ImportError:
        # This warning is still appearing in your logs
        print("Warning: Auth blueprint not found or could not be imported.") 

    # --- API Blueprints ---
    # Ensure these blueprint variables match the ones defined in the respective files
    from .routes.challenge_api import challenge_api 
    app.register_blueprint(challenge_api, url_prefix='/api/challenge')

    from .routes.games_api import games_api 
    app.register_blueprint(games_api, url_prefix='/api/games')

    from .routes.penalties_api import penalties_api 
    app.register_blueprint(penalties_api, url_prefix='/api/penalties')
    
    from .routes.tabs_api import tabs_api 
    app.register_blueprint(tabs_api, url_prefix='/api/tabs')


    # --- Context Processors (Optional) ---
    # @app.context_processor
    # def inject_global_vars():
    #     return dict(site_name="WinChallenge Generator")

    print("--- Application creation complete ---")
    return app
