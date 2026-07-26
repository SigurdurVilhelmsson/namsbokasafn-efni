# Closure Audit — Blind Replication & Model Comparison (Opus 5 vs Fable 5)

**Date:** 2026-07-26 · **Pre-registration:** [`2026-07-26-closure-audit-replication-plan.md`](2026-07-26-closure-audit-replication-plan.md) — written and committed **before** Run B existed. Every metric below was fixed in advance.

| | **Run A** | **Run B** |
|---|---|---|
| Model | Opus 5 (1M) | **Fable 5** |
| Harness | identical script | identical script (2 path substitutions) |
| Baseline | `main` `9107ed1d` | `main` `9107ed1d`, isolated clone |
| Blind? | n/a (first) | **yes** — see §7 |
| Agents / errors | 92 / 0 | 92 / 0 |
| Model fallbacks | n/a | **0** (2,623 model refs, all `claude-fable-5`) |

---

## 1. Verdict

**On correctness the two runs are tied. On evidence they are not.**

Blind adjudication of the six disputed claims returned **3–3**. Neither model was systematically more right about the code. But the *shape* of the disagreements is consistent and useful:

> **Run A won every dispute that turned on tracing a code mechanism. Run B won every dispute that turned on not over-reading a process document.**

Run A's three wins are `code-ref-3` (does a rollback after a file write leave DB and disk diverged?), `ed-qa-0.3b` (does a unit test on a middleware mock prove an end-to-end apply succeeds?), and `ed-drift-3b` (is a claim that was never a defect "closed"?). Run B's three are `ed-qa-5c`, `ed-qa-0.reg`, `ed-qa-5d` — all QA-checklist rows where the question is *what does this row actually assert, and has it been discharged*, and where Run A's skepticism converted an evidence-adequacy gap into a phantom defect.

**Which to trust for this class of work:** Run A, but not on the strength of the score. The tiebreaker is §3 — Run A produced **2.4× the evidence per row**, cited **file:line in 75% of rows vs 52%**, and its adversarial layer actually fired. Run B's skeptics upheld **66 of 66** closed claims; four of Run A's five flips were vindicated on adjudication, including the audit's single most valuable finding. A verification layer that never rejects anything is not a verification layer.

**Neither run should be trusted unaudited.** Adjudicators found factual errors in *both* positions on five of six cases, and in two cases found both positions wrong about a shared premise inherited from the source review (§5).

---

## 2. Agreement

