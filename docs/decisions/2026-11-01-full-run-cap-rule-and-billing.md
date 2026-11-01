# Decision: the full AI run checks its spend after each chapter, falls back to high if the cap refuses one, and is paid privately in November

- **Date:** 2026-11-01
- **Status:** Accepted
- **Context owners:** [USER] (both answers, 2026-11-01, choosing from options that carried Claude's
  recommendation); [CODE] (the projection and this record)
- **Supersedes:** `docs/decisions/2026-11-01-ai-term-pass-full-run-at-xhigh.md`, in part.
  - **Superseded:** the consequence of its second fallback trigger. A projected crossing of the cap now pauses
    the run for [USER]'s choice, with high among the options, instead of falling back to high automatically.
  - **Added:** when the projection is taken (after each chapter), and what happens if the cap itself refuses a
    chapter.
  - **Still in force:** the rest of that record, its truncation trigger included.

  It also answers the 2026-10-28 register entry's open items (e) and (f).
- **Related:**
  - `docs/decisions/2026-10-27-ai-layer-pilot-before-s-full-run-after-prereg.md` (the cap as a technical guard;
    the full run paid privately);
  - `docs/decisions/2026-10-28-ai-term-pass-as-editor-suggestions.md` (units without suggestions);
  - `docs/decisions/2026-11-01-ai-term-pass-prompt-freeze.md` (the frozen inputs the projection plans);
  - `experiments/ai-review-pilot/full-run-cap-2026-11-01/` (the projection, its inputs and its control);
  - `CAP_USD` in `tools/ai-review/config.js` and its test, `tools/__tests__/ai-review-config.test.js`;
  - the active register; the private funding companion in the git-excluded `docs/grants/` (billing details).

> **FROZEN EVIDENCE — banner-dated 2026-11-01.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

The 2026-10-28 register entry left two items open for [USER]:
- **(e) A rule for a run the cap cuts short.** The dropped pre-registration was to hold it, and the effort
  record's fallback covers only a projected crossing.
- **(f) Which subscription period the full run draws on,** and how the reports present it.

At stake:
- (e): which chapters get suggestions if spend runs high, and whether a cut is decided in advance or in the moment;
- (f): whether the full run stays private, as the 2026-10-27 record ruled.

## Decision

**(e) The cap stays at USD 100.** The full run sends one chapter per command, in batch:
1. **A check after each chapter.** When a chapter settles, re-run the projection
   (`experiments/ai-review-pilot/full-run-cap-2026-11-01/cap_projection.py`) with the cost ratio the full run has
   shown so far. If it says the cap would refuse a later chapter, the run pauses. [USER] then chooses, before the
   next chapter is sent: continue at high, raise the cap through a new record, or stop.
2. **The fallback.** If the cap refuses a chapter anyway, that chapter and every one after it run at high with
   `--max-tokens 16000`, the effort record's fallback. If the cap refuses a chapter at high too, the run stops
   there.
3. **Chapters the run does not reach** open on pure MT without suggestions. The 2026-10-28 record already provides
   for this, for any unit opened before its run. The register lists them.
4. **The order.** Chapters run in the order editors are expected to open them, or in book order where none is set,
   so that a cut falls on the units opened last.

**(f) [USER] pays the November period of the subscription personally.** The full run's usage draws on that
period, so the run is private and outside both grants, as the 2026-10-27 record ruled. The reports give the run's
cost as the list-price cost of each call in its run records, and the methods say how the usage was billed. Billing
details are in the private companion.

## Reasoning

### The cap is unlikely to bind
The projection (`projection-2026-11-01.json`) models each chapter as one batch. It reserves the plan's worst case
times a reservation factor, and it settles at that reservation times a cost ratio. Both factors come from the
2026-11-01 ch10 re-run in the ledger. Before the run:
- USD 21.15 is settled, leaving USD 78.85 of headroom;
- the expected spend for the 23 chapters at xhigh is USD 43.1, which would leave USD 35.75;
- in book order, the cap first refuses a chapter only if spend runs at 1.66× the expected rate (about USD 72),
  and then only ch21;
