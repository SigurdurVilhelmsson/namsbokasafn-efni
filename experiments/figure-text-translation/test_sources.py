#!/usr/bin/env python3
"""Test the edition-precedence rule. Run: python3 test_sources.py"""
import tempfile, sys
from pathlib import Path
import _deps
from sources import resolve, resolve_report, load_config

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


# ---------------------------------------------------------------------------
# CASE / PUNCTUATION TOLERANCE (2026-09-08)
#
# Measured on the real delivery: 19 chemistry figures resolve to NOTHING purely
# because the vendor's filename differs in case or punctuation from the CNXML's
# basename — CNX_Chem_04_05_filter vs _Filter, CNX_chem_18_08_* with a lowercase
# 'c', CNX_Chem_12_07_Cat Convert with a SPACE. Each was verified to be the right
# picture: 11 by content (every word drawn in the artwork appears in OpenStax's
# alt text) and 7 by geometry (aspect ratio within 0.1% of the published raster,
# against a negative control that scored 42-391% on wrong pairs).
#
# 🔴 THE TOLERANCE IS DELIBERATELY NARROW. It may NOT strip `_img`:
# CNX_Chem_08_02_sp3d and CNX_Chem_08_02_sp3d_img are two DIFFERENT real figures,
# so that normalisation would silently serve the wrong picture — the exact class
# of defect this module's docstring exists to prevent.
# ---------------------------------------------------------------------------
with tempfile.TemporaryDirectory() as td:
    td = Path(td)
    old, new = td/'first-edition', td/'updates-2e'
    (old/'sub').mkdir(parents=True); new.mkdir()
    trees = {'first-edition': str(old), 'updates-2e': str(new)}
    prec = ['updates-2e', 'first-edition']

    (old/'CNX_Chem_04_05_Filter.pdf').write_bytes(b'x')          # case differs
    (old/'CNX_Chem_12_07_Cat Convert.eps').write_bytes(b'x')     # space
    (old/'CNX_Chem_08_02_sp3d_img.pdf').write_bytes(b'x')        # the trap
    (old/'sub'/'CNX_Dup.pdf').write_bytes(b'x')                  # ambiguity pair
    (old/'CNX_dup.pdf').write_bytes(b'x')

    got, ed = resolve('CNX_Chem_04_05_filter', trees, prec)
    check('resolves a CASE-only difference', got and got.name, 'CNX_Chem_04_05_Filter.pdf')
    got, ed = resolve('CNX_Chem_12_07_CatConvert', trees, prec)
    check('resolves a SPACE in the vendor filename', got and got.name, 'CNX_Chem_12_07_Cat Convert.eps')

    # 🔴 MUST-NOT-MATCH. Without this the tolerance is free to eat _img and the
    # two sp3d figures collapse onto one.
    got, ed = resolve('CNX_Chem_08_02_sp3d', trees, prec)
    check('does NOT strip _img (sp3d must not match sp3d_img)', got, None)

    # Ambiguity is a REFUSAL, never a guess: two files normalise to one key and
    # picking either would be a coin flip on which picture a reader sees.
    got, ed = resolve('CNX_DUP', trees, prec)
    check('REFUSES an ambiguous normalised match', got, None)

    # An exact hit must never be overtaken by a fuzzy one in the same tree.
    (old/'CNX_Exact.pdf').write_bytes(b'exact')
    (old/'cnx_exact.eps').write_bytes(b'fuzzy')
    got, ed = resolve('CNX_Exact', trees, prec)
    check('exact match still wins over a case-variant', got and got.read_bytes(), b'exact')

    # EDITION still dominates: a case-variant in the NEWER tree beats an exact
    # match in the older one, because a case difference is not a different picture.
    (new/'cnx_editiontest.pdf').write_bytes(b'new')
    (old/'CNX_EditionTest.pdf').write_bytes(b'old')
    got, ed = resolve('CNX_EditionTest', trees, prec)
    check('edition precedence outranks exactness', (got and got.read_bytes(), ed), (b'new', 'updates-2e'))

    # 🔴 SAME STEM, TWO FORMATS IS NOT AMBIGUITY — it is the format precedence
    # this module already has. Measured on the real delivery:
    # CNX_Chem_18_04_buckyball ships as BOTH .pdf and .eps, and a first version
    # of the tolerance refused it as "ambiguous", losing a verified-good
    # recovery. Ambiguity is two DIFFERENT stems folding onto one key.
    (old/'CNX_Chem_18_04_buckyball.pdf').write_bytes(b'pdf')
    (old/'CNX_Chem_18_04_buckyball.eps').write_bytes(b'eps')
    got, ed = resolve('CNX_Chem_18_04_Buckyball', trees, prec)
    check('same stem in two formats resolves by FORMAT precedence',
          got and got.name, 'CNX_Chem_18_04_buckyball.pdf')

    # 🔴 KNOWN-SUPERSEDED ARTWORK IS REFUSED EVEN THOUGH THE FILE IS RIGHT THERE.
    # [USER] verified 2026-09-08 that the published 2e CNX_Chem_19_03_Pattern_img
    # is RE-ORIENTED — a vertical stack with an E-axis, three single then two
    # side by side — while the box delivery holds only the old horizontal strip,
    # never updated. Sourcing it would publish correct Icelandic on the WRONG
    # ARRANGEMENT, which is exactly the failure editionPrecedence exists to stop
    # and which no downstream check can see. The value is the REASON, so the
    # entry cannot be a bare name nobody can later evaluate.
    (old/'CNX_Chem_19_03_pattern_img.pdf').write_bytes(b'stale')
    sup = {'CNX_Chem_19_03_Pattern_img': 'published 2e figure re-oriented; box holds the old strip'}
    got, ed = resolve('CNX_Chem_19_03_Pattern_img', trees, prec, superseded=sup)
    check('refuses KNOWN-SUPERSEDED artwork that is present', got, None)
    # ...and the same call without the list still finds it, so the refusal is the
    # list doing work rather than the file being absent.
    got, ed = resolve('CNX_Chem_19_03_Pattern_img', trees, prec)
    check('CONTROL - without the list it resolves', got and got.name, 'CNX_Chem_19_03_pattern_img.pdf')
    # The match is case-insensitive too: the list names the CNXML basename, and
    # the vendor's file may differ in case, which is the whole reason we are here.
    got, ed = resolve('cnx_chem_19_03_PATTERN_img', trees, prec, superseded=sup)
    check('superseded match folds case like the lookup does', got, None)

    # Our OWN translated output must never be sourced back in as input.
    tis = old/'Ch_19'/'Translated_IS'; tis.mkdir(parents=True)
    (tis/'cnx_chem_19_09_own.pdf').write_bytes(b'ours')
    got, ed = resolve('CNX_Chem_19_09_Own', trees, prec)
    check('never resolves into Translated_IS', got, None)

# ---------------------------------------------------------------------------
# The shipped list is DATA, and its integrity is checkable without a machine's
# artwork trees: an entry whose value is empty is a permanent hole nobody can
# later evaluate, which is the whole reason the value is the reason.
# ---------------------------------------------------------------------------
_cfg = load_config()
_sup = _cfg.get('supersededArtwork', {})
check('supersededArtwork is a non-empty mapping', bool(_sup) and isinstance(_sup, dict), True)
check('every superseded entry carries a substantive reason',
      sorted(k for k, v in _sup.items() if not (isinstance(v, str) and len(v.strip()) > 40)), [])
check('the two verified entries are present',
      sorted(_sup) == sorted(['CNX_Chem_19_01_BlastFurn', 'CNX_Chem_19_03_Pattern_img']), True)

print(f"\n{'ALL PASS' if not fails else str(len(fails))+' FAILED'}")
sys.exit(1 if fails else 0)
