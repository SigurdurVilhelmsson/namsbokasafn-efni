# G1.7: the study freeze — content-free MT locks now, the manifest and tag at the cut (DESIGN, approved 2026-11-19)

> ✅ **DESIGN, APPROVED BY [USER] 2026-11-19**, with that day's three changes folded in before approval (§2: 4.1 ruled
> out; §8: the fresh-extraction landing condition, c19 and the Fable promotion optional). **Banner-frozen from
> approval: amended only by dated notes.** Not status: open work and its state live in the active register's
> ⏩ RESUME block.
>
> **Implements:** the Skerfur plan's G1.7 row (`docs/plans/2026-10-23-skerfur-development-plan.md`); the 10-10
> plan's 4.4 ("MT locks re-applied") and 5.1 ("Freeze: a git tag plus a manifest of every layer"); the G1.1 spec's
> §5.19 and R5 (`docs/superpowers/specs/2026-11-03-served-version-and-event-log-design.md`); and the open
> "properly safe format" question in register §C111.

## 1. What this is for

Before any chemistry unit opens for editing, three things must hold.

1. **Every study unit carries an MT lock marker that says nothing about a person or a time.** Today the first save
   or MT accept in a unit writes `books/<slug>/02-mt-output/chNN/<unit>-segments.locked` with `lockedAt` (an ISO time
   to the millisecond) and the first edit's or acceptance's id, and the two-hourly cron pushes that file to the public
   repository. So each unit would publish when its editor started, for an editor who declined the research as much as
   for anyone (G1.1 spec §5.19). `writeMtLock` does nothing when a marker exists, so a content-free marker written
   first closes that leak for good. The same marker is the MT lock the 10-10 plan's 4.4 asks for: `api-translate`
   refuses a locked unit in every mode.
2. **A manifest records the frozen base by value.** For every segment, the hash of its English and of its Icelandic,
   exactly as the editor's loader serves them, so that a served-version row (G1.1) is "the frozen base" if and only
   if it matches a manifest line (G1.1 spec §5.2, "a join, not a column"). It also records each layer as 10-10 5.1
   lists: commits, hand repairs, the ruling-set snapshot, the approved-term count.
3. **A git tag names the commit that holds the manifest.**

The research report compares pure MT, AI-revised MT and human text (CLAUDE.md § Purpose). The freeze is what lets
a reader of that report check which base each editor worked from.

## 2. What [USER] decided (2026-11-19)

- **Two steps (approach A, §5).** The markers land now, in their own PR. The manifest and the tag are cut later, by
  the same script, once [USER] says the base has stopped changing.
- **No chemistry MT purchase is planned before editing.** The markers end them all (§3), so step 1 does not have to
  wait for one.
- **The production run of `scripts/backfill-mt-locks.js` is dropped.** Every unit it would reach on production is a
  chemistry unit that step 1 locks (§3).
- **10-10 4.1 is ruled out for the study.** The loader does not read layer 1s, so editors see the layer-1 text of
  the 8 segments whose fixed Icelandic exists only in `02-mt-selected/` (§3), and correcting it is ordinary editing
  work. The markers also stop layer 1s from growing (a re-request refuses a locked unit), so this stays at 8.

**Departures from the plan rows, for the record:**

- The Skerfur row's "Run `scripts/backfill-mt-locks.js` on production" is dropped (above). The production step is
  now a read-only check (§9).
- The 10-10 plan's 5.1 is one act; here it is two. The markers satisfy 4.4 and §5.19's "before any unit opens"; the
  manifest and tag satisfy 5.1 at the cut.

The PR that builds step 1 adds a dated note under the Skerfur table saying both, and closes §C111's format question
in the register (§7).

## 3. What was measured (2026-11-19)

- **Production, read-only over ssh:** the server runs `474647ffb`; chemistry has **0** markers, a clean tree under
  `books/efnafraedi-2e/` and **0** faithful files. The one marker on production is biology's `m66443`.
- **Production's editing rows by book (aggregate, read-only):** `segment_edits` in 7 chemistry units and 1 biology
  unit (already locked); `segment_acceptances` in 1 chemistry unit. So every unit the backfill could reach is a
  chemistry unit (the "five modules with old rows" of the Skerfur row are among them).
