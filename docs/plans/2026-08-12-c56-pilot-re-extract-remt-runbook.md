# §C56 pilot — re-extract + re-MT runbook (2 chapters, 2 books)

**Date:** 2026-08-12 · **For:** whoever runs the pilot.
**Register item:** §C56, in [`2026-07-21-post-item17-followup-campaign.md`](2026-07-21-post-item17-followup-campaign.md) — **the register owns status; this runbook owns the procedure.**
**Predecessor:** [`2026-07-29-c16-clean-break-runbook.md`](2026-07-29-c16-clean-break-runbook.md) — **still valid, not superseded.** This document reuses its Gate 0 and its scripts; it does not replace them.
**Related:** [`2026-07-06-re-mt-vs-editor-fixes-and-openstax-remerge.md`](../decisions/2026-07-06-re-mt-vs-editor-fixes-and-openstax-remerge.md) · §C16 · §C53

⚠️ Steps are ordered. Do not reorder. Each gate is verifiable — **verify it, do not assume it.**
⚠️ **Run every command from the repo root.**
⚠️ **Never glob a module id across `books/`** — `books/__e2e-fixture__/` holds files at the same relative paths with the same module ids.

---

## Why this document exists, and what it adds

The 2026-07-29 runbook is sound and its detail is hard-won. It is **not sufficient for §C56** for three measured reasons:

1. 🔴 **It predates the hand-repair finding by one day.** It is dated 2026-07-29; project memory `mt-output-hand-repairs` was written **2026-07-30**, *"while assessing a full re-extract/re-MT of every book"*, and records that the premise in use then — *"the only editorial work to preserve is two chemistry ch03 modules"* — **turned out to be incomplete.** Gate A below is the missing step.
2. **It is chemistry-only.** Its own warning: *"Every destructive step is scoped to `books/efnafraedi-2e/`."* §C56 is whole-corpus.
3. **It has no pilot mode.** It is a single all-at-once night run.

**What this runbook does NOT change:** the standing safety gates, the export/re-attach scripts, and the lock semantics. Those are delegated, not rewritten.

---

## Gate A — the hand-repair triage · ✅ **EXECUTED 2026-08-12**

> ✅ **DONE — evidence: [`docs/audit/2026-08-12-c56-gate-a-hand-repair-triage.md`](../audit/2026-08-12-c56-gate-a-hand-repair-triage.md), frozen.**
> **Result: 7 hand-repair commits (~21 module-file touches); 2 reader-visible, one of which was unknown (→ §C57).**
> ✅ **A3 SATISFIED FOR THE PILOT — no hand repair touches `efnafraedi-2e` ch20 or `edlisfraedi-2e` at all.** The pilot needs no re-application work; the **full run** does.
> ⚠️ Census corrected to **31 unique commits, not 43** (12 touch more than one book), and the provenance-based discriminator is **invalid before 2026-06-30**. The gate's original text is kept below as the method record.

## Gate A (method, as originally written) — the hand-repair triage

**The problem, measured 2026-08-12.** `books/*/02-mt-output/` is marked READ-ONLY in CLAUDE.md, **yet it holds hand corrections that exist in no faithful file and under no `.locked` marker.** A re-MT reverts them silently.

**The machine-readable signal is not an index.** `manualCorrections` appears in **exactly one** provenance file across the whole corpus — measured — while **43 commits** touch `02-mt-output`, **23 of them with `fix`/`correct`/`repair`/`manual` subjects:

| book | commits | with repair-shaped subject |
|---|---|---|
| efnafraedi-2e | 23 | 15 |
| liffraedi-2e | 7 | 3 |
| orverufraedi | 6 | 3 |
| lifraen-efnafraedi | 4 | 1 |
| edlisfraedi-2e | 3 | 1 |

**git is the real index.** A `books/*/` glob returns nothing here — iterate the books explicitly:

```bash
for b in efnafraedi-2e liffraedi-2e edlisfraedi-2e lifraen-efnafraedi orverufraedi; do
  echo "===== $b"; git log --oneline --no-merges -- "books/$b/02-mt-output/"
done
grep -rl "manualCorrections" books/*/02-mt-output --include='*-provenance.json'
```

