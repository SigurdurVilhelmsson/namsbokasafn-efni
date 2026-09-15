# §C140 ⑩ — ring visibility gate — plan

**Date:** 2026-09-15 · **Design:**
[`../specs/2026-09-15-c140-c10-ring-visibility-gate-design.md`](../specs/2026-09-15-c140-c10-ring-visibility-gate-design.md)
(its § *Rulings — answered* wins over anything here) · **Measurements, frozen:**
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

## Tasks 7–10 — Parts 2–4, unblocked by [USER]'s rulings of 2026-09-15

**Q1 yes · Q2 driver step · Q3 publish healed brain · Q4 named warning.** The design's
§ *Rulings — answered* owns the wording.

| # | task | done when |
|---|---|---|
| 7 | **Q2's consequence first: make `render-check.mjs` runnable off one laptop** — it is on the driver path now | playwright resolved against both `node_modules` trees with an escape hatch, the `<img>` height kept fractional against a ceil()ed viewport, a timeout that separates slow from never; the fixed tool reproduces the frozen brain measurement `33.8 / 25.5 / 12.3 / 23.3` exactly |
| 8 | **`applyRingGate` in `tools/figure-run.js`**, called the moment prepare has written `artwork.svg`, before anything composes from it | the census gates the cost (no candidates → no browser spawned at all); an approved mask is healed and the artwork replaced in place; **every** failure path leaves the artwork byte-identical; the existing driver suite's failing set is unchanged **by name** |
| 9 | **Q4's surface** — `rec.ringWarnings`, its own channel and its own summary section | a refused candidate is named with its figure and mask; `figure-prepare.py`'s warning list is not borrowed for it |
| 10 | **Roll out to brain** — `figure-run.js --figure CNX_Chem_03_01_brain-ec0b --force` (0 ISK), then [USER] reviews | the recomposed figure is in `books/`, the run summary names `healed mask-2`, and the publication call is [USER]'s |

⚠️ **Task 10 needs a box with `pdftocairo` and the OpenStax source PDFs.** The driver spawns
`figure-prepare.py`, which reads the figure's source PDF; verified absent in the environment
Tasks 7–9 were built in (`which pdftocairo` empty, no `CNX_Chem_03_01_brain*.pdf` anywhere).
`books/*/media/` is pipeline output and is not hand-edited (CLAUDE.md § *Pipeline operations*),
so this is a run for the box that has the sources — not a patch.

**A control worth running with it:** a whole-ch03 run should ALSO name
`CNX_Chem_03_01_exocytosis-88f6` with 8 refused candidates and heal none. A run that heals brain
and says nothing about exocytosis means the refusal channel is not working, which is the half of
this item that protects a picture.

## What is deliberately NOT in this plan

- **No `COMPOSER_VERSION` bump.** The composer does not change; bumping it restages all 34 figures for a
  2-figure artwork change. → design §5.
- **No change to `strip-text.py`.** c10 proposed the heal there. It lives in its own module instead, and
  Q2 put the decision in the driver rather than in prepare — so the prepare path is untouched and the
  gate can be judged, and turned off, without disturbing how artwork is produced.
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
