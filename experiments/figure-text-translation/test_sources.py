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
# §C140 ⑦ — PRODUCTION PAGES ARE REFUSED, INSIDE AN EDITION, WITH A REASON
# Measured 2026-09-16: exactly 2 of 910 resolved artworks sit at a standard paper size
# (rvosmosis, N2O5 — both Letter), 0 others even at ±10 pt; the next largest is 468×576 pt.
# ---------------------------------------------------------------------------
import pikepdf, struct
import sources as S
from sources import resolve_detail, page_size, paper_size_name, human_report


def make_pdf(path, w, h):
    pdf = pikepdf.new()
    pdf.add_blank_page(page_size=(w, h))
    pdf.save(str(path))


def make_eps(path, w, h, dos=False):
    ps = (f'%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 {int(w)} {int(h)}\n'
          f'%%HiResBoundingBox: 0 0 {w} {h}\n%%EndComments\nshowpage\n').encode()
    if dos:
        # 🔴 THE PREVIEW IS WHAT MAKES THIS FIXTURE ABLE TO FAIL. A DOS EPS stores a binary preview
        # AHEAD of the PostScript; with the PostScript right after the 30-byte header, a plain
        # 64 KB read from offset 0 finds the real bounding box whether or not the header is
        # followed — the first version of this test passed with the DOS branch deleted. So the
        # preview is longer than that read and opens with a DECOY 100x100 box: ignoring the header
        # now returns a WRONG VALUE, not merely the right one by luck.
        preview = b'%%BoundingBox: 0 0 100 100\n' + b'\x00' * 70_000
        ps_offset = 30 + len(preview)
        header = (b'\xc5\xd0\xd3\xc6'
                  + struct.pack('<IIIIII', ps_offset, len(ps), 0, 0, 30, len(preview)) + b'\xff\xff')
        assert len(header) == 30
        path.write_bytes(header + preview + ps)
    else:
        path.write_bytes(ps)


