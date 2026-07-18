# Item 14 — Appendices Label Unification (Batch 8 / audit Batch G) — Design

**Date:** 2026-07-18
**Campaign item:** 14 (Phase 3, `docs/plans/2026-07-11-pre-semester-coding-campaign.md`)
**Scope sources:** code-review findings 17 + 23 (`docs/audit/2026-07-11-server-code-review.md`,
Batch G), grounded by a 7-agent whole-repo label map (155 sites; six subsystem readers +
completeness critic, 2026-07-18).
**Method:** one PR; `npm test` from repo root is the gate.
**Lead decisions (2026-07-18):** scope = Core Batch G only (wider finds → register);
approach = boundary-converter module (option A); status GET route included.

## 1. Theme

The repo runs three dialects for "the appendices chapter":

| Dialect | Canonical where | Producer |
|---|---|---|
| number `-1` | server memory + every DB chapter column (all INTEGER) | `segmentParser.listChapters`, `validateBookChapter` |
| word `appendices` | on-disk directory names + CLI `--chapter` argv | directory layout, `tools/lib/parseArgs` `CHAPTER_OPTION` |
| string `"-1"` | *accidental* — wherever the server stringifies | `String(chapter)` in spawn argv, concordance labels |

The convention already exists de facto — the correct sites all convert exactly at a
boundary (`validateBookChapter` URL→`-1`; `chapterDir` `-1`→dirname;
`api-translate.js:1010` dirname→`-1` at the DB edge). Every defect is a site that
re-manufactures the wrong dialect mid-flight or lacks the conversion. The fix is to
**name the convention in one module and route every in-scope site through it** —
not to make the core tolerant (which legalizes mixing and can't reach the DB-key or
argv bugs), and not to add more inline ternaries (the repo already has ~10; they are
the bug class).

## 2. Verified current state (post-#299 main)

| Defect | State | Evidence |
|---|---|---|
| 17a — progress zero-counts | **LIVE** | `segmentEditorService.js:1322` manufactures `chLabel = chNum === -1 ? 'appendices' : String(chNum)`; `:1327` feeds it to `countModuleSegments`, whose `parseInt(chapter,10) \|\| chapter` (`segmentParser.js:504`) passes the word into `chapterDir` → `chappendices/` (nonexistent) → 0; `:1341` uses the same label against `editMap` whose SQLite-integer keys stringify to `"-1"` → 0. Two independent zeros in one loop. Same pattern second site: `routes/status.js:960/974`. Consequence: appendix modules can never read complete; dashboard shows 0 segments / 0 % forever. |
| 17b — concordance/TM skip + label split | **LIVE (dormant)** | `concordanceService.js:169` backfill derives the TEXT label from the dirname and passes it to `indexModule` → `loadModuleForEditing` → `chapterDir` dead-end → warn-log + `{indexed: 0}`, while `modules++` still counts it (silent "success"). `indexModule:105` stores `String(chapter)` — apply path (`segmentEditorService.js:1083`, chapter `-1`) stores `"-1"`; a naively-fixed backfill would store `"appendices"`. Dormant only because no appendix faithful rows exist yet — the audit's "fix while the corpus is small" window. |
| 23 — pipeline actions rejected / argv break | **LIVE** | `routes/pipeline.js:42-43` inline `parseInt` + `chapterNum < 1` rejects `-1` → panel 400s on Viðaukar. Deeper half: `pipelineService.js:58/193/231` put `String(chapter)` on argv, so even accepted `-1` becomes `--chapter -1` → tools' `parseArgs` parses number `-1` → `ch-1` path → loud throw. This second half also breaks **Vista + Birta** for appendix modules (`routes/segment-editor.js:1211` → `runPipeline` with `req.chapterNum = -1`). |
| Status GET (adjacent, same root cause) | **LIVE** | `routes/status.js:1229-1231` rejects non-positive chapters, but the status dashboard's own badge loader (`views/status.html:640`) calls `/api/status/{book}/appendices` → 400. Route's internal dir building (`:1240`) is a hand-rolled `ch${padStart}` with no appendices branch. |

Constraints that shape the design:

- `segmentParser.chapterDir` is exported and imported outside the service
  (`scripts/backfill-mt-locks.js` DB-signal path) — its export must survive.
- `pipelineService.hasRunningJob` uses deliberate strict equality on unnormalized
  chapter values (live values include `null` and `'all'`); job records must keep
  carrying number `-1` so that guard stays valid.
- `tools/` are uniformly correct on the text dialect (`CHAPTER_OPTION` passes the
  word through; every pipeline CLI has the `'appendices'` ternary). Tools are
  **untouched** in this item.
- `tm_segments.chapter` is TEXT (migration 036); `repetitionReport` queries it with
  `String(req.chapterNum)` = `"-1"` — self-consistent with the apply path today.

## 3. Design

### 3.1 The contract — `server/lib/chapterLabel.js` (new, CJS)

Module doc-comment states the rule:

> Server memory and every DB column carry the number `-1` for the appendices
> chapter. The word `appendices` exists at exactly two boundaries: on-disk
> directory names and CLI `--chapter` argv. Conversion happens only at those
> boundaries, through this module — never inline.

