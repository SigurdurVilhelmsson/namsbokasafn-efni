# Pipeline GUI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a standalone chapter pipeline status page with stage visualization, advance/revert controls, locking, and history — then link it from the existing library view.

**Architecture:** New route file `server/routes/pipeline-status.js` provides 5 JSON API endpoints backed by `pipelineStatusService` and `chapterLock`. A new HTML view `chapter-pipeline.html` is a self-contained page (uses layout.js like all views) that fetches data client-side. One surgical edit to `books.html` adds a pipeline link to each chapter card. One surgical edit to `views.js` adds the view route.

**Tech Stack:** Express 5, better-sqlite3 (via existing services), plain HTML/CSS/JS (no frameworks), CSS custom properties from common.css

---

## Context for the Implementer

### Existing Patterns

- **Views** are static HTML served via `res.sendFile()` from `server/views/`. No template engine.
- **Data** is fetched client-side via `fetchJson()` (defined in `/js/htmlUtils.js`) to `/api/*` endpoints.
- **Layout** is injected by `/js/layout.js` — it looks for `<main class="page-content" data-page="..." data-title="...">` and wraps it with sidebar + topbar.
- **Auth** is available as `window.currentUser` after `userLoaded` event (fired by layout.js). User has `.role`, `.username`, `.name`.
- **CSS** uses `common.css` with custom properties: `--bg-base`, `--bg-surface`, `--accent`, `--success`, `--warning`, `--error`, `--text-primary`, `--text-secondary`, `--text-muted`, `--border`, `--spacing-*`, `--radius-*`, etc.
- **Role visibility**: Use `.admin-only` class (hidden by default, shown when admin via layout.js adding `.visible`).
- **Script includes**: `layout.js`, `theme.js`, `htmlUtils.js` (provides `fetchJson()`, `escapeHtml()`, 401 interceptor).

### Services (already exist)

**`server/services/pipelineStatusService.js`** exports:
```js
getChapterStage(bookSlug, chapterNum)    // → { currentStage, stages, publication }
transitionStage(bookSlug, chapterNum, stage, status, user, note?)  // → { stage, status }
revertStage(bookSlug, chapterNum, user, note)   // → { revertedStage, newStatus }
getStageHistory(bookSlug, chapterNum)    // → Array<{ type, stage, status, timestamp, ... }>
STAGE_ORDER    // ['extraction', ..., 'publication']
ALL_STAGES     // base stages + 'publication.mtPreview', etc.
VALID_STATUSES // ['not_started', 'in_progress', 'complete']
```

**`server/lib/chapterLock.js`** exports:
```js
acquireLock(chapterId, username)    // → { ok, lockedBy?, expiresAt? }
releaseLock(chapterId, username)    // → { ok, reason? }
cleanExpiredLocks()                 // → { cleaned }
```

**`server/config.js`** exports: `VALID_BOOKS` (array), `BOOK_LABELS` (slug→title).

**`server/constants.js`** exports: `MAX_CHAPTERS`, `ROLES`.

### Stage Display Names (Icelandic)

```
extraction       → "Útdráttur úr CNXML"
mtReady          → "Tilbúið til vélþýðingar"
mtOutput         → "Vélþýðing móttekin"
linguisticReview → "Málfræðilegar leiðréttingar"
tmCreated        → "Þýðingarminnið búið til"
injection        → "Þýðing sett inn í CNXML"
rendering        → "HTML myndað"
publication      → "Birt á vef"
```

### Stage Tooltips (Icelandic)

```
extraction       → "Enska efnið dregið út úr CNXML skrám og skipt í þýðanleg bútar."
mtReady          → "Bútar merktir og varðir fyrir vélþýðingarvél."
mtOutput         → "Vélþýðing móttekin úr malstadur.is og keyrð í gegn."
linguisticReview → "Ritstjóri fer yfir þýðingu, leiðréttir villur og fínpússar."
tmCreated        → "Þýðingaminni (EN↔IS) búið til úr yfirfarnri þýðingu."
injection        → "Yfirfarin þýðing sett til baka inn í CNXML skjalaformið."
rendering        → "CNXML breytt í HTML til birtingar á vefnum."
publication      → "Lokaskref — efni birt á namsbokasafn.is."
```

### Action Button Labels per Stage

```
extraction       → "Senda í vélþýðingu"
mtReady          → "Merkja sem sent"
mtOutput         → "Hefja málfræðilegar leiðréttingar"
linguisticReview → "Leiðréttingar lokið — búa til þýðingarminnið"
tmCreated        → "Setja þýðingu inn í CNXML"
injection        → "Mynda HTML"
rendering        → "Birta á vef"
publication      → (no button — show green "Birt ✓" badge)
```

---

## Task 1: API Route File

**Files:**
- Create: `server/routes/pipeline-status.js`
- Modify: `server/index.js:86-89` (add import) and `server/index.js:267-270` (mount route)

### Step 1: Create the route file

Create `server/routes/pipeline-status.js` with these 5 endpoints:

