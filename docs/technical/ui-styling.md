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
- **Buttons**: `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-success`, `.btn-small`, `.btn-large`, `.btn-danger`
- **Forms**: `.form-group`, `.form-label`, `.form-input`, `.form-select`, `.form-textarea`
- **Alerts**: `.alert`, `.alert-success`, `.alert-error`, `.alert-warning`
- **Badges**: `.badge`, `.badge-success`, `.badge-warning`, `.badge-error`
- **Tables**: `.table`
- **Modals**: `.modal`, `.modal-content`, `.modal-header`, `.modal-body`, `.modal-footer`
- **Utilities**: `.text-muted`, `.empty-state`, `.loading`

## Progressive Disclosure Components

These components support clean, uncluttered interfaces that progressively reveal content.

### Accordion

Collapsible sections for grouping related content.

```html
<div class="accordion" id="my-accordion">
  <button class="accordion-header" onclick="toggleAccordion('my-accordion')">
    <div class="accordion-header-left">
      <span class="accordion-toggle">▼</span>
      <span>Section Title</span>
    </div>
    <div class="accordion-progress">
      <span>3/5</span>
    </div>
  </button>
  <div class="accordion-body">
    <!-- Content here -->
  </div>
</div>
```

JavaScript:
```javascript
function toggleAccordion(accordionId) {
  const accordion = document.getElementById(accordionId);
  if (accordion) {
    accordion.classList.toggle('collapsed');
  }
}
```

States:
- Default: expanded (content visible)
- `.collapsed`: content hidden, toggle icon rotated

### Dropzone

Drag-and-drop file upload area.

```html
<div class="dropzone" id="my-dropzone">
  <div class="dropzone-icon">📁</div>
  <div class="dropzone-text">Drag files here or click to browse</div>
  <div class="dropzone-hint">Accepts .md files</div>
  <input type="file" id="file-input" accept=".md">
  <button class="btn btn-secondary">Select Files</button>
</div>
```

States:
- Default: dashed border, light background
- `.drag-over`: highlighted during file drag

### Progress Indicators

#### Linear Progress Bar

```html
<div class="progress-linear">
  <div class="progress-linear-fill" style="width: 60%;"></div>
</div>
```

Variants:
- `.progress-linear-full`: removes max-width constraint

#### Circular Progress Ring (SVG)

```html
<svg class="progress-ring" viewBox="0 0 36 36">
  <circle class="progress-ring-bg" cx="18" cy="18" r="16"></circle>
  <circle class="progress-ring-fill" cx="18" cy="18" r="16"
          stroke-dasharray="100, 100" stroke-dashoffset="40"></circle>
</svg>
<span class="progress-ring-text">60%</span>
```

Size variants: `.progress-ring-sm`, `.progress-ring-lg`

### Warning/Info Banners

Dismissible notification banners.

```html
<div class="warning-banner">
  <span class="warning-banner-icon">⚠️</span>
  <div class="warning-banner-content">
    <strong>Warning Title</strong>
    <p>Warning message details.</p>
  </div>
  <button class="warning-dismiss" onclick="this.parentElement.remove()">&times;</button>
</div>
```

Variants:
- `.warning-banner` (default): yellow/amber
- `.info-banner`: blue
- `.error-banner`: red
- `.success-banner`: green

### File Grid

Compact multi-column file listing.

```html
<div class="file-grid">
  <div class="file-item uploaded">
    <span class="file-icon">✓</span>
    <span class="file-name">1-1.is.md</span>
  </div>
  <div class="file-item pending">
    <span class="file-icon">○</span>
    <span class="file-name">1-2.is.md</span>
  </div>
</div>
```

Variants:
- `.file-grid-compact`: smaller column widths
- `.file-item.uploaded`: success color
- `.file-item.pending`: muted color

### Step Navigation

Sticky navigation for multi-step workflows.

```html
<div class="step-header">
  <div class="step-header-left">
    <h3><span class="step-num">2</span> Step Title</h3>
    <p>Step description</p>
  </div>
  <div class="step-header-right">
    <div class="progress-linear">...</div>
    <span>3/5</span>
  </div>
</div>

<div class="step-nav">
  <button class="btn btn-secondary">← Previous</button>
  <button class="btn btn-primary">Next →</button>
</div>
```

On mobile (≤768px), `.step-nav` becomes sticky at the bottom of the screen.

### Spinner

Loading indicator.

```html
<span class="spinner"></span>
<span class="spinner spinner-sm"></span>
<span class="spinner spinner-lg"></span>
```

### Pagination

Page navigation controls.

```html
<div class="pagination-controls">
  <button class="pagination-btn" disabled>←</button>
  <button class="pagination-btn">1</button>
  <button class="pagination-btn active">2</button>
  <button class="pagination-btn">3</button>
  <span class="pagination-info">...</span>
  <button class="pagination-btn">10</button>
  <button class="pagination-btn">→</button>
</div>
```

### Expandable Section

For "View All" patterns.

```html
<div id="visible-items">
  <!-- First 5 items -->
</div>
<div class="accordion collapsed" id="more-items">
  <button class="accordion-header" onclick="toggleAccordion('more-items')">
    <div class="accordion-header-left">
      <span class="accordion-toggle">▼</span>
      <span>Show 15 more items</span>
    </div>
  </button>
  <div class="accordion-body">
    <!-- Remaining items -->
  </div>
</div>
```

## Design Principles

1. **Progressive Disclosure**: Show essential content first, reveal details on demand
2. **Consistent Patterns**: Use accordions for all collapsible sections
3. **Mobile-First**: All components work on 375px screens
4. **Dark Mode Ready**: All components use CSS custom properties
