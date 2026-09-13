#!/usr/bin/env python3
"""Recompose the 34 into c3/work/<b>/ with the DIAG-patched scratch compose (0 ISK, no --svg).

Controls: items.json == prep's items.json, translated.png pixel-identical to prep's.
"""
import json, os, subprocess, sys, hashlib
from pathlib import Path

C3 = Path('/home/siggi/dev/scratch-c140/c3')
PREP = Path('/home/siggi/dev/scratch-c140/prep')
REPO = Path('/home/siggi/dev/repos/namsbokasafn-efni')
SIDE = REPO / 'books/efnafraedi-2e/figure-text'
man = json.loads((PREP / 'manifest.json').read_text())
names = [f['basename'] if 'basename' in f else f['name'] for f in man['figures']]
sys.path.insert(0, str(REPO / 'experiments/figure-text-translation/pylibs'))
from PIL import Image, ImageChops

env = dict(os.environ, FIGTEXT_PYLIBS=str(C3 / 'tree/pylibs'),
           PYTHONPYCACHEPREFIX=str(C3 / 'pycache'))
rows = []
for b in names:
    w = C3 / 'work' / b
    w.mkdir(parents=True, exist_ok=True)
    for f in ('meta.json', 'runs.json', 'artwork.png', 'blocks.json'):
        l = w / f
        if not l.exists():
            l.symlink_to(PREP / 'figs' / b / f)
    e = dict(env, FIGTEXT_OUT=str(w))
    r = subprocess.run([sys.executable, str(C3 / 'tree/compose.py'), '--translations', str(SIDE / f'{b}.is.json')],
                       env=e, capture_output=True, text=True)
    (w / 'compose.stdout.txt').write_text(r.stdout); (w / 'compose.stderr.txt').write_text(r.stderr)
    ok_items = json.loads((w / 'items.json').read_text()) == json.loads((PREP / 'figs' / b / 'items.json').read_text())
    a = Image.open(w / 'translated.png').convert('RGB'); p = Image.open(PREP / 'figs' / b / 'translated.png').convert('RGB')
    ok_png = a.size == p.size and ImageChops.difference(a, p).getbbox() is None
    nd = len(json.loads((w / 'diag.json').read_text()))
    rows.append(dict(b=b, rc=r.returncode, items_equal=ok_items, png_identical=ok_png, diag=nd))
    print(b, r.returncode, ok_items, ok_png, nd, flush=True)
(C3 / 'run-check.json').write_text(json.dumps(rows, indent=1))
print('items_equal', sum(x['items_equal'] for x in rows), 'png_identical', sum(x['png_identical'] for x in rows),
      'diag blocks', sum(x['diag'] for x in rows), 'of', len(rows))
