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

# Textual features for display on the pricing page
# These can be directly used in the template.
FREE_PLAN_DISPLAY_FEATURES = [
    f"Up to {PLAN_LIMITS['free']['max_challenges']} challenges",
    f"Up to {PLAN_LIMITS['free']['max_game_tabs']} custom game tabs",
    f"Up to {PLAN_LIMITS['free']['max_penalty_tabs']} custom penalty tabs",
]

PRO_PLAN_DISPLAY_FEATURES = [
    f"Up to {PLAN_LIMITS['pro']['max_challenges']} challenges",
    f"Up to {PLAN_LIMITS['pro']['max_game_tabs']} custom game tabs",
    f"Up to {PLAN_LIMITS['pro']['max_penalty_tabs']} custom penalty tabs",
    "Commercial Usage License",
    "OBS overlay customization (Coming Soon)",
    "And much more! (Coming Soon)"
]

# You can add more plans here in the future if needed, e.g., 'pro_plus'
# PLAN_LIMITS['pro_plus'] = { ... }
# PRO_PLUS_DISPLAY_FEATURES = [ ... ]
