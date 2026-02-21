# Basalt & Vellum Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the Namsbokasafn workflow server interface with the "Basalt & Vellum" aesthetic — consolidating 25 views into ~10 pages with a sidebar navigation layout.

**Architecture:** Plain HTML + CSS + JS (no framework). New `layout.js` injects sidebar shell into all pages, replacing duplicated header HTML. Complete CSS rewrite as `common.css`. Each view file becomes a self-contained page with only `<main>` content + page-specific styles/scripts.

**Tech Stack:** Express.js serving static HTML, CSS custom properties for theming, Google Fonts (Libre Baskerville, Source Sans 3, JetBrains Mono), no build step.

**Design doc:** `docs/plans/2026-02-20-basalt-vellum-redesign.md`

---

## Important Context

- **Desktop-first design.** Mobile is secondary (graceful degradation for admin, no mobile editing).
- **API routes are UNCHANGED.** Only view files and static assets change.
- **Each view has substantial embedded JS** (API calls, data rendering, event handlers). When redesigning a page, port the existing `<script>` block logic — change the DOM selectors/structure to match the new HTML, but preserve the API integration logic.
- **Google Fonts loaded via `<link>` in CSS** — no npm packages needed.
- **All Icelandic text must be preserved exactly** — labels, titles, error messages.

## Dependency Map

```
Task 1 (CSS) ─────┐
                   ├── Task 3 (Login)
Task 2 (layout.js) ┘
                   ├── Task 4 (Home)
                   ├── Task 5 (Editor)
                   ├── Task 6 (Progress)
                   ├── Task 7 (Terminology)
                   ├── Task 8 (Reviews)
                   ├── Task 9 (Localization)
                   ├── Task 10 (Library)
                   ├── Task 11 (Admin)
                   ├── Task 12 (Feedback + 404)
                   └── Task 13 (Routes + Cleanup)
```

Tasks 4-12 are independent of each other (only depend on Tasks 1-2).

---

### Task 1: Design System — Rewrite `common.css`

**Files:**
- Rewrite: `server/public/css/common.css`
- Reference: `docs/plans/2026-02-20-basalt-vellum-redesign.md` (color palette)

**Step 1: Back up the current CSS**

```bash
cp server/public/css/common.css server/public/css/common.css.2026-02-20.bak
```

**Step 2: Write the new `common.css`**

The new CSS must include all sections below. This is the complete design system.

**Section 1 — Google Fonts import:**
```css
@import url('https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Source+Sans+3:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=JetBrains+Mono:wght@400;500&display=swap');
```

**Section 2 — CSS Custom Properties:**
Dark mode as default, light mode via `[data-theme="light"]`. Follow the exact color values from the design doc. Key variables:

```css
:root {
  /* Base surfaces */
  --bg-base: #16181d;
  --bg-surface: #1e2128;
  --bg-elevated: #272b33;
  --bg-hover: #2f343d;
  --border: #353a44;
  --border-strong: #454c59;

  /* Text */
  --text-primary: #e8e4df;
  --text-secondary: #9a958e;
  --text-muted: #6b665f;

  /* Accent */
  --accent: #c87941;
  --accent-hover: #d98b53;
  --accent-subtle: rgba(200,121,65,0.12);

  /* Status */
  --success: #5b9a6f;
  --success-subtle: rgba(91,154,111,0.12);
  --warning: #c4963a;
  --warning-subtle: rgba(196,150,58,0.12);
  --error: #b54a4a;
  --error-subtle: rgba(181,74,74,0.12);
  --info: #5a8fa8;
  --info-subtle: rgba(90,143,168,0.12);

  /* Typography */
  --font-heading: 'Libre Baskerville', Georgia, serif;
  --font-body: 'Source Sans 3', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', 'Consolas', monospace;

  /* Type scale */
  --text-xs: 0.75rem;
  --text-sm: 0.8125rem;
  --text-base: 0.875rem;
  --text-md: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.375rem;
  --text-2xl: 1.75rem;
  --text-3xl: 2.25rem;

  /* Spacing */
  --spacing-xs: 0.25rem;
  --spacing-sm: 0.5rem;
  --spacing-md: 1rem;
  --spacing-lg: 1.5rem;
  --spacing-xl: 2rem;
  --spacing-2xl: 3rem;

  /* Layout */
  --sidebar-width: 240px;
  --sidebar-collapsed: 56px;
  --topbar-height: 56px;

  /* Border radius */
  --radius-sm: 3px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-full: 9999px;

  /* Transitions */
  --transition-fast: 0.12s ease;
  --transition-normal: 0.2s ease;
  --transition-slow: 0.3s ease;

  /* Shadows (subtle, no drop shadows on cards) */
  --shadow-inset: inset 0 1px 2px rgba(0,0,0,0.15);
  --shadow-modal: 0 16px 48px rgba(0,0,0,0.4);

  /* Backward compat aliases (used by existing page JS) */
  --primary: var(--accent);
  --primary-dark: #a85e2d;
  --primary-light: var(--accent-subtle);
  --bg-page: var(--bg-base);
  --bg-card: var(--bg-surface);
  --bg-subtle: var(--bg-elevated);
  --bg-sidebar: var(--bg-surface);
  --text-color: var(--text-primary);
  --border-color: var(--border);
  --gray-50: var(--bg-base);
  --gray-100: var(--bg-surface);
  --gray-200: var(--border);
  --gray-300: var(--border-strong);
  --gray-400: var(--text-muted);
  --gray-500: var(--text-secondary);
  --gray-600: var(--text-primary);
  --danger: var(--error);
  --danger-light: var(--error-subtle);
  --color-warning: var(--warning);
  --success-light: var(--success-subtle);
  --warning-light: var(--warning-subtle);
  --error-light: var(--error-subtle);
  --info-light: var(--info-subtle);
  --bg-input: var(--bg-elevated);
  --shadow-sm: var(--shadow-inset);
  --shadow-md: none;
  --shadow-lg: var(--shadow-modal);
}
```