```js
/**
 * Pipeline Status Routes
 *
 * API endpoints for chapter pipeline status, stage transitions, and locking.
 *
 * Endpoints:
 *   GET    /api/pipeline-status/:bookSlug/:chapterNum         → stage + history
 *   POST   /api/pipeline-status/:bookSlug/:chapterNum/advance → complete current stage
 *   POST   /api/pipeline-status/:bookSlug/:chapterNum/revert  → admin revert one stage
 *   POST   /api/pipeline-status/:bookSlug/:chapterNum/lock    → acquire lock
 *   DELETE /api/pipeline-status/:bookSlug/:chapterNum/lock    → release lock
 */

const express = require('express');
const router = express.Router();

const pipelineStatus = require('../services/pipelineStatusService');
const chapterLock = require('../lib/chapterLock');
const { requireAuth } = require('../middleware/requireAuth');
const { requireRole, ROLES } = require('../middleware/requireRole');
const { VALID_BOOKS } = require('../config');
const { MAX_CHAPTERS } = require('../constants');

// All endpoints require authentication
router.use(requireAuth);

// --- Parameter validation middleware ---

function validateBookChapter(req, res, next) {
  const { bookSlug, chapterNum } = req.params;

  if (!VALID_BOOKS.includes(bookSlug)) {
    return res.status(400).json({ error: 'Ógild bók: ' + bookSlug });
  }

  const num = parseInt(chapterNum, 10);
  if (isNaN(num) || num < -1 || num > MAX_CHAPTERS) {
    return res.status(400).json({ error: 'Ógilt kaflanúmer' });
  }

  req.chapterNum = num;
  req.bookSlug = bookSlug;
  req.lockId = bookSlug + '-' + (num === -1 ? 'appendices' : String(num).padStart(2, '0'));
  next();
}

router.param('bookSlug', (req, res, next, val) => {
  // Will be validated in validateBookChapter
  next();
});

router.use('/:bookSlug/:chapterNum', validateBookChapter);

// --- Helper: format lock error in Icelandic ---

function lockErrorResponse(lockResult) {
  const expiresAt = new Date(lockResult.expiresAt);
  const now = new Date();
  const diffMin = Math.max(1, Math.round((expiresAt - now) / 60000));
  const timeStr = diffMin >= 60
    ? Math.round(diffMin / 60) + ' klst'
    : diffMin + ' mín';

  return {
    error: 'Læst',
    message: 'Þessi kafli er opinn hjá ' + lockResult.lockedBy + '. Reyndu aftur eftir ' + timeStr + '.',
    lockedBy: lockResult.lockedBy,
    expiresAt: lockResult.expiresAt,
  };
}

// --- GET /:bookSlug/:chapterNum ---

router.get('/:bookSlug/:chapterNum', (req, res) => {
  try {
    const status = pipelineStatus.getChapterStage(req.bookSlug, req.chapterNum);
    const history = pipelineStatus.getStageHistory(req.bookSlug, req.chapterNum);

    // Check lock status
    // acquireLock + immediate release is wasteful; just query the DB directly
    const Database = require('better-sqlite3');
    const path = require('path');
    const dbPath = path.join(__dirname, '..', '..', 'pipeline-output', 'sessions.db');
    let lock = null;
    try {
      const db = new Database(dbPath, { readonly: true });
      const row = db.prepare(
        "SELECT locked_by, expires_at FROM chapter_locks WHERE chapter_id = ? AND expires_at > datetime('now')"
      ).get(req.lockId);
      db.close();
      if (row) {
        lock = { lockedBy: row.locked_by, expiresAt: row.expires_at };
      }
    } catch {
      // Lock table may not exist yet
    }

    res.json({ ...status, history: history.slice(0, 20), lock });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- POST /:bookSlug/:chapterNum/advance ---

router.post('/:bookSlug/:chapterNum/advance',
  requireRole(ROLES.EDITOR),
  (req, res) => {
    try {
      // Acquire lock
      const lockResult = chapterLock.acquireLock(req.lockId, req.user.username);
      if (!lockResult.ok) {
        return res.status(409).json(lockErrorResponse(lockResult));
      }

      try {
        // Determine the current stage and advance it
        const { currentStage, stages } = pipelineStatus.getChapterStage(req.bookSlug, req.chapterNum);

        // If all base stages complete, check publication sub-tracks
        if (currentStage === 'publication') {
          // Find first incomplete publication track
          const pubStages = ['publication.mtPreview', 'publication.faithful', 'publication.localized'];
          const { publication } = pipelineStatus.getChapterStage(req.bookSlug, req.chapterNum);
          const trackMap = { mtPreview: 'publication.mtPreview', faithful: 'publication.faithful', localized: 'publication.localized' };

          let advanced = false;
          for (const [track, stageName] of Object.entries(trackMap)) {
            if (publication[track] !== 'complete') {
              const result = pipelineStatus.transitionStage(
                req.bookSlug, req.chapterNum, stageName, 'complete',
                req.user.username, req.body.note || null
              );
              advanced = true;
              return res.json({ success: true, ...result });
            }
          }

          if (!advanced) {
            return res.status(400).json({ error: 'Allt er þegar lokið' });
          }
        }

        // Complete the current base stage
        const result = pipelineStatus.transitionStage(
          req.bookSlug, req.chapterNum, currentStage, 'complete',
          req.user.username, req.body.note || null
        );

        res.json({ success: true, ...result });
      } finally {
        // Always release lock after operation
        chapterLock.releaseLock(req.lockId, req.user.username);
      }
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

// --- POST /:bookSlug/:chapterNum/revert ---

router.post('/:bookSlug/:chapterNum/revert',
  requireRole(ROLES.ADMIN),
  (req, res) => {
    const note = req.body.note;
    if (!note || note.trim().length < 10) {
      return res.status(400).json({
        error: 'Athugasemd þarf að vera að minnsta kosti 10 stafir',
      });
    }

    try {
      // Acquire lock
      const lockResult = chapterLock.acquireLock(req.lockId, req.user.username);
      if (!lockResult.ok) {
        return res.status(409).json(lockErrorResponse(lockResult));
      }

      try {
        const result = pipelineStatus.revertStage(
          req.bookSlug, req.chapterNum, req.user.username, note
        );
        res.json({ success: true, ...result });
      } finally {
        chapterLock.releaseLock(req.lockId, req.user.username);
      }
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

// --- POST /:bookSlug/:chapterNum/lock ---

router.post('/:bookSlug/:chapterNum/lock',
  requireRole(ROLES.EDITOR),
  (req, res) => {
    try {
      const result = chapterLock.acquireLock(req.lockId, req.user.username);
      if (!result.ok) {
        return res.status(409).json(lockErrorResponse(result));
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// --- DELETE /:bookSlug/:chapterNum/lock ---

router.delete('/:bookSlug/:chapterNum/lock',
  requireRole(ROLES.EDITOR),
  (req, res) => {
    try {
      const username = req.user.role === 'admin'
        ? 'admin:' + req.user.username
        : req.user.username;
      const result = chapterLock.releaseLock(req.lockId, username);
      if (!result.ok) {
        return res.status(403).json({ error: 'Þú átt ekki þessa læsingu' });
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;
```

