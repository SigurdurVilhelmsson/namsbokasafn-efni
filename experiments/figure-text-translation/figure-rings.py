#!/usr/bin/env python3
"""§C140 ⑩ CLI — find, judge and heal `pdftocairo -svg`'s soft-mask ring.

    FIGTEXT_PYLIBS=./pylibs python3 figure-rings.py census <svg>...
    FIGTEXT_PYLIBS=./pylibs python3 figure-rings.py gate   <svg> --before B.png --after A.png
    FIGTEXT_PYLIBS=./pylibs python3 figure-rings.py heal   <svg> --out OUT.svg [--gate-report R.json]

`census` is cheap and needs no browser: it reports every mask carrying the byte signature.
It is a DETECTOR, never a decision — measured, it false-positives on 8 of the 9 candidate
masks in this corpus (see figrings.__doc__).

`gate` is the decision, and it is interventional.  It needs two renders of the SAME file:
  before — the file as it is;
  after  — `figure-rings.py heal <svg> --out after.svg --approve-all`, rendered.
`--approve-all` exists ONLY to build that counterfactual.  It writes to `--out` and can
never write over its input.

`heal` writes a new file.  Without `--gate-report` it heals nothing and says so: the point
of this item is that an ungated heal destroys picture content.

⚠️ Nothing here writes into `books/`.  `--out` is required and is refused if it resolves
inside the repo's `books/` tree.
"""
import argparse
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent          # never process.cwd() — repo rule
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / 'pylibs'))
_extra = os.environ.get('FIGTEXT_PYLIBS')
if _extra:
    sys.path.insert(0, str(Path(_extra).expanduser().resolve()))

import figrings                                  # noqa: E402


def _refuse_books_path(p):
    q = Path(p).resolve()
    for parent in (q,) + tuple(q.parents):
        if parent.name == 'books':
            sys.exit(f'refusing to write inside books/: {q}\n'
                     'books/*/media is pipeline output; heal into a scratch path and let '
                     'figure-run recompose.')
    return q


def cmd_census(args):
    rows = []
    for p in args.svg:
        text = Path(p).read_text(encoding='utf-8')
        cands, vb = figrings.find_candidates(text)
        rows.append({'svg': Path(p).name, 'viewBox': vb,
                     'candidates': figrings.summary(cands)})
        if not args.json:
            n_ref = sum(1 for c in cands if c.refuse)
            print(f'{Path(p).name:48s} candidates={len(cands):2d} refused={n_ref:2d}')
            for c in cands:
                print(f'    {c.mask:10s} {str(c.px):9s} ring={c.ring} '
                      f'rect={c.rect} cut={c.cut}'
                      + (f'  REFUSE {c.refuse}' if c.refuse else ''))
    if args.json:
        json.dump(rows, sys.stdout, indent=1)
        print()
    total = sum(len(r['candidates']) for r in rows)
    if not args.json:
        print(f'# figures {len(rows)}, candidate masks {total}')
    return 0


def cmd_gate(args):
    text = Path(args.svg).read_text(encoding='utf-8')
    cands, vb = figrings.find_candidates(text)
    if not cands:
        print('# no candidates; nothing to gate')
        json.dump({'svg': Path(args.svg).name, 'approved': [], 'verdicts': {}},
                  open(args.report, 'w') if args.report else sys.stdout, indent=1)
        return 0
    lb = figrings.luminance(args.before)
    la = figrings.luminance(args.after)
    if lb.shape != la.shape:
        sys.exit(f'before/after renders differ in size: {lb.shape} vs {la.shape}')
    scale = lb.shape[1] / (vb[2] - vb[0])
    verdicts = figrings.gate(cands, lb, la, scale)
    approved = sorted(m for m, v in verdicts.items() if v['approved'])
    print(f'# {Path(args.svg).name}  render {lb.shape[1]}x{lb.shape[0]}  scale {scale:.4f}')
    print(f"{'mask':10s} {'side':7s} {'before':>7s} {'after':>7s} {'delta':>7s}  pass")
    for c in cands:
        v = verdicts[c.mask]
        for side, s in v['sides'].items():
            f = lambda x: '   None' if x is None else f'{x:7.1f}'
            print(f"{c.mask:10s} {side:7s} {f(s['before'])} {f(s['after'])} {f(s['delta'])}"
                  f"  {'yes' if s['pass'] else '.'}")
        print(f"{c.mask:10s} -> {'APPROVED' if v['approved'] else 'refused'}"
              f"  sidesPassed={v.get('sidesPassed')} bestDelta={v.get('bestDelta')}"
              f"  {v['reason'] or ''}")
    print(f'# approved {len(approved)} of {len(cands)}')
    out = {'svg': Path(args.svg).name, 'approved': approved, 'verdicts': verdicts,
           'thresholds': {'sideFloor': figrings.SIDE_FLOOR, 'sideDrop': figrings.SIDE_DROP,
                          'minSides': figrings.MASK_MIN_SIDES,
                          'minDelta': figrings.MASK_MIN_DELTA}}
    if args.report:
        Path(args.report).write_text(json.dumps(out, indent=1), encoding='utf-8')
        print(f'# report -> {args.report}')
    return 0


def cmd_heal(args):
    out = _refuse_books_path(args.out)
    src = Path(args.svg).resolve()
    if out == src:
        sys.exit('refusing to heal a file over itself; pass a different --out')
    text = src.read_text(encoding='utf-8')
    cands, _ = figrings.find_candidates(text)
    if args.approve_all:
        approved = figrings.all_cut_sides(cands)
        note = ('COUNTERFACTUAL: every healable candidate healed, gate NOT consulted. '
                'This output is for measuring, never for publishing.')
    elif args.gate_report:
        rep = json.loads(Path(args.gate_report).read_text(encoding='utf-8'))
        approved = set(rep.get('approved') or [])
        note = f'gated by {args.gate_report}'
    else:
        approved = set()
        note = ('no --gate-report and no --approve-all: healing nothing. An ungated heal '
                'destroys picture content on 8 of the 9 candidates in this corpus.')
    healed, rep = figrings.heal(text, approved)
    out.write_text(healed, encoding='utf-8')
    print(json.dumps({'note': note, 'approved': sorted(approved), 'report': rep,
                      'bytesIn': len(text), 'bytesOut': len(healed),
                      'changed': healed != text, 'out': str(out)}, indent=1))
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)

    c = sub.add_parser('census', help='byte-level detector; no browser needed')
    c.add_argument('svg', nargs='+')
    c.add_argument('--json', action='store_true')
    c.set_defaults(fn=cmd_census)

    g = sub.add_parser('gate', help='interventional render-level decision')
    g.add_argument('svg')
    g.add_argument('--before', required=True, help='render of the file as it is')
    g.add_argument('--after', required=True, help='render of --approve-all heal')
    g.add_argument('--report', help='write the verdict JSON here')
    g.set_defaults(fn=cmd_gate)

    h = sub.add_parser('heal', help='write a healed copy')
    h.add_argument('svg')
    h.add_argument('--out', required=True)
    h.add_argument('--gate-report')
    h.add_argument('--approve-all', action='store_true',
                   help='heal every candidate, to build the gate\'s counterfactual render')
    h.set_defaults(fn=cmd_heal)

    args = ap.parse_args(argv)
    return args.fn(args)


if __name__ == '__main__':
    # Python flushes stdout on interpreter shutdown, so sys.exit() here is safe — the
    # repo's "never exit with output in flight" rule is about NODE.  What DOES bite here
    # is Python's block buffering to a pipe or file: run a long census with `python3 -u`.
    sys.exit(main())
