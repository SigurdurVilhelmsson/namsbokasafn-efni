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
longer exercises the wrap / anchor / shrink path at all, and neither does a reply token-equal to
its English: that is IDENTITY and is drawn run-exact too. The layout path is reached by any
non-identity translation - see the §C140 ② ③ ⑨ paragraph below (test_compose_t23.py reaches it
with an edited identity label; no switch is needed).

§C140 ② ③ ⑨ (spec docs/superpowers/specs/2026-09-13-c140-t23-scripts-reflow-decimals-design.md):
a TRANSLATED straight label is laid out by two pure helpers and drawn here - `figcontainers` says
what it sits in (box / table cell / open with a free box), `figlayout.decide` chooses its lines,
size (floor 7.5 pt), anchor and any named overhang, and `figscripts` carries the source's
sub/superscripts and italics onto the value, one <text> per styled segment. Widths are LINEAR
(hint metrics off). A KEPT label is drawn run-exact with Icelandic number separators (`numloc`),
except under --control. The report gains `unformatted`, `overflow`, `localized` and
`containerErrors`.

§C140 ㊾ D5(a) (design docs/superpowers/specs/2026-10-03-c140-step2-part5-heldblockvalues-design.md):
`--held-values <file>` draws [USER]'s values for send:false labels - figure-text.config.json
`heldBlockValues`, which figure-compose.py reads and hands over as `<out>/held-values.json` (heldvalues.py
owns the format). A held block is planned whole by the pure `heldplan.plan_block`, per VISUAL source line:
an unchanged line is drawn run-exact as today, a changed one is laid out at its source size and drawn by
`draw_layout`, the translated path's own draw loop. A block the planner refuses is drawn run-exact in
English, exactly as today, and named in `heldErrors` - figure-compose.py then refuses the figure. A drawn
held key is reported in `held`, never in `missing`, `translated`, `identity` or `runExact`. The file is
read only without --control, and a missing, malformed or other-figure file raises before anything is
drawn (exit 1, no report). With no flag nothing is held. BY EYE: `figure-compose.py --out <dir>
--translations <file>`, which always passes the flag; a direct run of this file without it draws held
labels in English, and the report's `heldValuesPath: null` says so.

§C140 '6' M1 and R-20 (design docs/superpowers/specs/2026-10-05-c140-composer-formatting-class-design.md,
D-a): every translated straight label hands figlayout `cues['texts']`, the text of each VISUAL source line
(`FT.visual_ink`), so `figlayout.decide` can keep a source row boundary that a verbatim token marks (M1).
`--anchor-exclusions <file>` names block keys whose label M1 must leave alone - figure-text.config.json
`anchorExclusions`, which figure-compose.py reads and hands over as `<out>/anchor-exclusions.json`
(anchorexclusions.py owns the format), exactly as `--held-values` above. An excluded block is laid out with
no `texts` cue, which is M1 switched off, and every block carrying an excluded key - laid out or not - is
reported in `anchorExcluded` as `{key, block, changed}`, `changed` True when a second decide WITH the cue
would have drawn other lines or another size. The file is read only without --control, and a missing,
malformed or other-figure file raises before anything is drawn (exit 1, no report). With no flag nothing is
excluded.

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
import figsym
import heldplan
import heldvalues
import anchorexclusions
from PIL import Image
from blockkey import block_key, block_english
from figcolour import fill_rgb

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

# §C140 ㊾ D5(a): [USER]'s held values, {blockKey: raw value}, from the file figure-compose.py writes. The
# CONTROL test comes FIRST: --control is a faithful redraw of the source, so the path is not even resolved
# there (a nonexistent one is not an error). Outside --control every problem RAISES before anything is
# drawn - exit 1, no compose-report.json, which figure-compose.py refuses as "wrote no compose-report.json"
# (the `load_page` precedent; this file has no exit call). A file is never read as {} (heldvalues.read_file),
# and one written for another figure - a leftover in a reused directory - is never drawn: its `basename`
# must be meta.json's `source` stem, the rule publish-figure-svg.js's basenameFromMeta applies.
HELD, HELD_PATH, HELD_CONFIG = {}, None, None
if '--held-values' in sys.argv and not CONTROL:
    HELD_PATH = Path(sys.argv[sys.argv.index('--held-values') + 1]).resolve()
    _held = heldvalues.read_file(HELD_PATH)
    _stem = Path(meta['source']).stem if isinstance(meta.get('source'), str) else None
    if _held['basename'] != _stem:
        raise ValueError(f"--held-values {HELD_PATH} was written for {_held['basename']!r}, but this figure's "
                         f"meta.json source names {_stem!r} - another figure's values are never drawn")
    HELD, HELD_CONFIG = _held['values'], _held['configPath']

