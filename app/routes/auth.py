# app/routes/auth.py
import logging
import datetime
from flask import (Blueprint, render_template, request, redirect,
                   url_for, flash, current_app, jsonify) 
from flask_login import (login_user, logout_user, login_required,
                         current_user, fresh_login_required) 
from werkzeug.security import generate_password_hash 
import random
from sqlalchemy.exc import IntegrityError
from sqlalchemy import or_
from werkzeug.exceptions import TooManyRequests
# Import db instance and models
from app import db, limiter
# Import SavedGameTab and SavedPenaltyTab models
from app.models import User, SavedGameTab, SavedPenaltyTab 

# Import utilities
from app.modules.recaptcha import verify_recaptcha 

from app.forms import (LoginForm, RegistrationForm, ChangePasswordForm, DeleteAccountForm,
                       ForgotPasswordForm, ResetPasswordForm)

from app.modules.default_definitions import DEFAULT_GAME_TAB_DEFINITIONS, DEFAULT_PENALTY_TAB_DEFINITIONS
import json 

# --- Import Email Utilities ---
from app.utils.email import (send_email, generate_confirmation_token, confirm_token,
                             generate_password_reset_token, confirm_password_reset_token,
                             generate_email_change_token, confirm_email_change_token)
from app.utils.auth_helpers import is_safe_url # Import the helper

logger = logging.getLogger(__name__)

auth = Blueprint('auth', __name__, template_folder='../templates/auth')


@auth.route('/login', methods=['GET', 'POST'])
def login():
    """Handles user login via Username#Tag or Email, checks confirmation."""
    if current_user.is_authenticated:
        return redirect(url_for('main.index'))

    form = LoginForm()
    recaptcha_enabled = current_app.config.get('RECAPTCHA_ENABLED', True)
    recaptcha_public_key = current_app.config.get('RECAPTCHA_PUBLIC_KEY')

    if form.validate_on_submit():
        login_identifier = form.username.data
        password = form.password.data

        # --- CAPTCHA Verification ---
        captcha_response = request.form.get("g-recaptcha-response")
        captcha_ok = True
        if recaptcha_enabled:
            recaptcha_private_key = current_app.config.get('RECAPTCHA_PRIVATE_KEY')
            if not recaptcha_private_key:
                logger.error("RECAPTCHA_ENABLED is True but RECAPTCHA_PRIVATE_KEY is not configured.")
                flash("Login system configuration error.", "danger")
                captcha_ok = False
            elif not captcha_response or not verify_recaptcha(captcha_response):
                logger.warning("Login attempt failed reCAPTCHA for identifier '%s'.", login_identifier)
                flash("Invalid captcha. Please try again.", "danger")
                captcha_ok = False

        if captcha_ok:
            # --- Find User by Username#Tag OR Email ---
            user = None
            try:
                user = db.session.query(User).filter(
                    or_(
                        User.username == login_identifier,
                        User.email.ilike(login_identifier)
                    )
                ).first()

                if user and user.check_password(password):
                    # --- Check if Email is Confirmed ---
                    if not user.confirmed:
                        # --- FIX: Log in the user *before* redirecting to unconfirmed ---
                        # This establishes the session so /unconfirmed knows who the user is.
                        login_user(user)
                        # --- END FIX ---
                        flash('Your account is not confirmed. Please check your email for the confirmation link or resend it.', 'warning')
                        return redirect(url_for('auth.unconfirmed')) # Redirect to unconfirmed page
                    # --- End Confirmation Check ---

                    # --- Login Successful ---
                    login_user(user)
                    logger.info("User '%s' logged in successfully.", user.username)
                    flash('Logged in successfully!', 'success')
                    next_page = request.args.get('next')
                    if next_page and is_safe_url(next_page):
                        return redirect(next_page)
                    return redirect(url_for('main.index'))
                else:
                    logger.warning("Invalid login attempt for identifier '%s'.", login_identifier)
                    flash('Invalid credentials. Please check your Username#Tag/Email and password.', 'danger')

            except Exception as e:
                db.session.rollback()
                logger.exception("Error during login DB interaction")
                flash("An error occurred during login. Please try again.", "danger")

    # Handle GET or failed validation/login attempt
    prefilled_username = request.args.get('registered_username')
    return render_template('auth/login.html',
                           form=form,
                           recaptcha_enabled=recaptcha_enabled,
                           recaptcha_public_key=recaptcha_public_key,
                           prefilled_username=prefilled_username)

