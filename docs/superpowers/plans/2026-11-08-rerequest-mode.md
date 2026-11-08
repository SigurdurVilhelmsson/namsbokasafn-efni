# Re-request mode (layer 1s) and the authorized 8-segment buy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `--rerequest <ids>` mode to `tools/api-translate.js` that re-buys chosen untranslated segments through the guarded API path and writes the accepted ones to layer 1s (`02-mt-selected/`), then use it for the 8 untranslated September chemistry segments.

**Architecture:** Pure planning and classification live in a new `tools/lib/mt-rerequest.js`. The layer-1s writer and an append-only per-module attempt log are added to `tools/lib/mt-layers.js`, the only module allowed to write layer files. `api-translate.js` gets the flag, an attempt loop (`rerequestModule`, at most 2 attempts per segment) that sends only through `translateSegmentText`, and a separate branch of `main()`. The existing write loop is not touched.

**Tech Stack:** Node 22 ESM (`tools/`), Vitest, the Málstaður client (`tools/lib/malstadur-api.js`), git helpers in `tools/ai-review/provenance.js`.

**Spec:** `docs/plans/2026-10-10-chemistry-finish-preparation-plan.md` §2.3 ("The 8 untranslated September segments") and the authorization, `docs/decisions/2026-11-08-editing-gates-and-housekeeping-answers.md` item 5. The layer table is the same plan's §4 ("Where each text lives", row **1s**).

## What was measured before writing this (2026-11-08, on `83ef711af`)

Per CLAUDE.md § One source of truth, "the plan says X is missing" was run, not read:

- **The 8 segments.** `detectResidue(en, is).exact` (`tools/lib/residue-check.js`) over `02-mt-output` flags exactly these in their modules, and nothing else there. Each id occurs once (occurrence 0):
  - `m68744:para:fs-idp92007424` (ch08), the π-bond definition. It returned English on two earlier paid attempts (register, 2026-09-20 block).
  - `m68852:para:fs-idp10810528`, `m68852:para:fs-idm5999248`, `m68852:alt:fs-idp74884384-alt` (the table alt June lacks), `m68852:para:fs-idp183438528`, `m68852:para:fs-idp1433408`, `m68852:item:fs-idp258853168-item-1` (ch21).
  - `m68856:para:fs-idm211204656` (ch21).
  - English bodies total 5,794 characters, about 58 ISK per attempt by `estimateIsk`.
- **No existing mode reaches them.** `api-translate --top-up --dry-run` on `m68852` plans 0 missing segments. An undeclared `--rerequest` is silently dropped and the dry run exits 0.
- **Layer 1s has a reader and no writer.** `readBase`/`applyOverlay` (`mt-layers.js`) validate `mt-selected/1` overlays and already require `beforeSha256`. `gate` is unvalidated, "left to the re-request mode". Nothing writes `02-mt-selected/`, and chemistry has none.
- **June's text** (`9a69414d5`) exists for 7 of the 8, in the old `{{term}}…{{/term}}` marker dialect. Using it needs marker conversion.
- **Layer 2 is committed for all three modules** with `"overlay": null`. No committed layer-2 change or AI-review record touches any of the 8.
- **The paid-run guard hook** (`.claude/hooks/guard-paid-mt.mjs`) matches by tool filename. That is why the mode is a flag on `api-translate.js` and not a new tool.
- **`translateChunk` retries only when a glossary was sent.** Under `--no-glossary`, a marker-less one-segment response throws at once. `m68744` and `m68856` are one-segment wires.

## Global Constraints

- Writes `books/<slug>/02-mt-selected/` only. Never writes `02-mt-output/` or `01-source/` (CLAUDE.md § File Permissions; §2.3: "never over `02-mt-output`").
- No `--force`, and no `--force --module`: "it would rewrite the module and revert a `HAND REPAIR`" (§2.3).
- New translations come only from the API, through `translateSegmentText`. Never from an AI, and no hand repairs to pure MT (CLAUDE.md § Purpose; [USER] 2026-11-05).
- "June's API text is the fallback for the 7 that June translated." The table alt goes to editors as a flagged untranslated segment "if it comes back untranslated twice". So **two untranslated answers flag a segment**, counted across runs from the attempt log, and a flagged segment is never sent again. A *refused* response (no SEG marker, id-set defect, truncation) is a transport failure, not an answer: it does not count toward the two and the segment may be re-sent. Each run makes at most 2 sends per segment (`MAX_ATTEMPTS`).
- 15-3's answer is **not** in this buy. It joins only once §C208's fix lands.
- The paid run happens only after the mode is built and tested, a dry run's plan and cost have been shown to [USER], and [USER] says go. It is paid privately; record the cost in ISK.
- Prove a translation reached layer 1s **by value** (the body `readBase` returns at that key). Compare id **sets**, never counts.
- Never touch organic (`lifraen-efnafraedi`).
- Commit on `feat/rerequest-mode` only. Ask before any push or PR. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Nothing committed names a grant or fund.
- Run tests from the worktree root. Run `df -h /tmp` before the full suite (`/tmp` is a RAM disk).
- Before any PR: `npm test`, `npm run lint`, `npm run format:check`, `npm run docs:check`.

