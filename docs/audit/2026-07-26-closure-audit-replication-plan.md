# Closure Audit — Blind Replication & Model Comparison Plan

**Date:** 2026-07-26 · **Status:** pre-registered **before** the replication run
**Run A (complete):** Opus 5 — [`2026-07-26-closure-audit.md`](2026-07-26-closure-audit.md) + [`-evidence.md`](2026-07-26-closure-audit-evidence.md)
**Run B (pending):** Fable 5 — blind, in `/home/siggi/dev/repos/namsbokasafn-efni-audit-replica`

> **This document is deliberately committed to the audit branch, not to the replication kit.** The kit is read by the blind session; this file names Run A's results and would contaminate it.

---

## 1. Why pre-register

The comparison metrics are fixed **now**, before Run B's output is visible. Choosing metrics after seeing results lets whichever number flatters the conclusion become the headline. The disagreement-adjudication protocol (§4) especially must be fixed in advance, because it is the only part that can say *who was right* — and it is the part most vulnerable to being quietly reshaped to favour the run we already know.

## 2. The experimental control

**Held constant:** the workflow script (byte-identical apart from two path substitutions and the workflow name), the 30 group definitions, the output schemas, the asymmetric-verification strategy (3 skeptics, default-refute, kill on ≥2, `CLOSED` claims only), the three lens prompts, the `PREAMBLE` including its four calibration items, per-agent `effort`, and the repo state (`9107ed1d`).

**Varied:** the model. The script sets no per-agent `model`, so agents inherit the session model.

**Known residual asymmetries — record, do not correct after the fact:**
- Run A's agents could in principle have read its own spec commit on the branch; Run B gets the same spec as an untracked file. Functionally identical.
- Run A read the live `MEMORY.md`; Run B reads a snapshot reconstructed to that same pre-audit state. Verified free of audit traces.
- Run A's synthesis was handed the spec's **§4 figure of "~13 counted-only" drift rows, which Run A's own critic later proved wrong (the correct figure is 11)**. Run B receives the identical wrong input. **Whether Run B's synthesis or critic catches it is a genuine, pre-registered comparison datum** — arguably the single cleanest one, because it is a planted error with a known answer that neither run was told about.

## 3. Metrics

### 3.1 Coverage
- Total claim rows produced (Run A: 128).
- Claim **decomposition** — Run A split finding #12 into `12`/`12b` and #17 into `17a`/`17b`, and decomposed editorial headline drifts into sub-claims. Does Run B decompose at all, and where? A run that emits 37 rows for 37 findings has not necessarily done less work; it may have lumped genuinely separable sub-claims. Judge by *whether the sub-claims are separately dispositioned*, not by row count.
- Any group returning empty (Run A: none).

### 3.2 Disposition agreement — the headline number
Join per claim, then report a confusion matrix over `{CLOSED, CLOSED-BY-REFUTATION, OPEN-TRACKED, OPEN-UNTRACKED, SUPERSEDED, UNVERIFIABLE, UNRECOVERABLE, NOT-A-DEFECT}`.

**Joining is the hard part and must be done honestly.** Run B will invent its own ids.
- The 37 code findings + 4 refuted: join on the review's own finding number. Unambiguous.
- Editorial rows: join on the source-document anchor each row cites (`§2 headline drift 2`, `§4 row 3b`, `§5 dimension 7`, `§6 rec 4`). Fall back to claim-text match only when the anchor is missing, and **flag every fallback join** — an unflagged fuzzy join can manufacture agreement.
- Claims present in one run and absent from the other are **coverage misses**, not disagreements. Count them separately; do not let them dilute the agreement rate.

### 3.3 The consequential axis
Agreement overall matters less than agreement on the axis that changes behaviour: **closed vs not-closed.** Collapse to `{closed, open, other}` and report that matrix separately. A run that says `OPEN-TRACKED` where the other says `OPEN-UNTRACKED` was merely worse at grepping registers; a run that says `CLOSED` where the other says `OPEN` may have dropped real work.

