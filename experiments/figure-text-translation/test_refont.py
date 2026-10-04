#!/usr/bin/env python3
"""Tests for refont.py (§C140 ㊾, the re-font of the June copies [USER] keeps). Run:
FIGTEXT_PYLIBS=./pylibs python3 test_refont.py

Plain checks, in test_figis.py's style. Every property that could pass vacuously is paired with a control that must
fail it. The canonical form below is written HERE, independently of refont.py, so the tool cannot certify itself.
The fixtures are built from literals; the old face's font data is a placeholder, because refont never reads it."""
import base64, io, re, sys
from pathlib import Path
import xml.etree.ElementTree as ET

import _deps  # noqa: F401
import figis
import fontsubset
import refont as RF  # noqa: E402
from fontTools.ttLib import TTFont  # noqa: E402

fails = []


def check(label, ok, detail=''):
    print(f"  {'PASS' if ok else 'FAIL'}  {label}" + (f": {detail}" if detail else ''))
    if not ok:
        fails.append(label)


def refusal(fn):
    """The RefontRefused message fn raises, or '' when it raises nothing."""
    try:
        fn()
    except RF.RefontRefused as exc:
        return str(exc)
    return ''


def june_face(weight, style):
    return (f"@font-face{{font-family:'LiberationSans';font-weight:{weight};font-style:{style};"
            f"src:url(data:font/ttf;base64,AAEAAAALAIAAAwAwT1MvMg==) format('truetype');}}")


def fixture(faces=(('normal', 'normal'), ('bold', 'normal'), ('normal', 'italic')), body=None, style_extra=''):
    """A June-shaped SVG: <style> of @font-face rules, artwork, then <text> with per-glyph x lists or a single x."""
    if body is None:
        body = ('<text fill="#231f20" xml:space="preserve" transform="matrix(1 0 -0 1 0 158.34)" font-size="9" '
                'font-family="LiberationSans"><tspan y="-64.59811" x="86.26 92.25 95.25 97.74">Er&#x00a0;&#x00fe;a'
                '</tspan></text>\n'
                '<text fill="#231f20" xml:space="preserve" transform="matrix(1 0 -0 1 0 158.34)" font-size="9" '
                'font-family="LiberationSans" font-weight="bold"><tspan y="-137.5" x="225.6 231.6 234.6 240.0">'
                'Efni</tspan></text>\n'
                '<text x="146.87" y="106.97" font-size="9.00" fill="#231f20" font-family="LiberationSans" '
                'font-style="italic">S</text>')
    rules = ''.join(june_face(w, s) for w, s in faces)
    return ('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" '
            f'width="1300" height="439.83" viewBox="0 0 468 158.34"><style>{rules}{style_extra}</style>\n'
            '<g><path transform="matrix(1,0,0,-1,295.3174,56.150499)" d="M0 0H52.765Z" fill="#e0d1e3"/></g>\n'
            f'{body}\n</svg>\n')


def canon(svg):
    """Only for the 1b control: the tool's notion, kept to show a one-digit change is caught by it too."""
    s = re.sub(r'<style>.*?</style>', '<style/>', svg, count=1, flags=re.S)
    s = re.sub(r'<metadata>.*?</metadata>', '', s, flags=re.S)
    return re.sub(r'font-family="[^"]*"', 'font-family="F"', s)


def illicit_edits(old, new):
    """INDEPENDENT of refont.py, by a different method: split both files before every '<' into tokens that join back to
    the exact bytes, drop the one <metadata>...</metadata> run that follows </style> in the new file, align token by
    token, and return every difference that is NOT (a) the <style> token or (b) a <text> start tag that becomes equal
    once font-family="LiberationSans" reads "FigIS". [] = only the font machinery changed."""
    tok = lambda t: re.split(r'(?=<)', t)
    a, b = tok(old), tok(new)
    if '<metadata>' in new:
        i = next(k for k, t in enumerate(b) if t.startswith('<metadata>'))
        j = next(k for k, t in enumerate(b) if k > i and t.startswith('</metadata>'))
        tail = b[j][len('</metadata>'):]
        if not b[i - 1].startswith('</style>') or b[i - 1] != '</style>':
            return ['<metadata> does not directly follow </style>']
        b = b[:i - 1] + ['</style>' + tail] + b[j + 1:]
    if len(a) != len(b):
        return [f'token count {len(a)} != {len(b)}']
    bad = []
    for x, y in zip(a, b):
        if x == y or (x.startswith('<style>') and y.startswith('<style>')):
            continue
        if x.startswith('<text') and x.replace('font-family="LiberationSans"', 'font-family="FigIS"') == y:
            continue
        bad.append((x[:60], y[:60]))
    return bad