with tempfile.TemporaryDirectory() as td:
    td = Path(td)
    old, new = td / 'first-edition', td / 'updates-2e'
    old.mkdir(); new.mkdir()
    trees = {'first-edition': str(old), 'updates-2e': str(new)}
    prec = ['updates-2e', 'first-edition']

    make_pdf(old / 'CNX_Page.pdf', 612, 792)
    make_eps(old / 'CNX_Page.eps', 287.99, 90.62)
    make_pdf(old / 'CNX_Sheet.pdf', 612, 792)
    make_pdf(old / 'CNX_A4.pdf', 841.89, 595.28)
    make_pdf(old / 'CNX_Big.pdf', 468, 576)
    make_eps(old / 'CNX_Dos.eps', 612, 792, dos=True)
    make_pdf(new / 'CNX_Split.pdf', 612, 792)
    make_pdf(old / 'CNX_Split.pdf', 300, 200)
    (old / 'CNX_Junk.pdf').write_bytes(b'not a pdf')
    # Two EPS files whose bytes raise inside `_eps_size` rather than simply not matching.
    (old / 'CNX_TruncDos.eps').write_bytes(b'\xc5\xd0\xd3\xc6\x01\x02')   # struct.error
    (old / 'CNX_BadNum.eps').write_bytes(b'%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 612.0.1 792\n')

    check('page_size reads a PDF page box', page_size(old / 'CNX_Big.pdf'), (468.0, 576.0))
    check('page_size reads an EPS HiResBoundingBox', page_size(old / 'CNX_Page.eps'), (287.99, 90.62))
    check('page_size follows a DOS EPS binary header', page_size(old / 'CNX_Dos.eps'), (612.0, 792.0))
    check('page_size is None for an unreadable file', page_size(old / 'CNX_Junk.pdf'), None)
    check('DOS EPS CONTROL — the preview really holds a decoy box a header-blind read would find',
          b'%%BoundingBox: 0 0 100 100' in (old / 'CNX_Dos.eps').read_bytes()[:65536], True)
    check('page_size is None for a truncated DOS EPS header (struct.error)',
          page_size(old / 'CNX_TruncDos.eps'), None)
    check('page_size is None for a BoundingBox number float() rejects (ValueError)',
          page_size(old / 'CNX_BadNum.eps'), None)
    check('paper_size_name knows Letter', paper_size_name((612.4, 791.0)), 'Letter')
    check('paper_size_name knows A4 landscape', paper_size_name((841.89, 595.28)), 'A4')
    check('CONTROL paper_size_name ignores a large real figure', paper_size_name((468, 576)), None)

    d = resolve_detail('CNX_Page', trees, prec)
    check('a Letter PDF falls through to the same-stem EPS in its edition',
          (Path(d['path']).name, d['edition']), ('CNX_Page.eps', 'first-edition'))
    d = resolve_detail('CNX_Sheet', trees, prec)
    check('a Letter PDF with nothing else is REFUSED as a production page',
          (d['path'], d['refused'], d['edition'], [c['paper'] for c in d['candidates']]),
          (None, 'production-page', 'first-edition', ['Letter']))
    check('the refusal names its candidate and size',
          (Path(d['candidates'][0]['path']).name, d['candidates'][0]['page']),
          ('CNX_Sheet.pdf', [612.0, 792.0]))
    check('an A4 landscape page is refused too', resolve_detail('CNX_A4', trees, prec)['refused'],
          'production-page')
    check('CONTROL a 468x576 figure resolves', Path(resolve_detail('CNX_Big', trees, prec)['path']).name,
          'CNX_Big.pdf')
    d = resolve_detail('CNX_Split', trees, prec)
    check('a page in updates-2e is REFUSED, never replaced by the 1st-edition figure',
          (d['refused'], d['edition']), ('production-page', 'updates-2e'))
    d = resolve_detail('CNX_Junk', trees, prec)
    check('an unreadable page size resolves and is FLAGGED, not refused',
          (Path(d['path']).name, d.get('pageUnknown')), ('CNX_Junk.pdf', True))
    for stem in ('CNX_TruncDos', 'CNX_BadNum'):
        d = resolve_detail(stem, trees, prec)
        check(f'{stem}: malformed EPS bytes resolve and are FLAGGED pageUnknown, never raise',
              (Path(d['path']).name, d.get('pageUnknown')), (f'{stem}.eps', True))
    d = resolve_detail('CNX_X', trees, prec, superseded={'CNX_X': 'a reason that is long enough to count'})
    check('a superseded figure is refused on the same channel, with its reason',
          (d['path'], d['refused'], d['reason']), (None, 'superseded', 'a reason that is long enough to count'))
    check('resolve() still returns (None, None) for a refusal', resolve('CNX_Sheet', trees, prec), (None, None))
    check('resolve() still returns the fall-through path', resolve('CNX_Page', trees, prec)[0].name, 'CNX_Page.eps')
    rep = resolve_report(['CNX_Sheet', 'CNX_Big', 'CNX_Nowhere'], trees, prec)
    check('resolve_report carries the refusal, the hit and the hole',
          (rep['CNX_Sheet']['refused'], Path(rep['CNX_Big']['path']).name, rep['CNX_Nowhere']),
          ('production-page', 'CNX_Big.pdf', None))

    # The HUMAN CLI must not print a refusal as NOT FOUND — the misreport §3.4 corrects in the driver.
    lines, missing, refused = human_report(['CNX_Sheet', 'CNX_Nowhere', 'CNX_Big'], trees, prec)
    by_name = {n: [l for l in lines if f' {n} ' in l] for n in ('CNX_Sheet', 'CNX_Nowhere', 'CNX_Big')}
    check('human CLI: a refused figure is printed REFUSED with its kind and reason, not NOT FOUND',
          (len(by_name['CNX_Sheet']) == 1 and 'REFUSED — production-page: every candidate' in by_name['CNX_Sheet'][0]
           and 'NOT FOUND' not in by_name['CNX_Sheet'][0]), True)
    check('human CLI: a missing figure is still printed NOT FOUND',
          len(by_name['CNX_Nowhere']) == 1 and 'NOT FOUND' in by_name['CNX_Nowhere'][0], True)
    check('human CLI CONTROL: a resolved figure is printed with its edition and path',
          len(by_name['CNX_Big']) == 1 and 'first-edition' in by_name['CNX_Big'][0]
          and by_name['CNX_Big'][0].endswith('CNX_Big.pdf'), True)
    check('human CLI: refusals and not-found figures are counted apart', (missing, refused), (1, 1))
    check('human CLI: the two count lines say which is which',
          ('  1 of 3 not found in any configured tree' in lines,
           any(l.startswith('  1 of 3 REFUSED') for l in lines)), (True, True))


