# app/__init__.py
import eventlet

# --- Eventlet Patching (Keep at the very top) ---
if not eventlet.patcher.is_monkey_patched('socket'):
    print("--- Patching standard libraries for eventlet ---")
    eventlet.monkey_patch()
else:
    print("--- Standard libraries already patched for eventlet ---")
# --- End Eventlet Patching ---

import os
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
from flask_wtf.csrf import CSRFProtect
from flask_migrate import Migrate
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_socketio import SocketIO
from flask_mail import Mail
from config import config
import logging


# Initialize extensions globally
db = SQLAlchemy()
login_manager = LoginManager()
csrf = CSRFProtect()
migrate = Migrate()
socketio = SocketIO(cors_allowed_origins="*", async_mode='eventlet')
mail = Mail()
# --- Initialize Limiter globally (simpler init) ---
limiter = Limiter(
    key_func=get_remote_address,
    # Default limits and storage URI will be read from app config via init_app
    # headers_enabled will also be read from config if set (defaults to False)
)
# --- End Limiter Init ---

# Configure login manager
login_manager.login_view = 'auth.login'
login_manager.login_message_category = 'info'

# User loader callback
@login_manager.user_loader
def load_user(user_id):
    from .models import User
    try:
        return db.session.get(User, int(user_id))
    except (TypeError, ValueError):
        return None

# App Factory
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
    except KeyError:
        print(f"Error: Configuration name '{config_name}' not found. Using 'default'.")
        config_name = 'default'
        app.config.from_object(config[config_name])

    # Initialize extensions with the app instance
    db.init_app(app)
    login_manager.init_app(app)
    csrf.init_app(app)
    migrate.init_app(app, db)
    socketio.init_app(app)
    mail.init_app(app)
    # --- Configure the *global* limiter instance with the app ---
    limiter.init_app(app)
    # --- End Limiter Config ---

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
    from .routes.payment import payment_bp
    app.register_blueprint(payment_bp, url_prefix='/payment')
    from .routes.profile import profile_bp
    app.register_blueprint(profile_bp)

    # Import and register SocketIO event handlers
    from . import sockets
    print("--- SocketIO event handlers registered (imported sockets.py) ---")

    # Import and register CLI commands
    from .commands import register_commands
    register_commands(app)

    print("--- Application creation complete ---")
    return app
