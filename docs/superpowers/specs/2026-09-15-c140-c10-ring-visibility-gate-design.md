# §C140 ⑩ — the `pdftocairo -svg` soft-mask ring, and the visibility gate its heal needs — design

**Date:** 2026-09-15 · **Status:** design. **Rulings Q1–Q4 answered 2026-09-15; Parts 1–3 built.
Part 4's rollout run needs a box with poppler and the OpenStax source PDFs — see § Parts.**
**Owner of:** the DESIGN of how the ring artefact is detected, how a heal is authorised, and where that
decision runs. Nothing else in §C140.
**Status of the work lives in** the campaign register's ⏩ RESUME and §C140; figure-text status in
`experiments/figure-text-translation/REGISTER.md`. **This document carries no status verbs.**
**Evidence it rests on (frozen, cited, never restated):**
[`evidence/2026-09-13-t23/reports/c10-brain.md`](../../../experiments/figure-text-translation/evidence/2026-09-13-t23/reports/c10-brain.md)
(root cause) ·
[`…/exo-spike.md` §7](../../../experiments/figure-text-translation/evidence/2026-09-13-t23/reports/exo-spike.md)
(the heal's damage) ·
[`evidence/2026-09-15-c10-ring-gate/`](../../../experiments/figure-text-translation/evidence/2026-09-15-c10-ring-gate/README.md)
(this item's own measurements — the gate, the corpus census, the two gates that failed).

---

## Rulings this design is built on — do not re-litigate

| # | ruling | by |
|---|---|---|
| R10 | **⑩ is its own item. A visibility gate must exist before any heal ships** — one visible example against eight invisible ones is too thin | [USER] 2026-09-13 |
| — | **⑩ runs BEFORE any ch03/ch04 figure publication decision** | [USER] 2026-09-15 |
| — | Carried: buying stays stopped · block keys must not move · no PR merges until [USER] has looked at the pictures | [USER] 2026-09-13 |

## Rulings — answered 2026-09-15

| # | question | [USER]'s ruling |
|---|---|---|
| **Q1** | Does the heal ship at all? | **Yes.** It ships, gated. |
| **Q2** | Where does the decision run? | **(b) a step in `figure-run.js`, between prepare and compose.** |
| **Q3** | Brain's publication | **Publish the healed brain.** ⑩ no longer blocks the ch03/ch04 publication decision. |
| **Q4** | What a refused candidate does | **A named warning** — never silent. |

**Q2 has a consequence worth stating: `render-check.mjs` is now on the driver path.** It imported
playwright by an absolute path inside one developer's home directory, so it ran on exactly one
machine. Harmless while only a human invoked it; not harmless once the driver does. Fixed here
(resolution against both `node_modules` trees, a `PLAYWRIGHT_CHROMIUM_EXECUTABLE` escape hatch,
a fractional `<img>` height against a ceil()ed viewport so the 0.14 % vertical stretch does not
walk the measurement off its target, and a timeout that can tell "slow" from "never").

*(The recommendation put to [USER] was Q1 yes-but-narrowly, Q2(b), Q4 named warning. All four rulings
came back matching it, Q3 included.)*

---

## 1. The defect, in one paragraph

A PDF soft mask is a group poppler rasterises at 1 px per user unit over the **whole-number** extents of
the clip it is painted under. It fills that surface with the mask's `/BC` backdrop, then paints the group
clipped — so an outer row or column that the clip only partly covers keeps the backdrop. With `/BC [1.0]`
that is ~opaque where the source mask is ~0. The browser upsamples the raster bilinearly, spreading the
bright value inside the clip: a 1–2 px **light outline** of the masked form's BBox, absent from the source
and absent from `pdftocairo -png` of the same file. It arrived when artwork moved from raster to
`pdftocairo -svg` on 2026-09-12. It is at the same step as ⑤, not at ④.

**What makes it an item rather than a fix:** the byte signature that finds it is not the defect. On
`CNX_Chem_03_01_exocytosis` the same signature is carried by 8 masks where nothing is visible, and
overwriting the ring **destroys the axon's real edge shading**. A heal driven by the signature is a
content-destroying false positive on 8 of the 9 candidates that exist.

## 2. What the corpus actually holds

Measured over **all 691** composed SVGs, 3.6 s, no browser: **9 candidate masks in 2 figures** — brain (1)
and exocytosis (8). No third carrier. The population that can carry it is the cairo-vector artwork, i.e.
the figures recomposed since 2026-09-12, so the exposure is **2 of ~24–34** and is unbounded going forward.
`evidence/2026-09-15-c10-ring-gate/reports/corpus-census.txt` owns the numbers.

**This is why Q1 is a real question.** One visible defect, on a figure readers are not served today, is a
thin basis for a pass that rewrites picture bytes on every figure from now on.

## 3. The gate

### 3.1 Two designs were measured and rejected

Both are recorded because both look obviously correct until measured.

- **Byte-level** (c10's census rule, ring − inner ≥ 50 alpha): approves **9 of 9**. It cannot separate a
  backdrop ring from a feather that genuinely reaches the raster edge.
- **A threshold on the unhealed render:** approves exocytosis `mask-271` right (edge-line **33.2**, as high
  as brain's strongest side) and `mask-189` right (11.0) — where healing changes the statistic by **0.0**.
  Those light lines are drawing. **A picture of the defect and a picture of the content look the same; only
  the intervention tells them apart.**

### 3.2 The design adopted — interventional

Render the file as it is (`before`), and render it again with **every** candidate healed (`after`). For
each side of each candidate's clip rect, in root user units mapped to render pixels:

> `edgeline(P, c)` = the brightest 1-px line in a ±2 px band at `c`, minus the median of its ±6 px
> neighbourhood, along a profile inset from both ends so no corner enters it.

- **Per side:** `before ≥ 10` **and** `before − after ≥ 8`.
- **Per mask, conjunctively:** **≥ 2 cut sides pass** **and** **best delta ≥ 20**.

`edgeline` is the frozen c10 statistic, unchanged, generalised to an arbitrary rect.

**Three things about this are load-bearing, and each was measured:**

1. **One-sided.** A two-sided `max-|·|` rule scores brain's *correctly healed* edge at **−25.5** — the
   masked shape's own legitimate dark boundary — and would call a repaired figure broken.
2. **Per-mask, not per-side.** brain's weakest side is **10.3**; exocytosis `mask-491`'s best is **10.2**.
   **No per-side threshold separates them.** The ≥ 2-sides rule is a *mechanism*: poppler fills the whole
   raster surface with `/BC`, so a genuine ring is a property of the whole cut perimeter; one side alone is
   better explained by content. Measured: brain 4 of 4; every exocytosis mask 0 or 1.
3. **Fail-closed and conjunctive**, in the `source-refresh-policy` idiom. A candidate that cannot be paired
   with a rect clip (`no-clip`), whose image is referenced more than once (`shared-image`), or whose clip
   cuts no side (`clip-uncut`) is **refused whatever it scores**. All three fire on 0 real masks and are
   exercised by planted fixtures only.

### 3.3 What it decides on the real corpus

```
brain       mask-2   35.0→0.4 · 24.7→0.0 · 10.3→0.0 · 20.9→0.7      APPROVED 4/4, best Δ34.5
exocytosis  8 masks, 32 sides                                        approved 0 of 8
            mask-491 bottom 10.2→0.0 is the only passing side; refused at "sides 1 < 2" —
            and it is exactly the side exo-spike §7 measured the heal as DAMAGING
```

### 3.4 The finding that shapes the locator

**A walker that does not follow `<filter><feImage>` finds 0 masks on exocytosis and reports it clean.**
cairo emulates PDF blend modes with `feImage` referencing an in-document group, so on a blend-carrying
figure the masked groups are reachable *only* through filters. The first locator returned `records 0` for
exocytosis — a confident, empty, wrong answer on the one figure where the byte detector false-positives.
Pinned by a planted fixture whose premise is itself asserted.

## 4. The parts

| part | what | state |
|---|---|---|
| **1 — detector, gate and gated heal, as a standalone tool** | `figrings.py` (library), `figure-rings.py` (CLI: `census` / `gate` / `heal`), `test_figrings.py`. Read-only by default: `heal` without a gate report heals nothing, and the CLI **refuses to write inside `books/` at all** | **built and measured** |
| **2 — the heal's authorisation** | Q1: it ships, gated by §3.2 | **ruled** |
| **3 — the decision's place** | Q2(b): `applyRingGate` in `tools/figure-run.js`, called the moment prepare has written `artwork.svg` and before anything composes from it. The census gates the cost — a pure read, no browser, and on 689 of 691 figures the step spawns nothing further. Fail-closed: any failure leaves the artwork byte-identical and names itself | **built**, `tools/__tests__/figure-run-ring-gate.test.js` |
| **4 — a refused candidate** | Q4: its own warning channel (`rec.ringWarnings`, not `figure-prepare.py`'s list) and its own section in the run summary, naming the figure and the mask | **built** |
| **4b — the rollout run** | `figure-run.js --figure CNX_Chem_03_01_brain-ec0b --force` (0 ISK), then [USER] reviews the picture | **not run — needs poppler and the source PDFs**, see below |

**Part 4b cannot run where this was built.** `figure-run.js` spawns `figure-prepare.py`, which needs
`pdftocairo` and the figure's OpenStax source PDF; the environment this was built in has neither
(verified, not assumed: `which pdftocairo` is empty and no `CNX_Chem_03_01_brain*.pdf` exists anywhere
on the box). The artwork under `books/*/media/` is pipeline output and is not hand-edited — CLAUDE.md
§ *Pipeline operations*. So Q3 is discharged by running, on a box with the sources:

```bash
node tools/figure-run.js --book efnafraedi-2e --chapter 3 \
     --figure CNX_Chem_03_01_brain-ec0b --force        # 0 ISK, spawns no MT
```

`isStale` keys on `COMPOSER_VERSION` and the render hashes, never on the artwork, so `--force` is what
picks the healed artwork up. Expect the run summary to name `CNX_Chem_03_01_brain-ec0b: healed mask-2`.
A run over ch03 as a whole should additionally name `CNX_Chem_03_01_exocytosis-88f6` with 8 refused
candidates and heal none of them — that refusal is the Q4 line, and seeing it is how you know the step
is still looking at the shape it was built for.

## 5. Rollout, when there is one

`isStale` (`tools/figure-run.js`) keys on `COMPOSER_VERSION` and the render hashes, **never on the
artwork** — so a change to the artwork pass does not restage anything by itself. `figure-run.js` runs
prepare on every invocation, so `figure-run --figure <b> --force` (0 ISK) is the route for the carriers.
*(Inherited from c10, read from the code, not run.)* A `COMPOSER_VERSION` bump is **not** appropriate: the
composer does not change, and bumping it would restage all 34 figures for a 2-figure artwork change.

## 6. Known limits — carried into the register, not buried here

1. **One positive.** The separation rests on brain alone against 8 negatives. The next figure of this shape
   is evidence and should be re-measured, not assumed to pass.
2. **No cairo reference** in the environment this was built in, so "visible" means "a light line that
   healing removes", not "differs from poppler's own rasteriser". The two agreed on brain and on
   `mask-491`; they have not been compared anywhere else.
3. **Chromium only.** Firefox and WebKit are §C140 ⑭ and remain unmeasured. The thresholds
   themselves are not the fragile part: 360 of 360 settings across a wide band give the same
   decision on this corpus, with a control that shows the sweep is not vacuous
   (`evidence/2026-09-15-c10-ring-gate/reports/threshold-sweep.txt`).
4. **Exocytosis `mask-0`**, left ring excess 39.6 with no clip wrapper, is below the byte threshold and was
   not examined. Inherited from c10, still open.
5. **`render-check.mjs` imports playwright by an absolute path on one developer's machine** and runs
   nowhere else without editing. Found while building this; not fixed, not this item's to fix.

## 7. Documentation

`evidence/2026-09-15-c10-ring-gate/` is frozen and carries the measurements, the two rejected gates, the
before/after crops and the reproduction commands. Per §C140 ㉓ everything it cites is **inside it** —
the reports and the JSON verdicts are copied there, not left in scratch.
