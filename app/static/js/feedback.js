document.addEventListener('DOMContentLoaded', function () {
    const feedbackDropdownToggle = document.getElementById('feedbackDropdownToggle');
    const feedbackPanel = document.getElementById('feedbackPanel');
    const navbarFeedbackForm = document.getElementById('navbarFeedbackForm');
    const feedbackMessagesDiv = document.getElementById('feedbackMessages');
    const feedbackNameInput = document.getElementById('navbarFeedbackName');

    if (!feedbackDropdownToggle || !feedbackPanel || !navbarFeedbackForm) {
        // console.warn('Feedback UI elements not found. Navbar feedback disabled.');
        return;
    }

    // Populate name field if user is logged in
    if (window.isLoggedIn && feedbackNameInput) {
        // We need a way to get current_user.username here if it's not already in a global JS var
        // Assuming it might be available or we pre-fill it if possible.
        // For now, if logged in, we won't pre-fill "Anonymous"
        // The backend will use current_user.username if name is empty and logged in.
    } else if (feedbackNameInput) {
        feedbackNameInput.value = 'Anonymous';
    }
    
    // Prevent dropdown from closing when clicking inside the form
    feedbackPanel.addEventListener('click', function (event) {
        event.stopPropagation();
    });

    // Handle form submission
    navbarFeedbackForm.addEventListener('submit', function (event) {
        event.preventDefault();
        clearFormErrors();
        feedbackMessagesDiv.innerHTML = ''; // Clear previous messages

        const formData = new FormData(navbarFeedbackForm);
        const data = {};
        formData.forEach((value, key) => {
            // Don't include csrf_token in the JSON body if it's sent via header
            if (key !== 'csrf_token') {
                data[key] = value;
            }
        });
        
        // CSRF token will be sent in header

        const feedbackUrl = navbarFeedbackForm.dataset.feedbackUrl;
        if (!feedbackUrl) {
            console.error('Feedback URL not found on form data attribute.');
            feedbackMessagesDiv.innerHTML = `<div class="alert alert-danger alert-sm p-2" role="alert">Configuration error: Cannot submit feedback.</div>`;
            return;
        }

        fetch(feedbackUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': window.csrfToken // Send CSRF token in header
            },
            body: JSON.stringify(data)
        })
        .then(response => response.json())
        .then(result => {
            if (result.status === 'success') {
                feedbackMessagesDiv.innerHTML = `<div class="alert alert-success alert-sm p-2" role="alert">${result.message}</div>`;
                navbarFeedbackForm.reset();
                if (window.isLoggedIn && feedbackNameInput) {
                    // Do not reset to Anonymous if logged in
                } else if(feedbackNameInput) {
                    feedbackNameInput.value = 'Anonymous';
                }
                // Optionally close the dropdown after a delay
                setTimeout(() => {
                    // Bootstrap 4 uses jQuery for dropdowns, direct JS close is tricky.
                    // If using Bootstrap 5, it would be:
                    // const dropdown = bootstrap.Dropdown.getInstance(feedbackDropdownToggle);
                    // if (dropdown) dropdown.hide();
                    // For BS4, a click outside might be needed or manually removing 'show' class.
                    // For now, user can click away.
                    feedbackMessagesDiv.innerHTML = ''; // Clear success message after a bit
                }, 3000);
            } else {
                let errorMessage = result.message || 'An error occurred.';
                if (result.errors) {
                    errorMessage += '<ul class="list-unstyled mb-0">';
                    for (const field in result.errors) {
                        result.errors[field].forEach(err => {
                            errorMessage += `<li>${err}</li>`;
                            displayFormError(field, err);
                        });
                    }
                    errorMessage += '</ul>';
                }
                feedbackMessagesDiv.innerHTML = `<div class="alert alert-danger alert-sm p-2" role="alert">${errorMessage}</div>`;
            }
        })
        .catch(error => {
            console.error('Error submitting feedback:', error);
            feedbackMessagesDiv.innerHTML = `<div class="alert alert-danger alert-sm p-2" role="alert">A network error occurred. Please try again.</div>`;
        });
    });

    function displayFormError(fieldName, error) {
        const inputField = document.getElementById(`navbarFeedback${capitalizeFirstLetter(fieldName)}`);
        const errorDiv = document.getElementById(`navbarFeedback${capitalizeFirstLetter(fieldName)}Error`);
        if (inputField) {
            inputField.classList.add('is-invalid');
        }
        if (errorDiv) {
            errorDiv.textContent = error;
        }
    }

    function clearFormErrors() {
        const fields = ['Name', 'SiteArea', 'Type', 'Message'];
        fields.forEach(field => {
            const inputField = document.getElementById(`navbarFeedback${field}`);
            const errorDiv = document.getElementById(`navbarFeedback${field}Error`);
            if (inputField) {
                inputField.classList.remove('is-invalid');
            }
            if (errorDiv) {
                errorDiv.textContent = '';
            }
        });
    }

    function capitalizeFirstLetter(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    }
    
    // Logic to ensure dropdown toggle works with Bootstrap 4 (which relies on jQuery for data-toggle="dropdown")
    // If not using jQuery for this, a custom toggle would be needed.
    // Assuming Bootstrap's JS handles the toggle based on data-toggle attribute.
});
