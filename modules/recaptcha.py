# modules/recaptcha.py
import requests
from flask import current_app

def verify_recaptcha(token):
    secret_key = current_app.config.get('RECAPTCHA_PRIVATE_KEY')
    if not secret_key:
        raise ValueError("reCAPTCHA secret key missing")
    
    payload = {'secret': secret_key, 'response': token}
    response = requests.post(
        'https://www.google.com/recaptcha/api/siteverify',
        data=payload,
        timeout=5
    )
    result = response.json()
    return result.get('success', False)

