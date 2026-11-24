# Serving the Fable layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** chemistry's editors open every study unit on Fable's text from a tool-written layer, with meaning changes
flagged and comparable, and the served-version rows, the freeze manifest and the assign gate all agreeing.

**Architecture:** PR 1 adds the layer `books/efnafraedi-2e/02-mt-fable/` and the tool that rebuilds it from the
committed trial runs; it serves nothing. PR 2 adds one book-to-layer setting that the loader, the assign gate and
the suggestion view read; a loader branch that fails closed; a migration admitting layer `'fable'`; the flag, the
comparison and its research event (with no flag where human text was in flight at the opening); the freeze
manifest's new inputs and the re-cut. PR 2 merges and deploys as one.

**Tech Stack:** Node 22; `tools/` and `experiments/` ESM; `server/` CommonJS (Express, better-sqlite3); Vitest;
Playwright (server `test:e2e`); TLA+ via the repo's `verify-*` skills.

**Spec:** `docs/superpowers/specs/2026-11-24-fable-layer-serving-design.md` (approved 2026-11-24). Read it first;
section numbers below are the spec's.

## Global Constraints

- Never write `02-mt-output/`, `02-mt-selected/`, `02-mt-revised/` or `01-source/`; never open, edit or delete a
  `*-segments.locked` freeze marker (CLAUDE.md § Purpose).
- The layer is exactly the runs' output: no hand edit of any `02-mt-fable` file, ever; the writer refuses to
  overwrite different bytes.
- Book slug `efnafraedi-2e`; layer directory `02-mt-fable`; layer name in code and DB `'fable'`; provenance schema
  `mt-fable/1`.
- Chooser: every chapter from its 2026-11-24 run; ch10 from `20261123T215036Z-63b1603d`; ch11 module `m68783` from
  `20261124T160650Z-80e6dd69`.
- Only the tag `meaning` reaches the client. No other tag is shown anywhere. A segment that held an in-flight human
  edit at its unit's opening, or any segment of a unit with no opening yet, shows no flag (spec amendment 1).
- Chemistry's `mt-preview` render and publish paths stay on `02-mt-output`: no task touches `publicationService`
  or `pipelineService` (spec amendment 2).
- Icelandic strings are §6.10's, verbatim (approved). No other new Icelandic text without [USER]'s approval.
- Server tests: `import` vitest and node builtins, `createRequire(import.meta.url)` for server modules (copy the
  header of `server/__tests__/importConcepts.test.js`). Run `npm test` from the repo root.
- A migration never throws (CLAUDE.md, the `INSERT OR IGNORE` boot-wedge rule); wrap the whole unit.
- Research events go only through `researchEmission`'s `emit` → `researchLog.record`; a new event type is a spec
  amendment (dated note in the G1.1 spec) in the same PR.
- No grant or fund named; no test counts or CI verdicts in committed prose.
- Commits on feature branches only; push, PR and merge on [USER]'s word. The re-cut is [USER]'s decision.

## Review Focus

1. **A Fable file present but its `tags.jsonl` missing or unparseable** → the unit must refuse, not serve Fable's
   text without flags. Test in Task 6.
2. **Repeated segment ids (G1.12)** → the loader pairs by segment id, first copy wins; the meaning flag must attach
   to that served occurrence and never to a later repeat's tags line. Test in Task 6.
3. **A unit later approved into `03-faithful-translation`** → faithful wins and shows no Fable flag, since the text
   is no longer Fable's. Test in Task 6.
4. **The comparison route called for a segment with no meaning flag, or by a non-consenting or withdrawn editor** →
   400 for the first (no event); 204 and no research row for the second. Test in Task 10.
5. **Editor text inside the diff** → every token HTML-escaped; `[[…]]` markers kept whole as single tokens. Test in
   Task 11.

---

## PR 1 — the layer data (branch `feat/fable-layer-data`, from `main`)

### Task 1: Register the layer in `mt-layers`

**Files:**
- Modify: `tools/lib/mt-layers.js` (`LAYER_DIRS`, `WRITABLE_LAYERS`, `SAFE_FILENAME_RE`, add `FABLE_SCHEMA`)
- Test: `tools/__tests__/mt-layers.test.js`

