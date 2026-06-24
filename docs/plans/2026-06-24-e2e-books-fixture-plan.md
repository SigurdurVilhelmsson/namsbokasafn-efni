# E2E books/ Fixture Isolation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the E2E suite from writing real `efnafraedi-2e` `books/` files by giving the books-writing specs a small committed fixture book to target — greening the full suite and ending `books/` dirt.

**Architecture:** A committed `books/__e2e-fixture__` holds copied input files (read side) for m68663+m68664; its output dirs are gitignored. An E2E-only `seed-fixture.js` (run in the webServer command before the server) builds the throwaway-DB schema and registers the fixture; `refreshValidBooks` makes it valid at boot — no prod config/migration change. The books-writing specs repoint from `efnafraedi-2e` to `__e2e-fixture__`; read-only specs stay.

**Tech Stack:** Node.js, better-sqlite3, Playwright (E2E).

**Design:** [`2026-06-24-e2e-books-fixture-design.md`](2026-06-24-e2e-books-fixture-design.md)

## Global Constraints

- No production code/config/migration change. The fixture is valid only in the E2E throwaway DB (seeded by `seed-fixture.js`; `refreshValidBooks` at boot picks it up — index.js:380).
- Fixture book slug: `__e2e-fixture__`. Inputs committed; `books/__e2e-fixture__/{03-faithful-translation,04-localized-content,tm}/` gitignored.
- Read-only specs (B-1 title, concordance, terminology lookups) STAY on `efnafraedi-2e`.
- Builds on Track 3 (merged): `SESSIONS_DB_PATH` + the throwaway `pipeline-output/e2e-sessions.db`; `server/lib/dbPath.js`; `migrationRunner.runAllMigrations()` builds schema on a fresh DB.
- Branch: `chore/e2e-books-fixture` (created off `main`, holds the design doc).
- E2E run: `cd server/e2e && (lsof -ti:3456 | xargs -r kill); CI=1 npx playwright test [...] --reporter=line`.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `books/__e2e-fixture__/02-for-mt/ch01/`, `02-mt-output/ch01/`, `02-structure/ch01/` | Committed fixture inputs (m68663, m68664) copied from efnafraedi-2e ch01. | **Create (copy)** |
| `.gitignore` | Ignore the fixture's output dirs. | Modify |
| `server/e2e/seed-fixture.js` | Build throwaway-DB schema + register the fixture book (test-DB only). | **Create** |
| `server/e2e/playwright.config.js` | Run `seed-fixture.js` in the webServer command before the server. | Modify |
| `server/e2e/{editor-lifecycle,editor-workflow,review-cycle,localization-editor}.spec.js` | Repoint from `efnafraedi-2e` to `__e2e-fixture__`. | Modify |

---

## Task 1: Fixture book + test-DB registration + wiring

**Files:**
- Create (copy): `books/__e2e-fixture__/{02-for-mt,02-mt-output,02-structure}/ch01/` for m68663 + m68664
- Modify: `.gitignore`
- Create: `server/e2e/seed-fixture.js`
- Modify: `server/e2e/playwright.config.js`
- Test: `server/e2e/segment-editor.spec.js` (acceptance test that the fixture loads)

**Interfaces:**
- Produces: a registered, content-bearing book `__e2e-fixture__` available on the E2E server with modules m68663, m68664 in chapter 1.

- [ ] **Step 1: Copy the fixture inputs**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
for d in 02-for-mt 02-mt-output 02-structure; do
  mkdir -p "books/__e2e-fixture__/$d/ch01"
