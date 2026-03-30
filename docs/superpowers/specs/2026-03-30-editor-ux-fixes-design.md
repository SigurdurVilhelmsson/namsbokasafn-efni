# Editor UX Fixes — Design Spec

**Date:** 2026-03-30
**Origin:** Chrome DevTools UX audit of the editorial workflow interface
**Scope:** 7 fixes across navigation, validation, assignment, and cosmetic issues

## Context

A systematic audit of the editorial interface (navigating every page as admin via Chrome DevTools MCP) revealed 7 issues ranging from a blocking bug to cosmetic gaps. The core problem is that common administrative operations — especially chapter assignment — are hard to discover. The editing workflow itself (book → chapter → module → segments) is solid.

## Fix 1: Chapter Assignment Page (`/assignments`)

### Problem

Assigning a chapter to an editor requires: Admin → Notendur tab → click ✎ on user → scroll to "Kaflaverkefni" → select book → type chapter number → click Úthluta. This is 3+ clicks deep, user-centric (pick user first), uses a number spinner with no chapter names, and the home dashboard's "23 ÓÚTHLUTAÐ" cards with "Skoða" buttons don't connect to the assignment UI.

### Design

**New route:** `GET /assignments` → `server/views/assignments.html`
**Sidebar position:** Under STJÓRNUN section, between Stjórnandi and Bókasafn
**Access:** Admin and head-editor roles (via `requireRole(ROLES.HEAD_EDITOR)`)

**Page layout:**
- Book selector at top (reuse `bookSelector.js` pattern)
- Stats summary row: 3 cards — Úthlutað (assigned count), Óúthlutað (unassigned count), Ritstjórar (active editor count)
- Chapter table with columns:
  - **Kafli** — chapter number (K1, K2...)
  - **Titill** — Icelandic chapter title, fallback to English
  - **Ritstjóri** — inline `<select>` dropdown populated with active users with role >= editor. If `user_book_access` entries exist for this book, only those users are shown; otherwise all editors appear (matching the existing backward-compat pattern). Default "— Óúthlutað —" for unassigned chapters. Changing the dropdown saves immediately via API.
  - **Framvinda** — progress bar (percentage from status API)
  - **Opna** — link to `/editor?book={slug}&chapter={num}`
- Unassigned rows highlighted with warm background (`#fdf6ee` in light mode)
- Toast notification on successful assignment change

**New API endpoints:**
- `GET /api/admin/assignments/:book` — returns all chapters with current assignment (user id, name) and progress data. Joins `user_chapter_assignments` with `users` table and chapter status data.
- `POST /api/admin/assignments/:book/:chapter` — assign: `{ userId: number }`. Creates entry in `user_chapter_assignments`. Logs to `activity_log`.
- `DELETE /api/admin/assignments/:book/:chapter` — unassign. Removes entry from `user_chapter_assignments`. Logs to `activity_log`.

**Middleware:** `requireAuth`, `requireRole(ROLES.HEAD_EDITOR)`, `validateBookChapter`

**Dashboard connection:** The "Skoða" buttons on the home page's "Þarfnast athygli" unassigned items change their link target from the current dead-end to `/assignments?book={slug}`.

### Files

| File | Change |
|------|--------|
| `server/views/assignments.html` | New — page template |
| `server/public/js/assignments.js` | New — page logic (IIFE, ~200 lines) |
| `server/routes/admin.js` | Add 3 assignment endpoints |
| `server/routes/views.js` | Add `/assignments` route |
| `server/public/js/layout.js` | Add "Úthlutanir" sidebar link under STJÓRNUN |
| `server/views/my-work.html` | Fix "Skoða" button links to point to `/assignments?book=...` |

## Fix 2: Sidebar — Yfirferðir as Filtered Editor View

### Problem

"Ritstjóri" and "Yfirferðir" both link to `/editor`. Both highlight when on `/editor`. Users can't tell them apart.

### Design

**Link change:** Yfirferðir points to `/editor?view=reviews` instead of `/editor`.

**Editor behavior when `?view=reviews`:**
- Auto-sets the **Staða** (Status) filter to show only segments with status: `pending`, `rejected`, `discuss`
- Displays an info banner: "Sýnir einingar sem bíða yfirferðar" (Showing items awaiting review)
- All other editor functionality remains — user can manually change filters

**Sidebar active state:** `layout.js` checks both pathname and `view` query param:
- `/editor` (no view param) → highlights "Ritstjóri"
- `/editor?view=reviews` → highlights "Yfirferðir"

