import datetime
from app.models import User
from app import db

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
    if user and user.pro_plan_active and user.pro_plan_expiration_date:
        return user.pro_plan_expiration_date > datetime.datetime.now(datetime.timezone.utc)
    return False
