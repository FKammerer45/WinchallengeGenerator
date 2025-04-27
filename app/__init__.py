# app/__init__.py

import os
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
from flask_wtf.csrf import CSRFProtect
from flask_migrate import Migrate
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_socketio import SocketIO # <--- Import SocketIO
from config import config
import logging
import eventlet # <--- Import eventlet

# Initialize extensions globally
db = SQLAlchemy()
login_manager = LoginManager()
csrf = CSRFProtect()
migrate = Migrate()
# Initialize SocketIO - async_mode='eventlet' is recommended for performance
# Ensure CORS allows your frontend origin, or use "*" for development
socketio = SocketIO(cors_allowed_origins="*", async_mode='eventlet') # <--- Initialize SocketIO

# Configure login manager
login_manager.login_view = 'auth.login'
login_manager.login_message_category = 'info'

# User loader callback
@login_manager.user_loader
def load_user(user_id):
    """Loads user object from user ID stored in the session."""
    from .models import User # Keep import local to function
    try:
        # Use db.session.get for primary key lookup
        return db.session.get(User, int(user_id))
    except (TypeError, ValueError):
        return None

# App Factory
def create_app(config_name=None):
    # Patch standard libraries for eventlet BEFORE creating app
    # Check if already patched to avoid issues during reloads
    if not eventlet.patcher.is_monkey_patched('socket'):
         print("--- Patching std libraries for eventlet ---")
         eventlet.monkey_patch()
    else:
         print("--- Std libraries already patched for eventlet ---")


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
        # ... (logging setup if needed) ...
    except KeyError:
        print(f"Error: Configuration name '{config_name}' not found. Using 'default'.")
        config_name = 'default'
        app.config.from_object(config[config_name])

    # Initialize extensions with the app instance
    db.init_app(app)
    login_manager.init_app(app)
    csrf.init_app(app)
    migrate.init_app(app, db)
    # Initialize Limiter here, passing the app instance
    limiter = Limiter(
        app=app, # Pass app here
        key_func=get_remote_address,
        storage_uri=app.config.get('RATELIMIT_STORAGE_URL', 'memory://'),
        default_limits=["120 per minute"], # Example limit
        headers_enabled=True,
    )
    socketio.init_app(app) # <--- Initialize SocketIO with the app

    # Import and register blueprints
    from .routes.main import main
    app.register_blueprint(main)
    from .routes.auth import auth as auth_blueprint
    app.register_blueprint(auth_blueprint, url_prefix='/auth')
    from .routes.auth_twitch import auth_twitch
    app.register_blueprint(auth_twitch, url_prefix='/auth/twitch')
    from .routes.challenge_api import challenge_api
    app.register_blueprint(challenge_api, url_prefix='/api/challenge')
    from .routes.games_api import games_api
    app.register_blueprint(games_api, url_prefix='/api/games')
    from .routes.penalties_api import penalties_api
    app.register_blueprint(penalties_api, url_prefix='/api/penalties')
    from .routes.tabs_api import tabs_api
    app.register_blueprint(tabs_api, url_prefix='/api/tabs')

    # --- FIX: Import payment_bp *before* registering ---
    from .routes.payment import payment_bp
    app.register_blueprint(payment_bp, url_prefix='/payment') # Now register
    # --- END FIX ---

    from .routes.profile import profile_bp
    app.register_blueprint(profile_bp) # No prefix needed if defined in blueprint

    # --- Import and register SocketIO event handlers ---
    # This import triggers the execution of decorators in sockets.py
    from . import sockets
    print("--- SocketIO event handlers registered (imported sockets.py) ---")

    print("--- Application creation complete ---")
    return app
