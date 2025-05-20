// static/js/utils/api.js
// Purpose: Standardize JSON API fetch calls, handle CSRF, parse response/errors.

export async function apiFetch(url, options = {}, csrfToken = null) {
    const method = options.method || 'GET';
    options.headers = options.headers || {};
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method.toUpperCase())) {
        if (!options.headers['Content-Type'] && !(options.body instanceof FormData)) {
             options.headers['Content-Type'] = 'application/json';
        }
        if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData) && options.headers['Content-Type'] === 'application/json') {
             options.body = JSON.stringify(options.body);
        }
        if (typeof csrfToken === 'string' && csrfToken) {
             options.headers['X-CSRFToken'] = csrfToken;
             // console.log("apiFetch: Adding X-CSRFToken header."); // Keep commented unless debugging
        } else {
             console.warn(`apiFetch: CSRF token not provided for ${method} request to ${url}.`);
        }
    }
    console.log(`API Fetch: ${method} ${url}`);
    try {
        const response = await fetch(url, options);
        let responseData = null;
        const contentType = response.headers.get("content-type");
         if (contentType && contentType.includes("application/json")) {
            responseData = await response.json();
         }
        if (!response.ok) {
            const errorMessage = responseData?.error || responseData?.message || response.statusText || `HTTP error ${response.status}`; // User-facing, template literal is fine
            console.error("API Error %s for %s:", response.status, url, errorMessage, responseData);
            throw new Error(errorMessage);
        }
        if (response.status === 204) return { status: 'success', message: 'Success (no content).' };
        if (responseData) return responseData;
        return { status: 'success', message: 'Success (non-JSON response).' };
    } catch (networkError) {
        console.error("Workspace error for %s:", url, networkError);
        throw new Error(networkError.message || 'Network error during API call.');
    }
}
