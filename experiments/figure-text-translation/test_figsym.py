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
check('1c2 ... and the refusal names where the official file comes from', FS.FONT_SOURCE_URL in raised, raised[-160:])
os.environ['FIGTEXT_STIX_FONT'] = str(tmp / 'absent.otf')
FS._reset()
try:
    FS.load()
    raised = ''
except FS.FontUnavailable as exc:
    raised = str(exc)
check('1d a missing file is REFUSED, naming the path', 'absent.otf' in raised, raised[:160])
check('1d2 ... and the refusal names where the official file comes from', FS.FONT_SOURCE_URL in raised, raised[-160:])
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

print('\n[5] the font in use is the one that was hashed, even when $FIGTEXT_STIX_FONT changes after load()')
# Behavioural, not by construction: switch the variable to an unreadable, unhashed file WITHOUT _reset(). A
# subset_woff2 that re-opened font_path() would raise (TTLibError on these bytes); one that parses the verified
# bytes returns a clean subset. 5c is the control that the switch was real and that file would be refused.
FS._reset()
FS.load()
junk = tmp / 'junk.otf'
junk.write_bytes(b'not a font at all')
os.environ['FIGTEXT_STIX_FONT'] = str(junk)
try:
    woff5, raised5 = FS.subset_woff2({'+'}), ''
except Exception as exc:  # noqa: BLE001 - any exception here is the defect being tested for
    woff5, raised5 = None, f'{type(exc).__name__}: {exc}'
sub5 = TTFont(io.BytesIO(woff5)) if woff5 else None
check('5a after a switch with no _reset(), subset_woff2 still subsets the VERIFIED font',
      sub5 is not None and ord('+') in sub5.getBestCmap() and FS.name_violations(sub5) == [], raised5[:160])
check('5b ... and it subset a fresh parse: covers() still sees a character outside that subset', FS.covers('×'))
FS._reset()
try:
    FS.load()
    raised5c = ''
except FS.FontUnavailable as exc:
    raised5c = str(exc)
check('5c CONTROL — once the cache is reset, the switched-to file is REFUSED', 'sha256' in raised5c, raised5c[:160])
del os.environ['FIGTEXT_STIX_FONT']
FS._reset()

print('\n[6] the three further faces (§C140 \'6\' M6, [USER] R-12): Italic, Bold, BoldItalic, hash-pinned siblings')
# No skip anywhere: a box without the three files FAILS 6a (and every check that loads them), as 1a does for Regular.
NEW = ((False, True), (True, False), (True, True))
SUBFAMILY = {(False, True): 'Italic', (True, False): 'Bold', (True, True): 'BoldItalic'}
real_face = {face: FS.face_path(face) for face in NEW}
for face in NEW:
    check(f'6a {SUBFAMILY[face]}: the official face file is present on this box', real_face[face].is_file(),
          str(real_face[face]))
check('6a2 the faces are SIBLINGS of font_path() (one locator, G3), and Regular IS font_path()',
      all(real_face[f].parent == FS.font_path().parent for f in NEW) and FS.face_path((False, False)) == FS.font_path(),
      str([str(real_face[f]) for f in NEW]))
os.environ['FIGTEXT_STIX_FONT'] = str(tmp / 'elsewhere' / 'any-name.otf')
check("6a3 ... and they follow $FIGTEXT_STIX_FONT: its directory, the face's own file name",
      FS.face_path((False, True)) == tmp / 'elsewhere' / 'STIXGeneral-Italic.otf'
      and FS.face_path((False, False)) == tmp / 'elsewhere' / 'any-name.otf', str(FS.face_path((False, True))))
del os.environ['FIGTEXT_STIX_FONT']
FS._reset()
loaded = {}
for face in NEW:
    f6 = FS.load_face(face)[0]
    loaded[face] = f6
    check(f'6b {SUBFAMILY[face]}: load_face() returns the official 1.1.0 file named STIXGeneral-{SUBFAMILY[face]}',
          f6['name'].getDebugName(5) == 'Version 1.1.0' and f6['name'].getDebugName(6) == f'STIXGeneral-{SUBFAMILY[face]}',
          f"{f6['name'].getDebugName(5)} {f6['name'].getDebugName(6)}")