@auth.route('/logout')
@login_required 
def logout():
    """Handles user logout."""
    username = current_user.username if current_user.is_authenticated else "Unknown"
    logout_user()
    logger.info("User '%s' logged out.", username)
    flash('You have been logged out.', 'info')
    return redirect(url_for('main.index'))


@auth.route('/register', methods=['GET', 'POST'])
def register():
    """Handles registration, creates unconfirmed user, sends confirmation email,
    and assigns default game and penalty tabs.""" # MODIFIED: Updated docstring
    if current_user.is_authenticated:
        return redirect(url_for('main.index'))

    form = RegistrationForm()
    recaptcha_enabled = current_app.config.get('RECAPTCHA_ENABLED', True)
    recaptcha_public_key = current_app.config.get('RECAPTCHA_PUBLIC_KEY')

    if form.validate_on_submit():
        base_username = form.username.data.strip()
        email = form.email.data.lower().strip() # Store email lowercase
        password = form.password.data

        # --- CAPTCHA Verification ---
        captcha_response = request.form.get("g-recaptcha-response")
        captcha_ok = True
        if recaptcha_enabled:
            # ... (captcha verification logic as before) ...
            recaptcha_private_key = current_app.config.get('RECAPTCHA_PRIVATE_KEY')
            if not recaptcha_private_key:
                logger.error("RECAPTCHA_ENABLED is True but RECAPTCHA_PRIVATE_KEY is not configured.")
                flash("Registration system configuration error.", "danger")
                captcha_ok = False
            elif not captcha_response or not verify_recaptcha(captcha_response):
                logger.warning("Registration attempt failed reCAPTCHA for base user '%s'.", base_username)
                flash("Invalid captcha. Please try again.", "danger")
                captcha_ok = False


        if captcha_ok:
            # --- User Creation with #XXXX Tag ---
            try:
                full_username = None
                attempts = 0
                max_attempts = 100
                while attempts < max_attempts:
                    tag = f"{random.randint(1, 9999):04d}"
                    potential_username = f"{base_username}#{tag}"
                    existing_user = db.session.query(User).filter(User.username == potential_username).first()
                    if not existing_user:
                        full_username = potential_username
                        break
                    attempts += 1

                if full_username is None:
                    flash("Could not generate a unique user tag. Please try a different username.", "danger")
                else:
                    # --- Create User (Unconfirmed) ---
                    new_user = User(
                        username=full_username,
                        email=email,
                        confirmed=False # Start as unconfirmed
                    )
                    new_user.set_password(password)
                    db.session.add(new_user)
                    db.session.commit() # Commit to save the user and get new_user.id

                    # --- MODIFICATION: Assign Default Game and Penalty Tabs ---
                    try:
                        # Assign Default Game Tab (e.g., "All Games")
                        default_game_tab_key = "default-all-games" # Key from default_definitions.py
                        if default_game_tab_key in DEFAULT_GAME_TAB_DEFINITIONS:
                            game_tab_def = DEFAULT_GAME_TAB_DEFINITIONS[default_game_tab_key]
                            # Transform entries to the new structure if needed
                            transformed_game_entries = []
                            for entry in game_tab_def.get("entries", []):
                                transformed_game_entries.append({
                                    "id": entry.get("id") or f"local-g-{random.randint(10000, 99999)}", # Ensure ID
                                    "game": entry.get("Spiel"),
                                    "gameMode": entry.get("Spielmodus"),
                                    "difficulty": str(entry.get("Schwierigkeit", "1.0")),
                                    "numberOfPlayers": entry.get("Spieleranzahl", 1),
                                    "weight": entry.get("weight", 1.0)
                                })
                            
                            default_game_tab = SavedGameTab(
                                user_id=new_user.id,
                                client_tab_id=game_tab_def.get("client_tab_id", default_game_tab_key), # Use defined client_tab_id
                                tab_name=game_tab_def.get("name", "All Games"),
                                entries_json=json.dumps(transformed_game_entries) # Serialize transformed entries
                            )
                            db.session.add(default_game_tab)
                            logger.info("Assigned default game tab '%s' to user '%s'.", default_game_tab.tab_name, new_user.username)

                        # Assign Default Penalty Tab (e.g., "All Penalties")
                        default_penalty_tab_key = "default-all-penalties" # Key from default_definitions.py
                        if default_penalty_tab_key in DEFAULT_PENALTY_TAB_DEFINITIONS:
                            penalty_tab_def = DEFAULT_PENALTY_TAB_DEFINITIONS[default_penalty_tab_key]
                            # Entries are already in the correct format (name, probability, description, id)
                            default_penalty_tab = SavedPenaltyTab(
                                user_id=new_user.id,
                                client_tab_id=penalty_tab_def.get("client_tab_id", default_penalty_tab_key), # Use defined client_tab_id
                                tab_name=penalty_tab_def.get("name", "All Penalties"),
                                penalties_json=json.dumps(penalty_tab_def.get("penalties", [])) # Serialize penalties
                            )
                            db.session.add(default_penalty_tab)
                            logger.info("Assigned default penalty tab '%s' to user '%s'.", default_penalty_tab.tab_name, new_user.username)
                        
                        db.session.commit() # Commit the new default tabs
                    except Exception as e_tabs:
                        db.session.rollback()
                        logger.error("Error assigning default tabs to user %s: %s", new_user.username, e_tabs, exc_info=True)
                        # Decide if this should prevent registration or just log an error
                        flash("Could not set up default configurations for your account. Please contact support if issues persist.", "warning")
                    # --- END MODIFICATION ---


                    # --- Generate Token & Send Email ---
                    token = generate_confirmation_token(new_user.email)
                    confirm_url = url_for('auth.confirm_email', token=token, _external=True)
                    email_context = {'confirm_url': confirm_url, 'username': full_username}

                    send_email(
                        to=new_user.email,
                        subject="Confirm Your Email Address",
                        template_context=email_context,
                        template_prefix="auth/email/confirm" # Path to email templates
                    )
                    # --- End Email Sending ---

                    logger.info("User '%s' registered. Confirmation email sent to '%s'.", full_username, email)
                    flash('Registration successful! A confirmation email has been sent to your address. Please check your inbox (and spam folder).', 'success')
                    # Redirect to login or a dedicated 'check your email' page
                    return redirect(url_for('auth.login', registered_username=full_username)) # MODIFIED: Pass username to prefill login

            except IntegrityError as e:
                 db.session.rollback()
                 # Check if it was the username or email constraint
                 if 'users.username' in str(e.orig):
                      form.username.errors.append("Username base already exists, try another.")
                 elif 'users.email' in str(e.orig):
                      form.email.errors.append("That email address is already registered.")
                 else:
                      logger.exception("IntegrityError during user creation for base %s", base_username)
                      flash("Username or email already exists, or another database error occurred.", "danger")
            except Exception as e:
                db.session.rollback()
                logger.exception("Unexpected error during user creation for base %s", base_username)
                flash("An error occurred during registration. Please try again.", "danger")

    # Handle GET or failed validation
    return render_template('auth/register.html',
                           form=form,
                           recaptcha_enabled=recaptcha_enabled,
                           recaptcha_public_key=recaptcha_public_key)

