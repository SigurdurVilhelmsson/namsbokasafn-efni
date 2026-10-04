#!/usr/bin/env python3
"""§C140 ㊾ — re-font a June copy [USER] keeps: same picture, current font rules.

[USER] decided 2026-10-04 (register §C140 ㊾, the 2026-10-04 RESUME blocks): the June copies kept under `keptCopies`
are re-created under the current font rules WITHOUT changing their appearance. They embed Liberation Sans 1.07.4
(GPLv2 with the font exception) as base64 TrueType in family 'LiberationSans'; the rule since §C140 ㉗ is a renamed
FigIS subset of the pinned Liberation Sans 2.1.5 (SIL OFL 1.1) plus the licence in a <metadata> element, both owned by
figis.py. Usage:

    FIGTEXT_PYLIBS=./pylibs python3 refont.py <june.svg> <out.svg>

WHAT CHANGES, AND NOTHING ELSE: the <style> element's @font-face rules, every font-family="LiberationSans" attribute
(-> "FigIS"), and one <metadata> inserted directly after </style>. The edit is done on the TEXT, never by re-serialising
the XML, so every other byte - artwork, every <text>/<tspan> attribute, coordinate and character - is the June byte.
refont() checks that itself before returning (canon() below) and refuses otherwise.

WHICH FACE DRAWS WHICH CHARACTER is decided the way a browser decides it for the June file: CSS font matching over the
faces June DECLARED (style is matched before weight; only declared faces are candidates; whatever is missing is
synthesized). Measured on 17_04_Relation: its bold-italic text has no Bold Italic face to match, so browsers draw it
from the Italic face with synthetic bold. Embedding a true FigIS Bold Italic would change those glyphs, so refont
routes them to the FigIS Italic face instead. A June face that nothing is routed to is dropped: removing a face that
is never the closest match cannot change which face is.

WHAT CAN STILL DIFFER is the glyph OUTLINES (2.1.5 is a different cut from 1.07.4; the metrics are compatible) and,
for a run the browser lays out itself (one x for several characters), any kerning pair whose value differs between
the two versions. Neither is decided here: both are measured per figure, in each engine, before a copy is committed.

FAIL CLOSED: anything outside the June shape that was surveyed on 2026-10-04 (11 files) is refused with RefontRefused
rather than guessed at - a font property in a style="" attribute, a font attribute on any element but <text>, a
<tspan> naming a family, a weight or style outside normal/bold/400/700 and normal/italic, a <style> holding anything
but the June @font-face rules, a DOCTYPE or entity declaration, a file already carrying <metadata>.
"""
import base64, json, re, sys
import xml.etree.ElementTree as ET
from pathlib import Path

import _deps  # noqa: F401
import figis

SVG_NS = '{http://www.w3.org/2000/svg}'
JUNE_FAMILY = 'LiberationSans'
_FACE_RULE = re.compile(r"@font-face\{font-family:'(?P<fam>[^']*)';font-weight:(?P<w>normal|bold);"
                        r"font-style:(?P<s>normal|italic);src:url\(data:font/ttf;base64,[A-Za-z0-9+/=]+\) "
                        r"format\('truetype'\);\}")
_STYLE = re.compile(r'<style>(.*?)</style>', re.S)
_WEIGHT = {'normal': False, '400': False, 'bold': True, '700': True}
_STYLE_VALUES = {'normal': False, 'italic': True}
FONT_ATTRS = ('font-family', 'font-weight', 'font-style')
ORDER = [(False, False), (True, False), (False, True), (True, True)]   # svgout.write_svg's rule order


class RefontRefused(Exception):
    """The input is not a June copy of the surveyed shape, or the result failed refont's own check. RAISED."""


def css_match(declared, want):
    """The declared face (bold, italic) a browser draws `want` (bold, italic) from, by CSS Fonts font matching
    restricted to what June files contain (weights 400/700, styles normal/italic): style first - the requested style
    if any declared face has it, else the other - then weight, exact if declared, else the other."""
    bold, italic = want
    styles = {i for _, i in declared}
    style = italic if italic in styles else (not italic)
    weights = {b for b, i in declared if i == style}
    weight = bold if bold in weights else (not bold)
    return (weight, style)


def canon(svg):
    """The file with its font machinery removed: refont must leave this unchanged, byte for byte."""
    s = _STYLE.sub('<style/>', svg, count=1)
    s = re.sub(r'<metadata>.*?</metadata>', '', s, flags=re.S)
    return re.sub(r'font-family="[^"]*"', 'font-family="F"', s)


def _june_faces(svg):
    styles = _STYLE.findall(svg)
    if svg.count('<style') != 1 or len(styles) != 1:
        raise RefontRefused(f'expected exactly one <style> element, found {svg.count("<style")}')
    body = styles[0]
    rules = list(_FACE_RULE.finditer(body))
    if not rules or ''.join(m.group(0) for m in rules) != body:
        raise RefontRefused('the <style> element is not exactly a run of June @font-face rules (Liberation Sans as '
                            'base64 TrueType)')
    faces = []
    for m in rules:
        if m.group('fam') != JUNE_FAMILY:
            raise RefontRefused(f"an @font-face names family {m.group('fam')!r}, not {JUNE_FAMILY!r}")
        key = (m.group('w') == 'bold', m.group('s') == 'italic')
        if key in faces:
            raise RefontRefused(f'face {key} is declared twice')
        faces.append(key)
    return set(faces)


