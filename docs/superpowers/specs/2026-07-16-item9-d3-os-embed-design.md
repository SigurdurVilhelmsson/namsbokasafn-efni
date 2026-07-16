# Item 9 — D3 os-embed exercise translation path (design)

**Campaign:** `docs/plans/2026-07-11-pre-semester-coding-campaign.md` § Phase 2, item 9.
**Register origin:** `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md` § D3 (sized XL, "blocks organic").
**Date:** 2026-07-16
**Status:** design approved (user-confirmed); spec pending user review.

## Purpose

lifraen-efnafraedi (organic chemistry) authors all 1,961 of its exercises as
`<link class="os-embed" url="#exercise/{nickname}"/>` references into the OpenStax exercise
bank. `resolve-os-embed.js` already caches the bank content locally as
`books/lifraen-efnafraedi/01-source/exercises/{nickname}.json` (read-only source), and
`cnxml-render.js` `resolveOsEmbed()` renders it — **in English**. There is no
extract→MT→inject path for this content, so every organic end-of-section problem ships
untranslated while looking "done."

This item builds that path as **code only**, riding the existing segment pipeline
(one MT code path, all existing gates). The actual MT run is a separate, lead-gated data op.

### Correction to the campaign item text

The campaign line "biology uses os-embed too" is **wrong**: `grep -rl os-embed
books/liffraedi-2e/01-source/` → 0 files (verified 2026-07-16). The older register's
"D3 NOT needed for biology; biology uses inline `<exercise>`" is correct. D3 gates
**organic only**, and organic already ships EN today — deferring costs no regression.
User chose to proceed (2026-07-16).

## Measured facts (all verified 2026-07-16 against the live cache)

- **1,961** exercise JSONs; **3,740** questions; chapter tokens from nickname prefix:
  `01`–`22` plus **`18a`** (3 files) — the extractor must tolerate a non-numeric token.
  Section-`99` nicknames (e.g. `01-99-OC-P07`) belong to their chapter (first token).
- **Translatable surface = exactly what `resolveOsEmbed` consumes** (`cnxml-render.js:171–191`):
  `stimulus_html` (718 non-empty), `questions[].stem_html` (3,740),
  `questions[].collaborator_solutions[0].content_html` (1,082 non-empty; **never** more than
  one solution per question), gated by `solutions_are_public`.
- **Zero** multiple-choice `answers[]` content anywhere (all free-response) — no
  answer-rendering or answer-translation surface exists for organic.
- **Zero** MathML in any field.
- Inline tag inventory across the 5,540 non-empty fields:
  `sub` 2,665 · `img` 2,380 · `i` 1,428 · `p` 1,001 · `sup` 524 · `b` 412 · `span` 226 ·
  `small` 124 · `td` 123 · `li` 62 · `tr` 51 · `th` 21 · `br` 20 · `ul` 20 · `table` 8 ·
  `tbody` 8 · `thead` 5 · `figure` 4 · `figcaption` 4.
- All `<img>` srcs point at one host (`exercises.openstax.org/rails/active_storage/…`) —
  opaque, non-translatable.
- Render consumption site: `cnxml-render.js:1433–1471` (os-embed branch of the problem
  renderer; raw HTML pass-through). `answers[]` is never read.
- `api-translate.js` `discoverModules()` (`:246–256`) filters strictly
  `^m\d+-segments\.en\.md$` — exercise segment files need an explicit discovery hook.
- **MT cost bound:** raw HTML 1,306,217 chars ≈ 13,062 ISK; tag-stripped text 371,808 chars
  ≈ 3,718 ISK floor at 10 ISK/1,000 chars. Marker-converted payload lands in between
  (est. **~4,000–5,500 ISK**) — lead-gated, out of scope here; the PR ships a `--dry-run`
  estimate for the real number.

## Architecture (approved Approach A: ride the existing segment pipeline)

```
01-source/exercises/*.json  (read-only cache, fetched by resolve-os-embed.js)
      │ exercise-extract.js  (new)
      ▼
02-for-mt/chNN/exercises-segments.en.md      ← one file per chapter token
02-structure/chNN/exercises-skeleton.json    ← block skeleton + opaque/inline-attr sidecar
      │ api-translate.js  (existing + discovery hook)
      ▼
02-mt-output/chNN/exercises-segments.is.md
      │ exercise-assemble.js  (new; --track mt-preview|faithful)
      ▼
03-translated/{track}/exercises/{nickname}.json   ← translated sidecar, render-shaped
      │ cnxml-render.js resolveOsEmbed  (track-aware preference)
      ▼
05-publication/{track}/… Icelandic exercise HTML (EN fallback loud, never silent)
```

Rejected alternatives: (B) direct JSON→API translation — a second MT code path with none of
the existing gates, HTML survival unproven; (C) converting exercises to inline CNXML
`<exercise>` — mutates frozen module/seg-id expectations. (Per
`feedback-robustness-over-expedience`: one real code path.)

## Components and interfaces

### 1. `tools/lib/exercise-html.js` (new, pure lib — no I/O)

