# G1.12 duplicate segment ids: verification and research record

**🧊 FROZEN 2026-11-12.** Evidence, never status. Status lives in the active register
(`docs/plans/2026-07-21-post-item17-followup-campaign.md`). If this file and the register disagree, the register
wins.

- **Date:** 2026-11-12.
- **Design:** [docs/superpowers/specs/2026-11-12-g112-duplicate-segment-ids-design.md](../../docs/superpowers/specs/2026-11-12-g112-duplicate-segment-ids-design.md)
  (frozen, approved 2026-11-12). Its §7 is what this file answers, and its §6 is the research record below.
- **Branch:** `fix/g112-duplicate-ids`, cut from `69cc289c9`.
- **Rulings:** every "build ledger Ruling N" or "ledger Ruling N" cited here, in `before-after.sh` and in the
  branch's code comments is the numbered line in [build-rulings.md](build-rulings.md), copied verbatim from the
  build's working ledger.
- **What was compared:** `69cc289c9` (the branch start, the last commit before G1.12's changes) against `97ee194b9` (the branch after Task 4,
  which holds all of G1.12's code, data and tests). The Task 5 commit that adds this file touches only
  `test-results/g112-duplicate-ids-2026-11-12/` and the register.

All evidence named here is committed in this directory, apart from the tests, which are committed with the code.
The build's task reports are not in the repository, so the numbers they hold are carried here.

## Commits

| Commit | Task | What |
|---|---|---|
| `ebe742f3b` | 1 | the extractor: a nested note's repeated para takes its counter slot and emits no text |
| `5985eaf2d` | 2 | the editor loader pairs the first Icelandic copy of a repeated id |
| `c5444929f` | 3 | the 83 affected chemistry modules re-extracted (83 segment files, 83 manifests), `verify-cut.mjs` |
| `f766b150e` | 3 | the tests that pinned the duplicated corpus, corrected |
| `908ee0364` | 3 | the references script requires `--out` and `--date` |
| `ae1bf833a` | 3b | the re-MT battery's A2b and A3 expect the 285 unserved Icelandic copies (frozen list) |
| `7520ca67b` | 3b | comments: what a missing unserved-copies list does |
| `97ee194b9` | 4 | corpus pins for the first-copy survivor rule and the controlled render pair |

## Spec §7 item 1: census with zero residual

**Evidence:** `verify-cut.mjs`, output `verify-cut.txt` (run with `--base 5985eaf2d`, the commit before the
re-extract; `RESULT: PASS`). The census half reads `git show <base>:` and parses the CNXML with xmldom.

- 285 duplicated ids in 83 modules, 570 occurrences, every id exactly twice; none in `appendices`.
- Every duplicate is a `para`; in `01-source` each occurs once, as a `<para>` whose parent is a `<note>` whose
  parent is an `<example>` (203 under a section, 61 directly in content, 21 under a subsection).
- English copies that differ: 71 raw, **0 after normalising `[[MATH|MEDIA|TABLE:n]]`** (zero residual).
- Icelandic copies in `02-mt-output`: as many as English for every id; 75 differ raw, 6 after normalising
  `[[MATH:n]]` (the six of spec §6 item 3, listed in the research record below).

## Spec §7 item 2: byte identity

**Evidence:** `verify-cut.txt`.

- `git diff --name-only`: 166 files, the 83 segment files and the 83 manifests; nothing unexpected, nothing missing;
  0 untracked files under `books/`.
- 83 of 83 segment files equal the base file minus its later blocks, byte for byte (285 blocks removed), with no
  repeated id.
- 83 of 83 manifests differ from base only in `extractedAt`, `segmentCount` (down by the removed blocks) and
  `segmentIds` (later repeats removed, order kept, equal to the segment file's ids).
- `02-structure`: 452 of 452 other files byte-identical; `02-for-mt`: 220 of 220 other files byte-identical. This is
  what proves no `auto-N` and no `[[MATH:n]]` shift.

## Spec §7 item 3: controlled render pair, and base against branch

**Evidence:** `tools/__tests__/duplicate-id-survivor-corpus.test.js` (test 3) and `before-after.sh`, output
`before-after.txt`.

- **The controlled pair.** For the 83 modules, a direct render of `01-source` against an extract → inject English
  round trip, compared **by value at the element keyed by each paragraph's id** in the rendered HTML: equal and
  non-empty at all 285 ids.
- **Base against branch** (`before-after.txt`, `RESULT: PASS`, exit 0). Each side is checked out as a detached
  worktree on disk, at one shared path, and runs, in order:
  - the §C82 battery, every tier (`battery-verdicts.mjs`);
  - `cnxml-inject` over all chemistry (chapters 0–21 and appendices), mt-preview track, from `02-mt-output`;
  - `source-roundtrip-check` over all 23 chemistry chapter dirs;
  - `render-oracle-check` on ch01, ch03 and ch03 `--control` (its manifest covers only ch01 and ch03);
  - `validate-chapter` on chapters 1–21, mt-preview track;
  - `cnxml-extract` over every chapter of physics, biology, microbiology and organic (organic in scratch only;
    nothing of it is committed).

  Result, 217 commands per side (103 s base, 100 s branch; the side worktree removed after each):
  - **Exit codes equal for every command.** They mean little alone: at base already, 8 of 23 inject chapters,
    22 of 23 `source-roundtrip-check` dirs and 21 of 21 `validate-chapter` runs exit 1, and do so identically on
    the branch.
  - **stdout byte-identical** for every command but one, the pre-registered physics line below.
  - **stderr identical except the one accepted class:** `Note: N duplicate segment(s) skipped
    (first-match-wins)` lines present on base and absent on the branch, checked per command by value against the
    frozen list's per-module duplicate counts for that chapter. `cnxml-inject`: 83 lines, Ns summing to 285 (its
    English parse; the Icelandic parse still reports the same notes on both sides, because `02-mt-output` keeps
    both copies). `source-roundtrip-check`: 83 lines, summing to 285. `render-oracle-check`: 7 lines, summing to 37
    (ch01's 3 listed modules and ch03's 4; `--control` stopped at a module with none).
  - **Copied trees byte-identical:** chemistry's injected `03-translated/mt-preview` (297 files), and the fresh
    `02-for-mt` and `02-structure` of biology (306 + 746 files), microbiology (188 + 478) and organic (404 + 1,061).
    Control: on each side inject overwrote 136 files and changed 112 tracked files against the committed tree, so
    the comparison is of real output for those files.
  - **⚠️ But inject wrote nothing for 8 of the 83 affected modules, identically on both sides,** so for them
    "byte-identical" compares the committed file with itself, and the 136/136 control cannot see that. The eight are
    `m68700`, `m68733`, `m68747`, `m68844`, `m68744`, `m68798`, `m68852` and `m68858`; two of them (`m68700`,
    `m68747`) hold wording-different Icelandic pairs. The committed `before-after.txt` shows that inject writes
    nothing for them on either side and that its stdout/stderr notes are identical on both sides. The split of
    the eight into refusals on marker residue and skips on untranslated English was read from run outputs that
    were never committed and no longer exist, so it is not asserted here. **The compensating evidence for these eight:** their inject stdout and
    stderr (the refusal itself and the base-only duplicate notes) are identical on both sides, and Task 4's
    in-memory sentinel (`tools/__tests__/duplicate-id-survivor-corpus.test.js`, §7 item 4 below) injects and
    renders all 285 ids without going through the CLI's refusal, so it covers these modules too.
  - **Physics (317 + 1,044 files): byte-identical except ONE pre-registered difference** (build ledger Ruling 22).
    In ch03 `m42045`, `m42045:para:import-auto-id1839825` (a para in a note nested directly in an example) is
    extracted twice at base and once on the branch: the extract line goes from 155 to 154 segments, the segment
    file equals the base file minus that id's second block byte for byte, and the manifest's `segmentCount` goes
    155 → 154 with exactly that id's later entry removed from `segmentIds`, every other key equal. The script
    checks it by these exact values, requires it to be observed, and fails on any other difference. The first full
    run, before the pre-registration, reported exactly this and nothing else as `RESULT: FAIL`. It is G1.12's fix
    on a fresh extract of a physics chapter: this change commits nothing for physics, and physics ch03 has no
    committed `02-for-mt` or `02-mt-output`, so nothing ships (correction 2 below).
  - **The pre-registration was tested before the re-run** with five planted negatives, each on a throw-away copy
    of the first (FAIL) run's saved outputs, against the comparison half of the script; the unchanged copy passed.
    Each produced these failure lines:

    | Planted | Failure lines |
    |---|---|
    | the branch `m42045-segments.en.md` text changed (one word) | `tree edlisfraedi-2e-02-for-mt: ch03/m42045-segments.en.md differs, but not as pre-registered: base minus the second block is not byte-identical to the branch file`; `the pre-registered physics m42045 difference was not observed in full` |
    | the branch manifest's `segmentCount` set to 153 | `tree edlisfraedi-2e-02-structure: ch03/m42045-manifest.json differs, but not as pre-registered: segmentCount 155 -> 153 (want 155 -> 154)`; the same "not observed in full" line |
    | a second physics ch03 file differs (`chapter-metadata-segments.en.md`, one line appended) | `tree edlisfraedi-2e-02-for-mt: 2 difference(s)`; the same "not observed in full" line |
    | the branch extract stdout line says 153 segments | `extract-edlisfraedi-2e-ch03: stdout differs`; the same "not observed in full" line |
    | the expected difference absent (branch segment file replaced by the base one) | `the pre-registered physics m42045 difference was not observed in full` |

    **A known limit:** all five target the m42045 key. None exercises the per-command notes-multiset check or the
    battery's finding allowlist; those were exercised only by the real runs (the smoke runs and the two full runs).
  - **The battery:** 3,066 verdicts on each side, no key on one side only, no CTX-FAILED, 0 verdicts differ.
- **`validate-chapter` reports no new segment-count mismatch:** its output is identical on both sides.

## Spec §7 item 4: a sentinel through inject and the loader

**Evidence:** `tools/__tests__/duplicate-id-survivor-corpus.test.js` (test 2) and
`server/__tests__/duplicateIdLoaderCorpus.test.js`. Both work on scratch copies; `02-mt-output` is never written.

- **Inject and render.** A unique token is planted in each first Icelandic copy (`G112FIRST<n>`), a different one in
  each second copy (`G112LAST<n>`), and a control token in one unaffected paragraph per module (`CTRL`). After
  inject (`buildCnxml` + `parseSegments`, with the committed `02-structure` and `01-source`) and render, each first
  token and each control token is the **whole value** at its id-keyed element in the injected CNXML and in the
  rendered HTML: 285 first tokens and 83 control tokens checked. No second token appears anywhere.
  - One narrowing: `m68808 fs-idm119337184` holds a nested `<equation>` the segment does not own, so the test
    compares the paragraph's own text (block children skipped), still as a whole value.
- **The loader.** On the real books, `loadModuleForEditing` gives one row per repeated id, and its `is` equals
  `normalizeTermMarkers(en, unescapeMtMarkers(first copy))`. Every `[[MATH:n]]` of the English is in it, and
  `duplicatedIds` is empty (285 checked). With planted tokens in a temporary books directory, every row is a first
  token and none is a second.

## Spec §7 item 5: tests that fail on the broken code

| Test file (commit) | What it pins | Red on the broken code | Green |
|---|---|---|---|
| `tools/__tests__/cnxml-extract-nested-note-duplicate.test.js` (`ebe742f3b`) | fixtures A–H: A is a nested note paragraph carrying `<m:math>` followed by an id-less table entry; its `auto-N` id and `[[MATH:n]]` numbers stay as at base | 5 failed, 6 passed: A (ids), B, D, E, F red; C, G, H pin behaviour that must not change | 11 of 11 |
| `server/__tests__/duplicateIdFirstCopy.test.js` (`5985eaf2d`) | the loader serves the first copy for one English and two Icelandic occurrences; the row is minted; R4 still fires on a duplicated English id; `applyApprovedEdits` writes one entry per id, from the first copy | tests 1, 2 and 4 red (`'Alfa [[MATH:2]].'` received, the second copy); the R4 test passes | 4 of 4 |
| `tools/__tests__/segment-ids-unique-corpus.test.js` (`c5444929f`) | no committed `02-for-mt/*/*.en.md` file in any book holds an id twice (legacy `(b)` files excluded) | `285 repeated id(s) in 83 file(s); first: m68674:para:fs-idp2744784` | 3 of 3 |
| `tools/__tests__/g112-unserved-copies.test.js` (`ae1bf833a`) | the frozen list, pinned both ways; A2b v4 and A3 v2 against it | 6 failed, 34 passed with the list and loader present but A2b and A3 unchanged (A2b fixtures 1, 2, 4, 6; A3 "listed not reported", "unlisted beside listed") | 40 of 40 |

- **The list-item fixture spec §7 item 5 names is replaced by fixture B.** `processList` emits only `item` segments,
  so a list-item paragraph cannot tell an id-keyed skip from a type-keyed one. A title-only paragraph can: the walk
  emits it as `para-title`, never as `para`, so only the id set keeps the note's `para:p-9`. Fixture G pins the
  other boundary: an id-less paragraph in a nested note is still emitted twice.
- Task 4's two corpus files (`duplicate-id-survivor-corpus.test.js`, `duplicateIdLoaderCorpus.test.js`) pin the end
  state and are proved by mutation (next section) rather than by a red run at base.

## Spec §7 item 6: mutant hygiene

Every mutated file was copied to a golden copy first, restored from it after each round, and compared with `cmp`
after every round and once at the end. No mutant was left in the tree, and every committed file is byte-identical
to the one tested.

| Task | Mutant | Went red |
|---|---|---|
| 1 | `addSlotOnlySegment` without its `lastInlineAttrs` step | fixture C (only) |
| 3 | `checkBracketBodies` de-duplicates | bracket-body planted arm (`[2, []]` vs `[4, []]`) |
| 3 | E4 counts raw duplicates as real | remt-checks-extract planted arm (FAIL vs PASS) |
| 3 | dup-segid-gate counts raw duplicates as real | dup-segid-gate planted arm (exit 1 vs 0) |
| 3 | `pairUnit` falls back to the first English | ai-review-worklist planted arm (no-en 0 vs 1) |
| 3b | M1 A2b rule 1 off | fixtures 2, 4, 6 |
| 3b | M2 A2b lets a surplus pass | fixtures 3, 4, 5, 7 |
| 3b | M3 A2b ignores the list | fixtures 1, 2, 4, 6 and the A2b base-rate corpus test |
| 3b | M3b A3 ignores the list | A3 "listed not reported", "unlisted beside listed", the A3 premise pin |
| 3b | M4 A3 drops the exact-shape condition | "EN 2 / IS 1", "IS 3" |
| 3b | M5 A3 suppresses every unpaired key when anything is listed | "unlisted beside listed", "EN 2 / IS 1", "IS 3" |
| 3b | M6 `tier2Ctx` drops the list | the sweep over-bar test, the chemistry-object / organic-null pin |
| 3b | M7 the loader returns `{entries: []}` for an absent file | "absent → null", "committed list / organic null" |
| 3b | M8 the list loses one entry | 285/83 count, set equality, loader 285 |
| 3b | M9 the list gains a wrongly shaped entry | count, sorted, shape, set equality, loader 285 |
| 4 | the loader's first-wins line made last-wins | `duplicateIdLoaderCorpus.test.js` (2 tests, e.g. `m68685 fs-idp130268400`) |
| 4 | the planting swapped (occurrence 0 gets the second token) | `duplicate-id-survivor-corpus.test.js` (`m68674 fs-idp2744784: want G112FIRST2, got ["G112LAST2"]`) |

One Task 3 round was discarded because its replacement did not apply; it was re-run with a mutant confirmed applied.

## The re-MT battery: a spec gap, closed by Task 3b

The spec's §5.2 "no change needed" list did not name the §C82 re-MT battery (build ledger Ruling 10). Its BLOCKING
A2b `cross-side` leg compares the parsed English and Icelandic record counts, and pure MT keeps both Icelandic
copies by design, so the re-extract alone made A2b fail on all 83 modules.

- **Before the fix** (`battery-before-fix.txt`, branch start against the re-extracted tree): 159 of 3,066
  (check, unit) verdicts differ, all A2b or A3. A2b goes PASS → FAIL on exactly the 83 modules (chemistry's A2b rate
  83/149 = 0.557 against a bar of 0.05); A3 goes PASS → WARN on 76 of them (the other 7 were already WARN) with 285
  `unpaired-segment` findings, one per second copy.
- **The fix:** A2b (version 3 → 4) and A3 (version 1 → 2) expect the copies a frozen, exact list names:
  `books/efnafraedi-2e/g112-unserved-copies.json`, 285 `(chapterDir, moduleId, segmentId)` entries, base commit
  `69cc289c9`, generated by `make-unserved-list.mjs`. A listed id must have exactly 1 English and 2 Icelandic
  records; a module must satisfy Icelandic = English + listed; anything else blocks as before. A3 counts a listed
  second copy instead of reporting it. The count is reported in each check's message. The list is pinned both ways
  against the corpus, so a re-buy retires entries loudly.
  - **With no list, a module is judged exactly as by v3** (Ruling 20). v3 passes a listed module whose listed second
    copies have all lost their markers (English 3 = Icelandic 3), so losing chemistry's list is loud only in
    aggregate: the corpus pins go red in CI, and a sweep fails A2b on the other, intact listed modules.
- **After the fix** (`battery-after-fix.txt`): 0 of 3,066 verdicts differ from the branch start. `before-after.txt`
  re-measures this on the committed branch: 3,066 verdicts
  on each side, 0 differ, and the only finding-level difference is the A7 change below.
- **The one finding-level change, caused by the re-extract and not by Task 3b:** A7 on `ch20/m68848` goes from
  `number-mismatch` ×3 to ×2, WARN on both sides. The finding lost is `m68848:para:fs-idm3732048#1` value "2", the
  second-copy twin of a finding that remains. A5 and A7 judge paired segments only, so unserved copies leave their
  population.

## The AI harness: the 285 `no-en` skips (Ruling 13)

The harness pairs English and Icelandic by occurrence, so after the re-extract each second Icelandic copy has no
English partner and is skipped as `no-en`. That is the first-copy rule working: the second copy is unserved, so the
harness need not review it. Measured by `pairUnit` over the base English against the re-extracted English, with
the same Icelandic:

| | identical | no-en | kept occurrences | items | items with 2 occurrences |
|---|---|---|---|---|---|
| whole chemistry, before | 4176 | 0 | 18700 | 18464 | 236 |
| whole chemistry, after | 4127 | 285 | 18464 | 18464 | 0 |
| **difference** | **−49** | **+285** | **−236** | 0 | −236 |
| m68727, before | 49 | 0 | 317 | 313 | 4 |
| m68727, after | 45 | 8 | 313 | 313 | 0 |
| **difference** | **−4** | **+8** | **−4** | 0 | −4 |

- 49 + 236 = 285, the rise in `no-en`; for m68727, 4 + 4 = 8. No other skip bucket moved, and no paired item was
  lost: every dropped occurrence was the second occurrence of an item that keeps its first.
- Work list (`buildWorkList`, 2026-10-26 rulings): 18 items lost an occurrence (`candidateOccurrences`
  4,126 → 4,108). 17 keep their candidate set. One, **ch20 m68846 `fs-idp53499344`**, matched its ruling `product`
  only in its second copy and leaves the list (`items` 4,109 → 4,108, `pairs` 5,649 → 5,648). It is one of the six
  wording-different paragraphs.

## Research record (spec §6)

### 1. What changed and why

The extractor emitted 285 note paragraphs twice in 83 chemistry modules: `processExample`'s paragraph walk is blind
to depth, so it emits the paragraphs of a nested `<note>`, and the note's own handler then emits them again under
the same ids (spec §4). The note's second emission now takes its counter slot (and its inline-attribute capture)
without text, so every later `auto-N` id and math placeholder stays as it was, and the editor loader pairs the
first Icelandic copy. Why mechanism (a) and the first copy: spec §1, §2 and §10.

### 2. The pure-MT consequence: the cost of the 285 unserved copies

**Evidence:** `unserved-cost.mjs`, output `unserved-cost.txt`. It cuts the second English block of each listed id
out of `git show 69cc289c9:` (a block runs from its SEG marker line to the next marker). Control: the summed block
length equals Σ(length at base − length at HEAD) over the 83 files, 29,385 = 29,385.

| Basis | Characters | ISK |
|---|---|---|
| **Ceiling** (the `api-translate --dry-run` basis: raw block, marker line included, JS string length) | 29,385 | **293.85** |
| **Expectation** (register §C91 ①: raw − marker lines, each with its newline, − 1 newline per segment) | 17,651 | **176.51** |
| text alone, trimmed (the spec §3 "size of the duplicate text") | 17,366 | — |

- ISK = `estimateIsk` (`tools/lib/malstadur-api.js`, the function `tools/api-translate.js` imports for its dry-run
  estimate): characters × 10 / 1000. The same blocks are 29,630 UTF-8 bytes.
- **A correction to the spec** (correction 3 below): §6 item 2's "17,366 English characters; on the `--dry-run`
  ceiling basis about 170 ISK" labels the trimmed text alone, which is close to the expectation basis, not the
  ceiling. The ceiling is 29,385 characters.
- These are measured on the English at `69cc289c9`. The English each copy was bought from in its own run is not
  reconstructed here, and per §C91 no Miðeind invoice has been reconciled against the API's own accounting.

### 3. The baseline for the 6 wording-different paragraphs

Their two Icelandic copies differ after `[[MATH:n]]` normalisation (`verify-cut.txt`). Copy 0 is now the pure-MT
baseline the editor starts from, and it is what mt-preview readers already see (inject is first-match-wins). Copy 1
stays in `02-mt-output`, unserved.

- `ch03 m68700 fs-idp14642528`
- `ch08 m68747 fs-idm99049568`
- `ch12 m68795 fs-idm239441760`
- `ch14 m68808 fs-idm119337184`
- `ch16 m68817 fs-idm140480768`
- `ch20 m68846 fs-idp53499344`

### 4. The AI-layer consequence: chain-1 changes that become unservable

Measured with `suggestionLogs.keptGroups` (drop filter and marker filter applied), not raw records, from `server/`
with its own Node (v22.22.2), over the 83 listed modules' layer-2 logs:

| | kept groups | kept changes | segments |
|---|---|---|---|
| occurrence 0 (served after G1.12) | 13 | 16 | 10 |
| **occurrence 1 (unservable after G1.12)** | **13** | **16** | **10** |
| both | 26 | 32 | 10 |

- Raw: 20 chains, 32 records, on 10 segments (spec §3's figures, reproduced). No kept group was dropped on these
  segments, so kept changes equal raw records.
- **Next to the G1.23 spec's "22 kept changes in 7 segments"** (§6.4, measured before 2026-11-03), which counts
  **both occurrences, without ch10**. The same output, both occurrences, without ch10's three segments, sums to
  exactly 22 changes in 7 segments. ch10's layer 2 was written on 2026-11-08 (`52354ee03`), after that measurement;
  it adds 3 segments (`m68761`, `m68768`, `m68773`) with 10 changes counting both occurrences, 5 per occurrence.
  On the occurrence-1 basis: 11 changes in 7 segments without ch10, plus ch10's 5, gives the 16 above.
- Before G1.12, §6.4 withheld both occurrences of these 10 segments. After it, occurrence 0's 13 groups can be
  offered, and occurrence 1's 13 groups (16 changes) can never be: their copy is not served. Chain 0 covers all
  10 segments, so what is lost is suggestions for a copy nobody is served (spec §10 call 4).
- The per-segment list is in the command's output below.

The command, run from `server/`:

```bash
cd server && node -e '
const { readModuleLog, keptGroups } = require("./lib/suggestionLogs");
const entries = require("../books/efnafraedi-2e/g112-unserved-copies.json").entries;
const listed = new Map();
for (const e of entries) listed.set(e.moduleId + "\t" + e.segmentId, e.chapterDir);
const mods = new Map(entries.map((e) => [e.moduleId, e.chapterDir]));
const raw = { chains: 0, records: 0, segs: new Set() };
const kept = { 0: { groups: 0, changes: 0, segs: new Set() }, 1: { groups: 0, changes: 0, segs: new Set() } };
const perSeg = [];
for (const [moduleId, cd] of mods) {
  const r = readModuleLog({ book: "efnafraedi-2e", chapter: Number(cd.slice(2)), moduleId });
  if (!r.ok) { if (r.reason !== "absent") console.log("log", moduleId, r.reason); continue; }
  for (const [ck, chain] of r.chains) {
    const [segId, occ] = ck.split("#");
    if (!listed.has(moduleId + "\t" + segId)) continue;
    raw.chains++; raw.records += chain.length; raw.segs.add(moduleId + " " + segId);
  }
  for (const [ck, groups] of keptGroups(r)) {
    const [segId, occ] = ck.split("#");
    if (!listed.has(moduleId + "\t" + segId)) continue;
    const k = kept[occ];
    k.groups += groups.length;
    const n = groups.reduce((a, g) => a + g.changes.length, 0);
    k.changes += n; k.segs.add(moduleId + " " + segId);
    perSeg.push(`${cd} ${moduleId} ${segId}#${occ}: ${groups.length} group(s), ${n} change(s) [${groups.map((g) => g.rulingId).join(", ")}]`);
  }
}
console.log(`raw chains on listed ids: ${raw.chains} chains, ${raw.records} records, ${raw.segs.size} segments`);
for (const o of ["0", "1"]) console.log(`keptGroups occurrence ${o}: ${kept[o].groups} groups, ${kept[o].changes} changes, ${kept[o].segs.size} segments`);
const both = new Set([...kept[0].segs, ...kept[1].segs]);
console.log(`keptGroups both occurrences: ${kept[0].groups + kept[1].groups} groups, ${kept[0].changes + kept[1].changes} changes, ${both.size} segments`);
for (const l of perSeg.sort()) console.log("  " + l);
'
```

Its output, occurrence 1 only (each occurrence-0 line is identical):

```
raw chains on listed ids: 20 chains, 32 records, 10 segments
keptGroups occurrence 0: 13 groups, 16 changes, 10 segments
keptGroups occurrence 1: 13 groups, 16 changes, 10 segments
keptGroups both occurrences: 26 groups, 32 changes, 10 segments
  ch05 m68726 m68726:para:fs-idm5945296#1: 2 group(s), 3 change(s) [calorimeter, heat-transfer]
  ch05 m68726 m68726:para:fs-idm94618544#1: 1 group(s), 2 change(s) [calorimeter]
  ch07 m68742 m68742:para:fs-idp55819408#1: 2 group(s), 2 change(s) [molecular-structure, resonance]
  ch08 m68744 m68744:para:fs-idp204958944#1: 1 group(s), 1 change(s) [node]
  ch08 m68747 m68747:para:fs-idm171143328#1: 1 group(s), 1 change(s) [bond-order]
  ch08 m68747 m68747:para:fs-idm99049568#1: 1 group(s), 1 change(s) [antibonding-orbital]
  ch10 m68761 m68761:para:fs-idm91556848#1: 1 group(s), 1 change(s) [intermolecular-force]
  ch10 m68768 m68768:para:fs-idm44101792#1: 2 group(s), 3 change(s) [intermolecular-force, vapor-pressure]
  ch10 m68773 m68773:para:fs-idp76470512#1: 1 group(s), 1 change(s) [simple-cubic-structure]
  ch21 m68851 m68851:para:fs-idm46993968#1: 1 group(s), 1 change(s) [nucleon]