### Files

| File | Change |
|------|--------|
| `server/public/js/layout.js` | Update Yfirferðir href; refine active-link matching to check query params |
| `server/public/js/segment-editor.js` | On load, check for `?view=reviews` and auto-set status filter |

## Fix 3: Metadata Module Validation

### Problem

The chapter listing API (`/api/segment-editor/:book/:chapter`) includes `chapter-metadata` in its module list, but `validateModule` middleware enforces `/^m\d{5}$/`, rejecting it with a 400 error. Users see the module card, click it, get a blocking `alert()` dialog, and the module doesn't load.

### Design

**Validation change:** Extend the regex in `server/middleware/validateParams.js` line 43:

```javascript
// Before
if (!moduleId || !/^m\d{5}$/.test(moduleId)) {

// After
if (!moduleId || !/^(m\d{5}|chapter-metadata)$/.test(moduleId)) {
```

**Client-side display:** In the module list renderer in `segment-editor.js`, display `chapter-metadata` with the label "Lýsigögn kafla" (Chapter metadata) and a distinct badge type, rather than showing the raw ID string.

### Files

| File | Change |
|------|--------|
| `server/middleware/validateParams.js` | Extend regex to accept `chapter-metadata` |
| `server/public/js/segment-editor.js` | Display friendly label for `chapter-metadata` module card |
| `server/__tests__/validateParams.test.js` | Add test case for `chapter-metadata` |

## Fix 4: Feedback Link in Sidebar

### Problem

The `/feedback` page is well-designed but unreachable — no sidebar link exists.

### Design

Add "Álit" link in `layout.js` sidebar injection, positioned below Prófíll link. Visible to all roles. Points to `/feedback`. Uses a speech-bubble or comment icon.

### Files

| File | Change |
|------|--------|
| `server/public/js/layout.js` | Add Álit link after Prófíll in sidebar HTML |

## Fix 5: Prefer Icelandic Module Titles

### Problem

Module titles in the editor's module list display in English (e.g., "Formula Mass and the Mole Concept"). The API returns `titleIs: null` for all modules, and the client doesn't check for it.

### Design

In the module card renderer in `segment-editor.js`, prefer `titleIs` over `title` when the field is non-null. No API changes — this future-proofs the display for when module-level Icelandic titles are populated.

### Files

| File | Change |
|------|--------|
| `server/public/js/segment-editor.js` | Use `module.titleIs || module.title` in card rendering |

## Fix 6: Profile Page Error State

### Problem

When a user doesn't exist in the database (e.g., JWT-only user), the profile page shows only "Villa við að hlaða prófíl" with no guidance.

### Design

Replace the generic error with: "Prófíll finnst ekki í gagnagrunni. Hafðu samband við kerfisstjóra." (Profile not found in database. Contact an administrator.) Include a "← Til baka" (Back) link pointing to `/`.

### Files

| File | Change |
|------|--------|
| `server/views/profile.html` | Improve error message text and add back link |

## Fix 7: Progress Page Missing Title

### Problem

The progress page (`/progress`) doesn't show "Framvinda" in the topbar — it's blank, unlike every other page.

### Design

Add the page title attribute that `layout.js` reads for the topbar. Check how other pages set this (likely a `data-page-title` attribute or a heading element that `layout.js` extracts) and replicate the pattern.

### Files

| File | Change |
|------|--------|
| `server/views/status.html` | Add page title element/attribute for topbar |

## Testing

- **Unit tests:** Add test case in `validateParams.test.js` for `chapter-metadata` acceptance
- **Manual verification:** Navigate all 7 fixes via Chrome DevTools MCP:
  1. `/assignments` — select book, change assignment dropdown, verify toast + API call
  2. `/editor?view=reviews` — verify auto-filter, sidebar active state, info banner
  3. Click `chapter-metadata` in editor module list — verify it loads
  4. Check sidebar for Álit link → verify `/feedback` loads
  5. Load module with `titleIs` populated → verify Icelandic title shown
  6. Load `/profile` without DB user → verify improved error message
  7. Load `/progress` → verify "Framvinda" in topbar

## Scope Boundaries

- The existing user-edit panel in Admin → Notendur still works for per-user chapter management. The new `/assignments` page is a chapter-centric complement, not a replacement.
- No changes to the assignment database schema (`user_chapter_assignments` table) — the existing schema supports everything needed.
- No changes to authentication, roles, or middleware beyond the listed items.