- [ ] **A1.** Every repair-shaped commit classified: **book · module · what changed · did it rename a published file.**
- [ ] **A2.** The reader-visible subset listed separately. **One is already known:** `4e5be912` (2026-07-26) corrected `liffraedi-2e` ch03 `m66441` *Fitusýrur → Lípíð* directly in `02-mt-output`; the re-render renamed the published page `3-3-fitusyrur.html` → `3-3-lipid.html`. **That is a live reader URL** — reverting it flips the URL back and re-triggers C9 prune-on-rename.
- [ ] **A3.** For every repair inside a **pilot** chapter: either re-apply it after the run, or exclude that module. **Record which.**
- [ ] **A4.** Triage output committed as evidence before any run.

⚠️ **The generalisable shape, from the memory:** *"a convention adopted once, never enforced, and later trusted as an index. The signal looks authoritative precisely because it exists at all."*

## Gate B — the lock inventory · ✅ **EXECUTED 2026-08-12**

> ✅ **DONE. The eight locks split cleanly by reason, and lock coverage is COMPLETE.**
>
> | reason | modules | what it protects |
> |---|---|---|
> | `backfill-already-edited` | `m68663` `m68664` `m68699` `m68700` | a **faithful file** — saved in git *and* the DB |
> | `backfill-db-segment-edits` | `m68667` `m68674` · ch05 `chapter-metadata` · `m66443` | **DB `segment_edits` rows only** |
>
> **B1 answered.** The four faithful-less locks protect **18 rows across 18 segments** (`m68667` 4 · `m68674` 1 · ch05 `chapter-metadata` 1 · `m66443` 12), measured read-only on prod. ⚠️ **These exist in EXACTLY ONE PLACE — prod's gitignored `sessions.db` — so they are MORE fragile than the four faithful ones, not less.** The intuition that a module without a faithful file has less at stake is backwards here.
>
> ✅ **Lock coverage is complete — a positive measurement that could have gone the other way.** **Exactly 8 modules have `segment_edits`, and all 8 are locked.** Only one has been edited since the 2026-07-21 backfill — `m68667`, last edited **2026-08-06** — and it was already locked. **No module carries editorial work without protection.** Total editorial state in the DB: **163 rows across 8 modules**.
>
> ✅ **B2 answered: no pilot chapter contains a lock.** The eight sit in `efnafraedi-2e` ch01/ch03/ch05 and `liffraedi-2e` ch03; the pilot is `efnafraedi-2e` ch20 + `edlisfraedi-2e` ch04.
>
> ⚠️ **The residual risk is STRANDING BY ID CHANGE, not overwriting.** A lock stops the MT file being clobbered, but a re-extract **changes segment boundaries**, so `segment_edits` rows can reference ids that no longer exist. That is what the predecessor runbook's **Appendix A (re-attach)** exists for — it becomes load-bearing the moment any of these eight is unlocked.

## Gate B (method, as originally written) — the lock inventory

**8 `.locked` files exist, not 4** — measured 2026-08-12. All carry `reason: "backfill-db-segment-edits"`, locked 2026-07-21:

```
efnafraedi-2e/ch01  m68663  m68664  m68667  m68674
efnafraedi-2e/ch03  m68699  m68700
efnafraedi-2e/ch05  chapter-metadata
liffraedi-2e/ch03   m66443
```

The often-quoted "only 4" is **locked *and* faithful-reviewed** — `03-faithful-translation` holds exactly four files (`m68663 m68664 m68699 m68700`). **Four locks therefore protect something with no faithful file.**

- [ ] **B1.** Established what the four faithful-less locks protect (DB segment edits? a hand repair? nothing left?).
- [ ] **B2.** Confirmed no pilot chapter contains a `.locked` module. *(The recommended pilot chapters contain none — see Appendix A.)*

✅ **Locks are enforced absolutely and beat `--force`.** `mtRunDecision` (`tools/api-translate.js`) returns `'locked-skip'` **before** it considers `force`, with the comment *"absolute: editing has begun, never clobber"*. This is a real mechanism, not a convention.

## Gate C — acceptance criteria · ✅ **BASELINE + FREE PRE-MT RUN EXECUTED 2026-08-12; criteria below await lead sign-off**