- with the high fallback, the first refusal moves to 1.78×: ch20 switches to high and ch21 is refused.

A cut falls between chapters, never inside one. A batch reserves its whole worst case before sending, and the
ledger refuses a reservation that would cross the cap without writing anything (`reserve` in
`tools/ai-review/ledger.js`).

### Why a check after each chapter
- **The factors come from ch10 alone,** and xhigh's output length varies by chapter.
- **High spend shows early.** Spend 66% above the estimate would show in the first chapters' cost ratio, long
  before the end. So the check gives [USER] the choice while every option is still open, instead of meeting a
  refusal at the last chapter.
- **It needs no new mechanism.** Batches already run one chapter at a time, because each reserves its whole worst
  case.

### Why high is the fallback, and the cap stays
- **High is the effort record's fallback.** At 16,000 output tokens it roughly halves a chapter's worst case
  (ch21: USD 10.15 → 5.67 in the plans), and on ch10 it cost about 13% less than xhigh.
- **The cap is the technical guard** the 2026-10-27 record set over the pilot and the private run. Raising it would
  remove the risk of a cut, and with it the guard against a run whose costs go wrong. The check shows that
  trade-off at the point where it matters, and a raise stays possible through a new record.

### Why the editors' order
Running the largest chapters first would move the first refusal only a little (1.75× against 1.66×). A cut costs
suggestions in the units it reaches last. Ordering by when editors open units makes those the units editors reach
last, which matters more.

### (f): the subscription and the S boundary
- The run's usage draws on [USER]'s Claude subscription, which the current grant has paid (register, 2026-10-28
  entry). The pilot fell in such periods, as the 2026-10-27 record intended: its decision 1 has the pilot "paid by
  the current grant as preparation".
- The API key expires on 27 November, so the full run falls in November.
- The 2026-10-27 record has the full run paid privately, outside both grants. [USER] paying the November period
  keeps both records true, and changes neither.

### Checked against the tree, and not
**Checked:**
- the projection reproduces from committed inputs, and the figures above are its output;
- its control: with the cost ratio forced to 0.5, it predicts a refusal below the expected spend;
- the ledger's settled total, USD 21.15;
- that the cap refuses rather than writes, and that no caller can raise it above `CAP_USD` (`validCap` in
  `tools/ai-review/ledger.js`).

**Not checked:** the subscription's billing dates. So this record does not establish whether the 2026-11-01 ch10
re-run (USD 7.13 at list price, made on 1 November) falls in the period [USER] pays. That is [USER]'s to confirm,
and the register tracks it.

## Consequences

- **The run procedure:** `run --chapter chNN --mode batch --yes`, one chapter at a time, with the projection after
  each. The order and each check are recorded in the register on the day.
- **One run may hold two efforts.** Each chapter's run record carries its effort. If the fallback fires, the
  reports and the short look split by effort.
- **No code change.** `CAP_USD` stays at 100, pinned by its test, and raising it needs a new record.
- **The full run is in neither grant's columns.** Its research cost is the list price in its run records, and the
  methods explain the billing.
- **The ch10 re-buy is still open** (register). Leaving ch10 out lowers the expected spend by about USD 4 and the
  largest reservation by USD 20.5; the projection takes it with `--order`.
- **The key expires on 27 November.** The run must finish by then, or it needs a new key.

## Alternatives considered

For (e):
1. **Stop at the cut and decide then.** Not chosen: it decides in the moment rather than on evidence beforehand.
   Stopping remains the rule's last step.
2. **Raise the cap now** (for example to USD 150). Not chosen: it removes the guard, and the check makes a raise
   unnecessary unless spend runs high.
3. **The high fallback without the check.** Not chosen: [USER] would first hear of high spend from a refusal at the
   end of the run.
4. **Largest chapters first.** Not chosen: see the editors' order above.

For (f):
1. **A separate key billed to [USER]'s own card,** used only for the full run. Not chosen: [USER] pays November
   anyway, so it would only add setup.
2. **Draw on a grant-paid period.** Rejected: it contradicts the 2026-10-27 record, and the current grant would pay
   for work after S.
