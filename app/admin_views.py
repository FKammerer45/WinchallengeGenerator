from flask import session, redirect, url_for, request, flash
from flask_admin.contrib.sqla import ModelView
from flask_admin import AdminIndexView, expose
from flask_admin.helpers import get_redirect_target
from flask_admin.model.helpers import get_mdict_item_or_list
from markupsafe import Markup, escape
from flask_wtf import FlaskForm # Import FlaskForm
from flask_wtf.csrf import generate_csrf # Import generate_csrf
from wtforms.fields import StringField, IntegerField, BooleanField, DateTimeField, TextAreaField # Import necessary fields
from wtforms.validators import DataRequired, Email, Optional, ValidationError # Import Optional validator
from wtforms.widgets import CheckboxInput, DateTimeInput, TextInput, TextArea # Import necessary widgets
from datetime import datetime as dt_parser # For parsing date strings
import json # For JSON validation
# Import your User model and db instance
from .models import User, SharedChallenge, ChallengeGroup, SavedGameTab, SavedPenaltyTab, Feedback # Add other models as needed
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

    def __init__(self, formdata=None, obj=None, **kwargs):
        super().__init__(formdata=formdata, obj=obj, **kwargs)
        if obj: # If the form is being populated from an object
            date_fields_to_check = ['confirmed_on', 'pro_plan_expiration_date', 'created_at']
            for field_name in date_fields_to_check:
                form_field = getattr(self, field_name, None) # Renamed to avoid conflict with outer scope 'field'
                if form_field and form_field.data is not None and isinstance(form_field.data, str):
                    # If data is a string, try to parse it, or set to None if invalid
                    try:
                        # Use the field's own format for parsing
                        form_field.data = dt_parser.strptime(form_field.data, form_field.format)
                    except (ValueError, TypeError):
                        # If parsing fails or it's an unsuitable string, set to None
                        # This relies on the field having validators=[Optional()]
                        form_field.data = None
    
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

    def validate_entries_json(self, field):
        try:
            json.loads(field.data)
        except json.JSONDecodeError:
            raise ValidationError('Invalid JSON format.')

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

    def validate_penalties_json(self, field):
        try:
            json.loads(field.data)
        except json.JSONDecodeError:
            raise ValidationError('Invalid JSON format for penalties.')

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
    
    challenge_data = TextAreaField('Challenge Data (JSON)', widget=TextArea()) # Validators=[DataRequired()] implicitly if not Optional
    penalty_info = TextAreaField('Penalty Info (JSON)', validators=[Optional()], widget=TextArea())
    
    timer_current_value_seconds = IntegerField('Timer Current Value (s)', validators=[DataRequired()])
    timer_is_running = BooleanField('Timer Is Running', widget=CheckboxInput())
    timer_last_started_at_utc = DateTimeField('Timer Last Started UTC', format='%Y-%m-%d %H:%M:%S', validators=[Optional()], widget=DateTimeInput())

    def validate_challenge_data(self, field):
        if not field.data: # Assuming challenge_data can be empty if not required by model
             # If it's required, DataRequired() validator should be on the field itself.
             # This validator only checks JSON format if data is present.
            return
        try:
            json.loads(field.data)
        except json.JSONDecodeError:
            raise ValidationError('Invalid JSON format for Challenge Data.')

    def validate_penalty_info(self, field):
        if not field.data: # Optional field, so only validate if data is present
            return
        try:
            json.loads(field.data)
        except json.JSONDecodeError:
            raise ValidationError('Invalid JSON format for Penalty Info.')

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