The reversible HTML⇄segments converter. For one HTML field:

- `htmlToSegments(html)` → `{ blocks: [{slot, text}], skeleton }`
  - **Skeleton:** the block structure — `p` / `br` / `ul`/`li` / `table`/`thead`/`tbody`/
    `tr`/`td`/`th` / `figure`/`figcaption` — with each text-bearing block replaced by a
    numbered slot. Bare-text fields (no block tags) are a single implicit block.
  - **Text runs:** per block, inline HTML mapped to the proven-survival bracket dialect
    (`api-marker-survival`: 100%):
    | HTML | Marker |
    |------|--------|
    | `<i>`, `<em>` | `[[i:text]]` |
    | `<b>`, `<strong>` | `[[b:text]]` |
    | `<sub>` | `[[sub:text]]` |
    | `<sup>` | `[[sup:text]]` |
    | `<img …>` | `[[MEDIA:n]]` (opaque; full tag in sidecar — mirrors `cnxml-extract.js:210`) |
    | `<span …>`, `<small …>` | `[[em:text|n]]` — id-anchored, n → `{tag, attrs}` in sidecar (B4 `[[term:|id]]` precedent) |
  - Unknown/unexpected tags: **fail loud per exercise** (recorded, exercise skipped, EN
    remains) — never silently stripped. The inventory above is closed today; a future bank
    refresh that introduces a new tag must surface, not vanish.
- `segmentsToHtml(blocks, skeleton)` → HTML. **Round-trip law:** for every field in the live
  cache, `segmentsToHtml(htmlToSegments(h)) === h` under identity translation (whitespace-
  normalization allowances pinned by test, not assumed).

### 2. `tools/exercise-extract.js` (new CLI)

`node tools/exercise-extract.js --book lifraen-efnafraedi [--chapter <token>] [--verbose]`

- **Reads** `01-source/exercises/*.json` (READ-ONLY — classified as a reader in
  `tools/__tests__/source-write-guard.test.js`, which will otherwise fail the suite by design).
- Groups by chapter token (first `-`-delimited nickname segment; tolerates `18a`).
- Emits per chapter:
  - `02-for-mt/ch{token}/exercises-segments.en.md` — standard `<!-- SEG: id -->` format.
    **Deterministic seg-ids** (idempotent re-extraction, no counters):
    `{nickname}.stimulus.b{k}` · `{nickname}.q{qid}.stem.b{k}` · `{nickname}.q{qid}.sol.b{k}`.
  - `02-structure/ch{token}/exercises-skeleton.json` — per-field skeletons, opaque `MEDIA`
    tags, `em`-anchored inline attrs, source `uid`/`version` per exercise, and
    `solutions_are_public` passthrough.
- Only fields the renderer consumes are extracted (stimulus, stems, first solution).
- Malformed JSON / unknown tag → loud per-exercise skip + end-of-run summary +
  `process.exitCode = 1` (item-7 per-module isolation pattern); the rest of the chapter
  proceeds.

### 3. `api-translate.js` discovery hook (existing tool, small change)

- `discoverModules()` (or a sibling `discoverExerciseFiles()`) additionally returns
  `exercises-segments.en.md` when present in the chapter dir, with a non-module id
  (`exercises`) that downstream naming handles (`exercises-segments.is.md`,
  `exercises-segments-links.json` n/a).
- Everything else rides unchanged: `--dry-run` costing, SEG-count gate (`validateMarkers`),
  bracket-marker delta report (B3), `normalizeSegMarkers`, `.locked` edit-lock refusal
  (a `.locked` sibling next to `02-mt-output/chNN/exercises-segments.is.md` blocks re-MT).
- **Naming guard:** exercise files must never match `^m\d+` (they don't — `exercises-` prefix).

### 4. `tools/exercise-assemble.js` (new CLI)

`node tools/exercise-assemble.js --book lifraen-efnafraedi --track mt-preview|faithful [--chapter <token>]`

- Segment source per track, mirroring `cnxml-inject`: `mt-preview` ← `02-mt-output/…is.md`;
  `faithful` ← `03-faithful-translation/…` (works the day exercise review exists; until then
  faithful assembly simply finds no input and reports it).
- Re-slots translated runs into the skeleton, inverts markers to HTML, writes
  `03-translated/{track}/exercises/{nickname}.json`:
  ```json
  {
    "nickname": "01-03-OC-P01",
    "source_uid": "37538@3",
    "generated_by": "exercise-assemble.js",
    "track": "mt-preview",
    "stimulus_html": "…IS…",
    "questions": [{ "id": "448142", "stem_html": "…IS…",
                    "collaborator_solutions": [{ "content_html": "…IS…" }] }],
    "solutions_are_public": true
  }
  ```
  — field names deliberately identical to what `resolveOsEmbed` reads from source JSON.
- **Fail-loud invariants:** skeleton/segment count or id mismatch, unresolved marker, or
  leftover bracket token → that exercise is skipped (no sidecar written; EN fallback
  persists), recorded in a per-run report; `process.exitCode = 1`.
- **Residue policy = inject's policy, same lib:** run `residue-check` (with
  `residue-allowlist.json` + `isLanguageNeutral` tolerance) over assembled fields; real
  residues fail that exercise loud, `tolerated[]` reported non-gating. One policy, one code
  path.
