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
from pathlib import Path
import cairo
import figtext as FT
from blockkey import block_key

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
if '--translations' in sys.argv:
    tr_path = Path(sys.argv[sys.argv.index('--translations') + 1])
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


# See fit_circle. A circle this much larger than the block's OWN extent is a straight
# line, whatever the algebra returns. ⚠️ THE NUMBER IS MEASURED, NOT CHOSEN, AND THE GAP
# IT SITS IN IS ELEVEN ORDERS OF MAGNITUDE WIDE: the four genuine arcs on
# CNX_Chem_01_01_SciMethod have R/span of 0.748, 1.305, 1.429 and 2.565, while the
# degenerate blocks the review measured come back at R = 6.15e15 to 1.02e17 against spans
# of tens of points, i.e. R/span ~ 1e14. So this threshold is ~400x above the largest real
# arc and ~1e11 below the smallest fake one. Re-measure before moving it; do not tune it.
ARC_MAX_R_SPANS = 1000.0


def fit_circle(pts):
    """Least-squares circle through `pts`, or None when there is no usable circle.

    🔴 RETURNS None ON A DEGENERATE BLOCK — CALLERS MUST FALL BACK TO THE STRAIGHT PATH.
    `figtext.is_arc` is `len(b) > 3 and all(len(r['text'].strip()) <= 1 ...)`, i.e. it
    calls ANY block of four-plus single-character runs an arc, whether or not the
    characters curve. Straight text that splits per glyph therefore arrives here
    collinear, where `den = 2*(C*G - D*D)` is exactly 0 and this divided by zero:
    measured, `compose.py --control` died at this line on CNX_Chem_03_02_moles-6296
    ('28.1 g Si', '118.7 g Sn'), CNX_Chem_13_02_mixtures ('Q = ' x3),
    CNX_Chem_14_03_ICETable3_img ('0 + x = x') and five more — 9 blocks corpus-wide,
    no PNG written.

    ⚠️ THE NEAR-COLLINEAR CASE IS THE DANGEROUS ONE, and a `den == 0` guard alone does
    not catch it: `den` is merely tiny, so the algebra returns a finite centre 1e15 pt
    away and a radius to match, `cx + R*cos(th)` becomes pure cancellation noise, and the
    figure is silently garbled instead of loudly crashing. Both are the same fact — the
    points do not lie on any circle — so both return None. The threshold is scale-free
    (a multiple of the block's OWN extent), because these are points on a page and the
    absolute numbers vary with figure size.

    ⚠️ THE FIX IS DELIBERATELY HERE AND NOT IN `is_arc`. [USER] ruled the layout layer is
    KEPT, and `is_arc` feeds `blockkey.block_key` — the unit that is BOUGHT. Changing it
    would change purchased keys corpus-wide to fix a drawing crash. This guard changes
    only how a block is DRAWN.
    """
    n = len(pts)
    sx = sy = sxx = syy = sxy = sxxx = syyy = sxyy = sxxy = 0
    for x, y in pts:
        sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y
        sxxx += x ** 3; syyy += y ** 3; sxyy += x * y * y; sxxy += x * x * y
    C = n * sxx - sx * sx; D = n * sxy - sx * sy
    E = n * sxxx + n * sxyy - (sxx + syy) * sx
    G = n * syy - sy * sy; H = n * sxxy + n * syyy - (sxx + syy) * sy
    den = 2 * (C * G - D * D)
    if den == 0:
        return None
    cx = (E * G - D * H) / den; cy = (C * H - D * E) / den
    R = sum(math.hypot(x - cx, y - cy) for x, y in pts) / n
    if not (math.isfinite(cx) and math.isfinite(cy) and math.isfinite(R)) or R <= 0:
        return None
    span = max(math.hypot(x1 - x2, y1 - y2)
               for x1, y1 in pts for x2, y2 in pts)
    if span <= 0 or R > ARC_MAX_R_SPANS * span:
        return None
    return cx, cy, R


BOXW = 63.0     # rounded rect is 67.3pt wide; 2pt padding each side
report, missing, degenerate = [], [], []
# The MACHINE-READABLE half of the report printed at the bottom of this file. `report`
# holds formatted DISPLAY STRINGS ("  center 12.0->12.00pt  'Boiling|point'"), so it
# cannot be compared against blocks.json by anything; these two hold BLOCK KEYS, in draw
# order, WITH MULTIPLICITY. A wrapper compares them as multisets - a figure may carry the
# same key twice and this loop draws both, so a lost twin leaves a label undrawn with the
# key SET identical (ruling R-13).
keys, translated = [], []

