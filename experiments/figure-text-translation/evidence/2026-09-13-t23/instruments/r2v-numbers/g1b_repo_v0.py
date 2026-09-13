#!/usr/bin/env python3
"""Independent V0 control: run a cmp-verified COPY of the repo's unpatched compose.py (0 ISK, local drawing only)
into r2v-numbers/repo_v0/<b>/, then compare translated.png (pixels) and compose-report.json with r2/work/V0.
Positive control: a translated.png from r2/work/V5_p2.0_f7.0 must differ for figures with layout blocks."""
import json, os, subprocess, sys
from pathlib import Path
sys.path.insert(0, '/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/pylibs')
sys.path.insert(0, '/home/siggi/dev/scratch-c140/c3/pylibs-np')
import numpy as np
from PIL import Image

ROOT = Path('/home/siggi/dev/scratch-c140'); ME = ROOT / 'r2v-numbers'; PREP = ROOT / 'prep'; R2 = ROOT / 'r2'
SIDE = Path('/home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi-2e/figure-text')
names = [f['basename'] for f in json.loads((PREP / 'manifest.json').read_text())['figures']]
env = dict(os.environ, FIGTEXT_PYLIBS=str(ME / 'repotree/pylibs'), PYTHONDONTWRITEBYTECODE='1',
           PYTHONPYCACHEPREFIX=str(ME / 'pycache'))
for k in list(env):
    if k.startswith('R2_') or k.startswith('C3B_'):
        env.pop(k)
png_eq = rep_eq = 0; bad = []; ctrl_diff = 0; n_layout_figs = 0
for b in names:
    w = ME / 'repo_v0' / b; w.mkdir(parents=True, exist_ok=True)
    for f in ('meta.json', 'runs.json', 'artwork.png', 'blocks.json', 'artwork.svg'):
        l = w / f
        if not l.exists():
            l.symlink_to(PREP / 'figs' / b / f)
    r = subprocess.run([sys.executable, str(ME / 'repotree/compose.py'), '--translations', str(SIDE / f'{b}.is.json')],
                       env=dict(env, FIGTEXT_OUT=str(w)), capture_output=True, text=True)
    if r.returncode != 0:
        bad.append((b, 'rc', r.returncode, r.stderr[-300:])); continue
    a = np.asarray(Image.open(w / 'translated.png').convert('RGB')); v = np.asarray(Image.open(R2 / 'work/V0' / b / 'translated.png').convert('RGB'))
    if a.shape == v.shape and (a == v).all(): png_eq += 1
    else: bad.append((b, 'png'))
    ra = json.loads((w / 'compose-report.json').read_text()); rv = json.loads((R2 / 'work/V0' / b / 'compose-report.json').read_text())
    ra.pop('translationsPath', None); rv2 = dict(rv); rv2.pop('translationsPath', None)
    if ra == rv2: rep_eq += 1
    else: bad.append((b, 'report', sorted(k for k in set(ra) | set(rv2) if ra.get(k) != rv2.get(k))))
    its = json.loads((R2 / 'work/V0' / b / 'items.json').read_text())
    if any(it['path'] == 'layout' for it in its):
        n_layout_figs += 1
        c = np.asarray(Image.open(R2 / 'work/V5_p2.0_f7.0' / b / 'translated.png').convert('RGB'))
        if not (c.shape == a.shape and (c == a).all()):
            ctrl_diff += 1
print(f'repo unpatched compose vs r2/work/V0: png pixel-equal {png_eq}/34, report equal (ignoring translationsPath) {rep_eq}/34, bad {bad}')
print(f'positive control: V5_p2.0_f7.0 png differs from repo V0 on {ctrl_diff}/{n_layout_figs} figures that have layout blocks')