Light mode overrides:
```css
[data-theme="light"] {
  --bg-base: #f5f0e8;
  --bg-surface: #faf7f2;
  --bg-elevated: #ffffff;
  --bg-hover: #ede8df;
  --border: #d5cfc5;
  --border-strong: #b8b0a3;
  --text-primary: #2a2520;
  --text-secondary: #6b635a;
  --text-muted: #9a938a;
  --accent: #a85e2d;
  --accent-hover: #c87941;
  --accent-subtle: rgba(168,94,45,0.10);
  --success: #3d7a50;
  --success-subtle: rgba(61,122,80,0.10);
  --warning: #9a7520;
  --warning-subtle: rgba(154,117,32,0.10);
  --error: #943838;
  --error-subtle: rgba(148,56,56,0.10);
  --info: #3d7590;
  --info-subtle: rgba(61,117,144,0.10);
  /* Alias overrides */
  --bg-page: var(--bg-base);
  --bg-card: var(--bg-surface);
  --bg-subtle: var(--bg-elevated);
  --bg-sidebar: var(--bg-surface);
  --border-color: var(--border);
  --bg-input: var(--bg-elevated);
  --shadow-md: none;
}
```

Also include `@media (prefers-color-scheme: light)` for `:root:not([data-theme="dark"])` fallback.

**Section 3 — Base Reset & Typography:**
```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: var(--font-body);
  background: var(--bg-base);
  color: var(--text-primary);
  font-size: var(--text-base);
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Noise grain texture on body */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999;
  opacity: 0.03;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
}

h1, h2, h3, h4 {
  font-family: var(--font-heading);
  font-weight: 700;
  line-height: 1.3;
  color: var(--text-primary);
}

a { color: var(--accent); text-decoration: none; }
a:hover { color: var(--accent-hover); }

code, .mono { font-family: var(--font-mono); font-size: 0.9em; }
```

