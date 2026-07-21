# C1b — Appendices Registration + Backfill + Consumer Routes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register the appendices chapter (`-1`) into `book_sections`/`book_chapters` so the DB-registry surfaces show appendices, add an idempotent add-only backfill for already-registered books, and fix the two deferred consumer routes.

**Architecture:** One shared idempotent `insertAppendixSections()` in `bookRegistration.js` is the load-bearing DB-write path; `registerBook` (new registrations, data from the network-fetched `bookData.appendices`) and a new `scripts/backfill-appendix-sections.js` (existing books, data from local committed files) both call it. Two consumer routes adopt `normalizeChapter`; the disk-sourced one also constructs a synthetic appendix chapter from `book.appendices`.

**Tech Stack:** Node.js 22 (CommonJS server modules), Express 5, better-sqlite3, Vitest. Run all tests from the **repo root** (`npm test`), never from `server/`.

## Global Constraints

- **Canonical form (`server/lib/chapterLabel.js`):** appendices = integer `-1` in the DB and memory; `'appendices'` only at on-disk dir names / CLI argv. `chapterDir(-1)→'appendices'`, `normalizeChapter('appendices'|'-1')→-1`. Convert only through this module.
- **Appendix `section_num` format = `String(i+1)`** (1-based position in `collection-order.json appendixModules`). Rationale: `getChapterSections` sorts `ORDER BY CAST(REPLACE(section_num,'.','') AS INTEGER)`; `"1".."13"` sort correctly, a `-1.N`/letter form does not. This format is FROZEN across registration and backfill (they must produce identical rows for the same book).
- **`insertAppendixSections` is add-only + idempotent:** never UPDATE/DELETE an existing row (preserves status/assignments); skip a section whose `(book_id, chapter_num=-1, module_id)` already exists (explicit SELECT guard — `book_sections` has no unique index to rely on).
- **Backfill MUST NOT re-fetch from OpenStax** (the `01-source` overwrite guard + it is networked). Source ids from committed `01-source/collection-order.json appendixModules`, titles from local `02-structure/appendices/*` (or `NULL`).
- **No behavior change for existing chapters (0..99):** the appendix logic is additive, gated on `bookData.appendices?.length` / the presence of a `-1` chapter. Non-appendix rows byte-identical.
- **Fails-safe:** with no `-1` rows, surfaces omit appendices (status quo). A bug must at worst leave that, never corrupt chapter rows.
- **Branch:** `fix/appendices-registration` (created; spec committed `60927867`). Base main `13d97de9`.
- **Commit trailer:** end every commit message with
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## Pre-Handoff Verifications (confirmed 2026-07-21 — do not re-litigate)

- **`admin.js:497`** sources `book.chapters` from `getRegisteredBook` → **the DB** (`FROM book_chapters bc LEFT JOIN book_sections bs`, `ORDER BY bc.chapter_num`). After backfill inserts the `-1` chapter row, `book.chapters` includes it → a `normalizeChapter` validator swap suffices there.
- **`books.js:190`** (`GET /:bookId/chapters/:chapter`) sources `book.chapters` from `loadBookData` → **disk `book-data.json`**, where `appendices` is a **separate array of `{id,title}`**, NOT in `chapters[]`. So the fix is `normalizeChapter` **plus** constructing a synthetic appendix chapter from `book.appendices` when `-1` — not a bare swap.
- **`getRegisteredBook` chapter mapping** hardcodes `` `ch${String(c.chapter_num).padStart(2,'0')}` `` (≈`:408`) for its on-disk faithful-count → `ch-1` for the appendix chapter (fail-safe 0, but wrong). Fix with `chapterDir()`.
- **`seed-fixture.js` does NOT call `registerBook`** — it `INSERT OR IGNORE`s `registered_books` directly and creates no `book_sections`/`book_chapters`. So **I14-R8 is satisfied by a `registerBook` unit test + the backfill unit test**, NOT a fixture/Playwright change (a fixture E2E would pass regardless of the fix). Browser-E2E appendix editing is out of scope for PR-2.
- **`book_chapters` insert:** `INSERT INTO book_chapters (book_id, chapter_num, title_en, title_is, section_count, status)` via `insertChapter`. **`book_sections` insert:** columns `(book_id, chapter_id, chapter_num, section_num, module_id, title_en, title_is, cnxml_path, en_md_path, status)` (see `bookRegistration.js:171-176`). Mirror both for appendices.

