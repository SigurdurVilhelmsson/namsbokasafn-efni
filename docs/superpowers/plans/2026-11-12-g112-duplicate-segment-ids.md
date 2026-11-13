# G1.12 Duplicate Segment Ids Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop chemistry's extractor from emitting a nested note's paragraphs twice, so that 285 duplicated segment
ids in 83 modules disappear, and make the editor loader pair the first Icelandic copy, which is the copy every other
reader already uses.

**Architecture:** In `processExample`, the nested note's second emission of a paragraph the example walk already
emitted takes its counter slot and emits no text (`addSegment.slotOnly`). As a result, structure, equations,
inline-attrs, `auto-N` ids and `[[MATH:n]]` numbers stay byte-identical. The loader's Icelandic lookup becomes
first-copy-wins. Chemistry's 83 affected modules are re-extracted (segment files and manifests only), and committed
corpus tests pin the survivor rule through inject, render and the loader.

**Tech Stack:** Node 22 ESM tools (`tools/`), CommonJS server (`server/`), Vitest, `@xmldom/xmldom`.

**Spec:** `docs/superpowers/specs/2026-11-12-g112-duplicate-segment-ids-design.md` (frozen, approved 2026-11-12).
Read its §3 (measurements), §5 (design), §7 (what the PR must show) and §8 (landing) before starting.

## Global Constraints

- **Never write** `books/*/01-source/`, `books/*/02-mt-output/`, `books/*/02-mt-revised/` or `books/*/ai-review/`.
  Pure MT keeps both Icelandic copies (CLAUDE.md § Purpose: no hand repairs to pure MT).
- **Generated content committed by this PR:** exactly the 83 affected chemistry modules'
  `02-for-mt/<chNN>/<module>-segments.en.md` and `02-structure/<chNN>/<module>-manifest.json`. Nothing for any
  other module or book. Nothing for organic, ever (CLAUDE.md § Organic).
- **Survivor rule:** English occurrence k pairs with Icelandic occurrence k. With one English occurrence, that is the
  first Icelandic copy.
- **Module systems:** `tools/` is ESM; `server/` is CommonJS. A server test imports vitest and node builtins with
  `import` and server modules with `createRequire(import.meta.url)`; copy the header from
  `server/__tests__/importConcepts.test.js`. A `tools/__tests__` file must not import `server/` code (root
  `LICENSE`, MIT→AGPL edges).
- **Paths:** new tests and scripts resolve the repo root from `import.meta.url`, never `process.cwd()`. Run
  `npm test` from the repo root.
- **`cnxml-extract --output-dir` is ignored and writes the real tree** (CLAUDE.md). Every before/after comparison runs
  in scratch `git worktree`s with both `node_modules` trees symlinked.
- **Scripts whose exit code is a verdict** set `process.exitCode = 1` on entry and overwrite it only when a verdict is
  reached; never `process.exit()` after writing to stdout (CLAUDE.md).
- **Census by parsing, not regex,** for CNXML shape (`@xmldom/xmldom`). Segment markers have no space after the
  colon: `<!-- SEG:m00001:para:fs-id001 -->`.
- **Mutation checks:** `cp` the file to a golden copy first, restore from it, and `cmp` after every round and once at
  the end (CLAUDE.md § mutation-test restore).
- **CI gate, run locally before handing over:** `npm test`, `npm run lint`, `npm run format:check`,
  `npm run docs:check`, `cd server && CI=1 npm run test:e2e`.
- **Commits:** one per task, ending with the attribution line. If the build process forbids commits while it runs,
  checkpoint each task as a tree and build the commits afterwards. No push, PR, merge or deploy without [USER].

## Review Focus

1. **A titled answer paragraph in a nested note** (`<para id><title>Answer</title> text</para>`): the walk emits
   `para-title` plus a body-only `para`, and the note's emission is `"Answer text"` under the same id. Expect the
   walk's two segments to survive and the note's copy to be slotted. Pinned in Task 1 (fixture D).
2. **Two sibling nested notes in one example:** each paragraph emitted once, in the walk's order. Pinned in Task 1
   (fixture E).
3. **An empty paragraph in a nested note:** neither side emits it, and later `auto-N` ids do not move. Pinned in
   Task 1 (fixture F).
