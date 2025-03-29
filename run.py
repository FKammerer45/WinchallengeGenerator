# run.py
import os
from app import create_app

# Create the Flask app instance using the factory
app = create_app()

if __name__ == "__main__":
    # Get host and port from environment variables or use defaults
    host = os.environ.get("FLASK_RUN_HOST", "127.0.0.1")
    try:
        port = int(os.environ.get("FLASK_RUN_PORT", "5000"))
    except ValueError:
        port = 5000

    # Debug mode is controlled by the DEBUG variable in config.py loaded by create_app()
    use_debugger = app.config.get("DEBUG", False)

    # Use reloader should also be tied to debug ideally
    use_reloader = use_debugger

    app.run(host=host, port=port, debug=use_debugger, use_reloader=use_reloader)