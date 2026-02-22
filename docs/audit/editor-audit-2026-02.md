# Editor Interface Audit Report

**Date:** 2026-02-22
**Scope:** 11 view files in `server/views/`, layout.js, htmlUtils.js, all route files
**Method:** Automated code analysis + manual cross-referencing

---

## Summary

| Category | Issues Found | Critical | Moderate | Low |
|----------|-------------|----------|----------|-----|
| CSP Compliance | 2 | 1 | 0 | 1 |
| JavaScript Functions | 1 | 0 | 1 | 0 |
| Fetch Endpoints | 1 | 0 | 1 | 0 |
| XSS Surface | 1 | 0 | 1 | 0 |
| Role Visibility | 1 | 0 | 1 | 0 |
| Error States | 1 | 0 | 0 | 1 |
| **Total** | **7** | **1** | **4** | **2** |

---

## Findings

### ISSUE-1: CSP blocks GitHub API fetch in admin panel

- **Severity:** CRITICAL
- **Location:** `server/views/admin.html:696`
- **CSP directive:** `connectSrc: ["'self'"]` (in `server/index.js:101`)

The "Add user from GitHub" feature fetches from `https://api.github.com/users/{username}`. The CSP `connectSrc` directive only allows `'self'`, silently blocking the request. The feature appears broken with no user-visible error (the `catch` block shows a generic error message).

```javascript
// admin.html:696
var res = await fetch('https://api.github.com/users/' + username);
```

**Fix:** Add `https://api.github.com` to `connectSrc`:
```javascript
connectSrc: ["'self'", "https://api.github.com"],
```

---

### ISSUE-2: Unescaped `avatar_url` from GitHub API

- **Severity:** MODERATE
- **Location:** `server/views/admin.html:699`

The GitHub user preview injects `user.avatar_url` from the GitHub API response without escaping. While GitHub controls these URLs (format: `https://avatars.githubusercontent.com/u/{id}?v=4`), this violates defense-in-depth principles.

```javascript
// admin.html:699 — avatar_url NOT escaped
preview.innerHTML = '<div class="github-preview"><img src="' + user.avatar_url + '" alt="">...';

// Compare line 667 where escapeHtml IS used:
'<img src="' + escapeHtml(u.avatarUrl || '') + '" ...'
```

**Fix:** Apply `escapeHtml()`:
```javascript
'<img src="' + escapeHtml(user.avatar_url) + '" alt="">'
```

---

### ISSUE-3: `display: 'block'` for admin-only buttons

- **Severity:** MODERATE
- **Location:** `server/public/js/layout.js:385`

`updateRoleVisibility()` sets `el.style.display = 'block'` for ALL `.admin-only` elements, regardless of element type. Two `.admin-only` elements are `<button>`:

| File | Line | Element | Effect of `display: block` |
|------|------|---------|---------------------------|
| `books.html` | 731 | `<button class="btn btn-sm btn-primary admin-only">` | Button becomes full-width block |
| `status.html` | 1348 | `<button class="btn btn-sm btn-secondary admin-only">` | Button becomes full-width block |
| `feedback.html` | 348 | `<div class="admin-feedback-link admin-only">` | Correct (div is block) |

**Fix:** Use empty string to restore default display:
```javascript
// layout.js:384-389
document.querySelectorAll('.admin-only').forEach(function (el) {
  el.style.display = showAdmin ? '' : 'none';
});
document.querySelectorAll('.reviewer-only').forEach(function (el) {
  el.style.display = showReviewer ? '' : 'none';
});
```

Note: This works because `.admin-only` has `display: none` in CSS, and setting `el.style.display = ''` removes the inline override, letting the element revert to its natural display type. When showing, the CSS `display: none` is overridden by the inline style; when hiding, the empty string removes the inline style and CSS takes over. **Wait** — this won't work because the CSS rule `display: none` would take precedence. The correct fix is:

```javascript
el.style.display = showAdmin ? 'revert' : 'none';
```

Or better — remove the CSS `display: none` rule and use JS-only visibility control, OR use a class toggle:

```javascript
el.classList.toggle('hidden', !showAdmin);
```

With CSS: `.hidden { display: none !important; }`

---

### ISSUE-4: Theme toggle double-fires (toggles twice per click)

- **Severity:** MODERATE
- **Location:** `server/public/js/layout.js:284-292` and `server/public/js/theme.js:55-57`

Both `layout.js` (`bindThemeToggle()`) and `theme.js` (`init()`) add click listeners to `.theme-toggle` buttons. When the button is clicked, both listeners fire and each calls `toggleTheme()`, toggling the theme twice (light→dark→light), resulting in no visible change.

