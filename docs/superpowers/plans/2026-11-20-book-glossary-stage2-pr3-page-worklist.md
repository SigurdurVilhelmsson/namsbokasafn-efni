# Book glossary layer, stage 2, PR 3: the head editor's page and the worklist — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A head editor (or an admin) opens `/book-glossary`, looks up a headword, changes the book's glossary layer
through PR 2's routes, and after a replacement, a change or a removal sees the worklist: the segments whose English
holds the headword and whose effective Icelandic still holds a form of the old word, each linked into the editor.

**Architecture:** Pure text rules (`server/lib/worklistMatch.js`) decide what counts as a hit, and
`server/lib/worklistSpec.js` derives what to search for from one history row; neither imports a service. A service
(`server/services/bookGlossaryWorklist.js`) scans every study unit with `buildEffectiveSegments`; one read-only
route exposes it. A UMD helper in `server/public/js/` holds the
labels and pure view rules that both the page and the server use. The page is an HTML view plus one script, built
with `textContent` only. No new write route, no migration, no stored state.

**Tech Stack:** Node 22, CommonJS server (`server/`), Express, better-sqlite3 (server tree only), Vitest,
Playwright (CI's `e2e` job), vanilla browser JS.

**Spec:** [`docs/superpowers/specs/2026-11-20-book-glossary-stage2-design.md`](../specs/2026-11-20-book-glossary-stage2-design.md)
§5.3 (the page), §5.5 (the worklist), the `GET /worklist` row of §5.2, the page and worklist lines of §5.9, §5.10
PR 3, and its `✏️ AMENDED 2026-11-20` block (multi-line reasons are collapsed by the route, so the page may use a
textarea). Register §C243's five "For PR 3's page" items (Q8 below). It builds on PR 1 (#747) and PR 2 (#749); PR 2's
plan rulings P1–P10 and build rulings R1–R24 stand
([plan](2026-11-20-book-glossary-stage2-pr2-write-api.md),
[rulings](../specs/2026-11-20-book-glossary-stage2-pr2-build-rulings.md)).

**Branch.** Commit this plan on `docs/book-glossary-stage2-pr3-plan` (cut from `main`), and cut
`feat/book-glossary-stage2-page` from it, so the PR carries its plan as PR 1 and PR 2 did. PR 3 touches no export,
schema or cron path, so its only deploy-order constraint is that PR 2 deploys first (design §5.10).

## Global Constraints

- `server/` is CommonJS. Server test files `import` vitest and node builtins and load server modules with
  `createRequire(import.meta.url)` (header of `server/__tests__/importConcepts.test.js`). Route tests follow
  `server/__tests__/bookGlossaryRoutes.test.js`: `SESSIONS_DB_PATH` set before any server `require`,
  `runAllMigrations()`, tokens from `createToken`.
- 🔴 **`buildEffectiveSegments` takes no `db`.** It reads edits through `segmentEditorService`'s own connection
  (path fixed from `resolveDbPath()` when that module loads; seam `_setTestDb`) and text through
  `segmentParser.BOOKS_DIR` (seam `_setTestBooksDir`). A test that reaches it must either set `SESSIONS_DB_PATH`
  before any server `require` or inject **both** seams. Otherwise it reads the developer's real `sessions.db`. So
  only `server/services/bookGlossaryWorklist.js` may require `segmentEditorService`; the two `lib/` modules must not,
  which keeps Tasks 1–2's `freshMigratedDb` tests out of that module graph (§C243 already records a test that opened
  the default database path).
- The worklist is read-only and stores nothing (design §5.5). It reads `book_glossary_change`,
  `book_glossary_exclusion`, `concept_term` and, through `buildEffectiveSegments`, `segment_edits`. A history row is
  read by `id AND book_id`.
- 🔴 **The page never inserts a server-supplied value as HTML.** Reasons, sources, Icelandic terms, names, excerpts
  of editors' text and error messages are set with `textContent` or `document.createElement`. CSP allows inline
  script (`server/index.js`), so this is the only control. The only permitted `innerHTML` is `= ''`.
