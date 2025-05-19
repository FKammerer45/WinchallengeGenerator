# app/__init__.py
import os
import re
from flask import Flask, render_template, url_for # Add url_for here
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager # Removed current_user import
from flask_wtf.csrf import CSRFProtect
from flask_migrate import Migrate
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_limiter.storage import RedisStorage # Import RedisStorage
from flask_socketio import SocketIO
from flask_mail import Mail
from flask_admin import Admin # Import Admin
from flask_admin.menu import MenuLink # Import MenuLink
# Models and admin_views will be imported inside create_app to avoid circular dependencies
from config import config # Keep importing config for other settings
import logging
import paypalrestsdk # Moved import to top
import redis # Import redis for manual connection test

# Initialize extensions globally
db = SQLAlchemy()
login_manager = LoginManager()
csrf = CSRFProtect()
migrate = Migrate()
socketio = SocketIO(cors_allowed_origins="*", async_mode='eventlet')
mail = Mail()
admin = Admin(name='WinChallenge Admin', template_mode='bootstrap4') # Initialize Admin

# --- Initialize Limiter globally WITHOUT storage_uri yet ---
# storage_uri will be picked up from app.config during init_app
# Default limits and headers will also be read from app config via init_app
limiter = Limiter(
    key_func=get_remote_address
)
# --- End Limiter Init ---

# Configure login manager
login_manager.login_view = 'auth.login'
login_manager.login_message_category = 'info'