for b in blocks:
    ls = FT.lines(b)
    en_lines = [''.join(r['text'] for r in l) for l in ls]
    # The arc decision must be made BEFORE `new` is built: `new` is a STRING for an arc
    # and a LIST OF LINES otherwise, so deciding afterwards would hand the straight path
    # a value of the wrong shape. A block `is_arc` calls an arc but that has no usable
    # circle is drawn STRAIGHT — see fit_circle, which returns None for those.
    pts = [(r['x'], r['y']) for r in b]
    circle = fit_circle(pts) if FT.is_arc(b) else None
    arc = circle is not None
    if FT.is_arc(b) and circle is None:
        degenerate.append(block_key(b))
    # The key is the ONE rule (blockkey.block_key), never an inline copy. This is the
    # consumer that DRAWS: it looks the translation up as TR[key], so a key that differs
    # from the one emit-blocks.py bought leaves the label in English with nothing to
    # report. test_blockkey_consumers.py asserts the two agree on a real figure.
    key = block_key(b)
    keys.append(key)

    if CONTROL:
        new = key if arc else en_lines
    else:
        value = FT.normalise_block_value(TR[key], arc) if key in TR else None
        # ⚠️ AN EMPTY OR WHITESPACE-ONLY VALUE IS *MISSING*, NOT A TRANSLATION. It reaches
        # this line looking like a hit - `key in TR` is True - and then DELETES the label:
        # `wrap()` below turns a whitespace-only paragraph into '' and cairo draws nothing,
        # and the arc path draws nothing for the same reason. Before this branch existed
        # the erasure was recorded nowhere at all, so the block vanished from the figure
        # while `missing` stayed empty and every count read clean.
        # The predicate is `.strip()` because that is exactly what `wrap()` does with
        # `para.split()`; it deliberately errs toward KEEPING English, which is the safe
        # direction. (blockkey.py's warning that `.strip()` can eat a /Differences glyph is
        # about SOURCE runs read out of a PDF, not about an MT/editor-authored value.)
        if value is None or not (value if arc else ''.join(value)).strip():
            # Keep the ORIGINAL text. A missing key must never delete text from a
            # figure - formulas (H2O(g)) legitimately have no translation, and a
            # silent blank is far worse than an untranslated label.
            missing.append(key)
            new = key if arc else en_lines
        else:
            translated.append(key)
            new = value

    if arc:
        cx, cy, R = circle
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
    # budget: a boxed label stays inside its box; any label may keep at least the
    # width its English original already occupied.
    maxw = max(BOXW if abs(rot) < 0.5 else 999, max(widths) + 1.0)
    ref = ls[0][0]

    # WRAP before shrinking. The MT returns ONE string per block; without this a
    # 3-line English label comes back as one long line and the only lever left is
    # font size — TempScales' "180 gradur a Fahrenheit" fell to 5.75pt beside 9pt
    # neighbours. Shrinking is the fallback for a single unbreakable word, not the
    # primary response to a longer translation.
    def wrap(lines_in, size):
        out = []
        for para in lines_in:
            words = para.split()
            if not words:
                out.append(''); continue
            cur = words[0]
            for w_ in words[1:]:
                if measure(cur + ' ' + w_, ref, size) <= maxw:
                    cur += ' ' + w_
                else:
                    out.append(cur); cur = w_
            out.append(cur)
        return out

    sz = sz0
    wrapped = wrap(new, sz)
    while sz > 5 and max((measure(t, ref, sz) for t in wrapped), default=0) > maxw:
        sz -= 0.25
        wrapped = wrap(new, sz)
    new = wrapped

    # Anchor on the block's vertical CENTRE, not its first baseline. The line count
    # changes with the language, and top-anchoring a 3-line block replaced by 1 line
    # leaves the label floating above the thing it labels.
    lead = sz0 * 1.222
    projs = [FT.proj(l[0]) for l in ls]
    centre = (max(projs) + min(projs)) / 2
    top = centre + (len(new) - 1) / 2.0 * lead
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

# THE VERDICT, IN A FILE. Everything below this line is stdout, and stdout is where the
# ENGLISH KEPT warning has always gone - which is why a wrapper reading `returncode` and
# `stderr` saw success on a figure that shipped in English (this script has no exit call
# at all; it falls off the end at 0). `figure-compose.py` reads THIS instead and compares
# `blocks` and `missing` against blocks.json as MULTISETS.
#
# ⚠️ WRITTEN AFTER THE PNG AND THE SVG ON PURPOSE: its presence then means the drawing
# completed. `svgout.write_svg` asserts on the artwork's last tag and can die AFTER
# translated.png is on disk, and a report written before that would describe a compose
# that never finished.
#
# ⚠️ NOTHING IS PRINTED BETWEEN THE `!!` HEADER BELOW AND ITS KEYS, AND NOTHING MAY BE.
# `test_blockkey_consumers.py:88-97` parses that block out of stdout: it starts at the
# `!!` line, `ast.literal_eval`s each following line, and stops at the first BLANK one -
# a blank that only exists as the leading '\n' of whatever prints next. Any new stdout
# line must therefore precede the header or begin with '\n'.
(OUT / 'compose-report.json').write_text(json.dumps({
    'blocks': keys,
    'missing': missing,
    'translated': translated,
    # NAMED here as well as printed. `degenerate` is not in the wrapper's contract, but
    # dropping it from the machine-readable copy would narrow what a driver can see to
    # less than what a human reading stdout sees.
    'degenerate': degenerate,
    'translationsPath': str(tr_path),
    # A --control run re-injects the ENGLISH and never populates `missing`, so a consumer
    # that compared `missing` against the send:false blocks of a control run would refuse
    # a correct one. It is here so that mistake is impossible to make silently.
    'control': CONTROL,
}, indent=1, ensure_ascii=False))

print(f"{len(blocks)} blocks")
print('\n'.join(report))
if missing:
    print(f"\n!! {len(missing)} block(s) with no translation - ENGLISH KEPT:")
    for k in missing:
        print(f"     {k!r}")
# NAMED, never counted. `is_arc` calling straight text an arc is a real mis-classification
# and the straight fallback only stops it CRASHING; the keys below are the evidence for
# whoever revisits `is_arc`, which this guard deliberately does not touch.
if degenerate:
    print(f"\n!! {len(degenerate)} block(s) is_arc says are arcs but have no usable "
          f"circle - DRAWN STRAIGHT:")
    for k in degenerate:
        print(f"     {k!r}")
print(f"\nwrote out/{name}")
# Leading '\n' is load-bearing - see the note above the compose-report.json write.
print(f"\nwrote out/compose-report.json  "
      f"({len(translated)} translated, {len(missing)} english-kept)")