- New user-facing strings are Icelandic. Page copy goes in a `bookGlossary` section of
  `server/public/js/ui-strings.js` (the project's string file). Labels the server also needs live in
  `server/public/js/book-glossary-view.js` (UMD: browser global `bookGlossaryView` plus `module.exports`, like
  `segment-validation.js`), because `ui-strings.js` cannot be `require`d.
- Mutations stay POST through PR 2's routes; PR 3 adds only `GET /:book/worklist`.
- Worklist tests key on segment ids, never on prose (CLAUDE.md: prose cannot identify an element).
- Tests never read the licensed BÍN file (`tools/data/SHsnid.csv`). Stored inflection lists **omit the base form**
  (`server/lib/binInflections.js` header: "the base form is removed").
- After a route is added, run `npm run docs:generate` and commit what it changes (`docs/_generated/routes.md`, README
  marker sections); `npm run docs:check` must pass (PR 2's Documentation Check failed on exactly this).
- All new code is under `server/` (AGPL). Nothing under `tools/` or `scripts/` may require it (root `LICENSE`, E-2).
- Run tests from the repo root: `npx vitest run <file>`. The floor is `npm test`, `npm run lint`,
  `npm run format:check`; E2E is `cd server && npm run test:e2e -- book-glossary.spec.js` locally (needs Playwright's
  chromium) and CI's `e2e` job. No document records a test count or a CI verdict.
- Measured (design §3): `buildEffectiveSegments` over chemistry's 170 study units takes about 0.24 s, so the scan runs
  synchronously on request.

## Plan rulings (choices this plan makes on [USER]'s behalf)

✅ **Confirmed by [USER] on 2026-11-20, Q1–Q13 as written.** Each extends the frozen design where it is silent. Freeze them, with the build's own rulings, in a build-rulings file
at the end.

- **Q1 — a replacement's old words come from the book's current exclusion rows.** For an `entry-add` with a
  non-empty `after.replaces`, the old words are the `icelandic` column of this book's single-concept exclusions whose
  `concept_id` is in `replaces` and whose `match_key` is one of the entry's forms' keys (the snapshot stage 1 stores
  at writing, design §5.5), with that concept's `is` inflections where its `is` term still has that text. A replaced
  concept whose exclusion has since been undone contributes nothing: design §5.1 says the entry then "becomes an add",
  and an add has no worklist (call 10). None left → `kind: null, reason: 'exclusion-undone'`. Exclusions present but
  every `icelandic` snapshot null (the concept had no Icelandic term) → `nothing-to-search`. *Cost if wrong:* after
  an undo the head editor stops seeing that word's segments.
- **Q2 — a change has a worklist only when its Icelandic changed** (`before.icelandic !== after.icelandic`); a
  forms-only change answers `reason: 'no-new-word'`. Its English forms are `after.english`. *Cost if wrong:* a
  forms-only change shows no list.
- **Q3 — the Icelandic searched is each old word's `[icelandic, ...inflections]`, minus the new Icelandic**
  (compared case-insensitively). The base form is always searched because stored lists omit it, as the editor's own
  `buildInflectionRegex` does. When the new Icelandic equals an old word's base form, that old word is dropped
  whole, inflections included, since it is still the right word; nothing left → `nothing-to-search`. A removal
  subtracts nothing (it has no new word). *Cost if wrong:* none known; without it the nominative *ker* is missed once
  *keri* is known, and a list whose old forms include the still-correct word never shrinks.
- **Q4 — a unit that cannot be read is named, never fatal.** The scan skips it and lists it in `unreadable`; a book
  with no `02-for-mt/` scans 0 units. *Cost if wrong:* a partial list, said so on the page.
- **Q5 — `GET /worklist` answers 404 for a change id that is not this book's**, with `MESSAGES['not-found']` and
  `refusal: 'not-found'`. (PR 2's write routes answer refusals with 409; this is a read.)
- **Q6 — `GET /history` rows gain `worklist: boolean`**, computed by the same `worklistSpec` the worklist route uses,
  so the page offers the button exactly where the route answers with a list.
- **Q7 — removing an entry offers its claimed exclusions, each checked by default** (call 2: "so the shared word can
  come back in one step").
- **Q8 — §C243's five page items are taken into PR 3:** (T3) exclusions no entry claims are listed on their own
  (`claimedBy`); (R8) an `unchanged` answer to a forms change shows a hint that capitalisation changes need remove and
  re-add; (M9) `exact-only` with no recorded lookup gets its own label beside the retry button; (T6) the lookup's
  activity text uses the Icelandic result labels; (T7) the `forms` and `pending` states and `historyFor`'s `before`
  side get tests. The rest of §C243 stays parked.
- **Q9 — excerpts are 60 characters each side of the match**, sent as text plus offsets, never HTML.
- **Q10 — the E2E seeds its own concept, `salt bridge → saltbrú` (chemistry).** Measured 2026-11-20 on the real
  tree: 14 chemistry EN segments hold *salt bridge*, 12 of them with *saltbrú* whole-word in the served Icelandic,
  none in the modules other specs open (`m68663`, `m68664`, `m68667`, `m68684`, `m68693`); the first is ch17 `m68822`,
  segment `m68822:para:fs-idm196674112`. No E2E spec counts concepts.
- **Q11 — the page honours `?book=<slug>`** when the user holds that book, so a link can open it on one book.
- **Q12 — the menu link is *Orðasafn bókar*, in the Stjórnun section** beside *Úthlutanir*. That section is already
  shown to admins and head editors only, so no new visibility code is needed.
- **Q13 — a held book with no `glossary/` directory is shown read-only.** `GET /` gains `writable` (the routes' own
  `hasGlossaryDir`); when it is false the page offers no action and says *Bókin hefur enga glossary-möppu; orðasafni
  hennar verður ekki breytt hér.* (design call 3; the E2E head editor holds such a book). *Cost if wrong:* none; the
  routes still refuse with 409.

## Review Focus

1. **An editor's text, a reason, a source or an Icelandic term holding markup** (`<img src=x onerror=…>`) must
   render as text. → Task 5, E2E test `markup in the layer, the history and the worklist renders as text`; the
   static test `book-glossary.js uses no HTML sink` is a second line, not the pin.
2. **A segment holding only the old word's base form, while its inflections are known**, must be listed. → Task 3,
   test `a segment holding only the base form is listed while inflections are known`.
3. **Another book's change id** must reveal nothing. → Task 3, test `GET /worklist answers 404 for another book's
   change id and 400 for a bad one`.
4. **A unit whose files cannot be parsed** must not hide the rest of the list. → Task 3, test `an unreadable unit is
   named and the other units are still listed`.
5. **A replacement whose exclusion was undone** must not read as "all fixed". → Task 2, test `a replacement whose
   exclusion was undone has no worklist`; Task 4, test `worklistSummary gives each empty state its own sentence`.

---

### Task 1: The worklist's text rules

**Files:**
- Create: `server/lib/worklistMatch.js`
- Create: `server/__tests__/worklistMatch.test.js`

**Interfaces:**
- Consumes: `isWholeWordAt(text, begin, end)` (`server/lib/wordBoundary.js`), `isSymbolShaped(text)`
  (`server/lib/conceptMatcher.js`).
- Produces:
  - `findWholeWord(text: string, words: string[], {exactCase: boolean}) → {index: number, length: number} | null` —
    the earliest whole-word occurrence of any word (ties: the longer). Case folds through the regex `iu` flags (each
    word escaped), never `toLowerCase()`, which is not length-stable. Overlapping candidates are tried
    (`lastIndex = index + 1`). Empty words are skipped.
  - `englishHit(enText: string, forms: string[]) → string | null` — the first form found, each searched with
    `exactCase: isSymbolShaped(form)` (design §5.5: the matcher's rule).
  - `matchSegment({enContent, isContent}, {english: string[], oldForms: string[]}) → null | {english: string, index:
    number, length: number}` — both sides must hit; `index`/`length` locate the Icelandic hit in `isContent`.
  - `excerptOf(text: string, index: number, length: number, radius = 60) → {text: string, start: number, length:
    number, cutBefore: boolean, cutAfter: boolean}` — `start` is the match's offset inside the excerpt's `text`.

- [ ] **Step 1: Write the failing tests:**
  - `ker is not found inside kerfi or kerspenna` → `findWholeWord('Í kerfinu og kerspennu', ['ker'], {exactCase:
    false})` is `null`.
  - `case folds, Icelandic letters included` → `findWholeWord('Kerið er fullt', ['kerið'], …)` is `{index: 0,
    length: 5}`; `findWholeWord('ÞRÝSTINGUR', ['þrýstingur'], …)` is `{index: 0, length: 10}`.
  - `a bracket marker is a boundary` → `findWholeWord('[[i:ker]] og', ['ker'], …).index === 4`.
  - `the earliest hit wins across words` → `findWholeWord('keri og ker', ['ker', 'keri'], …)` is `{index: 0, length:
    4}`.
  - `a symbol-shaped form matches its own case only` → `englishHit('Si is silicon', ['SI'])` is `null`;
    `englishHit('the SI unit', ['SI'])` is `'SI'`; `englishHit('A Salt bridge forms', ['salt bridge'])` is
    `'salt bridge'`.
  - `matchSegment needs both sides` → English hit with no Icelandic hit is `null`; with both, `{english, index,
    length}` locates the Icelandic word.
  - `excerptOf keeps the match offset and says where it cut` → on a 300-character text with a match at 150,
    `e.text.slice(e.start, e.start + e.length)` equals the match and both flags are `true`; on a 20-character text
    both are `false` and `e.text` is the whole text.
- [ ] **Step 2: Run** `npx vitest run server/__tests__/worklistMatch.test.js` — expected FAIL (module missing).
- [ ] **Step 3: Implement** the four functions.
- [ ] **Step 4: Run** the file — expected PASS.
- [ ] **Step 5: Commit** `feat(glossary-layer): the worklist's whole-word text rules`.

### Task 2: What a history row asks the worklist to find

**Files:**
- Create: `server/lib/worklistSpec.js` (`readChange`, `worklistSpec`; requires no service)
- Create: `server/__tests__/worklistSpec.test.js`

**Interfaces:**
- Consumes: `matchKey` (`server/lib/conceptResolver.js`); PR 2's write API to create history rows in tests.
- Produces:
  - `readChange(db, bookSlug: string, changeId: number) → {id, action, before: object|null, after: object|null} |
    null` — `WHERE id = ? AND book_id = <the book's id>`; JSON parsed.
  - `worklistSpec(db, bookSlug: string, row: {action, before, after}) → {kind: 'replacement'|'change'|'removal'|null,
    reason: null|'not-applicable'|'add-alongside'|'no-new-word'|'exclusion-undone'|'nothing-to-search', english:
    string[], old: Array<{icelandic: string, inflected: boolean}>, oldForms: string[], newIcelandic: string|null}` —
    - `exclude`/`unexclude` → `not-applicable`.
    - `entry-add`, empty `after.replaces` → `add-alongside`; otherwise `replacement` per Q1 (`english` =
      `after.english`, `newIcelandic` = `after.icelandic`).
    - `entry-change` → Q2 (`english` = `after.english`; old = `before.icelandic` with `before.inflections`).
    - `entry-remove` → `removal` (`english` = `before.english`; old = `before.icelandic` with `before.inflections`;
      `newIcelandic: null`). No forms or no Icelandic → `nothing-to-search`.
    - `oldForms` per Q3, deduplicated. `inflected` says whether an inflection list was known.
    - When `kind` is null, `english`, `old` and `oldForms` are `[]`.

- [ ] **Step 1: Write the failing tests** (`freshMigratedDb()`; seed concepts as `bookGlossaryOperations.test.js`
  does, with `z`-prefixed words):
  - `a replacement searches the replaced concept's word, base form included` → a chemistry concept `zcell`/`zker`
    whose `is` row holds `inflections = '["zkeri","zkersins"]'`; `addEntry` replacing it with `zrafhlada` →
    `kind: 'replacement'`, `english: ['zcell']`, `[...oldForms].sort()` equals `['zker', 'zkeri', 'zkersins']`,
    `old[0].inflected === true`, `newIcelandic: 'zrafhlada'`.
  - `an add alongside has no worklist` → `reason: 'add-alongside'`.
  - `a replacement whose exclusion was undone has no worklist` (Review Focus 5) → after `removeExclusion` of that
    exclusion: `kind: null`, `reason: 'exclusion-undone'`.
  - `a change of Icelandic searches the old word kept in before_json` → `changeEntry` from `zfoo` (inflections
    `'["zfoos"]'`) to `zbar` → `kind: 'change'`, `oldForms` holds `zfoo` and `zfoos`, `english` equals the entry's
    forms after the change.
  - `a forms-only change has no worklist` → `reason: 'no-new-word'`.
  - `a removal searches the entry's own word` → `removeEntry` → `kind: 'removal'`, `english` equals the removed
    forms, `oldForms` holds the entry's Icelandic and its inflections.
  - `the new Icelandic is never an old form` → replaced concept's inflections `'["zkeri","znyr"]'`, new Icelandic
    `ZNYR` → `oldForms` holds no case variant of `znyr`.
  - `a new word equal to an old word's base form drops that old word whole` (Q3) → a change from `zker` (inflections
    `'["zkeri"]'`) to `Zker` → `kind: null`, `reason: 'nothing-to-search'`.
  - `exclusions whose Icelandic snapshot is null leave nothing to search` (Q1) → a replaced concept with no `is`
    term → `reason: 'nothing-to-search'`, not `exclusion-undone`.
  - `exclude and unexclude rows have no worklist` → `not-applicable` for both.
  - `readChange does not read another book's row` → a row written for `edlisfraedi-2e`, read as `efnafraedi-2e`,
    is `null`.
- [ ] **Step 2: Run** `npx vitest run server/__tests__/worklistSpec.test.js` — expected FAIL.
- [ ] **Step 3: Implement** `readChange` and `worklistSpec`.
- [ ] **Step 4: Run** the file plus `server/__tests__/bookGlossaryOperations.test.js` — expected PASS.
- [ ] **Step 5: Commit** `feat(glossary-layer): derive a worklist's search from one history row`.

### Task 3: The scan, `GET /worklist`, and the history flag

**Files:**
- Create: `server/services/bookGlossaryWorklist.js` (`buildWorklist`; the one module that requires
  `segmentEditorService`)
- Modify: `server/routes/book-glossary.js` (`GET /:book/worklist`; `GET /:book/history` adds `worklist`)
- Modify: `server/__tests__/bookGlossaryRoutes.test.js` (new describes; add `segment_edits` to its cleanup)
- Modify: `docs/_generated/routes.md` (and README marker sections) via `npm run docs:generate`

**Interfaces:**
- Consumes: Task 1, Task 2; `listStudyUnits({book, booksDir})` (`server/lib/studyUnits.js`, the unit list the
  freeze and G-1g use) with `segmentParser.BOOKS_DIR`; `segmentEditorService.buildEffectiveSegments(book, chapter,
  moduleId)`.
- Produces:
  - `buildWorklist(db, bookSlug, changeId) → null | {changeId, action, kind, reason, english, old, newIcelandic,
    units: number, unreadable: string[], chapters: Array<{chapter: number, items: Array<{moduleId, segmentId,
    english, excerpt, link}>}>, total: number}` — `null` when `readChange` finds nothing. When `kind` is null it
    scans nothing (`units: 0`, `chapters: []`, `total: 0`). Otherwise every unit in `listStudyUnits` order (an
    `ENOENT` for the book's `02-for-mt/` → no units), segments in module order; a unit whose
    `buildEffectiveSegments` throws is added to `unreadable` by its `unit` label (`chNN/mNNNNN`) (Q4). `excerpt` is
    `excerptOf(isContent, index, length)`; `link` is
    `/editor?book=<slug>&chapter=<chapter>&module=<moduleId>&segment=<encodeURIComponent(segmentId)>` (the editor
    reads all four and `jumpToSegment` takes the full id). Chapters with no item are omitted; `-1` is appendices.
  - `GET /:book/worklist?changeId=` (read guard) → 200 `buildWorklist(...)`; a missing or non-integer `changeId` →
    400 `{error: 'Ógilt gildi: changeId'}`; `null` → 404 `{error: MESSAGES['not-found'], refusal: 'not-found'}`
    (Q5); anything thrown → 500 through `serverError`.
  - `GET /:book/history` → each row also carries `worklist: worklistSpec(db, book, row).kind !== null` (Q6).

- [ ] **Step 1: Write the failing tests.** In a `beforeAll` of the new describe, write under the test's `booksRoot`:
  `efnafraedi-2e/02-for-mt/ch01/m00001-segments.en.md` and `02-mt-output/ch01/m00001-segments.is.md` (three
  segments: `m00001:para:p1` EN `The zcell is full.` / IS `Zkerið er fullt.`; `m00001:para:p2` EN `A zcell.` / IS
  `Eitt zker.`; `m00001:para:p3` EN `No match here.` / IS `zker`), a second unit `ch02/m00002` with one matching
  segment, and a third unit `ch03/m00003` (an EN file with one matching segment, so `listStudyUnits` lists it) whose
  `02-structure/ch03/m00003-structure.json` holds `{` (unparseable). Markers are `<!-- SEG:m00001:para:p1 -->` with
  no space after the colon (CLAUDE.md). ⚠️ The file's top-level `beforeEach` empties the layer and concept tables
  before every test, so seed in the describe's own `beforeEach`: `zcell`/`zker` with inflections
  `'["zkerið","zkersins"]'`, replaced through `POST /entries`.
  - `GET /worklist lists matching segments by id, grouped by chapter, with editor links` → chapter 1 holds
    `m00001:para:p1` and `m00001:para:p2`, not `p3` (its English lacks the form); chapter 2 holds its segment; the
    `p1` item's `link` parses (`new URL(link, base).searchParams`) to `book`, `chapter=1`, `module=m00001`,
    `segment=m00001:para:p1`; `excerpt.text.slice(excerpt.start, excerpt.start + excerpt.length)` is `Zkerið`.
  - `a segment holding only the base form is listed while inflections are known` (Review Focus 2) → `p2` (`zker`,
    absent from the stored list) is listed.
  - `a live edit that removed the old word drops the segment` → with the positive control first (`p1` listed), insert
    a `segment_edits` row (`status 'pending'`, `edited_content 'Rafhlaðan er full.'`) for `p1`; the next request
    does not list `p1` and still lists `p2`.
  - `an unreadable unit is named and the other units are still listed` (Review Focus 4) → `unreadable` equals
    `['ch03/m00003']`, chapters 1 and 2 are present.
  - `a book with no 02-for-mt scans no units` → with `segmentParser._setTestBooksDir` pointed at an empty directory
    for the request (restored after): `units: 0`, `kind: 'replacement'`, `total: 0`.
  - `an add alongside answers its reason and scans nothing` → `kind: null`, `reason: 'add-alongside'`, `units: 0`.
  - `GET /worklist answers 404 for another book's change id and 400 for a bad one` (Review Focus 3) → a change id of
    `edlisfraedi-2e` (written with the write API) → 404 `{refusal: 'not-found'}`; `changeId=abc` and `changeId=0` →
    400; an editor's cookie → 403.
  - `GET /history marks the rows that have a worklist` → after the replacement, the `entry-add` row has
    `worklist: true` and its `exclude` row `worklist: false`.
- [ ] **Step 2: Run** `npx vitest run server/__tests__/bookGlossaryRoutes.test.js` — expected FAIL on the new tests.
- [ ] **Step 3: Implement** `buildWorklist`, the route and the history flag.
- [ ] **Step 4: Run** the file plus `server/__tests__/worklistSpec.test.js` — expected PASS. Then
  `npm run docs:generate` and `npm run docs:check`
  — expected the routes inventory gains `GET /api/book-glossary/:book/worklist` and the check passes.
- [ ] **Step 5: Commit** `feat(glossary-layer): GET /worklist scans the book's units for the old word` (route,
  service, tests, generated docs).

### Task 4: The page's read model and the shared labels

**Files:**
- Create: `server/public/js/book-glossary-view.js`
- Create: `server/__tests__/bookGlossaryView.test.js`
- Modify: `server/services/bookGlossaryService.js` (`listLayer`: `claimedBy`)
- Modify: `server/routes/book-glossary.js` (`GET /:book` adds `writable`, Q13)
- Modify: `server/services/bookGlossaryInflections.js` (the activity description, §C243 T6)
- Modify: `server/__tests__/bookGlossaryRoutes.test.js`, `server/__tests__/bookGlossaryInflections.test.js`,
  `server/__tests__/bookGlossaryOperations.test.js`

**Interfaces:**
- Consumes: `RESULTS` (`bookGlossaryInflections.js`); Task 3's worklist shape.
- Produces (`book-glossary-view.js`, pure, no DOM):
  - `INFLECTION_RESULT_LABELS` — keys exactly `RESULTS`. Values: `forms` *beygingarmyndir skráðar* · `not-in-bin`
    *ekki í BÍN* · `ambiguous` *tvíræð í BÍN* · `base-form-only` *BÍN gefur aðeins grunnmyndina* · `several-words`
    *fleiri en eitt orð* · `file-absent` *BÍN-skráin er ekki á þjóninum* · `already` *beygingar þegar skráðar* ·
    `superseded` *orðinu var breytt meðan leitað var* · `no-term` *engin íslensk þýðing* · `timeout` *leitin rann út
    á tíma* · `error` *villa í leit*.
  - `inflectionLabel(state) → string` — `{state: 'forms', count: n}` → `` `${n} beygingarmyndir` ``; `{state:
    'pending'}` → *sæki…*; `{state: 'exact-only', reason: null}` → *aðeins rithátturinn — engin leit skráð (t.d.
    eftir endurræsingu)* (§C243 M9); with a reason → `` `aðeins rithátturinn — ${INFLECTION_RESULT_LABELS[reason]}` ``.
  - `editorOnlyForms(forms: string[]) → string[]` — forms of three or more whitespace-separated words (design §5.3,
    S1 §5.3).
  - `actionLabel(action) → string` — `exclude` *Útilokað* · `unexclude` *Útilokun afturkölluð* · `entry-add`
    *Færsla bætt við* · `entry-change` *Færslu breytt* · `entry-remove` *Færsla fjarlægð*.
  - `excerptParts(excerpt) → {before: string, match: string, after: string}` — `…` prepended/appended where cut.
  - `worklistSummary(w) → string` — checked in this order: `kind` null, by `reason`: `not-applicable` *Þessi
    breyting hefur engan verkefnalista.* · `add-alongside` *Þýðingu var bætt við til hliðar; gamla orðið er áfram
    leyfilegt.* · `no-new-word` *Íslenska orðinu var ekki breytt.* · `exclusion-undone` *Útilokun gamla orðsins var
    afturkölluð; það er aftur leyfilegt.* · `nothing-to-search` *Ekkert er til að leita að.*; then `units === 0`
    *Bókin hefur engar einingar til að leita í.*; then `total === 0` *Enginn bútur notar lengur gamla orðið.*; else
    `` `${total} bútar nota enn gamla orðið.` ``
  - `unreadableNote(w) → string | null` — `` `Ekki tókst að lesa ${n} einingar (${list}); þær voru ekki skoðaðar.` ``
    when `unreadable` is non-empty.
- Produces (`listLayer`): each exclusion gains `claimedBy: number | null` — the `conceptId` of the book entry one of
  whose forms has the exclusion's match key, for a single-concept exclusion; `null` for a whole-headword exclusion or
  one no entry claims (§C243 T3, build ruling R7).
- Produces (`GET /:book`): `{book, exclusions, entries, hold, writable: boolean}` — `writable` is
  `service.hasGlossaryDir(book)`, the predicate the write guard uses.
- Produces (`bookGlossaryInflections`): the activity description becomes
  `` `Beygingar orðasafns sóttar fyrir hugtak ${conceptId}: ${INFLECTION_RESULT_LABELS[result]}` `` (§C243 T6).

- [ ] **Step 1: Write the failing tests:**
  - `bookGlossaryView.test.js`: `the labels cover exactly the lookup's results` (sorted keys equal sorted `RESULTS`);
    `inflectionLabel` for `forms`, `pending`, `exact-only` with `null` and with each reason; `editorOnlyForms(['salt
    bridge', 'standard cell potential'])` is `['standard cell potential']`; `excerptParts` marks cuts;
    `worklistSummary gives each empty state its own sentence` (Review Focus 5: the five `kind: null` reasons,
    `units: 0` and `total: 0` give seven pairwise distinct strings); `unreadableNote` is `null` for `[]`.
  - routes: `GET / says which entry claims each exclusion` → an entry with forms `['zcell', 'zcell2']` replacing a
    concept that carries only `zcell`: its exclusion on `zcell` has `claimedBy` equal to the entry's `conceptId`;
    after `POST /entries/:id/change` with `forms: ['zcell2']`, that exclusion's `claimedBy` is `null`. `GET / reports pending and forms inflection states` (§C243 T7) → with a runner held open,
    `inflections` is `{state: 'pending'}`; after the `is` row's `inflections` is set to `'["a","b"]'`, it is
    `{state: 'forms', count: 2}`. `GET / answers with no export status file` (CI's and a fresh checkout's state;
    every PR 2 test writes `{}` first) → with `.glossary-export-status.json` deleted: 200 and `hold.held === false`.
    `GET / says whether the book can be changed` (Q13) → `writable: true` for `efnafraedi-2e`, `false` for
    `liffraedi-2e` (an admin's cookie; no `glossary/` in the test's books root).
  - inflections: `the activity text uses the Icelandic label` → after a `not-in-bin` result the `activity_log`
    description ends with *ekki í BÍN* and holds no `not-in-bin`.
  - operations: `historyFor finds a change by a form that only its before side carries` (§C243 T7, P10) → a
    `changeEntry` that removes form `zb`; `historyFor(db, BOOK, 'zb')` returns that row.
- [ ] **Step 2: Run** the four files — expected FAIL on the new tests.
- [ ] **Step 3: Implement** the helper, `claimedBy` and the description.
- [ ] **Step 4: Run** the four files — expected PASS.
- [ ] **Step 5: Commit** `feat(glossary-layer): the page's read model and shared labels (§C243 T3, T6, T7)`.

### Task 5: The page: view, menu, layer, history and worklist panels

**Files:**
- Modify: `server/routes/views.js` (`/book-glossary`, `requirePageAuth(ROLES.HEAD_EDITOR)`)
- Modify: `server/public/js/layout.js` (link in the Stjórnun section, Q12)
- Modify: `server/public/js/ui-strings.js` (`bookGlossary` section)
- Create: `server/views/book-glossary.html`, `server/public/js/book-glossary.js`
- Create: `server/__tests__/bookGlossaryPage.test.js`
- Create: `server/e2e/book-glossary.spec.js`
- Modify: `server/e2e/csp.spec.js` (`authenticatedPages`), `server/e2e/a4-coverage.spec.js` (its route list)

**Interfaces:**
- Consumes: `GET /api/book-glossary/:book`, `/history`, `/worklist`; Task 4's helper; `window.currentUser` /
  `userLoaded`, `bookSelector.fetchBooks()` and `bookSelector.populate(select, books)`, with the localization
  page's `booksHeld` rule (an admin holds every listed book; a head editor the listed books in `user.books`);
  `chapter-label.js` for chapter names.
- Produces (element ids the E2E spec and Task 6 rely on): `#bg-book-select` (no `book-select` class, as on the
  localization page), `#bg-hold-banner`, `#bg-layer` (entries `[data-concept-id]`, exclusions
  `[data-exclusion-id]`), `#bg-history`, `#bg-worklist` (rows `[data-segment-id]`, each with `a.bg-open`), and
  buttons carrying `data-action` (`history`, `worklist`, and Task 6's actions).
- The script: the scripts the localization view loads, in that order, then `book-glossary-view.js` and
  `book-glossary.js`. **No `innerHTML` except `= ''`** (Global Constraints).
- Page content (design §5.3):
  - **Hold banner**, shown only when `hold.held` (*⏸ Útflutningur orðasafns bíður forritara síðan {time}*) or
    `hold.recordError` (*⚠ Skrá orðasafnsins (book-glossary.json) var ekki skrifuð í síðustu keyrslu. Láttu
    forritara vita.*).
  - **Layer:** each entry with its forms, Icelandic, who, when, reason and source, `inflectionLabel`, a
    *Sækja beygingar* button (`data-action="retry-inflections"`, wired in Task 6) whenever the state is
    `exact-only`, a note for each `editorOnlyForms` form (*ⓘ Þrjú orð eða fleiri: nær til ritilsins, ekki
    útflutnings*), and its claimed exclusions nested under it. Then the exclusions with `claimedBy === null`,
    whole-headword ones marked *allt orðið*. A *Saga* button per row.
  - **BÍN credit**, below the layer whenever an entry is listed: *Beygingarmyndir: Beygingarlýsing íslensks
    nútímamáls (BÍN). Stofnun Árna Magnússonar í íslenskum fræðum. Höfundur og ritstjóri Kristín Bjarnadóttir.
    bin.arnastofnun.is — CC BY-SA 4.0. Myndunum er breytt: valið er úr þeim og grunnmyndin felld brott.* (the
    script header's credit, `server/scripts/fetch-bin-inflections.js`).
  - **History** (`GET /history?english=<first form or the exclusion's English>`): `actionLabel`, who, when, reason,
    source; a *Verkefnalisti* button where `worklist` is true.
  - **Worklist:** `worklistSummary`, `unreadableNote` when not null, the old and new words, then per chapter one row
    per item: module, segment id, the excerpt as text with the match in a `<mark>` element (from `excerptParts`), and
    *Opna* (`a.bg-open`, `href` = `link`).
  - `?book=` (Q11): selected after `populate` when held.
  - `writable: false` (Q13): the Q13 line is shown, and no `data-action` button other than `history` and `worklist`
    is rendered (Task 6 keeps to this for every action it adds).

- [ ] **Step 1: Write the failing tests:**
  - `bookGlossaryPage.test.js` (the views router mounted as in `localizationHeadEditorsOnly.test.js`,
    `redirect: 'manual'`): `an editor is sent to Heim` → `{status: 302, location: '/'}`; `a head editor and an
    admin get the page` → 200 and the body holds `book-glossary.js`.
  - Same file, the second line behind Review Focus 1: `book-glossary.js uses no HTML sink` → read the file with its
    `//` and `/* */` comments stripped; every match of `/innerHTML|outerHTML|insertAdjacentHTML|document\.write|
    createContextualFragment|DOMParser|srcdoc|setAttribute\(\s*['"]on/` is the text `innerHTML = ''`.
  - `book-glossary.spec.js`, `markup in the layer, the history and the worklist renders as text` (Review Focus 1;
    the pin) → as the head editor on `/book-glossary?book=efnafraedi-2e`, `page.route` fulfils three requests, each
    matched on the URL's pathname: `GET /api/book-glossary/efnafraedi-2e` with one entry whose `reason` and
    `icelandic` are `<img src=x onerror="window.__bg=1">`; its `/history` with one `entry-add` row carrying the same
    string as `reason` and `worklist: true`; its `/worklist` with one item whose excerpt text holds the same string.
    Click the entry's *Saga*, then the row's *Verkefnalisti*. Assert the literal string is visible as text in
    `#bg-layer`, `#bg-history` and `#bg-worklist`, and `await page.evaluate(() => window.__bg)` is `undefined`. This
    is also the *Saga → Verkefnalisti* path, the only way to an old change's worklist.
  - `book-glossary.spec.js`: `an editor is sent away from the page` → `loginAs(page, 'editor')`,
    `goto('/book-glossary')`, URL ends in `/`. `the hold banner shows only while the export is held` → as the head
    editor on `/book-glossary?book=efnafraedi-2e` (it holds two books), with
    `page.route` fulfilling exactly `GET /api/book-glossary/efnafraedi-2e` (match on the URL's pathname) with
    `{book, exclusions: [], entries: [], hold: {held: true, since: '2026-11-20T14:02:00Z', recordError: false}}`,
    `#bg-hold-banner` is visible; with `held: false` it is hidden. Never assert on the box's own status file or on
    inflection text (the BÍN file exists on some boxes). `a book with no glossary directory is read-only` → the same
    stub with `writable: false` and one entry whose `inflections` is `{state: 'exact-only', reason: null}`: the Q13
    line is visible and the entry has no `retry-inflections` button (with `writable: true`, the control, it has one).
    Task 6 adds `change-entry` and `remove-entry` to this assertion.
  - Add `{ path: '/book-glossary', name: 'book glossary' }` to `csp.spec.js` and `'/book-glossary'` to
    `a4-coverage.spec.js`'s route list.
- [ ] **Step 2: Run** `npx vitest run server/__tests__/bookGlossaryPage.test.js` — expected FAIL (no route).
- [ ] **Step 3: Implement** the route, the menu link, the strings, the view and the script's read-only parts.
- [ ] **Step 4: Run** the vitest file — expected PASS; `cd server && npm run test:e2e -- book-glossary.spec.js
  csp.spec.js a4-coverage.spec.js` — expected PASS (or leave to CI's `e2e` job where chromium is absent, and say so
  in the commit). `npm run docs:generate` then `npm run docs:check` — expected pass.
- [ ] **Step 5: Commit** `feat(glossary-layer): the book glossary page — layer, history and worklist panels`.

### Task 6: The page's actions, and the E2E round trip

**Files:**
- Modify: `server/public/js/book-glossary.js`, `server/views/book-glossary.html`, `server/public/js/ui-strings.js`
- Modify: `server/public/js/book-glossary-view.js`, `server/__tests__/bookGlossaryView.test.js`
- Modify: `server/e2e/seed-fixture.js` (Q10), `server/e2e/book-glossary.spec.js`

**Interfaces:**
- Consumes: PR 2's POST routes and their 400/409 shapes (`refusal`, `houseStyle` on `needs-confirm`), `GET /lookup`
  (`resolution` from `conceptResolver.resolve`: `winner {conceptId, termId, text, domain, position}|null`, `reason`
  (`'book-entry'` when the book's own entry wins), `alsoInScope`, `tied`, `outOfScope`; plus `layer`, `houseStyle`,
  `preferences`), Task 5's panels.
- Produces (`book-glossary-view.js`, pure):
  - `formsFromText(text: string) → string[]` — one form per line, trimmed, blank lines dropped, exact duplicates
    dropped, order kept.
  - `changeBody(entry: {english: string[], icelandic: string}, edited: {icelandic: string, forms: string[]}) →
    {icelandic?: string, forms?: string[]} | null` — only the fields that differ (forms compared as sets of exact
    strings); `null` when nothing differs, and the page then sends nothing.
  - `replaceCandidates(resolution) → Array<{conceptId, text, domain, checked: boolean}>` — the winner (checked),
    then `tied` and `alsoInScope` (unchecked), deduplicated by `conceptId`; empty when `reason === 'book-entry'`
    (the book's own entry is changed, not replaced).
- Produces (DOM): `#bg-lookup-input`, `#bg-lookup-button`, `#bg-lookup-result`; one action dialog
  `#bg-action-dialog` with `#bg-reason` (textarea, required), `#bg-source`, the public notice, `#bg-submit`,
  `#bg-action-error`, and `#bg-confirm-house-style`; per action: `#bg-icelandic`, `#bg-forms` (textarea),
  `input[name="bg-mode"]` (`replace`/`add`), `input[name="bg-replaces"]`, `input[name="bg-undo"]`. Buttons
  `data-action`: `set-icelandic`, `exclude-headword`, `exclude-row` (with `data-concept-id`), `undo-exclusion`,
  `change-entry`, `remove-entry`, `retry-inflections`.
- Behaviour (design §5.3):
  - **Look up** shows the winner (text, domain, *bókin sjálf* when `reason === 'book-entry'`), the other in-scope
    answers, out-of-scope suggestions, a house-style mark naming each `houseStyle` term, the preferences by chapter,
    the layer rows on the headword, and a *Saga orðsins* button (a removed entry's history is reached this way).
    Actions offered: *Setja þýðingu bókar* (mode *kemur í stað* with `replaceCandidates`, or *til hliðar*; `forms`
    prefilled with the headword) unless the book's own entry wins; *Útiloka orðið*; *Útiloka línu* per in-scope
    concept other than the book's own entry; *Breyta* / *Fjarlægja* on the book's own entry; *Afturkalla* on an
    exclusion.
  - **Public notice** on every action form: *Ástæðan, heimildin og nafn þitt birtast í opinberri skrá verkefnisins
    (book-glossary.json á GitHub). Ekki vitna í hafnað orð úr Íðorðabankanum í ástæðunni.*
  - **Remove** lists the entry's claimed exclusions as `bg-undo` checkboxes, checked (Q7), sent as `undoExclusions`.
  - **Answers:** 400/409 → the server's `error` in `#bg-action-error`; `needs-confirm` → the house-style terms
    (*english → icelandic*) and `#bg-confirm-house-style`, which resends the same body with `confirmHouseStyle:
    true`; a `preference` refusal shows its message and offers nothing more; 200 `unchanged` → *Engin breyting var
    gerð.*, plus, when forms were sent, *Hástöfum í enskri orðmynd er aðeins breytt með því að fjarlægja hana og
    bæta henni við aftur.* (§C243 R8); 202 from a retry → the layer reloads after a short delay.
  - **After a write** the layer and the look-up reload; when the answer has a `changeId` and the action was a
    replacement, a change of Icelandic or a removal, the worklist opens for that id (design G2; the `entry-add` row's
    id is the one returned, build ruling R1).

- [ ] **Step 1: Write the failing tests:**
  - `bookGlossaryView.test.js`: `formsFromText drops blanks and duplicates and keeps order`; `changeBody sends only
    what changed` (Icelandic only; forms only; reordered forms → `null`; nothing → `null`); `replaceCandidates
    checks the winner and offers nothing for the book's own entry`.
  - `seed-fixture.js`: after the `ancestors` concept, a chemistry concept with `en 'salt bridge'` and
    `is 'saltbrú'`, source `'e2e-seed'`, with a comment carrying Q10's measurement.
  - `book-glossary.spec.js`, `look up, replace, see the worklist row, undo` (head editor, `/book-glossary?book=
    efnafraedi-2e`):
    1. Re-runnable start: through `page.request` (the head editor's cookie), if `GET /api/book-glossary/
       efnafraedi-2e` lists an entry carrying `salt bridge`, remove it with its claimed exclusions in
       `undoExclusions`.
    2. Look up `salt bridge` → `#bg-lookup-result` shows `saltbrú`.
    3. *Setja þýðingu bókar*, mode `replace`, Icelandic `jónabrú-e2e`, a reason → submit.
    4. `#bg-worklist [data-segment-id="m68822:para:fs-idm196674112"]` is visible; its `a.bg-open` `href` parses to
       `book=efnafraedi-2e`, `chapter=17`, `module=m68822`, `segment=m68822:para:fs-idm196674112`. (One id-keyed row,
       never a count.)
    5. Close the worklist, open the new entry's *Saga*, then its `entry-add` row's *Verkefnalisti*: the same
       `[data-segment-id]` row is there (the path to an old change's worklist, on real data).
    6. *Fjarlægja* on the new entry with its `bg-undo` box checked, a reason → submit → `#bg-layer` holds no entry
       carrying `salt bridge`, and a fresh look-up shows `saltbrú` again.
  - `book-glossary.spec.js`, `a house-style override is sent only after confirmation` → look up `salt bridge`;
    `page.route` on `POST /api/book-glossary/efnafraedi-2e/entries` records each request body and answers the first
    with 409 `{error: '…', refusal: 'needs-confirm', houseStyle: [{conceptId: 1, english: 'salt bridge', icelandic:
    'zhús'}]}` and the second with 201 `{status: 'added', conceptId: 1, changeId: 1}` (nothing reaches the server).
    Submit *Setja þýðingu bókar*: the first body has no `confirmHouseStyle: true`, `zhús` is shown, and
    `#bg-confirm-house-style` is visible; click it: the second body equals the first plus `confirmHouseStyle: true`.
  - Extend Task 5's `a book with no glossary directory is read-only`: the entry has no `change-entry` or
    `remove-entry` button either (with `writable: true`, the control, it has both).
- [ ] **Step 2: Run** `npx vitest run server/__tests__/bookGlossaryView.test.js` — expected FAIL on the new tests.
- [ ] **Step 3: Implement** the helpers, the look-up panel, the dialog and the answer handling.
- [ ] **Step 4: Run** the vitest file — expected PASS; `cd server && npm run test:e2e -- book-glossary.spec.js` —
  expected PASS (or CI's `e2e` job, said so in the commit). Then the floor: `npm test`, `npm run lint`,
  `npm run format:check`, `npm run docs:check` — expected all pass.
- [ ] **Step 5: Commit** `feat(glossary-layer): the book glossary page's actions; E2E round trip`.

---

## After the build

- **Register and dashboard:** add PR 3's entry to the register's ⏩ RESUME block; mark §C243's T3, R8, M9, T6 and T7
  page items closed by PR 3 and §C239 R20 reachable on the page; park new review minors in a new §C item; freeze
  Q1–Q13 and the build's own rulings in a build-rulings file beside the design; roll dashboard row s21 in the same
  session (CLAUDE.md § One source of truth).
- **Deploy:** PR 3 changes no export, schema or cron path, so the first cron run after it reads as before (chemistry
  `unchanged`, no `book-glossary.json` commit). After the deploy, read-only checks on production: an unauthenticated
  `GET /book-glossary` redirects to `/login`; an unauthenticated `GET /api/book-glossary/efnafraedi-2e/worklist?changeId=6`
  answers 401.
- **First real use:** 16 of c19's 19 `entry-add` rows carry `replaces` (counted in the committed
  `book-glossary.json`, 2026-11-20; *substitution reaction*, *band gap* and *standard cell potential* are adds), so
  each of the 16 has a worklist on production, for example change 6, *neptunium → neptúníum*. Opening one through
  *Saga → Verkefnalisti* is the first check that the page works on real data.
