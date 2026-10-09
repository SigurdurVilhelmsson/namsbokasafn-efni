#!/usr/bin/env python3
"""§C140 ⑭ — score a browser-sweep.mjs run: does each engine paint what the reference engine paints?

    python3 browser-score.py --sweep <dir> [--ref chromium] [--variant full] [--census rows.jsonl] [--sheets 40]

Reads <dir>/rows.<variant>.jsonl (REFUSES a run with no terminal {"done":true} line: a killed sweep is not a clean one)
and the PNGs it names. For every figure rendered by both the reference and another engine it measures, on the
reference's pixel grid:

  strong     share of pixels whose largest channel difference exceeds 64 (of 255) - a different COLOUR, not an edge
  anyd       share of pixels whose largest channel difference exceeds 16
  ink_ref    share of the reference render that is not near-white (min channel < 240), and ink_other the same
  ink_ratio  ink_other / ink_ref - a figure an engine paints only partly has ink_ratio well below 1

Cross-engine antialiasing never makes two renders identical, so a number means nothing on its own. The report puts it
beside the NOISE BASELINE: the same metric over every figure that does NOT use the suspected mechanism (in-document
<feImage>, from --census) in the same engine pair. A figure is FLAGGED when it is far outside that distribution
(`flag_rule` in the report states the exact rule) - and the contact sheets written under <dir>/sheets/ are what a
human then looks at: reference | other | difference.

Also: --nofont compares, WITHIN each engine, the full render against the same figure with its @font-face
rules stripped (browser-sweep.mjs --variant nofont). A figure with text whose two renders are identical in some
engine is drawing its labels in a fallback font there.

Output: <dir>/score.<variant>.json, and a one-line summary per engine pair on stdout. Exit 0 when scoring completed,
1 otherwise. The exit code is not a verdict on the figures.
"""
import argparse, json, os, sys
from pathlib import Path

os.environ.setdefault('FIGTEXT_PYLIBS', str(Path(__file__).resolve().parent / 'pylibs'))
import _deps  # noqa: F401,E402
import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

STRONG = 64
ANY = 16
INK = 240
# The LOCAL metric: the diff mask is cut into TILE x TILE tiles and each is scored on its own area. A missing region
# fills its tiles (share near 1); an antialiasing edge, however long, crosses a tile as a line (share <= ~1/TILE per
# pixel of width). HOT is the share above which a tile counts as "content differs here", not "an edge moved".
TILE = 12
HOT = 0.5
# The SHIFT-TOLERANT metric: a pixel differs only if NO pixel within 1 px (Chebyshev) of the other render matches it
# within STRONG. Two engines place a fractionally sized <img> up to a pixel apart and antialias edges differently;
# both vanish under the tolerance, while a missing region or pattern does not. With that noise gone a tile is "hot"
# at a lower share. Calibrated on the notext sweep (evidence/2026-09-29-c27-c14/): see its README.
TOL_HOT = 0.25


def load_rgb(path):
    return np.asarray(Image.open(path).convert('RGB'), dtype=np.int16)


def tile_shares(mask):
    """Share of True pixels in each TILE x TILE tile of a 2-D boolean mask; a partial edge tile is scored on its own
    area, never dropped (a defect in a figure's last few pixels is still a defect)."""
    h, w = mask.shape
    out = []
    for y in range(0, h, TILE):
        for x in range(0, w, TILE):
            t = mask[y:y + TILE, x:x + TILE]
            out.append(t.mean())
    return np.asarray(out, dtype=float)


def _unmatched(a, b):
    """Pixels of `a` with no pixel of `b` within 1 px whose largest channel difference is <= STRONG."""
    h, w, _ = a.shape
    pb = np.pad(b, ((1, 1), (1, 1), (0, 0)), mode='edge')
    best = None
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            d = np.abs(a - pb[1 + dy:1 + dy + h, 1 + dx:1 + dx + w]).max(axis=2)
            best = d if best is None else np.minimum(best, d)
    return best > STRONG


