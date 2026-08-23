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

### 1.2 ⚠️ §C88 — re-take its scope ruling
Its OUT ruling for organic's 245 `entry-not-in-figure` alts rests on *"213 of them sit in modules
§C80 is not buying"*. **All 245 are now bought.** The anchor is design, not spend.

### 1.3 ✅ Free measurement — settle the chemistry ceiling
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

---

## Phase 3 — The run

### 3.1 ⚠️ §C82 Plans B (the check battery) and C (driver + ledger) — still unwritten
This is the bulk of the remaining preparation. §C88 was its last blocker and is merged.

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
From the docx (ch01–ch02) and the moved-aside faithful copies (ch03). **Seg-id renumbering is
expected and accepted** — re-application is manual and matches by meaning, not by id.

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