# §C140 '6' R-20: the block keys M1 must leave alone, {blockKey: reason}, from the file figure-compose.py
# writes. The same rules as --held-values directly above: not even resolved under --control, every problem
# raises before anything is drawn, and a file written for another figure is never used.
ANCHOR_EXCL = {}
if '--anchor-exclusions' in sys.argv and not CONTROL:
    _ae_path = Path(sys.argv[sys.argv.index('--anchor-exclusions') + 1]).resolve()
    _ae = anchorexclusions.read_file(_ae_path)
    _ae_stem = Path(meta['source']).stem if isinstance(meta.get('source'), str) else None
    if _ae['basename'] != _ae_stem:
        raise ValueError(f"--anchor-exclusions {_ae_path} was written for {_ae['basename']!r}, but this figure's "
                         f"meta.json source names {_ae_stem!r} - another figure's exclusions are never used")
    ANCHOR_EXCL = _ae['exclusions']

surf = cairo.ImageSurface.create_from_png(str(OUT / 'artwork.png'))
out = cairo.ImageSurface(cairo.FORMAT_RGB24, surf.get_width(), surf.get_height())
ctx = cairo.Context(out)
ctx.set_source_rgb(1, 1, 1); ctx.paint()
ctx.set_source_surface(surf, 0, 0); ctx.paint()

FAMILY = "Liberation Sans"   # the figure's own font; OFL, full Icelandic coverage

# Font RESOURCE names are per-file - Illustrator writes /TT0,/TT1 and Ghostscript
# (what an EPS becomes) writes /R9,/R11. Never key on them; read the BaseFont.
BOLD = {k for k, v in meta['fonts'].items() if 'bold' in v['base'].lower()}