```

These ten `#1` chains are exactly the ten `integrityFailures` of
`experiments/ai-review-pilot/suggestion-view-references-2026-11-12/references.json`, which supersedes the
2026-11-09 reference for G1.23's check 2 only (its README says why). The references script now refuses to run
without both `--out` and `--date` (Ruling 17), so it can never again overwrite a frozen reference under an
implicit date; the frozen 2026-11-09 README's bare command therefore no longer runs, by design.

### 5. Layer 2's reproducibility

`term-pass apply` re-derives layer 2 from the committed run records, and refuses `stale-inputs` once the English no
longer has the hash a run recorded. After G1.12 that is the case for every chapter holding an affected module: all
except the appendices, ch00 and ch18.

- **The layer-2 anchor today is `5de321ca2`**, on `main`. The branch start `69cc289c9` differs from it in four docs
  files only (`git diff --stat 5de321ca2 69cc289c9`: the register, the Skerfur plan, the G1.12 plan and the G1.12
  spec), so checking out `5de321ca2` reproduces the layer 2 the run records pin by hash. `69cc289c9` itself is not
  on `main`; it would be reachable only through a merge commit.
- **The definitive anchor is the G1.12 merge commit's first parent.** Landing condition 2 has the last planned
  chemistry `term-pass apply --write` land on `main` before G1.12, and that would write a newer layer 2 than
  `5de321ca2` holds. The commit just before G1.12 on `main` is then the one that reproduces the layer 2 G1.12
  supersedes, so record that first parent when G1.12 merges.