---

## File Structure

- **Modify** `server/services/bookRegistration.js` — add exported `insertAppendixSections`; wire appendix chapter+sections into `registerBook`; fix the `:199` and `getRegisteredBook` `:408` `ch${NN}` hardcodes. *(Task 1, Task 4)*
- **Create** `scripts/backfill-appendix-sections.js` — add-only idempotent backfill (dry-run default, `--db`, `--book`). *(Task 2)*
- **Modify** `server/routes/admin.js` (`:497`) + `server/routes/books.js` (`:190`) — consumer-route validators. *(Task 3)*
- **Modify** `server/public/*/books.html` (or its template) — `': '+title` dedup. *(Task 3)*
- **Test:** `server/__tests__/registerAppendixSections.test.js`, `scripts/__tests__/backfillAppendixSections.test.mjs`, additions to `books-routes.test.js` + an admin route test. *(various)*

---

## Task 1: Shared `insertAppendixSections` + registration wiring (I14-R4/I16-R3)

**Files:**
- Modify: `server/services/bookRegistration.js` (add `insertAppendixSections`; call it in `registerBook` after the chapters loop; fix `:199`)
- Test: `server/__tests__/registerAppendixSections.test.js` (create)

**Interfaces:**
- Produces: `insertAppendixSections(db, { bookId, chapterId, sections })` where `sections = Array<{ module_id: string, section_num: string, title_en: string|null }>`. Idempotent, add-only. Returns the count inserted.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/registerAppendixSections.test.js`. Use an in-memory / temp better-sqlite3 DB with the schema migrated (mirror the harness in `server/__tests__/bookRegistration*.test.js` if one exists; else run `migrationRunner.runAllMigrations()` against a temp `SESSIONS_DB_PATH`). Register a synthetic book whose `bookData` has `chapters:[…]` AND `appendices:[{id:'m90001',title:'Periodic Table'},{id:'m90002',title:'Units'}]`:

```js
// after registerBook(...) with appendices present:
const rows = db.prepare(
  `SELECT chapter_num, section_num, module_id, title_en, en_md_path
   FROM book_sections WHERE book_id = ? AND chapter_num = -1 ORDER BY CAST(section_num AS INTEGER)`
).all(bookId);
expect(rows.map(r => r.module_id)).toEqual(['m90001', 'm90002']);
expect(rows.map(r => r.section_num)).toEqual(['1', '2']);
expect(rows[0].en_md_path).toContain('02-for-mt/appendices/');
expect(rows[0].en_md_path).not.toContain('ch-1');
// appendix chapter row exists:
const ch = db.prepare(`SELECT * FROM book_chapters WHERE book_id=? AND chapter_num=-1`).get(bookId);
expect(ch).toBeTruthy();
expect(ch.title_is).toBe('Viðaukar');
// idempotency: registering-insert path run twice inserts no duplicates
const n = insertAppendixSections(db, { bookId, chapterId: ch.id, sections: [{module_id:'m90001', section_num:'1', title_en:'x'}] });
expect(n).toBe(0); // already present
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- registerAppendixSections`
Expected: FAIL — no `-1` rows / `insertAppendixSections` not exported.

- [ ] **Step 3: Implement**

In `server/services/bookRegistration.js`:

Add near the other requires: `const { chapterDir } = require('../lib/chapterLabel');`

Add the exported function:

```js
/**
 * Insert appendix (chapter_num=-1) section rows. Add-only + idempotent: skips a
 * section whose (book_id, chapter_num=-1, module_id) row already exists, so it
 * is safe to call on a partially-registered book (registration OR backfill).
 * @returns {number} rows inserted
 */
