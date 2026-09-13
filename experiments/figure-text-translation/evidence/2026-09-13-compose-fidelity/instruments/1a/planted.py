#!/usr/bin/env python3
"""Control (iv): PLANTED defects on the run-exact ceiling, scored by the same instrument.

For every block of every figure and for both hint settings of the ceiling:
  shift  (dx, dy) in device px: (±1..3, 0), (0, ±1..3)   -- the block's runs re-rendered offset
  flatten                                                -- has_script blocks only: every run at
                                                            the block's max size on its line's
                                                            main baseline (compose.py's flattening)
Writes fid/planted.jsonl (resumable per basename).
"""
import sys, json, math
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import fidelity as F, runexact_png as R   # noqa: E402

OUT = F.SP / 'fid' / 'planted.jsonl'
SHIFTS = [(1, 0), (2, 0), (3, 0), (-2, 0), (0, 1), (0, 2), (0, 3), (0, -2)]
KEEP = ('nA', 'nB', 'iou0', 'iou1', 'iou2', 'p1', 'r1', 'c_al', 'c_no', 'w_ratio', 'h_ratio',
        'run_iou1_min', 'run_min_text', 'run_cal_max', 'run_cno_max', 'n_runs')


def c(v):
    if isinstance(v, float):
        return None if math.isnan(v) else (999.0 if math.isinf(v) else round(v, 4))
    return v


def main(names):
    done = set()
    if OUT.exists():
        done = {json.loads(l)['basename'] for l in OUT.read_text().splitlines() if l.strip()}
    for b in names:
        if b in done:
            print('skip', b); continue
        f = F.Figure(b)
        rows = []
        for hint in ('none', 'default'):
            for bi in range(f.nb):
                defects = [('shift', s) for s in SHIFTS]
                if f.feat[bi]['has_script']:
                    defects.append(('flatten', None))
                for kind, s in defects:
                    items, _ = R.run_items(f.meta, f.blocks,
                                           shift=(bi, s[0], s[1]) if kind == 'shift' else None,
                                           flatten=bi if kind == 'flatten' else None)
                    img = F.surf_to_rgb(R.render(f.prep, items, f.meta, hint=hint))
                    r = f.score_block(img, bi)
                    rows.append(dict(basename=b, block=bi, key=f.keys[bi], hint=hint, kind=kind,
                                     dx=s[0] if s else None, dy=s[1] if s else None,
                                     **{k: c(r[k]) for k in KEEP}))
        with OUT.open('a') as fo:
            for r in rows:
                fo.write(json.dumps(r, ensure_ascii=False) + '\n')
        print(b, len(rows), flush=True)


if __name__ == '__main__':
    main(sys.argv[1:] or (F.SP / 'prep' / 'bought.txt').read_text().split())
