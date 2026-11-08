# Decision: four chemistry sync-path answers — the 1.7 tie meets 1.8's reading leg; §C206's checks and "pass"; whole-book release; machine-only front-page credit

- **Date:** 2026-11-08
- **Status:** Accepted
- **Context owners:** [USER] (answered 2026-11-08, one question at a time, on the evidence below; the questions came from a read-only scan of the register, re-checked line by line)
- **Supersedes:** none. It applies `docs/decisions/2026-09-16-chapters-prepared-sync-timed-by-classroom-use.md` (which allows either a whole-book or a staged sync) to the next chemistry sync.
- **Related:**
  - `docs/plans/2026-10-10-chemistry-finish-preparation-plan.md` (1.7, 1.8, §2's Open list, D9, D14, 4.5, 4.6);
  - `docs/plans/2026-10-23-skerfur-development-plan.md` §5 (the chapter hold-back and the front-page claim);
  - `docs/plans/2026-10-26-pre-s-week-plan.md` (the reader items that wait on these answers);
  - the active register's §C206, §C142 and its 2026-10-25 (night) sync-readiness entry;
  - vefur `src/routes/+page.svelte` (the front-page line) and `src/lib/data/bookCredits.ts` (`MACHINE_TRANSLATION_CREDIT` and the credit rule).

> **FROZEN EVIDENCE — banner-dated 2026-11-08.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

The 1.8 publication criterion, adopted 2026-10-11, has four legs: ruled-term consistency at least equal to the live site; no reading-quality regression in 1.7; the free QC checks pass; [USER]'s preview has no blocking note. The register's 2026-10-25 sync-readiness check found that two legs could not be judged as written, and that two more things on the release path waited on [USER]:

1. Does the 1.7 masked test's tie meet the reading leg? No document said.
2. For the QC leg (§C206): which free checks count, and what does "pass" mean while the render-fidelity baseline is stale?
3. §C142: release the whole book at the next chemistry sync, or hold back the chapters in classroom use?
4. The reader's front-page line, "Vélþýtt og yfirlesið af starfandi raungreinakennurum.", claims proofreading. What should it say?

## Decision

1. **The 1.7 tie meets 1.8's "no reading-quality regression" leg** for the September base.
2. **§C206:**
   - **The checks that count** are the ones that read the pages readers get: the render-fidelity check (`npm run fidelity:render`, `tools/cnxml-render-fidelity-check.js`), `tools/audit-render-output.js`, `tools/audit-equation-notation.js`, the §C82 battery's output tier (`tools/lib/remt-checks-output.js`), and plan 4.5's marker census (no raw `[[` in any page).
   - **"Pass"**: on the 4.5 rebuild, each of the 15 render-fidelity findings is judged, fixed or accepted as an intended render change, and one whole-book baseline is captured in a single `--update-baseline` run (all chapter keys, never per chapter). Then every counted check exits 0, with any remaining finding judged and recorded.
3. **§C142: the next chemistry sync releases the whole book at once.** No chapter is held back, so no hold-back mechanism is built.
4. **The front-page credit becomes "Íslensk vélþýðing (Erlendur, Miðeind)"**, the reader's existing `MACHINE_TRANSLATION_CREDIT`. vefur makes the edit.

## Reasoning

### 1. A tie is not a regression

- The result (`experiments/terminology-consistency/results/2026-10-25/masked-test-result.json`): 150 pairs answered, **June 66, September 66, equal 5, both wrong 13**; 132 decisive. The override needed 80 June wins and did not fire, and the masking held.
- With the 48 flagged pairs excluded, **September leads 48 to 45** of 93 decisive pairs. Neither cut shows the September MT reading worse.
- "No regression" asks whether quality fell, not whether it rose, so equal reading quality meets it. This answers only the reading leg; the other three legs are judged on their own.

### 2. Count the checks that see the pages readers get

- CLAUDE.md records that `render-oracle-check` and `source-roundtrip-check` extract, inject and render the module's own English in memory, so they test the pipeline code and cannot see a defect in prepared pages. 1.8 asks about the pages a sync would publish, so the counted checks are the ones that read that tree.
- The render-fidelity baseline (`books/efnafraedi-2e/render-fidelity-baseline.json`) dates from 2026-07-10 and has keys for ch10–ch21 and the appendices only. A "no new findings against July" rule would leave ch00–ch09 unchecked and the 15 findings unjudged. §C206 proposed judging them against the rebuilt tree and re-baselining once; that is what was chosen. Re-baselining per chapter is ruled out because `--update-baseline` overwrites rather than merges (§C60).

### 3. Whole-book release

- The 2026-09-16 decision lets [USER] time the sync and allows holding back chapters in classroom use. The sync publishes whole books (§C142, measured 2026-09-16), so a staged release needs a hold-back mechanism first: a released-chapters list in vefur, a staging split in efni, or a no-code rule that does not hold against an editor's click.
- [USER] chose to release the whole book at once. Nothing has to be built, and the release does not wait on a list of chapters in classroom use.
- The cost, stated when choosing: students using a chapter this semester will see its text change mid-course.

### 4. Credit only what has happened

- vefur's own rule (`bookCredits.ts`): "We never claim yfirlestur where it has not happened." After the next sync no chemistry chapter is reviewed: the four June "reviewed" pages lose that flag, because chemistry's faithful track was retired (#535).
- `MACHINE_TRANSLATION_CREDIT` is the reader's single source of truth for machine-only credit, so the front page and the book pages cannot drift. The alternative already in a code comment beside the line ("…og ritstýrt af kennurum með fagþekkingu") claims editing that has not happened either.
- The line can change again once reviewed chapters reach the reader. The follow-on project's credit sentence is a separate matter and lives in the private funding companion.

### Checked against the tree

- **Checked:** the 1.7 tallies (read from the result file); every tool path named in decision 2 exists, and `npm run fidelity:render` is wired in `package.json`; the baseline file exists; vefur's constant, its credit rule, and the front-page line (vefur `origin/main`).
- **Not checked:** the 15 render-fidelity findings themselves. Judging them is 4.5's work.

## Consequences

- 1.8's reading leg is met for the September base. The criterion is still unmet until the term-consistency leg, the QC leg (on the 4.5 rebuild) and [USER]'s preview are judged; the register owns that status.
- The 4.5 rebuild's QC has a definite list of checks and a definite meaning for "pass", including one whole-book render-fidelity baseline captured from it.
- The Skerfur plan's "build the hold-back in month 1, if staged" lapses for this sync. A later staged release (for example of reviewed chapters) would be a new decision and would need the mechanism then.
- The front-page edit is vefur's, before the next chemistry sync.
- **Reversal:** answer 1 or 2 can be revised by a new record before 4.5's QC is judged. Answer 3 is reversible until the sync runs; after it, the published state is what readers have. Answer 4 is one line in vefur.

## Alternatives considered

1. **Re-test reading quality on the rebuilt tree** before counting the leg. Not chosen: the test was run as pre-registered, the masking held, and a tie shows no regression.
2. **Only the render-fidelity check** for the QC leg. Not chosen: it covers only the chapters its baseline has, and the other prepared-page checks each look for defects it was not built to find.
3. **All free checks, including render-oracle-check and source-roundtrip-check.** Not chosen: those test the pipeline on the source in memory, not the prepared pages.
4. **"Pass" means no new findings against the July baseline.** Not chosen: it leaves ch00–ch09 unchecked and the 15 findings unjudged.
5. **A staged release, holding back chapters in classroom use until mid-December.** Not chosen: it needs a mechanism built first and a list of chapters in use.
6. **The commented alternative tagline** ("…og ritstýrt af kennurum með fagþekkingu"). Not chosen: it claims editing that has not happened.
