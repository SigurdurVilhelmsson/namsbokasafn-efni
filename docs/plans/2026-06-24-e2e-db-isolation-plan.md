# E2E DB Isolation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the E2E suite from mutating the real `sessions.db` by making the DB path env-configurable through one helper, and pointing the test server at a disposable DB.

**Architecture:** One `server/lib/dbPath.js` helper resolves `SESSIONS_DB_PATH` (else the canonical default). All 29 hardcoded path joins across 27 server files call it instead. The Playwright webServer command deletes a gitignored throwaway DB and then starts the server with `SESSIONS_DB_PATH` pointing at it, so migrations rebuild schema + seed fresh on each run.

**Tech Stack:** Node.js, better-sqlite3, Vitest (unit), Playwright (E2E).

**Design:** [`2026-06-24-e2e-db-isolation-design.md`](2026-06-24-e2e-db-isolation-design.md)

## Global Constraints

- The default path must stay **byte-identical** to today: `<repo>/pipeline-output/sessions.db`. Production/dev behavior unchanged.
- Helper reads the env var **at call time** (callers invoke it at module load, after `node index.js` has the env). Honors `process.env.SESSIONS_DB_PATH`.
- Do **not** touch the `_setTestDb(db)` unit-test injection seams (concordanceService, terminologyService, segmentEditorService, propagationService, etc.) — they stay.
- Do **not** touch shell scripts (`deploy.sh`, `backup-db.sh`) — they target the real prod DB by design.
- E2E throwaway DB path: `<repo>/pipeline-output/e2e-sessions.db` (already gitignored).
- Branch: `chore/e2e-db-isolation` (created off `main`, holds the design doc).
- Verification commands: unit = `npm test`; E2E = `cd server/e2e && (lsof -ti:3456 | xargs -r kill); CI=1 npx playwright test --reporter=line`.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `server/lib/dbPath.js` | Single source of truth for the DB path; env-aware. | **Create** |
| `server/__tests__/dbPath.test.js` | Unit test (env override + default). | **Create** |
| 27 server files (list in Task 2) | Replace 29 hardcoded path joins with the helper. | Modify |
| `server/e2e/playwright.config.js` | webServer command deletes the throwaway DB + sets `SESSIONS_DB_PATH`. | Modify |
| `server/e2e/segment-editor.spec.js` | Remove the now-unneeded propagation cleanup hack. | Modify |

---

## Task 1: `dbPath` helper + unit test

**Files:**
- Create: `server/lib/dbPath.js`
- Test: `server/__tests__/dbPath.test.js`