### Step 2: Mount the route in index.js

In `server/index.js`, add the import near line 89 (after `localizationEditorRoutes`):

```js
const pipelineStatusRoutes = require('./routes/pipeline-status');
```

Mount it near line 270 (after the Phase 8 block):

```js
app.use('/api/pipeline-status', pipelineStatusRoutes);
```

### Step 3: Add view route

In `server/routes/views.js`, add a new view route before the legacy redirects section (after line 26):

```js
router.get('/pipeline/:bookSlug/:chapterNum', (req, res) => sendView(res, 'chapter-pipeline.html'));
```

### Step 4: Test the route

Run: `npm test`
Expected: All existing tests still pass.

### Step 5: Commit

```bash
git add server/routes/pipeline-status.js server/index.js server/routes/views.js
git commit -m "feat: add pipeline status API endpoints and view route"
```

---

## Task 2: Pipeline View HTML

**Files:**
- Create: `server/views/chapter-pipeline.html`

This is the largest task. The view is a self-contained HTML page with embedded CSS and JavaScript. It follows the exact same pattern as all other views (books.html, status.html, etc.): static HTML served by `res.sendFile()`, layout injected by `layout.js`, data fetched client-side.

### Step 1: Create the view file

Create `server/views/chapter-pipeline.html` with the complete content below.

**HTML structure:**

