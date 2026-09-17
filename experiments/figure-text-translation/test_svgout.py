#!/usr/bin/env python3
"""svgout.write_svg: every <text> it emits is RENDERED with text-rendering="geometricPrecision"
(ruling (S), [USER] 2026-09-15; reverses the E spec's R2 exclusion of it).

    FIGTEXT_PYLIBS=./pylibs python3 test_svgout.py

WHY. compose.py places each segment of a split line at an absolute x taken from cairo LINEAR
advances. Chromium's default text rendering rounds glyph advances to device pixels, so a long
plain prefix drawn as its own <text> ends up to a whole word space away from where the composer
put the next segment: "af Br2" is drawn "afBr2" at 150 dpi, and a subscript lands inside the
last base glyph (map8 'BaSO'|'4'). geometricPrecision makes Chromium draw linear advances.

WHAT IS ASSERTED, AND HOW. The assertion is about the property a renderer RESOLVES for each
<text>, not about where the attribute is written: text-rendering is an inherited presentation
attribute, so the nearest ancestor-or-self that sets it (as an attribute or in an inline
`style`) decides, and a `<style>` rule selecting `text` would outrank a presentation attribute.
The resolver is checked against planted trees first (positive and negative controls), so a
resolver that answered "geometricPrecision" for everything - or for nothing - stops the file.

WHERE svgout PUTS IT is deliberately NOT pinned here: one attribute on the wrapping <g> leaves
every <text> element byte-identical, which is what keeps the raw-<text> goldens of
test_compose_runexact.py and test_compose_t23.py valid.
"""
import base64
import importlib.util
import io
import os
import re
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

HERE = Path(__file__).resolve().parent          # never process.cwd() - repo rule
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / 'pylibs'))
os.environ.setdefault('FIGTEXT_PYLIBS', str(HERE / 'pylibs'))

import svgout                                   # noqa: E402
import figsym                                   # noqa: E402
from fontTools.ttLib import TTFont              # noqa: E402

SVG_NS = '{http://www.w3.org/2000/svg}'
FAILED = []


def check(name, ok, detail=''):
    print(f"  {'PASS' if ok else 'FAIL'}  {name}" + ('' if ok else f'  -- {detail}'))
    if not ok:
        FAILED.append(name)


def precondition(name, ok, detail=''):
    if not ok:
        print(f'  FAIL  precondition: {name}  -- {detail}')
        print('1 FAILED')
        sys.exit(1)


def local(tag):
    return tag.split('}', 1)[-1]


def style_prop(style, prop):
    """The value of `prop` in an inline style declaration list, or None."""
    for decl in (style or '').split(';'):
        if ':' in decl:
            k, v = decl.split(':', 1)
            if k.strip() == prop:
                return v.strip().replace('!important', '').strip()
    return None


def css_text_rule(svg_text):
    """text-rendering set by a <style> rule whose selector list names `text` (or `*`), or None.
    Such a rule outranks a presentation attribute, so it must be seen."""
    val = None
    for block in re.findall(r'<style[^>]*>(.*?)</style>', svg_text, re.S):
        block = re.sub(r'@font-face\{[^}]*\}', '', block)
        for sel, body in re.findall(r'([^{}]+)\{([^}]*)\}', block):
            names = [s.strip() for s in sel.split(',')]
            if any(n in ('text', '*', 'svg text', 'g text') for n in names):
                v = style_prop(body, 'text-rendering')
                if v is not None:
                    val = v
    return val


def resolved_text_rendering(svg_text):
    """[(text content, resolved text-rendering or 'auto')] for every <text>, in document order."""
    root = ET.fromstring(svg_text.encode("utf-8"))
    parent = {c: p for p in root.iter() for c in p}
    rule = css_text_rule(svg_text)
    out = []
    for el in root.iter():
        if local(el.tag) != 'text':
            continue
        val, node = None, el
        while node is not None and val is None:
            val = style_prop(node.get('style'), 'text-rendering') or node.get('text-rendering')
            node = parent.get(node)
        if rule is not None and style_prop(el.get('style'), 'text-rendering') is None:
            val = rule                     # a stylesheet rule beats an inherited/presentation value
        out.append((''.join(el.itertext()), val or 'auto'))
    return out


# --- resolver controls: it must answer both ways on planted trees --------------------------------
W = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">{}</svg>'
precondition('resolver NEGATIVE control: a bare <text> resolves to auto',
             resolved_text_rendering(W.format('<g><text>a</text></g>')) == [('a', 'auto')])
precondition('resolver POSITIVE control: an attribute on an ancestor <g> is inherited',
             resolved_text_rendering(W.format('<g text-rendering="geometricPrecision"><text>a</text></g>'))
             == [('a', 'geometricPrecision')])
precondition('resolver POSITIVE control: an attribute on the <text> itself',
             resolved_text_rendering(W.format('<g><text text-rendering="geometricPrecision">a</text></g>'))
             == [('a', 'geometricPrecision')])
