# Closure Audit — 2026-07-11 review findings × current `main` — Design

**Date:** 2026-07-26 · **Status:** Design approved in-session
**Baseline:** main `9107ed1d`, suite 3388 green
**Trigger:** The lead asked whether to run a fresh review of both repos on the original guidelines and diff the result against completed + proposed follow-up work. Investigation showed that question decomposes into three, and that the cheapest third — *"are we on target?"* — is answerable without any review, from evidence that does not currently exist in committed form.

---

## 1. The problem this solves

The 2026-07-11 two-perspective review produced 37 code findings, an editorial-workflow report, and a 9-batch joint triage summary. The pre-semester campaign (items 1–21) worked those batches down, and the post-item-17 follow-up campaign now carries the remainder.

**But no finding-level disposition ledger exists.** Verified 2026-07-26:

- `grep -c '2026-07-11-server-code-review' docs/plans/2026-07-11-pre-semester-coding-campaign.md` → **0**
- `grep -oE 'Batch [A-H]'` over the same file → **1 occurrence** (Batch F), out of 8 batches
- The follow-up campaign's own provenance line (`:145`) states its inventory came from *"the pre-semester campaign register + the status dashboard + the SDD ledger + CLAUDE.md + memory"* — **the audit documents are not in that list.**

The registers track findings discovered **during** campaign items. They do not track the findings the campaign was **created to fix**. Every hand-off summarized the previous hand-off, and severity annotations do not survive summarization.

### Evidence that this has already cost something

A four-finding sample against current `main`:

| Finding | Joint batch | State |
|---|---|---|
| #1 `pipeline.js:29` cross-book mutation | 1 ("ship first, ship alone") | **CLOSED** — `requireRole` + `normalizeChapter` wired |
| #9 undeclared `glob` | 9 ("declare **first** — can fail a clean install anytime") | **OPEN** |
| #35 four dead env vars in `.env.example` | 9 | **OPEN** |
| #36 stale `server/data/decisions.json` | 9 | **OPEN** (3 bytes, still committed) |

Finding #9 in detail — the sample's most consequential result:

```
server/package.json  → dependencies.glob    = undefined
                       devDependencies.glob = undefined
                       overrides.glob       = ">=11.0.0"
server/services/terminologyService.js:1876 → const glob = require('glob');
```

An `overrides` entry constrains a transitive version; it does **not** install the package. The runtime `require` resolves today only via npm's flat `node_modules` hoisting from some other dependency. This is exactly the failure the review described, and the joint summary told the lead to fix it **first within its batch** because *"it can fail a clean install anytime."* It is now in the P3 opportunistic tail as part of "item 22," with the urgency note gone.

**This is the failure mode being audited: not a judgment error, but evaporation through re-derivation.** Nobody decided to deprioritize #9. Its severity annotation was lost in a summary.

### The distinguishing problem

From inside the register you cannot tell *"we consciously deferred #35"* from *"#35 fell out of a summary."* Those look identical. Only an independent check against the source documents separates them — the project's own standing lesson: *a false negative and a genuine absence look identical from inside the code; only an independent oracle tells them apart.*

---

## 2. Objective

Produce **`docs/audit/2026-07-26-closure-audit.md`** — a finding-level disposition ledger covering every claim the 2026-07-11 review made, checked against current `main`.

Two uses:

1. **Answers "are we on target?"** with evidence, at finding granularity.
2. **Becomes the exclusion list** for any future diff-scoped review. The original review's ground rule #3 — *"don't re-report, do cross-reference"* — needs an exclusion list built from a register that has grown to ~189 consolidated items. That prerequisite is now much larger than in July and is load-bearing for signal-to-noise. This ledger is that prerequisite.

**Non-objective:** this audit changes no code. Findings it resurrects are triaged by the lead afterwards, per the findings-first precedent.

---

## 3. Scope — the auditable universe