check('6b2 load_face(Regular) IS load() (one Regular, one hash pin)', FS.load_face((False, False))[0] is FS.load())
# 6c / 6d: the corrupted or missing face sits at its SIBLING name in a tmp directory the locator points at, so the
# refusal under test is the face's own (a wrong directory would give "missing", not the sha256 refusal).
bad_dir = tmp / 'bad-faces'
bad_dir.mkdir()
os.environ['FIGTEXT_STIX_FONT'] = str(bad_dir / 'STIXGeneral-Regular.otf')
for face in NEW:
    (bad_dir / FS.FACES[face][0]).write_bytes(real_face[face].read_bytes()[:-1] + b'\x00')
    FS._reset()
    try:
        FS.load_face(face)
        raised = ''
    except FS.FontUnavailable as exc:
        raised = str(exc)
    check(f'6c {SUBFAMILY[face]}: a face file with the wrong hash is REFUSED, naming the reason', 'sha256' in raised,
          raised[:160])
    check(f'6c2 ... and the refusal names where THAT face comes from ({FS.FACES[face][0]})',
          FS.FACES[face][3] in raised and FS.FACES[face][3].endswith('/' + FS.FACES[face][0]), raised[-200:])
absent_dir = tmp / 'no-faces'
absent_dir.mkdir()
os.environ['FIGTEXT_STIX_FONT'] = str(absent_dir / 'STIXGeneral-Regular.otf')
for face in NEW:
    FS._reset()
    try:
        FS.load_face(face)
        raised = ''
    except FS.FontUnavailable as exc:
        raised = str(exc)
    check(f'6d {SUBFAMILY[face]}: a missing face file is REFUSED, naming the path',
          str(absent_dir / FS.FACES[face][0]) in raised, raised[:200])
    check('6d2 ... and the refusal names where THAT face comes from', FS.FACES[face][3] in raised, raised[-200:])
del os.environ['FIGTEXT_STIX_FONT']
FS._reset()
check('6c3 CONTROL - the four source URLs are distinct, all in the archive directory FONT_SOURCE_URL is in, '
      "and Regular's IS FONT_SOURCE_URL",
      len({FS.FACES[f][3] for f in FS.FACES}) == 4
      and all(FS.FACES[f][3].rsplit('/', 1)[0] == FS.FONT_SOURCE_URL.rsplit('/', 1)[0] for f in FS.FACES)
      and FS.FACES[(False, False)][3] == FS.FONT_SOURCE_URL, str([FS.FACES[f][3] for f in FS.FACES]))

E6 = (('/ABCDEF+STIXGeneral-Regular', (False, False)), ('STIXGeneral-Regular', (False, False)),
      ('/ABCDEF+STIXGeneral-Italic', (False, True)), ('STIXGeneral-Italic', (False, True)),
      ('/ABCDEF+STIXGeneral-Bold', (True, False)), ('STIXGeneral-Bold', (True, False)),
      ('/ABCDEF+STIXGeneral-BoldItalic', (True, True)), ('STIXGeneral-BoldItalic', (True, True)),
      ('STIXGeneral', None), ('/ABCDEF+STIXSizeOneSym-Regular', None), ('/XYZABC+MathematicalPi-One', None),
      ('/ABCDEF+LiberationSans-Italic', None), ('', None))
for base, want in E6:
    check(f'6e eligible_face({base!r}) -> {want}', FS.eligible_face(base) == want, repr(FS.eligible_face(base)))


def _vf(base, subtype=None):
    entry = {'base': base} if subtype is None else {'base': base, 'subtype': subtype}
    return FS.verified_face({'font': 'F'}, {'F': entry})


E6F = ((('/ABCDEF+STIXGeneral-Italic', '/Type1'), (False, True)),
       (('/ABCDEF+STIXGeneral-Bold', '/Type1'), (True, False)),
       (('/ABCDEF+STIXGeneral-BoldItalic', '/Type1'), (True, True)),
       (('/ABCDEF+STIXGeneral-Italic', '/TrueType'), None),
       (('/ABCDEF+STIXGeneral-Italic', '/Type0'), None),
       (('/ABCDEF+STIXGeneral-Italic', None), None),
       (('/ABCDEF+STIXGeneral-Regular', '/TrueType'), (False, False)),
       (('/ABCDEF+STIXGeneral-Regular', None), (False, False)),
       (('/ABCDEF+LiberationSans-Italic', '/Type1'), None))
for (base, subtype), want in E6F:
    check(f'6f verified_face({base}, subtype {subtype}) -> {want}', _vf(base, subtype) == want, repr(_vf(base, subtype)))
check('6f2 a run whose font key is absent from the font table is not eligible',
      FS.verified_face({'font': 'NOPE'}, {}) is None)