# Custom Jinja Filter
def redact_email_filter(email):
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

    # --- Manual Redis Connection Test for Production ---
    if config_name == 'production':
        redis_url_to_test = app.config.get('RATELIMIT_STORAGE_URL')
        # Use app.logger if app's logger is configured, otherwise print for early stage
        log_message = f"--- [REDIS TEST] Attempting manual connection to: {redis_url_to_test}"
        if hasattr(app, 'logger') and app.logger.hasHandlers():
            app.logger.warning(log_message)
        else:
            print(log_message)
            
        if redis_url_to_test:
            try:
                r = redis.from_url(redis_url_to_test, socket_connect_timeout=2, socket_timeout=2)
                r.ping()
                log_message_success = "--- [REDIS TEST] Manual Redis ping successful! ---"
                if hasattr(app, 'logger') and app.logger.hasHandlers():
                    app.logger.warning(log_message_success)
                else:
                    print(log_message_success)
            except redis.exceptions.ConnectionError as e:
                log_message_error = f"--- [REDIS TEST] Manual Redis connection failed: {e}"
                if hasattr(app, 'logger') and app.logger.hasHandlers():
                    app.logger.error(log_message_error)
                else:
                    print(log_message_error)
            except Exception as e:
                log_message_other_error = f"--- [REDIS TEST] Manual Redis connection failed with other error: {e}"
                if hasattr(app, 'logger') and app.logger.hasHandlers():
                    app.logger.error(log_message_other_error)
                else:
                    print(log_message_other_error)
        else:
            log_message_not_found = "--- [REDIS TEST] RATELIMIT_STORAGE_URL not found in app.config for manual test."
            if hasattr(app, 'logger') and app.logger.hasHandlers():
                app.logger.warning(log_message_not_found)
            else:
                print(log_message_not_found)
    # --- End Manual Redis Connection Test ---

    # Initialize extensions with the app instance
    # db.init_app(app) # Moved db.init_app after limiter setup for clarity

    # --- Flask-Limiter Initialization with explicit storage for production ---
    if config_name == 'production' and app.config.get('RATELIMIT_STORAGE_URL'):
        redis_url = app.config.get('RATELIMIT_STORAGE_URL')
        try:
            # Use the redis client 'r' if it was successfully created in the manual test,
            # otherwise, create a new one here.
            # For simplicity and to ensure it's always fresh based on config:
            redis_client_for_limiter = redis.from_url(redis_url, socket_connect_timeout=2, socket_timeout=2)
            redis_client_for_limiter.ping() # Verify this new client also works
            
            # Create RedisStorage instance with the working client
            custom_redis_storage = RedisStorage(client=redis_client_for_limiter)
            
            # Re-initialize or update the global limiter instance
            # Option 1: If Limiter can be reconfigured (check docs, might not be standard)
            # limiter.storage = custom_redis_storage 
            # limiter.app = app 
            # limiter._initialized = False # Hacky, might not work
            # limiter.init_app(app) # This might re-read from config, overriding our custom storage

            # Option 2: Create a new Limiter instance if the global one can't be easily updated
            # This is safer if the global 'limiter' is already used by blueprints before create_app finishes.
            # However, our global 'limiter' is initialized without app context first.
            # So, when init_app is called, it configures that global instance.
            # We need to ensure init_app uses our custom storage.
            # The init_app method itself reads RATELIMIT_STORAGE_URL.
            # Let's try to modify the global limiter's internal storage directly BEFORE init_app if possible,
            # or pass it to init_app if there's a parameter.
            # Flask-Limiter's init_app doesn't directly take a storage instance.
            # The Limiter constructor itself takes 'storage_uri' or 'storage_options'.
            #
            # Let's try setting app.config['RATELIMIT_STORAGE'] to our custom_redis_storage instance.
            # Flask-Limiter checks for 'RATELIMIT_STORAGE' in config.
            # https://flask-limiter.readthedocs.io/en/stable/configuration.html#RATELIMIT_STORAGE
            
            app.config['RATELIMIT_STORAGE'] = custom_redis_storage
            app.logger.warning(f"--- [LIMITER INIT] Set app.config['RATELIMIT_STORAGE'] to custom RedisStorage instance.")
            limiter.init_app(app) # This should now pick up the custom storage instance

        except Exception as e:
            app.logger.error(f"--- [LIMITER INIT] Failed to set up custom RedisStorage for Flask-Limiter: {e}. Falling back.")
            # Fallback to default init_app behavior which will likely use memory and warn
            limiter.init_app(app)
    else:
        # For non-production or if no RATELIMIT_STORAGE_URL, use default init_app
        limiter.init_app(app)
    
    db.init_app(app) # Initialize db after potential limiter reconfig

    if app.config.get('DEBUG'):
        logging.basicConfig(level=logging.DEBUG) 
        limiter_logger = logging.getLogger('flask_limiter')
        limiter_logger.setLevel(logging.DEBUG) 
        if not limiter_logger.handlers:
            ch = logging.StreamHandler()
            ch.setLevel(logging.DEBUG)
            formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
            ch.setFormatter(formatter)
            limiter_logger.addHandler(ch)
        limiter_logger.info("Flask-Limiter DEBUG logging attempted with basicConfig.")

    login_manager.init_app(app)
    csrf.init_app(app)
    migrate.init_app(app, db)
    socketio.init_app(app)
    mail.init_app(app)

    from .admin_views import AuthenticatedAdminIndexView
    admin.init_app(app, index_view=AuthenticatedAdminIndexView(url='/admin'))

    if app.config.get('PAYPAL_CLIENT_ID') and app.config.get('PAYPAL_CLIENT_SECRET'):
        try:
            paypalrestsdk.configure({
                "mode": app.config.get('PAYPAL_MODE', 'sandbox'),
                "client_id": app.config['PAYPAL_CLIENT_ID'],
                "client_secret": app.config['PAYPAL_CLIENT_SECRET']
            })
            # Use app.logger if available and configured
            log_paypal_init = f"PayPal SDK initialized in {app.config.get('PAYPAL_MODE', 'sandbox')} mode."
            if hasattr(app, 'logger') and app.logger.hasHandlers():
                 app.logger.info(log_paypal_init)
            else:
                print(log_paypal_init)
        except Exception as e:
            log_paypal_error = f"Failed to initialize PayPal SDK: {e}"
            if hasattr(app, 'logger') and app.logger.hasHandlers():
                app.logger.error(log_paypal_error)
            else:
                print(log_paypal_error)
    else:
        log_paypal_warning = "PayPal Client ID or Secret not configured. PayPal integration will be disabled."
        if hasattr(app, 'logger') and app.logger.hasHandlers():
            app.logger.warning(log_paypal_warning)
        else:
            print(log_paypal_warning)

    if config_name == 'testing':
        import sys 
        stream_handler = logging.StreamHandler(sys.stderr) 
        stream_handler.setFormatter(logging.Formatter(
             '%(asctime)s %(levelname)s: %(name)s: %(message)s [in %(pathname)s:%(lineno)d]'
        ))
        stream_handler.setLevel(logging.DEBUG)
        if hasattr(app, 'logger'): # Check if app.logger exists
            app.logger.addHandler(stream_handler)
            app.logger.setLevel(logging.DEBUG)
            logging.getLogger('app').setLevel(logging.DEBUG)
            app.logger.info("--- Testing environment: Flask logger explicitly configured to DEBUG level (app.logger) ---")
        print("--- Testing environment: Flask logger explicitly configured to DEBUG level (print statement) ---")

    app.jinja_env.filters['redact_email'] = redact_email_filter

    from .routes.main import main
    limiter.limit(app.config.get("RATELIMIT_DEFAULT_LIMITS"))(main)
    app.register_blueprint(main)
    from .routes.auth import auth as auth_blueprint
    limiter.limit(app.config.get("RATELIMIT_DEFAULT_LIMITS"))(auth_blueprint)
    app.register_blueprint(auth_blueprint, url_prefix='/auth')
    from .routes.auth_twitch import auth_twitch
    app.register_blueprint(auth_twitch, url_prefix='/auth/twitch')
    from .routes.challenge_api import challenge_api
    limiter.limit(app.config.get("RATELIMIT_DEFAULT_LIMITS"))(challenge_api)
    app.register_blueprint(challenge_api, url_prefix='/api/challenge')
    from .routes.games_api import games_api
    limiter.limit(app.config.get("RATELIMIT_DEFAULT_LIMITS"))(games_api)
    app.register_blueprint(games_api, url_prefix='/api/games')
    from .routes.penalties_api import penalties_api
    limiter.limit(app.config.get("RATELIMIT_DEFAULT_LIMITS"))(penalties_api)
    app.register_blueprint(penalties_api, url_prefix='/api/penalties')
    from .routes.tabs_api import tabs_api
    limiter.limit(app.config.get("RATELIMIT_DEFAULT_LIMITS"))(tabs_api)
    app.register_blueprint(tabs_api, url_prefix='/api/tabs')
    from .routes.payment import payment_bp
    limiter.limit(app.config.get("RATELIMIT_DEFAULT_LIMITS"))(payment_bp)
    app.register_blueprint(payment_bp, url_prefix='/payment')
    from .routes.profile import profile_bp
    limiter.limit(app.config.get("RATELIMIT_DEFAULT_LIMITS"))(profile_bp)
    app.register_blueprint(profile_bp)
    from .routes.admin_auth import admin_auth_bp
    app.register_blueprint(admin_auth_bp)

    from . import sockets
    print("--- SocketIO event handlers registered (imported sockets.py) ---")

    from .commands import register_commands
    register_commands(app)

    from .admin_views import UserAdminView, SavedGameTabAdminView, SavedPenaltyTabAdminView, SharedChallengeAdminView
    from .models import User, SavedGameTab, SavedPenaltyTab, SharedChallenge
    admin.add_view(UserAdminView(User, db.session, name='Users'))
    admin.add_view(SavedGameTabAdminView(SavedGameTab, db.session, name='Saved Game Tabs', category='User Related Data'))
    admin.add_view(SavedPenaltyTabAdminView(SavedPenaltyTab, db.session, name='Saved Penalty Tabs', category='User Related Data'))
    admin.add_view(SharedChallengeAdminView(SharedChallenge, db.session, name='Shared Challenges', category='User Related Data'))
    admin.add_link(MenuLink(name='Logout Admin', category='', endpoint='admin_auth.logout'))

    @app.errorhandler(404)
    def page_not_found(e):
        return render_template('errors/404.html'), 404

    print("--- Application creation complete ---")
    return app
