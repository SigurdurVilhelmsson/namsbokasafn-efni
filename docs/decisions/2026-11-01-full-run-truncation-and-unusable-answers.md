# Decision: the full AI run raised its output limit instead of falling back to high, and re-sends answers `apply` cannot use

- **Date:** 2026-11-01
- **Status:** Accepted
- **Context owners:** [USER] (both rulings, 2026-11-01, made during the full run, each chosen from three options that
  carried Claude's recommendation); [CODE] (the measurements and this record)
- **Supersedes:** `docs/decisions/2026-11-01-ai-term-pass-full-run-at-xhigh.md`, in part: the consequence of its
  truncation trigger ("If xhigh truncates responses … the run falls back to **high**"). When xhigh truncated, the run
  kept xhigh and raised `--max-tokens` from 32,000 to 64,000 instead. The record's first clause, "an output limit
  large enough that no answer is cut off", stands and is what was applied; its "32,000 tokens was enough on ch10" no
  longer holds for the book. Its other trigger, a projected crossing of the cap, was already superseded by
  `docs/decisions/2026-11-01-full-run-cap-rule-and-billing.md` and is not touched here.
  This record also **adds** a rule no record had: what the run does with an answer that finished but that `apply`
  cannot use.
- **Related:**
  - the active register's 2026-11-01 entries "full run done" and "full run in progress", in
    `docs/plans/2026-07-21-post-item17-followup-campaign.md` (the per-chapter table, both pauses, the re-send list);
  - `experiments/ai-review-pilot/full-run-cap-2026-11-01/run-2026-11-01/` (the driver, its per-chapter rows, the
    runner logs, and a README saying which driver version ran which chapters);
  - the run records `books/efnafraedi-2e/ai-review/runs/20261101T190553Z-055cca97/` (ch07) and
    `…/20261101T192016Z-c3da50df/` (ch08);
  - `docs/decisions/2026-11-01-full-run-cap-rule-and-billing.md` (which kept the truncation trigger in force);
  - `docs/decisions/2026-11-01-ai-term-pass-prompt-freeze.md` (the frozen inputs; the runner's code was not frozen);
  - `isUsableParse` in `tools/ai-review/term-pass-apply.js` (the one definition of a usable answer) and `judgeRun` in
    `tools/ai-review/term-pass.js` (the runner's stop rule);
  - `docs/plans/2026-09-05-per-chapter-loop.md` and the register's §C134 ([USER]'s 2026-09-06 retry ruling for the MT).

> **FROZEN EVIDENCE — banner-dated 2026-11-01.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

The full run (22 chapters, ch10 left out, xhigh, batch, `--max-tokens 32000`) stopped twice for reasons its procedure
did not cover. Two questions followed, one at each stop:

1. **After ch07, 2 of its 51 answers were cut off.** The effort record says the run then falls back to high. Does that
   apply to the whole rest of the run, or only to the answers that were cut off? At stake: whether the book's
   suggestions come from one condition or two, and whether the two lost answers are ever replaced.
2. **After ch08, 1 answer finished normally but `apply` could not use it.** Its request showed 8 segments; the answer
   reviewed 1, gave a second entry under an id the request never showed, and left out the other 6. The runner stops
   on any such answer. Does the run continue past it? At stake: whether the run needs [USER] at every such answer,
   and what happens to the segments it missed.

## Decision

1. **From ch08 the run stayed at xhigh with `--max-tokens 64000`.** It did not fall back to high. The two cut-off
   answers from ch07 are re-sent after the run.
2. **An answer `apply` cannot use for any reason is recorded, the run continues, and the answer is re-sent after the
   run.** Ceilings still stop the run: more than 10% of a chapter's answers incomplete, or more than 5 incomplete
   answers from ch09 on.

## Reasoning

### The limit is invisible to the model, so raising it changes only answers that would be cut off
`max_tokens` is a hard limit the model does not see (the Claude API reference, in its task-budget section). An answer
that finishes under 32,000 tokens is therefore the same whether the limit is 32,000 or 64,000; only an answer that
would have been cut off differs. That makes raising the limit the one change that addresses truncation without
changing any other answer.

**Measured after the run, from the run records:** no answer from ch08 on used more than 32,000 output tokens. The
largest was 26,000 (ch11); at 32,000 the largest that finished was 20,560 (ch05). So the raised limit changed no
answer the run kept. The run's 564 usable answers come from one condition in effect, and the limit's only effect was
to remove the risk of a further cut-off.

### Falling back to high had no evidence for these requests
The fallback rested on high finishing every ch10 answer at 16,000 tokens. ch07's two cut-off requests
(`ch07/m68742/012` and `/013`) had ordinary inputs (about 5,000–7,000 characters) and spent the whole 32,000 on
thinking, with no answer written. The summarised thinking shows careful work through many overlapping rulings (lone
pair, electron-pair geometry, bent, resonance), not a loop. Nothing showed that high would finish them in 16,000.
Falling back would also have split the book into two efforts (ch00–ch07 at xhigh, the rest at high), the effort
record's preferred condition giving way on 2 answers of 201.

### The cost to the cap was measured before the choice
At `--max-tokens 64000` each remaining chapter's reservation roughly doubled (largest ch18, USD 32.09, from `plan`,
0 USD). Computed with the projection's own factors, which reproduce its 32,000 figures exactly, the cap's margin
fell from 2.25× to 1.88× the expected cost. Actual cost does not depend on the limit, so the expected spend was
unchanged. The run settled at USD 39.13 against USD 39.29 projected before it started.

### A malformed answer is a sporadic defect, and those are retried
The ch08 answer was 1 of 227 requests sent by then, finished normally at 7,942 output tokens, and every other answer
in its chapter was complete. [USER] ruled on 2026-09-06, for the MT, that a detected sporadic defect is retried, not
coded around (`docs/plans/2026-09-05-per-chapter-loop.md`; register §C134). That ruling was about marker defects in
the paid MT; it carries over here by analogy, and this record is what extends it to the AI pass. The runner's stop exists because the 2026-10-27 final review stopped counting such answers as usable
(`isUsableParse`); this ruling keeps that definition and changes only the run's response to it: record, continue,
re-send. `apply` still uses the reviewed parts of such an answer, so nothing it got right is lost meanwhile.

### The ceilings keep a systematic failure from passing as a sporadic one
A prompt interaction or a change in the model would show as many incomplete answers, not one. The ceilings (10% of a
chapter, 5 from ch09 on) stop the run in that case. They were not reached: from ch09 on, no answer was cut off or
incomplete.

## Consequences

- **The run's conditions, for the research report:** ch00–ch07 at `--max-tokens 32000`, ch08 on at 64,000; xhigh, the
  frozen prompt and ruling set, and layer 1 at `0093d8da4` throughout. Because no kept answer exceeded 32,000 tokens,
  the methods can state that the limit change altered no answer. All 567 request bodies match the freeze's digests
  once `max_tokens` is set back to 32,000 (the register's "full run done" entry).
- **The re-send is a second attempt at 3 requests (23 segments):** `ch07/m68742/012` and `/013` (cut off) and
  `ch08/m68747/003` (incomplete). It needs a runner flag that sends named requests, which changes `tools/ai-review`
  after the run. The prompt-freeze record left that code unfrozen and treats a change to it before the full run as a
  change of condition for the register to record; a flag added for the re-send is the same kind of change and is
  recorded the same way. The re-sent answers are a separate condition: a retry at the same inputs, not a different
  treatment. Before the flag is built, check how `apply` given two `--run` ids resolves a segment answered in both
  (the ch08 request reviewed one of its segments). Where this stands is tracked in the register.
- **A changed `--max-tokens` breaks the cap projection's observed ratio.** `cap_projection.py` computes it as settled
  cost over reservations, so doubling the reservations roughly halves it. During the run the pause rule used a fixed
  ratio against the 32,000 worst case, which has no such flaw. A later run that changes the limit needs the same
  correction.
- **Forecloses:** a book-wide record at a single `--max-tokens`, and the literal fallback to high. Reversing the first
  would mean re-running ch08 on at 32,000, which by the measurement above would change nothing but the record.
- **Not decided here:** a second fallback below xhigh for the re-send, should a re-sent request be cut off again at
  64,000. The re-send's own run will show whether that question arises.

## Alternatives considered

1. **Fall back to high at 16,000 from ch08, as the effort record is worded.** Rejected: no evidence that high finishes
   the requests xhigh could not finish in 32,000, it splits the book into two efforts, and it does nothing for ch07's
   two answers.
2. **Stay at xhigh and 32,000, and re-send every cut-off after the run.** Rejected, narrowly: it gives the same
   answers where nothing is cut off, but leaves an expected 3–4 more cut-offs (about 1% of the remaining requests) to
   re-send, each at about USD 0.33 spent for nothing. Raising the limit addresses the cause once, and the measurement
   after the run shows it changed no kept answer.
3. **For the malformed answer, pause for [USER] at each one.** Rejected: it puts [USER] in the loop for a defect
   already ruled to be retried, and the ceilings cover the case where pausing matters.
4. **For the malformed answer, stop the run and investigate first.** Rejected: one answer in 227, in a chapter whose
   other 25 answers were complete, is the sporadic case, and stopping would have delayed the remaining 13 chapters for
   no change in treatment.
