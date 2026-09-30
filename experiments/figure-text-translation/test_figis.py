#!/usr/bin/env python3
"""Tests for figis.py (§C140 ㉗). Run: FIGTEXT_PYLIBS=./pylibs python3 test_figis.py

Plain checks, in test_figsym.py's style. Every property that could pass vacuously is paired with a control that must
fail it. Expected values come from the SOURCE font files read directly with fontTools, or from literals — never from
figis itself."""
import io, os, shutil, sys, tempfile
from pathlib import Path
import xml.etree.ElementTree as ET

import _deps  # noqa: F401
import figis as FI  # noqa: E402
import fontsubset  # noqa: E402
from fontTools import subset as fsubset  # noqa: E402
from fontTools.ttLib import TTFont  # noqa: E402


def pre_c27_subset(path, chars):
    """THE REFERENCE: the subsetter svgout.write_svg used before §C140 ㉗ (svgout.subset_face as of 43f61a1c1),
    copied verbatim minus a dead no-op line. It kept fontTools' default name records (IDs 0-6, Windows English only),
    so it embedded "Liberation Sans" names and dropped the trademark notice. Kept HERE, not in svgout, so that no
    production path can reach an unrenamed subsetter again."""
    font = TTFont(path, recalcTimestamp=False)
    opt = fsubset.Options()
    opt.layout_features = ['*']
    opt.desubroutinize = True
    opt.drop_tables += ['DSIG']
    opt.notdef_outline = True
    sub = fsubset.Subsetter(options=opt)
    sub.populate(text=''.join(sorted(chars)))
    sub.subset(font)
    font.flavor = 'woff2'
    buf = io.BytesIO()
    font.save(buf)
    return buf.getvalue()

fails = []
SYS = Path('/usr/share/fonts/truetype/liberation')
FILES = {(False, False): 'LiberationSans-Regular.ttf', (True, False): 'LiberationSans-Bold.ttf',
         (False, True): 'LiberationSans-Italic.ttf', (True, True): 'LiberationSans-BoldItalic.ttf'}
STYLE = {(False, False): 'Regular', (True, False): 'Bold', (False, True): 'Italic', (True, True): 'Bold Italic'}
TRADEMARK = ('Liberation is a trademark of Red Hat, Inc. registered in U.S. Patent and Trademark Office and certain '
             'other jurisdictions.')
ICELANDIC = set('Þþ Ðð Ææ Öö Áá Íí Úú Ýý Éé Óó 0,5 °C')


def check(label, ok, detail=''):
    print(f"  {'PASS' if ok else 'FAIL'}  {label}" + (f": {detail}" if detail else ''))
    if not ok:
        fails.append(label)


def refusal(fn):
    """The FontUnavailable message fn raises, or '' when it raises nothing."""
    try:
        fn()
    except FI.FontUnavailable as exc:
        return str(exc)
    return ''


def source(key):
    """The source face, read directly — independent of the module under test."""
    return TTFont(str(SYS / FILES[key]))


def names(font, nid):
    return sorted({r.toUnicode() for r in font['name'].names if r.nameID == nid})


tmp = Path(tempfile.mkdtemp(prefix='figis-test-'))

print('\n[1] each face is located, hash-checked and is the file fontconfig resolves (what cairo measures with)')
for key in FILES:
    f = FI.load(key)
    check(f'1a {STYLE[key]}: load() returns Liberation Sans 2.1.5',
          f['name'].getDebugName(5) == 'Version 2.1.5' and f['name'].getDebugName(2) == STYLE[key],
          f"{f['name'].getDebugName(1)} / {f['name'].getDebugName(2)} / {f['name'].getDebugName(5)}")

# A tampered copy of one face: the hash check must refuse it (and name the path and the reason).
bad = tmp / 'bad'
bad.mkdir()
for key, name in FILES.items():
    shutil.copy(SYS / name, bad / name)
reg = bad / FILES[(False, False)]
reg.write_bytes(reg.read_bytes()[:-1] + b'\x00')
os.environ['FIGTEXT_LIBERATION_DIR'] = str(bad)
FI._reset()
msg = refusal(lambda: FI.load((False, False)))
check('1b a face with the wrong hash is REFUSED, naming the reason', 'sha256' in msg, msg[:160])
check('1b2 ... and naming the file', str(reg) in msg, msg[:200])

# Byte-identical copies in another directory: the hashes match, but fontconfig still resolves "Liberation Sans" to the
# system files — so cairo would MEASURE with one file while svgout EMBEDS another. That must be refused.
same = tmp / 'same'
same.mkdir()
for key, name in FILES.items():
    shutil.copy(SYS / name, same / name)
os.environ['FIGTEXT_LIBERATION_DIR'] = str(same)
FI._reset()
msg = refusal(lambda: FI.load((True, False)))
check('1c a hash-correct face that fontconfig does NOT resolve to is REFUSED', 'fontconfig' in msg, msg[:200])

os.environ['FIGTEXT_LIBERATION_DIR'] = str(tmp / 'absent')
FI._reset()
msg = refusal(lambda: FI.load((False, True)))
check('1d a missing face is REFUSED, naming the path', 'absent' in msg, msg[:160])
del os.environ['FIGTEXT_LIBERATION_DIR']
FI._reset()
check('1e CONTROL — with the override gone, the system faces load again', refusal(lambda: FI.load((False, True))) == '')

