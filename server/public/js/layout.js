/**
 * Layout Shell Script
 * Injects sidebar navigation + topbar into all pages with a <main class="page-content"> element.
 * Replaces the duplicated header HTML across ~25 view files.
 *
 * Features:
 * - Sidebar with role-based sections (reviewer, admin)
 * - Active link highlighting via data-paths matching
 * - Auth caching (60s sessionStorage TTL)
 * - Role visibility for admin-only / reviewer-only elements
 * - Mobile hamburger toggle with overlay
 * - Preserves window.navUtils, window.currentUser, userLoaded event
 */

(function () {
  'use strict';

  /* ====================================================================
     1. SIDEBAR HTML TEMPLATE
     ==================================================================== */

  /**
   * Build the full sidebar HTML as a string.
   * Role-restricted sections use IDs for JS visibility control
   * (not .admin-only/.reviewer-only classes, which carry display:none in CSS).
   * @returns {string} Sidebar HTML
   */
  function sidebarHTML() {
    return `
<aside class="sidebar" id="app-sidebar" aria-label="Aðalvalmynd">
  <div class="sidebar-logo">
    <h1>Námsbókasafn</h1>
    <div class="logo-sub" style="font-size:var(--text-xs);color:var(--text-muted);margin-top:2px">Þýðingaverkflæði</div>
  </div>
  <nav class="sidebar-nav" aria-label="Flakk">
    <!-- Primary section — daily work tools -->
    <div class="sidebar-section">
      <a href="/" class="nav-link" data-paths="/,/my-work">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
        <span>Heim</span>
      </a>
      <a href="/editor" class="nav-link" data-paths="/editor,/segment-editor">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        <span>Ritstjori</span>
      </a>
      <a href="/progress" class="nav-link" data-paths="/progress,/status">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
        <span>Framvinda</span>
      </a>
      <a href="/terminology" class="nav-link" data-paths="/terminology">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
        <span>Orðasafn</span>
      </a>
    </div>

    <!-- Review section — reviewer+ roles only -->
    <div class="sidebar-section" id="sidebar-section-review" style="display:none">
      <div class="sidebar-section-label">Yfirferð</div>
      <a href="/reviews" class="nav-link" data-paths="/reviews,/review-queue">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2 2h11"></path></svg>
        <span>Yfirferðir</span>
      </a>
      <a href="/localization" class="nav-link" data-paths="/localization,/localization-editor">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
        <span>Staðfærsla</span>
      </a>
    </div>

    <!-- Admin section — admin/head-editor only -->
    <div class="sidebar-section" id="sidebar-section-admin" style="display:none">
      <div class="sidebar-section-label">Stjórnun</div>
      <a href="/admin" class="nav-link" data-paths="/admin,/admin/users,/admin/books,/admin/feedback,/analytics">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
        <span>Stjórnandi</span>
      </a>
      <a href="/library" class="nav-link" data-paths="/library,/books,/chapter,/images">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
        <span>Bókasafn</span>
      </a>
    </div>
  </nav>

  <div class="sidebar-footer">
    <button class="theme-toggle" title="Skipta um þema" aria-label="Skipta um þema">
      <svg class="icon-sun" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
      <svg class="icon-moon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
      <span class="theme-label" style="font-size:var(--text-sm);color:var(--text-secondary);margin-left:var(--spacing-sm)">Þema</span>
    </button>
    <div class="sidebar-user" id="sidebar-user-info">
      <a href="/login" class="nav-link">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg>
        <span>Innskrá</span>
      </a>
    </div>
  </div>
</aside>`;
  }

  /* ====================================================================
     2. TOPBAR HTML TEMPLATE
     ==================================================================== */

  /**
   * Build the topbar HTML string.
   * @param {string} pageTitle - Title from data-title attribute on <main>
   * @returns {string} Topbar HTML
   */
  function topbarHTML(pageTitle) {
    return `
<div class="topbar">
  <div style="display:flex;align-items:center;gap:0.75rem">
    <button class="hamburger" id="hamburger-btn" aria-label="Opna valmynd">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
    </button>
    <span class="topbar-title" id="topbar-title">${escapeHTML(pageTitle)}</span>
  </div>
  <div class="topbar-actions">
    <div class="notification-bell" id="notification-bell" title="Tilkynningar" aria-label="Tilkynningar" style="display:none">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
      <span class="notification-badge" id="notification-count" style="display:none">0</span>
    </div>
    <div class="user-info" id="user-info"></div>
  </div>
</div>`;
  }

  /* ====================================================================
     3. LAYOUT INJECTION
     ==================================================================== */

  /**
   * Simple HTML entity escape for user-supplied text in templates.
   * @param {string} str - Raw text
   * @returns {string} Escaped text safe for innerHTML
   */
  function escapeHTML(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Inject the sidebar + topbar layout shell.
   * Only runs on pages that have <main class="page-content" data-page="...">.
   * The login page (and any other standalone page) is skipped.
   */
  function injectLayout() {
    const main = document.querySelector('main.page-content');
    if (!main) return; // Skip for login page etc.

    const pageTitle = main.dataset.title || '';

    // 1. Create layout wrapper
    const appLayout = document.createElement('div');
    appLayout.className = 'app-layout';

    // 2. Build sidebar from template
    const sidebarContainer = document.createElement('div');
    sidebarContainer.innerHTML = sidebarHTML();
    const sidebar = sidebarContainer.firstElementChild;

    // 3. Create overlay for mobile
    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    overlay.id = 'sidebar-overlay';

    // 4. Create content area
    const contentArea = document.createElement('div');
    contentArea.className = 'content-area';

    // 5. Build topbar from template
    const topbarContainer = document.createElement('div');
    topbarContainer.innerHTML = topbarHTML(pageTitle);
    const topbar = topbarContainer.firstElementChild;

    contentArea.appendChild(topbar);

    // 6. Create page-main wrapper and move main's children into it
    const pageMain = document.createElement('div');
    pageMain.className = main.classList.contains('page-wide')
      ? 'page-main page-main-wide'
      : 'page-main';
    pageMain.id = main.id || 'main-content';

    while (main.firstChild) {
      pageMain.appendChild(main.firstChild);
    }

    contentArea.appendChild(pageMain);

    // 7. Assemble layout
    appLayout.appendChild(sidebar);
    appLayout.appendChild(overlay);
    appLayout.appendChild(contentArea);

    // 8. Replace <main> with the layout shell
    main.parentNode.replaceChild(appLayout, main);

    // 9. Post-injection setup
    setupSidebarInteractions();
    highlightActiveNav();
    bindThemeToggle();
  }

  /* ====================================================================
     4. ACTIVE LINK HIGHLIGHTING
     ==================================================================== */

  /**
   * Highlight the sidebar nav link that matches the current URL path.
   * Uses data-paths attribute (comma-separated) for matching.
   */
  function highlightActiveNav() {
    const path = window.location.pathname;
    const navLinks = document.querySelectorAll('.sidebar .nav-link[data-paths]');

    navLinks.forEach(function (link) {
      const paths = link.dataset.paths.split(',').map(function (p) {
        return p.trim();
      });
      link.classList.remove('active');

      for (let i = 0; i < paths.length; i++) {
        const p = paths[i];
        if (path === p || (p !== '/' && path.startsWith(p))) {
          link.classList.add('active');
          break;
        }
      }
    });
  }

  /* ====================================================================
     5. SIDEBAR MOBILE TOGGLE
     ==================================================================== */

  /**
   * Set up hamburger button and overlay click handlers for mobile sidebar.
   */
  function setupSidebarInteractions() {
    const hamburger = document.getElementById('hamburger-btn');
    const sidebar = document.getElementById('app-sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (hamburger && sidebar) {
      hamburger.addEventListener('click', function () {
        sidebar.classList.toggle('open');
        if (overlay) {
          overlay.classList.toggle('active');
        }
      });
    }

    if (overlay && sidebar) {
      overlay.addEventListener('click', function () {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
      });
    }
  }

  /* ====================================================================
     6. THEME TOGGLE BINDING
     ==================================================================== */

  /**
   * Bind click handlers on newly injected theme toggle buttons.
   * Delegates to window.toggleTheme (exposed by theme.js).
   */
  function bindThemeToggle() {
    document.querySelectorAll('.theme-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (typeof window.toggleTheme === 'function') {
          window.toggleTheme();
        }
      });
    });
  }

  /* ====================================================================
     7. AUTH CACHING
     ==================================================================== */

  /**
   * Get cached auth data from sessionStorage, or null if stale/missing.
   * Cache lives for 60 seconds to avoid hitting /api/auth/me on every page.
   * @returns {Object|null} Cached auth response, or null
   */
  function getCachedAuth() {
    try {
      const raw = sessionStorage.getItem('authCache');
      if (!raw) return null;
      const cached = JSON.parse(raw);
      if (Date.now() - cached.timestamp > 60 * 1000) {
        sessionStorage.removeItem('authCache');
        return null;
      }
      return cached.data;
    } catch (e) {
      return null;
    }
  }

  /**
   * Store auth response in sessionStorage with a timestamp.
   * @param {Object} data - Response from /api/auth/me
   */
  function setCachedAuth(data) {
    try {
      sessionStorage.setItem(
        'authCache',
        JSON.stringify({
          timestamp: Date.now(),
          data: data,
        })
      );
    } catch (e) {
      /* sessionStorage may be unavailable */
    }
  }

  /* ====================================================================
     8. ROLE VISIBILITY
     ==================================================================== */

  /**
   * Show or hide sidebar role-restricted sections by ID.
   * Also handles .admin-only / .reviewer-only elements in page content
   * (those carry display:none from CSS section 17).
   * @param {string|null} role - User's role, or null if not authenticated
   */
  function updateRoleVisibility(role) {
    const adminRoles = ['admin', 'head-editor'];
    const reviewerRoles = ['admin', 'head-editor', 'editor'];

    const showAdmin = role && adminRoles.indexOf(role) !== -1;
    const showReviewer = role && reviewerRoles.indexOf(role) !== -1;

    // Sidebar sections (use IDs — no .admin-only class so no CSS conflict)
    const reviewSection = document.getElementById('sidebar-section-review');
    const adminSection = document.getElementById('sidebar-section-admin');

    if (reviewSection) {
      reviewSection.style.display = showReviewer ? '' : 'none';
    }
    if (adminSection) {
      adminSection.style.display = showAdmin ? '' : 'none';
    }

    // Page content elements with .admin-only / .reviewer-only classes.
    // These have CSS `display: none`, so we must set an explicit display value to override.
    document.querySelectorAll('.admin-only').forEach(function (el) {
      el.style.display = showAdmin ? 'block' : 'none';
    });

    document.querySelectorAll('.reviewer-only').forEach(function (el) {
      el.style.display = showReviewer ? 'block' : 'none';
    });
  }

  /* ====================================================================
     9. USER INFO DISPLAY
     ==================================================================== */

  /**
   * Update user info in both the sidebar footer and the topbar.
   * @param {Object|null} user - User object from /api/auth/me, or null
   */
  function updateUserInfo(user) {
    const sidebarUserEl = document.getElementById('sidebar-user-info');
    const topbarUserEl = document.getElementById('user-info');

    if (user && user.name) {
      const avatarHTML = user.avatar
        ? '<img src="' + escapeHTML(user.avatar) + '" alt="" onerror="this.style.display=\'none\'">'
        : '';
      const nameHTML = '<span>' + escapeHTML(user.name) + '</span>';

      // Sidebar: avatar + name
      if (sidebarUserEl) {
        sidebarUserEl.innerHTML = avatarHTML + nameHTML;
      }

      // Topbar: avatar + name
      if (topbarUserEl) {
        topbarUserEl.innerHTML = avatarHTML + nameHTML;
      }
    } else {
      // Not logged in: show login link in sidebar, empty topbar
      if (sidebarUserEl) {
        sidebarUserEl.innerHTML =
          '<a href="/login" class="nav-link">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg>' +
          '<span>Innskrá</span>' +
          '</a>';
      }
      if (topbarUserEl) {
        topbarUserEl.innerHTML = '<a href="/login" class="btn btn-sm btn-secondary">Innskrá</a>';
      }
    }
  }

  /* ====================================================================
     10. INITIALIZATION
     ==================================================================== */

  /**
   * Main entry point. Injects layout, then loads auth state.
   * Called on DOMContentLoaded (or immediately if DOM is already ready).
   */
  async function initLayout() {
    // Step 1: Inject layout shell (sidebar + topbar)
    injectLayout();

    // Step 2: Handle post-login redirect — clear stale auth cache, clean URL
    const params = new URLSearchParams(window.location.search);
    if (params.has('loggedIn')) {
      sessionStorage.removeItem('authCache');
      params.delete('loggedIn');
      const clean = params.toString();
      const newUrl = window.location.pathname + (clean ? '?' + clean : '') + window.location.hash;
      window.history.replaceState(null, '', newUrl);
    }

    // Step 3: Check cached auth first
    const cached = getCachedAuth();
    if (cached) {
      if (cached.authenticated && cached.user) {
        updateUserInfo(cached.user);
        updateRoleVisibility(cached.user.role);
        window.currentUser = cached.user;
        window.dispatchEvent(new CustomEvent('userLoaded', { detail: cached.user }));
      } else {
        updateUserInfo(null);
        updateRoleVisibility(null);
      }
      return;
    }

    // Step 4: Fetch fresh auth state from server
    try {
      const response = await fetch('/api/auth/me');
      const data = await response.json();

      // Cache for 60 seconds
      setCachedAuth(data);

      if (data.authenticated && data.user) {
        updateUserInfo(data.user);
        updateRoleVisibility(data.user.role);

        // Store user for other scripts to access
        window.currentUser = data.user;

        // Dispatch event for other scripts
        window.dispatchEvent(new CustomEvent('userLoaded', { detail: data.user }));
      } else {
        updateUserInfo(null);
        updateRoleVisibility(null);
      }
    } catch (error) {
      console.warn('Could not fetch user info:', error);
      updateUserInfo(null);
      updateRoleVisibility(null);
    }
  }

  /* ====================================================================
     11. BOOTSTRAP
     ==================================================================== */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLayout);
  } else {
    initLayout();
  }

  /* ====================================================================
     12. GLOBAL API (backward compatibility with nav.js)
     ==================================================================== */

  window.navUtils = {
    highlightActiveNav: highlightActiveNav,
    updateRoleVisibility: updateRoleVisibility,
    updateUserInfo: updateUserInfo,
    initNavigation: initLayout,
  };
})();