- **The study units:** 170 in chemistry, which is 149 modules plus 21 `chapter-metadata` units, including `ch00` and
  `appendices`. Enumerated as check G-1g does (`readG1g` in `server/scripts/read-research-preconditions.js`).
  `ch00` holds one module, `m68662`, which the module route refuses (`server/middleware/validateParams.js` rejects a
  chapter below 1), so it is never opened and never minted. It is locked and listed all the same, so that G-1g and
  the freeze keep one unit set; its manifest lines simply never join anything.
- **The served base, computed at `474647ffb`** with `segmentParser.loadModuleForEditing` and
  `servedVersions.versionRowsFor` (no database): **22,591** segment occurrences, **0** duplicated ids (G1.12 holds),
  **0** without Icelandic, every one served from layer `mt-output`. It takes about 0.5 s. As JSONL with the
  served-version column names, about 6.2 MB.
- **`api-translate` refuses a locked unit in every mode:** a normal run and `--force` (`mtRunDecision` returns
  `locked-skip` before anything else), `--top-up` (same function, same order) and `--rerequest` (`runRerequestMode`
  checks `isMtLocked` and sends nothing).
- **Nothing reads a marker's body.** `isMtLocked` checks only that the file exists (an unreadable one counts as
  locked). No code reads `lockedAt`, `firstEditId` or `firstAcceptanceId`.
- **The E2E suite saves edits in real chemistry units.** Its sweep (`server/e2e/helpers/mt-lock-sweep.js`) deletes
  only markers the run created and warns only about *untracked* pre-existing ones, so committed markers are kept and
  unwarned. With a marker present, the first-edit hook writes nothing.
- **`cnxml-extract` warns, and does not refuse,** on a locked unit (§C110). After step 1, an extraction of chemistry
  prints a warning for every unit. That is expected.
- **Layer 1s is not served.** No server code reads `02-mt-selected/`, which holds 8 segments in 3 modules (`m68744`,
  `m68852`, `m68856`). The loader serves those segments' layer-1 text, and with 4.1 ruled out (§2) it keeps doing so.
- **No chemistry re-extraction is pending.** A fresh extraction of all 23 chapter directories at `474647ffb`, in a
  throwaway worktree, rewrote all 170 English files and every one was byte-identical to the committed file; the only
  other differences were the `extractedAt` timestamps of 149 structure manifests.

## 4. Goals, non-goals, anti-goals

**Goals**
- Every study unit holds a byte-identical, content-free freeze marker before any unit opens or G1.13 assigns.
- A manifest whose hashes come from the server's own served-version code and join served versions by value.
- A tag on the commit that holds it.
- A read-only check, runnable on production, that proves the markers and, once it exists, the manifest.
- Tests that fail if a marker disappears or a frozen input changes.
- **After the cut, a frozen unit's served text changes only through a deliberate re-cut (§6.6).** The served hash
  depends on the files *and* on the loader's normalisation (`parseSegments`, `unescapeMtMarkers`,
  `normalizeTermMarkers`, the first-copy rule), so a code change can move it as surely as a file change. Either one
  fails CI until a re-cut records it.

**Non-goals**
- Fixing the first-act hooks for books outside the study (they fire only on a unit's first-ever row, and
  propagation never locks). For the study book the markers make this moot; the other books are closed to editors by
  G1.13.
- c19's apply and the Fable trial's ch10 promotion. The cut records whatever state they are in (§8). (10-10 4.1 is
  ruled out, §2.)
- The end-of-editing export (G1.1 PR5).
- Freezing the glossary. It is recorded at the cut, not frozen: terminology work continues during editing.
- Recording the in-flight edits that sit in production's database (G-1e). They live in `sessions.db`, they are
  editors' work, and they are not part of the base.

**Anti-goals: these would make it a failure even if it ran**
- A marker body holding a time, a person, an edit id or anything that differs between units.
- A manifest hash computed by any code other than the path that mints served versions.
- Any script writing on production.
- Overwriting, or silently accepting, a marker this design did not write.
- Printing a marker's body anywhere: a foreign marker may hold a person's first-act time.

## 5. Approaches considered