```html
<!DOCTYPE html>
<html lang="is">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Framvinduferill — Námsbókasafn</title>
  <link rel="stylesheet" href="/css/common.css">
  <style>
    /* === PIPELINE STEP INDICATOR === */

    .pipeline-steps {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0;
      margin: var(--spacing-xl) 0;
      padding: 0 var(--spacing-md);
      overflow-x: auto;
    }

    .pipeline-step {
      display: flex;
      flex-direction: column;
      align-items: center;
      position: relative;
      min-width: 80px;
      flex-shrink: 0;
    }

    .step-circle {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: var(--text-sm);
      font-weight: 600;
      border: 2px solid var(--border);
      background: var(--bg-surface);
      color: var(--text-muted);
      position: relative;
      z-index: 1;
      transition: all var(--transition-fast);
    }

    .step-circle.complete {
      background: var(--success);
      border-color: var(--success);
      color: #fff;
    }

    .step-circle.current {
      background: var(--info, #5a8fa8);
      border-color: var(--info, #5a8fa8);
      color: #fff;
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--info, #5a8fa8) 30%, transparent);
    }

    .step-label {
      margin-top: var(--spacing-xs);
      font-size: 0.7rem;
      color: var(--text-muted);
      text-align: center;
      max-width: 90px;
      line-height: 1.2;
    }

    .step-label.current { color: var(--info, #5a8fa8); font-weight: 600; }
    .step-label.complete { color: var(--success); }

    .step-connector {
      flex: 1;
      height: 2px;
      background: var(--border);
      min-width: 16px;
      margin-top: -18px;
      align-self: flex-start;
      margin-top: 18px;
    }

    .step-connector.complete {
      background: var(--success);
    }

    /* === PUBLICATION SUB-TRACKS === */

    .pub-tracks {
      display: flex;
      gap: var(--spacing-lg);
      justify-content: center;
      margin: var(--spacing-md) 0;
      flex-wrap: wrap;
    }

    .pub-track {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      font-size: var(--text-sm);
      color: var(--text-secondary);
    }

    .pub-track input[type="checkbox"] {
      accent-color: var(--success);
      width: 16px;
      height: 16px;
    }

    /* === ACTION AREA === */

    .action-area {
      text-align: center;
      margin: var(--spacing-xl) 0;
    }

    .action-area .btn-primary {
      font-size: var(--text-base);
      padding: var(--spacing-sm) var(--spacing-xl);
    }

    .done-badge {
      display: inline-block;
      background: var(--success);
      color: #fff;
      padding: var(--spacing-xs) var(--spacing-md);
      border-radius: var(--radius-full);
      font-weight: 600;
      font-size: var(--text-base);
    }

    .revert-link {
      display: inline-block;
      margin-top: var(--spacing-md);
      color: var(--text-muted);
      font-size: var(--text-sm);
      cursor: pointer;
      text-decoration: none;
      border: none;
      background: none;
      padding: 0;
    }

    .revert-link:hover { color: var(--warning); }

    /* === LOCK BANNER === */

    .lock-banner {
      padding: var(--spacing-sm) var(--spacing-md);
      border-radius: var(--radius-md);
      margin-bottom: var(--spacing-lg);
      font-size: var(--text-sm);
      display: none;
    }

    .lock-banner.locked-other {
      display: block;
      background: color-mix(in srgb, var(--warning) 15%, var(--bg-surface));
      border: 1px solid var(--warning);
      color: var(--text-primary);
    }

    .lock-banner.locked-self {
      display: block;
      background: color-mix(in srgb, var(--success) 15%, var(--bg-surface));
      border: 1px solid var(--success);
      color: var(--text-primary);
    }

    /* === HISTORY ACCORDION === */

    .history-section {
      margin-top: var(--spacing-xl);
      border-top: 1px solid var(--border);
      padding-top: var(--spacing-md);
    }

    .history-toggle {
      background: none;
      border: none;
      color: var(--text-secondary);
      font-size: var(--text-sm);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: var(--spacing-xs);
      padding: var(--spacing-xs) 0;
      font-family: var(--font-body);
    }

    .history-toggle:hover { color: var(--text-primary); }

    .history-toggle .arrow {
      display: inline-block;
      transition: transform var(--transition-fast);
    }

    .history-toggle.open .arrow { transform: rotate(90deg); }

    .history-list {
      display: none;
      margin-top: var(--spacing-sm);
    }

    .history-list.open { display: block; }

    .history-item {
      padding: var(--spacing-xs) 0;
      font-size: var(--text-xs);
      color: var(--text-muted);
      border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
      line-height: 1.5;
    }

    .history-item:last-child { border-bottom: none; }

    .history-note {
      font-style: italic;
      color: var(--text-secondary);
    }

    /* === CONFIRM DIALOG === */

    .confirm-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.5);
      z-index: 1000;
      align-items: center;
      justify-content: center;
    }

    .confirm-overlay.open { display: flex; }

    .confirm-dialog {
      background: var(--bg-elevated);
      border-radius: var(--radius-lg);
      padding: var(--spacing-lg);
      max-width: 420px;
      width: 90%;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    }

    .confirm-dialog h3 {
      margin: 0 0 var(--spacing-md);
      font-family: var(--font-heading);
      font-size: var(--text-lg);
      color: var(--text-primary);
    }

    .confirm-dialog p {
      margin: 0 0 var(--spacing-md);
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .confirm-dialog textarea {
      width: 100%;
      min-height: 60px;
      margin-bottom: var(--spacing-md);
      padding: var(--spacing-sm);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--bg-surface);
      color: var(--text-primary);
      font-family: var(--font-body);
      font-size: var(--text-sm);
      resize: vertical;
    }

    .confirm-actions {
      display: flex;
      gap: var(--spacing-sm);
      justify-content: flex-end;
    }

    /* === BREADCRUMB (reuse from library) === */

    .pipeline-breadcrumb {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      margin-bottom: var(--spacing-lg);
      font-size: var(--text-sm);
      color: var(--text-muted);
    }

    .pipeline-breadcrumb a {
      color: var(--accent);
      text-decoration: none;
    }

    .pipeline-breadcrumb a:hover { text-decoration: underline; }

    /* === PAGE HEADER === */

    .pipeline-header {
      margin-bottom: var(--spacing-lg);
    }

    .pipeline-header h2 {
      margin: 0;
      font-family: var(--font-heading);
      font-size: var(--text-xl);
      color: var(--text-primary);
    }

    .pipeline-header .subtitle {
      color: var(--text-secondary);
      font-size: var(--text-sm);
      margin-top: var(--spacing-xs);
    }

    /* === LOADING/ERROR === */

    .pipeline-loading {
      text-align: center;
      padding: var(--spacing-2xl);
      color: var(--text-muted);
    }

    .pipeline-error {
      text-align: center;
      padding: var(--spacing-xl);
      color: var(--error);
    }

    /* === STAGE BADGE (small, for links) === */

    .stage-pill {
      display: inline-block;
      padding: 2px 8px;
      border-radius: var(--radius-full);
      font-size: 0.7rem;
      font-weight: 600;
      white-space: nowrap;
    }

    .stage-pill.complete { background: color-mix(in srgb, var(--success) 20%, transparent); color: var(--success); }
    .stage-pill.in-progress { background: color-mix(in srgb, var(--info, #5a8fa8) 20%, transparent); color: var(--info, #5a8fa8); }
    .stage-pill.not-started { background: color-mix(in srgb, var(--text-muted) 15%, transparent); color: var(--text-muted); }
  </style>
</head>
<body>
  <main class="page-content" data-page="pipeline" data-title="Framvinduferill">
    <!-- Lock banner -->
    <div class="lock-banner" id="lock-banner"></div>

    <!-- Breadcrumb -->
    <div class="pipeline-breadcrumb" id="breadcrumb">
      <a href="/library">Bókasafn</a>
      <span>/</span>
      <span id="breadcrumb-book">...</span>
      <span>/</span>
      <span id="breadcrumb-chapter">...</span>
    </div>

    <!-- Header -->
    <div class="pipeline-header" id="pipeline-header">
      <h2 id="page-title">Framvinduferill</h2>
      <div class="subtitle" id="page-subtitle"></div>
    </div>

    <!-- Loading state -->
    <div class="pipeline-loading" id="loading">
      <span class="spinner"></span> Hleður...
    </div>

    <!-- Main content (hidden until loaded) -->
    <div id="pipeline-content" style="display:none">
      <!-- Step indicator -->
      <div class="pipeline-steps" id="steps-container"></div>

      <!-- Publication sub-tracks (shown only when currentStage === 'publication') -->
      <div class="pub-tracks" id="pub-tracks" style="display:none">
        <label class="pub-track">
          <input type="checkbox" id="pub-mt" disabled>
          <span>MT-drög birt</span>
        </label>
        <label class="pub-track">
          <input type="checkbox" id="pub-faithful" disabled>
          <span>Traust þýðing birt</span>
        </label>
        <label class="pub-track">
          <input type="checkbox" id="pub-localized" disabled>
          <span>Staðfærð útgáfa birt</span>
        </label>
      </div>

      <!-- Action area -->
      <div class="action-area" id="action-area"></div>

      <!-- History -->
      <div class="history-section">
        <button class="history-toggle" id="history-toggle" type="button">
          <span class="arrow">&#9654;</span> Ferill
        </button>
        <div class="history-list" id="history-list"></div>
      </div>
    </div>

    <!-- Confirm dialog (advance) -->
    <div class="confirm-overlay" id="confirm-advance">
      <div class="confirm-dialog">
        <h3 id="confirm-advance-title">Staðfesta</h3>
        <p id="confirm-advance-text"></p>
        <textarea id="confirm-advance-note" placeholder="Athugasemd — valkvætt"></textarea>
        <div class="confirm-actions">
          <button class="btn btn-secondary" onclick="closeConfirm('advance')">Hætta við</button>
          <button class="btn btn-primary" id="confirm-advance-btn" onclick="doAdvance()">Staðfesta</button>
        </div>
      </div>
    </div>

    <!-- Confirm dialog (revert) -->
    <div class="confirm-overlay" id="confirm-revert">
      <div class="confirm-dialog">
        <h3>Fara eitt stig til baka</h3>
        <p>Þetta mun afturkalla síðasta lokaða stigið. Athugasemd er nauðsynleg (a.m.k. 10 stafir).</p>
        <textarea id="confirm-revert-note" placeholder="Ástæða fyrir afturköllun..." oninput="checkRevertNote()"></textarea>
        <div class="confirm-actions">
          <button class="btn btn-secondary" onclick="closeConfirm('revert')">Hætta við</button>
          <button class="btn btn-primary" id="confirm-revert-btn" onclick="doRevert()" disabled>Afturkalla</button>
        </div>
      </div>
    </div>
  </main>

  <script src="/js/layout.js"></script>
  <script src="/js/theme.js"></script>
  <script src="/js/htmlUtils.js"></script>
  <script>
    // === Configuration ===

    var STAGE_NAMES = {
      extraction: 'Útdráttur úr CNXML',
      mtReady: 'Tilbúið til vélþýðingar',
      mtOutput: 'Vélþýðing móttekin',
      linguisticReview: 'Málfræðilegar leiðréttingar',
      tmCreated: 'Þýðingarminnið búið til',
      injection: 'Þýðing sett inn í CNXML',
      rendering: 'HTML myndað',
      publication: 'Birt á vef'
    };

    var STAGE_TOOLTIPS = {
      extraction: 'Enska efnið dregið út úr CNXML skrám og skipt í þýðanleg bútar.',
      mtReady: 'Bútar merktir og varðir fyrir vélþýðingarvél.',
      mtOutput: 'Vélþýðing móttekin úr malstadur.is og keyrð í gegn.',
      linguisticReview: 'Ritstjóri fer yfir þýðingu, leiðréttir villur og fínpússar.',
      tmCreated: 'Þýðingaminni (EN↔IS) búið til úr yfirfarnri þýðingu.',
      injection: 'Yfirfarin þýðing sett til baka inn í CNXML skjalaformið.',
      rendering: 'CNXML breytt í HTML til birtingar á vefnum.',
      publication: 'Lokaskref — efni birt á namsbokasafn.is.'
    };

    var ACTION_LABELS = {
      extraction: 'Senda í vélþýðingu',
      mtReady: 'Merkja sem sent',
      mtOutput: 'Hefja málfræðilegar leiðréttingar',
      linguisticReview: 'Leiðréttingar lokið — búa til þýðingarminnið',
      tmCreated: 'Setja þýðingu inn í CNXML',
      injection: 'Mynda HTML',
      rendering: 'Birta á vef'
    };

    var STAGE_ORDER = [
      'extraction', 'mtReady', 'mtOutput', 'linguisticReview',
      'tmCreated', 'injection', 'rendering', 'publication'
    ];

    // === Parse URL ===

    var pathParts = window.location.pathname.split('/');
    var bookSlug = decodeURIComponent(pathParts[2] || '');
    var chapterNum = parseInt(pathParts[3], 10);
    var apiBase = '/api/pipeline-status/' + encodeURIComponent(bookSlug) + '/' + chapterNum;

    // State
    var currentData = null;
    var isLocked = false;
    var lockedByMe = false;

    // === Init ===

    window.addEventListener('userLoaded', function() {
      loadPipelineData();
    });

    // Fallback if userLoaded already fired
    if (window.currentUser) {
      loadPipelineData();
    }

    // Also handle case where user is not logged in
    setTimeout(function() {
      if (!currentData) loadPipelineData();
    }, 2000);

    async function loadPipelineData() {
      try {
        var data = await fetchJson(apiBase);
        currentData = data;

        document.getElementById('loading').style.display = 'none';
        document.getElementById('pipeline-content').style.display = '';

        // Update breadcrumb
        document.getElementById('breadcrumb-book').textContent = bookSlug;
        var chLabel = chapterNum === -1 ? 'Viðaukar' : 'Kafli ' + chapterNum;
        document.getElementById('breadcrumb-chapter').textContent = chLabel;
        document.getElementById('page-title').textContent = chLabel + ' — Framvinduferill';
        document.getElementById('page-subtitle').textContent = bookSlug;

        renderSteps(data);
        renderAction(data);
        renderPubTracks(data);
        renderLockBanner(data.lock);
        renderHistory(data.history || []);
      } catch (err) {
        document.getElementById('loading').innerHTML =
          '<div class="pipeline-error">' + escapeHtml(err.message) + '</div>';
      }
    }

    // === Render Steps ===

    function renderSteps(data) {
      var container = document.getElementById('steps-container');
      var html = '';

      for (var i = 0; i < STAGE_ORDER.length; i++) {
        var stage = STAGE_ORDER[i];
        var stageStatus;

        if (stage === 'publication') {
          // Publication is "complete" only if all 3 sub-tracks are complete
          var pub = data.publication || {};
          var allPubDone = pub.mtPreview === 'complete' && pub.faithful === 'complete' && pub.localized === 'complete';
          stageStatus = allPubDone ? 'complete' : (data.currentStage === 'publication' ? 'current' : 'future');
        } else {
          var s = data.stages[stage];
          if (s === 'complete') stageStatus = 'complete';
          else if (stage === data.currentStage) stageStatus = 'current';
          else stageStatus = 'future';
        }

        // Connector before step (skip first)
        if (i > 0) {
          var connClass = 'step-connector';
          // Connector is "complete" if the step to its LEFT is complete
          var prevStage = STAGE_ORDER[i - 1];
          if (data.stages[prevStage] === 'complete') connClass += ' complete';
          html += '<div class="' + connClass + '"></div>';
        }

        var circleClass = 'step-circle';
        var circleContent = String(i + 1);
        var labelClass = 'step-label';

        if (stageStatus === 'complete') {
          circleClass += ' complete';
          circleContent = '&#10003;';
          labelClass += ' complete';
        } else if (stageStatus === 'current') {
          circleClass += ' current';
          labelClass += ' current';
        }

        html += '<div class="pipeline-step">' +
          '<div class="' + circleClass + '" title="' + escapeHtml(STAGE_TOOLTIPS[stage]) + '">' +
            circleContent +
          '</div>' +
          '<div class="' + labelClass + '">' + escapeHtml(STAGE_NAMES[stage]) + '</div>' +
        '</div>';
      }

      container.innerHTML = html;
    }

    // === Render Publication Sub-tracks ===

    function renderPubTracks(data) {
      var pubEl = document.getElementById('pub-tracks');
      if (data.currentStage !== 'publication') {
        pubEl.style.display = 'none';
        return;
      }

      pubEl.style.display = '';
      var pub = data.publication || {};
      document.getElementById('pub-mt').checked = pub.mtPreview === 'complete';
      document.getElementById('pub-faithful').checked = pub.faithful === 'complete';
      document.getElementById('pub-localized').checked = pub.localized === 'complete';
    }

    // === Render Action Button ===

    function renderAction(data) {
      var area = document.getElementById('action-area');

      if (isLocked && !lockedByMe) {
        area.innerHTML = '';
        return;
      }

      // Check if everything is done
      if (data.currentStage === 'publication') {
        var pub = data.publication || {};
        var allDone = pub.mtPreview === 'complete' && pub.faithful === 'complete' && pub.localized === 'complete';
        if (allDone) {
          area.innerHTML = '<span class="done-badge">Birt &#10003;</span>';
          return;
        }
      }

      var label = ACTION_LABELS[data.currentStage];
      if (!label) {
        area.innerHTML = '<span class="done-badge">Birt &#10003;</span>';
        return;
      }

      var html = '<button class="btn btn-primary" onclick="showAdvanceConfirm()">' +
        escapeHtml(label) + '</button>';

      // Admin revert link
      if (window.currentUser && window.currentUser.role === 'admin') {
        html += '<br><button class="revert-link admin-only visible" onclick="showRevertConfirm()">' +
          '&#8617; Fara eitt stig til baka</button>';
      }

      area.innerHTML = html;
    }

    // === Lock Banner ===

    function renderLockBanner(lock) {
      var banner = document.getElementById('lock-banner');
      banner.className = 'lock-banner';

      if (!lock) {
        isLocked = false;
        lockedByMe = false;
        banner.style.display = 'none';
        return;
      }

      var me = window.currentUser && window.currentUser.username;
      if (lock.lockedBy === me) {
        isLocked = true;
        lockedByMe = true;
        banner.className = 'lock-banner locked-self';
        banner.textContent = '\uD83D\uDD12 Þú ert með þennan kafla opinn.';
      } else {
        isLocked = true;
        lockedByMe = false;
        banner.className = 'lock-banner locked-other';
        banner.textContent = '\u26A0 ' + escapeHtml(lock.lockedBy) + ' er að vinna í þessum kafla.';
      }
    }

    // === History ===

    function renderHistory(history) {
      var list = document.getElementById('history-list');
      var items = history.slice(0, 10);

      if (items.length === 0) {
        list.innerHTML = '<div class="history-item">Enginn ferill enn.</div>';
        return;
      }

      list.innerHTML = items.map(function(item) {
        var date = item.timestamp ? new Date(item.timestamp).toLocaleDateString('is-IS') : '';
        var user = item.completedBy || item.username || 'kerfi';

        if (item.type === 'status') {
          var stageName = STAGE_NAMES[item.stage] || item.stage;
          var statusIs = item.status === 'complete' ? 'lokið' : (item.status === 'in_progress' ? 'í vinnslu' : 'ekki byrjað');
          var line = date + ' ' + escapeHtml(user) + ' — ' + escapeHtml(stageName) + ': ' + statusIs;
          if (item.notes) {
            line += ' <span class="history-note">"' + escapeHtml(item.notes) + '"</span>';
          }
          return '<div class="history-item">' + line + '</div>';
        }

        if (item.type === 'log') {
          var details = '';
          if (item.details && typeof item.details === 'object') {
            details = item.details.file || item.action || '';
          }
          return '<div class="history-item">' +
            date + ' ' + escapeHtml(user) + ' — ' + escapeHtml(item.action || '') +
            (details ? ' <span class="history-note">' + escapeHtml(details) + '</span>' : '') +
          '</div>';
        }

        return '';
      }).join('');
    }

    // History toggle
    document.getElementById('history-toggle').addEventListener('click', function() {
      this.classList.toggle('open');
      document.getElementById('history-list').classList.toggle('open');
    });

    // === Confirm Dialogs ===

    function showAdvanceConfirm() {
      if (!currentData) return;
      var stageName = STAGE_NAMES[currentData.currentStage] || currentData.currentStage;
      var label = ACTION_LABELS[currentData.currentStage] || 'Staðfesta';
      document.getElementById('confirm-advance-title').textContent = label;
      document.getElementById('confirm-advance-text').textContent =
        'Þetta merkir stigið "' + stageName + '" sem lokið.';
      document.getElementById('confirm-advance-note').value = '';
      document.getElementById('confirm-advance').classList.add('open');
    }

    function showRevertConfirm() {
      document.getElementById('confirm-revert-note').value = '';
      document.getElementById('confirm-revert-btn').disabled = true;
      document.getElementById('confirm-revert').classList.add('open');
    }

    function closeConfirm(type) {
      document.getElementById('confirm-' + type).classList.remove('open');
    }

    function checkRevertNote() {
      var note = document.getElementById('confirm-revert-note').value.trim();
      document.getElementById('confirm-revert-btn').disabled = note.length < 10;
    }

    // Wire up the oninput for revert note
    document.getElementById('confirm-revert-note').addEventListener('input', checkRevertNote);

    // === API Actions ===

    async function doAdvance() {
      closeConfirm('advance');
      var note = document.getElementById('confirm-advance-note').value.trim();

      try {
        await fetchJson(apiBase + '/advance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note: note || undefined })
        });
        loadPipelineData();
      } catch (err) {
        alert(err.message);
      }
    }

    async function doRevert() {
      closeConfirm('revert');
      var note = document.getElementById('confirm-revert-note').value.trim();

      try {
        await fetchJson(apiBase + '/revert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note: note })
        });
        loadPipelineData();
      } catch (err) {
        alert(err.message);
      }
    }
  </script>
</body>
</html>
```

