# Clean-break re-MT — consolidated runbook (chemistry + organic, both in full)

**Date:** 2026-08-23 · **For:** whoever runs the one-off clean-break re-MT.
**Register items:** §C82 (the run) · §C111 · §C112 · §C113 · §C114, in
[`2026-07-21-post-item17-followup-campaign.md`](2026-07-21-post-item17-followup-campaign.md) —
**the register owns status; this runbook owns the procedure and the order.**
**Predecessors:** [`2026-08-12-c56-pilot-re-extract-remt-runbook.md`](2026-08-12-c56-pilot-re-extract-remt-runbook.md)
· [`2026-07-29-c16-clean-break-runbook.md`](2026-07-29-c16-clean-break-runbook.md) — **reused, not
superseded.** Their gates still apply; this document adds what was found after them.
**Governing decisions:** [`2026-08-22-two-book-focus-and-publication-withdrawal.md`](../decisions/2026-08-22-two-book-focus-and-publication-withdrawal.md)
· [`2026-08-22-editorial-work-survives-the-clean-break.md`](../decisions/2026-08-22-editorial-work-survives-the-clean-break.md)

⚠️ **Steps are ordered, and four of them EXPIRE when the run starts.** Each gate is verifiable —
**verify it, do not assume it.**
⚠️ **Run every command from the repo root.**
⚠️ **Never glob a module id across `books/`** — `books/__e2e-fixture__/` holds files at the same
relative paths with the same module ids.

**Provenance marks, used on every step. They are not decoration — three separate claims that
reached a register entry this cycle did not survive re-measurement:**
- ✅ **MEASURED** — re-derived first-hand against this tree, with a control.
- ⚠️ **REASONED** — follows from measured facts but the step itself was not executed end-to-end.

---

## Phase 0 — Captures that become impossible later

**Everything here is destroyed or made unmeasurable by the run. There is no recovery step.**

### 0.1 ✅ Export the research corpus and get it off-box — §C114 ②
`books/*/corpus/` is **gitignored**, so this exists on one disk only, and its join key is the
segment id the run renumbers.
```bash
node tools/export-corpus.js --book efnafraedi-2e
node tools/export-corpus.js --book lifraen-efnafraedi
cp -r books/efnafraedi-2e/corpus books/lifraen-efnafraedi/corpus <off-box destination>/
```
**Gate:** the destination holds both trees, and `git check-ignore -v books/efnafraedi-2e/corpus`
still reports `.gitignore:138` (i.e. you did not "fix" it by committing it).

🔴 **0.1 MUST RUN BEFORE 0.4, AND THE GATE ABOVE CANNOT SEE THE FAILURE — MEASURED
2026-08-23.** 0.4 moves chemistry's four faithful files out of
`03-faithful-translation/`, and `export-corpus.js` reads that directory. Run in the
wrong order the export succeeds, writes its files, exits 0 and satisfies every gate
above — while recording `tiers {mt: 21251, faithful: 0, localized: 0}`. **That zero
is an artefact of step order, not a fact about the book**, and it silently drops the
only human editorial work in the corpus.

▶ **ADD THIS TO THE GATE — it is a VALUE check, and the count-based one above is
structurally blind to it:**
```bash
python3 -c "import json;print(json.load(open('books/efnafraedi-2e/corpus/efnafraedi-2e.corpus-manifest.json'))['stats']['tiers'])"
# chemistry MUST show faithful > 0   (360 as of 2026-08-23, of which 64 postEdited:true)
# organic's faithful:0 is CORRECT    — it has no faithful files at all
```
⚠️ **If 0.4 has already run**, restore the four files from the commit before the backup
cron committed their deletion, export, then remove them again — 0.4 stays in force, and
the working tree must be verified clean before and after:
```bash
for m in ch01/m68663 ch01/m68664 ch03/m68699 ch03/m68700; do
  git show <deletion-commit>^:books/efnafraedi-2e/03-faithful-translation/$m-segments.is.md \
    > books/efnafraedi-2e/03-faithful-translation/$m-segments.is.md
done
node tools/export-corpus.js --book efnafraedi-2e     # verify faithful > 0
rm books/efnafraedi-2e/03-faithful-translation/ch0*/m68*-segments.is.md
```
**Only possible BEFORE the run** — afterwards the seg-ids are renumbered and the
alignment is gone for good, which is the whole reason 0.1 exists.

