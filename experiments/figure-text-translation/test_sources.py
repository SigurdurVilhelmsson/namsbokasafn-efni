#!/usr/bin/env python3
"""Test the edition-precedence rule. Run: python3 test_sources.py"""
import tempfile, sys
from pathlib import Path
import _deps
from sources import resolve

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

print(f"\n{'ALL PASS' if not fails else str(len(fails))+' FAILED'}")
sys.exit(1 if fails else 0)
