# Decision: the follow-on project's start (S) stays 1 November 2026, as tagged, although the current grant's final report comes later in November; the plan's gap rule governs the time between them

- **Date:** 2026-11-08
- **Status:** Accepted
- **Context owners:** [USER] (the decision and its three reasons, 2026-11-08). Claude wrote this record from [USER]'s answers.
- **Supersedes:** the slip-case answer in `docs/decisions/2026-10-11-chemistry-finish-prep-follow-up-answers.md` (*"If final report slips, the start date moves"*, read there as "S stays the day after the current grant's final report"), and the consequence that record drew from it, *"Forecloses: a fixed S that is independent of the report"*. Every other answer in that record stands. The S date in `docs/decisions/2026-10-11-chemistry-finish-preparation-answers.md` (D0, S = 2026-11-01) stands.
- **Related:** `docs/plans/2026-10-10-chemistry-finish-preparation-plan.md` (§1 point 0, §5, §8 D0) · `docs/decisions/2026-10-11-chemistry-finish-preparation-answers.md` (D0, "one boundary instead of two") · `docs/decisions/2026-10-11-chemistry-finish-prep-follow-up-answers.md` · the active register `docs/plans/2026-07-21-post-item17-followup-campaign.md` (its 2026-11-08 entries) · the private funding companion in the git-excluded `docs/grants/` (pointer only; this repository is public)

> **FROZEN EVIDENCE — banner-dated 2026-11-08.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

On 2026-10-11 [USER] set S, the follow-on project's start, to 1 November 2026: the day after the
current grant's final report, then planned for 31 October. The follow-up answers the same day added
a slip rule: if the report slips, S moves with it. That kept S and the report as **one edge**, which
the first record's D0 reasoning calls "one boundary instead of two".

On 2026-11-08 [USER] recorded that the final report has no official deadline, and that [USER] aims
to finish it in November. The report was not delivered on 31 October. By then S had already been
treated as 1 November: both repositories carry the tag `s-2026-11-01`, created on 1 November.

**The question:** does S move to the day after the report, as the slip rule says, or stay
1 November?

What was at stake:
- which grant each hour and each bill in November belongs to;
- the start of the follow-on's 12 months, and of everything the plan counts from S (the freeze and
  the plan's §5 calendar);
- the follow-on application's promise, quoted in the plan's §1 point 0, that lemmatization and the
  proofreading begin only after the current grant's project ends.

## Decision

**S stays 1 November 2026, as tagged** ([USER], 2026-11-08). The final report follows in November.

From 1 November until the report, the plan's rule for a report and S that do not coincide governs:
- no hour and no bill is charged to both grants;
- nothing the current grant pays counts as follow-on in-kind;
- lemmatization work and the proofreading begin only after the report, as well as after the freeze.

## Reasoning

[USER] gave three reasons.

### Work already started on 1 November

Both repositories were tagged on 1 November, and follow-on work has run since. Moving S would
re-date work already done under it.

Checked against the tree: the tag `s-2026-11-01` exists in this repository (created 2026-11-01, at
`1ed5152f0`) and in the reader repository (created 2026-11-01). Which work since then counts against
which grant was not checked here; that mapping is private.

### The report has no official deadline

Tying S to a date with no deadline would leave the follow-on's 12-month calendar without a fixed
start, and with it everything the plan counts from S.

Checked: the plan's §1 point 0 shows the current grant's terms setting its project's end at
30 June 2026, and the remainder in use until the report. The deadline fact itself is [USER]'s,
recorded in the register on 2026-11-08; it was not checked against any document in this repository.

### The gap rule already keeps the two grants apart

The slip rule existed to keep a single funding edge. The plan already carries the rule for when the
edge splits. Its §5, verbatim: *"If the report and S cannot coincide, no hour may be charged to both
grants, and nothing the current grant pays may count as follow-on in-kind."* With that rule in
force, the two grants' accounts stay apart without moving S. Checked: that sentence is in the plan
as quoted.

### What the old reasoning took for granted

Under the 2026-10-11 reasoning, "after S" meant "after the current grant's project", because S was
the day after the report. The plan's §5 relies on that: *"Lemmatization work and the proofreading
itself start after S, at the freeze, as the follow-on application promises."* With S before the
report, "after S" no longer implies "after the current project". So the application's promise is
kept only if that work also waits for the report. The report is aimed at November and the freeze
lands around 29 November to 6 December (plan §5), so the two may fall close together. Which comes
first is not known on this date.

## Consequences

- **S = 2026-11-01 is fixed, and the report no longer moves it.** The plan's calendar keeps counting
  from 1 November.
- **There are two edges instead of one:** S on 1 November, and the final report later in November.
  Between them:
  - each hour and each bill goes to one grant only;
  - what remains of the current grant may still pay, since the plan records it as in use until the
    report, but nothing it pays counts as follow-on in-kind;
  - lemmatization work and the proofreading wait for both the freeze and the report.
- **No new message to the follow-on grant's administrator.** They were told 1 November in writing.
- **Forecloses:** moving S to the report. Reversing that needs a new record, and it would re-date the
  work done since 1 November.
- **Follow-up:** where the gap's hours and bills are recorded is the private companion's business.
  This record points to it and never restates it. The report's progress, and anything left to do,
  live in the active register, never here.

## Alternatives considered

1. **S moves to the day after the report**, as the 2026-10-11 slip rule says. Rejected. It would
   re-date work done since the tag, and with no official report deadline it leaves the follow-on's
   start open-ended. Its one benefit, a single funding edge, is already secured by the gap rule.
