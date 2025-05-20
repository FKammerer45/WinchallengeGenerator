console.log('[AdminLogout] SCRIPT PARSING STARTED'); // New top-level log

document.addEventListener('DOMContentLoaded', function() {
    console.log('[AdminLogout] Script loaded. DOMContentLoaded fired.');
    const logoutLink = document.querySelector('a.admin-logout-link');

    if (logoutLink) {
        console.log('[AdminLogout] Logout link found:', logoutLink.href);
        logoutLink.addEventListener('click', function(event) {
            console.log('[AdminLogout] Logout link clicked.');
            event.preventDefault();
            event.stopPropagation();
            console.log('[AdminLogout] Default click action prevented.');

            const form = document.createElement('form');
            form.method = 'POST';
            form.action = this.href; // Should be /admin/logout
            form.style.display = 'none';
            console.log('[AdminLogout] Form created. Action:', form.action, 'Method:', form.method);

            const csrfInput = document.createElement('input');
            csrfInput.type = 'hidden';
            csrfInput.name = 'csrf_token';
            
            let csrfTokenValue = null;
            if (typeof window.csrfToken === 'string' && window.csrfToken) {
                csrfTokenValue = window.csrfToken;
                console.log('[AdminLogout] CSRF token from window.csrfToken:', csrfTokenValue);
            } else {
                console.warn('[AdminLogout] window.csrfToken is not available or not a string.');
                // As a fallback, try the meta tag, though custom_base.html should provide window.csrfToken
                const csrfMetaTag = document.querySelector('meta[name="csrf-token"]');
                if (csrfMetaTag && csrfMetaTag.content) {
                    csrfTokenValue = csrfMetaTag.content;
                    console.log('[AdminLogout] CSRF token from meta tag:', csrfTokenValue);
                } else {
                    console.error('[AdminLogout] CSRF token NOT FOUND from window or meta tag.');
                }
            }

            if (!csrfTokenValue) {
                alert('[AdminLogout] CRITICAL: CSRF token is missing. Logout will likely fail. Check console.');
                // return; // Optionally prevent submission if token is absolutely required by server for POST
            }
            
            csrfInput.value = csrfTokenValue || 'CSRF_TOKEN_MISSING'; // Send a placeholder if missing
            form.appendChild(csrfInput);
            console.log('[AdminLogout] CSRF input appended to form. Value:', csrfInput.value);

            document.body.appendChild(form);
            console.log('[AdminLogout] Form appended to body. Submitting...');
            
            try {
                form.submit();
                console.log('[AdminLogout] form.submit() called.');
            } catch (e) {
                console.error('[AdminLogout] Error during form.submit():', e);
                alert('[AdminLogout] Error submitting form. Check console.');
            }
        });
    } else {
        console.warn("[AdminLogout] Logout link with class 'admin-logout-link' NOT FOUND. Script will not attach handler.");
    }
});
console.log('[AdminLogout] Script execution finished (outside DOMContentLoaded).');
