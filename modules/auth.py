# modules/auth.py
import re
from flask import Blueprint, render_template, request, redirect, url_for, flash
from flask_login import login_user, logout_user, login_required
from modules.recaptcha import verify_recaptcha
from modules.models import SessionLocal, User  # Ensure your User model is defined in models.py
from werkzeug.security import generate_password_hash
import requests
from flask import current_app
# Create the authentication blueprint


auth_bp = Blueprint('auth', __name__, template_folder='templates/auth')

@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '').strip()
        
        # --- CAPTCHA Verification for Login ---
        captcha_response = request.form.get("g-recaptcha-response")
        if not captcha_response or not verify_recaptcha(captcha_response):
            flash("Invalid captcha. Please try again.", "danger")
            return redirect(url_for('auth.login'))
        # ---------------------------------------

        session = SessionLocal()
        user = session.query(User).filter_by(username=username).first()
        session.close()
        
        if user and user.check_password(password):
            login_user(user)
            flash('Logged in successfully!', 'success')
            return redirect(url_for('index'))
        else:
            flash('Invalid username or password.', 'danger')
    return render_template('auth/login.html')


@auth_bp.route('/logout')
@login_required
def logout():
    logout_user()
    flash('You have been logged out.', 'info')
    return redirect(url_for('index'))

@auth_bp.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "").strip()
        confirm_password = request.form.get('confirm_password', '').strip()

        # --- CAPTCHA Verification for Registration ---
        captcha_response = request.form.get("g-recaptcha-response")
        if not captcha_response or not verify_recaptcha(captcha_response):
            flash("Invalid captcha. Please try again.", "danger")
            return redirect(url_for("auth.register"))
        # ----------------------------------------------

        # Backend validation for username
        if len(username) < 6:
            flash("Username must be at least 6 characters long.", "error")
            return redirect(url_for("auth.register"))
        
        # Backend validation for password: at least 6 characters and at least one digit
        if len(password) < 6 or not re.search(r'\d', password):
            flash("Password must be at least 6 characters long and contain at least one number.", "error")
            return redirect(url_for("auth.register"))
        if password != confirm_password:
            flash("Passwords do not match.", "danger")
            return render_template('auth/register.html')
        
        session = SessionLocal()
        if session.query(User).filter_by(username=username).first():
            session.close()
            flash("Username already exists.", "danger")
            return render_template('auth/register.html')
        new_user = User(username=username, password_hash=generate_password_hash(password))
        session.add(new_user)
        session.commit()
        session.close()
        flash("Registration successful. Please log in.", "success")
        return redirect(url_for('auth.login'))
    return render_template('auth/register.html')