done
cp books/efnafraedi-2e/02-for-mt/ch01/m68663-segments.en.md books/efnafraedi-2e/02-for-mt/ch01/m68664-segments.en.md books/__e2e-fixture__/02-for-mt/ch01/
cp books/efnafraedi-2e/02-mt-output/ch01/m68663-segments.is.md books/efnafraedi-2e/02-mt-output/ch01/m68664-segments.is.md books/__e2e-fixture__/02-mt-output/ch01/
cp books/efnafraedi-2e/02-structure/ch01/m68663-structure.json books/efnafraedi-2e/02-structure/ch01/m68664-structure.json books/__e2e-fixture__/02-structure/ch01/
# (manifest.json is optional — loadModuleForEditing tolerates its absence; copy if present)
cp books/efnafraedi-2e/02-structure/ch01/m68663-manifest.json books/__e2e-fixture__/02-structure/ch01/ 2>/dev/null || true
cp books/efnafraedi-2e/02-structure/ch01/m68664-manifest.json books/__e2e-fixture__/02-structure/ch01/ 2>/dev/null || true
ls -R books/__e2e-fixture__
```
Expected: the three input dirs each contain the 2 modules' files.

- [ ] **Step 2: Gitignore the fixture's output dirs**

Append to `.gitignore`:
```
# E2E fixture book: inputs are committed, test-written outputs are not
books/__e2e-fixture__/03-faithful-translation/
books/__e2e-fixture__/04-localized-content/
books/__e2e-fixture__/tm/
```
Verify: `git check-ignore books/__e2e-fixture__/03-faithful-translation/x` prints the path (ignored); `git status --porcelain books/__e2e-fixture__` shows only the committed input files.

- [ ] **Step 3: Write the seed script**

Create `server/e2e/seed-fixture.js`:
```js
// E2E-only: build the throwaway DB schema and register the __e2e-fixture__ book.
// Run by playwright.config.js's webServer command BEFORE `node ../index.js`,
// with SESSIONS_DB_PATH pointing at the throwaway DB. Never runs in production.
const path = require('path');
const Database = require('better-sqlite3');
const { runAllMigrations } = require('../services/migrationRunner');
const resolveDbPath = require('../lib/dbPath');

runAllMigrations(); // builds full schema + migration seed on the fresh DB

const db = new Database(resolveDbPath());
try {
  db.prepare(
    `INSERT OR IGNORE INTO registered_books (slug, title_is, registered_by, status)
     VALUES ('__e2e-fixture__', 'E2E Fixture', 'e2e', 'active')`
  ).run();
  const row = db.prepare(`SELECT id FROM registered_books WHERE slug = '__e2e-fixture__'`).get();
  db.prepare(
    `INSERT OR IGNORE INTO book_subject_mapping (book_id, primary_subject) VALUES (?, 'chemistry')`
  ).run(row.id);
} finally {
  db.close();
}
```

- [ ] **Step 4: Wire the seed into the webServer command**

In `server/e2e/playwright.config.js`, change the `command` to run the seed between the `rm` and the server start (same shell chain — deterministic order):
```js
    command:
      `rm -f "${E2E_DB}" "${E2E_DB}-wal" "${E2E_DB}-shm"; ` +
      `SESSIONS_DB_PATH="${E2E_DB}" node seed-fixture.js; ` +
      `SESSIONS_DB_PATH="${E2E_DB}" JWT_SECRET=test-secret-for-e2e-not-production PORT=3456 node ../index.js`,