Join: **94 exact-id** matches (both runs independently converged on `code-N`, `ed-rec-N`, `ed-dim-N`, and both split finding #17 into `17a`/`17b`) plus **20 anchor-matched** pairs, each verified by reading both claim texts. Every fuzzy join is listed in §8; none was made on claim-text similarity alone.

**Collapsed confusion matrix** (`closed` / `open` / `other`), 114 paired claims:

| Run A ↓ / Run B → | closed | open | other |
|---|---:|---:|---:|
| **closed** | 59 | 0 | 0 |
| **open** | 5 | 49 | 0 |
| **other** | 0 | 1 | 0 |

**Collapsed agreement: 108/114 = 94.7%.** Full-label agreement is lower (100/114) — the extra 8 are all `OPEN-TRACKED` vs `OPEN-UNTRACKED`, i.e. one run found a register line the other missed. Those are grep-quality differences, not judgment differences, and Run B found the register line more often than Run A did (7 of 8).

Both runs independently reached the **same headline**: batches 3 and 9 at 0%, the campaign shipped code and not docs, and finding **#9's "fix first" urgency evaporated in summarization**. Run B's phrasing, unprompted: *"precisely the failure mode this audit was built to catch."* That convergence is the strongest evidence the headline is real and not an artifact of one model's framing.

---

## 3. Quality metrics

| Metric | Run A (Opus) | Run B (Fable) |
|---|---:|---:|
| Ledger rows | **128** | 116 |
| Total evidence | **114,329 ch** | 55,523 ch |
| Mean evidence / row | **893 ch** | 479 ch |
| Rows citing `file:line` | **96 (75%)** | 60 (52%) |
| Rows citing a test pin | **42 (33%)** | 13 (11%) |
| `CLOSED` rows with <150 ch evidence | **3 / 75** | 11 / 66 |
| Commit hashes cited | 84 | 71 |
| **Fabricated hashes** | **0** | **0** |
| Skeptic flips | **5 / 74** | **0 / 66** |
| Cardinal sin (closure from line drift) | 0 found | 0 found |

**Fabrication: clean on both.** Every one of the 155 commit hashes cited across both runs resolves in git. This was the pre-registered disqualifying check; neither run failed it.

**The cardinal sin did not occur in either run.** Run A's critic sampled 8 of 67; the adjudicators independently re-derived 6 more from scratch. No row concluded closure from a line number no longer matching.

**Run B's terseness is not automatically a defect.** Its 11 thin `CLOSED` rows all quote a real test name at a real location — a different citation *style*, not an absent one. But the 33%-vs-11% test-pin gap is substantive: Run A far more often anchored a closure to something that will fail if the fix regresses.

### The decisive metric: adversarial verification

Run A's skeptics flipped 5 of 74 closed claims. Run B's flipped **0 of 66** — its skeptics upheld every single claim they were asked to refute, under a prompt that told them their default answer was *"not actually closed."*

Adjudicating Run A's five flips: **4 vindicated, 1 wrong.**

| Flip | Outcome |
|---|---|
| `code-ref-3` | ✅ upheld — Run A won 2–1 |
| `ed-qa-0.3b` | ✅ upheld — Run A won 2–1 |
| `ed-drift-3b` | ✅ upheld — Run A won 3–0 |
| `ed-w8` | ✅ **confirmed-present 2/2** by independent verifiers |
| `ed-qa-0.reg` | ❌ wrong — Run B won 3–0 |

An 80% hit rate on flips is the difference between a verification layer and a formality. **This is the single clearest quality separation in the study.**

---

## 4. Adjudicated disagreements

Three blind adjudicators per case, anonymised positions, order randomised (3 cases A-first, 3 B-first), `both-wrong` and `unresolvable` genuinely available.

| Case | Votes | Winner | What is actually true |
|---|---|---|---|
| `code-ref-3` | A · B · A | **A** | Refutation leg (b) is false: post-write DB work inside the same transaction can throw, leaving the renamed file on disk with the transaction rolled back. Residue is **file/DB divergence, not corruption** — including a lost `content_versions` snapshot. |
| `ed-qa-0.3b` | A · B · A | **A** | The *behaviour* holds, but the cited unit test asserts `next()` on a middleware mock — it is not evidence an apply succeeds. The gap is evidentiary. |
| `ed-drift-3b` | A · A · A | **A** | Never a defect and never fixed; the file predates the review by ~4 weeks. `CLOSED` is the wrong word. Run A's `NOT-A-DEFECT` reclassification is correct. |
| `ed-qa-5c` | both-wrong · B · B | **B** | ⚠️ **Both inherited a false premise** — see §5. |
| `ed-qa-0.reg` | B · B · B | **B** | The round trip is genuinely covered; Run A's flip converted a documentation gap into a phantom defect. |
| `ed-qa-5d` | B · B · B | **B** | Already marked `✅ auto 2026-06-22` in the checklist. Run A labelled it open while quoting only evidence of closure. |

**Score: 3–3.**

### Single-source findings — the due-diligence payoff

Three claims Run A produced and Run B had no row for, independently verified (2 verifiers each):

| Claim | Verdict | Consequence |
|---|---|---|
| `ed-w8` — `blockedIssues` counts a `LIMIT 10` row list, so the tile saturates | **confirmed-present 2/2 (high)** | ✅ **Real finding Run B missed entirely.** Stays in C10 as R4. |
| `code-12b` — server-side chapter filter never applied | **not-present 2/2** | Confirms Run A's `CLOSED`. Run B simply didn't split the sub-claim. |
| `ed-w6b` — raw SQLite error reaches a head-editor via `alert()` | **not-present 2/2 (high)** | ❌ **Run A false positive — withdrawn.** See §6. |

---

## 5. Findings about the *project*, not the models

The adjudication surfaced three things neither run had right. These are real audit output and outrank the benchmark.

1. **QA row §5c is NOT prod-only.** Both runs inherited *"requires a destructive from-scratch DB rebuild"* from the source review and neither checked it. Adjudicators: `resolveDbPath()` honours `SESSIONS_DB_PATH`, `runAllMigrations` creates a fresh DB when the file is absent, and ~30 existing tests already do exactly this in `os.tmpdir()`. The runbook line both runs quoted says *"on a throwaway box / disposable DB copy — never prod data."* **§5c is walkable locally today** — it should come off A4's prod-only list, which currently has 3 items and should have 2.

2. **`code-ref-3`'s causal story is wrong even though its conclusion is right.** Run A wrote that leg (b) *became* false when item-20b added post-write mutations. Adjudicators checked the 2026-07-11 baseline directly: the `markApplied`/`markSuperseded` loops were **already** post-write and in-transaction. **Leg (b) was never true.** Item-20b widened an existing window; it did not open one. The defect is real and R1 stands — the narrative in C10 must be corrected (§6).

3. **The 2 `UNDETERMINED` cross-walk claims deserve ledger rows.** Run B's critic caught this in its own ledger; it applies partly to Run A, which reasoned about them correctly in prose (excluding them from the unrecoverable count) but gave them no rows, so they appear in no exclusion list. They are `GREYNIR_URL` in production and mixed-track chapter assembly in vefur — both `UNVERIFIABLE`, both belonging to A4 and the vefur companion.

### The planted error — a pre-registered natural experiment

Both runs' synthesis received the spec's claim that ~13 drift rows are counted-only. The true figure is 11.

**Neither synthesis caught it. Both critics did** — by different routes. Run A's critic found the arithmetic stated two incompatible ways and derived the correct narrated count. Run B's critic found that the 2 `UNDETERMINED` rows are named and recoverable and so cannot be in the counted-only set — the same conclusion, reached from a category error rather than an arithmetic one.

**Result: a genuine tie, and a strong endorsement of the critic stage.** The one asymmetry is downstream of the harness: Run A's ledger was corrected because I acted on its critic; Run B's still says ~13 because no one acted on its critic. That is a difference in *session follow-through*, not in model capability, and it is recorded here so it is not miscounted as one.

---

## 6. Corrections forced on Run A's committed ledger

Applied in the same commit as this document.

| # | Correction |
|---|---|
| 1 | **`ed-w6b` withdrawn** — C10 R3 was a false positive (2/2, high confidence). The `alert()` plumbing exists but migration 039 removed the constraint that produced the raw message; there is no reachable defect. |
| 2 | **`code-ref-3` narrative corrected** — leg (b) was already false at the 2026-07-11 baseline. Conclusion and P1 priority unchanged. |
| 3 | **`ed-qa-0.reg` → `CLOSED`** (was `OPEN-TRACKED` after a wrong flip). |
| 4 | **`ed-qa-5d` → `CLOSED`** (was `OPEN-TRACKED`). |
| 5 | **`ed-qa-5c` → `OPEN-TRACKED`, not prod-only** (was `UNVERIFIABLE`) — locally walkable; A4's prod-only list drops to 2. |
| 6 | **2 `UNDETERMINED` rows added** as `UNVERIFIABLE`, assigned to A4 + the vefur companion. |
| 7 | **Line-precision caveat recorded** — Run A shows a systematic ~4-line citation drift in a minority of rows. Non-load-bearing (adjudicators re-located every symbol) but real; treat its line numbers as approximate anchors. |

Net effect on Run A's counts: `CLOSED` 66 → **69**, `CLOSED-BY-REFUTATION` 3, `OPEN-TRACKED` 48 → **47**, `OPEN-UNTRACKED` 8 → **7**, `NOT-A-DEFECT` 2, `UNVERIFIABLE` 1 → **2**. **Total 128 → 130.**

> Recomputed mechanically rather than by hand. The first draft of this paragraph said `CLOSED` 66→68 and `UNVERIFIABLE` 1→3 — wrong on both, because I netted the moves in my head. In a document whose §5 headline is a planted arithmetic error that neither synthesis caught, that is worth recording rather than silently fixing.

---

## 7. Blinding — what was actually guaranteed

| Vector | Control | Verified |
|---|---|---|
| Repo files | `main`-only clone at `9107ed1d` | 0 audit files; 0 commits touching them |
| `git fetch` escape | refspec `+refs/heads/main:refs/remotes/origin/main` | dry-run fetch returns nothing |
| Project memory | replica at a different path → separate empty memory dir | — |
| Memory index | pre-audit snapshot passed to the script | 0 audit traces |
| Registers / CLAUDE.md | at `9107ed1d`, pre-C10 | same state Run A saw |
| Leak scan | finding-specific strings across the kit | 0 hits (2 matches were output-*format* instructions present in both runs) |

**Adjudication room:** Run B's ledger was removed from the replica before adjudicators ran, so neither run's conclusions were readable. Adjudicators saw only the anonymised packets and the code.

---

## 8. Threats to validity

- **n = 1 per model.** One run each, one harness, one repo, one day. **Nothing here supports "model X is better at code review."** The defensible claim is about this audit.
- **The 3–3 score rests on 6 cases.** Small. The evidence-density and flip-rate metrics (n = 128/116 and 74/66) are far better powered and should carry more weight than the score.
- **Adjudicators were Opus 5** — the same family as Run A. Mitigated by anonymisation and randomised order, and Run B won half the cases, which is weak evidence against a family bias. Not eliminated.
- **Anchor-matched joins (20 pairs)** were made by me, reading both claim texts. Flagged throughout; the exact-id subset (94) shows the same 94.7% agreement, so the fuzzy joins do not carry the result.
- **My `code-12b` solo packet was mis-framed** — it asked verifiers to check whether a defect Run A had marked `CLOSED` was *present*. They correctly determined the code state anyway, so the conclusion holds, but the packet was wrong and is disclosed here rather than quietly re-run.
- **Run A had a human correction pass; Run B did not.** All comparisons above use post-skeptic-merge harness output for both. Where Run A's committed ledger differs from its harness output, that is noted rather than credited.
- **Evidence-length asymmetry may bias adjudicators** toward the longer argument. The prompt explicitly said length is not a signal; Run B won 3 cases while consistently offering shorter evidence, which suggests the instruction held.

---

## 9. Cost

| | Run A (Opus 5) | Run B (Fable 5) |
|---|---:|---:|
| Wall-clock | 53.3 min | **31.8 min** |
| Input tokens (incl. cache) | 347.6 M | **158.9 M** |
| Output tokens | 1,059,300 | **745,818** |
| Confirmed-real findings unique to it | **2** (`ed-w8`, `code-ref-3`) | 0 |

Run B ran **40% faster on 46% of the input tokens** and reached the same headline. For a *first pass* — establishing the shape of the answer — that is a strong showing. For the *verification* pass, its 0/66 flip rate means it would have shipped `code-ref-3` and `ed-w8` as closed.

**The practical reading:** Fable is well-matched to breadth (relocate every claim, disposition it, get the headline right at ~half the cost). Opus earns its cost in the adversarial layer, where the job is to reject a plausible-looking answer. A hybrid — Fable finders, Opus skeptics — is the configuration this study actually argues for, and neither run tested it.

---

*Companions: [`2026-07-26-closure-audit.md`](2026-07-26-closure-audit.md) (Run A ledger, corrected per §6) · [`2026-07-26-closure-audit-evidence.md`](2026-07-26-closure-audit-evidence.md) · [`2026-07-26-closure-audit-runB-fable.md`](2026-07-26-closure-audit-runB-fable.md) (Run B ledger, as written, uncorrected) · [`2026-07-26-closure-audit-replication-plan.md`](2026-07-26-closure-audit-replication-plan.md) (pre-registration).*
