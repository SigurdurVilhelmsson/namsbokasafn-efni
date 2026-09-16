#!/usr/bin/env python3
"""§C140 ⑦ build evidence: prepare the bought figures and the four hazard figures, 0 ISK.

    cd experiments/figure-text-translation
    FIGTEXT_PYLIBS=./pylibs python3 -u evidence/2026-09-16-c7-build/instruments/prepare_corpus.py --label before

Writes reports/<label>/summary.tsv and reports/<label>/blocks/<basename>.blocks.json.
The same instrument runs before and after the change (Task 8 diffs the two), so it must work
against both versions of sources.py: it uses `resolve_detail` when it exists, else `resolve`.
"""
import argparse, hashlib, json, re, subprocess, sys, tempfile
from pathlib import Path

HERE = Path(__file__).resolve()
EXP = HERE.parents[3]
REPO = EXP.parents[1]
sys.path.insert(0, str(EXP))
import _deps  # noqa: F401,E402
import sources as S  # noqa: E402

HAZARDS = ['CNX_Chem_10_01_PentIso', 'CNX_Chem_09_02_Amontons2',
           'CNX_Chem_11_04_rvosmosis', 'CNX_Chem_18_07_N2O5']
HASH_SUFFIX = re.compile(r'-[0-9a-f]{4}$')


def bought():
    return sorted(p.name[:-len('.is.json')]
                  for p in (REPO / 'books/efnafraedi-2e/figure-text').glob('*.is.json'))


def lookup(name, trees, cfg):
    for candidate in (name, HASH_SUFFIX.sub('', name)):
        if hasattr(S, 'resolve_detail'):
            d = S.resolve_detail(candidate, trees, cfg['editionPrecedence'],
                                 superseded=cfg.get('supersededArtwork'))
            if d and d.get('path'):
                return d['path'], ''
            if d and d.get('refused'):
                return None, f"refused:{d['refused']}"
        else:
            p, _k = S.resolve(candidate, trees, cfg['editionPrecedence'],
                              superseded=cfg.get('supersededArtwork'))
            if p:
                return str(p), ''
    return None, 'unresolved'


def main():
    ap = argparse.ArgumentParser()
    # 'after-fix': the fix wave after the final review (P14) — same instrument, a third label.
    ap.add_argument('--label', required=True, choices=['before', 'after', 'after-fix'])
    args = ap.parse_args()
    out = HERE.parents[1] / 'reports' / args.label
    (out / 'blocks').mkdir(parents=True, exist_ok=True)
    cfg = S.load_config()
    trees = S.load_trees('efnafraedi-2e', cfg)
    rows = ['group\tbasename\tartwork\tstatus\tblocks_sha256\tblocks\tsendable\tglyphRepairs\tglyphUnrepaired']
    names = [('bought', n) for n in bought()] + [('hazard', n) for n in HAZARDS]
    for group, name in names:
        artwork, status = lookup(name, trees, cfg)
        if not artwork:
            rows.append(f'{group}\t{name}\t-\t{status}\t-\t-\t-\t-\t-')
            print(f'{name}: {status}', flush=True)
            continue
        with tempfile.TemporaryDirectory() as td:
            r = subprocess.run([sys.executable, str(EXP / 'figure-prepare.py'), artwork,
                                '--basename', name, '--out', td],
                               capture_output=True, text=True, cwd=str(EXP))
            prep = json.loads((Path(td) / 'prepare.json').read_text()) \
                if (Path(td) / 'prepare.json').exists() else {}
            blocks = Path(td) / 'blocks.json'
            if r.returncode != 0 or not blocks.exists():
                rows.append(f"{group}\t{name}\t{artwork}\tprepare-failed:{r.returncode}\t-\t-\t-\t-\t-")
                print(f'{name}: prepare failed {r.returncode}', flush=True)
                continue
            data = blocks.read_bytes()
            (out / 'blocks' / f'{name}.blocks.json').write_bytes(data)
            rows.append('\t'.join([group, name, artwork, 'ok', hashlib.sha256(data).hexdigest(),
                                   str(prep.get('blocks')), str(prep.get('sendable')),
                                   json.dumps(prep.get('glyphRepairs', None), ensure_ascii=False),
                                   json.dumps(prep.get('glyphUnrepaired', None), ensure_ascii=False)]))
            print(f'{name}: ok', flush=True)
    (out / 'summary.tsv').write_text('\n'.join(rows) + '\n')
    print(f'DONE {len(names)} figures -> {out}', flush=True)


if __name__ == '__main__':
    main()
