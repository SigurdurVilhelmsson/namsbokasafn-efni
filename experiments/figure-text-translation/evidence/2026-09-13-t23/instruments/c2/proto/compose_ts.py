#!/usr/bin/env python3
"""Stage 3 - lay translated text back onto the stripped artwork.

    FIGTEXT_PYLIBS=./pylibs python3 compose.py                      # translated
    FIGTEXT_PYLIBS=./pylibs python3 compose.py --control            # redraw the ENGLISH run-exact

Until §C140 ① (E), --control re-injected the figure's own English through the same layout
code used for translations and let you diff against the untouched OpenStax raster. It found
four real defects that the translated output could never have shown, because with different
text you cannot tell misplacement from "that is how it lays out".

⚠️ SINCE §C140 ① (E), --control DRAWS EVERY BLOCK RUN-EXACT - each run at its own origin,
size, rotation, fill and face, as the source drew it. It is therefore a FAITHFUL REDRAW of
the source: a disagreement with the raster now isolates artwork and rasteriser defects. It no
longer exercises the wrap / anchor / shrink path at all - and neither can any translations
file, because a reply token-equal to its English is IDENTITY and is drawn run-exact too.
Work on that path (§C140 ③) needs its own switch.

Translations are read from translations.json, keyed by the block's English text
with '|' between lines.  Blocks are keyed by CONTENT, not position, so the file
survives re-extraction.
"""
import sys, json, math, collections
sys.path.insert(0, '/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation')
sys.path.insert(0, '/home/siggi/dev/scratch-c140/c2/proto')
import scripts as TS   # c2 prototype
import _deps
from _deps import HERE, OUT
from pathlib import Path
import cairo
import figtext as FT
from blockkey import block_key, block_english

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


def draw_run_exact(block):
    """Draw every run of a KEPT block at its own origin, size, rotation, fill and face.

    -> True when a pdfminer `(cid:N)` placeholder was removed from any run (the caller names
    the block in `undecodable`).

    🔴 WHY: `runs.json` already carries what the source drew - a subscript's size and
    baseline, an italic BaseFont, the ten spaces a typist put in an arrow gap, a kerned-back
    superscript. The layout path below joins each line into ONE string at ONE size on ONE
    baseline, re-wraps it (collapsing whitespace), re-anchors it and never selects a slant,
    which destroyed exactly that for 191 of 367 drawn blocks in the 34 bought figures while
    every value check passed (COMPOSE-FIDELITY.md). For English that is kept, nothing needs
    laying out: draw it where it was.

    Nothing is joined, wrapped, re-anchored, re-led or re-sized. A run whose text becomes ''
    after `run_draw_text` is skipped - it would draw nothing. Weight, slant and fill are per
    RUN (the layout path's are per line). One ITEMS entry per drawn run.
    """
    removed = False
    _li = {id(r): li for li, l in enumerate(FT.lines(block)) for r in l}   # c2 instrument
    for r in block:
        text, gone = FT.run_draw_text(r)
        removed = removed or gone
        if text == '':
            continue
        bold, italic = FT.run_face(r, meta['fonts'])
        px, py = dev(r['x'], r['y'])
        col = cmyk(r['fill'])
        ITEMS.append(dict(text=text, x=px / S, y=H_PT - py / S, rot=r['rot'],
                          size=r['size'], bold=bold, italic=italic, rgb=col, dx=0.0,
                          c2line=f"RX:{block_key(block)}:{_li[id(r)]}", c2adv=r['adv']))
        ctx.select_font_face(FAMILY,
                             cairo.FONT_SLANT_ITALIC if italic else cairo.FONT_SLANT_NORMAL,
                             cairo.FONT_WEIGHT_BOLD if bold else cairo.FONT_WEIGHT_NORMAL)
        ctx.set_font_size(r['size'] * S)
        ctx.save(); ctx.translate(px, py); ctx.rotate(-math.radians(r['rot']))
        ctx.set_source_rgb(*col); ctx.move_to(0, 0); ctx.show_text(text)
        ctx.restore()
    return removed


def setfont(run, size):
    ctx.select_font_face(FAMILY, cairo.FONT_SLANT_NORMAL,
                         cairo.FONT_WEIGHT_BOLD if run['font'] in BOLD
                         else cairo.FONT_WEIGHT_NORMAL)
    ctx.set_font_size(size * S)


def measure(text, run, size=None):
    setfont(run, size or run['size'])
    return ctx.text_extents(text).x_advance / S


def setfont_st(run, size, st):
    """c2: a stretch's face and size. st None -> exactly setfont(run, size)."""
    if st is None:
        return setfont(run, size)
    ctx.select_font_face(FAMILY,
                         cairo.FONT_SLANT_ITALIC if st[2] else cairo.FONT_SLANT_NORMAL,
                         cairo.FONT_WEIGHT_BOLD if run['font'] in BOLD
                         else cairo.FONT_WEIGHT_NORMAL)
    ctx.set_font_size(size * st[0] * S)