| | Markers | Manifest and tag | Trade-off |
|---|---|---|---|
| **A: two steps (chosen)** | Now, committed in a PR; production gets them on deploy | Later, from the same script, behind a draft PR with landing conditions (as G1.12 was landed) | Closes the leak and protects the base now; ends chemistry MT purchases now (none is planned) |
| B: one step | At the cut | At the cut | One commit is the whole freeze, but the leak and the re-attach hazard stay open until c19, 4.1 and the Fable trial settle |
| C: a production script writes the markers | On production; the cron pushes them | Committed separately | Rejected: the cron stages only the marker glob, so the manifest would need a hand commit on production; a script writing on production is less reviewable than a diff; and a production-written marker set is not visible in review before it is live |

Why A: the markers and the manifest protect against different things on different clocks. The leak and the
re-attach hazard exist now (4.2's re-attach goes through the save service, so if it ran before the markers it would
write time-stamped ones), while the manifest is only correct once the base stops changing.

## 6. Design

### 6.1 One list of study units

Step 1 moves `readG1g`'s enumeration into `server/lib/studyUnits.js` as `listStudyUnits({ book, booksDir })`, and
`readG1g` calls it. The freeze script uses the same function, so G-1g and the freeze cannot disagree on what a study
unit is. A unit is: a chapter directory of `02-for-mt/` that `chapterFromDir` accepts, a `<id>-segments.en.md` file
in it, and an id matching `UNIT_ID` (`m\d{5}` or `chapter-metadata`). Each entry carries `chapterDir`, the chapter
number (`chapterFromDir`), the unit id and the paths of its MT file and marker. The study books come from
`researchScope.STUDY_BOOKS`. `readG1g`'s output must not change; its existing tests pin it.

### 6.2 The freeze marker

`tools/lib/mt-lock.cjs` owns the marker convention, so it gains the freeze marker:

- `FREEZE_LOCK_BODY`: the exact bytes, the same for every unit: `JSON.stringify({ reason: 'freeze' }, null, 2) + '\n'`.
  No time (the commit and tag already date it), no commit (a committed file cannot name the commit that holds it,
  and in approach A the marker precedes the cut), no unit id (a constant body is checkable by byte comparison).
- `freezeLockState(mtOutputPath)` → `'absent' | 'freeze' | 'foreign'`, comparing bytes. It never returns or logs the
  body.
- `writeFreezeLock(mtOutputPath)` writes the body when absent, does nothing when the bytes already match, and throws
  (code `FOREIGN_LOCK`, message naming the path only) when another marker is there. It never overwrites.

`writeMtLock` and `isMtLocked` do not change. A freeze marker is a lock to every existing reader.

### 6.3 The script: `server/scripts/study-freeze.js`

It lives in `server/` because the manifest must call the server's loader and served-version code (and a `tools/`
script importing `server/` would add an MIT→AGPL edge). It is CommonJS, opens no database and writes only under
`books/<book>/`. It parses its own arguments and **refuses an unknown flag** (`tools/lib/parseArgs.js` drops them
silently; CLAUDE.md). `--book` defaults to the single study book and refuses a book not in `STUDY_BOOKS`. Exit codes
follow CLAUDE.md: `process.exitCode` is set to failure on entry and cleared only when a verdict is reached; nothing
calls `process.exit()` after writing output.

Three subcommands:

- **`markers`** (dry run by default; `--write` to write). Classifies every study unit as absent, freeze or foreign.
  It refuses the whole run, writing nothing, if any unit holds a foreign marker or has no MT file, and names those
  units. With `--write` it writes the absent ones and prints `written N, already M, total T`.
- **`manifest`** (dry run by default; `--write --tag <name>` to write). Preconditions, each a named refusal: every
  unit holds the freeze marker; no unit has a duplicated id or no layer; `git status --porcelain` is empty for the
  book's input directories (`02-for-mt`, `02-mt-output`, `02-mt-selected`, `02-mt-revised`,
  `03-faithful-translation`, `glossary`). The dry run prints the counts and the sha256 the files would have. With
  `--write` it writes the two files of §6.4 under `books/<book>/freeze/<tag>/` and refuses if that directory exists.
