# Decision: a one-chapter AI-layer pilot before S on the current grant; the full term-pass run after the D7 pre-registration, paid privately

- **Date:** 2026-10-27
- **Status:** Partly superseded by `docs/decisions/2026-10-28-ai-term-pass-as-editor-suggestions.md` (decision 2's first condition, the D7 pre-registration, and the consequences that follow from it; its third condition, the run before the first unit opens, relaxed to per-unit eligibility)
- **Context owners:** [USER] (decided 2026-10-27, after a read-only review of the plan, the AI pass and both grants)
- **Supersedes:** `docs/decisions/2026-10-26-pre-s-week-ai-layer-answers.md`, in part: its decision **3** ("A1 =
  reordered": the full run before S, the blind check after S), and decision **1** insofar as it had the current grant
  pay for the *full* run. Its transport, cap, D5, D6 and committed-logs decisions stand.
- **Related:**
  - `docs/plans/2026-10-26-pre-s-week-plan.md` (§1 points 4–5, §2 Tier 1 items 5–7, §3, §4, §5 A1 and A2, §8);
  - `docs/plans/2026-10-10-chemistry-finish-preparation-plan.md` (§1 point 0's cut-down path, 3.4, §7 D7);
  - `docs/plans/2026-10-23-skerfur-development-plan.md` (§3.1 G1.1, G1.8, G1.9; §4.3; §7's Month 1 row);
  - the active register's ⏩ RESUME block;
  - the private review of 2026-10-27 in the git-excluded `docs/grants/`.

> **FROZEN EVIDENCE — banner-dated 2026-10-27.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

On 2026-10-26 the full AI term-pass run was moved before S (1 November 2026), ahead of [USER]'s blind check ("A1
reordered"), because from S no grant pays for an API call. On 2026-10-27 [USER] offered to pay that run privately.
Should the full run still happen before S, or should only a pilot run before S, with the full run after the research
design is settled?

At stake:
- research integrity: the control draw (D7) relative to layer 2 existing for every unit;
- the quality of a prompt frozen in a week of runner fixes;
- the schedule;
- [USER]'s time in the week of the current grant's final report;
- who pays for what, and how each grant's report describes it.

## Decision

1. **Before S:** a **one-chapter pilot** of the term pass, paid by the current grant as preparation.
2. **After S:** the **full term-pass run**, once three things exist:
   - the D7 pre-registration is committed;
   - the prompt is frozen;
   - the run lands before the first unit is opened.

   **[USER] pays for the full run privately.** Its cost stays outside both grants' cost and in-kind columns.

## Reasoning

### The only reason the 26 Oct record gave for the reorder was funding
Its reasoning reads: "After S the full run has no payer, while [USER]'s check is time, not money". Its alternative 4,
"pilot only before S (the full run after the check, unfunded)", was "Not chosen, for the reasons above". [USER]'s
offer to pay privately removes that reason.

**The stake is small.** The term pass as built makes 591 requests (`term-pass.js plan --all`, 0 ISK, measured
2026-10-27). Its worst-case reservation is USD 118.25 as batches and USD 236.43 interactive. Those figures are
dominated by the `max_tokens` bound, not by expected spend. The private review's cost model puts realistic spend at
about USD 24–36 as batches and USD 65 interactive. That is modelled from list prices, with thinking tokens assumed
until a pilot measures them.

### The control draw must be fixed before layer 2 exists for every unit
**What goes wrong if the run comes first.** A full run before D7 is decided produces layer 2, with public logs, for
every unit before:
- chapter assignment (G1.13);
- a defined stratifier ("drift tercile" is defined nowhere);
- named pilot exclusions;
- an exact n (the plans say "10–15").

**Why the seed hash is not enough.** G1.9's committed seed hash does not protect inputs that are still being set. A
pre-registration committed first, with a seed from a future public randomness beacon, does.

**The design question this opens.** The review found that a 10–15-unit control arm cannot detect the effect a
terminology pass plausibly has, while randomising inside units (by segment or by ruling) can. That choice belongs in
the pre-registration, not in this record.

### A pre-S full run would have frozen known prompt and runner issues
**Runner fixes were still landing.** The runner had two adversarial reviews and 22 fix commits on 2026-10-27.

**The prompt had open issues.** When last checked (`c72ff3ebe`), two issues the review found were open:
- the prompt says "the segments around a segment are its context", while only about 40 % of consecutive presented
  segments are adjacent in the module;
- seven ruled targets cannot match because of a trailing parenthetical, among them *heat → varmi (q)*, with 806
  English occurrences.

### The schedule before S could not carry the full run safely
- **No key yet.** No `ANTHROPIC_API_KEY` was configured in the repository's environment files or the shell on
  2026-10-27 (counted, never printed).
- **The book runs as 23 chapter batches in sequence.** One batch for the whole book cannot fit the USD 100 cap, and a
  batch "usually" completes within an hour but may take up to 24.
- **[USER]'s week also holds the current grant's final report.**

### What one chapter can and cannot show
**It can show:**
- the cost per request, and thinking tokens (mean, p95, max) at medium and high effort;
- the truncation rate;
- the gate's acceptance rate and flag rates;
- a first look at the term edits.

**It cannot show whether the pass saves editors time.** That needs editors working, the follow-on's timing capture
(B1), and a comparison inside units.

**The pilot is not evaluation data.** It drives prompt revision, and its output is seen unblinded. So it is excluded
from the blind-check sample and from the control frame.

### Checked against the tree, and not
**Checked:**
- the API-key absence;
- the `plan --all` census;
- the 26 Oct record's wording;
- that the follow-on plan's §7 Month 1 row already lists the full AI run (the pre-S plan's amendment A2 had moved it
  into the week before S).

**Not checked:** how [USER]'s Anthropic account bills (prepaid credit or invoice). That decides when the pilot's charge
reaches the current grant's books.

## Consequences

- **The current grant pays for the AI layer's build and the pilot only.** Its final report describes the layer as
  built and piloted machine post-processing, never as review or *yfirlestur*.
- **The full run's cost is private** and outside both grants' columns. It is disclosed to the follow-on's fund as a
  separate, privately paid research condition, with pure MT kept and B1 reporting distance from both layers.
- **The full run returns to month 1**, as the follow-on plan's §7 originally had it. Month 1 also carries:
  - B1's build;
  - the layer-2 delivery code;
  - D7, D12 and D13;
  - the editors' consent;
  - B2's spike.

  Its load rises.
- **Before the full run:**
  - the D7 pre-registration, pushed or mirrored for a trustworthy timestamp. It covers the design, the control
    condition, the frame, n, the stratifier, a future-beacon seed, the estimand, a rule for a run the cap cuts short,
    a frozen blind-check procedure with a second rater, and a value-and-kill rule;
  - the prompt fixes and the freeze;
  - the pilot chapter, named before its output is read and kept out of the evaluation sample.
- **3.4's strict order is available again:** a 20-per-category blind look before the full run, so categories the check
  drops are not paid for. Whether to use it is [USER]'s call, settled in the pre-registration.
- **B3 overlaps more visibly** now that the full run falls in the follow-on period. B3 propagates term decisions in
  inflected forms, so the fence must be stated:
  - B3 claims no hours for the pass or for porting its gate or lexicon;
  - AI-derived forms carry the origin `ai-pass`;
  - B3's evaluation set is post-S rulings plus withheld or control rulings.
- **Unchanged from 26 Oct:**
  - the transport (the Anthropic API with a key);
  - the harness's USD 100 cap, a per-ledger technical guard that now spans the pilot and the private run;
  - D5 and D6;
  - committing the request/response logs.
- **Reversibility.**
  - Until S, a pre-S full run remains possible.
  - After S, the run is private whatever is chosen.
  - If the pilot fails its check, the existing slip rule applies: freeze with the rule layer only. No full-run money
    has then been spent.
- **Follow-up** is tracked in the active register, not here.

## Alternatives considered

1. **Keep "A1 reordered"** (the full run before S on the current grant). Rejected: its one advantage, funding, is gone.
   It would have forced the pre-registration into the report week, frozen a prompt with known issues, and carried the
   schedule risk of a missing key and 23 sequential batches.
2. **The strict order before S** (a 20-per-category blind look, then the full run, all before S). Rejected: the same
   schedule pressure, plus about 30 minutes of [USER]'s time in the report week.
3. **No full run at all** (rule layer only). Not chosen now. It remains the slip rule's fallback, for example if the
   pilot shows a meaning-changing edit in the `term` category, or if measured thinking tokens would push even a batch
   run over the cap.
4. **The full run after S, paid by the follow-on grant.** Not possible. The follow-on grant pays no non-labour cost,
   and its in-kind other costs cover hosting and facilities only, so adding an API line would need its fund's written
   agreement.
