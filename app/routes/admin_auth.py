from flask import Blueprint, render_template, request, redirect, url_for, session, flash, current_app
from werkzeug.security import check_password_hash
from functools import wraps
from app import limiter # Import the limiter instance

admin_auth_bp = Blueprint('admin_auth', __name__, url_prefix='/admin')

# Decorator to protect admin routes
def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('admin_logged_in'):
            flash('Please log in to access the admin panel.', 'warning')
            return redirect(url_for('admin_auth.login', next=request.url))
        return f(*args, **kwargs)
    return decorated_function

@admin_auth_bp.route('/gotcha')
def troll_page():
    return render_template('admin/troll_page.html')

@admin_auth_bp.route('/login', methods=['GET', 'POST'])
@limiter.limit("5 per minute") # Apply rate limiting
def login():
    if session.get('admin_logged_in'):
        return redirect(url_for('admin.index')) # Redirect to Flask-Admin index if already logged in

    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')

        # --- Easter Egg Check ---
        if username == 'admin' and password == 'admin':
            # Optionally flash a message, or just redirect
            # flash('Trying the ol\' admin/admin, eh? Gotcha!', 'info') 
            return redirect(url_for('admin_auth.troll_page'))
        # --- End Easter Egg Check ---

        admin_username = current_app.config.get('ADMIN_USERNAME')
        admin_password_hash = current_app.config.get('ADMIN_PASSWORD_HASH')

        if not admin_username or not admin_password_hash:
            flash('Admin credentials not configured on the server.', 'danger')
            return render_template('admin/login.html')

        if username == admin_username and check_password_hash(admin_password_hash, password):
            session['admin_logged_in'] = True
            session.permanent = True # Or configure session lifetime
            flash('Admin login successful.', 'success')
            next_page = request.args.get('next')
            return redirect(next_page or url_for('admin.index')) # Redirect to Flask-Admin index
        else:
            flash('Invalid admin username or password.', 'danger')
    
    return render_template('admin/login.html')

@admin_auth_bp.route('/logout')
def logout():
    session.pop('admin_logged_in', None)
    flash('You have been logged out from the admin panel.', 'info')
    return redirect(url_for('admin_auth.login'))
