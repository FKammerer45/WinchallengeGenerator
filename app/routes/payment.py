# app/routes/payment.py
import logging
import requests # Added import
from flask import Blueprint, render_template, redirect, url_for, flash, current_app, jsonify, request
from flask_login import login_required, current_user
import paypalrestsdk # Still used for configuration, potentially for other v1 calls if any
from app.utils.subscription_helpers import grant_pro_plan, is_pro_plan_active # Import is_pro_plan_active
from app import csrf # For CSRF exemption if needed, or handle via JS headers

# Assuming 'payment_bp' is the name used for registration
payment_bp = Blueprint('payment', __name__, url_prefix='/payment')
logger = logging.getLogger(__name__)

# Define Pro Plan Price (Consider moving to a config or plan_config.py)
PRO_PLAN_PRICE = "2.99"
PRO_PLAN_CURRENCY = "EUR"

@payment_bp.route('/checkout')
@login_required # Ensure user is logged in to access checkout
def checkout():
    """Renders the checkout page."""
    logger.debug(f"User {current_user.id} accessing checkout page.")
    is_testing_or_debug = current_app.config.get('TESTING', False) or current_app.config.get('DEBUG', False)
    
    # Pass PayPal Client ID to the template for the JS SDK
    paypal_client_id = current_app.config.get('PAYPAL_CLIENT_ID')
    user_already_pro = False
    pro_expiration_date_str = None

    if current_user.is_authenticated:
        user_already_pro = is_pro_plan_active(current_user)
        if user_already_pro and current_user.pro_plan_expiration_date:
            pro_expiration_date_str = current_user.pro_plan_expiration_date.strftime('%B %d, %Y')


    return render_template('payment/checkout_page.html', 
                           is_testing_or_debug=is_testing_or_debug,
                           paypal_client_id=paypal_client_id,
                           pro_plan_price=PRO_PLAN_PRICE,
                           pro_plan_currency=PRO_PLAN_CURRENCY,
                           user_already_pro=user_already_pro,
                           pro_expiration_date_str=pro_expiration_date_str)

@payment_bp.route('/api/paypal/create_order', methods=['POST'])
@login_required
@csrf.exempt # Typically exempt for API endpoints called by JS, ensure CSRF token is handled by JS if needed otherwise
def create_paypal_order():
    """Creates a PayPal order and returns the order ID."""
    if not (current_app.config.get('PAYPAL_CLIENT_ID') and current_app.config.get('PAYPAL_CLIENT_SECRET')):
        logger.error("PayPal create_order: PayPal not configured.")
        return jsonify({"error": "Payment system not configured."}), 500
    try:
        # Construct the API endpoint based on PayPal mode
        if current_app.config['PAYPAL_MODE'] == 'sandbox':
            api_base = 'https://api.sandbox.paypal.com'
        else:
            api_base = 'https://api.paypal.com'
        
        create_order_url = f"{api_base}/v2/checkout/orders"
        
        # 1. Get Access Token
        auth_url = f"{api_base}/v1/oauth2/token"
        auth_payload = {'grant_type': 'client_credentials'}
        auth_headers = {'Accept': 'application/json', 'Accept-Language': 'en_US'}
        auth_response = requests.post(
            auth_url,
            auth=(current_app.config['PAYPAL_CLIENT_ID'], current_app.config['PAYPAL_CLIENT_SECRET']),
            data=auth_payload,
            headers=auth_headers
        )
        auth_response.raise_for_status() # Raise an exception for HTTP errors
        access_token = auth_response.json()['access_token']

        # 2. Create Order
        order_payload = {
            "intent": "CAPTURE",
            "purchase_units": [{
                "amount": {
                    "currency_code": PRO_PLAN_CURRENCY,
                    "value": PRO_PLAN_PRICE,
                    "breakdown": {
                        "item_total": {
                            "currency_code": PRO_PLAN_CURRENCY,
                            "value": PRO_PLAN_PRICE
                        }
                        # Add other breakdown fields like shipping, tax_total if needed (Python comment outside dict)
                    }
                },
                "description": "Pro Plan Subscription - WinChallengeGenerator", # This description is for the purchase unit
                "items": [{ # Item details are optional if you only have one simple item, but good for clarity
                    "name": "Pro Plan Subscription",
                    "sku": "PRO_PLAN_MONTHLY",
                    "unit_amount": {
                        "currency_code": PRO_PLAN_CURRENCY,
                        "value": PRO_PLAN_PRICE
                    },
                    "quantity": "1"
                }]
            }],
            "application_context": {
                "return_url": url_for('payment.checkout', _external=True, status='success_paypal_v2'),
                "cancel_url": url_for('payment.checkout', _external=True, status='cancel_paypal_v2')
            }
        }
        order_headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {access_token}'
            # 'PayPal-Request-Id': str(uuid.uuid4()) # Optional: for idempotency
        }
        
        response = requests.post(create_order_url, json=order_payload, headers=order_headers)
        response.raise_for_status() # Raise an exception for HTTP errors
        order_data = response.json()

        if order_data.get("id"):
            logger.info(f"PayPal Order API v2 order created successfully via direct API: {order_data['id']} for user {current_user.id}")
            return jsonify({"id": order_data["id"]}) # Return the Order ID (EC- token)
        else:
            logger.error(f"PayPal Order API v2 order creation failed (direct API). Response: {order_data}")
            return jsonify({"error": "Failed to create PayPal order.", "details": order_data}), 500

    except requests.exceptions.HTTPError as http_err:
        logger.error(f"HTTP error creating PayPal order for user {current_user.id}: {http_err.response.text}")
        try:
            error_details = http_err.response.json()
        except ValueError:
            error_details = http_err.response.text
        return jsonify({"error": "PayPal API request failed.", "details": error_details}), 500
    except Exception as e:
        logger.exception(f"Exception creating PayPal Order API v2 order for user {current_user.id}: {e}")
        return jsonify({"error": str(e)}), 500