### 0.2 ✅ Capture organic's render-fidelity baseline — §C114 ③
`lifraen-efnafraedi` has neither `render-fidelity-baseline.json` nor `fidelity-allowlist.json`;
chemistry has both. A baseline captured **after** the run freezes whatever the run produced and
passes forever for the wrong reason.
**Gate:** `ls books/lifraen-efnafraedi/render-fidelity-baseline.json` succeeds.
⚠️ **Its value is bounded and worth saying out loud: organic has ~13 rendered pages today**, so
this covers those and nothing else. It is a comparison point, not coverage.

### 0.3 ✅ Record the MT lock markers before anything clears them — §C111 ①
```bash
find books -name '*-segments.locked' | sort | tee <run-ledger>/locks-before.txt
```
**Expect 8: 7 chemistry + 1 biology.** ⚠️ **The 7 are not 7 modules** — `ch01` ×4, `ch03` ×2, and
**`ch05/chapter-metadata-segments.locked`, which is not a module id** and will not appear in any
module-keyed sweep. Biology's `m66443` is out of scope and **stays locked**.

### 0.4 ✅ Move the four faithful files aside — ON PRODUCTION — §C112
🔴 **This is the step that prevents silent destruction, and its stated reason used to be wrong.**
`loadModuleForEditing` prefers `faithful` over `mt-output`; after the re-extract renumbers ids it
blanks every unmatched segment, `applyApprovedEdits` writes the **whole** set, and
`assembleSegments` emits a marker with an empty body. **One "Vista + Birta" therefore rewrites the
file with blank bodies**, the `.bak` beside it is gitignored, and the blanked file is what the cron
commits. **`ch03`'s pair is the only copy of ch03's editorial work.**
Move `ch01/{m68663,m68664}` and `ch03/{m68699,m68700}` out of `03-faithful-translation/`, **on
prod** — that is the tree the segment editor reads.
**Gate:** the four are absent from prod's `03-faithful-translation/` and present at the preserved
location. ⚠️ **Opening a module is safe; the write fires on apply** — the window closes at the
first "Vista + Birta", not at first sight.
🔴 **DO 0.1 FIRST — THIS STEP EMPTIES AN INPUT 0.1 READS.** `export-corpus.js` reads
`03-faithful-translation/`, so running 0.4 first makes the corpus export record
`faithful: 0` while exiting 0 and passing 0.1's own gate. Measured 2026-08-23, when
exactly that happened; the recovery is written out in 0.1.

---

## Phase 1 — Decisions that must be closed before any spend

### 1.1 ✅ §C92 — organic's `01-source` refresh: RULED, AND THE ANSWER IS NO. CLOSED 2026-08-23.
**[LEAD] descoped both the refresh and §C93 ④.** This step requires nothing further; do not
re-derive it. The register's §C93 ④ owns the reasoning and the still-valid build estimate.

**Ruled on a measurement, not on cost.** Read-only compare of `2a1f8284…main` on
`openstax/osbooks-organic-chemistry`: **8 commits, 15 files, +42/−14 across 12 of 342 modules
(3.5%)**, plus 2 media and 1 collection.xml — a preface tidy, a typo, table-header fixes, a
spelling fix and three errata. Nothing structural; upstream last pushed 2026-07-01. Replacing 342
files for that, before a re-MT that re-translates everything, is a poor trade.

🔴 **The commit named "updating md license" is NOT a relicensing** — checked, not assumed.
`278405a6` leaves the URL byte-identical (`…/by-nc-sa/4.0/`) and only adds human-readable text
inside the element. Organic was and remains `CC BY-NC-SA 4.0`. **No window is closing here.**

📌 **If the three errata are wanted:** an editor applies them by hand to the 12 named modules
after the run. No refresh, no ④, no consent ceremony.
⚠️ **If a refresh is ever wanted later, §C93 ④ must be built FIRST** — a refresh today leaves the
manifest stale, flips `verifySourceManifest` to `{ok:false}`, and turns root `npm test` red with
no supported way back.

### 1.2 ✅ §C88 — scope ruling RE-TAKEN. RULED [LEAD] 2026-08-23. CLOSED.
Its OUT ruling for organic's 245 `entry-not-in-figure` alts rested on *"213 of them sit in modules
§C80 is not buying"*; the 2026-08-17 scope-up bought all 342 modules, so the premise was void.
Re-measured first — all four carried numbers reproduced exactly — then ruled on design, not spend.

**The ruling, in two halves:**
- **① The 244 come in, and they land BEFORE the run** → new step **2.2** below. They are
  extraction-side, so after the run they would cost a second re-extract and a second re-key of
  organic's seg-ids.
