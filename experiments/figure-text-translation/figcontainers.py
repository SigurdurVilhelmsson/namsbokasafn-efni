"""figcontainers - per-block container detection for TRANSLATED figure labels (§C140 ③).

Answers, for one text block of one figure, "what is this label drawn inside?" so that
figlayout.decide() can choose a wrap budget, an anchor and a size:

  box   a single closed path with a visible stroke encloses the label (a schematic box).
        Every line is centred in it (ruling R2).
  cell  a table cell: the label is bounded on all four sides by rule segments that do not form
        one closed path, or it sits on a fill-only rect (a label patch). The source alignment is
        kept (ruling R3).
  open  anything else. The label gets a FREE BOX: clearance from its source frame, in the
        block's own rotation, to dark artwork, another block's source line box, or the page
        edge.

Detection is per block, at compose time, from the text-stripped artwork (artwork.pdf through
pdfplumber for the vector shapes, artwork.png through Pillow for the dark pixels). It is never
precomputed and never keyed on a block index: the prototype's precomputed census crashed a whole
figure with a KeyError the moment an identity label was edited into a translation.

container_for() NEVER raises. A block that cannot be classified is 'open', and an exception
anywhere becomes an 'open' container whose `why` is 'error: <ExceptionType>' - and that `why` is
the ONLY record of the failure. Its free box is the source frame's own along extent with zero
vertical room, so figlayout holds the translation to the source width less 2 PAD, shrinks toward
the floor if it must, and never gains a line. That names nothing unless the label still does
not fit at the floor (open step (v)): a label that fits is drawn with no trace of the error,
even when its block really sat in a box or a table cell. Reporting a container whose `why`
starts with 'error: ' is the CALLER's job (compose.py); this module only guarantees the prefix.

SOURCE GEOMETRY COMES FROM THE PDF'S OWN ADVANCES (run['adv']), NEVER FROM A CAIRO MEASURE.
  frame of a block (or of one line)  along  [min FT.along(r), max FT.along(r) + r['adv']]
                                     normal [min FT.proj(r) - DESC*size, max FT.proj(r) + ASC*size]
  - per RUN, so a subscript run's glyph box pulls the lower edge down. (The raster census
    used the line's first-run projection minus DESC * the line's largest size instead; on the
    34 bought figures the two differ on 26 blocks, by 1.58-2.58 pt on n0 only.)

Coordinates: pdfplumber's x0/y0/x1/y1, y UP - the reader runs.json itself comes from
(readlayer.py), so runs and shapes share one space; the page-edge test assumes that space starts
at (0, 0), which load_page records as 'bbox'. pdfplumber's `pts` and `path` points are y DOWN;
they are used ONLY to decide whether a path is closed (first == last is frame-invariant), never
for geometry.

The page dict classify() expects (load_page builds it; tests plant it by hand):
  {'width': W, 'height': H, 'bbox': (x0, y0, x1, y1),
   'rects': [obj], 'curves': [obj], 'lines': [obj]}
  obj = {'object_type': 'rect'|'curve'|'line', 'x0', 'y0', 'x1', 'y1',
         'stroke': bool, 'fill': bool, 'linewidth': float,
         'path': [op letter, ...]  (optional), 'pts': [(x, y), ...] (optional),
         'oid': int (optional; the owner identity for "four rules from ONE path")}

Constants are module globals read at CALL time (never bound as def-time defaults), so a test can
change one and see the consequence.
"""
import math

import figtext as FT

# --- source glyph box ------------------------------------------------------------------------
ASC, DESC = 0.73, 0.21
S = 200 / 72.0            # artwork.png is rendered at 200 dpi

# --- container detection ---------------------------------------------------------------------
TOL = 0.5                 # frame enclosure slack (pt)
SPAN = 1.0                # a cell rule must span the cell to within this (pt) - see classify()
AREA_MAX = 0.25           # a candidate covering >= this fraction of the page is not a container
EDGE = 0.25               # a candidate side within this of the page edge is not a container
MIN_RULE = 1.0            # every container side is pulled in by max(linewidth, MIN_RULE)/2
RULE_THIN = 1.0           # a segment / rect thinner than this (pt) is a rule
ROT_SNAP = 0.5            # box/cell only when rot is within this of a multiple of 90 degrees