function insertAppendixSections(db, { bookId, chapterId, sections }) {
  const exists = db.prepare(
    `SELECT 1 FROM book_sections WHERE book_id = ? AND chapter_num = -1 AND module_id = ?`
  );
  const insert = db.prepare(`
    INSERT INTO book_sections
      (book_id, chapter_id, chapter_num, section_num, module_id, title_en, title_is, cnxml_path, en_md_path, status)
    VALUES (?, ?, -1, ?, ?, ?, NULL, ?, ?, 'not_started')
  `);
  const dir = chapterDir(-1); // 'appendices'
  let inserted = 0;
  for (const s of sections) {
    if (exists.get(bookId, s.module_id)) continue;
    insert.run(
      bookId, chapterId, s.section_num, s.module_id, s.title_en ?? null,
      `01-source/${dir}/${s.module_id}.cnxml`,
      `02-for-mt/${dir}/${s.section_num}.en.md`
    );
    inserted++;
  }
  return inserted;
}
```

In `registerBook`, immediately after the `for (const chapter of bookData.chapters …)` loop (inside the same transaction), add:

```js
if (bookData.appendices && bookData.appendices.length) {
  const apxResult = insertChapter.run(bookId, -1, 'Appendices', 'Viðaukar', bookData.appendices.length);
  const apxChapterId = apxResult.lastInsertRowid;
  const sections = bookData.appendices.map((a, i) => ({
    module_id: a.id,
    section_num: String(i + 1),
    title_en: a.title ?? null,
  }));
  totalSections += insertAppendixSections(db, { bookId, chapterId: apxChapterId, sections });
  chapters.push({ chapterNum: -1, title: 'Appendices', titleIs: 'Viðaukar', sectionCount: bookData.appendices.length });
}
```

Fix the `:199` hardcode inside the chapter section loop. **Shadow footgun — resolve unambiguously (a silent shadow mislabels EVERY chapter's paths, not just appendices):** the imported helper is `chapterDir`; there is currently a LOCAL `const chapterDir = \`ch${…}\`` at `:199` used at `:209-210`. Import the helper as `chapterDir` and **rename the local** to `chapterDirName`:
```js
// before (:199, :209-210)
const chapterDir = `ch${String(chapterNum).padStart(2, '0')}`;
... `01-source/${chapterDir}/${mod.id}.cnxml`
... `02-for-mt/${chapterDir}/${sectionNum.replace('.', '-')}.en.md`
// after
const chapterDirName = chapterDir(chapterNum); // imported helper; identical 'chNN' for numeric chapters
... `01-source/${chapterDirName}/${mod.id}.cnxml`
... `02-for-mt/${chapterDirName}/${sectionNum.replace('.', '-')}.en.md`
```
Then **grep the function body for any other `chapterDir` local** and confirm `insertAppendixSections`'s `chapterDir(-1)` binds to the import (not a shadow). `chapterDir(N)` for numeric N is byte-identical to the old `ch${padStart}` — verify the existing registration tests stay green (the "no behavior change for existing chapters" invariant).

**Confirm `en_md_path`/`cnxml_path` are nominal:** this plan writes `en_md_path = 02-for-mt/appendices/<section_num>.en.md`, matching the chapter convention (`<sectionNum>.en.md`) even though real files are `m…-segments.en.md`. That mismatch already exists for chapter rows, so the column is almost certainly unused for content loading — but grep for readers of `en_md_path`/`cnxml_path` that load file CONTENT (not just display). If something reads them to load content, chapters have the same latent bug: **note it, don't inherit it silently.**

Add `insertAppendixSections` to `module.exports`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- registerAppendixSections`
Expected: PASS.

- [ ] **Step 5: Run the full suite** (registration is widely depended-on)

Run: `npm test`
Expected: all green — no existing registration/bookRegistration test regressed.

- [ ] **Step 6: Commit**

```bash
git add server/services/bookRegistration.js server/__tests__/registerAppendixSections.test.js
git commit -m "feat(registration): register appendix section rows via shared insertAppendixSections (C1b I14-R4)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Backfill script for existing books

**Files:**
- Create: `scripts/backfill-appendix-sections.js`
- Test: `scripts/__tests__/backfillAppendixSections.test.mjs` (`.mjs` — the `scripts` vitest project globs `**/*.test.mjs`)

**Interfaces:**
- Consumes: `insertAppendixSections` (Task 1). Sources appendix ids from `01-source/collection-order.json appendixModules`, titles from `02-structure/appendices/<id>-structure.json` (or `NULL`), `section_num = String(i+1)`.

- [ ] **Step 1: Confirm module conventions**

Read `scripts/backfill-mt-locks.js` for the established pattern (arg parsing, dry-run default, `--db`, `resolveDbPath`, fail-loud, `import.meta.url` entrypoint guard). Confirm the DB-path resolver (`server/lib/dbPath.js resolveDbPath()`), and how registered books are enumerated (query `registered_books`/`getRegisteredBook`).

- [ ] **Step 2: Write the failing test**

Create `scripts/__tests__/backfillAppendixSections.test.mjs`. Against a temp `SESSIONS_DB_PATH` (migrated) + a temp book dir with `01-source/collection-order.json` (`appendixModules:['m90001','m90002']`) and a registered book row but **no** `-1` sections:

