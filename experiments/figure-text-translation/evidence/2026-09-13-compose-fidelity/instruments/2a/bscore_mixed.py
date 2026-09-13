#!/usr/bin/env python3
"""MIXED browser scoring: src ink from the PDF-true pair (pdftocairo src.png vs pdftocairo artwork.png),
ours ink from the browser pair (Chromium render vs Chromium render of artwork.svg).  Text registration is then
judged against PDF coordinates, so a misregistered artwork.svg cannot masquerade as text error.
Controls per figure: (i') ours := src text ink pasted onto the browser artwork -> ~1.0 ; (ii') ours := browser art -> 0.
-> data/bscores_mixed.jsonl (resumable)"""
import sys, json, math, time
from pathlib import Path
import numpy as np
SP = Path('/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/d293cd29-19d8-4ccc-a2b3-244bf111501b/scratchpad')
sys.path.insert(0, str(SP / 'tools'))
import fidelity as F
OUT = SP / 'proto/data/bscores_mixed.jsonl'
M = ('nA', 'nB', 'iou1', 'run_iou1_min', 'run_min_text', 'run_cno_max', 'run_cal_max', 'c_al', 'c_no', 'w_ratio', 'h_ratio')
BR = SP / 'proto/brender'
IM = ('cur_ctl', 'proto_ctl', 'plus_ctl', 'cur_tr', 'proto_tr', 'plus_tr')
def c(v):
    if isinstance(v, float):
        return None if math.isnan(v) else (999.0 if math.isinf(v) else round(v, 4))
    return v
done = set()
if OUT.exists():
    done = {json.loads(l)['basename'] for l in OUT.read_text().splitlines() if l.strip()}
for b in (sys.argv[1:] or (SP / 'prep/bought.txt').read_text().split()):
    if b in done or not (BR / b / 'plus_tr.png').exists():
        continue
    t0 = time.time()
    f = F.Figure(b)                                  # src + art from pdftocairo: src ink computed here
    src_ink_mask = f.src_ink
    art_b = F.load_rgb(SP / 'proto/bprep' / b / 'artwork.png')
    f.art = art_b; f.art_dark = F.lum(art_b) < f.T   # ours ink now judged against the BROWSER artwork
    pasted = np.where(src_ink_mask[..., None], f.src, art_b)
    imgs = {'ctl_i': pasted, 'ctl_ii': art_b}
    for n in IM:
        imgs[n] = F.load_rgb(BR / b / f'{n}.png')
    res = {n: f.score(img)[0] for n, img in imgs.items()}
    with OUT.open('a') as fo:
        for bi in range(f.nb):
            row = dict(basename=b, block=bi, key=f.keys[bi], cls=f.cls[bi], **f.feat[bi])
            for n in imgs:
                for k in M:
                    row[f'{n}.{k}'] = c(res[n][bi][k])
            fo.write(json.dumps(row, ensure_ascii=False) + '\n')
    print(b, round(time.time() - t0, 1), flush=True)