4. **A top-level note** (not inside an example): its emissions are untouched, since it is `processNote`'s other
   caller. Pinned in Task 1 (fixture H).
5. **An empty first Icelandic copy** would be served as empty under the first-copy rule. The corpus holds none (0 of
   285, measured 2026-11-12); Task 4's loader corpus test asserts that property so a future re-buy cannot introduce
   one silently.

---

### Task 1: The extractor keeps the first copy

**Files:**

- Modify: `tools/cnxml-extract.js`: add `addSlotOnly` beside `addKeyedSegment` (≈ lines 905–915); record emitted ids
  in `processExample`'s "Process all paragraphs" loop (the `addSegment('para', text, para.id)` call, ≈ line 2262);
  wrap the emitter in its notes loop (≈ lines 2359–2364)
- Test: `tools/__tests__/cnxml-extract-nested-note-duplicate.test.js` (new)

**Interfaces:**

- Produces: `addSegment.slotOnly(type: string, text: string, elementId: string | null = null): string | null`. It
  does exactly what `addSegment` does except `segments.push`: returns `null` for blank text without touching the
  counter, otherwise bumps `counters.segment`, mints the id with `generateSegmentId(moduleId, type, elementId,
counters.segment)`, and moves `lastInlineAttrs` into `inlineAttrsMap[segmentId]` (then nulls it). Exposed as a
  property, like `addSegment.keyed`.
- Produces (local to `processExample`): `emittedParaIds: Set<string>`, the ids for which the walk's `para`
  `addSegment` call returned an id.
- The notes loop passes `processNote` an emitter that routes `(type === 'para' && elementId &&
emittedParaIds.has(elementId))` to `addSegment.slotOnly` and everything else to `addSegment`, and carries the
  `.keyed` and `.slotOnly` properties through. Key the skip on that id set, never on the type alone (spec §5.1).
  `processNote`'s top-level caller is unchanged.

- [ ] **Step 1: Write the failing tests**

Use the `wrapDoc` helper from `tools/__tests__/cnxml-extract-example-title.test.js` (no metadata, so the module id
is `unknown`). Let `ids = (r) => r.segments.map((s) => s.id)` and `textOf = (r, id) => r.segments.filter((s) => s.id
=== id).map((s) => s.text)`. Fixtures and assertions; every expected value below was measured against HEAD's output
on 2026-11-12, minus the later duplicate:

```js
// A: nested note para with math, then a later para with math and an id-less table entry
// <example id="ex-1"><para id="p-1"><title>Worked example</title> First body.</para>
//   <note id="n-1"><para id="p-2">Answer is <m:math><m:mn>2</m:mn></m:math> and <m:math><m:mn>3</m:mn></m:math>.</para></note></example>
// <para id="p-3">After, <m:math><m:mn>4</m:mn></m:math>.</para> + a one-cell <table summary="">
expect(ids(a)).toEqual([
  'unknown:title:auto-1',
  'unknown:title:s1-title',
  'unknown:example-title:ex-1-title',
  'unknown:para:p-1',
  'unknown:para:p-2',
  'unknown:para:p-3',
  'unknown:entry:auto-8',
]);
expect(textOf(a, 'unknown:para:p-2')).toEqual(['Answer is [[MATH:1]] and [[MATH:2]].']);
expect(textOf(a, 'unknown:para:p-3')).toEqual(['After, [[MATH:5]].']);
expect(Object.keys(a.equations)).toEqual(['math-1', 'math-2', 'math-3', 'math-4', 'math-5']);
// structure unchanged: the example keeps its p-2 entry AND the note node keeps its p-2 entry
// round trip (parseSegments(formatSegmentsMarkdown(segments)) → buildCnxml): <para id="p-2"> holds 2 <m:math>

// B: a title-only para in the nested note: the note's 'para:p-9' is NOT a repeat of a walk emission
// <note id="n-2"><para id="p-9"><title>Only a heading</title></para><para id="p-10">Body.</para></note>
expect(ids(b)).toEqual([
  'unknown:title:auto-1',
  'unknown:title:s1-title',
  'unknown:example-title:ex-2-title',
  'unknown:para:p-1',
  'unknown:para-title:p-9-title',
  'unknown:para:p-10',
  'unknown:note-title:n-2-title',
  'unknown:para:p-9',
]);

// C: inline attrs do not leak: a term in the nested para, then a bare <media id="med-1" alt="A flask"> in the note
expect(c.inlineAttrs).toEqual({ 'unknown:para:p-2': { terms: [{ id: 't-1' }] } }); // no key for unknown:alt:med-1-alt

// D (Review Focus 1): <note id="n-1"><para id="p-2"><title>Answer</title> The answer.</para></note>
expect(textOf(d, 'unknown:para:p-2')).toEqual(['The answer.']);
expect(textOf(d, 'unknown:para-title:p-2-title')).toEqual(['Answer']);
// E (Review Focus 2): two sibling notes holding p-2 and p-3 → ids end with para:p-1, para:p-2, para:p-3, once each
// F (Review Focus 3): <para id="p-2"> </para><para id="p-3">Real.</para> + table → para:p-3 once, then entry:auto-7
// G (boundary): an id-less para in the nested note stays emitted twice, as para:auto-5 and para:auto-6 (unchanged)
// H (Review Focus 4): a top-level <note id="n-9"><para id="p-8">…</para></note> → para:p-8 once (unchanged)
```

