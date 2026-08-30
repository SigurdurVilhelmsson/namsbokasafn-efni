# Decision: the §C82 run's purpose is retiring the legacy dialect and its code — so the past-facing gates go advisory, the structural shake-out is free, and chapters ship one at a time

- **Date:** 2026-08-30
- **Status:** Accepted
- **Context owners:** lead (project owner); measurement by the pipeline session
- **Supersedes:** none — it *refocuses* work that `2026-08-22-editorial-work-survives-the-clean-break.md` and `2026-08-22-two-book-focus-and-publication-withdrawal.md` already scoped, and neither is reversed
- **Related:**
  - `docs/plans/2026-07-21-post-item17-followup-campaign.md` — §C82 (the run), §C79/§C110/§C111 (locks), §C89/§C115 (extraction defects)
  - `docs/plans/2026-08-23-clean-break-re-mt-runbook.md` — the ordered runbook
  - `docs/superpowers/plans/2026-08-24-c82-plan-b-check-battery.md` · `…-plan-c-driver-and-ledger.md`
  - `docs/superpowers/specs/2026-08-27-c82-ctx-loader-design.md`
  - `docs/decisions/2026-08-22-editorial-work-survives-the-clean-break.md`
  - `docs/plans/2026-08-30-glossary-term-review.md` — the [LEAD] review sheet this decision creates

> **FROZEN EVIDENCE — banner-dated 2026-08-30.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

The §C82 re-MT had accumulated a 33-check battery, an unbuilt loop driver with a ledger, a
[LEAD] decision queue, and weeks of loader hardening — while editing stayed **on hold**. The lead
asked whether the design was spending its effort in the right place:

> *"I have a feeling we keep spending effort on protecting or involving previous MT or edited
> versions. This is a clean run. We have a backup of the edits made."*

At stake: whether the remaining work was necessary, and how long editors would wait.

## Decision

**The run's purpose is structural, not qualitative:** get `02-mt-output` to clean CNXML and
retire the code that exists to handle the legacy dialect. **The acceptance criterion is never
having to re-run the MT.** Everything else follows from those two sentences:

- past-facing gates become **advisory**, never blocking;
- the structural shake-out is done **free**, over the whole corpus, before any spend;
- chapters are translated and released **one at a time**, in an order the lead sets.

## Reasoning

### The lead's instinct was right, and a frozen decision already agreed with it

`2026-08-22-editorial-work-survives-the-clean-break.md` had already ruled: overwrite
`02-mt-output` outright, re-apply the editorial work **by hand**, seg-id renumbering explicitly
accepted. Yet `E9`'s hand-edit leg — which refuses to proceed if any commit ever touched a
module's `02-mt-output` — was blocking the run on **220 of 220 units**, protecting exactly the
bytes that decision authorised overwriting. It also demands a diff-level classifier its own
docstring says cannot be built. **A gate was re-asking a question a human had already answered.**

### But only ~10% of the battery is past-facing, so the correction is surgical

Measured across the five check modules: **4 of 33 checks are past-facing (2 of 19 blocking)** —
`E9` legs `locked`/`handEdits`, `K3`, `E7`, `K1`. Everything else judges the new output or the
run's inputs. The waste was in the **blocking topology and the decision queue**, not in the check
code. Advisory rather than deletion was chosen because the `handEdits` **report is the artifact
that names which modules had prior hand work** — the input to re-applying it.

### The structural shake-out does not need paid translation, and that is where the time went

Every defect class that would force a re-MT is visible **without translating anything**: the
organic container-title defect was found by running extraction and comparing to source; the
chemistry note-title loss happens at inject; §C115, alt coverage, list drops and duplicate
seg-ids are all extract/inject-side. Tiers 0 and 1 of the battery are the **pre-MT** tiers by
design. So the loop is `01-source` → extract → inject → compare, over **all 491 modules at
0 ISK**, repeated until dry — 100% coverage rather than a sample. Paid MT is needed for exactly
two questions: **glossary behaviour on real text**, and **marker survival through
`/v1/translate/tasks`** (which carries most wire volume and has no marker-survival evidence).

### "The re-MT" was one word for two different jobs, and that hid the shape of the work

| | chemistry `efnafraedi-2e` | organic `lifraen-efnafraedi` |
|---|---|---|
| CNXML source modules | 149 | 342 |
| prose modules extracted | 149 | **17** (the ch03/ch12 preview) |
| legacy `{{i}}`-family markers in the Icelandic | **5,442 in 113 of 170 files** | **0** |
| exercises bundles | none exist | all 31 chapters, already MT'd, clean |

