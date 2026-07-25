# Book-Scoped Authorization Sweep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A head-editor (or editor) of one book can no longer act on another book through the pipeline, section-action, upload, or chapter-import routes.

**Architecture:** Wire the existing Unit-0 middleware (`requireHeadEditor(bookParam)` / `requireHeadEditorFor(resolveBook)` in `server/middleware/requireRole.js`) into the four unguarded surfaces; retire the unused upload route outright; prove everything with one cross-book matrix test that drives the real routers over HTTP (ephemeral `app.listen(0)` + built-in `fetch` — no new dependencies).

**Tech Stack:** Express 5, better-sqlite3 (temp DB via `SESSIONS_DB_PATH`), jsonwebtoken, Vitest (server project, sequential).

**Design:** `docs/plans/2026-07-11-authz-book-scope-sweep-design.md` (committed `cdc40fbc`). Branch `fix/authz-book-scope-sweep` exists.

## Global Constraints

- "Robustness over expedience: one real code path; fail loud; no escape hatch reaches prod."
- All rejections use the middleware's existing 401/403/404 JSON shapes — no new formats.
- `npm test` from the repo root is the authoritative gate; run before every commit.
- Section book field is **`bookSlug`** (camelCase, from `bookRegistration.getSection` `:717` — `rb.slug AS book_slug` mapped to `bookSlug`). `user.books[]` holds slugs (head-editor books only; plain editors carry `[]`).
- `:bookId` in `books.js` is the **slug** (header comment `:7`; `router.param('bookId')` validates against `VALID_BOOKS` at `:70`).
- Role strings: `'admin'`, `'head-editor'`, `'editor'` (same strings `server/e2e/helpers/auth.js:40` mints).
- `resolveDbPath()` is read at module load (`bookRegistration.js:23`) — the test MUST set `SESSIONS_DB_PATH` before requiring any server module.
- JWTs must be signed with issuer `namsbokasafn-pipeline` (auth.js `createToken`) or verification fails.
- Do NOT touch the jobs GETs (`pipeline.js:196/:213`) — their scoping is Batch 5 (jobs lack a `book` field).

---

## File / Artifact Map

- Create: `server/__tests__/crossBookAuthz.test.js` (grows across Tasks 1–4)
- Modify: `server/routes/pipeline.js` (3 POSTs), `server/routes/sections.js` (4 HE routes + status elevated branch + upload-route deletion + multer wiring removal), `server/routes/books.js` (import route)

---

### Task 1: Matrix-test harness + pipeline POST scoping

**Files:**
- Create: `server/__tests__/crossBookAuthz.test.js`
- Modify: `server/routes/pipeline.js` (`:24` imports, POSTs at `:66`, `:110`, `:153`)

**Interfaces:**
- Produces (consumed by Tasks 2–4): the test file's harness — `post(pathname, user, body)` (returns fetch Response), personas `HE_A` (books `['efnafraedi-2e']`), `HE_B` (books `['liffraedi-2e']`), `ADMIN`, `EDITOR`, and the seeded temp DB with section rows 42–46 all belonging to `liffraedi-2e` (statuses per Task 2).

- [ ] **Step 1: Write the harness + pipeline describe block**

Create `server/__tests__/crossBookAuthz.test.js`:

