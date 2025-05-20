# app/routes/auth_twitch.py
from flask import Blueprint
from sqlalchemy.exc import IntegrityError
import logging, secrets, requests
from flask import session, redirect, url_for, request, flash, current_app
from flask_login import login_user
from werkzeug.security import generate_password_hash
from app import db
from app.models import User
from app.utils.auth_helpers import is_safe_url # Import the helper
logger = logging.getLogger(__name__)
auth_twitch = Blueprint('auth_twitch', __name__, template_folder='../templates/auth')

@auth_twitch.route('/login')
def twitch_login():
    state = secrets.token_urlsafe(16)
    session['twitch_oauth_state'] = state
    params = {
        'client_id':    current_app.config['TWITCH_CLIENT_ID'],
        'redirect_uri': current_app.config['TWITCH_REDIRECT_URI'],
        'response_type':'code',
        'scope':        'user:read:email',
        'state':        state
    }
    url = f"{current_app.config['TWITCH_OAUTH_URL']}/authorize?{requests.compat.urlencode(params)}"
    logger.debug("Redirecting to Twitch OAuth: %s", url)
    return redirect(url)

@auth_twitch.route('/callback')
def twitch_callback():
    # 1) error/state check (Unchanged)
    if err := request.args.get('error'):
        flash(f"Twitch OAuth error: {err}", 'danger') # User-facing, f-string is okay here
        return redirect(url_for('auth.login'))
    if request.args.get('state') != session.pop('twitch_oauth_state', None):
        flash("OAuth state mismatch.", 'danger')
        return redirect(url_for('auth.login'))

    # 2) exchange code for token (Unchanged)
    code = request.args.get('code')
    tok = requests.post(
        f"{current_app.config['TWITCH_OAUTH_URL']}/token",
        data={
            'client_id':     current_app.config['TWITCH_CLIENT_ID'],
            'client_secret': current_app.config['TWITCH_CLIENT_SECRET'],
            'code':          code,
            'grant_type':    'authorization_code',
            'redirect_uri':  current_app.config['TWITCH_REDIRECT_URI']
        }
    ).json()
    access = tok.get('access_token')
    if not access:
        flash("Failed to get token from Twitch.", 'danger')
        logger.error("Twitch token error: %s", tok) # tok is a dict, %s is fine
        return redirect(url_for('auth.login'))

    # 3) fetch profile (Unchanged)
    resp = requests.get(
        'https://api.twitch.tv/helix/users',
        headers={
            'Authorization': f"Bearer {access}",
            'Client-Id':     current_app.config['TWITCH_CLIENT_ID']
        }
    ).json().get('data', [])
    if not resp:
        flash("Could not fetch Twitch profile.", 'danger')
        return redirect(url_for('auth.login'))
    tu = resp[0] # Twitch user data
    twitch_user_id = tu['id']
    twitch_base_username = tu['login']

    # --- Modified Step 4: Find-or-Create User with #0000 Logic ---
    user = None
    try:
        # Check 1: Find user by Twitch ID first
        user = User.query.filter_by(twitch_id=twitch_user_id).first()

        if user:
            logger.info("Twitch user %s (Twitch ID: %s) found by twitch_id.", user.username, twitch_user_id)
            # User already linked, proceed to login
        else:
            # Check 2: No user with this twitch_id found.
            # Construct the #0000 username and check if IT exists.
            target_username = f"{twitch_base_username}#0000"
            existing_user_with_tag = User.query.filter(User.username == target_username).first()

            if existing_user_with_tag:
                # Found a user with Username#0000
                if existing_user_with_tag.twitch_id is None:
                    # Found Username#0000 but it's not linked to ANY twitch ID.
                    # This implies it might be an old account or manually created. Link it.
                    logger.warning("Found existing user '%s' with no twitch_id. Linking Twitch ID %s.", target_username, twitch_user_id)
                    existing_user_with_tag.twitch_id = twitch_user_id
                    user = existing_user_with_tag # Use this existing user
                    db.session.commit() # Commit the linking
                elif existing_user_with_tag.twitch_id == twitch_user_id:
                    # Found Username#0000 and it's ALREADY linked to the correct twitch_id.
                    # This scenario is unlikely if Check 1 was done correctly, but safe to handle.
                    logger.info("Found existing user '%s' already correctly linked to Twitch ID %s.", target_username, twitch_user_id)
                    user = existing_user_with_tag
                else:
                    # Found Username#0000 but it's linked to a DIFFERENT twitch_id!
                    # This is a conflict that needs manual resolution.
                    logger.error("CRITICAL CONFLICT: User '%s' exists but is linked to a different Twitch ID (%s) than the current login (%s).", target_username, existing_user_with_tag.twitch_id, twitch_user_id)
                    flash("Username conflict detected. Please contact support.", "danger")
                    return redirect(url_for('auth.login'))
            else:
                # Username#0000 does NOT exist. Create the new user.
                logger.info("Creating new Twitch user: %s (Twitch ID: %s)", target_username, twitch_user_id)
                user = User(
                    username=target_username,
                    twitch_id=twitch_user_id,
                    password_hash=generate_password_hash(secrets.token_urlsafe(16)) # Set a random password
                )
                db.session.add(user)
                db.session.commit()
                logger.info("New Twitch user created successfully.")

    except IntegrityError:
        db.session.rollback()
        logger.exception("IntegrityError during Twitch user find/create for %s", twitch_base_username)
        flash("A database error occurred while linking your Twitch account. Please try again.", "danger")
        return redirect(url_for('auth.login'))
    except Exception as e:
        # Log the full error for debugging, but be cautious in production
        logger.error("Twitch token error for user. Error: %s", str(e)) # Avoid logging the full token dictionary
        flash(f"Error obtaining Twitch token: {str(e)}. Please try again.", "danger")
        return redirect(url_for('auth.login'))

    # --- Step 5: Log In and Redirect ---
    if user:
        login_user(user) # Log in the found or newly created user
        flash("Logged in with Twitch!", 'success')
        next_page = request.args.get('next')
        if next_page and is_safe_url(next_page):
            return redirect(next_page)
        return redirect(url_for('main.index'))
    else:
        # Should not happen if logic above is correct, but as a fallback
        flash("Could not log you in after Twitch authentication.", "danger")
        return redirect(url_for('auth.login'))
