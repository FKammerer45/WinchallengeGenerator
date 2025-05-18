# app/plan_config.py

PLAN_LIMITS = {
    'free': {
        'max_penalty_tabs': 5,
        'max_game_tabs': 5,
        'max_challenges': 15,
        # Add other future free plan limits here
    },
    'pro': {
        'max_penalty_tabs': 20,
        'max_game_tabs': 20,
        'max_challenges': 100,
        # Add other future pro plan limits here
    }
}

# You can add more plans here in the future if needed, e.g., 'pro_plus'
# PLAN_LIMITS['pro_plus'] = { ... }