@auth.route('/confirm/<token>')
def confirm_email(token):
    """Handles email confirmation link."""
    try:
        expiration = current_app.config.get('EMAIL_CONFIRMATION_EXPIRATION', 3600)
        email = confirm_token(token, expiration=expiration)
    except Exception as e: # Catch potential itsdangerous errors explicitly if needed
        logger.warning("Email confirmation link error: %s", e)
        flash('The confirmation link is invalid or has expired.', 'danger')
        return redirect(url_for('auth.login')) # Or main.index

    if email is False:
        flash('The confirmation link is invalid or has expired.', 'danger')
        return redirect(url_for('auth.login'))

    user = db.session.query(User).filter(User.email.ilike(email)).first_or_404()

    if user.confirmed:
        flash('Account already confirmed. Please login.', 'info')
    else:
        user.confirmed = True
        user.confirmed_on = datetime.datetime.now(datetime.timezone.utc)
        db.session.add(user)
        db.session.commit()
        flash('You have confirmed your account. Thanks! You can now log in.', 'success')
        logger.info("User '%s' confirmed email '%s'.", user.username, user.email)

    return redirect(url_for('auth.login'))


# --- New Route: Unconfirmed User Page ---
@auth.route('/unconfirmed')
def unconfirmed():
    # Check if a user is actually logged in (even if unconfirmed)
    if not current_user.is_authenticated:
        # If somehow accessed anonymously, redirect to login
        flash('Please log in first.', 'info')
        return redirect(url_for('auth.login'))

    # If the logged-in user IS confirmed, redirect them away
    if current_user.confirmed:
        return redirect(url_for('main.index'))

    # If logged in but not confirmed, render the page
    return render_template('auth/unconfirmed.html')