**Interfaces:**
- Produces: `require('../lib/dbPath')` → a function `resolveDbPath(): string` (the module's default export is the function). Returns `process.env.SESSIONS_DB_PATH` when set, else the absolute canonical `<repo>/pipeline-output/sessions.db`.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/dbPath.test.js`:

```js
import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const path = require('path');
const resolveDbPath = require('../lib/dbPath');

const ORIG = process.env.SESSIONS_DB_PATH;
afterEach(() => {
  if (ORIG === undefined) delete process.env.SESSIONS_DB_PATH;
  else process.env.SESSIONS_DB_PATH = ORIG;
});

describe('resolveDbPath', () => {
  it('returns SESSIONS_DB_PATH when set', () => {
    process.env.SESSIONS_DB_PATH = '/tmp/custom-e2e.db';
    expect(resolveDbPath()).toBe('/tmp/custom-e2e.db');
  });

  it('returns the canonical absolute default when env is unset', () => {
    delete process.env.SESSIONS_DB_PATH;
    const p = resolveDbPath();
    expect(path.isAbsolute(p)).toBe(true);
    expect(p.endsWith(path.join('pipeline-output', 'sessions.db'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/__tests__/dbPath.test.js`
Expected: FAIL — `Cannot find module '../lib/dbPath'`.

- [ ] **Step 3: Create the helper**

Create `server/lib/dbPath.js`:

```js
const path = require('path');

/**
 * Absolute path to the editorial server's SQLite DB. Honors SESSIONS_DB_PATH
 * (E2E points this at a throwaway DB); otherwise the canonical
 * pipeline-output/sessions.db. Single source of truth — was previously
 * duplicated across ~27 files.
 * @returns {string}
 */
module.exports = function resolveDbPath() {
  return (
    process.env.SESSIONS_DB_PATH ||
    path.join(__dirname, '..', '..', 'pipeline-output', 'sessions.db')
  );
};
```

(`server/lib/` → `../../pipeline-output/sessions.db` = repo `pipeline-output/sessions.db`.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run server/__tests__/dbPath.test.js`
Expected: PASS (2).

- [ ] **Step 5: Commit**

```bash
git add server/lib/dbPath.js server/__tests__/dbPath.test.js
git commit -m "feat(db): env-aware dbPath helper (e2e-db-isolation task 1)"
```

---

## Task 2: Route all 29 call sites through the helper

**Files (27):** `server/index.js`, `server/lib/chapterLock.js`,
`server/routes/{admin,my-work,terminology}.js`,
`server/services/{activityLog, analyticsService, bookDataGenerator,
bookRegistration, chapterFilesService, concordanceService,
contentVersionService, dashboardReadModel, feedbackService,
localizationEditService, localizationLog, localizationReviewService,
localizationSuggestions, migrationRunner, notifications, openstaxCatalogue,
pipelineService, pipelineStatusService, propagationService,
segmentEditorService, terminologyService, userService}.js`

**Interfaces:**
- Consumes: `resolveDbPath` from Task 1.
- Produces: no API change; every DB open now resolves through the helper.

- [ ] **Step 1: Replace the 23 module-level consts**

In each file that has `const DB_PATH = path.join(__dirname, '..', '..', 'pipeline-output', 'sessions.db');`, add (near the other requires) `const resolveDbPath = require('<rel>/lib/dbPath');` and change the const to `const DB_PATH = resolveDbPath();`. `<rel>`:
- `server/services/*.js` and `server/routes/*.js` → `'../lib/dbPath'`
- `server/lib/chapterLock.js` → `'./dbPath'`

Example (`server/services/concordanceService.js:23`):
```js
const resolveDbPath = require('../lib/dbPath');
// ...
const DB_PATH = resolveDbPath();
```

- [ ] **Step 2: Replace the 6 variant/inline occurrences**

These are not the standard module-const form:
- `server/services/pipelineService.js:537` and `:778` — `const dbPath = path.join(PROJECT_ROOT, 'pipeline-output', 'sessions.db');` → `const dbPath = require('../lib/dbPath')();`
- `server/routes/admin.js:227` — inline `const dbPath = path.join(__dirname, '..', '..', 'pipeline-output', 'sessions.db');` → `const dbPath = require('../lib/dbPath')();`
- `server/routes/admin.js:~1195–1197` — a multi-line `path.join(__dirname, '..', '..', 'pipeline-output', 'sessions.db')` (the `'sessions.db'` is on its own line). Replace the whole join expression with `require('../lib/dbPath')()`.
- `server/routes/terminology.js:989` — `const dbPath = path.join(__dirname, '..', '..', 'pipeline-output', 'sessions.db');` → `const dbPath = require('../lib/dbPath')();`
- `server/index.js:263` and `:378` — `const dbPath = path.join(__dirname, '..', 'pipeline-output', 'sessions.db');` → `const dbPath = require('./lib/dbPath')();`

(Use a top-of-file `const resolveDbPath = require('./lib/dbPath')` in index.js and call `resolveDbPath()` if preferred — either is fine as long as the path resolves.)

Do **not** delete `path` or `PROJECT_ROOT` imports — they are used elsewhere in these files.

- [ ] **Step 3: Verify no hardcoded path remains**

Run:
```bash
grep -rn "pipeline-output', 'sessions.db'\|'sessions.db'" server/ --include=*.js | grep -v __tests__ | grep -v "/e2e/" | grep -v node_modules | grep -v "\.venv" | grep -v "lib/dbPath.js"
```
Expected: **no output** (every occurrence now goes through `dbPath.js`). If any line prints, replace it too.

- [ ] **Step 4: Run the full unit suite (default path unchanged)**

Run: `npm test`
Expected: all green (same count as before this task, +2 from Task 1). This proves the 29-site refactor did not change default-path behavior. Investigate any failure before proceeding — a red here means a require path is wrong or a join was mis-replaced.

- [ ] **Step 5: Lint**

Run: `npx eslint server/`
Expected: clean (watch for newly-unused `path`/`PROJECT_ROOT` in any file where the join was its only use — if eslint flags one, remove that now-unused import there).

- [ ] **Step 6: Commit**

```bash
git add server/
git commit -m "refactor(db): route all sessions.db opens through dbPath helper (task 2)"
```

---

## Task 3: Point the E2E server at a throwaway DB

**Files:**
- Modify: `server/e2e/playwright.config.js`
- Modify: `server/e2e/segment-editor.spec.js` (remove the propagation cleanup hack)

**Interfaces:**
- Consumes: the `SESSIONS_DB_PATH` seam from Tasks 1–2.
- Produces: an isolated E2E run — all DB writes land in `pipeline-output/e2e-sessions.db`; the real `sessions.db` is untouched.

- [ ] **Step 1: Wire the webServer to a deleted-then-fresh throwaway DB**

In `server/e2e/playwright.config.js`, change the webServer command so it **deletes** the throwaway DB (and its WAL/SHM siblings) and **then** starts the server with `SESSIONS_DB_PATH` pointing at it. Deleting in the same shell command (rather than a `globalSetup`) guarantees the file is gone *before* `node index.js` opens it — independent of Playwright's globalSetup/webServer start ordering. The migration runner then rebuilds schema + seed from scratch.

```js
const path = require('path');
const E2E_DB = path.join(__dirname, '..', '..', 'pipeline-output', 'e2e-sessions.db');

module.exports = defineConfig({
  // ...existing config...
  webServer: {
    command:
      `rm -f "${E2E_DB}" "${E2E_DB}-wal" "${E2E_DB}-shm"; ` +
      `SESSIONS_DB_PATH="${E2E_DB}" JWT_SECRET=test-secret-for-e2e-not-production PORT=3456 node ../index.js`,
    port: 3456,
    reuseExistingServer: !process.env.CI,
    timeout: 15000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  // ...
});
```

(`reuseExistingServer: !CI` means a locally-already-running server on :3456 would be reused and would NOT have the env var — so **kill any stale server before running**, per the verification command. The `rm` + migration-build only happens when Playwright actually launches the server.)

- [ ] **Step 2: Remove the propagation cleanup hack**

In `server/e2e/segment-editor.spec.js`, the `O segment propagation` block has a `beforeEach` (or in-test block) that opens `better-sqlite3` directly and `DELETE`s `[e2e-propagation-test]` / `Markmiðstexti %` rows. With an isolated fresh DB per run this is unnecessary — remove that direct-DB cleanup code (keep the tests themselves). If a test relied on the cleanup to guarantee eligible occurrences, it still works: a fresh DB has no prior propagation rows.

- [ ] **Step 3: Run the full E2E suite against the throwaway DB**

Run: `cd server/e2e && (lsof -ti:3456 | xargs -r kill); CI=1 npx playwright test --reporter=line`
Expected: all green. This is the real acceptance test — it proves (a) the refactor works end-to-end, (b) the migration seed is sufficient for the suite on a from-scratch DB, and (c) isolation holds. Investigate any failure: a missing-seed failure (e.g. a book not registered) would mean a migration seed gap — report it rather than seeding ad-hoc in tests.

- [ ] **Step 4: Assert isolation — real `sessions.db` untouched**

Run:
```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
BEFORE=$(stat -c %Y pipeline-output/sessions.db 2>/dev/null || echo none)
( cd server/e2e && lsof -ti:3456 | xargs -r kill; CI=1 npx playwright test smoke.spec.js terminology.spec.js segment-editor.spec.js --reporter=line >/dev/null 2>&1 )
AFTER=$(stat -c %Y pipeline-output/sessions.db 2>/dev/null || echo none)
echo "before=$BEFORE after=$AFTER"; [ "$BEFORE" = "$AFTER" ] && echo "ISOLATED ✓" || echo "LEAK ✗"
echo "e2e db exists: $(ls -la pipeline-output/e2e-sessions.db 2>/dev/null | awk '{print $5}') bytes"
```
Expected: `ISOLATED ✓` (real DB mtime unchanged) and the e2e DB exists with data.

- [ ] **Step 5: Commit**

```bash
git add server/e2e/playwright.config.js server/e2e/segment-editor.spec.js
git commit -m "test(e2e): isolate suite to a throwaway sessions.db (task 3)"
```

---

## Final verification

- [ ] `npm test` → all green (unit; default path unchanged).
- [ ] `cd server/e2e && (lsof -ti:3456 | xargs -r kill); CI=1 npx playwright test --reporter=line` → all green (E2E on fresh DB).
- [ ] Isolation check (Task 3 Step 5) prints `ISOLATED ✓`.
- [ ] `grep -rn "'sessions.db'" server/ --include=*.js | grep -v __tests__ | grep -v /e2e/ | grep -v node_modules | grep -v .venv | grep -v lib/dbPath.js` → no output.
- [ ] `git status` shows no `books/` or `pipeline-output/sessions.db` changes from the run.

## Self-review notes (coverage vs. spec)

- Spec "one env-aware helper" → Task 1. ✅
- Spec "DRY 27 files / default byte-identical" → Task 2 (29 occurrences incl. variants; grep proves completeness; full unit suite proves default unchanged). ✅
- Spec "E2E → throwaway DB (deleted pre-start so migrations rebuild fresh) + remove cleanup hack" → Task 3 (delete done in the webServer command for ordering-safety, simpler than a globalSetup). ✅
- Spec "acceptance: unit green + E2E green on fresh DB + mtime isolation" → Task 3 Steps 4–5 + Final verification. ✅
- Spec "_setTestDb seams + shell scripts untouched" → Global Constraints; no task touches them. ✅