Three functions:

- `normalizeChapter(value)` → integer (`'appendices'` / `'-1'` / `-1` → `-1`;
  `'3'` / `3` → `3`); **`null` on anything unrecognizable** (no silent
  fallthrough — the old `parseInt(x) || x` idiom is the root bug). Routes map
  `null` → 400; services treat `null` input as a programmer error and throw.
  The module only translates dialects — *bounds* (1..`MAX_CHAPTERS`, `< 1`
  rejection, etc.) remain each caller's policy, because valid chapter sets
  differ per route and chapter 0 (front-matter, `ch00`) is real.
- `chapterDir(chapterNum)` → `'appendices'` | `'chNN'` — moves here from
  `segmentParser.js:138`; segmentParser **re-exports it unchanged** (its ~15
  correct call sites and `backfill-mt-locks.js` need zero churn).
- `cliChapterArg(chapterNum)` → `'appendices'` | `String(n)` — the argv dialect
  for spawned tools.

### 3.2 Fix sites

**Progress (17a).** Delete the manufactured labels: `getEditorialProgress`
(`segmentEditorService.js:1322-1341`) passes `chNum` straight into
`countModuleSegments` and indexes `editMap[chNum]` (object-key coercion matches
SQLite's stringified integer). Same deletion in `routes/status.js:960/974`.
`countModuleSegments` (`segmentParser.js:503`) normalizes its input via
`normalizeChapter` — making its existing JSDoc ("Chapter number or 'appendices'")
true instead of false.

**Concordance (17b).** `backfill` converts dirname → number at the discovery
boundary (the `api-translate.js:1010` pattern): `dir === 'appendices' ? -1 :
parseInt(...)`. `indexModule` stores `String(normalizeChapter(chapter))` — the
canonical stored label for appendices is **`"-1"`**, matching the apply path and
`repetitionReport`'s existing query shape. No data migration: the apply path
already stored `"-1"` and the broken backfill never wrote appendix rows, so no
`"appendices"`-labelled rows can exist. Deploy note (I12-R3 precedent): a
one-time prod sanity query `SELECT COUNT(*) FROM tm_segments WHERE chapter =
'appendices';` — expected 0; any hits mean an unknown writer and warrant a look
before the next backfill run.

**Pipeline (23).** `routes/pipeline.js` `validateParams` normalizes via
`normalizeChapter` and accepts `-1`; numeric chapters keep the 1..`MAX_CHAPTERS`
bound. The three spawn sites (`runExtract:58`, `runInject:193`, `runRender:231`)
emit `cliChapterArg(chapter)` instead of `String(chapter)` — one change fixes both
the panel actions and Vista + Birta. Job records keep number `-1`
(`hasRunningJob` untouched); `GET /jobs` filter's `parseInt('-1')` already yields
`-1` and keeps working.

**Status GET.** `routes/status.js:1223` normalizes via `normalizeChapter`
(accepting `-1`/`'appendices'`, 400 on `null` and on 0/`<-1`); internal dir
building at `:1240` uses shared `chapterDir`.

**Front-end (3 touches in `server/public/js/segment-editor.js`).**
`autoLoadFromParams` (`:2571`) normalizes `?chapter=appendices` → `'-1'` before
matching dropdown option values (status-page deep links `views/status.html:580`
and old bookmarks both resolve; producers untouched). Concordance-hit rendering
(`:401`) and repetition-hint provenance (`:753`) test `Number(chapter) === -1` →
"Viðaukar" instead of string-comparing against a label the DB never stores. No
other client files change.

### 3.3 Error handling

`normalizeChapter` is the single place "invalid chapter" is decided. Boundary
callers (routes) return 400 with the existing message shapes; internal callers
(`countModuleSegments`, `indexModule`) throw on `null` — a caller passing
garbage is a bug, not a request error. `countModuleSegments` keeps returning 0
for a *valid* chapter whose file is missing (dashboard aggregation semantics,
unchanged).

## 4. Testing

Unit tests per seam, existing harness patterns (temp fixture trees via
`_setTestBooksDir`, test DB via `_setTestDb`, route handlers via the
`router.stack` idiom where needed):

1. `chapterLabel` dialect matrix — every input form × three functions, including
   the `null`/throw contract.
2. `countModuleSegments` with `-1`, `'-1'`, `'appendices'`, `'3'`, `3` against a
   fixture tree containing `02-for-mt/appendices/` — all count identically.
3. `getEditorialProgress` + status editorial-progress route: appendix module with
   edits reports non-zero `totalSegments`, non-zero approved counts, and can reach
   `complete` (both halves of 17a pinned independently: FS count and DB-key join).
4. Concordance backfill over a fixture with an appendices dir: module indexed
   (not skipped), stored `chapter = "-1"`; `repetitionReport(book, -1)` finds it.
5. Pipeline `validateParams` matrix: accepts `'appendices'`/`'-1'`/`-1`/valid N;
   rejects 0, `MAX_CHAPTERS+1`, garbage.
6. Spawn-args assertion (runner injected/mocked): chapter `-1` produces
   `['--chapter', 'appendices']` for all three runners; chapter 3 produces
   `['--chapter', '3']`.
7. Static pin that `segmentParser.chapterDir === chapterLabel.chapterDir`
   (re-export contract, protects `backfill-mt-locks.js`).

Client JS: the three touched panes have no unit harness (saveRetry's UMD-factory
pattern doesn't extend here without out-of-scope refactoring) → covered by the
register's manual-QA line (I14-R8) instead.

## 5. Out of scope → campaign register (I14-R1..R10)

Logged in `docs/plans/2026-07-11-pre-semester-coding-campaign.md` under item 14;
no code in this PR.

- **I14-R1 `[fix][lead]`** — appendix assignment rows impossible (`admin.js:1067`
  validation rejects `-1`) AND `hasChapterAccess`'s legacy branch
  (`userService.js:631`, via `requireBookAccess` on save/submit/propagate + loc
  save routes) 403s appendix saves for any editor holding ≥1 assignment in the
  book, even with enforcement OFF. Needs a lead semantics decision: allow `-1`
  assignment rows vs. treat appendices as book-level access.
- **I14-R2 `[fix]`** — remaining inline chapter validators rejecting appendices:
  `publication.js:47` (whole publication API), `books.js:372/487` (+ bare
  unvalidated `parseInt` at `:213/248/276/522`), `admin.js:497/1067`, `status.js:1279`
  (`/sections`) and `:1846`.
- **I14-R3 `[fix]`** — `ch`-prefix directory-scan family silently skipping
  `appendices/`: `scripts/validate-status.js:245` (`npm run validate` never
  validates `chapters/appendices/status.json`), `routes/status.js:148/628/826`,
  `pipelineService.checkBookDownstreamWork:654` + `checkExtractionImpact:504`,
  `bookRegistration.scanAndUpdateStatus:1020`, `generate-glossary.js:139`,
  `terminologyService.importFromKeyTerms:922`,
  `publicationService.checkTrackReadiness:54`, `exercise-extract.js:99`,
  `audit-equation-notation.js:66`. **Panel consequence (final-review F1):** with
  the panel now accepting Viðaukar, the inject/run extraction-prerequisite
  check 409s with a factually wrong "Extraction has not been run" confirmation
  every time (no automated path ever writes an appendices extraction row);
  confirm-through completes the action. Clears when R3 lands, or via a
  one-time manual stage seed (`POST /api/pipeline-status/{book}/-1/advance`).
- **I14-R4 `[fix]`** — the DB section registry never contains appendices
  (`bookRegistration.registerBook:199` iterates `bookData.chapters` only;
  appendices ride a separate array) → sections/suggestions/localization review
  tab have no appendices rows in any label form.
- **I14-R5 `[fix]`** — `tools/validate-chapter.js:987/1055` can't validate
  appendices in either dialect (positional arg `parseInt`'d, no dir branch).
- **I14-R6 `[hygiene]`** — tools' ~7 copy-pasted `formatChapter` ternaries
  (extract/inject/render/api-translate/module-sections/fidelity tools) could
  consolidate into one tools-lib helper; behavior already correct, refactor kept
  out of a behavioral PR per standing feedback.
- **I14-R7 `[contract]`** — `routes/activity.js:114` passes the raw `:chapter`
  URL param into the section activity query while rows store `String(-1)` —
  same-label mismatch class, display-only.
- **I14-R8 `[test-gap][qa]`** — zero appendices E2E coverage; `__e2e-fixture__`
  book has no appendices dir. Manual QA line for this PR's client touches: open
  status dashboard → appendix chapter shows real counts; deep-link "Opna ritil"
  from an appendix row lands with Viðaukar selected; pipeline panel
  inject/render on Viðaukar runs; concordance hit from an appendix row renders
  "Viðaukar" and its provenance link loads. NOTE: inject/run on Viðaukar will
  show the false "Extraction has not been run" confirm dialog (see I14-R3
  panel consequence) — confirm through; it is not a branch failure.
- **I14-R9 `[ux]`** — "Kafli -1" display labels in `my-work.html:1380` (+5
  sites) and `books.html:1786/2325` chapter surfaces; item 16 (Batch 7
  dashboard/view contract repair) territory.
- **I14-R10 `[latent]`** — pipelineService non-panel runners still chNN-only:
  `runProtect`/`runUnprotect` (:102/:144, archived-tool runners), `runGenerateTm`
  (:856 throws loud on `-1` dir check; only whole-book callers exist today),
  `computeSourceHash` (:591 returns null for appendices → staleness checks blind
  there).

## 6. Register interactions

- Closes the audit's Batch G scope (findings 17 + 23) in full.
- I14-R1 materially affects the **semester editorial flow** (Phase 3 rationale) —
  flagged for lead triage ahead of appendix Pass-1 work, independent of this PR.
- `views/status.html:580/640` producer label forms become *valid* under this PR
  (consumers normalize); unifying producers is I14-R9/item-16 polish, not a bug.