# --- alignment -------------------------------------------------------------------------------
SIBLING_TOL = 0.2         # a sibling edge coincides within this (pt) - MEASURED, see open_alignment()
SIBLING_ROT = 3.0         # siblings must share the rotation within this (degrees)
FLUSH_TIGHT = 4.75        # single-line open label flush against an obstacle: tight side <= this
FLUSH_RATIO = 20.0        # ... and far / tight >= this
CELL_RATIO = 20.0         # single-line cell: far / tight source margin >= this -> flush to tight side
AMBIG = 0.5               # multi-line: two smallest spreads differ by < this -> centre

# --- free-box march --------------------------------------------------------------------------
MARCH_STEP = 0.25         # pt
MARCH_LIMIT = 600.0       # pt
DARK_LEVEL = 128          # dark := L < 128
SIDE_SAMPLES = 7          # rays per left/right side, across the normal extent
END_SAMPLES = 11          # rays per up/down side, across the along extent
EPS = 1e-9


# =============================================================================================
# geometry
# =============================================================================================

def source_frame(block):
    """(a0, a1, n0, n1) of a block - or of one line - in its own (along, normal) frame, from the
    PDF's advances. Per run: a script run's glyph box counts where it is drawn."""
    a0 = min(FT.along(r) for r in block)
    a1 = max(FT.along(r) + r['adv'] for r in block)
    n0 = min(FT.proj(r) - DESC * r['size'] for r in block)
    n1 = max(FT.proj(r) + ASC * r['size'] for r in block)
    return a0, a1, n0, n1


def _to_page(a, n, rot):
    t = math.radians(rot)
    return a * math.cos(t) - n * math.sin(t), a * math.sin(t) + n * math.cos(t)


def _to_frame(x, y, rot):
    t = math.radians(rot)
    return x * math.cos(t) + y * math.sin(t), -x * math.sin(t) + y * math.cos(t)


def page_bbox(block):
    """The source frame's axis-aligned page bbox (x0, y0, x1, y1), PDF y-up."""
    a0, a1, n0, n1 = source_frame(block)
    rot = block[0]['rot']
    pts = [_to_page(a, n, rot) for a in (a0, a1) for n in (n0, n1)]
    return (min(p[0] for p in pts), min(p[1] for p in pts),
            max(p[0] for p in pts), max(p[1] for p in pts))


def _axis_aligned(rot):
    """rot within ROT_SNAP of a multiple of 90 degrees."""
    return abs(((rot + 45.0) % 90.0) - 45.0) <= ROT_SNAP


def _inner_to_frame(inner, rot):
    """Map a page-space inner rect into the block's (along, normal) frame -> (L, R, D, U).

    Of the four corners' projections the 2nd and 3rd sorted values are taken, not min/max:
    at an exact multiple of 90 degrees the corners pair up and this is exact; within the
    ROT_SNAP tolerance it is the conservative (inscribed) bound, so a label laid out in it
    cannot cross the slightly-rotated side."""
    x0, y0, x1, y1 = inner
    cs = [_to_frame(x, y, rot) for x in (x0, x1) for y in (y0, y1)]
    As = sorted(c[0] for c in cs)
    Ns = sorted(c[1] for c in cs)
    return As[1], As[2], Ns[1], Ns[2]


def line_frames(block):
    """source_frame of each FT.lines line of the block."""
    return [source_frame(l) for l in FT.lines(block)]


# =============================================================================================
# page loading
# =============================================================================================

def _copy_obj(o, oid):
    path = o.get('path') or []
    return {
        'oid': oid,
        'object_type': o.get('object_type'),
        'x0': float(o['x0']), 'y0': float(o['y0']), 'x1': float(o['x1']), 'y1': float(o['y1']),
        'stroke': bool(o.get('stroke')),
        'fill': bool(o.get('fill')),
        'linewidth': float(o.get('linewidth') or 0.0),
        'path': [seg[0] if isinstance(seg, (tuple, list)) else seg for seg in path],
        'pts': [(float(p[0]), float(p[1])) for p in (o.get('pts') or [])],
    }