- **② ✅ The remaining 1 (`m00032`, Branch 1) IS NOW FIXED IN CODE — PR #412, 2026-08-24.** It was
  deferred to a hand fix (ledger **M1**), and that deferral was **withdrawn because the hand fix
  turned out to be unperformable**: with no alt segment emitted there is no row in the segment
  editor for an editor to set. The `cellParas` branch now emits the alt and writes the translation
  back. **Nothing remains for 4.5 to work here, and the ledger is empty.**

Evidence: [`../../test-results/c88-scope-retake-remeasurement-2026-08-23.md`](../../test-results/c88-scope-retake-remeasurement-2026-08-23.md)
· [`../../test-results/c88-245-feasibility-2026-08-23.md`](../../test-results/c88-245-feasibility-2026-08-23.md)

### 1.3 ⬜ NOT TAKEN — free measurement, settle the chemistry ceiling
🔴 **CORRECTED 2026-08-25: this carried a ✅ and the register says it was NEVER TAKEN.** It requires
a **FRESH** extract, so running it on today's stale one answers a different question — which is
exactly why it belongs immediately before the chemistry leg rather than here. It is free (0 ISK)
and can run alongside the build. ⚠️ **This is the second time a ✅ in this runbook has meant
provenance rather than completion** (2.1 carried one while all 8 lock markers were still on disk).
**Read every ✅ here as "someone wrote this down", and confirm against the register.**
A `--dry-run` on a **fresh** chemistry extract costs 0 ISK and resolves the unmeasured vintage
caveat on the 43,078 figure. **Take it before the chemistry leg, not organic's.**

---

## Phase 2 — Clear the locks

### 2.1 ✅ Clear, in a deliberate commit — §C111
🔴 **Do not rely on the backup cron to record this.** `scripts/git-backup.sh` expands the `.locked`
glob with `compgen -G` and passes only the **surviving** paths to `git add` — **a `git add` of
survivors cannot stage a deletion.** Delete them all and the glob matches nothing; delete some and
only the survivors are staged. Either way a later `git pull` can resurrect them.
**Gate:** the deletion appears in `git show --stat HEAD` as 7 deletions.

### 2.2 ⚠️ §C88 Unit A **+ §C115** — one branch, one PR. MERGED **AND DEPLOYED** BEFORE PHASE 3.
Ruled at 1.2. Relax `if (!media.id) continue` (`tools/cnxml-extract.js:1557`) and give the 244 a
key; teach `applyMediaAltString` (`tools/cnxml-inject.js`) the no-`mediaId` case. `buildTable`
already holds `cell` at its call site, so `collectMediaAlts`' id-keyed table branch need not change.
- 🔴 **A key is REQUIRED — deleting the guard is not the fix.** That site calls
  `altElementId(media.id, 0)` with a **hardcoded index 0**, so id-less media in one module would
  collide on a single `media-0-alt`. **The guard suppressed two failures while documenting one.**
- ⚠️ **Prefer the content-anchored key (`src`, measured unique 245/245 in-module) over a positional
  one.** Both work today (0 of 822 rows disagree), but a positional key inherits future indexing
  drift and **an alt written to the wrong cell is SILENT — no count moves.** Do not copy
  `applyFigureAltDom`'s "first media" *for the reason it chose it*: a figure has one media by
  construction; a table cell does not.
- ➕ **§C115 RIDES THIS BRANCH** — a raw `>` in an `alt` value truncates `<media[^>]*>`, losing a
  segment *and* publishing `alt=""`. Same file, same `[^>]*` neighbourhood, same acceptance shape,
  and it is extraction-side too. 🔴 **Fix the CLASS, not the line** — the idiom is pervasive across
  the pipeline tools (re-derive that enumeration), and **the corpus, not the code, is what has
  limited the damage**. State the sweep's range in the PR.
- 📌 **Pins that move:** `alt-writeback-corpus` organic **1918 → 2162** · `cnxml-extract-alt-corpus`
  · **`alt-coverage-corpus` chemistry 1148 → 1149 once §C115 lands**, and its
  `expect(short).toEqual([{module:'m68727', reachable:6, emitted:5}])` empties — **re-point that
  assertion, do not blank it** *(this line said "alt-coverage-corpus does not move"; that was true
  of Unit A alone, before §C115 joined the branch)* · 🔴 `inject-roundtrip-corpus`, whose third
  assertion **passes vacuously on empty arrays** and must be **re-pointed, not blanked**.
- **Gate:** a **SENTINEL SUBSTITUTION**, never a count (§C89) — overwrite each of the 244 with a
  token that cannot have come from source, inject, count tokens, **with the 1,918 that already work
  asserted alongside as a built-in positive control.**

