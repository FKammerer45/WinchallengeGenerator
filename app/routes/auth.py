# app/routes/auth.py
import logging
from flask import (Blueprint, render_template, request, redirect,
                   url_for, flash, current_app, jsonify) 
from flask_login import (login_user, logout_user, login_required,
                         current_user, fresh_login_required) 
from werkzeug.security import generate_password_hash # Keep generate_password_hash
import random
from sqlalchemy.exc import IntegrityError
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
    """Handles user login using Flask-WTF Form, expecting Username#Tag."""
    form = LoginForm()
    recaptcha_enabled = current_app.config.get('RECAPTCHA_ENABLED', True)
    recaptcha_public_key = current_app.config.get('RECAPTCHA_PUBLIC_KEY')

    if form.validate_on_submit():
        # Get the full username string, expecting "Username#XXXX" format
        # Do NOT strip(), whitespace might be part of username before #
        username_with_tag = form.username.data
        password = form.password.data

        # --- CAPTCHA Verification (Unchanged) ---
        captcha_response = request.form.get("g-recaptcha-response")
        recaptcha_private_key = current_app.config.get('RECAPTCHA_PRIVATE_KEY')
        captcha_ok = True
        if recaptcha_enabled:
            if not recaptcha_private_key:
                logger.error("RECAPTCHA_ENABLED is True but RECAPTCHA_PRIVATE_KEY is not configured.")
                flash("Login system configuration error.", "danger")
                captcha_ok = False
            elif not captcha_response or not verify_recaptcha(captcha_response):
                logger.warning(f"Login attempt failed reCAPTCHA for user '{username_with_tag}'.")
                flash("Invalid captcha. Please try again.", "danger")
                captcha_ok = False

        if captcha_ok:
            # --- Modified Database User Lookup ---
            user = None
            try:
                logger.debug(f"Looking up user by exact username + tag: {username_with_tag}")
                # Perform an exact, case-sensitive match on the full username
                user = db.session.query(User).filter(User.username == username_with_tag).first()
                logger.debug(f"User found: {user is not None}")

                if user and user.check_password(password):
                    login_user(user)
                    logger.info(f"User '{username_with_tag}' logged in successfully.")
                    flash('Logged in successfully!', 'success')
                    next_page = request.args.get('next')
                    return redirect(next_page or url_for('main.index'))
                else:
                    logger.warning(f"Invalid login attempt for user '{username_with_tag}'.")
                    # Provide a more helpful message given the new format
                    flash('Invalid Username#Tag or password.', 'danger')
                    # Fall through

            except Exception as e:
                db.session.rollback()
                logger.exception("Error during login DB interaction")
                flash("An error occurred during login. Please try again.", "danger")
                # Fall through

    # Handle GET or failed validation
    return render_template('auth/login.html',
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
    """Handles new user registration using Flask-WTF Form and adds #XXXX tag."""
    form = RegistrationForm()
    recaptcha_enabled = current_app.config.get('RECAPTCHA_ENABLED', True)
    recaptcha_public_key = current_app.config.get('RECAPTCHA_PUBLIC_KEY')

    if form.validate_on_submit():
        base_username = form.username.data.strip() # Get the requested base username
        password = form.password.data

        # --- CAPTCHA Verification (Unchanged) ---
        captcha_response = request.form.get("g-recaptcha-response")
        recaptcha_private_key = current_app.config.get('RECAPTCHA_PRIVATE_KEY')
        captcha_ok = True
        if recaptcha_enabled:
            if not recaptcha_private_key:
                logger.error("RECAPTCHA_ENABLED is True but RECAPTCHA_PRIVATE_KEY is not configured.")
                flash("Registration system configuration error.", "danger")
                captcha_ok = False
            elif not captcha_response or not verify_recaptcha(captcha_response):
                logger.warning(f"Registration attempt failed reCAPTCHA for base user '{base_username}'.")
                flash("Invalid captcha. Please try again.", "danger")
                captcha_ok = False

        if captcha_ok:
            # --- Modified User Creation with #XXXX Tag ---
            try:
                full_username = None
                attempts = 0
                max_attempts = 100 # Prevent potential infinite loops

                while attempts < max_attempts:
                    # Generate random 4-digit tag (0001-9999)
                    tag = f"{random.randint(1, 9999):04d}"
                    potential_username = f"{base_username}#{tag}"

                    # Check if this full username already exists (case-sensitive check recommended)
                    existing_user = db.session.query(User).filter(User.username == potential_username).first()
                    if not existing_user:
                        full_username = potential_username
                        break # Found a unique tag
                    attempts += 1

                if full_username is None:
                    # Extremely unlikely, but handle case where no unique tag was found
                    logger.error(f"Could not find unique tag for base username '{base_username}' after {max_attempts} attempts.")
                    flash("Could not generate a unique user tag. Please try a different username or contact support.", "danger")
                    # Fall through to re-render form

                else:
                    logger.debug(f"Assigning full username: {full_username}")
                    new_user = User(username=full_username) # Use the full username with tag
                    new_user.set_password(password) # Use the set_password helper

                    db.session.add(new_user)
                    db.session.commit()

                    logger.info(f"User '{full_username}' registered successfully.")
                    # Inform the user of their full tag!
                    flash(f"Registration successful! Your username is {full_username}. Please log in.", "success")
                    return redirect(url_for('auth.login'))

            except IntegrityError: # Catch potential race conditions
                 db.session.rollback()
                 logger.exception(f"IntegrityError during user creation for base username {base_username}")
                 flash("Username already exists or another database error occurred. Please try again.", "danger")
                 # Fall through to re-render form
            except Exception as e:
                db.session.rollback()
                logger.exception(f"Unexpected error during user creation for base {base_username}")
                flash("An error occurred during registration. Please try again.", "danger")
                # Fall through to re-render form

    # Handle GET or failed validation
    return render_template('auth/register.html',
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