def load_page(pdf_path):
    """Open the stripped artwork PDF ONCE and copy page 1's vector objects into plain dicts
    (see the module docstring for the shape). pdfplumber is imported here so the rest of the
    module - and its unit tests - never need it."""
    import pdfplumber
    oid = 0
    out = {}
    with pdfplumber.open(str(pdf_path)) as pdf:
        p = pdf.pages[0]
        out['width'] = float(p.width)
        out['height'] = float(p.height)
        out['bbox'] = tuple(float(v) for v in p.bbox)
        for kind in ('rects', 'curves', 'lines'):
            objs = []
            for o in getattr(p, kind):
                objs.append(_copy_obj(o, oid))
                oid += 1
            out[kind] = objs
    return out


# =============================================================================================
# classification
# =============================================================================================

def _closed(o):
    if o.get('object_type') == 'rect':
        return True
    path = o.get('path') or []
    if path:
        last = path[-1]
        op = last[0] if isinstance(last, (tuple, list)) else last
        if op == 'h':
            return True
    pts = o.get('pts') or []
    return (len(pts) > 2 and abs(pts[0][0] - pts[-1][0]) < 0.01
            and abs(pts[0][1] - pts[-1][1]) < 0.01)


def _area(bb):
    return (bb[2] - bb[0]) * (bb[3] - bb[1])


def _at_edge(bb, W, H):
    return bb[0] <= EDGE or bb[1] <= EDGE or bb[2] >= W - EDGE or bb[3] >= H - EDGE


def _encloses(bb, fr):
    return (bb[0] <= fr[0] + TOL and bb[2] >= fr[2] - TOL
            and bb[1] <= fr[1] + TOL and bb[3] >= fr[3] - TOL)


