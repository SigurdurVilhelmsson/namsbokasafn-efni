#!/usr/bin/env python3
"""Tests for browser-score.py (§C140 ⑭). Run: FIGTEXT_PYLIBS=./pylibs python3 test_browser_score.py

Synthetic images whose expected metrics are derivable by hand. Each check names the break it catches."""
import importlib.util, json, os, sys, tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
os.environ.setdefault('FIGTEXT_PYLIBS', str(HERE / 'pylibs'))
import _deps  # noqa: F401,E402
import numpy as np  # noqa: E402

MODULE = Path(os.environ.get('BROWSER_SCORE_UNDER_TEST', HERE / 'browser-score.py'))
spec = importlib.util.spec_from_file_location('browser_score', MODULE)
BS = importlib.util.module_from_spec(spec)
spec.loader.exec_module(BS)

fails = []


def check(label, ok, detail=''):
    print(f"  {'PASS' if ok else 'FAIL'}  {label}" + (f": {detail}" if detail else ''))
    if not ok:
        fails.append(label)


def img(h, w, fill=255):
    return np.full((h, w, 3), fill, dtype=np.int16)


print('\n[M] pair_metrics on hand-derivable images')
white = img(20, 20)
m = BS.pair_metrics(white, white.copy())
check('M1 identical images: strong 0, anyd 0 (breaks if noise is invented)', m['strong'] == 0 and m['anyd'] == 0, str(m))

ref = img(20, 20)
ref[:, :10] = 0                       # left half black: ink 0.5
blank = img(20, 20)                   # the other engine painted nothing
m = BS.pair_metrics(ref, blank)
check('M2 a missing half: strong == 0.5 exactly (breaks if missing content is not a difference)',
      m['strong'] == 0.5, str(m['strong']))
check('M2b ... ink_ref 0.5, ink_other 0, ink_ratio 0 (breaks if a blank render is not a partial paint)',
      m['ink_ref'] == 0.5 and m['ink_other'] == 0 and m['ink_ratio'] == 0, str(m))

soft = img(20, 20)
soft[:5, :] = 255 - 20                # a light antialiasing-sized shift on a quarter of the pixels
m = BS.pair_metrics(white, soft)
check('M3 a 20-level shift on a quarter: anyd 0.25, strong 0 (breaks if the thresholds are swapped or merged)',
      m['anyd'] == 0.25 and m['strong'] == 0, str(m))

tall = img(21, 20)
m = BS.pair_metrics(white, tall)
check('M4 a one-row rounding difference is cropped, not a crash, and reported (breaks on misalignment)',
      m['size_delta'] == [1, 0] and m['strong'] == 0, str(m))

print('\n[T] the LOCAL metric sees a small missing region the global one underweights')
big = img(48, 48)
hole = big.copy()
hole[12:24, 24:36] = 0                # exactly one 12x12 tile changed completely: 1/16 of the image
m = BS.pair_metrics(big, hole)
check('T1 one whole tile differs: tile_max == 1.0 and hot_tiles == 1 (breaks if a local loss reads as small)',
      m['tile_max'] == 1.0 and m['hot_tiles'] == 1, f"tile_max={m.get('tile_max')} hot={m.get('hot_tiles')}")
check('T1b ... while the global share is only 1/16 (why the local metric exists)', m['strong'] == 1 / 16, str(m['strong']))
line = big.copy()
line[5, :] = 0                        # a one-pixel line across every tile of the top row: an antialiasing-sized edge
m = BS.pair_metrics(big, line)
check('T2 a 1-px line: tile_max == 12/144 and hot_tiles == 0 (breaks if an edge counts as a missing region)',
      abs(m['tile_max'] - 12 / 144) < 1e-12 and m['hot_tiles'] == 0, f"tile_max={m.get('tile_max')} hot={m.get('hot_tiles')}")