**Section 4 — Layout Shell:**
```css
/* App layout: sidebar + content */
.app-layout {
  display: flex;
  min-height: 100vh;
}

/* Sidebar */
.sidebar {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: var(--sidebar-width);
  background: var(--bg-surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  z-index: 200;
  transition: width var(--transition-normal);
  overflow: hidden;
}

.sidebar-logo {
  padding: 1.25rem 1rem;
  border-bottom: 1px solid var(--border);
}

.sidebar-logo h1 {
  font-family: var(--font-heading);
  font-size: var(--text-lg);
  color: var(--accent);
  white-space: nowrap;
}

.sidebar-logo .logo-sub {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  color: var(--text-muted);
  font-weight: 400;
  margin-top: 2px;
}

.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-sm) 0;
}

.sidebar-section {
  padding: var(--spacing-xs) 0;
}

.sidebar-section + .sidebar-section {
  border-top: 1px solid var(--border);
}

.sidebar-section-label {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: var(--spacing-sm) var(--spacing-md);
}

.nav-link {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 0.5rem var(--spacing-md);
  color: var(--text-secondary);
  font-size: var(--text-base);
  font-weight: 400;
  text-decoration: none;
  border-left: 3px solid transparent;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.nav-link:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
  text-decoration: none;
}

.nav-link.active {
  color: var(--accent);
  border-left-color: var(--accent);
  background: var(--accent-subtle);
  font-weight: 500;
}

.nav-link svg, .nav-link i {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  opacity: 0.7;
}

.nav-link.active svg, .nav-link.active i {
  opacity: 1;
}

.sidebar-footer {
  padding: var(--spacing-md);
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.sidebar-user {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.sidebar-user img {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
}

/* Content area */
.content-area {
  flex: 1;
  margin-left: var(--sidebar-width);
  min-height: 100vh;
  transition: margin-left var(--transition-normal);
}

/* Top bar within content */
.topbar {
  position: sticky;
  top: 0;
  z-index: 100;
  height: var(--topbar-height);
  background: var(--bg-base);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--spacing-xl);
}

.topbar-title {
  font-family: var(--font-heading);
  font-size: var(--text-lg);
  font-weight: 700;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

/* Main content */
.page-main {
  padding: var(--spacing-xl);
  max-width: 1400px;
}

.page-main-wide {
  max-width: none;
}

/* Responsive: collapsed sidebar */
@media (max-width: 1279px) {
  .sidebar { width: var(--sidebar-collapsed); }
  .sidebar .nav-link span,
  .sidebar .sidebar-logo h1,
  .sidebar .sidebar-logo .logo-sub,
  .sidebar .sidebar-section-label,
  .sidebar .sidebar-user span,
  .sidebar .sidebar-footer .theme-label { display: none; }
  .sidebar .nav-link { justify-content: center; padding: 0.5rem; border-left-width: 0; }
  .sidebar .nav-link.active { border-left-width: 0; border-radius: var(--radius-md); }
  .sidebar .sidebar-logo { padding: 1rem 0.5rem; text-align: center; }
  .sidebar .sidebar-footer { align-items: center; }
  .content-area { margin-left: var(--sidebar-collapsed); }
  /* Expand on hover */
  .sidebar:hover {
    width: var(--sidebar-width);
    box-shadow: 4px 0 24px rgba(0,0,0,0.3);
  }
  .sidebar:hover .nav-link span,
  .sidebar:hover .sidebar-logo h1,
  .sidebar:hover .sidebar-logo .logo-sub,
  .sidebar:hover .sidebar-section-label,
  .sidebar:hover .sidebar-user span,
  .sidebar:hover .sidebar-footer .theme-label { display: inline; }
  .sidebar:hover .nav-link { justify-content: flex-start; padding: 0.5rem var(--spacing-md); border-left-width: 3px; }
  .sidebar:hover .sidebar-logo { text-align: left; padding: 1.25rem 1rem; }
  .sidebar:hover .sidebar-footer { align-items: stretch; }
}

@media (max-width: 1023px) {
  .sidebar { transform: translateX(-100%); width: var(--sidebar-width); }
  .sidebar.open { transform: translateX(0); box-shadow: 4px 0 24px rgba(0,0,0,0.4); }
  .sidebar.open ~ .sidebar-overlay { display: block; }
  .content-area { margin-left: 0; }
  .hamburger { display: flex; }
}

.sidebar-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  z-index: 199;
}

.hamburger {
  display: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  cursor: pointer;
}
```

**Section 5 — Remaining component styles:**
Port ALL component classes from the existing `common.css` (cards, buttons, forms, modals, alerts, badges, tables, tabs, progress bars, accordion, pagination, toasts, spinner, etc.) but restyle them:

- **Cards:** 1px `var(--border)` border, `var(--bg-surface)` background, NO drop shadows, subtle `var(--shadow-inset)`. Remove `box-shadow: var(--shadow-md)` from `.card`.
- **Buttons:** `.btn-primary` uses `var(--accent)` background, hover uses `var(--accent-hover)`. Other variants use status colors.
- **Forms:** Focus ring uses `var(--accent)` instead of blue. Input background is `var(--bg-elevated)`.
- **Tabs:** Active tab uses `var(--accent)` bottom border (not filled background). Tab text only.
- **Badges/Status:** Use `var(--success-subtle)`, `var(--warning-subtle)`, etc. with matching text colors.
- **Data tables:** Subtle alternating rows using `var(--bg-elevated)`. Hover uses `var(--bg-hover)`. No stripy rows.
- **Modals:** Dark overlay, `var(--bg-elevated)` background, `var(--shadow-modal)`.
- **Progress bars:** Fill color is `var(--accent)`.
- **Spinner:** Border-top color is `var(--accent)`.

IMPORTANT: Keep all existing class names and aliases (`.btn-primary`, `.btn-secondary`, `.card`, `.card-padded`, `.alert-success`, `.status-approved`, `.badge-primary`, `.data-table`, etc.) so existing page JS that references these classes continues to work. This is critical for incremental migration.