# --- New Route: Resend Confirmation Email ---
@auth.route('/resend')
@login_required
@limiter.limit("1 per 5 minutes", key_func=lambda: current_user.get_id())
def resend_confirmation():
    """Resends the confirmation email to the logged-in user (Rate Limited)."""
    if current_user.confirmed:
        flash('Your account is already confirmed.', 'info')
        return redirect(url_for('main.index'))

    try:
        token = generate_confirmation_token(current_user.email)
        confirm_url = url_for('auth.confirm_email', token=token, _external=True)
        email_context = {'confirm_url': confirm_url, 'username': current_user.username}
        send_email(
            to=current_user.email,
            subject="Confirm Your Email Address (Resend)",
            template_context=email_context,
            template_prefix="auth/email/confirm"
        )
        flash('A new confirmation email has been sent.', 'success')
        logger.info("Resent confirmation email for user '%s' to '%s'.", current_user.username, current_user.email)
    except Exception as e:
        logger.exception("Error resending confirmation email for user '%s'", current_user.username)
        flash('An error occurred while resending the confirmation email. Please try again later.', 'danger')

    return redirect(url_for('auth.unconfirmed'))

@auth.app_errorhandler(TooManyRequests) # Use blueprint-specific handler
def handle_rate_limit_exceeded(e):
    """Handles the 429 error specifically for rate limits."""
    # Check if the rate limit was triggered on the resend endpoint
    if request.endpoint == 'auth.resend_confirmation':
        # Flash a message (optional, as the template will show a persistent one)
        # flash("Too many resend requests. Please wait 5 minutes.", "warning")
        logger.warning("Rate limit exceeded for resend confirmation by user %s", current_user.get_id())
        # Re-render the unconfirmed page with an error flag
        return render_template('auth/unconfirmed.html', rate_limit_error=True), 429
    else:
        # For other rate-limited endpoints, you might want a generic response
        # or let the default Flask-Limiter behavior handle it (which might be just the 429 response)
        # Returning the error description is a simple default
        return f"Rate limit exceeded: {e.description}", 429
    
@auth.route('/change_password', methods=['GET', 'POST'])
@login_required 
def change_password():
    if current_user.is_twitch_user:
        flash("Password cannot be changed for accounts logged in via Twitch.", "warning")
        return redirect(url_for('profile.profile_view'))
    """Handles password change using Flask-WTF Form."""
    form = ChangePasswordForm()
    if form.validate_on_submit():
        current_password = form.current_password.data
        new_password = form.new_password.data
        errors = False
        if not current_user.check_password(current_password):
            flash("Your current password was incorrect.", "danger")
            errors = True
        if current_user.check_password(new_password):
            flash("New password cannot be the same as the old password.", "warning")
            errors = True
        if not errors:
            try:
                user_to_update = db.session.get(User, current_user.id)
                if not user_to_update:
                    flash("Could not find your user account.", "error")
                    logger.error("User ID %s not found during password change.", current_user.id)
                    return redirect(url_for('main.index'))
                user_to_update.set_password(new_password)
                db.session.commit()
                logger.info("Password updated successfully for user '%s'.", current_user.username)
                flash("Your password has been updated successfully.", "success")
                logout_user()
                flash("Please log in again with your new password.", "info")
                return redirect(url_for('auth.login'))
            except Exception as e:
                db.session.rollback()
                logger.exception("Error updating password for user '%s'", current_user.username)
                flash("An error occurred while updating your password. Please try again.", "danger")
    return render_template('auth/change_password.html', form=form) # Corrected template name



