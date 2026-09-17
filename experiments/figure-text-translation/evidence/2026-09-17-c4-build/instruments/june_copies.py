#!/usr/bin/env python3
"""§C140 ④ S6 — do the June-vintage published copies carry the same lost graphics state? Read-only.

    cd experiments/figure-text-translation
    FIGTEXT_PYLIBS=./pylibs python3 -u evidence/2026-09-17-c4-build/instruments/june_copies.py <scratch-dir>

For each figure: render the committed books/efnafraedi-2e/media/<b>_IS.svg in Chromium (render-check.mjs,
the reader's renderer) at the source raster's pixel size, render the source artwork with pdftocairo at 200 dpi,
and save a side-by-side crop of the region the exploration found the strip damages. Prints the crop paths and
DONE. Judgement is by LOOKING at the crops; the numbers are only the crop boxes.
"""
import subprocess, sys, tempfile
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve()
EXP = HERE.parents[3]
REPO = EXP.parents[1]
sys.path.insert(0, str(EXP))
import _deps  # noqa: F401,E402
import sources as S  # noqa: E402

# (basename, crop box in 200-dpi source pixels: left, top, right, bottom) — the exploration's PERSIST-vs-ORIG
# bbox_gt40 (evidence/2026-09-16-c4-explore/render/results.jsonl.gz) with a 20 px margin
# (Egeom: the line-dash-wedge row; IcePack: the lettering).
FIGURES = [('CNX_Chem_07_06_Egeom', (311, 358, 1230, 690)), ('CNX_Chem_05_02_IcePack', (116, 166, 564, 280))]


def main(scratch):
    scratch = Path(scratch)
    scratch.mkdir(parents=True, exist_ok=True)
    cfg = S.load_config()
    trees = S.load_trees('efnafraedi-2e', cfg)
    for b, box in FIGURES:
        svg = REPO / 'books/efnafraedi-2e/media' / f'{b}_IS.svg'
        d = S.resolve_detail(b, trees, cfg['editionPrecedence'])
        src = Path(d['path'])
        base = scratch / f'{b}-source'
        subprocess.run(['pdftocairo', '-png', '-r', '200', '-singlefile', str(src), str(base)], check=True)
        s_img = Image.open(f'{base}.png')
        w, h = s_img.size
        june = scratch / f'{b}-june.png'
        subprocess.run(['node', str(EXP / 'render-check.mjs'), str(svg), str(june), str(w), str(h), '1'],
                       check=True, cwd=str(EXP))
        j_img = Image.open(june).convert('RGB').resize((w, h))
        box = box or (0, 0, w, h)
        pair = Image.new('RGB', (2 * (box[2] - box[0]), box[3] - box[1]), 'white')
        pair.paste(s_img.convert('RGB').crop(box), (0, 0))
        pair.paste(j_img.crop(box), (box[2] - box[0], 0))
        out = HERE.parents[1] / 'reports' / 'before' / f'june-{b}.png'
        pair.save(out)
        print(f'{b}: source {w}x{h}; crop {box} -> {out}', flush=True)
    print('DONE')


if __name__ == '__main__':
    main(sys.argv[1])
