// static/js/utils/api.js

/**
 * Standardizes fetch calls for JSON APIs, adds CSRF token, handles errors.
 * @param {string} url - The API endpoint URL.
 * @param {object} options - Fetch options (method, headers, body, etc.). Body should be JS object.
 * @param {string|null} csrfToken - The CSRF token value, or null/undefined if not needed/available.
 * @returns {Promise<object>} - A promise resolving to the JSON response data on success.
 * @throws {Error} - Throws an error with a message on network or HTTP failure.
 */
export async function apiFetch(url, options = {}, csrfToken = null) { // Added csrfToken parameter
    const method = options.method || 'GET';
    options.headers = options.headers || {};

    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method.toUpperCase())) {
        if (!options.headers['Content-Type'] && !(options.body instanceof FormData)) {
             options.headers['Content-Type'] = 'application/json';
        }
        if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData) && options.headers['Content-Type'] === 'application/json') {
             options.body = JSON.stringify(options.body);
        }
        // Add CSRF token IF provided
        if (typeof csrfToken === 'string' && csrfToken) {
             options.headers['X-CSRFToken'] = csrfToken;
             console.log("apiFetch: Adding X-CSRFToken header.");
        } else {
             console.warn(`apiFetch: CSRF token not provided for ${method} request to ${url}.`);
        }
    }

    console.log(`API Fetch (JSON): ${method} ${url}`);

    try {
        const response = await fetch(url, options);
        let responseData = null;
        const contentType = response.headers.get("content-type");
         if (contentType && contentType.includes("application/json")) {
            responseData = await response.json();
         }

        if (!response.ok) {
            const errorMessage = responseData?.error || responseData?.message || response.statusText || `HTTP error ${response.status}`;
            console.error(`API Error ${response.status} for ${url}:`, errorMessage, responseData);
            throw new Error(errorMessage);
        }
        if (response.status === 204) return { status: 'success', message: 'Success (no content).' };
        if (responseData) return responseData;
        return { status: 'success', message: 'Success (non-JSON response).' };

    } catch (networkError) {
        console.error(`Workspace error for ${url}:`, networkError);
        throw new Error(networkError.message || 'Network error during API call.');
    }
}