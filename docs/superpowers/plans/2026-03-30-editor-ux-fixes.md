# Editor UX Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 7 UX issues found during a Chrome DevTools audit of the editorial interface — from a blocking metadata module bug to a new chapter assignment page.

**Architecture:** Small targeted fixes for 6 issues (regex, attributes, sidebar links, filter state, error text), plus one new page (`/assignments`) with 3 API endpoints, an HTML view, and client JS. All changes are in the `server/` directory. The existing `user_chapter_assignments` DB table and existing `assignChapter()`/`removeChapterAssignment()` service functions (in `userService.js` lines 567-599) are reused without changes.

**Note:** Fix 5 from the spec (Icelandic module titles) is already implemented in code — `segment-editor.js` line 227 already does `m.titleIs || m.title || m.moduleId`. The `titleIs` field is null because module-level translations aren't populated yet — a data issue, not a code issue. Skipped in this plan.

**Tech Stack:** Express 5, better-sqlite3, vanilla JS (IIFE pattern), HTML views, Vitest

**Spec:** `docs/superpowers/specs/2026-03-30-editor-ux-fixes-design.md`

---

### Task 1: Fix validateModule to accept `chapter-metadata`

**Files:**
- Modify: `server/middleware/validateParams.js:41-47`
- Modify: `server/__tests__/validateParams.test.js`

- [ ] **Step 1: Write failing test for `chapter-metadata`**

In `server/__tests__/validateParams.test.js`, add inside the `describe('validateModule', ...)` block:

```javascript
  it('accepts chapter-metadata', () => {
    req.params = { moduleId: 'chapter-metadata' };
    validateModule(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run __tests__/validateParams.test.js -t "accepts chapter-metadata"`
Expected: FAIL — `chapter-metadata` does not match `/^m\d{5}$/`

- [ ] **Step 3: Extend the regex**

In `server/middleware/validateParams.js`, change line 43:

```javascript
// Before
  if (!moduleId || !/^m\d{5}$/.test(moduleId)) {

// After
  if (!moduleId || !/^(m\d{5}|chapter-metadata)$/.test(moduleId)) {
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run __tests__/validateParams.test.js`
Expected: All tests PASS including the new one

- [ ] **Step 5: Commit**

```bash
git add server/middleware/validateParams.js server/__tests__/validateParams.test.js
git commit -m "fix(validate): accept chapter-metadata as valid module ID"
```

---

### Task 2: Fix progress page missing title

**Files:**
- Modify: `server/views/status.html:318`

- [ ] **Step 1: Fix the data attribute**

The progress page uses `data-page-title` but `layout.js` reads `data-title` (line 167: `main.dataset.title`). In `server/views/status.html` line 318, change:

```html
<!-- Before -->
<main class="page-content" data-page-title="Framvinda">

<!-- After -->
<main class="page-content" data-title="Framvinda">
```

- [ ] **Step 2: Verify in browser**

Navigate to `http://localhost:3000/progress` — topbar should now show "Framvinda".

- [ ] **Step 3: Commit**

```bash
git add server/views/status.html
git commit -m "fix(status): use correct data-title attribute for topbar title"
```

---

### Task 3: Improve profile page error state

**Files:**
- Modify: `server/views/profile.html:197`

- [ ] **Step 1: Read the current profile.html**

Read `server/views/profile.html` around line 190-200 to see the error handling context.

- [ ] **Step 2: Improve the error message**

In the `loadProfile()` catch block (around line 197), replace:

```javascript
// Before
els.loading.textContent = 'Villa við að hlaða prófíl.';

// After
els.loading.innerHTML =
  '<div style="text-align:center;padding:2rem;">' +
  '<p style="margin-bottom:1rem;">Prófíll finnst ekki í gagnagrunni. Hafðu samband við kerfisstjóra.</p>' +
  '<a href="/" class="btn btn-secondary">← Til baka</a>' +
  '</div>';
```

- [ ] **Step 3: Verify in browser**

Navigate to `http://localhost:3000/profile` — should show the improved error with back link.

- [ ] **Step 4: Commit**

```bash
git add server/views/profile.html
git commit -m "fix(profile): show helpful error message with back link"
```

---

### Task 4: Update sidebar — Yfirferðir link, Úthlutanir link, Álit link

**Files:**
- Modify: `server/public/js/layout.js` (sidebar HTML + active-link logic)