def pair_metrics(ref, other):
    """Metrics of `other` against `ref` (both HxWx3 int arrays). Sizes may differ by rounding: both are cropped to the
    common top-left rectangle, and `size_delta` says by how much."""
    h = min(ref.shape[0], other.shape[0])
    w = min(ref.shape[1], other.shape[1])
    a, b = ref[:h, :w], other[:h, :w]
    d = np.abs(a - b).max(axis=2)
    ink_ref = float(np.mean(a.min(axis=2) < INK))
    ink_other = float(np.mean(b.min(axis=2) < INK))
    shares = tile_shares(d > STRONG)
    tol = _unmatched(a, b) | _unmatched(b, a)          # missing in `other` OR extra in `other`
    tshares = tile_shares(tol)
    return {
        'tol_strong': float(tol.mean()),
        'tol_tile_max': float(tshares.max()) if tshares.size else 0.0,
        'tol_hot_tiles': int((tshares > TOL_HOT).sum()),
        'tile_max': float(shares.max()) if shares.size else 0.0,
        'hot_tiles': int((shares > HOT).sum()),
        'strong': float(np.mean(d > STRONG)),
        'anyd': float(np.mean(d > ANY)),
        'mean': float(d.mean()),
        'ink_ref': ink_ref,
        'ink_other': ink_other,
        'ink_ratio': (ink_other / ink_ref) if ink_ref > 0 else (1.0 if ink_other == 0 else float('inf')),
        'size_delta': [int(other.shape[0] - ref.shape[0]), int(other.shape[1] - ref.shape[1])],
    }


def read_rows(path):
    rows, done = [], None
    with open(path) as fh:
        for line in fh:
            r = json.loads(line)
            if r.get('done'):
                done = r
            else:
                rows.append(r)
    return rows, done


def percentile(xs, q):
    return float(np.percentile(np.asarray(xs), q)) if xs else None