# ---------------------------------------------------------------------------
# §C140 ㊵ — A RETIRED FIGURE IS REFUSED FIRST: before `superseded`, before any lookup.
# Retired is about the TRANSLATED COPY (removed by a ruling); superseded is about the SOURCE
# drawing. A figure may be in both, and retired wins so the chapter autorun's halt on
# `REFUSED — superseded` stops firing for a figure with nothing left to publish over.
# ---------------------------------------------------------------------------
import json

with tempfile.TemporaryDirectory() as td:
    td = Path(td)
    old, new = td / 'first-edition', td / 'updates-2e'
    old.mkdir(); new.mkdir()
    trees = {'first-edition': str(old), 'updates-2e': str(new)}
    prec = ['updates-2e', 'first-edition']
    make_eps(old / 'CNX_Ret.eps', 300, 200)
    make_eps(old / 'CNX_Other.eps', 300, 200)
    R = {'CNX_Ret': 'retired by a test ruling: readers get the English figure instead'}
    SUP = {'CNX_Ret': 'its only vector is known to be superseded (a test reason)'}

    d = resolve_detail('CNX_Ret', trees, prec, retired=R)
    check('㊵ a retired figure is refused before any lookup, with its reason',
          (d['path'], d['refused'], d['edition'], d['reason']), (None, 'retired', None, R['CNX_Ret']))
    check('㊵ CONTROL: without the table the same figure resolves',
          Path(resolve_detail('CNX_Ret', trees, prec)['path']).name, 'CNX_Ret.eps')
    check('㊵ retired is checked BEFORE superseded: a figure may be in both',
          resolve_detail('CNX_Ret', trees, prec, superseded=SUP, retired=R)['refused'], 'retired')
    check('㊵ CONTROL: superseded alone still refuses as superseded',
          resolve_detail('CNX_Ret', trees, prec, superseded=SUP)['refused'], 'superseded')
    check('㊵ retired keys fold case and punctuation, like the lookup',
          resolve_detail('cnx-ret', trees, prec, retired=R)['refused'], 'retired')
    d = resolve_detail('CNX_Ret', trees, prec, retired={'CNX_Ret': ''})
    check('㊵ an entry acts by its PRESENCE: an empty reason still refuses',
          (d['refused'], d['reason']), ('retired', '(no reason recorded)'))
    check('㊵ CONTROL: another figure is untouched by the table',
          Path(resolve_detail('CNX_Other', trees, prec, retired=R)['path']).name, 'CNX_Other.eps')
    check('㊵ resolve() returns (None, None) for a retired figure',
          resolve('CNX_Ret', trees, prec, retired=R), (None, None))
    check('㊵ resolve_report carries the retired refusal',
          resolve_report(['CNX_Ret'], trees, prec, retired=R)['CNX_Ret']['refused'], 'retired')
    lines, missing, refused = human_report(['CNX_Ret', 'CNX_Other'], trees, prec, retired=R)
    check('㊵ the human report prints REFUSED — retired with its reason, and counts it',
          (any('REFUSED — retired: retired by a test ruling' in l for l in lines), missing, refused),
          (True, 0, 1))

    # ONE function runs both command-line modes. The seam is a synthetic config whose
    # sourceTreesFile is an ABSOLUTE path: load_trees joins it onto HERE, and an absolute path
    # wins a pathlib join.
    local = td / 'sources.local.json'
    local.write_text(json.dumps({'testbook': trees}))
    cfg = {'editionPrecedence': prec, 'sourceTreesFile': str(local),
           'supersededArtwork': {}, 'retiredFigures': R}
    check('㊵ policy() takes its tables from the config',
          S.policy({'supersededArtwork': 1, 'retiredFigures': 2, 'artworkPins': 3}),
          {'superseded': 1, 'retired': 2, 'pins': 3})
    out = []
    rc = S.run_cli(['--json', 'testbook', 'CNX_Ret', 'CNX_Other'], cfg=cfg, out=out.append)
    rep = json.loads(out[0])
    check('㊵ run_cli --json applies retiredFigures, leaves the control alone, and exits 0',
          (rc, rep['CNX_Ret']['refused'], Path(rep['CNX_Other']['path']).name),
          (0, 'retired', 'CNX_Other.eps'))
    out = []
    rc = S.run_cli(['testbook', 'CNX_Ret', 'CNX_Other'], cfg=cfg, out=out.append)
    check('㊵ run_cli human mode applies it too, and exits 1 on the refusal',
          (rc, 'REFUSED — retired' in out[0], 'CNX_Other.eps' in out[0]), (1, True, True))
    out = []
    S.run_cli(['--json', 'testbook', 'CNX_Ret'], cfg=dict(cfg, retiredFigures={}), out=out.append)
    check('㊵ CONTROL: run_cli without the entry resolves the figure',
          Path(json.loads(out[0])['CNX_Ret']['path']).name, 'CNX_Ret.eps')
    try:
        S.run_cli(['--json', 'testbook'], cfg=cfg, out=out.append)
        raised = 'returned'
    except SystemExit as exc:
        raised = str(exc)
    check('㊵ run_cli with too few arguments exits with the usage text',
          raised.startswith('Resolve a figure basename'), True)