```
(`seed-fixture.js` builds the schema + registers the fixture; `node ../index.js` then re-runs migrations idempotently and `refreshValidBooks` includes the fixture.)

- [ ] **Step 5: Write the acceptance test (fixture loads)**

Add to `server/e2e/segment-editor.spec.js` (a new describe block):
```js
test.describe('E2E fixture book', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  test('fixture book module loads with segments', async ({ page }) => {
    const res = await page.request.get('/api/segment-editor/__e2e-fixture__/1/m68664');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.moduleId).toBe('m68664');
    expect(Array.isArray(body.segments)).toBe(true);
    expect(body.segments.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 6: Run the acceptance test**

Run: `cd server/e2e && (lsof -ti:3456 | xargs -r kill); CI=1 npx playwright test segment-editor.spec.js -g "fixture book module loads" --reporter=line`
Expected: PASS — proves the fixture is registered (valid), content-bearing, and loadable. If it 400s ("Unknown book"), the seed/refresh didn't register it — debug the seed before proceeding. If 404 ("not found"), the copied files are missing/misnamed.

- [ ] **Step 7: Commit**

```bash
git add books/__e2e-fixture__ .gitignore server/e2e/seed-fixture.js server/e2e/playwright.config.js server/e2e/segment-editor.spec.js
git commit -m "test(e2e): add __e2e-fixture__ book + test-DB seed (books-fixture task 1)"
```

---

## Task 2: Migrate books-writing specs to the fixture + verify isolation

**Files:**
- Modify: `server/e2e/editor-lifecycle.spec.js`, `editor-workflow.spec.js`, `review-cycle.spec.js`, `localization-editor.spec.js`

**Interfaces:**
- Consumes: the `__e2e-fixture__` book (Task 1).
- Produces: a full E2E suite that leaves `books/` clean and passes B-1.

- [ ] **Step 1: Repoint the const-based writers**

In each of `editor-workflow.spec.js`, `review-cycle.spec.js`, and `editor-lifecycle.spec.js`, change the book constant:
```js
const BOOK = 'efnafraedi-2e';
```
to:
```js
const BOOK = '__e2e-fixture__';
```
(`CHAPTER='1'` and `MODULE='m68664'`/m68663 are unchanged — the fixture has both.) `editor-lifecycle` derives the module from the first card; the fixture's first card is a real module with segments, so it still works.

- [ ] **Step 2: Repoint localization-editor (inline strings)**

In `server/e2e/localization-editor.spec.js`, replace every `'efnafraedi-2e'` literal and `/efnafraedi-2e/` URL segment with `'__e2e-fixture__'` / `/__e2e-fixture__/` (the book selector option, the `/api/localization-editor/efnafraedi-2e/...` paths, and the `book` assertion). Confirm with `grep -n "efnafraedi-2e" server/e2e/localization-editor.spec.js` → no matches after.

**No faithful fixture needed:** this spec is deliberately tolerant — the GET test accepts 200 *or* 404 ("If 404, faithful file was cleaned up — that's OK too"), and the save tests accept `[400, 404, 500]`. Against the fixture (which has no committed `03-faithful-translation`), the faithful-dependent reads return 404, which the spec passes on. Do **not** commit a faithful file into the fixture (that dir is gitignored by design).

- [ ] **Step 3: Run the migrated specs**

Run: `cd server/e2e && (lsof -ti:3456 | xargs -r kill); CI=1 npx playwright test editor-lifecycle.spec.js editor-workflow.spec.js review-cycle.spec.js localization-editor.spec.js --reporter=line`
Expected: all green against the fixture. A failure here means the fixture lacks content/state a spec assumed (e.g. a faithful file the localization spec expected) — fix by copying the needed input into the fixture (Task 1 Step 1), not by reverting to efnafraedi-2e.

- [ ] **Step 4: Full E2E suite green + B-1 un-contaminated**

Run: `cd server/e2e && (lsof -ti:3456 | xargs -r kill); CI=1 npx playwright test --reporter=line`
Expected: B-1 now PASSES (its efnafraedi-2e m68664 content is no longer mutated by editor-lifecycle). If only the known Logout race flakes, re-run it alone to confirm it's the pre-existing flake (out of scope): `CI=1 npx playwright test smoke.spec.js -g "Logout"`.

- [ ] **Step 5: Isolation check — books/ clean after a full run**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
( cd server/e2e && lsof -ti:3456 | xargs -r kill; CI=1 npx playwright test --reporter=line >/dev/null 2>&1 )
echo "--- books/ status after full run (expect empty) ---"
git status --porcelain books/
```
Expected: **no output** — no tracked `books/` files modified, no untracked files under `books/efnafraedi-2e/` (fixture outputs are gitignored). If `efnafraedi-2e` files show, a writing spec was missed — find it (`git status` names it), trace which spec wrote it, and repoint that spec too.

- [ ] **Step 6: Commit**

```bash
git add server/e2e/editor-lifecycle.spec.js server/e2e/editor-workflow.spec.js server/e2e/review-cycle.spec.js server/e2e/localization-editor.spec.js
git commit -m "test(e2e): migrate books-writing specs to the fixture book (books-fixture task 2)"
```

---

## Final verification

- [ ] Full E2E suite green (Logout race, if it appears, is the known pre-existing flake — verify alone).
- [ ] `git status --porcelain books/` empty after a full E2E run.
- [ ] `git status` shows no `pipeline-output/sessions.db` change (Track-3 isolation still holds).
- [ ] `npm test` (unit) still green.

## Self-review notes (coverage vs. spec)

- Spec "fixture inputs tracked / outputs gitignored" → Task 1 Steps 1–2. ✅
- Spec "test-DB-only registration via seed + refreshValidBooks; no prod change" → Task 1 Steps 3–4. ✅
- Spec "migrate books-writing specs; read-only stay" → Task 2 Steps 1–2 (4 writers migrated; B-1/concordance/terminology untouched). ✅
- Spec acceptance "full suite green + books/ clean" → Task 2 Steps 4–5 + Final verification. ✅
- Spec "Logout out of scope" → noted in Task 2 Step 4. ✅
