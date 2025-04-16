# run.py
import os
from app import create_app, db
from app.commands import register_commands 
# Import models needed for shell context or potential startup tasks
# Corrected imports based on app/models.py
from app.models import (
    User, 
    SavedPenaltyTab,
    SavedGameTab,
    GameEntry,
    Penalty,
    SharedChallenge, 
    ChallengeGroup,
    # Removed non-existent models like ChallengeGame, ChallengePenalty, Tab, GroupMembership
    # Note: user_challenge_group_membership is a Table object, not typically imported here
) 

# Create the Flask app instance using the factory function
# It will automatically detect FLASK_ENV or default to 'development'
app = create_app(os.getenv('FLASK_ENV')) 
register_commands(app)



# Define context for the Flask shell (`flask shell`)
# Makes it easier to work with the database and models interactively
@app.shell_context_processor
def make_shell_context():
    """Provides database instance and models to the Flask shell context."""
    # Use the correct model names imported above
    return {
        'db': db, 
        'User': User, 
        'SavedPenaltyTab': SavedPenaltyTab,
        'SavedGameTab': SavedGameTab,
        'GameEntry': GameEntry,
        'Penalty': Penalty,
        'SharedChallenge': SharedChallenge, 
        'ChallengeGroup': ChallengeGroup,
        # If you want the association table accessible:
        # 'user_challenge_group_membership_table': user_challenge_group_membership 
    }



# Main execution block when script is run directly
if __name__ == '__main__':
    # Get debug mode from the application configuration
    debug_mode = app.config.get('DEBUG', False)
    
    # Get host and port from environment variables or use defaults
    host = os.environ.get('FLASK_RUN_HOST', '127.0.0.1')
    port = int(os.environ.get('FLASK_RUN_PORT', 5000))

    print(f"--- Starting Flask development server ---")
    print(f"--- Environment: {os.environ.get('FLASK_ENV', 'N/A')} ---")
    print(f"--- Debug Mode: {debug_mode} ---")
    print(f"--- Running on http://{host}:{port} ---")
    
    # Run the Flask development server
    app.run(host=host, port=port, debug=debug_mode)
