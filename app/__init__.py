# app/__init__.py
import logging
import os
import sys
from werkzeug.exceptions import HTTPException
from flask import Flask, jsonify, request # Added request for error handler potentially
from flask_wtf.csrf import CSRFProtect
from flask_login import LoginManager
from sqlalchemy.exc import OperationalError
from flask_migrate import Migrate # Keep Flask-Migrate import

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
    # Assuming Base is defined in database.py along with SessionLocal and engine
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
migrate = Migrate() # Instantiate Migrate here


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

    # --- Flask-Migrate Initialization ---
    # Use Base.metadata from your models/database setup
    # Ensure RENDER_AS_BATCH=True if using SQLite
    migrate.init_app(app, db=None, metadata=Base.metadata, render_as_batch=True, compare_type=True)
    app.logger.info("Flask-Migrate initialized.")
    # Note: Removed 'db=None' as it's default, but explicitly showing metadata usage.
    # If you were using Flask-SQLAlchemy, you'd pass db=db_instance instead of metadata.

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
            # Assuming User model has primary key 'id'
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

    # --- Blueprint Imports and Registration ---
    try:
        # Import all necessary blueprints
        from .modules.auth import auth_bp
        from .routes.main import main_bp
        from .routes.games_api import games_api_bp
        from .routes.tabs_api import tabs_api_bp
        from .routes.challenge_api import challenge_api_bp # Contains generate, share, group, progress APIs
        from .routes.penalties_api import penalties_api_bp
        # Removed import for shared_challenge_api if routes were added to challenge_api_bp

        # Register blueprints
        app.register_blueprint(auth_bp, url_prefix='/auth')
        app.register_blueprint(main_bp)
        app.register_blueprint(games_api_bp)
        app.register_blueprint(tabs_api_bp)
        app.register_blueprint(challenge_api_bp) # Register the challenge API blueprint
        app.register_blueprint(penalties_api_bp)
        # Removed registration for shared_challenge_api_bp
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
        # Return JSON for API consistency, check request type if needed
        if request.accept_mimetypes.accept_json and not request.accept_mimetypes.accept_html:
             return jsonify({
                 "error": "Not Found",
                 "message": "The requested resource was not found."
             }), 404
        # Fallback to a simple HTML error or redirect
        return "<h1>404 Not Found</h1><p>The requested resource was not found.</p><a href='/'>Home</a>", 404


    @app.errorhandler(500)
    def internal_error(error):
        # Log the actual error object passed by Flask
        app.logger.error(f"500 Internal Server Error: {error}", exc_info=True)
        # The get_db_session context manager should handle rollback for route errors
        # Rollback might be needed here too if error happens outside session scope
        try:
            db_session = SessionLocal()
            db_session.rollback()
            db_session.close()
            app.logger.info("Rolled back database session due to 500 error.")
        except Exception as db_err:
            app.logger.error(f"Failed to rollback database session during 500 error handling: {db_err}")

        if request.accept_mimetypes.accept_json and not request.accept_mimetypes.accept_html:
            return jsonify({
                "error": "Internal Server Error",
                "message": "An unexpected error occurred on the server."
            }), 500
        # Fallback to a simple HTML error or redirect
        return "<h1>500 Internal Server Error</h1><p>An unexpected error occurred.</p><a href='/'>Home</a>", 500

    # Optional: Keep general Exception handler, but 500 handler might catch most
    @app.errorhandler(Exception)
    def handle_unhandled_exception(e):
        # Avoid double-logging if it's an HTTPException already handled (like 500)
        if not isinstance(e, (jsonify.HTTPException, OperationalError)): # Add OperationalError if db connection fails
             app.logger.error(f"Unhandled Exception: {e}", exc_info=True)
        # Try rollback for safety
        try:
            db_session = SessionLocal()
            db_session.rollback()
            db_session.close()
        except Exception as db_err:
            app.logger.error(f"Failed to rollback database session during general exception handling: {db_err}")

        if request.accept_mimetypes.accept_json and not request.accept_mimetypes.accept_html:
             return jsonify({
                 "error": "Internal Server Error",
                 "message": "An unexpected application error occurred."
             }), 500
        # Fallback
        return "<h1>Internal Server Error</h1><p>An unexpected application error occurred.</p><a href='/'>Home</a>", 500


    app.logger.info("Application factory setup complete.")
    return app