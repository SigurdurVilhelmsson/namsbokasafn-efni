# §C140 ⑩ — ring visibility gate — plan

**Date:** 2026-09-15 · **Design:**
[`../specs/2026-09-15-c140-c10-ring-visibility-gate-design.md`](../specs/2026-09-15-c140-c10-ring-visibility-gate-design.md)
(its § *Rulings this design NEEDS* wins over anything here) · **Measurements, frozen:**
[`evidence/2026-09-15-c10-ring-gate/`](../../../experiments/figure-text-translation/evidence/2026-09-15-c10-ring-gate/README.md).
**No status verbs** — the active register's ⏩ RESUME owns state. **0 ISK throughout: nothing here
calls the MT, and no task reads or writes a source PDF.**

## Tasks 1–6 — Part 1, the tool (done on this branch)

| # | task | done when |
|---|---|---|
| 1 | **Re-run every premise** the frozen c10/exo-spike reports rest on, against `main` at HEAD, before writing a line of code | each of the five premises in the evidence README has a measured result, and any that failed is written up rather than worked around |
| 2 | **Locator** — `figrings.find_candidates`: every image-backed soft mask reachable from the root, with its clip rect in root user units and its per-side byte ring | the two real carriers are located; a fixture where the masked group is reachable **only** through `<filter><feImage>` is located too, with its premise asserted |
| 3 | **Statistic** — `figrings.edgeline`, the frozen c10 instrument generalised to an arbitrary rect, one-sided | it reproduces c10's brain numbers to the digit before and after the heal; a planted dark line does **not** score |
| 4 | **Gate** — `figrings.gate`, interventional, per side then per mask, conjunctive and fail-closed | brain 1 of 1 approved, exocytosis 0 of 8; a planted pair with an identical `before` decides differently on what the heal does; a refused candidate stays refused on the picture that would approve it |
| 5 | **Gated heal + CLI** — `figrings.heal`, `figure-rings.py census|gate|heal` | without a gate report it heals nothing and says why; it refuses to write inside `books/`; the gated brain output is byte-identical to the counterfactual and the gated exocytosis output is byte-identical to its input |
| 6 | **Tests** — `test_figrings.py`, every planted negative paired with a positive through the same path, corpus anchors with a non-vacuity control, skips counted and printed | `ALL PASS`, and the corpus-anchor block asserts a non-empty population before asserting anything about it |

## Tasks 7–10 — Parts 2–4, blocked on rulings

Do **not** start these before the matching ruling exists. Each names the ruling it waits on.

| # | task | waits on | done when |
|---|---|---|---|
| 7 | **Decide brain's publication** — [USER] looks at `crops/brain-outline-before-after.png` and, if that is not enough, at a full-size render of the healed figure | **Q3** | brain is either healed and cleared for the ch03/ch04 publication decision, or kept on its June raster copy, and §C140 ⑩ records which |
| 8 | **Wire the decision into the pipeline** at the place Q2 chooses. If Q2 is (b), a `figure-run.js` step between prepare and compose that runs the two renders and the gate | **Q1 + Q2** | a figure whose gate approves is healed by an ordinary `figure-run --figure <b> --force`; a refused one comes through byte-identical; both pinned by a test that runs the driver, not just the library |
| 9 | **Surface a refused candidate** per Q4 | **Q4** | a refused candidate appears where the chosen surface says, with the mask id and the reason; a corpus with no candidates produces no noise |
| 10 | **Roll out to the carriers** — `figure-run --figure <b> --force` on brain (and exocytosis, which comes through unchanged), then [USER] reviews the pictures | **7 + 8** | the recomposed figures are in `books/`, [USER] has looked, and the deploy/publication call is [USER]'s |

## What is deliberately NOT in this plan

- **No `COMPOSER_VERSION` bump.** The composer does not change; bumping it restages all 34 figures for a
  2-figure artwork change. → design §5.
- **No change to `strip-text.py`.** c10 proposed the heal there. Part 1 keeps it in its own module so the
  gate can be built and judged without touching the prepare path at all; where it finally lands is Q2.
- **No attempt to stop poppler writing the ring.** c10 measured `-r`, `-scale-to-*` and `-paperw/h -expand`
  as not working, and judged pre-scaling in pikepdf as failing "smallest fix". Not reopened.
- **No Firefox/WebKit work.** That is §C140 ⑭, a publication pre-check, and it is not this item.

## Verification discipline

- Every premise inherited from a frozen document is **re-run**, not cited. Task 1 exists for that reason
  and it is first.
- A null result is paired with a control that proves the instrument fires. The corpus sweep asserts its own
  population size; the planted negatives run through the same code path as the positives.
- The gate's numbers are pinned as a **decision** (approved/refused and why), never as pixels — the render
  moves with the browser build, the decision did not across a wide threshold band on this corpus.
- Anything a frozen document cites is copied **into** that document's folder before it is frozen (§C140 ㉓).