def faces_of(svg):
    """{(bold, italic): TTFont} for each @font-face in the output, decoded from its data URI."""
    out = {}
    for fam, w, st, b64 in re.findall(r"@font-face\{font-family:'([^']+)';font-weight:(\d+);font-style:(\w+);"
                                      r"src:url\(data:font/woff2;base64,([A-Za-z0-9+/=]+)\) format\('woff2'\);\}", svg):
        assert fam == 'FigIS', fam
        out[(w == '700', st == 'italic')] = TTFont(io.BytesIO(base64.b64decode(b64)))
    return out


print('1. the re-fonted file is the June file with only its font machinery replaced')
old = fixture()
new, rep = RF.refont(old)
check('1a only the font machinery changed (token alignment, independent of refont)', illicit_edits(old, new) == [],
      str(illicit_edits(old, new)))
tampered = new.replace('x="146.87"', 'x="146.88"')
check('1b CONTROL — a one-digit coordinate change is reported', len(illicit_edits(old, tampered)) == 1
      and canon(old) != canon(tampered))
check('1c no TrueType data and no Liberation family name is left outside <metadata>',
      'font/ttf' not in new and not figis.FORBIDDEN.search(re.sub(r'<metadata>.*?</metadata>', '', new, flags=re.S)))
check('1d CONTROL — the June input does carry both', 'font/ttf' in old and figis.FORBIDDEN.search(old) is not None)
check('1e every <text> now names FigIS, and only FigIS',
      set(re.findall(r'font-family="([^"]*)"', new)) == {'FigIS'} and new.count('font-family="FigIS"') == 3)
ET.fromstring(new)
check('1f the output parses as XML', True)
new2, _ = RF.refont(old)
check('1g two runs are byte-identical (no clock reaches the bytes)', new == new2)

print('2. each embedded face is a renamed FigIS subset holding exactly the characters routed to it')
faces = faces_of(new)
check('2a the faces are Regular, Bold, Italic', set(faces) == {(False, False), (True, False), (False, True)},
      str(sorted(faces)))
want = {(False, False): set('Er\xa0\xfea'), (True, False): set('Efni'), (False, True): set('S')}
for k, chars in want.items():
    cmap = set(faces[k].getBestCmap())
    check(f'2b face {k} covers its characters {sorted(chars)!r}', {ord(c) for c in chars} <= cmap)
    check(f'2c face {k} names no Reserved Font Name', fontsubset.name_violations(faces[k], figis.FORBIDDEN) == [])
check('2d CONTROL — the Regular face does not carry a Bold-only character it was not given',
      ord('f') not in set(faces[(False, False)].getBestCmap()))
check('2e the report lists the same routing', rep['faces'] == {k: ''.join(sorted(v | ({' '} if '\xa0' in v else set()))) for k, v in want.items()},
      str(rep['faces']))

tail = fixture(body='<text font-family="LiberationSans" font-size="9"><tspan x="1" y="1">a</tspan>Z</text>')
check('2f a character only in text after a </tspan> (a tail) is embedded',
      ord('Z') in set(faces_of(RF.refont(tail)[0])[(False, False)].getBestCmap()))

