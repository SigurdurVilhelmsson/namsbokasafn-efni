#!/usr/bin/env python3
"""Recompose the 34 under one r2 configuration into r2/work/<tag>/<b>/ (0 ISK: compose.py only).

usage: run.py TAG [--variant V0|V5] [--pad P] [--floor F] [--decimal 0|1] [--transfer 0|1] [--svg]
Checks per figure (vs prep's E composition, the control):
  keys_equal        compose-report blocks/missing/translated/identity/runExact == prep's
  kept_items_equal  every non-layout item == prep's (same order)
  items_equal / png_identical  (THE V0 control)
"""
import json, os, subprocess, sys, time, argparse, shutil
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument('tag')
ap.add_argument('--variant', default='V0', choices=['V0', 'V5'])
ap.add_argument('--pad'); ap.add_argument('--floor')
ap.add_argument('--decimal', default='0', choices=['0', '1'])
ap.add_argument('--transfer', default='1', choices=['0', '1'])
ap.add_argument('--svg', action='store_true')
A = ap.parse_args()
if A.variant == 'V5':
    assert A.pad and A.floor, 'V5 needs --pad and --floor'

R2 = Path('/home/siggi/dev/scratch-c140/r2')
OUTR = Path('/home/siggi/dev/scratch-c140/r2v-scripts/regen')
PREP = Path('/home/siggi/dev/scratch-c140/prep')
REPO = Path('/home/siggi/dev/repos/namsbokasafn-efni')
SIDE = REPO / 'books/efnafraedi-2e/figure-text'
man = json.loads((PREP / 'manifest.json').read_text())
names = [f['basename'] for f in man['figures']]
sys.dont_write_bytecode = True
sys.path.insert(0, str(REPO / 'experiments/figure-text-translation/pylibs'))
from PIL import Image, ImageChops

env = dict(os.environ, FIGTEXT_PYLIBS=str(R2 / 'tree/pylibs'), PYTHONDONTWRITEBYTECODE='1',
           PYTHONPYCACHEPREFIX='/home/siggi/dev/scratch-c140/r2v-scripts/pyc', R2_VARIANT=A.variant, R2_DECIMAL=A.decimal,
           R2_TRANSFER=A.transfer, R2_CENSUS=str(R2 / 'census.json'))
env.pop('C3B_VARIANT', None)
if A.pad: env['R2_PAD'] = A.pad
if A.floor: env['R2_FLOOR'] = A.floor
rows = []
t0 = time.time()
for b in names:
    w = OUTR / 'work' / A.tag / b
    w.mkdir(parents=True, exist_ok=True)
    for f in ('meta.json', 'runs.json', 'artwork.png', 'blocks.json', 'artwork.svg'):
        l = w / f
        if not l.exists():
            l.symlink_to(PREP / 'figs' / b / f)
    e = dict(env, FIGTEXT_OUT=str(w), R2_BASENAME=b)
    cmd = [sys.executable, str(R2 / 'tree/compose.py'), '--translations', str(SIDE / f'{b}.is.json')] + (['--svg'] if A.svg else [])
    tf = time.time()
    r = subprocess.run(cmd, env=e, capture_output=True, text=True)
    (w / 'compose.stdout.txt').write_text(r.stdout); (w / 'compose.stderr.txt').write_text(r.stderr)
    row = dict(b=b, rc=r.returncode, s=round(time.time() - tf, 2))
    if r.returncode != 0:
        print(b, 'RC', r.returncode, r.stderr[-1500:], flush=True)
        rows.append(row); continue
    rep = json.loads((w / 'compose-report.json').read_text())
    prep_rep = json.loads((PREP / 'figs' / b / 'compose-report.json').read_text())
    row['keys_equal'] = all(rep[k] == prep_rep[k] for k in ('blocks', 'missing', 'translated', 'identity', 'runExact'))
    it = json.loads((w / 'items.json').read_text()); pit = json.loads((PREP / 'figs' / b / 'items.json').read_text())
    ki = [x for x in it if x['path'] != 'layout']; pki = [x for x in pit if x['path'] != 'layout']
    row['kept_items_equal'] = ki == pki
    row['kept_items_n'] = len(ki)
    row['kept_items_differ'] = sum(1 for a, c in zip(ki, pki) if a != c) + abs(len(ki) - len(pki))
    row['items_equal'] = it == pit
    a = Image.open(w / 'translated.png').convert('RGB'); p = Image.open(PREP / 'figs' / b / 'translated.png').convert('RGB')
    row['png_identical'] = a.size == p.size and ImageChops.difference(a, p).getbbox() is None
    for k in ('unformatted', 'overflow', 'openFallback', 'decimal'):
        if k in rep:
            row[k] = len(rep[k])
    rows.append(row)
    print(b, row, flush=True)
(OUTR / f'run-{A.tag}.json').write_text(json.dumps(dict(args=vars(A), rows=rows), indent=1))
tot = lambda k: sum(1 for x in rows if x.get(k))
print(A.tag, 'figures', len(rows), 'rc0', sum(1 for x in rows if x['rc'] == 0), 'keys_equal', tot('keys_equal'),
      'kept_items_equal', tot('kept_items_equal'), 'items_equal', tot('items_equal'), 'png_identical', tot('png_identical'),
      {k: sum(x.get(k, 0) for x in rows) for k in ('unformatted', 'overflow', 'openFallback', 'decimal')},
      f'{time.time() - t0:.1f}s')