**Interfaces:**
- Produces: `LAYER_DIRS.fable === '02-mt-fable'`; `FABLE_SCHEMA === 'mt-fable/1'`; `resolveSafeDestination`
  accepts `<book>/02-mt-fable/<ch>/<stem>-(segments.is.md|fable.json|tags.jsonl)`.

- [ ] **Step 1: Write the failing tests** — `it('accepts the three Fable layer files')`: for each of
  `m68776-segments.is.md`, `m68776-fable.json`, `m68776-tags.jsonl` under `02-mt-fable/ch11/`,
  `resolveSafeDestination` returns the path. `it('still refuses 02-mt-output')`: throws `unsafe-destination`.
  `it('refuses fable.json under 02-mt-revised')`: a Fable filename in another layer is refused (the filename rule is
  per layer, not global).
- [ ] **Step 2: Run** `npx vitest run tools/__tests__/mt-layers.test.js` — expect the three new tests to FAIL.
- [ ] **Step 3: Implement.** Add the layer to `LAYER_DIRS` and `WRITABLE_LAYERS`; make the filename check per layer
  (the Fable layer admits only `segments.is.md|fable.json|tags.jsonl`; the others keep their current alternatives).
- [ ] **Step 4: Run** the same file — PASS, and the file's existing tests unchanged.
- [ ] **Step 5: Commit** `feat(mt-layers): register the 02-mt-fable layer`.

### Task 2: Build one unit's three files (pure)

**Files:**
- Create: `tools/lib/fable-layer.js`
- Test: `tools/__tests__/fable-layer.test.js`

**Interfaces:**
- Consumes: `feLayerText(parsed, feBodies)` from `experiments/fable-editor-trial/compare.mjs`; `sha256` helper.
- Produces:
  `buildFableUnit({ chapterDir, unit, rows, feBodies, runs, runMeta, selectedKeys, writtenBy }) →
  { segmentsText: string, tagsJsonl: string, provenance: object }` where
  - `unit` is a `readPinnedInputs` unit (`stem`, `base: { parsed, layer1Sha256, overlaySha256 }`, `en` sha
    available as its fingerprint), `rows` and `feBodies` are that unit's from `buildRows`;
  - `runs` = `[{ runId, used: boolean, reason?: string, requestKeys: string[] }]`;
  - `runMeta` = the used run's `run.json` fields `model, effort, max_tokens, prompts, anthropicVersion,
    harnessCommit` plus the trial record's `rulingSet`;
  - `selectedKeys` = `readSelectedKeys(...)` occurrence keys for the unit.
  - tags line fields, in this order: `key, segmentId, occurrence, tags, before, beforeSha256, afterSha256, run,
    requestKey, rerequested`; one line per row with `status === 'edited'`, document order.
  - provenance fields: `format: 'mt-fable/1', book, chapter, module, runs, model, effort, max_tokens, prompt
    {path, sha256}, rulingSet, harnessCommit, anthropicVersion, base {layer1Sha256, layer1Commit, overlaySha256,
    enSha256}, rerequested: string[] (segment ids), counts {segments, changed, meaning, refusedMarkers},
    files {segmentsSha256, tagsSha256}, writtenBy`.
  - Serialisation: `JSON.stringify(provenance, null, 2) + '\n'`; tags lines `JSON.stringify(line)` joined by
    `'\n'` plus a final `'\n'` (empty file `''` when no line).

- [ ] **Step 1: Write the failing tests** with a two-unit fixture built from `parseLayerFile` text (no real book):
  - `segmentsText` equals `feLayerText(unit.base.parsed, feBodies)` byte for byte;
  - a `refused-markers` row has no tags line and its served text equals its base;
  - an `edited` row's line has `before === row.mt`, `beforeSha256 === sha256(row.mt)`,
    `afterSha256 === sha256(row.fe)`, `tags` as given;
  - `rerequested` is true exactly for keys in `selectedKeys`, and `provenance.rerequested` lists their segment ids;
  - `counts.meaning` counts lines whose tags include `'meaning'`;
  - `files.segmentsSha256`/`tagsSha256` hash the returned strings;
  - two calls with the same input return identical strings (determinism).
- [ ] **Step 2: Run** `npx vitest run tools/__tests__/fable-layer.test.js` — FAIL (module missing).
- [ ] **Step 3: Implement `buildFableUnit`** in `tools/lib/fable-layer.js`. `occurrence` is the row's occurrence
  index as `occurrenceKey` in `tools/lib/seg-markers.cjs` numbers it (0 for the first copy).
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(fable-layer): build a unit's served text, tags and provenance`.

