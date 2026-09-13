# Evidence — compose fidelity investigation, 2026-09-13

> 🧊 **FROZEN.** Cited by [`../../COMPOSE-FIDELITY.md`](../../COMPOSE-FIDELITY.md), which is the
> readable summary. Nothing here is status.

A 10-agent investigation (6 producers, 4 adversarial verifiers) ran against a scratch directory on a
tmpfs that no longer exists. **Every `scratchpad/…` path inside `reports/` is dead.** What was worth
keeping was copied here; the rest (prepared figure dirs, ~2 GB of renders) is regenerable for free
with `figure-prepare.py` + `compose.py --control`.

| dir | contents |
|---|---|
| `reports/` | the 11 findings files as written. Producers: `1a-instrument`, `1b-census` (+ `1b-tables`), `1c-sidecar`, `1d-completeness`, `2a-prototype`, `2b-translated`. Verifiers: `verify-*`. **Where a verifier corrected a producer, the verifier wins** — `COMPOSE-FIDELITY.md` already applies those corrections. |
| `instruments/1a` | `fidelity.py` (per-block pixel scorer), `runexact_png.py` (faithful redraw), `planted.py`, `run_all.py`. ⚠️ The planted calibration was rendered in a contaminated cairo state — see `reports/verify-pixel-instrument-and-prototype.md` §V3. |
| `instruments/1b` | the corpus census (`census.py`, `enum.cjs`, `resolve.py`, `summarize.py`). Its 20 MB JSONL was not kept; re-run it. |
| `instruments/1d` | ink-over-artwork, strip-text graphics-state variant, in-BT operator scan, browser widths, glyph census. |
| `instruments/2a` | **`compose.run-exact.diff` / `svgout.run-exact.diff` — the prototype, as diffs against the repo files at `4c0507cc`.** Plus the STIX re-embedding, plus-variant, registration and browser-scoring scripts. |
| `instruments/2b` | formatting-transfer feasibility (`analyse.py`, `transfer.py`). |
| `instruments/verify` | `harness.mjs` (drives the REAL driver/publisher/review service on throwaway roots), `blind.py` (defects the instrument cannot see), June-SVG raster census. |
| `data/` | `1a-blocks.jsonl` (per-block scores), `2b-translated.jsonl` (per-block formatting + token verdicts). |
| `images/` | the renders the conclusions rest on. `*__stack_*` = source / published / prototype / prototype+ (FishLemon cropped to its formula strips). |

Scripts reference their original scratch locations and will need paths adjusted to run again.
