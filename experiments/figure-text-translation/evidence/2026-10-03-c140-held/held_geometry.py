#!/usr/bin/env python3
"""§C140 ㊾ D5(a) - the REAL geometry of the 13 value-sheet blocks that `heldBlockValues` draws, as JSON.

    FIGTEXT_PYLIBS=../../pylibs python3 -B -u held_geometry.py <vs-prepare dir> [--out held-geometry.json]

Run from this directory. `<vs-prepare dir>` holds one `figure-prepare.py` output directory per
figure (`vs_prepare.sh` writes them). The figures are read ONE AT A TIME: a figure's page and
raster are dropped before the next is opened.

WHAT IT WRITES (and nothing else): `held-geometry.json`, next to this file unless `--out` says
otherwise, replaced atomically (`.tmp` + rename) and only after every check below passed.
  figures.<basename>.page     meta.json `page` ([width, height] in pt)
  figures.<basename>.fonts    the meta.json `fonts` entries the held blocks' runs use, verbatim
  figures.<basename>.inputs   sha256 of each input file read
  figures.<basename>.blocks   one entry per held block, in block order:
      key          blockkey.block_key (the `heldBlockValues` key)
      block        the block's index in FT.merge_blocks(FT.group(runs)) - compose.py's BI
      send         blocks.json's `send` for that index
      ftLines      len(FT.lines(block))        - the KEY's line count ('|'-separated)
      visualLines  len(FT.visual_lines(block)) - the count a held value must match (design D-b)
      runs         the block's runs, verbatim from runs.json
      container    figcontainers.container_for(...) on the stripped artwork - post-Part-3
  code        sha256 of each experiment module this instrument imports: the tree it measured
No timestamp and no checkout path is written, so a re-run on the same inputs and the same module
bytes reproduces the file byte for byte.

IT RUNS NO COMPOSER. It imports figtext, figcontainers and blockkey and calls
`figcontainers.load_page` / `container_for` exactly as compose.py does before laying a label out.
Nothing here imports or spawns compose.py, figure-compose.py, figure-prepare.py, tools/figure-run.js
or translate-blocks.mjs, and nothing is written into the prepared directories.

THE PREDICTION (design docs/superpowers/specs/2026-10-03-c140-step2-part5-heldblockvalues-design.md,
D-c table), registered here before the run; any difference REFUSES (exit 1, nothing written):
  * exactly the block indices in TARGETS carry each key (13 blocks in 7 figures);
  * each block's visual line count is the one in TARGETS (buffer 1 - Part 3 merges its charge line;
    OxStNonmts 3; amide1's `C|H or R` 2; every other 1);
  * no container is a detection error (`why` starting `error:`);
  * figtext has `visual_lines` (the post-Parts-1-4 tree).
"""
import argparse
import hashlib
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parents[1]                       # evidence/<this dir>/ -> experiments/figure-text-translation
sys.path.insert(0, str(EXP))

import _deps                                # noqa: E402,F401 - FIGTEXT_PYLIBS -> sys.path (pdfplumber, Pillow)
import figtext as FT                        # noqa: E402
import figcontainers as FC                  # noqa: E402
from blockkey import block_key              # noqa: E402
from PIL import Image                       # noqa: E402

# basename -> {key: (expected block indices, expected visual line count)} - the D-c table's 13 rows.
TARGETS = {
    'CNX_Chem_01_02_MattType': {'No': ([11, 13, 15], 1)},
    'CNX_Chem_07_04_HNO2_img': {'or': ([8], 1)},
    'CNX_Chem_09_05_MolSpeed1': {'02 at T = 300 K': ([13], 1)},
    'CNX_Chem_14_02_phscale': {'100 or 1': ([5, 87], 1)},
    'CNX_Chem_14_06_buffer': {'[CH3CO2H] is 11% of [CH3CO2|–]': ([23], 1)},
    'CNX_Chem_18_04_OxStNonmts': {'4+|To|4–': ([2], 3), '5+|To|3–': ([4], 3)},
    'CNX_Chem_20_04_amide1_img': {'C|H or R': ([0], 2), 'R or H': ([1, 2], 1)},
}
INPUTS = ('meta.json', 'runs.json', 'blocks.json', 'artwork.pdf', 'artwork.png')
CODE = ('figtext.py', 'figcontainers.py', 'blockkey.py', 'numloc.py', '_deps.py')


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def refuse(msg):
    print(f'REFUSED: {msg}', flush=True)
    sys.exit(1)


