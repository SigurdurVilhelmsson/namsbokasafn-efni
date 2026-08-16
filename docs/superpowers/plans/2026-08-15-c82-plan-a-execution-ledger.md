<!-- ⚠️ FROZEN SNAPSHOT of the SDD execution ledger — RE-SNAPSHOT 2026-08-16 at branch close,
     deliberately and in full, per the previous banner's own instruction ("do not update it
     incrementally; re-snapshot deliberately"). The prior snapshot was taken at `8a067e31`,
     before Task 9's review, the blind-pair whole-branch review, the fix wave and the register
     update — and it still named the media defect §C84, a number that was already taken.

     This exists because `.superpowers/` is gitignored and does not survive `git clean -fdx`.
     It is EVIDENCE, not status: if it and the live ledger disagree, THE LIVE ONE WINS, and
     the active register outranks both on anything that is open work. -->


> **This is the LIVE ledger.** A frozen copy was committed to the branch at `680afd31` as
> `docs/superpowers/plans/2026-08-15-c82-plan-a-execution-ledger.md`, because this directory is
> gitignored and does not survive `git clean -fdx`. **If the two disagree, THIS one wins.**
> The committed copy is a disaster-recovery snapshot taken at HEAD `8a067e31` — do not update it
> incrementally; re-snapshot deliberately, or delete it once the branch merges.

Spec (binding authority): `docs/superpowers/specs/2026-08-13-gated-per-module-remt-loop-design.md`
+ `docs/superpowers/specs/2026-08-13-remt-check-battery.md` — both read.
Branch: `feat/c82-plan-a-prerequisites` · MERGE_BASE `6f8fe867` · plan committed `8a054871`.

---

## ⏩ RESUME — SUPERSEDED. Read the "⏸️ STATE AT HANDOFF" block at the BOTTOM of this file instead.

**As of 11:42 all NINE tasks are implemented and committed** — HEAD `8a067e31`, 26 commits, tracked tree clean, nothing pushed. Task 9's task review, the final whole-branch review, the register update and the branch-finishing step are what remain; the bottom block lists them in order with the exact commands.

*(The 11:20 text below is kept because its Task-9 recovery notes and the `git status` `AM` lesson are still worth reading, but its top line is out of date: Task 9 is no longer uncommitted.)*

---

## ⏩ RESUME — state as of 2026-08-16 11:20 (written for a possible session restart)

**Tasks 1–8 are COMPLETE and COMMITTED. Task 9 is the only one left, and its code exists but is UNVERIFIED and UNCOMMITTED.**

