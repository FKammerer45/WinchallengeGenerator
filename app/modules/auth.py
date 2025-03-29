# app/modules/auth.py
import re
import logging
from flask import Blueprint, render_template, request, redirect, url_for, flash, current_app
# --- Import current_user here ---
from flask_login import login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash
# Use absolute imports
from app.modules.recaptcha import verify_recaptcha
from app.models import User
from app.database import get_db_session # Use context manager

# Setup logger for this blueprint/module
logger = logging.getLogger(__name__)

# Define blueprint relative to 'templates' folder within 'app' package
auth_bp = Blueprint('auth', __name__, template_folder='../templates/auth')


@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    """Handles user login."""
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '').strip()

        # --- CAPTCHA Verification ---
        captcha_response = request.form.get("g-recaptcha-response")
        recaptcha_private_key = current_app.config.get('RECAPTCHA_PRIVATE_KEY')

        if not recaptcha_private_key:
            logger.error("RECAPTCHA_PRIVATE_KEY is not configured. Skipping verification.")
            # flash("Recaptcha not configured correctly.", "warning")
        elif not captcha_response or not verify_recaptcha(captcha_response):
            logger.warning(f"Login attempt failed reCAPTCHA for user '{username}'.")
            flash("Invalid captcha. Please try again.", "danger")
            return redirect(url_for('auth.login'))

        # --- Database User Lookup & Password Check ---
        try:
            with get_db_session() as db_session: # Session active inside this block
                logger.debug(f"Looking up user: {username}")
                user = db_session.query(User).filter(User.username.ilike(username)).first()
                logger.debug(f"User found: {user is not None}")

                # *** MOVED CHECKS INSIDE THE 'with' BLOCK ***
                if user and user.check_password(password):
                    # User exists and password is correct - perform login while session is active
                    login_user(user) # Flask-Login handles session management
                    logger.info(f"User '{username}' logged in successfully.")
                    flash('Logged in successfully!', 'success')
                    # Session commit happens automatically when 'with' block exits here
                    # Redirect AFTER successful login and session commit
                    return redirect(url_for('main.index'))
                else:
                    # User not found OR password incorrect
                    logger.warning(f"Invalid login attempt for user '{username}'.")
                    flash('Invalid username or password.', 'danger')
                    # Re-render login page - DO THIS *AFTER* the 'with' block
                    # No redirect here, let the function proceed to render_template
                    # We set a flag or just let it fall through
                    pass # Let it fall through to the render_template outside the try/except

        except Exception as e:
            # This catches DB errors during query OR potentially errors during check_password/login_user
            logger.exception("Error during login process")
            flash("An error occurred during login. Please try again.", "danger")
            # On ANY exception during the process, redirect back to login form
            return redirect(url_for('auth.login'))

        # If we reach here, it means login failed (user not found or wrong password)
        # The flash message was set inside the 'with' block's else condition
        return render_template('login.html') # Assumes template is in 'auth' folder

    # --- Handle GET Request ---
    return render_template('login.html') # Assumes template is in 'auth' folder


@auth_bp.route('/logout')
@login_required # Protect this route
def logout():
    """Handles user logout."""
    # Now current_user is defined via the import
    username = current_user.username if current_user else "Unknown" # Safer access
    logout_user() # Flask-Login clears session
    logger.info(f"User '{username}' logged out.")
    flash('You have been logged out.', 'info')
    return redirect(url_for('main.index')) # Redirect to main index


@auth_bp.route('/register', methods=['GET', 'POST'])
def register():
    """Handles new user registration."""
    if request.method == 'POST':
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "").strip()
        confirm_password = request.form.get("confirm_password", "").strip()

        # --- CAPTCHA Verification ---
        captcha_response = request.form.get("g-recaptcha-response")
        recaptcha_private_key = current_app.config.get('RECAPTCHA_PRIVATE_KEY')

        if not recaptcha_private_key:
             logger.error("RECAPTCHA_PRIVATE_KEY is not configured. Skipping verification for registration.")
             # flash("Recaptcha not configured correctly.", "warning")
        elif not captcha_response or not verify_recaptcha(captcha_response):
            logger.warning(f"Registration attempt failed reCAPTCHA for user '{username}'.")
            flash("Invalid captcha. Please try again.", "danger")
            return redirect(url_for("auth.register"))

        # --- Input Validation ---
        errors = []
        if len(username) < 6:
            errors.append("Username must be at least 6 characters long.")
        if len(password) < 6 or not re.search(r'\d', password):
            errors.append("Password must be at least 6 characters long and contain at least one number.")
        if password != confirm_password:
            errors.append("Passwords do not match.")

        # If validation errors, flash all messages and re-render the form
        if errors:
            for error in errors:
                flash(error, "danger") # Use danger category
            # Pass submitted username back to template to repopulate field
            return render_template('register.html', username=username)

        # --- Database Interaction ---
        try:
            with get_db_session() as db_session:
                logger.debug(f"Checking if username '{username}' exists.")
                existing_user = db_session.query(User).filter(User.username.ilike(username)).first() # Case-insensitive check? Optional.
                # existing_user = db_session.query(User).filter_by(username=username).first() # Original case-sensitive

                if existing_user:
                    logger.warning(f"Registration attempt failed: Username '{username}' already exists.")
                    flash("Username already exists.", "danger")
                    return render_template('register.html', username=username)

                # Create and add new user
                logger.debug(f"Creating new user: {username}")
                new_user = User(username=username)
                # Use werkzeug to hash password
                new_user.password_hash = generate_password_hash(password)
                # If you added a set_password method to User model:
                # new_user.set_password(password)

                db_session.add(new_user)
                logger.info(f"User '{username}' added to session, awaiting commit.")
                # Commit happens automatically via context manager

            logger.info(f"User '{username}' registered successfully.")
            flash("Registration successful. Please log in.", "success")
            return redirect(url_for('auth.login')) # Redirect to login page

        except Exception as e:
            logger.exception("Unexpected error during user registration")
            flash("An error occurred during registration. Please try again.", "danger")
            # Redirect back to register form on error
            return redirect(url_for("auth.register"))

    # --- Handle GET Request ---
    return render_template('register.html') # Assumes template is in 'auth' folder