- [ ] **Step 1: Read layout.js sidebar section**

Read `server/public/js/layout.js` lines 28-110 (the `sidebarHTML()` function) and lines 230-248 (the `highlightActiveNav()` function).

- [ ] **Step 2: Update Yfirferðir href and data-paths**

In the `sidebarHTML()` function at line 59, change the Yfirferðir link:

```html
<!-- Before (line 59) -->
      <a href="/editor" class="nav-link" data-paths="/editor">

<!-- After -->
      <a href="/editor?view=reviews" class="nav-link" data-paths="/editor?view=reviews">
```

The SVG icon (checkmark-in-box) and `<span>Yfirferðir</span>` on lines 60-61 stay unchanged.

- [ ] **Step 3: Add Úthlutanir link in STJÓRNUN section**

All sidebar links use inline SVG Feather icons (18x18, stroke="currentColor"). Insert a new link between the Bókasafn `</a>` (end of line 78) and the closing `</div>` (line 80). Use the clipboard-list Feather icon:

```html
      <a href="/assignments" class="nav-link" data-paths="/assignments">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect><line x1="9" y1="12" x2="15" y2="12"></line><line x1="9" y1="16" x2="15" y2="16"></line></svg>
        <span>Úthlutanir</span>
      </a>
```

- [ ] **Step 4: Add Álit link below Prófíll**

In the `sidebar-footer` div, after the Prófíll `</a>` tag (end of line 87), add using the message-circle Feather icon:

```html
    <a href="/feedback" class="nav-link" data-paths="/feedback">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
      <span>Álit</span>
    </a>
```

- [ ] **Step 5: Update highlightActiveNav() for query-param awareness**

In `highlightActiveNav()` (lines 230-248), the current code is:

```javascript
function highlightActiveNav() {
  const path = window.location.pathname;
  document.querySelectorAll('.sidebar .nav-link[data-paths]').forEach((link) => {
    link.classList.remove('active');
    const paths = link.dataset.paths.split(',');
    for (let i = 0; i < paths.length; i++) {
      const p = paths[i];
      if (path === p || (p !== '/' && path.startsWith(p))) {
        link.classList.add('active');
        break;
      }
    }
  });
}
```

Replace the entire function with query-param-aware version:

```javascript
function highlightActiveNav() {
  const path = window.location.pathname;
  const fullPath = path + window.location.search;

  document.querySelectorAll('.sidebar .nav-link[data-paths]').forEach((link) => {
    link.classList.remove('active');
    const paths = link.dataset.paths.split(',');
    for (let i = 0; i < paths.length; i++) {
      const p = paths[i];
      // If data-path includes '?', match full path+query; otherwise match pathname only
      const target = p.includes('?') ? fullPath : path;
      if (target === p || (p !== '/' && !p.includes('?') && path.startsWith(p))) {
        link.classList.add('active');
        break;
      }
    }
  });
}
```

This ensures `/editor?view=reviews` matches only the Yfirferðir link (exact match on full path), while `/editor` matches only Ritstjóri (pathname match, no query-string data-path).
```

This way, `/editor?view=reviews` matches exactly for Yfirferðir, and plain `/editor` matches for Ritstjóri (since `/editor?view=reviews` won't match the plain `/editor` data-path exactly, and the startsWith check is skipped for paths without `?`).

- [ ] **Step 6: Verify in browser**

1. Navigate to `/editor` — only "Ritstjóri" should be active in sidebar
2. Navigate to `/editor?view=reviews` — only "Yfirferðir" should be active
3. Navigate to `/assignments` — "Úthlutanir" should be active
4. Check sidebar shows "Álit" link near bottom, navigates to `/feedback`

- [ ] **Step 7: Commit**

```bash
git add server/public/js/layout.js
git commit -m "feat(sidebar): fix Yfirferðir link, add Úthlutanir and Álit links"
```

---

### Task 5: Add review filter mode to segment editor + metadata label

**Files:**
- Modify: `server/public/js/segment-editor.js`

- [ ] **Step 1: Read autoLoadFromParams and filter code**

Read `server/public/js/segment-editor.js` around lines 1943-1984 (`autoLoadFromParams`) and lines 470-480 (filter logic).

- [ ] **Step 2: Add `?view=reviews` support in autoLoadFromParams**

In the `autoLoadFromParams()` function (around line 1949), after reading the URL params, add review mode handling:

```javascript
const params = new URLSearchParams(window.location.search);
const book = params.get('book');
const chapter = params.get('chapter');
const module = params.get('module');
const view = params.get('view');

