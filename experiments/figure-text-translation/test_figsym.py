#!/usr/bin/env python3
"""Tests for figsym.py (§C140 ⑥a). Run: FIGTEXT_PYLIBS=./pylibs python3 test_figsym.py

Plain checks. Every property that could pass vacuously is paired with a control that must fail it."""
import io, os, shutil, sys, tempfile
from pathlib import Path
import xml.etree.ElementTree as ET

import _deps  # noqa: F401
import figsym as FS  # noqa: E402
from fontTools.ttLib import TTFont  # noqa: E402

fails = []


def check(label, ok, detail=''):
    print(f"  {'PASS' if ok else 'FAIL'}  {label}" + (f": {detail}" if detail else ''))
    if not ok:
        fails.append(label)


print('\n[1] the font is located and hash-checked')
p = FS.font_path()
check('1a the official font file is present on this box', p.is_file(), str(p))
font = FS.load()
check('1b load() returns the official 1.1.0 file', font['name'].getDebugName(5) == 'Version 1.1.0', font['name'].getDebugName(5))
tmp = Path(tempfile.mkdtemp(prefix='figsym-test-'))
bad = tmp / 'bad.otf'
bad.write_bytes(p.read_bytes()[:-1] + b'\x00')
os.environ['FIGTEXT_STIX_FONT'] = str(bad)
FS._reset()
try:
    FS.load()
    raised = ''
except FS.FontUnavailable as exc:
    raised = str(exc)
check('1c a file with the wrong hash is REFUSED, naming the reason', 'sha256' in raised, raised[:160])
os.environ['FIGTEXT_STIX_FONT'] = str(tmp / 'absent.otf')
FS._reset()
try:
    FS.load()
    raised = ''
except FS.FontUnavailable as exc:
    raised = str(exc)
check('1d a missing file is REFUSED, naming the path', 'absent.otf' in raised, raised[:160])
del os.environ['FIGTEXT_STIX_FONT']
FS._reset()

print('\n[2] eligibility is exactly STIXGeneral-Regular')
check('2a a subset-prefixed Regular base is eligible', FS.eligible_base('/ABCDEF+STIXGeneral-Regular'))
check('2b an unprefixed Regular base is eligible', FS.eligible_base('STIXGeneral-Regular'))
for base in ('/ABCDEF+STIXGeneral-Italic', '/ABCDEF+STIXGeneral-Bold', 'STIXGeneral', '/XYZABC+MathematicalPi-One',
             '/ABCDEF+LiberationSans', 'Symbol'):
    check(f'2c {base} is NOT eligible', not FS.eligible_base(base))
check('2d covers() accepts characters the official cmap has', FS.covers('+=×−<>'))
check('2e covers() rejects a character it lacks', not FS.covers('中'))

print('\n[3] the renamed subset carries no reserved name or word, and keeps the notices')
woff = FS.subset_woff2({'+', '=', '×'})
sub = TTFont(io.BytesIO(woff))
check('3a the subset is woff2', sub.flavor == 'woff2', str(sub.flavor))
check('3b no forbidden word anywhere a font is named', FS.name_violations(sub) == [], str(FS.name_violations(sub)))
orig = FS.load()
for nid in (0, 7):
    check(f'3c name ID {nid} kept verbatim', sub['name'].getDebugName(nid) == orig['name'].getDebugName(nid),
          (sub['name'].getDebugName(nid) or '')[:80])
check('3d the CFF Notice is kept verbatim',
      sub['CFF '].cff.topDictIndex[0].Notice == orig['CFF '].cff.topDictIndex[0].Notice)
check('3e family name ID 1 is FigSym', sub['name'].getDebugName(1) == 'FigSym', sub['name'].getDebugName(1))
check('3f CONTROL — the unrenamed official font DOES violate', len(FS.name_violations(orig)) >= 4,
      str(FS.name_violations(orig)[:4]))
cmap = sub.getBestCmap()
check('3g the subset holds the requested characters', all(ord(c) in cmap for c in '+=×'), str(sorted(cmap)[:6]))

print('\n[4] the metadata element parses, carries the notices and the pinned licence text')
md = FS.metadata_element()
lic = (Path(FS.__file__).parent / 'fonts' / 'STIX-1.1.0-LICENSE.txt').read_text(encoding='utf-8')
check('4a CONTROL — the licence text contains "--" (why a comment is impossible)', '--' in lic)
check('4a2 CONTROL — the pinned licence file contains U+000C (page breaks from pdftotext -layout)', '\f' in lic)
try:
    el = ET.fromstring(md)
    parsed = True
except ET.ParseError as exc:
    el, parsed = None, False
check('4b <metadata> parses as XML', parsed)
check('4c it is not a comment', md.lstrip().startswith('<metadata') and '<!--' not in md)
text = el.text if el is not None else ''
check('4d it carries the copyright notice', orig['name'].getDebugName(0) in text)
check('4e it carries the trademark notice', orig['name'].getDebugName(7) in text)
check('4f it carries the licence text exactly', lic.replace('\f', '\n').strip() in text)
check('4f2 the metadata text contains no U+000C', '\f' not in md)
check('4g it names FigSym, STIX Fonts 1.1.0 and the OFL 1.1',
      all(s in text for s in ('FigSym', '1.1.0', 'SIL Open Font License, Version 1.1')))

shutil.rmtree(tmp, ignore_errors=True)
print(f"\n  {'ALL PASS' if not fails else str(len(fails)) + ' FAILED: ' + ', '.join(fails)}")
sys.exit(0 if not fails else 1)
