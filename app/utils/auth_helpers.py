# app/utils/auth_helpers.py
import logging

logger = logging.getLogger(__name__)

def is_user_authorized(challenge, user):
    """
    Checks if a user is the creator or in the authorized list for a challenge.

    Args:
        challenge: The SharedChallenge object (must have authorized_users loaded if checking list).
        user: The User object to check, or None.

    Returns:
        bool: True if authorized, False otherwise.
    """
    # Ensure basic objects exist
    if not user or not challenge:
        # logger.debug("is_user_authorized: False (missing user or challenge object)")
        return False

    # Check if user is the creator
    if challenge.creator_id == user.id:
        # logger.debug(f"is_user_authorized: True (user {user.id} is creator)")
        return True

    # Check if challenge object has the authorized_users relationship loaded
    # Use getattr to safely check for the attribute's existence before accessing
    # This prevents AttributeError if the relationship wasn't loaded correctly
    authorized_users_list = getattr(challenge, 'authorized_users', None)
    if authorized_users_list is None:
         logger.warning(f"is_user_authorized: 'authorized_users' relationship not loaded on challenge {challenge.id}. Cannot check authorization list.")
         return False # Cannot confirm authorization if list isn't loaded

    # Check if user is in the loaded authorized_users list
    is_in_list = user in authorized_users_list
    # logger.debug(f"is_user_authorized: Checking list for user {user.id}. Is in list? {is_in_list}")
    return is_in_list

