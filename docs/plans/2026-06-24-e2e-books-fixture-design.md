# E2E books/ isolation via a fixture book (design)

**Date:** 2026-06-24
**Origin:** completion of Track 3 (E2E isolation). DB isolation merged
(`server/lib/dbPath.js`); this isolates the **`books/` file** mutations that
still make the full E2E suite 2-red (B-1 cross-spec contamination) and leave
`books/` dirty after runs.
**Scope:** a committed fixture book + E2E test-DB seed + migrating the
books-writing E2E specs onto it. No production code/config change.

## Problem

The E2E suite's apply/submit/localization specs write into the **real**
`efnafraedi-2e` `books/` files (faithful `.is.md`, `04-localized-content`, `tm/`,
and `02-structure` manifests). Two consequences:
- **Cross-spec contamination:** `editor-lifecycle.spec` mutates m68664's content;
  the later **B-1** test asserts the clean title `'Efnafræði í samhengi'` and
  fails. (B-1 passes alone; red only in the full suite.)
- **Dirty `books/`:** runs leave tracked files modified + untracked output dirs,
  a commit hazard (reverted ~6× by hand this session).

`books/` is **3.4 GB**, so a per-run copy is infeasible; Playwright runs specs in
parallel workers sharing `books/`, so per-spec `git checkout -- books/` is unsafe.

## Design — a small committed fixture book the writers target

### 1. `books/__e2e-fixture__` (inputs tracked, outputs gitignored)
- **Committed inputs** (the read side the editor/apply flow needs), copied from
  `efnafraedi-2e` ch01: `02-for-mt/ch01/`, `02-mt-output/ch01/`,
  `02-structure/ch01/` for **m68663** (intro) and **m68664** (a normal module).
  Small — a handful of files.
- **Gitignored outputs** (the write side tests produce): add to `.gitignore`
  `books/__e2e-fixture__/03-faithful-translation/`,
  `books/__e2e-fixture__/04-localized-content/`, `books/__e2e-fixture__/tm/`.
- Net: test writes land in gitignored dirs of a book **no read-only test
  inspects** → no contamination, no commit risk, no 3.4 GB copy.

### 2. Make the fixture a valid, registered book — test-DB only
`refreshValidBooks(db)` (config.js, called at startup, index.js:380) merges
`registered_books` (status='active') into `VALID_BOOKS`. So a book registered in
the **throwaway** DB is automatically valid — **no `config.js` change**, and prod
stays clean (its DB never gets the row). Realizes the "prod never sees it" intent
via the test DB rather than an in-config env-gate.

- New `server/e2e/seed-fixture.js`: builds the throwaway DB schema (via the
  migration runner) then `INSERT OR IGNORE` the fixture into `registered_books`
  (slug `__e2e-fixture__`, active) + `book_subject_mapping` (subject `chemistry`,
  so the subject-scoping path has a mapping). Idempotent.
- `playwright.config.js` webServer command runs it **before** the server, in the
  same shell chain (so ordering is deterministic), reusing the Track-3
  throwaway-DB path:
  ```
  rm -f "$E2E_DB"*; SESSIONS_DB_PATH="$E2E_DB" node e2e/seed-fixture.js; \
  SESSIONS_DB_PATH="$E2E_DB" JWT_SECRET=… PORT=3456 node ../index.js
  ```
  (`node ../index.js` re-runs migrations idempotently and `refreshValidBooks`
  picks up the seeded fixture.)

### 3. Migrate the books-writing specs onto the fixture
Repoint the specs that **write** `books/` from `efnafraedi-2e` to
`__e2e-fixture__` (same module ids m68663/m68664, chapter 1):
`editor-lifecycle`, `editor-workflow`, `localization-editor`, `review-cycle`
(and any other spec the isolation check reveals still dirties `books/` —
`rbac` applies as an editor → 403, no write, so it can stay).

**Read-only specs stay on `efnafraedi-2e`** — B-1 (title read), concordance,
terminology lookups: reads don't contaminate, and they exercise real content.

## Testing / acceptance
- **Full E2E suite green** (`cd server/e2e && (lsof -ti:3456|xargs -r kill); CI=1 npx playwright test`) — B-1 no longer contaminated.
- **`books/` clean after a full run:** `git status --porcelain books/` empty, and
  no untracked files under `books/efnafraedi-2e/` (fixture outputs are gitignored).
- The fixture's committed inputs are the only `books/__e2e-fixture__` files in
  `git status` before the run; nothing under it shows after (outputs gitignored).
- Logout flakiness is a **separate** known issue (parallel race) — out of scope
  here; if it still flakes, note it, don't conflate with this work.

## Out of scope (YAGNI)
Production config/migration changes (fixture is test-DB-only); copying real
content beyond the 2 needed modules; fixing the Logout race; broader BOOKS_DIR
env-isolation (the fixture-book approach avoids needing it).
