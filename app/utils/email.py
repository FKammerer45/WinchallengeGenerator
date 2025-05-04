# app/utils/email.py
import logging
from flask import current_app, url_for, render_template
from flask_mail import Message
from itsdangerous import URLSafeTimedSerializer, SignatureExpired, BadTimeSignature 
from app import db
from threading import Thread

logger = logging.getLogger(__name__)

def _send_async_email(app, msg):
    """Helper function to send email in a background thread."""
    with app.app_context():
        try:
            mail = current_app.extensions.get('mail')
            if mail:
                mail.send(msg)
                logger.info(f"Async email sent successfully to {msg.recipients}")
            else:
                logger.error("Flask-Mail extension not found in current_app.")
        except Exception as e:
            logger.exception(f"Error sending async email to {msg.recipients}: {e}")

def send_email(to, subject, template_context, template_prefix):
    """Sends an email using Flask-Mail in a background thread."""
    try:
        app = current_app._get_current_object()
        html_body = render_template(f"{template_prefix}.html", **template_context)
        text_body = render_template(f"{template_prefix}.txt", **template_context)
        msg = Message(
            subject=subject,
            sender=app.config.get('MAIL_DEFAULT_SENDER'),
            recipients=[to] if isinstance(to, str) else to,
            body=text_body,
            html=html_body
        )
        thr = Thread(target=_send_async_email, args=[app, msg])
        thr.start()
        logger.info(f"Email sending task initiated for {to}")
        return thr
    except Exception as e:
        logger.exception(f"Error preparing email to {to}: {e}")
        return None

# --- Confirmation Token Functions (Use SECURITY_PASSWORD_SALT) ---
def generate_confirmation_token(email):
    """Generates a secure, timed token for email confirmation."""
    serializer = URLSafeTimedSerializer(current_app.config['SECRET_KEY'])
    # Use the specific salt for confirmation
    return serializer.dumps(email, salt=current_app.config['SECURITY_PASSWORD_SALT'])

def confirm_token(token, expiration=None):
    """Confirms an email confirmation token."""
    if expiration is None:
        expiration = current_app.config.get('EMAIL_CONFIRMATION_EXPIRATION', 3600)
    serializer = URLSafeTimedSerializer(current_app.config['SECRET_KEY'])
    try:
        email = serializer.loads(
            token,
            salt=current_app.config['SECURITY_PASSWORD_SALT'], # Use confirmation salt
            max_age=expiration
        )
        return email
    except Exception as e:
        logger.warning(f"Confirmation token error: {e} (Token: {token[:10]}...)")
        return False

# --- New: Password Reset Token Functions (Use SECURITY_PASSWORD_RESET_SALT) ---
def generate_password_reset_token(email):
    """Generates a secure, timed token for password reset."""
    serializer = URLSafeTimedSerializer(current_app.config['SECRET_KEY'])
    # Use the specific salt for password resets
    return serializer.dumps(email, salt=current_app.config['SECURITY_PASSWORD_RESET_SALT'])

def confirm_password_reset_token(token, expiration=None):
    """Confirms a password reset token."""
    if expiration is None:
        expiration = current_app.config.get('PASSWORD_RESET_EXPIRATION', 1800) # Use specific expiration
    serializer = URLSafeTimedSerializer(current_app.config['SECRET_KEY'])
    try:
        email = serializer.loads(
            token,
            salt=current_app.config['SECURITY_PASSWORD_RESET_SALT'], # Use password reset salt
            max_age=expiration
        )
        return email
    except Exception as e:
        logger.warning(f"Password reset token error: {e} (Token: {token[:10]}...)")
        return False

def generate_email_change_token(user_id, new_email):
    """Generates a token containing user ID and the new email address."""
    serializer = URLSafeTimedSerializer(current_app.config['SECRET_KEY'])
    # Dump a dictionary or tuple containing both pieces of info
    return serializer.dumps({'user_id': user_id, 'new_email': new_email.lower()},
                            salt=current_app.config['SECURITY_EMAIL_CHANGE_SALT'])

def confirm_email_change_token(token, expiration=None):
    """
    Confirms an email change token.

    Returns:
        dict or False: A dictionary {'user_id': ..., 'new_email': ...} if valid, otherwise False.
    """
    if expiration is None: expiration = current_app.config.get('EMAIL_CHANGE_EXPIRATION', 1800)
    serializer = URLSafeTimedSerializer(current_app.config['SECRET_KEY'])
    try:
        data = serializer.loads(
            token,
            salt=current_app.config['SECURITY_EMAIL_CHANGE_SALT'], # Use email change salt
            max_age=expiration
        )
        # Basic validation of the loaded data structure
        if isinstance(data, dict) and 'user_id' in data and 'new_email' in data:
            return data
        else:
            logger.warning(f"Email change token payload invalid structure: {data}")
            return False
    except (SignatureExpired, BadTimeSignature, Exception) as e:
        logger.warning(f"Email change token error: {e} (Token: {token[:10]}...)")
        return False
