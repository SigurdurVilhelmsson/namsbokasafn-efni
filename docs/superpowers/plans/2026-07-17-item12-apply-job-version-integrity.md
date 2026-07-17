# Item 12 — Apply / Job / Version Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship campaign Phase 3 item 12 — eight surgical integrity fixes (audit findings 3, 5, 6, 15, 16, 19 + register B4-F5 + lead-approved `apply-all` deletion) in one PR on branch `fix/item12-apply-job-version-integrity`.

**Architecture:** No new components, no schema migration. Two internal signature changes (`hasRunningJob(book, chapter, type)`, `applyApprovedEdits(book, chapter, moduleId, options)`); one route deleted; everything else is reordering, tie-breaking, and threading existing parameters. Spec: `docs/superpowers/specs/2026-07-17-item12-apply-job-version-integrity-design.md` (approved 2026-07-17; every file:line verified on main `bc0117e6`).

**Tech Stack:** Node 22 / Express 5 / better-sqlite3 12 / Vitest (server project runs sequentially).

## Global Constraints

- Run all tests **from the repo root**: `npm test` is the authoritative gate (no branch protection). Single-file runs: `npx vitest run server/__tests__/<file>.test.js` (also from repo root).
- **No new migration.** Do not touch `server/__tests__/startup.test.js` pins (40 migrations) or `server/services/migrationRunner.js`.
- Branch `fix/item12-apply-job-version-integrity` already exists with the spec committed (`3cad9ad5`). One task = one commit (test + implementation together — lint-staged stashes unstaged tracked changes; splitting them across commits can silently drop work).
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Tests must never write into committed `books/` content. Use temp dirs (`mkdtempSync`) and synthetic book slugs; `git status --porcelain books/` must be empty after every task.
- Do **not** churn pre-existing quirks that are out of scope: `listJobs`'s truthy `if (chapter)` filter (skips chapter 0 — pre-existing), the `requireHeadEditor()` middleware, unrelated silent catches, and the `status.runningJob` display shape in publicationService.
- **Spec correction (authoritative here):** spec §7 wrote `req.user?.userId`; the real field on these routes is **`req.user.id`** (see the adjacent `String(req.user.id)` activityLog calls). This plan uses `req.user.id` throughout.
- `activityLog.log()` is called **bare** — never wrap it in try/catch (`activityLogCallsiteGuard.test.js` fails statically if you do).

**Task order is load-bearing:** Task 2 (deletion) runs before Task 3 (signature change) so Task 3 has 7 call sites, not 8. Task 4's code shows the post-Task-3 signature. Task 6's route edits show the post-Task-4 (hoisted) route body.

---

### Task 1: F3 — localization approve writes the file BEFORE marking approved

**Files:**
- Modify: `server/services/localizationReviewService.js:205-250` (`approveAndApply`)
- Test: `server/__tests__/localizationReviewService.test.js`

**Interfaces:**
- Consumes: `segmentParser.loadModuleForLocalization` / `saveLocalizedSegments` (unchanged).
- Produces: `approveAndApply(editId, reviewerId, reviewerUsername, reviewerNote)` — same signature and same `{ edit, savedPath }` return; new failure semantics: any throw leaves the edit `pending`.

- [ ] **Step 1: Write the failing test**

In `server/__tests__/localizationReviewService.test.js`, extend the `fs` import (line 11) to include `rmSync`:

```js
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'fs';
```

Add inside the top-level `describe('localizationReviewService', ...)` block (after the self-approval test):

```js
  it('a failed file write leaves the edit pending and retryable (F3 write-then-mark)', () => {
    const { id } = review.submitEdit({
      book: BOOK,
      chapter: CHAPTER,
      moduleId: MODULE,
      segmentId: SEG('fs-id001'),
      originalContent: 'Hrein fs-id001',
      editedContent: 'Staðfærsla sem mistekst',
      editorId: 4,
      editorUsername: 'editorA',
    });

    // Sabotage the file step: without the faithful file,
    // loadModuleForLocalization throws before anything can be written.
    const faithfulPath = join(
      booksDir, BOOK, '03-faithful-translation', 'ch01', `${MODULE}-segments.is.md`
    );
    const faithfulBody = readFileSync(faithfulPath, 'utf-8');
    rmSync(faithfulPath);

    expect(() => review.approveAndApply(id, 2, 'headX', 'ok')).toThrow();

    // The edit must still be pending — visible, retryable, rejectable.
    const edit = review.getEditById(id);
    expect(edit.status).toBe('pending');
    expect(edit.applied_at).toBeNull();
    expect(edit.reviewer_username).toBeNull();
    expect(review.getPendingByModule(BOOK, MODULE)).toHaveLength(1);

    // Retry after the underlying problem is fixed → clean success.
    writeFileSync(faithfulPath, faithfulBody, 'utf-8');
    const { edit: approved } = review.approveAndApply(id, 2, 'headX', 'ok');
    expect(approved.status).toBe('approved');
    expect(approved.applied_at).toBeTruthy();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/localizationReviewService.test.js`
Expected: FAIL — `expect(edit.status).toBe('pending')` receives `'approved'` (current code marks approved before the write throws).

- [ ] **Step 3: Reorder `approveAndApply` (write-then-mark)**

Replace the whole function body between the pending-guard and the `log.info` (currently steps 1–3, lines 211–242) so the function reads:

```js
function approveAndApply(editId, reviewerId, reviewerUsername, reviewerNote) {
  const conn = getDb();
  const edit = conn.prepare(`SELECT * FROM localization_pending_edits WHERE id = ?`).get(editId);
  if (!edit) throw new Error('Edit not found');
  if (edit.status !== 'pending') throw new Error('Edit is not pending');

  // 1. Apply to the localized file FIRST (snapshot-before-save handled by .bak).
  // The file write is the one step a SQLite transaction cannot roll back, so it
  // runs before any status change: if it throws, the edit stays 'pending' —
  // visible in the queue, retryable, rejectable. If the write succeeds but the
  // status update below fails, the edit also stays 'pending' and a retry
  // rewrites identical bytes, so no state is stranded either way.
  const data = segmentParser.loadModuleForLocalization(edit.book, edit.chapter, edit.module_id);
  const segments = data.segments.map((seg) => ({
    segmentId: seg.segmentId,
    content:
      seg.segmentId === edit.segment_id
        ? edit.edited_content
        : seg.hasLocalized
          ? seg.localized
          : seg.faithful,
  }));
  const savedPath = segmentParser.saveLocalizedSegments(
    edit.book,
    edit.chapter,
    edit.module_id,
    segments
  );

  // 2. Mark approved + applied together, atomically.
  conn.transaction(() => {
    conn
      .prepare(
        `UPDATE localization_pending_edits
         SET status = 'approved', reviewer_id = ?, reviewer_username = ?,
             reviewer_note = ?, reviewed_at = CURRENT_TIMESTAMP,
             applied_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .run(String(reviewerId), reviewerUsername, reviewerNote || null, editId);
  })();

  log.info(
    { book: edit.book, moduleId: edit.module_id, segmentId: edit.segment_id, editId },
    'Localization edit approved and applied'
  );
  const updated = conn.prepare(`SELECT * FROM localization_pending_edits WHERE id = ?`).get(editId);
  return { edit: updated, savedPath };
}
```

Note: the whole path is synchronous (better-sqlite3 + sync segmentParser I/O), so the event loop serializes concurrent approvals — verify while editing that `loadModuleForLocalization`/`saveLocalizedSegments` are indeed sync (no `await`/Promise in their chain); if either turns out async, stop and flag it (the spec's §1 fallback is the faithful side's IMMEDIATE-tx pattern).

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run server/__tests__/localizationReviewService.test.js`
Expected: PASS — including the pre-existing approve/self-approval tests (`applied_at` still truthy on success).

- [ ] **Step 5: Commit**

```bash
git add server/services/localizationReviewService.js server/__tests__/localizationReviewService.test.js
git commit -m "fix(item12): localization approve writes file before marking approved (F3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Delete the dead `apply-all` route (lead-approved)

**Files:**
- Modify: `server/routes/segment-editor.js` (delete lines 1216–1283: JSDoc + `router.post('/:book/:chapter/apply-all', ...)` block; delete header line 30)
- Modify: `server/services/tmService.js:7-8` (comment references the deleted route)
- Regenerate: `docs/_generated/` via `npm run docs:generate`

**Interfaces:**
- Produces: `POST /:book/:chapter/apply-all` no longer exists (Task 4 adds the permanent router-level pin). Removes one 2-arg `hasRunningJob` call site (`:1260`) ahead of Task 3's signature change.

- [ ] **Step 1: Delete the route**

In `server/routes/segment-editor.js` remove the entire block from
```js
/**
 * POST /:book/:chapter/apply-all
 * Bulk apply approved edits for all modules in a chapter, then run pipeline.
 */