def classify(page, bbox):
    """(cls, inner, why) for a label whose source frame has page bbox `bbox`.

    cls   'box' | 'cell' | 'open'
    inner (x0, y0, x1, y1) in page coordinates AFTER the inset, or None for 'open'.

    Candidates, the smallest-area one wins (a box beats a cell of equal area):
      box        a rect or curve that is STROKED and CLOSED and encloses the frame (+TOL).
                 Inset by max(linewidth, MIN_RULE)/2 on every side: the stroke straddles the
                 path, and a hairline is still a visible edge.
      fill-rect  a rect that is filled, NOT stroked, and encloses the frame - a label patch or
                 a shaded table cell. Inset by MIN_RULE/2: it has no stroke, and on the bought
                 figures its raw bbox sat 0.34-0.72 pt outside the edge of the visible cell.
      rules      the nearest rule segment on each of the four sides - page lines, thin rects
                 (centre line, half-thickness = max(thickness, MIN_RULE)/2) and the four
                 sides of every stroked closed path - where the four do NOT all come from ONE
                 path (that is a box). Inset by each side's own half-thickness.
    Every candidate is refused when it covers >= AREA_MAX of the page (the page frame or a
    whole-table background) or when a side lies within EDGE of the page edge (the page's own
    background rect, not a container).

    WHY THE RULES BRANCH REQUIRES EACH RULE TO SPAN THE CELL (to within SPAN): four segments
    that merely bracket a label are not a cell. Without the span test, 11 open labels on the 34
    bought figures became cells: 9 arrow labels BETWEEN boxes on the flow maps ('Molar mass',
    'Molarity', 'Stoichiometric factor', ...), bracketed left and right by the neighbouring
    boxes' edges and above and below by arrow lines that do not enclose them, and 2 exocytosis
    labels bracketed by the bbox sides of illustration paths. A table cell's rules run the full
    length of the cell's sides; an arrow line stops short of the box it points at.
    """
    W, H = float(page['width']), float(page['height'])
    parea = W * H
    fr = bbox
    cands = []
    refused = set()
    objs = list(page['rects']) + list(page['curves'])

    for o in objs:
        bb = (o['x0'], o['y0'], o['x1'], o['y1'])
        if not _encloses(bb, fr):
            continue
        stroked_closed = bool(o.get('stroke')) and _closed(o)
        fill_rect = bool(o.get('fill')) and not o.get('stroke') and o.get('object_type') == 'rect'
        if not (stroked_closed or fill_rect):
            continue
        if _area(bb) >= AREA_MAX * parea:
            refused.add('area')
            continue
        if _at_edge(bb, W, H):
            refused.add('page-edge')
            continue
        if stroked_closed:
            h = max(o.get('linewidth') or 0.0, MIN_RULE) / 2
            cands.append(('box', _area(bb), (bb[0] + h, bb[1] + h, bb[2] - h, bb[3] - h), 'stroked-closed'))
        else:
            h = MIN_RULE / 2
            cands.append(('cell', _area(bb), (bb[0] + h, bb[1] + h, bb[2] - h, bb[3] - h), 'fill-rect'))

    # rule segments: (x0, y0, x1, y1, owner, half-thickness)
    segs = []
    for o in page['lines']:
        owner = o.get('oid', id(o))
        segs.append((min(o['x0'], o['x1']), min(o['y0'], o['y1']),
                     max(o['x0'], o['x1']), max(o['y0'], o['y1']),
                     owner, max(o.get('linewidth') or 0.0, MIN_RULE) / 2))
    for o in objs:
        owner = o.get('oid', id(o))
        x0, y0, x1, y1 = o['x0'], o['y0'], o['x1'], o['y1']
        if o.get('object_type') == 'rect' and ((x1 - x0) < RULE_THIN or (y1 - y0) < RULE_THIN):
            h = max(min(x1 - x0, y1 - y0), MIN_RULE) / 2
            if x1 - x0 < RULE_THIN:
                xm = (x0 + x1) / 2
                segs.append((xm, y0, xm, y1, owner, h))
            else:
                ym = (y0 + y1) / 2
                segs.append((x0, ym, x1, ym, owner, h))
        elif o.get('stroke') and _closed(o):
            h = max(o.get('linewidth') or 0.0, MIN_RULE) / 2
            segs += [(x0, y0, x0, y1, owner, h), (x1, y0, x1, y1, owner, h),
                     (x0, y0, x1, y0, owner, h), (x0, y1, x1, y1, owner, h)]

    cx, cy = (fr[0] + fr[2]) / 2, (fr[1] + fr[3]) / 2
    V = [s for s in segs if s[2] - s[0] < RULE_THIN and s[1] <= cy <= s[3]]
    Hz = [s for s in segs if s[3] - s[1] < RULE_THIN and s[0] <= cx <= s[2]]
    Ls = max((s for s in V if s[2] <= fr[0] + TOL), key=lambda s: s[0], default=None)
    Rs = min((s for s in V if s[0] >= fr[2] - TOL), key=lambda s: s[0], default=None)
    Ds = max((s for s in Hz if s[3] <= fr[1] + TOL), key=lambda s: s[1], default=None)
    Us = min((s for s in Hz if s[1] >= fr[3] - TOL), key=lambda s: s[1], default=None)
    if None not in (Ls, Rs, Ds, Us):
        bb = ((Ls[0] + Ls[2]) / 2, (Ds[1] + Ds[3]) / 2, (Rs[0] + Rs[2]) / 2, (Us[1] + Us[3]) / 2)
        spans = (all(s[1] <= bb[1] + SPAN and s[3] >= bb[3] - SPAN for s in (Ls, Rs))
                 and all(s[0] <= bb[0] + SPAN and s[2] >= bb[2] - SPAN for s in (Ds, Us)))
        one_path = len({Ls[4], Rs[4], Ds[4], Us[4]}) == 1
        if not spans:
            refused.add('rules-not-spanning')
        elif one_path:
            pass          # the four sides of one closed path: the box branch owns it
        elif _area(bb) >= AREA_MAX * parea:
            refused.add('rules-area')
        elif _at_edge(bb, W, H):
            refused.add('rules-page-edge')
        else:
            cands.append(('cell', _area(bb),
                          (bb[0] + Ls[5], bb[1] + Ds[5], bb[2] - Rs[5], bb[3] - Us[5]), 'rules'))

    if not cands:
        why = 'no-container' + (' (refused: ' + ', '.join(sorted(refused)) + ')' if refused else '')
        return 'open', None, why
    cls, _, inner, why = min(cands, key=lambda c: (c[1], 0 if c[0] == 'box' else 1))
    return cls, inner, why


# =============================================================================================
# alignment
# =============================================================================================