_Why fixture B, not the list-item fixture spec §7 item 5 names:_ `processList` emits only `item` segments
(measured 2026-11-12), so a list-item paragraph cannot tell an id-keyed skip from a type-keyed one. A title-only
paragraph can: the walk emits it as `para-title`, never as `para`, so only the id set keeps the note's `para:p-9`.

- [ ] **Step 2: Run the tests and confirm which fail**

Run: `npx vitest run tools/__tests__/cnxml-extract-nested-note-duplicate.test.js`
Expected: A, B, D, E and F FAIL (each lists the repeated id twice). C, G and H PASS (they pin behaviour the change
must not alter).

- [ ] **Step 3: Implement `addSegment.slotOnly` and the notes-loop emitter in `tools/cnxml-extract.js`**

Add a comment block at the notes loop explaining the cut in container-rule terms: the owner is the walk's emission,
which is the one `buildExampleDom` injects; the slot keeps `auto-N`, `[[MATH:n]]` and inline-attrs byte-identical;
and the reference is G1.12, spec §5.1.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tools/__tests__/cnxml-extract-nested-note-duplicate.test.js tools/__tests__/cnxml-extract*.test.js`
Expected: all PASS.

- [ ] **Step 5: Mutation check for fixture C**

Golden-copy `tools/cnxml-extract.js`, delete the two `lastInlineAttrs` lines from `addSlotOnly`, and re-run the new
file. Expected: fixture C FAILS (the alt gains `p-2`'s terms). Restore from the golden copy, then `cmp`.

- [ ] **Step 6: Commit**

```bash
git add tools/cnxml-extract.js tools/__tests__/cnxml-extract-nested-note-duplicate.test.js
git commit -m "fix(extract): a nested note's repeated para takes its slot and emits no text (G1.12)"
```

### Task 2: The loader pairs the first Icelandic copy

**Files:**

- Modify: `server/services/segmentParser.js` (`loadModuleForEditing`, the `isLookup` loop ≈ lines 130–136)
- Modify (comments only; each must stay true afterwards): `server/services/servedVersions.js:15-17`,
  `server/services/servedEdit.js:15-16,111`, `server/services/propagationService.js:37,47`,
  `server/routes/segment-editor.js` (≈ 1128 and ≈ 1891), `server/public/js/segment-save-state.js:381`
- Test: `server/__tests__/duplicateIdFirstCopy.test.js` (new)

**Interfaces:**

- Consumes: nothing from Task 1.
- Produces: `loadModuleForEditing(book, chapter, moduleId)`, unchanged signature. For an id occurring more than once
  in the Icelandic file, `is` comes from the first occurrence. For every id occurring once, the output is identical.

- [ ] **Step 1: Write the failing tests**

Set up a temp books dir, the DB and the hook spies exactly as `server/__tests__/acceptanceApply.test.js` does
(`segmentParser._setTestBooksDir`, `service._setTestBooksDir`, `_setTestDb`). Book `dupfirstbook`, module `m00001`,
chapter 1:

```text
02-for-mt/ch01/m00001-segments.en.md          02-mt-output/ch01/m00001-segments.is.md
<!-- SEG:m00001:para:fs-id001 -->              <!-- SEG:m00001:para:fs-id001 -->
Alpha [[MATH:1]].                               Alfa [[MATH:1]].
<!-- SEG:m00001:para:fs-id002 -->              <!-- SEG:m00001:para:fs-id002 -->
Beta.                                           Beta-is.
                                                <!-- SEG:m00001:para:fs-id001 -->
                                                Alfa [[MATH:2]].
