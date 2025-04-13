# app/routes/auth.py
import logging
from flask import (Blueprint, render_template, request, redirect,
                   url_for, flash, current_app, jsonify) 
from flask_login import (login_user, logout_user, login_required,
                         current_user, fresh_login_required) 
from werkzeug.security import generate_password_hash # Keep generate_password_hash

# Import db instance and models
from app import db
from app.models import User, SavedGameTab, SavedPenaltyTab 

# Import utilities
from app.modules.recaptcha import verify_recaptcha 

# --- Import Forms ---
from app.forms import LoginForm, RegistrationForm, ChangePasswordForm, DeleteAccountForm

logger = logging.getLogger(__name__)

auth = Blueprint('auth', __name__, template_folder='../templates/auth') 


@auth.route('/login', methods=['GET', 'POST'])
def login():
    """Handles user login using Flask-WTF Form."""
    form = LoginForm()
    recaptcha_enabled = current_app.config.get('RECAPTCHA_ENABLED', True)
    recaptcha_public_key = current_app.config.get('RECAPTCHA_PUBLIC_KEY')

    # validate_on_submit() checks if it's POST and form is valid
    if form.validate_on_submit(): 
        username = form.username.data.strip()
        password = form.password.data # No need to strip password

        # --- CAPTCHA Verification ---
        captcha_response = request.form.get("g-recaptcha-response") # Still get directly
        recaptcha_private_key = current_app.config.get('RECAPTCHA_PRIVATE_KEY')
        
        captcha_ok = True # Assume OK if disabled
        if recaptcha_enabled:
            if not recaptcha_private_key:
                logger.error("RECAPTCHA_ENABLED is True but RECAPTCHA_PRIVATE_KEY is not configured.")
                flash("Login system configuration error.", "danger")
                captcha_ok = False
            elif not captcha_response or not verify_recaptcha(captcha_response):
                logger.warning(f"Login attempt failed reCAPTCHA for user '{username}'.")
                flash("Invalid captcha. Please try again.", "danger")
                captcha_ok = False
        
        if captcha_ok:
            # --- Database User Lookup & Password Check ---
            user = None
            try:
                logger.debug(f"Looking up user: {username}")
                # Use ilike for case-insensitive username comparison
                user = db.session.query(User).filter(User.username.ilike(username)).first()
                logger.debug(f"User found: {user is not None}")

                if user and user.check_password(password):
                    login_user(user) # Add remember=form.remember_me.data if using remember_me
                    logger.info(f"User '{username}' logged in successfully.")
                    flash('Logged in successfully!', 'success')
                    # Redirect to intended page or index
                    next_page = request.args.get('next')
                    return redirect(next_page or url_for('main.index')) 
                else:
                    logger.warning(f"Invalid login attempt for user '{username}'.")
                    flash('Invalid username or password.', 'danger')
                    # Let it fall through to render template below

            except Exception as e:
                db.session.rollback() 
                logger.exception("Error during login DB interaction")
                flash("An error occurred during login. Please try again.", "danger")
                # Let it fall through to render template below
        
        # If captcha failed or login failed or DB error occurred, re-render form
        # Fall through from checks above

    # --- Handle GET Request OR Failed POST Validation ---
    # Pass form and recaptcha keys to template
    return render_template('login.html', 
                           form=form, 
                           recaptcha_enabled=recaptcha_enabled, 
                           recaptcha_public_key=recaptcha_public_key) 


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
    """Handles new user registration using Flask-WTF Form."""
    form = RegistrationForm()
    recaptcha_enabled = current_app.config.get('RECAPTCHA_ENABLED', True)
    recaptcha_public_key = current_app.config.get('RECAPTCHA_PUBLIC_KEY')

    if form.validate_on_submit():
        username = form.username.data.strip()
        password = form.password.data

        # --- CAPTCHA Verification ---
        captcha_response = request.form.get("g-recaptcha-response")
        recaptcha_private_key = current_app.config.get('RECAPTCHA_PRIVATE_KEY')
        
        captcha_ok = True # Assume OK if disabled
        if recaptcha_enabled:
            if not recaptcha_private_key:
                logger.error("RECAPTCHA_ENABLED is True but RECAPTCHA_PRIVATE_KEY is not configured.")
                flash("Registration system configuration error.", "danger")
                captcha_ok = False
            elif not captcha_response or not verify_recaptcha(captcha_response):
                logger.warning(f"Registration attempt failed reCAPTCHA for user '{username}'.")
                flash("Invalid captcha. Please try again.", "danger")
                captcha_ok = False

        if captcha_ok:
            # --- Create User ---
            # Username uniqueness check is now handled by form.validate_username
            try:
                logger.debug(f"Creating new user: {username}")
                new_user = User(username=username)
                # Use helper method if available, otherwise hash directly
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
                # Let it fall through to render template below
    
    # --- Handle GET Request OR Failed POST Validation (including captcha failure) ---
    # WTForms validation errors are automatically available in form.errors
    return render_template('register.html', 
                           form=form, 
                           recaptcha_enabled=recaptcha_enabled, 
                           recaptcha_public_key=recaptcha_public_key)


@auth.route('/change_password', methods=['GET', 'POST'])
@login_required 
def change_password():
    """Handles password change using Flask-WTF Form."""
    form = ChangePasswordForm()
    if form.validate_on_submit():
        current_password = form.current_password.data
        new_password = form.new_password.data

        # --- Additional Validation (done in route as they need current_user) ---
        errors = False
        # 1. Check current password
        if not current_user.check_password(current_password):
            flash("Your current password was incorrect.", "danger")
            # Optionally add error to form field: form.current_password.errors.append("Incorrect password.")
            errors = True

        # 2. Check if new password is same as old
        if current_user.check_password(new_password):
            flash("New password cannot be the same as the old password.", "warning")
            # Optionally add error to form field: form.new_password.errors.append("Cannot reuse old password.")
            errors = True

        if not errors:
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
                # Let it fall through to render template below

    # --- Handle GET Request OR Failed POST Validation ---
    return render_template('change_password.html', form=form)


@auth.route('/delete_account', methods=['POST'])
@login_required
def delete_account():
    """Handles the actual account deletion after confirmation, using Flask-WTF Form."""
    # This route only handles POST from the confirm_delete page's form
    form = DeleteAccountForm() 

    # Use validate_on_submit() for POST validation and CSRF check
    if form.validate_on_submit(): 
        password = form.password.data

        # --- Re-authenticate ---
        if not current_user.check_password(password):
            logger.warning(f"User {current_user.username}: Delete account attempt failed - incorrect password.")
            flash("Incorrect password provided. Account not deleted.", "danger")
            # Redirect back to confirmation page, passing the form might show errors if added
            return redirect(url_for('auth.confirm_delete_account')) 

        # --- Perform Deletion ---
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
            # Redirect back to confirmation page on error
            return redirect(url_for('auth.confirm_delete_account')) 
    else:
        # If form validation fails (e.g., password missing, CSRF invalid)
        logger.warning(f"User {current_user.username}: Delete account POST failed validation.")
        # Flash messages are usually handled by WTForms rendering, but add a general one if needed
        flash("Invalid submission. Please try confirming again.", "warning")
        return redirect(url_for('auth.confirm_delete_account'))


@auth.route('/confirm_delete', methods=['GET'])
@login_required
def confirm_delete_account():
    """Displays the confirmation page before account deletion."""
    # Create the form instance to pass to the template for rendering
    form = DeleteAccountForm() 
    return render_template('confirm_delete.html', form=form)

