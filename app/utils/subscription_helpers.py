import datetime
from app.models import User
from app import db
from app.plan_config import PLAN_LIMITS # Import plan limits

def grant_pro_plan(user: User):
    """Grants the pro plan to a user and sets the expiration date one month from now."""
    if user:
        user.pro_plan_active = True
        user.pro_plan_expiration_date = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=30) # Approximately one month
        db.session.commit()
        return True
    return False

def is_pro_plan_active(user: User) -> bool:
    """Checks if a user's pro plan is currently active."""
    if not user: # Ensure user object is not None
        return False
        
    if user.pro_plan_active and user.pro_plan_expiration_date:
        expiration_date = user.pro_plan_expiration_date
        # Ensure the expiration_date is offset-aware (assume UTC if naive)
        if expiration_date.tzinfo is None or expiration_date.tzinfo.utcoffset(expiration_date) is None:
            expiration_date = expiration_date.replace(tzinfo=datetime.timezone.utc)
        
        current_utc_time = datetime.datetime.now(datetime.timezone.utc)
        
        if expiration_date <= current_utc_time:
            # Plan has expired, deactivate it
            user.pro_plan_active = False
            # user.pro_plan_expiration_date = None # Optionally clear the date
            db.session.add(user) # Ensure user object is added to session if modified
            db.session.commit()
            return False # Plan is no longer active
        else:
            return True # Plan is active and not expired
            
    # If pro_plan_active is False or no expiration date, it's not active
    if user.pro_plan_active and not user.pro_plan_expiration_date:
        # This case should ideally not happen if grant_pro_plan always sets an expiration date
        # But as a safeguard, deactivate if active but no expiration.
        user.pro_plan_active = False
        db.session.add(user)
        db.session.commit()

    return False

def get_user_limit(user: User, limit_name: str) -> int:
    """
    Gets a specific limit for a user based on their plan.
    Args:
        user: The User object.
        limit_name: The name of the limit to retrieve (e.g., 'max_penalty_tabs').
    Returns:
        The integer value of the limit.
    """
    if is_pro_plan_active(user):
        plan_type = 'pro'
    else:
        plan_type = 'free'
    
    # Get the limit for the user's plan type, default to free plan's limit if pro limit not found
    # And default to 0 if the limit_name itself is not found in the free plan (as a fallback)
    limit_value = PLAN_LIMITS.get(plan_type, {}).get(limit_name, PLAN_LIMITS.get('free', {}).get(limit_name, 0))
    
    return limit_value
