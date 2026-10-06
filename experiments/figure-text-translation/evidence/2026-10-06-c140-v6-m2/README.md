# §C140 '6', M2 — FoodLabel's purple cell, the runs a spaces-only visual line is tested on

> **FROZEN EVIDENCE.** Written for the composer's '6' PR-A, task T1 (M2). Status lives in the campaign register,
> never here. Design: `docs/superpowers/specs/2026-10-05-c140-composer-formatting-class-design.md`, D-b (ruling
> R-17).

## Files

| File | What it is | Read by |
|---|---|---|
| `foodlabel-purple-runs.json` | The 11 runs of `CNX_Chem_05_02_FoodLabel` blocks 41–46 (`Quick\|guide to\|% DV`, `(cid:127) 5% or less\| `, `is low`, `(cid:127) 20% or\| `, `more is\| `, `high`), the `PAGE/TT1` font entry those runs use, and a `containers` snapshot. | `test_figtext_blank_lines.py`, `test_heldplan.py` (HP19–HP23), `test_compose_blank_lines.py` |

sha256 `ab0ff47f9778cbe2f002cd7f4dd35b086f4191214b14cdd3c00abf5d54c1c39d`.

## Provenance

- **`runs`**: entries 90–100 of the prepared figure's `runs.json`, copied verbatim and in order (each one compared
  equal, as a dict, to its source entry on 2026-10-06). Source: the shared prepared directory
  `~/.cache/namsbokasafn-audit/c140-composer-design/shared-prep/CNX_Chem_05_02_FoodLabel/runs.json`
  (sha256 `3c937151cd5798cf1daa299ff25eb4ce9b2854c4b7541743504daf220b8a10ec`), off-repo, written by
  `figure-prepare.py` from the chemistry-2e source PDF. `figtext.group` + `merge_blocks` on these 11 runs alone
  reproduce the figure's six block keys.
- **`fonts`**: the `PAGE/TT1` entry of that directory's `meta.json` (sha256
  `533851e73da9f4379e9a4dc0e19fc64bda095af637a4d4c24472053859791678`), verbatim.
- **`containers`**: `figcontainers.container_for` on the FULL figure (its `artwork.pdf`, sha256
  `39e641f79f3e9050c56eb5fb6ce3d38bee4986de6a30e0e64c3f00c6e78896da`, and `artwork.png`), run with the code
  BEFORE M2 (`container_for` reads no visual line), keyed by the block's index within this fixture (`"0"` is
  `Quick|guide to|% DV`; `"1"`, `"3"`, `"4"` are the three blocks with a spaces-only line). Every block sits in one
  `cell`, `fill-rect`. `_containers` is the description string of that snapshot, not data.
- Cut on 2026-10-05 by the M2 design work (`m2-wsline/tests/foodlabel-purple-runs.json` in that scratch tree) and
  committed byte-for-byte.

The JSON carries OpenStax figure text (Chemistry 2e, CC BY), like the other committed `runs.json` evidence.