def figure(d, basename, targets):
    """-> the figure's JSON entry. Opens the figure's page and raster, and drops them on return."""
    meta = json.loads((d / 'meta.json').read_text())
    runs = json.loads((d / 'runs.json').read_text())
    bj = json.loads((d / 'blocks.json').read_text())
    if Path(meta['source']).stem != basename:
        refuse(f'{d}: meta.json source {meta["source"]!r} is not {basename}')
    blocks = FT.merge_blocks(FT.group(runs))
    if len(bj) != len(blocks):
        refuse(f'{basename}: blocks.json has {len(bj)} entries, the runs make {len(blocks)} blocks')
    page = FC.load_page(d / 'artwork.pdf')
    with Image.open(d / 'artwork.png') as im:
        dark = im.convert('L')
    h_pt = meta['page'][1]
    found = {k: [] for k in targets}
    out, used = [], set()
    for bi, blk in enumerate(blocks):
        key = block_key(blk)
        if key not in targets:
            continue
        if bj[bi]['key'] != key:
            refuse(f'{basename} block {bi}: blocks.json key {bj[bi]["key"]!r} != block_key {key!r}')
        found[key].append(bi)
        vl = len(FT.visual_lines(blk))
        if vl != targets[key][1]:
            refuse(f'{basename} block {bi} {key!r}: {vl} visual line(s), predicted {targets[key][1]}')
        cont = FC.container_for(bi, blocks, page, dark, h_pt)
        if str(cont.get('why', '')).startswith('error:'):
            refuse(f'{basename} block {bi} {key!r}: container detection raised ({cont["why"]})')
        json.dumps(cont)                    # a container that cannot be written is a refusal, here
        used.update(r['font'] for r in blk)
        out.append(dict(key=key, block=bi, send=bj[bi].get('send'), ftLines=len(FT.lines(blk)),
                        visualLines=vl, runs=blk, container=cont))
    for k, (want, _) in targets.items():
        if found[k] != want:
            refuse(f'{basename} {k!r}: found at blocks {found[k]}, predicted {want}')
    return dict(page=meta['page'], fonts={f: meta['fonts'][f] for f in sorted(used)},
                inputs={n: sha256(d / n) for n in INPUTS}, blocks=out)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('prepared', help='the vs-prepare directory (one figure-prepare.py output per basename)')
    ap.add_argument('--out', default=str(HERE / 'held-geometry.json'))
    a = ap.parse_args()
    if not hasattr(FT, 'visual_lines'):
        refuse('figtext has no visual_lines - run this on the post-Parts-1-4 tree (§C140 ㉑)')
    root = Path(a.prepared).expanduser().resolve()
    figures = {}
    for basename in TARGETS:
        d = root / basename
        if not d.is_dir():
            refuse(f'{d} is not a directory - run vs_prepare.sh first')
        figures[basename] = figure(d, basename, TARGETS[basename])
        n = len(figures[basename]['blocks'])
        print(f'  {basename}: {n} held block(s) '
              + ' '.join(f"b{b['block']}={b['container']['cls']}/{b['container']['align']}"
                         f"/vl{b['visualLines']}" for b in figures[basename]['blocks']), flush=True)
    doc = {
        '_README': ('§C140 ㊾ D5(a): the REAL runs and post-Part-3 containers of the 13 value-sheet blocks. '
                    'Written by held_geometry.py (see README.md); read by test_heldplan.py, test_figscripts.py '
                    'section HS and test_compose_held.py. OpenStax figure text, CC BY.'),
        'code': {m: sha256(EXP / m) for m in CODE},
        'figures': figures,
    }
    out = Path(a.out)
    tmp = out.with_name(out.name + '.tmp')
    tmp.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    os.replace(tmp, out)
    total = sum(len(f['blocks']) for f in figures.values())
    print(f'HELD-GEOMETRY OK: {total} blocks in {len(figures)} figures -> {out.name}', flush=True)


if __name__ == '__main__':
    main()