### 3.4 Calibration (pass/fail, not a percentage)
Four hand-verified items are stated in the `PREAMBLE`: #1 `CLOSED`; #9, #35, #36 `OPEN`. Both runs were **told** these, so agreement is not evidence of skill — **but disagreement is strong evidence of failure**, because it means the run contradicted ground truth it was handed. Report as pass/fail per item.

### 3.5 Cardinal-sin rate
Sample ≥8 `CLOSED` dispositions per run and check whether each cites *fixing code* or merely infers closure from line drift. Run A: 0 of 8 sampled. This is the quality metric that matters most, because the sin is invisible in the output — a wrong `CLOSED` looks exactly like a right one.

### 3.6 Evidence quality
Share of rows whose `evidence` field contains quoted code vs prose assertion. Mean evidence length. Share of `CLOSED` rows citing a specific commit (and whether any cited commit is **fabricated** — check every hash resolves; a hallucinated hash is a disqualifying defect, not a style point).

### 3.7 Adversarial-verification behaviour
Skeptic flip rate: flips ÷ `CLOSED` claims attacked (Run A: 5 ÷ 74). **Interpret with care and in both directions** — a very low rate may mean rubber-stamping; a very high one may mean the skeptics refuse everything and the "kill on ≥2" gate stops discriminating. Also report the *distribution* across the three lenses: if one lens produces nearly all flips, the other two are not contributing.

### 3.8 Critic performance
The completeness critic is a within-run control, so its output is directly comparable. Report per run: claims verified present, genuine defects found, false alarms, and **whether it caught the planted "~13" arithmetic error (§2)**. Run A's critic found 9 defects in its own synthesis, all real.

### 3.9 Cost
Agent count, wall-clock, subagent tokens, errors, empty results, and — Fable only — safety-classifier fallbacks to Opus. **>2 fallen-back finders means Run B is a hybrid and every quality metric above must be labelled accordingly.** Report cost per *confirmed* finding, not per row; a cheap run that produces rows nobody can trust is not cheap.

## 4. Adjudicating disagreements — the part that says who was right

Difference alone proves nothing. For every claim where the two runs disagree on the §3.3 collapsed axis:

1. Build an **anonymised** adjudication packet: the original claim, and both dispositions with their evidence, labelled only *Position 1* / *Position 2*, **order randomised per claim** so no adjudicator can learn which model is which or that one is "the incumbent."
2. Dispatch **3 independent adjudicators per disagreement**, instructed to decide from the current code — not to referee the two arguments. Permitted verdicts: `position-1`, `position-2`, `both-wrong`, `unresolvable-without-production`. **`both-wrong` must be genuinely available and its use encouraged**, since forced binary choice manufactures a winner.
3. Majority verdict; ties → `unresolvable`, recorded as such rather than broken.
4. Adjudicators run on a **third configuration** (Opus at high effort is acceptable *only* if it is blind to which position came from which model — the anonymisation in step 1 is what makes this sound, and it must be verified, not assumed).

**Report the adjudicated score, not the raw agreement rate.** Raw agreement measures similarity; the adjudicated score measures correctness, and only the second answers "which model should I trust for this work."

## 5. Deliverable

`docs/audit/2026-07-26-closure-audit-model-comparison.md`:

1. **Verdict** — which run to trust for this class of work, and the one number that carries it.
2. Confusion matrices (§3.2, §3.3) with join method and every fuzzy join flagged.
3. Adjudicated disagreement table (§4).
4. Quality metrics (§3.4–3.8), including both critics verbatim.
5. Cost (§3.9), per confirmed finding.
6. **Findings Run B surfaced that Run A missed** — these are real audit output regardless of which model wins, and must be merged into the ledger and into **C10**. *This is the due-diligence half of the exercise and outranks the model-comparison half: a finding recovered is worth more than a benchmark.*
7. Threats to validity, including every §2 residual asymmetry.

## 6. Honesty commitments

- **Publish the pre-registration alongside the result**, including any metric that turned out unflattering to either run.
- **If Run B is a fallback hybrid, say so in the headline**, not in a footnote.
- **A single run per model is n=1.** Do not generalise to "model X is better at code review." The defensible claim is about *this audit, this harness, this repo, this day*.
- **Do not let Run A's incumbency decide ties.** It was written first and is already committed; that is a reason for extra scepticism toward it, not less.
