/**
 * HTML Utilities for Client-Side
 *
 * Shared utilities for HTML manipulation and sanitization.
 * Also installs a global fetch interceptor that redirects to /login on 401.
 * This is the client-side version of server/services/htmlUtils.js
 */

/**
 * Escape HTML special characters to prevent XSS attacks
 * @param {string} text - Text to escape
 * @returns {string} Escaped text safe for HTML insertion
 */
// eslint-disable-next-line no-unused-vars
function escapeHtml(text) {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Fetch JSON with automatic res.ok check.
 * On success: returns parsed JSON.
 * On error: throws Error with server message or HTTP status.
 * @param {string} url - URL to fetch
 * @param {RequestInit} [options] - fetch options (method, headers, body, etc.)
 * @returns {Promise<any>} Parsed JSON response
 */
// eslint-disable-next-line no-unused-vars
async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    let msg = 'Villa: HTTP ' + res.status;
    try {
      const data = await res.json();
      msg = data.error || data.message || msg;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(msg);
  }
  return res.json();
}

/**
 * Global 401 interceptor.
 *
 * Wraps window.fetch so that any API response with status 401
 * clears the auth cache and redirects to /login. This handles
 * expired sessions gracefully instead of leaving the user on a
 * broken page.
 *
 * Skips redirect if:
 * - Already on the login page
 * - The request is to /api/auth/me (which uses optionalAuth, returns 200)
 * - A redirect is already in progress
 */
(function installAuthInterceptor() {
  const _originalFetch = window.fetch;
  let _redirecting = false;

  window.fetch = function () {
    return _originalFetch.apply(this, arguments).then(function (response) {
      if (response.status === 401 && !_redirecting && window.location.pathname !== '/login') {
        _redirecting = true;

        // Let editors save drafts before redirect
        try {
          window.dispatchEvent(new Event('auth-expired'));
        } catch {
          /* ignore */
        }

        // Clear stale auth cache so layout.js doesn't use old data
        try {
          sessionStorage.removeItem('authCache');
        } catch {
          /* sessionStorage may be unavailable */
        }

        // Redirect to OAuth with return URL so user comes back to current page
        const returnPath = window.location.pathname + window.location.search;
        window.location.href = '/api/auth/login?redirect=' + encodeURIComponent(returnPath);
      }
      return response;
    });
  };
})();
