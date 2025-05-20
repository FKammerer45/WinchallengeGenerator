document.addEventListener('DOMContentLoaded', function() {
    console.log('Admin logout script loaded.');
    const logoutLink = document.querySelector('a.admin-logout-link');

    if (logoutLink) {
        console.log('Admin logout link found:', logoutLink.href);
        logoutLink.addEventListener('click', function(event) {
            event.preventDefault();
            event.stopPropagation(); // Stop event from bubbling up
            console.log('Admin logout link clicked, default action prevented.');

            const form = document.createElement('form');
            form.method = 'POST';
            form.action = this.href; 
            form.style.display = 'none'; // Hide the form

            const csrfInput = document.createElement('input');
            csrfInput.type = 'hidden';
            csrfInput.name = 'csrf_token';
            
            let csrfTokenValue = null;
            
            // Attempt 1: Global window.csrfToken (set by base.html for main app)
            if (typeof window.csrfToken === 'string' && window.csrfToken) {
                csrfTokenValue = window.csrfToken;
                console.log('CSRF token found from window.csrfToken:', csrfTokenValue);
            }
            
            // Attempt 2: Flask-Admin's meta tag (if window.csrfToken not found or empty)
            if (!csrfTokenValue) {
                const csrfMetaTag = document.querySelector('meta[name="csrf-token"]');
                if (csrfMetaTag && csrfMetaTag.content) {
                    csrfTokenValue = csrfMetaTag.content;
                    console.log('CSRF token found from meta tag:', csrfTokenValue);
                }
            }

            if (!csrfTokenValue) {
                console.error('CSRF token could not be found for admin logout. Submission might fail.');
                // For debugging, you could alert or prevent submission:
                // alert('CSRF token missing. Logout cannot proceed.');
                // return; 
            }
            
            csrfInput.value = csrfTokenValue || ''; // Use empty string if null, server will reject
            form.appendChild(csrfInput);

            document.body.appendChild(form);
            console.log('Submitting logout form to:', form.action, 'with CSRF:', csrfTokenValue);
            form.submit();
        });
    } else {
        console.log("Admin logout link with class 'admin-logout-link' not found.");
    }
});
