#!/usr/bin/env python3
"""Test the edition-precedence rule. Run: python3 test_sources.py"""
import tempfile, sys
from pathlib import Path
import _deps
from sources import resolve, resolve_report

fails = []
def check(label, got, want):
    ok = got == want
    print(f"  {'PASS' if ok else 'FAIL'}  {label}: {got!r}")
    if not ok: fails.append((label, got, want))

with tempfile.TemporaryDirectory() as td:
    td = Path(td)
    old, new = td/'first-edition', td/'updates-2e'
    (old/'sub').mkdir(parents=True); new.mkdir()
    # BOTH trees carry this figure - the only case where precedence can be wrong
    (old/'sub'/'CNX_A.pdf').write_bytes(b'old')
    (new/'CNX_A.pdf').write_bytes(b'new')
    # only the 1st edition has this one
    (old/'CNX_B.pdf').write_bytes(b'old')
    # only the updates tree has this one (an ADDED 2e figure)
    (new/'CNX_C.eps').write_bytes(b'new')
    old_dir = old
    trees = {'first-edition': str(old), 'updates-2e': str(new)}
    prec = ['updates-2e', 'first-edition']

    p, k = resolve('CNX_A', trees, prec)
    check('in both trees -> updates wins', (k, p.read_bytes()), ('updates-2e', b'new'))
    p, k = resolve('CNX_B', trees, prec)
    check('only 1e -> falls back', (k, p.read_bytes()), ('first-edition', b'old'))
    p, k = resolve('CNX_C', trees, prec)
    check('only 2e, .eps -> found', (k, p.read_bytes()), ('updates-2e', b'new'))
    p, k = resolve('CNX_MISSING', trees, prec)
    check('absent -> (None, None)', (p, k), (None, None))
    # CONTROL: reversing precedence must change the answer, or the test proves nothing
    p, k = resolve('CNX_A', trees, ['first-edition', 'updates-2e'])
    check('CONTROL reversed precedence -> 1e wins', (k, p.read_bytes()), ('first-edition', b'old'))
    # edition beats format: a 2e .eps outranks a 1e .pdf
    (old/'CNX_D.pdf').write_bytes(b'old'); (new/'CNX_D.eps').write_bytes(b'new')
    p, k = resolve('CNX_D', trees, prec)
    check('2e .eps beats 1e .pdf', (k, p.read_bytes()), ('updates-2e', b'new'))

    # ── P6: a CONFIGURED tree root that is not a directory must REFUSE ──────────────
    # It used to `continue`, so an unmounted updates-2e resolved every figure to its
    # superseded 1st-edition artwork — a correct-looking translation of the wrong
    # picture, invisible to every downstream check.
    absent = {'updates-2e': str(td / 'not-mounted'), 'first-edition': str(old_dir)}
    try:
        got = resolve('CNX_A', absent, prec)
        raised = f'returned {got!r}'
    except SystemExit as exc:
        raised = str(exc)
    check('P6 configured-but-absent root REFUSES',
          raised.startswith("Source tree 'updates-2e' is configured"), True)
    # and it must name the tree AND the figure, or the operator cannot act on it
    check('P6 refusal names the figure', "'CNX_A'" in raised, True)

    # CONTROL 1: the refusal is not "resolve now always raises" — with every configured
    # root present, resolution still succeeds and still picks the right edition.
    p, k = resolve('CNX_A', trees, prec)
    check('P6 CONTROL all roots present -> still resolves',
          (k, p.read_bytes()), ('updates-2e', b'new'))

    # CONTROL 2: an UNCONFIGURED tree is a different case and must still fall through.
    # A book with only one tree has to keep working.
    p, k = resolve('CNX_B', {'first-edition': str(old_dir)}, prec)
    check('P6 CONTROL unconfigured tree still falls through',
          (k, p.read_bytes()), ('first-edition', b'old'))

    # ── the JSON report the driver consumes ────────────────────────────────────────
    # A machine caller needs the whole batch in one spawn, and needs "not found" to be a
    # per-figure VALUE rather than an exit code — tools/figure-run.js tallies it as the
    # `unresolved` outcome (R9: counted and named, never fatal).
    rep = resolve_report(['CNX_A', 'CNX_MISSING'], trees, prec)
    check('report resolves a present figure', rep['CNX_A']['edition'], 'updates-2e')
    check('report path is a string, not a Path', isinstance(rep['CNX_A']['path'], str), True)
    check('report says None for a figure in no tree', rep['CNX_MISSING'], None)
    # CONTROL: the report is not "always None" — the two answers above are different, and
    # the key set is exactly what was asked for.
    check('report keys are the names asked for', sorted(rep), ['CNX_A', 'CNX_MISSING'])
    # And the P6 refusal must travel THROUGH the report, or a batch caller converts an
    # unmounted tree into N silent `unresolved`s.
    try:
        resolve_report(['CNX_A'], absent, prec)
        raised = 'returned normally'
    except SystemExit as exc:
        raised = str(exc)
    check('report propagates the P6 refusal',
          raised.startswith("Source tree 'updates-2e' is configured"), True)

print(f"\n{'ALL PASS' if not fails else str(len(fails))+' FAILED'}")
sys.exit(1 if fails else 0)
