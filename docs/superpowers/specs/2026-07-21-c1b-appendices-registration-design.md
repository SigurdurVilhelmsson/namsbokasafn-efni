# C1b — Appendices registration + backfill + consumer routes (design)

**Date:** 2026-07-21 · **Campaign item:** C1 (Appendices support batch), **PR-2** · **Register:** I14-R4, I16-R3, I14-R8 + the deferred consumer sites
**Baseline:** main `13d97de9` (C1a PR-1 #323 merged at `06605ab6`) · **Plan:** `docs/plans/2026-07-21-post-item17-followup-campaign.md`
**Predecessor:** `docs/superpowers/specs/2026-07-21-c1a-appendices-read-path-design.md` (PR-1, read-path — merged)

## Problem

PR-1 made the server READ-path appendix-aware, but appendices are still **absent from the section registry**: `bookRegistration.registerBook` iterates `bookData.chapters` only (`server/services/bookRegistration.js:181`) and never touches the separate `bookData.appendices` array, so `book_sections` has no `chapter_num=-1` rows. Consequently the DB-registry surfaces (sections API, localization-review, `books.html` section list, loc-editor, term suggestions) show no appendices, and two chapter-detail routes still `parseInt('appendices')→NaN`.

Because `registerBook` throws "already registered" (`bookRegistration.js:136`), fixing the registration code reaches only **future** registrations — the already-registered `efnafraedi-2e` needs its appendix rows **added** to the live `sessions.db` (a one-way prod data-op).

## Canonical form (unchanged from PR-1)

Appendices = integer `-1` in the DB and server memory; the word `'appendices'` only at on-disk dir names / CLI argv. Convert through `server/lib/chapterLabel.js` (`normalizeChapter`, `chapterDir`, `chapterFromDir`, `compareChapters`). `chapterDir(-1) → 'appendices'`.

## Data source (design-critical asymmetry — verified)

- **`book_sections` row needs:** `chapter_num=-1`, a `chapter_id` (from an inserted appendix chapter row), `section_num` (TEXT), `module_id`, `title_en`, and paths (`cnxml_path`, `en_md_path`).
- **New registration:** `bookData.appendices` = `[{id, title}]` (from `openstaxFetcher.js:390`, a **network** fetch at registration time — 13 entries for efnafraedi-2e). Has id + title, **no** section_num.
- **Backfill (existing book):** MUST NOT re-fetch (the `01-source` overwrite guard + it is networked). Sources appendix module ids from the committed `01-source/collection-order.json` `appendixModules` (a flat id list, e.g. `["m68859", …]` × 13) and titles from local `02-structure/appendices/*-structure.json` (or `NULL` if absent — parity with chapter rows, which insert `title_is=null`).

**Therefore:** the two callers derive their `sections` list from different (fetched vs. local) sources — this is correct and unavoidable. The **shared, load-bearing code path is the idempotent DB insert**, not the derivation.

## Approach

### 1. Registration (I14-R4 / I16-R3) — `bookRegistration.js`
After the `for (const chapter of bookData.chapters …)` loop, if `bookData.appendices?.length`:
- Insert one appendix chapter row via the existing `insertChapter` (`chapter_num=-1`, `title='Appendices'`, `titleIs='Viðaukar'`, `moduleCount=appendices.length`) → capture `chapterId`.
- Build `sections = bookData.appendices.map((a, i) => ({ module_id: a.id, section_num: <derived>, title_en: a.title }))`.
- Call `insertAppendixSections(db, { bookId, chapterId, sections })`.
- Fix the hardcoded `` const chapterDir = `ch${String(chapterNum).padStart(2,'0')}` `` at `:199` → use `chapterLabel.chapterDir(chapterNum)` so appendix rows get `01-source/appendices/…` / `02-for-mt/appendices/…` paths (not `ch-1`).

### 2. Shared `insertAppendixSections(db, { bookId, chapterId, sections })`
- One prepared insert into `book_sections`, **idempotent**: skip a section whose `(book_id, chapter_num=-1, module_id)` row already exists (a `SELECT` guard or `INSERT … WHERE NOT EXISTS`). Add-only — never updates/deletes existing rows (preserves status/assignments).
- Paths built via `chapterDir(-1)='appendices'`: `cnxml_path = 01-source/appendices/<module_id>.cnxml`, `en_md_path = 02-for-mt/appendices/<section_num-slug>.en.md` (mirror the chapter-row path convention at `bookRegistration.js:209-210`).
- Lives in `bookRegistration.js` (exported) so both the registration path and the backfill script call the same insert.

### 3. Backfill script — `scripts/backfill-appendix-sections.js`
- For each registered book (query `book_catalogue`/registration) that has a `books/<slug>/01-source/appendices` (or `02-for-mt/appendices`) dir but **no** `book_sections` rows with `chapter_num=-1`:
  - Ensure an appendix chapter row exists (insert if missing → `chapterId`).
  - Derive `sections` from local files: ids from `collection-order.json appendixModules`; `title_en` from `02-structure/appendices/<id>-structure.json` (or `NULL`); `section_num` derived from `appendixModules` order (same rule as registration).
  - Call the shared `insertAppendixSections`.
- **Flags:** dry-run by default (prints what it would insert), `--db` to actually write, `--book <slug>` to scope. **Fail-loud** on a book with an appendices dir but an unreadable `collection-order.json`. Mirrors `scripts/backfill-mt-locks.js`.

### 4. Consumer routes (deferred from PR-1, now unblocked)
- `server/routes/books.js:190` (`book.chapters.find(c => c.chapter === parseInt(chapter,10))`) and `server/routes/admin.js:497` (`book.chapters.find(c => c.chapterNum === chapterNum)`): adopt `normalizeChapter` so `'appendices'→-1` resolves against the now-present appendix chapter/section rows. Keep each route's existing non-appendix behavior.
  - **⚠️ Plan-time verification (design-relevant):** these two source `book.chapters` differently — `books.js:190` via `loadBookData(bookId)`, `admin.js:497` via `bookRegistration.getRegisteredBook(slug)`. The validator swap only works if that `chapters` collection actually **includes the appendix `-1` row** after backfill. If a source reads the disk `book-data.json` (where `appendices` is a **separate array**, not in `chapters[]`), the route needs the appendix looked up from `appendices`/the DB, not just a validator change. **Trace both sources first**; a route that validates `-1` then can't find it is the exact no-op trap PR-1 avoided by deferring these.
- `books.html` — dedup the `': '+title` suffix where an appendix row's title would otherwise double-render (I14-R4 note).

### 5. I14-R8 — E2E fixture
- Add an `appendices/` module to `books/__e2e-fixture__` (`02-for-mt/appendices/mNNNNN-segments.en.md` + an entry in the fixture's `collection-order.json appendixModules`, + `02-structure` if titles are asserted).
- `server/e2e/seed-fixture.js` registration then inserts appendix rows automatically → an E2E spec asserts the appendix chapter/section is registered and reachable. (Confirm how the fixture seeds registration during plan-writing.)

## section_num format (open plan-level detail)
`book_sections.section_num` is TEXT. For chapters it is `mod.section` or `` `${chapterNum}.${index}` ``. For appendices there is no fetched section number, so it must be **derived from `appendixModules` order** (1-based position or per-letter A…M). **Pin the exact format in writing-plans** by checking every consumer of `section_num` (sections-API display, sort order, any URL/slug use) so appendix rows sort correctly and display sanely. Do not guess — trace the consumers first.

## Testing
Root `npm test` (Vitest) is the authoritative gate.
- **Registration:** a unit test registering a synthetic book whose `bookData.appendices` is non-empty asserts `book_sections` gains `chapter_num=-1` rows with the right `module_id`/paths, and an appendix chapter row exists.
- **`insertAppendixSections` idempotency:** calling it twice inserts once; a second call with an existing row is a no-op (add-only) and never mutates an existing row's status.
- **Backfill script:** against a temp DB + temp book dir (appendices on disk, no `-1` rows), dry-run writes nothing; `--db` inserts the rows; a second `--db` run is a no-op. Fail-loud on a missing/unreadable `collection-order.json`.
- **Consumer routes:** `books.js:190` / `admin.js:497` return the appendix chapter detail (not 404) once rows exist; still reject `0`/junk; unchanged for numeric chapters.
- **E2E:** the fixture registration produces appendix rows; an appendix section is reachable through the registry surface.

## Out of scope
- The write-path publish enablement (PR-1's logged fail-closed) — a separate follow-up (`validate-chapter.js` arg-parsing + `validateBeforePublish` `cliChapterArg`).
- `tm.js:39` `/api/tm/export` appendix validator (logged follow-up).
- Re-rendering / vefur delivery (content, not this PR).

## Risks / constraints
- **Prod data-op:** the backfill is a one-way write to the live `sessions.db`. Add-only + dry-run-first + idempotent make it safe and repeatable; the lead runs it after deploy (like the mt-lock backfill). **Deploy still gated by A4.**
- **Fails-safe:** with no appendix rows, surfaces simply omit appendices (status quo). A bug in registration/backfill must at worst leave that state, never corrupt existing chapter rows — the add-only idempotent guard enforces this.
- **`registerBook` re-run:** unchanged — still throws "already registered". The backfill (not re-registration) is the path for existing books; this is deliberate (re-registration would destroy section status/assignments).
- **No behavior change for existing chapters** — the appendix logic is additive (new `-1` rows), gated on `bookData.appendices?.length`.
