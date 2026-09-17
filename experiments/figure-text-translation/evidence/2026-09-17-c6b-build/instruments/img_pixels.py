#!/usr/bin/env python3
"""§C140 ⑥b P6 — the READER route: render two sets of composed SVGs through render-check.mjs (<img>, the way
cnxml-render.js publishes a figure) and compare them pixel by pixel. 0 ISK, read-only on books/.

    cd experiments/figure-text-translation
    FIGTEXT_PYLIBS=./pylibs python3 -u evidence/2026-09-17-c6b-build/instruments/img_pixels.py \
        <root-A> <root-B> <out-dir> <census.json>

<root-*>: compose34.py output roots (<root>/work/<fig>/translated.svg). Per figure, sequentially (one Chromium at a
time): render A, render A AGAIN (the determinism control), render B — each at the SVG's own viewBox × SCALE px
(150 dpi), device scale factor 1. Records for A-vs-A2 and A-vs-B: identical (bool), differing pixel count, and the
difference bounding box. <census.json>: kern_census.py's BEFORE census, read only to label each figure with the
number of layout items holding a kern pair — the prediction is that A-vs-B differs exactly when that number is > 0.

Writes <out-dir>/pixels.json and pixels.txt; PNGs are deleted after comparison (only the numbers are evidence).
Terminal marker: last stdout line `IMG-PIXELS-DONE ok=<bool>` (ok = every A-vs-A2 identical AND the A-vs-B
verdict matches the prediction for every figure).
"""
import json, re, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(HERE))
import _deps                                         # noqa: E402,F401
from PIL import Image, ImageChops                    # noqa: E402

SCALE = 150.0 / 72.0


def size(svg):
    head = Path(svg).read_bytes()[:2000].decode('utf-8', 'replace')
    vb = re.search(r'viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"', head)
    return float(vb.group(3)) * SCALE, float(vb.group(4)) * SCALE


def render(svg, png, w, h):
    r = subprocess.run(['node', str(HERE / 'render-check.mjs'), str(svg), str(png), f'{w}', f'{h}', '1'],
                       capture_output=True, text=True, cwd=str(HERE), timeout=900)
    assert r.returncode == 0 and Path(png).is_file(), f'render failed {svg}: {r.stderr[-400:]}'


def diff(p, q):
    a, b = Image.open(p).convert('RGB'), Image.open(q).convert('RGB')
    if a.size != b.size:
        return dict(identical=False, size=[a.size, b.size], pixels=None, bbox=None)
    d = ImageChops.difference(a, b)
    bbox = d.getbbox()
    n = 0 if bbox is None else sum(1 for px in d.crop(bbox).getdata() if px != (0, 0, 0))
    return dict(identical=bbox is None, pixels=n, bbox=bbox)


def main():
    root_a, root_b, out, census = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]), Path(sys.argv[4])
    out.mkdir(parents=True, exist_ok=True)
    C = json.loads(census.read_text())['figures']
    figs = sorted(p.name for p in (root_a / 'work').iterdir() if (p / 'translated.svg').is_file())
    res, lines, ok = {}, [], True
    for fig in figs:
        sa, sb = root_a / 'work' / fig / 'translated.svg', root_b / 'work' / fig / 'translated.svg'
        w, h = size(sa)
        assert (w, h) == size(sb), f'{fig}: viewBox differs'
        pa, pa2, pb = out / f'{fig}.A.png', out / f'{fig}.A2.png', out / f'{fig}.B.png'
        render(sa, pa, w, h)
        render(sa, pa2, w, h)
        render(sb, pb, w, h)
        aa, ab = diff(pa, pa2), diff(pa, pb)
        kern_layout = sum(1 for r in C[fig]['items']
                          if r['path'] == 'layout' and 'kern' in r and abs(r['kern']) > 1e-9)
        predicted_differs = kern_layout > 0
        match = aa['identical'] and (not ab['identical']) == predicted_differs
        ok = ok and match
        res[fig] = dict(w=w, h=h, kern_layout_items=kern_layout, A_vs_A2=aa, A_vs_B=ab,
                        predicted_differs=predicted_differs, match=match)
        line = (f'{fig:40} kern_layout={kern_layout:2} A=A2:{aa["identical"]} A=B:{ab["identical"]} '
                f'diff_px={ab["pixels"]} bbox={ab["bbox"]} predicted_differs={predicted_differs} match={match}')
        lines.append(line)
        print(line, flush=True)
        for p in (pa, pa2, pb):
            p.unlink()
            p.with_suffix('.host.html').unlink(missing_ok=True)
    n_diff = sum(1 for r in res.values() if not r['A_vs_B']['identical'])
    summary = (f'\nfigures={len(res)} A_vs_A2_identical={sum(r["A_vs_A2"]["identical"] for r in res.values())} '
               f'A_vs_B_differ={n_diff} predicted_differ={sum(r["predicted_differs"] for r in res.values())} ok={ok}')
    lines.append(summary)
    (out / 'pixels.json').write_text(json.dumps(res, indent=1))
    (out / 'pixels.txt').write_text('\n'.join(lines) + '\n')
    print(summary)
    print(f'IMG-PIXELS-DONE ok={ok}')


if __name__ == '__main__':
    main()
