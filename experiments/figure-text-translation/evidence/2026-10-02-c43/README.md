# §C140 ㊸ — why `test_figrings.py` could not finish, and the memoised walk — 2026-10-02

> **FROZEN EVIDENCE — banner-dated 2026-10-02.** Status lives in the campaign register
> (`docs/plans/2026-07-21-post-item17-followup-campaign.md`, §C140 ㊸). The fix is `a5f5b3750`.

**Cost:** 0 ISK. Read-only on `books/`; nothing bought, rendered or synced.

## The question

On 2026-09-30 an uncapped `test_figrings.py` ran for 1 h 40 min without a verdict: section 7's corpus
sweep had read at most 149 MiB of ~720 MiB, sat more than 22 minutes on one file, and its RSS reached
5 GB, rising. The register's hypothesis was the heavy files still ahead (63, 53, 42 … MB). **That
hypothesis was wrong.**

## What was measured

| file | what |
|---|---|
| `walk-cost-census.py` · `.jsonl` | For every committed chemistry `_IS.svg` (711), the number of calls `find_candidates`' walk would make, counted with a memo over the SAME traversal rules instead of by walking every path; plus a pruned count (only subtrees that can reach an image-backed mask). |
| `walk-state-probe.py` | For named files, the number of distinct walk STATES (element, exact ctm, last clip entering it), and the masks the walk reaches. |
| `equivalence.py` · `.out` | The pre-㊸ `find_candidates` (read from git at `7193e7f6d`) against the memoised one, memo on and off, on all 710 files except Econfig. |

**The census.** 711 files, 789,463 elements, 0 cycles. **Exactly one file is super-linear:**
`CNX_Chem_06_04_Econfig_IS.svg` — **1.34 MB, 1,568 elements, about 7.1e24 predicted walk calls**
(pruned to unproductive-free subtrees: still 3.7e23, so pruning alone cannot fix it). The next worst,
`CNX_Chem_04_01_rxn3_IS.svg`, is 1,540 calls. 662 of the 711 files have no image-backed mask at all.
Econfig is **file 150 of 711** in the sweep's (alphabetical) order, with **143.1 MB before it** — which
is the 2026-09-30 measurement exactly. Parsing the whole corpus takes about 31 s.

**The control.** The real (pre-㊸) `find_candidates` on Econfig, under a 60 s cap and a 3 GB memory cap:
killed by the cap (exit 124). The census predicts the real behaviour.

**The mechanism.** cairo emulates PDF blend modes with `<filter><feImage href="#g">`, and on a figure
that nests them each level reaches the group below BOTH as a child and through the feImage, at the same
ctm. Paths double per level; states do not. The probe: Econfig has **1,568 states** (one per element)
and the walk reaches **3** masks. Its maximum walk depth is 246, under the code's 500 cap. The walk
recorded one hit per PATH, which is the climbing RSS.

**Why Econfig carries no candidate.** All four of its raster masks are drawn through a TRANSFORMED `use`
(`matrix(0.24, …)` ×3, `matrix(1, 0, 0, 1, 0, 1)` ×1), which the detector excludes by its own rule even
at `ring_bytes = -inf`; their rings are ≤ 0 anyway. So it is not a new carrier and section 7's corpus
pin (HeatMeas only) is unchanged.

## The fix and its equivalence

The walk visits each state once from its shallowest depth. That is exact while the feImage cycle guard
never blocks, i.e. while the walk graph is acyclic; a precheck over the same edges decides, and a cyclic
document takes the original walk (the argument is in `find_candidates`' docstring).

`equivalence.out`, re-run from this folder: **710 files, 0 mismatches**, every `Candidate` field and the
viewBox compared, at `RING_BYTES` (10 candidates) and at `-inf` (**482** candidates), memo on and off.
All 710 took the memoised walk. Econfig: 0.18 s, 1,797 calls, no candidate.

`figure-rings.py census` (what `figure-run.js` runs per figure, under a 600 s timeout whose expiry only
warns and leaves the ring gate unrun) on the committed Econfig SVG: **0.21 s**, valid JSON, no candidate.
The driver runs it on a figure's stripped artwork, which was not available here.

## The suite

`FIGTEXT_PYLIBS=./pylibs python3 test_figrings.py`, uncapped, on the full chemistry corpus at
`a5f5b3750`: **ALL PASS, 50 checks, 0 skipped, 55 s** — its first verdict on the full corpus since the
corpus outgrew it. New section 6b runs BEFORE the sweep, so a broken memo fails in a second instead of
hanging.

**Mutants** (each applied to a golden copy, run under `timeout 90`, restored and `cmp`-checked):

| mutant | result |
|---|---|
| memo off (`use_memo = False`) | 6b FAILS at once (`{'mode': 'paths', 'visits': 196605}`); the run then hangs on Econfig until the cap, exit 124 — the failure prints first |
| state keyed on the element alone | 6b's over-merge control FAILS (1 candidate, not 2), and so does its agreement with the original walk |
| cycle check off | 6b's cycle check FAILS (`mode: memo` on a cyclic document) |

## How it was produced

Scripts run from a scratch directory, then copied here with their absolute paths replaced by paths
resolved from the file's own location; `equivalence.py` was re-run from this folder and its output is
the one kept. The census was run as
`python3 -u walk-cost-census.py books/efnafraedi-2e/media` from the repository root.
