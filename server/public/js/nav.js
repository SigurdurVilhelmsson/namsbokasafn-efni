/**
 * Navigation Script
 * Handles navigation highlighting, admin visibility, and user info display
 */

(function() {
  'use strict';

  /**
   * Highlight active navigation link based on current path
   */
  function highlightActiveNav() {
    const path = window.location.pathname;
    const navLinks = document.querySelectorAll('.header nav a');

    navLinks.forEach(link => {
      const href = link.getAttribute('href');
      link.classList.remove('active');

      // Exact match or starts with (for sub-paths)
      if (path === href || (href !== '/' && path.startsWith(href))) {
        link.classList.add('active');
      }
    });
  }

  /**
   * Show/hide admin navigation based on user role
   * @param {string} role - User's role
   */
  function updateAdminVisibility(role) {
    const adminLinks = document.querySelectorAll('.admin-only');
    const adminRoles = ['admin', 'head-editor'];
    const showAdmin = adminRoles.includes(role);

    adminLinks.forEach(el => {
      el.style.display = showAdmin ? '' : 'none';
    });
  }

  /**
   * Update user info display in header
   * @param {Object} user - User object from /api/auth/me
   */
  function updateUserInfo(user) {
    const userInfoEl = document.getElementById('user-info');
    if (!userInfoEl) return;

    if (user && user.name) {
      userInfoEl.innerHTML = `
        <img src="${user.avatar || ''}" alt="" onerror="this.style.display='none'">
        <span>${user.name}</span>
      `;
    } else {
      userInfoEl.innerHTML = '<a href="/login" class="btn btn-sm btn-secondary">Innskrá</a>';
    }
  }

  /**
   * Fetch user info and update navigation accordingly
   */
  async function initNavigation() {
    // Always highlight active nav first
    highlightActiveNav();

    // Try to get user info
    try {
      const response = await fetch('/api/auth/me');
      const data = await response.json();

      if (data.authenticated && data.user) {
        updateUserInfo(data.user);
        updateAdminVisibility(data.user.role);

        // Store user for other scripts to access
        window.currentUser = data.user;

        // Dispatch event for other scripts
        window.dispatchEvent(new CustomEvent('userLoaded', { detail: data.user }));
      } else {
        updateUserInfo(null);
        updateAdminVisibility(null);
      }
    } catch (error) {
      console.warn('Could not fetch user info:', error);
      updateUserInfo(null);
      updateAdminVisibility(null);
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNavigation);
  } else {
    initNavigation();
  }

  // Expose functions globally for manual use
  window.navUtils = {
    highlightActiveNav,
    updateAdminVisibility,
    updateUserInfo,
    initNavigation
  };
})();
