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

FACES = {
    False: '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    True:  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
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
    for bold in (False, True):
        chars = {c for it in items if it['bold'] is bold for c in it['text']}
        if not chars:
            continue
        b64 = base64.b64encode(subset_face(FACES[bold], chars)).decode('ascii')
        faces.append(
            f"@font-face{{font-family:'{FAMILY}';font-weight:{700 if bold else 400};"
            f"font-style:normal;src:url(data:font/woff2;base64,{b64}) format('woff2');}}"
        )

    parts = [f"<style>{''.join(faces)}</style>", '<g>']
    for it in items:
        # PDF y-up -> SVG y-down. Rotation flips sign with the axis.
        x, y = it['x'] + 0.0, page_h - it['y']
        r, g, b = it['rgb']
        fill = '#%02x%02x%02x' % (round(r * 255), round(g * 255), round(b * 255))
        attrs = [f'x="{x + it["dx"]:.3f}"', f'y="{y:.3f}"',
                 f'font-family="{FAMILY}"',
                 f'font-weight="{700 if it["bold"] else 400}"',
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