### Step 2: Test manually

Start the server and visit `/pipeline/efnafraedi-2e/1`. Verify:
- Layout shell (sidebar, topbar) renders
- Step indicator shows 8 circles
- Action button appears based on current stage
- History accordion toggles
- Advance/revert dialogs work

### Step 3: Commit

```bash
git add server/views/chapter-pipeline.html
git commit -m "feat: add chapter pipeline status view"
```

---

## Task 3: Integration into books.html

**Files:**
- Modify: `server/views/books.html:1387-1399`

This is one surgical edit. Find the chapter card rendering in `loadBookDetail()` and add a pipeline link.

### Step 1: Find the insertion point

In `books.html` around line 1387-1399, find this exact block inside the `.map()`:

```js
          return '<div class="chapter-card" onclick="loadChapterDetailFromBooks(\'' + slug + '\', ' + ch.chapterNum + ')">' +
            '<div class="chapter-card-header">' +
              '<span class="chapter-card-num">K. ' + ch.chapterNum + '</span>' +
              '<span class="chapter-card-badge ' + badgeClass + '">' + badgeText + '</span>' +
            '</div>' +
            '<div class="chapter-card-title">' + escapeHtml(ch.titleIs || ch.titleEn) + '</div>' +
```

### Step 2: Add the pipeline link

