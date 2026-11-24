# Decision: the paid-AI ceiling CAP_USD is raised from USD 100 to USD 250, for the Fable editor trial's whole-book run

- **Date:** 2026-11-24
- **Status:** Superseded by `docs/decisions/2026-11-24-cap-usd-back-to-100-after-fable-run.md` (`CAP_USD` back to USD 100 after the run)
- **Context owners:** [USER] (ruled in chat on 2026-11-24: "Raise CAP_USD to 250 for this run"); [CODE] measured the
  projection and the ledger arithmetic below
- **Supersedes:** `docs/decisions/2026-10-26-pre-s-week-ai-layer-answers.md`, in part: its decision 1's figure
  (paid AI calls capped at USD 100 in total). The rest of that decision, and its other decisions, are untouched.
- **Related:**
  - `tools/ai-review/config.js` (`CAP_USD`, the enforceable value) and `tools/__tests__/ai-review-config.test.js`,
    which pins it;
  - `tools/ai-review/ledger.js` (`reserve`, which applies the ceiling);
  - `docs/plans/2026-11-14-fable-editor-trial-plan.md` (§5.3, the trial's cost and its USD 40 per-run guard);
  - `experiments/fable-editor-trial/` (the runner, and run `20261123T215036Z-63b1603d` with its README);
  - the active register's ⏩ RESUME block, which owns what happens next.

> **FROZEN EVIDENCE — banner-dated 2026-11-24.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

The Fable editor trial's ch10 run went well enough that [USER] wants Fable's edit for the rest of chemistry before the
model key expires on 2026-11-27. Can that run fit under the USD 100 ceiling set on 2026-10-26, and if not, how should
the ceiling change?

At stake: whether the whole-book run can happen at all before the key expires, and how much any AI use sharing a
ledger may spend from then on.

## Decision

`CAP_USD` goes from USD 100 to USD 250. The value lives in `tools/ai-review/config.js`, and its test pins it.

## Reasoning

### The run does not fit under USD 100

- **The ceiling is cumulative per ledger.** `reserve` in `tools/ai-review/ledger.js` refuses a reservation when what
  the ledger has already committed (settled spend plus open reservations) plus the new reservation would exceed the
  cap. Checked against the tree on 2026-11-24.
- **The trial's ledger already holds USD 9.04:** USD 8.765528 for the ch10 batch run and USD 0.27764 for the step-2
  run on m68760, each from its `run-end.json`. That leaves USD 90.96 under the old ceiling.
- **The projected cost of every chapter except ch10 is about USD 126.** It was computed offline on 2026-11-24, with no
  request sent: every chapter's requests were built with the trial's own code (same prompt, ruling set, effort,
  `max_tokens` and character budget) and scaled by ch10's actual usage (input 390,542 tokens, output 360,168
  including thinking). At Fable's batch rates that usage reproduces ch10's bill to the cent, USD 8.7655 against
  USD 8.765528. The split: ch03–ch21 without ch10 about USD 107; ch00, ch01, ch02 and the appendices about USD 18.
  The output side assumes Fable rewrites as much per character as it did in ch10, so the realistic range is roughly
  USD 100–160. The script and its output are off-repo (`~/.cache/namsbokasafn-audit/2026-11-24-fable-projection/`),
  which is not durable enough for a publication; the run's own records will replace the projection.
- **Not even a part of the run fits.** ch03–ch21 alone (about USD 107) is already above the USD 90.96 left.

### Why 250 is enough

- A batch reserves its worst case before sending. The largest single chapter's worst case is ch18's at about
  USD 22 (the runner's own dry run). So the ledger's peak commitment is roughly USD 9.04 already spent, plus about
  USD 126 settled across the chapters, plus one worst-case reservation in flight: about USD 160, under USD 250 with
  room for the upper end of the range.
- The cost is not a project cost: the trial is paid from [USER]'s own Anthropic credits (plan §5.3).

## Consequences

- **One constant governs every ledger, not only the trial's.** The term pass's ledger and the glossary pre-screen's
  can now commit up to USD 250 as well. There is no per-use ceiling.
- **The trial's own per-run guard is unchanged.** The runner's `--cap-usd` defaults to USD 40 (`DEFAULT_CAP_USD` in
  `experiments/fable-editor-trial/lib.mjs`) and may not exceed `CAP_USD`. Because the ledger is cumulative, a
  whole-book run must pass `--cap-usd` explicitly, or it stops after a few chapters.
- **Reversing it is cheap:** one constant and its pinning test. The ledger, harness and term-pass tests that once
  hard-coded amounts near USD 100 now derive them from `CAP_USD`, so they follow any value.
- **Not decided on 2026-11-24:** whether the ceiling returns to USD 100 after the run. [USER] said "for this run";
  lowering it again is a separate ruling.
- The run itself, and the term-pass re-run for ch08 and ch21 that it waits on, are tracked in the active register,
  not here.

## Alternatives considered

1. **Give the whole-book run its own ledger with its own cap** — offered on 2026-11-24 and not chosen. It would have
   kept the USD 100 ceiling for everything else, at the cost of one more ledger to account for.
2. **Run only part of the book under USD 100** — rejected by the arithmetic above: even ch03–ch21 alone exceeds the
   USD 90.96 left on the trial's ledger.
3. **Keep USD 100 and spread the run over several ledgers** — not proposed. It would keep the number while defeating
   the purpose of a single ceiling.