odd = img(30, 30)
odd2 = odd.copy()
odd2[24:30, 24:30] = 0                # the partial corner tile (6x6) fully changed
m = BS.pair_metrics(odd, odd2)
check('T3 a partial edge tile is scored on its own area: tile_max == 1.0 (breaks if edge tiles are dropped)',
      m['tile_max'] == 1.0 and m['hot_tiles'] == 1, f"tile_max={m.get('tile_max')} hot={m.get('hot_tiles')}")

print('\n[S] the SHIFT-TOLERANT metric ignores a 1-px offset but not a missing region')
base = img(48, 48)
base[10:30, 10:30] = 0                # a thick black square
shifted = np.roll(base, 1, axis=1)    # the same square one pixel to the right (an engine placing the image differently)
m = BS.pair_metrics(base, shifted)
check('S1 a 1-px offset: plain strong > 0 (the noise this metric exists to remove)', m['strong'] > 0, str(m['strong']))
check('S1b ... tol_strong == 0 and tol_hot_tiles == 0 (breaks if an offset reads as a defect)',
      m['tol_strong'] == 0 and m['tol_hot_tiles'] == 0, f"tol_strong={m.get('tol_strong')} hot={m.get('tol_hot_tiles')}")
stripes = img(48, 48)
stripes[:, ::4] = (255, 200, 0)       # yellow stripes 1 px wide every 4 px...
stripes[:, 1::4] = (255, 200, 0)      # ... 2 px wide, on white: an interference pattern
stripes[:, 2::4] = 0
stripes[:, 3::4] = 0
solid = img(48, 48, 0)                # the other engine paints the panel solid black
m = BS.pair_metrics(stripes, solid)
check('S2 a stripe pattern painted solid black: every tile is hot under the tolerant metric too '
      '(breaks if the tolerance hides a missing pattern)', m['tol_hot_tiles'] == 16, f"tol_hot={m.get('tol_hot_tiles')}")
check('S2b tol_strong == 0.5 exactly: the yellow half has no match within 1 px', m['tol_strong'] == 0.5, str(m.get('tol_strong')))

print('\n[R] an unfinished sweep is refused')
with tempfile.TemporaryDirectory() as td:
    Path(td, 'rows.full.jsonl').write_text(json.dumps({'engine': 'chromium', 'id': 'x', 'status': 'rendered'}) + '\n')
    rc = BS.main(['--sweep', td])
check('R1 no terminal {"done":true} line -> exit 1, nothing scored (breaks if a killed sweep reads as clean)',
      rc == 1, f'rc={rc}')

print('\n[U] rows the sweep could not assign to an engine are reported, not a crash')
with tempfile.TemporaryDirectory() as td:
    from PIL import Image
    png = Path(td) / 'a.png'
    Image.fromarray(np.full((12, 12, 3), 255, dtype=np.uint8)).save(png)
    rows = [{'id': 'June_fig', 'status': 'no-framing', 'variant': 'notext'},
            {'engine': 'chromium', 'id': 'f1', 'kind': 'figure', 'status': 'rendered', 'png': str(png)},
            {'engine': 'firefox', 'id': 'f1', 'kind': 'figure', 'status': 'rendered', 'png': str(png)},
            {'done': True}]
    Path(td, 'rows.notext.jsonl').write_text(''.join(json.dumps(r) + '\n' for r in rows))
    try:
        rc, err = BS.main(['--sweep', td, '--variant', 'notext']), ''
    except Exception as exc:  # noqa: BLE001 - a crash is the defect under test
        rc, err = None, f'{type(exc).__name__}: {exc}'
    rep = json.loads(Path(td, 'score.notext.json').read_text()) if rc == 0 else {}
check('U1 an engine-less no-framing row does not crash scoring (breaks on a KeyError)', rc == 0, err)
check('U2 ... and it is listed, not silently dropped',
      rep.get('unassigned') == [{'id': 'June_fig', 'status': 'no-framing'}], str(rep.get('unassigned')))

print(f"\n  {'ALL PASS' if not fails else str(len(fails)) + ' FAILED: ' + ', '.join(fails)}")
sys.exit(0 if not fails else 1)
