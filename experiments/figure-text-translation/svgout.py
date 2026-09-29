#!/usr/bin/env python3
"""Emit an SVG: vector artwork + real <text> + a SUBSET of the figure's own font,
embedded as base64 woff2.

Embedding is not a nicety. An SVG loaded through `<img src="...">` — which is how
`cnxml-render.js` publishes every figure — cannot fetch anything external: no
stylesheet, no webfont. A `font-family` alone therefore resolves against whatever
the READER happens to have, and "Liberation Sans" is absent from stock Windows and
macOS. The committed corpus already does this; the subsetting is what keeps it
affordable.

§C140 ㉗: every embedded face is a RENAMED subset that names no Reserved Font Name
and keeps its copyright and trademark notices, and each family embedded brings its
licence as a <metadata> element. The Liberation faces (FigIS) are owned by figis.py
and the STIX face (FigSym) by figsym.py; this file only places what they return.
There is deliberately no unrenamed subsetter here any more: the pre-㉗ one embedded
"Liberation Sans" names and dropped the trademark notice.
"""
import base64
from pathlib import Path
import _deps
import figis

FAMILY = figis.FAMILY     # 'FigIS': a local name; must not collide with a real installed family


def esc(t):
    return (t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))


_SVG_OPEN = __import__('re').compile(r'<svg\b[^>]*>', __import__('re').I)


def raster_shell(artwork_svg_text, png_path):
    """
    §C168 — an SVG shell whose only artwork is ONE <image> of the rendered PNG.

    🔴 THE TEXT IS STILL LIVE. This replaces the ARTWORK layer only; `write_svg`
    then splices the same `<text>` elements on top, so the translated labels stay
    selectable, searchable and re-editable. Register ⑩'s objection to raster-in-SVG
    ("the translation is trapped in pixels") does not apply here — the sidecar
    holds the translation and the vector master stays in media/.

    ⚠️ The artwork is TEXT-FREE (`strip-text.py` strips it before pdftocairo), so
    the raster cannot bake an English label into the picture.

    ⚠️ The shell reuses the artwork's OWN opening <svg> tag verbatim, so width,
    height, viewBox and any namespace it declares are preserved exactly. Inventing
    a viewBox here would move every text item, because compose.py places them at
    absolute coordinates in the artwork's units.
    """
    import base64
    m = _SVG_OPEN.search(artwork_svg_text)
    assert m, 'artwork svg has no <svg> open tag'
    open_tag = m.group(0)
    if 'xmlns:xlink' not in open_tag:
        open_tag = open_tag[:-1] + ' xmlns:xlink="http://www.w3.org/1999/xlink">'
    # Geometry comes from the viewBox when present; width/height may carry units.
    vb = __import__('re').search(r'viewBox="([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)"', open_tag)
    if vb:
        x, y, w, h = (float(v) for v in vb.groups())
    else:
        wm = __import__('re').search(r'width="([\d.]+)', open_tag)
        hm = __import__('re').search(r'height="([\d.]+)', open_tag)
        assert wm and hm, 'artwork svg has neither viewBox nor numeric width/height'
        x, y, w, h = 0.0, 0.0, float(wm.group(1)), float(hm.group(1))
    b64 = base64.b64encode(Path(png_path).read_bytes()).decode('ascii')
    img = (f'<image x="{x:.4f}" y="{y:.4f}" width="{w:.4f}" height="{h:.4f}" '
           f'preserveAspectRatio="none" xlink:href="data:image/png;base64,{b64}"/>')
    return f'{open_tag}{img}</svg>'


def write_svg(artwork_svg, out_path, items, page_h, raster_png=None):
    art = Path(artwork_svg).read_text(encoding='utf-8')
    assert art.rstrip().endswith('</svg>'), 'unexpected artwork svg'
    if raster_png is not None:
        # §C168: publish the heavy tail from the PNG arm compose.py already writes.
        art = raster_shell(art, raster_png)

    faces = []
    figis_keys = []
    # A face is embedded only when some item uses it, iterated (F,F),(T,F),(F,T),(T,T): a
    # figure with no italic item therefore emits today's rules in today's order. Italic
    # arrives with E (§C140 ①) - a kept run in an italic BaseFont is drawn italic.
    # §C140 ⑥a: a FigSym item (it['family'] == 'FigSym') is drawn in the STIX subset, never
    # here - so its characters are excluded from every FigIS character set below.
    # §C140 ㉗: each face is figis.subset_woff2's renamed subset, which refuses (FontUnavailable)
    # unless the file is the pinned one AND the file cairo measured the layout with.
    for bold, italic in ((False, False), (True, False), (False, True), (True, True)):
        chars = {c for it in items
                 if it.get('family') != 'FigSym' and bool(it['bold']) is bold
                 and bool(it.get('italic')) is italic
                 for c in it['text']}
        if not chars:
            continue
        figis_keys.append((bold, italic))
        b64 = base64.b64encode(figis.subset_woff2((bold, italic), chars)).decode('ascii')
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
    # reaches every <text> below it without touching any <text> element (since §C140 ⑥b a LAYOUT
    # <text> carries its own trailing style - see below - while run-exact and arc elements stay
    # byte-identical); the artwork above the group keeps the renderer's defaults. Pinned by test_svgout.py.
    parts = [f"<style>{''.join(faces)}</style>", '<g text-rendering="geometricPrecision">']
    # The licensing information, one <metadata> per family embedded, in @font-face order (FigIS,
    # then FigSym), as the group's FIRST children - never before <style> (it is not artwork) and
    # never after </g> (figparts keys off the group's framing). A figure that embeds no font (a
    # textless one) owes no licence and carries none. §C140 ㉗ for FigIS, ⑥a's T5 for FigSym.
    if figis_keys:
        parts.append(figis.metadata_element(figis_keys))
    if stix_chars:
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
        # §C140 ⑥b ([USER] ruling (a), docs/decisions/2026-09-17-translated-figure-labels-drawn-unkerned.md):
        # a LAYOUT item was placed from compose.lin_advance, which applies no kerning, so it is drawn with
        # kerning off - otherwise the browser applies the subset's GPOS kern pairs and draws a width the layout
        # was not decided with (up to 0.99 pt short on the 34; Liberation's r’/f’ pairs - U+2019, not an
        # ASCII apostrophe - would draw it LONGER).
        # Run-exact and arc items keep the default. An INLINE style, never the presentation attribute
        # font-kerning="none", which Chromium silently ignores (measured, evidence/2026-09-17-c6b-build/
        # reports/rd/). Appended LAST, so every other attribute keeps its position. Pinned by test_svgout.py K.
        if it.get('path') == 'layout':
            attrs.append('style="font-kerning:none"')
        parts.append(f"<text {' '.join(attrs)}>{esc(it['text'])}</text>")
    parts.append('</g>')

    art = art.rstrip()
    art = art[: art.rfind('</svg>')] + '\n'.join(parts) + '\n</svg>\n'
    Path(out_path).write_text(art, encoding='utf-8')
    return len(art.encode('utf-8'))