| Source | Items | Notes |
|---|---|---|
| `2026-07-11-server-code-review.md` §Ranked findings | **37** | Full claim text committed |
| — §Refuted on second-pass verification | **4** | Carried as `CLOSED-BY-REFUTATION`; re-check the refutation still holds |
| — §Suggested remediation batches A–H | **8** | Derived groupings |
| `2026-07-11-server-review-joint-summary.md` §3 batches | **9** | The lead's actual triage order |
| `2026-07-11-editorial-workflow-review.md` §2 drift | **10 narrated** | See §4 — the other ~13 non-MATCH rows are counted-only |
| — §3 live walkthrough findings | bugs (a), (b) + persona finds | |
| — §4 QA §0–§5 evidence table | per-row | Re-check status, incl. rows marked prod-only/skipped |
| — §5 practice benchmark | **8 dimensions** | 1 SOUND / 4 GAP / 3 RISK |
| — §6 ranked recommendations | **6** | |

Roughly **70 auditable items.**

**Out of scope:** namsbokasafn-vefur (its own review baseline is 2026-06-17 and belongs to step 4); `tools/` findings from Fable RUNs 1–6 (a separate corpus, separate audit if wanted); any code change.

---

## 4. A constraint discovered while sizing: partial unrecoverability

The editorial review's closing note states its working artifacts — *"documented-workflow model, drift catalog, walkthrough log, QA evidence, practice-benchmark synthesis"* — **"were session-scoped working files, not committed separately."**

Consequence: §2 tallies **68 cross-walked claims** (45 MATCH / 11 DOCS-AHEAD / 9 CODE-AHEAD / 1 DRIFT / 2 UNDETERMINED), but only **10** are narrated in committed prose. The remaining ~13 non-MATCH rows exist **only as a count**.

The audit must report these as **`UNRECOVERABLE`** — never as MATCH, never as closed. Reporting an uncheckable claim as fine is the same class of error the audit exists to catch.

This is itself a second instance of the evaporation pattern, and is a finding of the audit in its own right.

---

## 5. Disposition states

| State | Meaning | Evidence required |
|---|---|---|
| `CLOSED` | Fixed on `main` | The fixing code, quoted, at its current location + commit/PR where determinable |
| `CLOSED-BY-REFUTATION` | Was refuted on the review's own second pass | Re-confirm the refutation still holds against current code |
| `OPEN-TRACKED` | Still present, and a live register item covers it | The defect, quoted, **plus** the citing register item (e.g. `C5 · B1-F5`) |
| **`OPEN-UNTRACKED`** | Still present, **no** register item covers it | The defect, quoted. **This is the audit's product.** |
| `SUPERSEDED` | The code the finding described no longer exists | What replaced it |
| `UNVERIFIABLE` | Cannot be checked without production | Why (prod-only config, real Entra, nginx) |
| `UNRECOVERABLE` | The original claim was never committed | Per §4 |

---

## 6. Method

A workflow fan-out, findings-first, read-only.

### 6.1 Grouping

Verifiers are grouped **by file/subsystem**, not one-per-finding — findings in the same file share a read, and a verifier holding the whole file reasons better about whether a change addressed a given claim. ~19 groups for the 37 code findings; ~8 for the editorial corpus; 1 mapper for the joint batches.

### 6.2 Asymmetric verification — the load-bearing decision

**Adversarially refute every `CLOSED` claim (3 skeptics, default-refute). Accept `OPEN` claims cheaply.**

Rationale: a false `CLOSED` silently drops real work — precisely the failure mode under audit. A false `OPEN` costs one wasted re-check. Symmetric verification spends the budget in the wrong place.

A skeptic's default answer is *"not actually closed."* A `CLOSED` claim survives only if the skeptic can point at the specific code that fixes it. Kill on ≥2 of 3 refutes.

### 6.3 Line numbers are not addresses — a hard rule in every brief

287 files and **+36,297 / −5,218 lines** changed in `server/` + `tools/` + `scripts/` since the review baseline. Every finding must be re-located by **symbol and behavior**, never by line number.

> A verifier that reports *"the line no longer matches, so presumably fixed"* manufactures the exact error this audit exists to catch. Line drift is expected and is evidence of nothing.