Sizing and detectors: [`../../test-results/c88-245-feasibility-2026-08-23.md`](../../test-results/c88-245-feasibility-2026-08-23.md)
· §C115's mechanism and corpus census: [`../../test-results/m0-anomaly-sweep-2026-08-23.md`](../../test-results/m0-anomaly-sweep-2026-08-23.md)
· **cold-start briefing for this step:** [`2026-08-24-unit-a-c115-handoff.md`](2026-08-24-unit-a-c115-handoff.md)

---

## Phase 3 — The run

### 3.1 ⚠️ §C82 Plans B (the check battery) and C (driver + ledger)
This is the bulk of the remaining preparation. §C88 was its last blocker and is merged.
⚠️ **CORRECTED 2026-08-25 — this said "still unwritten", which stopped being true on 2026-08-24.**
Both plans are WRITTEN and merged (PR #411 → `2166551b`) and deployed, and Plan B's **Tasks 1-7
are BUILT** — Tier 0 (`G1`-`G5`) and Tier 1 (`E1`-`E7`, `E9`). **Plan B Tasks 8-13 and the whole of
Plan C remain.** ▶ **Status lives in the register's ⏩ RESUME block, not here** — this line is
corrected rather than maintained, per this document's own closing section.

### 3.2 ✅ Expect §C110's warning to be SILENT — and do not read silence as proof
Extraction now warns per module and prints a counted run-end summary when it advances a module
whose MT output is locked. After Phase 2 that count should be **0**. ⚠️ **A silent run is also
what extracting the wrong book looks like** — pair it with the count from 0.3.

---

## Phase 4 — After the run, before either editor resumes

### 4.1 ⚠️ Get the new vintage onto production first
The backup cron does **not** stage `02-mt-output/*.is.md` or `02-for-mt/` at all, so the new MT
reaches prod only via `./scripts/deploy.sh`'s `git pull --rebase`. **If an editor opens a module
before that pull, they edit the old vintage.**

### 4.2 ✅ Re-apply the editorial work by hand
From the docx (ch01–ch02), the moved-aside faithful copies (ch03), **and the §C79 harvest**.
**Seg-id renumbering is expected and accepted** — re-application is manual and matches by meaning,
not by id.
- 🔴 **ADDED 2026-08-25 — THE §C79 HARVEST WAS MISSING FROM THIS LIST, AND IT IS THE ONLY COPY.**
  The DB-only locked modules' edits (`m68667`, `m68674`, ch05 `chapter-metadata`) live **nowhere in
  the repo tree** — they were harvested out of `sessions.db` to
  [`../../test-results/c79-locked-module-edits-harvest-2026-08-12.json`](../../test-results/c79-locked-module-edits-harvest-2026-08-12.json)
  (16.6 KB). This step named only the docx and the faithful copies, so those edits had **no home**
  — the same shape as the `02-mt-output` sweep below, which this step's own omission is what
  surfaced. ⚠️ **§C79's disposition is still an open [LEAD] call** (harvest+drop / harvest+re-apply
  / drop outright); the harvest being done is what makes it reversible, not decided.

✅ **`02-mt-output` HAND REPAIRS — SWEPT 2026-08-23 (ledger M0): NOTHING NEEDS RE-APPLYING HERE.**
The run overwrites `02-mt-output`, so human corrections in it are **destroyed, not preserved** —
and this step named only the docx and the faithful copies, so they had no home. Swept by **path**
across full git history for both kept books (the `manualCorrections` provenance block is a known
under-report), positive control §C57 `827424da` fired. Five genuine hand repairs; **every cause has
a shipped mitigation or is superseded by re-extraction** — `unwrapInventedMarkers` (§C67), the
fail-loud null-byte guard, the bracket-marker migration, and id renumbering.
- ⚠️ **Re-run the sweep if the run slips or more hand repairs land**, and classify by **path, then
  by diff** — never by commit subject: `827424da` carries a `fix(…)` subject and a 492-line diff
  and is a **re-translation**, not a hand edit.
- 🔴 **This rests on causes being FIXED, not on anything being backed up.**
  `03-faithful-translation/` holds **0** files for organic and only a README for chemistry, so
  nothing in `02-mt-output` is protected that way.
- 📋 [`../../test-results/m0-anomaly-sweep-2026-08-23.md`](../../test-results/m0-anomaly-sweep-2026-08-23.md)

