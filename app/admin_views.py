from flask import session, redirect, url_for, request, flash
from flask_admin.contrib.sqla import ModelView
from flask_admin import AdminIndexView, expose
from flask_wtf import FlaskForm # Import FlaskForm
from wtforms.fields import StringField, IntegerField, BooleanField, DateTimeField, TextAreaField # Import necessary fields
from wtforms.validators import DataRequired, Email, Optional # Import Optional validator
from wtforms.widgets import CheckboxInput, DateTimeInput, TextInput, TextArea # Import necessary widgets
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
    # form_base_class = FlaskForm # Explicitly set FlaskForm as base (temporarily commented out for debugging)

    def is_accessible(self):
        return session.get('admin_logged_in')

    def inaccessible_callback(self, name, **kwargs):
        flash('You do not have permission to access this part of the admin panel. Please log in as an admin.', 'danger')
        return redirect(url_for('admin_auth.login', next=request.url))

# Define a custom form for User editing
class UserEditForm(FlaskForm):
    # We don't include 'id' here as primary keys are usually not directly edited in the form body.
    # Flask-Admin handles passing the model instance and populating the form.
    username = StringField('Username', validators=[DataRequired()])
    email = StringField('Email', validators=[DataRequired(), Email()])
    twitch_id = StringField('Twitch ID', validators=[Optional()])
    overlay_api_key = StringField('Overlay API Key', render_kw={'readonly': True}, validators=[Optional()])
    confirmed = BooleanField('Confirmed', widget=CheckboxInput())
    # confirmed_on is usually set by logic, so make it read-only if displayed
    confirmed_on = DateTimeField('Confirmed On', format='%Y-%m-%d %H:%M:%S', render_kw={'readonly': True}, validators=[Optional()], widget=DateTimeInput())
    pro_plan_active = BooleanField('Pro Plan Active', widget=CheckboxInput())
    pro_plan_expiration_date = DateTimeField('Pro Plan Expiration', format='%Y-%m-%d %H:%M:%S', validators=[Optional()], widget=DateTimeInput())
    is_admin = BooleanField('Is Admin', widget=CheckboxInput())
    # created_at is set on creation, so make it read-only
    created_at = DateTimeField('Created At', format='%Y-%m-%d %H:%M:%S', render_kw={'readonly': True}, validators=[Optional()], widget=DateTimeInput())

    def populate_obj(self, obj):
        # Call the superclass populate_obj
        super(UserEditForm, self).populate_obj(obj)
        # Convert empty strings for nullable unique fields to None
        if self.twitch_id.data == '':
            obj.twitch_id = None
        if self.overlay_api_key.data == '':
            obj.overlay_api_key = None
        # Ensure DateTimeFields that are optional and empty are set to None
        if not self.pro_plan_expiration_date.data:
            obj.pro_plan_expiration_date = None
        if not self.confirmed_on.data: # This is read-only, but good practice if it were editable
            obj.confirmed_on = None
        if not self.created_at.data: # This is read-only, but good practice
            obj.created_at = None


# Specific view for User model
class UserAdminView(AuthenticatedModelView):
    # Use the custom form for editing
    form = UserEditForm # Ensure custom form is active
    edit_template = 'admin/user_edit_custom.html' # Specify custom edit template

    # Clear out other form configurations to ensure our custom form is used exclusively for edit
    form_columns = None # Not needed if 'form' attribute is set
    form_edit_rules = None
    form_overrides = None
    form_args = None
    form_excluded_columns = None # Ensure no columns are unexpectedly excluded if form is used

    # Keep other settings like column_list for the list view for now
    column_list = ('id', 'username', 'email', 'confirmed', 'pro_plan_active', 'pro_plan_expiration_date', 'is_admin', 'created_at')
    column_searchable_list = ('username', 'email')
    column_filters = ('confirmed', 'pro_plan_active', 'is_admin', 'created_at')
    
    # We might need to adjust create form separately if can_create is True
    # For now, focusing on the edit view error.
    can_create = False 
    can_delete = True # Or False, depending on your policy

    # inline_models are removed for now, will use template customization
    # inline_models = [ ... ]

# Custom form for SavedGameTab
class SavedGameTabEditForm(FlaskForm):
    tab_name = StringField('Tab Name', validators=[DataRequired()])
    client_tab_id = StringField('Client Tab ID', validators=[DataRequired()])
    user_display = StringField('User', render_kw={'readonly': True, 'disabled': True}) # For display
    entries_json = TextAreaField('Entries JSON', widget=TextArea()) # Make editable with TextArea

    def populate_obj(self, obj):
        # Custom populate_obj to handle non-model field 'user_display'
        # and prevent trying to set it on the model.
        # Only set attributes that exist on the model.
        obj.tab_name = self.tab_name.data
        obj.client_tab_id = self.client_tab_id.data
        obj.entries_json = self.entries_json.data # Update entries_json from form
        # user_id is not changed here.

    def __init__(self, formdata=None, obj=None, **kwargs):
        super().__init__(formdata=formdata, obj=obj, **kwargs)
        if obj and obj.user:
            self.user_display.data = obj.user.username # Or obj.user.id, or other representation


class SavedGameTabAdminView(AuthenticatedModelView):
    form = SavedGameTabEditForm # Use custom form
    column_list = ('id', 'user', 'tab_name', 'client_tab_id', 'timestamp')
    # form_columns now implicitly defined by SavedGameTabEditForm
    # form_args are handled by the form's render_kw or field definitions

    column_searchable_list = ('tab_name', 'user.username', 'user.email')
    column_filters = ('timestamp', 'user.username')
    can_create = False # To avoid issues with setting user_id on creation
    can_edit = True # Allow editing of tab_name, client_tab_id
    can_delete = True