```javascript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath()/JWT config are read at module load.
const work = mkdtempSync(path.join(tmpdir(), 'authz-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'authz-test.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const express = require('express');
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');

// Personas — role strings match server/e2e/helpers/auth.js; books[] holds slugs.
const HE_A = { username: 'he-a', role: 'head-editor', books: ['efnafraedi-2e'] };
const HE_B = { username: 'he-b', role: 'head-editor', books: ['liffraedi-2e'] };
const ADMIN = { username: 'adm', role: 'admin', books: [] };
const EDITOR = { username: 'ed', role: 'editor', books: [] };

function mintToken(user) {
  return jwt.sign(
    { sub: `u-${user.username}`, username: user.username, name: user.username, role: user.role, books: user.books },
    process.env.JWT_SECRET,
    { issuer: 'namsbokasafn-pipeline', expiresIn: '10m' }
  );
}

let server;
let base;

beforeAll(() => {
  // Minimal subset of migration 003's tables — just what getSection's JOIN reads.
  const db = new Database(process.env.SESSIONS_DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS registered_books (id INTEGER PRIMARY KEY, slug TEXT, title_is TEXT);
    CREATE TABLE IF NOT EXISTS book_chapters (id INTEGER PRIMARY KEY, title_en TEXT, title_is TEXT);
    CREATE TABLE IF NOT EXISTS book_sections (
      id INTEGER PRIMARY KEY, book_id INTEGER NOT NULL, chapter_id INTEGER NOT NULL,
      chapter_num INTEGER NOT NULL, section_num TEXT NOT NULL, module_id TEXT,
      title_en TEXT, title_is TEXT, status TEXT DEFAULT 'not_started'
    );
  `);
  db.prepare(`INSERT INTO registered_books (id, slug, title_is) VALUES (1, 'liffraedi-2e', 'Líffræði')`).run();
  db.prepare(`INSERT INTO book_chapters (id, title_en, title_is) VALUES (1, 'Chapter 1', 'Kafli 1')`).run();
  // One section row per action so cross-book RED-phase mutations can't interfere across tests.
  const ins = db.prepare(
    `INSERT INTO book_sections (id, book_id, chapter_id, chapter_num, section_num, status) VALUES (?, 1, 1, 1, ?, ?)`
  );
  ins.run(42, '1.1', 'review_submitted'); // approve-review target
  ins.run(43, '1.2', 'not_started');      // assign-reviewer target
  ins.run(44, '1.3', 'not_started');      // assign-localizer target
  ins.run(45, '1.4', 'review_submitted'); // request-changes target
  ins.run(46, '1.5', 'review_submitted'); // status-elevated target
  db.close();

  const app = express();
  app.use(express.json());
  app.use('/api/pipeline', require('../routes/pipeline'));
  app.use('/api/sections', require('../routes/sections'));
  app.use('/api/books', require('../routes/books'));
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => {
  server?.close();
  rmSync(work, { recursive: true, force: true });
});