# --- Feedback Admin View ---
class FeedbackAdminView(AuthenticatedModelView):
    # Columns to display in the list view
    # column_list = ('id', 'username', 'user', 'timestamp', 'site_area', 'feedback_type', 'message', 'archived') # Original
    
    # Columns that can be searched
    column_searchable_list = ('username', 'user.username', 'user.email', 'site_area', 'feedback_type', 'message') # Keep user.username for search
    
    # Columns that can be filtered
    column_filters = ('archived', 'timestamp', 'site_area', 'feedback_type', 'user.username')
    
    # Default sort column
    column_default_sort = ('timestamp', True) # Sort by timestamp descending by default

    # Custom action (archive/unarchive) formatter
    def _action_formatter(view, context, model, name):
        action_url_archive = url_for('.archive_single_item', id=model.id, url=get_redirect_target())
        action_url_unarchive = url_for('.unarchive_single_item', id=model.id, url=get_redirect_target()) # Corrected: added ()
        
        # For delete, we need a form to make it a POST request
        # Flask-Admin's delete_form macro could be used if accessible, or a simple form:
        delete_url = url_for('.delete_view', id=model.id, url=get_redirect_target())
        
        buttons_html = '<div class="action-buttons" style="display: flex; gap: 5px;">' # Use flex for spacing
        
        # Edit button (standard GET link)
        edit_url = url_for('.edit_view', id=model.id, url=get_redirect_target())
        buttons_html += f'<a href="{edit_url}" class="btn btn-xs btn-outline-primary"><i class="bi bi-pencil-fill"></i> Edit</a>'

        if not model.archived:
            buttons_html += f'<a href="{action_url_archive}" class="btn btn-xs btn-outline-warning"><i class="bi bi-archive-fill"></i> Archive</a>'
        else:
            buttons_html += f'<a href="{action_url_unarchive}" class="btn btn-xs btn-outline-success"><i class="bi bi-box-arrow-up"></i> Unarchive</a>'
        
        # Delete button with a form
        # Note: Flask-Admin's default delete confirmation JS might expect specific classes/structure.
        # This is a simplified form. For full modal confirmation, more JS/HTML might be needed.
        csrf_token_value = generate_csrf()
        buttons_html += f'''
            <form method="POST" action="{delete_url}" style="display: inline-block; margin: 0;">
                <input type="hidden" name="csrf_token" value="{csrf_token_value}">
                <input type="hidden" name="id" value="{model.id}">
                <button type="submit" class="btn btn-xs btn-outline-danger"
                        onclick="return confirm('Are you sure you want to delete this item?');">
                    <i class="bi bi-trash-fill"></i> Delete
                </button>
            </form>
        '''
        buttons_html += '</div>'
        return Markup(buttons_html)

    def _user_info_formatter(view, context, model, name):
        if model.user: # If linked to a User object
            return Markup(f"{escape(model.user.username)} (ID: {escape(model.user.id)})<br><small>Submitted as: {escape(model.username)}</small>")
        return escape(model.username) # Fallback to the name entered in the form

    column_formatters = {
        'message': lambda v, c, m, p: (Markup(f'<div style="max-width: 300px; max-height: 100px; overflow-y: auto; white-space: pre-wrap; word-wrap: break-word;">{escape(m.message)}</div>') if m.message else ''),
        'actions': _action_formatter,
        'user_info': _user_info_formatter
    }
    
    # Updated column_list to use 'user_info'
    column_list = ('id', 'user_info', 'timestamp', 'site_area', 'feedback_type', 'message', 'archived', 'actions')
    # Remove 'user' and 'username' from here if 'user_info' replaces them for display.
    # Keep them in column_searchable_list if you want to search by actual user.username or submitted name.

    column_labels = {
        'user_info': 'User / Submitted As',
        'username': 'Name in Form' # This won't be shown if not in column_list, but good for clarity
    }

    column_extra_widget_kwargs = {
        'message': {'style': 'word-wrap: break-word; white-space: pre-wrap;'}
    }


    # Fields to display/edit in the form view
    # For simplicity, we can use default form generation or create a custom one if needed
    # Let's start with default and customize if necessary.
    # We might want to make 'message' a TextArea
    form_overrides = {
        'message': TextAreaField
    }
    form_widget_args = {
        'message': {
            'rows': 10,
            'style': 'width: 100%;' # Make textarea wider
        },
        'timestamp': {
            'readonly': True # Timestamp should not be manually editable
        },
        'username': {
            'readonly': True # Username (captured at submission) should not be editable
        }
    }
    
    # Control which fields are editable
    # 'id', 'user_id', 'timestamp' are usually not manually edited.
    # 'username' is captured, 'user' is a relationship.
    form_edit_rules = ('site_area', 'feedback_type', 'message', 'archived')
    form_create_rules = ('user', 'username', 'site_area', 'feedback_type', 'message') # If creation is allowed

    can_create = False # Feedback is created by users, not admins directly
    can_edit = True    # Admins can edit (e.g., to correct typos, categorize, or archive)
    can_delete = True  # Admins can delete feedback entries

    # Action to archive selected feedback items
    @expose('/action/archive', methods=['POST'])
    def action_archive(self):
        ids = request.form.getlist('ids')
        try:
            if not ids:
                flash('No feedback items selected for archiving.', 'warning')
                return redirect(url_for('.index_view'))

            selected_feedback = db.session.query(Feedback).filter(Feedback.id.in_(ids)).all()
            count = 0
            for item in selected_feedback:
                item.archived = True
                count +=1
            db.session.commit()
            flash(f'{count} feedback item(s) archived successfully.', 'success')
        except Exception as e:
            db.session.rollback()
            flash(f'Error archiving feedback: {e}', 'danger')
        return redirect(url_for('.index_view'))

    # Action to unarchive selected feedback items
    @expose('/action/unarchive', methods=['POST'])
    def action_unarchive(self):
        ids = request.form.getlist('ids')
        try:
            if not ids:
                flash('No feedback items selected for unarchiving.', 'warning')
                return redirect(url_for('.index_view'))

            selected_feedback = db.session.query(Feedback).filter(Feedback.id.in_(ids)).all()
            count = 0
            for item in selected_feedback:
                item.archived = False
                count += 1
            db.session.commit()
            flash(f'{count} feedback item(s) unarchived successfully.', 'success')
        except Exception as e:
            db.session.rollback()
            flash(f'Error unarchiving feedback: {e}', 'danger')
        return redirect(url_for('.index_view'))
    
    # Add custom actions to the list view
    list_template = 'admin/feedback_list_custom.html' # We'll need to create this template
    
    # If you want the actions in the dropdown:
    # action_disallowed_list = [] # Ensure no default actions are disallowed if you want them
    page_size = 25 # Example: show 25 items per page

    @expose('/')
    def index_view(self):
        # store page number and page size to session
        self._template_args['page'] = page = request.args.get('page', 0, type=int)
        self._template_args['page_size'] = page_size = request.args.get('page_size', self.page_size, type=int)

        # Fetch active (non-archived) feedback
        active_query = self.session.query(self.model).filter(self.model.archived == False)
        active_count, active_data = self._get_list_extra_args(active_query, page, page_size)
        
        # Fetch archived feedback (can be on a different page or all on one if not too many)
        # For simplicity, let's paginate archived feedback as well, or show first N
        archived_page = request.args.get('archived_page', 0, type=int) # Separate pager for archived
        archived_query = self.session.query(self.model).filter(self.model.archived == True)
        archived_count, archived_data = self._get_list_extra_args(archived_query, archived_page, page_size)

        self._template_args['active_feedback_list'] = active_data
        self._template_args['active_feedback_count'] = active_count
        self._template_args['archived_feedback_list'] = archived_data
        self._template_args['archived_feedback_count'] = archived_count
        self._template_args['archived_page'] = archived_page # Pass archived page number

        return self.render(self.list_template, **self._template_args)

    def _get_list_extra_args(self, query, page, page_size):
        # Apply sorting
        sort_column = request.args.get('sort', self.column_default_sort[0] if self.column_default_sort else None)
        sort_desc = request.args.get('desc', self.column_default_sort[1] if self.column_default_sort else 0, type=int)

        if sort_column and hasattr(self.model, sort_column):
            col = getattr(self.model, sort_column)
            query = query.order_by(col.desc() if sort_desc else col.asc())
        
        count = query.count()
        data = query.limit(page_size).offset(page * page_size).all()
        return count, data

    @expose('/archive_item/<int:id>')
    def archive_single_item(self, id):
        return_url = get_redirect_target() or self.get_url('.index_view')
        item = self.get_one(str(id)) # get_one expects string id
        if not item:
            flash('Feedback item not found.', 'error')
            return redirect(return_url)
        try:
            item.archived = True
            db.session.commit()
            flash(f'Feedback item {item.id} archived.', 'success')
        except Exception as e:
            db.session.rollback()
            flash(f'Failed to archive feedback item {item.id}: {e}', 'error')
        return redirect(return_url)

    @expose('/unarchive_item/<int:id>')
    def unarchive_single_item(self, id):
        return_url = get_redirect_target() or self.get_url('.index_view')
        item = self.get_one(str(id))
        if not item:
            flash('Feedback item not found.', 'error')
            return redirect(return_url)
        try:
            item.archived = False
            db.session.commit()
            flash(f'Feedback item {item.id} unarchived.', 'success')
        except Exception as e:
            db.session.rollback()
            flash(f'Failed to unarchive feedback item {item.id}: {e}', 'error')
        return redirect(return_url)