def measure_st(text, run, size, st):
    """c2: advance of one stretch at ITS OWN size. st None -> exactly measure(text, run, size)."""
    if st is None:
        return measure(text, run, size)
    setfont_st(run, size, st)
    return ctx.text_extents(text).x_advance / S


def seg_width(segs, run, size):
    return sum(measure_st(t, run, size, st) for t, st in segs)


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

    🔴 RETURNS None ON A DEGENERATE BLOCK — A TRANSLATED BLOCK THEN FALLS BACK TO THE STRAIGHT
    PATH. A kept block still passes through `fit_circle` — it is called before the kept decision
    — so this guard protects it too; a kept block is simply never DRAWN on the arc path (it is
    drawn run-exact).
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
report, missing, degenerate, undecodable = [], [], [], []
# The MACHINE-READABLE half of the report printed at the bottom of this file. `report`
# holds formatted DISPLAY STRINGS ("  center 12.0->12.00pt  'Boiling|point'"), so it
# cannot be compared against blocks.json by anything; these two hold BLOCK KEYS, in draw
# order, WITH MULTIPLICITY. A wrapper compares them as multisets - a figure may carry the
# same key twice and this loop draws both, so a lost twin leaves a label undrawn with the
# key SET identical (ruling R-13).
keys, translated = [], []
# E (§C140 ①), both additive to the contract above and, like it, in draw order WITH
# multiplicity. `identity` keys are ALSO in `translated` (figure-compose.py assertion 2);
# `runExact` is every kept block, identity included. `degenerate_kept` only splits the
# stdout warning - `degenerate` itself keeps its meaning.
identity, run_exact, degenerate_kept = [], [], []
unformatted = []   # c2: NAMED transfer misses, draw order
LAYOUT = []   # c2 instrument
FLAT = '--flat' in sys.argv   # c2: disable transfer -> must equal the unchanged composer

