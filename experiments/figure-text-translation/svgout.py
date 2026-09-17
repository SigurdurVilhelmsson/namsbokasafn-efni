#!/usr/bin/env python3
"""Emit an SVG: vector artwork + real <text> + a SUBSET of the figure's own font,
embedded as base64 woff2.

Embedding is not a nicety. An SVG loaded through `<img src="...">` — which is how
`cnxml-render.js` publishes every figure — cannot fetch anything external: no
stylesheet, no webfont. A `font-family` alone therefore resolves against whatever
the READER happens to have, and "Liberation Sans" is absent from stock Windows and
macOS. The committed corpus already does this; the subsetting is what keeps it
affordable.
"""
import base64, io, re
from pathlib import Path
import _deps

FACES = {   # (bold, italic)
    (False, False): '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    (True, False):  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    (False, True):  '/usr/share/fonts/truetype/liberation/LiberationSans-Italic.ttf',
    (True, True):   '/usr/share/fonts/truetype/liberation/LiberationSans-BoldItalic.ttf',
}
FAMILY = 'FigIS'          # local name; must not collide with a real installed family


def subset_face(path, chars):
    """Subset a TTF to `chars` and return woff2 bytes."""
    from fontTools import subset as fsubset
    from fontTools.ttLib import TTFont
    font = TTFont(path)
    opt = fsubset.Options()
    opt.layout_features = ['*']
    opt.desubroutinize = True
    opt.drop_tables += ['DSIG']
    opt.notdef_outline = True
    fsubset.Subsetter(options=opt).subset(font) if False else None
    sub = fsubset.Subsetter(options=opt)
    sub.populate(text=''.join(sorted(chars)))
    sub.subset(font)
    font.flavor = 'woff2'
    buf = io.BytesIO()
    font.save(buf)
    return buf.getvalue()


def esc(t):
    return (t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))


def write_svg(artwork_svg, out_path, items, page_h):
    art = Path(artwork_svg).read_text(encoding='utf-8')
    assert art.rstrip().endswith('</svg>'), 'unexpected artwork svg'

    faces = []
    # A face is embedded only when some item uses it, iterated (F,F),(T,F),(F,T),(T,T): a
    # figure with no italic item therefore emits today's rules in today's order. Italic
    # arrives with E (§C140 ①) - a kept run in an italic BaseFont is drawn italic.
    # §C140 ⑥a: a FigSym item (it['family'] == 'FigSym') is drawn in the STIX subset, never
    # here - so its characters are excluded from every FigIS character set below.
    for bold, italic in ((False, False), (True, False), (False, True), (True, True)):
        chars = {c for it in items
                 if it.get('family') != 'FigSym' and bool(it['bold']) is bold
                 and bool(it.get('italic')) is italic
                 for c in it['text']}
        if not chars:
            continue
        b64 = base64.b64encode(subset_face(FACES[(bold, italic)], chars)).decode('ascii')
        faces.append(
            f"@font-face{{font-family:'{FAMILY}';font-weight:{700 if bold else 400};"
            f"font-style:{'italic' if italic else 'normal'};"
            f"src:url(data:font/woff2;base64,{b64}) format('woff2');}}"
        )

    # §C140 ⑥a: an eligible kept STIX run is drawn in FigSym instead of FigIS (T2). The face is
    # appended AFTER every FigIS rule, and only when some item actually uses it - a figure with
    # no eligible run therefore emits exactly today's rules in today's order (case T1). Imported
    # lazily so a box without the STIX font can still compose figures without STIX (T3).
    stix_chars = {c for it in items if it.get('family') == 'FigSym' for c in it['text']}
    if stix_chars:
        import figsym
        b64 = base64.b64encode(figsym.subset_woff2(stix_chars)).decode('ascii')
        faces.append(
            f"@font-face{{font-family:'{figsym.FAMILY}';font-weight:400;font-style:normal;"
            f"src:url(data:font/woff2;base64,{b64}) format('woff2');}}"
        )

    # text-rendering="geometricPrecision" on the group every <text> sits in (ruling (S), [USER]
    # 2026-09-15; reverses E spec R2). compose.py places each segment of a split line at an absolute
    # x from cairo LINEAR advances; Chromium's default rounds glyph advances to device pixels, so a
    # long prefix drawn as its own <text> covers the word space before the next segment ("afBr2" at
    # 150 dpi) or pushes a base glyph into its subscript. geometricPrecision draws linear advances at
    # every scale, in an <img> too. It is an INHERITED presentation attribute, so one on the <g>
    # reaches every <text> below it and leaves each <text> element byte-identical; the artwork
    # above the group keeps the renderer's defaults. Pinned by test_svgout.py.
    parts = [f"<style>{''.join(faces)}</style>", '<g text-rendering="geometricPrecision">']
    if stix_chars:
        # T5: the licensing information, as the group's FIRST child - never before <style> (it
        # is not artwork) and never after </g> (svgfix / figparts key off the group's framing).
        parts.append(figsym.metadata_element())
    for it in items:
        # PDF y-up -> SVG y-down. Rotation flips sign with the axis.
        x, y = it['x'] + 0.0, page_h - it['y']
        r, g, b = it['rgb']
        fill = '#%02x%02x%02x' % (round(r * 255), round(g * 255), round(b * 255))
        attrs = [f'x="{x + it["dx"]:.3f}"', f'y="{y:.3f}"',
                 f'font-family="{it.get("family", FAMILY)}"',
                 f'font-weight="{700 if it["bold"] else 400}"',
                 *(['font-style="italic"'] if it.get('italic') else []),
                 f'font-size="{it["size"]:.3f}"', f'fill="{fill}"',
                 'xml:space="preserve"']
        if abs(it['rot']) > 1e-6:
            attrs.append(f'transform="rotate({-it["rot"]:.4f} {x:.3f} {y:.3f})"')
        parts.append(f"<text {' '.join(attrs)}>{esc(it['text'])}</text>")
    parts.append('</g>')

    art = art.rstrip()
    art = art[: art.rfind('</svg>')] + '\n'.join(parts) + '\n</svg>\n'
    Path(out_path).write_text(art, encoding='utf-8')
    return len(art.encode('utf-8'))
