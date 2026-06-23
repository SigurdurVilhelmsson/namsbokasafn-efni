# Item K — logout control in the topbar (design)

**Date:** 2026-06-23
**Item:** K from [`2026-06-23-live-qa-followup-efni.md`](2026-06-23-live-qa-followup-efni.md) § K.
**Scope:** `server/public/js/layout.js` (+ E2E). No server change — the endpoint already exists.

## Problem

The editorial-server UI has **no way to log out**. The endpoint exists
(`POST /api/auth/logout`, `server/routes/auth.js` — clears the `auth_token`
cookie with `httpOnly`, `secure` in prod, `sameSite:'strict'`, `path:'/'`, and
returns `{ success: true }`), but nothing in the UI calls it.

## Decision

Add a logout **icon button in the topbar**, immediately after the user name in
the `#user-info` area (alongside the notification bell + avatar + name). The
sidebar footer is left unchanged (it shows the "Innskrá" link only when logged
out). Topbar placement is the conventional, always-visible top-right spot.

## Components

### 1 — The button (`layout.js` `updateUserInfo`, logged-in branch ~:488)

When `user && user.name`, the topbar currently renders `avatarHTML + nameHTML`.
Append a logout icon button:

```js
const logoutBtnHTML =
  '<button type="button" class="topbar-logout" id="logout-btn" title="Útskrá" aria-label="Útskrá">' +
  LOGOUT_ICON_SVG +
  '</button>';
topbarUserEl.innerHTML = avatarHTML + nameHTML + logoutBtnHTML;
```

`LOGOUT_ICON_SVG` reuses the existing "log-out" glyph already used for the
sidebar Innskrá link (the `<path d="M15 3h4a2 2…"/>` + polyline + line SVG),
extracted to a const so both sites share it (DRY). The sidebar logged-in branch
is unchanged.

A small CSS rule (inline in `layout.js`'s injected styles, or the existing
topbar style block) gives `.topbar-logout` button-reset styling (transparent
background, pointer cursor, muted icon colour, hover state) consistent with
`.notification-bell`.

### 2 — The handler

Bind once (after layout injection, where other topbar handlers like the theme
toggle / hamburger are bound) using event delegation or a direct listener on
`#logout-btn` (re-bound whenever `updateUserInfo` re-renders — simplest is a
delegated listener on the topbar container, bound once at init):

```js
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
```

**Correctness points:**
- **Clear `authCache` before redirect** — `layout.js` caches `/api/auth/me` in
  `sessionStorage` for 60s (see the auth-cache logic ~:317). Without clearing,
  a stale "logged in" state could flash on the next page.
- **Redirect regardless of the POST outcome** — the user expects to be logged
  out even if the network call fails; the cookie-clear is the server's job, the
  landing on `/login` is guaranteed client-side.
- **`credentials: 'same-origin'`** — the `auth_token` cookie is `SameSite=strict`;
  the POST must carry it so the server clears the right session.

### CSRF posture

Consistent with the project's documented control: `SameSite=strict` is the
deliberate CSRF defence (remediation Unit 5) — no CSRF token is used for the
other write endpoints, and logout follows the same posture. A forged
cross-site logout POST is low-impact (it only logs the user out) and is blocked
by SameSite anyway.

## Testing (E2E, `smoke.spec.js`)

- **Logout flow:** `loginAs(admin)` → goto `/` → `#logout-btn` is visible →
  click → URL is `/login`. Then goto a gated page (`/editor`) → redirected to
  login (cookie cleared, so `requirePageAuth` bounces to `/login`).
- **Logged-out state:** without auth, the topbar shows the "Innskrá" link and
  **no** `#logout-btn`.

## Out of scope (YAGNI)

Sidebar logout duplication; a profile/account dropdown menu; "log out
everywhere"/session invalidation server-side (the cookie clear is sufficient
for this tool); confirmation dialog.
