# app/routes/auth.py
import re
import logging
from flask import (Blueprint, render_template, request, redirect,
                   url_for, flash, current_app, jsonify) 
from flask_login import (login_user, logout_user, login_required,
                         current_user, fresh_login_required) 
from werkzeug.security import generate_password_hash, check_password_hash

# Import db instance and models
from app import db
from app.models import User, SavedGameTab, SavedPenaltyTab 

# Import utilities
from app.modules.recaptcha import verify_recaptcha 

logger = logging.getLogger(__name__)

auth = Blueprint('auth', __name__, template_folder='../templates/auth') 


@auth.route('/login', methods=['GET', 'POST'])
def login():
    """Handles user login."""
    # Get reCAPTCHA config values needed for both GET and POST (for rendering)
    recaptcha_enabled = current_app.config.get('RECAPTCHA_ENABLED', True)
    recaptcha_public_key = current_app.config.get('RECAPTCHA_PUBLIC_KEY')

    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '').strip()

        # --- CAPTCHA Verification ---
        captcha_response = request.form.get("g-recaptcha-response")
        recaptcha_private_key = current_app.config.get('RECAPTCHA_PRIVATE_KEY')
        
        if recaptcha_enabled:
            if not recaptcha_private_key:
                logger.error("RECAPTCHA_ENABLED is True but RECAPTCHA_PRIVATE_KEY is not configured.")
                flash("Login system configuration error. Please contact support.", "danger")
                # Pass keys needed to re-render template
                return render_template('login.html', 
                                       recaptcha_enabled=recaptcha_enabled, 
                                       recaptcha_public_key=recaptcha_public_key) 
            elif not captcha_response or not verify_recaptcha(captcha_response):
                logger.warning(f"Login attempt failed reCAPTCHA for user '{username}'.")
                flash("Invalid captcha. Please try again.", "danger")
                # Pass keys needed to re-render template
                return render_template('login.html', 
                                       recaptcha_enabled=recaptcha_enabled, 
                                       recaptcha_public_key=recaptcha_public_key) 
        else:
             logger.debug("reCAPTCHA verification skipped (RECAPTCHA_ENABLED is False).")


        # --- Database User Lookup & Password Check ---
        user = None
        try:
            logger.debug(f"Looking up user: {username}")
            user = db.session.query(User).filter(User.username.ilike(username)).first()
            logger.debug(f"User found: {user is not None}")

            if user and user.check_password(password):
                login_user(user) 
                logger.info(f"User '{username}' logged in successfully.")
                flash('Logged in successfully!', 'success')
                return redirect(url_for('main.index')) 
            else:
                logger.warning(f"Invalid login attempt for user '{username}'.")
                flash('Invalid username or password.', 'danger')
                # Fall through to render template below

        except Exception as e:
            db.session.rollback() 
            logger.exception("Error during login process")
            flash("An error occurred during login. Please try again.", "danger")
            # Fall through to render template below

        # If login failed or error occurred, render template again
        return render_template('login.html', 
                               recaptcha_enabled=recaptcha_enabled, 
                               recaptcha_public_key=recaptcha_public_key) 

    # --- Handle GET Request ---
    # Pass keys needed for initial render
    return render_template('login.html', 
                           recaptcha_enabled=recaptcha_enabled, 
                           recaptcha_public_key=recaptcha_public_key) 

# --- Other routes remain the same ---
@auth.route('/logout')
@login_required 
def logout():
    """Handles user logout."""
    username = current_user.username if current_user.is_authenticated else "Unknown" 
    logout_user() 
    logger.info(f"User '{username}' logged out.")
    flash('You have been logged out.', 'info')
    return redirect(url_for('main.index')) 


@auth.route('/register', methods=['GET', 'POST'])
def register():
    """Handles new user registration."""
    # Get reCAPTCHA config values needed for both GET and POST (for rendering)
    recaptcha_enabled = current_app.config.get('RECAPTCHA_ENABLED', True)
    recaptcha_public_key = current_app.config.get('RECAPTCHA_PUBLIC_KEY')

    if request.method == 'POST':
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "").strip()
        confirm_password = request.form.get("confirm_password", "").strip()

        # --- CAPTCHA Verification ---
        captcha_response = request.form.get("g-recaptcha-response")
        recaptcha_private_key = current_app.config.get('RECAPTCHA_PRIVATE_KEY')

        if recaptcha_enabled:
            if not recaptcha_private_key:
                logger.error("RECAPTCHA_ENABLED is True but RECAPTCHA_PRIVATE_KEY is not configured.")
                flash("Registration system configuration error. Please contact support.", "danger")
                return render_template('register.html', 
                                        username=username, 
                                        recaptcha_enabled=recaptcha_enabled, 
                                        recaptcha_public_key=recaptcha_public_key)
            elif not captcha_response or not verify_recaptcha(captcha_response):
                logger.warning(f"Registration attempt failed reCAPTCHA for user '{username}'.")
                flash("Invalid captcha. Please try again.", "danger")
                return render_template('register.html', 
                                        username=username, 
                                        recaptcha_enabled=recaptcha_enabled, 
                                        recaptcha_public_key=recaptcha_public_key)
        else:
            logger.debug("reCAPTCHA verification skipped (RECAPTCHA_ENABLED is False).")

        # --- Input Validation ---
        errors = []
        if len(username) < 6:
            errors.append("Username must be at least 6 characters long.")
        if len(password) < 6 or not re.search(r'\d', password):
            errors.append("Password must be at least 6 characters long and contain at least one number.")
        if password != confirm_password:
            errors.append("Passwords do not match.")

        # --- Database Check (Username uniqueness) ---
        if not errors: 
            try:
                existing_user = db.session.query(User).filter(User.username.ilike(username)).first()
                if existing_user:
                    errors.append("Username already exists.")
            except Exception as e:
                db.session.rollback()
                logger.exception("Error checking existing username during registration")
                flash("An error occurred during registration. Please try again.", "danger")
                return render_template('register.html', 
                                        username=username, 
                                        recaptcha_enabled=recaptcha_enabled, 
                                        recaptcha_public_key=recaptcha_public_key)

        # If validation errors, flash messages and re-render
        if errors:
            for error in errors:
                flash(error, "danger") 
            return render_template('register.html', 
                                    username=username, 
                                    recaptcha_enabled=recaptcha_enabled, 
                                    recaptcha_public_key=recaptcha_public_key) 

        # --- Create User (if no errors) ---
        try:
            logger.debug(f"Creating new user: {username}")
            new_user = User(username=username)
            if hasattr(new_user, 'set_password'):
                 new_user.set_password(password)
            else:
                 new_user.password_hash = generate_password_hash(password)

            db.session.add(new_user)
            db.session.commit() 
            
            logger.info(f"User '{username}' registered successfully.")
            flash("Registration successful. Please log in.", "success")
            return redirect(url_for('auth.login')) 

        except Exception as e:
            db.session.rollback() 
            logger.exception("Unexpected error during user creation")
            flash("An error occurred during registration. Please try again.", "danger")
            return render_template('register.html', 
                                    username=username, 
                                    recaptcha_enabled=recaptcha_enabled, 
                                    recaptcha_public_key=recaptcha_public_key)

    # --- Handle GET Request ---
    return render_template('register.html', 
                           recaptcha_enabled=recaptcha_enabled, 
                           recaptcha_public_key=recaptcha_public_key)