> ✅ **DONE — evidence: [`docs/audit/2026-08-12-c56-gate-c-baseline.md`](../audit/2026-08-12-c56-gate-c-baseline.md), frozen. Do not restate its tables here.**
>
> **The free half of the pilot has already run.** Per the LEAD amendment (re-extraction costs
> nothing), both chapters were re-extracted in place, measured, and the tree restored — clean
> before and after, no ISK spent. **The English side came back completely clean on the first
> extract:** legacy `128 → 0`, malformed `4 → 0`, raw `<emphasis` residue `0`, and `+5` `[[i:]]`
> markers restored by the §C58 fix. **The step-③ fix-and-re-extract loop terminates immediately;
> §C58 was the fix it was waiting for.**
>
> **Three corrections to the figures this gate was originally written with:**
> - **Legacy markers are 288, not 160.** The 160 was the **Icelandic side only**; the English side
>   carries a further **128**. The mixed vintage is stale on *both* sides.
> - **The marker deltas are VINTAGE MISMATCH, not the ~2.3%-loss class.** `m68845`/`m68849` had
>   their English re-extracted 2026-07-07 against Icelandic from March. A re-MT eliminates these by
>   construction. `m42137`'s `{"i":+1}` is the pilot's only genuine same-vintage anomaly — and the
>   tempting §C58 explanation for it was **tested and falsified** (that module has zero
>   self-closing `<emphasis/>`).
> - **`{{b}}` does not occur anywhere in the pilot and `{{i}}` only in ch20's Icelandic.** 84% of
>   the legacy load is `{{term}}`. A clean pass here is **not** evidence about `{{b}}`.
>
> 🔴 **C3 IS CONSUMED, AND NO HONEST SUBSTITUTE EXISTS — the pilot's paid half now has no
> falsifiable pre-registered prediction.** C3 was answerable for free, and the answer is yes
> (`m42075`'s four malformed markers are gone; the `[[i:normal]]` §C58 had destroyed is restored).
> **A thing checkable for free is a gate, not an experiment.** Both candidate replacements were
> rejected as dishonest — "deltas go to `{}`" is a tautology, "`m42137`'s `+1` survives" decides
> nothing. **By this runbook's own standard — *"a pilot with no falsifiable prediction is a
> rehearsal"* — the paid half is now a rehearsal.** Whether that rehearsal is worth its ISK is
> **[LEAD]**, and the audit deliberately does not decide it.

## Gate C (criteria, revised 2026-08-12 for the LEAD amendment) — **PRE-MT is free and loops; POST-MT costs money and runs once**

**The split is the point.** Everything in the first table is re-checkable at zero cost, so it is a
**gate to pass before spending** — fail it, fix in code, re-extract, check again. Everything in the
second table can only be measured after the money is spent.

- [x] **C1.** Baseline captured on the pilot chapters before anything was regenerated — **and
      re-verified after restore**, confirming the committed state was returned intact.
- [ ] **C2.** Criteria agreed **[LEAD]**.

### C2a — PRE-MT gate (free · loop until clean · measured on `02-for-mt`)

| # | Criterion | How measured | 2026-08-12 result |
|---|---|---|---|
| P1 | **zero** `{{i}} {{b}} {{term}} {{fn}}` on the **EN** side | `grep -aoE '\{\{/?(i\|b\|term\|fn)\}\}'` | ✅ `128 → 0` |
| P2 | **zero** malformed `[[type: ` on the **EN** side | `grep -ao '\[\[[A-Za-z]\+: '` | ✅ `4 → 0` |
| P3 | **zero** raw `<emphasis`/XML residue leaking into segments | `grep -ao '<emphasis'` on `02-for-mt` | ✅ `0`, with a positive control |
| P4 | extract emits no unexpected new files | `git status --porcelain` for `??` | ✅ none |
| P5 | EN diff reviewed, and its **cause attributed** | `git diff` vs extractor commit log | ⚠️ see below |

⚠️ **P5 is the one that is not uniform, and the criteria must not pretend otherwise.** The two
chapters differ by **16 extractor commits**: `efnafraedi-2e` ch20 was last extracted 2026-07-07/13
(§C58 is the only change since; diff ≈ 42 lines, and it is **almost all `{{term}}` migration**,
not §C58), while `edlisfraedi-2e` ch04 dates from **2026-03-23** and its ~405-line diff is
dominated by months of intended extractor fixes that have never been re-extracted anywhere.
**Review ch20 line-by-line; review ch04 by cause, against the extractor log.** Demanding a
line-by-line read of ch04 would make P5 unpassable and is not what the amendment asks for.

### C2b — POST-MT acceptance (paid · one shot · measured after Step 3)

| # | Criterion | How measured | baseline |
|---|---|---|---|
| M1 | **zero** legacy `{{…}}` on the **IS** side | as P1, on `02-mt-output` | **160** |
| M2 | **zero** malformed `[[type: ` on the **IS** side | as P2, on `02-mt-output` | **4** |
| M3 | per-type marker counts preserved EN→IS | **`bracketMarkerDelta`** from `tools/api-translate.js` — already live and tested; **do not write a new checker** | see frozen audit |
| M4 | inject + render succeed | tool exit codes | — |
| M5 | `fidelity:render` no worse than baseline | ⚠️ **NOT `npm run fidelity:render`** — that script is hardcoded `--book efnafraedi-2e` and would silently skip the physics half. Run the tool directly, per book + chapter. | chem ch20 **1 finding**; physics ch04 **0, but only 3 of 4 checks ran** |
| M6 | every published-file rename accounted for | slug map from predecessor Step 2 (C9 contract) | both chapters **are** published (10 + 16 files) — the C9 obligation is live |
| M7 | cost within estimate | ⚠️ **`--force --dry-run`, not `--dry-run`** — see below | ≈ **3,108 ISK** (chem 1,147 + physics 1,961) |

⚠️ **M3 must be read against the vintage correction.** Pre-migration deltas are *expected* to be
non-zero for vintage-mismatched modules and mean nothing. **The criterion is that deltas are zero
once both sides are regenerated at one vintage** — anything non-zero *then* is the real signal.

✅ **M5's baseline IS captured (2026-08-12, [LEAD] instruction) — and capturing it broke M5, M7 and Step 3.** Details in the frozen Gate C audit; the operative consequences:

🔴 **M5 — physics's `0 findings` is NOT a clean bill, and the obvious fix would BLESS THE BUG.**
`checkChapter` guards its sensitive shape-drift detector behind `if (baseline)`, and
**`edlisfraedi-2e` has no `render-fidelity-baseline.json`** — only chemistry does. So physics ran
the three baseline-free checks and **not** the drift detector. ⚠️ **Do NOT `--update-baseline`
physics before the migration:** the tool's own docstring forbids baselining a render known to
contain a bug, and physics ch04's published HTML is rendered from the §C58-corrupted Icelandic.
▶ **Capture physics's baseline AFTER the migration, from the clean render.** ⚠️ And note
chemistry's pre-existing drift is in the **`em`** bucket — the exact bucket §C58's restored
`[[i:]]` markers will move, so do not read a post-migration `em` change as new.

🔴 **M7 — the bare `--dry-run` in Step 1 reports `~0 ISK`, which is a WRONG ANSWER THAT LOOKS LIKE AN ANSWER.** Every pilot module is already translated, so it lands in *Already done* and is priced at zero. **The re-MT requires `--force`, and so does its estimate.**

🔴 **AND STEP 3 AS WRITTEN IS A NO-OP.** Its commands omit `--force`, so they would report
`Already done: 6` / `Already done: 10`, translate nothing, spend nothing, and **exit successfully** —
a green run that did not run. **Corrected in Step 3 below.** ⚠️ Locks still beat `--force`
absolutely (`mtRunDecision` returns `locked-skip` first), and Gate B confirmed the pilot has none.

## Gate D — standing safety gates · **delegated to the predecessor**

Run **[`2026-07-29-c16-clean-break-runbook.md`](2026-07-29-c16-clean-break-runbook.md) Gate 0 verbatim**, substituting the pilot's book scope. Do not paraphrase it here — it carries traps that matter, notably that `sqlite3` **creates** a database rather than failing on a wrong path (measured: an empty path exits 0 and writes a 4096-byte backup-shaped file containing nothing).

- [ ] `$DB` resolved via `node -e "console.log(require('./server/lib/dbPath.js')())"` and confirmed to exist at a non-trivial size
- [ ] Off-box DB backup taken
- [ ] **Editorial server stopped** — confirm the process is down, not merely idle
- [ ] **`git-backup.sh` cron paused on prod** — it commits `books/` every 2h and would commit a half-migrated tree
- [ ] `VACUUM INTO` snapshot taken, destination size sanity-checked
- [ ] **Slug map captured** (predecessor Step 2) **before** anything is cleared — C9 needs old→new to serve redirects, and the old filename ceases to exist the moment we prune. ⚠️ **This is live for the pilot**: both chapters are already published (chem ch20 **10** files, physics ch04 **16**), so a re-render can rename pages.
- [x] ✅ **`fidelity:render` baseline captured 2026-08-12 per [LEAD] instruction** — chem ch20 **1 finding** (`shape-drift`, bucket `em`, 93→94), physics ch04 **0 findings but only 3 of 4 checks ran**. ⚠️ **Do not run `npm run fidelity:render`** — it is hardcoded `--book efnafraedi-2e` and silently skips the physics half. Use the tool directly:

```bash
node tools/cnxml-render-fidelity-check.js --book efnafraedi-2e  --chapter 20
node tools/cnxml-render-fidelity-check.js --book edlisfraedi-2e --chapter 4
```

⚠️ **Do NOT pass `--update-baseline` before the migration** — physics has no baseline file, and creating one from its §C58-corrupted published render would bless the bug and turn the post-migration fix into a reported regression. **Physics's baseline is captured AFTER, from the clean render.**

### ⚠️ Gate D scoping — an open [LEAD] question, deliberately not answered here

Gate D is inherited verbatim from a runbook written for an **all-at-once night run over chemistry
with locked modules in scope**. **The pilot's risk profile is different in a way Gate B measured:
it contains no `.locked` module and no `segment_edits` row**, and extract/MT/inject/render touch
`books/` only — not `sessions.db`. **So which of the DB/server/cron steps the pilot actually needs
is a real question, not a formality.** Two things point opposite ways, and the lead should rule:

- **Arguing for the full gate:** the prod `git-backup.sh` cron commits `books/` every 2h and would
  happily commit a half-migrated tree; and the off-box DB backup is cheap insurance regardless.
- **Arguing for a reduced gate:** if the pilot runs on **dev** and its output is held unpushed
  until reviewed, prod is never in a half-migrated state and the DB is never touched at all —
  in which case stopping the editorial server buys nothing.

⚠️ **Do not resolve this by reasoning alone — the predecessor's Gate 0 carries traps that matter
(notably that `sqlite3` CREATES a database rather than failing on a wrong path).** If in doubt,
run it in full; it is cheap relative to 3,108 ISK.

## Step 1 — cost check

🔴 **`--force` IS LOAD-BEARING IN THE ESTIMATE, NOT JUST IN THE RUN.** Every pilot module is already
translated, so a bare `--dry-run` classifies all 16 as *Already done* and prints
**`Estimated cost: ~0 ISK`** — measured 2026-08-12, on both chapters. That is a wrong answer in the
shape of a right one, and it prices the operation at zero.

```bash
node tools/api-translate.js --book efnafraedi-2e  --chapter 20 --force --dry-run
node tools/api-translate.js --book edlisfraedi-2e --chapter 4  --force --dry-run
```

✅ **`--dry-run` is genuinely offline** — verified by reading the code: the dry-run block prints and
`process.exit`s **before** the translate loop is reached. `--force --dry-run` costs nothing to run.

⚠️ **`tools/lib/parseArgs.js` silently drops unknown flags** — a misremembered flag is a no-op, not an error. Confirm any flag you use appears in that tool's `--help` before relying on it. **There is no `--output-dir`.**

- [x] Pilot cost recorded **2026-08-12: ≈ 3,108 ISK** — `efnafraedi-2e` ch20 114,661 chars ≈ **1,147**, `edlisfraedi-2e` ch04 196,119 chars ≈ **1,961**. *(~6% of the ~4.93M-char / ~49,300 ISK whole-corpus estimate, 72% of which is chemistry.)*
- [ ] ⚠️ **Re-run the estimate AFTER Step 2.** The figure above is measured against the **committed, pre-re-extract** English; bracket markers add characters, so the real bill is somewhat higher. Treat 3,108 as an order of magnitude, not a quote.
- [ ] ⚠️ Note the halves are lopsided **opposite** to the corpus totals — physics costs **1.7×** chemistry here, though `edlisfraedi-2e` is ~4% of the eventual bill against chemistry's 72%.

## Step 2 — re-extract the pilot chapters

```bash
node tools/cnxml-extract.js --book efnafraedi-2e  --chapter 20
node tools/cnxml-extract.js --book edlisfraedi-2e --chapter 4
```

⚠️ **These are FLAGS, not positionals** — `--book`/`--chapter`. The positional form fails.
✅ **`01-source` is not a blocker**: extraction *reads* source and writes `02-for-mt`/`02-structure`. The no-redownload rule governs *replacing* source, not reading it.

- [ ] Diff of `02-for-mt` reviewed — **expect segment-boundary changes** (measured on one module previously: 51 insertions / 108 deletions; measured across the whole pilot 2026-08-12: **366 insertions / 81 deletions over 13 of 16 EN files**, plus 1,594 / 803 in the structure sidecars)
- [ ] **C2a re-evaluated (P1–P5). If any fails: fix in CODE, re-extract, and check again — this loop is free and may run as many times as needed. Do NOT proceed to Step 3 until C2a is clean.**

✅ **Executed 2026-08-12 and C2a passed on the first extract** (frozen audit). A repeat run is expected to reproduce it — `m68847` came back byte-identical, so the extractor is deterministic over unchanged input.

⚠️ **Hand-fixing `02-mt-output` is NOT part of this loop.** The amendment's ordering is explicit: systematic fixes go into code first, and the reviewed tail comes *after*, never instead. Anything fixed by hand must be recorded machine-readably (`manualCorrections`) — Gate A's whole finding is what happens when it is not.

## Step 3 — re-MT

🔴 **CORRECTED 2026-08-12 — `--force` IS REQUIRED, AND WITHOUT IT THIS STEP IS A SILENT NO-OP.**
The commands originally written here omitted it. Measured: all 16 modules classify as *Already
done*, so the tool translates nothing, spends nothing, and **exits 0** — a green step that did not
run, followed by Step 4 injecting the unchanged old translations.

```bash
node tools/api-translate.js --book efnafraedi-2e  --chapter 20 --force
node tools/api-translate.js --book edlisfraedi-2e --chapter 4  --force
```

⚠️ **`--force` does NOT override locks.** `mtRunDecision` returns `'locked-skip'` **before** it
considers `force` (*"absolute: editing has begun, never clobber"*). Gate B confirmed the pilot
contains none, so `--force` here is bounded to re-translating already-machine-translated text.

- [ ] **This is the step that spends money — ≈3,108 ISK, and it is the first irreversible action in the runbook.** Everything before it is free and restorable.
- [ ] Any `.locked` module reported as `locked-skip` — **expected to be none in the pilot**
- [ ] Marker delta reported by `bracketMarkerDelta` reviewed per module
- [ ] ⚠️ **Read deltas against the vintage correction** — both sides are now one vintage, so **any** non-zero delta is real signal, unlike the pre-migration baseline

## Step 4 — inject + render

```bash
node tools/cnxml-inject.js --book <book> --chapter <n>
node tools/cnxml-render.js --book <book> --chapter <n>
```

- [ ] Both succeed
- [ ] `npm run fidelity:render` compared against the Gate C baseline

## Step 5 — evaluate

- [ ] All **C2b** criteria (M1–M7) evaluated and recorded — **including failures**
- [ ] **C2a re-confirmed post-run** — the EN side is regenerated by Step 2 and should still be clean
- [ ] ~~C3's prediction resolved~~ — **consumed pre-MT on 2026-08-12; `m42075`'s four malformed markers are gone and `[[i:normal]]` is restored.** There is no remaining pre-registered prediction for the paid half; record that honestly rather than substituting one after the fact.
- [ ] Result written to §C56 in the register

## Step 6 — decide

- [ ] **[LEAD]** Proceed to the full run, adjust, or stop
- [ ] If proceeding: the full run needs Gate A completed for **all five books**, not just the pilot's two
- [ ] **§C53's corpus-check baseline is taken from the post-migration corpus** — if it comes back clean, no allowlist is built

## Afterwards

- [ ] Restart the editorial server; unpause `git-backup.sh`
- [ ] Re-establish MT edit-locks where appropriate (predecessor Step 5a)
- [ ] **§C53's save gate should ship before editing resumes at volume** — editors will be working on regenerated text

---

# Appendix A — pilot chapter selection, and why

Selected **2026-08-12** on three criteria: contains the thing being eliminated, contains no protected edits, and is small enough for fast feedback.

| Chapter | Modules | Legacy markers | `.locked` | Repair-shaped commits | Why |
|---|---|---|---|---|---|
| **`efnafraedi-2e` ch20** | 6 | **80 IS + 50 EN** | none | 2 | Chemistry is 72% of the eventual bill — pilot where the money is. Lowest repair exposure of any chemistry chapter. |
| **`edlisfraedi-2e` ch04** | 10 | **80 IS + 78 EN** | none | 1 | 🔴 Holds **4 of §C53's 5 malformed markers** (`m42075`), making Gate C3 falsifiable. |

⚠️ **CORRECTED 2026-08-12 — the "80 each" in this table was the ICELANDIC side only.** The English
side carries a further 128, so the pilot's legacy load is **288 halves, not 160**. Broken down:
**`{{term}}` is 84% of it, and `{{b}}` does not occur at all** — the per-type table (and the
halves-vs-pairs unit it is counted in) lives in the frozen Gate C audit; do not restate it here.
🔴 **C3 is no longer falsifiable — it was answered for free pre-MT.** The reason this table gives
for choosing ch04 has therefore been spent; the chapter is still the right choice, but for
evidence already collected rather than evidence still to come.

**Pilot total: 16 modules** — `efnafraedi-2e` ch20 (`chapter-metadata`, `m68845`–`m68849`) and `edlisfraedi-2e` ch04 (`chapter-metadata`, `m42069`, `m42073`, `m42074`, **`m42075`**, `m42076`, `m42129`, `m42130`, `m42132`, `m42137`). All counts measured 2026-08-12; **an earlier draft of this table said ch04 held 1 module — it holds 10**, and the number came from an inference rather than a measurement.

**Both carry legacy markers**, so elimination is demonstrable — a pilot on a clean chapter proves nothing about the migration's purpose. **Neither contains a locked module**, so the protected edits stay out of scope entirely rather than needing careful handling.

⚠️ **Chemistry ch01 was rejected despite having no legacy markers**: it holds four `.locked` modules.
⚠️ **`liffraedi-2e` ch03 was rejected**: it holds a lock *and* the known reader-visible hand repair (`m66441`).

# Appendix B — what this pilot does NOT establish

- **Nothing about the four protected modules.** They are excluded by design; their hand re-application is a separate, later step.
- **Nothing about books not in the pilot.** `lifraen-efnafraedi` and `orverufraedi` are untouched.
- **Nothing about `{{term}}`/`{{fn}}` in the four non-chemistry books** unless the pilot chapters happen to carry them — check before claiming corpus-wide elimination. *(Measured 2026-08-12: they do carry them, heavily — `{{term}}` is 84% of the pilot's legacy load.)*
- 🔴 **Nothing about `{{b}}` elimination, and almost nothing about `{{i}}`.** `{{b}}` occurs **zero** times anywhere in the pilot and `{{i}}` only on `efnafraedi-2e` ch20's Icelandic side (**30 halves / 15 pairs**). **A clean pass cannot be read as evidence that the `{{i}}`/`{{b}}` problem §C16 describes is solved** — the pilot mostly demonstrates `{{term}}` migration.
- **Nothing about §C58 from the chemistry half.** `efnafraedi-2e` ch20's source holds only 3 self-closing `<emphasis/>` tags and produced no malformed markers; **all §C58 evidence here comes from `edlisfraedi-2e` `m42075`.** The other 93 self-closing tags across the corpus are untested.
- **Nothing about `fidelity:render`** — no pre-migration baseline was captured (see C2b M5).
- **Nothing about the `lb`/`rb` imbalance.** §C53 §2.4 predicts it **survives** any re-extract, being a source-content asymmetry transcribed 1:1. `lifraen-efnafraedi` ch12 is not in the pilot; that prediction stays untested here.