precondition('resolver: the nearest setting wins over an ancestor',
             resolved_text_rendering(W.format('<g text-rendering="geometricPrecision">'
                                              '<text text-rendering="optimizeSpeed">a</text></g>'))
             == [('a', 'optimizeSpeed')])
precondition('resolver: a <style> rule on text outranks an inherited presentation attribute',
             resolved_text_rendering(W.format('<style>text{text-rendering:optimizeSpeed}</style>'
                                              '<g text-rendering="geometricPrecision"><text>a</text></g>'))
             == [('a', 'optimizeSpeed')])

# --- the writer --------------------------------------------------------------------------------
PAGE_H = 100.0
ART = ('<?xml version="1.0" encoding="UTF-8"?>\n'
       '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
       'width="200pt" height="100pt" viewBox="0 0 200 100">\n'
       '<rect x="10" y="10" width="50" height="20" fill="none" stroke="#231f20"/>\n</svg>\n')


def item(text, x, y, size=9.0, bold=False, italic=False, rot=0.0, path='layout', **kw):
    return dict(text=text, x=x, y=y, dx=0.0, size=size, bold=bold, italic=italic, rot=rot,
                rgb=(0.137, 0.122, 0.125), path=path, **kw)


ITEMS = [
    # a split translated line: plain prefix with its trailing space, a formula base, a subscript
    item('með umframmagni af ', 0.0, 50.0, block=2, line=0, seg=0),
    item('Br', 87.530, 50.0, block=2, line=0, seg=1),
    item('2', 96.530, 47.0, size=7.0, block=2, line=0, seg=2),
    item('.', 100.423, 50.0, block=2, line=0, seg=3),
    # kept English drawn run-exact, bold and italic faces, and a rotated glyph
    item('Heat', 20.0, 80.0, bold=True, path='run-exact', block=5),
    item('x', 60.0, 80.0, italic=True, path='run-exact', block=6),
    item('B', 120.0, 30.0, rot=4.2674, path='run-exact', block=7),
    item('a < b & c', 20.0, 20.0, block=8, line=0, seg=0),
]

with tempfile.TemporaryDirectory() as td:
    art = Path(td) / 'artwork.svg'
    art.write_text(ART, encoding='utf-8')
    out = Path(td) / 'translated.svg'
    svgout.write_svg(art, out, ITEMS, PAGE_H)
    svg_text = out.read_text(encoding='utf-8')

try:
    res = resolved_text_rendering(svg_text)
except (ET.ParseError, ValueError) as e:
    precondition('the emitted SVG parses as XML', False, str(e))

precondition('CONTROL every item became exactly one <text>, in order (a writer that emitted no '
             '<text> would pass "every <text> is geometricPrecision" vacuously)',
             [t for t, _ in res] == [it['text'] for it in ITEMS], repr([t for t, _ in res]))

bad = [(t, v) for t, v in res if v != 'geometricPrecision']
check(f'S1 every one of the {len(res)} <text> elements resolves to text-rendering=geometricPrecision '
      '(layout segments, the subscript, run-exact bold/italic, the rotated glyph)',
      not bad, repr(bad))

# The artwork above the writer's own elements is not re-styled: only <text> is in scope, and the
# artwork's shapes keep the renderer's default (no shape-rendering / text-rendering on <svg>).
root = ET.fromstring(svg_text.encode("utf-8"))
check('S2 the artwork root <svg> carries no text-rendering (the change is scoped to the writer\'s text)',
      root.get('text-rendering') is None and style_prop(root.get('style'), 'text-rendering') is None,
      repr(root.attrib))
rect = next(e for e in root.iter() if local(e.tag) == 'rect')
chain, node = [], rect
parent = {c: p for p in root.iter() for c in p}
while node is not None:
    chain.append(node.get('text-rendering'))
    node = parent.get(node)
check('S3 the artwork <rect> has no text-rendering on itself or any ancestor', not any(chain), repr(chain))

# --- §C140 ⑥a: eligible kept runs are drawn in FigSym -------------------------------------------
# Cases, each asserting by PARSING the output (not by substring where a parse is possible), per
# the design (T2/T3/T5) and the task-3 brief.


def compose_svg(items):
    """write_svg over a fresh copy of ART with `items` -> the SVG text."""
    with tempfile.TemporaryDirectory() as td:
        art = Path(td) / 'artwork.svg'
        art.write_text(ART, encoding='utf-8')
        out = Path(td) / 'translated.svg'
        svgout.write_svg(art, out, items, PAGE_H)
        return out.read_text(encoding='utf-8')


def font_face_rules(svg_text):
    """[(family, weight, style, b64)] of every @font-face rule, in document order."""
    return re.findall(
        r"@font-face\{font-family:'([^']*)';font-weight:(\d+);font-style:(\w+);"
        r"src:url\(data:font/woff2;base64,([^)]+)\)", svg_text)


def cmap_of(b64):
    return TTFont(io.BytesIO(base64.b64decode(b64))).getBestCmap()


