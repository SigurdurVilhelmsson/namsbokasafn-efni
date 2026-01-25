# UI Styling Architecture

This document describes the centralized CSS architecture for the Námsbókasafn workflow server interface.

## Overview

All view files share a common stylesheet (`/css/common.css`) that provides:
- CSS custom properties for theming
- Dark mode support
- Consistent header, navigation, and component styles
- Reduced code duplication across 22 view files

## File Structure

```
server/public/
├── css/
│   └── common.css    # Shared styles for all pages
└── js/
    └── theme.js      # Theme toggle functionality
```

## CSS Custom Properties

### Colors

```css
--primary: #2563eb;
--primary-dark: #1d4ed8;
--primary-light: #dbeafe;
--success: #16a34a;
--warning: #d97706;
--error: #dc2626;
```

### Background & Text

```css
--bg-page: #f9fafb;      /* Page background */
--bg-card: #ffffff;       /* Card background */
--text-primary: #111827;  /* Primary text */
--text-muted: #6b7280;    /* Secondary text */
--border-color: #e5e7eb;  /* Borders */
```

## Dark Mode

Dark mode is enabled via the `[data-theme="dark"]` selector. The theme preference is:
- Stored in `localStorage` as `theme`
- Respects system preference via `prefers-color-scheme`
- Toggled via the sun/moon button in the header

### Implementation

```javascript
// theme.js handles:
// 1. Initial theme detection (localStorage or system preference)
// 2. Applying theme to document
// 3. Toggle button functionality
```

## Standard Header Structure

All pages use this header structure:

```html
<header class="header">
  <h1>Námsbókasafn</h1>
  <nav>
    <a href="/my-work">Mín verkefni</a>
    <a href="/status">Stjórnborð</a>
    <a href="/editor">Ritstjóri</a>
    <a href="/terminology">Orðasafn</a>
    <a href="/decisions">Ákvarðanir</a>
  </nav>
  <div class="header-actions">
    <button class="theme-toggle"><!-- sun/moon icons --></button>
    <div class="notification-bell"><!-- bell icon --></div>
    <div class="user-info"></div>
  </div>
</header>
```

## Navigation Active State

Navigation uses pill-style active state:

```css
.header nav a.active {
  color: var(--primary);
  background: var(--primary-light);
  font-weight: 500;
}
```

## Adding a New View

When creating a new view file:

1. Add common.css link in `<head>`:
   ```html
   <link rel="stylesheet" href="/css/common.css">
   ```

2. Use the standard header structure (copy from layout.html)

3. Add theme.js before closing `</body>`:
   ```html
   <script src="/js/theme.js"></script>
   ```

4. Add only page-specific styles inline, prefixed with a comment:
   ```html
   <style>
     /* Page-specific styles for [page-name] */
     .my-component { ... }
   </style>
   ```

## Special Pages

### login.html
Standalone login page with unique centered card design. Does not use common.css or standard header.

### teacher-guide.html
Public-facing guide with unique full-width banner header. Uses common.css for base styles and dark mode.

### reports.html
Uses alternate navigation links (Yfirlit/Verkflæði/Yfirferðir/Skýrslur) but includes standard header utilities.

## Components Available in common.css

- **Cards**: `.card`, `.card-header`, `.card-title`, `.card-body`
- **Buttons**: `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-success`, `.btn-small`
- **Forms**: `.form-group`, `.form-label`, `.form-input`, `.form-select`, `.form-textarea`
- **Alerts**: `.alert`, `.alert-success`, `.alert-error`, `.alert-warning`
- **Badges**: `.badge`, `.badge-success`, `.badge-warning`, `.badge-error`
- **Tables**: `.table`
- **Modals**: `.modal`, `.modal-content`, `.modal-header`, `.modal-body`, `.modal-footer`
- **Utilities**: `.text-muted`, `.empty-state`, `.loading`
