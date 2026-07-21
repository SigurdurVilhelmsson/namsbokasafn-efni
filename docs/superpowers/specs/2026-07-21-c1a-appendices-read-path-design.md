# C1a — Appendices read-path adoption (design)

**Date:** 2026-07-21 · **Campaign item:** C1 (Appendices support batch) · **Register:** I14-R2, I14-R3
**Baseline:** main `ec07a267` · **Plan:** `docs/plans/2026-07-21-post-item17-followup-campaign.md`

## Problem

Appendices (`chapters/appendices/`, canonical chapter `-1`) already flow through
**extract → MT → render(mt-preview)** — 13 rendered mt-preview HTMLs exist for
`efnafraedi-2e`, and #321/#322 just fixed their labels. What does **not** work is the
**editorial/status read-path**: inline chapter validators reject `appendices`, and
directory scans that filter `d.startsWith('ch')` drop it. So appendix status never appears
on dashboards, `/sections` 400s, publication-readiness 400s, and `npm run validate` never
checks `chapters/appendices/status.json`.

The whole batch (C1) also includes registration (I14-R4/I16-R3), the E2E fixture (I14-R8),
and a prod backfill. Those are a **separate risk class** (new registration logic + a
data-model change + a prod-DB write, deploy/QA-gated). This spec covers **only PR-1**: the
low-risk, self-contained read-path adoption. Registration is **PR-2**, deferred.

## Canonical form (already settled — do not re-litigate)

`server/lib/chapterLabel.js` is item-14's canonical converter and states the contract:

> Server memory and every DB column carry the **NUMBER `-1`** for the appendices chapter.
> The **WORD `'appendices'`** exists at exactly two boundaries: on-disk directory names and
> CLI `--chapter` argv. Conversion happens only at those boundaries, through this module.

It exports `normalizeChapter(value) → int|null` (`'appendices'|'-1'|-1 → -1`, `'3'|3 → 3`,
junk → `null`) and `chapterDir(n) → 'appendices'|'chNN'`. The module is CommonJS
(`module.exports`), require-able from routes. **Bounds are each caller's policy** — the
module deliberately does not enforce a valid-set, because chapter 0 (`ch00`/front-matter) is
real for some routes and not others.

## Approach — adopt, do not invent

Route the inline chapter-dialect handling through `chapterLabel.js`, applying **each route's
own valid-set**. Two mechanical patterns:

### Pattern R2 — validators

```
// before
const chapter = parseInt(chapterNum, 10);
if (isNaN(chapter) || chapter < 1 || chapter > 99) return res.status(400)...
// after
const chapter = normalizeChapter(chapterNum);
if (chapter === null || !ROUTE_ACCEPTS(chapter)) return res.status(400)...
// where ROUTE_ACCEPTS additionally allows -1, and PRESERVES the route's existing
// handling of 0 (do not start accepting or rejecting 0 differently than today).
```

**Hard rule (advisor):** do **not** swap sites onto `middleware/validateParams.validateBookChapter`.
That validator rejects `0`, so blanket adoption would silently change which chapters
`0`-accepting routes serve. Use `normalizeChapter` + the route's real bounds.

**Validator ∧ handler rule (correctness-critical):** accepting `-1` at the validator is
*necessary but not sufficient*. Every downstream path the same handler builds as
`` `ch${String(n).padStart(2,'0')}` `` yields `ch-1` for appendices. The plan MUST trace
each PR-1 handler's path construction and switch any such site to `chapterDir(n)`
(`-1 → 'appendices'`). A validator that accepts `-1` while its handler builds `ch-1` is a
worse bug than the current clean 400.

### Pattern R3 — directory scans

```
// before
fs.readdirSync(dir).filter((d) => d.startsWith('ch'))
  ... parseInt(d.replace('ch', ''), 10)          // NaN for 'appendices' → dropped
// after
fs.readdirSync(dir).filter((d) => d.startsWith('ch') || d === 'appendices')
  ... normalizeChapter(d)                          // 'appendices' → -1
// sort comparators: order -1 LAST (mirror tools/lib/update-translation-errors.js)
```

`server/services/pipelineService.js` already uses the `chapter === 'appendices' ? -1 : …`
idiom at `:702/:735/:757`; `checkBookDownstreamWork` (`:663`) just predates it — the fix
makes one function consistent with its own file.

## Site inventory (PR-1)

### ✅ In PR-1 — read-path, appendix-relevant, self-contained

**R2 validators:**
- `server/routes/publication.js` `validateChapterParams` (`:37`, currently `parseInt` + `<1||>99`)
  → gates `/status`, `/readiness`, `/modules`, `/publish`. Accept `-1`.
- `server/routes/publication.js` `/modules`-list ch-scan (`:320`, `dir.match(/^ch(\d{2})$/)`)
  → also detect the `appendices` dir so the chapter list includes it.
