#!/usr/bin/env python3
"""§C140 ④ — does the strip change artwork.svg on the bought figures where it could without a pixel change?

    cd experiments/figure-text-translation
    FIGTEXT_PYLIBS=./pylibs python3 -u evidence/2026-09-17-c4-build/instruments/svg_arms.py --label before [--twice]

Runs the REAL figure-prepare.py (which runs whatever strip-text.py is on disk) for each figure into a temp
directory and records artwork.svg's sha256 and size, svgfix.json, and counts of <mask, <image, <use, <path.
--twice runs each figure a second time and records whether artwork.svg is byte-identical (the determinism
control that makes a before/after sha comparison meaningful). Keeps a gzipped copy of each artwork.svg in
the scratch dir given by --keep (default: none).
Writes reports/<label>/svg-arms.json and prints DONE n=<k> as its last line.
"""
import argparse, gzip, hashlib, json, shutil, subprocess, sys, tempfile
from pathlib import Path

HERE = Path(__file__).resolve()
EXP = HERE.parents[3]
sys.path.insert(0, str(EXP))
import _deps  # noqa: F401,E402
import sources as S  # noqa: E402

FIGURES = ['CNX_Chem_04_05_combustion', 'CNX_Chem_03_01_exocytosis-88f6', 'CNX_Chem_03_03_empform',
           'CNX_Chem_04_02_HClsoln', 'CNX_Chem_04_03_flowchart', 'CNX_Chem_04_04_sandwich']
HASH_SUFFIX = '-'


def resolve(name, trees, prec):
    detail = S.resolve_detail(name, trees, prec) if hasattr(S, 'resolve_detail') else None
    if detail and detail.get('path'):
        return Path(detail['path'])
    stem = name.rsplit('-', 1)[0] if len(name.rsplit('-', 1)[-1]) == 4 else name
    detail = S.resolve_detail(stem, trees, prec)
    return Path(detail['path']) if detail and detail.get('path') else None


def prepare(artwork, basename):
    out = Path(tempfile.mkdtemp(prefix='c4-svgarm-'))
    r = subprocess.run([sys.executable, str(EXP / 'figure-prepare.py'), str(artwork), '--basename', basename,
                        '--out', str(out)], capture_output=True, text=True, cwd=str(EXP), timeout=1800)
    return out, r.returncode, (r.stderr or r.stdout)[-400:]


def measure(out):
    svg = (out / 'artwork.svg').read_bytes()
    fix = json.loads((out / 'svgfix.json').read_text()) if (out / 'svgfix.json').exists() else None
    return {'sha256': hashlib.sha256(svg).hexdigest(), 'bytes': len(svg), 'svgfix': fix,
            'mask': svg.count(b'<mask'), 'image': svg.count(b'<image'), 'use': svg.count(b'<use'),
            'path': svg.count(b'<path')}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--label', required=True, choices=['before', 'after'])
    ap.add_argument('--twice', action='store_true')
    ap.add_argument('--keep')
    args = ap.parse_args()
    cfg = S.load_config()
    trees = S.load_trees('efnafraedi-2e', cfg)
    prec = cfg['editionPrecedence']
    rows = {}
    for b in FIGURES:
        art = resolve(b, trees, prec)
        if art is None:
            rows[b] = {'error': 'unresolved'}
            print(f'{b}: unresolved', flush=True)
            continue
        out, rc, tail = prepare(art, b)
        row = {'artwork': str(art), 'rc': rc}
        if rc == 0:
            row.update(measure(out))
            if args.keep:
                keep = Path(args.keep) / args.label
                keep.mkdir(parents=True, exist_ok=True)
                with gzip.open(keep / f'{b}.artwork.svg.gz', 'wb') as fh:
                    fh.write((out / 'artwork.svg').read_bytes())
            if args.twice:
                out2, rc2, _ = prepare(art, b)
                row['second_sha256'] = measure(out2)['sha256'] if rc2 == 0 else None
                row['deterministic'] = row['second_sha256'] == row['sha256']
                shutil.rmtree(out2, ignore_errors=True)
        else:
            row['error_tail'] = tail
        shutil.rmtree(out, ignore_errors=True)
        rows[b] = row
        print(f"{b}: rc={rc} sha={row.get('sha256', '')[:12]} det={row.get('deterministic')}", flush=True)
    dst = HERE.parents[1] / 'reports' / args.label / 'svg-arms.json'
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(rows, indent=1))
    print(f'DONE n={len(rows)}')


if __name__ == '__main__':
    main()