## Review Focus

1. **A one-segment response with no SEG marker** (`m68744`, `m68856`). It must count as a failed attempt and be retried once, never accepted. → Task 3, `retries a marker-less one-segment response once`.
2. **The MT rewrites a digit inside an element id** (`fs-idp74884384` → `…385`). ~~The existing id-set guard must refuse the response; the attempt is logged and nothing is written.~~ ✏️ *2026-11-08, measured during the build and re-measured by the review on the real m68852 wire: `repairSegTags` (§C174, strategy 3) **repairs** a plain digit rewrite to the right id, so the answer is accepted where it belongs. What the guard refuses is a rewrite that collides with another requested id.* → Task 3, `a digit rewritten inside an element id is repaired to the right id and accepted` and `a digit rewrite that collides with another requested id is refused, logged, and not written`.
3. **Re-running after a partial success.** An id already in the overlay must be refused before anything is sent. → Task 1 `already-selected`, Task 4 CLI case.
4. **Layer 1 changes after an entry was written** (a later HAND REPAIR or top-up). `readBase` must refuse the overlay the new writer produced. → Task 2, `an entry it wrote refuses once layer 1 changes`.
5. **A response that damages one segment's marker** but keeps every id. That segment is `held`; a clean sibling in the same response is still accepted. → Task 3, `holds a segment whose markers changed and accepts its clean sibling`.

---

### Task 1: Pure helpers — `tools/lib/mt-rerequest.js`

**Files:**
- Create: `tools/lib/mt-rerequest.js`
- Test: `tools/__tests__/mt-rerequest.test.js`

