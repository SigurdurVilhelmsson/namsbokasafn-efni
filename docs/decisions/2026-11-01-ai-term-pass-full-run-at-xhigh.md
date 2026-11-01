# Decision: the AI term pass's full run uses xhigh effort, with high as its fallback

- **Date:** 2026-11-01
- **Status:** Accepted
- **Context owners:** [USER] (ruled 2026-11-01, after the paid ch10 re-run and its blind check)
- **Supersedes:** `docs/decisions/2026-10-28-ai-term-pass-as-editor-suggestions.md`, in part: its decision **5**
  ("The full run uses `claude-opus-5-5` at high effort. The pilot's medium arm is a fallback …"). The model stands.
  The effort becomes xhigh, and the fallback becomes high, under decision 5's two triggers unchanged. Everything else in
  that record stands.
- **Related:**
  - the active register's 2026-11-01 (ch10 re-run) and 2026-10-29 entries, in
    `docs/plans/2026-07-21-post-item17-followup-campaign.md`;
  - `experiments/ai-review-pilot/ch10-2026-11-01/blind-high-vs-xhigh.json` and
    `experiments/ai-review-pilot/ch10-2026-10-29/` (the two blind checks);
  - `docs/plans/2026-10-26-pre-s-week-plan.md` (§5 A1) and `docs/plans/2026-10-23-skerfur-development-plan.md`, which
    cite the 2026-10-28 record for the full run;
  - `tools/ai-review/term-pass.js` (`DEFAULT_EFFORT`, `DEFAULT_MAX_TOKENS`) and its test
    `tools/__tests__/ai-review-term-pass.test.js`.

> **FROZEN EVIDENCE — banner-dated 2026-11-01.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

Which reasoning effort should the AI term pass's full chemistry run use: high, as the 2026-10-28 record ruled, or
xhigh, which [USER] preferred in both blind checks on ch10? The answer sets the quality of every suggestion editors see
from the run, its cost under the runner's cap, and its output-token limit.

## Decision

The full run uses `claude-opus-5-5` at **xhigh** effort, in batch mode, with an output limit large enough that no
answer is cut off (32,000 tokens was enough on ch10). If xhigh truncates responses or the projected run would cross the
runner's cap, the run falls back to **high**.

## Reasoning

### [USER] preferred xhigh in both blind checks
- 2026-10-29 pilot (prompt v1, interactive): xhigh preferred on 6 of 9 final-text differences, with 17 truncated xhigh
  segments excluded.
- 2026-11-01 re-run (prompt v2, the 2026-11-01 ruling set, batch): xhigh preferred on 11 of 16, with nothing excluded.
  On the 12 segments where one side followed the ruling set, [USER] chose that side every time, xhigh on 9 of them.
- The two runs differ in prompt, ruling set and mode, so the second does not replicate the first exactly. Within each
  run, high against xhigh is a clean comparison, and both point the same way (67% and 69%).
- Both checks used one chapter, ch10. This is a limit of the evidence, accepted below (alternative 2).

### The 2026-10-29 conditions are met
On 2026-10-29 [USER] said the extra cost was acceptable *if xhigh is clearly better and the truncation is handled*.
- Better: the two blind checks above.
- Truncation: in batch mode with `--max-tokens 32000`, 0 of 55 xhigh answers were cut off (output-token maximum 20,510;
  two answers went over the pilot's 16,000).

### The cost difference is small
- ch10 in batch: high USD 3.32, xhigh USD 3.81 (the runner's ledger).
- Scaled by ch10's share of the book's planned input tokens (521,615 of 5,950,374, from the free whole-book `plan`):
  about USD 38 at high and USD 44 at xhigh for the whole book. This is a one-chapter extrapolation; xhigh's output
  length varies by chapter.
- Both fit under the runner's cap with the ledger as it stood on 2026-11-01 (USD 78.85 left). A batch reserves its
  chapter's worst case, and the largest at `--max-tokens 32000` is ch10's USD 19.90, so chapters run one at a time.
- The 2026-10-28 record weighed editor time above the modelled difference in spend. A difference of about USD 6 for
  the book does not change that weighting.

### Why high, not medium, is the fallback
The fallback exists for the two triggers decision 5 named: truncation, and a projected crossing of the cap. High is the
evidenced next step down on both: it ran in both checks with nothing truncated at 16,000 tokens and costs less. Medium
ran only in the pilot. This record does not rule on a second fallback below high.

## Consequences

- The full run passes `--effort xhigh`, `--mode batch` and a `--max-tokens` that leaves headroom over the largest answer
  seen (32,000 on ch10), **or the runner's defaults change first**. Today `DEFAULT_EFFORT` is `high` and
  `DEFAULT_MAX_TOKENS` is 16,000, pinned by a test, so a full run started without flags would run at high.
  Which of the two routes is taken is tracked in the register.
- The prompt freeze before the full run, required by the 2026-10-27 record and kept by the 2026-10-28 one, is
  unchanged by this record.
- Reversing to high costs nothing before the full run. After it, a re-run at another effort means paying for the book
  again.

## Alternatives considered

1. **Keep high, as ruled on 2026-10-28.** Rejected: [USER] preferred the other side in both blind checks, and the
   conditions [USER] set on 2026-10-29 for paying more are met.
2. **Run a second chapter at both efforts first**, as the 2026-10-29 plan proposed. Rejected: it could change only the
   effort choice, which is worth about USD 6 across the book, while it costs USD 3–7 for the two runs plus another
   blind review by [USER]. That it would test xhigh's advantage outside ch10 was weighed and judged not worth the cost.
3. **Keep medium as the fallback.** Rejected: high has more evidence on both fallback triggers, and medium's only
   evidence is the pilot.