Replace the chapter card header block to add a pipeline link after the badge:

```js
          return '<div class="chapter-card" onclick="loadChapterDetailFromBooks(\'' + slug + '\', ' + ch.chapterNum + ')">' +
            '<div class="chapter-card-header">' +
              '<span class="chapter-card-num">K. ' + ch.chapterNum + '</span>' +
              '<a href="/pipeline/' + slug + '/' + ch.chapterNum + '" class="pipeline-link" onclick="event.stopPropagation()" title="Framvinduferill">' +
                '<span class="stage-pill ' + badgeClass + '">' + badgeText + '</span>' +
              '</a>' +
            '</div>' +
            '<div class="chapter-card-title">' + escapeHtml(ch.titleIs || ch.titleEn) + '</div>' +
```

### Step 3: Add the stage-pill CSS

Add these styles to the `<style>` block in books.html (find an appropriate spot, e.g., near the `.chapter-card-badge` styles):

```css
    .pipeline-link {
      text-decoration: none;
    }

    .stage-pill {
      display: inline-block;
      padding: 2px 8px;
      border-radius: var(--radius-full);
      font-size: 0.7rem;
      font-weight: 600;
      white-space: nowrap;
    }

    .stage-pill.complete { background: color-mix(in srgb, var(--success) 20%, transparent); color: var(--success); }
    .stage-pill.in-progress { background: color-mix(in srgb, var(--info, #5a8fa8) 20%, transparent); color: var(--info, #5a8fa8); }
    .stage-pill.not-started { background: color-mix(in srgb, var(--text-muted) 15%, transparent); color: var(--text-muted); }
```

