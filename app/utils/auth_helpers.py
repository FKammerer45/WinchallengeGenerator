# app/utils/auth_helpers.py
import logging
from urllib.parse import urlparse, urljoin
from flask import request

logger = logging.getLogger(__name__)

def is_safe_url(target):
    ref_url = urlparse(request.host_url)
    test_url = urlparse(urljoin(request.host_url, target))
    return test_url.scheme in ('http', 'https') and \
           ref_url.netloc == test_url.netloc

def is_user_authorized(challenge, user):
    if not user or not challenge:
        return False
    if challenge.creator_id == user.id:
        return True

    # Use the new relationship name
    auth_list = getattr(challenge, 'authorized_users_list', None) 
    if auth_list is None:
         logger.warning(f"is_user_authorized: 'authorized_users_list' relationship not loaded or defined on challenge {challenge.id}.")
         return False # Cannot confirm authorization if list isn't loaded

    # Compare by ID instead of object instance
    for authorized_user in auth_list:
        if authorized_user.id == user.id:
            return True
    return False
