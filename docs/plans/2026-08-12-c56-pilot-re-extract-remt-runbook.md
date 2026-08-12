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

## 🔒 PRE-REGISTERED PREDICTION — recorded 2026-08-12 **BEFORE** the paid step, and the earlier "no prediction exists" is WITHDRAWN

> **A blind adversarial review refuted the reasoning behind that claim, and it was right.** The audit
> argued that "all deltas go to `{}`" is a tautology because both sides regenerate at one vintage.
> **That confuses eliminating the current *cause* with eliminating the *possibility*.** The
> instrument's own docstring defines a negative delta as the ~2.3%-loss class and a positive one as
> spurious API duplication — **both same-run, same-vintage phenomena** — and the pilot's own data
> holds the existence proof: **`m42137`'s `{"i":+1}` arose on a same-vintage pair.** A non-zero
> outcome is therefore demonstrably possible, which is exactly what makes it a prediction.
>
> **It also licenses the decision the register said the pilot exists to make.** The amendment left
> *"how big is the manual tail"* as the thing to measure, and the vintage correction disqualified
> the three flagged modules as evidence — **leaving the tail unsized with no other source.** The
> post-MT delta *rate* × ~229 remaining modules **is** that worklist budget.
>
> ### The prediction
> **For all 16 pilot modules, the same-run `bracketMarkerDelta` (fresh EN in → API IS out) is `{}`
> for every counted type; and per-module `[[MATH:` counts match EN↔IS.**
>
> ⚠️ **The MATH half is measured SEPARATELY and is not optional** — `BRACKET_MARKER_TYPES` contains
> **no `MATH`**, so `bracketMarkerDelta` is structurally blind to a dropped or duplicated
> `[[MATH:N]]`, and the pilot English carries **556** of them. Pre-run baseline: **EN 556 / IS 556,
> 0 mismatched modules.**
>
> ### Decision rule, fixed in advance
> - **`{}` everywhere and MATH matched** → marker survival holds at ~310K chars in August; the
>   manual tail is ~0 and the full run needs no per-module worklist budget.
> - **Any non-zero** → that rate × ~229 modules is the tail estimate, **and endpoint marker
>   survival must be re-measured before committing ~49,300 ISK.** CLAUDE.md's durable rule is that
>   marker-survival evidence is per-endpoint and rots when the model behind it changes; the last
>   `/v1/translate` run was **2026-07-13**, so August survival at this scale is genuinely unmeasured.

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
| P1 | **zero** legacy markers on the **EN** side — ⚠️ **BOTH dialects** | `\{\{/?(i\|b\|term\|fn)\}\}` **and** `\+\+[^+]+\+\+` | `{{}}` ✅ `128 → 0`; **`++` was NEVER MEASURED — baseline 5** |
| P2 | **zero** malformed `[[type: ` on the **EN** side | `grep -ao '\[\[[A-Za-z]\+: '` | ✅ `4 → 0` |
| P3 | **zero** raw XML residue leaking into segments | ⚠️ **widened past `<emphasis`** to `<(emphasis\|term\|link\|note\|para\|entry\|row)\b` — the old form gated the last war, not the class | baseline `0` both sides |
| P4 | extract emits no unexpected new files | 🔴 **NOT `git status --porcelain`** — see below | ⚠️ **the earlier ✅ was FALSE** |
| P5 | EN diff reviewed, and its **cause attributed** | `git diff` vs extractor commit log | ⚠️ see below |