@auth.route('/delete_account', methods=['POST'])
@login_required
def delete_account():
    """Handles the actual account deletion after confirmation."""
    form = DeleteAccountForm()

    if form.validate_on_submit():
        password = form.password.data

        # --- MODIFIED: Check password only if NOT a Twitch user ---
        password_ok = False
        if current_user.is_twitch_user:
            # For Twitch users, we bypass the password check after they click confirm.
            # Alternatively, you could add a different confirmation step here.
            password_ok = True
            logger.info("Bypassing password check for Twitch user '%s' during account deletion.", current_user.username)
        elif current_user.check_password(password):
            password_ok = True
        # --- END MODIFICATION ---

        if not password_ok:
            logger.warning("User %s: Delete account attempt failed - incorrect password provided.", current_user.username)
            flash("Incorrect password provided. Account not deleted.", "danger")
            return redirect(url_for('auth.confirm_delete_account'))

        # --- Perform Deletion ---
        user_id_to_delete = current_user.id
        username_to_delete = current_user.username
        logger.warning("Initiating account deletion for user '%s' (ID: %s).", username_to_delete, user_id_to_delete)

        try:
            # --- Explicitly delete related data BEFORE deleting the user ---
            # Although cascades might be set up, being explicit can be safer
            # and ensures data is removed even if cascade settings change.

            logger.info("Deleting related data for user %s...", user_id_to_delete)

            # Delete saved tabs (cascade should handle this via backref, but explicit is okay)
            # SavedGameTab.query.filter_by(user_id=user_id_to_delete).delete()
            # SavedPenaltyTab.query.filter_by(user_id=user_id_to_delete).delete()

            # Delete challenge authorizations where this user is authorized (not creator)
            # This requires accessing the association table or the backref
            user_to_delete_obj = db.session.get(User, user_id_to_delete)
            if user_to_delete_obj:
                 # Clear the relationship from the user side before deleting the user
                 # This might be handled by cascade on the other side too
                 user_to_delete_obj.authorized_challenges = []
                 user_to_delete_obj.joined_groups = [] # Clear group memberships

                 # Challenges created by the user *should* be deleted by the cascade
                 # on the User.created_challenges relationship if set correctly.

                 # Commit changes to relationships before deleting user
                 db.session.commit()

                 logger.info(f"Deleting user record for {username_to_delete}...")
                 db.session.delete(user_to_delete_obj)
                 db.session.commit()

                 logout_user() # Log the user out AFTER successful deletion
                 logger.info("User '%s' (ID: %s) successfully deleted and logged out.", username_to_delete, user_id_to_delete)
                 flash("Your account has been permanently deleted.", "success")
                 return redirect(url_for('main.index'))
            else:
                 # Should not happen if user is logged in
                 logger.error("Cannot delete: User ID %s not found in DB for final deletion step.", user_id_to_delete)
                 flash("User not found during deletion process.", "error")
                 logout_user() # Log out anyway
                 return redirect(url_for('main.index'))


        except Exception as e:
            db.session.rollback()
            logger.exception("Error deleting account or related data for user '%s'", username_to_delete)
            flash("An error occurred while deleting the account. Please try again later.", "danger")
            return redirect(url_for('auth.confirm_delete_account'))
    else:
        # Handle form validation failure (e.g., CSRF missing, password field empty)
        logger.warning("User %s: Delete account POST failed WTForms validation.", current_user.username)
        # Errors should be flashed by WTForms automatically if using render_field
        # Add a generic flash if needed
        # flash("Invalid submission. Please check the form.", "warning")
        return redirect(url_for('auth.confirm_delete_account'))


@auth.route('/confirm_delete', methods=['GET'])
@login_required
def confirm_delete_account():
    """Displays the confirmation page before account deletion."""
    form = DeleteAccountForm()
    requires_password = not current_user.is_twitch_user
    return render_template('auth/confirm_delete.html', form=form, requires_password=requires_password)


@auth.route('/forgot-password', methods=['GET', 'POST'])
def forgot_password():
    """Handles request to send a password reset link."""
    if current_user.is_authenticated:
        return redirect(url_for('main.index')) # Don't allow logged-in users here

    form = ForgotPasswordForm()
    if form.validate_on_submit():
        email = form.email.data.lower().strip()
        user = db.session.query(User).filter(User.email.ilike(email)).first()

        if user:
            try:
                token = generate_password_reset_token(user.email)
                reset_url = url_for('auth.reset_password', token=token, _external=True)
                email_context = {'reset_url': reset_url, 'username': user.username}

                send_email(
                    to=user.email,
                    subject="Password Reset Request",
                    template_context=email_context,
                    template_prefix="auth/email/reset_password" # Path to reset email templates
                )
                logger.info("Password reset email sent to %s for user '%s'.", user.email, user.username)
                flash('A password reset link has been sent to your email address. Please check your inbox.', 'info')
                return redirect(url_for('auth.login'))
            except Exception as e:
                 logger.exception("Error sending password reset email for user '%s'", user.username)
                 flash('An error occurred while sending the password reset email. Please try again later.', 'danger')
                 # Still redirect to login to avoid resubmission loop
                 return redirect(url_for('auth.login'))
        else:
            # Don't reveal if email exists or not for security
            flash('If an account with that email exists, a password reset link has been sent.', 'info')
            return redirect(url_for('auth.login'))

    return render_template('auth/forgot_password.html', form=form)