nb = fixture(body='<text font-family="LiberationSans" font-size="9"><tspan x="1" y="1">a\u00a0b</tspan></text>')
nbface = faces_of(RF.refont(nb)[0])[(False, False)]
check('2g a face drawing NBSP also carries U+0020: WebKit draws NBSP with the SPACE glyph, and falls back to a '
      'system font\'s space when the face has none (measured 2026-10-04, 0.36 pt wide at 9 pt)',
      0x20 in set(nbface.getBestCmap()) and 0xa0 in set(nbface.getBestCmap()))
check('2h CONTROL — a face with no NBSP gets no space it was not given',
      0x20 not in set(faces_of(RF.refont(fixture(body='<text font-family="LiberationSans" font-size="9"><tspan x="1" '
                                                       'y="1">ab</tspan></text>'))[0])[(False, False)].getBestCmap()))

tab = fixture(body='<text font-family="LiberationSans" font-size="9" xml:space="preserve"><tspan x="1" y="1">a\tb\nc'
                   '</tspan></text>')
check('2i a TAB or NEWLINE drawn as a space under xml:space="preserve" brings U+0020 into the face',
      0x20 in set(faces_of(RF.refont(tab)[0])[(False, False)].getBestCmap()))

print('3. <metadata> carries the licence, once, immediately after </style>')
check('3a exactly one <metadata>', new.count('<metadata>') == 1)
check('3b it follows </style> directly', '</style><metadata>' in new)
check('3c it is figis.metadata_element for the faces embedded',
      figis.metadata_element([(False, False), (True, False), (False, True)]) in new)
check('3d CONTROL — the June input carries none', '<metadata>' not in old)

print('4. CSS font matching decides the face, as in June (style before weight; only declared faces)')
M = RF.css_match
RBI = {(False, False), (True, False), (False, True)}
check('4a bold italic with R/B/I declared draws from Italic (bold synthesized), as June does',
      M(RBI, (True, True)) == (False, True))
check('4b CONTROL — with a Bold Italic declared it draws from Bold Italic', M(RBI | {(True, True)}, (True, True)) == (True, True))
check('4c bold with only Regular declared draws from Regular', M({(False, False)}, (True, False)) == (False, False))
check('4d italic with R/B declared (no italic) draws from Regular', M({(False, False), (True, False)}, (False, True)) == (False, False))
check('4e bold italic with R/B declared draws from Bold', M({(False, False), (True, False)}, (True, True)) == (True, False))
check('4f regular with only Italic declared draws from Italic', M({(False, True)}, (False, False)) == (False, True))
rel = fixture(body='<text font-family="LiberationSans" font-weight="bold" font-style="italic" font-size="9">'
                   '<tspan x="1 2 3 4" y="1">cell</tspan></text>')
rnew, rrep = RF.refont(rel)
check('4g a Relation-shaped figure embeds the Italic face for its bold-italic text, and no Bold Italic',
      set(faces_of(rnew)) == {(False, True)} and rrep['routed'] == {(True, True): (False, True)},
      f"{sorted(faces_of(rnew))} {rrep['routed']}")
check('4h the faces June declared but nothing uses are dropped', rrep['dropped'] == [(False, False), (True, False)],
      str(rrep['dropped']))

