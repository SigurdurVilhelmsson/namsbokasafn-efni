# Adversarial numbers verifier: §C140 t23 predictions

**Verdict:** my own code **refutes none of the pass marks** in `plan/pred/PREDICTIONS.md`, and none of the module builders' real-data claims. There are two low-severity disagreements:

- **Precision.** Five "production" margins are quoted to 3 dp but computed from a 2-dp-rounded frame.
- **Spec text.** The spec gives the exocytosis reference cost after the fix as 2^12.4. The measured value is 2^12.24.

No count, list, verdict or 2-dp census number disagrees.

Cost: 0 ISK. No MT, and `figure-run.js` was never run. The repo was read-only throughout: `git status --porcelain` printed 0 lines, and `find -newer` found 0 files (a positive control over my own directory found 38). I set `PYTHONDONTWRITEBYTECODE=1` on every Python run.

## How it was independent
Everything is under `/home/siggi/dev/scratch-c140/plan/review-num/`. Every script writes a `.txt` log and a `.json`. Nothing imports `plan/pred/instruments`.

- **`fw.py`** measures widths from fontTools hmtx advances; it uses no cairo. Its widths equal the build's pen advance to <1e-9. The build's widths are exact multiples of 1/2048 em (`Prósentusamsetning` = 18670 units).
- **`t1_records.py` and `t1_check.py`** build per-block records from the build's raw `items.json` and `compose-report.json` (`tree-int/work/C`). The records use my own run of `figcontainers.container_for` and my own hinted cairo advances. Checked from them: classes, steps, sizes, overflow, lines, R9, margins, centring, cells, named positions, item identity and adjacency.
- **`t1b.py`**: the TEXT sentinel with geometric regrouping and planted controls, the changed-vs-V0 count with my own frame, and a from-scratch implementation of the shared script rule over the source runs.
- **`t2_modules.py`**: the figcontainers deviation tables, the numloc checks (my own R3), and the integration stage A/B/C comparisons.
- **`t3_svgfix.py`, `t3b_lerp_semantics.py`, `t3c-refgraph-*.txt`**: byte and use-site checks, my own classifier of which blend paints can be collapsed, and refgraph re-runs.
- **`t4_raster.py`**: my own re-implementation of the census raster definitions (ink, off-page, spill region, glyph boxes, text collision), hinted and linear.
  - **Positive control:** it reproduces the frozen `measure-V0` and `measure-V5_p2.0_f7.5` pixel fields exactly, 176/176.
  - On FINAL it gives hits 1 (combmap b8 40 px), Σ 41, spill 181/156, off-page 0 and text collision 0. The linear raster gives 33/132 (final) and 32/119 (prototype).
- **`t5_verdicts.py`**: recoded verdict definitions give problem 4, unresolved 4/50, census union 14, rank (4,4,7,7,6.0,0), and the transitions.
- **`t6_sentinel_d.py`**: box centring 66/66. Cell alignment is 25/26 with hinted advances (chloroform b2 fails, exactly as predicted) and 26/26 with linear advances.
- **`t7_attrib.py`, `t8_position_counts.py`**: the hinted-vs-linear arithmetic behind each attributed decision, the fragility margins (0.035 / 0.109 / 0.141 / 0.249 / 0.250 / 0.252), and the mover counts 31 / 157 / 19.
- **`t9_proto_column.py`**: the prototype column, read back from frozen data. Every value matches.

## Disagreements (both numbers, same population)
1. **Production margins, 5 blocks.** The predicted values come from the measure rows' 2-dp `drawn_frame` (`supplementary.py:191`), so the third decimal is noise:

| block | predicted (L / R) | exact (L / R) |
|---|---|---|
| combmap b8 | −4.931 / −4.939 | −4.936 / −4.936 |
| empform b8 | 2.057 / 2.056 | 2.054 / 2.054 |
| flowchart b13 | 1.706 / 1.704 | 1.708 / 1.708 |
| flowchart b14 | 1.456 / 1.954 | 1.458 / 1.958 |
| combmap b10 | 2.333 / 2.327 | 2.329 / 2.329 |

   Boxes are exactly centred (max deviation 5.7e-14), so their "asymmetry" is an artefact, and flowchart b13's overhang is split exactly evenly. Fix: compute from unrounded x0 and width, or compare at ±0.01.
2. **Spec §3.** The collapsed exocytosis costs 4835 = **2^12.24**, not 2^12.4. "brain and map2: 18" is a raw cost (log2 4.2). This confirms the svgfix builder's named disagreement.

## Not disagreements: my own harness, or the predictor's shorthand
- **`A/B`** means `A` in flowchart b10 and `B` in b11.
- **"81 gaps"** is 81 of the **110** consecutive segment pairs in the 34 styled blocks.
- **"294 token lines"** is also 294 `FT.lines`, so the stacked-split attach fires 0 times on the 34. That rule is unexercised on real data.
- **"52/52 stretches"**: 52 styled source runs match 52 drawn items, 1:1 per block, because no token repeats here. The counting unit could diverge on other data.
- **numloc** changes 35 kept items, and here every one is a single-run block, so items equal runs.
- **"x0 on 162"** is 161 centre- or right-aligned blocks plus ethene b0, which is left-aligned but displaced by step ii.
- **Open-block centre anchor.** It is the mean of the source line centres (`figlayout.src_anchor`), not the frame centre. On moleratio2 b3 those are 114.66515 vs 114.6636. The 0.141 margin agrees either way.
- **Cells are vertically anchored on source baselines** (`figlayout.py:253`). So on the shrunk cells (alsulfatemass b2, aspirin b2 at 8.5; chloroform b2 at 8.75) the drawn glyph-box centre sits 0.13 / 0.065 pt below the source glyph-box centre. vdisp is 0 on 26/26 as predicted.

## Not independently re-derived
- **Leave-one-out and forward-chain attributions.** Examples: R9 moves x0 on 21 blocks; adv cues move x0 on 76; copperMoles b1 flips in leave-one-out. Re-deriving these needs `decide()` re-run on switched inputs. My arithmetic checks cover the decision movers.
- **The two unrewritten exocytosis add ops.** I did not check that the 3 are *screen* beyond the count arithmetic (48 screen blends − 45 rewritten).
- **The inverted-alpha mask (Mb).** My classifier does not check it.