def multi_alignment(frames):
    """Alignment of a multi-line source label from its line frames (adv-based).

    Spreads of the line starts / centres / ends; the smallest wins - FT.alignment's verdict
    with adv widths - unless the two smallest spreads differ by < AMBIG, which is no evidence
    either way: centre."""
    starts = [f[0] for f in frames]
    ends = [f[1] for f in frames]
    cents = [(s + e) / 2 for s, e in zip(starts, ends)]
    spread = lambda v: max(v) - min(v)
    sp = {'left': spread(starts), 'center': spread(cents), 'right': spread(ends)}
    order = sorted(sp, key=sp.get)            # stable: left, center, right on ties
    margin = sp[order[1]] - sp[order[0]]
    if margin < AMBIG:
        return 'center', f'multi-ambiguous(margin {margin:.2f})->center'
    return order[0], f'multi(margin {margin:.2f})->{order[0]}'


def _ratio(tight, far):
    return far / tight if tight > 0 else float('inf')


def cell_alignment(block, left_margin, right_margin):
    """R3: a table cell keeps the source alignment.
    multi-line  -> multi_alignment.
    single-line -> the source label's margins INSIDE THE CELL: far/tight >= CELL_RATIO is flush
                   to the tight side (a right-flush 'Molecular mass' against its number), else
                   centre. The sibling cue is NOT used for cells: glycinemass b13 has a left
                   sibling coincidence while its source is visibly right-flush."""
    frames = line_frames(block)
    if len(frames) >= 2:
        return multi_alignment(frames)
    tight, far = min(left_margin, right_margin), max(left_margin, right_margin)
    ratio = _ratio(tight, far)
    if ratio >= CELL_RATIO:
        side = 'left' if left_margin <= right_margin else 'right'
        return side, f'cell-single-margins(ratio {ratio:.1f})->{side}'
    return 'center', f'cell-single-margins(ratio {ratio:.2f})->center'


def sibling_cues(index, blocks):
    """(left, center, right): does this single-line label's left edge / centre / right edge
    coincide within SIBLING_TOL with a line edge of ANOTHER block of the same rotation?"""
    block = blocks[index]
    rot = block[0]['rot']
    m0, m1 = source_frame(block)[:2]
    mc = (m0 + m1) / 2
    cue = [False, False, False]
    for j, other in enumerate(blocks):
        if j == index or abs(other[0]['rot'] - rot) > SIBLING_ROT:
            continue
        for a0, a1, _, _ in line_frames(other):
            if abs(a0 - m0) <= SIBLING_TOL:
                cue[0] = True
            if abs((a0 + a1) / 2 - mc) <= SIBLING_TOL:
                cue[1] = True
            if abs(a1 - m1) <= SIBLING_TOL:
                cue[2] = True
    return tuple(cue)


def open_alignment(index, blocks, left_clear, right_clear):
    """Alignment of an OPEN label.
    multi-line  -> multi_alignment.
    single-line -> (1) FLUSH against an obstacle: tight side <= FLUSH_TIGHT and far/tight >=
                   FLUSH_RATIO stays flush to that side and grows away from it;
                   (2) a SIBLING-EDGE cue: exactly the left edge, or exactly the right edge,
                   coincides with another block's;
                   (3) centre.

    SIBLING_TOL IS MEASURED, NOT CHOSEN. The census's 0.5 re-aligned rxn2 'Reactant'/
    'Coefficient' (right edges 0.498 pt apart - coincidental) to the right, which moved the
    translation 'Stuðull' 7.6 pt off its brace in a figure [USER] had approved; ethene b0/b17
    (left edges 0.027 pt apart) are a real column and must cue. 0.2 separates the two."""
    frames = line_frames(blocks[index])
    if len(frames) >= 2:
        return multi_alignment(frames)
    tight, far = min(left_clear, right_clear), max(left_clear, right_clear)
    ratio = _ratio(tight, far)
    if tight <= FLUSH_TIGHT and ratio >= FLUSH_RATIO:
        side = 'left' if left_clear <= right_clear else 'right'
        return side, f'single-flush(tight {tight:.2f}, ratio {ratio:.1f})->{side}'
    cue = sibling_cues(index, blocks)
    if cue == (True, False, False):
        return 'left', 'single-cue-left-only->left'
    if cue == (False, False, True):
        return 'right', 'single-cue-right-only->right'
    return 'center', 'single-cue(L%dC%dR%d)->center' % tuple(int(c) for c in cue)


# =============================================================================================
# free box (open labels)
# =============================================================================================