### 4.3 🔴 ✅ If you use `reattach-segment-edits.js`, verify content first — §C114 ①
Its header says *"Matching is exact (module_id, segment_id). There is no fallback"*, and
`original_content` is read only as context — **never compared**. An id that survives while naming
different text restores onto the **wrong segment** and reports `unmatched: 0`.
**Chemistry is 30.2% counter-derived ids against organic's 3.9% — ~8× the exposure.**
**Gate:** for every restored row, `original_content` matches the text its id now names. ⚠️
**`unmatched: 0` is not evidence the harvest survived.**

### 4.4 ✅ Re-apply the locks — `--db`, on PRODUCTION — §C111
```bash
node scripts/backfill-mt-locks.js --db     # ON PROD
```
🔴 **A bare run restores 4 of 7** (only the modules with a faithful file), and 🔴 **a `--db` run on
a dev box is indistinguishable from the right one** — the guard fires only on an *absent* DB, and
the dev box has one holding just `m68663`/`m68664`, so it adds nothing and prints the same success
line. **Prove which box you are on.**
**Gate:** `find books -name '*-segments.locked' | sort` **diffed against `locks-before.txt`**, not
the command's exit code. ⚠️ **`ch05/chapter-metadata` is reachable only if `segment_edits` holds a
row with that literal `module_id` — check on prod; if not, write it by hand.**
📌 **"Properly safe format" is an open [LEAD] question**, not decided here.

### 4.5 ⚠️ Work through the ⚒️ post-run manual-fix ledger — the deferred hand fixes
The register's **⚒️ Post-run manual-fix ledger** section holds every anomaly deliberately NOT wired
into the run because a human costs less than the code. **This is the step that spends them.**
- Each item states **why the run will not fix it** — if the run did fix one, **delete the item**
  rather than working it; a ledger that sends people to redo solved work stops being read.
- ✅ **THE LEDGER IS EMPTY as of 2026-08-24 — M1, its last item, was CLOSED BY CODE (PR #412), and
  this section's own rule above is what applies: an item the code fixed is DELETED, not worked.**
  ⚠️ **Still run the gate** — empty is a state to verify, not to assume, and a deferral added
  between now and the run lands here.
- ✅ *(how it got to one)* **M0, the sweep, RAN 2026-08-23 and the ledger was then ONE item (M1), not three.** M2+M3 were
  measured to a single defect that cannot be hand-fixed at all → **§C115**, an extraction-side
  [CODE] item that belongs on **step 2.2's branch**, not here. ⚠️ M0 is *substantially*, not
  exhaustively, complete — its stated exclusions are in the register's M0 entry.
- **Gate:** every ledger item is either fixed-and-verified or explicitly re-deferred with a reason;
  **an item silently left unworked is the failure this section exists to prevent.**

---

## Phase 5 — Delivery

### 5.1 ⚠️ Order: render → `generate-index` → redirects → **named-book** sync → build → deploy
Each reversal has a named failure; the register's §C104/§C108/§C109 entries own them.

### 5.2 🔴 ✅ Expect the reviewed-page collision on the first sync — §C112 / §C113
The four faithful modules were shielded only by their frozen titles, and **§C113 removed that
shield**. They can now rename, so vefur's `resolveChapterDuplicates` +
`sync-content.js:413-420` will **delete the freshly rendered page** and keep the pre-run
`faithful` one, logging it as `Removed superseded page (reviewed rename)`. **Phase 0.4 is the
precondition that prevents this; if 0.4 was skipped, stop and do it before syncing.**

### 5.3 ⚠️ Slug churn needs hand-authored redirects
`slug-map.<track>.json` is **not read at runtime by anything**; vefur's `sectionRedirects.ts` is a
hand-typed constant holding **6** entries. §C9 records what moved — **a human still transcribes
each entry.** Chemistry's rename wave is now ~136 chapter modules (§C113 removed the 30 frozen
titles) plus all of organic.

### 5.4 ✅ Scope the sync — name the books
`sync-content.js` with no arguments syncs **every** book, and three are under a publication hold
(§C109). CLAUDE.md § Cross-repo now names the two publishable books directly.
⚠️ **And a scoped sync REMOVES nothing** — it is not the withdrawal mechanism.

---

## What this runbook deliberately does not contain

- **Status.** Whether any step is next, blocked or done → the register's ⏩ RESUME block.
- **The measurements behind each finding.** They live in §C111–§C114. This document cites; it does
  not restate, because two copies of a number is how one of them goes stale.
- **~11 unverified candidates** from the 2026-08-22 completeness sweep. They were not re-measured
  and are recorded nowhere. **Re-sweep if they matter; do not reconstruct them from memory.**
