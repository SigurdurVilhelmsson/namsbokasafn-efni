# Basalt & Vellum — Server Interface Redesign

**Date:** 2026-02-20
**Status:** Design approved, implementation pending

## Overview

Full UX overhaul of the Namsbokasafn workflow server interface. Consolidates 25 views into ~10 pages, replaces the top-nav horizontal layout with a fixed sidebar, and introduces a distinctive "Basalt & Vellum" visual identity inspired by Icelandic geological and literary heritage.

**Target:** Desktop-first (laptop/monitor). Mobile is secondary — graceful degradation for admin tasks, no mobile editing support.

## Design Direction

**"Basalt & Vellum"** — Dark volcanic basalt surfaces with warm parchment text tones. Geothermal copper accents. Serif headings that honor the scholarly/literary nature of translation work. Subtle grain texture on surfaces.

## 1. Design System

### Color Palette

```css
/* Dark mode (default) */
--bg-base:        #16181d;    /* deep basalt */
--bg-surface:     #1e2128;    /* raised surface */
--bg-elevated:    #272b33;    /* cards, modals */
--bg-hover:       #2f343d;    /* interactive hover */
--border:         #353a44;    /* subtle structure */
--border-strong:  #454c59;    /* emphasis */

--text-primary:   #e8e4df;    /* warm off-white — vellum */
--text-secondary: #9a958e;    /* muted warm gray */
--text-muted:     #6b665f;    /* de-emphasized */

--accent:         #c87941;    /* geothermal copper */
--accent-hover:   #d98b53;    /* lighter copper */
--accent-subtle:  rgba(200,121,65,0.12);

--success:        #5b9a6f;    /* moss green */
--warning:        #c4963a;    /* amber */
--error:          #b54a4a;    /* muted red */
--info:           #5a8fa8;    /* glacial blue */

/* Light mode */
--bg-base:        #f5f0e8;    /* warm parchment */
--bg-surface:     #faf7f2;    /* light vellum */
--bg-elevated:    #ffffff;
--bg-hover:       #ede8df;
--border:         #d5cfc5;
--border-strong:  #b8b0a3;

--text-primary:   #2a2520;    /* warm dark */
--text-secondary: #6b635a;
--text-muted:     #9a938a;

--accent:         #a85e2d;    /* deeper copper for contrast */
--accent-hover:   #c87941;
--accent-subtle:  rgba(168,94,45,0.10);

--success:        #3d7a50;
--warning:        #9a7520;
--error:          #943838;
--info:           #3d7590;
```

### Typography

- **Headings:** Libre Baskerville (serif) — scholarly, sharp serifs, excellent Icelandic support
- **Body:** Source Sans 3 (humanist sans) — very legible, full Icelandic glyph coverage
- **Mono:** JetBrains Mono — segment IDs, technical data

**Scale:** 0.75 / 0.8125 / 0.875 / 1 / 1.125 / 1.375 / 1.75 / 2.25rem

### Texture & Atmosphere

- Subtle CSS noise grain on `--bg-base` via SVG data-URI
- Cards: 1px border + subtle inner shadow (no drop shadows)
- Fine horizontal rules evoke ruled manuscript pages
- Copper accent used sparingly — primary actions, active states, progress indicators

## 2. Layout Shell

### Sidebar Navigation

Fixed-position sidebar (240px wide) with content area filling remaining width.

```
┌────────┬─────────────────────────────────────────┐
│        │ Page Title              [search] [user] │
│ LOGO   ├─────────────────────────────────────────┤
│ Náms-  │                                         │
│ bóka-  │                                         │
│ safn   │         Content Area                    │
│        │         (scrollable)                    │
│ ────── │                                         │
│ Heim   │                                         │
│ Ritstj.│                                         │
│ Framv. │                                         │
│ Orðas. │                                         │
│        │                                         │
│ ────── │                                         │
│ Yfir.  │                                         │
│ Staðf. │                                         │
│        │                                         │
│ ══════ │                                         │
│ Stjórn.│                                         │
│ Bókasf.│                                         │
│        │                                         │
│ [☽]    │                                         │
│ [user] │                                         │
└────────┴─────────────────────────────────────────┘
```

**Sidebar sections:**
1. **Logo** — "Námsbókasafn" vertically compact
2. **Primary** — Heim, Ritstjóri, Framvinda, Ordasafn (daily work)
3. **Review** — Yfirferd, Stadfaering (reviewer+ roles only)
4. **Admin** — Stjornbord, Bokasafn (admin only)
5. **Footer** — Theme toggle, user avatar/name

