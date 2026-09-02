#!/usr/bin/env python3
"""Stage 3 - lay translated text back onto the stripped artwork.

    FIGTEXT_PYLIBS=./pylibs python3 compose.py                      # translated
    FIGTEXT_PYLIBS=./pylibs python3 compose.py --control            # re-inject the ENGLISH

--control is the whole point.  It re-injects the figure's own English through the
same code and lets you diff against the untouched OpenStax raster.  It found four
real defects that the translated output could never have shown, because with
different text you cannot tell misplacement from "that is how it lays out".

Translations are read from translations.json, keyed by the block's English text
with '|' between lines.  Blocks are keyed by CONTENT, not position, so the file
survives re-extraction.
"""
import sys, json, math
import _deps
from _deps import HERE, OUT
import cairo
import figtext as FT

DPI = 200.0
S = DPI / 72.0
CONTROL = '--control' in sys.argv
SVG = '--svg' in sys.argv
ITEMS = []   # one entry per drawn string: the SINGLE layout, rendered two ways

meta = json.loads((OUT / 'meta.json').read_text())
W_PT, H_PT = meta['page']
runs = json.loads((OUT / 'runs.json').read_text())
blocks = FT.merge_blocks(FT.group(runs))

tr_path = HERE / 'translations.json'
_tr = json.loads(tr_path.read_text()) if tr_path.exists() else {}
TR = _tr.get('blocks', _tr)

surf = cairo.ImageSurface.create_from_png(str(OUT / 'artwork.png'))
out = cairo.ImageSurface(cairo.FORMAT_RGB24, surf.get_width(), surf.get_height())
ctx = cairo.Context(out)
ctx.set_source_rgb(1, 1, 1); ctx.paint()
ctx.set_source_surface(surf, 0, 0); ctx.paint()

FAMILY = "Liberation Sans"   # the figure's own font; OFL, full Icelandic coverage

# Font RESOURCE names are per-file - Illustrator writes /TT0,/TT1 and Ghostscript
# (what an EPS becomes) writes /R9,/R11. Never key on them; read the BaseFont.
BOLD = {k for k, v in meta['fonts'].items() if 'bold' in v['base'].lower()}


def setfont(run, size):
    ctx.select_font_face(FAMILY, cairo.FONT_SLANT_NORMAL,
                         cairo.FONT_WEIGHT_BOLD if run['font'] in BOLD
                         else cairo.FONT_WEIGHT_NORMAL)
    ctx.set_font_size(size * S)


def measure(text, run, size=None):
    setfont(run, size or run['size'])
    return ctx.text_extents(text).x_advance / S


def cmyk(f):
    if not f:
        return (0, 0, 0)
    _, c, m, y, k = f
    return ((1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k))


def dev(x, y):
    return x * S, (H_PT - y) * S


def fit_circle(pts):
    n = len(pts)
    sx = sy = sxx = syy = sxy = sxxx = syyy = sxyy = sxxy = 0
    for x, y in pts:
        sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y
        sxxx += x ** 3; syyy += y ** 3; sxyy += x * y * y; sxxy += x * x * y
    C = n * sxx - sx * sx; D = n * sxy - sx * sy
    E = n * sxxx + n * sxyy - (sxx + syy) * sx
    G = n * syy - sy * sy; H = n * sxxy + n * syyy - (sxx + syy) * sy
    den = 2 * (C * G - D * D)
    cx = (E * G - D * H) / den; cy = (C * H - D * E) / den
    return cx, cy, sum(math.hypot(x - cx, y - cy) for x, y in pts) / n


BOXW = 63.0     # rounded rect is 67.3pt wide; 2pt padding each side
report, missing = [], []