### 6. Before/after measurements

Committed in this directory: `verify-cut.txt`, `battery-before-fix.txt`, `battery-after-fix.txt`,
`before-after.txt`, `unserved-cost.txt`, `note-title-census.txt`, with the scripts that wrote them.

### The readers of a repeated Icelandic id (Task 2's census)

| Reader | Copy it uses |
|---|---|
| `tools/lib/seg-markers.cjs` `parseSegmentsMap` | first (its default) |
| `tools/cnxml-inject.js` | first (`parseSegmentsMap`) |
| `tools/generate-tm.js`, `tools/lib/tm-export.cjs`, `server/services/tmService.js` | first (`parseSegmentsMap` via tm-export) |
| `tools/export-corpus.js` | first (`parseSegmentsMap`) |
| `tools/lib/mt-top-up.js` | first (`parseSegmentsMap`) |
| `server/lib/sourceEnglish.js` | reads `02-for-mt` English only, not keyed on Icelandic |
| `server/routes/localization-editor.js` | its lookup is keyed from the request body, not from an Icelandic file |
| `server/services/segmentParser.js` `loadModuleForEditing` | **first since G1.12** (it was last); `segmentEditorService`, `concordanceService`, `acceptanceService`, `propagationService` read through it |
| `acceptanceService` `parseSegments(faithful)` | apply now writes one entry per id, so no duplicate reaches the faithful file |
| `tools/lib/module-sections.js`, `tools/auto-insert-placeholders.js` | last (`duplicates: 'last'`), inert for G1.12: the first reads only title segments, which are never duplicated; the second pairs English with faithful or legacy files, and a census found none with a repeated id in any book (Ruling 7) |

