# app/__init__.py
import logging
import os
import sys
from flask import Flask, jsonify, request # Added request for error handler potentially
from flask_wtf.csrf import CSRFProtect
from flask_login import LoginManager
from sqlalchemy.exc import OperationalError

# --- Configuration Import ---
# Add project root to path to find config.py reliably
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
try:
    import config
except ImportError:
    print("ERROR: config.py not found. Make sure it exists in the project root.", file=sys.stderr)
    sys.exit(1)

# --- Database Setup Import ---
# Import database components early; they don't depend on the Flask app instance yet
try:
    from .database import SessionLocal, engine, Base
except ImportError as e:
    print(f"ERROR: Failed to import from .database: {e}. Check app/database.py.", file=sys.stderr)
    sys.exit(1)

# --- Extension Initialization (without app) ---
csrf = CSRFProtect()
login_manager = LoginManager()
login_manager.login_view = "auth.login" # Use 'blueprint_name.endpoint_name'
login_manager.login_message = "Please log in to access this page."
login_manager.login_message_category = "info" # For flashed messages styling


# --- Application Factory Function ---
def create_app(config_object=config):
    """Creates and configures the Flask application instance."""

    app = Flask(__name__, instance_relative_config=True)
    app.config.from_object(config_object)
    app.logger.info("Flask application configured.")

    # Ensure instance folder exists (useful for SQLite)
    try:
        os.makedirs(app.instance_path, exist_ok=True)
    except OSError:
        app.logger.warning(f"Could not create instance folder: {app.instance_path}")

    # Configure Logging (using Flask's logger)
    log_level_str = app.config.get("LOG_LEVEL", "INFO").upper()
    log_level = getattr(logging, log_level_str, logging.INFO)
    log_format = app.config.get("LOG_FORMAT", '%(asctime)s %(levelname)s: %(module)s:%(lineno)d - %(message)s')
    # Clear existing handlers to avoid duplicates if factory is called multiple times
    app.logger.handlers.clear()
    handler = logging.StreamHandler(sys.stderr) # Log to stderr by default
    handler.setFormatter(logging.Formatter(log_format))
    app.logger.addHandler(handler)
    app.logger.setLevel(log_level)
    # Prevent passing to root logger if basicConfig was called elsewhere
    app.logger.propagate = False
    app.logger.info(f"Flask logger configured with level {log_level_str}")


    # Initialize extensions WITH the app instance
    csrf.init_app(app)
    app.logger.info("CSRF protection initialized.")
    login_manager.init_app(app)
    app.logger.info("Flask-Login initialized.")

    # --- User Loader Definition (needs models and SessionLocal) ---
    # Import models *inside* the factory or just before needed
    try:
        from .models import User
    except ImportError as e:
         app.logger.error(f"Failed to import User model inside create_app: {e}")
         # Depending on severity, you might raise the error or exit
         raise RuntimeError("Could not import User model.") from e

    @login_manager.user_loader
    def load_user(user_id_str):
        """Flask-Login user loader callback."""
        try:
            user_id = int(user_id_str)
        except ValueError:
            app.logger.warning(f"Invalid user_id format received: {user_id_str}")
            return None

        # Use a session specifically for user loading
        db_session = SessionLocal()
        user = None
        try:
            user = db_session.query(User).get(user_id)
            if user:
                 app.logger.debug(f"User loader: loaded user {user.username} for ID {user_id}")
            else:
                 app.logger.debug(f"User loader: No user found for ID {user_id}")
        except Exception as e:
            app.logger.error(f"Error querying user in user_loader for ID {user_id}: {e}", exc_info=True)
        finally:
            db_session.close()
        return user

    # --- Database Initialization (Run once at startup) ---
    with app.app_context():
        try:
            # WARNING: Use Alembic or similar for migrations in production!
            app.logger.info("Attempting to create database tables if they don't exist...")
            Base.metadata.create_all(bind=engine)
            app.logger.info("Database tables checked/created successfully.")
        except OperationalError as e:
            app.logger.error(f"DATABASE CONNECTION OR SETUP FAILED: {e}")
            app.logger.error("Check DATABASE_URL, database server status, and permissions.")
            # Optionally exit or raise a more specific error if DB is required at startup
        except Exception as e:
            app.logger.error(f"Unexpected error during initial DB setup: {e}", exc_info=True)

    # --- Import and Register Blueprints (AFTER models/db/extensions) ---
    try:
        from .modules.auth import auth_bp
        from .routes.main import main_bp
        from .routes.games_api import games_api_bp
        from .routes.tabs_api import tabs_api_bp
        from .routes.challenge_api import challenge_api_bp

        app.register_blueprint(auth_bp, url_prefix='/auth')
        app.register_blueprint(main_bp)
        app.register_blueprint(games_api_bp) # Prefix defined in blueprint (/api/games)
        app.register_blueprint(tabs_api_bp)  # Prefix defined in blueprint (/api/tabs)
        app.register_blueprint(challenge_api_bp) # Prefix defined in blueprint (/api/challenge)
        app.logger.info("Blueprints registered successfully.")
    except ImportError as e:
         app.logger.error(f"Failed to import or register blueprints: {e}", exc_info=True)
         raise RuntimeError("Could not import blueprints.") from e


    # --- Context Processors ---
    @app.context_processor
    def inject_global_vars():
        """Inject variables into all templates."""
        # Inject only necessary config values into templates
        return dict(
            RECAPTCHA_PUBLIC_KEY=app.config.get('RECAPTCHA_PUBLIC_KEY', '') # Provide default
        )

    # --- Error Handlers ---
    @app.errorhandler(404)
    def not_found_error(error):
        app.logger.warning(f"404 Not Found: {request.path} (Referrer: {request.referrer})")
        # return render_template('errors/404.html'), 404 # Optional custom template
        return jsonify({
            "error": "Not Found",
            "message": "The requested resource was not found."
        }), 404

    @app.errorhandler(500)
    def internal_error(error):
        # Log the actual error object passed by Flask
        app.logger.error(f"500 Internal Server Error: {error}", exc_info=True)
        # The get_db_session context manager should handle rollback for route errors
        return jsonify({
            "error": "Internal Server Error",
            "message": "An unexpected error occurred on the server."
        }), 500

    @app.errorhandler(Exception)
    def handle_unhandled_exception(e):
        # Catch-all for any other unhandled exceptions
        app.logger.error(f"Unhandled Exception: {e}", exc_info=True)
        return jsonify({
            "error": "Internal Server Error",
            "message": "An unexpected application error occurred."
        }), 500


    app.logger.info("Application factory setup complete.")
    return app