@auth.route('/confirm-email-change/<token>')
@login_required # User should be logged in to confirm an email change initiated by them
def confirm_email_change(token):
    """Handles the confirmation link for an email address change."""
    try:
        expiration = current_app.config.get('EMAIL_CHANGE_EXPIRATION', 1800)
        # Confirm the token using the specific email change function
        token_data = confirm_email_change_token(token, expiration=expiration)

        if token_data is False:
            flash('The email change link is invalid or has expired.', 'danger')
            return redirect(url_for('profile.profile_view')) # Redirect back to profile

        user_id = token_data.get('user_id')
        new_email = token_data.get('new_email')

        # Security check: Ensure the user ID in the token matches the logged-in user
        if not user_id or user_id != current_user.id:
            logger.warning("Email change token user ID mismatch. Token ID: %s, Current User ID: %s", user_id, current_user.id)
            flash('Invalid email change request.', 'danger')
            return redirect(url_for('profile.profile_view'))

        # Check if the new email is already taken by someone else (in case it happened after request)
        existing_user = db.session.query(User).filter(User.email.ilike(new_email)).first()
        if existing_user and existing_user.id != current_user.id:
            flash(f'The email address {new_email} has already been registered by another user.', 'danger') # No change needed here, already safe
            return redirect(url_for('profile.profile_view'))

        # All checks passed, update the user's email
        user_to_update = db.session.get(User, current_user.id) # Get user object again
        if user_to_update:
            old_email = user_to_update.email
            user_to_update.email = new_email
            # Also mark the new email as confirmed immediately
            user_to_update.confirmed = True
            user_to_update.confirmed_on = datetime.datetime.now(datetime.timezone.utc)
            db.session.commit()
            logger.info("User '%s' successfully changed email from '%s' to '%s'.", user_to_update.username, old_email, new_email)
            flash('Your email address has been successfully updated!', 'success')
        else:
            # Should not happen if user is logged in
            logger.error("Could not find user %s during email change confirmation.", current_user.id)
            flash('An error occurred updating your email.', 'danger')

        return redirect(url_for('profile.profile_view'))

    except Exception as e:
        logger.exception("Error during email change confirmation for token %s...", token[:10])
        flash('An error occurred during email confirmation.', 'danger')
        return redirect(url_for('profile.profile_view'))
    

@auth.route('/reset-password/<token>', methods=['GET', 'POST'])
def reset_password(token):
    """Handles the actual password reset using the token."""
    if current_user.is_authenticated:
        return redirect(url_for('main.index')) # Don't allow logged-in users here

    try:
        expiration = current_app.config.get('PASSWORD_RESET_EXPIRATION', 1800)
        email = confirm_password_reset_token(token, expiration=expiration)
    except Exception as e:
        logger.warning("Password reset link error: %s", e)
        flash('The password reset link is invalid or has expired.', 'danger')
        return redirect(url_for('auth.forgot_password'))

    if email is False:
        flash('The password reset link is invalid or has expired.', 'danger')
        return redirect(url_for('auth.forgot_password'))

    user = db.session.query(User).filter(User.email.ilike(email)).first_or_404()
    form = ResetPasswordForm()

    if form.validate_on_submit():
        try:
            # Check if new password is same as old one (optional but good practice)
            if user.check_password(form.password.data):
                 flash("New password cannot be the same as the old password.", "warning")
                 return render_template('auth/reset_password.html', form=form, token=token)

            user.set_password(form.password.data)
            # Optional: Mark email as confirmed again if resetting password? Usually not needed.
            # user.confirmed = True
            # user.confirmed_on = datetime.datetime.now(datetime.timezone.utc)
            db.session.add(user)
            db.session.commit()
            logger.info("Password successfully reset for user '%s'.", user.username)
            flash('Your password has been successfully reset. You can now log in.', 'success')
            return redirect(url_for('auth.login'))
        except Exception as e:
            db.session.rollback()
            logger.exception("Error resetting password for user '%s'", user.username)
            flash('An error occurred while resetting your password. Please try again.', 'danger')

    return render_template('auth/reset_password.html', form=form, token=token)
