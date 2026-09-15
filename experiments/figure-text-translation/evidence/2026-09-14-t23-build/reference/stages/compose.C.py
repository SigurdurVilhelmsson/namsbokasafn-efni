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

§C140 ② ③ ⑨ (spec docs/superpowers/specs/2026-09-13-c140-t23-scripts-reflow-decimals-design.md):
a TRANSLATED straight label is laid out by two pure helpers and drawn here - `figcontainers` says
what it sits in (box / table cell / open with a free box), `figlayout.decide` chooses its lines,
size (floor 7.5 pt), anchor and any named overhang, and `figscripts` carries the source's
sub/superscripts and italics onto the value, one <text> per styled segment. Widths are LINEAR
(hint metrics off). A KEPT label is drawn run-exact with Icelandic number separators (`numloc`),
except under --control. The report gains `unformatted`, `overflow`, `localized` and
`containerErrors`.

Translations are read from translations.json, keyed by the block's English text
with '|' between lines.  Blocks are keyed by CONTENT, not position, so the file
survives re-extraction.
"""
import sys, json, math, collections
import _deps
from _deps import HERE, OUT
from pathlib import Path
import cairo
import figtext as FT
import figscripts as FS
import figcontainers as FC
import figlayout as FL
import numloc
from PIL import Image
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
    for r in block:
        text, gone = FT.run_draw_text(r)
        removed = removed or gone
        if text == '':
            continue
        bold, italic = FT.run_face(r, meta['fonts'])
        px, py = dev(r['x'], r['y'])
        col = cmyk(r['fill'])
        ITEMS.append(dict(path='run-exact', text=text, x=px / S, y=H_PT - py / S, rot=r['rot'],
                          size=r['size'], bold=bold, italic=italic, rgb=col, dx=0.0))
        ctx.select_font_face(FAMILY,
                             cairo.FONT_SLANT_ITALIC if italic else cairo.FONT_SLANT_NORMAL,
                             cairo.FONT_WEIGHT_BOLD if bold else cairo.FONT_WEIGHT_NORMAL)
        ctx.set_font_size(r['size'] * S)
        ctx.save(); ctx.translate(px, py); ctx.rotate(-math.radians(r['rot']))
        ctx.set_source_rgb(*col); ctx.move_to(0, 0); ctx.show_text(text)
        ctx.restore()
    return removed


def localise_block(block):
    """§C140 ⑨: the block's runs with Icelandic number separators in their TEXT - `26.98` ->
    `26,98`, `1,000` -> `1.000` - and every other field untouched. -> a list aligned 1:1 with
    `block` (an unchanged run is the same dict).

    The unit is the `FT.lines` LINE, not the run: a PDF may set a number one glyph per run
    (`CNX_Chem_03_02_moles-6296`), and no single run then holds a digit-flanked point. `numloc`
    exchanges `.` and `,` one for one, so each run keeps its length and its origin - and both
    characters advance 569/2048 em in every Liberation Sans face, so nothing moves.

    🔴 SOURCE TEXT ONLY, ONCE. `numloc.localize` is not idempotent (`1.008 -> 1,008 -> 1.008`), so it
    runs here on `runs.json` text and nowhere else. NOT inside `figtext.run_draw_text`: its second
    return value means "a (cid:N) token was removed" and would name every converted label
    `undecodable`. Never on `--control`, which stays a faithful redraw of the source."""
    out = []
    for line in FT.lines(block):
        for r, t in zip(line, numloc.localize_runs([r['text'] for r in line])):
            out.append(r if t == r['text'] else dict(r, text=t))
    assert len(out) == len(block), (len(out), len(block))
    return out


def setfont(run, size):
    ctx.select_font_face(FAMILY, cairo.FONT_SLANT_NORMAL,
                         cairo.FONT_WEIGHT_BOLD if run['font'] in BOLD
                         else cairo.FONT_WEIGHT_NORMAL)
    ctx.set_font_size(size * S)


def measure(text, run, size=None):
    setfont(run, size or run['size'])
    return ctx.text_extents(text).x_advance / S


def setfont_st(run, size, st):
    """`setfont` for one SEGMENT of a translated line: weight from the LINE's run (bold is per
    line - 8 corpus blocks change weight within a line, none bought), slant and size from the
    segment's SourceStyle (§C140 ②). A plain segment is exactly `setfont`, so a label with
    nothing to style measures and draws as it did before ②."""
    if st is None:
        return setfont(run, size)
    ctx.select_font_face(FAMILY,
                         cairo.FONT_SLANT_ITALIC if st.italic else cairo.FONT_SLANT_NORMAL,
                         cairo.FONT_WEIGHT_BOLD if run['font'] in BOLD
                         else cairo.FONT_WEIGHT_NORMAL)
    ctx.set_font_size(size * st.ratio * S)


# §C140 ③: ONE width function, in LINEAR metrics. A separate measuring context whose font options
# switch hint metrics OFF: its advances equal the PDF's own (148.52 vs 148.53 measured) and a
# browser's unkerned shaping of the published SVG, where the drawing context's 200-dpi hinted
# advances flipped two fit decisions and left a right-flush `Mólmassi` 0.93 pt short of its edge.
# The DRAWING context is untouched, so kept blocks' raster does not change.
_msurf = cairo.ImageSurface(cairo.FORMAT_A8, 8, 8)
mctx = cairo.Context(_msurf)
_mfo = cairo.FontOptions()
_mfo.set_hint_metrics(cairo.HINT_METRICS_OFF)
mctx.set_font_options(_mfo)
_ADV = {}


def lin_advance(text, run, size, st):
    """The LINEAR advance of ONE drawn segment at its own size and slant (weight from the line's
    run), memoised: the layout decision asks for the same pieces at many sizes."""
    bold = run['font'] in BOLD
    italic = st is not None and st.italic
    px = size * S if st is None else size * st.ratio * S
    k = (text, bold, italic, px)
    if k not in _ADV:
        mctx.select_font_face(FAMILY, cairo.FONT_SLANT_ITALIC if italic else cairo.FONT_SLANT_NORMAL,
                              cairo.FONT_WEIGHT_BOLD if bold else cairo.FONT_WEIGHT_NORMAL)
        mctx.set_font_size(px)
        _ADV[k] = mctx.text_extents(text).x_advance / S
    return _ADV[k]


def line_segments(chars):
    """[(char, style)] of one drawn line -> the (text, style) segments it is drawn as: maximal
    equal-style runs, and - only when a style is present - plain text cut at the space next to a
    styled segment (figscripts.split_at_word_edges). An empty line is one empty segment, as the
    pre-② composer drew one empty string."""
    segs = FS.segments(chars) or [('', None)]
    if any(st is not None for _, st in segs):
        segs = FS.split_at_word_edges(segs)
    return segs


def seg_width(chars, run, size):
    """THE width of one drawn line: the sum of its segments' linear advances at their own sizes and
    slant (spec §1 / §4 'one width function'). It feeds the partition, the shrink, the anchor, the
    displacement and the overflow check through figlayout.decide, and the pen advance when drawing."""
    return sum(lin_advance(t, run, size, st) for t, st in line_segments(chars))


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
# §C140 ②, additive and in draw order WITH multiplicity: every formula stretch a translated label
# could NOT carry over - `{key, token, stretch, reason, candidates}`, reason in absent / ambiguous /
# no-base / partial (transfer) and stacked / inverted-base / arc (the source side). A named miss is
# drawn as flat text, never refused and never blanked.
unformatted = []
# §C140 ⑨, additive, draw order WITH multiplicity: the kept blocks whose DRAWN text changed under
# `localise_block`. Empty on --control.
localized = []
# §C140 ③, additive, draw order: every translated label drawn overhanging, NAMED (R5) -
# `{key, block, word, needPt, budgetPt, sizePt, axis}` plus `linePt` on the width axis. axis 'width':
# `word` does not fit at the floor (needPt its width; word None for a line-count overhang, needPt the
# widest drawn line), linePt the widest DRAWN line; a box/cell width entry whose glyph box also misses
# height adds heightNeedPt / heightBudgetPt. axis 'height': a box/cell label whose glyph box (needPt)
# meets its height budget at no size (word None).
overflow = []
# §C140 ③, additive, draw order WITH multiplicity: `{key, block, why}` for every translated label
# whose container detection RAISED (see the comment at the append).
container_errors = []
# The stripped artwork's vector objects and its raster, read lazily by the first laid-out label.
PAGE = DARK = None

for BI, b in enumerate(blocks):
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
        # this line looking like a hit - `key in TR` is True - and would DELETE the label: a
        # whitespace-only value has no words to lay out (before §C140 ③, `wrap()` turned it into
        # '' and cairo drew nothing; `figlayout.decide` now refuses zero words outright), and the
        # arc path draws nothing for the same reason. Before this branch existed the erasure
        # was recorded nowhere, so the block vanished while `missing` stayed empty.
        # The predicate is `.strip()` because a value with any non-space character has at least one
        # `\S+` word (`figscripts.words`); it errs toward KEEPING English, the safe direction.
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
        # ⑨ AFTER the key and the identity decision, on the drawn text only.
        drawn = b if CONTROL else localise_block(b)
        if draw_run_exact(drawn):
            undecodable.append(key)
        if any(FT.run_draw_text(d)[0] != FT.run_draw_text(r)[0] for d, r in zip(drawn, b)):
            localized.append(key)
        run_exact.append(key)
        report.append(f"  RUNEXACT {len(b)} run(s)  {key!r}")
        continue

    # §C140 ②: which source runs are sub/superscripts or italic, as TOKENS built from runs.json
    # only - never from the value. Asked for every translated block BEFORE the arc decision, so an
    # arc block's `arc` miss (sized or italic glyphs it will not style) is named too; an arc is
    # never styled.
    tokens, src_misses = FS.source_tokens(b, meta['fonts'])
    unformatted.extend(dict(key=key, **m) for m in src_misses)

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
            ITEMS.append(dict(path='arc', text=ch, x=px / S, y=H_PT - py / S, rot=rot_deg,
                              size=sz, bold=b[0]['font'] in BOLD, italic=False, rgb=col, dx=-w / 2))
            ctx.save(); ctx.translate(px, py); ctx.rotate(-(th + side * math.pi / 2))
            ctx.set_source_rgb(*col); ctx.move_to(-w * S / 2, 0); ctx.show_text(ch)
            ctx.restore()
            a += side * (w / R)
        report.append(f"  ARC    R={R:5.1f}pt  {key!r}")
        continue

    rot = b[0]['rot']; rad = math.radians(rot)
    # §C140 ②: the label's BODY size - the size carrying the most letters among non-symbol runs -
    # not its first run's. A formula's scripts are drawn at size * ratio, so a block opening on an
    # 11 pt STIX symbol over a 9 pt body (47 corpus send:true blocks; 0 of 176 in the 34) would
    # otherwise draw the whole label, scripts included, from the symbol's size.
    sz0 = FS.body_size(b, meta['fonts'])

    # §C140 ②: carry the source's sub/superscripts and italics onto the value. `transfer` reads
    # the RAW value (possibly editor-edited) and never alters it; `words` keys every style by its
    # offset in that raw string (`re.finditer(r'\S+')` == `str.split()` on every codepoint), so
    # no whitespace collapse can misalign a style. A word is (text, [SourceStyle|None per char]).
    # ⚠️ ONE transfer per VALUE, never one per paragraph. A legacy LIST value (normalise_block_value
    # still accepts pre-split lines) is joined with ' ' first - a formula token holds no space, so
    # the join cannot create or break an occurrence. Per-paragraph transfer searched every token in
    # every paragraph and named a false `absent` in each paragraph that lacked it. A str value is
    # one paragraph, so for it the join is the value itself.
    # §C140 ③: the layout no longer honours a legacy list's paragraph breaks - figlayout chooses
    # the line count from the SOURCE (n_src). Exposure 0: every committed sidecar value is a str.
    raw = ' '.join(new)
    if tokens:
        fmt, misses = FS.transfer(tokens, raw)
        unformatted.extend(dict(key=key, **m) for m in misses)
    else:
        fmt = [None] * len(raw)
    words = FS.words(raw, fmt)

    # §C140 ③: WHAT the label is drawn inside - box / table cell / open with a free box - decided
    # per block, now, from the stripped artwork (figcontainers.container_for never raises), and HOW
    # it is laid out in it - lines, size, anchor, displacement, a named overhang - decided by the
    # pure figlayout.decide. This file only measures and draws. The page and its raster are read
    # ONCE per figure, and only when a label is actually laid out.
    if PAGE is None:
        PAGE = FC.load_page(OUT / 'artwork.pdf')
        with Image.open(OUT / 'artwork.png') as _im:
            DARK = _im.convert('L')
    container = FC.container_for(BI, blocks, PAGE, DARK, H_PT)
    # 🔴 A DETECTION ERROR IS NAMED HERE OR NOWHERE. container_for turns ANY exception into an
    # 'open' container whose `why` is 'error: <Type>', with the source width and no vertical room -
    # and a label that still fits that is laid out with no other trace, even when its block really
    # sat in a box or a table cell. So a figcontainers regression could turn every box and cell
    # into open, silently. Draw order, with multiplicity. (load_page above is deliberately NOT
    # guarded: a missing or corrupt artwork.pdf fails the whole compose loudly - exit 1, no report -
    # rather than laying every label of the figure out against containers nobody measured.)
    if container['why'].startswith('error:'):
        container_errors.append(dict(key=key, block=BI, why=container['why']))
    # Source cues from the PDF's OWN advances, never from a cairo measure.
    cues = dict(n_src=len(ls), sz0=sz0,
                starts=[min(FT.along(r) for r in l) for l in ls],
                ends=[max(FT.along(r) + r['adv'] for r in l) for l in ls],
                projs=[FT.proj(l[0]) for l in ls])

    def width(chars, size, j):
        """figlayout's ONE width function: output line j is drawn in the font and colour of
        source line min(j, last) - font AND colour are per LINE."""
        return seg_width(chars, ls[min(j, len(ls) - 1)][0], size)

    layout = FL.decide(words, width, container, cues)
    align, size, lead, top = layout['align'], layout['size'], layout['lead'], layout['top']
    for j, lc in enumerate(layout['lines']):
        fr = ls[min(j, len(ls) - 1)][0]
        p_ = top - j * lead
        # One ITEMS entry - one <text> - per SEGMENT: a script at size * ratio, its baseline
        # shifted size * frac along the text normal, the pen advancing by each segment's LINEAR
        # advance - the same advances the layout decision was made with.
        off = 0.0
        for k, (t, st) in enumerate(line_segments(lc)):
            aa = layout['x0'][j] + off
            pp = p_ if st is None else p_ + size * st.frac
            x = aa * math.cos(rad) - pp * math.sin(rad)
            y = aa * math.sin(rad) + pp * math.cos(rad)
            px, py = dev(x, y)
            setfont_st(fr, size, st)
            ITEMS.append(dict(path='layout', line=j, seg=k, text=t, x=px / S, y=H_PT - py / S,
                              rot=rot, size=size if st is None else size * st.ratio,
                              bold=fr['font'] in BOLD, italic=st is not None and st.italic,
                              rgb=cmyk(fr['fill']), dx=0.0))
            ctx.save(); ctx.translate(px, py); ctx.rotate(-rad)
            ctx.set_source_rgb(*cmyk(fr['fill'])); ctx.move_to(0, 0); ctx.show_text(t)
            ctx.restore()
            off += lin_advance(t, fr, size, st)
    ov = layout['overflow']
    if ov is not None:
        # The report CONTRACT, copied field by field (figure-compose.py passes it verbatim into
        # compose.json): `axis` always; `linePt` / `heightNeedPt` / `heightBudgetPt` only where figlayout set them.
        entry = dict(key=key, block=BI, word=ov['word'], needPt=ov['needPt'],
                     budgetPt=ov['budgetPt'], sizePt=ov['sizePt'], axis=ov['axis'])
        for extra in ('linePt', 'heightNeedPt', 'heightBudgetPt'):
            if extra in ov:
                entry[extra] = ov[extra]
        overflow.append(entry)
    report.append(f"  {align:6} {sz0}->{size:.2f}pt  {key!r}  [{container['cls']} {layout['step']}]")

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
    # §C140 ②. Additive: named formula stretches drawn as flat text (see `unformatted` above).
    'unformatted': unformatted,
    # §C140 ⑨. Additive: kept blocks drawn with Icelandic number separators.
    'localized': localized,
    # §C140 ③. Additive: translated labels drawn overhanging, named (width or height axis).
    'overflow': overflow,
    # §C140 ③. Additive: translated labels laid out with no container detection (it raised).
    'containerErrors': container_errors,
}, indent=1, ensure_ascii=False))

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
# Leading '\n' is load-bearing - see the note above the compose-report.json write.
if unformatted:
    print(f"\nNOTE (not a failure): {len(unformatted)} formula stretch(es) drawn UNFORMATTED:")
    for u in unformatted:
        print(f"     {u['key']!r}: {u['stretch']!r} of {u['token']!r} - {u['reason']}")
if overflow:
    print(f"\nNOTE (not a failure): {len(overflow)} translated label(s) drawn OVERHANGING:")
    for o in overflow:
        if o['axis'] == 'height':
            what = f"glyph box {o['needPt']:.2f} pt of {o['budgetPt']:.2f} pt height"
        else:
            what = (f"{'a line' if o['word'] is None else repr(o['word'])} needs {o['needPt']:.2f} pt "
                    f"of {o['budgetPt']:.2f} pt width"
                    + (f", widest line {o['linePt']:.2f} pt" if 'linePt' in o else '')
                    + (f"; glyph box {o['heightNeedPt']:.2f} pt of {o['heightBudgetPt']:.2f} pt height"
                       if 'heightNeedPt' in o else ''))
        print(f"     {o['key']!r} block {o['block']}: {what} at {o['sizePt']} pt")
# Leading '\n' is load-bearing - see the note above the compose-report.json write.
if container_errors:
    print(f"\nNOTE (not a failure): {len(container_errors)} translated label(s) laid out WITHOUT "
          f"container detection - it raised, and each was drawn as open:")
    for c in container_errors:
        print(f"     {c['key']!r} block {c['block']}: {c['why']}")
if localized:
    print(f"\nNOTE (not a failure): {len(localized)} kept block(s) drawn with Icelandic number "
          f"separators:")
    for k in localized:
        print(f"     {k!r}")
print(f"\nwrote out/{name}")
# Leading '\n' is load-bearing - see the note above the compose-report.json write.
print(f"\nwrote out/compose-report.json  "
      f"({len(translated)} translated, {len(missing)} english-kept)")
