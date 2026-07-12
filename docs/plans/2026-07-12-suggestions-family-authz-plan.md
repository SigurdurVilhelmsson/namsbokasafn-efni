# Suggestions-Family Authz + Audit-Log Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Book-scope all 10 routes in `server/routes/suggestions.js` (closing B1-F1's cross-book write hole and folding in B1-F2/F3 editor-scoping for this family), fix the broken `activityLog.log()` call shape at all 7 mutating sites, and ship it as one PR off branch `fix/suggestions-family-authz`.

**Architecture:** A new reusable middleware `requireBookAccessForSection(resolveSectionId)` in `server/middleware/requireRole.js` resolves a section (directly from `:sectionId`, or via a suggestion `:id` → its owning section) to its book+chapter, then delegates to the existing `requireBookAccess()` logic — no authz-logic duplication. `scan-book` gets the strict `requireHeadEditor('bookSlug')` gate. The activityLog fix mirrors commit `07cd26e0` (sections.js), but with enum-correct `type` strings added to `ACTIVITY_TYPES`.

**Tech Stack:** Express 5 (CommonJS in `server/`), better-sqlite3, Vitest integration tests via `server/__tests__/crossBookAuthz.test.js` (real HTTP against an ephemeral app + temp SQLite DB), unit tests via `server/__tests__/requireRole.test.js` (fake req/res, no DB).

**Design doc:** `docs/plans/2026-07-12-suggestions-family-authz-design.md`. This plan amends it in three places (verified against code 2026-07-12):

1. **Cross-book head-editor semantics on editor-level routes.** The design's middleware spec ("delegate to `requireBookAccess`, reuse don't reimplement") and its test line "cross-book HE → 403" contradict each other: `requireBookAccess` (`requireRole.js:172`) sends a head-editor who does NOT own the book down the *editor* chapter-assignment path — under the default fail-open model (no assignments for the caller, `enforce_assignments` OFF) they pass, exactly like a plain editor. The middleware spec wins (it is the lead-approved mechanism and is coherent with the project's documented fail-open access model). The test matrix asserts the true semantics: fail-open passes are pinned and documented; a dedicated **enforcement-ON block** (book_settings `enforce_assignments=1` for `efnafraedi-2e` in the harness) supplies the real cross-book 403s.
2. **The suggestions service does NOT self-init its table.** `localization_suggestions` is created by migration `004-terminology.js:85`, not by the service (`getDb()` just opens the DB). The test harness creates it (Task 2), along with four other schema pieces the newly-reached code paths need: `book_sections.faithful_path` (scanBook's SQL names it), `users.provider_id` (`findByProviderId` queries it — every editor-path request would 500 without it), `user_book_access` (`getBookAccess` runs whenever `findByProviderId` finds a row), and `book_settings` (`isAssignmentEnforced`).
3. **Two same-class riders found while reading the family:** (a) `POST /:sectionId/bulk` never checks that the posted `ids` belong to `:sectionId` — the section gate could be cleared with one section while mutating another book's rows (id-smuggling); fixed with a containment check → 400. (b) `sync-log`'s `canSync` passes ANY head-editor globally (`req.user.role === ROLES.HEAD_EDITOR`, no book check) — tightened to head-editor-of-this-book. Both are one-liners in the same file, same authz class, each with a regression test. The UI is unaffected (localization-editor.js sends same-section ids and the sync button is used by the owning team).

## Global Constraints

- Branch: `fix/suggestions-family-authz` (already checked out, design + register commits present). One PR at the end.
- `npm test` from the **repo root** is the authoritative gate (no branch protection). Run it before the final push.
- `server/` is CommonJS (`require`/`module.exports`); tests are ESM Vitest files using `createRequire`.
- **Route ordering must be preserved:** `GET /patterns` is registered BEFORE `GET /:sectionId` in `suggestions.js` — do not reorder routes.
- User-facing/`description` strings are Icelandic (project UI convention).
- Every commit message ends with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- Push gotcha: after any prior `gh pr merge --delete-branch`, run `git fetch origin` BEFORE the first push of this branch (prevents the 2GiB pack reject).
- Do not touch `books/*/01-source/` (read-only, licence-load-bearing) — no task here goes near it.

---

### Task 1: `requireBookAccessForSection` middleware + unit tests

**Files:**
- Modify: `server/middleware/requireRole.js` (insert after `requireHeadEditorFor`, i.e. after line 144; add export)
- Test: `server/__tests__/requireRole.test.js` (append a describe block; extend the destructured import)

**Interfaces:**
- Consumes: existing `requireBookAccess()` (same module), `hasRole`/`ROLES` (already imported), `bookRegistration.getSection(sectionId)` → `{ id, bookId, bookSlug, chapterNum, sectionNum, … } | null` (`server/services/bookRegistration.js:717`).
- Produces: `requireBookAccessForSection(resolveSectionId)` → Express middleware. `resolveSectionId(req)` returns a section id (number|string), or falsy / throws when the target is missing (→ 404). On success the middleware sets `req.section` (the full resolved section object), `req.params.book`, `req.chapterNum` (String), then delegates to `requireBookAccess()`. Tasks 2–4 rely on: the export name `requireBookAccessForSection`, and `req.section.{bookSlug,chapterNum,sectionNum}` being available in handlers.

- [ ] **Step 1: Write the failing unit tests**

Append to `server/__tests__/requireRole.test.js`. Also extend the import destructure at the top of the file:

```js
const { requireHeadEditor, requireHeadEditorFor, requireBookAccessForSection, ROLES } =
  require('../middleware/requireRole');
```

Append at the end of the file:

```js
describe('requireBookAccessForSection(resolveSectionId)', () => {
  // These cover only the pre-resolution branches — nothing here may reach
  // bookRegistration.getSection (this suite has no DB). The resolution +
  // delegation branches are covered end-to-end in crossBookAuthz.test.js.
  const viewer = { id: 5, username: 'view', role: ROLES.VIEWER, books: [] };

  it('rejects anonymous with 401 before resolving anything', () => {
    let resolverCalled = false;
    const { res, nextCalled } = run(
      requireBookAccessForSection(() => {
        resolverCalled = true;
        return 1;
      }),
      { params: {} }
    );
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(resolverCalled).toBe(false);
  });

  it('rejects below-editor roles with 403 before resolving (no DB work for viewers)', () => {
    let resolverCalled = false;
    const { res, nextCalled } = run(
      requireBookAccessForSection(() => {
        resolverCalled = true;
        return 1;
      }),
      { user: viewer, params: {} }
    );
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(resolverCalled).toBe(false);
  });

  it('maps a throwing resolver to 404 (missing-target contract, requireHeadEditorFor parity)', () => {
    const { res, nextCalled } = run(
      requireBookAccessForSection(() => {
        throw new Error('Suggestion not found');
      }),
      { user: editorA, params: {} }
    );
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Suggestion not found');
  });

  it('maps a falsy resolution to 404', () => {
    const { res, nextCalled } = run(requireBookAccessForSection(() => null), {
      user: editorA,
      params: {},
    });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Target not found');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (repo root): `npx vitest run server/__tests__/requireRole.test.js`
Expected: the 4 new tests FAIL with `requireBookAccessForSection is not a function`; the pre-existing tests stay green.

- [ ] **Step 3: Implement the middleware**

In `server/middleware/requireRole.js`, add the service import after the existing `userService` import (line 9):

```js
const bookRegistration = require('../services/bookRegistration');
```

(Verified 2026-07-12: `bookRegistration`'s require chain is logger/constants/openstaxCatalogue/openstaxFetcher/pipelineStatusService/dbPath — no path back to this middleware, and no eager DB open at module load. Step 4 re-proves it.)

Insert after `requireHeadEditorFor` (after line 144, before `requireEditor`):

```js
/**
 * Book-scope a route keyed by a section (or an entity that resolves to a section).
 *
 * resolveSectionId(req) returns a section id (number|string), or a falsy value /
 * throws when the target entity does not exist (both → 404). The section's owning
 * book + chapter are resolved via bookRegistration.getSection, then the request is
 * delegated to requireBookAccess() — so the semantics are exactly its semantics:
 * admin passes; a head-editor OF THIS BOOK passes; everyone else (plain editors
 * AND head-editors of other books) takes the chapter-assignment path — fail-open
 * when the caller has no assignments for the book and enforcement is OFF,
 * default-deny when the book's enforce_assignments toggle is ON, 503 fail-closed
 * when enforcement is ON but assignments cannot be evaluated.
 *
 * Also attaches the resolved section as req.section for downstream handlers.
 *
 * @param {function(req): (number|string|undefined)} resolveSectionId
 * @returns {function} Express middleware
 */
function requireBookAccessForSection(resolveSectionId) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please log in to access this resource',
      });
    }

    // Min-role fast-fail so sub-editor callers never trigger DB resolution.
    if (!hasRole(req.user.role, ROLES.EDITOR)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: 'This action requires editor role or higher',
        yourRole: req.user.role,
      });
    }

    let sectionId;
    try {
      sectionId = resolveSectionId(req);
    } catch (err) {
      // Resolver signals a missing target by throwing (requireHeadEditorFor parity)
      return res.status(404).json({ error: err.message });
    }

    if (!sectionId) {
      return res.status(404).json({ error: 'Target not found' });
    }

    const section = bookRegistration.getSection(parseInt(sectionId, 10));
    if (!section) {
      return res.status(404).json({ error: 'Section not found' });
    }

    // Hand requireBookAccess exactly what it reads, and keep the resolved
    // section for handlers (audit-log columns, sync-log's localizer check).
    req.section = section;
    req.params.book = section.bookSlug;
    req.chapterNum = String(section.chapterNum); // String: chapter 0 (front matter) must stay truthy
    return requireBookAccess()(req, res, next);
  };
}
```

Add `requireBookAccessForSection,` to the `module.exports` object (between `requireHeadEditorFor` and `requireEditor`).

- [ ] **Step 4: Verify no circular require / eager-load breakage**

Run (repo root): `cd server && node -e "const m = require('./middleware/requireRole'); if (typeof m.requireBookAccessForSection !== 'function') process.exit(1); console.log('ok')" && cd ..`
Expected: prints `ok`, exit 0. If this hangs or throws a cycle error, move the `bookRegistration` require inside the middleware function body and re-run.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run server/__tests__/requireRole.test.js`
Expected: PASS (all, including the 4 new ones).