def _obstacle(frame, rot):
    t = math.radians(rot)
    return (frame[0], frame[1], frame[2], frame[3], math.cos(t), math.sin(t))


def _inside(x, y, ob):
    a0, a1, n0, n1, c, s = ob
    a = x * c + y * s
    n = -x * s + y * c
    return a0 <= a <= a1 and n0 <= n <= n1


def _ray_meets(ob, x0, y0, dx, dy, limit):
    """Conservative pre-filter: can the ray (x0,y0)+d*(dx,dy), 0<=d<=limit, enter the obstacle?
    Slab test in the obstacle's frame, widened by a hair so it never drops an obstacle that the
    exact per-step _inside() test would hit."""
    a0, a1, n0, n1, c, s = ob
    pa, pn = x0 * c + y0 * s, -x0 * s + y0 * c
    va, vn = dx * c + dy * s, -dx * s + dy * c
    lo, hi = 0.0, limit
    for p, v, m0, m1 in ((pa, va, a0 - 1e-6, a1 + 1e-6), (pn, vn, n0 - 1e-6, n1 + 1e-6)):
        if abs(v) < 1e-12:
            if p < m0 or p > m1:
                return False
        else:
            t0, t1 = (m0 - p) / v, (m1 - p) / v
            if t0 > t1:
                t0, t1 = t1, t0
            lo, hi = max(lo, t0), min(hi, t1)
            if lo > hi:
                return False
    return True


def _march(px, wpx, hpx, page_h, obstacles, a, n, rot, da, dn):
    """Distance (pt, in MARCH_STEP steps) from (a, n) along (da, dn) in the block's frame to the
    first dark pixel or obstacle ('hit'), or to the last sample still on the page ('page')."""
    t = math.radians(rot)
    c, s = math.cos(t), math.sin(t)
    x0, y0 = a * c - n * s, a * s + n * c
    dx, dy = da * c - dn * s, da * s + dn * c
    near = [ob for ob in obstacles if _ray_meets(ob, x0, y0, dx, dy, MARCH_LIMIT)]
    k = 0
    while k * MARCH_STEP < MARCH_LIMIT:
        d = k * MARCH_STEP
        x, y = x0 + dx * d, y0 + dy * d
        ix, iy = math.floor(x * S), math.floor((page_h - y) * S)
        if not (0 <= ix < wpx and 0 <= iy < hpx):
            return max(d - MARCH_STEP, 0.0), 'page'
        if px[ix, iy] < DARK_LEVEL or any(_inside(x, y, ob) for ob in near):
            return d, 'hit'
        k += 1
    return k * MARCH_STEP, 'page'


def _samples(lo, hi, k):
    if hi - lo < 1e-6:
        return [lo]
    return [lo + 0.15 * (hi - lo) + i * (0.7 * (hi - lo)) / (k - 1) for i in range(k)]


def free_box(index, blocks, dark, page_h):
    """Free box of an open label, in its own rotation. Rays leave the source frame's four sides
    (SIDE_SAMPLES across the normal extent for left/right, END_SAMPLES across the along extent
    for up/down, each spread over the middle 70 %) and stop at the first dark pixel of `dark`
    (a Pillow 'L' image of artwork.png, L < DARK_LEVEL), the first point inside ANOTHER block's
    source line frame, or the page edge. Each side's clearance is the minimum over its rays.

    Returns FL, FR (along coordinates of the free box's left/right edges), room_up, room_down,
    free_left_clear, free_right_clear, and the per-side stop reason ('hit' if any ray hit)."""
    px = dark.load()
    wpx, hpx = dark.size
    block = blocks[index]
    rot = block[0]['rot']
    a0, a1, n0, n1 = source_frame(block)
    obstacles = [_obstacle(f, other[0]['rot'])
                 for j, other in enumerate(blocks) if j != index
                 for f in line_frames(other)]

    def side(starts):
        res = [_march(px, wpx, hpx, page_h, obstacles, a, n, rot, da, dn) for a, n, da, dn in starts]
        return min(r[0] for r in res), ('hit' if any(r[1] == 'hit' for r in res) else 'page')

    L, Lby = side([(a0, n, -1.0, 0.0) for n in _samples(n0, n1, SIDE_SAMPLES)])
    R, Rby = side([(a1, n, 1.0, 0.0) for n in _samples(n0, n1, SIDE_SAMPLES)])
    U, Uby = side([(a, n1, 0.0, 1.0) for a in _samples(a0, a1, END_SAMPLES)])
    D, Dby = side([(a, n0, 0.0, -1.0) for a in _samples(a0, a1, END_SAMPLES)])
    return {'FL': a0 - L, 'FR': a1 + R, 'room_up': U, 'room_down': D,
            'free_left_clear': L, 'free_right_clear': R,
            'by': {'left': Lby, 'right': Rby, 'up': Uby, 'down': Dby}}