```

Tests:

- `serves the first Icelandic copy when English has one occurrence`: the `fs-id001` row's `is` is
  `'Alfa [[MATH:1]].'`, and there is exactly one such row.
- `the served row is minted, not treated as duplicated`: `servedVersions.versionRowsFor(data, { book, chapter: 1,
moduleId })` returns `duplicatedIds` equal to `[]`, and the `fs-id001` row's `isText` is `'Alfa [[MATH:1]].'`.
- `the R4 backstop still fires when English itself is duplicated`: with a second `fs-id001` block appended to the
  English file, `duplicatedIds` equals `['m00001:para:fs-id001']`.
- `apply writes one entry per id, from the first copy`: `saveAndApprove('m00001:para:fs-id002', 'Beta breytt.')`,
  then `service.applyApprovedEdits(BOOK, 1, MODULE)`. The faithful file parsed with `segmentParser.parseSegments`
  holds `fs-id001` exactly once, with content `'Alfa [[MATH:1]].'`.

- [ ] **Step 2: Run the tests and confirm which fail**

Run: `npx vitest run server/__tests__/duplicateIdFirstCopy.test.js`
Expected: the first, second and fourth FAIL (the loader serves `'Alfa [[MATH:2]].'`); the R4 test PASSES.

- [ ] **Step 3: Make `isLookup` first-copy-wins in `loadModuleForEditing`**

Guard the assignment with `Object.hasOwn(isLookup, seg.segmentId)`. Keep `unescapeMtMarkers` applied to every
record, as now. Add a one-line comment citing the survivor rule and G1.12, spec §5.2.

- [ ] **Step 4: Rewrite the comment sites**

Every site listed under **Files** describes the state "until G1.12": the loader serving the last copy, or
"(b)" being built. Rewrite each to say what is true now: the guard stays as a backstop for any future duplicate; no
chemistry id is duplicated since G1.12 (a); the loader pairs the first Icelandic copy; and (b) was not built. Do not
change any code on those lines.
Run: `grep -rnaE "until G1\.12|last copy's Icelandic|G1\.12 \(b\)" server/`
Expected: no output.

- [ ] **Step 5: Census the other id-keyed Icelandic readers (spec §5.2)**

For `tools/generate-tm.js`, `tools/export-corpus.js`, `tools/lib/tm-export.cjs`, `server/lib/sourceEnglish.js`,
`server/routes/localization-editor.js`, and any other hit of `grep -rlaE "02-mt-output|03-faithful-translation"
tools/*.js tools/lib server/services server/lib server/routes`, record how each resolves an id that occurs twice in
an Icelandic file: first copy, last copy, through the loader or faithful file, or not id-keyed. Put the table in the
commit message (Task 5 copies it into `VERIFICATION.md`). A reader that takes the **last** copy is changed in this
task to take the first, with a test in the same style as Step 1. If the change is not a one-line guard, stop and
bring it to [USER] (spec §5.2).

- [ ] **Step 6: Run the tests and the server suites that load modules**

Run: `npx vitest run server/__tests__/duplicateIdFirstCopy.test.js server/__tests__/servedVersionsIntegrity.test.js server/__tests__/servedEdit.test.js server/__tests__/servedSaveRoute.test.js server/__tests__/acceptanceApply.test.js server/__tests__/suggestionCorpus.test.js`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add server/services/segmentParser.js server/services/servedVersions.js server/services/servedEdit.js server/services/propagationService.js server/routes/segment-editor.js server/public/js/segment-save-state.js server/__tests__/duplicateIdFirstCopy.test.js
git commit -m "fix(editor): the loader pairs the first Icelandic copy of a repeated id (G1.12)"
```

### Task 3: Re-extract the 83 modules, with the census and the byte-identity proof

**Files:**

- Create: `tools/__tests__/segment-ids-unique-corpus.test.js`
- Create: `test-results/g112-duplicate-ids-2026-11-12/verify-cut.mjs`, and its output `verify-cut.txt`
- Regenerate: the 83 modules' `books/efnafraedi-2e/02-for-mt/<chNN>/<module>-segments.en.md` and
  `books/efnafraedi-2e/02-structure/<chNN>/<module>-manifest.json`
- Create: `experiments/ai-review-pilot/suggestion-view-references-<build date>/references.json` and its `README.md`
  (the 2026-11-09 directory stays frozen)
- Modify: `server/__tests__/suggestionCorpus.test.js` (its reference path) and
  `server/__tests__/servedVersionsIntegrity.test.js` (its expected sets), both premise-correcting (Step 6)

**Interfaces:**

- Consumes: Task 1's extractor.
- Produces: `verify-cut.mjs --base <ref> [--list]`.
  - With `--list`, it prints one `<chNN> <module>` line per affected module, read from `<ref>`.
  - Without it, it prints the census and the comparison and ends with `RESULT: PASS` or `RESULT: FAIL`.
  - Its exit code is the verdict.

- [ ] **Step 1: Write the failing corpus property**

`segment-ids-unique-corpus.test.js` walks `books/*/02-for-mt/*/*-segments.en.md`, skipping legacy artifacts whose
name matches `/\([a-z]\)\.en\.md$/`. It parses each file with `parseSegmentRecords` from `tools/lib/seg-markers.cjs`
(the recognizer the loader uses), then asserts:

- the walk found more than 500 files (the empty-walk control; 611 at 2026-11-12);
- the helper reports a duplicate for a planted two-block string with one repeated id (the expected-FAIL control);
- the list of `{ file, id }` with an id occurring more than once in its file equals `[]`. The failure message names
  the first offender.

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run tools/__tests__/segment-ids-unique-corpus.test.js`
Expected: FAIL, listing 285 ids in 83 files, starting from a chemistry module.

- [ ] **Step 3: Write `verify-cut.mjs`**

Read the base side with `execFileSync('git', ['show', `${base}:${path}`])`. The checks, each printed with its
numbers:

- **Census on base** (spec §7 item 1):
  - duplicated ids in chemistry `02-for-mt/*/m*-segments.en.md`: 285 ids in 83 modules;
  - each id's element (xmldom, by `id` attribute) occurs once in `01-source` and is a `para` whose parent is `note`,
    whose parent is `example`;
  - English copies are equal after replacing `/\[\[(MATH|MEDIA|TABLE):\d+\]\]/g` with `[[$1]]`: 0 differ;
  - Icelandic copies in `02-mt-output` differ after normalising `MATH`: 6, listed by chapter, module and id (the
    spec's §6 item 3 list).
- **Changed set:** `git diff --name-only <base> -- books/` equals exactly the 83 segment files plus the 83 manifests.
- **Segment files:** each equals the base file with every later block of a repeated id removed, byte for byte (the
  block is the text from one SEG marker up to the next), and holds no repeated id.
- **Manifests:** each differs from base only in `extractedAt`. `segmentCount` is the base count minus that module's
  removed blocks; `segmentIds` is the base list with later repeats removed, order otherwise unchanged; every other
  key is deep-equal.
- **Everything else** under `books/efnafraedi-2e/02-structure/` is unchanged (a consequence of the changed-set
  check; print the count of files compared).

- [ ] **Step 4: Run the census, then re-extract the 83 modules**

Run: `node test-results/g112-duplicate-ids-2026-11-12/verify-cut.mjs --base HEAD --list | wc -l`
Expected: `83` (none in `appendices`).
Run: `node test-results/g112-duplicate-ids-2026-11-12/verify-cut.mjs --base HEAD --list | while read ch mod; do node tools/cnxml-extract.js --book efnafraedi-2e --chapter $((10#${ch#ch})) --module "$mod" || echo "FAILED $ch $mod"; done`
Expected: no `FAILED` line.
Run: `git status --porcelain books/ | wc -l`
Expected: `166`.

- [ ] **Step 5: Run the proof and the corpus property**

Run: `node test-results/g112-duplicate-ids-2026-11-12/verify-cut.mjs --base HEAD | tee test-results/g112-duplicate-ids-2026-11-12/verify-cut.txt`
Expected: ends with `RESULT: PASS`; exit 0.
Run: `npx vitest run tools/__tests__/segment-ids-unique-corpus.test.js`
Expected: PASS.

- [ ] **Step 6: Run the whole suite and correct the two premise-pinning tests**

Run: `npm test`
Expected: exactly two red files, `server/__tests__/servedVersionsIntegrity.test.js` and
`server/__tests__/suggestionCorpus.test.js`. Both pin the pre-G1.12 state by name: the three `#0` chains as the
only integrity failures, and the `#1` chains matched through the builder. Any other red file is investigated by name
before anything is changed.

The prediction (spec §3 and §5.4): every `#0` chain now matches, and the ten `#1` chains fail, because their
occurrence is no longer served:

```text
ch05/m68726/m68726:para:fs-idm5945296#1     ch08/m68747/m68747:para:fs-idm171143328#1
ch05/m68726/m68726:para:fs-idm94618544#1    ch08/m68747/m68747:para:fs-idm99049568#1
ch07/m68742/m68742:para:fs-idp55819408#1    ch10/m68761/m68761:para:fs-idm91556848#1
ch08/m68744/m68744:para:fs-idp204958944#1   ch10/m68768/m68768:para:fs-idm44101792#1
ch21/m68851/m68851:para:fs-idm46993968#1    ch10/m68773/m68773:para:fs-idp76470512#1
```

- Regenerate the references, as their README says to after a re-extraction:
  `node server/scripts/suggestion-view-references.js --out experiments/ai-review-pilot/suggestion-view-references-<build date>`.
  Diff its `references.json` against the 2026-11-09 one. Expected: only `date` and `integrityFailures` differ,
  and `integrityFailures` is exactly the ten keys above. Write its `README.md`: what it supersedes (the 2026-11-09
  reference, for check 2 only), why (G1.12's re-extract), and the same method lines. Point `suggestionCorpus.test.js`
  at the new directory.
- In `servedVersionsIntegrity.test.js`:
  - `mismatched` equals the ten keys;
  - `bodyDisagrees` equals the same ten (an unserved occurrence has no entry);
  - every `matchedByBuilder` key starts with `ch00/`, since no chemistry id is duplicated any more;
  - rewrite the comment that explains the old expectation (R4, last copy served).

Run: `npm test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add books/efnafraedi-2e/02-for-mt books/efnafraedi-2e/02-structure tools/__tests__/segment-ids-unique-corpus.test.js test-results/g112-duplicate-ids-2026-11-12/verify-cut.mjs test-results/g112-duplicate-ids-2026-11-12/verify-cut.txt experiments/ai-review-pilot server/__tests__/suggestionCorpus.test.js server/__tests__/servedVersionsIntegrity.test.js
git commit -m "chore(efnafraedi-2e): re-extract the 83 duplicate-id modules (G1.12)"
```

Before committing, `git diff --cached --stat` must show exactly the 166 generated files, the three new `test-results`
and test files, the new reference directory, and the two corrected tests.

### Task 4: Corpus pins for the survivor rule and the controlled render pair

**Files:**

- Create: `tools/__tests__/duplicate-id-survivor-corpus.test.js`
- Create: `server/__tests__/duplicateIdLoaderCorpus.test.js`

**Interfaces:**

- Consumes:
  - committed chemistry files;
  - `extractSegments` (Task 1);
  - `buildCnxml` and `parseSegments` from `tools/cnxml-inject.js`;
  - `renderCnxmlToHtml` from `tools/cnxml-render.js`;
  - `renderEnglishRoundTrip` from `tools/render-oracle-check.js`;
  - `loadModuleForEditing` (Task 2), `versionRowsFor`, `unescapeMtMarkers` and `normalizeTermMarkers`.
- Population, both files: chemistry modules whose committed `02-mt-output` Icelandic file holds an id more than once.
  Assert the population is 285 ids in 83 modules, a measured pin with a comment citing the spec's §3.

- [ ] **Step 1: Write the tools-side corpus test**

Match values the way `tools/__tests__/caption-writeback-corpus.test.js` does: parse with xmldom (rendered HTML as
`'text/html'`, the whole document), find the element by id, and compare its whitespace-normalised `textContent` as a
whole value, never with `includes`.

- `inject and render carry the first copy, never the second`: for each module, build the planted Icelandic text in
  memory. Occurrence 0 of each repeated id gets the body `G112FIRST<n>`, occurrence 1 gets `G112LAST<n>`, and one
  non-repeated `para` per module gets `G112CTRL<n>` (the reach control). Then `parseSegments` →
  `buildCnxml(structure, parsed, equations, src, {}, inlineAttrs)` with the committed `02-structure` files and
  `01-source`, then `renderCnxmlToHtml(cnxml, { bookSlug: 'efnafraedi-2e' })`. Assert, at the `<para id>` in the
  CNXML and the element with that id in the HTML:
  - every FIRST token and every CTRL token is the whole value;
  - `G112LAST` occurs nowhere in either output.
- `controlled render pair`: for each module, `renderCnxmlToHtml(src)` (the direct arm) and
  `renderEnglishRoundTrip(src, 'efnafraedi-2e').html` give equal, non-null whitespace-normalised text at each of the
  285 paragraph ids.
- Give the file a timeout that fits 83 modules (measure the first run; set roughly twice that).

- [ ] **Step 2: Write the server-side corpus test**

- `one served row per repeated id, from the first copy, with its math`: for each module and each repeated id,
  `loadModuleForEditing` on the real books returns exactly one row. Its `is` equals
  `normalizeTermMarkers(en, unescapeMtMarkers(firstCopyBody))`, and the set of `[[MATH:n]]` tokens in `en` is
  contained in the set in `is` (0 failures). `versionRowsFor(...).duplicatedIds` is `[]`.
- `no first copy is empty` (Review Focus 5): every first Icelandic copy of a repeated id is non-blank.
- `the loader serves the planted first copy`: copy the 83 modules' English and Icelandic files to a temp books dir,
  plant FIRST and LAST tokens as above, `segmentParser._setTestBooksDir(temp)`, and load. Every repeated id's `is`
  is its FIRST token, and no row holds a LAST token. Restore the books dir in `afterAll`.

- [ ] **Step 3: Run both**

Run: `npx vitest run tools/__tests__/duplicate-id-survivor-corpus.test.js server/__tests__/duplicateIdLoaderCorpus.test.js`
Expected: PASS.

- [ ] **Step 4: Show each pin can fail**

With a golden copy of `server/services/segmentParser.js`, revert Step 3 of Task 2 (last copy wins) and re-run the
server file. Expected: FAIL, naming FIRST/LAST mismatches. Restore and `cmp`.
With a golden copy of the tools test, edit its planting function so occurrence 0 gets `G112LAST` and occurrence 1
gets `G112FIRST`, and re-run it. Expected: FAIL, with `G112LAST` found at the id-keyed elements. Restore and `cmp`.

- [ ] **Step 5: Commit**

```bash
git add tools/__tests__/duplicate-id-survivor-corpus.test.js server/__tests__/duplicateIdLoaderCorpus.test.js
git commit -m "test(g112): corpus pins for the first-copy survivor rule and the controlled render pair"
```

### Task 5: Before/after run, research record, register entry, gate

**Files:**

- Create: `test-results/g112-duplicate-ids-2026-11-12/before-after.sh`, its output `before-after.txt`, and
  `test-results/g112-duplicate-ids-2026-11-12/VERIFICATION.md`
- Modify: `docs/plans/2026-07-21-post-item17-followup-campaign.md` (a new ⏭ entry above the 2026-11-12 G1.12 entry,
  plus a new §C item for the out-of-scope finding below)

**Interfaces:**

- Consumes: the branch tip after Task 4, and a base ref (the commit the branch was cut from).
- Produces: `before-after.sh <base-ref>`, which needs `G112_SCRATCH` set to an empty directory. Its exit code is the
  verdict, and its last line is `RESULT: PASS` or `RESULT: FAIL`.

- [ ] **Step 1: Write `before-after.sh`**

For each side, base then branch, one at a time to spare the RAM-backed `/tmp`:

- `git worktree add --detach "$G112_SCRATCH/<side>" <ref>`, then symlink the root and `server/` `node_modules`.
- Run, saving stdout, stderr and exit code per command under `$G112_SCRATCH/out-<side>/`:
  - `cnxml-inject --book efnafraedi-2e --chapter <c> --source-dir 02-mt-output --track mt-preview` for chapters
    1–21 and `appendices`, then copy `books/efnafraedi-2e/03-translated/mt-preview` out, excluding `*.backup.*`;
  - `source-roundtrip-check efnafraedi-2e <dir>` for every chemistry chapter dir;
  - `render-oracle-check efnafraedi-2e ch01`, `ch03`, and `ch03 --control`;
  - `validate-chapter efnafraedi-2e <n> --track mt-preview` for chapters 1–21;
  - `cnxml-extract` for every chapter of `edlisfraedi-2e`, `liffraedi-2e`, `orverufraedi` and `lifraen-efnafraedi`,
    then copy their `02-for-mt` and `02-structure` out, with manifest `extractedAt` lines deleted.
- Then `git worktree remove --force` and `git worktree prune`.
- Diff the two output trees. The only accepted differences:
  - stderr lines `Note: N duplicate segment(s) skipped (first-match-wins)` present on base and absent on branch, 83
    in total per tool that parses English;
  - `validate-chapter` lines that are identical apart from timestamps.

  Anything else is `RESULT: FAIL`, with the differing lines printed.

- Exit codes must match per command on both sides.

- [ ] **Step 2: Run it**

Run: `G112_SCRATCH=<an empty dir under the session scratchpad> bash test-results/g112-duplicate-ids-2026-11-12/before-after.sh <base-ref> | tee test-results/g112-duplicate-ids-2026-11-12/before-after.txt`
Expected: `RESULT: PASS`; `git worktree list` afterwards shows no `g112` worktree.

- [ ] **Step 3: Measure the two research numbers** (spec §6 items 2 and 4)

- **Cost of the 285 unserved copies, on both bases, labelled:**
  - the ceiling is the raw bytes of those English blocks, marker lines included;
  - the expectation is §C91's model (raw minus marker lines minus one newline per segment);
  - convert both with `estimateIsk` in `tools/api-translate.js`, or its formula, cited, if it is not exported.
- **Chain-1 AI changes that become unservable:** for the 10 segments in the spec's §3 AI rows, count the kept groups
  `suggestionLogs.keptGroups(readModuleLog(...))` holds for occurrence 1, from `server/` with the service's own Node.
  Record the exact command in `VERIFICATION.md`.

- [ ] **Step 4: Write `VERIFICATION.md`**

One section per spec §7 item, each naming its evidence: `verify-cut.txt`, the test files, `before-after.txt` and the
mutation checks. Then the research record (spec §6):

- what changed and why, pointing at the spec;
- the six wording-different paragraphs (from `verify-cut.txt`), whose copy 0 is now the editors' baseline;
- Task 2's reader table;
- the two numbers from Step 3;
- the base commit hash as "the last commit before G1.12", which reproduces layer 2 (spec §6 item 5);
- the production check still owed by [USER] (spec §8).

- [ ] **Step 5: Register entry and the out-of-scope finding**

Add a ⏭ entry dated the build day: what shipped, the evidence directory, and that it is NOT merged or deployed. List
the landing conditions verbatim from spec §8:

- [USER]'s read-only production check returns zero rows;
- the last planned `term-pass apply --write` on chemistry is done;
- one PR, one deploy;
- before any of the 83 modules opens, before G1.7's freeze manifest and before G1.13.

Open a new §C item for the pre-existing quirk Task 1's fixtures B and D show: a nested note with no `<title>` of its
own gets a `note-title` segment holding its first paragraph's title (`processNote`'s first-`<title>` regex). Count it
on the corpus with xmldom before writing a number. Take the next free §C number after checking `git branch
--no-merged main` for collisions. G1.12 does not change it.

- [ ] **Step 6: Run the full gate**

Run: `npm test && npm run lint && npm run format:check && npm run docs:check && (cd server && CI=1 npm run test:e2e)`
Expected: all exit 0. Compare any failing set by name against `main`'s, as the register's gate entries do.
`server/e2e/suggestion-view.spec.js` drives `m68693`, one of the 83 (it loses one duplicate row; none of its AI
groups change). Check a red there against that before changing anything.

- [ ] **Step 7: Commit, then stop for [USER]**

```bash
git add test-results/g112-duplicate-ids-2026-11-12 docs/plans/2026-07-21-post-item17-followup-campaign.md
git commit -m "docs(g112): before/after evidence, research record and register entry"
```

Report to [USER]: the branch, the evidence, and the landing conditions. Push, PR, merge and deploy wait for their
word.