for b in blocks:
    ls = FT.lines(b)
    en_lines = [''.join(r['text'] for r in l) for l in ls]
    arc = FT.is_arc(b)
    key = ''.join(r['text'] for r in b) if arc else '|'.join(en_lines)

    if CONTROL:
        new = key if arc else en_lines
    else:
        if key not in TR:
            # Keep the ORIGINAL text. A missing key must never delete text from a
            # figure - formulas (H2O(g)) legitimately have no translation, and a
            # silent blank is far worse than an untranslated label.
            missing.append(key)
            new = key if arc else en_lines
        else:
            new = TR[key]

    if arc:
        pts = [(r['x'], r['y']) for r in b]
        cx, cy, R = fit_circle(pts)
        angs = [math.atan2(y - cy, x - cx) for x, y in pts]
        for j in range(1, len(angs)):
            while angs[j] - angs[j - 1] > math.pi:  angs[j] -= 2 * math.pi
            while angs[j] - angs[j - 1] < -math.pi: angs[j] += 2 * math.pi
        side = 1 if angs[-1] > angs[0] else -1
        sz = b[0]['size']
        adv = [measure(ch, b[0], sz) for ch in new]
        # NOTE: angs[-1] is the last glyph's ORIGIN, so this span is short by about
        # half a glyph - a known systematic bias.  Visibly fine for new text,
        # not registration-exact.  See FINDINGS.md.
        a = (angs[0] + angs[-1]) / 2 - side * (sum(adv) / R) / 2
        col = cmyk(b[0]['fill'])
        for ch, w in zip(new, adv):
            th = a + side * (w / R) / 2
            px, py = dev(cx + R * math.cos(th), cy + R * math.sin(th))
            rot_deg = math.degrees(th + side * math.pi / 2)
            ITEMS.append(dict(text=ch, x=px / S, y=H_PT - py / S, rot=rot_deg,
                              size=sz, bold=b[0]['font'] in BOLD, rgb=col, dx=-w / 2))
            ctx.save(); ctx.translate(px, py); ctx.rotate(-(th + side * math.pi / 2))
            ctx.set_source_rgb(*col); ctx.move_to(-w * S / 2, 0); ctx.show_text(ch)
            ctx.restore()
            a += side * (w / R)
        report.append(f"  ARC    R={R:5.1f}pt  {key!r}")
        continue

    align = FT.alignment(b, lambda t, r: measure(t, r))
    rot = b[0]['rot']; rad = math.radians(rot)
    sz0 = b[0]['size']
    starts = [FT.along(l[0]) for l in ls]
    widths = [sum(measure(r['text'], r) for r in l) for l in ls]
    anchor = {'left':   min(starts),
              'right':  max(s + w for s, w in zip(starts, widths)),
              'center': sum(s + w / 2 for s, w in zip(starts, widths)) / len(ls)}[align]
    top = FT.proj(ls[0][0])
    # budget: a boxed label stays inside its box; any label may keep at least the
    # width its English original already occupied.
    maxw = max(BOXW if abs(rot) < 0.5 else 999, max(widths) + 1.0)
    sz = sz0
    while sz > 5 and max(measure(t, ls[min(j, len(ls) - 1)][0], sz)
                         for j, t in enumerate(new)) > maxw:
        sz -= 0.25
    lead = sz0 * 1.222
    for j, t in enumerate(new):
        fr = ls[min(j, len(ls) - 1)][0]     # font AND colour are per LINE
        w = measure(t, fr, sz)
        a_ = {'left': anchor, 'right': anchor - w, 'center': anchor - w / 2}[align]
        p_ = top - j * lead
        x = a_ * math.cos(rad) - p_ * math.sin(rad)
        y = a_ * math.sin(rad) + p_ * math.cos(rad)
        px, py = dev(x, y)
        setfont(fr, sz)
        ITEMS.append(dict(text=t, x=px / S, y=H_PT - py / S, rot=rot,
                          size=sz, bold=fr['font'] in BOLD, rgb=cmyk(fr['fill']), dx=0.0))
        ctx.save(); ctx.translate(px, py); ctx.rotate(-rad)
        ctx.set_source_rgb(*cmyk(fr['fill'])); ctx.move_to(0, 0); ctx.show_text(t)
        ctx.restore()
    report.append(f"  {align:6} {sz0}->{sz:.2f}pt  {key!r}")

name = 'control.png' if CONTROL else 'translated.png'
out.write_to_png(str(OUT / name))
if SVG:
    from svgout import write_svg
    svg_name = ('control' if CONTROL else 'translated') + '.svg'
    n = write_svg(OUT / 'artwork.svg', OUT / svg_name, ITEMS, H_PT)
    print(f"wrote out/{svg_name}  ({n} bytes)")
print(f"{len(blocks)} blocks")
print('\n'.join(report))
if missing:
    print(f"\n!! {len(missing)} block(s) with no translation - ENGLISH KEPT:")
    for k in missing:
        print(f"     {k!r}")
print(f"\nwrote out/{name}")