### Still owed before landing (spec §8)

- **[USER]'s read-only production check:** for the 83 modules (`verify-cut.mjs --base 69cc289c9 --list`), count
  rows in `module_openings`, `module_opening_inflight`, `served_text_versions`, `segment_edits`,
  `segment_acceptances`, `suggestion_rejections` and `suggestion_left_open`. **Expected: zero.** Claude's attempt
  on 2026-11-12 was refused by the permission classifier.
- The last planned `term-pass apply --write` on chemistry is done first; then one PR, one deploy; before any of the
  83 modules opens, before G1.7's freeze manifest and before G1.13.

## Corrections to the frozen spec, proposed for [USER]

The spec is frozen and is not edited here. The register's G1.12 ⏭ entry carries these five as one proposed
`✏️ AMENDED` block for [USER] to approve or reject:

1. **§5.2's "No change needed to" list missed the §C82 re-MT battery** (build ledger Ruling 10). Closed by Task 3b,
   as the battery section above describes: 0 of 3,066 verdicts differ from the branch start.
2. **§3's "0 duplicated ids in physics, biology, microbiology, organic" counted only committed `02-for-mt`**, and
   §5.5's instruction to "show no diff" for the other books followed from that premise (Ruling 22). `before-after.sh` is the fresh-extract census of every chapter
   of those four books. It finds exactly one other instance of the shape: physics ch03 `m42045`, whose
   `m42045:para:import-auto-id1839825` (a para in a note nested directly in an example, `01-source` path
   `para < note#fs-id1820082 < example#fs-id1890300 < section`) is emitted twice at base and once on the branch
   (`segmentCount` 155 → 154). Physics commits only ch04 of `02-for-mt`, so the census never saw it. This change commits
   nothing for physics, and physics ch03 has no committed `02-for-mt` or `02-mt-output`, so nothing ships. The first full run reported it as a
   FAIL; the difference is now pre-registered in the script by exact value, and any other difference still fails.