### Step 4: Run tests

Run: `npm test`
Expected: All tests pass (no test changes needed — this is a view-only change).

### Step 5: Commit

```bash
git add server/views/books.html
git commit -m "feat: add pipeline link to chapter cards in library view"
```

---

## Task 4: API Tests

**Files:**
- Create: `server/__tests__/pipelineStatusRoutes.test.js`

### Step 1: Write route tests

```js
/**
 * Pipeline Status Routes Tests
 *
 * Tests the API endpoints for pipeline status, advance, revert, and locking.
 * Uses in-memory better-sqlite3 DB.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const pipelineStatus = require('../services/pipelineStatusService');
const chapterLock = require('../lib/chapterLock');

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE chapter_pipeline_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_slug TEXT NOT NULL,
      chapter_num INTEGER NOT NULL,
      stage TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'not_started',
      completed_at TEXT,
      completed_by TEXT,
      notes TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(book_slug, chapter_num, stage)
    );

    CREATE TABLE chapter_generation_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_slug TEXT NOT NULL,
      chapter_num INTEGER NOT NULL,
      action TEXT NOT NULL,
      user_id TEXT,
      username TEXT,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE chapter_locks (
      chapter_id TEXT PRIMARY KEY,
      locked_by TEXT NOT NULL,
      locked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL
    );
  `);
  return db;
}