def draw_run_exact(block, key):
    """Draw every run of a KEPT block at its own origin, size, rotation, fill and face.

    -> True when a pdfminer `(cid:N)` placeholder was removed from any run (the caller names
    the block in `undecodable`).

    §C140 ⑥a: a run whose BaseFont (subset prefix stripped) is exactly `STIXGeneral-Regular`
    and whose drawn text is entirely in the official STIX 1.1.0 cmap is drawn in FigSym instead
    of Liberation - `key` names it in STIX['drawn']. A run in that face but outside the cmap, or
    a run in another STIX face, is named in STIX['skipped'] instead and stays FigIS. A missing
    or wrong font file raises `figsym.FontUnavailable` out of `figsym.covers()` - uncaught: a
    figure with an eligible run simply fails to compose rather than silently drawing Liberation.

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
        family = None
        base = FS._base_name(r, meta['fonts'])
        if figsym.eligible_base(base):
            if figsym.covers(text):               # raises figsym.FontUnavailable when the font is missing/wrong
                family = figsym.FAMILY
                STIX['drawn'].add(key)
            else:
                STIX['skipped'].append(dict(key=key, reason='cmap'))
        elif base.startswith('STIX'):
            STIX['skipped'].append(dict(key=key, reason='other-face'))
        px, py = dev(r['x'], r['y'])
        col = cmyk(r['fill'])
        ITEMS.append(dict(path='run-exact', text=text, x=px / S, y=H_PT - py / S, rot=r['rot'],
                          size=r['size'], bold=bold, italic=italic, rgb=col, dx=0.0,
                          **(dict(family=family) if family else {})))
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
# switch hint metrics OFF: its advances equal the PDF's own (148.52 vs 148.53 measured), where the
# drawing context's 200-dpi hinted advances flipped two fit decisions and left a right-flush
# `Mólmassi` 0.93 pt short of its edge. They equal a BROWSER's only because svgout.write_svg sets
# text-rendering="geometricPrecision" on the text group (without it Chromium's default render was
# up to 8.97 pt off on the 34) AND - since §C140 ⑥b - because svgout.write_svg draws every LAYOUT item with
# font-kerning:none. This context applies no kerning; Chromium applies the embedded subset's GPOS kern
# pairs by default, which drew 27 of the 370 layout segments on the 34 up to 0.99 pt short. That gap does
# NOT only widen: Liberation's r’/f’ pairs (U+2019, not U+0027) are positive and would draw a segment LONGER than measured, into
# its neighbour. [USER] ruling (a), docs/decisions/2026-09-17-translated-figure-labels-drawn-unkerned.md:
# the drawing is made to match this measure, never the reverse - so a new width model (a face, a style
# bit) must stay unkerned here AND there. The DRAWING context is untouched, so kept blocks' raster does
# not change.
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
    """A run's `fill` -> (r, g, b), as pdftocairo draws that colour under the artwork.

    The ONE conversion is `figcolour.fill_rgb` ([USER] ruling (C)): DeviceCMYK through poppler's
    table (K=1 is #231f20, like the artwork's strokes), DeviceRGB and DeviceGray exact (clipped to [0, 1]). The name
    is kept from the naive (1-c)(1-k) map it replaced, so the call sites did not move."""
    return fill_rgb(f)


def dev(x, y):
    return x * S, (H_PT - y) * S


def draw_layout(layout, run_for_line, rot):
    """Draw a `figlayout.decide` Layout: one ITEMS entry - one <text> - per SEGMENT of each laid-out line.

    run_for_line(j) -> the run whose weight and fill output line j is drawn in. The translated path passes
    the first run of VISUAL source line min(j, last) (§C140 ㉑); the held path (§C140 ㊾ D5(a)) passes the
    first run of the one visual line it lays out. `rot` is the block's rotation in degrees.

    EXTRACTED VERBATIM from the translated path's draw loop (§C140 ㊾ D5(a)), so a translated label and a
    held one are drawn by ONE implementation: every item keeps path='layout', which svgout draws with
    font-kerning:none ([USER] ruling 2026-09-17), so it matches the linear measure it was laid out with."""
    rad = math.radians(rot)
    size, lead, top = layout['size'], layout['lead'], layout['top']
    for j, lc in enumerate(layout['lines']):
        fr = run_for_line(j)
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
# `runExact` is every kept block drawn wholly run-exact, identity included - never a HELD block,
# whose unchanged lines are drawn run-exact too. `degenerate_kept` only splits the stdout warning -
# `degenerate` itself keeps its meaning.
identity, run_exact, degenerate_kept = [], [], []
# §C140 ㊾ D5(a), additive. `held`: `{key, block, changed}` for every block drawn from [USER]'s held
# values - `changed` its re-laid VISUAL line indices - in draw order WITH multiplicity (figure-compose.py
# compares it against blocks.json's count as a multiset). A held key is in NO other list: not `missing`,
# `translated`, `identity` or `runExact`. `held_errors`: `{key, block, reason, ...detail}` for every held
# value NOT drawn - a heldplan.HeldRefusal (that block is then drawn run-exact in English, as today, and is
# ALSO in `missing`), `in-translations` (the --translations file has the key too; its translation is drawn)
# and `no-block` (block None: no block of this figure carries the key). Any entry refuses the figure.
held, held_errors = [], []
# §C140 '6' R-20, additive, draw order WITH multiplicity: `{key, block, changed}` for EVERY block whose key
# --anchor-exclusions names, whatever path draws it - `changed` is False for a block that is not laid out
# (kept, held, an arc) and, for a laid-out one, whether M1 would have drawn other lines or another size.
# figure-compose.py compares it against blocks.json's count as a multiset. A note, never a refusal.
anchor_excluded = []
# §C140 ②, additive and in draw order WITH multiplicity: every formula stretch a translated label
# could NOT carry over - `{key, token, stretch, reason, candidates}`, reason in absent / ambiguous /
# no-base / partial (transfer) and stacked / inverted-base / arc (the source side). A named miss is
# drawn as flat text, never refused and never blanked.
unformatted = []
# §C140 ⑨, additive, draw order WITH multiplicity: the kept blocks whose DRAWN text changed under
# `localise_block`. Empty on --control.
localized = []
# §C140 ⑥a, additive: kept STIX runs actually drawn in FigSym (block keys) and every STIX run
# skipped instead, named with a reason (translated / other-face / cmap). `drawn` is populated only
# inside `draw_run_exact` (kept blocks); the translated-path checks below add `skipped` entries for
# a genuinely translated block that carries an eligible-looking STIX run.
# ⚠️ THE GRANULARITY IS PER RUN, NOT PER BLOCK: a kept block holding one covered and one uncovered
# STIXGeneral-Regular run names the SAME key in `drawn` and in `skipped` (reason `cmap`), and a
# block with several other-face runs names its key once per run.
# ⚠️ `drawn` is a DEDUPED SET (written sorted), unlike every list above it, which keeps draw order
# WITH multiplicity - so its length counts blocks with a FigSym run, not runs or <text> items.
# ⚠️ `stix` is NOT one of figure-compose.py's COMPOSE_NOTES, so the driver's report never shows it;
# read it from compose-report.json.
# `other-face` is any BaseFont starting `STIX` that is not eligible (Italic, Bold, SizeOneSym,
# NonUnicode, ...); the eligible test runs first, so the prefix decides nothing that is drawn.
STIX = {'drawn': set(), 'skipped': []}
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


def ensure_page():
    """Read PAGE and DARK once per figure, on the first label that needs a container - a translated one
    or a held one. (load_page is deliberately NOT guarded: see the note at the translated path's
    container_for call.)"""
    global PAGE, DARK
    if PAGE is None:
        PAGE = FC.load_page(OUT / 'artwork.pdf')
        with Image.open(OUT / 'artwork.png') as _im:
            DARK = _im.convert('L')


_CMAPS = {}


def has_glyph(ch, bold, italic):
    """Is `ch` in the Liberation face (figis) it would be drawn in? figis is imported here, on the first
    held block, so a figure with none never loads it; a missing or wrong face raises
    figis.FontUnavailable, uncaught, exactly as svgout's embedding does."""
    k = (bool(bold), bool(italic))
    if k not in _CMAPS:
        import figis
        _CMAPS[k] = figis.load(k).getBestCmap()
    return ord(ch) in _CMAPS[k]


def draw_held(BI, b, key):
    """§C140 ㊾ D5(a): draw block `b` from HELD[key]. -> True when it was drawn (the caller moves on to the
    next block), False when heldplan REFUSED it - the refusal is in `held_errors` and the caller falls
    through to the kept branch, which draws the block run-exact in English and names it in `missing`.

    The whole block is planned before anything is drawn (heldplan.plan_block: all or nothing). An
    unchanged visual line is drawn by draw_run_exact on its localised runs - the same call, on the same
    runs, as a kept block - and feeds `undecodable` / `localized` as a kept block does; its STIX runs are
    counted by draw_run_exact as today. A changed line is drawn by draw_layout in the font and fill of its
    first run; a STIX run on it is drawn as Liberation text, so an eligible one is named in
    STIX['skipped'] with reason `held` and one in another STIX face `other-face` (per run, as below)."""
    box = []

    def container():
        if not box:
            ensure_page()
            box.append(FC.container_for(BI, blocks, PAGE, DARK, H_PT))
        return box[0]

    drawn = localise_block(b)
    try:
        plan = heldplan.plan_block(b, HELD[key], meta['fonts'], drawn,
                                   is_bold=lambda r: r['font'] in BOLD, container=container,
                                   width=lambda chars, size, run: seg_width(chars, run, size),
                                   has_glyph=has_glyph)
    except heldplan.HeldRefusal as e:
        held_errors.append(dict(key=key, block=BI, reason=e.reason, **e.detail))
        return False
    rot = b[0]['rot']
    off, undec, loc, laid = 0, False, False, []
    inks = FT.visual_ink(b)   # a changed line is drawn in the font and fill of its first INK run
    for li, entry in enumerate(plan.lines):
        if entry[0] == 'runs':
            part = entry[1]
            if draw_run_exact(part, key):
                undec = True
            if any(FT.run_draw_text(d)[0] != FT.run_draw_text(r)[0] for d, r in zip(part, b[off:off + len(part)])):
                loc = True
            off += len(part)
        else:
            _, layout, vl = entry
            draw_layout(layout, lambda j, r0=inks[li][0]: r0, rot)
            for r in vl:
                rbase = FS._base_name(r, meta['fonts'])
                if figsym.eligible_base(rbase):
                    STIX['skipped'].append(dict(key=key, reason='held'))
                elif rbase.startswith('STIX'):
                    STIX['skipped'].append(dict(key=key, reason='other-face'))
            laid.append(layout)
            off += len(vl)
    if undec:
        undecodable.append(key)
    if loc:
        localized.append(key)
    held.append(dict(key=key, block=BI, changed=list(plan.changed)))
    report.append(f"  HELD   {key!r} block {BI}: lines {list(plan.changed)}  "
                  + ', '.join(f"[{box[0]['cls']} {L['step']}] {L['align']} {L['size']:.2f}pt" for L in laid))
    return True

for BI, b in enumerate(blocks):
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
    excl_entry = None
    if key in ANCHOR_EXCL:
        excl_entry = dict(key=key, block=BI, changed=False)
        anchor_excluded.append(excl_entry)

    # KEPT := --control, or no translation, or an empty one, or an IDENTITY reply. Every kept
    # block is drawn run-exact (draw_run_exact); only a genuine translation is laid out.
    kept = False
    if CONTROL:
        kept = True
    else:
        # §C140 ㊾ D5(a): a HELD key is drawn from [USER]'s value - never over a translation. A refused one
        # falls through: it is not in TR, so it lands below in `missing` and is drawn run-exact, as today.
        if key in HELD and key not in TR:
            if draw_held(BI, b, key):
                continue
        elif key in HELD:
            held_errors.append(dict(key=key, block=BI, reason='in-translations'))
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
        if draw_run_exact(drawn, key):
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

    # §C140 ⑥a: a TRANSLATED block never draws in FigSym (only a kept run is drawn run-exact),
    # so an eligible run inside it is named, never drawn. `translated` fires once per block that
    # contains one; `other-face` names every run in another STIX face, wherever it is seen -
    # the same predicate `draw_run_exact` applies per run to a kept block.
    if any(figsym.eligible_base(FS._base_name(r, meta['fonts'])) for r in b):
        STIX['skipped'].append(dict(key=key, reason='translated'))
    for r in b:
        rbase = FS._base_name(r, meta['fonts'])
        if rbase.startswith('STIX') and not figsym.eligible_base(rbase):
            STIX['skipped'].append(dict(key=key, reason='other-face'))

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

    rot = b[0]['rot']
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
    ensure_page()
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
    # Source cues from the PDF's OWN advances, never from a cairo measure - per VISUAL source line
    # (§C140 ㉑): `figtext.visual_lines` merges the FT.lines a stacked charge or a same-size superscript
    # splits off, so `nitrites (NO2|–` is ONE source line here (n_src 1, its own baseline) while its
    # key, built by blockkey on FT.lines, still reads `nitrites (NO2|–`. Identical to FT.lines on
    # every block that has no such split.
    vls = FT.visual_ink(b)   # geometry from each visual line's ink runs (a folded blank line carries none)
    # `blank` is read ONLY by figlayout's P1v guard (§C140 '6' M4): a whitespace-only line is not a row. Its
    # `.strip()` is wider than FT.is_blank_line (U+0020 only) - an NBSP- or U+001F-only line survives M2's fold
    # and is still `blank` here, which only withholds P1v (the sz0 * LEAD pitch).
    cues = dict(n_src=len(vls), sz0=sz0,
                starts=[min(FT.along(r) for r in l) for l in vls],
                ends=[max(FT.along(r) + r['adv'] for r in l) for l in vls],
                projs=[FT.proj(l[0]) for l in vls],
                blank=[not ''.join(r['text'] for r in l).strip() for l in vls])

    def width(chars, size, j):
        """figlayout's ONE width function: output line j is drawn in the font and colour of the FIRST
        run of VISUAL source line min(j, last) - font AND colour are per LINE. After a §C140 ㉑ merge
        that run is the one that opens the source line, so a drawn line never takes a script run's
        font or colour; a script run is chosen only where the source line itself opens with one."""
        return seg_width(chars, vls[min(j, len(vls) - 1)][0], size)

    # M1: the text of each VISUAL source line, so figlayout can pin a cut where the source breaks at a verbatim token.
    texts = [''.join(r['text'] for r in l) for l in vls]
    if excl_entry is None:
        cues['texts'] = texts
    layout = FL.decide(words, width, container, cues)
    if excl_entry is not None:
        # R-20: laid out WITHOUT the cue (M1 off). `changed` costs one more pure decide, with it.
        _m1 = FL.decide(words, width, container, dict(cues, texts=texts))
        excl_entry['changed'] = (_m1['size'] != layout['size'] or
                                 [''.join(c for c, _ in l) for l in _m1['lines']]
                                 != [''.join(c for c, _ in l) for l in layout['lines']])
    align, size = layout['align'], layout['size']
    # Output line j in the font and colour of the first run of VISUAL source line min(j, last) - the
    # same index `width` measured it with (§C140 ㉑; test_compose_visual_lines V7 pins it).
    draw_layout(layout, lambda j: vls[min(j, len(vls) - 1)][0], rot)
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

# §C140 ㊾ D5(a): a held value whose key no block carries - renamed or re-extracted - would never be drawn.
# figure-compose.py's pre-flight refuses this before spawning; a hand-run reaches it here.
for k in HELD:
    if k not in keys:
        held_errors.append(dict(key=k, block=None, reason='no-block'))

name = 'control.png' if CONTROL else 'translated.png'
out.write_to_png(str(OUT / name))
if SVG:
    from svgout import write_svg
    from figweight import should_rasterise
    svg_name = ('control' if CONTROL else 'translated') + '.svg'
    # §C168 — the heavy tail is published from the PNG arm written just above,
    # with the translated text still drawn as live <text> on top.
    # ⚠️ `artwork.png`, NOT `translated.png`: the artwork is the TEXT-FREE render
    # (strip-text.py removed the English before pdftocairo), so the labels stay
    # live and selectable. Using translated.png would bake them into pixels and
    # draw them twice.
    _art_text = (OUT / 'artwork.svg').read_text(encoding='utf-8')
    _raster, _metrics, _why = should_rasterise(_art_text)
    n = write_svg(OUT / 'artwork.svg', OUT / svg_name, ITEMS, H_PT,
                  raster_png=(OUT / 'artwork.png') if _raster else None)
    print(f"wrote out/{svg_name}  ({n} bytes)  "
          f"[{'RASTER' if _raster else 'vector'}: {_why}]")

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
    # §C140 ㊾ D5(a). Additive (see `held` / `held_errors` above). Both paths are null when no
    # --held-values file was read: no flag, or --control.
    'held': held,
    'heldErrors': held_errors,
    'heldValuesPath': None if HELD_PATH is None else str(HELD_PATH),
    'heldConfigPath': HELD_CONFIG,
    # §C140 '6' R-20. Additive (see `anchor_excluded` above): [] with no --anchor-exclusions file.
    'anchorExcluded': anchor_excluded,
    # §C140 ⑥a. Additive: kept STIX runs drawn in FigSym (block keys) / skipped, with a reason.
    'stix': {'drawn': sorted(STIX['drawn']), 'skipped': STIX['skipped']},
}, indent=1, ensure_ascii=False))

