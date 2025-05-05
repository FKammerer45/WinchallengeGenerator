# run.py
import eventlet

# --- Perform Eventlet monkey patching FIRST ---
# Check if already patched to avoid issues during reloads
if not eventlet.patcher.is_monkey_patched('socket'):
    print("--- [run.py] Patching standard libraries for eventlet ---")
    eventlet.monkey_patch()
else:
    print("--- [run.py] Standard libraries already patched ---")
# --- End Patching ---

# Now import app factory and other necessary modules
import os
from app import create_app, db, socketio # Import db and socketio instance as well
from app.commands import register_commands
# Import models needed for shell context or potential startup tasks
from app.models import (
    User,
    SavedPenaltyTab,
    SavedGameTab,
    GameEntry,
    Penalty,
    SharedChallenge,
    ChallengeGroup,
)

# Create the Flask app instance using the factory function
# Determine config name (e.g., from FLASK_ENV or default to 'production' for run.py)
# Using 'development' as default here assuming run.py is mostly for local dev
config_name = os.getenv('FLASK_ENV') or 'development'
app = create_app(config_name)
register_commands(app) # Register CLI commands


# Define context for the Flask shell (`flask shell`)
@app.shell_context_processor
def make_shell_context():
    """Provides database instance and models to the Flask shell context."""
    return {
        'db': db,
        'socketio': socketio,
        'User': User,
        'SavedPenaltyTab': SavedPenaltyTab,
        'SavedGameTab': SavedGameTab,
        'GameEntry': GameEntry,
        'Penalty': Penalty,
        'SharedChallenge': SharedChallenge,
        'ChallengeGroup': ChallengeGroup,
    }


# Main execution block when script is run directly (for local development)
if __name__ == '__main__':
    # Get debug mode from the application configuration
    # This ensures the reloader works correctly based on FLASK_ENV
    debug_mode = app.config.get('DEBUG', False)

    # Get host and port from environment variables or use defaults
    host = os.environ.get('FLASK_RUN_HOST', '127.0.0.1')
    try:
        port = int(os.environ.get('FLASK_RUN_PORT', '5000'))
    except ValueError:
        port = 5000

    print(f"--- Starting Flask-SocketIO development server (via run.py) ---")
    print(f"--- Environment: {config_name} ---")
    print(f"--- Debug Mode: {debug_mode} ---")
    print(f"--- Running on http://{host}:{port} ---")

    # Use Flask-SocketIO's run method which integrates with eventlet
    # use_reloader=debug_mode ensures the reloader only runs in debug mode
    # debug=debug_mode passes the debug flag to Flask internally
    socketio.run(app, host=host, port=port, debug=debug_mode, use_reloader=debug_mode)
    # Do not call app.run() here, socketio.run() handles it.

# Note: When running with Gunicorn, Gunicorn imports 'app' from this file.
# The patching at the top ensures eventlet is set up before Gunicorn loads the app.
# The `if __name__ == '__main__':` block is ignored by Gunicorn.
