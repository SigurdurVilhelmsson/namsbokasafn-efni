# G1.7 step 1 — the study freeze tooling and the 170 markers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock every chemistry study unit with a byte-identical, content-free MT lock marker, and ship the one script
that later cuts the manifest and checks both, so step 2 (the cut) is a run plus a data-only PR.

**Architecture:** `tools/lib/mt-lock.cjs` gains the freeze marker. `server/lib/studyUnits.js` becomes the one list of
study units, used by check G-1g and by the new `server/scripts/study-freeze.js`. That script exports pure-ish
functions (`planMarkers`, `writeMarkers`, `buildManifest`, `writeManifest`, `currentManifest`, `compareToManifest`,
`checkMarkers`) plus a `main(argv, io)` that returns an exit code. Manifest hashes come only from
`segmentParser.loadModuleForEditing` → `servedVersions.versionRowsFor`.

**Tech Stack:** Node 22, CommonJS under `server/`, Vitest (`npm test` from the repo root), Playwright E2E
(`cd server && npm run test:e2e`), ESLint + Prettier (`npm run lint`, `npm run format:check`).

**Spec:** `docs/superpowers/specs/2026-11-19-g17-freeze-and-mt-lock-design.md` (approved 2026-11-19). Read §6 before
any task.

## Global Constraints

- Branch `docs/g17-freeze-design` (cut from `origin/main` `474647ffb`). **Never `git add -A` or `git add .`**: the
  working tree holds an untracked `server/__tests__/findTermsC19ApplyProbe.test.js` that belongs to the c19 work.
  Stage named paths only. Never `git clean`.
- The study book list is `researchScope.STUDY_BOOKS` (`server/lib/researchScope.js`); never a literal list.
- Freeze marker bytes: exactly `JSON.stringify({ reason: 'freeze' }, null, 2) + '\n'`. No time, commit or unit id.
- Never print, log or return a marker's body. Output names units and counts only.
- Files under `books/` are written only by the script, never by hand (CLAUDE.md file permissions; 02-mt-output is
  read-only for MT text).
- The script refuses unknown flags (`tools/lib/parseArgs.js` drops them silently; do not use it).
- Exit codes: `process.exitCode = 1` on entry, then `process.exitCode = main(process.argv)`; never `process.exit()`
  after output. Use read-research-preconditions.js's `runDirectly` idiom so a file run and a stdin run both execute.
- All paths resolve from `__dirname` / `segmentParser.BOOKS_DIR`, never `process.cwd()`.
- Segment lines use the served-version column names: `chapter`, `module_id`, `segment_id`, `occurrence`,
  `en_sha256`, `is_sha256`, `layer`, in that key order. The header (`freeze.json`) uses camelCase.
- File hashes are sha256 of the raw bytes. Served-text hashes come only from `versionRowsFor` (`sha256Text`).
- Tag format: `freeze-<book>-YYYY-MM-DD`; `cutDate` is the date part. No tag is created in step 1.
- Do not run `scripts/backfill-mt-locks.js` (dropped by [USER], spec §2).
- Every new test is run once against code with the behaviour broken before it is trusted.

## Review Focus

1. **Re-running `markers --write` after a successful run** → prints `written 0, already N`, touches no file (mtimes
   unchanged). Test in Task 3.
2. **A misspelt flag (`--wirte`)** → exit 1, usage message, nothing written. Test in Task 3.
3. **`check` run as a file from `server/` as cwd** (production habit) → same verdict and exit code as from the repo
   root. Test in Task 6, on the real tree.
4. **`manifest --write` in a shallow clone, or with an uncommitted change under an input directory** → refused with a
   named reason, nothing written. Test in Task 4.
5. **An existing `freeze/<tag>/` directory, or a malformed tag** → refused, nothing overwritten. Test in Task 4.

---

### Task 1: The freeze marker primitives

**Files:**
- Modify: `tools/lib/mt-lock.cjs`
- Test: `tools/__tests__/mt-lock.test.js`