```
through the closing `);` of that `router.post(` (currently lines 1216–1283 — ends just before the `// ===== CONTENT VERSIONING — history and rollback` banner).

Also remove header line 30:
```js
 *   POST /api/segment-editor/:book/:chapter/apply-all        Bulk apply all approved modules
```

- [ ] **Step 2: Update the tmService comment**

In `server/services/tmService.js`, replace:
```js
 *   - debounced per book, so a bulk "apply-all" of many modules coalesces into
 *     a single run instead of spawning one process per module; and
```
with:
```js
 *   - debounced per book, so rapid successive applies (several modules
 *     published in quick succession) coalesce into a single run; and
```

- [ ] **Step 3: Regenerate docs and verify absence**

Run: `npm run docs:generate`
Then: `grep -rn "apply-all" server/ docs/_generated/`
Expected: **zero hits** (historical audit/plan docs elsewhere may still mention it — that's fine and expected).

- [ ] **Step 4: Run the server suite**

Run: `npx vitest run --project server`
Expected: PASS (nothing referenced the route — verified 2026-07-17).

- [ ] **Step 5: Commit**

```bash
git add server/routes/segment-editor.js server/services/tmService.js docs/_generated/
git commit -m "fix(item12): delete dead apply-all bulk route

Zero callers (no UI, tests, scripts); three latent defects (silent render
skip reported as success, no activity log, no attribution). Lead-approved
deletion — per-module apply/apply-and-render is the one real code path.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: F5 — pipeline jobs get `book`; `hasRunningJob(book, chapter, type)`

**Files:**
- Modify: `server/services/pipelineService.js` (job creators, `hasRunningJob`, `listJobs`, exports)
- Modify: `server/routes/pipeline.js` (3 call sites + jobs listing)
- Modify: `server/routes/admin.js` (fetch-source call site + auto-fetch dedupe rider)
- Modify: `server/services/publicationService.js` (2 call sites)
- Modify: `server/routes/segment-editor.js:1174` (signature only; Task 4 hoists it)
- Test: `server/__tests__/new-features.test.js`

**Interfaces:**
- Produces: `hasRunningJob(book, chapter, type)` (strict `===` on all three); job objects carry `book`; `listJobs({ book?, chapter?, type?, status?, limit? })`; `/** @internal */ _jobsMap()` returning the raw jobs Map (test seam, repo `_set*`/`_internal` idiom).
- Consumed by: Task 4 (route test injects a synthetic running job via `_jobsMap`).

- [ ] **Step 1: Write the failing tests**

In `server/__tests__/new-features.test.js`: change the import line 5 to add `afterEach`:

```js
import { describe, it, expect, afterEach } from 'vitest';
```

Update the existing falsy test (line ~48) to the 3-arg form:

```js
  it('hasRunningJob returns falsy for non-running chapter', () => {
    const result = hasRunningJob('efnafraedi-2e', 99, 'inject');
    expect(result).toBeFalsy();
  });
```

Add a new describe after `pipelineService job management`:

```js
// ----- pipelineService: job book-scoping (item 12, F5) -----

describe('pipelineService job book-scoping (item 12, F5)', () => {
  const { hasRunningJob, listJobs, _jobsMap } = require('../services/pipelineService');

  const baseJob = {
    moduleId: 'all',
    track: 'faithful',
    status: 'running',
    startedAt: new Date().toISOString(),
    completedAt: null,
    output: [],
    error: null,
  };

  afterEach(() => {
    _jobsMap().delete('test-f5-chem');
    _jobsMap().delete('test-f5-fetch');
  });

  it('a running job for one book does not block the same chapter of another book', () => {
    _jobsMap().set('test-f5-chem', {
      ...baseJob, id: 'test-f5-chem', type: 'pipeline', book: 'efnafraedi-2e', chapter: 3,
    });
    expect(hasRunningJob('liffraedi-2e', 3, 'pipeline')).toBeFalsy();
  });

  it('a running job still blocks its own book/chapter/type', () => {
    _jobsMap().set('test-f5-chem', {
      ...baseJob, id: 'test-f5-chem', type: 'pipeline', book: 'efnafraedi-2e', chapter: 3,
    });
    expect(hasRunningJob('efnafraedi-2e', 3, 'pipeline')?.id).toBe('test-f5-chem');
  });

  it('fetch-source dedupe is per-book (chapter null matches strictly)', () => {
    _jobsMap().set('test-f5-fetch', {
      ...baseJob, id: 'test-f5-fetch', type: 'fetch-source', book: 'efnafraedi-2e',
      chapter: null, moduleId: 'efnafraedi-2e', track: null,
    });
    expect(hasRunningJob('liffraedi-2e', null, 'fetch-source')).toBeFalsy();
    expect(hasRunningJob('efnafraedi-2e', null, 'fetch-source')?.id).toBe('test-f5-fetch');
  });

  it('listJobs filters by book', () => {
    _jobsMap().set('test-f5-chem', {
      ...baseJob, id: 'test-f5-chem', type: 'pipeline', book: 'efnafraedi-2e', chapter: 3,
    });
    expect(listJobs({ book: 'efnafraedi-2e' }).some((j) => j.id === 'test-f5-chem')).toBe(true);
    expect(listJobs({ book: 'liffraedi-2e' }).some((j) => j.id === 'test-f5-chem')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/__tests__/new-features.test.js`
Expected: FAIL — `_jobsMap is not a function` (not exported yet).

- [ ] **Step 3: Implement in `pipelineService.js`**

(a) `spawnJob` (line ~348): destructure and store `book`:

```js
function spawnJob({ type, book, chapter, moduleId, track, userId, command, args }) {
```
and in its job object (line ~358):
```js
  const job = {
    id: jobId,
    type,
    book,
    chapter,
    moduleId: moduleId || 'all',
    track,
    userId,
    status: 'running',
    startedAt: new Date().toISOString(),
    completedAt: null,
    output: [],
    error: null,
  };
```

(b) Add `book,` to every `spawnJob({...})` call: `runExtract` (~:66), `runProtect` (~:110), `runUnprotect` (~:151), `runInject` (~:200), `runRender` (~:237). Example (`runInject`):

```js
  return spawnJob({
    type: 'inject',
    book,
    chapter,
    moduleId,
    track,
    userId,
    command: 'node',
    args,
  });
```

(c) `runFetchSource` (~:756): `book: slug,` (keep `moduleId: slug` for display compatibility):

```js
  const result = spawnJob({
    type: 'fetch-source',
    book: slug,
    chapter: null,
    moduleId: slug,
    track: null,
    userId,
    command: 'node',
    args,
  });
```

(d) The two hand-rolled job objects: `runPipeline` (~:268) and `runGenerateTm` (~:847) each gain `book,` right after `type:`:

```js
  const job = {
    id: jobId,
    type: 'pipeline',
    book,
    chapter,
    ...
```
```js
  const job = {
    id: jobId,
    type: 'generate-tm',
    book,
    chapter: chapter ?? 'all',
    ...
```

(e) Replace `hasRunningJob` (~:439):

```js
/**
 * Check if a job is already running for this book/chapter/type combo.
 * Strict equality on all three keys — chapter is deliberately NOT normalized
 * (live values include numbers, null for fetch-source, and 'all' for
 * whole-book generate-tm), so callers pass the same shape the creators store.
 */
function hasRunningJob(book, chapter, type) {
  for (const job of jobs.values()) {
    if (
      job.book === book &&
      job.chapter === chapter &&
      job.type === type &&
      job.status === 'running'
    ) {
      return job;
    }
  }
  return null;
}
```

(f) `listJobs` (~:423) gains the book filter:

```js
function listJobs({ book, chapter, type, status, limit = 20 } = {}) {
  let result = Array.from(jobs.values());

  if (book) result = result.filter((j) => j.book === book);
  if (chapter) result = result.filter((j) => j.chapter === chapter);
  if (type) result = result.filter((j) => j.type === type);
  if (status) result = result.filter((j) => j.status === status);
```

(g) Test seam + export (before `module.exports`, add `_jobsMap` to the exports object):

```js
/** @internal Test-only: direct access to the in-memory jobs map. */
function _jobsMap() {
  return jobs;
}
```

- [ ] **Step 4: Update the 7 call sites**

`server/routes/pipeline.js`:
```js
    // :74
    const running = pipeline.hasRunningJob(params.book, params.chapter, 'inject');
```
```js
    // :124
    const running = pipeline.hasRunningJob(params.book, params.chapter, 'render');
```
```js
    // :174
    const running = pipeline.hasRunningJob(params.book, params.chapter, 'pipeline');
```
and the jobs listing (~:217):
```js
router.get('/jobs', (req, res) => {
  const { book, chapter, type, status, limit } = req.query;

  const jobsList = pipeline.listJobs({
    book: book || undefined,
    chapter: chapter ? parseInt(chapter, 10) : undefined,
    type,
    status,
    limit: Math.min(parseInt(limit, 10) || 20, 200),
  });

  res.json({ jobs: jobsList });
});
```

`server/routes/segment-editor.js` (~:1174 — order unchanged here; Task 4 hoists):
```js
      const existing = pipelineService.hasRunningJob(req.params.book, req.chapterNum, 'pipeline');
```

`server/services/publicationService.js` — both sites:
```js
  // publishChapter (~:213)
  const existing = pipelineService.hasRunningJob(bookSlug, chapterNum, 'pipeline');
```
```js
  // getPublicationStatus (~:347)
  const runningJob = pipelineService.hasRunningJob(bookSlug, chapterNum, 'pipeline');
```

`server/routes/admin.js` — the manual fetch route (~:329):
```js
    const existing = pipeline.hasRunningJob(slug, null, 'fetch-source');
```
and the auto-fetch path in the register handler (~:261) gains the dedupe guard it lacks (rider — adjacent defect found in verification). Replace:
```js
          const fetchResult = pipeline.runFetchSource({
            catalogueSlug,
            slug,
            repo,
            collection,
            userId: req.user.id,
          });
          result.fetchJobId = fetchResult.jobId;
```
with:
```js
          const alreadyFetching = pipeline.hasRunningJob(slug, null, 'fetch-source');
          if (alreadyFetching) {
            result.fetchJobId = alreadyFetching.id;
          } else {
            const fetchResult = pipeline.runFetchSource({
              catalogueSlug,
              slug,
              repo,
              collection,
              userId: req.user.id,
            });
            result.fetchJobId = fetchResult.jobId;
          }
```

- [ ] **Step 5: Verify no stale 2-arg call remains**

Run: `grep -rn "hasRunningJob(" server/ | grep -v "__tests__" | grep -v "function hasRunningJob"`
Expected: exactly 7 call sites, all 3-arg (pipeline.js ×3, segment-editor.js ×1, admin.js ×2 — fetch route + auto-fetch rider, publicationService.js ×2 = 8 *expressions* but 7 pre-existing sites + 1 new rider guard).

- [ ] **Step 6: Run tests to verify pass**

Run: `npx vitest run server/__tests__/new-features.test.js`
Expected: PASS (all new F5 tests + updated falsy test).
Then: `npx vitest run --project server`
Expected: PASS (no other suite constructs jobs).

- [ ] **Step 7: Commit**

```bash
git add server/services/pipelineService.js server/routes/pipeline.js server/routes/admin.js server/services/publicationService.js server/routes/segment-editor.js server/__tests__/new-features.test.js
git commit -m "fix(item12): pipeline jobs carry book; hasRunningJob book-scoped (F5)

Chemistry ch3 no longer false-blocks biology ch3 (apply-and-render 409,
publish throw, publication status, fetch dedupe). Rider: registration
auto-fetch gains the duplicate-job guard it lacked. listJobs gains a book
filter; job read-scoping deliberately deferred (register).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: F6 — apply-and-render checks the pipeline BEFORE applying

**Files:**
- Modify: `server/routes/segment-editor.js` (apply-and-render handler, ~:1164-1181)
- Create: `server/__tests__/applyAndRenderGuard.test.js`

**Interfaces:**
- Consumes: Task 3's `hasRunningJob(book, chapter, type)` + `_jobsMap()` seam.
- Produces: 409 now means "nothing was applied — retry shortly" (drops the `applied` field from the 409 body; nothing pins it). Also the permanent router-level pin that `apply-all` is gone (Task 2).

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/applyAndRenderGuard.test.js` (route-handler extraction pattern from `segmentEditBackstop.test.js`):

```js
/**
 * apply-and-render guard order (item 12, F6) + apply-all removal pin (item 12 §8).
 *
 * With a pipeline job already running for the module's book+chapter, the
 * route must 409 with NOTHING applied. Pre-fix it applied first: edits were
 * written but unrendered, the client saw total failure, and a retry died on
 * "All approved edits have already been applied".
 */
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath() loads at import time.
const work = mkdtempSync(path.join(tmpdir(), 'applyguard-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const Database = require('better-sqlite3');

const BOOK = 'guard-test-book'; // synthetic — never touches committed books/
const MODULE = 'm99901';
const SEGMENT_ID = `${MODULE}:para:fs-id1`;

let db;
let handler;
let pipelineService;

function invoke(req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(c) {
        this.statusCode = c;
        return this;
      },
      json(body) {
        resolve({ status: this.statusCode, body });
      },
    };
    handler(req, res);
  });
}

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();
  db = new Database(process.env.SESSIONS_DB_PATH);

  pipelineService = require('../services/pipelineService');
  const router = require('../routes/segment-editor');
  const layer = router.stack.find(
    (l) =>
      l.route &&
      l.route.path === '/:book/:chapter/:moduleId/apply-and-render' &&
      l.route.methods.post
  );
  handler = layer.route.stack[layer.route.stack.length - 1].handle;
});

afterAll(() => {
  db.close();
});

afterEach(() => {
  pipelineService._jobsMap().delete('guard-test-job');
  db.prepare(`DELETE FROM segment_edits WHERE book = ?`).run(BOOK);
});

describe('POST /:book/:chapter/:moduleId/apply-and-render — guard order (F6)', () => {
  it('409s BEFORE applying anything when a pipeline job is already running', async () => {
    // An approved, unapplied edit a mis-ordered route would have applied.
    db.prepare(
      `INSERT INTO segment_edits
         (book, chapter, module_id, segment_id, original_content, edited_content,
          editor_id, editor_username, status, reviewed_at)
       VALUES (?, 1, ?, ?, 'upphaflegt', 'breytt', 'e1', 'editor1', 'approved', CURRENT_TIMESTAMP)`
    ).run(BOOK, MODULE, SEGMENT_ID);

    pipelineService._jobsMap().set('guard-test-job', {
      id: 'guard-test-job',
      type: 'pipeline',
      book: BOOK,
      chapter: 1,
      moduleId: 'all',
      track: 'faithful',
      status: 'running',
      startedAt: new Date().toISOString(),
      completedAt: null,
      output: [],
      error: null,
    });

    const { status, body } = await invoke({
      params: { book: BOOK, chapter: '1', moduleId: MODULE },
      chapterNum: 1,
      user: { id: 7, username: 'ritstjori' },
      body: {},
    });

    expect(status).toBe(409);
    expect(body.jobId).toBe('guard-test-job');

    // NOTHING was applied — the approved edit is untouched on both axes.
    const row = db
      .prepare(`SELECT applied_at, status FROM segment_edits WHERE book = ?`)
      .get(BOOK);
    expect(row.status).toBe('approved');
    expect(row.applied_at).toBeNull();
  });
});

describe('apply-all route removal pin (item 12 §8)', () => {
  it('the router no longer defines POST /:book/:chapter/apply-all', () => {
    const router = require('../routes/segment-editor');
    const layer = router.stack.find((l) => l.route && l.route.path === '/:book/:chapter/apply-all');
    expect(layer).toBeUndefined();
  });
});
```

Schema note: the INSERT column list must satisfy the live migrated `segment_edits` (migrations 008→039). If a NOT NULL constraint fires on a column not listed, consult `server/__tests__/helpers/segmentEditsSchema.cjs` and add that column to the INSERT — that is a test-fixture correction, not a behavior change.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/applyAndRenderGuard.test.js`
Expected: F6 case FAILS with status 500 ≠ 409 (the route applies first; `loadModuleForEditing` throws on the nonexistent synthetic book). The apply-all pin PASSES (Task 2 already deleted it) — that's fine; it's a permanent regression pin, not this task's RED.

- [ ] **Step 3: Hoist the guard in the route**

In `server/routes/segment-editor.js`, apply-and-render handler: replace the current Step-1/Step-2 sequence (apply at ~:1167, check at ~:1174) with check-first:

```js
    try {
      // Guard FIRST (item 12, F6): a running pipeline means we could not
      // render what we apply, so nothing is applied either — the 409
      // truthfully reports a no-op and the head-editor just retries later.
      const existing = pipelineService.hasRunningJob(req.params.book, req.chapterNum, 'pipeline');
      if (existing) {
        return res.status(409).json({
          error: 'Pipeline already running for this chapter',
          jobId: existing.id,
        });
      }

      // Apply edits to files
      const applyResult = segmentEditor.applyApprovedEdits(
        req.params.book,
        req.chapterNum,
        req.params.moduleId
      );

      // Run inject+render pipeline (async — returns job ID for polling)
      const { jobId } = pipelineService.runPipeline({
        book: req.params.book,
        chapter: req.chapterNum,
        moduleId: req.params.moduleId,
        track: 'faithful',
        userId: req.user.id,
      });
```
(the `activityLog.log` + success `res.json` + catch below stay exactly as they are).

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run server/__tests__/applyAndRenderGuard.test.js`
Expected: PASS (409, jobId echoed, edit untouched).

- [ ] **Step 5: Commit**

```bash
git add server/routes/segment-editor.js server/__tests__/applyAndRenderGuard.test.js
git commit -m "fix(item12): apply-and-render checks running pipeline before applying (F6)

409 now truthfully means nothing was applied; retry works. Same
check-then-act order as the publish route. Behavioral route test +
permanent apply-all-absence pin.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: F15 — deterministic same-second approval tie-break

**Files:**
- Modify: `server/services/segmentEditorService.js:798` and `:864` (the two load-bearing apply queries)
- Modify: `server/services/dashboardReadModel.js:~124`, `server/routes/my-work.js:~117` (display-only riders)
- Test: `server/__tests__/segmentEditorService.test.js`

**Interfaces:**
- Produces: apply's winner selection is `ORDER BY reviewed_at DESC, id DESC` — highest id wins a tie, matching `buildEffectiveSegments` (:257, `e.id > cur.id`). No signature changes.

- [ ] **Step 1: Write the failing test**

In `server/__tests__/segmentEditorService.test.js`, add right after the existing `'apply with superseded edits: latest approved wins, older marked superseded'` test (same describe — it has `service`, `db`, `segmentParser`, `readFileSync` in scope):

```js
  it('same-second approvals: higher edit id wins deterministically, agreeing with preview (F15)', () => {
    const { id: id1 } = service.saveSegmentEdit({
      book: 'testbook',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'original',
      editedContent: 'Fyrri breyting',
      editorId: 'editor-1',
      editorUsername: 'editor1',
    });
    service.approveEdit(id1, 'reviewer-1', 'reviewer1');

    const { id: id2 } = service.saveSegmentEdit({
      book: 'testbook',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'original',
      editedContent: 'Seinni breyting',
      editorId: 'editor-2',
      editorUsername: 'editor2',
    });
    service.approveEdit(id2, 'reviewer-1', 'reviewer1');

    // Force an exact reviewed_at tie (CURRENT_TIMESTAMP is 1s-granular; two
    // real approvals inside one second produce exactly this state).
    db.prepare(`UPDATE segment_edits SET reviewed_at = '2026-07-17 12:00:00' WHERE id IN (?, ?)`).run(
      id1,
      id2
    );

    const result = service.applyApprovedEdits('testbook', 1, 'm00001');
    expect(result.appliedCount).toBe(1);
    expect(result.supersededCount).toBe(1);

    // Higher id wins — the same convention buildEffectiveSegments uses.
    const segments = segmentParser.parseSegments(readFileSync(result.savedPath, 'utf-8'));
    const seg = segments.find((s) => s.segmentId === 'm00001:para:fs-id001');
    expect(seg.content).toBe('Seinni breyting');
    expect(service.getEditById(id1).status).toBe('superseded');
    expect(service.getEditById(id2).applied_at).toBeTruthy();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/segmentEditorService.test.js`
Expected: FAIL (SQLite typically returns tied rows in rowid order → the OLDER edit wins → `'Fyrri breyting'`). **Caveat:** tie order is formally unspecified — if this unexpectedly PASSES pre-fix, prove the pin bites by temporarily changing the fix's `id DESC` to `id ASC` after Step 3 and confirming the test goes red, then restore (sabotage-verification, repo idiom).

- [ ] **Step 3: Add the tie-breaks**

`server/services/segmentEditorService.js` — both apply queries (pre-check ~:798 and in-transaction re-query ~:864): change

```sql
       ORDER BY reviewed_at DESC`
```
to
```sql
       ORDER BY reviewed_at DESC, id DESC`
```
(two occurrences — the winner loop takes the FIRST row per segment, so `id DESC` = highest id wins).

Riders (display determinism, no supersede consequence) — `server/services/dashboardReadModel.js` (~:124) and `server/routes/my-work.js` (~:117): change

```sql
       ORDER BY reviewed_at DESC
```
to
```sql
       ORDER BY reviewed_at DESC, id DESC
```
(one occurrence in each file, both inside `SELECT ... FROM segment_edits WHERE editor_username = ?` listings).

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run server/__tests__/segmentEditorService.test.js`
Expected: PASS — including the pre-existing backdated clear-newer test (unchanged; its 1-hour gap dominates the new tie-break).

- [ ] **Step 5: Commit**

```bash
git add server/services/segmentEditorService.js server/services/dashboardReadModel.js server/routes/my-work.js server/__tests__/segmentEditorService.test.js
git commit -m "fix(item12): same-second approval ties break by id, matching preview (F15)

Both load-bearing apply queries + two display listings get ', id DESC'.
Publish and buildEffectiveSegments can no longer disagree on a tie.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: B4-F5 — `applied_by` attribution threads through apply

**Files:**
- Modify: `server/services/segmentEditorService.js` (`applyApprovedEdits` signature, recursion ~:843, snapshot call ~:916, JSDoc)
- Modify: `server/routes/segment-editor.js` (3 call sites: review-complete ~:753, apply ~:1124, apply-and-render — post-Task-4 position)
- Test: `server/__tests__/segmentEditorService.test.js`

**Interfaces:**
- Produces: `applyApprovedEdits(book, chapter, moduleId, options = {})` where `options.appliedBy` is a username **string** (or absent → `null`, legacy behavior). Return value unchanged.
- Consumes: `contentVersionService.snapshotModule(book, chapter, moduleId, segments, appliedBy, db)` — the 5th param already exists.

- [ ] **Step 1: Write the failing tests**

In `server/__tests__/segmentEditorService.test.js`: extend the `fs` import to include `rmSync`:

```js
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
```

Add after the F15 test from Task 5 (same describe — `saveAndApprove`, `service`, `db` in scope). Version numbers accumulate across tests in this suite, so anchor on `MAX(version)` deltas, never absolute versions:

```js
  function maxVersion() {
    return (
      db
        .prepare(
          `SELECT MAX(version) AS v FROM content_versions WHERE book = 'testbook' AND module_id = 'm00001'`
        )
        .get().v || 0
    );
  }

  function appliedByOfVersion(version) {
    return db
      .prepare(
        `SELECT DISTINCT applied_by FROM content_versions WHERE book = 'testbook' AND module_id = 'm00001' AND version = ?`
      )
      .all(version);
  }

  it('apply records applied_by on the content snapshot (B4-F5)', () => {
    const before = maxVersion();
    saveAndApprove('m00001:para:fs-id001', 'Yfirfarið með rekjanleika.');
    service.applyApprovedEdits('testbook', 1, 'm00001', { appliedBy: 'ritstjori-X' });
    expect(appliedByOfVersion(before + 1)).toEqual([{ applied_by: 'ritstjori-X' }]);
  });

  it('apply without an actor keeps null applied_by (legacy callers)', () => {
    const before = maxVersion();
    saveAndApprove('m00001:para:fs-id001', 'Án rekjanleika.');
    service.applyApprovedEdits('testbook', 1, 'm00001');
    expect(appliedByOfVersion(before + 1)).toEqual([{ applied_by: null }]);
  });

  it('rebuild recursion preserves applied_by (B4-F5)', () => {
    const before = maxVersion();
    saveAndApprove('m00001:para:fs-id001', 'Fyrsta útgáfa fyrir endurbyggingu.');
    const first = service.applyApprovedEdits('testbook', 1, 'm00001', { appliedBy: 'fyrsti' });
    expect(appliedByOfVersion(before + 1)).toEqual([{ applied_by: 'fyrsti' }]);

    // Delete the faithful file → next apply takes the self-heal recursion
    // (:823 reset-applied_at path) and must carry the SECOND actor through.
    rmSync(first.savedPath);
    service.applyApprovedEdits('testbook', 1, 'm00001', { appliedBy: 'annar' });
    expect(appliedByOfVersion(before + 2)).toEqual([{ applied_by: 'annar' }]);
  });
```

If `saveAndApprove` is not in scope in the chosen describe, use the explicit `service.saveSegmentEdit({...})` + `service.approveEdit(id, 'reviewer-1', 'reviewer1')` pair exactly as the F15 test does.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/__tests__/segmentEditorService.test.js`
Expected: FAIL — first test gets `[{ applied_by: null }]` (options ignored; snapshot call passes literal `null`).

- [ ] **Step 3: Thread the actor through the service**

`server/services/segmentEditorService.js`:

(a) JSDoc + signature (~:784-789):
```js
 * @param {string} book - Book slug
 * @param {number} chapter - Chapter number
 * @param {string} moduleId - Module ID
 * @param {{ appliedBy?: string|null }} [options] - `appliedBy`: username string
 *   recorded on the content_versions snapshot (parity with restore's
 *   attribution). Absent/null keeps the legacy unattributed snapshot.
 * @returns {object} { appliedCount, savedPath, segments }
 */
function applyApprovedEdits(book, chapter, moduleId, options = {}) {
  const appliedBy =
    typeof options.appliedBy === 'string' && options.appliedBy ? options.appliedBy : null;
  const conn = getDb();
```

(b) Recursion (~:843): `const result = applyApprovedEdits(book, chapter, moduleId, options);`

(c) Snapshot call (~:916): replace the literal `null`:
```js
      contentVersionService.snapshotModule(book, chapter, moduleId, currentSegments, appliedBy, conn);
```
(the surrounding non-fatal try/catch stays exactly as-is).

- [ ] **Step 4: Pass the actor at the 3 route call sites**

`server/routes/segment-editor.js` — all three use the same derivation (matches restore's precedence; `req.user.id`, NOT `userId` — see Global Constraints):

Review-complete auto-apply (~:753):
```js
          applied = segmentEditor.applyApprovedEdits(
            review.review.book,
            review.review.chapter,
            review.review.module_id,
            { appliedBy: req.user.username || (req.user.id != null ? String(req.user.id) : null) }
          );
```

Plain apply (~:1124):
```js
      const result = segmentEditor.applyApprovedEdits(
        req.params.book,
        req.chapterNum,
        req.params.moduleId,
        { appliedBy: req.user.username || (req.user.id != null ? String(req.user.id) : null) }
      );
```

Apply-and-render (post-Task-4 hoisted body — the apply call after the guard):
```js
      const applyResult = segmentEditor.applyApprovedEdits(
        req.params.book,
        req.chapterNum,
        req.params.moduleId,
        { appliedBy: req.user.username || (req.user.id != null ? String(req.user.id) : null) }
      );
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run server/__tests__/segmentEditorService.test.js`
Expected: PASS. Then `npx vitest run --project server` — PASS (`applyStatusRebuild`, `errorHandling`, `mtLockOnFirstEdit` all call the 3-arg form, which still works: `options` defaults to `{}`).

- [ ] **Step 6: Commit**

```bash
git add server/services/segmentEditorService.js server/routes/segment-editor.js server/__tests__/segmentEditorService.test.js
git commit -m "fix(item12): thread applied_by attribution into apply snapshots (B4-F5)

Schema column and service param already existed; apply passed null and no
route could supply an actor. Saga útgáfa rows now show who applied,
including review-complete auto-apply. Recursion path carries it too.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: F19 — version snapshots record empty segments

**Files:**
- Modify: `server/services/contentVersionService.js:65-74` (`snapshotModule` guard)
- Test: `server/__tests__/contentVersionService.test.js`

**Interfaces:**
- Produces: snapshots contain a row for every segment whose `content != null` (empty string included). All-empty modules mint real, listable, restorable versions — the phantom-version edge disappears without extra code.
- Both live callers already normalize `seg.is || ''`, so `null`/`undefined` reaching the guard indicates a bad caller and now throws in better-sqlite3 (fail-loud, batch-4-consistent).

- [ ] **Step 1: Write the failing tests**

In `server/__tests__/contentVersionService.test.js`, inside the main describe (uses `db`, `booksDir`, `BOOK`, `CHAPTER`, `MODULE`, `SEG`, `fileBody`, `readFaithful` from the harness):

```js
  it('records empty segments as explicit empty rows (F19)', () => {
    const res = contentVersionService.snapshotModule(
      BOOK,
      CHAPTER,
      MODULE,
      [
        { segmentId: SEG('fs-id001'), content: 'texti' },
        { segmentId: SEG('fs-id002'), content: '' },
      ],
      'prófari',
      db
    );
    expect(res.segmentsSnapshotted).toBe(2);
    const rows = db
      .prepare(`SELECT segment_id, content FROM content_versions WHERE version = ? ORDER BY segment_id`)
      .all(res.version);
    expect(rows).toContainEqual({ segment_id: SEG('fs-id002'), content: '' });
  });

  it('an all-empty module produces a real, listable version (F19 phantom fix)', () => {
    const res = contentVersionService.snapshotModule(
      BOOK,
      CHAPTER,
      MODULE,
      EN_IDS.map((id) => ({ segmentId: SEG(id), content: '' })),
      'prófari',
      db
    );
    expect(res.segmentsSnapshotted).toBe(EN_IDS.length);
    const listed = contentVersionService.getModuleVersions(BOOK, MODULE);
    expect(listed.some((v) => v.version === res.version)).toBe(true);
  });

  it('restore-then-undo returns an empty segment to empty (F19)', () => {
    // A past version where fs-id003 had real text.
    const past = contentVersionService.snapshotModule(
      BOOK,
      CHAPTER,
      MODULE,
      [
        { segmentId: SEG('fs-id001'), content: 'Gamalt 1' },
        { segmentId: SEG('fs-id002'), content: 'Gamalt 2' },
        { segmentId: SEG('fs-id003'), content: 'Gamalt 3' },
      ],
      'prófari',
      db
    );

    // Current faithful state: fs-id003 is EMPTY (untranslated).
    const faithfulPath = join(
      booksDir, BOOK, '03-faithful-translation', 'ch01', `${MODULE}-segments.is.md`
    );
    writeFileSync(
      faithfulPath,
      fileBody([
        { segmentId: SEG('fs-id001'), content: 'Núverandi 1' },
        { segmentId: SEG('fs-id002'), content: 'Núverandi 2' },
        { segmentId: SEG('fs-id003'), content: '' },
      ]),
      'utf-8'
    );

    // Restore the past version → fs-id003 gets 'Gamalt 3'.
    const res = contentVersionService.restoreVersion(BOOK, CHAPTER, MODULE, past.version, {
      username: 'hx',
    });
    expect(readFaithful(booksDir)[SEG('fs-id003')]).toBe('Gamalt 3');

    // Undo (restore the pre-restore snapshot) → fs-id003 must be EMPTY again.
    contentVersionService.restoreVersion(BOOK, CHAPTER, MODULE, res.snapshotVersion, {
      username: 'hx',
    });
    expect(readFaithful(booksDir)[SEG('fs-id003')]).toBe('');
  });
```

If the harness's `EN_IDS` constant is scoped inside `beforeEach`, hoist the literal `['fs-id001', 'fs-id002', 'fs-id003']` into the test. If `readFaithful` trims to `undefined` for an absent segment, assert `expect(readFaithful(booksDir)[SEG('fs-id003')] ?? '').toBe('')` — but only if the strict form fails for parser (not behavior) reasons; investigate before weakening.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/__tests__/contentVersionService.test.js`
Expected: FAIL — `segmentsSnapshotted` is 1 (not 2); the undo keeps `'Gamalt 3'` (empty segment was never snapshotted).

- [ ] **Step 3: Fix the guard**

`server/services/contentVersionService.js` (~:67-71), replace:

```js
    for (const seg of segments) {
      if (seg.content) {
        insert.run(book, chapter, moduleId, seg.segmentId, seg.content, nextVersion, appliedBy);
        count++;
      }
    }
```
with:
```js
    for (const seg of segments) {
      // Record empty segments as explicit '' rows: at restore time,
      // absence-from-snapshot is indistinguishable from "was never
      // extracted", which broke restore-undo for untranslated segments
      // (item 12, F19). null/undefined still throws (bad caller — fail loud).
      if (seg.content != null) {
        insert.run(book, chapter, moduleId, seg.segmentId, seg.content, nextVersion, appliedBy);
        count++;
      }
    }
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run server/__tests__/contentVersionService.test.js`
Expected: PASS (including the pre-existing restore round-trip tests — their fixtures use non-empty content and are unaffected).
Then: `npx vitest run server/__tests__/segmentEditorService.test.js server/__tests__/applyStatusRebuild.test.js`
Expected: PASS (apply-path snapshots now include `''` rows for untranslated segments — nothing pins the old skip; verified).

- [ ] **Step 5: Commit**

```bash
git add server/services/contentVersionService.js server/__tests__/contentVersionService.test.js
git commit -m "fix(item12): snapshot empty segments so restore-undo is faithful (F19)

Empty string is recorded as an explicit row; all-empty modules now mint
real versions (phantom version numbers gone as a side effect).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: F16 — restore triggers the same reindexing apply does

**Files:**
- Modify: `server/services/contentVersionService.js` (requires + `restoreVersion` tail)
- Test: `server/__tests__/contentVersionService.test.js`

**Interfaces:**
- Consumes: `tmService.scheduleTmRegen(book)` (debounced, never throws into caller) and `concordanceService.indexModule(book, chapter, moduleId)` (sync, replaces the module's `tm_segments` + FTS rows). No require cycle: neither service requires contentVersionService (verified).
- Produces: after a successful restore, concordance search / reuse suggestions / propagation matching reflect the restored text, and a TM regen is scheduled.

- [ ] **Step 1: Wire test isolation, then write the failing test**

`server/__tests__/contentVersionService.test.js` — three harness additions:

(a) Immediately after `const require = createRequire(import.meta.url);`, pin the DB env so no singleton can ever touch a real `sessions.db` (backstop idiom; belt for the new cross-service calls):

```js
// Env BEFORE any server require: concordanceService resolves its DB path at
// first use — never let a mis-wired singleton reach a real sessions.db.
process.env.SESSIONS_DB_PATH = join(tmpdir(), `cvs-test-${process.pid}.db`);
```
(`join`/`tmpdir` are already imported in this file.)

(b) With the other requires at the top:

```js
const concordance = require('../services/concordanceService');
const tmService = require('../services/tmService');
const migration036 = require('../migrations/036-tm-segments');
```

(c) In `beforeEach`, right after `contentVersionService._setTestDb(db);`:

```js
    migration036.up(db); // tm_segments + FTS5 mirror for the F16 reindex assertions
    concordance._setTestDb(db);
    tmService._setRunner(() => Promise.resolve({ code: 0, stderr: '' }));
```

and in `afterEach` (create one if the file only has implicit cleanup):

```js
    concordance._setTestDb(null);
    tmService._setRunner();
```

Then the failing tests (main describe):

```js
  it('restore reindexes concordance and schedules TM regen (F16)', () => {
    const snap = contentVersionService.snapshotModule(
      BOOK,
      CHAPTER,
      MODULE,
      [
        { segmentId: SEG('fs-id001'), content: 'Endurheimt efni 1' },
        { segmentId: SEG('fs-id002'), content: 'Endurheimt efni 2' },
        { segmentId: SEG('fs-id003'), content: 'Endurheimt efni 3' },
      ],
      'prófari',
      db
    );

    contentVersionService.restoreVersion(BOOK, CHAPTER, MODULE, snap.version, { username: 'hx' });

    // Concordance now reflects the RESTORED text (indexModule re-read the file).
    const rows = db
      .prepare(`SELECT segment_id, is_text FROM tm_segments WHERE book = ? AND module_id = ?`)
      .all(BOOK, MODULE);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.find((r) => r.segment_id === SEG('fs-id001'))?.is_text).toBe('Endurheimt efni 1');

    // TM regeneration was scheduled for this book (debounced; stub runner).
    expect(tmService._pendingBooks()).toContain(BOOK);
  });

  it('restore still succeeds when reindexing fails (best-effort, F16)', () => {
    const snap = contentVersionService.snapshotModule(
      BOOK,
      CHAPTER,
      MODULE,
      [{ segmentId: SEG('fs-id001'), content: 'Þolið efni' }],
      'prófari',
      db
    );

    const broken = new Database(':memory:'); // no tm tables → indexModule throws
    concordance._setTestDb(broken);
    const res = contentVersionService.restoreVersion(BOOK, CHAPTER, MODULE, snap.version, {
      username: 'hx',
    });
    expect(res.restoredVersion).toBe(snap.version);
    broken.close();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/__tests__/contentVersionService.test.js`
Expected: first F16 test FAILS — `rows.length` is 0 (restore performs no reindex today). Second may pass trivially pre-fix (no calls to fail) — it exists to pin the best-effort posture once the calls land.

- [ ] **Step 3: Add the reindex tail to `restoreVersion`**

`server/services/contentVersionService.js`:

(a) Requires (top of file, after `segmentParser`):

```js
const tmService = require('./tmService');
const concordanceService = require('./concordanceService');
```

(b) In `restoreVersion`, immediately after the file write (`const savedPath = segmentParser.saveModuleSegments(...)`, before the `result` object):

```js
  // Keep derived caches current — the same two best-effort steps the apply
  // path runs after writing the faithful file (segmentEditorService
  // :995-1009). Never fail the restore over a cache refresh.
  try {
    tmService.scheduleTmRegen(book);
  } catch (err) {
    log.error({ err, book }, 'Scheduling TM regeneration after restore failed');
  }
  try {
    concordanceService.indexModule(book, chapter, moduleId);
  } catch (err) {
    log.error({ err, book, moduleId }, 'Concordance indexing after restore failed');
  }
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run server/__tests__/contentVersionService.test.js`
Expected: PASS — all F16 + F19 + pre-existing restore tests.
Then: `npx vitest run --project server`
Expected: PASS (route-level restore callers unaffected; the new requires introduce no cycle).

- [ ] **Step 5: Commit**

```bash
git add server/services/contentVersionService.js server/__tests__/contentVersionService.test.js
git commit -m "fix(item12): restore reindexes concordance + schedules TM regen (F16)

Same two best-effort post-write steps as apply; search/reuse/propagation
no longer serve just-discarded text until the next apply.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Register bookkeeping + full-suite gate

**Files:**
- Modify: `docs/plans/2026-07-11-pre-semester-coding-campaign.md` (item 12 entry + register additions)

**Interfaces:** none (documentation + verification only).

- [ ] **Step 1: Update the campaign plan**

In `docs/plans/2026-07-11-pre-semester-coding-campaign.md`, item 12's line (Phase 3, line ~98): append ` **✅ SHIPPED (branch fix/item12-apply-job-version-integrity — see PR).**` and add a register block after the Phase 3 list following the existing register style:

```markdown
### Register — findings/deferrals from item 12 (2026-07-17)
- **I12-R1 `[fix]` — pipeline job read-scoping:** `GET /api/pipeline/jobs` + `GET /jobs/:jobId` let any head-editor see every book's jobs (read-only info leak, same class as B1-F5). listJobs now supports a `book` filter; scoping the reads by `user.books[]` deliberately deferred out of the item-12 PR (no read-authz churn in an integrity batch).
- **I12-R2 `[ux]` — apply-and-render 409 client polish:** after F6, a 409 truthfully means "nothing applied"; the client alert is accurate but could surface `err.data.jobId` and offer wait-and-retry (fetchJson already carries err.data since #270).
- **I12-R3 `[deploy]` — stranded localization rows sanity query:** before/at deploy run `SELECT COUNT(*) FROM localization_pending_edits WHERE status='approved' AND applied_at IS NULL;` — expected 0 (F3 previously could strand rows; the fix prevents new ones, it does not heal old ones). Any hits: lead eyeballs the file, then flips the row back to 'pending' or stamps applied_at by hand.
- **I12-R4 `[check]` — editorial rec #6 (not absorbed):** "Saga útgáfa" version-numbering — versions are PRE-write snapshots ("version 1 = my first change" is backwards). Two-minute UI check whether the restore modal's diff view already disambiguates, before writing any code.
```

- [ ] **Step 2: Full authoritative gate**

Run from the repo root:
```bash
npm test
```
Expected: **all green** (~2780+ tests; the suite count grows by this PR's new tests). Any red = stop and fix before proceeding.

Then:
```bash
npm run docs:check
git status --porcelain books/
```
Expected: docs:check exits 0 (Task 2 committed the regenerated docs); `books/` porcelain output **empty**.

- [ ] **Step 3: Commit**

```bash
git add docs/plans/2026-07-11-pre-semester-coding-campaign.md
git commit -m "docs(campaign): item 12 shipped — register I12-R1..R4

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Plan self-review (done at authoring)

1. **Spec coverage:** §1→Task 1 · §2→Task 3 · §3→Task 4 · §4→Task 5 · §5→Task 8 · §6→Task 7 · §7→Task 6 · §8→Task 2 · §9 posture→embedded in every task · §10→per-task tests + Task 9 gate · §11→Task 9 register · §12 respected (no read-authz churn, no persistent jobs, no client change). No gaps.
2. **Placeholders:** none — every step carries the actual code/commands.
3. **Type consistency:** `hasRunningJob(book, chapter, type)` used identically in Tasks 3, 4; `applyApprovedEdits(book, chapter, moduleId, options)` defined in Task 6 and used with 3 args elsewhere (valid — options defaults); `_jobsMap()` defined Task 3, consumed Task 4; `snapshotModule(..., appliedBy, db)` matches the existing 6-param signature in Tasks 6, 7, 8. Spec's `req.user?.userId` corrected to `req.user.id` (Global Constraints).
