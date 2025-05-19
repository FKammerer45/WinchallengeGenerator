from flask import session, redirect, url_for, request, flash
from flask_admin.contrib.sqla import ModelView
from flask_admin import AdminIndexView, expose
from flask_wtf import FlaskForm # Import FlaskForm
# Import your User model and db instance
from .models import User, SharedChallenge, ChallengeGroup, SavedGameTab, SavedPenaltyTab # Add other models as needed
from . import db

# Custom AdminIndexView to protect the main admin page
class AuthenticatedAdminIndexView(AdminIndexView):
    @expose('/')
    def index(self):
        if not session.get('admin_logged_in'):
            flash('Please log in to access the admin panel.', 'warning')
            return redirect(url_for('admin_auth.login', next=request.url))
        return super(AuthenticatedAdminIndexView, self).index()

    def is_accessible(self):
        return session.get('admin_logged_in')

    def inaccessible_callback(self, name, **kwargs):
        # redirect to login page if user doesn't have access
        flash('You do not have permission to access the admin panel. Please log in as an admin.', 'danger')
        return redirect(url_for('admin_auth.login', next=request.url))

# Custom ModelView to protect model management pages
class AuthenticatedModelView(ModelView):
    form_base_class = FlaskForm # Explicitly set FlaskForm as base

    def is_accessible(self):
        return session.get('admin_logged_in')

    def inaccessible_callback(self, name, **kwargs):
        flash('You do not have permission to access this part of the admin panel. Please log in as an admin.', 'danger')
        return redirect(url_for('admin_auth.login', next=request.url))

# Specific view for User model
class UserAdminView(AuthenticatedModelView):
    # Columns to display in the list view
    column_list = ('id', 'username', 'email', 'confirmed', 'pro_plan_active', 'pro_plan_expiration_date', 'is_admin', 'created_at')
    # Columns that can be searched
    column_searchable_list = ('username', 'email')
    # Columns that can be filtered
    column_filters = ('confirmed', 'pro_plan_active', 'is_admin', 'created_at')
    # Fields that can be edited in the form
    form_columns = ('username', 'email', 'confirmed', 'pro_plan_active', 'pro_plan_expiration_date', 'is_admin')
    # Make 'created_at' and 'last_seen' read-only in forms if they were included
    form_edit_rules = ('username', 'email', 'confirmed', 'pro_plan_active', 'pro_plan_expiration_date', 'is_admin')
    form_create_rules = ('username', 'email', 'password_hash', 'confirmed', 'pro_plan_active', 'pro_plan_expiration_date', 'is_admin') # Password hash should be set carefully or via a different mechanism for new users

    # To prevent editing of password_hash directly in the form (it should be set via user registration or a password reset flow)
    # For editing, we might want to exclude password_hash or make it read-only.
    # For creation, it's tricky with Flask-Admin. Usually, you'd handle user creation outside or with custom logic.
    # For now, let's make it so password_hash is not directly editable for existing users.
    # If you need to create users from admin, you'll need a custom form or override on_model_change.
    
    # Let's make password_hash not directly editable in the edit form
    # It's better to manage passwords through user self-service or specific admin actions.
    # form_excluded_columns = ['password_hash'] # This hides it from both create and edit
    
    # More granular control:
    # For edit form:
    form_edit_rules = ('username', 'email', 'confirmed', 'pro_plan_active', 'pro_plan_expiration_date', 'is_admin')
    # For create form (if you enable creation, which is off by default for this view):
    # form_create_rules = ('username', 'email', 'password_hash', 'confirmed', 'pro_plan_active', 'pro_plan_expiration_date', 'is_admin')
    
    # Disable model creation from admin for now, as password handling is complex here
    can_create = False
    can_delete = True # Or False, depending on your policy

    # Add other model views here if needed, e.g.:
# class SharedChallengeAdminView(AuthenticatedModelView):
#     column_list = ('public_id', 'creator', 'created_at', 'max_groups', 'num_players_per_group')
#     column_searchable_list = ('public_id', 'creator.username')
#     column_filters = ('created_at', 'max_groups')
#     can_create = False
#     can_edit = True
#     can_delete = True

# Add more views for other models as needed...