### 6.4 Completeness critic

A final pass asks: which claim from the source documents has **no row** in the ledger? Anything it finds is the next round of work. Silent truncation would read as "we covered everything" when we didn't.

### 6.5 Ops rules

- Read-only. No code, config, or content changes. `git status` clean at the end (agents with Bash have dirtied the tree before — Phase-0 lesson).
- Every row anchored to `file:line` **as of today**, with code quoted.
- No fabricated commit attributions — "fixed, attribution undetermined" is an acceptable and honest evidence value.

---

## 7. Deliverable structure

`docs/audit/2026-07-26-closure-audit.md`:

1. **Headline** — counts by disposition; the `OPEN-UNTRACKED` list up front.
2. **Ledger** — one row per item: `id · source · original severity · claim · state on main · evidence · disposition · register item (if tracked)`.
3. **Resurrect list** — `OPEN-UNTRACKED` items ranked by original severity, with a proposed home in the follow-up campaign's P-tiers.
4. **Batch roll-up** — joint-summary batches 1–9 and code batches A–H, each with % closed.
5. **Practice-benchmark delta** — the 8 dimensions re-scored, or explicitly marked "not re-scorable without a live walkthrough" (that is A4's job, not this audit's).
6. **Unrecoverable** — §4's counted-only drift rows, named as a permanent evidence gap.
7. **Exclusion list** — the derived artifact step 4 consumes.

Committed on a docs branch → PR, per campaign precedent.

---

## 8. Success criteria

- Every one of the ~70 items has a row and a disposition. None silently dropped (§6.4 enforces).
- Every `CLOSED` disposition survived 3-skeptic refute-default.
- Every `OPEN` disposition states whether a register item tracks it — the `OPEN-TRACKED` / `OPEN-UNTRACKED` split is the whole point.
- The known-answer items resolve correctly: #1 `CLOSED`; #9, #35, #36 `OPEN-*`. These four are the audit's own calibration check — if the fan-out disagrees with the hand-verified sample, the fan-out is wrong, not the sample.
- Working tree clean; no code changed.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| Verifier assumes line drift = fixed | §6.3 hard rule in every brief; 3-skeptic refute on every CLOSED |
| Verifier can't find a register item that exists → false `OPEN-UNTRACKED` | Both campaign registers + CLAUDE.md + MEMORY.md supplied to every verifier; synthesis re-checks each `OPEN-UNTRACKED` against the register before it reaches the resurrect list |
| Ledger drowns the lead like the 189-item register did | Headline leads with `OPEN-UNTRACKED` only; everything else is roll-up + appendix |
| Audit becomes a fresh review by drift | Scope is fixed to the 2026-07-11 corpus. A verifier noticing a *new* problem logs it to the register per standing rule — it does not become a ledger row |
| Tree dirtied by agents | Read-only brief; `git status` gate at the end |

---

## 10. Sequence context

This is **step 1 of 4**, approved in-session 2026-07-26:

1. **Closure audit** ← this spec
2. **P0 delivery [LEAD]** — vefur deploy + the `3-1-nymyndun-…` / `3-4-protin` redirects; then **C9** (vefur issue #197, fall-semester deadline; centre of gravity is vefur → relaunch Claude there)
3. **Finish A4** — PR-1b (§2 localization tier + §3 assignment enforcement; needs its own seeded fixture book, not a third mutator on `__e2e-fixture__`) + the vefur reader-side companion
4. **Diff-scoped review** — designed after step 1, consuming this ledger as its exclusion list. New lens regardless of timing: **both repos went public 2026-07-25** and no review has run under that threat model.

**Why this order.** Two independent data points in the project's own record say behavioral walking beats static fan-out on this system: the joint summary §5 notes the live walkthrough *"caught a bug that neither code fan-out surfaced"*, and **C9 was found by content work — not by RUN 6, which had specifically reviewed that cross-repo seam.** A4 is already that review, already scoped, PR-1 delivered. Finishing it outranks funding a new fan-out.