Chemistry is a **re**-run carrying all the legacy debt. Organic is a **first** run that is already
clean. They are independent and need not share a schedule.

### Chapter-at-a-time removes the driver from the critical path

`tools/api-translate.js` already takes `--book`/`--chapter`/`--module`. Releasing a chapter at a
time therefore gives natural checkpoints, resumability (a chapter finished or it did not), and
the lead's own release order — **without** the unbuilt `tools/remt-loop.js`, its ledger, or the
resume mechanism whose absence a review had flagged as a risk. A chemistry chapter costs roughly **1,100–1,700 ISK** (ch15, the first the
lead wants, is **1,129**), against a book total of **35,257** and an approved ceiling of 65,583 —
small enough that re-buying a chapter is insurance rather than a budget event.
⚠️ **These are the tool's own `--force --dry-run` figures.** A hand count that strips SEG markers
before measuring comes out ~25% LOW, because the markers are billed with the file; that error was
made and corrected on 2026-08-30. **Price a chapter with the tool, never with a character count.**

### The bin test needed three clauses, not one

The first formulation — *does the Icelandic text exist?* — mis-sorts, because `api-translate`'s
skip unit is the **module**: any defect whose fix touches extraction forces re-buying the whole
module regardless of whether text exists. The test is a conjunction: **(1) does Icelandic text
exist, (2) does a segment SLOT exist to carry it, (3) can the fix be applied without
re-extracting.** A third category exists that neither bin had: **defects the editor sees as
correct and cannot fix** — the worked example being chemistry note-titles that read perfectly in
the editor while inject discards them.

### One extractor with a shape table, because the axis is not the book

Organic is print-first — donated to OpenStax and converted — and its ids show it: **0 `fs-id`s
and 8,563 sequential ids**, against chemistry's 20,688 `fs-id`s. That invited a second extractor.
**Measurement refused it:** physics has organic's `<example><title>` shape (**289 of 289**) while
using chemistry's id style, and the other title shapes are distributed across the five books
independently of both. So the rule is stated as a **shape**, not a book: *a `<title>` that is a
direct child of a container element is extracted, keyed on the container's own id.* Chemistry's
**0 of 1,906** title drops is the control proving such a change cannot regress it.

### Missing segments are an extraction problem, not an editor feature

"Insert a missing segment in the editor" is blocked at three layers — but by the **generated**
`02-structure/` + `02-for-mt/` pair, not by licensed `01-source/`. Re-extraction supplies the
segment for free. Building an insertion path would have meant inventing an id the injector
special-cases, which the standing CNXML rule below forbids.

## Consequences

- **Commits the project to** a free full-corpus extract/inject loop before any spend; a short
  pre-run fix list (the organic title defect, the glossary); then chapter-at-a-time translation
  and release in the lead's order.
- **Forecloses** an unattended whole-corpus run for now. Reversing that costs building the driver
  and its ledger — the work exists on an unmerged branch, so the cost is finishing it, not
  starting it.
- **Downgrades, does not delete,** the past-facing gates. Restoring them to blocking is a one-line
  change per leg; the reasoning for why that would be wrong is in this record.
- **Creates** the [LEAD] glossary review at `docs/plans/2026-08-30-glossary-term-review.md`, which
  gates the first paid chapter.
- **Dissolves** two owed [LEAD] decisions: `E9`'s money gate (the gate goes advisory) and
  `costBand` (per-chapter `--dry-run` bounds the spend instead).
- **Follow-up work is tracked in the active register**, not here.

## Alternatives considered

1. **Delete the past-facing gates outright** — rejected: the `handEdits` report is the only thing
   that will name which modules carried prior hand work, which is exactly what re-application
   needs. Advisory keeps the signal and removes the block.
2. **Complete runbook L3's manual triage into a committed allowlist, keeping `E9` blocking** —
   rejected: it costs real hours to re-decide a question the 2026-08-22 decision already settled,
   and the runbook's own step 4.2 records that sweep as already performed.
3. **Buy a stratified paid sample to shake out structural defects** — rejected once it was
   measured that structural defects are visible at extract/inject with no translation at all. A
   paid sample buys 100% coverage of nothing the free loop misses, except the two genuinely
   MT-dependent questions.
4. **Two extractors, one per CNXML "format"** — rejected by measurement: physics straddles the
   proposed boundary, so the split would have needed a third extractor within a week.
5. **Convert the legacy markers in place instead of re-translating chemistry** — rejected: the
   legacy dialect had known loss, so conversion cannot recover markers that are already missing;
   `*emphasis*`, `~sub~` and `^sup^` are ambiguous with prose and formulas; and it would not
   create the segments that extraction fixes have since made extractable.