for b in blocks:
    ls = FT.lines(b)
    # The arc decision must be made BEFORE `new` is built: `new` is a STRING for an arc
    # and a LIST OF LINES otherwise, so deciding afterwards would hand the straight path
    # a value of the wrong shape. A block `is_arc` calls an arc but that has no usable
    # circle is drawn STRAIGHT if translated (see fit_circle) and run-exact if kept.
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

    # KEPT := --control, or no translation, or an empty one, or an IDENTITY reply. Every kept
    # block is drawn run-exact (draw_run_exact); only a genuine translation is laid out.
    kept = False
    if CONTROL:
        kept = True
    else:
        value = FT.normalise_block_value(TR[key], arc) if key in TR else None
        # ⚠️ AN EMPTY OR WHITESPACE-ONLY VALUE IS *MISSING*, NOT A TRANSLATION. It reaches
        # this line looking like a hit - `key in TR` is True - and would DELETE the label:
        # `wrap()` turns a whitespace-only paragraph into '' and cairo draws nothing, and the
        # arc path draws nothing for the same reason. Before this branch existed the erasure
        # was recorded nowhere, so the block vanished while `missing` stayed empty.
        # The predicate is `.strip()` because that is exactly what `wrap()` does with
        # `para.split()`; it errs toward KEEPING English, the safe direction.
        # (`.strip()` is right here: this judges an MT/editor-authored VALUE. The no-`.strip()`
        # rule in `run_draw_text` and blockkey.py is about SOURCE runs read from a PDF, whose
        # edge spaces are glyph positions.)
        if value is None or not (value if arc else ''.join(value)).strip():
            # A missing key must never delete text from a figure - formulas (H2O(g))
            # legitimately have no translation, and a silent blank is far worse than an
            # untranslated label.
            missing.append(key)
            kept = True
        else:
            translated.append(key)
            new = value
            # IDENTITY: the MT gave back what went on the wire. It stays in `translated`
            # (it was bought) and is drawn run-exact (it is English we can draw exactly).
            if FT.is_identity(TR[key], block_english(b), arc):
                identity.append(key)
                kept = True

    if kept:
        if FT.is_arc(b) and circle is None:
            degenerate_kept.append(key)
        if draw_run_exact(b):
            undecodable.append(key)
        run_exact.append(key)
        report.append(f"  RUNEXACT {len(b)} run(s)  {key!r}")
        continue

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
                              size=sz, bold=b[0]['font'] in BOLD, italic=False, rgb=col, dx=-w / 2))
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
    # c2: transfer on the RAW value, then carry the per-char styles on WORDS (offsets from the
    # raw string), so wrap's whitespace collapse cannot misalign them.
    toks = [] if FLAT else TS.source_tokens(b, meta['fonts'])
    paras = []
    for para in new:
        fmt, miss = TS.transfer(toks, para) if toks else ([None] * len(para), [])
        unformatted.extend(dict(key=key, **m_) for m_ in miss)
        paras.append(TS.words(para, fmt))

    def wrap(paras_in, size):
        out = []
        for words_ in paras_in:
            if not words_:
                out.append([]); continue
            cur = list(zip(*words_[0]))
            for wt, wst in words_[1:]:
                cand = cur + [(' ', None)] + list(zip(wt, wst))
                if seg_width(TS.segments(cand), ref, size) <= maxw:
                    cur = cand
                else:
                    out.append(cur); cur = list(zip(wt, wst))
            out.append(cur)
        return out

    sz = sz0
    wrapped = wrap(paras, sz)
    while sz > 5 and max((seg_width(TS.segments(t), ref, sz) for t in wrapped), default=0) > maxw:
        sz -= 0.25
        wrapped = wrap(paras, sz)
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
        segs = TS.segments(t) or [('', None)]
        if '--wordsplit' in sys.argv and any(st for _, st in segs):
            segs = TS.split_at_word_edges(segs)
        w = seg_width(segs, fr, sz)
        a_ = {'left': anchor, 'right': anchor - w, 'center': anchor - w / 2}[align]
        p_ = top - j * lead
        off = 0.0
        for text_, st in segs:
            aa = a_ + off
            pp = p_ + (sz * st[1] if st else 0.0)
            x = aa * math.cos(rad) - pp * math.sin(rad)
            y = aa * math.sin(rad) + pp * math.cos(rad)
            px, py = dev(x, y)
            wseg = measure_st(text_, fr, sz, st)
            setfont_st(fr, sz, st)
            ITEMS.append(dict(text=text_, x=px / S, y=H_PT - py / S, rot=rot,
                              size=sz * (st[0] if st else 1.0), bold=fr['font'] in BOLD,
                              italic=bool(st and st[2]), rgb=cmyk(fr['fill']), dx=0.0,
                              c2line=f"TS:{key}:{j}", c2adv=wseg, c2styled=st is not None))
            ctx.save(); ctx.translate(px, py); ctx.rotate(-rad)
            ctx.set_source_rgb(*cmyk(fr['fill'])); ctx.move_to(0, 0); ctx.show_text(text_)
            ctx.restore()
            off += wseg
    report.append(f"  {align:6} {sz0}->{sz:.2f}pt  {key!r}")
    LAYOUT.append(dict(key=key, src_lines=len(ls), drawn_lines=len(new), sz0=sz0, sz=sz, align=align, styled=any(st for t in new for _, st in t), maxw=maxw))

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
    # The blocks whose kept English carried a pdfminer `(cid:N)` placeholder, which was
    # removed before drawing. NAMED, never only counted: it is the one signal that says
    # WHICH label a reader is getting in partial English.
    'undecodable': undecodable,
    'translationsPath': str(tr_path),
    # A --control run re-injects the ENGLISH and never populates `missing`, so a consumer
    # that compared `missing` against the send:false blocks of a control run would refuse
    # a correct one. It is here so that mistake is impossible to make silently.
    'control': CONTROL,
    # E (§C140 ①). Additive: figure-compose.py reads only blocks/missing/translated.
    'identity': identity,
    'runExact': run_exact,
    'unformatted': unformatted,
}, indent=1, ensure_ascii=False))
(OUT / 'items-c2.json').write_text(json.dumps(ITEMS, indent=0, ensure_ascii=False))
(OUT / 'layout-c2.json').write_text(json.dumps(LAYOUT, indent=0, ensure_ascii=False))

print(f"{len(blocks)} blocks")
print('\n'.join(report))
if missing:
    print(f"\n!! {len(missing)} block(s) with no translation - ENGLISH KEPT:")
    for k in missing:
        print(f"     {k!r}")
# NAMED, never counted. `is_arc` calling straight text an arc is a real mis-classification; the
# keys below are the evidence for whoever revisits `is_arc`, which this file
# deliberately does not touch. Split by path, because only a TRANSLATED one is laid out.
degenerate_straight = list((collections.Counter(degenerate)
                            - collections.Counter(degenerate_kept)).elements())
if degenerate_straight:
    print(f"\n!! {len(degenerate_straight)} block(s) is_arc says are arcs but have no usable "
          f"circle - TRANSLATED, DRAWN STRAIGHT:")
    for k in degenerate_straight:
        print(f"     {k!r}")
if degenerate_kept:
    print(f"\n!! {len(degenerate_kept)} block(s) is_arc says are arcs but have no usable "
          f"circle - KEPT, DRAWN RUN-EXACT:")
    for k in degenerate_kept:
        print(f"     {k!r}")
# Leading '\n' is load-bearing - see the note above the compose-report.json write.
if undecodable:
    print(f"\n!! {len(undecodable)} block(s) carried a pdfminer (cid:N) placeholder, "
          f"REMOVED before drawing:")
    for k in undecodable:
        print(f"     {k!r}")
print(f"\nwrote out/{name}")
# Leading '\n' is load-bearing - see the note above the compose-report.json write.
print(f"\nwrote out/compose-report.json  "
      f"({len(translated)} translated, {len(missing)} english-kept)")