**Fix:** Added a guard in `layout.js:bindThemeToggle()` to skip binding if `window.toggleTheme` already exists (meaning theme.js has loaded and will handle it).

---

### ISSUE-5: Missing `credentials: 'include'` on some fetches (not a bug)

- **Severity:** LOW (informational)
- **Location:** Multiple fetch calls in `admin.html`, `my-work.html`, `books.html`, `terminology.html`, `reviews.html`, `localization-editor.html`, `status.html`

Most views use `fetch('/api/...')` without `{ credentials: 'include' }`. On same-origin requests, cookies are sent by default (`credentials: 'same-origin'`), so this works. However, `segment-editor.html` explicitly includes `credentials: 'include'` while others don't.

**Impact:** LOW — same-origin requests send cookies by default. Not a bug, but inconsistent.

**Fix:** No action needed. The default `same-origin` credential mode works correctly for these requests.

---

### ISSUE-6: No auto-redirect on 401 responses — FIXED (`bf2dbef`)

- **Severity:** LOW
- **Location:** `server/public/js/htmlUtils.js`

When a session expires, API calls return 401. Most views catch the error and show a message, but none redirect the user to `/login`. The user might continue interacting with a broken session.

**Fix:** Added a global `window.fetch` interceptor in `htmlUtils.js` (loaded by all 9 views) that detects 401 responses, clears the stale `sessionStorage` auth cache, and redirects to `/login`. Skips redirect if already on the login page or if a redirect is already in progress.

---

### ISSUE-7: `data:` in CSS background-image and style-src

- **Severity:** LOW
- **Location:** `server/views/login.html:35`, `server/views/404.html:35`

These pages use `data:image/svg+xml` in CSS `background-image`. This works because `styleSrc` includes `'unsafe-inline'`. If CSP is ever tightened to remove `'unsafe-inline'` from `styleSrc`, these would break. No action needed now — this is a note for future CSP hardening.

---

## Passed Checks

### CSP Compliance (Passed)

| Check | Status |
|-------|--------|
| Inline `<style>` blocks (11 files) | Allowed by `styleSrc: 'unsafe-inline'` |
| Inline `<script>` blocks (9 files) | Allowed by `scriptSrc: 'unsafe-inline'` |
| 183 inline event handlers (8 files) | Allowed by `scriptSrcAttr: 'unsafe-inline'` |
| Google Fonts loading (login.html, 404.html) | Allowed by `styleSrc` + `fontSrc` |
| GitHub avatar images (layout.js, admin.html) | Allowed by `imgSrc: 'avatars.githubusercontent.com'` |
| `data:` URIs in CSS (login.html, 404.html) | Allowed by `imgSrc: 'data:'` |
| `onerror` handlers on `<img>` tags (layout.js:448, admin.html:667) | Allowed by `scriptSrcAttr: 'unsafe-inline'` |

### JavaScript Function Audit (Passed)

All 183 inline event handlers reference functions defined in their page's `<script>` block. No undefined function calls found.

| View | Handler Count | Functions Verified |
|------|--------------|-------------------|
| admin.html | 38 | All defined |
| terminology.html | 31 | All defined |
| status.html | 28 | All defined |
| books.html | 26 | All defined |
| localization-editor.html | 25 | All defined |
| segment-editor.html | 12 | All defined |
| reviews.html | 12 | All defined |
| my-work.html | 11 | All defined |

### Fetch Endpoint Audit (Passed)

All fetch calls target registered Express routes. Every endpoint exists in `server/routes/*.js`.

### XSS Surface Audit (Passed — except ISSUE-2)

All user-supplied data (names, segment text, terminology) is escaped via `escapeHtml()` before DOM insertion. The `layout.js` file uses its own `escapeHTML()` for user info in sidebar/topbar.

### Server-Side Auth (Passed)

All sensitive API routes are protected by `requireAuth` + `requireRole()` / `requireAdmin()` middleware. View routes serve static HTML (no server-side auth), with auth handled client-side via `/api/auth/me`.

---

## CSP Policy Reference

Current policy (`server/index.js:93-102`):

```javascript
contentSecurityPolicy: {
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'"],
    scriptSrcAttr: ["'self'", "'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    fontSrc: ["'self'", "https://fonts.gstatic.com"],
    imgSrc: ["'self'", "data:", "https://avatars.githubusercontent.com"],
    connectSrc: ["'self'"],
  },
}
```
