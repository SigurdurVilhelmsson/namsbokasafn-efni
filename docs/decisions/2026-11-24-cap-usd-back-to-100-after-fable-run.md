# Decision: the paid-AI ceiling CAP_USD returns from USD 250 to USD 100 after the Fable whole-book run

- **Date:** 2026-11-24
- **Status:** Accepted
- **Context owners:** [USER] (ruled in chat on 2026-11-24: "I rule USD 100", accepting Claude's recommendation);
  [CODE] measured the ledgers and the effect below
- **Supersedes:** `docs/decisions/2026-11-24-cap-usd-raised-to-250-for-fable-run.md`
- **Related:**
  - `tools/ai-review/config.js` (`CAP_USD`, the enforceable value) and `tools/__tests__/ai-review-config.test.js`,
    which pins it;
  - `tools/ai-review/ledger.js` (`reserve`, which applies the ceiling);
  - `docs/decisions/2026-10-26-pre-s-week-ai-layer-answers.md` (decision 1, where the USD 100 ceiling comes from);
  - `experiments/fable-editor-trial/` (the runner and the whole-book runs);
  - the active register's ⏩ RESUME block, which owns what happens next.

> **FROZEN EVIDENCE — banner-dated 2026-11-24.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

`CAP_USD` was raised from USD 100 to USD 250 on 2026-11-24 "for this run", the Fable editor trial's whole-book run.
That record left open whether the ceiling returns to USD 100 afterwards. The run is done. Should it?

At stake: how much any AI use sharing a ledger may commit from now on, and whether the Fable trial's ledger can
still spend.

## Decision

`CAP_USD` returns to USD 100. The value lives in `tools/ai-review/config.js`, and its test pins it.

## Reasoning

### The reason for USD 250 has passed

- The raise existed for one run. That run has ended: 23 runs, every one `complete`, USD 126.17 in all, with each
  ledger settle equal to its run-end `totalUsd` (the runs and their reports are in
  `experiments/fable-editor-trial/runs/` and `results/`). Every chapter of chemistry now has a Fable answer.
- No further paid run is planned on either ledger. On 2026-11-24 neither the register nor the trial plan names one,
  and the AI localization side track has spent nothing (its plan records USD 0).

### What USD 100 does to each ledger, measured

The ceiling is cumulative per ledger: `reserve` refuses a reservation when settled spend plus open reservations plus
the new amount would exceed it. On 2026-11-24 a probe called `reserve` on copies of both ledgers with the constant at
USD 100; the real ledgers were not written.

- **The Fable trial ledger** (outside the repository) holds USD 135.21 settled, with no open reservation. At USD 100
  it is closed: a USD 0.01 reservation was refused with `CapExceededError`. Any further Fable call needs a new
  ruling. That is the intended effect: the trial's paid part is finished, and the trial's model key expires on
  2026-11-27.
- **The book ledger** (`books/efnafraedi-2e/ai-review/ledger.jsonl`: the term pass USD 69.68 and the glossary
  pre-screen USD 8.31, USD 77.99 settled) keeps USD 22.01 of room: USD 22.00 was accepted, USD 0.02 more refused.
  That is the room it had before the raise. The raise had given it about USD 172 it never needed, because one
  constant governs every ledger.

### Money left on the account does not argue for a higher ceiling

The ceiling governs what the project may commit, not what the account can pay. Remaining credit on the account is a
funding fact; spending it needs a purpose first. If a use for it appears, for example a second Fable pass over one
chapter to measure how far two passes agree (in ch11's re-send, 172 of 217 segments answered twice came out the
same), it gets its own ruling and its own record, and the ceiling is raised for it then.

## Consequences

- **The Fable trial ledger refuses every new reservation** until a ruling raises the ceiling again. A dry run still
  works, because it does not read the ledger; the refusal comes at the first `reserve`, before anything is sent.
- **The book ledger can commit USD 22.01 more.** The pre-screen keeps its own safety margin below that.
- **Reversing it is cheap:** one constant and its pinning test. The ledger, harness, term-pass, pre-screen and trial
  tests derive their amounts from `CAP_USD`. They pass unchanged at USD 100.
- **The trial runner's per-run guard is unchanged** (`--cap-usd` defaults to USD 40 and may not exceed `CAP_USD`).
- The register's sentence that this was not decided is updated there, not here.

## Alternatives considered

1. **Keep USD 250.** Rejected: its reason has passed, and it leaves both ledgers far more room than any planned use,
   under one constant that no single use owns.
2. **A ceiling between the two, such as USD 150, to keep some room on the trial ledger.** Rejected for now: no Fable
   run is planned. A future run should be sized and ruled on its own, as the whole-book run was.
3. **A fresh ledger for any further Fable use.** Not proposed. The 2026-11-24 raise record already rejected spreading
   spend over ledgers, because it defeats the purpose of a single ceiling.