def group_children(svg_text):
    """The local tag names of the <g>'s direct children, in document order."""
    root_ = ET.fromstring(svg_text.encode('utf-8'))
    g = next(e for e in root_.iter() if local(e.tag) == 'g')
    return [local(c.tag) for c in g]


def parses(svg_text, label):
    """True iff `svg_text` parses as XML; otherwise a precondition failure (exits)."""
    try:
        ET.fromstring(svg_text.encode('utf-8'))
        return True
    except ET.ParseError as e:
        precondition(label, False, str(e))
        return False


# Case 1: no FigSym item -> the group is unchanged in shape and every rule/text stays FigIS.
ITEMS_1 = [item('AB', 10.0, 10.0), item('CD', 20.0, 20.0, bold=True)]
svg1 = compose_svg(ITEMS_1)
parses(svg1, 'T1 the no-FigSym-item SVG parses as XML')
faces1 = font_face_rules(svg1)
check("T1a @font-face families are only FigIS, in today's (bold, italic) order",
      [(f[0], f[1], f[2]) for f in faces1] == [('FigIS', '400', 'normal'), ('FigIS', '700', 'normal')],
      repr([f[:3] for f in faces1]))
root1 = ET.fromstring(svg1.encode('utf-8'))
texts1 = [e for e in root1.iter() if local(e.tag) == 'text']
check('T1b every <text> has font-family="FigIS"',
      bool(texts1) and all(e.get('font-family') == 'FigIS' for e in texts1),
      repr([e.get('font-family') for e in texts1]))
check('T1c no <metadata> element in a figure with no eligible run',
      not any(local(e.tag) == 'metadata' for e in root1.iter()))
check("T1d the <g>'s first child is a <text> (the group is unchanged in shape)",
      group_children(svg1)[:1] == ['text'], repr(group_children(svg1)))

# Case 2: one FigSym item ('+') and one FigIS item ('X').
ITEMS_2 = [item('X', 10.0, 10.0), item('+', 30.0, 10.0, family=figsym.FAMILY)]
svg2 = compose_svg(ITEMS_2)
parses(svg2, 'T2 the one-FigSym-item SVG parses as XML')
faces2 = font_face_rules(svg2)
check('T2a @font-face families in order FigIS…, then FigSym 400/normal',
      [f[0] for f in faces2] == ['FigIS', 'FigSym'] and faces2[-1][1:3] == ('400', 'normal'),
      repr([f[:3] for f in faces2]))
root2 = ET.fromstring(svg2.encode('utf-8'))
by_text2 = {''.join(e.itertext()): e.get('font-family')
            for e in root2.iter() if local(e.tag) == 'text'}
check("T2b the FigSym item's <text> is font-family=\"FigSym\", the other is \"FigIS\"",
      by_text2.get('+') == 'FigSym' and by_text2.get('X') == 'FigIS', repr(by_text2))
metas2 = [e for e in root2.iter() if local(e.tag) == 'metadata']
check("T2c exactly one <metadata> and it is the first child of the <g>",
      len(metas2) == 1 and group_children(svg2)[:1] == ['metadata'], repr(group_children(svg2)))
figis_b64_2 = next((f[3] for f in faces2 if f[0] == 'FigIS'), None)
check("T2d the FigIS face's characters do not include '+' (decoded from its own woff2)",
      figis_b64_2 is not None and ord('+') not in cmap_of(figis_b64_2),
      repr(sorted(cmap_of(figis_b64_2))[:10]) if figis_b64_2 else 'no FigIS face')

# Case 3: every character moved to FigSym -> no FigIS face is emitted at all.
ITEMS_3 = [item('+', 10.0, 10.0, family=figsym.FAMILY), item('=', 30.0, 10.0, family=figsym.FAMILY)]
svg3 = compose_svg(ITEMS_3)
parses(svg3, 'T3 the all-FigSym SVG parses as XML')
faces3 = font_face_rules(svg3)
check('T3 no FigIS face is emitted when no item uses it',
      [f[0] for f in faces3] == ['FigSym'], repr([f[:3] for f in faces3]))

# Case 4: the figparts.split() contract (last <style>; remainder \n<g …>…</g>\n</svg>\n) still
# holds with a FigSym face and a <metadata> element present. Imported by path - it lives under
# evidence/, not on this file's import path.
FIGPARTS_PATH = HERE / 'evidence' / '2026-09-17-c4-build' / 'instruments' / 'figparts.py'
_spec = importlib.util.spec_from_file_location('c6a_figparts', FIGPARTS_PATH)
figparts = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(figparts)
try:
    figparts.split(svg2.encode('utf-8'))
    split_err = None
except Exception as e:                          # noqa: BLE001 - the check is "did it raise"
    split_err = repr(e)
check('T4 figparts.split() still accepts the composed SVG with a FigSym face + <metadata>',
      split_err is None, split_err or '')

print('ALL PASS' if not FAILED else f'{len(FAILED)} FAILED: ' + ', '.join(FAILED))
sys.exit(1 if FAILED else 0)