```js
// dry-run writes nothing:
await runBackfill({ book: SLUG, db: false, booksDir: tmpBooks });
expect(count(db, SLUG, -1)).toBe(0);
// --db inserts:
await runBackfill({ book: SLUG, db: true, booksDir: tmpBooks });
expect(count(db, SLUG, -1)).toBe(2);
// idempotent second run — sections NOT duplicated AND the appendix chapter row NOT duplicated:
await runBackfill({ book: SLUG, db: true, booksDir: tmpBooks });
expect(count(db, SLUG, -1)).toBe(2); // sections still 2
const apxChapters = db.prepare(
  `SELECT COUNT(*) n FROM book_chapters bc JOIN registered_books rb ON rb.id=bc.book_id
   WHERE rb.slug=? AND bc.chapter_num=-1`).get(SLUG).n;
expect(apxChapters).toBe(1); // "insert chapter if missing" guard — exactly one -1 chapter row
// fail-loud on unreadable collection-order.json:
await expect(runBackfill({ book: BROKEN, db: true, booksDir: tmpBooks })).rejects.toThrow();
```

Export a testable `runBackfill(opts)` from the script (behind the `import.meta.url` entrypoint guard, like `validate-status.js`).

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- backfillAppendixSections`
Expected: FAIL — script/`runBackfill` missing.

- [ ] **Step 4: Implement**

Write `scripts/backfill-appendix-sections.js`: enumerate registered books (or the `--book` one); for each with an `appendices` source dir but no `-1` rows, ensure an appendix `book_chapters` row exists (insert if missing → `chapterId`), derive `sections` from local files, call `insertAppendixSections`. Print a per-book summary. Dry-run unless `--db`. Fail-loud on a missing/unparseable `collection-order.json` for a book that has an appendices dir. Entrypoint guard runs `main()` only under `node`.

- [ ] **Step 5: Run test + a dry-run against the real repo**

Run: `npm test -- backfillAppendixSections`
Then a real dry-run (read-only, no `--db`): `node scripts/backfill-appendix-sections.js --book efnafraedi-2e`
Expected: test PASS; dry-run prints the 13 appendix rows it *would* insert for efnafraedi-2e, writes nothing.

- [ ] **Step 6: Commit**

```bash
git add scripts/backfill-appendix-sections.js scripts/__tests__/backfillAppendixSections.test.mjs
git commit -m "feat(scripts): add-only idempotent backfill-appendix-sections (C1b)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Consumer routes + books.html dedup

**Files:**
- Modify: `server/routes/admin.js` (`:497`), `server/routes/books.js` (`:190`)
- Modify: `server/services/bookRegistration.js` (`getRegisteredBook` `:408` `ch${NN}` → `chapterDir`)
- Modify: `books.html` (the `': '+title` dedup)
- Test: extend `server/__tests__/books-routes.test.js`; add/extend an admin route test

**Interfaces:**
- Consumes: `normalizeChapter`, `chapterDir` (`chapterLabel`).

- [ ] **Step 1: Write the failing tests**

For `books.js:190` (`GET /:bookId/chapters/:chapter`), extend `books-routes.test.js` (reuse the existing handler-extraction harness): with a `book-data.json` fixture that has `appendices:[{id,title},…]`, assert `chapter='appendices'` returns 200 with `modules` sourced from `book.appendices` (not 404); `0`/junk still 400; numeric chapters unchanged.

For `admin.js:497` (DB-sourced): with a registered book that has `-1` rows (insert via `insertAppendixSections` in the test setup), assert the chapter-detail handler resolves `chapter='appendices'` (not 404); still rejects `0`/junk.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- books-routes admin`
Expected: FAIL — appendices → 404.

- [ ] **Step 3: Implement**

`admin.js:497`:
```js
const chapterNum = normalizeChapter(chapter);
const chapterData = book.chapters.find((c) => c.chapterNum === chapterNum);
```
(add `const { normalizeChapter } = require('../lib/chapterLabel');` if absent; keep the `if (!chapterData) 404`).

`books.js:190`:
```js
const chapterNum = normalizeChapter(chapter);
const chapterData = chapterNum === -1
  ? { chapter: -1, title: 'Viðaukar', modules: book.appendices || [] }
  : book.chapters.find((c) => c.chapter === chapterNum);