@payment_bp.route('/api/paypal/capture_order', methods=['POST'])
@login_required
@csrf.exempt # Ensure CSRF handling if this is not exempt
def capture_paypal_order():
    """Captures a PayPal order and grants pro plan if successful."""
    if not (current_app.config.get('PAYPAL_CLIENT_ID') and current_app.config.get('PAYPAL_CLIENT_SECRET')):
        logger.error("PayPal capture_order: PayPal not configured.")
        return jsonify({"error": "Payment system not configured."}), 500
        
    data = request.get_json()
    # This is the PayPal Order ID (EC-XXX or similar) from createOrder on client-side,
    # which was originally returned by our /api/paypal/create_order
    paypal_order_id = data.get('orderID')

    if not paypal_order_id:
        return jsonify({"error": "Missing PayPal orderID."}), 400

    # Prevent re-processing if user is already pro and tries to pay again through a stale page or direct API call
    # The grant_pro_plan function handles extension, but this adds an earlier check.
    if is_pro_plan_active(current_user):
        # Optionally, you could allow extension here, but for now, let's prevent a new charge if already pro.
        # This depends on desired business logic. If grant_pro_plan handles extension correctly,
        # this check might be redundant or could simply log a warning.
        # For now, let's assume we don't want to re-trigger capture if they are already pro from this endpoint.
        # However, the payment might have already been authorized by PayPal on the client-side.
        # The critical part is that grant_pro_plan extends rather than creating a conflicting subscription.
        logger.info(f"User {current_user.id} attempting to capture order {paypal_order_id} but is already Pro. Proceeding to extend/verify.")


    try:
        # Construct the API endpoint based on PayPal mode
        if current_app.config['PAYPAL_MODE'] == 'sandbox':
            api_base = 'https://api.sandbox.paypal.com'
        else:
            api_base = 'https://api.paypal.com'

        capture_url = f"{api_base}/v2/checkout/orders/{paypal_order_id}/capture"

        # 1. Get Access Token (same as in create_order)
        # import requests # Already imported at the top
        auth_url = f"{api_base}/v1/oauth2/token"
        auth_payload = {'grant_type': 'client_credentials'}
        auth_headers = {'Accept': 'application/json', 'Accept-Language': 'en_US'}
        auth_response = requests.post(
            auth_url,
            auth=(current_app.config['PAYPAL_CLIENT_ID'], current_app.config['PAYPAL_CLIENT_SECRET']),
            data=auth_payload,
            headers=auth_headers
        )
        auth_response.raise_for_status()
        access_token = auth_response.json()['access_token']

        # 2. Capture Order
        capture_headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {access_token}'
            # 'PayPal-Request-Id': str(uuid.uuid4()) # Optional for idempotency
        }
        
        response = requests.post(capture_url, headers=capture_headers, json={}) # Empty JSON body for capture
        response.raise_for_status() # Raise an exception for HTTP errors
        capture_data = response.json()

        if capture_data.get("status") == "COMPLETED":
            logger.info(f"PayPal Order API v2 payment captured successfully (direct API): {paypal_order_id} for user {current_user.id}")
            if grant_pro_plan(current_user):
                logger.info(f"Pro plan granted to user {current_user.id} after PayPal payment {paypal_order_id}.")
                flash("Congratulations! Your Pro Plan is now active.", "success")
                return jsonify({"status": "success", "message": "Payment successful and Pro Plan activated!"})
            else:
                logger.error(f"PayPal payment {paypal_order_id} successful, but failed to grant pro plan.")
                return jsonify({"error": "Payment successful, but failed to activate Pro Plan. Please contact support."}), 500
        else:
            logger.warning(f"PayPal payment capture for order {paypal_order_id} resulted in status: {capture_data.get('status')}. Details: {capture_data}")
            return jsonify({"error": f"Payment capture status: {capture_data.get('status')}. Please contact support."}), 400

    except requests.exceptions.HTTPError as http_err:
        logger.error(f"HTTP error capturing PayPal order {paypal_order_id} for user {current_user.id}: {http_err.response.text}")
        try:
            error_details = http_err.response.json()
        except ValueError:
            error_details = http_err.response.text
        return jsonify({"error": "PayPal API request failed during capture.", "details": error_details}), 500
    except Exception as e:
        logger.exception(f"Exception capturing PayPal Order API v2 order {paypal_order_id} for user {current_user.id}: {e}")
        return jsonify({"error": str(e)}), 500
