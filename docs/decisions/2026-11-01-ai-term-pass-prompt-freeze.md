# Decision: the AI term pass's prompt v2 and the 2026-11-02 ruling set are frozen for the full run

- **Date:** 2026-11-01
- **Status:** Accepted
- **Context owners:** [USER] (decided the freeze on 2026-11-01, after the stoichiometry ruling and the runner
  defaults landed); [CODE] (the checks, the pin test and this record)
- **Supersedes:** none. It carries out the freeze that `docs/decisions/2026-10-27-ai-layer-pilot-before-s-full-run-after-prereg.md`
  made a condition of the full run (decision 2) and that `docs/decisions/2026-10-28-ai-term-pass-as-editor-suggestions.md`
  kept.
- **Related:**
  - `docs/decisions/2026-11-01-ai-term-pass-full-run-at-xhigh.md` (the run's parameters);
  - `docs/decisions/2026-11-01-stoichiometry-subject-sense.md` (the ruling set's last change);
  - `experiments/ai-review-pilot/prompt-freeze-2026-11-01/` (the plan at the freeze, with a digest of every request);
  - `experiments/ai-review-pilot/ch10-2026-11-01/` (the paid re-run that tested this prompt);
  - `tools/__tests__/ai-review-frozen-inputs.test.js` (the pins);
  - the active register's 2026-11-01 entries.

> **FROZEN EVIDENCE — banner-dated 2026-11-01.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

The 2026-10-27 record made a frozen prompt a condition of the full run. The 2026-10-28 record kept it, and its
short blind look samples "the full run's output after the prompt freeze". Neither said what the freeze holds or how
it is kept. So the questions are:
- which prompt and ruling set does the full run use?
- what else counts as frozen?
- what stops an edit from slipping in before the run?

At stake:
- the full run is paid privately, and a re-run costs the book again;
- the blind look and editors' uptake measure one condition only if the run's inputs do not move.

## Decision

1. **The prompt and the ruling set are frozen.**
   - The prompt is `tools/ai-review/prompts/term-pass-v2.md` (sha256 `7f9b1b35…`); its response schema is
     embedded in it.
   - The ruling set is `experiments/terminology-consistency/results/2026-11-02/ruling-set-2026-11-02.json`
     (sha256 `0aa33690…`).
   - The full run uses exactly these.
2. **A test keeps them frozen.** `tools/__tests__/ai-review-frozen-inputs.test.js` pins both hashes, and pins
   that the runner reads both paths. To unfreeze either one, write a new record and change the pin.
3. **The run's parameters are those the 2026-11-01 record set,** now the runner's defaults. Each is pinned where
   it is defined:

| Input | Value | Pinned by |
|---|---|---|
| Prompt | `term-pass-v2.md`, sha256 `7f9b1b35…` | `ai-review-frozen-inputs.test.js` |
| Ruling set | `ruling-set-2026-11-02.json`, sha256 `0aa33690…` | `ai-review-frozen-inputs.test.js` |
| Model | `claude-opus-5-5` | `ai-review-term-pass.test.js` |
| Effort | xhigh (fallback high, under the 2026-11-01 record's two triggers) | `ai-review-term-pass.test.js` |
| Output tokens | 32,000 | `ai-review-term-pass.test.js` |
| Segments and characters per request | 8 and 16,000 | `ai-review-term-pass-request.test.js` |
| Mode | batch | the run command (`--mode` has no default) |

**Not frozen by this record:**
- **The code that builds requests and gates answers** (`CODE_PATHS` in `tools/ai-review/term-pass.js`). Each
  run records its code commit, and preflight refuses unless that code is tracked and clean. So a run's records say
  what ran, but a code change before the full run is a change of condition, and the register must record it.
- **The layer-1 text the requests carry.** It is tool-written, and a top-up or re-request changes it.

The plan's request digests (below) detect any change to either one that alters what is sent. The gate can be fixed
after the run and re-applied to the same answers without paying again.

## Reasoning

### The prompt is the one the paid re-run tested
- **Unchanged since `b7ea4a6d5` (2026-10-29).**
- **The 2026-11-01 ch10 re-run recorded this prompt.** Runs `20261101T101143Z-0a3bb55e` (high) and
  `20261101T101529Z-137d40e8` (xhigh), both batch, carry sha256 `7f9b1b35…`. Every answer was usable, 55 of 55
  in each, none was cut off at 32,000 tokens, and [USER] judged the differences blind.
- **The two prompt issues the 2026-10-27 record named are closed.**
  - The prompt claimed a segment's neighbours in a request were its context. v2 now says the segments of a request
    "are not necessarily neighbours".
  - Seven targets could not match because of a trailing parenthetical, *heat → varmi (q)* among them. The
    2026-10-29 retarget fixed *heat*.
- **14 rulings still cannot match, by construction.**
  - 11 have a target holding a character an operation may not write: a Greek letter, a digit, a bracket or an
    inner capital (*π-tengisvigrúm*, *sp3-blendingssvigrúm*, *aukaskammtatala (hverfiþungi)*, *pOH*).
  - 3 have English holding a `[formula]` placeholder.
  - The set records each as `matchable: false` with its reason, and the matcher never offers them. This is a limit
    of the operation rules, not a defect of the prompt.
- **Nothing the re-run surfaced is a prompt defect.**
  - High answered one garbled segment id, and the gate drops such an answer.
  - Xhigh skipped a few occurrences, and the leftover check flags those.

### The ruling set has one untested change
The 2026-11-02 set is the 2026-11-01 set plus stoichiometry's sense. The re-run used the 2026-11-01 set, so the
frozen set has not itself been run. Its one change was measured for free: the offer diff found stoichiometry
74 → 78 and no other ruling changed (the stoichiometry record). Sense handling in general did run in the re-run:
the 2026-11-01 set had seven sensed rulings, *heat* among them.

### What the full run will send
- **The plan.** `plan --all` at `2c941e993`, on the frozen inputs and the defaults, gives:
  - 622 requests;
  - about 5.97 million input tokens (estimated);
  - a worst case of USD 225.35 as batches, if every answer used its full 32,000 output tokens;
  - ch10's USD 19.90 as the largest single-chapter batch reservation.
  The expected spend is the 2026-11-01 record's extrapolation, not a new measurement.
- **`plan` is deterministic:** two runs gave byte-identical summaries.
- **A real run sends what `plan` builds.** Re-planning ch10 with the re-run's inputs reproduced all 55 request
  bodies of the xhigh run.
- So `plan-summary.json`, with a sha256 for each of the 622 request bodies, lets anyone check after the full run
  that it sent the frozen requests.

### Why a test, and not only this record
CLAUDE.md puts an enforceable value in "the file the code reads plus its test". Preflight requires the prompt and
the set to be tracked and clean, but accepts any content. Without a pin, an edit would pass CI and preflight, and
it would show only in the run's records afterwards.

### Checked against the tree, and not
**Checked:**
- both hashes, against the files, the re-run's records (prompt) and the plan;
- that `loadPrompt` and `loadRulingSet` hash the file bytes, so a run records the pinned values;
- `plan`'s determinism and the ch10 body match, as above;
- that the pin test fails when one byte of the prompt changes (a mutation check, restored from a golden copy).

**Not checked:** how the model treats stoichiometry's ratio sense. The full run is the first to exercise it, and
its `senses` answers can be compared with the census's final sort
(`experiments/terminology-consistency/results/2026-11-01/stoichiometry-census/final-sort-2026-11-01.json`).

## Consequences

- **The freeze is one of three gates.** The full run also waits on the 2026-10-28 entry's (e), a rule for a run
  the cap cuts short, and (f), which subscription period the run draws on. Both are tracked in the register.
  (e) bears on these numbers: USD 78.85 was left under the cap after the 2026-11-01 re-run, against a largest
  reservation of USD 19.90 and an expected spend near USD 44.
- **The short blind look** (the 2026-10-28 record's decision 4) samples output made under these inputs.
- **Unfreezing takes a new record and new pins.**
  - Before the full run, it costs nothing.
  - After the run, a changed prompt or set means a new run at the book's cost, and its output is a different
    condition from the frozen run's.
- **Whether the full run buys ch10 again** under these inputs, the pilot chapter whose earlier output was read
  unblinded, is not decided here. The register tracks it.

## Alternatives considered

1. **Freeze in prose only.** Not chosen: preflight accepts any content, so nothing would stop an edit.
2. **Freeze the code too,** by pinning a hash of `CODE_PATHS`. Not chosen:
   - the gate may need fixes, which can be re-applied to the run's answers without paying;
   - each run records its commit;
   - the request digests detect any code change that alters what is sent.
3. **Freeze the 2026-11-01 set, the one the re-run tested.** Not chosen: it lacks the stoichiometry ruling
   [USER] made after the re-run, and the one difference was measured.
4. **A paid pilot on the 2026-11-02 set before freezing.** Not chosen: the only change is one sense, measured
   for free. This matches the 2026-11-01 decision to drop the second chapter.
