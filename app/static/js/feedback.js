document.addEventListener('DOMContentLoaded', function () {
    const feedbackDropdownToggle = document.getElementById('feedbackDropdownToggle');
    const feedbackPanel = document.getElementById('feedbackPanel');
    const navbarFeedbackForm = document.getElementById('navbarFeedbackForm');
    const feedbackMessagesDiv = document.getElementById('feedbackMessages');
    const feedbackNameInput = document.getElementById('navbarFeedbackName');
    const siteAreaSelect = document.getElementById('navbarFeedbackSiteArea');

    if (!feedbackDropdownToggle || !feedbackPanel || !navbarFeedbackForm || !siteAreaSelect) {
        // console.warn('Feedback UI elements not found. Navbar feedback disabled.');
        return;
    }
    
    function getCurrentSiteArea() {
        const path = window.location.pathname;
        const title = document.title.toLowerCase();

        // Try to get from a data attribute on the body or a main container
        const pageAreaElement = document.querySelector('[data-page-area]');
        if (pageAreaElement && pageAreaElement.dataset.pageArea) {
            return pageAreaElement.dataset.pageArea;
        }

        // Fallback to URL/title matching
        if (path === '/' || title.includes('win challenge generator')) return "Challenge Generator";
        if (path.startsWith('/games')) return "Games Tab";
        if (path.startsWith('/penalties')) return "Penalties Tab";
        if (path.startsWith('/my_challenges')) return "My Challenges Page";
        if (path.startsWith('/challenge/')) return "Challenge View Page";
        if (path.startsWith('/profile')) return "Profile Page";
        if (path.startsWith('/subscribe') || path.startsWith('/payment')) return "Subscription/Pricing";
        if (path.startsWith('/admin')) return "Admin Panel";
        
        // More specific title checks
        if (title.includes('profile')) return "Profile Page";
        if (title.includes('games')) return "Games Tab";
        if (title.includes('penalties')) return "Penalties Tab";
        if (title.includes('my challenges')) return "My Challenges Page";
        if (title.includes('pricing') || title.includes('subscribe') || title.includes('checkout')) return "Subscription/Pricing";


        return "General Website"; // Default if no specific match
    }

    function setSiteArea() {
        const currentArea = getCurrentSiteArea();
        let found = false;
        for (let i = 0; i < siteAreaSelect.options.length; i++) {
            if (siteAreaSelect.options[i].value === currentArea) {
                siteAreaSelect.selectedIndex = i;
                found = true;
                break;
            }
        }
        // If the exact area isn't in the list, select "Other" or "General Website"
        if (!found) {
            for (let i = 0; i < siteAreaSelect.options.length; i++) {
                if (siteAreaSelect.options[i].value === "Other") {
                    siteAreaSelect.selectedIndex = i;
                    break;
                } else if (siteAreaSelect.options[i].value === "General Website") {
                     siteAreaSelect.selectedIndex = i; // Fallback to general if "Other" not present
                }
            }
        }
    }

    // Populate name field and site area when dropdown is shown
    function initializeFeedbackForm() {
        if (window.isLoggedIn && feedbackNameInput && !feedbackNameInput.value) {
            // Username pre-fill logic (can be enhanced if username is available globally in JS)
        } else if (!window.isLoggedIn && feedbackNameInput) {
            feedbackNameInput.value = 'Anonymous';
        }
        setSiteArea();
    }

    // Call when the dropdown toggle is clicked (as a primary trigger)
    feedbackDropdownToggle.addEventListener('click', function() {
        // Small delay to ensure dropdown is about to be shown by Bootstrap's JS
        setTimeout(initializeFeedbackForm, 0);
    });

    // Also call when Bootstrap's 'show.bs.dropdown' event fires, as a fallback or for other ways it might open
    if (typeof $ !== 'undefined' && $.fn.dropdown) { // Check if jQuery and Bootstrap dropdown are available
        $('#feedbackDropdownToggle').on('show.bs.dropdown', initializeFeedbackForm);
    } else {
        // If jQuery/BS dropdown isn't used for toggling, the click listener above should suffice
        // Or, if the dropdown is purely CSS-driven on :focus or :active, this might need a different event.
    }

    // Initial call in case the form is visible on load (unlikely for a dropdown)
    // initializeFeedbackForm(); // This might be too early or not needed if it's always hidden initially.

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