**Section 6 — Utility classes:**
Port all existing utility classes (`.text-muted`, `.mt-1`, `.hidden`, `.flex`, etc.) unchanged.

**Section 7 — Accessibility:**
Keep `.skip-link` styles, focus-visible outlines (change outline color to `var(--accent)`).

**Section 8 — Desktop editor notice:**
```css
.desktop-only-notice {
  display: none;
  padding: var(--spacing-lg);
  text-align: center;
  color: var(--text-muted);
}
@media (max-width: 1023px) {
  .desktop-only-notice { display: block; }
  .desktop-only-content { display: none; }
}
```

**Step 3: Verify the CSS loads**

```bash
cd server && node -e "
  const fs = require('fs');
  const css = fs.readFileSync('public/css/common.css', 'utf8');
  console.log('CSS size:', css.length, 'chars');
  console.log('Has --bg-base:', css.includes('--bg-base'));
  console.log('Has --accent:', css.includes('--accent'));
  console.log('Has .sidebar:', css.includes('.sidebar'));
  console.log('Has .nav-link:', css.includes('.nav-link'));
  console.log('Has font-heading:', css.includes('font-heading'));
"
```

**Step 4: Commit**

```bash
git add server/public/css/common.css server/public/css/common.css.2026-02-20.bak
git commit -m "feat: rewrite CSS design system — Basalt & Vellum theme"
```

---

### Task 2: Layout Shell — Create `layout.js`

**Files:**
- Create: `server/public/js/layout.js`
- Remove: `server/public/js/nav.js` (absorbed into layout.js)
- Modify: `server/public/js/theme.js` (update selectors)

**Step 1: Write `layout.js`**

This script replaces `nav.js`. It must:

1. **Inject the sidebar HTML** into the page before `<main>` on DOMContentLoaded
2. **Wrap `<main>` in the app layout** (`<div class="app-layout">`)
3. **Highlight the active nav link** based on `window.location.pathname`
4. **Manage role-based visibility** (`.admin-only`, `.reviewer-only`)
5. **Handle auth** (fetch `/api/auth/me`, cache in sessionStorage for 60s, clear on `?loggedIn=1`)
6. **Toggle sidebar** on mobile (hamburger button)
7. **Dispatch `userLoaded` event** and set `window.currentUser`
8. **Expose `window.navUtils`** for backward compatibility

The sidebar HTML to inject:

```html
<div class="sidebar" id="app-sidebar">
  <div class="sidebar-logo">
    <h1>Námsbókasafn</h1>
    <div class="logo-sub">Þýðingaverkflæði</div>
  </div>
  <nav class="sidebar-nav">
    <div class="sidebar-section">
      <a href="/" class="nav-link" data-path="/" data-also="/my-work">
        <svg><!-- home icon --></svg>
        <span>Heim</span>
      </a>
      <a href="/editor" class="nav-link" data-path="/editor" data-also="/segment-editor">
        <svg><!-- edit icon --></svg>
        <span>Ritstjóri</span>
      </a>
      <a href="/progress" class="nav-link" data-path="/progress" data-also="/status">
        <svg><!-- chart icon --></svg>
        <span>Framvinda</span>
      </a>
      <a href="/terminology" class="nav-link" data-path="/terminology">
        <svg><!-- book icon --></svg>
        <span>Orðasafn</span>
      </a>
    </div>
    <div class="sidebar-section reviewer-only">
      <div class="sidebar-section-label">Yfirferð</div>
      <a href="/reviews" class="nav-link" data-path="/reviews" data-also="/review-queue">
        <svg><!-- check icon --></svg>
        <span>Yfirferðir</span>
      </a>
      <a href="/localization" class="nav-link" data-path="/localization" data-also="/localization-editor">
        <svg><!-- globe icon --></svg>
        <span>Staðfærsla</span>
      </a>
    </div>
    <div class="sidebar-section admin-only">
      <div class="sidebar-section-label">Stjórnun</div>
      <a href="/admin" class="nav-link" data-path="/admin">
        <svg><!-- settings icon --></svg>
        <span>Stjórnandi</span>
      </a>
      <a href="/library" class="nav-link" data-path="/library" data-also="/books,/chapter">
        <svg><!-- library icon --></svg>
        <span>Bókasafn</span>
      </a>
    </div>
  </nav>
  <div class="sidebar-footer">
    <button class="theme-toggle" title="Skipta um þema">
      <svg class="icon-sun"><!-- sun --></svg>
      <svg class="icon-moon"><!-- moon --></svg>
      <span class="theme-label">Þema</span>
    </button>
    <div class="sidebar-user" id="sidebar-user-info">
      <a href="/login" class="nav-link"><span>Innskrá</span></a>
    </div>
  </div>
</div>
<div class="sidebar-overlay" id="sidebar-overlay"></div>
```