def _used_chars(root):
    """{(bold, italic) requested: set of characters}, with weight and style inherited from <text> into <tspan>."""
    used = {}
    texts = 0

    def walk(el, inherited, in_text):
        nonlocal texts
        tag = el.tag[len(SVG_NS):] if el.tag.startswith(SVG_NS) else el.tag
        st = el.get('style') or ''
        if 'font' in st:
            raise RefontRefused(f'<{tag}> carries a font property in style="{st}"')
        have = [a for a in FONT_ATTRS if el.get(a) is not None]
        if have and tag not in ('text', 'tspan'):
            raise RefontRefused(f'<{tag}> carries {have}; only <text> may')
        if tag == 'tspan' and el.get('font-family') is not None:
            raise RefontRefused('a <tspan> names its own font-family')
        if in_text and tag not in ('tspan',):
            raise RefontRefused(f'a <text> holds a <{tag}>; only <tspan> is surveyed')
        bold, italic = inherited
        if el.get('font-weight') is not None:
            if el.get('font-weight') not in _WEIGHT:
                raise RefontRefused(f'font-weight="{el.get("font-weight")}" is not normal/bold/400/700')
            bold = _WEIGHT[el.get('font-weight')]
        if el.get('font-style') is not None:
            if el.get('font-style') not in _STYLE_VALUES:
                raise RefontRefused(f'font-style="{el.get("font-style")}" is not normal/italic')
            italic = _STYLE_VALUES[el.get('font-style')]
        if tag == 'text':
            texts += 1
            if el.get('font-family') != JUNE_FAMILY:
                raise RefontRefused(f'a <text> is in family {el.get("font-family")!r}, not {JUNE_FAMILY!r}')
        inside = in_text or tag == 'text'
        if inside and el.text:
            used.setdefault((bold, italic), set()).update(el.text)
        for child in el:
            walk(child, (bold, italic), inside)
            if inside and child.tail:
                used.setdefault((bold, italic), set()).update(child.tail)

    walk(root, (False, False), False)
    return used, texts


def refont(svg):
    """(re-fonted svg text, report). Raises RefontRefused on any input outside the June shape."""
    if '<!DOCTYPE' in svg or '<!ENTITY' in svg:
        raise RefontRefused('a DOCTYPE or entity declaration is present; refont parses no DTD')
    if '<metadata' in svg:
        raise RefontRefused('the file already carries <metadata> (already re-fonted, or not a June copy)')
    declared = _june_faces(svg)
    try:
        root = ET.fromstring(svg)
    except ET.ParseError as exc:
        raise RefontRefused(f'not well-formed XML: {exc}') from exc
    used, texts = _used_chars(root)
    attr = f'font-family="{JUNE_FAMILY}"'
    if svg.count(attr) != texts:
        raise RefontRefused(f'{svg.count(attr)} {attr} attributes for {texts} <text> elements')
    rest = _STYLE.sub('', svg.replace(attr, ''), count=1)
    if figis.FORBIDDEN.search(rest):
        raise RefontRefused(f'"{figis.FORBIDDEN.search(rest).group(0)}" appears outside the parts refont rewrites')

    routed = {want: css_match(declared, want) for want in used}
    chars = {}
    for want, face in routed.items():
        chars.setdefault(face, set()).update(used[want])
    # WebKit draws U+00A0 with the face's SPACE glyph, and when the face has no U+0020 it takes the space from a system
    # font instead (measured 2026-10-04 in Playwright's WebKit: 2.86 against 2.50 at 9 pt, i.e. DejaVu's space, which
    # moved every later glyph of Manometer's "Lokaður endi"). June's 1.07.4 subsets always held U+0020, so a face that
    # draws NBSP is given U+0020 too. Chromium and Firefox draw the NBSP glyph and measured identical either way.
    for face in chars.values():
        if '\xa0' in face:
            face.add(' ')
    keys = [k for k in ORDER if k in chars]
    rules = []
    for bold, italic in keys:
        b64 = base64.b64encode(figis.subset_woff2((bold, italic), chars[(bold, italic)])).decode('ascii')
        rules.append(f"@font-face{{font-family:'{figis.FAMILY}';font-weight:{700 if bold else 400};"
                     f"font-style:{'italic' if italic else 'normal'};"
                     f"src:url(data:font/woff2;base64,{b64}) format('woff2');}}")
    out = _STYLE.sub(lambda m: f"<style>{''.join(rules)}</style>{figis.metadata_element(keys)}", svg, count=1)
    out = out.replace(attr, f'font-family="{figis.FAMILY}"')

    if canon(out) != canon(svg):
        raise RefontRefused('the re-fonted file differs from the June file outside its font machinery')
    if 'font/ttf' in out or figis.FORBIDDEN.search(re.sub(r'<metadata>.*?</metadata>', '', out, flags=re.S)):
        raise RefontRefused('June font data or the June family name survived the rewrite')
    ET.fromstring(out)
    report = {'declared': [k for k in ORDER if k in declared],
              'faces': {k: ''.join(sorted(chars[k])) for k in keys},
              'routed': {w: f for w, f in sorted(routed.items()) if w != f},
              'dropped': [k for k in ORDER if k in declared and k not in chars]}
    return out, report


def main(argv):
    if len(argv) != 3:
        print('usage: refont.py <june.svg> <out.svg>', file=sys.stderr)
        return 2
    src, dst = Path(argv[1]), Path(argv[2])
    out, rep = refont(src.read_text(encoding='utf-8'))
    dst.write_text(out, encoding='utf-8')
    print(json.dumps({'in': str(src), 'out': str(dst), 'bytesIn': src.stat().st_size, 'bytesOut': dst.stat().st_size,
                      'declared': rep['declared'], 'faces': {str(k): v for k, v in rep['faces'].items()},
                      'routed': {str(k): str(v) for k, v in rep['routed'].items()},
                      'dropped': rep['dropped']}, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
