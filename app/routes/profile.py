# app/routes/profile.py
import logging
from flask import (Blueprint, render_template, redirect, url_for, flash,
                   request, current_app, jsonify)
from flask_login import login_required, current_user

# Import db instance and User model
from app import db, csrf
from app.models import User
from app.forms import ChangeEmailForm
from app.utils.email import send_email, generate_email_change_token

logger = logging.getLogger(__name__)

profile_bp = Blueprint('profile', __name__)

@profile_bp.route("/profile", methods=['GET', 'POST']) # Allow POST for the form
@login_required
def profile_view():
    """Renders the user profile page and handles email change form."""
    change_email_form = ChangeEmailForm() # Instantiate the form

    if change_email_form.validate_on_submit():
        # This block handles the POST request from the email change form
        new_email = change_email_form.new_email.data.lower().strip()
        password = change_email_form.password.data

        # Verify current password
        if not current_user.check_password(password):
            flash("Incorrect password. Email change request failed.", "danger")
            # Re-render the profile page with the form and error
            return render_template("profile/profile.html", change_email_form=change_email_form)

        # Password is correct, proceed to send confirmation email to NEW address
        try:
            token = generate_email_change_token(current_user.id, new_email)
            confirm_url = url_for('auth.confirm_email_change', token=token, _external=True) # Point to new auth route
            email_context = {'confirm_url': confirm_url, 'username': current_user.username, 'new_email': new_email}

            send_email(
                to=new_email, # Send to the NEW email address
                subject="Confirm Your New Email Address",
                template_context=email_context,
                template_prefix="auth/email/change_email_confirm" # Path to new email templates
            )
            logger.info(f"Email change confirmation sent to {new_email} for user '{current_user.username}'.")
            flash(f"A confirmation link has been sent to {new_email}. Please click the link to finalize the change.", 'info')
            # Redirect back to profile page after initiating the request
            return redirect(url_for('profile.profile_view'))

        except Exception as e:
            logger.exception(f"Error sending email change confirmation for user '{current_user.username}'")
            flash('An error occurred while requesting the email change. Please try again later.', 'danger')
            # Re-render profile page with form
            return render_template("profile/profile.html", change_email_form=change_email_form)

    # Handle GET request (or failed POST validation)
    # Pass the form instance to the template for rendering
    return render_template("profile/profile.html", change_email_form=change_email_form)


@profile_bp.route("/profile/regenerate_key", methods=["POST"])
@login_required
@csrf.exempt # If using CSRF protection globally, exempt or handle token
def regenerate_overlay_key():
    """Handles the API key regeneration request."""
    logger.info(f"User {current_user.username} attempting to regenerate overlay key.")
    try:
        # Refetch user within the session for update
        user = db.session.get(User, current_user.id)
        if not user:
             flash("User not found.", "error")
             logger.error(f"User {current_user.id} not found during key regeneration.")
             return redirect(url_for('profile.profile_view')) # Use correct endpoint name

        old_key = user.overlay_api_key
        new_key = user.generate_overlay_key() # Generate and set the new key
        db.session.commit() # Save the change

        if old_key:
            flash(f"Overlay API Key regenerated successfully!", "success")
            logger.info(f"User {user.username} regenerated overlay key.")
        else:
            flash(f"Overlay API Key generated successfully!", "success")
            logger.info(f"User {user.username} generated initial overlay key.")
    except Exception as e:
        db.session.rollback()
        logger.exception(f"Error regenerating key for user {current_user.username}")
        flash("An error occurred while regenerating the key.", "danger")

    return redirect(url_for('profile.profile_view')) # Redirect back to profile

@profile_bp.route("/api/profile/get_key", methods=["GET"])
@login_required
# Add CSRF protection if needed for GET APIs, or configure exemptions
# @csrf.exempt # Example exemption if using global CSRF
def get_overlay_key_api():
    """API endpoint to return the current user's overlay API key."""
    logger.debug(f"API request for overlay key by user {current_user.id}")
    # Refetch user to ensure data is current (optional but safe)
    user = db.session.get(User, current_user.id)
    if not user:
        # This shouldn't happen for a logged-in user
        return jsonify({"error": "User not found"}), 404

    if not user.overlay_api_key:
        logger.info(f"User {user.username} requested overlay key, but none generated.")
        # Return a specific status or null key
        return jsonify({"api_key": None, "message": "No key generated yet."}), 200 # OK, but no key

    logger.info(f"Returning overlay key for user {user.username}.")
    return jsonify({"api_key": user.overlay_api_key}), 200