print(f"{len(blocks)} blocks")
print('\n'.join(report))
if missing:
    print(f"\n!! {len(missing)} block(s) with no translation - ENGLISH KEPT:")
    for k in missing:
        print(f"     {k!r}")
# §C140 ㊾ D5(a). Leading '\n' is load-bearing - see the note above the compose-report.json write. The
# refusal header must never contain the consumers' trigger phrase (with no translation), or their parse
# would read these entries as kept keys.
if held:
    print(f"\nNOTE (not a failure): {len(held)} label(s) drawn from heldBlockValues ([USER]'s values):")
    for h in held:
        print(f"     {h['key']!r} block {h['block']}: lines {h['changed']}")
# §C140 '6' R-20. Leading '\n' is load-bearing - see the note above the compose-report.json write.
if anchor_excluded:
    print(f"\nNOTE (not a failure): {len(anchor_excluded)} label(s) laid out WITHOUT M1's source-anchored "
          f"cuts (anchorExclusions):")
    for e in anchor_excluded:
        print(f"     {e['key']!r} block {e['block']}: "
              + ('M1 would have cut it differently' if e['changed'] else 'M1 would have changed nothing'))
if held_errors:
    print(f"\n!! {len(held_errors)} heldBlockValues entr(ies) NOT drawn - figure-compose.py refuses this figure:")
    for e in held_errors:
        rest = {k: v for k, v in e.items() if k not in ('key', 'block', 'reason')}
        print(f"     {e['key']!r} block {e['block']}: {e['reason']}" + (f" {rest}" if rest else ''))
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
      f"({len(translated)} translated, {len(missing)} english-kept"
      + (f", {len(held)} held" if held else '') + ")")