- **`check`** (read-only, always). Verifies every study unit holds the freeze marker, byte for byte, and prints only
  counts and unit ids, never a body. With `--manifest <dir>`, or by default the single directory under
  `books/<book>/freeze/` if there is one (more than one and no `--manifest` is a refusal), it also recomputes and
  compares by value:
  - each unit's English and MT file hashes against the manifest (these never change during the study);
  - each segment line, for every unit still served from its frozen layer. A unit now served from a faithful file
    (edits applied after the hold lifts) is reported as `moved to faithful`, which is expected and is not a failure.
  - A segment mismatch carries one of two verdicts, because they call for different responses: `input changed` (the
    unit's English or MT file hash differs from the manifest) or `served text changed, inputs unchanged` (the files
    match, so the loader's code moved the hash). Either is a FAIL, and the output names the re-cut route (§6.6).
  - It compares against the **current** manifest: the one no other manifest supersedes (§6.6).
  - It prints `STUDY FREEZE CHECK: PASS` or `FAIL`, the counts, and at most 20 differing keys (unit and segment
    ids, never text).

### 6.4 The manifest: `books/<book>/freeze/<tag>/`

**`segments.jsonl`**: one line per served segment occurrence, units in chapter order (`compareChapters`) then unit
id, segments in served order. Each line carries exactly the served-version key minus `book`:
`{"chapter":1,"module_id":"m68663","segment_id":"…","occurrence":0,"en_sha256":"…","is_sha256":"…","layer":"mt-output"}`.
The rows come from `versionRowsFor(loadModuleForEditing(book, chapter, unit), { book, chapter, moduleId })`; the
script computes no hash of its own. The texts are not copied: they are in git at the base commit.

**`freeze.json`**: the header, holding no person and no time except the cut date.
- `schema: "study-freeze/1"`, `book`, `tag`, `cutDate` (YYYY-MM-DD, from the tag), `baseCommit` (HEAD when
  computed), `segmentsSha256`.
- `counts`: units, segments, segments by layer.
- `units[]`: chapter, `chapterDir`, unit id, sha256 of its English file and of its MT file, sha256 of its faithful
  file or `null`, sha256 of its layer-2 change log (`02-mt-revised/<chapterDir>/<unit>-changes.jsonl`, the file
  G1.23 builds its suggestions from) or `null`, segment count, `marker: "freeze"`. The change-log hash is recorded,
  not enforced: what each editor was actually shown is G1.23's own record, and the revision records do not hash the
  change logs (all 170 carry the same 13 keys and `overlay: null`).
- `layers`:
  - layer 1: `02-mt-output`, the last commit that touched it, and its hand repairs (each commit whose subject
    holds `HAND REPAIR` and that touched the book's `02-mt-output`, with its subject);
  - layer 1s: each `02-mt-selected` file with its sha256 and entry count, and whether any manifest segment was served
    from it (today: none, §3);
  - layer 2: the number of `02-mt-revised` revision records, the distinct ruling sets (path and sha256), prompts,
    models and run ids they name, and one sha256 over the revision records in path order;
  - layer 3: the number of faithful files and of review-status sidecars.
- `glossary`: the path, sha256, `producer` and term count of `glossary-unified.json` (every exported term is
  approved, `server/lib/resolvedGlossary.js`): the approved-term count 10-10 5.1 asks for. The rulings of c19 reach
  the repository through this file, so its hash is the ruling-set snapshot for terminology.
- `markers`: the count and the sha256 of `FREEZE_LOCK_BODY`.

The join, as the G1.1 spec §5.2 fixes it: a served-version row is the frozen base when its `book` equals the
header's and its (chapter, module id, segment id, occurrence, en_sha256, is_sha256) equals a line of
`segments.jsonl`. **`layer` is recorded on each line but is not part of the join.** A unit's first apply writes its
whole base into the faithful file, so an untouched segment is then served as `faithful` with the same hashes, and
G1.1 mints a second row for it (§5.2: the same text under a new label gets its own row). That row is still the
frozen base; a join on `layer` would drop every untouched segment of an applied unit.

### 6.5 The tag

An annotated tag `freeze-<book>-<YYYY-MM-DD>` (the same style as `s-2026-11-01`), on the merge commit of the
manifest PR, placed only after `check` passes at that commit. Its message names the manifest directory and the
sha256 of `freeze.json`. Pushing a tag is outward-facing, so it waits for [USER]'s go.

### 6.6 A change to the base after the cut: the re-cut

If a frozen unit's served text must change after the cut (a loader fix, a re-extraction G1.5's protocol allows),
the change lands together with a **re-cut**: a new manifest directory under a new tag, whose `freeze.json` carries
`supersedes: "<earlier tag>"`. The earlier manifest stays, unedited: it is the record of the base for every unit
opened before the re-cut. `check` and the guard test compare against the current manifest only. A served version
is the frozen base if it joins a line of **any** manifest, and the manifest it joins says which cut it belongs to.
A re-cut is [USER]'s decision, recorded in the register; this design builds no re-cut command beyond `manifest`
plus the `supersedes` field (`--supersedes <tag>`, refused unless that tag's manifest exists and is current).

## 7. Step 1: the markers (now)

**One PR, a draft until [USER] approves:**
- `mt-lock.cjs`'s freeze marker and its tests (§10, T1–T2);
- `server/lib/studyUnits.js`, with `readG1g` calling it;
- `server/scripts/study-freeze.js` with all three subcommands, so step 2 is a run and a data PR, not new code;
- the 170 markers, written by `study-freeze.js markers --write` on the branch, never by hand;
- a guard test on the real tree: every study unit holds the byte-identical freeze body and the count equals the
  unit count (with a planted control, so a broken comparison cannot pass);
- the manifest guard, built now so that step 2 adds no code: for each study book's current manifest it recomputes
  every segment line of every unit still served from its frozen layer and every unit's English and MT file hashes,
  and fails on any difference, with `check`'s two verdicts (§6.3). It costs about 0.5 s. Until step 2 there is no
  manifest, so it checks nothing on the real tree, but its planted controls (a temp manifest with one line's hash
  changed, and one with an MT file hash changed) run every time, so the comparison is proven before it has work;
- docs: a register entry; §C111 closed (its "properly safe format" is the freeze marker, written to every unit and
  not dependent on any database); a dated note under the Skerfur table (§2).

**Before merging:** re-read production's chemistry markers, read-only. If production has grown one (a save in the
window), stop: the deploy's `git pull --rebase` would meet an add/add on that path, and that marker carries a
person's time. [USER] decides what to do with it.

**After merging:** [USER] deploys; then `check` on production (§9). G-1g then reads `lacking: []`.

**Order with other work:** before 4.2's re-attach runs on production, before any unit opens, before G1.13 assigns.

**Test fallout to expect:** run the whole suite with the markers in place before opening the PR, **and the
Playwright E2E run** (`server/`'s `test:e2e`): it saves into real chemistry units, and `npm test` does not run it. Extraction warns
on every chemistry unit; anything that asserted chemistry was unlocked is recalibrated, with the reason in the
commit.

## 8. Step 2: the cut (later, when [USER] says)

**Landing conditions**, written into the draft PR as G1.12's were:
- **a fresh extraction reproduces the English:** every chemistry chapter directory extracted at the cut's base
  commit, in a throwaway worktree (never with `--output-dir`, which the extractor ignores), rewrites all study units'
  `02-for-mt` files byte-identical to the committed ones. It passed on 2026-11-19 (§3); re-run it at the cut, because
  an extractor change merged in between would otherwise move the English after the freeze;
- `manifest` passes its preconditions (§6.3).

**Optional, at [USER]'s choice:** neither changes the base, and the manifest records them without enforcing them,
so landing either after the cut needs no re-cut. Waiting only keeps the manifest's record current.
- c19's apply has run on production and its export is pulled (the manifest's glossary hash and approved-term count);
- the Fable trial's ch10 promotion is done (layer 2's record and ch10's change-log hashes).

**Then:** `study-freeze.js manifest --write --tag freeze-efnafraedi-2e-<date>` on a branch from `origin/main`; a
data-only PR adding the manifest (step 1's manifest guard picks it up and runs on the real tree from then on);
merge; `check` at the merge commit; tag; deploy; `check` on production. It must land before any unit opens and
before G1.13 assigns.

## 9. The production step

Nothing writes on production. After each deploy, read-only:

```
cd ~/repos/namsbokasafn-efni && /usr/bin/node server/scripts/study-freeze.js check
```

Step 1 expects `PASS` with `markers 170/170`; step 2 adds the manifest comparison. A read-only, non-sudo command, so
Claude may run it over ssh, as with the other production checks.

## 10. Proofs

| # | What | How it could be wrong without it |
|---|---|---|
| T1 | `writeFreezeLock`: absent → writes exactly `FREEZE_LOCK_BODY`; identical → no write (mtime unchanged); foreign → throws, file bytes unchanged. The body parses and holds no date-like string | A marker that carries a time, or an overwrite of a person's marker |
| T2 | `markers --write` with one foreign marker planted among absent ones writes nothing at all, names the unit, and does not print the planted body; the same for a unit with no MT file | A half-written freeze, or a body printed into a log |
| T3 | **The value join.** A temp books tree and a temp migrated database: serve every unit through the real module route (or `recordServe`) to mint rows; run `manifest`; every minted row joins a line on the six values of §6.4 and the counts are equal. Relabel case: write the same text as a faithful file and serve again; the new `faithful` rows join too. Control: change one byte of one MT segment and serve again; exactly one minted row fails to join | A manifest computed one normalisation step away from what is served, which would join nothing |
| T4 | Two `manifest` runs on the same tree produce identical bytes | A field that drifts by itself |
| T5 | `check`: PASS on a clean tree; FAIL for a deleted marker, a foreign marker (stdout never contains its body) and a changed MT file; a unit moved to faithful is reported and not a failure | A check that cannot fail, or one that leaks |
| T6 | An unknown flag exits non-zero and writes nothing; a non-study `--book` is refused; the exit code is failure if no verdict is reached | A misspelt `--write` treated as a dry run, or the reverse |
| T7 | `readG1g` output unchanged after the move to `listStudyUnits` (its existing tests) | G-1g and the freeze disagreeing on the unit set |
| T8 | The real-tree marker guard of §7, with its control | A marker deleted later, or a new unit added without one |
| T9 | The manifest guard of §7: its controls fail with `served text changed, inputs unchanged` (a line's `is_sha256` altered, files untouched) and with `input changed` (an MT file hash altered); a manifest that `supersedes` another makes the earlier one ignored | A loader change that silently stops served versions joining the base, caught only on production or never |

Every new test is run against the code with the behaviour broken before it is trusted (the register's rule for
regression tests).

## 11. Claude's calls, for [USER] to check

1. The marker body is the constant `{ "reason": "freeze" }`, with no time, commit or unit (§6.2).
2. The script is one file with three subcommands, built entirely in step 1, so step 2 adds no code (§6.3, §7).
3. The manifest lives in `books/efnafraedi-2e/freeze/<tag>/` as two files; `segments.jsonl` is about 6 MB (§6.4).
4. The tag is `freeze-efnafraedi-2e-<date>` on the manifest PR's merge commit (§6.5).
5. `check` treats a unit served from a faithful file as expected after editing starts, so it stays usable for the
   whole study (§6.3).
6. The glossary file's hash stands for the terminology ruling-set snapshot; layer 2's own ruling-set files are listed
   beside it (§6.4).
7. The G-1g enumeration moves to a shared function rather than being copied (§6.1).
8. After the cut, the served text of a frozen unit is frozen, code included: the manifest guard recomputes every
   line in CI, and a deliberate change goes through a re-cut that supersedes, never edits, the earlier manifest
   (§4, §6.6). The alternative, freezing only the files, would let a loader change silently stop served versions
   joining the base.
9. Layer 2's change logs (the suggestions' source) are hashed per unit in the manifest but not enforced, like the
   glossary; G1.23's logs record what each editor was shown (§6.4).
10. `ch00`'s one module is locked and listed although the module route refuses it, to keep one unit set with G-1g
    (§3).

## 12. Left to the builder

The exact output wording; the order of the header's fields; how T3 drives the module route (the served-version
tests' fixtures are the model); whether T21 (`server/__tests__/mtLockFreezeMarker.test.js`) switches its fixture to
`FREEZE_LOCK_BODY`. The git-derived header fields (`baseCommit`, layer 1's last commit, the hand-repair list) are
computed only by `manifest --write`, which needs full history; `check` and the guard never recompute them (CI
clones shallow), and tests inject them. `server/__tests__/readResearchPreconditions.test.js` pins `readG1g`'s requires, so it gains
`../lib/studyUnits` when the enumeration moves.
