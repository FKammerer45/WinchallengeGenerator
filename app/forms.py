# app/forms.py
import re
from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, SubmitField,  EmailField
from wtforms.validators import DataRequired, Length, EqualTo, ValidationError, Regexp, Email
from app.models import User # Import User model for validation checks
from app import db # Import db for session access in validators

class RegistrationForm(FlaskForm):
    """Form for user registration."""
    username = StringField('Username',
                           validators=[DataRequired(message="Username is required."),
                                       Length(min=6, max=50, message="Username must be between 6 and 50 characters.")])
    # --- Use the imported EmailField ---
    email = EmailField('Email',
                       validators=[DataRequired(message="Email is required."),
                                   Email(message="Invalid email address."),
                                   Length(max=120)])
    # --- End Email Field ---
    password = PasswordField('Password',
                             validators=[DataRequired(message="Password is required."),
                                         Length(min=6, message="Password must be at least 6 characters long."),
                                         Regexp(r'^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d\S]{6,}$',
                                                message="Password must contain at least one letter and one number.")
                                        ])
    confirm_password = PasswordField('Confirm Password',
                                     validators=[DataRequired(message="Please confirm password."),
                                                 EqualTo('password', message='Passwords must match.')])
    submit = SubmitField('Register')

    # Custom validator to check if username already exists
    def validate_username(self, username):
        # Check only base username part if tag logic is still active
        base_username = username.data.split('#')[0].strip()
        # Query if any user starts with this base username + '#'
        user = db.session.query(User).filter(User.username.ilike(f"{base_username}#%")).first()
        if user:
             # A user with this base exists, tag generation will handle uniqueness
             # Or, if you want to prevent registering same base name:
             # raise ValidationError('That username base is already taken. Please choose a different one.')
             pass # Let tag generation handle uniqueness for now

    # --- New Validator for Email ---
    def validate_email(self, email):
        user = db.session.query(User).filter(User.email.ilike(email.data)).first()
        if user:
            raise ValidationError('That email address is already registered.')

class LoginForm(FlaskForm):
    """Form for user login."""
    # --- Updated Label ---
    username = StringField('Username#Tag or Email', # Changed label
                           validators=[DataRequired(message="Username#Tag or Email is required.")],
                           render_kw={"placeholder": "Enter Username#Tag or Email"})
    # --- End Update ---
    password = PasswordField('Password', validators=[DataRequired(message="Password is required.")])
    submit = SubmitField('Login')

class ForgotPasswordForm(FlaskForm):
    """Form for requesting a password reset email."""
    email = EmailField('Your Registered Email',
                       validators=[DataRequired(message="Email is required."),
                                   Email(message="Invalid email address.")])
    submit = SubmitField('Send Password Reset Email')


class ResetPasswordForm(FlaskForm):
    """Form for setting a new password after clicking reset link."""
    password = PasswordField('New Password',
                             validators=[DataRequired(message="New password is required."),
                                         Length(min=6, message="Password must be at least 6 characters long."),
                                         Regexp(r'^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d\S]{6,}$',
                                                message="Password must contain at least one letter and one number.")
                                        ])
    confirm_password = PasswordField('Confirm New Password',
                                     validators=[DataRequired(message="Please confirm new password."),
                                                 EqualTo('password', message='Passwords must match.')])
    submit = SubmitField('Reset Password')
    
class ChangePasswordForm(FlaskForm):
    """Form for changing user password."""
    current_password = PasswordField('Current Password', validators=[DataRequired()])
    new_password = PasswordField('New Password', 
                                 validators=[DataRequired(), 
                                             Length(min=6),
                                             Regexp(r'^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d\S]{6,}$', 
                                                    message="Password must be at least 6 chars with one letter and one number.")
                                            ])
    confirm_new_password = PasswordField('Confirm New Password', 
                                         validators=[DataRequired(), 
                                                     EqualTo('new_password', message='New passwords must match.')])
    submit = SubmitField('Change Password')

    # Optional: Add custom validator to check if current_password is correct
    # This requires access to the 'current_user' which isn't directly available
    # here. This check is better performed in the route after basic validation.
    
    # Optional: Add custom validator to ensure new != old
    def validate_new_password(self, new_password):
         # This check also needs current_user, better done in the route
         pass

class DeleteAccountForm(FlaskForm):
    """Form for confirming account deletion."""
    password = PasswordField('Confirm Password', validators=[DataRequired(message="Password confirmation is required.")])
    submit = SubmitField('Delete My Account Permanently')

    # Optional: Add validator to check password correctness
    # Needs current_user, better done in the route.