# §C140 ㊵ — THE SAME LITERAL TABLE AS tools/__tests__/figure-text-config.test.js. Two implementations
# of one fold (sources._normkey and the JS normkey) are kept in agreement by pinning both to it.
_NORMKEY_CASES = [
    ('CNX_Chem_12_07_Cat Convert', 'cnxchem1207catconvert'),
    ('CNX_Chem_21_03_RadioDecay-e619', 'cnxchem2103radiodecaye619'),
    ('Figure 14_03_ICETable2_img', 'figure1403icetable2img'),
    ('CNX_Chem_08_02_sp3d_img', 'cnxchem0802sp3dimg'),
    ('Ö_Ð-þ²', 'öðþ²'),
]
check('㊵ _normkey matches the case table the JS normkey is pinned to',
      [S._normkey(a) for a, _ in _NORMKEY_CASES], [b for _, b in _NORMKEY_CASES])

# ---------------------------------------------------------------------------
# §C140 ㊵ — ARTWORK PINS: one exact file, alias or override, failing closed.
# ---------------------------------------------------------------------------
PIN_REASON = 'a pin reason that is long enough to be a real reason (test)'


def pin(kind, edition, file, reason=PIN_REASON):
    return {'kind': kind, 'edition': edition, 'file': file, 'reason': reason}