3. **§6 item 2's cost basis.** 17,366 characters is the text alone, not the `--dry-run` ceiling. The ceiling is
   29,385 characters (293.85 ISK); §C91's expectation is 17,651 characters (176.51 ISK).
4. **§6 item 4's comparison figure.** The chain-1 changes that become unservable are, on the occurrence-1 basis
   with ch10 included, 13 kept groups and 16 kept changes in 10 segments. The G1.23 spec's "22 kept changes in 7
   segments" counts both occurrences without ch10, because it predates ch10's layer 2 (2026-11-08). On the
   occurrence-1 basis without ch10 the figure is 11 changes in 7 segments; ch10 adds 3 segments and 5 changes per
   occurrence (10 counting both).
5. **§7 item 5's list-item fixture was replaced by fixture B** (the plan's Task 1, approved with it). `processList`
   emits only `item` segments, so a list-item paragraph cannot tell an id-keyed skip from a type-keyed one; a
   title-only paragraph can, and fixture B pins it.

## The local CI gate

Run locally on 2026-11-12, as CI runs it, on the final tree of the Task 5 commit (`22895efda`): `97ee194b9` plus that commit's then-uncommitted
`test-results/` files and register edit. Each command ran alone, one after another, after `free -h` showed about
6.3 GiB available. The Actions tab owns the CI verdict once a PR exists.

| Command | Exit | Summary line |
|---|---|---|
| `npm test` (repo root) | 0 | `Test Files  602 passed \| 1 skipped (603)`; `Tests  12323 passed \| 1 expected fail \| 12 skipped (12336)`; 832 s |
| `npm run lint` | 0 | eslint over `tools/ scripts/ server/`, no output |
| `npm run format:check` | 0 | `All matched files use Prettier code style!` |
| `npm run docs:check` | 0 | regenerated `docs/_generated/` with no diff (`git status` unchanged afterwards) |
| `cd server && CI=1 npm run test:e2e` | 0 | `274 passed (2.5m)`, `1 skipped` |

- `server/e2e/suggestion-view.spec.js` drives `m68693`, one of the 83 modules, and passed.
- The E2E teardown swept its own MT-lock markers (4) and kept one pre-existing marker
  (`liffraedi-2e/02-mt-output/ch03/m66443-segments.locked`, untouched). `git status` afterwards showed only this
  commit's files.
- The clean baseline at `69cc289c9` passed 596 files (1 skipped); Task 3b's run passed 600 files (1 skipped). The
  branch adds Task 4's two corpus files.