### Task 3: The writer CLI and the chooser table

**Files:**
- Create: `tools/promote-fable-layer.js`, `experiments/fable-editor-trial/layer-sources.json`
- Test: `tools/__tests__/promote-fable-layer.test.js`

**Interfaces:**
- Consumes: `buildRows` (compare.mjs), `readSelectedKeys`/`resolveSafeDestination`/`LAYER_DIRS` (Task 1),
  `buildFableUnit` (Task 2).
- Produces: `promoteFableLayer({ chapters?: string[], dryRun: boolean, bookDir?, trialRoot? }) →
  { written: string[], unchanged: string[], counts: object }`; CLI
  `node tools/promote-fable-layer.js [--chapter chNN]... [--dry-run]`, exit 0 on success, 1 on any refusal
  (`process.exitCode`, never `process.exit` after output).
- `layer-sources.json`: `{ "format": "fable-layer-sources/1", "chapters": { "ch00": "<runId>", …, "appendices":
  "<runId>" }, "modules": { "ch11/m68783": { "run": "20261124T160650Z-80e6dd69", "reason": "m68783/001 truncated
  at max_tokens in 20261124T150045Z-8c3d8453; re-sent with --char-budget 15000" } } }` — run ids from the PR #809
  run folders (chapter of each run from its `fable-editor.json` `chapterDir`).