print('5. anything outside the surveyed June shape is REFUSED (fail closed)')
check('5a CONTROL — the plain fixture is accepted', refusal(lambda: RF.refont(fixture())) == '')
plain = ('<text font-family="LiberationSans" font-size="9"><tspan x="1" y="1">a</tspan></text>')
cases = {
    '5b a style="" attribute carrying a font property':
        fixture(body=plain.replace('<tspan ', '<tspan style="font-weight:bold" ')),
    '5c a <tspan> naming its own font-family':
        fixture(body=plain.replace('<tspan ', '<tspan font-family="LiberationSans" ')),
    '5d a <g> ancestor carrying a font attribute':
        fixture(body=f'<g font-weight="bold">{plain}</g>'),
    '5e a weight other than normal/bold/400/700':
        fixture(body=plain.replace('font-size="9"', 'font-size="9" font-weight="600"')),
    '5f a style other than normal/italic':
        fixture(body=plain.replace('font-size="9"', 'font-size="9" font-style="oblique"')),
    '5g a <text> in a family other than LiberationSans':
        fixture(body=plain.replace('LiberationSans', 'Arial')),
    '5h a <style> holding anything besides the June @font-face rules':
        fixture(style_extra='text{fill:red}'),
    '5i an @font-face in a family other than LiberationSans':
        fixture().replace("font-family:'LiberationSans';font-weight:bold", "font-family:'Arial';font-weight:bold"),
    '5j two <style> elements':
        fixture().replace('<g>', '<style>x</style><g>', 1),
    '5k a <text> with a child other than <tspan>':
        fixture(body='<text font-family="LiberationSans"><textPath href="#p">a</textPath></text>'),
    '5l a <style> declaring no face at all':
        fixture(faces=()),
    '5m a figure that is already re-fonted (a <metadata> present)':
        fixture().replace('</style>', '</style><metadata>x</metadata>', 1),
    '5n the June family name appearing anywhere refont does not rewrite':
        fixture().replace('<g>', '<g id="LiberationSans">', 1),
    '5p a DOCTYPE or entity declaration (no XML entity expansion is ever attempted)':
        '<!DOCTYPE svg [<!ENTITY a "b">]>' + fixture(),
    '5q a style="" font property written in capitals':
        fixture(body=plain.replace('<tspan ', '<tspan style="FONT-WEIGHT:bold" ')),
    '5r a style="" font property spelled with a CSS escape':
        fixture(body=plain.replace('<tspan ', '<tspan style="f\\6f nt-weight:bold" ')),
    '5s a font-variant presentation attribute (small caps draw other glyphs)':
        fixture(body=plain.replace('font-size="9"', 'font-size="9" font-variant="small-caps"')),
    '5t a style="" text-transform (draws other characters)':
        fixture(body=plain.replace('<tspan ', '<tspan style="text-transform:uppercase" ')),
    '5u a text-transform presentation attribute':
        fixture(body=plain.replace('font-size="9"', 'font-size="9" text-transform="uppercase"')),
    '5v a namespace-prefixed <svg:style>':
        fixture().replace('<g>', '<svg:style xmlns:svg="http://www.w3.org/2000/svg">text{font-weight:bold}</svg:style><g>', 1),
    '5o a font-family attribute on a <text> written with single quotes':
        fixture(body=plain.replace('font-family="LiberationSans"', "font-family='LiberationSans'")),
}
for label, svg in cases.items():
    msg = refusal(lambda svg=svg: RF.refont(svg))
    check(f'{label} is refused', msg != '', msg[:140])

check('5w CONTROL — a style="" that sets no font or text property on ARTWORK (Archery: mix-blend-mode) is accepted',
      refusal(lambda: RF.refont(fixture().replace('fill="#e0d1e3"', 'fill="#e0d1e3" style="mix-blend-mode:multiply"'))) == '')

print('6. the real June copies (skipped when the sister repo is absent)')
import subprocess
REPO = Path(__file__).resolve().parents[2]
JUNE_MATT = '9269fcda8:books/efnafraedi-2e/media/CNX_Chem_01_02_MattType_IS.svg'   # the June blob [USER] kept
got = subprocess.run(['git', '-C', str(REPO), 'show', JUNE_MATT], capture_output=True)
if got.returncode == 0:
    s = got.stdout.decode('utf-8')
    n, r = RF.refont(s)
    check('6a MattType (June bytes from git): only the font machinery changed', illicit_edits(s, n) == [],
          str(illicit_edits(s, n)))
    check('6b MattType: Regular and Bold embedded, both covering NBSP and the space WebKit draws it with',
          set(faces_of(n)) == {(False, False), (True, False)}
          and all({0xa0, 0x20} <= set(f.getBestCmap()) for f in faces_of(n).values()))
else:
    print('  SKIP  6 the June blob is not in this clone (a shallow clone)')

print()
print('  ALL PASS' if not fails else f'  {len(fails)} FAILED: {fails}')
sys.exit(1 if fails else 0)
