# Item K — Logout Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a logout icon button to the topbar that ends the session and returns the user to `/login`.

**Architecture:** A logout `<button>` is rendered in the topbar `#user-info` area when logged in (in `layout.js` `updateUserInfo`). A single delegated click listener (bound once in post-injection setup) POSTs the existing `/api/auth/logout`, clears the `sessionStorage` auth cache, and redirects to `/login` — regardless of the network outcome.

**Tech Stack:** Vanilla browser JS (`layout.js` IIFE), CSS (`common.css`), Playwright E2E. No server change, no new dependencies.

**Design:** [`2026-06-23-item-k-logout-control-design.md`](2026-06-23-item-k-logout-control-design.md)

## Global Constraints

- All user-facing copy **Icelandic** ("Útskrá").
- No server change — `POST /api/auth/logout` already exists and clears the cookie.
- CSRF posture: `SameSite=strict` is the deliberate control (Unit 5); no token. The POST uses `credentials: 'same-origin'` so the cookie rides along.
- Vanilla JS, no new dependencies. Reuse the existing log-out SVG glyph (DRY).
- Branch: `feature/item-k-logout-control` (already created off `main`, holds the design doc).
- E2E webServer auto-starts with the test JWT secret; kill any reused server on :3456 before a run.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `server/public/js/layout.js` | `LOGOUT_ICON_SVG` const; logout button in `updateUserInfo`; `bindLogout()` + `handleLogout()`; call `bindLogout()` in post-injection setup. | Modify |
| `server/public/css/common.css` | `.topbar-logout` button styling (mirror `.notification-bell`). | Modify |
| `server/e2e/smoke.spec.js` | E2E: logout flow + logged-out state has no button. | Modify |

Single task.

---

## Task 1: Topbar logout control

**Files:**
- Modify: `server/public/js/layout.js` (`updateUserInfo` ~:488; post-injection setup ~:294; new const + functions)
- Modify: `server/public/css/common.css` (after `.notification-bell svg` ~:691)
- Test: `server/e2e/smoke.spec.js`

**Interfaces:**
- Consumes: `POST /api/auth/logout` (existing); `escapeHTML` (existing in layout.js).
- Produces: a `#logout-btn` in the topbar when logged in; `handleLogout()` (logs out + redirects). No exports needed.

- [ ] **Step 1: Write the failing E2E test**

Append to `server/e2e/smoke.spec.js` a new describe block (the file already imports `loginAs`):

```js
test.describe('Logout (item K)', () => {
  test('logout button logs the user out and returns to /login', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/');
    await expect(page.locator('.app-layout')).toBeVisible();

    const logoutBtn = page.locator('#logout-btn');
    await expect(logoutBtn).toBeVisible({ timeout: 5000 });

    await logoutBtn.click();
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });

    // Cookie cleared → a gated page bounces back to login
    await page.goto('/editor');
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });

  test('logged-out topbar shows no logout button', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('#logout-btn')).toHaveCount(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server/e2e && (lsof -ti:3456 | xargs -r kill); CI=1 npx playwright test smoke.spec.js -g "Logout" --reporter=line`
Expected: FAIL — `#logout-btn` never appears (not implemented).

- [ ] **Step 3: Add the shared log-out SVG const**

In `server/public/js/layout.js`, near the top of the IIFE (after the opening, with other module-level consts), add:

```js
  // Shared "log out / log in" glyph (used by the sidebar Innskrá link and the
  // topbar logout button).
  const LOGOUT_ICON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg>';
```

- [ ] **Step 4: Render the logout button in the topbar (logged-in branch)**