with tempfile.TemporaryDirectory() as td:
    td = Path(td)
    old, new = td / 'first-edition', td / 'updates-2e'
    (old / 'Ch_03').mkdir(parents=True); (new / 'OSX').mkdir(parents=True)
    trees = {'first-edition': str(old), 'updates-2e': str(new)}
    prec = ['updates-2e', 'first-edition']

    make_eps(new / 'OSX' / 'Figure 14_03_ICE.eps', 351, 95)     # an alias target, with a space
    make_pdf(old / 'Ch_03' / 'CNX_Ibu.pdf', 432, 115)           # the base tree's OTHER drawing
    make_eps(old / 'Ch_03' / 'CNX_Ibu.eps', 451, 126)           # the drawing [USER] approved
    make_eps(new / 'CNX_Ibu.eps', 430, 114)                     # what the normal lookup returns
    make_eps(new / 'CNX_ice2.eps', 300, 200)                    # folds onto CNX_ICE2
    make_eps(old / 'Cnx_Amb.eps', 300, 200)                     # two stems folding onto one key,
    make_eps(old / 'cnx-amb.eps', 300, 200)                     #   neither exact: the lookup declines both
    make_pdf(new / 'OSX' / 'Sheet.pdf', 612, 792)               # a Letter production page
    (new / 'OSX' / 'Junk.pdf').write_bytes(b'not a pdf')        # a size nobody can read
    make_eps(new / 'OSX' / 'Shared.eps', 300, 200)

    P = {'CNX_ICE': pin('alias', 'updates-2e', 'OSX/Figure 14_03_ICE.eps')}
    d = resolve_detail('CNX_ICE', trees, prec, pins=P)
    check('㊵ an alias resolves to its exact file, space included, marked via alias',
          (Path(d['path']).name, d['edition'], d['via']),
          ('Figure 14_03_ICE.eps', 'updates-2e', 'alias'))
    check('㊵ CONTROL: without the pin the basename is a hole',
          resolve_detail('CNX_ICE', trees, prec), None)

    d = resolve_detail('CNX_ICE2', trees, prec,
                       pins={'CNX_ICE2': pin('alias', 'updates-2e', 'OSX/Figure 14_03_ICE.eps')})
    check('㊵ an alias is refused as pin-conflict once a file folds onto its basename, naming it',
          (d['refused'], [Path(c['path']).name for c in d['candidates']]),
          ('pin-conflict', ['CNX_ice2.eps']))
    check('㊵ CONTROL: that file is what the normal lookup finds',
          Path(resolve_detail('CNX_ICE2', trees, prec)['path']).name, 'CNX_ice2.eps')
    d = resolve_detail('CNX_Amb', trees, prec,
                       pins={'CNX_Amb': pin('alias', 'updates-2e', 'OSX/Figure 14_03_ICE.eps')})
    check('㊵ an AMBIGUOUS fold is a conflict too, though the normal lookup returns None for it',
          (d['refused'], sorted(Path(c['path']).name for c in d['candidates'])),
          ('pin-conflict', ['Cnx_Amb.eps', 'cnx-amb.eps']))
    check('㊵ CONTROL: the normal lookup does return None for the ambiguous fold',
          resolve_detail('CNX_Amb', trees, prec), None)

    O = {'CNX_Ibu': pin('override', 'first-edition', 'Ch_03/CNX_Ibu.eps')}
    d = resolve_detail('CNX_Ibu', trees, prec, pins=O)
    check('㊵ an override returns its exact file, over edition AND format precedence',
          (Path(d['path']).relative_to(old).as_posix(), d['edition'], d['via']),
          ('Ch_03/CNX_Ibu.eps', 'first-edition', 'override'))
    d = resolve_detail('CNX_Ibu', trees, prec)
    check('㊵ CONTROL: without the pin the normal lookup returns the updates-2e file',
          (Path(d['path']).name, d['edition']), ('CNX_Ibu.eps', 'updates-2e'))
    check('㊵ CONTROL: a tree-only rule would pick the .pdf, the other drawing',
          Path(resolve_detail('CNX_Ibu', {'first-edition': str(old)}, ['first-edition'])['path']).name,
          'CNX_Ibu.pdf')

    d = resolve_detail('CNX_Ibu', trees, prec,
                       pins={'CNX_Ibu': pin('override', 'first-edition', 'Ch_03/Nope.eps')})
    check('㊵ a missing pinned file is refused as pin-missing, never a fall-back',
          (d['path'], d['refused']), (None, 'pin-missing'))

    for label, entry in [
        ('not an object', 'OSX/Figure 14_03_ICE.eps'),
        ('an unknown kind', pin('alias2', 'updates-2e', 'OSX/Figure 14_03_ICE.eps')),
        ('an unconfigured edition', pin('alias', 'nowhere', 'OSX/Figure 14_03_ICE.eps')),
        ('a .. segment', pin('alias', 'updates-2e', '../escape.eps')),
        ('an absolute path', pin('alias', 'updates-2e', str(new / 'OSX' / 'Figure 14_03_ICE.eps'))),
        ('an empty file', pin('alias', 'updates-2e', '')),
        ('the tree root', pin('alias', 'updates-2e', '.')),
        ('our own output dir', pin('alias', 'updates-2e', 'Translated_IS/CNX_X.eps')),
        ('a format we cannot read', pin('alias', 'updates-2e', 'OSX/notes.txt')),
        ('no reason', {'kind': 'alias', 'edition': 'updates-2e', 'file': 'OSX/Figure 14_03_ICE.eps'}),
        ('a non-string file', pin('alias', 'updates-2e', 5)),
    ]:
        d = resolve_detail('CNX_ICE', trees, prec, pins={'CNX_ICE': entry})
        check(f'㊵ a pin with {label} is refused as pin-invalid', (d['path'], d['refused']),
              (None, 'pin-invalid'))

    TWINS = {'CNX_P1': pin('alias', 'updates-2e', 'OSX/Shared.eps'),
             'CNX_P2': pin('alias', 'updates-2e', 'OSX/./Shared.eps')}
    check('㊵ two pins naming one file are BOTH refused as pin-conflict',
          [resolve_detail(n, trees, prec, pins=TWINS)['refused'] for n in ('CNX_P1', 'CNX_P2')],
          ['pin-conflict', 'pin-conflict'])
    check('㊵ CONTROL: either pin alone resolves',
          Path(resolve_detail('CNX_P1', trees, prec, pins={'CNX_P1': TWINS['CNX_P1']})['path']).name,
          'Shared.eps')

    d = resolve_detail('CNX_ICE', trees, prec, pins={'CNX_ICE': pin('alias', 'updates-2e', 'OSX/Sheet.pdf')})
    check('㊵ a pinned Letter page is refused as a production page, with its size',
          (d['refused'], d['candidates'][0]['paper'], d['candidates'][0]['page']),
          ('production-page', 'Letter', [612.0, 792.0]))
    d = resolve_detail('CNX_ICE', trees, prec, pins={'CNX_ICE': pin('alias', 'updates-2e', 'OSX/Junk.pdf')})
    check('㊵ a pinned file whose size cannot be read resolves and is FLAGGED',
          (Path(d['path']).name, d.get('pageUnknown')), ('Junk.pdf', True))

    check('㊵ a pin cannot bring back a RETIRED figure',
          resolve_detail('CNX_ICE', trees, prec, pins=P, retired={'CNX_ICE': PIN_REASON})['refused'],
          'retired')
    check('㊵ a pin cannot bring back a SUPERSEDED figure',
          resolve_detail('CNX_ICE', trees, prec, pins=P, superseded={'CNX_ICE': PIN_REASON})['refused'],
          'superseded')
    check('㊵ pin keys fold like the lookup', resolve_detail('cnx-ice', trees, prec, pins=P)['via'], 'alias')

    absent = {'updates-2e': str(td / 'not-mounted'), 'first-edition': str(old)}
    try:
        resolve_detail('CNX_ICE', absent, prec, pins=P)
        raised = 'returned'
    except SystemExit as exc:
        raised = str(exc)
    check('㊵ a pin into a configured tree that is not mounted raises, as the lookup does',
          raised.startswith("Source tree 'updates-2e' is configured"), True)

    H = {'CNX_ICE': pin('alias', 'updates-2e', 'OSX/Figure 14_03_ICE.eps'),
         'CNX_ICE2': pin('alias', 'updates-2e', 'OSX/Shared.eps'),
         'CNX_Ibu': pin('override', 'first-edition', 'Ch_03/Nope.eps'),
         'CNX_Bad': pin('nope', 'updates-2e', 'OSX/Other.eps')}
    lines, missing, refused = human_report(['CNX_ICE', 'CNX_ICE2', 'CNX_Ibu', 'CNX_Bad'], trees, prec, pins=H)
    text = '\n'.join(lines)
    check('㊵ the human report prints a pinned hit with its kind',
          any(l.rstrip().endswith('Figure 14_03_ICE.eps  (pinned: alias)') for l in lines), True)
    check('㊵ the human report prints every new refusal kind, and counts them as refused',
          (all(f'REFUSED — {k}' in text for k in ('pin-conflict', 'pin-missing', 'pin-invalid')),
           missing, refused), (True, 0, 3))
    check('㊵ a candidate with no page size is printed as its path alone',
          any(l.rstrip().endswith('Nope.eps') for l in lines), True)

    local = td / 'sources.local.json'
    local.write_text(json.dumps({'testbook': trees}))
    out = []
    S.run_cli(['--json', 'testbook', 'CNX_ICE'], out=out.append,
              cfg={'editionPrecedence': prec, 'sourceTreesFile': str(local), 'artworkPins': P})
    check('㊵ run_cli --json applies artworkPins', json.loads(out[0])['CNX_ICE']['via'], 'alias')


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
# §C140 ㊷ — PRESENCE, not equality: a verified entry must never be lost, and adding one must not
# turn this red. The equality pin it replaces went red on 2026-09-19, when the two [USER]-confirmed
# ch07 entries were added without touching it, and no CI job runs these suites, so nobody saw it.
# A newly verified entry is added to this list.
_VERIFIED = ['CNX_Chem_07_02_Morse', 'CNX_Chem_07_04_Ques11ans_img',
             'CNX_Chem_19_01_BlastFurn', 'CNX_Chem_19_03_Pattern_img']
check('every verified entry is present', sorted(k for k in _VERIFIED if k not in _sup), [])

# §C140 ⑦ — the paper-size table has ONE owner, figure-text.config.json; tools/figure-run.js reads
# the same keys. sources.py must be using the config's values, not a copy of them.
check('PAPER_SIZES equals the config table', S.PAPER_SIZES,
      {k: (float(w), float(h)) for k, (w, h) in _cfg['paperSizes'].items()})
check('PAPER_TOL_PT equals the config tolerance', S.PAPER_TOL_PT, float(_cfg['paperTolerancePt']))

print(f"\n{'ALL PASS' if not fails else str(len(fails))+' FAILED'}")
sys.exit(1 if fails else 0)