# =============================================================================================
# the per-block entry point
# =============================================================================================

def _container_for(index, blocks, page, dark, page_h):
    block = blocks[index]
    rot = block[0]['rot']
    a0, a1, n0, n1 = source_frame(block)
    if _axis_aligned(rot):
        cls, inner, why = classify(page, page_bbox(block))
    else:
        cls, inner, why = 'open', None, 'rotated'
    if cls in ('box', 'cell'):
        L, R, D, U = _inner_to_frame(inner, rot)
        c = {'cls': cls, 'why': why, 'L': L, 'R': R, 'D': D, 'U': U,
             'src_left_margin': a0 - L, 'src_right_margin': R - a1,
             'src_up_margin': U - n1, 'src_down_margin': n0 - D}
        if cls == 'box':
            c['align'], c['align_why'] = 'center', 'box->center (R2)'
        else:
            c['align'], c['align_why'] = cell_alignment(block, c['src_left_margin'], c['src_right_margin'])
        return c
    fb = free_box(index, blocks, dark, page_h)
    align, align_why = open_alignment(index, blocks, fb['free_left_clear'], fb['free_right_clear'])
    return {'cls': 'open', 'why': why,
            'FL': fb['FL'], 'FR': fb['FR'], 'room_up': fb['room_up'], 'room_down': fb['room_down'],
            'free_left_clear': fb['free_left_clear'], 'free_right_clear': fb['free_right_clear'],
            'align': align, 'align_why': align_why}


def _error_container(index, blocks, exc):
    """An 'open' container whose free box is the source frame's along extent [a0, a1] ([0, 0] when
    even the frame cannot be computed) with zero vertical room, so a label is never spread across
    artwork nobody measured. figlayout then holds the translation to that width less 2 PAD and
    names an overhang only when it does not fit at the floor; a label that fits leaves no trace of
    the error except `why` = 'error: <ExceptionType>', which the caller must report."""
    try:
        a0, a1 = source_frame(blocks[index])[:2]
    except Exception:
        a0 = a1 = 0.0
    return {'cls': 'open', 'why': f'error: {type(exc).__name__}',
            'FL': a0, 'FR': a1, 'room_up': 0.0, 'room_down': 0.0,
            'free_left_clear': 0.0, 'free_right_clear': 0.0,
            'align': 'center', 'align_why': 'error->center'}


def container_for(index, blocks, page, dark, page_h):
    """The container of blocks[index]. NEVER raises.

    index   the block's position in `blocks` (FT.merge_blocks(FT.group(runs))) - used only to
            find the block and to exclude it from its own obstacles and siblings
    blocks  every block of the figure (kept ones too: they are obstacles and sibling cues)
    page    load_page(artwork.pdf), loaded once per figure
    dark    Pillow 'L' image of artwork.png (200 dpi); dark := L < DARK_LEVEL
    page_h  page height in pt

    box / cell: {'cls', 'why', 'L', 'R', 'D', 'U' (inner, in the block's along/normal frame),
                 'src_left_margin', 'src_right_margin', 'src_up_margin', 'src_down_margin',
                 'align' ('center' for a box - R2; the source's for a cell - R3), 'align_why'}
    open:       {'cls': 'open', 'why', 'FL', 'FR', 'room_up', 'room_down',
                 'free_left_clear', 'free_right_clear', 'align', 'align_why'}

    A block whose rotation is not within ROT_SNAP of a multiple of 90 degrees is 'open' with
    why 'rotated' (its page bbox is inflated, so enclosure means nothing); its free box is
    still measured in its own rotation."""
    try:
        return _container_for(index, blocks, page, dark, page_h)
    except Exception as exc:          # noqa: BLE001 - never raising IS the contract
        return _error_container(index, blocks, exc)