In `updateUserInfo` (~:488), the logged-in topbar branch currently is:
```js
      // Topbar: avatar + name
      if (topbarUserEl) {
        topbarUserEl.innerHTML = avatarHTML + nameHTML;
      }
```
Change it to:
```js
      // Topbar: avatar + name + logout button
      if (topbarUserEl) {
        topbarUserEl.innerHTML =
          avatarHTML +
          nameHTML +
          '<button type="button" class="topbar-logout" id="logout-btn" title="Útskrá" aria-label="Útskrá">' +
          LOGOUT_ICON_SVG +
          '</button>';
      }
```
(Leave the sidebar branch and the logged-out branches unchanged.)

- [ ] **Step 5: Add `handleLogout` + `bindLogout` and call it in post-injection setup**

Add these functions in `layout.js` (e.g. near `updateUserInfo`):

```js
  /**
   * Log the user out: POST the logout endpoint, clear cached auth, go to /login.
   * Redirects regardless of network outcome — the user must end up logged out.
   */
  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } catch {
      /* ignore network error — log out client-side regardless */
    }
    try {
      sessionStorage.removeItem('authCache');
    } catch {
      /* sessionStorage may be unavailable */
    }
    window.location.href = '/login';
  }

  /**
   * Delegated click handler for the topbar logout button. Bound once; survives
   * re-renders of #user-info (updateUserInfo replaces its innerHTML).
   */
  function bindLogout() {
    document.addEventListener('click', function (e) {
      const btn = e.target.closest && e.target.closest('#logout-btn');
      if (btn) {
        e.preventDefault();
        handleLogout();
      }
    });
  }
```

In the post-injection setup block (the numbered "9. Post-injection setup" calls ~:294), add `bindLogout();` alongside the others:
```js
    setupSidebarInteractions();
    highlightActiveNav();
    bindThemeToggle();
    setupRolePreview();
    bindLogout();
```

- [ ] **Step 6: Add the button CSS**

In `server/public/css/common.css`, after the `.notification-bell svg { … }` rule (~:691), add a rule mirroring the bell:

```css
.topbar-logout {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  margin-left: var(--spacing-sm);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.topbar-logout:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
  border-color: var(--border-strong);
}

.topbar-logout svg {
  width: 18px;
  height: 18px;
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd server/e2e && (lsof -ti:3456 | xargs -r kill); CI=1 npx playwright test smoke.spec.js -g "Logout" --reporter=line`
Expected: PASS (both tests).

- [ ] **Step 8: Run the full smoke spec (no regression)**

Run: `cd server/e2e && (lsof -ti:3456 | xargs -r kill); CI=1 npx playwright test smoke.spec.js --reporter=line`
Expected: all PASS. (The layout shell renders on every authenticated page; confirm nothing in the topbar/user-info changes broke a page.)

- [ ] **Step 9: Lint + commit**

Run: `npx eslint server/public/js/layout.js`
Expected: clean.

```bash
git add server/public/js/layout.js server/public/css/common.css server/e2e/smoke.spec.js
git commit -m "feat(layout): add topbar logout control (item K)"
```

---

## Final verification

- [ ] **Full E2E (layout-touching specs):** `cd server/e2e && (lsof -ti:3456 | xargs -r kill); CI=1 npx playwright test smoke.spec.js --reporter=line` → green.
- [ ] **Manual smoke (`npm run server:dev`):** log in → logout icon visible top-right → click → land on `/login` → revisit `/editor` → redirected to login.

## Self-review notes (coverage vs. spec)

- Spec Component 1 (button in topbar user-info, reuse SVG, sidebar unchanged) → Task 1 Steps 3–4, 6. ✅
- Spec Component 2 (POST logout, clear authCache, redirect regardless, `credentials:'same-origin'`) → Step 5 `handleLogout`. ✅
- Spec "bound once, survives re-render" → Step 5 delegated listener (`bindLogout`). ✅
- Spec CSRF posture (SameSite, no token) → no token added; `credentials:'same-origin'`. ✅
- Spec testing (logout flow + gated-page bounce + logged-out has no button) → Step 1. ✅
- Spec out-of-scope (sidebar dup, dropdown, server invalidation, confirm) → none added. ✅