- [ ] **Step 6: Commit**

```bash
git add server/middleware/requireRole.js server/__tests__/requireRole.test.js
git commit -m "feat(authz): requireBookAccessForSection — section-resolved book/chapter scoping

New reusable middleware for routes keyed by :sectionId or an entity that
resolves to a section. Resolves section → book+chapter via
bookRegistration.getSection, then delegates to requireBookAccess() (no
authz-logic duplication). B1-F1 design §middleware; B1-F2/F3 adopt it next.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Harness extension + scan-book gate + its activityLog site + ACTIVITY_TYPES

**Files:**
- Modify: `server/services/activityLog.js` (extend `ACTIVITY_TYPES`, lines 17–43)
- Modify: `server/routes/suggestions.js` (the `scan-book` route only, lines 53–79)
- Test: `server/__tests__/crossBookAuthz.test.js` (harness DDL/seed extension in `beforeAll` + router registration + scan-book describe block)

**Interfaces:**
- Consumes: `requireHeadEditor(bookParam)` (existing, `requireRole.js:55`).
- Produces: six new `ACTIVITY_TYPES` members Tasks 3–4 reference by these exact names: `SUGGESTIONS_SCANNED: 'suggestions_scanned'`, `SUGGESTION_ACCEPTED: 'suggestion_accepted'`, `SUGGESTION_REJECTED: 'suggestion_rejected'`, `SUGGESTION_MODIFIED: 'suggestion_modified'`, `SUGGESTIONS_BULK_REVIEWED: 'suggestions_bulk_reviewed'`, `SUGGESTIONS_SYNCED: 'suggestions_synced'`. Harness fixtures Tasks 3–4 rely on: sections 60/61/62, suggestions 70–75, users rows with `provider_id` for `u-ed`/`u-he-b`, `book_settings` row enforcing `efnafraedi-2e`.

- [ ] **Step 1: Extend the harness in `crossBookAuthz.test.js` `beforeAll`**

Insert immediately after the existing big `db.exec(\`…\`)` DDL block (after line 72, before the `registered_books` INSERTs):

```js
  // Suggestions-family (B1-F1) schema extension. localization_suggestions is
  // created by migration 004 in production (the service does NOT self-init it);
  // DDL copied from 004-terminology.js:85 (FK omitted — better-sqlite3 defaults
  // foreign_keys off and the harness uses explicit ids). faithful_path: scanBook's
  // SQL names bs.faithful_path, so the column must exist even though every harness
  // row leaves it NULL (→ 0 sections scanned). provider_id: requireBookAccess's
  // editor path calls userService.findByProviderId, which queries it — without the
  // column every editor-path request 500s. user_book_access: findByProviderId calls
  // getBookAccess whenever it finds a row. book_settings: isAssignmentEnforced.
  db.exec(`
    ALTER TABLE book_sections ADD COLUMN faithful_path TEXT;
    ALTER TABLE users ADD COLUMN provider_id TEXT;
    CREATE TABLE IF NOT EXISTS user_book_access (
      user_id INTEGER NOT NULL, book_slug TEXT NOT NULL, role_for_book TEXT
    );
    CREATE TABLE IF NOT EXISTS book_settings (
      book TEXT PRIMARY KEY, enforce_assignments INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS localization_suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section_id INTEGER NOT NULL,
      suggestion_type TEXT NOT NULL,
      original_text TEXT NOT NULL,
      suggested_text TEXT NOT NULL,
      context TEXT,
      line_number INTEGER,
      pattern_id TEXT,
      status TEXT DEFAULT 'pending',
      reviewer_modified_text TEXT,
      reviewed_by TEXT,
      reviewed_by_name TEXT,
      reviewed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
```

Insert after the last existing section seed (`db.prepare(\`UPDATE book_sections SET linguistic_reviewer = 'u-he-b' WHERE id = 49\`).run();`, line 127) and before `db.close()`:

```js
  // ── Suggestions-family fixtures (B1-F1 + folded B1-F2/F3) ──
  // Enforcement stays OFF for liffraedi-2e (fail-open matrix — the project's
  // default model) and is turned ON for efnafraedi-2e (default-deny matrix).
  // Only the new suggestions routes reach requireBookAccess's chapter-assignment
  // path in this suite (everything older is requireHeadEditor/-For gated), so
  // the toggle cannot affect the pre-existing tests.
  db.prepare(
    `INSERT INTO book_settings (book, enforce_assignments) VALUES ('efnafraedi-2e', 1)`
  ).run();
  // users rows WITH provider_id so findByProviderId resolves these personas.
  // A JWT user with no users row skips the chapter check entirely (dbUser-null
  // fall-through in requireBookAccess) — that would mask the enforcement-ON 403s
  // asserted below. HE_A deliberately gets NO row: the fail-open cases document
  // that the unknown-to-DB fall-through also passes when enforcement is off.
  db.prepare(
    `INSERT INTO users (id, display_name, role, provider_id) VALUES (2, 'Editor Ed', 'editor', 'u-ed')`
  ).run();
  db.prepare(
    `INSERT INTO users (id, display_name, role, provider_id) VALUES (3, 'Head B', 'head-editor', 'u-he-b')`
  ).run();
  // Fresh sections (no interference with rows 42-51):
  ins.run(60, 1, 1, '1.20', 'not_started'); // liffraedi: fail-open matrix + bulk
  ins.run(61, 2, 2, '1.21', 'not_started'); // efnafraedi: enforcement-ON + resolver discrimination
  ins.run(62, 1, 1, '1.22', 'not_started'); // liffraedi: sync-log (kept suggestion-free → entriesCreated 0, no localization_log table needed)
  const insSug = db.prepare(
    `INSERT INTO localization_suggestions (id, section_id, suggestion_type, original_text, suggested_text)
     VALUES (?, ?, 'unit_conversion', '5 miles', '8.0 km')`
  );
  insSug.run(70, 60); // accept target (fail-open editor)
  insSug.run(71, 60); // reject target
  insSug.run(72, 60); // modify target
  insSug.run(73, 60); // bulk-accept target
  insSug.run(74, 60); // bulk-accept target
  insSug.run(75, 61); // efnafraedi: discrimination + enforcement-ON target
```

Register the router — add to the `app.use` block in `beforeAll` (after `app.use('/api/activity', …)`, line 136):

```js
  app.use('/api/suggestions', require('../routes/suggestions'));
```

- [ ] **Step 2: Write the failing scan-book matrix**

Append at the end of `crossBookAuthz.test.js`:

```js
// ============================================================================
// Suggestions family (B1-F1 + folded B1-F2/F3 for this family)
// ============================================================================

describe('suggestions scan-book is head-editor-of-book scoped (B1-F1)', () => {
  const SCAN_BOOK = '/api/suggestions/scan-book/liffraedi-2e';

  it('head-editor of another book → 403 (was: any head-editor could regenerate any book)', async () => {
    const res = await post(SCAN_BOOK, HE_A);
    expect(res.status).toBe(403);
  });
  it('owning head-editor reaches a genuine 200 (scan-book activityLog site executes end-to-end)', async () => {
    const res = await post(SCAN_BOOK, HE_B);
    expect(res.status).toBe(200);
  });
  it('admin bypasses book scope (200)', async () => {
    const res = await post(SCAN_BOOK, ADMIN);
    expect(res.status).toBe(200);
  });
  it('plain editor → 403 (role gate, unchanged)', async () => {
    const res = await post(SCAN_BOOK, EDITOR);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 3: Run to verify the expected failures**

Run: `npx vitest run server/__tests__/crossBookAuthz.test.js`
Expected: cross-book HE_A test FAILS (currently 200-path — global role gate lets any head-editor through; the run may show 500 from the broken activityLog write, either way not 403). Owner/admin tests FAIL with 500 (activityLog `NOT NULL constraint failed: activity_log.type`). Editor-403 test PASSES (pin). All pre-existing tests still green.

- [ ] **Step 4: Add the six ACTIVITY_TYPES members**

In `server/services/activityLog.js`, extend `ACTIVITY_TYPES` (insert before the closing `};` at line 43):

```js
  // Localization suggestion actions
  SUGGESTIONS_SCANNED: 'suggestions_scanned',
  SUGGESTION_ACCEPTED: 'suggestion_accepted',
  SUGGESTION_REJECTED: 'suggestion_rejected',
  SUGGESTION_MODIFIED: 'suggestion_modified',
  SUGGESTIONS_BULK_REVIEWED: 'suggestions_bulk_reviewed',
  SUGGESTIONS_SYNCED: 'suggestions_synced',
```

- [ ] **Step 5: Fix the scan-book route (gate + log shape)**

In `server/routes/suggestions.js`, first extend the middleware import (line 15):

```js
const {
  requireRole,
  requireHeadEditor,
  requireBookAccessForSection,
  ROLES,
} = require('../middleware/requireRole');
```

(`requireBookAccessForSection` is unused until Task 3 — importing it now keeps the import line stable across tasks. `requireRole` itself becomes unused after Task 3 removes the last `requireRole(ROLES.EDITOR)` gate; leave it in the destructure until then, Task 3 removes it.)

Replace the whole scan-book route (lines 57–79) with:

```js
router.post('/scan-book/:bookSlug', requireAuth, requireHeadEditor('bookSlug'), (req, res) => {
  const { bookSlug } = req.params;

  try {
    const result = suggestions.scanBook(bookSlug);

    activityLog.log({
      type: activityLog.ACTIVITY_TYPES.SUGGESTIONS_SCANNED,
      userId: req.user.id,
      username: req.user.username,
      book: bookSlug,
      description: `${req.user.username} skannaði bókina ${bookSlug} eftir staðfæringartillögum`,
      metadata: {
        bookSlug,
        sectionsScanned: result.sectionsScanned,
        totalSuggestions: result.totalSuggestions,
      },
    });

    res.json(result);
  } catch (err) {
    log.error({ err }, 'Scan book error');
    res.status(500).json({
      error: 'Failed to scan book',
      message: err.message,
    });
  }
});
```

- [ ] **Step 6: Run to verify green**

Run: `npx vitest run server/__tests__/crossBookAuthz.test.js`
Expected: PASS — all 4 scan-book tests plus every pre-existing test.

- [ ] **Step 7: Commit**

```bash
git add server/services/activityLog.js server/routes/suggestions.js server/__tests__/crossBookAuthz.test.js
git commit -m "fix(authz): book-scope suggestions scan-book + correct its activityLog shape (B1-F1)

scan-book/:bookSlug was gated on GLOBAL requireRole(HEAD_EDITOR) — a
head-editor of book A could DELETE+regenerate book B's pending suggestions.
Now requireHeadEditor('bookSlug'). Its activityLog call also used the legacy
{action,entityType,details} shape (NOT NULL violation → 500 after the write
committed); corrected to the real contract with a new enum-correct
ACTIVITY_TYPES.SUGGESTIONS_SCANNED (B1-F7/F9 class not grown). Test harness
extended with the suggestions-family schema (localization_suggestions from
migration 004, faithful_path, provider_id, user_book_access, book_settings).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Section-keyed routes — gating, activityLog sites, bulk containment, sync-log rider

**Files:**
- Modify: `server/routes/suggestions.js` (routes: `POST /scan/:sectionId`, `GET /:sectionId`, `GET /:sectionId/stats`, `POST /:sectionId/bulk`, `POST /:sectionId/sync-log`; add the two resolvers)
- Test: `server/__tests__/crossBookAuthz.test.js` (new describe blocks)

**Interfaces:**
- Consumes: `requireBookAccessForSection` (Task 1), `req.section.{bookSlug,chapterNum,sectionNum}` set by it, `ACTIVITY_TYPES.SUGGESTIONS_SCANNED/SUGGESTIONS_BULK_REVIEWED/SUGGESTIONS_SYNCED` (Task 2), fixtures 60/62/70–75 (Task 2), `suggestions.getSuggestions(sectionId)` → array of `{ id, sectionId, … }` (`localizationSuggestions.js:516`), `suggestions.getSuggestion(id)` → `{ …, sectionId } | null` (`:549`).
- Produces: module-level resolvers `bySectionParam` and `bySuggestionParam` in `suggestions.js` that Task 4 reuses (exact code below).

- [ ] **Step 1: Write the failing tests**

Append to `crossBookAuthz.test.js`:

```js
describe('suggestions section-keyed routes are book/section-scoped (B1-F2/F3 fold-in)', () => {
  // ── Fail-open block (liffraedi-2e, enforcement OFF — the project's default
  // model, enforce_assignments not set). requireBookAccessForSection delegates
  // to requireBookAccess, so a caller with no assignments for the book passes:
  // that includes plain editors AND head-editors of OTHER books (they take the
  // same editor path — see the middleware JSDoc). The cross-book denials live
  // in the enforcement-ON block below.
  it('scan: plain editor clears authz fail-open and reaches a genuine 200 (scan activityLog site executes)', async () => {
    const res = await post('/api/suggestions/scan/60', EDITOR);
    expect(res.status).toBe(200);
  });
  it('read: head-editor of another book ALSO clears fail-open (documented requireBookAccess fall-through, same as any editor)', async () => {
    const res = await get('/api/suggestions/60', HE_A);
    expect(res.status).toBe(200);
  });
  it('stats: plain editor clears fail-open (200)', async () => {
    const res = await get('/api/suggestions/60/stats', EDITOR);
    expect(res.status).toBe(200);
  });

  // ── Enforcement-ON block (efnafraedi-2e, enforce_assignments=1 in the
  // harness): the chapter-assignment path turns default-deny, which is where
  // the middleware's cross-book protection actually bites.
  it('scan: unassigned editor → 403 under enforcement (default-deny)', async () => {
    const res = await post('/api/suggestions/scan/61', EDITOR);
    expect(res.status).toBe(403);
  });
  it('read: unassigned editor → 403 under enforcement (GETs are gated too)', async () => {
    const res = await get('/api/suggestions/61', EDITOR);
    expect(res.status).toBe(403);
  });
  it('read: owning head-editor short-circuits enforcement (200)', async () => {
    const res = await get('/api/suggestions/61', HE_A);
    expect(res.status).toBe(200);
  });
  it('read: admin short-circuits enforcement (200)', async () => {
    const res = await get('/api/suggestions/61', ADMIN);
    expect(res.status).toBe(200);
  });

  // ── Not-found + route-ordering pins
  it('scan: unknown section → 404', async () => {
    const res = await post('/api/suggestions/scan/99999', HE_B);
    expect(res.status).toBe(404);
  });
  it('read: non-numeric :sectionId → 404 (getSection(NaN) yields no row)', async () => {
    const res = await get('/api/suggestions/abc', HE_B);
    expect(res.status).toBe(404);
  });
  it('patterns route stays first and unscoped (requireAuth only)', async () => {
    const res = await get('/api/suggestions/patterns', EDITOR);
    expect(res.status).toBe(200);
  });
});

describe('suggestions bulk route contains ids to the gated section (id-smuggling rider)', () => {
  it('owning head-editor bulk-accepts same-section ids and reaches a genuine 200 (bulk activityLog site executes)', async () => {
    const res = await post('/api/suggestions/60/bulk', HE_B, { ids: [73, 74], action: 'accept' });
    expect(res.status).toBe(200);
  });
  it('ids belonging to another section → 400 (suggestion 75 is section 61 / efnafraedi)', async () => {
    const res = await post('/api/suggestions/60/bulk', HE_B, { ids: [75], action: 'accept' });
    expect(res.status).toBe(400);
  });
});

describe('suggestions sync-log: middleware + book-scoped canSync (rider)', () => {
  // Section 62 is liffraedi-owned and suggestion-free (entriesCreated: 0), so a
  // genuine 200 needs no localization_log table and no cross-test ordering.
  it('head-editor of another book → 403 from canSync (clears fail-open middleware, then the book-scoped elevated check denies)', async () => {
    const res = await post('/api/suggestions/62/sync-log', HE_A);
    expect(res.status).toBe(403);
  });
  it('plain editor (not the assigned localizer) → 403 from canSync (localizer gate preserved beneath the middleware)', async () => {
    const res = await post('/api/suggestions/62/sync-log', EDITOR);
    expect(res.status).toBe(403);
  });
  it('owning head-editor reaches a genuine 200 (sync-log activityLog site executes)', async () => {
    const res = await post('/api/suggestions/62/sync-log', HE_B);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run to verify the expected failures**

Run: `npx vitest run server/__tests__/crossBookAuthz.test.js`
Expected failures: `scan/60` EDITOR → 500 (mutation commits, activityLog throws); enforcement 403s → currently 200 (no gate); `scan/99999` → PASSES already (scanSection's own not-found mapping — pin); bulk 200 → 500 (activityLog); bulk foreign-id → currently 200 (no containment); sync-log HE_A → currently 500-or-200 (global-HE canSync passes, then activityLog throws) — must become 403; sync-log HE_B → 500 (activityLog); fail-open GETs and `/patterns` → already PASS (pins). Pre-existing tests stay green.

- [ ] **Step 3: Add the resolvers and rewire the five routes**

In `server/routes/suggestions.js`, add the resolvers right after the `activityLog` require (line 18):

```js
// ── requireBookAccessForSection resolvers ──
// Resolve the gated section straight from the :sectionId route param.
const bySectionParam = (req) => req.params.sectionId;
// Resolve a suggestion :id to its owning section (null → middleware 404s).
const bySuggestionParam = (req) => {
  const s = suggestions.getSuggestion(parseInt(req.params.id, 10));
  return s ? s.sectionId : null;
};
```

**Route `POST /scan/:sectionId`** — replace the whole route (lines 28–51) with:

```js
router.post(
  '/scan/:sectionId',
  requireAuth,
  requireBookAccessForSection(bySectionParam),
  (req, res) => {
    const { sectionId } = req.params;

    try {
      const result = suggestions.scanSection(parseInt(sectionId, 10));

      activityLog.log({
        type: activityLog.ACTIVITY_TYPES.SUGGESTIONS_SCANNED,
        userId: req.user.id,
        username: req.user.username,
        book: req.section.bookSlug,
        chapter: String(req.section.chapterNum),
        section: req.section.sectionNum,
        description: `${req.user.username} skannaði kafla ${req.section.sectionNum} eftir staðfæringartillögum`,
        metadata: { sectionId: parseInt(sectionId, 10), suggestionsFound: result.suggestionsCount },
      });

      res.json(result);
    } catch (err) {
      log.error({ err }, 'Scan section error');
      res.status(err.message.includes('not found') ? 404 : 500).json({
        error: 'Failed to scan section',
        message: err.message,
      });
    }
  }
);
```

**Route `GET /:sectionId`** — change only the middleware chain (line 111):

```js
router.get('/:sectionId', requireAuth, requireBookAccessForSection(bySectionParam), (req, res) => {
```

**Route `GET /:sectionId/stats`** — change only the middleware chain (line 137):

```js
router.get(
  '/:sectionId/stats',
  requireAuth,
  requireBookAccessForSection(bySectionParam),
  (req, res) => {
```

(Keep each handler body unchanged; only the gate changes on the two GETs.)

**Route `POST /:sectionId/bulk`** — replace the whole route (lines 289–332) with:

```js
router.post(
  '/:sectionId/bulk',
  requireAuth,
  requireBookAccessForSection(bySectionParam),
  (req, res) => {
    const { sectionId } = req.params;
    const { ids, action } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        error: 'Missing ids',
        message: 'ids array is required',
      });
    }

    if (!['accept', 'reject'].includes(action)) {
      return res.status(400).json({
        error: 'Invalid action',
        message: 'action must be "accept" or "reject"',
      });
    }

    try {
      // Book-scope containment: every id must belong to the gated section —
      // otherwise the :sectionId gate could be cleared with one section while
      // mutating another book's rows.
      const requestedIds = ids.map((id) => parseInt(id, 10));
      const sectionIds = new Set(
        suggestions.getSuggestions(parseInt(sectionId, 10)).map((s) => s.id)
      );
      const foreign = requestedIds.filter((id) => !sectionIds.has(id));
      if (foreign.length > 0) {
        return res.status(400).json({
          error: 'Invalid ids',
          message: `Suggestions do not belong to section ${sectionId}: ${foreign.join(', ')}`,
        });
      }

      const result = suggestions.bulkUpdateSuggestions(
        requestedIds,
        action,
        req.user.id,
        req.user.name
      );

      activityLog.log({
        type: activityLog.ACTIVITY_TYPES.SUGGESTIONS_BULK_REVIEWED,
        userId: req.user.id,
        username: req.user.username,
        book: req.section.bookSlug,
        chapter: String(req.section.chapterNum),
        section: req.section.sectionNum,
        description: `${req.user.username} afgreiddi ${requestedIds.length} staðfæringartillögur (${action}) í kafla ${req.section.sectionNum}`,
        metadata: { sectionId: parseInt(sectionId, 10), count: requestedIds.length, bulkAction: action },
      });

      res.json(result);
    } catch (err) {
      log.error({ err }, 'Bulk update suggestions error');
      res.status(500).json({
        error: 'Failed to bulk update suggestions',
        message: err.message,
      });
    }
  }
);
```

(`bulkAction` — not `action:` — in metadata keeps Task 4's static guard clean.)

**Route `POST /:sectionId/sync-log`** — replace the whole route (lines 342–387) with:

```js
router.post(
  '/:sectionId/sync-log',
  requireAuth,
  requireBookAccessForSection(bySectionParam),
  (req, res) => {
    const { sectionId } = req.params;

    try {
      // Middleware already resolved (and 404-guarded) the section.
      const section = req.section;

      // Sync is restricted to the assigned localizer or elevated roles —
      // elevated meaning admin, or a head-editor OF THIS BOOK (a global
      // head-editor check here was the B1-F1 class: any HE of any book passed).
      const canSync =
        section.localizer === req.user.id ||
        req.user.role === ROLES.ADMIN ||
        (req.user.role === ROLES.HEAD_EDITOR &&
          Array.isArray(req.user.books) &&
          req.user.books.includes(section.bookSlug));

      if (!canSync) {
        return res.status(403).json({
          error: 'Not authorized',
          message: 'Only the assigned localizer can sync suggestions',
        });
      }

      const result = suggestions.syncToLocalizationLog(parseInt(sectionId, 10), req.user.id);

      activityLog.log({
        type: activityLog.ACTIVITY_TYPES.SUGGESTIONS_SYNCED,
        userId: req.user.id,
        username: req.user.username,
        book: section.bookSlug,
        chapter: String(section.chapterNum),
        section: section.sectionNum,
        description: `${req.user.username} samstillti samþykktar staðfæringartillögur við staðfæringarskrá fyrir kafla ${section.sectionNum}`,
        metadata: { sectionId: parseInt(sectionId, 10), entriesCreated: result.entriesCreated },
      });

      res.json(result);
    } catch (err) {
      log.error({ err }, 'Sync suggestions to log error');
      res.status(500).json({
        error: 'Failed to sync to localization log',
        message: err.message,
      });
    }
  }
);
```

(The old handler's own `bookRegistration.getSection` lookup + 404 block is deleted — the middleware does both. If `bookRegistration` is now unreferenced in `suggestions.js`, remove its require at line 17.)

- [ ] **Step 4: Run to verify green**

Run: `npx vitest run server/__tests__/crossBookAuthz.test.js`
Expected: PASS — all new describe blocks and every pre-existing test.

- [ ] **Step 5: Commit**

```bash
git add server/routes/suggestions.js server/__tests__/crossBookAuthz.test.js
git commit -m "fix(authz): book-scope section-keyed suggestions routes (B1-F2/F3 fold-in)

scan/:sectionId, GET /:sectionId, /stats, /bulk, /sync-log now gate through
requireBookAccessForSection (section → book+chapter → requireBookAccess
delegation: enforcement-aware, 404 on unknown sections). Two riders of the
same class: /bulk now rejects ids that don't belong to the gated section
(id-smuggling → 400), and sync-log's canSync head-editor branch is scoped to
the section's book (was a global role check). scan/bulk/sync-log activityLog
sites corrected to the real {type, description, metadata} contract with
enum-correct types and real book/chapter/section columns.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Suggestion-id-keyed routes (accept/reject/modify) + static shape guard

**Files:**
- Modify: `server/routes/suggestions.js` (routes: `POST /:id/accept`, `POST /:id/reject`, `POST /:id/modify`)
- Test: `server/__tests__/crossBookAuthz.test.js` (new describe block incl. the static guard)

**Interfaces:**
- Consumes: `bySuggestionParam` resolver (Task 3), `req.section` (Task 1), `ACTIVITY_TYPES.SUGGESTION_ACCEPTED/SUGGESTION_REJECTED/SUGGESTION_MODIFIED` (Task 2), fixtures 70–72/75 (Task 2).
- Produces: nothing consumed later; completes the 7-site activityLog fix, enabling the file-wide static guard.

- [ ] **Step 1: Write the failing tests**

Append to `crossBookAuthz.test.js`:

```js
describe('suggestion-id routes resolve to their owning section and book-scope on it', () => {
  // Suggestion 75 → section 61 → efnafraedi-2e (enforcement ON, HE_A's book).
  it('accept: head-editor of another book → 403 under enforcement (suggestion 75 is efnafraedi)', async () => {
    const res = await post('/api/suggestions/75/accept', HE_B);
    expect(res.status).toBe(403);
  });
  it('accept: owning head-editor → genuine 200 via the suggestion→section resolver (discriminates the resolver from a liffraedi constant; accept activityLog site executes)', async () => {
    const res = await post('/api/suggestions/75/accept', HE_A);
    expect(res.status).toBe(200);
  });
  // Suggestions 70-72 → section 60 → liffraedi-2e (fail-open).
  it('accept: plain editor clears fail-open on liffraedi and reaches a genuine 200', async () => {
    const res = await post('/api/suggestions/70/accept', EDITOR);
    expect(res.status).toBe(200);
  });
  it('reject: owning head-editor → genuine 200 (reject activityLog site executes)', async () => {
    const res = await post('/api/suggestions/71/reject', HE_B);
    expect(res.status).toBe(200);
  });
  it('modify: owning head-editor → genuine 200 (modify activityLog site executes)', async () => {
    const res = await post('/api/suggestions/72/modify', HE_B, { modifiedText: '8,0 km' });
    expect(res.status).toBe(200);
  });
  it('unknown suggestion id → 404 from the resolver (was a formatSuggestion TypeError → 500)', async () => {
    const res = await post('/api/suggestions/99999/accept', HE_B);
    expect(res.status).toBe(404);
  });
});

describe('suggestions.js activityLog call shape (static guard, mirrors the sections.js guard)', () => {
  it('has no legacy {action:/entityType:/details:} call shape left', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../routes/suggestions.js'), 'utf8');
    expect(src).not.toMatch(/\baction:\s*['"`]/);
    expect(src).not.toMatch(/\bentityType:/);
    expect(src).not.toMatch(/\bdetails:/);
  });
});
```

- [ ] **Step 2: Run to verify the expected failures**

Run: `npx vitest run server/__tests__/crossBookAuthz.test.js`
Expected failures: accept-75 HE_B → currently 200-or-500, must be 403; the four genuine-200 tests → 500 (activityLog shape); unknown-id → 500 (TypeError in `formatSuggestion(undefined)`); static guard → fails on the three remaining legacy sites. Everything else green.

- [ ] **Step 3: Rewire the three routes**

**Route `POST /:id/accept`** — replace the whole route with:

```js
router.post(
  '/:id/accept',
  requireAuth,
  requireBookAccessForSection(bySuggestionParam),
  (req, res) => {
    const { id } = req.params;

    try {
      const suggestion = suggestions.acceptSuggestion(parseInt(id, 10), req.user.id, req.user.name);

      activityLog.log({
        type: activityLog.ACTIVITY_TYPES.SUGGESTION_ACCEPTED,
        userId: req.user.id,
        username: req.user.username,
        book: req.section.bookSlug,
        chapter: String(req.section.chapterNum),
        section: req.section.sectionNum,
        description: `${req.user.username} samþykkti staðfæringartillögu #${id} í kafla ${req.section.sectionNum}`,
        metadata: {
          suggestionId: parseInt(id, 10),
          sectionId: suggestion.sectionId,
          suggestionType: suggestion.type,
          original: suggestion.originalText,
        },
      });

      res.json({
        success: true,
        suggestion,
      });
    } catch (err) {
      log.error({ err }, 'Accept suggestion error');
      res.status(500).json({
        error: 'Failed to accept suggestion',
        message: err.message,
      });
    }
  }
);
```

**Route `POST /:id/reject`** — replace the whole route with:

```js
router.post(
  '/:id/reject',
  requireAuth,
  requireBookAccessForSection(bySuggestionParam),
  (req, res) => {
    const { id } = req.params;

    try {
      const suggestion = suggestions.rejectSuggestion(parseInt(id, 10), req.user.id, req.user.name);

      activityLog.log({
        type: activityLog.ACTIVITY_TYPES.SUGGESTION_REJECTED,
        userId: req.user.id,
        username: req.user.username,
        book: req.section.bookSlug,
        chapter: String(req.section.chapterNum),
        section: req.section.sectionNum,
        description: `${req.user.username} hafnaði staðfæringartillögu #${id} í kafla ${req.section.sectionNum}`,
        metadata: {
          suggestionId: parseInt(id, 10),
          sectionId: suggestion.sectionId,
          suggestionType: suggestion.type,
          original: suggestion.originalText,
        },
      });

      res.json({
        success: true,
        suggestion,
      });
    } catch (err) {
      log.error({ err }, 'Reject suggestion error');
      res.status(500).json({
        error: 'Failed to reject suggestion',
        message: err.message,
      });
    }
  }
);
```

**Route `POST /:id/modify`** — replace the whole route with:

```js
router.post(
  '/:id/modify',
  requireAuth,
  requireBookAccessForSection(bySuggestionParam),
  (req, res) => {
    const { id } = req.params;
    const { modifiedText } = req.body;

    if (!modifiedText) {
      return res.status(400).json({
        error: 'Missing modifiedText',
        message: 'modifiedText is required',
      });
    }

    try {
      const suggestion = suggestions.modifySuggestion(
        parseInt(id, 10),
        modifiedText,
        req.user.id,
        req.user.name
      );

      activityLog.log({
        type: activityLog.ACTIVITY_TYPES.SUGGESTION_MODIFIED,
        userId: req.user.id,
        username: req.user.username,
        book: req.section.bookSlug,
        chapter: String(req.section.chapterNum),
        section: req.section.sectionNum,
        description: `${req.user.username} breytti og samþykkti staðfæringartillögu #${id} í kafla ${req.section.sectionNum}`,
        metadata: {
          suggestionId: parseInt(id, 10),
          sectionId: suggestion.sectionId,
          suggestionType: suggestion.type,
          original: suggestion.originalText,
          modified: modifiedText,
        },
      });

      res.json({
        success: true,
        suggestion,
      });
    } catch (err) {
      log.error({ err }, 'Modify suggestion error');
      res.status(500).json({
        error: 'Failed to modify suggestion',
        message: err.message,
      });
    }
  }
);
```

Now every route in the file is gated by `requireHeadEditor`/`requireBookAccessForSection`/`requireAuth`-only(`/patterns`) — `requireRole` is unreferenced. Remove `requireRole` and `ROLES`… **no**: `ROLES` is still used by sync-log's `canSync`. Remove only `requireRole` from the destructure:

```js
const { requireHeadEditor, requireBookAccessForSection, ROLES } = require('../middleware/requireRole');
```

- [ ] **Step 4: Run to verify green**

Run: `npx vitest run server/__tests__/crossBookAuthz.test.js`
Expected: PASS — all suites in the file.

- [ ] **Step 5: Commit**

```bash
git add server/routes/suggestions.js server/__tests__/crossBookAuthz.test.js
git commit -m "fix(authz): book-scope suggestion-id routes + finish 7-site activityLog fix (B1-F1)

