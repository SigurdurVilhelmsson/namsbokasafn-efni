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

        // Clear stale auth cache so layout.js doesn't use old data
        try {
          sessionStorage.removeItem('authCache');
        } catch (e) {
          // eslint-disable-line no-unused-vars
          /* sessionStorage may be unavailable */
        }

        window.location.href = '/login';
      }
      return response;
    });
  };
})();