- `server/routes/status.js:1286` `GET /:book/:chapter/sections` (`<1` reject; handler builds
  `ch${NN}` at `:1296` + bare `${NN}` at `:1300` inline). Accept `-1`; both dir forms become
  `appendices` via the `=== -1 ? 'appendices'` idiom.
- `server/routes/books.js:484` `GET /:book/chapters/:chapter/faithful-count`
  (`<1||>99`, then `padStart` → `chNN`). Accept `-1`; build dir via the `-1` idiom.
- **Service-layer (planning discovery):** `server/services/publicationService.js:54/306/410`
  build `ch${chapterStr}` and yield `ch-1` for appendices. The publication.js validator
  change is inert without adopting the `=== -1 ? 'appendices'` idiom here (the same idiom is
  already live in `status.js` `getStatusDataFromDb:63/82`).

**Deferred to PR-2 (planning discovery):**
- `server/routes/books.js:368` `/download` ZIP route: its `chPrefix`-vs-appendices dir build
  (`${chPrefix}${padStart}` → `chappendices`) is not a clean R2 swap, and it is a
  content-download convenience, not editorial read-path. Defer.

**Already appendix-aware from item-14 (excluded — verified by existing tests):**
`GET /:book/:chapter` chapter-status (`statusChapterRoute.test.js`), `editorial-progress`
(finding-17a test), admin assign/unassign editor↔chapter (`adminAssignAppendices.test.js`,
stores `-1`), and the segment-editor edit path (`validateBookChapter`). PR-1 is about the
remaining **visibility/status** laggards, not enabling appendix editing (which already works).

**R3 scans:**
- `server/routes/status.js` scan loops: `:148` (+ sort comparator `:150/151`), `:173`,
  `:630`, `:832`, `:1111`, `:1175`. (Also the sort at `:1103/1104`.)
- `server/services/pipelineService.js:663` `checkBookDownstreamWork`.
- `scripts/validate-status.js:245` (`npm run validate` → checks
  `chapters/appendices/status.json`).

### ⏭ Deferred to PR-2 — R4-coupled (resolve appendices against `book.chapters`, empty until registration)
- `server/routes/books.js:190` (`book.chapters.find(c => c.chapter === parseInt(...))`)
- `server/routes/admin.js:497` (`book.chapters.find(c => c.chapterNum === chapterNum)`)

Fixing their validators now yields a route that validates then 404s — a no-op fix. They
move with the registration work that actually populates appendix rows.

### ⏭ Deferred to PR-2 — write/file-mgmt-adjacent, inert until appendices are registered + reviewed
- `server/routes/books.js:213/248/276` (chapter-files GET/scan/DELETE)
- `server/routes/books.js:520` (file upload, HEAD_EDITOR)
- `server/routes/status.js:1855` (`POST /:book/:chapter/sync`, ADMIN)
- `server/routes/admin.js:975` (assignment removal)

## Testing

Root `npm test` (Vitest) is the authoritative gate (no branch protection; Playwright is out
of scope for PR-1). Per-pattern unit tests:

- **R2:** each touched validator (or a small extracted helper) accepts `'appendices'` and
  `'-1'` (→ handler sees `-1`), still 400s on junk (`'abc'`, `'99999'` out of the route's
  bound, `''`), **and a regression assert that `0` is handled exactly as before** for each
  route (rejected where it was rejected; there is no route in this set that accepted 0).
- **R3:** a scan over a fixture dir containing `ch01` + `appendices` includes both, maps
  `appendices → -1`, and orders `-1` last. Mutation-check the sort (a test that fails if the
  comparator drops the appendices-last rule).
- `chapterLabel.js` itself already has/deserves a unit test for `normalizeChapter` edge
  cases (`'-1'`, `'appendices'`, `' 3 '`, `'3x'`, `null`); add if missing.

## Out of scope (→ PR-2 / other campaign items)

- I14-R4 / I16-R3: `registerBook` iterating `bookData.appendices`; `book_sections`
  appendix rows; `books.html` `': '+title` dedup; the `bookRegistration.js:199`
  hardcoded `chNN` dir.
- I14-R8: appendices in `books/__e2e-fixture__` + `seed-fixture.js`.
- **Prod backfill:** `efnafraedi-2e` is already registered (`registerBook` throws
  "already registered", `bookRegistration.js:136`), so existing books need a backfill
  migration/script to gain appendix section rows. LEAD data-op, deploy/QA-gated.
- Render-side appendix-label leaks — already fixed (#321 element labels, #322 page title).

## Risks / constraints

- **Mid-QA deploy caveat:** PR-1 is server-touching, so it sits under the plan's
  "don't deploy server units mid-QA (A4)" note. PR-1 changes no data and no on-disk output,
  so merging is safe; only the *deploy* is gated.
- **Fails safe today:** every site currently rejects/skips appendices (no corruption). PR-1
  only widens acceptance; a bug would at worst keep the status-quo rejection, never corrupt.
- **No behavior change for existing chapters** is a required invariant — the ch0/1..N
  regression tests exist to prove it.