accept/reject/modify now resolve the suggestion to its owning section
(bySuggestionParam) and gate through requireBookAccessForSection — an
unknown id is a clean 404 (was a formatSuggestion TypeError 500). Their
activityLog sites move to the real contract (enum-correct types, Icelandic
descriptions, real book/chapter/section columns); a static guard pins the
whole file against the legacy {action,entityType,details} shape, and every
one of the 7 sites is runtime-exercised to a genuine 200 in the matrix.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Full-suite verification, docs/register updates, PR

**Files:**
- Modify: `docs/plans/2026-07-11-pre-semester-coding-campaign.md` (B1-F1 entry at line 19; B1-F2/F3 entries at lines 21–22)
- Modify: `docs/plans/2026-07-12-suggestions-family-authz-design.md` (append an amendment note)
- Modify (outside repo): `~/.claude/projects/-home-siggi-dev-repos-namsbokasafn-efni/memory/server-editor-review-2026-07.md` and `MEMORY.md` (resume-point update)

**Interfaces:**
- Consumes: all prior tasks committed; PR number from `gh pr create` output.
- Produces: the merged-ready PR; register/memory state for the next session (batch 2).

- [ ] **Step 1: Run the full authoritative gate**

Run (repo root): `npm test`
Expected: full Vitest suite green (~2130+ tests). If anything unrelated is red, STOP and report — do not merge over a red suite.