**Interfaces:**
- Produces: `FREEZE_LOCK_BODY: string`; `freezeLockState(mtOutputPath: string): 'absent'|'freeze'|'foreign'`;
  `writeFreezeLock(mtOutputPath: string): 'written'|'already'` (throws `Error` with `code === 'FOREIGN_LOCK'` and a
  message naming the marker path only). `mtLockPathFor`, `isMtLocked`, `writeMtLock` unchanged.

- [ ] **Step 1: Write the failing tests** in a new `describe('freeze marker (G1.7)')`, using the file's `tmp()`:

```js
it('FREEZE_LOCK_BODY is the constant, parses, and holds no date', () => {
  expect(FREEZE_LOCK_BODY).toBe('{\n  "reason": "freeze"\n}\n');
  expect(JSON.parse(FREEZE_LOCK_BODY)).toEqual({ reason: 'freeze' });
  expect(FREEZE_LOCK_BODY).not.toMatch(/\d{4}-\d{2}-\d{2}/);
});
it('absent → writes exactly the body; state goes absent → freeze; isMtLocked agrees', () => { /* ... */
  expect(freezeLockState(mt)).toBe('absent');
  expect(writeFreezeLock(mt)).toBe('written');
  expect(readFileSync(mtLockPathFor(mt), 'utf8')).toBe(FREEZE_LOCK_BODY);
  expect(freezeLockState(mt)).toBe('freeze');
  expect(isMtLocked(mt)).toBe(true);
});
it('identical marker → "already", no write (mtime unchanged)', () => { /* utimes to a past time first */ });
it('foreign marker → throws FOREIGN_LOCK, bytes unchanged, message carries no body', () => {
  // plant writeMtLock(mt, { reason: 'editing-started', firstEditId: 7 }) — holds a lockedAt
  expect(freezeLockState(mt)).toBe('foreign');
  expect(() => writeFreezeLock(mt)).toThrow(expect.objectContaining({ code: 'FOREIGN_LOCK' }));
  // bytes before === bytes after; err.message does not contain 'lockedAt' nor the planted firstEditId
});
it('an unreadable or non-JSON marker is foreign, never freeze', () => { /* write 'not json' */ });
```

- [ ] **Step 2: Run** `npx vitest run tools/__tests__/mt-lock.test.js` — expect FAIL (`FREEZE_LOCK_BODY` undefined).
- [ ] **Step 3: Implement** the three exports in `tools/lib/mt-lock.cjs`. `freezeLockState` compares the marker's
  bytes with `FREEZE_LOCK_BODY` (`fs.readFileSync(lock, 'utf8') === FREEZE_LOCK_BODY`); a read error → `'foreign'`.
  `writeFreezeLock` creates the chapter directory like `writeMtLock` does. Add a header comment pointing at the spec's
  §6.2 and stating why the body has no time.
- [ ] **Step 4: Run** the same command — expect PASS; then break `freezeLockState` to return `'freeze'` for any
  existing file, confirm the foreign test fails, restore (golden copy + `cmp`, CLAUDE.md mutation rule).
- [ ] **Step 5: Commit** `git add tools/lib/mt-lock.cjs tools/__tests__/mt-lock.test.js` —
  `feat(mt-lock): the content-free freeze marker (G1.7)`.

### Task 2: One list of study units

**Files:**
- Create: `server/lib/studyUnits.js`
- Modify: `server/scripts/read-research-preconditions.js` (`readG1g`)
- Test: `server/__tests__/studyUnits.test.js`; `server/__tests__/readResearchPreconditions.test.js` (its pinned
  require list)

**Interfaces:**
- Produces: `listStudyUnits({ book: string, booksDir: string }): Array<{ unit: string, chapterDir: string,
  chapter: number, moduleId: string, mtOutput: string, enSource: string }>`, sorted by `compareChapters(chapter)`
  then `moduleId`. `unit` is `"<chapterDir>/<moduleId>"`. Throws the underlying `ENOENT` when `02-for-mt` is absent
  (G-1g turns that into its failed section, as today). `UNIT_ID` moves here and is exported.

