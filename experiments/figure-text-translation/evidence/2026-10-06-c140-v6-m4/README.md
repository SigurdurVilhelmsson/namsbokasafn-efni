# §C140 '6', M4 — the runs and pre-M4 decide records the column and pitch rules are tested on

> **FROZEN EVIDENCE.** Written for the composer's '6' PR-A, task T2 (M4: A2v and P1v). Status lives in the
> campaign register, never here. Design: `docs/superpowers/specs/2026-10-05-c140-composer-formatting-class-design.md`,
> D-d (A2v) and D-e (P1v).

## Files

| File | What it is | sha256 |
|---|---|---|
| `CNX_Chem_05_02_FoodLabel.runs.json` | the prepared figure's `runs.json`, whole | `3c937151cd5798cf1daa299ff25eb4ce9b2854c4b7541743504daf220b8a10ec` |
| `CNX_Chem_14_03_strong.runs.json` | the prepared figure's `runs.json`, whole | `049d842f537bbc0a0a9551a61721875abfa2972768ec4d6d90b4fd5cd404849f` |
| `CNX_Chem_00_AA_PeriodicPU_img.runs.json` | the prepared figure's `runs.json`, whole | `9c62879418efce25bfe5d3ae0011d94ebfa3ebfa8b7a8d8de26a7e88ee4c3a6b` |
| `base-records.json` | 21 pre-M4 `figlayout.decide` records (FoodLabel 7/8/11/16/40/45, strong 9, PeriodicPU_img 221/407, FracDistil 2, MassSpec 4, HazDiamond 2–6/8–12), keyed `{figure: {block index: record}}` | `0ee4ea68e9d68f5a2890e3a13f4e0189cd99fdd77a51fa215b1629b04befba27` |

All four are read by `test_column_pitch.py` and by nothing else. That test walks the BLOCKS of the three figures
whose `runs.json` is here (`figcontainers.column_side` counts sibling lines across the whole figure); it reads
FracDistil, MassSpec and HazDiamond through `base-records.json` only, so their `runs.json` is not committed.

## Provenance

- **The three `runs.json`**: copied byte for byte from the shared prepared directories
  `~/.cache/namsbokasafn-audit/c140-composer-design/shared-prep/<figure>/runs.json` (off-repo; `cmp` equal on
  2026-10-06), written by `figure-prepare.py` at `00bdf00da` from the chemistry-2e source PDFs.
- **`base-records.json` — a CAPTURE, NOT REGENERABLE from committed code.** Each record is one call of
  `figlayout.decide` inside a real `compose.py` run of the pre-M4 composer (repo `00bdf00da`), recorded by a
  scratch-only `sitecustomize.py` tracer that wrapped `decide` and dumped, per call, the block index, the `cues`
  (`n_src`, `sz0`, `starts`, `ends`, `projs`) and the scalar fields of the `container` exactly as compose.py
  passed them, plus the result's `align`, `lead`, `top` and `n` (= its line count). The tracer lived in the M4
  design run at `~/.cache/namsbokasafn-audit/c140-composer-design/m4-align-pitch/hook/`; the full traces are that
  run's `base/<figure>/m4-trace.json`. All 21 records were re-compared on 2026-10-06 against those traces (cues,
  container, align, lead, top): 21 match, 0 differ. Trace sha256:
  - FoodLabel `c18dd2d626c457a5fe9f6ded6069a79d8553c41a07f1c1c8124ac2bcbee5c988`
  - strong `b49b2a21cda06ce352bafee343e3740184b9796e6115769f01191bfe8942e522`
  - PeriodicPU_img `f9a6b8c8b7c861694eb0fa479ce31f3ad08d8d157dd78a9890aced5af2add9db`
  - FracDistil `91f5d9b1c3898b7919f04e9a6a2c11ad2eb2435358b176579fb30406977b59b4`
  - MassSpec `56f2cd0b4b4097f5db6e227ae0055f0a59584cb7a19722c03ecf0029d0060fda`
  - HazDiamond `11ec3372ba23e2315ef88713b0b77ee5d9dc5372babafab19121f186f5887d49`
- The records predate M2. FoodLabel block 45 (`more is| `) carries `n_src` 2 there; the M2 composer folds that
  line and builds `n_src` 1, so the C-4 case is a hand-built cue shape, as its docstring says.
- Cut on 2026-10-05 by the M4 design work (`m4-align-pitch/tests/fixtures/` in that scratch tree) and committed
  byte for byte.

The JSON carries OpenStax figure text (Chemistry 2e, CC BY), like the other committed `runs.json` evidence.