**Active indicator:** 4px copper left border + accent-subtle background
**Hover:** bg-hover background transition

### Responsive Behavior

- **>= 1280px:** Full sidebar (240px) + full content
- **1024-1279px:** Collapsed sidebar (56px, icons only), hover to expand
- **< 1024px:** Sidebar hidden, hamburger menu toggle
- **< 768px:** Simple stacked layout, "best viewed on desktop" notice on editor pages

### Top Bar (within content area)

Minimal strip at top of content area:
- Page title (Libre Baskerville)
- Breadcrumb context (e.g., "Efnafraedi > Kafli 3 > m68700")
- Right side: notification bell, user dropdown

## 3. Page Consolidation

### 3.1 Login (standalone, no sidebar)

Full-viewport page with centered card. Dark basalt background with subtle animated gradient. Copper-accented GitHub login button. Role explanation below.

No changes to auth flow — just visual redesign.

### 3.2 Home (merges: my-work, dashboard)

**URL:** `/` (redirects from `/my-work`)

Role-adaptive single page:

**Editor view:**
- Greeting with time-of-day context
- Current task card (large, copper-bordered)
- Up-next queue (compact list)
- Weekly stats bar (completed, pending review, term suggestions)
- Blocked issues banner (if any)

**Admin/head-editor additions:**
- Attention panel (pending reviews, blocked issues, unassigned work)
- Workload overview (editor utilization)
- Team activity feed
- Ready-for-assignment queue

### 3.3 Editor (from: segment-editor)

**URL:** `/editor`

The core editing tool. Desktop-optimized wide layout.

**Header bar:**
- Module selector dropdown (book > chapter > module)
- Stats chips: total | edited | approved | rejected (copper-accented numbers)
- Actions: Apply edits, export

**Segment table (full width):**
- Columns: ID (mono, narrow) | English (40%) | Icelandic (40%) | Status | Actions
- Row states: edited (accent-subtle bg), approved (success-subtle), rejected (error-subtle), discuss (warning-subtle)
- Inline editing: click Icelandic cell to edit, save/revert buttons appear
- Diff view: deleted text in strikethrough red, inserted in green
- MT-incomplete rows: amber left border + italic text

**No mobile layout.** Below 1024px: horizontal scroll with fixed ID column.

### 3.4 Progress (merges: status, pipeline-dashboard)

**URL:** `/progress`

**Tabs:** Overview | Matrix | Timeline

**Overview tab:**
- Attention panel (pending reviews, blocked, unassigned)
- Milestone progress bar (copper fill)
- Chapter cards in a grid — each shows 8-stage pipeline as dot indicators
- Search/filter bar

**Matrix tab:**
- Chapters as rows, 8 pipeline stages as columns
- Cell states: complete (copper filled), in-progress (outlined), not-started (dim)

**Timeline tab:**
- Activity feed with date groupings

### 3.5 Terminology (from: terminology)

**URL:** `/terminology`

- Search bar (prominent, top of page)
- Term cards: EN on left, IS on right, category badge, status
- Add/edit term modal
- Filter by status, category

### 3.6 Reviews (merges: reviews, review-queue)

**URL:** `/reviews`

- Filter tabs: All | Pending | Approved | Rejected
- Module review cards with segment counts, reviewer, date
- Expand to see individual segments needing review
- Approve/reject/discuss actions with inline comment

### 3.7 Localization (merges: localization-editor, localization-review)

**URL:** `/localization`

- Toggle: Editor view | Review queue
- Side-by-side panels: English source | Icelandic target
- Localization suggestions highlighted
- Review queue as a filterable list

### 3.8 Library (merges: chapter, books, images)

**URL:** `/library`

- Book cards (currently just efnafraedi)
- Click book → chapter list with status overview
- Click chapter → module files, images, status detail
- Image tracking folded into chapter detail view

### 3.9 Admin (merges: admin, admin-users, admin-books, analytics, feedback-admin)

**URL:** `/admin`

**Tabs:** Users | Books | Feedback | Analytics | Settings

Each tab replaces a former standalone page:
- **Users:** Role assignment, chapter access, activity
- **Books:** Registration, catalogue sync
- **Feedback:** Review queue with approve/archive
- **Analytics:** Usage charts, velocity metrics
- **Settings:** Migrations, system config

### 3.10 Feedback (from: feedback)

**URL:** `/feedback`