print('\n[2] each renamed subset names no Reserved Font Name, keeps the notices, and changes no glyph')
for key in FILES:
    src = source(key)
    woff = FI.subset_woff2(key, ICELANDIC)
    sub = TTFont(io.BytesIO(woff))
    s = STYLE[key]
    check(f'2a {s}: the subset is woff2', sub.flavor == 'woff2', str(sub.flavor))
    check(f'2b {s}: no reserved name or word anywhere a font is named',
          fontsubset.name_violations(sub, FI.FORBIDDEN) == [], str(fontsubset.name_violations(sub, FI.FORBIDDEN)))
    for nid in (0, 7, 13, 14):
        check(f'2c {s}: name ID {nid} kept verbatim (every platform)', names(sub, nid) == names(src, nid) != [],
              str(names(sub, nid))[:90])
    check(f'2d {s}: the trademark notice is Red Hat\'s', names(sub, 7) == [TRADEMARK], str(names(sub, 7))[:90])
    check(f'2e {s}: family name ID 1 is FigIS', names(sub, 1) == ['FigIS'], str(names(sub, 1)))
    check(f'2f {s}: subfamily ID 2 is kept', names(sub, 2) == [s], str(names(sub, 2)))
    check(f'2g {s}: the subset holds every requested character',
          all(ord(c) in sub.getBestCmap() for c in ICELANDIC), '')
    # The rename must touch the name table ONLY: glyphs, advances, kerning and cmap must equal what the pre-㉗
    # subsetter produced for the same characters — the pixel-neutrality claim, at table level.
    old = TTFont(io.BytesIO(pre_c27_subset(str(SYS / FILES[key]), ICELANDIC)))
    moved = [t for t in ('glyf', 'loca', 'hmtx', 'hhea', 'cmap', 'GPOS', 'GSUB', 'GDEF', 'kern', 'OS/2', 'post')
             if (t in old) != (t in sub) or (t in old and old[t].compile(old) != sub[t].compile(sub))]
    check(f'2h {s}: glyph, metric and layout tables are identical to the pre-㉗ subset', moved == [], str(moved))
    check(f'2i {s}: CONTROL — the pre-㉗ subset DOES name the reserved name',
          len(fontsubset.name_violations(old, FI.FORBIDDEN)) >= 3, str(fontsubset.name_violations(old, FI.FORBIDDEN)[:3]))
    check(f'2j {s}: CONTROL — ... and it DROPPED the trademark notice ㉗ restores', names(old, 7) == [], str(names(old, 7)))

print('\n[3] the forbidden-word check covers both Reserved Font Name sets')
for word in ('Liberation', 'Arimo', 'Tinos', 'Cousine', 'LIBERATION'):
    check(f'3a "{word}" is forbidden', bool(FI.FORBIDDEN.search(f'X {word} Y')))
for word in ('FigIS', 'FigIS Bold Italic', 'Ascender'):
    check(f'3b "{word}" is allowed', not FI.FORBIDDEN.search(word))

print('\n[4] the metadata element parses, carries each embedded face\'s notices and the pinned licence text')
lic = (Path(FI.__file__).parent / 'fonts' / 'Liberation-2.1.5-LICENSE.txt').read_text(encoding='utf-8')
check('4a CONTROL — the committed licence text names both Reserved Font Name sets',
      'Reserved Font Name Liberation' in lic and 'Reserved Font Arimo, Tinos and Cousine' in lic)
md = FI.metadata_element([(False, False), (True, False)])
try:
    el = ET.fromstring(md)
    parsed = True
except ET.ParseError:
    el, parsed = None, False
check('4b <metadata> parses as XML', parsed)
check('4c it is not a comment', md.lstrip().startswith('<metadata') and '<!--' not in md)
text = el.text if el is not None else ''
for key in ((False, False), (True, False)):
    check(f'4d it carries the {STYLE[key]} copyright notice verbatim', source(key)['name'].getDebugName(0) in text)
check('4e it carries the trademark notice', TRADEMARK in text)
check('4f it carries the licence text exactly', lic.strip() in text)
check('4g it names FigIS, Liberation Sans 2.1.5 and the OFL 1.1',
      all(s in text for s in ('FigIS', 'Liberation Sans', '2.1.5', 'SIL Open Font License, Version 1.1')))
check('4h it names exactly the faces embedded', 'Regular' in text and 'Bold' in text and 'Italic' not in text,
      text[:200])
check('4i it contains no character XML 1.0 forbids', not any(ord(c) < 32 and c not in '\t\n\r' for c in md))
saved = FI.LICENCE_FILE
tampered = tmp / 'LICENSE.txt'
tampered.write_text(lic.replace('Version 1.1', 'Version 1.2', 1), encoding='utf-8')
FI.LICENCE_FILE = tampered
msg = refusal(lambda: FI.metadata_element([(False, False)]))
FI.LICENCE_FILE = saved
check('4j a licence text that is not the pinned one is REFUSED', 'sha256' in msg, msg[:160])
check('4k CONTROL — restored, the pinned text is accepted again', refusal(lambda: FI.metadata_element([(False, False)])) == '')

shutil.rmtree(tmp, ignore_errors=True)
print(f"\n  {'ALL PASS' if not fails else str(len(fails)) + ' FAILED: ' + ', '.join(fails)}")
sys.exit(0 if not fails else 1)