- [ ] **Step 2: Amend the design doc**

Append to `docs/plans/2026-07-12-suggestions-family-authz-design.md`:

```markdown
## Amendment (2026-07-12, implementation)

Implemented per `docs/plans/2026-07-12-suggestions-family-authz-plan.md`, with three
verified corrections to this design: (1) the §Testing line "cross-book HE → 403" on
editor-level routes contradicted the delegation mechanism — `requireBookAccess` sends a
non-owning head-editor down the editor fail-open path; the shipped matrix pins the true
fail-open semantics and supplies the cross-book 403s via an enforcement-ON
(`book_settings.enforce_assignments=1`) block instead. (2) `localization_suggestions` is
created by migration 004, not self-init'd by the service — the test harness creates it
plus `faithful_path`/`provider_id`/`user_book_access`/`book_settings`. (3) Two same-class
riders shipped with tests: `/bulk` id-containment (ids must belong to the gated section,
else 400) and sync-log `canSync` head-editor branch scoped to the section's book.
```

- [ ] **Step 3: Push and open the PR**

```bash
git fetch origin
git push -u origin fix/suggestions-family-authz
gh pr create --title "fix(authz): book-scope the suggestions route family + 7-site activityLog fix (B1-F1, folds B1-F2/F3 for this family)" --body "$(cat <<'EOF'
## Summary
- **B1-F1 (important):** `POST /scan-book/:bookSlug` was gated on GLOBAL head-editor role — a head-editor of book A could DELETE+regenerate book B's pending localization suggestions. Now `requireHeadEditor('bookSlug')`.
- **B1-F2/F3 fold-in (this family):** the 7 editor-level routes (`scan`, GET, stats, accept, reject, modify, bulk, sync-log) now gate through a new reusable `requireBookAccessForSection(resolveSectionId)` middleware — section (or suggestion→section) resolved to book+chapter, then delegated to `requireBookAccess` (enforcement-aware, 404 on unknown targets). `sections.js`/`books.js` surfaces adopt it in a follow-up.
- **activityLog shape (all 7 sites):** legacy `{action, entityType, details}` violated the `{type, description, metadata}` NOT NULL contract → every mutation 500'd after committing. Fixed mirroring `07cd26e0`, with six new enum-correct `ACTIVITY_TYPES` members (off-enum vocabulary class not grown). All 7 sites are runtime-exercised to genuine 200s; a static guard pins the file.
- **Riders (same class, same file):** `/bulk` now rejects ids that don't belong to the gated section (id-smuggling → 400); sync-log's `canSync` head-editor branch is scoped to the section's book (was global-role).

## Design deviations (verified against code)
Cross-book head-editors on editor-level routes follow `requireBookAccess` delegation semantics (fail-open pass without enforcement, exactly like plain editors); the cross-book 403s are asserted under an enforcement-ON block. Details in the design doc amendment.

## Test plan
- `server/__tests__/requireRole.test.js`: 4 unit tests for the new middleware's pre-resolution branches.
- `server/__tests__/crossBookAuthz.test.js`: scan-book matrix, fail-open + enforcement-ON matrices, resolver discrimination (suggestion 75 → efnafraedi), 404s, bulk containment, sync-log canSync, static shape guard.
- Full `npm test` from repo root green.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Note the PR number printed by `gh pr create`.

- [ ] **Step 4: Update the campaign register with the real PR number**

In `docs/plans/2026-07-11-pre-semester-coding-campaign.md` (substitute `#<PR>` with the number from Step 3):