```
(reject `chapterNum === null` with the existing 404/400 as appropriate; add the `chapterLabel` require).

`getRegisteredBook` `:408`:
```js
const chDir = chapterDir(c.chapter_num); // was `ch${String(c.chapter_num).padStart(2,'0')}`
```

`books.html`: locate the section-title render that concatenates `': ' + title` and dedup so an appendix row whose `title`/`section` would double-render shows once (match the item-14 `chapterLabel` display convention; `node --check` any client JS touched).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- books-routes admin`
Expected: PASS.

- [ ] **Step 4.5: Usability verification — "rows exist" ≠ "appendices are usable" (advisor)**

The feature's point is that an appendix section can be **assigned and reached**. `bookRegistration.js:679/751` set `sectionNum: s.section_num` (the literal `section_num`, NOT `module_id`), and `sections.js:123/206` build the editor link as `…&module=${section.sectionNum}` while segment-editor's `validateModule` requires `^m\d{5}$`. So an appendix link is `module=1` — but a **chapter** link is `module=5.1`, which *also* fails `validateModule`. **Verify:** confirm chapters behave the same (assignment link uses `section_num` for chapters too) → appendices inherit **pre-existing** behavior, introduce NO new breakage. If confirmed pre-existing: **log it** (assignment-link `module=` uses `section_num`, mismatches `validateModule` for ALL chapters + appendices) as an out-of-scope finding in the campaign register; do NOT fix in PR-2. If chapters somehow resolve correctly and appendices don't, that IS a PR-2 gap — fix it. Also confirm an appendix section row is a valid target for the `sections.js` assignment flow (the assign query returns it).

- [ ] **Step 5: Commit**

```bash
git add server/routes/admin.js server/routes/books.js server/services/bookRegistration.js books.html
git commit -m "fix(routes): appendix chapter-detail via consumer routes + getRegisteredBook dir (C1b)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

(Adjust the `books.html` path to its real location — likely `server/public/…`.)

---

## Task 4: Full-suite gate + docs/register update

- [ ] **Step 1: Full suite from repo root**

Run: `npm test`
Expected: all green. Any newly-red existing test is a real regression (registration is widely depended-on) — fix, don't update.

- [ ] **Step 2: Real dry-run of the backfill (read-only evidence)**

Run: `node scripts/backfill-appendix-sections.js` (no `--book`, no `--db`)
Expected: prints the appendix rows it would insert per registered book; writes nothing. Capture for the PR body.

- [ ] **Step 3: Update the campaign register**

In `docs/plans/2026-07-21-post-item17-followup-campaign.md`, under C1: mark **I14-R4/I16-R3/I14-R8 delivered in PR-2 (registration + backfill + consumer routes)**; note the **prod backfill is a lead data-op** (`node scripts/backfill-appendix-sections.js --db` after deploy, dry-run first); confirm C1 is now fully code-complete (PR-1 read-path + PR-2 registration).

- [ ] **Step 4: Commit**

```bash
git add docs/plans/2026-07-21-post-item17-followup-campaign.md
git commit -m "docs(campaign): C1b registration+backfill shipped; C1 code-complete

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: Whole-branch adversarial review + PR**

Run a whole-branch adversarial review (the C1a pattern — lenses over correctness / idempotency+add-only safety / the two dir-source consumer traps / test integrity / completeness), triage, then open the PR (lead merges). **PR body MUST state:** what's delivered; that the **prod backfill is a separate lead data-op** (add-only, dry-run-first, idempotent); deploy gated by A4; and that C1 is code-complete on merge.

---

## Self-Review

**Spec coverage:** registration I14-R4/I16-R3 → Task 1; shared idempotent add-only insert → Task 1; backfill script → Task 2; consumer routes (both source-traps) + books.html + getRegisteredBook `ch-1` → Task 3; I14-R8 (via registerBook + backfill unit tests, seed-fixture rescope) → Tasks 1+2; `section_num` format pinned (Global Constraints) → Task 1. ✅

**Placeholder scan:** the `books.html` exact path and the `bookRegistration` test-harness shape are named as "confirm during implementation" with the concrete file to inspect — verification pointers, not vague requirements. No TBD/TODO.

**Type consistency:** `insertAppendixSections(db, {bookId, chapterId, sections})` with `sections:{module_id,section_num,title_en}` defined in Task 1 and consumed identically in Task 2 (backfill) and the tests. `section_num = String(i+1)` used consistently.
