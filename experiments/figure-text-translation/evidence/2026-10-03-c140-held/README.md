# §C140 ㊾ D5(a) — the real geometry `heldBlockValues` is designed and tested against

> **FROZEN EVIDENCE.** Written by PR-A Part 5 (branch `feat/c140-c49-step2-code-fixes`). Status lives in the
> campaign register (§C140 ㊾ and its ⏩ RESUME), never here. Design:
> `docs/superpowers/specs/2026-10-03-c140-step2-part5-heldblockvalues-design.md` (D-c table, edit 0). Value sheet:
> `docs/handoffs/2026-10-03-step2-value-sheet.md`.

## Files

| File | What it is | Read by |
|---|---|---|
| `held-geometry.json` | The 13 value-sheet blocks (7 figures): each block's key, index, `send`, line counts, its runs **verbatim from runs.json**, and its REAL `figcontainers.container_for` dict on the post-Parts-1–4 tree; per figure, `page`, the `meta.fonts` entries those runs use, and the sha256 of every input. | `test_figscripts.py` section HS (runs copied as literals), `test_heldplan.py`, `test_compose_held.py` |
| `held_geometry.py` | The instrument that wrote it. | — |
| `vs-dump.txt` | Human-readable dump of every value-sheet block (runs, lines, styles, tokens, container). | people only |
| `vs_dump.py` | Wrote `vs-dump.txt`. | — |
| `vs_prepare.sh` | Wrote the `vs-prepare/` directories both of the above read. | — |

**Tests read `held-geometry.json`. No test parses `vs-dump.txt`.** The JSON carries OpenStax figure text (Chemistry
2e, CC BY), like the committed code1 `runs.json` evidence.

## Two vintages — read before comparing the two files

- `vs-prepare/` and `vs-dump.txt` were produced on 2026-10-03 from the main checkout, whose `experiments/` and `tools/`
  were `a9fe1f031`'s (only docs commits followed it that day): **before Parts 1–4**. So the dump's `cls`/`align` column is HEAD's: for a multi-line block it is computed on `FT.lines`. buffer
  reads `align=right` there, and it is the only line of the dump that Parts 1–4 change (measured by re-running
  `vs_dump.py` on the post-Parts-1–4 tree). The prepare step that wrote `vs-prepare/` also predates Part 2 (§C161,
  `strip-text.py` drops PDF annotations); that cannot matter here: all 16 PDFs in the 8 directories (each converted
  source and each `artwork.pdf`) carry 0 `/Annots` entries (counted with pikepdf).
- `held-geometry.json` was written by the **post-Parts-1–4** tree (Part 3's `own_line_frames` and
  `figtext.visual_lines`). buffer reads `cell/center` there, as the design's D-c table says. Its `code` field holds
  the sha256 of each experiment module the instrument imported, so the tree it measured is identified by content,
  not by a branch-dependent commit.
- The design's own probe (`~/.cache/namsbokasafn-audit/2026-10-03-step2/tmp/p5-synth/probe.py`) read the same
  `vs-prepare/` directories, so this is the geometry the design measured.

## How to regenerate

Everything below is 0 ISK, and nothing here writes into the repository except `held-geometry.json`.

1. **The prepared directories (off-repo).** `vs_prepare.sh` resolves each of the 8 value-sheet figures with
   `sources.py --json efnafraedi-2e <basename>` (which needs `sources.local.json`, the local OpenStax art trees) and
   runs `figure-prepare.py <artwork> --basename <b> --out ~/.cache/namsbokasafn-audit/2026-10-03-step2/vs-prepare/<b>`,
   one figure at a time, printing `free -h` between them. It hard-codes the main checkout path (`E=`) and the
   output root (`O=`); edit those two lines on another machine. `figure-prepare.py` writes only into `--out`.
2. **The dump.** From `experiments/figure-text-translation/`:
   `FIGTEXT_PYLIBS=./pylibs PYTHONPATH=. python3 -B evidence/2026-10-03-c140-held/vs_dump.py > <scratch>/vs-dump.txt`
   (into scratch: the committed `vs-dump.txt` is frozen evidence and is never overwritten;
   `PYTHONPATH=.` is needed because the script does `import _deps` with no path set-up; its input root is
   hard-coded too). Measured: on the post-Parts-1–4 tree its output differs from the committed `vs-dump.txt` in
   exactly ONE line, buffer block 23's `align=center` against `align=right` — the vintage difference below.
3. **The JSON.** From this directory:

   ```bash
   FIGTEXT_PYLIBS=../../pylibs python3 -B -u held_geometry.py ~/.cache/namsbokasafn-audit/2026-10-03-step2/vs-prepare
   ```

   **It runs no composer.** It imports `figtext`, `figcontainers` and `blockkey`, opens each figure's stripped
   `artwork.pdf` and `artwork.png` as compose.py does, and calls `container_for`. It never imports or spawns
   compose.py, figure-compose.py, figure-prepare.py, `tools/figure-run.js` or `translate-blocks.mjs`, and it writes
   nothing into the prepared directories. The figures are read one at a time.

   Its terminal line is `HELD-GEOMETRY OK: 13 blocks in 7 figures -> held-geometry.json`. Any other ending is a
   refusal (`REFUSED: …`, exit 1, nothing written). It refuses unless every key sits at exactly the predicted block
   indices, each block has its predicted visual line count, no container is a detection error, and `figtext` has
   `visual_lines`. Measured: an index prediction changed to `[11, 13]` refuses at MattType, and buffer's visual line
   count changed to 2 (its `FT.lines` count) refuses at buffer. A re-run on the same inputs is byte-identical.

## What it measured (2026-10-03, post-Parts-1–4)

| Figure | Block | Key | Container | Visual lines (FT.lines) |
|---|---|---|---|---|
| CNX_Chem_01_02_MattType | 11, 13, 15 | `No` | open / center (b15: `rules-not-spanning`) | 1 (1) |
| CNX_Chem_07_04_HNO2_img | 8 | `or` | open / center | 1 (1) |
| CNX_Chem_09_05_MolSpeed1 | 13 | `02 at T = 300 K` | open / center | 1 (1) |
| CNX_Chem_14_02_phscale | 5, 87 | `100 or 1` | cell / center (L 21.00 R 69.67; L 70.67 R 119.34) | 1 (1) |
| CNX_Chem_14_06_buffer | 23 | `[CH3CO2H] is 11% of [CH3CO2\|–]` | cell / center, single margins 2.28 (L 99.72 R 236.72) | **1 (2)** |
| CNX_Chem_18_04_OxStNonmts | 2, 4 | `4+\|To\|4–`, `5+\|To\|3–` | cell / center, multi-ambiguous 0.32 | 3 (3) |
| CNX_Chem_20_04_amide1_img | 0 | `C\|H or R` | open / right, multi margin 9.75 | 2 (2) |
| CNX_Chem_20_04_amide1_img | 1, 2 | `R or H` | open / left (single-flush 1.25, ratio 60.0); open / center | 1 (1) |

Every block is `send: false`. `CNX_Chem_01_04_MYdCmIn` (value sheet C1–C3, "keep the English") gets no
`heldBlockValues` entry, so it is in `vs-prepare/` and the dump but not in the JSON.