- [ ] **Step 1: Write the failing tests** (they run on the real committed runs, read-only, `dryRun: true` or a temp
  `bookDir` copy for writes):
  - `it('rebuilds ch00 byte-identical to the run's committed fe-layer')`;
  - `it('takes ch11 m68783 from the re-send and names both runs')`: provenance `runs` has two entries, the re-send
    `used: true`, the main run `used: false` with the reason;
  - `it('refuses a unit with an unanswered segment')`: with the module override removed, ch11 refuses (m68783's 189);
  - `it('refuses to overwrite different bytes')`: write to a temp copy, alter one byte, re-run → refusal, file
    untouched;
  - `it('is deterministic')`: two writes into fresh temp dirs produce identical trees;
  - `it('refuses when the base moved')`: a temp book copy whose layer-1 file differs from the run's recorded
    `layer1Sha256` refuses;
  - `it('refuses an English change other than the G1.12 repeat removal')`: a temp copy with one English segment
    edited refuses (this is `readPinnedInputs`'s own refusal, surfaced by the writer, not re-implemented).
- [ ] **Step 2: Run** `npx vitest run tools/__tests__/promote-fable-layer.test.js` — FAIL.
- [ ] **Step 3: Implement.** Per chapter: `buildRows` for the chosen run; for an overridden module, `buildRows` for
  its run and take that unit's rows; refuse on `runEnd.status !== 'complete'`, any `unanswered` row, a mismatch with
  the run's `results/<runId>/fe-layer/<stem>-segments.is.md`; write the three files through
  `resolveSafeDestination` (create the chapter dir; refuse if any target exists with other bytes; skip if identical).
- [ ] **Step 4: Run** — PASS; then `node tools/promote-fable-layer.js --dry-run` prints per-chapter counts, exit 0.
- [ ] **Step 5: Commit** `feat(fable-layer): the writer and its chooser table`.

### Task 4: Write and commit the layer, with a corpus test

**Files:**
- Create: `books/efnafraedi-2e/02-mt-fable/**` (written by the tool)
- Test: `tools/__tests__/fable-layer-corpus.test.js`

- [ ] **Step 1: Write the corpus test** (fails while the layer is absent):
  - every study unit (`listStudyUnits` in `server/lib/studyUnits.js`) plus `ch00` has the three files;
  - each provenance's `files` hashes match the files on disk;
  - every segment with no tags line equals its base (`readBase`), every tags line's `beforeSha256` equals the base
    body's hash at its occurrence;
  - `provenance.rerequested` across the layer is exactly the 8 ids in m68744, m68852, m68856;
  - the sum of `counts.refusedMarkers` equals the sum of the chosen runs' `metrics.status['refused-markers']`
    (computed from `results/*/metrics.json`, not a literal).
- [ ] **Step 2: Run** it — FAIL.
- [ ] **Step 3: Run the writer** `node tools/promote-fable-layer.js` — exit 0.
- [ ] **Step 4: Run** the corpus test and `npm test` — PASS.
- [ ] **Step 5: Commit** `feat(fable-layer): write books/efnafraedi-2e/02-mt-fable from the committed runs`;
  push and open PR 1 on [USER]'s word.

---

## PR 2 — serving (branch `feat/fable-layer-serving`, from `main` after PR 1 merges)

### Task 5: The book-to-layer setting

**Files:**
- Create: `server/lib/servedLayer.js`
- Test: `server/__tests__/servedLayer.test.js`

**Interfaces:**
- Produces: `SERVED_LAYER_BY_BOOK` (frozen `{ 'efnafraedi-2e': 'fable' }`), `servedLayerFor(book) → 'fable' |
  'mt-output'`, `FABLE_LAYER = 'fable'`.

- [ ] **Step 1: Failing tests:** `servedLayerFor('efnafraedi-2e') === 'fable'`; `servedLayerFor('liffraedi-2e')
  === 'mt-output'`; the map is frozen and has exactly one key.
- [ ] **Step 2: Run** `npx vitest run server/__tests__/servedLayer.test.js` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(server): one book-to-layer setting`.

### Task 6: The loader serves the Fable layer, failing closed

**Files:**
- Modify: `server/services/segmentParser.js` (`getModulePaths`, `loadModuleForEditing`)
- Test: `server/__tests__/segmentParserFable.test.js`

**Interfaces:**
- Consumes: `servedLayerFor` (Task 5).
- Produces: `getModulePaths(...)` gains `fable` and `fableTags`; `loadModuleForEditing` returns
  `isSource: 'fable'` for a Fable book with no faithful file, and segments carry `fableMeaning: { before: string } |
  null`. Refusal: throws an error with `code === 'FABLE_LAYER_MISSING'` and `message` = §6.10's loader refusal; the
  GET route maps that code to 409 with `{ error: 'FABLE_LAYER_MISSING', message }`.

- [ ] **Step 1: Failing tests** (temp book tree, as `segmentParser.test.js` builds one):
  - Fable book, Fable file present → `isSource === 'fable'`, `is` = Fable text;
  - only `meaning`-tagged segments have `fableMeaning.before`; a `fluency`-only segment has `fableMeaning === null`;
  - Fable file missing → throws `FABLE_LAYER_MISSING` (never falls back to MT);
  - **Review Focus 1:** tags file missing, and tags file with a non-JSON line → throws `FABLE_LAYER_MISSING`;
  - a segment in English and MT but absent from the Fable file → throws `FABLE_LAYER_MISSING`;
  - **Review Focus 2:** a repeated id: the flag attaches from the occurrence-0 tags line only;
  - **Review Focus 3:** faithful file present → `isSource === 'faithful'`, every `fableMeaning === null`;
  - another book → today's behaviour (`'mt-output'`), no `fableMeaning` key read;
  - `mtFinding` is `null` on every segment of a Fable-served unit.
- [ ] **Step 2: Run** `npx vitest run server/__tests__/segmentParserFable.test.js` — FAIL.
- [ ] **Step 3: Implement** the branch after the faithful check; keep the first-copy-wins lookup; read tags into a
  map keyed `segmentId` for `occurrence === 0`; map the code in the GET route (`server/routes/segment-editor.js`).
- [ ] **Step 4: Run** the new file plus `segmentParser*.test.js` and `servedVersions*.test.js` — PASS.
- [ ] **Step 5: Commit** `feat(editor): serve the Fable layer for chemistry, failing closed`.

### Task 6b: No flag on segments that held human text at the opening (spec amendment 1)

**Files:**
- Create: `server/services/fableFlags.js`
- Modify: `server/routes/segment-editor.js` (module GET, after the opening step and before the response)
- Test: `server/__tests__/fableFlags.test.js`

**Interfaces:**
- Consumes: `moduleOpenings.readOpening(conn, { book, chapter, moduleId }) → { openedAtMs, inflight:
  [{ segmentId, occurrence }] } | null`; segments from Task 6 carrying `fableMeaning`.
- Produces: `suppressFableFlags(opening, segments) → void` — sets `fableMeaning = null` on every segment when
  `opening` is null, and on each segment whose `(segmentId, occurrence)` is in `opening.inflight` (occurrence `-1`
  matches every occurrence of that id); and `isFableFlagVisible(opening, segmentId, occurrence) → boolean`, the same
  rule for one segment, used by Task 10's route.

- [ ] **Step 1: Failing tests:** `opening === null` → every flag cleared; an inflight entry `(id, 0)` clears only that
  occurrence; `(id, -1)` clears every occurrence of the id; a segment not in the snapshot keeps its flag; an edit
  made after the opening (not in the snapshot) does not clear the flag; `isFableFlagVisible` agrees with
  `suppressFableFlags` on each of those cases. Route test (temp DB): the first serve by an assigned editor with an
  in-flight row on a flagged segment records the opening and returns that segment with `fableMeaning === null`; a
  second serve returns the same, after the row is applied too (the snapshot never changes).
- [ ] **Step 2: Run** `npx vitest run server/__tests__/fableFlags.test.js` — FAIL.
- [ ] **Step 3: Implement** both functions and call `suppressFableFlags` in the GET route with the opening the
  route already reads for G1.23.
- [ ] **Step 4: Run** it, `moduleOpeningRoute.test.js` and `segmentParserFable.test.js` — PASS.
- [ ] **Step 5: Commit** `feat(editor): no Fable flag where human text was in flight at the opening`.

### Task 7: Migration admitting layer `'fable'`

**Files:**
- Create: `server/migrations/061-served-layer-fable.js`; register it in `server/services/migrationRunner.js`
- Test: `server/__tests__/migration061.test.js`

**Interfaces:**
- Produces: `served_text_versions.layer` CHECK admits `'mt-output', 'faithful', 'selected', 'fable'`; every row and
  index preserved; idempotent; never throws.

- [ ] **Step 1: Failing tests:** on a DB at 060 with rows, `up()` keeps every row byte-identical and the same
  indexes; an insert with `layer = 'fable'` succeeds after, fails before; a second `up()` is a no-op; a malformed
  table makes `up()` report and leave the prior state (no throw).
- [ ] **Step 2: Run** `npx vitest run server/__tests__/migration061.test.js` — FAIL.
- [ ] **Step 3: Implement** a table rebuild inside one transaction (create new, copy, drop, rename, recreate
  indexes), skipped when the CHECK already admits `'fable'`.
- [ ] **Step 4: Run** it, `freshMigratedDb.test.js`, and the `verify-migration-convergence` skill — PASS.
- [ ] **Step 5: Commit** `feat(db): served_text_versions admits layer 'fable'`.

### Task 8: The assign gate waits on the setting

**Files:**
- Modify: `server/services/assignmentGate.js`; `server/verification/assign-gate/AssignGate.tla` (+ `.cfg`,
  `replay-findings.js` as needed)
- Test: `server/__tests__/assignmentGate.test.js`

**Interfaces:**
- Consumes: `servedLayerFor` (Task 5).
- Produces: reason `'served-layer-not-fable'` replacing `'suggestion-view-off'` at the same position; its message is
  §6.10's assign refusal.

- [ ] **Step 1: Failing tests:** a study book with the setting `'fable'` and every other condition met → `null`
  even with the `suggestion-view` switch off; with `servedLayerFor` stubbed to `'mt-output'` → the new reason;
  the old reason no longer appears in `REFUSAL_MESSAGES`.
- [ ] **Step 2: Run** `npx vitest run server/__tests__/assignmentGate.test.js` — FAIL.
- [ ] **Step 3: Implement**; update the TLA+ model (replace `viewOn` in the gate by a constant layer flag; drop the
  R6 invariant, add "no study unit opens unless the layer is fable").
- [ ] **Step 4: Run** the test file, `assignmentEnforcement.test.js`, and the `verify-assign-gate` skill — PASS.
- [ ] **Step 5: Commit** `feat(assign-gate): wait on the Fable layer being served (R6 superseded)`.

### Task 9: No term suggestions on a Fable-served book

**Files:**
- Modify: `server/services/suggestionView.js` (`eligibility`)
- Test: the existing suggestion-view test file (find it with `grep -l eligibility server/__tests__`)

- [ ] **Step 1: Failing test:** `eligibility(conn, { book: 'efnafraedi-2e', … })` returns
  `{ eligible: false, reason: 'fable-layer', opening: null }` even with the switch on and an opening after it.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** the check right after the study-book check.
- [ ] **Step 4: Run** the suggestion-view tests — PASS (update any test that assumed chemistry eligible).
- [ ] **Step 5: Commit** `feat(suggestion-view): none for a Fable-served book`.

### Task 10: The research event and its route

**Files:**
- Modify: `server/lib/researchVocabulary.js` (`EVENT_TYPES`), `server/services/researchEmission.js`,
  `server/routes/segment-editor.js`
- Test: `server/__tests__/fableComparisonOpened.test.js`

**Interfaces:**
- Produces: event type `'fable-comparison-opened'`; `emitFableComparisonOpened(req, { book, chapter, moduleId,
  segmentId, occurrence, servedVersionId })` (template: `emitSuggestionLeftOpen`; `editingKind: null`,
  `items: []`, `detail: {}`); route `POST /:book/:chapter/:moduleId/fable-comparison-opened` with the same
  middleware chain as `/accept`, body `{ segmentId, occurrence }`.
- Route behaviour: reloads the module; 400 `{ error: 'NOT_FLAGGED' }` unless that segment has `fableMeaning` and
  `isFableFlagVisible(readOpening(...), segmentId, occurrence)` (Task 6b) is true;
  otherwise emits and answers 204 (also for a non-consenting editor: `record` skips).

- [ ] **Step 1: Failing tests:** consenting editor → 204 and one research row of the new type with segmentId,
  occurrence and the served version id; **Review Focus 4:** non-consenting and withdrawn editor → 204 and no row;
  unflagged segment → 400 and no row; a flagged segment suppressed by the opening snapshot (Task 6b) → 400 and no
  row; unauthenticated → the chain's 401; another book's editor → the chain's 403.
- [ ] **Step 2: Run** `npx vitest run server/__tests__/fableComparisonOpened.test.js` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it, `researchLog*.test.js`, and the `verify-research-withdrawal` skill — PASS.
- [ ] **Step 5: Commit** `feat(research): record when a consenting editor opens the Fable comparison`.

### Task 11: The flag, the comparison and the word diff (client)

**Files:**
- Create: `server/public/js/word-diff.js` (UMD/CommonJS-loadable like `segment-validation.js`)
- Modify: `server/public/js/segment-editor.js` (row render beside `mtFindingHtml`; module badge; source label)
- Test: `server/__tests__/wordDiff.test.js`; `server/e2e/fable-flag.spec.js`

**Interfaces:**
- Produces: `wordDiff(before: string, after: string) → Array<{ op: 'same'|'del'|'ins', text: string }>` and
  `renderWordDiffHtml(ops) → string`.

- [ ] **Step 1: Failing unit tests:** identical strings → one `same`; one changed word → `del` + `ins`;
  **Review Focus 5:** a `[[term:x|term-00001]]` marker is one token and is never split; `<b>&"'` in either text
  comes out escaped in `renderWordDiffHtml`; joining `same`+`ins` texts reproduces `after`, `same`+`del` reproduces
  `before`.
- [ ] **Step 2: Run** `npx vitest run server/__tests__/wordDiff.test.js` — FAIL.
- [ ] **Step 3: Implement** a word-level LCS (tokens: `[[…]]` markers, words, whitespace runs, punctuation);
  render the flag line in the `term-issue` warning style with §6.10's flag text and button; the button opens a
  read-only panel (heading §6.10, English above, diff below) and POSTs Task 10's route once per opening; the source
  label for `isSource === 'fable'` is §6.10's.
- [ ] **Step 4: Run** the unit test — PASS; write `server/e2e/fable-flag.spec.js` (a flagged segment shows the flag
  and opens the comparison; an edited, unflagged segment shows no marker; the fixture unit is opened by an assigned
  editor with no in-flight row on the flagged segment, since Task 6b clears every flag before an opening) and run `npm run test:e2e` in `server/`
  against a throwaway DB — PASS.
- [ ] **Step 5: Commit** `feat(editor): the meaning flag and the comparison`.

### Task 12: The freeze manifest's new inputs

**Files:**
- Modify: `server/scripts/study-freeze.js` (`INPUT_DIRS`, `buildManifest`, `layerRecords`, `compareToManifest`);
  `server/verification/mt-lock/MtLock.tla` (the writer as a writer of a unit)
- Test: `server/__tests__/studyFreezeManifest.test.js` (and the compare tests beside it)

**Interfaces:**
- Produces: units gain `fableSha256`, `fableTagsSha256`; `layers.fable = { dir: '02-mt-fable', sourcesSha256,
  provenanceSha256 }` (a tab-separated `rel\tsha\n` list, as `layer2Record` does); `compareToManifest` adds to
  `inputChanged` when `was.fableSha256 !== undefined` and the file's hash differs.

- [ ] **Step 1: Failing tests:** a manifest built on a tree with the layer carries both hashes per unit and the
  `fable` record; changing one Fable file byte → `inputChanged` names that unit; a manifest without `fableSha256`
  (the 2026-11-22 one) still compares as before.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**; update the MT-lock model and run the `verify-mt-lock` skill.
- [ ] **Step 4: Run** the freeze test files — PASS. (`studyFreezeGuard.test.js` still compares against the 11-22
  manifest and now FAILS with "served text changed" — expected until Task 13.)
- [ ] **Step 5: Commit** `feat(freeze): the Fable layer is a manifest input`.

### Task 13: Spec amendments, the re-cut, the register

**Files:**
- Modify: `docs/superpowers/specs/2026-11-03-served-version-and-event-log-design.md` (dated note: §5.2 adds
  `'fable'`, §5.9 adds `fable-comparison-opened`); `docs/superpowers/specs/2026-11-19-g17-freeze-and-mt-lock-design.md`
  (dated note: the new inputs); the register's ⏩ RESUME block
- Create: `books/efnafraedi-2e/freeze/freeze-efnafraedi-2e-<date>/` (by the script)

- [ ] **Step 1:** write the two dated notes.
- [ ] **Step 2:** on [USER]'s go, run `node server/scripts/study-freeze.js manifest --write --tag
  freeze-efnafraedi-2e-<date> --supersedes freeze-efnafraedi-2e-2026-11-22` on a clean tree; expect
  `counts.byLayer` = `{ "fable": <segments> }`.
- [ ] **Step 3:** run `npx vitest run server/__tests__/studyFreezeGuard.test.js` — PASS against the new manifest;
  then `npm test` from the root and the server's e2e — PASS.
- [ ] **Step 4:** update the register (the re-cut, PR 2) and commit
  `feat(freeze): re-cut for the Fable layer`; push and open PR 2 on [USER]'s word.
- [ ] **Step 5 (after merge and deploy, spec §9):** read `/api/health`; for one unit per chapter, check the served
  text hashes to its Fable file; the freeze `check` passes on the deployed tree; the gate no longer refuses a
  consenting, licensed editor. Assigning is [USER]'s.
