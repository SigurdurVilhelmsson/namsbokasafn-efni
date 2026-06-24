# E2E DB isolation via env-configurable path (design)

**Date:** 2026-06-24
**Origin:** Track 3 of the next-session roadmap
([`2026-06-24-next-session-roadmap.md`](2026-06-24-next-session-roadmap.md)).
The E2E suite mutates the real `pipeline-output/sessions.db` (stray segment
edits, terminology rows, ~111 propagation rows), forcing per-test cleanup hacks
and causing order-dependent flakiness.
**Scope:** `server/` DB path + E2E config. `books/` file isolation is OUT (a
separate, smaller follow-up).

## Problem

The Playwright webServer starts `node ../index.js` with no DB override, so the
test server uses the production-shaped `pipeline-output/sessions.db`. Every
edit/terminology/propagation test writes there. Consequences:
- Cruft accumulates (the propagation E2E left ~111 pending rows; it needed a
  direct-`better-sqlite3` cleanup hack in `beforeEach`).
- Order-dependent flakiness (a later run sees a prior run's rows).
- `sessions.db` is gitignored, so this is *not* a commit risk — it is a
  correctness/hygiene risk.

The DB path is **hardcoded in 27 server files** as
`path.join(__dirname, '..', '..', 'pipeline-output', 'sessions.db')` (plus two
inline copies in `index.js`). There is no seam to point tests at another DB.

## Why a fresh throwaway DB is sufficient (verified)
- **Auth needs only a valid JWT** — `requireAuth` builds `req.user` from the
  token, no DB user lookup (`server/middleware/requireAuth.js`).
- **`VALID_BOOKS` is static config** (`server/config.js`), not DB-derived.
- **Migrations seed** `registered_books` (019, 029) and `book_subject_mapping`
  (032). The migration runner already builds the full schema + seed from scratch
  when the DB file is missing (the 2026-06-10 fresh-clone bootstrap fix).
- Tests create their own terms/edits; they read book *content* from `books/`
  (real files, not isolated in this scope).

So a fresh DB built by the migration runner has everything the suite needs.

## Design

### 1. One path helper — `server/lib/dbPath.js`
```js
const path = require('path');

/**
 * Absolute path to the editorial server's SQLite DB. Honors SESSIONS_DB_PATH
 * (used by E2E to point at a throwaway DB); otherwise the canonical
 * pipeline-output/sessions.db. Single source of truth — was duplicated in 27
 * files before.
 * @returns {string}
 */
module.exports = function resolveDbPath() {
  return (
    process.env.SESSIONS_DB_PATH ||
    path.join(__dirname, '..', '..', 'pipeline-output', 'sessions.db')
  );
};
```
`server/lib/` → `__dirname/../../pipeline-output/sessions.db` = repo
`pipeline-output/sessions.db` — byte-identical to today's default. Read at call
time, so the env var (set before `node index.js`) is honored.

### 2. DRY the 27 call sites
Replace each module-level `const DB_PATH = path.join(__dirname, '..', '..', 'pipeline-output', 'sessions.db')`
with `const DB_PATH = require('<rel>/lib/dbPath')()`, where `<rel>` is:
- `server/services/*.js` and `server/routes/*.js` → `'../lib/dbPath'`
- `server/lib/chapterLock.js` → `'./dbPath'`
- `server/index.js` → `'./lib/dbPath'` (module-level if present, plus the two
  inline `const dbPath = path.join(...)` at ~:263 and ~:378 → `require('./lib/dbPath')()`)

Full list (27): `index.js`, `lib/chapterLock.js`, `routes/{admin,my-work,terminology}.js`,
`services/{activityLog, analyticsService, bookDataGenerator, bookRegistration,
chapterFilesService, concordanceService, contentVersionService,
dashboardReadModel, feedbackService, localizationEditService, localizationLog,
localizationReviewService, localizationSuggestions, migrationRunner,
notifications, openstaxCatalogue, pipelineService, pipelineStatusService,
propagationService, segmentEditorService, terminologyService, userService}.js`.

The default path is unchanged → production/dev behavior identical. **Test-only
`_setTestDb(db)` injection seams (in concordanceService, terminologyService,
segmentEditorService, propagationService, …) are untouched** — unit tests keep
working as-is; the helper only changes how the *default* path is resolved.

### 3. Point E2E at a throwaway DB — `server/e2e/`
- `playwright.config.js` webServer command:
  `SESSIONS_DB_PATH=<root>/pipeline-output/e2e-sessions.db JWT_SECRET=… PORT=3456 node ../index.js`
  (`pipeline-output/e2e-sessions.db` is already gitignored).
- New `globalSetup` (referenced from `playwright.config.js`) deletes that file
  (and `-wal`/`-shm` siblings) before the run, so the migration runner rebuilds
  schema + seed fresh. Optional `globalTeardown` deletes it after (leave the
  file for post-run inspection is also fine — it's gitignored).
- Remove the propagation E2E's direct-`better-sqlite3` cleanup hack (no longer
  needed — every run starts clean).

## Testing
- **Unit** (`server/__tests__/dbPath.test.js`): returns the env value when
  `SESSIONS_DB_PATH` is set; returns the canonical absolute default otherwise
  (asserts it ends with `pipeline-output/sessions.db` and is absolute).
- **Full unit suite** green (`npm test`) — proves the 27-site refactor left the
  default path behavior unchanged.
- **Full E2E suite** green against the fresh throwaway DB — proves migration
  seed sufficiency + isolation (this is the real acceptance test).
- **Isolation check:** record `sessions.db` mtime, run the E2E suite, assert the
  real `sessions.db` mtime is unchanged (tests wrote only to the throwaway DB).

## Out of scope (YAGNI)
`books/` file isolation (separate follow-up); shell scripts `deploy.sh` /
`backup-db.sh` (they target the real prod DB by design); changing the
`_setTestDb` unit-test injection pattern; multi-environment config beyond the
one env var.
