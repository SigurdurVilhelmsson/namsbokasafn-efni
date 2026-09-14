# Evidence — §C140 ② ③ ⑨ + exocytosis: the scratch build behind the implementation plan, 2026-09-14

> 🧊 **FROZEN, 2026-09-14.** Cited, never synced. Status lives in the campaign register (§C140, ⏩ RESUME)
> and in `../../REGISTER.md`. The design is
> `docs/superpowers/specs/2026-09-13-c140-t23-scripts-reflow-decimals-design.md` (read its Amendments); the plan
> that installs this build is `docs/superpowers/plans/2026-09-14-c140-t23-scripts-reflow-decimals.md`. If this
> folder disagrees with either, they win. **Cost of everything here: 0 ISK** — no MT call; nothing under
> `books/` written; the repository was read-only for every agent (one scratch git worktree was used for the
> JavaScript, never committed or pushed).

The design was BUILT in scratch before the plan was written, the way the E plan was: five module builders, an
integrator that ran each composer stage against the unchanged composer and on the 34 bought figures, a predictor,
and adversarial reviewers — two rounds, the second applying the reviewers' fixes and [USER]'s R9 ruling
(symbols only). The files below are that verified build, byte-exact.

## What is here

| path | what |
|---|---|
| `reference/` | the build the plan installs, by commit (the parity vitest is stored as `figure-consistency-parity.test.js.ref` so the root vitest cannot collect it here): `1-svgfix/` · `2-harness/` · `3-scripts/` · `4-numloc/` · `5-reflow/` · `6-notes/`, and `stages/compose.{A,B,C}.py` (what `compose.py` must equal after each stage). Patches are repo-relative for `git apply`. **`MANIFEST.sha256` is checked by the plan's Task 1** |
| `PREDICTIONS.md` | every real-figure number the repository implementation is held to, with controls, hazards (read §Hazards before calling a miss) and the exact commands; written before the repository implementation existed |
| `instruments/predict/` | the predictor's pipeline: the frozen r2/c3b instruments, repointed (`*.adapt.diff`, `*.adapt2.diff` record every change; `frozen/` holds the originals), `run_final.py`, `reproduce.sh` and the attribution / fragility / isolation harnesses. **Paths point at the session scratch** (`/home/siggi/dev/scratch-c140/plan/pred2`, `…/r2`, `…/c3`, `…/prep`); re-point before reuse |
| `instruments/planning/` | the controller's measurements that fixed the container rules before any builder ran: `cls_v3.py` (vector classifier, 176/176 against the census), `free_v1.py` (Pillow free-box march), `align_v1.py` and `sib_v1.py` (sibling-edge tolerance: real columns ≤ 0.107 pt, first coincidence 0.26 pt), `r9_variants.py` (R9 literal / symbols-only / off), `explore_vec.py` |
| `reports/round1-*` | round one: `0-build-figlayout`, `1-build-numloc`, `2-build-svgfix`, `3-build-figscripts`, `4-build-figcontainers`, `5-integrate`, `6-predict`, `7-review-numbers`, `8-review-spec` |
| `reports/round2-*` | round two: `0-fix-modules`, `1-fix-commit5`, `2-fix-integrate`, `3-fix-predict`, `4-fix-verify` |
| `reports/rehearsal.md` | the dress rehearsal: the plan's Tasks 1–9 and Task 10's pre-flights executed verbatim in a throwaway detached worktree at the plan commit, every step MATCH or DEVIATION with the plan-text fix; the plan was corrected from it |

## Read the later round against the earlier one

- Round one's `6-predict` numbers were derived under the LITERAL R9 and are superseded by `PREDICTIONS.md`
  (round two). Its "3-dp production margins" were rounding noise (`7-review-numbers` finding 1).
- Round one's `8-review-spec` should-fix findings (silent box height overflow, silent container errors,
  `artwork.pdf` not a required input) are closed in round two; the remaining residual — a height miss when width
  also misses — was closed by the controller after `4-fix-verify` (`heightNeedPt` / `heightBudgetPt`, and the
  driver's height wording), re-checked by `PREDICTIONS.md` hazard 8.
- `4-fix-verify`'s note that lowercase unit symbols (`g`, `ml`) may end a line under R9 is the ruling as written;
  0 line breaks are affected on the 34.
- Where a report quotes a module's line numbers, they are the scratch file's and may not match `reference/`.
