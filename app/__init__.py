# app/__init__.py
import os
import re
from flask import Flask, render_template, url_for
from werkzeug.middleware.proxy_fix import ProxyFix # Import ProxyFix
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
from flask_wtf.csrf import CSRFProtect
from flask_migrate import Migrate
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_socketio import SocketIO
from flask_mail import Mail
from flask_admin import Admin
from flask_admin.menu import MenuLink
from config import config
import logging
import paypalrestsdk

# Initialize extensions globally (except Limiter)
db = SQLAlchemy()
login_manager = LoginManager()
csrf = CSRFProtect()
migrate = Migrate()
socketio = SocketIO(cors_allowed_origins="*", async_mode='eventlet')
mail = Mail()
admin = Admin(name='WinChallenge Admin', template_mode='bootstrap4')
limiter = None # Will be initialized in create_app

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
    global limiter # Make sure we're assigning to the global limiter instance

    if config_name is None:
        config_name = os.environ.get('FLASK_ENV', 'development')
        if config_name not in config:
            print(f"Warning: Invalid FLASK_ENV value '{config_name}'. Using 'default' config.")
            config_name = 'default'

    print(f"--- Loading configuration: '{config_name}' ---")
    app = Flask(__name__)

    # Apply ProxyFix to handle headers from reverse proxy (e.g., Nginx)
    # x_for=1: trust one hop for X-Forwarded-For
    # x_proto=1: trust X-Forwarded-Proto
    # x_host=1: trust X-Forwarded-Host
    # x_port=1: trust X-Forwarded-Port
    # x_prefix=1: trust X-Forwarded-Prefix
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_port=1, x_prefix=1)

    try:
        app.config.from_object(config[config_name])
        print(f"--- Configuration loaded successfully for '{config_name}' ---")
    except KeyError:
        print(f"Error: Configuration name '{config_name}' not found. Using 'default'.")
        config_name = 'default'
        app.config.from_object(config[config_name])

    # Configure CSRF protection to check headers for AJAX
    app.config['WTF_CSRF_HEADERS'] = ['X-CSRFToken', 'X-CSRF-Token']


    # Initialize extensions that need the app context
    db.init_app(app)

    # --- Flask-Limiter Initialization (Directly with app, as per docs suggestion) ---
    limiter_storage_uri = app.config.get("RATELIMIT_STORAGE_URL")
    limiter_default_limits = app.config.get("RATELIMIT_DEFAULT_LIMITS")
    limiter_headers_enabled = app.config.get("RATELIMIT_HEADERS_ENABLED", True)
    
    # Optional: Add strategy from config if you set it there
    # limiter_strategy = app.config.get("RATELIMIT_STRATEGY", "fixed-window") 

    # Set RATELIMIT_DEFAULTS in app.config for Limiter to pick up
    if limiter_default_limits: # Ensure it's not None or empty before creating a list
        app.config['RATELIMIT_DEFAULTS'] = [limiter_default_limits]
    # If limiter_default_limits is None or empty, Limiter will use its own defaults or raise an error if none are configured.

    limiter = Limiter(
        get_remote_address,
        app=app, # Initialize with app directly
        storage_uri=limiter_storage_uri,
        # default_limits parameter removed, will use RATELIMIT_DEFAULTS from app.config
        headers_enabled=limiter_headers_enabled
        # storage_options={"socket_connect_timeout": 30}, # Example, add if needed
        # strategy=limiter_strategy, # Example
    )
    # --- End Flask-Limiter Initialization ---

    if app.config.get('DEBUG'):
        # This logging setup is for Flask-Limiter's own logger
        limiter_debug_logger = logging.getLogger('flask_limiter')
        if not limiter_debug_logger.handlers: # Avoid adding multiple handlers on reloads
            ch = logging.StreamHandler()
            ch.setLevel(logging.DEBUG)
            formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
            ch.setFormatter(formatter)
            limiter_debug_logger.addHandler(ch)
        limiter_debug_logger.setLevel(logging.DEBUG)
        limiter_debug_logger.info("Flask-Limiter DEBUG logging enabled.")

    login_manager.init_app(app)
    csrf.init_app(app)
    migrate.init_app(app, db) # Migrate needs db
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
            log_paypal_init = f"PayPal SDK initialized in {app.config.get('PAYPAL_MODE', 'sandbox')} mode."
            if hasattr(app, 'logger') and app.logger.hasHandlers(): app.logger.info(log_paypal_init)
            else: print(log_paypal_init)
        except Exception as e:
            log_paypal_error = f"Failed to initialize PayPal SDK: {e}"
            if hasattr(app, 'logger') and app.logger.hasHandlers(): app.logger.error(log_paypal_error)
            else: print(log_paypal_error)
    else:
        log_paypal_warning = "PayPal Client ID or Secret not configured. PayPal integration will be disabled."
        if hasattr(app, 'logger') and app.logger.hasHandlers(): app.logger.warning(log_paypal_warning)
        else: print(log_paypal_warning)

    if config_name == 'testing':
        import sys 
        stream_handler = logging.StreamHandler(sys.stderr) 
        stream_handler.setFormatter(logging.Formatter(
             '%(asctime)s %(levelname)s: %(name)s: %(message)s [in %(pathname)s:%(lineno)d]'
        ))
        stream_handler.setLevel(logging.DEBUG)
        if hasattr(app, 'logger'):
            app.logger.addHandler(stream_handler)
            app.logger.setLevel(logging.DEBUG)
            logging.getLogger('app').setLevel(logging.DEBUG)
            app.logger.info("--- Testing environment: Flask logger explicitly configured to DEBUG level (app.logger) ---")
        print("--- Testing environment: Flask logger explicitly configured to DEBUG level (print statement) ---")

    app.jinja_env.filters['redact_email'] = redact_email_filter

    # Import and register blueprints AFTER limiter is initialized with app
    # The Limiter instance itself has default_limits, so explicit per-blueprint application
    # of the same default is not necessary unless a blueprint needs a *different* default.

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
    
    from .routes.admin_auth import admin_auth_bp
    # admin_auth_bp has its own @limiter.limit decorators on specific routes
    app.register_blueprint(admin_auth_bp)

    from . import sockets 
    print("--- SocketIO event handlers registered (imported sockets.py) ---")

    from .commands import register_commands
    register_commands(app)

    from .admin_views import UserAdminView, SavedGameTabAdminView, SavedPenaltyTabAdminView, SharedChallengeAdminView, FeedbackAdminView
    from .models import User, SavedGameTab, SavedPenaltyTab, SharedChallenge, Feedback # Added Feedback model
    admin.add_view(UserAdminView(User, db.session, name='Users', category='User Management'))
    admin.add_view(FeedbackAdminView(Feedback, db.session, name='User Feedback')) # User Feedback as top-level
    admin.add_view(SavedGameTabAdminView(SavedGameTab, db.session, name='Game Tabs', category='User Data'))
    admin.add_view(SavedPenaltyTabAdminView(SavedPenaltyTab, db.session, name='Penalty Tabs', category='User Data'))
    admin.add_view(SharedChallengeAdminView(SharedChallenge, db.session, name='Shared Challenges', category='User Data'))
    admin.add_link(MenuLink(name='Logout Admin', category='', endpoint='admin_auth.logout'))

    @app.errorhandler(404)
    def page_not_found(e):
        return render_template('errors/404.html'), 404

    print("--- Application creation complete ---")
    return app