The top bar HTML to inject at the start of the content area:

```html
<div class="topbar">
  <div style="display:flex;align-items:center;gap:0.75rem">
    <button class="hamburger" id="hamburger-btn" aria-label="Opna valmynd">☰</button>
    <span class="topbar-title" id="topbar-title"><!-- set by page data-title --></span>
  </div>
  <div class="topbar-actions">
    <div class="notification-bell" id="notification-bell" style="display:none"><!-- bell SVG + badge --></div>
    <div class="user-info" id="user-info"></div>
  </div>
</div>
```

**Active link matching logic:**
- Each `.nav-link` has `data-path` (primary) and optional `data-also` (comma-separated aliases)
- Match against `window.location.pathname`
- For `/` and `/my-work`, both map to the Home link

**Auth logic:** Port EXACTLY from current `nav.js` — the `getCachedAuth()`, `initNavigation()`, `updateRoleVisibility()`, `updateUserInfo()` functions. Change DOM selectors from `.header nav a` to `.nav-link` and from `#user-info` to `#sidebar-user-info` (plus keep `#user-info` in topbar).

**Key implementation detail:** `layout.js` should check if `.app-layout` already exists (for the login page which has its own layout) and skip injection if so.

**Step 2: Update `theme.js`**

- Keep the same IIFE pattern
- Update toggle button selector: keep `.theme-toggle` (unchanged)
- No other changes needed — it already uses `data-theme` attribute

**Step 3: Test layout injection**

Start the server and verify sidebar appears on an existing page:
```bash
cd server && node index.js
# In another terminal, check that /my-work loads with sidebar
curl -s http://localhost:3000/my-work | grep -c 'sidebar'
```

**Step 4: Commit**

```bash
git add server/public/js/layout.js server/public/js/theme.js
git rm server/public/js/nav.js
git commit -m "feat: add layout.js sidebar shell, remove nav.js"
```

---

### Task 3: Login Page Redesign

**Files:**
- Rewrite: `server/views/login.html`

**Step 1: Redesign the login page**

The login page is standalone — NO sidebar, NO layout.js. It has its own full-page layout.

Design:
- Full viewport dark basalt background with subtle radial gradient (warm center)
- Centered card with `var(--bg-surface)` background, `1px var(--border)` border
- "Námsbókasafn" in Libre Baskerville (copper color)
- Subtitle "Þýðingaverkflæði fyrir OpenStax kennslubækur" in Source Sans 3
- GitHub login button: dark bg (`#24292e`), copper hover border
- Role list below in muted text
- Subtle animated entrance (card fades up on load)

Important: This page has its OWN `<style>` block — it does NOT load `common.css` or `layout.js` (same as current). It can optionally load the Google Fonts link.

**Preserve exactly:**
- OAuth URL: `/api/auth/login`
- All Icelandic text (role names, descriptions)
- GitHub SVG icon

**Step 2: Test login page**

```bash
# Server should be running
curl -s http://localhost:3000/login | grep -c 'Námsbókasafn'
# Should output: at least 1
```

**Step 3: Commit**

```bash
git add server/views/login.html
git commit -m "feat: redesign login page — Basalt & Vellum"
```

---

### Task 4: Home Page (merges `my-work` + `dashboard`)

**Files:**
- Rewrite: `server/views/my-work.html` (becomes the Home page)
- Reference: current `server/views/my-work.html` and `server/views/dashboard.html`

**Step 1: Read both source files completely**

Read the full `my-work.html` (45KB) and `dashboard.html` (25KB) to understand all the JavaScript functions and API endpoints used. These must be preserved.

**Step 2: Write the new Home page**

Structure:
```html
<!DOCTYPE html>
<html lang="is">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Heim - Námsbókasafn</title>
  <link rel="stylesheet" href="/css/common.css">
  <style>/* page-specific styles */</style>
</head>
<body>
  <main class="page-content" id="main-content" data-page="home" data-title="Heim">
    <!-- Editor view (shown to all) -->
    <div id="editor-view">
      <div class="welcome-section">...</div>
      <div class="current-task-card">...</div>
      <div class="up-next-section">...</div>
      <div class="quick-stats">...</div>
    </div>

    <!-- Admin view (shown to admin/head-editor only) -->
    <div id="admin-view" class="admin-only" style="display:none">
      <div class="attention-panel">...</div>
      <div class="workload-panel">...</div>
      <div class="activity-feed">...</div>
    </div>
  </main>
  <script src="/js/layout.js"></script>
  <script>
    // Port ALL JS from my-work.html:
    // - loadMyWork(), toggleView(), loadWorkQueue()
    // - greeting logic, task card rendering, stats
    //
    // Add from dashboard.html:
    // - loadAttentionItems(), loadWorkload(), loadActivity()
    // - Show admin-view section when user role is admin/head-editor
    // - Listen for 'userLoaded' event to determine role
  </script>
</body>
</html>
```

