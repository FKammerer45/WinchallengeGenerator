# app/routes/payment.py
import logging
from flask import Blueprint, render_template, redirect, url_for, flash, current_app
from flask_login import login_required, current_user

# Assuming 'payment_bp' is the name used for registration
payment_bp = Blueprint('payment', __name__, url_prefix='/payment')
logger = logging.getLogger(__name__)

@payment_bp.route('/checkout')
@login_required # Ensure user is logged in to access checkout
def checkout():
    """Renders the checkout page."""
    logger.debug(f"User {current_user.id} accessing checkout page.")
    is_testing_or_debug = current_app.config.get('TESTING', False) or current_app.config.get('DEBUG', False)
    return render_template('payment/checkout_page.html', is_testing_or_debug=is_testing_or_debug)
