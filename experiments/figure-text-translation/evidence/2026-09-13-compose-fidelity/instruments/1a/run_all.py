#!/usr/bin/env python3
"""Batch: controls (i)(ii)(iii) + current composer scores for every bought figure.

Per figure (resumable; skips basenames already in fid/figures.jsonl):
  * Figure(b) in mode dark/T=128 (primary), plus sensitivity modes dark/200, diff/40, diff/96
  * control (i)  ours := src.png      -> every block must score iou1 == 1
  * control (ii) ours := artwork.png  -> every block must score iou1 == 0 (nB == 0)
  * ceiling (iii) runexact, hint none (primary) and hint default (hinting-noise pair)
  * current: fid/<b>/orig/control.png (compose.py --control, unmodified)
  * attribution validation: EXACT label maps (ceiling items for src side, compose.py's own
    ITEMS from the byte-identical tagged copy for ours side)
Writes: fid/blockscores.jsonl (one row per block, all metrics), fid/figures.jsonl
"""
import sys, json, math
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fidelity as F   # noqa: E402
import runexact_png as R  # noqa: E402

SP = F.SP
OUTB = SP / 'fid' / 'blockscores.jsonl'
OUTF = SP / 'fid' / 'figures.jsonl'
METRICS = ('nA', 'nB', 'iou0', 'iou1', 'iou2', 'p1', 'r1', 'ours_only1', 'src_only1',
           'c_al', 'c_no', 'w_ratio', 'h_ratio', 'src_hidden', 'src_diffink',
           'run_iou1_min', 'run_min_text', 'run_cal_max', 'run_cno_max', 'n_runs')
MODES = [('dark', 128), ('dark', 200), ('diff', 40), ('diff', 96)]


def clean(v):
    if isinstance(v, float):
        return None if math.isnan(v) else (999.0 if math.isinf(v) else round(v, 4))
    return v


def main(basenames):
    done = set()
    if OUTF.exists():
        done = {json.loads(l)['basename'] for l in OUTF.read_text().splitlines() if l.strip()}
    for b in basenames:
        if b in done:
            print('skip', b); continue
        figs = {m: F.Figure(b, mode=m[0], T=m[1]) for m in MODES}
        f = figs[('dark', 128)]
        prep = f.prep
        meta = f.meta
        ceil_items, ceil_stats = R.run_items(meta, f.blocks, fit_adv=True)
        ceil_none = F.surf_to_rgb(R.render(prep, ceil_items, meta, hint='none'))
        ceil_def = F.surf_to_rgb(R.render(prep, ceil_items, meta, hint='default'))
        current = F.load_rgb(f.fid / 'orig' / 'control.png')
        comp_items = json.loads((f.fid / 'tagged' / 'items-control.json').read_text())
        exact = dict(src=f.label_map(ceil_items, hint='none'),
                     ours=f.label_map(comp_items, hint='default'))
        exact_ceil = dict(src=exact['src'], ours=exact['src'])

        res = {}
        for m, fm in figs.items():
            tag = f'{m[0]}{m[1]}'
            imgs = [('src', fm.src, None), ('art', fm.art, None),
                    ('ceil', ceil_none, exact_ceil if m == ('dark', 128) else None),
                    ('ceild', ceil_def, None),
                    ('cur', current, exact if m == ('dark', 128) else None)]
            for name, img, ex in imgs:
                res[(tag, name)] = fm.score(img, exact=ex)

        figrow = dict(basename=b, n_blocks=f.nb, keys_match=f.keys_match, sidecar=f.sidecar_found,
                      shape=list(f.src.shape[:2]), reg_art_not_src=f.reg_art_not_src,
                      ceil_stats=ceil_stats, n_comp_items=len(comp_items))
        for (tag, name), (rows, fig) in res.items():
            figrow[f'{tag}.{name}'] = fig
        with OUTB.open('a') as fo:
            for bi in range(f.nb):
                row = dict(basename=b, block=bi, key=f.keys[bi], cls=f.cls[bi], **f.feat[bi])
                for (tag, name), (rows, fig) in res.items():
                    r = rows[bi]
                    if tag == 'dark128':
                        for k in METRICS:
                            row[f'{name}.{k}'] = clean(r[k])
                        for k in ('src_exact_n', 'src_lost_to_other', 'src_stolen_from_other',
                                  'ours_exact_n', 'ours_lost_to_other', 'ours_stolen_from_other',
                                  'src_nontext', 'ours_nontext'):
                            if k in r:
                                row[f'{name}.{k}'] = r[k]
                    else:
                        row[f'{tag}.{name}.iou1'] = clean(r['iou1'])
                        row[f'{tag}.{name}.nA'] = r['nA']
                fo.write(json.dumps(row, ensure_ascii=False) + '\n')
        with OUTF.open('a') as fo:
            fo.write(json.dumps(figrow, ensure_ascii=False) + '\n')
        cur = [x for x in res[('dark128', 'cur')][0]]
        cei = [x for x in res[('dark128', 'ceil')][0]]
        print(b, 'blocks', f.nb, 'ceil iou1 min', round(np.nanmin([x['iou1'] for x in cei] + [9]), 3),
              'cur iou1 min', round(np.nanmin([x['iou1'] for x in cur] + [9]), 3), flush=True)


if __name__ == '__main__':
    names = sys.argv[1:] or (SP / 'prep' / 'bought.txt').read_text().split()
    main(names)