for face in NEW:
    sub6 = TTFont(io.BytesIO(FS.subset_woff2_face({'A', 'x', '+'}, face)))
    off = loaded[face]
    want2 = {'Italic': 'Italic', 'Bold': 'Bold', 'BoldItalic': 'Bold Italic'}[SUBFAMILY[face]]
    check(f'6g {SUBFAMILY[face]}: the renamed subset names no reserved name or word', FS.name_violations(sub6) == [],
          str(FS.name_violations(sub6)))
    check(f'6g2 {SUBFAMILY[face]}: name IDs 0 and 7 and the CFF Notice kept verbatim from the official face',
          all(sub6['name'].getDebugName(i) == off['name'].getDebugName(i) for i in (0, 7))
          and sub6['CFF '].cff.topDictIndex[0].Notice == off['CFF '].cff.topDictIndex[0].Notice)
    check(f'6g3 {SUBFAMILY[face]}: family ID 1 is FigSym, subfamily ID 2 is {want2!r}',
          sub6['name'].getDebugName(1) == 'FigSym' and sub6['name'].getDebugName(2) == want2,
          f"{sub6['name'].getDebugName(1)} / {sub6['name'].getDebugName(2)}")
    check(f'6g4 CONTROL - the official {SUBFAMILY[face]} face DOES violate', len(FS.name_violations(off)) >= 4,
          str(FS.name_violations(off)[:4]))

four = dict(loaded)
four[(False, False)] = FS.load()
check('6h the PREMISE metadata_element rests on: name IDs 0 and 7 are byte-equal across the four faces',
      all(len({four[f]['name'].getDebugName(i) for f in four}) == 1 for i in (0, 7)))
check('6h2 CONTROL - the same comparison CAN fail: name ID 6 (the PostScript name) differs across them',
      len({four[f]['name'].getDebugName(6) for f in four}) == 4, str({four[f]['name'].getDebugName(6) for f in four}))
md4 = FS.metadata_element(((False, False), (True, False), (False, True), (True, True)))
try:
    el4 = ET.fromstring(md4)
except ET.ParseError:
    el4 = None
check('6i metadata_element(all four) parses as XML', el4 is not None)
text4 = el4.text if el4 is not None else ''
check('6i2 ... and names every embedded face',
      all(f'STIXGeneral-{s}' in text4 for s in ('Regular', 'Italic', 'Bold', 'BoldItalic')), text4[:200])
md1 = FS.metadata_element()
check("6i3 CONTROL - metadata_element() with no argument still names Regular alone (today's figures)",
      'subset of STIXGeneral-Regular from' in md1 and 'STIXGeneral-Italic' not in md1, md1[:120])

for face in NEW:
    a_av, a_a, a_v = FS.advance('AV', face, 10.0), FS.advance('A', face, 10.0), FS.advance('V', face, 10.0)
    check(f'6j {SUBFAMILY[face]}: advance() is linear and unkerned (AV == A + V) and non-zero',
          a_av > 0 and abs(a_av - (a_a + a_v)) < 1e-9, f'{a_av} vs {a_a} + {a_v}')
check('6j2 advance() scales with size',
      abs(FS.advance('A', (False, True), 20.0) - 2 * FS.advance('A', (False, True), 10.0)) < 1e-9)
check('6j3 CONTROL - the faces really differ: Bold A and Italic A have different advances',
      FS.advance('A', (True, False), 10.0) != FS.advance('A', (False, True), 10.0))

# [6k] the counterpart of [5], for a face: after load_face(), point the locator at junk WITHOUT _reset().
FS._reset()
FS.load_face((False, True))
junk_dir = tmp / 'junk-faces'
junk_dir.mkdir()
(junk_dir / 'STIXGeneral-Italic.otf').write_bytes(b'not a font at all')
os.environ['FIGTEXT_STIX_FONT'] = str(junk_dir / 'STIXGeneral-Regular.otf')
try:
    woff6k, raised6k = FS.subset_woff2_face({'q'}, (False, True)), ''
except Exception as exc:  # noqa: BLE001 - any exception here is the defect being tested for
    woff6k, raised6k = None, f'{type(exc).__name__}: {exc}'
sub6k = TTFont(io.BytesIO(woff6k)) if woff6k else None
check('6k after a switch with no _reset(), subset_woff2_face still subsets the VERIFIED Italic bytes',
      sub6k is not None and ord('q') in sub6k.getBestCmap() and FS.name_violations(sub6k) == [], raised6k[:160])
FS._reset()
try:
    FS.load_face((False, True))
    raised6k2 = ''
except FS.FontUnavailable as exc:
    raised6k2 = str(exc)
check('6k2 CONTROL - once the cache is reset, the switched-to junk face is REFUSED', 'sha256' in raised6k2,
      raised6k2[:160])
del os.environ['FIGTEXT_STIX_FONT']
FS._reset()

shutil.rmtree(tmp, ignore_errors=True)
print(f"\n  {'ALL PASS' if not fails else str(len(fails)) + ' FAILED: ' + ', '.join(fails)}")
sys.exit(0 if not fails else 1)