# Custom form for SavedPenaltyTab
class SavedPenaltyTabEditForm(FlaskForm):
    tab_name = StringField('Tab Name', validators=[DataRequired()])
    client_tab_id = StringField('Client Tab ID', validators=[DataRequired()])
    user_display = StringField('User', render_kw={'readonly': True, 'disabled': True}) # For display
    penalties_json = TextAreaField('Penalties JSON', widget=TextArea()) # Make editable

    def populate_obj(self, obj):
        obj.tab_name = self.tab_name.data
        obj.client_tab_id = self.client_tab_id.data
        obj.penalties_json = self.penalties_json.data
        # user_id is not changed here

    def __init__(self, formdata=None, obj=None, **kwargs):
        super().__init__(formdata=formdata, obj=obj, **kwargs)
        if obj and obj.user:
            self.user_display.data = obj.user.username

class SavedPenaltyTabAdminView(AuthenticatedModelView):
    form = SavedPenaltyTabEditForm # Use custom form
    column_list = ('id', 'user', 'tab_name', 'client_tab_id', 'timestamp')
    # form_columns and form_args are now handled by the custom form

    column_searchable_list = ('tab_name', 'user.username', 'user.email')
    column_filters = ('timestamp', 'user.username')
    can_create = False # To avoid issues with setting user_id on creation
    can_edit = True # Allow editing of tab_name, client_tab_id
    can_delete = True

# Custom form for SharedChallenge
class SharedChallengeEditForm(FlaskForm):
    name = StringField('Name', validators=[Optional()])
    creator_display = StringField('Creator', render_kw={'readonly': True, 'disabled': True})
    public_id_display = StringField('Public ID', render_kw={'readonly': True, 'disabled': True})
    created_at_display = DateTimeField('Created At', format='%Y-%m-%d %H:%M:%S', render_kw={'readonly': True, 'disabled': True}, widget=DateTimeInput())
    
    max_groups = IntegerField('Max Groups', validators=[DataRequired()])
    num_players_per_group = IntegerField('Players Per Group', validators=[DataRequired()])
    
    challenge_data = TextAreaField('Challenge Data (JSON)', widget=TextArea())
    penalty_info = TextAreaField('Penalty Info (JSON)', validators=[Optional()], widget=TextArea())
    
    timer_current_value_seconds = IntegerField('Timer Current Value (s)', validators=[DataRequired()])
    timer_is_running = BooleanField('Timer Is Running', widget=CheckboxInput())
    timer_last_started_at_utc = DateTimeField('Timer Last Started UTC', format='%Y-%m-%d %H:%M:%S', validators=[Optional()], widget=DateTimeInput())

    def populate_obj(self, obj):
        obj.name = self.name.data
        obj.max_groups = self.max_groups.data
        obj.num_players_per_group = self.num_players_per_group.data
        obj.challenge_data = self.challenge_data.data
        obj.penalty_info = self.penalty_info.data
        obj.timer_current_value_seconds = self.timer_current_value_seconds.data
        obj.timer_is_running = self.timer_is_running.data
        obj.timer_last_started_at_utc = self.timer_last_started_at_utc.data
        # creator_id, public_id, created_at are not changed here

    def __init__(self, formdata=None, obj=None, **kwargs):
        super().__init__(formdata=formdata, obj=obj, **kwargs)
        if obj:
            if obj.creator:
                self.creator_display.data = obj.creator.username
            self.public_id_display.data = obj.public_id
            if obj.created_at:
                self.created_at_display.data = obj.created_at

class SharedChallengeAdminView(AuthenticatedModelView):
    form = SharedChallengeEditForm # Use custom form
    column_list = ('id', 'public_id', 'name', 'creator', 'created_at', 'max_groups', 'num_players_per_group', 'timer_is_running')
    column_searchable_list = ('name', 'public_id', 'creator.username', 'creator.email')
    column_filters = ('created_at', 'max_groups', 'num_players_per_group', 'timer_is_running', 'creator.username')
    
    # form_columns and form_args are now handled by the custom form
    # form_excluded_columns is also handled by what's included in the custom form

    can_create = True # Allow creation, but creator assignment needs care. Public ID needs to be generated.
    can_edit = True
    can_delete = True

    # To handle creator_id on creation if 'creator' field is not disabled:
    # def on_model_change(self, form, model, is_created):
    #     if is_created:
    #         # If creator is not set via form (e.g. if it was a simple text field for id)
    #         # or if you want to default it or ensure it's set
    #         if not model.creator_id and hasattr(form, 'creator') and form.creator.data:
    #             model.creator_id = form.creator.data.id 
    #         elif not model.creator_id:
    #             # Handle cases where creator might not be set, e.g. default or raise error
    #             pass # Or set a default admin user, or make field required
    #     # For public_id generation on creation:
    #     if is_created and not model.public_id:
    #         import uuid
    #         model.public_id = str(uuid.uuid4())
    #     super().on_model_change(form, model, is_created)

    # Add other model views here if needed, e.g.:
# class SharedChallengeAdminView(AuthenticatedModelView):
#     column_list = ('public_id', 'creator', 'created_at', 'max_groups', 'num_players_per_group')
#     column_searchable_list = ('public_id', 'creator.username')
#     column_filters = ('created_at', 'max_groups')
#     can_create = False
#     can_edit = True
#     can_delete = True

# Add more views for other models as needed...