@auth.route('/change_password', methods=['GET', 'POST'])
@login_required 
def change_password():
    """Handles password change for the logged-in user."""
    if request.method == 'POST':
        current_password = request.form.get('current_password')
        new_password = request.form.get('new_password')
        confirm_new_password = request.form.get('confirm_new_password')

        # --- Validation ---
        errors = False
        if not current_user.check_password(current_password):
            flash("Your current password was incorrect.", "danger")
            errors = True
        if len(new_password) < 6 or not re.search(r'\d', new_password):
            flash("New password must be at least 6 characters and contain a number.", "danger")
            errors = True
        if new_password != confirm_new_password:
            flash("New passwords do not match.", "danger")
            errors = True
        if current_user.check_password(new_password):
            flash("New password cannot be the same as the old password.", "warning")
            errors = True

        if errors:
            return render_template('change_password.html') 

        # --- Update Password in DB ---
        try:
            user_to_update = db.session.get(User, current_user.id) 
            if not user_to_update:
                flash("Could not find your user account.", "error")
                logger.error(f"User ID {current_user.id} not found during password change.")
                return redirect(url_for('main.index'))

            if hasattr(user_to_update, 'set_password'):
                 user_to_update.set_password(new_password)
            else:
                 user_to_update.password_hash = generate_password_hash(new_password)
            
            db.session.commit() 
            
            logger.info(f"Password updated successfully for user '{current_user.username}'.")
            flash("Your password has been updated successfully.", "success")
            
            logout_user()
            flash("Please log in again with your new password.", "info")
            return redirect(url_for('auth.login'))

        except Exception as e:
            db.session.rollback() 
            logger.exception(f"Error updating password for user '{current_user.username}'")
            flash("An error occurred while updating your password. Please try again.", "danger")
            return render_template('change_password.html') 

    # --- Handle GET Request ---
    return render_template('change_password.html')


@auth.route('/delete_account', methods=['POST'])
@login_required
def delete_account():
    """Handles the actual account deletion after confirmation."""
    password = request.form.get('password')

    if not password:
        logger.warning(f"User {current_user.username}: Delete account POST failed - no password provided.")
        flash("Password confirmation is required to delete your account.", "danger")
        return redirect(url_for('auth.confirm_delete_account')) 

    if not current_user.check_password(password):
        logger.warning(f"User {current_user.username}: Delete account attempt failed - incorrect password.")
        flash("Incorrect password provided. Account not deleted.", "danger")
        return redirect(url_for('auth.confirm_delete_account')) 

    user_id_to_delete = current_user.id
    username_to_delete = current_user.username
    logger.warning(f"Initiating account deletion for user '{username_to_delete}' (ID: {user_id_to_delete}).")

    try:
        user = db.session.get(User, user_id_to_delete) 
        if not user:
            logger.error(f"Cannot delete: User ID {user_id_to_delete} not found in DB.")
            flash("User not found. Cannot delete account.", "error")
            logout_user() 
            return redirect(url_for('main.index'))

        logger.info(f"Deleting related data for user {user_id_to_delete}...")
        db.session.query(SavedGameTab).filter_by(user_id=user_id_to_delete).delete()
        db.session.query(SavedPenaltyTab).filter_by(user_id=user_id_to_delete).delete()
        # Add deletion for SharedChallenge creator/memberships if needed

        logger.info(f"Deleting user record for {username_to_delete}...")
        db.session.delete(user)
        db.session.commit() 

        logout_user()
        logger.info(f"User '{username_to_delete}' (ID: {user_id_to_delete}) successfully deleted and logged out.")

        flash("Your account has been permanently deleted.", "success")
        return redirect(url_for('main.index')) 

    except Exception as e:
        db.session.rollback() 
        logger.exception(f"Error deleting account for user '{username_to_delete}'")
        flash("An error occurred while deleting the account. Please try again later.", "danger")
        return redirect(url_for('auth.confirm_delete_account')) 


@auth.route('/confirm_delete', methods=['GET'])
@login_required
def confirm_delete_account():
    """Displays the confirmation page before account deletion."""
    return render_template('confirm_delete.html')