- [ ] **Step 1: Write the failing tests** in `studyUnits.test.js`, reusing G-1g's fixture shape (a locked unit, an
  unlocked unit, `chapter-metadata`, an `appendices` unit without MT, a legacy `-segments(b).en.md`, an
  `exercises-segments.en.md`, a non-chapter `tmp/` directory): the result lists exactly the four real units in order
  `ch01/m94201, ch01/m94202, ch02/chapter-metadata, appendices/m94203`, each with `chapter` (1, 1, 2, -1) and an
  `mtOutput` ending `02-mt-output/<chapterDir>/<id>-segments.is.md`; a missing `02-for-mt` throws `ENOENT`.
- [ ] **Step 2: Run** `npx vitest run server/__tests__/studyUnits.test.js` — expect FAIL (module not found).
- [ ] **Step 3: Implement** `listStudyUnits` by moving `readG1g`'s loop; `readG1g` keeps its output shape exactly
  (`unitCount`, `lacking`, `lackingMtFile`, sorted as strings, presence only) and **requires `../lib/studyUnits`
  lazily inside `readG1g`**, so the probe still runs on a production tree that predates this deploy (only G-1g then
  fails, as PR4's lazy requires do). Add `'../lib/studyUnits'` to the pinned list in
  `readResearchPreconditions.test.js` ("requires only modules production has at ed10180c"), with a comment saying it
  is lazy and why.
- [ ] **Step 4: Run** `npx vitest run server/__tests__/studyUnits.test.js server/__tests__/readResearchPreconditions.test.js`
  — expect PASS, with every existing G-1g test unchanged (T7).
- [ ] **Step 5: Commit** both source files and both tests — `refactor(research): one list of study units for G-1g and G1.7`.

### Task 3: `study-freeze.js` — the command line and `markers`

**Files:**
- Create: `server/scripts/study-freeze.js`
- Test: `server/__tests__/studyFreezeMarkers.test.js`

**Interfaces:**
- Consumes: Task 1's three exports; Task 2's `listStudyUnits`.
- Produces:
  - `parseArgs(argv: string[]): { command: 'markers'|'manifest'|'check', book: string, write: boolean,
    tag: string|null, supersedes: string|null, manifest: string|null }` — throws `Error` with `code === 'USAGE'` on an
    unknown flag, a missing or unknown command, a flag that takes a value given none, or `--book` not in
    `STUDY_BOOKS`. `--book` defaults to `STUDY_BOOKS[0]` and is refused if `STUDY_BOOKS.length !== 1` and absent.
  - `planMarkers({ book }): { units: Array<unit & { state, hasMt: boolean }>, refusals: Array<{ unit: string,
    reason: 'foreign-marker'|'no-mt-file' }> }` — books root is always `segmentParser.BOOKS_DIR`.
  - `writeMarkers(plan): { written: number, already: number, total: number }` — throws `code === 'REFUSED'` if
    `plan.refusals.length > 0`, before any write.
  - `main(argv: string[], io = { log: console.log, error: console.error }): number` (0 = success/PASS, 1 = refusal,
    FAIL or usage error).

- [ ] **Step 1: Write the failing tests.** Env and seam as in `server/__tests__/mtLockFreezeMarker.test.js`
  (`segmentParser._setTestBooksDir(tempRoot)`, `writeModule` from `./helpers/servedFixture`), book `efnafraedi-2e`,
  three units in `ch01`. Collect `io.log`/`io.error` lines in arrays.

```js
it('dry run (no --write) writes nothing and lists the absent units', () => {
  expect(main(['markers'], io)).toBe(0);
  // no *.locked under tempRoot; output names 3 units to lock
});
it('--write writes the body to every absent unit; a re-run writes 0 (Review Focus 1)', () => {
  expect(main(['markers', '--write'], io)).toBe(0);
  // 3 markers, each byte-identical to FREEZE_LOCK_BODY; output contains 'written 3, already 0, total 3'
  // backdate their mtimes, run again: exit 0, 'written 0, already 3, total 3', mtimes unchanged
});
it('one foreign marker refuses the whole run: nothing written, unit named, body never printed (T2)', () => {
  // plant a marker body '{"lockedAt":"2099-01-01T00:00:00.000Z","firstEditId":424242}' on unit 2
  expect(main(['markers', '--write'], io)).toBe(1);
  // units 1 and 3 still have no marker; output names 'ch01/<unit2>'; no line contains '2099' or '424242'
});
it('a unit with no MT file refuses the whole run (T2)', () => { /* en only for one unit */ });
it('an unknown flag exits 1 and writes nothing (T6, Review Focus 2)', () => {
  expect(main(['markers', '--wirte'], io)).toBe(1);
});
it('a non-study --book is refused (T6)', () => {
  expect(main(['markers', '--book', 'liffraedi-2e'], io)).toBe(1);
});
```

- [ ] **Step 2: Run** `npx vitest run server/__tests__/studyFreezeMarkers.test.js` — expect FAIL (module missing).
- [ ] **Step 3: Implement** the module's command line, `planMarkers`, `writeMarkers` and the `markers` branch of
  `main`. Stub `manifest` and `check` in `main` as usage errors until Tasks 4–5. Header comment: what the script is,
  the spec path, "run as a file, never piped", the three subcommands.
- [ ] **Step 4: Run** the same command — expect PASS; break the refusal (write before checking `refusals`), confirm
  the foreign test fails, restore and `cmp`.
- [ ] **Step 5: Commit** script and test — `feat(freeze): study-freeze.js markers (G1.7 step 1)`.

### Task 4: `manifest`

**Files:**
- Modify: `server/scripts/study-freeze.js`
- Test: `server/__tests__/studyFreezeManifest.test.js`

**Interfaces:**
- Consumes: `listStudyUnits`, `freezeLockState`, `segmentParser.loadModuleForEditing`,
  `servedVersions.versionRowsFor`.
- Produces:
  - `gitFacts({ book }): { baseCommit: string, layer1LastCommit: string, handRepairs: Array<{ commit, subject }>,
    shallow: boolean, dirtyPaths: string[] }` — `execFileSync('git', …, { cwd: REPO_ROOT })`; used by the CLI only.
    `handRepairs` = `git log --format=%H%x09%s --grep='HAND REPAIR' -- books/<book>/02-mt-output`, oldest first.
    `dirtyPaths` = `git status --porcelain --` over the six input directories of spec §6.3.
  - `manifestRefusals({ book, git }): Array<{ unit?: string, reason: string }>` — reasons `'not-frozen'`
    (marker state not `freeze`), `'duplicated-id'`, `'no-layer'`, `'shallow-clone'`, `'dirty-input'`.
  - `buildManifest({ book, tag, supersedes = null, git }): { header: object, segmentsJsonl: string }` — pure given its
    inputs; tag must match `/^freeze-<book>-\d{4}-\d{2}-\d{2}$/` (else `code === 'USAGE'`).
  - `writeManifest({ book, tag, header, segmentsJsonl }): string` (the directory) — refuses (`code === 'REFUSED'`)
    if `books/<book>/freeze/<tag>/` exists. Writes `segments.jsonl` then `freeze.json`.
  - `currentManifest({ book }): { dir: string, header: object } | null` — the one manifest under
    `books/<book>/freeze/` that no other manifest's `supersedes` names; throws `code === 'AMBIGUOUS'` if more than one.
  - `main(['manifest', ...])`: dry run prints counts, `segmentsSha256` and refusals; `--write --tag <t>
    [--supersedes <t0>]` writes. `--supersedes` names a tag whose manifest exists and is current
    (`currentManifest`), else refused.
- Header fields exactly per spec §6.4: `schema: 'study-freeze/1'`, `book`, `tag`, `cutDate`, `baseCommit`,
  `supersedes`, `segmentsSha256`, `counts: { units, segments, byLayer }`, `units[]: { chapter, chapterDir, moduleId,
  enSha256, mtSha256, faithfulSha256, changesSha256, segments, marker }`, `layers: { layer1: { dir, lastCommit,
  handRepairs }, layer1s: { dir, files: [{ path, sha256, entries }], servedSegments }, layer2: { dir,
  revisionRecords, rulingSets, prompts, models, runIds, revisionRecordsSha256 }, layer3: { dir, faithfulFiles,
  reviewStatusSidecars } }`, `glossary: { path, sha256, producer, terms }`, `markers: { count, bodySha256 }`.
  `revisionRecordsSha256` = sha256 of the lines `` `${bookRelativePath}\t${fileSha256}\n` `` in path order (a tab,
  never a NUL byte). `rulingSets`/`prompts` are distinct `{ path, sha256 }` sorted by path; `models`/`runIds` distinct
  and sorted. Absent directories give zero counts and empty lists, never a throw.

- [ ] **Step 1: Write the failing tests.** Same temp tree and seam as Task 3, plus a temp migrated database exactly
  as `server/__tests__/moduleOpeningRoute.test.js` sets one up (env before requires, `runAllMigrations`), and that
  file's route handler (`handlerFor(router, 'get', '/:book/:chapter/:moduleId')`, `invoke`). Fixture: two `ch01`
  units and one `appendices` unit with markers written by `writeMarkers`, a `02-mt-revised` revision record and
  change log for one unit, a `glossary/glossary-unified.json` with `producer` and three terms. `git` facts are
  injected, never read from the repository.

```js
it('T3: every served-version row the route mints joins a manifest line on the six values', async () => {
  // serve all three units through the route; read SELECT chapter, module_id, segment_id, occurrence,
  //   en_sha256, is_sha256 FROM served_text_versions
  // build the manifest; every row's 6-tuple is in segments.jsonl; row count === line count
});
it('T3 relabel: the same text written as a faithful file and served again also joins', async () => {
  // copy one unit's MT file to 03-faithful-translation; serve it; new rows have layer 'faithful'; all join
});
it('T3 control: one changed byte in one MT segment, served again, gives exactly one row that fails to join', ...);
it('T4: two builds on one tree give identical bytes', () => { /* header JSON and segmentsJsonl */ });
it('header carries counts, unit file hashes, layer records, glossary and markers as spec §6.4', () => {
  // spot-check: counts.units === 3; units[i].changesSha256 non-null only for the unit with a change log;
  //   glossary.terms === 3; markers.bodySha256 === sha256(FREEZE_LOCK_BODY); layers.layer1s.servedSegments === 0
});
it('refuses: a unit not frozen; shallow clone; a dirty input (Review Focus 4) — nothing written', ...);
it('refuses an existing freeze/<tag>/ directory and a malformed tag (Review Focus 5)', ...);
```

- [ ] **Step 2: Run** `npx vitest run server/__tests__/studyFreezeManifest.test.js` — expect FAIL.
- [ ] **Step 3: Implement** the Interfaces above. Lines come from `versionRowsFor(loadModuleForEditing(book,
  chapter, moduleId), { book, chapter, moduleId }).rows`, in served order, units in `listStudyUnits` order; the script
  computes no served-text hash itself. `segmentsJsonl` ends with a newline.
- [ ] **Step 4: Run** the same command — expect PASS; mutation-check T3 by hashing `seg.is` after a `.trim()` in the
  script (a one-step normalisation drift), confirm T3 fails, restore and `cmp`.
- [ ] **Step 5: Dry-run on the real corpus** (writes nothing): `node server/scripts/study-freeze.js manifest` —
  expect a refusal `not-frozen` for 170 units (markers are written in Task 6), proving the precondition reads the
  real tree. Record the output in the commit message.
- [ ] **Step 6: Commit** — `feat(freeze): study-freeze.js manifest (G1.7, built now, run at the cut)`.

### Task 5: `check`, the current manifest and the two verdicts

**Files:**
- Modify: `server/scripts/study-freeze.js`
- Test: `server/__tests__/studyFreezeCheck.test.js`

**Interfaces:**
- Consumes: Tasks 1–4 (`currentManifest` from Task 4).
- Produces:
  - `checkMarkers({ book }): { total: number, freeze: number, absent: string[], foreign: string[] }` (unit ids).
  - `compareToManifest({ book, manifestDir }): { pass: boolean, unitSetChanged: { missing: string[], extra: string[] },
    inputChanged: string[], servedChanged: Array<{ unit, segmentId, occurrence }>, movedToFaithful: string[] }` —
    per spec §6.3: file hashes for every unit; segment lines only for units still served from a non-faithful layer;
    a segment mismatch in a unit whose files match is `servedChanged` ("served text changed, inputs unchanged").
  - `main(['check', ...])`: markers always; the manifest from `--manifest <dir>` or `currentManifest`; prints
    `STUDY FREEZE CHECK: PASS` or `FAIL`, counts, at most 20 keys, and on a served-text FAIL the line naming the
    re-cut route (spec §6.6). Exit 0 only on PASS.

- [ ] **Step 1: Write the failing tests** on the Task 4 fixture with a written manifest:

```js
it('PASS on an unchanged tree; markers 3/3', () => { expect(main(['check'], io)).toBe(0); });
it('FAIL for a deleted marker and for a foreign marker; the body is never printed (T5)', ...);
it('FAIL input changed: an MT file changed', ...);           // inputChanged names the unit
it('FAIL served text changed, inputs unchanged: one manifest line\'s is_sha256 altered (T9)', ...);
it('a unit moved to faithful is reported, not a failure', ...);
it('supersedes: a second manifest naming the first makes the first ignored; two current ones is AMBIGUOUS (T9)', ...);
it('without a manifest, check verifies markers only and says so', ...);
```

- [ ] **Step 2: Run** `npx vitest run server/__tests__/studyFreezeCheck.test.js` — expect FAIL.
- [ ] **Step 3: Implement** the Interfaces above.
- [ ] **Step 4: Run** — expect PASS; mutation-check by classifying every segment mismatch as `inputChanged`,
  confirm the T9 verdict test fails, restore and `cmp`.
- [ ] **Step 5: Commit** — `feat(freeze): study-freeze.js check with the two verdicts and supersedes (G1.7)`.

### Task 6: The 170 markers and the real-tree guard

**Files:**
- Create: `server/__tests__/studyFreezeGuard.test.js`
- Create (by the script): `books/efnafraedi-2e/02-mt-output/*/*-segments.locked` (170 files)
- Possibly modify: tests the full suite shows asserting chemistry is unlocked (recalibrate, with the reason)

**Interfaces:**
- Consumes: `checkMarkers`, `currentManifest`, `compareToManifest`, `STUDY_BOOKS`.

- [ ] **Step 1: Write the guard test** against the real tree (default `segmentParser.BOOKS_DIR`):

```js
it.each(STUDY_BOOKS)('%s: every study unit holds the freeze marker, byte for byte (T8)', (book) => {
  const m = checkMarkers({ book });
  expect(m.total).toBeGreaterThan(0);
  expect(m.absent).toEqual([]);
  expect(m.foreign).toEqual([]);
  expect(m.freeze).toBe(m.total);
});
it.each(STUDY_BOOKS)('%s: the current manifest, if any, still matches the tree', (book) => {
  const cur = currentManifest({ book });
  if (cur) expect(compareToManifest({ book, manifestDir: cur.dir }).pass).toBe(true);
});
it('control: on a planted tree, an absent marker and a served-text change are both caught', ...);
it('check run as a file from server/ as cwd exits 0 with PASS (Review Focus 3)', () => {
  // spawnSync(process.execPath, ['scripts/study-freeze.js', 'check'], { cwd: <repo>/server, encoding: 'utf8' })
  // status 0, stdout contains 'STUDY FREEZE CHECK: PASS'
});
```

- [ ] **Step 2: Run** `npx vitest run server/__tests__/studyFreezeGuard.test.js` — expect FAIL: 170 absent.
- [ ] **Step 3: Dry run on the real tree:** `node server/scripts/study-freeze.js markers` — expect 170 to lock,
  0 already, 0 refusals. Anything else: stop and report.
- [ ] **Step 4: Write:** `node server/scripts/study-freeze.js markers --write` — expect `written 170, already 0,
  total 170`. Then `git status --porcelain books/` shows exactly 170 new `*-segments.locked` files and nothing else
  (`| wc -l` = 170); `sha256sum` over them gives one distinct hash.
- [ ] **Step 5: Run** the guard — expect PASS. Then `node server/scripts/study-freeze.js check` — expect
  `PASS`, `markers 170/170`.
- [ ] **Step 6: Run the whole floor** from the repo root: `df -h /tmp` first (memory: a near-full `/tmp` fakes `EIO`
  reds), then `npm test`, `npm run lint`, `npm run format:check`, and `cd server && npm run test:e2e` (it saves into
  real chemistry units; `npm test` does not run it). Expect: extraction prints lock warnings for chemistry (not a
  failure). Any red caused by the markers is recalibrated with the reason in its commit; any other red is diagnosed
  by name against `origin/main`'s failing set before being called pre-existing. If Playwright cannot run locally, say
  so; the draft PR's CI `e2e` check is then the gate.
- [ ] **Step 7: Commit** the guard test and the 170 markers (`git add server/__tests__/studyFreezeGuard.test.js
  books/efnafraedi-2e/02-mt-output`) — `data(freeze): content-free MT lock markers on all 170 chemistry units (G1.7
  step 1)`; recalibrations in their own commits.

### Task 7: The records, the production read, the draft PR

**Files:**
- Modify: `docs/plans/2026-07-21-post-item17-followup-campaign.md` (a new `⏭ 2026-11-19 (G1.7 step 1 built)` entry
  directly under the RESUME heading, like its neighbours; §C111 closed in place)
- Modify: `docs/plans/2026-10-23-skerfur-development-plan.md` (a dated ✏️ note after the 2026-11-12 G1.12 note)
- Modify: `docs/plans/2026-10-10-chemistry-finish-preparation-plan.md` (a dated ✏️ note under 4.1)

- [ ] **Step 1: Register entry.** States: step 1 built on this branch (commits, the guard, `check` PASS 170/170);
  [USER]'s three rulings of 2026-11-19 with a pointer to the spec's §2 (do not restate); the measurements of spec §3
  by pointer; ▶ NEXT: [USER] reviews the draft PR; before merging, the production presence read (Step 4); after
  deploy, `check` on production; step 2 waits for [USER]'s word. No counts beyond what the run printed.
- [ ] **Step 2: §C111.** Add a ✅ line: the "properly safe format" is the freeze marker (spec §6.2), written to every
  study unit by `study-freeze.js`, independent of any database; the `--db` production run is not needed for
  chemistry (spec §3) and was dropped by [USER] on 2026-11-19.
- [ ] **Step 3: Plan notes.** Skerfur: *"✏️ 2026-11-19, G1.7 ([design](…), approved): two steps, markers now and the
  manifest and tag at a later cut; the production `backfill-mt-locks.js` run is dropped, because every unit it could
  reach is a chemistry unit the markers lock."* 10-10 under 4.1: *"✏️ 2026-11-19: ruled out for the study ([USER]);
  editors see the layer-1 text of the 8 segments held only in layer 1s (G1.7 design §2)."*
- [ ] **Step 4: Production presence read, read-only** (the pre-merge condition of spec §7):
  `ssh -o BatchMode=yes siggi@172.236.212.190 'cd ~/repos/namsbokasafn-efni && git log -1 --format=%h && find books/efnafraedi-2e/02-mt-output -name "*-segments.locked" | wc -l'`
  — expect `0`. Non-zero: stop and report to [USER]; do not read the marker.
- [ ] **Step 5: Commit** the three docs — `docs(register): G1.7 step 1 built; §C111 closed; plan notes`.
- [ ] **Step 6: With [USER]'s go,** push `docs/g17-freeze-design` and open a **draft** PR against `main`. Body:
  what step 1 does, the three rulings by pointer, the floor results as printed, the pre-merge production read, the
  post-deploy `check`, and that no tag is created. ⚠️ The register insertion point may conflict with the c19 branch
  and #740, which also add entries at the top; resolve by keeping every entry.