def sheet(path, ref_png, other_png, title):
    a = Image.open(ref_png).convert('RGB')
    b = Image.open(other_png).convert('RGB')
    A, B = np.asarray(a, dtype=np.int16), np.asarray(b, dtype=np.int16)
    h, w = min(A.shape[0], B.shape[0]), min(A.shape[1], B.shape[1])
    d = np.abs(A[:h, :w] - B[:h, :w]).max(axis=2)
    heat = np.full((h, w, 3), 255, dtype=np.uint8)
    heat[d > ANY] = (255, 200, 0)
    heat[d > STRONG] = (220, 0, 0)
    gap = 12
    out = Image.new('RGB', (a.width + b.width + w + 2 * gap, max(a.height, b.height) + 14), 'white')
    out.paste(a, (0, 14))
    out.paste(b, (a.width + gap, 14))
    out.paste(Image.fromarray(heat), (a.width + b.width + 2 * gap, 14))
    from PIL import ImageDraw
    ImageDraw.Draw(out).text((2, 1), title, fill=(200, 0, 0))
    out.save(path)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--sweep', required=True)
    ap.add_argument('--ref', default='chromium')
    ap.add_argument('--variant', default='full')
    ap.add_argument('--census', default=None, help='font_census rows (JSONL) giving feimage_indoc and fontsig')
    ap.add_argument('--sheets', type=int, default=40)
    ap.add_argument('--nofont', action='store_true', help='score full vs nofont within each engine instead')
    a = ap.parse_args(argv)
    sweep = Path(a.sweep)

    rows, done = read_rows(sweep / f'rows.{a.variant}.jsonl')
    if done is None:
        print(f'REFUSED: {sweep}/rows.{a.variant}.jsonl has no terminal {{"done":true}} line - the sweep did not finish',
              file=sys.stderr)
        return 1
    census = {}
    if a.census:
        with open(a.census) as fh:
            for line in fh:
                r = json.loads(line)
                census[r['basename']] = r

    by = {}
    # A row the sweep could not assign to an engine (no size; no composer framing for `notext`) was never rendered
    # anywhere. It is LISTED in the report — dropping it would read as "scored and clean".
    unassigned = [{'id': r['id'], 'status': r.get('status')} for r in rows if 'engine' not in r]
    for r in rows:
        if 'engine' in r:
            by.setdefault((r['engine'], r['id']), r)
    engines = sorted({e for e, _ in by})
    report = {'sweep': str(sweep), 'variant': a.variant, 'ref': a.ref, 'done': done, 'unassigned': unassigned,
              'pairs': {}}

    if a.nofont:
        nrows, ndone = read_rows(sweep / 'rows.nofont.jsonl')
        if ndone is None:
            print('REFUSED: rows.nofont.jsonl has no terminal line', file=sys.stderr)
            return 1
        nby = {(r['engine'], r['id']): r for r in nrows}
        for eng in engines:
            out = []
            for (e, i), n in nby.items():
                f = by.get((e, i))
                if e != eng or not f or f.get('status') != 'rendered' or n.get('status') != 'rendered':
                    continue
                m = pair_metrics(load_rgb(f['png']), load_rgb(n['png']))
                out.append({'id': i, **m})
            report['pairs'][f'{eng}:full-vs-nofont'] = out
            same = [o['id'] for o in out if o['strong'] == 0 and o['anyd'] == 0]
            print(f'{eng}: full vs nofont over {len(out)} figure(s): {len(same)} IDENTICAL (font not in use?) '
                  f'{same[:8]}')
        (sweep / 'score.nofont.json').write_text(json.dumps(report, indent=1))
        return 0

    for eng in engines:
        if eng == a.ref:
            continue
        results, statuses = [], {}
        for (e, i), r in by.items():
            if e != eng:
                continue
            ref = by.get((a.ref, i))
            statuses[r.get('status')] = statuses.get(r.get('status'), 0) + 1
            rec = {'id': i, 'kind': r.get('kind'), 'status': r.get('status'), 'ref_status': ref and ref.get('status')}
            c = census.get(i, {})
            rec['feimage'] = int(c.get('feimage_indoc', 0))
            rec['fontsig'] = c.get('fontsig')
            rec['bytes'] = r.get('bytes')
            if r.get('status') == 'rendered' and ref and ref.get('status') == 'rendered':
                rec.update(pair_metrics(load_rgb(ref['png']), load_rgb(r['png'])))
            results.append(rec)
        scored = [x for x in results if 'strong' in x and x['kind'] == 'figure']
        base = [x['strong'] for x in scored if x['feimage'] == 0]
        p99 = percentile(base, 99)
        thr = max(3 * p99, 0.02) if p99 is not None else 0.02
        tiles_base = [x['tol_tile_max'] for x in scored if x['feimage'] == 0]
        # ⚠️ ink_ratio, strong and the plain tile metric are REPORTED, never a flag. Measured 2026-09-29
        # (evidence/2026-09-29-c27-c14/): Chromium's colour-fringed subpixel text antialiasing against Firefox's
        # grayscale moves ink_ratio 20-30 % on text-dense figures with identical glyphs, and a sub-pixel placement
        # offset between the engines makes whole tiles "differ" along every long edge (Dipolfield: 28 plain hot
        # tiles, no content difference). The shift-tolerant tile rule is the one that survives both.
        flag_rule = (f'tol_hot_tiles > 0 (a {TILE}x{TILE} px tile more than {TOL_HOT:.0%} of whose pixels have no '
                     f'match within 1 px in the other render), OR not rendered')
        flagged = [x for x in results if x['kind'] == 'figure' and ('strong' not in x or x['tol_hot_tiles'] > 0)]
        flagged.sort(key=lambda x: (-x.get('tol_hot_tiles', 10 ** 9), -x.get('tol_strong', 2)))
        pop = {}
        for x in scored:
            k = 'feImage' if x['feimage'] else (x['fontsig'] or 'unknown')
            pop.setdefault(k, []).append(x['strong'])
        report['pairs'][f'{a.ref}-vs-{eng}'] = {
            'statuses': statuses,
            'noise_baseline_nonfeimage': {'n': len(base), 'p50': percentile(base, 50), 'p90': percentile(base, 90),
                                          'p99': p99, 'max': max(base) if base else None},
            'tol_tile_noise_nonfeimage': {'n': len(tiles_base), 'p50': percentile(tiles_base, 50),
                                          'p99': percentile(tiles_base, 99), 'max': max(tiles_base) if tiles_base else None,
                                          'with_hot_tiles': sum(1 for x in scored
                                                                if x['feimage'] == 0 and x['tol_hot_tiles'] > 0)},
            'by_population': {k: {'n': len(v), 'p50': percentile(v, 50), 'max': max(v)} for k, v in pop.items()},
            'flag_rule': flag_rule,
            'flagged': flagged,
            'controls': [x for x in results if x['kind'] == 'control'],
            'all': results,
        }
        sdir = sweep / 'sheets' / f'{a.ref}-vs-{eng}'
        sdir.mkdir(parents=True, exist_ok=True)
        for x in flagged[: a.sheets]:
            r, ref = by[(eng, x['id'])], by.get((a.ref, x['id']))
            if 'strong' in x:
                sheet(sdir / f"{a.variant}-{x['id']}.png", ref['png'], r['png'],
                      f"{x['id']} [{a.variant}]  {a.ref} | {eng} | diff   tol_hot_tiles={x['tol_hot_tiles']} "
                      f"tol_strong={x['tol_strong']:.3f} ink_ratio={x['ink_ratio']:.2f}")
        fe = [x for x in flagged if x.get('feimage')]
        tn = report['pairs'][f'{a.ref}-vs-{eng}']['tol_tile_noise_nonfeimage']
        print(f"{a.ref} vs {eng} [{a.variant}]: {len(scored)} scored; non-feImage tol_tile_max p99 {tn['p99']}, max "
              f"{tn['max']}, {tn['with_hot_tiles']} with hot tiles; {len(flagged)} flagged ({len(fe)} of them use "
              f"in-document feImage); statuses {statuses}")
    (sweep / f'score.{a.variant}.json').write_text(json.dumps(report, indent=1))
    return 0


if __name__ == '__main__':
    sys.exit(main())
