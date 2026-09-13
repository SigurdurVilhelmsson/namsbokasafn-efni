#!/usr/bin/env python3
"""Recompose the 34 under one variant into c3b/work/<V>/<b>/ (0 ISK: compose.py only, no --svg).

usage: run_variant.py V0|V1|V2|V3|V3L
Checks per figure:
  keys:  compose-report.json blocks/missing/translated/identity/runExact == prep's (the BOUGHT keys never move)
  V0:    items.json == prep's items.json and translated.png pixel-identical to prep's (THE control)
  every variant: kept (run-exact) items identical to prep's (a variant may only touch layout items)
"""
import json, os, subprocess, sys, time
from pathlib import Path

V = sys.argv[1]
C3B = Path('/home/siggi/dev/scratch-c140/c3b')
PREP = Path('/home/siggi/dev/scratch-c140/prep')
REPO = Path('/home/siggi/dev/repos/namsbokasafn-efni')
SIDE = REPO / 'books/efnafraedi-2e/figure-text'
man = json.loads((PREP / 'manifest.json').read_text())
names = [f['basename'] for f in man['figures']]
sys.path.insert(0, str(REPO / 'experiments/figure-text-translation/pylibs'))
from PIL import Image, ImageChops

env = dict(os.environ, FIGTEXT_PYLIBS=str(C3B / 'tree/pylibs'), PYTHONPYCACHEPREFIX=str(C3B / 'pycache'),
           C3B_VARIANT=V, C3B_CENSUS=str(C3B / 'census.json'))
rows = []
t0 = time.time()
for b in names:
    w = C3B / 'work' / V / b
    w.mkdir(parents=True, exist_ok=True)
    for f in ('meta.json', 'runs.json', 'artwork.png', 'blocks.json'):
        l = w / f
        if not l.exists():
            l.symlink_to(PREP / 'figs' / b / f)
    e = dict(env, FIGTEXT_OUT=str(w), C3B_BASENAME=b)
    r = subprocess.run([sys.executable, str(C3B / 'tree/compose.py'), '--translations', str(SIDE / f'{b}.is.json')],
                       env=e, capture_output=True, text=True)
    (w / 'compose.stdout.txt').write_text(r.stdout); (w / 'compose.stderr.txt').write_text(r.stderr)
    row = dict(b=b, rc=r.returncode)
    if r.returncode != 0:
        print(b, 'RC', r.returncode, r.stderr[-800:], flush=True)
        rows.append(row); continue
    rep = json.loads((w / 'compose-report.json').read_text())
    prep_rep = json.loads((PREP / 'figs' / b / 'compose-report.json').read_text())
    row['keys_equal'] = all(rep[k] == prep_rep[k] for k in ('blocks', 'missing', 'translated', 'identity', 'runExact'))
    it = json.loads((w / 'items.json').read_text()); pit = json.loads((PREP / 'figs' / b / 'items.json').read_text())
    row['kept_items_equal'] = [x for x in it if x['path'] != 'layout'] == [x for x in pit if x['path'] != 'layout']
    row['items_equal'] = it == pit
    a = Image.open(w / 'translated.png').convert('RGB'); p = Image.open(PREP / 'figs' / b / 'translated.png').convert('RGB')
    row['png_identical'] = a.size == p.size and ImageChops.difference(a, p).getbbox() is None
    rows.append(row)
    print(b, row, flush=True)
(C3B / f'run-{V}.json').write_text(json.dumps(rows, indent=1))
tot = lambda k: sum(1 for x in rows if x.get(k))
print(V, 'figures', len(rows), 'rc0', sum(1 for x in rows if x['rc'] == 0), 'keys_equal', tot('keys_equal'),
      'kept_items_equal', tot('kept_items_equal'), 'items_equal', tot('items_equal'), 'png_identical', tot('png_identical'),
      f'{time.time() - t0:.1f}s')