**Interfaces:**
- Consumes: `parseSegmentRecords` from `tools/lib/seg-markers.cjs`; `detectResidue` from `tools/lib/residue-check.js`; `SEGMENT_ID_RE` and `validateBody` from `tools/lib/mt-layers.js`.
- Produces:
  - `MAX_ATTEMPTS = 2`, `REREQUEST_RULE = 'rerequest'`
  - `parseRerequestIds(value: string) → string[]`. Throws `Error` naming the bad item.
  - `planRerequest({ enText: string, baseText: string, ids: string[], selectedKeys: Set<string>, untranslatedCounts: Map<string, number> }) → { requested: string[], refused: Array<{ id: string, why: RefusalCode }>, wireText: string }`, where `RefusalCode` is `'not-in-en' | 'not-in-is' | 'duplicated-id' | 'already-selected' | 'already-flagged' | 'not-untranslated'`. `baseText` is the layer-1 text with any overlay applied (`readBase(...).parsed.text`). `untranslatedCounts` maps an id to its untranslated answers so far (Task 2's `readRerequestOutcomes`); 2 or more → `already-flagged`.
  - `classifyAttempt({ enText: string, responseText: string, ids: string[] }) → Array<{ segmentId: string, outcome: 'translated' | 'untranslated' | 'held', body: string, reason: string | null }>`. A body that `validateBody` (`mt-layers.js`) refuses is `held`, with the problem codes joined as `reason`, because the overlay writer would refuse it.

- [ ] **Step 1: Write the failing tests**

Fixture: build `EN`/`IS` strings with `<!-- SEG:m100:para:pN -->` markers (no space after the colon, CLAUDE.md § SEG marker). Two segments are English in the IS: prose of at least 3 content words, not a formula, e.g. `Water boils at one hundred degrees under normal pressure.` One segment is Icelandic.

```js
describe('parseRerequestIds', () => {
  it('splits a comma list and trims each id', …)           // ' m100:para:p1, m100:para:p2 ' → both
  it('refuses an empty list', …)                           // ''  → throws /no ids/
  it('refuses an empty item (trailing comma)', …)          // 'm100:para:p1,' → throws
  it('refuses an id that is not three [\\w-] parts', …)    // 'm100:para' and 'm100:para:a.b'
  it('refuses an id whose module is not m<digits>', …)     // 'chapter:title:t1'
  it('refuses a repeated id', …)
});
describe('planRerequest', () => {
  it('requests an untranslated id and builds its wire text', …)
    // wireText === '<!-- SEG:m100:para:p1 -->\n<EN body>\n\n' exactly (planTopUp's shape)
  it('orders requested ids as the EN does, whatever order they were named in', …)
  it('refuses an id the EN lacks: not-in-en', …)
  it('refuses an id the IS lacks: not-in-is', …)
  it('refuses an id that occurs twice in the EN or the IS: duplicated-id', …)
  it('refuses an id already in the overlay: already-selected', …)
  it('refuses an id with two untranslated answers: already-flagged', …)
  it('control: an id with one untranslated answer is still requested', …)
  it('refuses an id whose base body is translated: not-untranslated', …)
  it('a refusal leaves the id out of the wire text', …)
});
describe('classifyAttempt', () => {
  it('an identity response is untranslated', …)            // response = wireText unchanged
  it('an Icelandic response is translated and carries the body as received', …)
  it('classifies each id on its own', …)                   // one of each in one response
  it('a translated body with a line break is held, reason line-break', …)
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tools/__tests__/mt-rerequest.test.js`
Expected: FAIL, `Cannot find module '../lib/mt-rerequest.js'`.

- [ ] **Step 3: Implement the module**

`planRerequest` checks in this order, one refusal per id: not-in-en, not-in-is, duplicated-id, already-selected, already-flagged, not-untranslated. Count occurrences over raw records, not a first-wins map, so a duplicated id is seen. `not-untranslated` is `!detectResidue(enBody, baseBody).exact`. Do not write a second untranslated test. `selectedKeys` holds occurrence keys (`segmentId` for occurrence 0), as `occurrenceKey` in `seg-markers.cjs` builds them. File header: pure, writes nothing, talks to no API.

- [ ] **Step 4: Run them and see them pass**

Run: `npx vitest run tools/__tests__/mt-rerequest.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/lib/mt-rerequest.js tools/__tests__/mt-rerequest.test.js
git commit -m "feat(mt-rerequest): plan and classify a re-request of chosen untranslated segments"
```

---

### Task 2: The layer-1s writer and the attempt log — `tools/lib/mt-layers.js`

**Files:**
- Modify: `tools/lib/mt-layers.js` (`SAFE_FILENAME_RE`, `applyOverlay`'s `gate` check and its comment, two new exports)
- Test: `tools/__tests__/mt-layers.test.js` (new `describe` blocks; reuse the file's temp `books/<slug>` fixture, `M100`, `sha256`, `SHA_A` and `codeOf` helpers)

**Interfaces:**
- Consumes: the module's private `resolveSafeDestination`, `assertNoRedirect`, `writeAtomic`, `applyOverlay`, `parseLayerFile`, `decodeUtf8Exact`.
- Produces:
  - `REREQUEST_SCHEMA = 'mt-rerequest/1'`
  - `readSelectedKeys({ bookDir, chapterDir, stem }) → Set<string>`: the occurrence keys the module's overlay already holds; an empty set when there is no overlay. Refuses a malformed overlay (`bad-overlay`), as `readBase` does.
  - `readRerequestOutcomes({ bookDir, chapterDir, stem }) → Map<string, number>`: per id, how many `untranslated` results the module's log holds; an empty map when there is no log. Refuses a malformed line (`bad-log`).
  - `writeSelectedOverlay({ bookDir, chapterDir, stem, entries }) → { file: string, overlaySha256: string }`. `entries` items have exactly the `mt-selected/1` entry keys: `{ segmentId, occurrence, text, beforeSha256, run, commit, rule, gate }`.
  - `appendRerequestLog({ bookDir, chapterDir, stem, record }) → { file: string, lines: number }`. Writes `02-mt-selected/<ch>/<stem>-rerequest.jsonl`. `record` has exactly these keys: `{ schema, module, runId, at, attempt, commit, glossaryArm, ids, chars, estimatedIsk, error, run, results }`. `results` items are `{ segmentId, outcome, body, reason }`, with `outcome` one of `'translated' | 'untranslated' | 'held' | 'refused'`. `body` is the response text as received, or `null` when the response was refused. `error` and `run` are `null` when they do not apply.

- [ ] **Step 1: Write the failing tests**

```js
describe('writeSelectedOverlay', () => {
  it('writes an overlay readBase applies: the body at the key is the entry text', …)
  it('leaves the layer-1 file byte-identical', …)                       // Buffer.equals before/after
  it('appends to an existing overlay and keeps the old entries in order', …)
  it('refuses a second entry for a key the overlay already has (duplicate-entry) and leaves the file unchanged', …)
  it('refuses an entry whose text equals the layer-1 body (no-op-entry)', …)
    // an untranslated answer must never become a 1s entry
  it('refuses an entry whose beforeSha256 is not the current body (bad-overlay)', …)
  it('an entry it wrote refuses once layer 1 changes', …)
    // write, then change the layer-1 body, then readBase → 'bad-overlay'
  it('refuses a 02-mt-selected that is a symlink (unsafe-destination)', …)
  it('writes nothing when any entry in the batch is refused', …)
});
describe('readSelectedKeys', () => {
  it('returns an empty set when there is no overlay', …)
  it('returns the keys of the entries the overlay holds', …)   // includes 'm100:para:p1#1' for occurrence 1
});
describe('applyOverlay gate', () => {
  it('refuses an entry whose gate is not a plain object', …)   // gate: 'ok' and gate: null → bad-overlay
});
describe('appendRerequestLog', () => {
  it('appends one JSON line and keeps the earlier lines byte-identical', …)
  it('refuses a record with a missing or extra key', …)
  it('refuses a record for another module', …)
  it('SAFE_FILENAME_RE accepts <stem>-rerequest.jsonl, and the log lands in 02-mt-selected/<ch>/', …)
});
describe('readRerequestOutcomes', () => {
  it('counts untranslated results per id across lines; refused and held do not count', …)
  it('returns an empty map when there is no log', …)
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tools/__tests__/mt-layers.test.js`
Expected: the new blocks FAIL (`writeSelectedOverlay is not a function`). Every existing test still passes.

- [ ] **Step 3: Implement**

- `writeSelectedOverlay`:
  1. Read layer 1 and any existing overlay.
  2. Refuse duplicate keys and no-op entries. Neither may be filtered silently: `applyOverlay` alone would drop a no-op, so check before it.
  3. Validate the merged overlay `{ schema: SELECTED_SCHEMA, module: stem, entries: [...old, ...new] }` by running it through `applyOverlay` against layer 1.
  4. Write atomically with `JSON.stringify(overlay, null, 2) + '\n'`.
  5. Prove the write: call `readBase` and assert each new key's body equals its `text`. A failure here throws `write-proof`.
- `appendRerequestLog` writes the old bytes plus one line through `writeAtomic`. It never truncates.
- `gate` must be a plain object. Update the comment in `applyOverlay` to name the re-request's gate shape, `{ check: 'detectResidue', untranslated: false, attempt: n }`.
- Both writers call `resolveSafeDestination` and `assertNoRedirect(book, LAYER_DIRS.selected, chapterDir)` before and after `mkdirSync`, as `writeRevisedChapter` does.

- [ ] **Step 4: Run them and see them pass**

Run: `npx vitest run tools/__tests__/mt-layers.test.js tools/__tests__/ai-review-term-pass.test.js tools/__tests__/ai-review-worklist.test.js` → PASS. The AI-review suites read 1s and must not move.

- [ ] **Step 5: Commit**

```bash
git add tools/lib/mt-layers.js tools/__tests__/mt-layers.test.js
git commit -m "feat(mt-layers): a layer-1s writer and an append-only re-request log"
```

---

### Task 3: The attempt loop — `rerequestModule` in `tools/api-translate.js`

**Files:**
- Modify: `tools/api-translate.js` (new export near `topUpModule`)
- Test: `tools/__tests__/api-translate-rerequest.test.js` (new)

**Interfaces:**
- Consumes: Task 1's `planRerequest`, `classifyAttempt`, `MAX_ATTEMPTS`, `REREQUEST_RULE`; Task 2's `readSelectedKeys`, `readRerequestOutcomes`, `writeSelectedOverlay`, `appendRerequestLog`, `REREQUEST_SCHEMA`; `readBase` and `LAYER_DIRS` from `mt-layers.js`; the file's own `translateSegmentText`, `runRecordFor`, `bracketMarkerDeltaBySegment`; `estimateIsk`.
- Produces: `rerequestModule(client, unit, glossary, verbose, maxChunk, ctx) → Promise<{ accepted: string[], flagged: string[], failed: string[], attempts: number, chars: number }>`. `flagged`: ids with two untranslated answers (never sent again). `failed`: ids still pending for any other reason (refused or held); they may be re-sent in a later run.
  - `unit = { bookDir: string /* absolute …/books/<slug> */, chapterDir: string, stem: string, ids: string[] }`
  - `ctx = { glossaryArm: string, commit: string /* 40-hex */, runId: string, now?: () => Date }`

- [ ] **Step 1: Write the failing tests**

Fixture: a temp `<root>/books/testbook/` holding `02-for-mt/ch01/m100-segments.en.md` and `02-mt-output/ch01/m100-segments.is.md`. Two English-in-IS segments, `p1` and `p2`; `p2` carries a `[[term:boiling point|term-00001]]` marker. Use a scripted client like `api-translate-top-up.test.js`'s: `translateAuto(text, opts)` records each call and returns `{ text: transform(text), usage: { units: text.length, cost: 0 } }`. Every test also asserts the layer-1 file is byte-identical afterwards.

```js
it('accepts an Icelandic answer: the 1s entry carries text, beforeSha256, run, commit, rule and gate', …)
  // readBase(...).parsed body at m100:para:p1 === the response body;
  // entry.beforeSha256 === sha256(layer-1 body); entry.rule === 'rerequest';
  // entry.gate deep-equals { check: 'detectResidue', untranslated: false, attempt: 1 }
it('logs every attempt with the response as received and the run record', …)
  // one jsonl line: attempt 1, results[0].outcome 'translated', body verbatim, run.chars === wire length
it('identity MT: nothing is written to the overlay, both attempts are logged, the id is flagged', …)
  // no <stem>-selected.json; 2 log lines, both 'untranslated'; flagged deep-equals ['m100:para:p1']; client called twice
it('the second attempt sends only the ids still untranslated', …)
  // call 2's wire text holds p2's marker and not p1's
it('retries a marker-less one-segment response once', …)
  // call 1 strips the SEG marker, call 2 does not → accepted at attempt 2; log line 1 outcome 'refused', error names the marker
it('a digit rewritten inside an element id is refused, logged, and not written', …)
it('holds a segment whose markers changed and accepts its clean sibling', …)
  // p2 answered without its term marker → outcome 'held', reason names 'term'; p1 accepted
it('an id refused twice is failed, not flagged, and never written', …)
it('one untranslated answer then one refusal leaves the id failed with one untranslated answer logged', …)
  // a second run's planner still requests it; a third untranslated-answer run would flag it
it('an id with two untranslated answers from an earlier run is not sent (already-flagged)', …)
  // seed the log with two untranslated lines → throws before any call; client.calls.length === 0
it('a body with a line break is held, logged, and not written', …)
it('records a refused attempt with chars and estimatedIsk but run null', …)
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tools/__tests__/api-translate-rerequest.test.js`
Expected: FAIL, `rerequestModule is not exported`.

- [ ] **Step 3: Implement `rerequestModule`**

Loop up to `MAX_ATTEMPTS`. For each attempt:
1. Re-read the base with `readBase`, the keys with `readSelectedKeys` and the counts with `readRerequestOutcomes`, then `planRerequest` the pending ids. On attempt 1 a planner refusal throws before any send. On attempt 2, an id the planner now refuses as `already-flagged` leaves the pending set as flagged; any other refusal is a bug and throws.
2. Send the wire text through `translateSegmentText` (`ctx` `{ moduleId: stem, where: <the overlay path> }`).
3. If it throws: every pending id is `refused` for this attempt, with `error` = the message.
4. If it returns: classify with `classifyAttempt` (which already holds an invalid body). Also mark as `held` any id with an entry in `bracketMarkerDeltaBySegment(wire, output).bySegment`, in `greekLost`, or in `mismatches`.
5. Append the log line **before** any overlay write, so a paid attempt is recorded even if the write refuses.
6. Write the `translated` ids with `writeSelectedOverlay`.
7. Pending = everything not accepted.

At the end, split what is still pending into `flagged` (two untranslated answers, counted from the log) and `failed` (the rest). The function never touches `02-mt-output/`.

- [ ] **Step 4: Run them and see them pass**

Run: `npx vitest run tools/__tests__/api-translate-rerequest.test.js tools/__tests__/api-translate-top-up.test.js tools/__tests__/api-translate-output-guards.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/api-translate.js tools/__tests__/api-translate-rerequest.test.js
git commit -m "feat(api-translate): rerequestModule — up to two guarded attempts, accepted text to layer 1s"
```

---

### Task 4: CLI wiring — `--rerequest`, the commit check, the dry run

**Files:**
- Modify: `tools/api-translate.js` (`parseCliArgs`, header usage block, `printHelp`, `main()`, new `resolveRerequestCommit`, new internal `runRerequestMode`)
- Test: `tools/__tests__/api-translate-rerequest.test.js` (CLI and commit cases)

**Interfaces:**
- Consumes: Task 3's `rerequestModule`; Task 1's `parseRerequestIds`, `planRerequest`; Task 2's `readSelectedKeys`; `makeGit`, `resolveCommit`, `filesAtCommitProblems` from `tools/ai-review/provenance.js`; `mintRunId` from `tools/ai-review/records.js`; the existing `resolveGlossaryArm`, glossary loading and `createClient`.
- Produces:
  - parse spec entry `{ name: 'rerequest', flags: ['--rerequest'], type: 'string', default: null }`
  - `formatRerequestDryRun({ modules, statedArm, commit, commitProblems }) → string`, pure. `modules` items: `{ chapterDir, stem, ids: Array<{ id, chars }>, wireChars, recordedArm, recordedTermCount }`. Its first summary line is `Re-request: <M> module(s), <N> segment(s)`.
  - `resolveRerequestCommit({ git, repoRoot, files }) → string`. Returns HEAD's full sha. Throws listing every file whose working bytes are not its blob at HEAD. `files` are the run's **inputs** only: each module's layer-1 IS and its EN. The overlay and log are its outputs, so an uncommitted overlay from an earlier attempt does not block a re-run.

- [ ] **Step 1: Write the failing tests**

CLI cases use the real chemistry tree, as the top-up tests do, and are **all `--dry-run` or refused before a client exists**. Set `MALSTADUR_API_KEY=bogus` in the child env so an accidental live call fails loudly, never charges. ⚠️ **Only cases whose result survives the buy go on the real tree.** "The 8 ids plan cleanly" does not: once Task 6 commits the overlay, the planner refuses them (`already-selected`) and the test would go red on this same branch. That positive case is Task 5 Step 3's manual measurement, and the output it prints is pinned through the pure formatter instead.

```js
it('the flag is declared: --rerequest with an unknown id exits 1 and names it', …)
  // spawnSync node tools/api-translate.js --book efnafraedi-2e --rerequest m68852:para:nope --dry-run
  // status 1; stderr contains 'not-in-en'
it('a translated id is refused: not-untranslated, exit 1, nothing sent', …)   // a real Icelandic id in m68852
it('formatRerequestDryRun prints the summary line, per-id chars, ISK per attempt, both arms and the commit', …)
  // fixture: 3 modules, 8 ids → contains 'Re-request: 3 module(s), 8 segment(s)' and 'ISK per attempt'
it('formatRerequestDryRun prints the would-refuse line when there are commit problems', …)
it('refuses --rerequest with --force, --top-up, --june-wire or --update-status', …)   // each: status 1, 'Nothing was sent'
it('a live --rerequest with no glossary arm is refused (exit 2) before any client', …)
it('resolveRerequestCommit returns HEAD for clean inputs and refuses a dirty one', …)
  // temp git repo: init, commit a file, call → sha; change the file, call → throws naming it
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tools/__tests__/api-translate-rerequest.test.js`
Expected: the CLI cases FAIL (the unknown-id case exits 0, because the flag is undeclared and dropped).

- [ ] **Step 3: Implement**

- In `main()`, right after the `--top-up`/`--force` check: refuse `--rerequest` together with `--force`, `--top-up`, `--june-wire` or `--update-status` (exit 1, `Nothing was sent.`).
- After glossary loading, branch to `runRerequestMode` when `args.rerequest != null`. That branch must return before the existing work-list code.
- `runRerequestMode`:
  1. Resolve the book directory from the script's own location (`path.resolve(projectRoot, 'books', args.book)`), never from cwd.
  2. Group ids by module. Find each module's chapter: exactly one `02-for-mt/*/<m>-segments.en.md`, honouring `--chapter`/`--module` if given.
  3. Refuse a locked module (`isMtLocked`).
  4. Plan every module. Any refusal prints `id: why` lines and exits 1 before a client exists, dry run included.
  5. Dry run prints `formatRerequestDryRun(...)`: per module, its ids with EN characters and its wire characters; then totals, `~N ISK per attempt (at most 2 per run: ~2N)`, the stated arm, each module's recorded September arm and term count (read-only from `02-mt-output/<ch>/<m>-provenance.json` → `run.glossary`), and the commit — or `⚠️ the live run would refuse: …` with the commit problems. Exit 0.
  6. Live: resolve the commit (refuse on problems), `mintRunId()` once, run `rerequestModule` per module, print accepted, flagged and failed ids per module. Exit 1 if anything is flagged or failed.
- Add `--rerequest <id,…>` to the header usage block and to `printHelp`: what it does, that it writes `02-mt-selected/` only, and what it cannot be combined with.

- [ ] **Step 4: Run them and see them pass**

Run: `npx vitest run tools/__tests__/api-translate-rerequest.test.js tools/__tests__/api-translate-glossary-arm.test.js tools/__tests__/api-translate-top-up.test.js` → PASS.

- [ ] **Step 5: Run the gates this branch must clear**

Run: `df -h /tmp && npx vitest run`, then `npm run lint`, `npm run format:check`, `npm run docs:check`.
Expected: vitest exits 0 with no failing files. Compare against the recorded baseline (0 failing files on `0c574e8c6`). If a file fails, name it, and re-run it alone before calling it new. `tools/__tests__/ai-review-term-pass.test.js` is known to time out under load. Lint, format and docs exit 0.

- [ ] **Step 6: Commit**

```bash
git add tools/api-translate.js tools/__tests__/api-translate-rerequest.test.js
git commit -m "feat(api-translate): --rerequest <ids> writes layer 1s; dry run shows plan, cost and arms"
```

---

### Task 5: Pre-buy checks and the dry run — then STOP for [USER]'s go

No code. 0 ISK. CLAUDE.md § Read Documentation Before Pipeline Operations applies: this is step 2 (MT) of `docs/workflow/simplified-workflow.md`, through the documented tool.

- [ ] **Step 1: The tree is clean where the buy reads**

Run: `git status --porcelain books/efnafraedi-2e/`
Expected: empty.

- [ ] **Step 2: The English the buy sends is current**

Re-extract the three modules, then compare:

```bash
node tools/cnxml-extract.js --book efnafraedi-2e --chapter 8 --module m68744
node tools/cnxml-extract.js --book efnafraedi-2e --chapter 21 --module m68852
node tools/cnxml-extract.js --book efnafraedi-2e --chapter 21 --module m68856
git diff --stat -- books/efnafraedi-2e/02-for-mt/ch08/m68744-segments.en.md \
  books/efnafraedi-2e/02-for-mt/ch21/m68852-segments.en.md books/efnafraedi-2e/02-for-mt/ch21/m68856-segments.en.md
```

Expected: no diff in the three `.en.md` files. A timestamp-only change elsewhere in `02-structure/` is expected. Then restore every file the extract touched with `git restore` (they were clean at HEAD by Step 1), so the buy reads the committed English that layer 1 was bought from.
- **If any of the 8 English bodies changed, STOP and report.**
- If an `.en.md` differs but the 8 bodies do not, restore, note which segments differ for the register entry, and go on: the 8 bodies the buy sends are what a fresh extract gives.
- ✏️ *2026-11-08, found when the full suite went red afterwards: the extract also writes a gitignored `<file>.backup.<timestamp>` beside every file it replaces (15 for these three modules), and `git restore` cannot see them. Check each against `git show HEAD:<file>` and remove them. Left in place, they turned `remt-checks-extract-legacy.test.js`'s E6 real-tree case red (it reads "any backup present" as "a dev box's full backup population").*

- [ ] **Step 3: The dry run**

```bash
node tools/api-translate.js --book efnafraedi-2e --no-glossary --dry-run --rerequest \
m68744:para:fs-idp92007424,m68852:para:fs-idp10810528,m68852:para:fs-idm5999248,m68852:alt:fs-idp74884384-alt,m68852:para:fs-idp183438528,m68852:para:fs-idp1433408,m68852:item:fs-idp258853168-item-1,m68856:para:fs-idm211204656
```

Expected: exit 0; 3 modules, 8 segments; about 58 ISK per attempt; the commit, with no `would refuse` line.

- [ ] **Step 4: STOP. Show [USER] the dry run and ask for the go**

The message carries:
- the dry run's output;
- the cost: about 58 ISK per attempt, at most about 120 ISK for the run, plus at most one re-run of `failed` ids (another ~58 ISK), paid privately;
- the arm question. This plan proposes `--no-glossary` (the 2026-09-06 direction: glossary off the wire). September bought all three modules `glossary-only` (36 terms for ch21, 8 for ch08), so `--glossary-only` with those subsets is the comparable alternative;
- that `m68744`'s paragraph returned English on two earlier paid attempts, so it may need June's fallback (Task 7);
- what happens to layer 2 (Task 6, Step 4).

**Nothing in Task 6 runs without that go.**

---

### Task 6: The buy and its proof by value (only after [USER]'s go)

- [ ] **Step 1: The paid run**

Run the Task 5 Step 3 command without `--dry-run`, with the arm [USER] chose. The guard hook asks for confirmation; that prompt is expected. If ids come back `failed` (refused, or held), re-run once with only those ids; that is a further ~58 ISK at most, and it was named at the go. A `flagged` id is never re-sent: the planner refuses it.

- [ ] **Step 2: Prove what reached layer 1s, by value**

A scratch script (scratchpad, not committed). For each of the three modules:
1. Read `readBase` and the `-rerequest.jsonl` log.
2. Assert each accepted id's body equals the logged response body.
3. Assert `detectResidue(en, body).exact === false`.
4. Assert the **set** accepted ∪ flagged ∪ failed equals the set of 8.
5. Assert the layer-1 sha256 equals `git show HEAD:<file>`'s.

Then `git status --porcelain` must list only files under `books/efnafraedi-2e/02-mt-selected/`.

- [ ] **Step 3: Sort the flagged ids**

- The table alt flagged: it stays English in layer 1 and goes to editors as a flagged untranslated segment. Record that in the register entry (Step 6). Surfacing it in the editor is not built here.
- Any of the 7 flagged: Task 7 (June fallback). Stop before it and tell [USER].
- Anything still `failed` after the one re-run: stop and tell [USER] with the logged errors.

- [ ] **Step 4: Record what the 1s write did to layer 2**

Run `verifyRevision` (`mt-layers.js`) for `m68744`, `m68852` and `m68856`, each with its revision record's `current` values. Expected: an `overlay.sha256` mismatch (null → the new overlay) and nothing else. Record it in the register. Re-deriving layer 2 for these modules belongs to the AI-layer item, not this branch, since no committed change touches the 8.

- [ ] **Step 5: Commit the bought text**

```bash
git add books/efnafraedi-2e/02-mt-selected/
git commit -m "content(efnafraedi-2e): re-request of the 8 untranslated September segments into layer 1s (~N ISK)"
```

Put the real ISK in the message and the per-id outcome in its body.

- [ ] **Step 6: Register and journal**

Add a dated note to the register's 2026-11-08 entry: accepted and flagged ids, the cost, the arm, the run id, the layer-2 staleness, and what reaches readers (nothing yet: no inject or editor reader of layer 1s exists until plan 10-10 4.1). Commit, then **ask [USER] before any push or PR**.

---

### Task 7 (conditional): June's fallback — only if Task 6 flags one of the 7

- [ ] **Step 1: A 0-ISK probe settles the scope**

In memory, take a flagged id's June body (`git show 9a69414d5:books/efnafraedi-2e/02-mt-output/<ch>/<m>-segments.is.md`). Inject it in place of the September body, and compare each `<term>` element by id against the September-form round trip.
- If inject's legacy parser rebuilds the term ids, the fallback is a read of June's body written through `writeSelectedOverlay` with `rule: 'june-fallback'`, `run: 'june'`, `commit` = `9a69414d5`'s full sha.
- If ids are lost, marker conversion is real work: write a small plan for it and stop.

Either way, show [USER] the probe's result before writing anything.

---

## Deferred, needs [USER]'s word

- **CLAUDE.md § E-2 says to sever `api-translate.js`'s optional `pipelineStatusService` require "if you touch that file."** This plan touches the file and does not sever it. The re-request branch refuses `--update-status`, so the mode never reaches `server/` code. Severing changes the paid tool's interface, and two tests pin `main()`'s status block by reading its source (`api-translate-bracket-delta-gate.test.js`, `api-translate-output-guards.test.js`). Nothing in the repo passes `--update-status`. Proposed: its own small PR (keep the flag declared but refusing, so it is never silently dropped; remove `updatePipelineStatus`; update root `LICENSE` class 1 and CLAUDE.md's bullet in the same commit).