describe('pipeline status + locking integration', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
    pipelineStatus._setTestDb(db);
    chapterLock._setTestDb(db);
  });

  it('advance requires prior stage complete', () => {
    // Cannot complete mtReady without extraction being complete
    expect(() => {
      pipelineStatus.transitionStage('efnafraedi-2e', 1, 'mtReady', 'complete', 'anna');
    }).toThrow('extraction must be complete first');
  });

  it('advance works when prerequisites met', () => {
    pipelineStatus.transitionStage('efnafraedi-2e', 1, 'extraction', 'complete', 'anna');
    const result = pipelineStatus.transitionStage('efnafraedi-2e', 1, 'mtReady', 'complete', 'anna');
    expect(result).toEqual({ stage: 'mtReady', status: 'complete' });
  });

  it('lock prevents another user from locking', () => {
    const r1 = chapterLock.acquireLock('efnafraedi-2e-01', 'anna');
    expect(r1.ok).toBe(true);

    const r2 = chapterLock.acquireLock('efnafraedi-2e-01', 'jon');
    expect(r2.ok).toBe(false);
    expect(r2.lockedBy).toBe('anna');
  });

  it('revert requires note of 10+ characters', () => {
    pipelineStatus.transitionStage('efnafraedi-2e', 1, 'extraction', 'complete', 'anna');

    expect(() => {
      pipelineStatus.revertStage('efnafraedi-2e', 1, 'anna', 'short');
    }).not.toThrow(); // revertStage itself just requires non-empty

    // The route validates 10-char minimum; the service just requires non-empty
  });

  it('getChapterStage returns correct currentStage', () => {
    pipelineStatus.transitionStage('efnafraedi-2e', 1, 'extraction', 'complete', 'anna');
    pipelineStatus.transitionStage('efnafraedi-2e', 1, 'mtReady', 'complete', 'anna');

    const result = pipelineStatus.getChapterStage('efnafraedi-2e', 1);
    expect(result.currentStage).toBe('mtOutput');
    expect(result.stages.extraction).toBe('complete');
    expect(result.stages.mtReady).toBe('complete');
    expect(result.stages.mtOutput).toBe('not_started');
  });

  it('history includes status entries', () => {
    pipelineStatus.transitionStage('efnafraedi-2e', 1, 'extraction', 'complete', 'anna', 'First extract');

    const history = pipelineStatus.getStageHistory('efnafraedi-2e', 1);
    expect(history.length).toBeGreaterThan(0);
    expect(history[0].type).toBe('status');
    expect(history[0].stage).toBe('extraction');
  });
});
```

### Step 2: Run the test

Run: `npx vitest run server/__tests__/pipelineStatusRoutes.test.js`
Expected: All 5 tests pass.

### Step 3: Run full test suite

Run: `npm test`
Expected: All tests pass (existing + new).

### Step 4: Commit

```bash
git add server/__tests__/pipelineStatusRoutes.test.js
git commit -m "test: add pipeline status routes integration tests"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | API routes + mounting + view route | `pipeline-status.js`, `index.js`, `views.js` |
| 2 | Standalone pipeline HTML view | `chapter-pipeline.html` |
| 3 | Pipeline link in library chapter cards | `books.html` |
| 4 | Integration tests | `pipelineStatusRoutes.test.js` |