**Key JS to port from `my-work.html`:**
- `loadMyWork()` — fetches from `/api/my-work/*`
- `toggleView('focus'|'detailed')` — view toggle
- Task card rendering functions
- Greeting time-of-day logic
- Stats loading

**Key JS to port from `dashboard.html`:**
- `loadAttentionItems()` — fetches from `/api/status/*` or `/api/reviews/*`
- `loadWorkload()` — fetches editor utilization
- `loadActivity()` — fetches recent activity
- Auto-refresh every 2 minutes

**Styling notes:**
- Welcome greeting: use `var(--font-heading)` for the greeting text
- Task cards: use copper left border for active task
- Stats: copper-colored stat values
- Admin panels: subtle `var(--border)` separator between editor and admin sections

**Step 3: Test**

Navigate to `/` or `/my-work` — should see the new Home page with sidebar. Verify:
- Greeting shows with user name (after login)
- Task cards load from API
- Admin sections appear for admin users
- Quick stats populate

**Step 4: Commit**

```bash
git add server/views/my-work.html
git commit -m "feat: redesign Home page (merges my-work + dashboard)"
```

---

### Task 5: Editor Page (from `segment-editor`)

**Files:**
- Rewrite: `server/views/segment-editor.html`

**Step 1: Read the full `segment-editor.html`**

This is the most complex page (~65KB). Read it entirely to understand:
- Module selection flow (book → chapter → module dropdowns)
- Segment table rendering
- Inline editing (click cell → textarea → save/revert)
- Diff display logic
- Approve/reject/discuss actions
- Terminology hint sidebar
- Stats bar
- Apply edits button

**Step 2: Write the new Editor page**

Key structural changes:
- **NO header boilerplate** — layout.js handles it
- **Module selector** moves to a compact bar at the top (below topbar)
- **Stats bar** becomes copper-accented chips
- **Segment table** gets full width, better column proportions (ID: 8%, EN: 38%, IS: 38%, Status: 8%, Actions: 8%)
- **Active editing row** gets copper left border + `var(--accent-subtle)` background
- **Diff colors** stay (red strikethrough, green insert) but use slightly muted tones

CRITICAL: Port ALL JavaScript from the existing file. The segment editor has the most complex client-side logic. Change DOM selectors to match new HTML IDs, but preserve:
- All `fetch()` calls to `/api/segment-editor/*`
- Inline editing open/save/revert logic
- Keyboard navigation (if any)
- Module loading/switching
- Edit application (`applyApprovedEdits`)
- Toast notification patterns

**Step 3: Test**

Navigate to `/segment-editor?book=efnafraedi&chapter=ch01&module=m68667`:
- Module header shows with stats
- Segment table loads and renders
- Click an IS cell → edit mode activates
- Save edit → API call succeeds
- Diff view shows for edited rows

**Step 4: Commit**

```bash
git add server/views/segment-editor.html
git commit -m "feat: redesign Editor page — Basalt & Vellum"
```

---

### Task 6: Progress Page (merges `status` + `pipeline-dashboard`)

**Files:**
- Rewrite: `server/views/status.html` (becomes Progress page)
- Reference: current `server/views/pipeline-dashboard.html`

**Step 1: Read both source files completely**

**Step 2: Write the new Progress page**

Structure: tabs (Overview | Matrix | Timeline), same as current status.html but redesigned.

- Port all JS from `status.html` (tab switching, chapter loading, analytics)
- Port pipeline visualization from `pipeline-dashboard.html` into the Overview tab
- Pipeline stage dots: filled copper circle = complete, outlined = in-progress, hollow dim = not-started

**Step 3: Test and commit**

```bash
git add server/views/status.html
git commit -m "feat: redesign Progress page (merges status + pipeline-dashboard)"
```

---

### Task 7: Terminology Page

**Files:**
- Rewrite: `server/views/terminology.html`

**Step 1: Read and rewrite**

- Keep the same structure (search bar, term cards, add/edit modal)
- Restyle with the Basalt & Vellum palette
- Search bar: prominent, full width, copper focus ring
- Term cards: EN on left, IS on right, muted borders
- Port all JS (search, add, edit, delete term API calls)

**Step 2: Test and commit**

```bash
git add server/views/terminology.html
git commit -m "feat: redesign Terminology page — Basalt & Vellum"
```

---

### Task 8: Reviews Page (merges `reviews` + `review-queue`)