- Partial output is never half-written: assemble to temp, rename on success (per exercise).

### 5. `cnxml-render.js` `resolveOsEmbed` (existing, small change)

- Signature gains the active track (plumbed from the render context; CLI `--track` and the
  server preview path both already know it).
- Preference: `03-translated/{track}/exercises/{nickname}.json` → else EN
  `01-source/exercises/{nickname}.json` (current behavior).
- **Loud fallback:** per-run counter, summary line
  `os-embed: N translated / M EN-fallback`, and per-module counts in verbose mode.
  **Non-gating** — organic ships all-EN today; this path is progressive enhancement and must
  never turn a working EN render into a failure.

## Integration checks owned by the implementation plan (verify, don't assume)

1. Chapter-dir scanners must not misread `exercises-segments.en.md` as a module:
   `verify-extraction-coverage.js` (6b gate), the editorial server's module discovery,
   `git-backup.sh` staging globs, `generate-tm.js` pairing. Each is checked; any that trips
   is handled deliberately (skip-by-name or explicit support), with a test.
2. `source-write-guard.test.js`: classify `exercise-extract.js` and `exercise-assemble.js`
   as `01-source` **readers**.
3. `.locked` backfill semantics: exercise MT output participates in Track-C locking the same
   way module output does (marker file next to the `.is.md`).
4. Prettier/lint-staged must not reformat generated `.md`/`.json` outputs on commit of
   fixtures (fixtures live under `tools/__tests__/fixtures/`, mirrored from real cache
   files verbatim).
5. **Seg-id charset:** the deterministic ids contain dots (`01-03-OC-P01.stimulus.b0`) —
   verify `seg-markers.cjs` parsing (and every consumer regex) accepts them; if any consumer
   is `[\w-]`-strict, switch the scheme to hyphens/underscores BEFORE first extraction
   (ids are frozen the day real MT runs).
6. **Non-numeric chapter token:** `api-translate --chapter 18a` and `exercise-assemble
   --chapter 18a` must address `ch18a` (check `parseArgs` CHAPTER_OPTION coercion and
   `formatChapterDir`); if numeric-only, handle `18a` deliberately (explicit token pass-through
   or documented fold-into-ch18 decision) — never crash or silently skip those 3 exercises.

## Testing strategy (TDD per piece)

- **Round-trip property:** `exercise-html.test.js` — every fixture field round-trips
  byte-identical under identity translation; plus a **live-corpus sweep test** (skippable
  when the book is absent) asserting `htmlToSegments` succeeds on all 5,540 fields and
  round-trips them (this is the "closed tag inventory" proof).
- **Fixtures:** real cache files copied verbatim: a multi-question exercise with stimulus +
  solutions (`01-03-OC-P01`-like), an img-bearing stem, a table-bearing solution, a `18a`
  nickname, a `solutions_are_public: false` case.
- `exercise-extract.test.js`: deterministic seg-ids; idempotent re-run (byte-identical
  outputs); malformed-JSON loud skip; chapter-token grouping incl. `18a`.
- `api-translate` discovery unit: exercise file discovered alongside modules; `m\d+` regex
  untouched for modules.
- `exercise-assemble.test.js`: track source selection; mismatch → loud skip + no sidecar +
  exit 1; residue gating wired; sidecar shape matches `resolveOsEmbed`'s reads.
- `cnxml-render` unit: sidecar preferred over EN; missing sidecar falls back EN + counted.
- Full suite (`npm test`, repo root) green; `git status --porcelain books/` empty after the
  test run (fixtures only, no live-book writes).

## Acceptance

- A fixture organic exercise round-trips EN→(identity or pseudo-IS)→assembled sidecar and
  renders the translated text through the real `renderCnxmlToHtml` path (characterization
  test pins resolved-vs-fallback, per the D3 register).
- `exercise-extract` over the live book: 1,961 exercises → segments + skeletons, 0 unknown
  tags, deterministic ids; re-run byte-identical. (Run locally as evidence; committed
  outputs are **not** part of this PR — generating live `02-for-mt` content is the data op's
  first step.)
- `api-translate --dry-run` prints a cost estimate for the exercise files (the real number
  for the lead's spend decision).
- Full suite green.

## Out of scope (explicit)

- The MT run itself and any live generated content under `books/` (separate lead-gated data
  op: extract → dry-run estimate → lead OK → MT → assemble → render → delivery PR).
- Segment-editor / Pass-1 server wiring for exercise segments (file shapes are compatible;
  server work is a later item).
- `answers[]` rendering or translation (organic has none).
- Biology (zero os-embed) and every other book.
- Any write to `01-source/` (both new tools are readers; the cache refresh path stays
  `resolve-os-embed.js`).
- TM generation from exercise pairs (revisit when faithful exercise review exists).
