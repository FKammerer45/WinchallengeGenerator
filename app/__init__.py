# app/__init__.py
import os
import re
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
from flask_wtf.csrf import CSRFProtect
from flask_migrate import Migrate
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_socketio import SocketIO
from flask_mail import Mail
from config import config # Keep importing config for other settings
import logging
import paypalrestsdk # Moved import to top

# Initialize extensions globally
db = SQLAlchemy()
login_manager = LoginManager()
csrf = CSRFProtect()
migrate = Migrate()
socketio = SocketIO(cors_allowed_origins="*", async_mode='eventlet')
mail = Mail()

# --- Initialize Limiter globally - Reading storage URI directly ---
# Read directly from environment variable here, providing a default
limiter_storage_uri = os.environ.get("RATELIMIT_STORAGE_URL", "memory://")
print(f"--- [INIT DEBUG] Initializing Limiter with storage_uri: {limiter_storage_uri} ---") # Debug print
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=limiter_storage_uri, # Set storage directly
    # Default limits and headers will still be read from app config via init_app
)
# --- End Limiter Init ---

# Configure login manager
login_manager.login_view = 'auth.login'
login_manager.login_message_category = 'info'


# Custom Jinja Filter
def redact_email_filter(email):
    # ... (filter code remains the same) ...
    if not email or '@' not in email: return email
    try:
        local_part, domain = email.split('@')
        if len(local_part) <= 3: redacted_local = local_part[0] + '***'
        else: redacted_local = local_part[:2] + '***' + local_part[-1]
        return f"{redacted_local}@{domain}"
    except Exception: return "Invalid Email Format"

# User loader callback
@login_manager.user_loader
def load_user(user_id):
    # ... (user loader remains the same) ...
    from .models import User
    try: return db.session.get(User, int(user_id))
    except (TypeError, ValueError): return None

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
    # It will read other settings like default limits from app.config now
    limiter.init_app(app)
    # --- End Limiter Config ---

    # --- PayPal SDK Initialization ---
    # import paypalrestsdk # Removed from here
    if app.config.get('PAYPAL_CLIENT_ID') and app.config.get('PAYPAL_CLIENT_SECRET'):
        try:
            paypalrestsdk.configure({
                "mode": app.config.get('PAYPAL_MODE', 'sandbox'), # Default to sandbox if not set
                "client_id": app.config['PAYPAL_CLIENT_ID'],
                "client_secret": app.config['PAYPAL_CLIENT_SECRET']
            })
            app.logger.info(f"PayPal SDK initialized in {app.config.get('PAYPAL_MODE', 'sandbox')} mode.")
        except Exception as e:
            app.logger.error(f"Failed to initialize PayPal SDK: {e}")
    else:
        app.logger.warning("PayPal Client ID or Secret not configured. PayPal integration will be disabled.")
    # --- End PayPal SDK Initialization ---

    # Explicitly configure logging for the 'testing' environment
    if config_name == 'testing':
        import logging # Already imported at the top, but good for clarity here
        # from logging.handlers import RotatingFileHandler # Not used in Option B
        import sys # For StreamHandler's default stream

        stream_handler = logging.StreamHandler(sys.stderr) # Explicitly use sys.stderr
        stream_handler.setFormatter(logging.Formatter(
             '%(asctime)s %(levelname)s: %(name)s: %(message)s [in %(pathname)s:%(lineno)d]'
        ))
        stream_handler.setLevel(logging.DEBUG)
        app.logger.addHandler(stream_handler)
        app.logger.setLevel(logging.DEBUG)

        # Ensure loggers used in blueprints (e.g., logging.getLogger('app.routes.main'))
        # propagate to the app.logger and have their level set.
        logging.getLogger('app').setLevel(logging.DEBUG)

        app.logger.info("--- Testing environment: Flask logger explicitly configured to DEBUG level (app.logger) ---")
        # The print statement might be useful for seeing if this block is hit during Gunicorn startup,
        # though Gunicorn might handle stdout/stderr differently. app.logger is more reliable.
        print("--- Testing environment: Flask logger explicitly configured to DEBUG level (print statement) ---")

    # Register the custom filter
    app.jinja_env.filters['redact_email'] = redact_email_filter

    # Import and register blueprints
    # ... (blueprint registrations remain the same) ...
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