Replace the B1-F1 entry's leading status clause (line 19, the part before "Original finding:") with:

```markdown
- **B1-F1 `[fix]` — ✅ SHIPPED PR #<PR> (2026-07-12, branch `fix/suggestions-family-authz`).** Full scope delivered: all 10 suggestions routes book-scoped (`scan-book` → `requireHeadEditor('bookSlug')`; the 7 editor-level routes → new reusable `requireBookAccessForSection(resolveSectionId)` middleware in `requireRole.js`), activityLog shape corrected at all 7 sites with enum-correct `ACTIVITY_TYPES`, plus two same-class riders (bulk id-containment 400; sync-log `canSync` HE branch book-scoped). Design + amendment: `docs/plans/2026-07-12-suggestions-family-authz-design.md`; plan: `docs/plans/2026-07-12-suggestions-family-authz-plan.md`. Original finding: …(keep the rest of the existing entry text unchanged)…
```

In the B1-F2 entry (line 21), replace the trailing NOTE sentence with:

```markdown
**NOTE (2026-07-12): `requireBookAccessForSection(resolveSectionId)` now EXISTS (shipped in B1-F1's PR #<PR>) — adopt it on `sections.js` status/submit-review and `books.js` files/scan; the suggestions family is already covered.**
```

Commit and push:

