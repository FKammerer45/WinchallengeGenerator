# app/routes/auth.py
import logging
import datetime
from flask import (Blueprint, render_template, request, redirect,
                   url_for, flash, current_app, jsonify) 
from flask_login import (login_user, logout_user, login_required,
                         current_user, fresh_login_required) 
from werkzeug.security import generate_password_hash # Keep generate_password_hash
import random
from sqlalchemy.exc import IntegrityError
from sqlalchemy import or_
# Import db instance and models
from app import db
from app.models import User, SavedGameTab, SavedPenaltyTab 

# Import utilities
from app.modules.recaptcha import verify_recaptcha 

from app.forms import (LoginForm, RegistrationForm, ChangePasswordForm, DeleteAccountForm,
                       ForgotPasswordForm, ResetPasswordForm)
# --- Import Email Utilities ---
from app.utils.email import (send_email, generate_confirmation_token, confirm_token,
                             generate_password_reset_token, confirm_password_reset_token) 


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
                logger.warning(f"Login attempt failed reCAPTCHA for identifier '{login_identifier}'.")
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
                    logger.info(f"User '{user.username}' logged in successfully.")
                    flash('Logged in successfully!', 'success')
                    next_page = request.args.get('next')
                    return redirect(next_page or url_for('main.index'))
                else:
                    logger.warning(f"Invalid login attempt for identifier '{login_identifier}'.")
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
    logger.info(f"User '{username}' logged out.")
    flash('You have been logged out.', 'info')
    return redirect(url_for('main.index')) 


@auth.route('/register', methods=['GET', 'POST'])
def register():
    """Handles registration, creates unconfirmed user, sends confirmation email."""
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
                logger.warning(f"Registration attempt failed reCAPTCHA for base user '{base_username}'.")
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
                    db.session.commit() # Commit to save the user

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

                    logger.info(f"User '{full_username}' registered. Confirmation email sent to '{email}'.")
                    flash('Registration successful! A confirmation email has been sent to your address. Please check your inbox (and spam folder).', 'success')
                    # Redirect to login or a dedicated 'check your email' page
                    return redirect(url_for('auth.login')) # Redirecting to login for now

            except IntegrityError as e:
                 db.session.rollback()
                 # Check if it was the username or email constraint
                 if 'users.username' in str(e.orig):
                      form.username.errors.append("Username base already exists, try another.")
                 elif 'users.email' in str(e.orig):
                      form.email.errors.append("That email address is already registered.")
                 else:
                      logger.exception(f"IntegrityError during user creation for base {base_username}")
                      flash("Username or email already exists, or another database error occurred.", "danger")
            except Exception as e:
                db.session.rollback()
                logger.exception(f"Unexpected error during user creation for base {base_username}")
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
        logger.warning(f"Email confirmation link error: {e}")
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
        logger.info(f"User '{user.username}' confirmed email '{user.email}'.")

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
def resend_confirmation():
    """Resends the confirmation email to the logged-in user."""
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
        logger.info(f"Resent confirmation email for user '{current_user.username}' to '{current_user.email}'.")
    except Exception as e:
        logger.exception(f"Error resending confirmation email for user '{current_user.username}'")
        flash('An error occurred while resending the confirmation email. Please try again later.', 'danger')

    # Redirect back to where they came from or a specific page
    return redirect(url_for('auth.unconfirmed')) # Or main.index

@auth.route('/change_password', methods=['GET', 'POST'])
@login_required 
def change_password():
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
                    logger.error(f"User ID {current_user.id} not found during password change.")
                    return redirect(url_for('main.index'))
                user_to_update.set_password(new_password)
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
    return render_template('auth/change_password.html', form=form) # Corrected template name



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
                logger.info(f"Password reset email sent to {user.email} for user '{user.username}'.")
                flash('A password reset link has been sent to your email address. Please check your inbox.', 'info')
                return redirect(url_for('auth.login'))
            except Exception as e:
                 logger.exception(f"Error sending password reset email for user '{user.username}'")
                 flash('An error occurred while sending the password reset email. Please try again later.', 'danger')
                 # Still redirect to login to avoid resubmission loop
                 return redirect(url_for('auth.login'))
        else:
            # Don't reveal if email exists or not for security
            flash('If an account with that email exists, a password reset link has been sent.', 'info')
            return redirect(url_for('auth.login'))

    return render_template('auth/forgot_password.html', form=form)


# --- New: Reset Password Route ---
@auth.route('/reset-password/<token>', methods=['GET', 'POST'])
def reset_password(token):
    """Handles the actual password reset using the token."""
    if current_user.is_authenticated:
        return redirect(url_for('main.index')) # Don't allow logged-in users here

    try:
        expiration = current_app.config.get('PASSWORD_RESET_EXPIRATION', 1800)
        email = confirm_password_reset_token(token, expiration=expiration)
    except Exception as e:
        logger.warning(f"Password reset link error: {e}")
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
            logger.info(f"Password successfully reset for user '{user.username}'.")
            flash('Your password has been successfully reset. You can now log in.', 'success')
            return redirect(url_for('auth.login'))
        except Exception as e:
            db.session.rollback()
            logger.exception(f"Error resetting password for user '{user.username}'")
            flash('An error occurred while resetting your password. Please try again.', 'danger')

    return render_template('auth/reset_password.html', form=form, token=token)