**Files:**
- Rewrite: `server/views/reviews.html` (absorbs review-queue)
- Reference: current `server/views/review-queue.html`

**Step 1: Read both source files**

**Step 2: Write merged Reviews page**

- Filter tabs at top: All | Pending | Approved | Rejected | Review Queue
- Module review cards (from reviews.html) and cross-chapter queue (from review-queue.html)
- Port ALL JS from both files — merge the data loading functions
- Approve/reject/discuss buttons styled with status colors

**Step 3: Test and commit**

```bash
git add server/views/reviews.html
git commit -m "feat: redesign Reviews page (merges reviews + review-queue)"
```

---

### Task 9: Localization Page (merges `localization-editor` + `localization-review`)

**Files:**
- Rewrite: `server/views/localization-editor.html` (absorbs localization-review)

**Step 1: Read both source files**

**Step 2: Write merged Localization page**

- Toggle between Editor view and Review queue
- Side-by-side panels for editing
- Port all JS from both files

**Step 3: Test and commit**

```bash
git add server/views/localization-editor.html
git commit -m "feat: redesign Localization page (merges editor + review)"
```

---

### Task 10: Library Page (merges `books` + `chapter` + `images`)

**Files:**
- Rewrite: `server/views/books.html` (becomes Library page)
- Reference: current `server/views/chapter.html` and `server/views/images.html`

**Step 1: Read all three source files**

**Step 2: Write merged Library page**

- Book list view → click book → chapter grid → click chapter → detail panel
- Chapter detail includes: status, files, assignments, image tracking
- Port JS from all three files

**Step 3: Test and commit**

```bash
git add server/views/books.html
git commit -m "feat: redesign Library page (merges books + chapter + images)"
```

---

### Task 11: Admin Page (merges `admin` + `admin-users` + `admin-books` + `analytics` + `feedback-admin`)

**Files:**
- Rewrite: `server/views/admin.html` (absorbs 4 other pages)

**Step 1: Read all five source files completely**

This is the second-largest merge. Read:
- `admin.html` (9KB) — menu cards
- `admin-users.html` (32KB) — user management
- `admin-books.html` (25KB) — book management
- `analytics.html` (15KB) — usage analytics
- `feedback-admin.html` (31KB) — feedback review

**Step 2: Write merged Admin page**

Structure: Tab bar at top — Users | Books | Feedback | Analytics

Each tab contains the content from its former standalone page. This is a large file but keeps the logic separated by tab.

Port ALL JS from each file into tab-specific sections:
- Users tab: user CRUD, role assignment, chapter access
- Books tab: book registration, catalogue sync
- Feedback tab: feedback review queue, approve/archive
- Analytics tab: charts, velocity metrics

**Step 3: Test each tab and commit**

```bash
git add server/views/admin.html
git commit -m "feat: redesign Admin page (merges users + books + analytics + feedback)"
```

---

### Task 12: Feedback + 404 Pages

**Files:**
- Rewrite: `server/views/feedback.html`
- Rewrite: `server/views/404.html`

**Step 1: Redesign feedback form**

Public page — keep simple. Load `common.css` and `layout.js` (sidebar will show login link for unauthenticated users). Restyle the form with Basalt & Vellum colors. Port form submission JS.

**Step 2: Redesign 404 page**

Simple centered message. Can be standalone (like login) or use layout.js. Include a link back to Home.

**Step 3: Commit**

```bash
git add server/views/feedback.html server/views/404.html
git commit -m "feat: redesign feedback and 404 pages"
```

---

### Task 13: Route Updates + Dead File Cleanup

**Files:**
- Modify: `server/routes/views.js`
- Delete: `server/views/dashboard.html`
- Delete: `server/views/review-queue.html`
- Delete: `server/views/localization-review.html` (already redirects)
- Delete: `server/views/admin-users.html`
- Delete: `server/views/admin-books.html`
- Delete: `server/views/analytics.html`
- Delete: `server/views/feedback-admin.html`
- Delete: `server/views/chapter.html`
- Delete: `server/views/images.html`
- Delete: `server/views/pipeline-dashboard.html`
- Delete: `server/views/workflow.html`
- Delete: `server/views/issues.html`
- Delete: `server/views/teacher-guide.html`
- Delete: `server/views/layout.html`

**Step 1: Update `views.js` routes**