// Apply review filter mode
if (view === 'reviews') {
  const statusFilter = document.getElementById('filter-status');
  if (statusFilter) {
    statusFilter.value = 'pending';
  }
  // Show info banner
  const selectorCard = document.querySelector('.selector-card');
  if (selectorCard && !document.getElementById('review-mode-banner')) {
    const banner = document.createElement('div');
    banner.id = 'review-mode-banner';
    banner.className = 'review-banner';
    banner.textContent = 'Sýnir einingar sem bíða yfirferðar';
    selectorCard.parentNode.insertBefore(banner, selectorCard.nextSibling);
  }
}
```

- [ ] **Step 3: Add CSS for the review banner**

In `server/public/css/common.css`, add at the end:

```css
/* Review mode banner */
.review-banner {
  background: var(--bg-elevated, #272b33);
  border-left: 3px solid var(--accent, #c87941);
  padding: 0.5rem 1rem;
  font-size: 0.85rem;
  color: var(--text-secondary, #b0a99f);
  margin: 0.5rem 0;
  border-radius: 4px;
}
```

- [ ] **Step 4: Add friendly display for chapter-metadata module card**

In the module list rendering at line 224-240, find this code inside the `.map()` callback at line 227:

```javascript
const displayTitle = m.titleIs || m.title || m.moduleId;
```

Add a `MODULE_LABELS` constant above the `container.innerHTML` assignment (before line 225), and update line 227:

```javascript
// Add before line 225:
const MODULE_LABELS = { 'chapter-metadata': 'Lýsigögn kafla' };

// Change line 227 from:
const displayTitle = m.titleIs || m.title || m.moduleId;
// To:
const displayTitle = MODULE_LABELS[m.moduleId] || m.titleIs || m.title || m.moduleId;
```

- [ ] **Step 5: Verify in browser**

1. Navigate to `/editor?view=reviews` — should show info banner and pre-set status filter to "Breytt" (pending)
2. Navigate to `/editor`, select Efnafræði 2e ch3 — "chapter-metadata" card should show "Lýsigögn kafla"

- [ ] **Step 6: Commit**

```bash
git add server/public/js/segment-editor.js server/public/css/common.css
git commit -m "feat(editor): add review filter mode and metadata module label"
```

---

### Task 6: Add chapter-centric assignment API endpoints

**Files:**
- Modify: `server/routes/admin.js`
- Modify: `server/services/userService.js`

- [ ] **Step 1: Read existing assignment code**

Read `server/routes/admin.js` lines 870-940 (existing user-centric assignment endpoints) and `server/services/userService.js` lines 535-640 (assignment functions). Key existing functions you'll reuse:
- `assignChapter(userId, bookSlug, chapter, assignedBy)` — line 567, INSERT OR IGNORE into `user_chapter_assignments`
- `removeChapterAssignment(userId, bookSlug, chapter)` — line 587, DELETE from `user_chapter_assignments`
- `getChapterAssignments(userId, bookSlug)` — line 604, SELECT by user+book

These exist and work. The new endpoints in Step 5 call them directly.

- [ ] **Step 2: Add service function to get all assignments for a book**

In `server/services/userService.js`, add a new function after `getAllChapterAssignments`:

```javascript
/**
 * Get all chapter assignments for a book (chapter-centric view).
 * Returns one row per assignment with user info.
 */
function getBookAssignments(bookSlug) {
  if (!isUserTableReady()) return [];

  const db = getDb();
  try {
    return db
      .prepare(
        `SELECT a.chapter, a.assigned_by, a.assigned_at,
                u.id as user_id, u.display_name as user_name, u.role
         FROM user_chapter_assignments a
         JOIN users u ON a.user_id = u.id
         WHERE a.book_slug = ?
         ORDER BY a.chapter`
      )
      .all(bookSlug);
  } catch (err) {
    if (err.message && err.message.includes('no such table')) return [];
    throw err;
  }
}
```

- [ ] **Step 3: Add service function to get editors for a book**

```javascript
/**
 * Get active editors who can be assigned to chapters in a book.
 * If user_book_access entries exist for this book, only those users.
 * Otherwise all active users with role >= editor.
 */
function getEditorsForBook(bookSlug) {
  if (!isUserTableReady()) return [];

  const db = getDb();
  try {
    const bookAccessCount = db
      .prepare('SELECT COUNT(*) as cnt FROM user_book_access WHERE book_slug = ?')
      .get(bookSlug);

    if (bookAccessCount && bookAccessCount.cnt > 0) {
      return db
        .prepare(
          `SELECT u.id, u.display_name as name, u.role
           FROM users u
           JOIN user_book_access ba ON u.id = ba.user_id AND ba.book_slug = ?
           WHERE u.is_active = 1 AND u.role IN ('editor', 'head-editor', 'admin')
           ORDER BY u.display_name`
        )
        .all(bookSlug);
    }

    return db
      .prepare(
        `SELECT id, display_name as name, role
         FROM users
         WHERE is_active = 1 AND role IN ('editor', 'head-editor', 'admin')
         ORDER BY display_name`
      )
      .all();
  } catch (err) {
    if (err.message && err.message.includes('no such table')) return [];
    throw err;
  }
}
```

- [ ] **Step 4: Export the new functions**

Add `getBookAssignments` and `getEditorsForBook` to the `module.exports` object at the bottom of `userService.js`.

- [ ] **Step 5: Add chapter-centric API routes**

In `server/routes/admin.js`, add after the existing user-centric assignment routes (around line 940):

```javascript
// ─── Chapter-centric assignment routes (/api/admin/assignments) ───

/**
 * GET /api/admin/assignments/:book
 * Returns all chapters with their assignment status and available editors.
 */
router.get('/assignments/:book', requireAuth, requireRole(ROLES.HEAD_EDITOR), (req, res) => {
  const { book } = req.params;
  if (!VALID_BOOKS.includes(book)) {
    return res.status(400).json({ error: `Invalid book: ${book}` });
  }

  try {
    const assignments = userService.getBookAssignments(book);
    const editors = userService.getEditorsForBook(book);
    res.json({ book, assignments, editors });
  } catch (err) {
    log.error({ err }, 'Get book assignments error');
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/assignments/:book/:chapter
 * Assign a user to a chapter.
 */
router.post('/assignments/:book/:chapter', requireAuth, requireRole(ROLES.HEAD_EDITOR), (req, res) => {
  const { book, chapter } = req.params;
  const { userId } = req.body;

  if (!VALID_BOOKS.includes(book)) {
    return res.status(400).json({ error: `Invalid book: ${book}` });
  }
  const chapterNum = parseInt(chapter, 10);
  if (isNaN(chapterNum) || chapterNum < 0 || chapterNum > 30) {
    return res.status(400).json({ error: `Invalid chapter: ${chapter}` });
  }
  if (!userId || typeof userId !== 'number') {
    return res.status(400).json({ error: 'userId (number) required' });
  }

  try {
    userService.assignChapter(userId, book, chapterNum, req.user.username);
    activityLog.log({
      userId: req.user.id,
      username: req.user.username,
      action: 'assign_chapter',
      book,
      chapter: chapterNum,
      details: `Assigned chapter ${chapterNum} to user ${userId}`,
    });
    res.json({ success: true });
  } catch (err) {
    log.error({ err }, 'Assign chapter error');
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/admin/assignments/:book/:chapter
 * Remove assignment from a chapter.
 */
router.delete('/assignments/:book/:chapter', requireAuth, requireRole(ROLES.HEAD_EDITOR), (req, res) => {
  const { book, chapter } = req.params;

  if (!VALID_BOOKS.includes(book)) {
    return res.status(400).json({ error: `Invalid book: ${book}` });
  }
  const chapterNum = parseInt(chapter, 10);
  if (isNaN(chapterNum) || chapterNum < 0 || chapterNum > 30) {
    return res.status(400).json({ error: `Invalid chapter: ${chapter}` });
  }

  try {
    // Find current assignment to remove
    const assignments = userService.getBookAssignments(book);
    const current = assignments.find((a) => a.chapter === chapterNum);
    if (current) {
      userService.removeChapterAssignment(current.user_id, book, chapterNum);
      activityLog.log({
        userId: req.user.id,
        username: req.user.username,
        action: 'unassign_chapter',
        book,
        chapter: chapterNum,
        details: `Unassigned chapter ${chapterNum}`,
      });
    }
    res.json({ success: true });
  } catch (err) {
    log.error({ err }, 'Unassign chapter error');
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 6: Add activityLog import to admin.js**

`activityLog` is NOT currently imported in `admin.js`. Add it near the other service imports at the top of the file:

```javascript
const activityLog = require('../services/activityLog');
```

Also verify that `ROLES`, `VALID_BOOKS`, `userService`, and `requireRole` are already imported (they should be — they're used by existing routes).

- [ ] **Step 7: Commit**

```bash
git add server/services/userService.js server/routes/admin.js
git commit -m "feat(api): add chapter-centric assignment endpoints"
```

---

### Task 7: Create assignments page (HTML + JS + route)

**Files:**
- Create: `server/views/assignments.html`
- Create: `server/public/js/assignments.js`
- Modify: `server/routes/views.js`

- [ ] **Step 1: Add the route in views.js**

In `server/routes/views.js`, add after the `/admin` route (around line 25):

```javascript
router.get('/assignments', (req, res) => sendView(res, 'assignments.html'));
```

- [ ] **Step 2: Create assignments.html**

Create `server/views/assignments.html`. Follow the same structure as other pages — check `segment-editor.html` line 1 for the pattern. The key elements:

```html
<!DOCTYPE html>
<html lang="is">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Úthlutanir - Námsbókasafn</title>
  <link rel="stylesheet" href="/css/common.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&family=Source+Sans+3:wght@300;400;600;700&display=swap" rel="stylesheet">
</head>
<body>
  <main class="page-content" data-title="Úthlutanir">
    <div class="selector-card">
      <h2>Kaflaúthlutanir</h2>
      <p class="subtitle">Úthlutaðu köflum til ritstjóra.</p>
      <div class="selector-grid">
        <div>
          <label for="book-select">Bók</label>
          <select id="book-select" class="book-select"></select>
        </div>
      </div>
    </div>

    <div id="stats-row" class="stats-row" style="display:none;">
      <div class="stat-card">
        <span class="stat-number" id="stat-assigned">0</span>
        <span class="stat-label">ÚTHLUTAÐ</span>
      </div>
      <div class="stat-card">
        <span class="stat-number stat-warn" id="stat-unassigned">0</span>
        <span class="stat-label">ÓÚTHLUTAÐ</span>
      </div>
      <div class="stat-card">
        <span class="stat-number" id="stat-editors">0</span>
        <span class="stat-label">RITSTJÓRAR</span>
      </div>
    </div>

    <div id="assignments-table-container" style="display:none;">
      <table class="assignments-table">
        <thead>
          <tr>
            <th>KAFLI</th>
            <th>TITILL</th>
            <th>RITSTJÓRI</th>
            <th>FRAMVINDA</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="assignments-tbody"></tbody>
      </table>
    </div>

    <div id="assignments-loading" class="loading-state" style="display:none;">
      <span class="spinner"></span> Hleður...
    </div>
  </main>

  <script src="/js/htmlUtils.js"></script>
  <script src="/js/ui-strings.js"></script>
  <script src="/js/theme.js"></script>
  <script src="/js/layout.js"></script>
  <script src="/js/bookSelector.js"></script>
  <script src="/js/assignments.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create assignments.js**

Create `server/public/js/assignments.js`:

```javascript
/**
 * Assignments Page — Chapter-centric assignment management.
 * Displays all chapters for a book with inline editor dropdowns.
 */
(function () {
  'use strict';

  const API_BASE = '/api/admin/assignments';
  let currentBook = null;
  let editors = [];
  let chapters = [];

  // ─── Init ──────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', () => {
    const bookSelect = document.getElementById('book-select');
    if (!bookSelect) return;

    bookSelect.addEventListener('change', () => {
      const book = bookSelect.value;
      if (book && book !== currentBook) {
        currentBook = book;
        loadAssignments(book);
      }
    });

    // Auto-load from URL param
    const params = new URLSearchParams(window.location.search);
    const bookParam = params.get('book');
    if (bookParam) {
      // bookSelector.js will populate the dropdown; wait for it then select
      const waitForBook = setInterval(() => {
        const opt = bookSelect.querySelector(`option[value="${bookParam}"]`);
        if (opt) {
          clearInterval(waitForBook);
          bookSelect.value = bookParam;
          bookSelect.dispatchEvent(new Event('change'));
        }
      }, 100);
      setTimeout(() => clearInterval(waitForBook), 5000);
    }
  });

  // ─── Load assignments ──────────────────────────────────────

  async function loadAssignments(book) {
    const loading = document.getElementById('assignments-loading');
    const container = document.getElementById('assignments-table-container');
    const statsRow = document.getElementById('stats-row');

    loading.style.display = 'flex';
    container.style.display = 'none';
    statsRow.style.display = 'none';

    try {
      // Fetch assignments and chapter list in parallel
      const [assignData, chapterData] = await Promise.all([
        fetchJson(`${API_BASE}/${book}`),
        fetchJson(`/api/segment-editor/${book}/chapters`),
      ]);

      editors = assignData.editors || [];
      const assignments = assignData.assignments || [];

      // Build chapter list from segment-editor API
      chapters = (chapterData || []).map((ch) => {
        const assignment = assignments.find((a) => a.chapter === ch.chapter);
        return {
          chapter: ch.chapter,
          title: ch.titleIs || ch.title || `Kafli ${ch.chapter}`,
          assignedUserId: assignment ? assignment.user_id : null,
          assignedUserName: assignment ? assignment.user_name : null,
        };
      });

      renderStats(chapters);
      renderTable(chapters);

      statsRow.style.display = 'flex';
      container.style.display = 'block';
    } catch (err) {
      console.error('Failed to load assignments:', err);
      container.innerHTML =
        '<p class="error-text">Villa við að hlaða úthlutanir: ' + escapeHtml(err.message) + '</p>';
      container.style.display = 'block';
    } finally {
      loading.style.display = 'none';
    }
  }

  // ─── Render ────────────────────────────────────────────────

  function renderStats(chapters) {
    const assigned = chapters.filter((c) => c.assignedUserId).length;
    const unassigned = chapters.length - assigned;
    const editorCount = editors.length;

    document.getElementById('stat-assigned').textContent = assigned;
    document.getElementById('stat-unassigned').textContent = unassigned;
    document.getElementById('stat-editors').textContent = editorCount;
  }

  function renderTable(chapters) {
    const tbody = document.getElementById('assignments-tbody');
    tbody.innerHTML = chapters
      .map((ch) => {
        const isUnassigned = !ch.assignedUserId;
        const rowClass = isUnassigned ? ' class="row-unassigned"' : '';
        const options = [
          `<option value=""${!ch.assignedUserId ? ' selected' : ''}>— Óúthlutað —</option>`,
          ...editors.map(
            (e) =>
              `<option value="${e.id}"${e.id === ch.assignedUserId ? ' selected' : ''}>${escapeHtml(e.name || 'Notandi ' + e.id)}</option>`
          ),
        ].join('');

        return (
          `<tr${rowClass}>` +
          `<td class="col-chapter"><strong>K${ch.chapter}</strong></td>` +
          `<td class="col-title">${escapeHtml(ch.title)}</td>` +
          `<td class="col-editor"><select class="assign-select" data-chapter="${ch.chapter}"` +
          ` onchange="window.__assignChapter(this)">${options}</select></td>` +
          `<td class="col-progress"><span class="text-muted">—</span></td>` +
          `<td class="col-action"><a href="/editor?book=${currentBook}&chapter=${ch.chapter}" class="link-accent">Opna →</a></td>` +
          '</tr>'
        );
      })
      .join('');
  }

  // ─── Assignment action ─────────────────────────────────────

  window.__assignChapter = async function (selectEl) {
    const chapter = parseInt(selectEl.dataset.chapter, 10);
    const userId = selectEl.value ? parseInt(selectEl.value, 10) : null;

    try {
      if (userId) {
        await fetchJson(`${API_BASE}/${currentBook}/${chapter}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });
      } else {
        await fetchJson(`${API_BASE}/${currentBook}/${chapter}`, {
          method: 'DELETE',
        });
      }

      // Refresh to update stats and row highlighting
      await loadAssignments(currentBook);
      showToast('Úthlutun uppfærð');
    } catch (err) {
      console.error('Assignment failed:', err);
      showToast('Villa: ' + err.message, 'error');
      // Reload to revert dropdown
      await loadAssignments(currentBook);
    }
  };

  function showToast(message, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }
})();
```

- [ ] **Step 4: Add CSS for assignments page**

In `server/public/css/common.css`, add at the end:

```css
/* Assignments page */
.assignments-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.assignments-table th {
  padding: 0.6rem;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary, #8a7e72);
  text-align: left;
  border-bottom: 2px solid var(--border, #d4cec4);
}

.assignments-table td {
  padding: 0.6rem;
  border-bottom: 1px solid var(--border-light, #e8e2d8);
}

.assignments-table .row-unassigned {
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}

.assign-select {
  padding: 0.3rem 0.5rem;
  border: 1px solid var(--border, #d4cec4);
  border-radius: 4px;
  background: var(--bg-surface, #faf7f2);
  font-size: 0.85rem;
  min-width: 150px;
}

.row-unassigned .assign-select {
  border-color: var(--accent, #c87941);
  color: var(--accent, #c87941);
}

.stats-row {
  display: flex;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
}

.stat-card {
  flex: 1;
  padding: 1rem;
  background: var(--bg-surface, #f5f0e8);
  border-radius: 8px;
  text-align: center;
}

.stat-number {
  display: block;
  font-size: 1.8rem;
  font-weight: 700;
  color: var(--accent, #a85e2d);
}

.stat-number.stat-warn {
  color: var(--error, #c45a3c);
}

.stat-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary, #8a7e72);
}

.link-accent {
  color: var(--accent, #a85e2d);
  text-decoration: none;
  font-size: 0.85rem;
}

.link-accent:hover {
  text-decoration: underline;
}
```

- [ ] **Step 5: Verify in browser**

Navigate to `http://localhost:3000/assignments` — should show book selector, stats, and chapter table. Select a book and verify:
1. Chapters load with titles
2. Editor dropdowns populated
3. Changing a dropdown triggers toast + saves

- [ ] **Step 6: Commit**

```bash
git add server/views/assignments.html server/public/js/assignments.js server/public/css/common.css server/routes/views.js
git commit -m "feat(assignments): add chapter-centric assignment page"
```

---

### Task 8: Connect dashboard "Skoða" buttons to assignments page

**Files:**
- Modify: `server/views/my-work.html`

- [ ] **Step 1: Read the handleAttentionItem function**

Read `server/views/my-work.html` around lines 1874-1890.

- [ ] **Step 2: Update handleAttentionItem for unassigned items**

In `handleAttentionItem()` (line 1874), add a case for `'unassigned'` and update the default:

```javascript
function handleAttentionItem(type, book, chapter, stage) {
  switch (type) {
    case 'blocked':
      window.location.href = '/issues?category=BLOCKED';
      break;
    case 'review':
      window.location.href = '/editor?view=reviews';
      break;
    case 'unassigned':
      window.location.href = '/assignments?book=' + encodeURIComponent(book);
      break;
    default:
      window.location.href = '/progress';
  }
}
```

- [ ] **Step 3: Also update the assignChapter function**

Update the `assignChapter()` function at line 1887:

```javascript
function assignChapter(book, chapter, stage) {
  window.location.href = '/assignments?book=' + encodeURIComponent(book);
}
```

- [ ] **Step 4: Verify in browser**

Navigate to `http://localhost:3000/` — click a "Skoða" button on an unassigned chapter item. Should navigate to `/assignments?book=efnafraedi-2e` (or whichever book).

- [ ] **Step 5: Commit**

```bash
git add server/views/my-work.html
git commit -m "fix(dashboard): connect Skoða buttons to assignments page"
```

---

### Task 9: Final verification

- [ ] **Step 1: Run all tests**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni && npm test
```

Expected: All ~1070 tests pass (new test for `chapter-metadata` included).

- [ ] **Step 2: Manual browser walkthrough**

Verify all 7 fixes using Chrome DevTools MCP:

1. `/assignments` — select book, change assignment dropdown, verify toast
2. `/editor?view=reviews` — verify auto-filter, only Yfirferðir active in sidebar
3. `/editor` — select Efnafræði 2e ch3, click "Lýsigögn kafla" — module loads
4. Sidebar shows "Álit" link → navigates to `/feedback`
5. Sidebar shows "Úthlutanir" link → navigates to `/assignments`
6. `/profile` — shows improved error message with back link
7. `/progress` — shows "Framvinda" in topbar
8. Home dashboard "Skoða" button → navigates to `/assignments?book=...`

- [ ] **Step 3: Commit any final adjustments**

If any verification reveals issues, fix and commit.
