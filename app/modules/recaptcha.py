# modules/recaptcha.py
import logging
import requests
from flask import current_app

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

def verify_recaptcha(token: str) -> bool:
    """
    Verify the reCAPTCHA token using Google's reCAPTCHA API.

    :param token: The reCAPTCHA response token from the client.
    :return: True if the verification is successful, False otherwise.
    :raises ValueError: If the reCAPTCHA secret key is missing from the configuration.
    """
    secret_key = current_app.config.get('RECAPTCHA_PRIVATE_KEY')
    if not secret_key:
        logger.error("reCAPTCHA secret key is missing from configuration.")
        raise ValueError("reCAPTCHA secret key missing")
    
    payload = {'secret': secret_key, 'response': token}
    
    try:
        response = requests.post(
            'https://www.google.com/recaptcha/api/siteverify',
            data=payload,
            timeout=5
        )
        response.raise_for_status()
    except requests.RequestException as e:
        logger.exception("Error during reCAPTCHA verification: %s", e)
        return False

    result = response.json()
    logger.debug("reCAPTCHA response: %s", result)
    return result.get('success', False)
