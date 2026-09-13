#!/usr/bin/env python3
"""r2v-numbers step 1: V0 control gate from RAW files (not run-V0.json).
- r2/work/V0/<b>/items.json vs prep/figs/<b>/items.json (JSON-equal and byte-equal)
- translated.png pixel identity (numpy)
- compose-report.json V0 vs prep (full equality)
- layout-block set per tag equals V0's (basename, block) with path=='layout'
- kept (non-layout) items identical to prep for every tag except _dec
Planted positive controls: mutate one item in memory; mutate one pixel in memory.
"""
import json, sys, hashlib, copy
from pathlib import Path
sys.path.insert(0, '/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/pylibs')
sys.path.insert(0, '/home/siggi/dev/scratch-c140/c3/pylibs-np')
import numpy as np
from PIL import Image

ROOT = Path('/home/siggi/dev/scratch-c140')
PREP = ROOT / 'prep'; R2 = ROOT / 'r2'
names = [f['basename'] for f in json.loads((PREP / 'manifest.json').read_text())['figures']]
TAGS = ['V0', 'V5_p2.0_f7.0', 'V5_p2.0_f7.5', 'V5_p2.0_f8.0', 'V5_p2.5_f7.0', 'V5_p2.5_f7.5', 'V5_p2.5_f8.0',
        'V5_p2.0_f7.5_dec', 'V5_p2.0_f7.5_notr', 'CTRL_V5_p2.0_f9.0']
print('figures in manifest', len(names), 'distinct', len(set(names)))

def load(p):
    return json.loads(Path(p).read_text())

res = {}
# --- V0 identity ---
it_eq = byte_eq = png_eq = rep_eq = 0
bad = []
for b in names:
    a = R2 / 'work/V0' / b; p = PREP / 'figs' / b
    ia, ip = load(a / 'items.json'), load(p / 'items.json')
    if ia == ip: it_eq += 1
    else: bad.append(('items', b))
    if (a / 'items.json').read_bytes() == (p / 'items.json').read_bytes(): byte_eq += 1
    xa = np.asarray(Image.open(a / 'translated.png').convert('RGB')); xp = np.asarray(Image.open(p / 'translated.png').convert('RGB'))
    if xa.shape == xp.shape and (xa == xp).all(): png_eq += 1
    else: bad.append(('png', b))
    if load(a / 'compose-report.json') == load(p / 'compose-report.json'): rep_eq += 1
    else: bad.append(('report', b))
print(f'V0 vs prep: items JSON-equal {it_eq}/34, items byte-equal {byte_eq}/34, png pixel-equal {png_eq}/34, report equal {rep_eq}/34; bad={bad}')
# planted controls
b = names[0]
ip = load(PREP / 'figs' / b / 'items.json'); m = copy.deepcopy(ip); m[0]['x'] += 0.001
print('PLANT items x+0.001 detected:', m != ip)
xp = np.asarray(Image.open(PREP / 'figs' / b / 'translated.png').convert('RGB')).copy(); xm = xp.copy(); xm[5, 5, 0] ^= 1
print('PLANT one pixel channel flip detected:', not (xm == xp).all())

# --- layout set per tag, kept identity per tag ---
V0set = set()
for b in names:
    for it in load(PREP / 'figs' / b / 'items.json'):
        if it['path'] == 'layout': V0set.add((b, it['block']))
print('prep layout blocks', len(V0set))
for T in TAGS:
    s = set(); kept_eq = 0; kept_diff = []
    for b in names:
        its = load(R2 / 'work' / T / b / 'items.json')
        s |= {(b, it['block']) for it in its if it['path'] == 'layout'}
        k = [it for it in its if it['path'] != 'layout']
        kp = [it for it in load(PREP / 'figs' / b / 'items.json') if it['path'] != 'layout']
        if k == kp: kept_eq += 1
        else: kept_diff.append((b, sum(1 for x, y in zip(k, kp) if x != y) + abs(len(k) - len(kp))))
    print(f'{T:22} layout blocks {len(s)} equal-to-prep-set {s == V0set}  kept items == prep {kept_eq}/34  differ {kept_diff}')