```javascript
// New routes
router.get('/', (req, res) => sendView(res, 'my-work.html'));  // Home page
router.get('/my-work', (req, res) => res.redirect('/'));
router.get('/editor', (req, res) => sendView(res, 'segment-editor.html'));
router.get('/segment-editor', (req, res) => {
  // Redirect old URL to new, preserving query params
  const qs = new URLSearchParams(req.query).toString();
  res.redirect('/editor' + (qs ? `?${qs}` : ''));
});
router.get('/progress', (req, res) => sendView(res, 'status.html'));
router.get('/status', (req, res) => res.redirect('/progress'));
router.get('/terminology', (req, res) => sendView(res, 'terminology.html'));
router.get('/reviews', (req, res) => sendView(res, 'reviews.html'));
router.get('/review-queue', (req, res) => res.redirect('/reviews'));
router.get('/localization', (req, res) => sendView(res, 'localization-editor.html'));
router.get('/localization-editor', (req, res) => res.redirect('/localization'));
router.get('/localization-review', (req, res) => res.redirect('/localization'));
router.get('/library', (req, res) => sendView(res, 'books.html'));
router.get('/books', (req, res) => res.redirect('/library'));
router.get('/books/:bookId', (req, res) => res.redirect(`/library?book=${req.params.bookId}`));
router.get('/chapter', (req, res) => {
  const qs = new URLSearchParams(req.query).toString();
  res.redirect('/library' + (qs ? `?${qs}` : ''));
});
router.get('/admin', (req, res) => sendView(res, 'admin.html'));
router.get('/admin/users', (req, res) => res.redirect('/admin?tab=users'));
router.get('/admin/books', (req, res) => res.redirect('/admin?tab=books'));
router.get('/admin/feedback', (req, res) => res.redirect('/admin?tab=feedback'));
router.get('/analytics', (req, res) => res.redirect('/admin?tab=analytics'));
router.get('/login', (req, res) => sendView(res, 'login.html'));
router.get('/feedback', (req, res) => sendView(res, 'feedback.html'));

// Legacy redirects
router.get('/workflow', (req, res) => res.redirect('/'));
router.get('/dashboard', (req, res) => res.redirect('/'));
router.get('/pipeline', (req, res) => res.redirect('/progress'));
router.get('/images', (req, res) => res.redirect('/library'));
router.get('/issues', (req, res) => res.redirect('/'));
router.get('/for-teachers', (req, res) => res.redirect('/'));
```

**Step 2: Delete dead view files**

```bash
git rm server/views/dashboard.html
git rm server/views/review-queue.html
git rm server/views/admin-users.html
git rm server/views/admin-books.html
git rm server/views/analytics.html
git rm server/views/feedback-admin.html
git rm server/views/chapter.html
git rm server/views/images.html
git rm server/views/pipeline-dashboard.html
git rm server/views/workflow.html
git rm server/views/issues.html
git rm server/views/teacher-guide.html
git rm server/views/layout.html
```

**Step 3: Delete old nav.js (if not already removed in Task 2)**

```bash
git rm server/public/js/nav.js 2>/dev/null || true
```

**Step 4: Test all routes**

```bash
# Start server and test each route returns 200 or redirects correctly
cd server && node -e "
const routes = ['/', '/login', '/editor', '/progress', '/terminology',
  '/reviews', '/localization', '/library', '/admin', '/feedback',
  '/my-work', '/segment-editor', '/status', '/dashboard', '/pipeline',
  '/review-queue', '/admin/users', '/admin/books'];
(async () => {
  for (const r of routes) {
    try {
      const resp = await fetch('http://localhost:3000' + r, { redirect: 'manual' });
      console.log(resp.status, r, resp.headers.get('location') || '');
    } catch(e) { console.log('ERR', r, e.message); }
  }
})();
"
```

Expected: All routes return 200 (for pages) or 301/302 (for redirects to new URLs).

**Step 5: Commit**

```bash
git add server/routes/views.js
git commit -m "feat: consolidate routes, remove dead views — 25 pages → 10"
```

---

## Testing Checklist (After All Tasks)

Run through manually on localhost:3000:

1. **Login page** — renders correctly, GitHub OAuth button works
2. **Home page** — greeting shows, tasks load, admin sections visible for admin
3. **Editor** — module loads, segments render, inline editing works, save/revert works
4. **Progress** — tabs switch, chapter cards show pipeline dots, matrix renders
5. **Terminology** — search works, add/edit term modal works
6. **Reviews** — filter tabs work, approve/reject/discuss work
7. **Localization** — editor and review toggle works
8. **Library** — books list, chapter detail, image tracking
9. **Admin** — all 4 tabs work (users, books, feedback, analytics)
10. **Feedback** — form submits successfully
11. **404** — unknown URL shows styled 404 page
12. **Theme toggle** — dark/light switch works on all pages
13. **Sidebar** — active link highlights, role visibility works, collapse works at 1024-1279px
14. **Legacy URLs** — all old URLs redirect to new pages