Public form, accessible without login. Simple card layout matching the login page aesthetic.

### Removed Pages

| Page | Disposition |
|------|------------|
| `workflow.html` | Removed (legacy, deprecated) |
| `pipeline-dashboard.html` | Merged into Progress |
| `issues.html` | Folded into Home attention panel |
| `teacher-guide.html` | Moved to static docs link in sidebar |
| `404.html` | Redesigned with new aesthetic |

## 4. Implementation Architecture

### No New Frameworks

Keep plain HTML + CSS + JS. The project is small-scale (1-2 developers, ~5 editors) and doesn't need React/Vue overhead.

### Shared Layout System

**New file: `layout.js`**
- Injects sidebar nav into every page
- Manages active link highlighting (replaces nav.js)
- Handles role-based visibility
- Handles sidebar collapse/expand
- Manages user info display

**Each view file** stripped of:
- Header HTML (injected by layout.js)
- Nav duplication
- Theme toggle (in sidebar via layout.js)

Each view becomes just:
```html
<!DOCTYPE html>
<html lang="is">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Page Title - Námsbókasafn</title>
  <link rel="stylesheet" href="/css/common.css">
  <style>/* page-specific styles */</style>
</head>
<body>
  <main class="page-content" id="main-content" data-page="page-id">
    <!-- Page content only -->
  </main>
  <script src="/js/layout.js"></script>
  <script>/* page-specific script */</script>
</body>
</html>
```

`layout.js` detects `data-page`, wraps content in the shell, and injects sidebar.

### File Changes

| File | Action |
|------|--------|
| `public/css/common.css` | Complete rewrite (new design system) |
| `public/js/layout.js` | New (replaces nav.js, adds sidebar) |
| `public/js/theme.js` | Update for new theme variables |
| `public/js/nav.js` | Remove (absorbed into layout.js) |
| `public/js/htmlUtils.js` | Keep as-is |
| `views/login.html` | Redesign (standalone, no sidebar) |
| `views/my-work.html` | Redesign as Home, merge dashboard content |
| `views/segment-editor.html` | Redesign as Editor |
| `views/status.html` | Redesign as Progress, merge pipeline-dashboard |
| `views/terminology.html` | Redesign |
| `views/reviews.html` | Redesign, merge review-queue |
| `views/localization-editor.html` | Redesign, merge localization-review |
| `views/books.html` | Redesign as Library, merge chapter + images |
| `views/admin.html` | Redesign, merge admin-users + admin-books + analytics + feedback-admin |
| `views/feedback.html` | Redesign |
| `views/404.html` | Redesign |
| `views/dashboard.html` | Remove (merged into Home) |
| `views/review-queue.html` | Remove (merged into Reviews) |
| `views/localization-review.html` | Remove (merged into Localization) |
| `views/admin-users.html` | Remove (merged into Admin) |
| `views/admin-books.html` | Remove (merged into Admin) |
| `views/analytics.html` | Remove (merged into Admin) |
| `views/feedback-admin.html` | Remove (merged into Admin) |
| `views/chapter.html` | Remove (merged into Library) |
| `views/images.html` | Remove (merged into Library) |
| `views/pipeline-dashboard.html` | Remove (merged into Progress) |
| `views/workflow.html` | Remove (deprecated) |
| `views/issues.html` | Remove (folded into Home) |
| `views/teacher-guide.html` | Remove (link to docs) |
| `views/layout.html` | Remove (unused template) |
| `routes/views.js` | Update routes for consolidated pages |

### API Routes

**No changes to API routes.** All `/api/*` endpoints remain identical. Only the view layer changes.

## 5. Phasing

### Phase 1: Foundation
- New `common.css` design system
- New `layout.js` sidebar shell
- Updated `theme.js`
- Login page redesign

### Phase 2: Core Pages
- Home page (merge my-work + dashboard)
- Editor page (segment-editor redesign)
- Route updates in `views.js`

### Phase 3: Secondary Pages
- Progress (merge status + pipeline-dashboard)
- Terminology redesign
- Reviews (merge reviews + review-queue)

### Phase 4: Advanced Pages
- Localization (merge localization-editor + localization-review)
- Library (merge chapter + books + images)
- Admin (merge admin + admin-users + admin-books + analytics + feedback-admin)

### Phase 5: Cleanup
- Remove dead view files
- Remove unused routes
- Update feedback page
- 404 page redesign
- Test all role-based visibility
- Verify all API integrations still work