- **HEAD:** `3d753df7` on `feat/c82-plan-a-prerequisites`. Tracked tree **clean**. Nothing pushed — this branch is local only, deliberately (docs-only pushes to `main` strand prod's content backup).
- **Suite at HEAD:** 321 files / 4,725 tests green; lint + format clean. Nothing under `books/` was ever modified.

### ⚠️ Task 9's three files are STAGED (`A `) but UNCOMMITTED

**Correction, 11:31** — they were untracked at 11:19; `impl-task9b` subsequently **staged** them along with substantial corrections (75 insertions / 63 deletions in the corpus test). While preparing for a restart I briefly moved them aside and restored an older copy, which reverted the worktree — **recovered with `git checkout -- <files>`, restoring from the index**, i.e. the agent's newer work. Verified afterwards: index == worktree for all three, unit tests 5/5.

▶ **Being in the index means `git clean -fdx` will NOT remove them** (clean only touches untracked files). They are still lost to a hard reset. Backups outside the repo: `<scratchpad>/task9-draft/` (recovered/newer) and `<scratchpad>/task9-draft-OLD/` (the pre-correction draft, kept in case the newer one was mid-write).

⚠️ **Lesson for whoever resumes: do not "restore" a file from a backup without first checking whether the index holds newer content.** `git status` showing `AM` means exactly that, and I nearly discarded the agent's corrections by reading `AM` as damage rather than as work.

```
tools/lib/inject-roundtrip.js
tools/__tests__/inject-roundtrip.test.js
tools/__tests__/inject-roundtrip-corpus.test.js
```
**Backed up outside the repo** at
`/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/ece90853-6bda-4e9d-a45b-89665a105464/scratchpad/task9-draft/`
(plus a copy of this ledger). That directory survives `git clean`; `/tmp` does not survive a reboot.

**What is known about them:** written by `impl-task9`, which then **died** without committing, verifying, or reporting. Verified since, by the controller only: they are textually faithful to the brief, and `npx vitest run tools/__tests__/inject-roundtrip.test.js` passes **5/5**. **Nothing else has been checked** — the corpus sweep, the mandatory discrimination check, the full suite, lint/format, the commit and the report are all still owed.

### To resume Task 9

1. Confirm the three files are present (restore from the backup if not).
2. Re-dispatch an implementer with `<workspace>/task-9-brief.md`, telling it the files are an **unverified draft** and that it must run every verification from scratch — and must report a step it cannot run retroactively as *not run*, never imply it ran.
3. The load-bearing step is the brief's **Step 6 discrimination check**: `git checkout 07167ac7 -- tools/cnxml-extract.js`, run the corpus test, confirm the `regression fixtures` case goes **red**, restore, prove byte-identical.
   ⚠️ **That check stages `tools/cnxml-extract.js`.** If you find it staged-modified, check its CONTENT before panicking — on 2026-08-16 it was a stale index entry with content identical to HEAD, cleared with `git reset HEAD -- tools/cnxml-extract.js`. If the content really is `07167ac7`'s, restore it immediately: that is the BROKEN extractor.
4. Then: task review → fix loop → **final whole-branch review** (most capable model, `review-package` over `6f8fe867..HEAD`) → register update → `superpowers:finishing-a-development-branch`.

### Still owed after Task 9

- **The register update** (`docs/plans/2026-07-21-post-item17-followup-campaign.md`). A full draft is ready at `<workspace>/register-entry-draft.md` — new items **§C84** (inject drops/duplicates whole `<media>` elements in organic; `m00032` is IN §C80 scope) and **§C85** (`validate-chapter` is chapter-scoped; the battery spec miscategorised it), plus three §C82 amendments. **Not yet applied.** ⚠️ **SUPERSEDED — the numbers here are WRONG (§C84 was taken) and the draft is DELETED. Applied as §C85/§C86/§C87; see the handoff block at the bottom.**
- **The deferred-minor list** further down this file — hand it to the final whole-branch review to triage.
- **A deploy of `main` is owed to the user**, unrelated to this branch and pre-existing (see the campaign register's RESUME block).

---

## Setup rulings

**Ruling 1: branch on the main checkout, not a git worktree.** — The skill mandates
isolation from `main`; a feature branch provides it. A worktree was rejected on
measurement: the working tree is **5.6 GB** (`books/` images), and a fresh worktree has
no `node_modules` — including `server/node_modules`, which holds the natively-compiled
`better-sqlite3`, so every task's `npm test` would first need a node-gyp build. The
project's own campaign process is branch-per-item. — **Cost if wrong:** work happens
beside the user's other checkouts of this repo rather than in a disposable tree; a
`git clean -fdx` would take the SDD workspace with it (recoverable from `git log`).

---

## Pre-flight conflict scan

### Cross-task rows — every pair sharing a file or an interface

| A → B | A produces | B consumes | finding |
|---|---|---|---|
| 1 → 8 | `chapterProvided()` in `tools/lib/parseArgs.js` | Task 8 uses it where `--chapter 0 --module` is possible | ✅ consistent |
| **1 ↔ 8** | Task 1 (amended) edits `cnxml-render-fidelity-check.js` + `validate-chapter.js` | Task 8 edits **the same two files** | ⚠️ **FILE OVERLAP** → Ruling 3 |
| 2 → 3 | `buildRunRecord`, `glossaryContentHash`, `RUN_RECORD_VERSION` | Task 3 stores the object opaquely; does **not** import run-record.js | ✅ consistent — deliberate decoupling, stated in Task 3 |
| 3 → 4 | `writeProvenance(…, {run})` | Task 4 passes the built record | ✅ consistent |
| 2 → 4 | `buildRunRecord`/`glossaryContentHash` signatures | Task 4's call site names all 10 params | ✅ checked field-by-field — match |
| **4 ↔ 6** | Task 4's new comment cites `bracketMarkerDeltaBySegment` | Task 6 creates that function | ⚠️ **FORWARD REFERENCE** → Ruling 4 |
| 5 → 8 | `analyzeModule` gains `altFindings` | Task 8 Step 6 asserts the key is present | ✅ consistent |
| 5 → 7 | Task 5 edits `extraction-coverage.js` | Task 7 imports `parseModuleDoc` from it | ✅ Task 5 does not touch `parseModuleDoc` |
| 5 ↔ 9 | both count `alt` | Task 5 extraction-side, Task 9 round-trip | ✅ independent instruments, different surfaces — deliberate |
| 6 → (Plan C) | `bracketMarkerDeltaBySegment` | not consumed in this plan | ✅ stated as Plan C's gate input |

### Per-task self-consistency rows

| task | tests vs code it specifies | files created vs later touched | finding |
|---|---|---|---|
| 1 | helper test + CLI test; CLI test now covers all 4 tools | `parseArgs.js` also read by Task 8 | ⚠️ scope wrong → **Ruling 2** |
| 2 | 11 cases vs 3 exports | new file, not touched later | ✅ |
| 3 | 4 cases; back-compat case included | `SCHEMA_VERSION` bump vs `provenance.test.js:41` — that line uses the **constant**, verified | ✅ |
| 4 | stub-client integration ×3 | reorder must not change the return value — plan says so explicitly | ✅ |
| 5 | unit + corpus pin + live discrimination sweep | `hasFindings` deliberately not widened, with stated reason | ✅ |
| 6 | unit + live acceptance trio asserting old-blind **and** new-sighted | needs `seg-markers.cjs` import in `api-translate.js` — **absent today** → **Ruling 5** | ⚠️ |
| 7 | unit + corpus base-rate measurement | fixtures carry `[M]` marks measured with the *old* instrument | ✅ plan already instructs re-measure-and-report |
| 8 | CLI honesty tests | `modulesExamined` presumed absent → own step (3a) | ✅ |
| 9 | unit + discriminate-against-broken + corpus sweep | signatures verified exported pre-handoff | ✅ |

### Rulings arising from the scan

**Ruling 2: Task 1 covers FOUR chapter-0 sites, not two.** — Measured by running each
tool with `--chapter 0 --module m68662` and a `--chapter 1` control:
`cnxml-render-fidelity-check` **silently scanned the whole book** (printed ch0, ch1,
ch2, ch3…) and `validate-chapter` **refused chapter 0 outright**. Neither was in the
plan. The spec targets the defect class ("chapter 0 is falsy"), and the loop calls all
four tools; leaving two known-live instances is this project's own
"measurement generalised one step past its coverage" failure. The two extra sites need
*different* fixes — `cnxml-render-fidelity-check` only its discovery ternary,
`validate-chapter` an `=== null` guard because it has a **hand-rolled parser** and
`chapterProvided` does not apply there. Plan amended in place (Task 1 files, tests,
steps 7a/7b, commit message). — **Cost if wrong:** a larger Task 1 diff with three
distinct fix shapes instead of one, and more review surface.

**Ruling 3: Task 1 takes the chapter guard only; Task 8 takes `--module` handling, in
that order.** — The two tasks now overlap on `cnxml-render-fidelity-check.js` and
`validate-chapter.js`. The same run that exposed Ruling 2 also showed
`cnxml-render-fidelity-check` silently ignoring `--module` — that half is Task 8's
SHOULD-TRIP evidence, not Task 1's work. Split by concern, sequenced by plan order.
Both briefs carry the boundary. — **Cost if wrong:** a merge-order conflict in two
files; both diffs are small and the second implementer sees the first's committed code.

**Ruling 4: Task 4's comment may forward-reference `bracketMarkerDeltaBySegment`.** —
Task 4's reordered block carries a comment pointing at the function Task 6 creates two
tasks later. A reviewer could flag a reference to a non-existent symbol. It is a
**comment**, not code — nothing imports or calls it — and the pointer is exactly what a
future reader needs to know about which instrument gates. — **Cost if wrong:** a Minor
finding at Task 4 review, deferred; the comment becomes accurate at Task 6.

**Ruling 5: Task 6 must add the `seg-markers.cjs` import to `api-translate.js`.** —
Verified: `api-translate.js` does **not** import it today, so
`bracketMarkerDeltaBySegment`'s use of `parseSegmentsMap` needs a new import. The plan
says "confirm and add if absent"; the answer is **absent**. Carried into the Task 6
brief as a decided fact rather than a check. ⚠️ `.cjs` from an ESM file is correct here
— `tools/lib/*.cjs` exists precisely because those modules load from both trees, and
`extraction-coverage.js:17` uses the identical `import segMarkers from './seg-markers.cjs'`
+ destructure idiom. Copy it. — **Cost if wrong:** Task 6 fails at import time,
immediately and loudly.

---

## Task log

### Second pre-flight pass — corpus fixtures (done while Task 1 ran)

Every fixture named by Tasks 5, 6 and 7 was checked for existence, and Task 6's
acceptance claims were re-measured rather than inherited.

**Ruling 6: Task 6's corpus test must DISCOVER the chapter; the plan hardcoded `ch20`
and every case would have failed.** — The five A3 fixtures live in **ch12, ch16, ch17,
ch18, ch21** — none in ch20. Replaced with a `pair(book, moduleId)` helper that scans
`02-for-mt`. — **Cost if wrong:** none identified; the helper is strictly more robust
than a hardcoded path.

**Ruling 7: Task 6's expected values are now MEASURED on this tree, and asserted
exactly, rather than asserted by sign.** — Run 2026-08-16:

| module | ch | old instrument | new (total) | segs w/ delta | unpaired |
|---|---|---|---|---|---|
| m68823 | ch17 | `{}` **blind** | `{MATH:-2}` | 2/149 | 0 |
| m68791 | ch12 | `{}` | `{}` **control** | 0/373 | 0 |
| m68819 | ch16 | `{i:-2}` | adds `MATH:-1` | 3/324 | 0 |
| m68832 | ch18 | `{i:-13,sub:1,sup:1,xref:-11}` | adds `MATH:-1` | 15/86 | 0 |
| m68852 | ch21 | `{}` **blind** | `{MATH:-2}` | 1/81 | 0 |

All five reproduce the battery spec's `[M]` claims exactly (56→54, 120→119, 9→8,
52→50). `BRACKET_MARKER_TYPES` = 14, `KNOWN_BRACKET_TYPES` = 20 → the widening is
14→20. The plan originally said "expect a negative MATH", which passes for a −1 when
the truth is −2. — **Cost if wrong:** an exact assertion is brittle if the committed
MT output is ever regenerated; that is intended — a changed value should stop the
build, since these bytes are the acceptance evidence.

Also verified present: Task 7's `m68710` (ch04), `m68768` (ch10), `m68733` (ch06);
Task 5's `m68727` (ch05).

**Ruling 8 (process, self-correction): the controller must not commit to the branch
while an implementer is live.** — I committed two docs amendments (`de5f251c`,
`7e120c70`) after dispatching Task 1. No interleaving occurred (verified: no
implementer commit existed yet), but it is a real two-writer hazard on one branch.
For Tasks 2-9, all plan amendments land BEFORE the dispatch. Task 1's review package
therefore uses BASE **`7e120c70`**, not the `de5f251c` recorded at dispatch — the two
intervening commits are controller docs, not Task 1's work, and including them would
put plan text in front of a reviewer asked to judge code. — **Cost if wrong:** if the
implementer somehow committed before `7e120c70`, that commit would be invisible to the
review; checked explicitly when the report arrives.

### Third pre-flight pass — Tasks 3, 8, 9 premises (read-only; amendments HELD per Ruling 8)

✅ **Task 3 premise holds.** `tools/__tests__/provenance.test.js` already has `fs`, `os`,
`path`, `dir` (a `beforeEach` tmpdir) and imports `SCHEMA_VERSION` as a constant — so the
version bump does not break its existing assertion, and the appended cases need no new
imports. Plan is correct as written.

✅ **Task 9 premise holds.** Verified in the export blocks: `cnxml-extract.js:2442` exports
`extractSegments` + `formatSegmentsMarkdown`; `cnxml-inject.js:4575` exports `parseSegments`
+ `buildCnxml`. The round-trip idiom is executable as written.

⚠️ **PENDING AMENDMENT A (Task 8) — `modulesExamined` belongs in `summary`, not at top
level.** Measured: `scan-residue.js` emits `{book, summary, modules}` where `summary`
already holds `modulesWithResidue`, `exactResidues`, `ratioWarnings`, `toleratedResidues`.
The plan's test reads `oj.modulesExamined` (top level). Put it in `summary` beside its
siblings and read `oj.summary.modulesExamined`. **To apply before dispatching Task 8.**

⚠️ **PENDING AMENDMENT B (Task 8) — `modules` is an OBJECT keyed by moduleId, not an
array.** The plan's illustrative `modules.filter((m) => m.moduleId === args.module)` does
not typecheck against the real shape; the filter belongs at the `{moduleId, file}` pairs
returned by `collectResidueFiles` (`scan-residue.js:44,51,88`). The plan already says
"adapt the variable names — read the discovery code first", so this is a sharpening, not a
contradiction. **To apply before dispatching Task 8.**

### Fourth pre-flight pass — E5 validated against the LIVE EXTRACTOR (not the artifact)

✅ **Task 5's seg-id parsing verified.** Real alt seg-ids are `m68727:alt:fs-idp164506448-alt`
— i.e. `module:type:elementId` — so `String(id).split(':')[1] === 'alt'` is correct. (No alt
segments exist in the committed `02-for-mt` tree, so this had to be generated in memory via
`extractSegments`.)

🔴 **E5 DISCRIMINATES PERFECTLY, and this is the strongest result of the whole pre-flight.**
Ran the reachability predicate AND the live `extractSegments()` over all 149 chemistry
modules:

```
reachable (expected) = 952    emitted = 951    delta = -1
modules where E5 fires = 1  ->  { m68727, reachable: 6, emitted: 5 }
```

**One firing module, 148 clean controls, and the firing module is the known m68727
regex-truncation defect.** This closes the loop on Ruling 6/7's sibling question: E5 is not
merely "honest about the shortfall", it is a check with a live true positive and a large
negative control — the fixture position the battery spec records half its checks as lacking.

⚠️ **PENDING AMENDMENT C (Task 5) — the corpus pin should assert the live-extractor result
too, not only the source-side census.** As written, Task 5 pins `unreachable == 197` and the
five reason buckets (source-side only). Add: `reachable == 952`, live-extractor emitted
`== 951`, and **exactly one** module short, that module being `m68727`. That converts the
pin from "records the §C81 shortfall" into "demonstrates E5 fires on a real defect and on
nothing else". **To apply before dispatching Task 5.**

⚠️ **PENDING AMENDMENT D (Task 5) — Step 8's stated expectation is half the story.** It says
E5 fires on *every* module with a reachable alt, because `02-for-mt` holds zero alt segments
corpus-wide. True when reading the **committed segment files** — but against the **live
extractor** it fires on exactly one. Both numbers are real and they measure different things;
the step must say which is which, or a reader concludes the check is broken. **To apply
before dispatching Task 5.**

---

Task 1: complete (commits 7e120c70..085f1be1, review clean — Spec ✅ / Quality Approved)
  Suite 315 files / 4638 tests green (branch baseline was 4621: +17 = 5 unit + 12 CLI).
  Lint + format clean. Nothing under books/ touched.
  Discrimination verified independently by the reviewer: 6 of 12 CLI assertions fail
  pre-fix, 6 are controls that pass both sides — matching the implementer's observed
  `6 failed | 6 passed`. No discriminating assertion passed by accident.
Task 1: minor (deferred): brief cited validate-chapter.js:1249; actual :1251/:1256.
  Citation drift in the plan, disclosed by the implementer. No code action.
Task 1: minor (deferred): chapter-zero-cli.test.js spawns real CLI subprocesses incl.
  whole-book scans (~2s) and depends on m68662 living in ch00. Plan-mandated — a
  call-site fix is only provable against real CLI output. Flagged so a future reader
  does not mistake the runtime for a hang, or miss the fixture coupling.

**Ruling 9: batch Tasks 2 and 3 into ONE dispatch; keep Task 4 separate.** — Tasks 2
(`tools/lib/run-record.js`, new pure module) and 3 (`writeProvenance` gains an optional
`run` key) are one deliverable — "a run record can be built and persisted" — and neither
is independently useful: Task 2's output has no store, Task 3's store has nothing to put
in it. Both are additive, both carry complete test code in the plan, both are one source
file plus test cases in an existing file. Reviewing them as one diff is more informative
than reviewing each half. **Task 4 stays its own dispatch** because it edits
`tools/api-translate.js` — the paid MT path — and reorders a block around a
`writeProvenance` call whose failure mode (`resolveRestorePolicy` throws when a segment
file exists with no sidecar) deserves its own review surface. — **Cost if wrong:** one
combined review instead of two; if a finding lands on only one half, the fix round
re-reviews both files rather than one.

### Fifth pre-flight pass — E2 PROTOTYPED AND MEASURED (Task 7). Two amendments, one a real defect in my own spec.

Prototyped `checkBracketBodies` exactly as Task 7 specifies it and ran it over all 149
chemistry modules. **The plan's predicate was wrong**, and the corpus said so.

🔴 **PENDING AMENDMENT E (Task 7) — the source scan must cover the WHOLE DOCUMENT, not
`<content>`. As specified it produces a systematic false-positive class.** `parseModuleDoc`
returns `doc.getElementsByTagName('content')[0]`, but `<glossary>` sits **outside**
`<content>` (measured in m68768: `</content>` at byte 69688, `<glossary` at 69699) — while
the extractor emits **763 `glossary-def` + 763 `glossary-term`** segments per the chemistry
corpus. So every `[[i:…]]` whose source `<emphasis>` lives in a glossary `<meaning>` has no
findable source text and is reported as a swallow. Worked example: m68768's
`[[i:melting point]]` comes from
`<meaning>…see also <emphasis effect="italics">melting point</emphasis></meaning>`.
**Fix: `const { doc } = parseModuleDoc(cnxmlText); const root = doc.documentElement;`**

📊 **PENDING AMENDMENT F (Task 7) — E2's base rate is 1.3%, so it CAN be blocking; and the
corpus test should assert the exact firing set.** Measured both ways:

| source scope | firing modules | findings / markers examined | m68768 (MUST-NOT-TRIP) |
|---|---|---|---|
| `<content>` only (as planned) | **15 / 149 = 10.1%** | 24 / 16,630 | ❌ fires ×2 (false) |
| whole document (corrected) | **2 / 149 = 1.3%** | **2 / 16,630 = 0.01%** | ✅ clean, 126 examined |

The two firing modules are **exactly the battery's two named SHOULD-TRIP fixtures**:
`m68710` → `[[i:is the reductant, HCl(g]]` (the no-leading-space swallow the byte pattern is
structurally blind to) and `m68733` → `[[i: 3d;]]` (the self-closing swallow). **2 true
positives, 147 clean controls, 0 false positives.** Against the instrument it replaces —
89% false positives by occurrence, and blind to m68710 entirely — this is a decisive
improvement, and it is now a *specified* check rather than a measure-and-see.

▶ 1.3% is under the battery's "base rate over ~5% cannot be blocking" bar, so **E2 is
eligible to block**. That is Plan B's call to make; recorded here as its input.

⚠️ Amendments E and F are **HELD** per Ruling 8 — `impl-task23` is live. Apply before
dispatching Task 7. Prototype kept at `<workspace>/e2probe.mjs` (gitignored).

---

Tasks 2+3: complete (commits 9d19d711..0105918c — d7b24bce Task 2, 0105918c Task 3;
  review clean — Spec ✅ both / Quality Approved)
  Suite 316 files / 4653 tests green (+15 on Task 1's 4638: 11 run-record + 4 provenance).
  Lint + format clean. Nothing under books/ touched.
  Reviewer did genuinely independent work: reconstructed the pre-change provenance.js and
  ran the 4 new cases against it (confirming only 1 of 4 was TDD-red, as the implementer
  had itself disclosed); hostile-tested tallyByType with 7 malformed inputs (no throw, all
  bucket to 'unknown'); and extended the SCHEMA_VERSION sweep from "who mentions the
  string" to "who IMPORTS provenance.js" — api-translate, backfill-provenance, cnxml-inject,
  docx-import — none of which dot-access .schemaVersion. Bump confirmed safe under a
  broader check than the implementer ran.

Tasks 2+3: minor (CLOSED IN TASK 4, not deferred): `writeProvenance(dir, id, {run: null})`
  was untested. The reviewer built an alternate implementation WITHOUT the `run !== null`
  guard and it passed all four of Task 3's cases — because `JSON.stringify` drops
  `undefined` keys for free, so "omits the key" cannot separate "chose not to write" from
  "wrote undefined". The shipped code is correct; the guard was simply unproven.
Tasks 2+3: minor (deferred, not filed by the reviewer): `glossaryContentHash` joins fields
  with \t and rows with \n, so a headword containing a literal tab or newline could in
  principle collide. Unrealistic for this corpus and outside the brief.

**Ruling 10: close the `run: null` gap in Task 4 rather than reworking Tasks 2/3.** — It is
a Minor finding and the skill routes Minors to the ledger, not the fix loop; the shipped
code is already correct. But the reviewer named Task 4's call site as the first place a
conditionally-computed `run` could actually be null, and Task 4 was not yet dispatched — so
the cheapest correct close is to add the coverage where the risk lives. Added two cases to
Task 4's test block: one asserting `translateModule` never hands over a null record, and one
pinning `writeProvenance`'s guard directly with an explicit null. Verified both needed
imports (`writeProvenance`, `readProvenance`) are already present in
`api-translate-provenance.test.js:5`. — **Cost if wrong:** two extra cases in Task 4's diff;
if Task 4 is later reverted the pin goes with it, leaving the guard unproven again.

### Sixth pre-flight pass — Task 9 PROTOTYPED. It found REAL reader-visible defects, and my spec for it was wrong.

Prototyped `roundTripAltCount` using the real idiom
(`tools/__tests__/cnxml-extract-example-title.test.js:28-32`) and swept both in-scope books.

🔴 **FINDING — WHOLE `<media>` ELEMENTS ARE DROPPED AND DUPLICATED BY INJECT IN ORGANIC.**
Not just `alt` — the `<media>` and its `<image>` move together, so this is a **missing or
doubled image for readers**.

| module | source media/image/alt | injected | effect | §C80 scope |
|---|---|---|---|---|
| `m00032` | 36 / 36 / 36 | **35 / 35 / 35** | image **DROPPED** | ✅ **IN — organic preview** |
| `m00046` | 4 / 4 / 4 | **5 / 5 / 5** | image **DUPLICATED** | out (book, not preview) |
| `m00023` | 11 alt | 12 alt | duplicated | out |
| `m00069` | 6 alt | 9 alt | duplicated ×3 | out |

`efnafraedi-2e`: **149 modules, 0 loss, 0 gain — perfectly clean.** So the defect is
organic-specific, and the chemistry corpus is a 149-module negative control.

🔴 **WHY §C81'S OWN VERIFICATION MISSED THIS, and it is the reusable lesson.** The C81
artifact reports a round-trip check over all 1,192 modules concluding "ZERO modules gained an
alt attribute" and exactly 4 lost any. That measurement compared **base vintage vs new
vintage** — it asked *"did my change alter the injected alt count?"*. Mine compares **source
vs injected** — *"does the output carry what the source had?"*. **A vintage-diff is
structurally blind to a defect present at BOTH vintages.** This is the register's own rule
("a diff is only a measurement if both sides are the same vintage") firing in the direction
nobody checks: same-vintage agreement is not correctness, it is only stability. ▶ To log to
the active register.

🔴 **PENDING AMENDMENT G (Task 9) — my synthetic `m42296` case asserts the WRONG value and
would fail against correct code.** Measured on the current tree:

```
figure-wrapped                   {rawAlt:1, outAlt:1, ok:true}
m66449 two subfigures            {rawAlt:2, outAlt:2, ok:true}
m42296 figure-in-list-in-problem {rawAlt:1, outAlt:2, ok:FALSE}   <-- plan asserts 1
no alt                           {rawAlt:0, outAlt:0, ok:true}
```
The shape **duplicates**, it does not lose. The case's purpose was to prove alt is not LOST
for the shape §C81's regression broke, so the assertion must be **`outAlt >= rawAlt`**, which
still discriminates: at `07167ac7` that shape yields `outAlt 0 < rawAlt 1`. Asserting exact
equality tests a property the code does not have and never claimed.

🔴 **PENDING AMENDMENT H (Task 9) — the corpus sweep must check BOTH directions.** As written
it tests only `outAlt < rawAlt`. That is how the duplication class stayed invisible in my own
first sweep. Chemistry pins 0/0; organic pins the exact known set above so any change
surfaces.

✅ `07167ac7` **exists** (reworked by `5445bfbf`), so Task 9's discrimination step is
executable. Not yet run — it requires checking out an old `tools/cnxml-extract.js`, deferred
until no implementer is live (Ruling 8).

⚠️ Amendments G and H **HELD** — `impl-task4` is live. Prototypes at `<workspace>/rtprobe.mjs`,
`rt2.mjs`, `rt3.mjs` (gitignored).

---

Task 4: review returned **Spec ✅ / Quality CHANGES REQUESTED** — 1 Critical, 2 Important.
  Every finding was proved empirically (the reviewer mutated the source, ran the tests,
  and restored the tree byte-identically), not argued.

**Ruling 11: fix all three findings in a fix round rather than deferring any.** — Two of the
three (2 and 3) are Important and the skill routes Important into the loop, so they are not
mine to park. Finding 1 is Critical and is partly a defect in MY OWN brief, which makes
deferring it the least defensible option available.

  ① **[Critical] The write→provenance window WIDENED from 0 statements to 4.** My ruling said
  "move the computation up, never the write down", and that comparison stands — moving the
  write down would also have put the links-copy block inside the window. But the report and
  commit message then claimed the result is "narrower than before", and it is not: before,
  `writeProvenance` was the literal next statement after `fs.writeFileSync`. The reviewer
  counted four statements/blocks in between afterwards. **The tighter design honours my own
  principle better than my brief did**: `buildRunRecord` needs only the `bracketDelta` VALUE,
  so the two diagnostic `console.error` blocks can sit AFTER the sidecar write, leaving one
  pure function call in the window. Residual risk is small (both functions are pure over
  in-memory strings) but an EPIPE on stderr is a real Node footgun and there is no reason to
  carry it. — **Cost if wrong:** the diagnostics print after the sidecar exists rather than
  before; no behavioural difference on the happy path.

  ② **[Important] `glossaryArm` records caller INTENT, not what was sent.** Measured by the
  reviewer: `filterGlossaryForText` (`api-translate.js:942-948`) returns `null` when none of
  the glossary's terms appear in a chunk, and the truncation retry (`:1039`) drops the
  glossary unconditionally. So a module can record `arm:'glossary'` with a real
  `contentHash`/`termCount` while **every** API call for it carried none — and it fails
  preferentially on the large, splitting, sparse-hit modules that matter most. The field
  exists to settle §C82 ③'s arm decision; a systematically mislabelled arm silently corrupts
  that comparison. **This is shipping a broken instrument, which is the exact failure this
  project logs most often.** The reviewer recommended logging it as a follow-up because it
  needs an interface change; I am ruling to FIX it instead — `translateChunk` already returns
  an object, so reporting whether a glossary actually went on the wire and aggregating it in
  `translateModule` is contained. Recording an honest count beats recording a confident lie.
  — **Cost if wrong:** ~10 extra lines on the paid path and a slightly larger Task 4 diff;
  if the aggregation is wrong the record is no worse than the boolean it replaces.

  ③ **[Important] The echo stub cannot distinguish correct wiring from plausible-but-wrong,
  and the reviewer PROVED it.** It changed `chars: input.length` → `output.length`, swapped
  `mismatches`/`unwrapped`, and reversed `bracketMarkerDelta`'s arguments — **all 7 tests
  still passed.** With `input === output` every delta is empty and every list is empty, so
  the stub is blind by construction. Four fields (`usage`, `estimatedIsk`, `mismatchCount`,
  `unwrappedByType`) are never asserted at all. This is "green and blind in the same
  direction" from the project's own key-lessons list. — **Cost if wrong:** one more stub and
  a handful of assertions; there is no downside.

Task 4: fix round 1/5 dispatched — resuming impl-task4 (context intact, rounds 1-3 rule).

### Seventh pre-flight pass — Task 8 measured. One vacuous test, and one tool in the wrong category.

✅ **Task 8's SHOULD-TRIP confirmed with an exact positive control.** `scan-residue.js
--book efnafraedi-2e --chapter 17 --json` and the same command **plus `--module m68823`**
produce **byte-identical output** (md5 `5c7cf8af…` both). The flag is silently dropped, as
the plan says.

📌 Minor correction to Amendment A: `summary` has **five** existing keys, not four —
`modulesWithResidue, exactResidues, ratioWarnings, toleratedResidues, modulesMissingEn`.
"Beside its existing siblings" is still the right instruction.

🔴 **PENDING AMENDMENT I (Task 8) — the `validate-chapter --module` test is VACUOUS.** It
asserts the scoped run's output does not contain `m68791`. Measured: `validate-chapter`
**never prints a module id at all** — `grep -coE 'm6[0-9]{4}'` over a full run returns **0**.
So the assertion passes trivially before and after, which is the exact non-discriminating-test
class this session keeps catching.

🔴 **PENDING AMENDMENT J (Task 8) — `validate-chapter.js` belongs in the REJECT category, not
the honour category, and the battery spec put it in the wrong one.** Its twelve checks include
**`figure-numbers`** ("Figure numbers are sequential **within chapter** (no gaps)") and
**`cross-references`** ("Cross-references match existing figure/table captions"). Both
reconcile **across** the chapter's modules — a single module cannot establish a sequence or
hold the caption set to match against. Honouring `--module` would make those two checks
silently produce wrong answers, which is strictly worse than the silent-drop it replaces.

▶ **Task 8 becomes: honour `--module` in ONE tool (`scan-residue`), reject it loudly in TWO
(`cnxml-render-fidelity-check`, `validate-chapter`), and no flag for
`verify-extraction-coverage` (consumers import `analyzeModule`).** The spec's §5 item 7 lists
`validate-chapter` among the tools needing a per-module wrapper — but it already has a
"chapter-only by design → Tier 4" category and simply did not put this tool in it. **Per
CLAUDE.md a frozen doc is evidence, never status; here the CODE outranks both.** The loop
calls `validate-chapter` at chapter close, alongside `cnxml-render-fidelity-check`.

⚠️ Amendments I and J **HELD** — `impl-task4` is live on fix round 1.

Task 4: fix round 1/5 (3 addressed, 0 open; commits bd28ec7f..9c640abb)
  ① window 0 -> 4 -> **1** (one pure `bracketMarkerDelta` call); both console.error blocks
     moved after writeProvenance; report corrected APPEND-ONLY, original text unedited.
  ② `translateChunk` now returns `glossarySent`, forced **false** on the truncation-retry
     path (the load-bearing case — re-reviewer verified by reading `:1067`, not by report).
     `translateModule` aggregates `chunksWithGlossary`/`chunksTotal` into the record; `arm`
     stays as caller intent with JSDoc saying so. Misreport pinned by a test using a
     glossary term (`xenomorph`) that appears in no segment: arm==='glossary' while
     chunksWithGlossary===0.
  ③ Divergent stub added. **The re-reviewer independently re-applied all three of the
     original reviewer's mutations** and reproduced each failure byte-for-byte:
       A `chars: output.length`            -> caught by run.chars (131 vs 141)
       B swap mismatches/unwrapped         -> caught by run.unwrappedByType's KEY
          (both counts stay 1, so a count-only assertion would have missed it)
       C bracketMarkerDelta args reversed  -> caught by run.bracketDelta's sign
     All four previously-unasserted fields (usage, estimatedIsk, mismatchCount,
     unwrappedByType) are now covered.
  New breakage: none. translateModule's return object byte-for-byte unchanged;
  translateChunk's added key breaks no consumer (1 production + 6 test call sites, all
  by-name, no exact-shape assertions); buildRunRecord's 2 new params passed at its
  single call site.

Task 4: complete (commits fadea910..9c640abb, review clean after 1 fix round)
  Suite 316 files / 4661 tests green. Lint + format clean. Nothing under books/ touched.

Task 4: minor (deferred — **FINAL WHOLE-BRANCH REVIEW MUST TRIAGE THIS ONE**): a module
  splitting into >1 chunk with PARTIAL glossary coverage has no dedicated test. Flagged by
  the implementer itself and rated Minor by the re-reviewer, but the re-reviewer also noted
  it is "precisely the scenario Finding 2 exists to protect" — the original review named
  large, splitting, sparse-hit modules as the case most likely to matter to the §C82 arm
  decision. Suggested test: two-chunk module, glossary matches one chunk's text and not the
  other, assert `chunksWithGlossary === 1, chunksTotal === 2`. Components are individually
  covered (splitAtSegBoundaries suite; per-chunk glossarySent true/false/retry-false); only
  the aggregation is unpinned.
Task 4: minor (deferred): `buildRunRecord`'s two new params have no defaults, so a future
  caller omitting them yields `undefined` in `glossary`, which JSON.stringify drops from the
  sidecar. Same quiet-degrade class already accepted for `run: null`. Single call site today.

---

Task 5: implemented (commit 7c94027a). Suite 317 files / 4683 tests green (+22 on Task 4's
  4661). Lint + format clean after a prettier --write; nothing under books/ touched.
  All 18 new cases genuinely red against unmodified code (no pass-either-way cases).
  Both Step-8 measurements reproduce my pre-validation exactly:
    committed 02-for-mt files -> 134 of 149 fire, every one with reached:0, and the
      implementer cross-checked that 134 == the count of modules with reachable > 0.
    live extractor -> exactly 1 fires (m68727, 6 reachable / 5 emitted), 148 controls;
      reachableTotal 952, emittedTotal 951.
  Review dispatched, pointed hard at the one thing pre-validation could NOT establish:
  the predicate reproduces the §C81 ARTIFACT, and the artifact was derived the same way —
  so agreement is not independent confirmation. Reviewer asked to read cnxml-extract.js's
  walks directly and to mutation-test the predicate.

Task 5: review — Spec ✅ / Quality Approved, 1 Important + 2 Minor.

**Ruling 12: an Important finding enters the loop even when the reviewer wrote
"Approved".** — The skill triggers the fix loop on "spec ❌, any Critical or Important
finding, or a confirmed ⚠️ item". The reviewer's own text says the gap should be closed
"before Plan C's driver starts reading `altFindings.ok` as a hard gate" — and Plan C is the
very next thing this campaign builds, so "follow-up task" is not meaningfully later here.
Fixing findings 1 and 2; recording 3 as a comment only. — **Cost if wrong:** one extra fix
round on an already-approved task.

  ① [Important] `reached` counts DEDUPED Map keys, so a same-`id` duplicate collapses before
    comparison and `ok` stays true. The reviewer reproduced it: two identical-id alt markers
    give `{reached:1, expected:1, ok:true}`. That is §C81 `dedupeAltSegments` **Rule 1**,
    ~**145 of 167** merges — the MAJORITY signature of the defect the code's own comment
    claims to guard. Only the different-id Rule-2 shape (~22/167) actually works, which the
    reviewer confirmed by mutation. **Fix: count raw `<!-- SEG: -->` occurrences**, reusing
    `checkDuplicateSegIds`'s existing split idiom, which exists for exactly this reason.
    ⚠️ The corpus pins must NOT move (no duplicate alt markers exist in the committed tree).
  ② [Minor → fixing anyway, 1 line] `mediaAlt()` reads an `<iframe>` child's alt, but the
    reviewer traced all three capture paths (`processFigure`, `processTopLevelContent`'s
    standalone-media branch, `extractInlineText`'s inline capture) and **every one** computes
    `mediaAttrs.alt || imageAttrs.alt || ''` — iframe alt is never consulted. Inert today
    (0 iframes in either in-scope book) but biology has iframe embeds, so it is a live false
    halt the moment the check is pointed there.
  ③ [Minor, RECORD ONLY — deliberately not fixed] `ALT_BLIND_DIRECT_PARENTS` has no rule for
    a bare `<media>` that is a direct child of `<exercise>` itself. Does not manifest; the
    reconciliation is exact (1149 = 952 + 197, no slack). **Adding a rule would risk moving a
    pinned number for a case that does not occur** — comment it instead.
Task 5: minor (deferred): the reviewer could not verify biology/physics reconciliation gaps
  — out of this task's scope by design.

Task 5: fix round 1/5 dispatched — resuming impl-task5.

Task 5: fix round 1/5 (3 addressed, 0 open; commits 7c94027a..c73e35d9)
  ① raw `<!-- SEG: -->` occurrence counting replaces deduped Map keys. Re-reviewer verified
     regex equivalence against checkDuplicateSegIds's, incl. the spaced-marker trap,
     interleaved markers, and empty/undefined segText (all three produce reached:0, no
     divergence). Red-before reproduced independently: {reached:2, expected:1, ok:false}.
  ② iframe dropped from mediaAlt; red-before reproduced ({reachable:1} vs {reachable:0}).
  ③ comment only, zero behavioural change — confirmed.
  🔴 **Corpus pins UNMOVED, and the re-reviewer proved MORE than the report claimed:** it ran
  the corpus test against the PRE-FIX implementation and all 4 still passed — so the
  chemistry + organic-preview corpus contains **zero** instances of either edge case. The fix
  is a genuine no-op on this tree, not merely "the numbers didn't move this run". That is the
  difference between an absence you observed and an absence you established.
  New breakage: none. Out-of-scope observations: none.

Task 5: complete (commits d4798ccd..c73e35d9, review clean after 1 fix round)

---

Task 6: implemented (commit 10c8b208). Suite 318 files / 4695 tests green (+12 on Task 5's
  4683). Lint + format clean after prettier --write; books/ untouched; the four pre-existing
  marker functions byte-for-byte unmodified (additive hunks only).
  **Best discrimination analysis of the plan so far.** The implementer did not stop at
  "red because the function did not exist" — it MUTATED `KNOWN_BRACKET_TYPES` back to
  `BRACKET_MARKER_TYPES` inside the new function and got exactly **4 failures**, all the
  MATH-dependent assertions, then reverted and re-ran clean. It then tabulated every new case
  as trivially-red (function absent) vs. discriminating-on-the-widening, and stated plainly
  which cases discriminate on **per-segment tracking** instead (orthogonal to the widening)
  and which cannot discriminate at all by construction (the m68791 clean control has no MATH
  markers to lose — its value is proving no false positives, not proving the widening).
  All five corpus values reproduce my pre-validation exactly.
  Review dispatched with two extra mutations it did NOT test (whole-module instead of
  per-segment; reversed `cb - ca`) plus the parseSegmentsMap-dedup question that Task 5's own
  fix round just proved matters.

Task 6: review — Spec ✅ / Quality ❌ CHANGES REQUESTED. 1 Critical, 1 Minor, 3 confirmed-correct.

**Ruling 13: fix the Critical with occurrence-indexed pairing, and own that it is MY defect.**
— `bracketMarkerDeltaBySegment` pairs via `parseSegmentsMap`, which defaults to
`{duplicates:'first'}`, so any marker loss confined to a NON-FIRST occurrence of a duplicated
seg-id is invisible. The reviewer reproduced a **false clean** against the shipped code
(planted MATH loss in a second occurrence → `segmentsExamined:1, segmentsWithDelta:0,
total:{}`). It also falsifies the function's own JSDoc: an occurrence-COUNT mismatch (2 raw EN
vs 1 raw IS) is invisible to `unpairedSegIds`, which works on unique ids.

🔴 **This is the SAME defect class Task 5's fix round closed ONE TASK EARLIER, and my Task 6
brief did not carry the lesson forward.** I had the precedent in hand — `checkDuplicateSegIds`
splits on raw `<!-- SEG: -->` occurrences for exactly this reason — and wrote pseudocode that
used the deduped map anyway. The implementer followed the brief faithfully. **The reusable
lesson: a fix landed in task N is not automatically a fix in task N+1's brief; the controller
has to propagate it.**

📊 **Measured the post-fix values myself before dispatching, so the fix has exact targets:**

| module | ch | raw EN | raw IS | (old unique) | total | withDelta | unpaired |
|---|---|---|---|---|---|---|---|
| m68823 | ch17 | **151** | 151 | 149 | `{MATH:-2}` | 2 | 0 |
| m68791 | ch12 | **380** | 380 | 373 | `{}` | 0 | 0 |
| m68819 | ch16 | **332** | 332 | 324 | `{i:-2,MATH:-1}` | 3 | 0 |
| m68832 | ch18 | **86** | 86 | 86 | `{xref:-11,i:-13,sub:1,sup:1,MATH:-1}` | 15 | 0 |
| m68852 | ch21 | **82** | 82 | 81 | `{MATH:-2}` | 1 | 0 |

▶ **Every `total` and every `segmentsWithDelta` is IDENTICAL to the deduped version** — only
`segmentsExamined` corrects upward, and `unpaired` is 0 everywhere. So the fix is
behaviour-preserving on findings and merely fixes the count. That is what makes it low-risk,
and it is also the check on the fix: if a delta moves, the pairing is wrong.
— **Cost if wrong:** two pinned numbers change; if occurrence-indexing mis-pairs, deltas move
and the table above catches it immediately.

  ② [Minor, fixing] `countBracketMarkersAll` builds 20 RegExps per call, twice per segment —
    ~860k constructions per book. Hoist a module-scope map.
  ③④⑤ [confirmed correct, no finding] `total` zero-deletion vs `segmentsWithDelta` is coherent
    (Plan C gates on `segmentsWithDelta`, not `total` — reviewer verified by an independent
    whole-module mutation caught by 3 tests); `unpairedSegIds` is disjointly collected and
    deterministic; the `seg-markers.cjs` import path is right for this file's depth.

Task 6: fix round 1/5 dispatched — resuming impl-task6.

### PROPAGATION CHECK — Task 7 has the SAME defect. Caught BEFORE dispatch this time.

Immediately after logging Ruling 13's lesson ("a fix in task N is not automatically a fix in
task N+1's brief"), I applied it: re-ran the E2 prototype with **raw occurrence iteration**
instead of `parseSegmentsMap`.

🔴 **PENDING AMENDMENT K (Task 7) — `checkBracketBodies` iterates `parseSegmentsMap`, so it
misses markers in non-first occurrences of duplicated seg-ids. Measured: it was missing a REAL
finding.**

| | `parseSegmentsMap` (as planned) | raw occurrences (corrected) |
|---|---|---|
| markers examined | 16,630 | **16,991** (+361 never examined) |
| total findings | 2 | **3** |
| `m68710` | examined 263, **1** finding | examined **266**, **2** findings |
| `m68733` | examined 345, 1 finding | examined **350**, 1 finding |
| `m68768` (MUST-NOT-TRIP) | examined 126, 0 | examined **130**, **0** ✅ still clean |
| firing modules | 2 (1.3%) | 2 (1.3%) — unchanged |

✅ **The battery spec independently corroborates the corrected number.** Its own fixture note
reads **`m68710:716,722`** — naming **TWO** locations for that swallow. The deduped
implementation could only ever report one of them; raw iteration reports both, and both are
the identical body `[[i:is the reductant, HCl(g]]`. **A spec written from observation agreed
with the corrected instrument, not the planned one.**

▶ Base rate is unchanged at **1.3% of modules**, so E2 remains eligible to block. Apply
Amendment K before dispatching Task 7, with pins: `m68710` 266/2, `m68733` 350/1, `m68768`
130/0, corpus 2 firing / 3 findings / 16,991 examined.

⚠️ **Task 9 does NOT need this change, and that is a deliberate distinction, not an
oversight.** Its round-trip goes through `parseSegments(formatSegmentsMarkdown(segments))` on
purpose — it exercises the REAL pipeline's serialize/parse pair, so inheriting the real
first-wins dedup is exactly what it is measuring. A3 and E2 must see every occurrence because
they audit what happened to each; Task 9 must see what the pipeline actually produces. Note
this in Task 9's review dispatch so it is not flagged as an inconsistency.

⚠️ Amendment K **HELD** — `impl-task6` is live.

Task 6: fix round 1/5 (2 addressed, 0 open; commits 10c8b208..10ad51ba)
  ① occurrence-indexed pairing (`segId` bare for the first occurrence, `segId#N` after). Both
     new unit cases verified red against 10c8b208 with the predicted false-clean signature
     (`expected 1 to be 2` — segmentsExamined collapsing to 1). JSDoc corrected.
  ② 20 RegExps hoisted to a module-scope Map; exported signature unchanged.
  🔴 **Five-row table INDEPENDENTLY RE-DERIVED by the re-reviewer and reproduced EXACTLY** —
  every `total` and every `segmentsWithDelta` identical to pre-fix, `unpairedSegIds` `[]` on
  all five, only `segmentsExamined` moving upward (151/380/332/86/82). No discrepancies.
  Probes of the NEW code paths, all clean:
   · asymmetric duplicate ordering — LOW. All duplicates in all 5 fixtures are benign under
     `normalizeVisibleText` (the classifier the codebase actually uses), so per-type counts are
     equal across occurrences of an id and the gating fields are swap-invariant. ⚠️ **The
     re-reviewer first mis-measured this** (compared raw `.content` with `===`, flagging 4 of 5
     as content-differing — m68823's are `[[MATH:40]]` vs `[[MATH:41]]`), **caught its own
     error, redid it with the right instrument, and reported the correction instead of the
     false alarm.** Right property, wrong instrument — the project's own named failure mode,
     self-caught.
   · `segId#N` key collision — impossible: `elementId` comes from a CNXML `id` (XML NCName,
     cannot contain `#`), and a corpus grep found zero. Unstated assumption, no guard; noted.
   · occurrence-count mismatch now genuinely reaches `unpairedSegIds` — traced AND tested.
  New breakage: none.

Task 6: complete (commits c73e35d9..10ad51ba, review clean after 1 fix round)
Task 6: minor (deferred): the fix report's narrative claims m68819/m68832/m68852 "have no raw
  duplicates". Wrong for 2 of 3 — m68819 is 324 deduped vs **332** raw, m68852 81 vs **82**;
  only m68832 truly has none. No test is wrong (the third corpus case never asserts
  `segmentsExamined`), but a future pin update for that case must use the true raw counts.
Task 6: minor (deferred → carry to Plan C): `bySegment`'s key format is new API with no
  consumer yet — duplicate-id findings arrive under `segId#N`, not the bare seg-id.

---

Task 7: implemented (commit 63ab4562). Suite 320 files / 4711 tests green (+14 on Task 6's
  4697). Lint + format clean; books/ untouched.
  **Every measured value matched the pre-derived table first try, no assertion adjusted:**
  m68710 266 examined / 2 findings (same body twice) · m68733 350 / 1 · m68768 130 / 0 ·
  corpus 2 firing (1.3%) / 3 findings / 16,991 examined.
  Regression-guard probing done properly — it reverted BOTH corrections in turn:
   · whole-doc -> `<content>`: 3 tests red, and the firing-module list balloons to **15/149**,
     independently reproducing the draft-1 measurement (10.1%) I recorded before dispatch.
   · raw occurrences -> `parseSegmentsMap`: all 4 corpus cases red with the exact predicted
     numbers (266->263, 350->345, 130->126, findings 3->2).
  Judgment call answered rather than silently taken: it read every marker-emission site in
  cnxml-extract.js and confirmed BODY_SOURCE_ELEMENTS is complete and correctly mapped
  (i/b/u <- emphasis effect=…; em <- emphasis class=… with no effect; sub/sup/term <- self),
  with a stated reason for every exclusion. No change made.

🔴 **The implementer caught a stale number in MY plan** — Amendment K updated Task 7's Step 6
  table but left the Step 8 commit-message template on draft 2's values (2 findings / 16,630).
  It used the correct values in the real commit and flagged the disagreement instead of
  copying the boilerplate. Fixed at source in ba3d635e, and a NUL-safe tracked-file sweep
  confirmed the only other 16,630 occurrences are the deliberate before/after comparisons.
  ▶ **Third time this session a downstream reader caught a controller-introduced staleness.**
  The plan is now edited often enough that its own internal consistency needs the same
  treatment as the code's.

Task 7: review — Spec ✅ / Quality ❌ CHANGES REQUESTED. 2 Important, 1 Minor. All three are
  defects in MY brief's code. **And one reviewer claim is wrong** — recorded because a review
  is evidence, not a verdict, and that cuts both ways.

**Ruling 14: the nested-marker blind spot is REPORTED, not fixed by changing the regex.**
— `/\[\[([A-Za-z]+):([^\[\]|]*)\]\]/g` refuses `[`, so `[[i:m[[sub:l]]]]` (common chemistry
quantum-number notation) **does not match the outer marker at all** — never examined, never
comparable. **I re-measured independently and confirm the reviewer exactly: 5,993 raw `[[i:`
opens vs 5,674 matched → 319 missed (5.32%) across 25 of 149 modules**, including 40 of 330
(12%) inside `m68733`, one of the two SHOULD-TRIP fixtures. So `16,991 examined` is a
silently-reduced denominator and Plan B's threshold call would be made against the wrong base.
▶ Fix by **counting and reporting** the unreachable population — the same idiom Task 5's
`checkAltCoverage` established for its own blind positions — rather than attempting balanced-
bracket matching. ⚠️ My own code comment made it worse: it described the INNER marker's
coverage and omitted that the OUTER one vanishes. — **Cost if wrong:** an extra reported
counter; if the count is miscomputed, the base rate is misreported in the same direction it
already is today.

**Ruling 15: retract the false "checked elsewhere" claim for `link`/`fn`, but REJECT the
reviewer's `lb`/`rb` claim.** — Real half: `link`/`fn` bodies are prose
(`[[link:${stripTags(inner)}|${url}]]`, `[[fn:${fnText}|${id}]]`), extracted with the same
lazy regex shape as `<emphasis>`, so equally exposed to the swallow class; the reviewer
searched `tools/lib/`'s check modules and the battery spec and found no check covering them.
Correct the comment to name it an acknowledged gap; do NOT add them to
`BODY_SOURCE_ELEMENTS` (that changes coverage and the base rate — a scope decision, logged to
the register). **Wrong half: the reviewer concluded `lb`/`rb` "do not exist" from their
absence in `cnxml-extract.js`/`cnxml-inject.js` — it searched the wrong files.** They are real
and `tools/api-translate.js:314-322` documents their origin in its own comment: the os-embed
exercise-field converter, `tools/lib/exercise-html.js`. Instructed to leave them alone and to
add the provenance so the next reader does not repeat the search. — **Cost if wrong:** if
link/fn really are covered somewhere, the comment understates our coverage.

  ③ [Minor, fixing] `sourceTexts`'s untrimmed variant is dead code — the reviewer PROVED it by
    deleting `out.add(t)` and re-running: 14/14 still pass, including the leading-space
    MUST-NOT-TRIP case that branch appears to exist for. Unconditionally dominated.

Task 7: fix round 1/5 dispatched — resuming impl-task7.

Task 7: fix round 1/5 (3 addressed; commits 63ab4562..eab3e596) — AND the implementer found
  something materially worse than what it was dispatched for.
  🔴 **It measured the real skipped population instead of trusting the reviewer's `i`-only
  figure, and the figure did NOT generalise: 445 skipped, not 319.** The extra 126 is a
  SECOND, DISTINCT mechanism hitting the same regex wall — `[^\[\]|]*` stops at `|` and then
  requires `]]`, so **any marker with a trailing `|payload` fails to match 100% of the time**.
  ▶ **Consequence: `BODY_SOURCE_ELEMENTS.term` and `.em` were structurally 0% reachable** —
  two of seven declared types that never fire. Not "sometimes miss a case": ceremony.
  It also flagged that `skippedNested` is a misleading name for a counter 28% of whose
  population is not nesting — raised for a decision rather than renamed silently.
  `examined`/`findings` confirmed unmoved (266/2, 350/1, 130/0, corpus 16,991/3).
  Regression guards re-probed after the loop body changed: probe 2 went from 5/14 to 6/17 red
  — a strictly stronger net, not a weaker one.

**Ruling 16: make `term`/`em` reachable in fix round 2, and rename the counter.** — Shipping a
七-entry map with two structurally-dead entries is shipping a check that reports coverage it
does not have, which is this project's most-logged failure. The fix is one optional group:
`(?:\|[^\[\]]*)?` before the close, comparing only the pre-pipe body — exactly the prose the
map already declares an intent to check. **Measured independently before asking: examined
16,991 → 17,051 (+60), findings 3 → 3, firing set unchanged, module base rate 1.3% unchanged.**
So it is safe and does not disturb Plan B's threshold input. Rename `skippedNested` →
`skippedUnmatchable`, since ~28% of it was never nesting. — **Cost if wrong:** if the widened
regex admits a body it should not, findings move off 3 — which is the stated stop condition,
so it fails loudly rather than silently.

Task 7: fix round 2/5 dispatched — resuming impl-task7.

Task 7: fix round 2/5 (commits eab3e596..9bf62fe3) — landed EXACTLY on the numbers I measured
  independently before dispatching: examined 16,991 → **17,051** (+60, my prediction), findings
  **3 unchanged**, firing set **unchanged**, skippedUnmatchable 445 → 385 (= 445−60). No
  assertion needed adjusting. Counter renamed; docstring now names both mechanisms.
  Regression probes, third round of probing on this task: reverting the round-2 widen → 5/19
  red (exactly the five round-2 assertions); reverting the whole-doc scope → 4/19 red (the
  three original guards plus the new totals test, which now discriminates that bug too).
  Guards are demonstrably real and strictly stronger each round, not decorative.

Task 7: re-review — ALL FOUR ADDRESSED, invariant table reproduced exactly (examined 17,051 ·
  findings 3 · firing set unchanged · skippedUnmatchable 385), no new breakage.
  Adversarial probes beyond both rounds, all clean:
   · **False-negative risk from the widened tail: ruled out empirically, not by reasoning.**
     Fed it `[[term:m[[sub:l]]|t1]]` AND planted a coincidental `<term>m</term>` in the source
     — i.e. a source element whose text is exactly the truncated body the regex *would* have
     matched had backtracking completed. The outer marker still did not match at all and was
     never compared against it. Confirmed on the two real corpus instances (m68791, m68793).
   · `skippedUnmatchable` does not double-count: the raw-opens guard mirrors the matched-side
     guard, so a non-mapped type (`xref`) perturbs neither term.
   · m68733's 40-marker gap is 100% nested `i` (330/290), confirmed per-type.
Task 7: complete (commits 04fea4fa..9bf62fe3, review clean after 2 fix rounds)
Task 7: minor (deferred — **FINAL WHOLE-BRANCH REVIEW SHOULD TRIAGE**): round 2's report table
  and a matching comment in `bracket-body-corpus.test.js` say `term` is "61/61" reachable. It
  is **59/61** — the 2 remaining are nested-with-payload (m68791, m68793), correctly still
  unmatchable under the nesting mechanism finding ① deliberately did not fix. The AGGREGATE
  math is exact and Plan B's inputs are unaffected (62 skipped before, 2 after, delta 60 as
  claimed); only the per-type "fully reachable" phrasing overstates. It is a committed comment
  carrying a slightly false claim, which this project does not tolerate elsewhere — hence
  flagged for the fix wave rather than silently parked.
Task 7: minor (deferred): three near-identical hand-rolled segment-split loops now exist
  (`extraction-coverage.js` ×2, `bracket-body-check.js` ×1). Consolidation candidate.

---

Task 8: implemented (commits 0b3f6f83 contract-widening alone, then ef528383 flag work).
  Suite 4723 tests green; lint + format clean; books/ untouched.
🔴 **The implementer found a SEMANTIC DEFECT IN MY BRIEF that would have broken Plan C's loop
  in its most common case.** Step 3a told it to compute `summary.modulesExamined` from
  `Object.keys(modules).length`. But `modules` only gains an entry when a module HAS a finding
  (`scan-residue.js:107-108`) — never for a clean one. So that count means "modules with
  findings", not "modules examined", and it is **0 on a clean chapter regardless of scope** —
  precisely the ambiguity my own justification for the field said it existed to remove. My two
  sentences contradicted each other and I did not notice.
  ▶ Keyed to the brief's "matched nothing → exit 2" check, this **fails every healthy scoped
  module**. Measured against a real clean module: `--module m68820` → `Error: matched no
  module`, exit 2. **Clean is the common case for a per-module loop**, so this would have
  turned Plan C into a machine that halts on success.
  Fixed properly: a genuine counter incremented once per `{moduleId,file}` entering the loop,
  independent of findings; the "matched nothing" check keyed on it. Verified: clean scoped
  module now returns `modulesExamined: 1`, `modules: {}`, exit 0.
  ✅ **And it stated the counting unit in the same breath as the number**, per this project's
  own rule: `*-segments.is.md` files under `02-mt-output`, excluding `exercises-segments.is.md`
  by exact name, **including `chapter-metadata`** — so whole-chapter ch17 is **9**, not the 8
  real `m…` modules. A fifth test pins the clean-module case beyond the brief's four.

▶ **Running tally of controller-introduced defects caught downstream: five.** Task 1 scope
  (2 of 4 sites), Task 6 dedup (propagation failure), Task 7 stale commit template, Task 7's
  `<content>` scope + `parseSegmentsMap` (both caught by my own prototyping), and now this.
  The pattern is consistent: **every one was found by executing the plan against the real
  tree, and none by re-reading it.**

Task 8: review — Spec ✅ / Quality Approved, 1 Important + 2 Minor. The reviewer independently
  confirmed the `modulesExamined` semantic defect and the counting unit, and verified
  `--module chapter-metadata` genuinely opens and compares both sides (so 9 is an accurate
  count of what the pre-existing `collectResidueFiles` treats as a scannable unit, not a
  miscount introduced here).

**Ruling 17: fix the substring-discrimination gap, and fix the bare-`--module` gap in ONE tool
only.** — ① The suite cannot catch a regression to substring matching: the reviewer patched
`===` → `.includes()` and **all 7 tests still passed**, because every fixture uses a
prefix-unique id. Real consequence measured: `--module m6882` would match all 8 ch17 modules.
The shipped code is right; the NET is the defect. ② A bare `--module` (no value) is silently
undetected on all three tools — the shared `parseArgs` shape (`if (nextArg === undefined)
continue`) and the hand-rolled parser's `args[i+1]` guard both miss it. **Scoped
deliberately:** fix it in `scan-residue` only, because that is the one place it does harm — a
bare flag there yields a WHOLE-CHAPTER scan the caller believes is one module, and Plan C
would consume it as a per-module verdict. The two rejecting tools are chapter-scoped anyway,
so the degradation is a no-op there. **`tools/lib/parseArgs.js` is explicitly OFF LIMITS** —
making the generic parser strict about missing values changes behaviour for every flag on
every tool in the repo; that is its own item, logged not done. — **Cost if wrong:** an
asymmetry between the three tools, mitigated by a comment explaining it.

Task 8: minor (deferred → carry to Plan C): if Plan C ever sums per-module `modulesExamined`
  against a whole-chapter total they disagree by one, unless its loop also iterates
  `chapter-metadata`.
Task 8: minor (deferred → own item): `tools/lib/parseArgs.js` silently accepts a value-less
  string option repo-wide. Broad blast radius; not touched here.

Task 8: fix round 1/5 dispatched — resuming impl-task8.

Task 8: fix round 1/5 (2 addressed, 0 open; commits ef528383..3d753df7)
  ① strict-equality test added; re-reviewer independently reproduced the discrimination
     (patched `===` → `.includes()`, exactly the new test failed, restored byte-identical).
     Both directions confirmed: `--module m6882` matches nothing/exit 2; `--module m68823`
     scopes to one/exit 0.
  ② bare-flag guard verified firing; **scoping fully respected** — `tools/lib/parseArgs.js`
     untouched, and neither rejecting tool gained the guard, per Ruling 17.
  Probes the round did not run, all reported honestly:
   · `--module --json` → `parseArgs` greedily eats `--json` as the VALUE (it only guards
     `nextArg === undefined`, never flag-likeness), so `args.json` stays false and **the
     requested JSON output mode is silently dropped** — the error prints as plain text. Still
     exit 2, never a silent wrong scan, but the format contract breaks for that shape.
   · `argv.includes('--module')` has a reachable FALSE POSITIVE via `--chapter`'s value
     position: `--chapter --module 17` makes `--chapter` consume the literal `--module`, so the
     new guard fires and reports a `--module` error where the pre-round tree correctly reported
     `--chapter must be a number`. Diagnostic-only regression.
Task 8: complete (commits 9bf62fe3..3d753df7, review clean after 1 fix round)
Task 8: minor (deferred → **FINAL FIX WAVE**): the bare-`--module` guard runs BEFORE the
  `--chapter` NaN validation, turning a previously-accurate `--chapter` diagnosis into a
  misleading `--module` one. Fix: order the chapter check first, or require that the token
  `--module` consumed does not itself start with `-`. Exit code and scan correctness are
  unaffected in every case tested.
Task 8: minor (deferred → own item, broad blast radius): `tools/lib/parseArgs.js`'s string
  options consume the next token unconditionally with no flag-likeness check, so `--x --y`
  silently swallows `--y` as `--x`'s value repo-wide.

---

Task 9: **first implementer (impl-task9) DIED mid-task.** It wrote all three files
  (10:27–10:29) then stopped — no commit, no verification, no report; `ListAgents` later
  returned no reachable agents. Recovered rather than restarted: the files were left untracked
  in the tree, I confirmed only that they are textually faithful to the brief and that the unit
  file passes 5/5, and re-dispatched **impl-task9b** to treat them as an UNVERIFIED DRAFT and
  run every verification from scratch, correct them if wrong, commit, and report.
  ⚠️ Its dispatch is explicit that a "watch it fail" step which cannot be run retroactively must
  be reported as not-run rather than implied — the failure mode here is inheriting written code
  and mistaking its existence for evidence.

📌 A teammate flagged an apparent "concurrent session sharing this checkout" race (transient
  stale `git status`). Checked: `ListAgents` reports no reachable agents and the branch is
  intact at the expected HEAD. It was a transient artifact of the dying agent, not a second
  writer. No action.

### 🔴 CONTROLLER ERROR, 11:35 — I ran TWO implementers in one working directory.

**Ruling 18: `impl-task9` owns Task 9; `impl-task9b` stopped via TaskStop.** — `ListAgents`
returned **"No reachable agents"** and I read that as `impl-task9` having died, so I
re-dispatched the task as `impl-task9b`. **It had not died.** The skill's rule — *never
dispatch multiple implementation subagents in parallel (conflicts)* — exists for exactly this,
and I broke it on a false negative from a status tool rather than on evidence about the agent
itself. **A tool reporting an absence is not evidence of an absence** — this project's own
most-repeated lesson, and I applied it to greps and corpora all session while missing it on my
own instruments.

**The collision was real, not theoretical.** `impl-task9` reported that its
`tools/cnxml-extract.js` checkout for the Step 6 discrimination probe was **silently reverted
underneath it** while `impl-task9b` ran `npm test` in the same directory — verified by hash
before/after with no restore command issued. Had it not noticed, it would have run the
discrimination check against the WRONG extractor vintage and drawn a confident, wrong
conclusion about whether the check discriminates.

▶ **`impl-task9` independently switched to an out-of-tree method** — `git show` the old blob to
a throwaway file and probe it from `/tmp`, never mutating the working tree. **That is better
than the procedure my brief specified**, and the brief was wrong to prescribe a working-tree
checkout for a shared checkout. Told it to keep the method and to record the deviation and its
reason in the report.

⚠️ **Provenance of the staged files is MIXED and the owner must reconcile it before
committing** — the corpus test carries ~75 insertions / 63 deletions against the original
draft, possibly `impl-task9b`'s; and my own restore-from-backup briefly reverted the worktree
before I recovered it from the index. Both vintages backed up at `<scratchpad>/task9-draft/`
(newer) and `task9-draft-OLD/`. Instructed: read all three files against your own intent and
make adoption a decision, not an inheritance.

**Told it to commit as soon as it has real evidence rather than at the end** — a restart is
imminent, so a durable honestly-scoped commit beats a complete one, with outstanding steps
named plainly in the report.

---

Task 9: IMPLEMENTED and COMMITTED — `8a067e31`, purely additive (3 new files, 245 insertions).
  Suite 323 files / 4733 tests green; lint + format clean. Verified by ME, not from the report:
  HEAD is 8a067e31 · tree clean · `tools/cnxml-extract.js` at the correct HEAD vintage · no
  stray probe files left behind · **every corpus pin matches my own independent measurements
  exactly** (chemistry 149/0/0; organic 342 with loss `['m00032']` and gains
  `['m00023','m00046','m00069']`; fixtures m42714 11/11, m42359 19/19, m42493 8/8, m66590 8/8,
  m42296 24/23).
  ✅ **Discrimination PROVEN with the real fixtures**: against `07167ac7` they reproduce the
  original §C81 reviewer's numbers exactly — 11→7, 19→18, 8→6, 8→5, 24→19.
  ✅ It committed on its own judgement while my "commit soon" message was in flight, reasoning
  that verified staged work was safer committed than exposed to a second collision. Correct
  call, correctly reasoned.

**Ruling 19: accept `impl-task9`'s out-of-tree discrimination method as the standard for this
repo, and record the shared-cwd risk.** — It substituted `git show`-ing the old blob to a
throwaway file and probing from `/tmp` for the brief's prescribed in-place
`git checkout <old> -- <file>`. **My brief was wrong**: an in-place checkout of a shared file
is unsafe whenever more than one agent shares the working directory, and here it demonstrably
failed — its checkout was silently reverted mid-probe by a sibling's `npm test`. It also
reports ~20 sibling processes all cwd'd into this checkout. ▶ **Any future task needing a
temporary destructive git operation on a shared file must use the out-of-tree form.**
— **Cost if wrong:** none identified; the out-of-tree method proves the same property and
mutates nothing.

## ⏸️ STATE AT HANDOFF — all 9 tasks implemented and committed

**HEAD `8a067e31` · 26 commits · tracked tree CLEAN · nothing pushed (deliberate).**

Still owed, in order:
1. ✅ **DONE 2026-08-16 — Task 9's task review ran and its fix round landed** (`0acd0859`).
   See "Task 9 review + fix round" below.
2. **Final whole-branch review** on the most capable model — `review-package <plan> 6f8fe867 HEAD`
   — and point it at the deferred-minor list below.
3. **ONE fix wave** for its findings, then one scoped re-review.
4. ✅ **DONE 2026-08-16 — the register update is APPLIED.** **§C85** (inject drops/duplicates
   whole `<media>` in organic; `m00032` is IN §C80 scope) · **§C86** (`validate-chapter` is
   chapter-scoped) · **§C87** (five consolidated residual minors) are in
   `docs/plans/2026-07-21-post-item17-followup-campaign.md`, together with §C82's three
   amendments. **The draft file is DELETED**, per its own banner — an applied draft left beside
   the register is exactly the two-sources-of-truth failure it warned about.
   🔴 **RENUMBERED 2026-08-16 from §C84/§C85 — `C84` was already taken** by the glossary
   net-value investigation, so the draft as written would have put two `C84` items in the
   register. Caught by Task 9's review. The committed draft and the register's RESUME block
   are both corrected; the **frozen execution-ledger copy still says C84/C85** and is left
   alone deliberately per its own banner — re-snapshot or delete it at branch close.
5. `superpowers:finishing-a-development-branch`.

### Task 9 review + fix round (2026-08-16) — CLOSED

Two independent reviewers (spec-compliance + mutation-prober), then every finding
adversarially refuted by a separate agent. **13 raw findings → 5 survived, 8 refuted.**
Both reviewers returned **approved-with-minors**; nothing needed reverting.

Fixed in `0acd0859` (three of the four distinct survivors):
- **`ok` was never asserted false anywhere.** A hardcoded `ok: true` — or relaxing
  `rawAlt === outAlt` to `<=` — passed every assertion in both files. `ok` is what the
  §C82 loop gates on. Now pinned in both directions. **Verified against the broken code:**
  hardcoded `true` now fails 3 cases, `<=` fails 2 (the latter catching organic's
  DUPLICATED media, the exact scenario the finding described).
- **The `m42296` "residual defect" comment was backwards** — `countAlt` counts `alt=`
  inside XML comments; live markup round-trips 22→22 clean. `countAlt` deliberately NOT
  changed: censused all six books, commented-out alt exists only in `edlisfraedi-2e`
  (4 modules) and is **0/149 chemistry, 0/342 organic** — zero inside §C80's scope.
- **The docstring's "pure structural check" overclaim.** It counts attributes, not content;
  deleting every `:alt:` segment leaves all 8 assertions green because `readAlt` falls back
  to the extraction-captured English. Boundary now stated, and carried into the register draft.

The fourth survivor was the §C84 id collision → item 4 above.

⚠️ **Process note for the next campaign, measured:** the box is a WSL2 VM capped at
**10 GB** by `.wslconfig`, and one root `npm test` costs ~310 MB RSS. The 2026-08-16
"36-minute corpus sweep" and the `pipeline-integration` hook timeout were **contention,
not defects** — ~20 agents each running the full suite is ~8.6 GiB against a 9.7 GiB
ceiling. This review therefore ran the suite ONCE, by the controller, and handed the
result to the agents as evidence; agent prompts forbade `npm test` and the corpus vitest
file outright and capped verifier fan-out at 3. Peak `available` never dropped below
7.6 GiB across 15 agents.

**Deferred minors for the final review to triage** (search this file for `minor (deferred)`):
Task 1 ×2 · Tasks 2+3 ×2 · Task 4 ×2 (incl. the multi-chunk partial-glossary gap it flagged
itself) · Task 5 ×1 · Task 6 ×2 · Task 7 ×2 (incl. the `term` "61/61" comment that should read
59/61) · Task 8 ×3 (incl. the bare-`--module` guard ordering ahead of the `--chapter` check).

### Task 9 post-commit reconciliation — status upgraded to DONE (11:5x)

✅ **The mixed-provenance worry I raised is resolved.** `impl-task9` re-read all three committed
files fresh against its own intent: the content is exactly what it authored (only prettier
reflow differs from its first draft), with **no trace of `impl-task9b` or of my
move-aside/restore**. Re-verified alongside: `tools/cnxml-extract.js` at the correct HEAD hash,
`books/` untouched, HEAD still `8a067e31` with nothing on top, both new test files 8/8 in 11.5s.
So the staged ~75/63 delta I flagged was its OWN later work, not the duplicate's — my inference
from `AM` was wrong in the other direction too.

🔴 **Ruling 1 was at least partly wrong, and this is the honest place to say so.** I rejected a
git worktree at setup on measured cost — 5.6 GB of working tree and no `node_modules`, including
a natively-compiled `better-sqlite3`. That reasoning still holds on its own terms. **What I did
not price was the cost that actually materialised**: ~20 agent processes sharing one working
directory, which produced a silent mid-probe revert of `tools/cnxml-extract.js`, a duplicate
implementer I could not cheaply detect, and a `npm test` flake from a 60s hook timeout under
contention. I traded disk for shared mutable state and the shared state was the more expensive
side. ▶ **Recommendation carried forward, and `impl-task9` reached it independently: isolate
per-agent worktrees for the next campaign**, or at minimum forbid any working-tree-mutating git
operation in a shared checkout (Ruling 19 already covers the second half).

📌 Concern 3, recorded not actioned: one `npm test` run flaked on a 60s hook timeout under load
in an unrelated pre-existing file; confirmed clean in isolation and on full re-run. Not a
regression — but expect recurrence while this many agents share one box, and do not read such a
flake as a branch defect without re-running in isolation first.


---

## ⚖️ WHOLE-BRANCH REVIEW — BLIND PAIR (Opus + Fable), ADJUDICATED 2026-08-16

Two independent halves on the same 30 commits, same inputs, neither shown the other's findings.
- **Opus half** `wf_6394d7b2-14e` — 7 named lenses → adversarial verify. 56 agents, **1 errored**
  (a verifier lost its connection; its finding is UNADJUDICATED, not refuted). 48 raw → **5 survived**.
- **Fable half** `wf_83cc80d9-6c0` — 3 open finders → Fable skeptics. 26 agents, 0 errors.
  13 raw → **15 survived** (some findings split during refutation).
  ✅ **OPS-LESSON-4 CHECK RUN AND CLEAN: 0/26 agents fell back; 1,256 assistant turns, ALL
  `claude-fable-5`.** The bio-scoping recipe (forbid reading `liffraedi-2e`/`orverufraedi`
  content, supply measured facts instead) held — against 53% fallback on RUN 5 and ~100% on
  RUN 6. This is the first fully-clean Fable run on a branch touching this corpus.

### 🔴 THE PAIR WAS DECISIVE, AND THE DISAGREEMENT MATTERED MORE THAN THE AGREEMENT

**Each half found a CRITICAL the other missed entirely, and the controller reproduced both.**

1. **[CRITICAL · Fable only] `run.usage` persists as the string `"0[object Object]"`.**
   `api-translate.js:1270` does `totalUsage += result.usage || 0` starting from `0`, but the
   client returns an **object** — `malstadur-api.js` documents `usage: object` in three JSDoc
   sites and `record()` reads `usage.units`/`usage.cost`. `0 + {}` is string concatenation.
   Reproduced: 1 chunk → `"0[object Object]"`; 2 chunks → `"0[object Object][object Object]"`;
   serializes into the sidecar verbatim. **Why 4,733 green tests missed it: the two test files
   disagree about the contract.** `malstadur-api.test.js` correctly stubs `usage: {}`; every
   test that exercises `translateModule` stubs a NUMBER (`usage: 1`, `text.length`, `1200`).
   The suite validates the producer against reality and the consumer against a fiction, so the
   seam between them is untested by construction. Per-module API spend exists nowhere else and
   is unrecoverable after process exit.

2. **[CRITICAL · Opus only] E2 reports a false swallow for every marker body holding a
   character reference.** `norm()` collapses whitespace but does NOT decode entities, while the
   source side decodes via DOM textContent. **Controller-reproduced on FRESH extraction (which
   is exactly what the loop's step 2 does): 342 organic modules → 6 firing, 10 findings** —
   `m00226` ×4, `m00109` ×2, `m00111`, `m00204`, `m00255`, `m00329`; bodies are
   `&#603;`, `&#43;`, `&#8722;`, `&#x2212;`, `&#8211;`. E2 is specified as BLOCKING on a 1.3%
   base rate; these are false halts on a paid run.

### 🔴 WHERE THE HALVES DISAGREED, FABLE WAS RIGHT AND OPUS'S VERIFIERS WERE WRONG

Opus refuted this **three times** across two lenses; Fable found it twice independently and it
survived Fable's refutation. **Controller settled it by execution:**

| invocation | modules examined | exit |
|---|---|---|
| real chapter (positive control) | 7 | 0 |
| `cnxml-fidelity-check --module m99999` | **0** | **0** |
| `cnxml-linguistic-check --module m99999` | **0** | **0** |
| bare `--module` (no value) | **7 — the whole chapter** | **0** |

3. **[IMPORTANT] R1/R5 exit 0 having examined ZERO modules.** Plan C would record a per-module
   GREEN for a module never opened — the project's own *an absence is not an answer* rule.
   `scan-residue` got exactly this matched-nothing guard in Task 8; these two did not.
4. **[IMPORTANT] Bare `--module` silently widens both to a whole-chapter scan** — a per-module
   gate measured on the wrong unit, exit 0 either way.

▶ **META-LESSON: an aggressive refute-by-default verifier kills true findings too.** Opus's
half refuted 43 of 48. Refutation raises precision and LOWERS recall, and nothing in the output
distinguishes "killed because false" from "killed because the verifier was wrong". **A refuted
finding is a claim about the verifier as much as about the code — spot-check the kills, not just
the survivors.** Here, three kills were wrong about the same live defect.

### Documentation/accuracy findings (both halves, agreeing)

5. **E2's numbers exist in THREE conflicting versions** — register RESUME says 3/16,991, the
   §C85 draft says 2/16,630, the shipped test pins **3/17,051**. The draft is destined to be
   applied verbatim as Plan B's base-rate input.
6. **The register RESUME is stale about its own branch** — says HEAD `8a067e31`/26 commits and
   "next is Task 9's review"; actual is `a8ceebe5`/30 with that review closed.
7. **"(61/61) fully reachable" is false in three files** — measured 59/61.
8. **§C86 says "twelve checks"** — `validate-chapter` has 16 validators and runs all of them.
9. **§C82 amendment labels character indices as "byte" offsets** (m68768 glossary).
10. **The frozen battery spec carries execution-falsified claims with no banner-dated amendment**
    — it is binding authority for the unwritten Plans B/C.