async function post(pathname, user, body) {
  return fetch(base + pathname, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${mintToken(user)}` },
    body: JSON.stringify(body ?? {}),
  });
}

// SAFETY: every pipeline probe uses chapter 9999 so validateParams 400s any request
// that clears authz — no pipeline job is ever actually started by this suite.
describe('pipeline POSTs are book-scoped', () => {
  for (const route of ['/api/pipeline/inject', '/api/pipeline/render', '/api/pipeline/run']) {
    it(`${route}: head-editor of another book → 403`, async () => {
      const res = await post(route, HE_A, { book: 'liffraedi-2e', chapter: 9999, track: 'faithful' });
      expect(res.status).toBe(403);
    });
    it(`${route}: owning head-editor clears authz (later 400, never 401/403)`, async () => {
      const res = await post(route, HE_B, { book: 'liffraedi-2e', chapter: 9999, track: 'faithful' });
      expect(res.status).toBe(400);
    });
    it(`${route}: admin bypasses book scope (later 400)`, async () => {
      const res = await post(route, ADMIN, { book: 'liffraedi-2e', chapter: 9999, track: 'faithful' });
      expect(res.status).toBe(400);
    });
    it(`${route}: plain editor → 403 (role gate, unchanged)`, async () => {
      const res = await post(route, EDITOR, { book: 'liffraedi-2e', chapter: 9999, track: 'faithful' });
      expect(res.status).toBe(403);
    });
  }
});
```

- [ ] **Step 2: Run to verify the cross-book cases FAIL (RED)**

Run: `cd <repo> && npx vitest run server/__tests__/crossBookAuthz.test.js`
Expected: the three `head-editor of another book → 403` cases FAIL receiving **400** (today the role-only gate passes them through to `validateParams`); owner/admin/editor cases already pass. If a case fails with 401, the mint (issuer/secret) is wrong — fix the harness, not the assertion.

- [ ] **Step 3: Wire the guard into pipeline.js**

In `server/routes/pipeline.js`: extend the middleware import at `:24` and add the guard to each POST. The `router.use(requireAuth, requireRole(ROLES.HEAD_EDITOR))` at `:29` stays (it still gates the two jobs GETs).

```javascript
// :24 — was: const { requireRole, ROLES } = require('../middleware/requireRole');
const { requireRole, requireHeadEditorFor, ROLES } = require('../middleware/requireRole');
```

```javascript
// Each of the three mutating POSTs gains the book-ownership guard.
// was: router.post('/inject', (req, res) => {
router.post('/inject', requireHeadEditorFor((req) => req.body?.book), (req, res) => {
// was: router.post('/render', (req, res) => {
router.post('/render', requireHeadEditorFor((req) => req.body?.book), (req, res) => {
// was: router.post('/run', (req, res) => {
router.post('/run', requireHeadEditorFor((req) => req.body?.book), (req, res) => {
```

(Behavior note, intended per design: a missing/garbage `book` now 404s from the guard before the old 400; an owned-but-invalid book still 400s in `validateParams`.)

- [ ] **Step 4: Run to verify GREEN**

Run: `npx vitest run server/__tests__/crossBookAuthz.test.js`
Expected: all pipeline cases PASS (cross-book now 403; owner/admin still 400; editor 403).

- [ ] **Step 5: Full suite, then commit**

Run: `npm test` (repo root). Expected: green — no existing test drives these POSTs with a book-less head-editor (verify: any new failure here means an existing test's fake user needs `books[]` added; fix the test's user, never weaken the guard).

```bash
git add server/__tests__/crossBookAuthz.test.js server/routes/pipeline.js
git commit -m "fix(authz): book-scope pipeline inject/render/run (review finding 1)"
```

---

### Task 2: Sections head-editor family + status elevated branch

**Files:**
- Modify: `server/routes/sections.js` (`:21` imports; routes at `:293` assign-reviewer, `:375` assign-localizer, `:624` approve-review, `:695` request-changes; elevated branch `:506-514`)
- Modify: `server/__tests__/crossBookAuthz.test.js` (append describe block)

**Interfaces:**
- Consumes: Task 1's harness (`post`, personas, seeded sections 42–46 — all owned by `liffraedi-2e`).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Append the failing tests**

Append to `crossBookAuthz.test.js`:

```javascript
describe('section head-editor actions are book-scoped', () => {
  // Section rows 42-46 all belong to liffraedi-2e (HE_B's book).
  const CASES = [
    { name: 'approve-review', path: '/api/sections/42/approve-review', body: {} },
    { name: 'assign-reviewer', path: '/api/sections/43/assign-reviewer', body: { reviewerId: 'someone' } },
    { name: 'assign-localizer', path: '/api/sections/44/assign-localizer', body: { localizerId: 'someone' } },
    { name: 'request-changes', path: '/api/sections/45/request-changes', body: { notes: 'x' } },
  ];
  for (const c of CASES) {
    it(`${c.name}: head-editor of another book → 403`, async () => {
      const res = await post(c.path, HE_A, c.body);
      expect(res.status).toBe(403);
    });
    it(`${c.name}: owning head-editor clears authz (never 401/403)`, async () => {
      const res = await post(c.path, HE_B, c.body);
      expect([401, 403]).not.toContain(res.status);
    });
    it(`${c.name}: plain editor → 403`, async () => {
      const res = await post(c.path, EDITOR, c.body);
      expect(res.status).toBe(403);
    });
  }
  it('unknown section → 404 for a head-editor (resolver missing-target path)', async () => {
    const res = await post('/api/sections/99999/approve-review', HE_A, {});
    expect(res.status).toBe(404);
  });

  it('status elevated transition: head-editor of another book → 403', async () => {
    const res = await post('/api/sections/46/status', HE_A, { status: 'review_approved' });
    expect(res.status).toBe(403);
  });
  it('status elevated transition: owning head-editor allowed', async () => {
    const res = await post('/api/sections/46/status', HE_B, { status: 'review_approved' });
    expect([401, 403]).not.toContain(res.status);
  });
});
```

NOTE for the implementer: the owner cases assert "clears authz" as NOT-401/403 (not a specific code) because each action's post-authz outcome differs (200 on success, 400 on status-machine rejection). The cross-book RED phase may mutate rows 43/44 (assign actions have no status gate today) — that is why each action has its own dedicated row.

- [ ] **Step 2: Run to verify RED**

Run: `npx vitest run server/__tests__/crossBookAuthz.test.js`
Expected: every `head-editor of another book → 403` case FAILS (today: 200 or 400 depending on the action's status gate — never 403). The `status elevated` cross-book case FAILS with 200. Owner/editor/404 cases already pass.

- [ ] **Step 3: Implement**

In `server/routes/sections.js`, extend the import at `:21`:

```javascript
// was: const { requireRole, ROLES } = require('../middleware/requireRole');
const { requireRole, requireHeadEditorFor, ROLES } = require('../middleware/requireRole');
```

For each of the four routes, replace the bare role gate with the book-scoped guard placed AFTER `loadSection` (the resolver reads the loaded section; `requireHeadEditorFor`'s internal order min-role → admin → resolve → membership preserves fast-fail). Pattern (apply identically at `:293`, `:375`, `:624`, `:695`):

```javascript
// was:
router.post('/:sectionId/approve-review',
  requireAuth,
  requireRole(ROLES.HEAD_EDITOR),
  loadSection,
  async (req, res) => {
// now:
router.post('/:sectionId/approve-review',
  requireAuth,
  loadSection,
  requireHeadEditorFor((req) => req.sectionData?.bookSlug),
  async (req, res) => {
```

In the status route's elevated branch (`:506-514`), add the ownership test for head-editors:

```javascript
// was:
const headEditorRequired = ['review_approved', 'localization_approved'];
if (headEditorRequired.includes(status)) {
  if (req.user.role !== ROLES.ADMIN && req.user.role !== ROLES.HEAD_EDITOR) {
    return res.status(403).json({
      error: 'Insufficient permissions',
      message: `Status '${status}' requires head editor or admin role`,
    });
  }
}
// now:
const headEditorRequired = ['review_approved', 'localization_approved'];
if (headEditorRequired.includes(status)) {
  const isOwningHeadEditor =
    req.user.role === ROLES.HEAD_EDITOR && req.user.books?.includes(section.bookSlug);
  if (req.user.role !== ROLES.ADMIN && !isOwningHeadEditor) {
    return res.status(403).json({
      error: 'Insufficient permissions',
      message: `Status '${status}' requires a head editor assigned to ${section.bookSlug} (or admin)`,
    });
  }
}
```

- [ ] **Step 4: Run to verify GREEN**

Run: `npx vitest run server/__tests__/crossBookAuthz.test.js`
Expected: all cases PASS.

- [ ] **Step 5: Full suite, then commit**

Run: `npm test`. Expected green (same caveat as Task 1 Step 5 — fix any pre-existing test's fake user, never the guard).

```bash
git add server/__tests__/crossBookAuthz.test.js server/routes/sections.js
git commit -m "fix(authz): book-scope section actions + elevated status transitions (review finding 2)"
```

---

### Task 3: Retire the section upload route

**Files:**
- Modify: `server/routes/sections.js` (delete the upload route at `:149-…` — the block from the `UPLOAD HANDLERS` comment banner through the route's closing `);` before the `:293` assign-reviewer route — plus the now-orphaned multer wiring: `multer` require at `:15`, the storage/config block `:26-:90` area including the `upload` const at `:78`)
- Modify: `server/__tests__/crossBookAuthz.test.js` (append)

**Interfaces:**
- Consumes: Task 1's harness.
- Produces: nothing.

- [ ] **Step 1: Append the failing tests**

```javascript
describe('section upload route is retired (design decision 2026-07-11)', () => {
  it('is not registered on the router (introspection, mirrors books-routes.test.js)', () => {
    const sectionsRouter = require('../routes/sections');
    const registeredPaths = sectionsRouter.stack
      .filter((layer) => layer.route)
      .map((layer) => layer.route.path);
    expect(registeredPaths).not.toContain('/:sectionId/upload/:uploadType');
  });
  it('POST → 404 even for admin', async () => {
    const res = await post('/api/sections/42/upload/faithful', ADMIN, {});
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run to verify RED**

Run: `npx vitest run server/__tests__/crossBookAuthz.test.js`
Expected: both new cases FAIL (route currently registered; admin POST reaches multer/handler, not 404).

- [ ] **Step 3: Delete the route and its multer wiring**

In `server/routes/sections.js`: delete the entire upload route registration and the multer configuration block. Then verify nothing else references it:

Run: `grep -n 'multer\|upload' server/routes/sections.js`
Expected: zero code references (comment mentions are fine to keep or delete). The file must still parse: `node --check server/routes/sections.js` → OK.

- [ ] **Step 4: Run to verify GREEN**

Run: `npx vitest run server/__tests__/crossBookAuthz.test.js`
Expected: all PASS.

- [ ] **Step 5: Full suite, then commit**

Run: `npm test`. Expected green.

```bash
git add server/__tests__/crossBookAuthz.test.js server/routes/sections.js
git commit -m "fix(authz): retire unused section upload route (review finding 4 — write path into protected tiers)"
```

---

### Task 4: Scope the chapter markdown-import route

**Files:**
- Modify: `server/routes/books.js` (import at top where `requireEditor` comes from `../middleware/requireRole`; route at `:506-…`)
- Modify: `server/__tests__/crossBookAuthz.test.js` (append)

**Interfaces:**
- Consumes: Task 1's harness.
- Produces: nothing.

- [ ] **Step 1: Append the failing tests**

```javascript
describe('chapter markdown-import is head-editor-of-book scoped (SA-11 rider)', () => {
  const IMPORT = '/api/books/liffraedi-2e/chapters/1/import';
  it('plain editor → 403 (was allowed before this change)', async () => {
    const res = await post(IMPORT, EDITOR, {});
    expect(res.status).toBe(403);
  });
  it('head-editor of another book → 403', async () => {
    const res = await post(IMPORT, HE_A, {});
    expect(res.status).toBe(403);
  });
  it('owning head-editor clears authz (400 no-files, never 401/403)', async () => {
    const res = await post(IMPORT, HE_B, {});
    expect(res.status).toBe(400);
  });
  it('admin clears authz (400 no-files)', async () => {
    const res = await post(IMPORT, ADMIN, {});
    expect(res.status).toBe(400);
  });
});
```

(The JSON body carries no multipart files, so multer leaves `req.files` empty and the handler's own `No files uploaded` 400 is the safe post-authz landing.)

- [ ] **Step 2: Run to verify RED**

Run: `npx vitest run server/__tests__/crossBookAuthz.test.js`
Expected: the `plain editor` and `head-editor of another book` cases FAIL receiving **400** (today both clear the role-only gate and land on no-files). Owner/admin already pass.

- [ ] **Step 3: Implement**

In `server/routes/books.js`: add `requireHeadEditor` to the middleware import (same require line that currently provides `requireEditor`), then change the route:

```javascript
// was:
router.post(
  '/:bookId/chapters/:chapter/import',
  requireAuth,
  requireEditor(),
  upload.array('files', 50),
// now:
router.post(
  '/:bookId/chapters/:chapter/import',
  requireAuth,
  requireHeadEditor('bookId'),
  upload.array('files', 50),
```

(`:bookId` is the slug — validated against `VALID_BOOKS` by `router.param` at `:70` — so it compares directly against `user.books[]`. If `requireEditor` has no remaining callers in books.js after this change, drop it from the import; verify with `grep -n 'requireEditor' server/routes/books.js`.)

- [ ] **Step 4: Run to verify GREEN**

Run: `npx vitest run server/__tests__/crossBookAuthz.test.js`
Expected: all PASS.

- [ ] **Step 5: Full suite, then commit**

Run: `npm test`. Expected green.

```bash
git add server/__tests__/crossBookAuthz.test.js server/routes/books.js
git commit -m "fix(authz): chapter markdown-import requires head-editor of the book (SA-11)"
```

---

### Task 5: Sweep + PR (controller-executed)

- [ ] **Step 1: Full gate + collateral checks**

Run: `npm test` (expect green) and:
- `grep -n '/import' server/e2e/terminology.spec.js` — confirm the hit is terminology's own CSV import endpoint, NOT `books/:bookId/chapters/:chapter/import` (expected: unrelated; if related, update the spec's persona to a head-editor with the right `books[]` — `loginAs('head-editor')` already carries `['efnafraedi-2e','__e2e-fixture__']`).
- `git grep -n 'upload/' server/public server/views` — still zero client references to the retired route.

- [ ] **Step 2: Push + PR**

```bash
git push -u origin fix/authz-book-scope-sweep
gh pr create --title "authz: book-scoped authorization sweep (review batch 1 — findings 1/2/4 + SA-11)" --body "Wires the existing requireHeadEditor(For) middleware into the four surfaces that gated on global role only: pipeline inject/render/run (body book), the section head-editor action family + elevated status transitions (book resolved from the loaded section's bookSlug), and chapter markdown-import (head-editor of :bookId). The unused section upload route is retired outright (design decision — it could write into 03/04 and even 02-mt-output, bypassing the MT edit-lock). One shared cross-book matrix test drives every touched route over real HTTP with minted JWTs. Design: docs/plans/2026-07-11-authz-book-scope-sweep-design.md.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## Self-Review (plan vs spec)

- **Spec coverage:** design changes 1→Task 1, 2+3→Task 2, 4→Task 3, 5→Task 4, 6 (matrix test)→Tasks 1–4 slices + Task 5 sweep. Out-of-scope items carried in Global Constraints (jobs GETs). ✅
- **Placeholder scan:** all steps carry complete code/commands; the two conditional instructions (drop `requireEditor` import if orphaned; fix pre-existing tests' fake users) state exact resolution paths. ✅
- **Type consistency:** `bookSlug` used in both the Task 2 resolver and elevated branch; personas/`post()` signatures match across tasks; role strings consistent with `e2e/helpers/auth.js`. ✅
- **Safety:** no pipeline job can start (chapter 9999 guard); section mutations confined to dedicated per-action temp-DB rows; temp dir removed in `afterAll`. ✅