```bash
git add docs/plans/2026-07-11-pre-semester-coding-campaign.md docs/plans/2026-07-12-suggestions-family-authz-design.md docs/plans/2026-07-12-suggestions-family-authz-plan.md
git commit -m "docs: B1-F1 shipped (suggestions-family authz) — register + design amendment

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push
```

- [ ] **Step 5: Update memory (outside repo)**

In `~/.claude/projects/-home-siggi-dev-repos-namsbokasafn-efni/memory/`:
- `server-editor-review-2026-07.md`: record B1-F1 shipped (PR #, scope as in the register entry), that `requireBookAccessForSection` is the reusable tool for B1-F2/F3's remaining surfaces, and the delegation-semantics lesson (cross-book HE ≠ hard-403 on editor routes; enforcement-ON is where the denial bites).
- `MEMORY.md` ACTIVE RESUME block: B1-F1 → shipped; **▶ RESUME = batch 2 (`discuss`/`rejected` exit path)**; drop the writing-plans/SDD resume pointer.

- [ ] **Step 6: Report to the lead**

Summarize: PR link, the three design deviations, the two riders, and that merging is the lead's call (no branch protection — local `npm test` was green).

---

## Self-Review (performed at plan-writing time)

1. **Spec coverage:** every design-doc route in the inventory has a task (scan-book → T2; scan/GET/stats/bulk/sync-log → T3; accept/reject/modify → T4; `/patterns` pinned unchanged in T3's matrix); middleware → T1; all 7 activityLog sites → T2 (1) + T3 (3) + T4 (3); enum-correct types → T2; test plan items (scan-book matrix, section+id-keyed matrices, fail-open documentation, resolver discrimination via efnafraedi seed, activityLog regression insurance incl. genuine 200s at all 7 sites, static guard) → T2–T4; out-of-scope register note → T5. The design's cross-book-HE-403 line is deliberately amended, with rationale, in the header and design-doc amendment.
2. **Placeholder scan:** none — every step carries full code/commands. The only substitution is the PR number, unknowable before `gh pr create` (explicitly instructed).
3. **Type consistency:** `requireBookAccessForSection` name identical across T1 implementation/export, T2 import, T3/T4 usage; resolver names `bySectionParam`/`bySuggestionParam` defined once in T3 and reused in T4; `ACTIVITY_TYPES` member names in T2 match every usage in T2–T4; fixture ids (60/61/62, 70–75, users 2/3) consistent between T2 seeds and T3/T4 tests; `req.section` fields used (`bookSlug`, `chapterNum`, `sectionNum`) all exist on `getSection`'s return shape (`bookRegistration.js:742`).