🔴 **P4's instrument was BLIND, and what it was meant to catch had already happened.** `git status
--porcelain` cannot see gitignored files, and **`.gitignore:20` is `*.backup.*`** — exactly what
`tools/lib/safeWrite.js` writes on every overwrite. The 2026-08-12 "free run" reported
`??` = none while creating **67** backup files (14 in `02-for-mt`, 53 in `02-structure`), and
`git check-ignore -v` names the rule. **A clean `git status` is not an empty tree.** ▶ Use:
```bash
find books/<book>/02-for-mt/<ch> books/<book>/02-structure/<ch> -name '*.backup.*' | wc -l
```
⚠️ **Consequence for P1/P2/M1/M2: state the file glob.** A *recursive* grep now counts the
pre-migration content preserved inside those backups and fails spuriously; an **exact-suffix glob**
(`*-segments.en.md`) excludes them. *(The 2026-08-12 measurements used exact suffixes and are
therefore uncontaminated — verified, not assumed.)*

🔴 **P1 MISSED AN ENTIRE LEGACY DIALECT THAT IS IN THE PILOT.** The `{{}}` regex cannot see
**`++text++`**, the legacy *underline* form. Measured: **5 in `efnafraedi-2e` ch20's English and 5
in its Icelandic** (`m68849`, from 5 × `<emphasis effect="underline">C</emphasis>` in source);
physics has none. The current extractor emits `[[u:…]]`, and pilot EN holds **0** `[[u:` — so
`++` → `[[u:]]` is a real conversion this migration performs **and the gate could not see it
either way.** "Zero legacy" as previously stated was true **only of the `{{}}` dialect**.

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
| M3 | per-type marker counts preserved EN→IS | **`bracketMarkerDelta`** — 🔴 **PLUS a separate `[[MATH:` count**, see below | delta 3/16 non-zero; **MATH 556/556, 0 mismatched** |
| M4 | inject + render succeed | 🔴 **exit code is NOT sufficient** — see below | — |
| M5 | `fidelity:render` no worse than baseline | ⚠️ **NOT `npm run fidelity:render`** — that script is hardcoded `--book efnafraedi-2e` and would silently skip the physics half. Run the tool directly, per book + chapter. | chem ch20 **1 finding**; physics ch04 **0, but only 3 of 4 checks ran** |
| M6 | every published-file rename accounted for | slug map from predecessor Step 2 (C9 contract) | ⚠️ **9 + 15 = 24 `.html` files** — corrected below |
| M7 | cost within estimate | ⚠️ **`--force --dry-run`, not `--dry-run`** — see below | ≈ **3,108 ISK** (chem 1,147 + physics 1,961) |

⚠️ **M3 must be read against the vintage correction.** Pre-migration deltas are *expected* to be
non-zero for vintage-mismatched modules and mean nothing. **The criterion is that deltas are zero
once both sides are regenerated at one vintage** — anything non-zero *then* is the real signal.

🔴 **M3's instrument CANNOT FAIL for three real corruption classes — verified by executing it.**
`BRACKET_MARKER_TYPES` (`tools/api-translate.js`) contains **no `MATH`**, and the count keys on
*openers only*. Consequences, each measured by calling `bracketMarkerDelta` directly:
a duplicated `[[MATH:1]]` → `{}` · `[[xref:kafli|1]]` → `[[xref:kafli>1]]` → `{}` ·
the spaced `[[i: ` form → `{}`. **The middle one is the exact corruption CLAUDE.md records
Málstaður `/v1/grammar` producing, returned as an *acceptable* `diffAnnotation`.**
▶ **So M3 is paired with a separate per-module `[[MATH:` count** (556 in the pilot English), and a
count-preserving *payload* corruption is **out of scope for this pilot** — say so rather than
letting a `{}` read as "markers are fine".

🔴 **M4 — the migration's own signature failure mode exits 0.** `cnxml-inject.js` computes
`complete` from four conditions, and **`attrMismatches` — "term/footnote ids NOT attached" — is
deliberately excluded and only printed.** This migration is *named* for `{{term}}` →
`[[term:text|id]]`, and `{{term}}` is **84% of the pilot's legacy load**. ▶ **Read the inject
output for `attrMismatches`; do not accept the exit code alone.**

⚠️ **M6 — the "10 + 16 files" recorded earlier was WRONG: it counted the `images/` directory as a
file** (`ls | wc -l` on a directory containing an `images/` subdir). The real figures are **9 and
15 `.html` files = 24**, which is what the slug-map instrument (`find -name '*.html'`) actually
censuses — so the baseline now reconciles with the tool instead of being permanently 2 off.
✅ **Slug map captured 2026-08-12** to `published-BEFORE-all.txt` (**335** html files across all
books) and `published-BEFORE-pilot.txt` (**24**), with dev verified level with prod's content
commit first — 0 changed files under `books/` against prod's `1634867a`.

🔴 **M7 COMPARES AN ESTIMATE TO AN ESTIMATE FROM THE SAME FUNCTION, so it cannot fail.** The live
run's "actual" is `usage.estimatedISK`, computed by the same `estimateIsk(chars)` the dry run uses;
**no billed figure ever enters.** *(Two values from one instrument agreeing proves nothing — this
project's own recorded lesson.)* ▶ Either state a tolerance and compare **character counts**
(which are real measurements), or accept M7 as bookkeeping and stop calling it a check. **The true
cost is only knowable from the Málstaður invoice.**

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

### ▶ EXECUTION LOG — 2026-08-12, on [LEAD] instruction "run full Gate D"

- [x] **`$DB` resolved and confirmed.** Prod `~/repos/namsbokasafn-efni/pipeline-output/sessions.db`, **53,710,848 bytes**. *(Dev's is a different 17 MB DB — the editorial state is prod's.)* Prod reachable, on `main @ 1634867a`, **working tree clean, 0 ahead / 0 behind origin**.
- [x] **Prod health recorded before touching anything:** `status: ok` — db ok (5 users), migrations 49, 6 books, `offbox_backup` 1 h, `content_backup` 2 h `no_changes`, `glossary_export` ok with 4 standing refusals and no stale ones.
- [x] **Off-box DB backup taken.** `pipeline-output/backups/sessions.2026-08-12-133203.db`, **53,710,848 bytes — byte-identical to `$DB`**, off-box upload OK. *(Size checked against `$DB` precisely because Gate 0 warns a 4096-byte result means you backed up nothing.)*
- [x] **`git-backup.sh` cron paused on prod.** Line prefixed `#C56-PILOT-PAUSED#`; original saved to `~/crontab.pre-c56-pilot.bak` (35 lines). ⚠️ **`backup-db.sh` deliberately left RUNNING** — only the content-commit job is paused.
  - 🔴 **UNPAUSE IS MANDATORY AND NOTHING WILL REMIND YOU.** Nothing polls `/api/health`, so a forgotten pause is a silent loss of content backup: `crontab ~/crontab.pre-c56-pilot.bak`.
- [ ] 🔴 **Editorial server stopped — BLOCKED, REQUIRES THE LEAD.** `ritstjorn.service` is `active (running)` with 2 node processes, and **`sudo` on prod requires a password**, which an agent session has no TTY for (measured: `sudo -n` → *"a password is required"*). ▶ **Run:** `ssh siggi@172.236.212.190 -t 'sudo systemctl stop ritstjorn && systemctl is-active ritstjorn'`
- [ ] `VACUUM INTO` snapshot taken, destination size sanity-checked — **deliberately deferred until the server is down**, per Gate 0's "fresh copy taken with the server stopped"

✅ **Gate B's central claim re-verified against prod, with a positive control.** The control lists all 8 modules holding `segment_edits` (m68700 96 · m68664 45 · m66443 12 · m68667 4 · m68663 2 · m68699 2 · chapter-metadata 1 · m68674 1). **No pilot module carries editorial state.**
⚠️ **One row initially matched the pilot filter and had to be resolved:** `efnafraedi-2e / chapter-metadata`. It is **`chapter = 5`**, `segment_id = chapter:title:ch05` (*Varmefnafræði → Varmaefnafræði*, approved 2026-06-24) — **ch05's, not ch20's.** It is the same edit §C57 tracks. **The pilot is clear**, but see the finding below: `chapter-metadata` is the one `module_id` that repeats across chapters, and that ambiguity is real elsewhere.
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

## ✅ Step 5 — RESULTS, executed 2026-08-12 (data commit `c17bb7cf`)

**16 modules, 0 failures. API usage 250,993 chars ≈ 2,510 ISK** (chem 89,282 / physics 161,711)
against a ~3,213 ISK post-extract estimate. *(The gap is real and instructive: the estimate counts
whole-file characters, the API bills translated text only — so `--force --dry-run` over-states.)*

### 🔒 The pre-registered prediction — **CONFIRMED on both halves**

| | predicted | measured |
|---|---|---|
| `bracketMarkerDelta` per module | `{}` for all 16 | **0 / 16 non-zero** ✅ |
| `[[MATH:` counts EN↔IS | match per module | **572 / 572, 0 mismatched** ✅ |

▶ **The decision rule fixed in advance therefore returns: marker survival holds at ~250K chars on
`/v1/translate` in August; the manual tail is ~0 and the full run needs no per-module worklist
budget.** ⚠️ **This is the one number the register said the pilot existed to produce**, and it is
now measured rather than estimated.
⚠️ **Scope it honestly:** this is evidence about `/v1/translate` at this scale on this date — per
CLAUDE.md's durable rule, marker-survival evidence is **per-endpoint and rots when the model
changes**. It is not evidence about `/v1/grammar`, which corrupts these markers.

### Legacy elimination — both dialects, both sides

| | EN | IS |
|---|---|---|
| `{{i}} {{b}} {{term}} {{fn}}` | 128 → **0** | 160 → **0** |
| `++text++` (underline) | 5 → **0** | 5 → **0** |
| `[[u:]]` (its bracket form) | 0 → **5** | 0 → **5** |
| malformed `[[type: ` | 4 → **0** | 4 → **0** |
| raw XML residue | 0 | 0 |

`m42137`'s `{"i":+1}` — the pilot's one genuine same-vintage anomaly — **is gone**; it was a
stale-MT artefact after all.

### ✅ Content RECOVERED, not merely migrated

**`edlisfraedi-2e` ch04 goes 623 → 639 equations, all 16 in `m42076` (53 → 69)** — 67 unique
`[[MATH:` indices, no duplicates. Cause attributed (P5): the **OC-E list-nested block
equation/media** fixes, which post-date that module's March 2026 extract. 🔴 **The currently
published physics ch04 is missing those 16 equations.**

### 🔴 M6 — FIVE PUBLISHED PAGES RENAMED. This is the pilot's most consequential result.

Map: [`books/_slug-maps/2026-08-12-c56-pilot-renames.json`](../../books/_slug-maps/2026-08-12-c56-pilot-renames.json).
All five are **section** pages, which are title-slugged; the re-MT simply chose different Icelandic
titles. Compiled pages (summary / key-terms / exercises / answer-key) have fixed names and did not
move — the same asymmetry Gate A found.

**Rate: 5 of 14 section pages = 35%.** ⚠️ **Do not extrapolate that percentage to the corpus as if
it were stable** — it is 14 pages on two chapters, and title volatility depends on the source
title. But it is emphatically **not** ~0, and a whole-corpus re-MT therefore carries a **large C9
redirect obligation** that must be priced into the full-run decision alongside the ISK.

### M5, and what did NOT change

- **Chemistry ch20: identical to its pre-run baseline** — the same single `shape-drift em 93→94`. **No worse** ✅
- 🔴 **CORRECTED 2026-08-12 — "physics ch04: 0 findings, 3 of 4 checks ran" WAS WRONG IN BOTH HALVES. It ran ZERO checks and read ZERO files** (§C60: the tool built an unpadded `chapters/4`). ▶ **The real result, measured after the fix with a like-for-like pre/post comparison, is that the pilot IMPROVED physics fidelity:**

| | pre-pilot | post-pilot |
|---|---|---|
| findings | **3** | **2** |
| raw CNXML leak | `<link document=` × **11** | `<emphasis` × **1** |
| math dropped | 549→536, **13** | 554→546, **8** |
| image dropped | 56→54, **2** | **0** ✅ |

  **11 `<link document=` leaks and 2 image drops eliminated; math drops down from 13 to 8.** One new
  leak appeared — a raw self-closing `<emphasis effect="bold"/>` — logged as **§C61**, a §C58
  follow-on in the *renderer*.
- 🔴 **THE PHYSICS BASELINE IS DELIBERATELY NOT CAPTURED.** The tool's docstring forbids baselining a
  render known to contain a bug (*"or it blesses the bug"*), and §C61 is exactly that. ▶ **Fix §C61,
  re-render, then capture.** *(An empty `chapters: {}` file was written and then removed during
  diagnosis — an empty baseline is **worse than none**, because it looks captured while leaving the
  drift check inert.)*
- **Inject warnings, both PRE-EXISTING and neither caused by this run** *(checked, not assumed)*: physics has **15 unmapped math labels** across 7 modules (`net`, `app`, `tot`, `floor`, …) — it has **no glossary at all**; chemistry reports **76 exact untranslated-EN residues, all in `m68662`**, which is **not a pilot module** — no ch20 module appears in the residue report at all.
- **`attrMismatches` (M4's real check): none reported** on either book — the `{{term}}` → `[[term:…|id]]` attachment, 84% of the payload, came through clean.

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
