# app/routes/auth_twitch.py
from flask import Blueprint
import logging, secrets, requests
from flask import session, redirect, url_for, request, flash, current_app
from flask_login import login_user
from werkzeug.security import generate_password_hash
from app import db
from app.models import User
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
    # 1) error/state check
    if err := request.args.get('error'):
        flash(f"Twitch OAuth error: {err}", 'danger')
        return redirect(url_for('auth.login'))
    if request.args.get('state') != session.pop('twitch_oauth_state', None):
        flash("OAuth state mismatch.", 'danger')
        return redirect(url_for('auth.login'))

    # 2) exchange code for token
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
        logger.error("Twitch token error: %s", tok)
        return redirect(url_for('auth.login'))

    # 3) fetch profile
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
    tu = resp[0]

    # 4) find-or-create User
    user = User.query.filter_by(twitch_id=tu['id']).first()
    if not user:
        user = User(
            username      = tu['login'],
            twitch_id     = tu['id'],
            password_hash = generate_password_hash(secrets.token_urlsafe(16))
        )
        db.session.add(user)
        db.session.commit()
        logger.info("New Twitch user: %s", user.username)

    # 5) log in and redirect
    login_user(user)
    flash("Logged in with Twitch!", 'success')
    return redirect(request.args.get('next') or url_for('main.index'))
