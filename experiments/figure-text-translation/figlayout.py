"""§C140 ③ - the layout DECISION for a translated figure label: line partition, size, anchor, displacement.

    layout = decide(words, width, container, cues, floor=7.5, pad=2.0)

PURE. No cairo, no pdfplumber, no file IO: `compose.py` measures (through `width`) and draws the result, so every
rule below is unit-tested with a fake width function (test_figlayout.py). Ported from the verified r2 prototype
(`r2v5.layout_block`, evidence/2026-09-13-t23/reports/r2-build.md) and extended with R9 short-token binding and a
box/cell HEIGHT budget. With both extensions switched off (the private `_r9=False, _height=False`) it reproduces the
prototype's (lines, size, anchor, step) on the 176 layout blocks of the 34 bought figures (equiv_figlayout.py).
That equivalence is MEASURED on those 176, not guaranteed by construction: the floor appended to an off-grid size
ladder and the box/cell line-count-before-size order have no switch, and both differ from the prototype elsewhere.

INPUTS
  words      [(word, styles)] from figscripts.words - `styles` is a per-character list of SourceStyle|None.
  width      width(chars, size, j) -> pt. `chars` = [(ch, style)] of ONE drawn line (a space between words is
             (' ', None)); `j` = the output line index, so the caller picks that line's font. THE one width
             function: the partition, the shrink loop, the anchor, the displacement and the overflow check all
             call it, and nothing here re-measures any other way. Inside the partition a span that would sit on
             line m is measured with j = m (the literal contract; the prototype measured every span with line 0's
             run, which cannot differ on the corpus - 0 of 176 blocks mix bold or fill across lines, r2-build §2).
  container  figcontainers.container_for(...) - 'box' | 'cell' | 'open', in the block's own along/normal frame.
  cues       {'n_src', 'sz0', 'starts', 'ends', 'projs'} per SOURCE line (adv-based in production).

RULES (design spec §4; rulings R2-R5, R9)
  sizes      sz0, sz0-0.25, ... down to floor_eff = min(floor, sz0) inclusive (1e-9 slack); when sz0 is off the
             0.25 grid the grid misses the floor, so floor_eff is appended as the last step. A label the source
             set below the floor is never enlarged and never shrunk.
  lead       sz0 * 1.222 - the SOURCE body size, not the shrunk size.
  partition  for a line count n: the min-max balanced partition (minimise the longest line); n <= number of words.
             Which n is tried in which order is per class, below.
  R9         SYMBOLS ONLY ([USER] ruling 2026-09-14, superseding the literal R9 of the design spec): a SHORT TOKEN is
             a word of 1-2 characters that is NOT lowercase alphabetic - `A`, `Cu`, `Ar`, `K`, `2`, `H2` bind to
             the word after them; `af`, `og`, `á`, `í` (w.isalpha() and w.islower()) may end a line. For the
             CHOSEN (size, n) and the chosen step's budget: if a partition that never cuts directly after a short
             token fits that budget, use the min-max partition among those; otherwise the unconstrained one.
             Binding never changes the line count, the size or the step.
  box  (R2)  align centre on (L+R)/2; width budget (R-L)-2 pad; height budget (U-D)-2 pad: n fits only if
             (n-1) lead + (ASC+DESC) size <= height budget. Vertical: the glyph box centred in the container.
  cell (R3)  align = container['align'] (the source's); anchor = the source anchor for that align; same budgets;
             horizontal displacement = the smallest shift keeping the line extents inside [L+pad, R-pad];
             vertical: source centre, clamped inside [D+min(pad, src_down_margin), U-min(pad, src_up_margin)].
  box/cell   LINE COUNT BEFORE SIZE, as the open path's (iii) before (iv): every count n <= n_src, closest first,
             from sz0 down to floor_eff; only if none fits at the floor, every count n > n_src, closest first,
             each from sz0 down. A (count, size) fits when its partition meets the width budget AND its glyph box
             meets the height budget.
             HEIGHT met by no (count, size): the count chosen by width alone is kept and shrunk toward the floor
             until its glyph box fits - which never happens above the floor (see the code) - and the overhang is
             NAMED: step 'floor-overflow', axis 'height'.
             WIDTH met at no size: at the floor, partition with budget max(width budget, widest word) and NAME the
             widest word: step 'floor-overflow', axis 'width'. A label that ALSO misses height there carries the
             height overhang on the same entry (heightNeedPt, heightBudgetPt) - never heightFit alone.
  open       n_t = min(n_src, words).
             (i)   n_t at sz0 within the free width from the anchor - pad
             (ii)  n_t at sz0 within (FR-FL) - 2 pad, anchor displaced minimally
             (iii) shrinking toward floor_eff, retrying (i) then (ii) at each size
             (iv)  add a line toward the roomier vertical side, only while room - extra >= pad
                   (extra = (n - n_src) lead), each n from sz0 down to floor_eff with (i)/(ii); the edge of the
                   source glyph box on the grow-away side stays pinned
             (v)   n_t at floor_eff, displaced minimally, overhanging and NAMED: a word wider than (FR-FL) - 2 pad
                   -> that word; otherwise a line-count overhang -> word None, needPt = the widest drawn line.

OUTPUT  Layout dict:
  lines     [[(ch, style)]] per drawn line          size      the drawn base size (pt)
  align     'left' | 'center' | 'right'             anchor    the UNDISPLACED anchor (along)
  x0        per-line start along, displacement included - compose only draws
  top       baseline of line 0 (normal coordinate), vertical displacement included
  lead      sz0 * 1.222                             disp / vdisp  horizontal / vertical displacement (pt)
  step      'fit' | 'floor-overflow' (box/cell); 'i' | 'ii' | 'iii-anchor' | 'iii-displaced' | 'iv-gain' |
            'v-overflow' (open)
  overflow  None, or ONE named overhang:
              axis 'width'   {'word', 'needPt', 'budgetPt', 'sizePt', 'axis', 'linePt'}: needPt = the named word's
                             width (word None = a line-count overhang, needPt = the widest drawn line); budgetPt =
                             the width budget; linePt = the widest DRAWN line at sizePt. Box/cell floor-overflow
                             holds every line to max(budget, widest word), so linePt <= needPt there; only open (v)
                             can draw a line wider than its widest word. A box/cell width entry whose glyph box
                             also misses the height budget adds 'heightNeedPt' and 'heightBudgetPt'.
              axis 'height'  {'word': None, 'needPt': the glyph-box height, 'budgetPt': the height budget, 'sizePt',
                             'axis'} (box/cell only).
  additive, for the report: widths (per drawn line, pt), budget (the width budget the partition was held to),
            bound (True when the R9-constrained partition fit the step's budget and was therefore taken - it may
            EQUAL the unconstrained one; False when no binding-honouring partition exists or it did not fit),
            heightFit (box/cell: whether the DRAWN line
            count and size meet the height budget; None for open or when the height budget is switched off), cls
"""

ASC, DESC = 0.73, 0.21
EPS = 1e-9
STEP = 0.25
LEAD = 1.222
SHORT_TOKEN = 2          # R9: a word of 1..SHORT_TOKEN characters binds to the word after it - unless lowercase alphabetic

_STEP_OPEN = ('i', 'ii', 'iii-anchor', 'iii-displaced', 'iv-gain', 'v-overflow')


def clamp_shift(e0, e1, lo, hi):
    """Smallest |shift| putting [e0, e1] inside [lo, hi]; if it is wider than [lo, hi], the smallest |shift| such
    that it covers [lo, hi] (the overflow split as close to the original position as possible)."""
    a, b = lo - e0, hi - e1
    s0, s1 = min(a, b), max(a, b)
    return min(max(0.0, s0), s1)


def size_steps(sz0, floor):
    """sz0, sz0-0.25, ... down to min(floor, sz0) inclusive. Accumulated exactly as the prototype did.

    The floor itself is ALWAYS the last step: when sz0 is not on the 0.25 pt grid (8.9 -> ... 7.65) the grid
    never lands on it, and a label that fits at 7.5 would otherwise be reported as overflowing at 7.65."""
    floor_eff = min(floor, sz0)
    out = []
    s = sz0
    while s >= floor_eff - 1e-9:
        out.append(s)
        s -= STEP
    if out[-1] > floor_eff + EPS:
        out.append(floor_eff)
    return out


class _Partition:
    """Min-max balanced partitions of `words` into n lines, per size, optionally honouring R9. Rows are computed
    lazily and every width is memoised on (i, j, line index, size) - one decide() call may ask for many sizes."""

    def __init__(self, words, width):
        self.words = words
        self.W = len(words)
        self.width = width
        self._wd = {}
        self._rows = {}

    def chars(self, i, j):
        o = []
        for k in range(i, j):
            if k > i:
                o.append((' ', None))
            o += list(zip(self.words[k][0], self.words[k][1]))
        return o

    def wd(self, i, j, m, size):
        key = (i, j, m, size)
        if key not in self._wd:
            self._wd[key] = self.width(self.chars(i, j), size, m)
        return self._wd[key]

    def cut_allowed(self, k):
        """R9 ([USER] 2026-09-14, symbols only): a line may not end directly after a word of 1-2 characters,
        UNLESS that word is lowercase alphabetic (`af`, `og`, `á`, `í` may end a line; `A`, `Cu`, `Ar`, `2`, `H2`
        may not). k is the index of the next line's first word; k == 0 is the start of the text, never a cut."""
        if k == 0:
            return True
        w = self.words[k - 1][0]
        return len(w) > SHORT_TOKEN or (w.isalpha() and w.islower())

    def _row(self, size, n, bound):
        rows = self._rows.setdefault((size, bound), [None])
        W = self.W
        INF = float('inf')
        if len(rows) == 1:
            rows[0] = [(0.0, None)] + [(INF, None)] * W
        while len(rows) <= n:
            m = len(rows)                     # computing row m: words[:j] into m lines, the last one index m-1
            prev = rows[m - 1]
            row = [(INF, None)] * (W + 1)
            for j in range(m, W + 1):
                bv, bk = INF, None
                for k in range(m - 1, j):
                    if prev[k][0] == INF:
                        continue
                    if bound and not self.cut_allowed(k):
                        continue
                    v = max(prev[k][0], self.wd(k, j, m - 1, size))
                    if v < bv - 1e-9:         # earliest k wins a near-tie (the prototype's order)
                        bv, bk = v, k
                row[j] = (bv, bk)
            rows.append(row)
        return rows

    def minmax(self, size, n, bound=False):
        return self._row(size, n, bound)[n][self.W][0]

    def cut(self, size, n, bound=False):
        rows = self._row(size, n, bound)
        spans = []
        j, m = self.W, n
        while m > 0:
            k = rows[m][j][1]
            spans.append((k, j))
            j, m = k, m - 1
        return list(reversed(spans))

    def widest_word(self, size):
        """(width, word) of the widest single word at `size`. A word k can land on any line m <= k, so it is
        measured at each; the max makes a one-word-per-line partition always fit the returned width."""
        best = None
        for k in range(self.W):
            cs = list(zip(*self.words[k]))
            w = max(self.width(cs, size, m) for m in range(k + 1))
            cand = (w, self.words[k][0])
            if best is None or cand > best:
                best = cand
        return best


def decide(words, width, container, cues, floor=7.5, pad=2.0, *, _r9=True, _height=True):
    """-> Layout dict (see the module docstring). `_r9` / `_height` exist ONLY for the prototype-equivalence
    harness and the RED-first runs; production never passes them."""
    W = len(words)
    if W == 0:
        raise ValueError('decide: a translated label with no words (compose.py treats an empty value as missing)')
    cls = container.get('cls')
    if cls not in ('box', 'cell', 'open'):
        raise ValueError(f'decide: unknown container class {cls!r}')

    n_src = cues['n_src']
    sz0 = cues['sz0']
    starts, ends, projs = cues['starts'], cues['ends'], cues['projs']
    lead = sz0 * LEAD
    sizes = size_steps(sz0, floor)
    P = _Partition(words, width)

    def src_anchor(al):
        if al == 'left':
            return min(starts)
        if al == 'right':
            return max(ends)
        if al == 'center':
            return sum((s + e) / 2 for s, e in zip(starts, ends)) / len(starts)
        raise ValueError(f'decide: unknown alignment {al!r}')

    def glyph_h(n, size):
        """Height of the glyph box of n lines drawn at `size` (the lead stays sz0 * LEAD)."""
        return (n - 1) * lead + (ASC + DESC) * size

    def choose(size, budget, hb=None):
        """The line count closest to the source (tie -> fewer) whose min-max partition fits `budget` and, when
        `hb` is given, whose glyph box fits the height budget; None if no count fits."""
        for n in sorted(range(1, W + 1), key=lambda n: (abs(n - n_src), n)):
            if hb is not None and (n - 1) * lead + (ASC + DESC) * size > hb + EPS:
                continue
            if P.minmax(size, n) <= budget + EPS:
                return n
        return None

    overflow = None
    height_fit = None
    use_disp = False
    grow = None

    if cls in ('box', 'cell'):
        L, R, D, U = container['L'], container['R'], container['D'], container['U']
        budget = (R - L) - 2 * pad
        hb = (U - D) - 2 * pad if _height else None
        # LINE COUNT BEFORE SIZE, as the open path's (iii) before (iv): every count n <= n_src (closest first) is
        # tried from sz0 down to the floor before any count n > n_src (closest first), each from sz0 down.
        counts = sorted(range(1, W + 1), key=lambda n: (n > n_src, abs(n - n_src), n))

        def first_fit(h):
            """(n, size): the first count in `counts` order, at the largest size where its min-max partition meets
            the width budget and - when `h` is given - its glyph box meets `h`; (None, None) if there is none."""
            for n_try in counts:
                for s_try in sizes:
                    if h is not None and glyph_h(n_try, s_try) > h + EPS:
                        continue
                    if P.minmax(s_try, n_try) <= budget + EPS:
                        return n_try, s_try
            return None, None

        n, s = first_fit(hb)
        step = 'fit'
        bud = budget
        if n is None and hb is not None:      # no (count, size) meets width AND height: width decides the count
            n, s = first_fit(None)
            if n is not None:
                # Keep that count and shrink toward the floor until its glyph box meets the height budget. It never
                # stops above the floor: first_fit(hb) tried this count at every size, the count meets width at
                # this size and at every smaller one, and a glyph box only shrinks with size - so it meets height
                # at no size at all, and the overhang is NAMED (R5), never silent.
                for s_try in sizes[sizes.index(s):]:
                    s = s_try
                    if glyph_h(n, s) <= hb + EPS:
                        break
                if glyph_h(n, s) > hb + EPS:
                    step = 'floor-overflow'
                    overflow = {'word': None, 'needPt': glyph_h(n, s), 'budgetPt': hb, 'sizePt': s,
                                'axis': 'height'}
        if n is None:
            s = sizes[-1]
            ww, wword = P.widest_word(s)
            bud = max(budget, ww)
            n = choose(s, bud, hb)
            if n is None and hb is not None:
                n = choose(s, bud)
            step = 'floor-overflow'
            if ww > budget + EPS:
                overflow = {'word': wword, 'needPt': ww, 'budgetPt': budget, 'sizePt': s, 'axis': 'width'}
        assert n is not None, 'unreachable: one word per line fits max(budget, widest word)'
        if hb is not None:
            height_fit = glyph_h(n, s) <= hb + EPS
        if overflow is not None and overflow['axis'] == 'width' and height_fit is False:
            # Width missed at every size AND the glyph box misses height at the floor: the height overhang is
            # NAMED on the same entry (R5) - heightFit is not in the report, so it must not be the only trace.
            overflow['heightNeedPt'] = glyph_h(n, s)
            overflow['heightBudgetPt'] = hb
        if cls == 'box':
            align = 'center'
            anchor = (L + R) / 2
            top = (D + U) / 2 + (n - 1) / 2.0 * lead - (ASC - DESC) / 2.0 * s
        else:
            align = container['align']
            anchor = src_anchor(align)
            top = (max(projs) + min(projs)) / 2 + (n - 1) / 2.0 * lead
    else:
        FL, FR = container['FL'], container['FR']
        align = container['align']
        anchor = src_anchor(align)
        b_i = {'left': FR - anchor - pad, 'right': anchor - FL - pad,
               'center': 2 * (min(anchor - FL, FR - anchor) - pad)}[align]
        b_ii = (FR - FL) - 2 * pad
        n_t = min(n_src, W)
        step, n, s, bud = None, n_t, sz0, None
        for idx, s_try in enumerate(sizes):
            m = P.minmax(s_try, n_t)
            if m <= b_i + EPS:
                step, use_disp, s, bud = ('i' if idx == 0 else 'iii-anchor'), False, s_try, b_i
                break
            if m <= b_ii + EPS:
                step, use_disp, s, bud = ('ii' if idx == 0 else 'iii-displaced'), True, s_try, b_ii
                break
        if step is None:
            room_up, room_down = container['room_up'], container['room_down']
            grow = 'down' if room_up <= room_down else 'up'
            room = room_down if grow == 'down' else room_up
            for n_g in range(n_t + 1, W + 1):
                extra = max(0, n_g - n_src) * lead
                if room - extra < pad - EPS:
                    break
                for s_try in sizes:
                    m = P.minmax(s_try, n_g)
                    if m <= b_i + EPS:
                        step, use_disp, s, n, bud = 'iv-gain', False, s_try, n_g, b_i
                        break
                    if m <= b_ii + EPS:
                        step, use_disp, s, n, bud = 'iv-gain', True, s_try, n_g, b_ii
                        break
                if step:
                    break
            if step is None:
                step, use_disp, s, n = 'v-overflow', True, sizes[-1], n_t
                ww, wword = P.widest_word(s)
                if ww > b_ii + EPS:
                    overflow = {'word': wword, 'needPt': ww, 'budgetPt': b_ii, 'sizePt': s, 'axis': 'width'}
                    bud = max(b_ii, ww)
                else:
                    bud = b_ii                 # needPt is filled from the drawn partition below
        if step == 'iv-gain':
            if grow == 'down':                 # pin the source glyph box's top edge, grow down
                top = max(projs) + ASC * sz0 - ASC * s
            else:                              # pin its bottom edge, grow up
                top = min(projs) - DESC * sz0 + DESC * s + (n - 1) * lead
        else:
            top = (max(projs) + min(projs)) / 2 + (n - 1) / 2.0 * lead
        budget = bud

    bound = bool(_r9) and P.minmax(s, n, bound=True) <= bud + EPS
    spans = P.cut(s, n, bound=bound)
    lines = [P.chars(a, c) for a, c in spans]
    widths = [width(lc, s, j) for j, lc in enumerate(lines)]
    x0 = [{'left': anchor, 'right': anchor - w, 'center': anchor - w / 2}[align] for w in widths]
    e0, e1 = min(x0), max(a + w for a, w in zip(x0, widths))

    disp, vdisp = 0.0, 0.0
    if cls == 'cell':
        disp = clamp_shift(e0, e1, container['L'] + pad, container['R'] - pad)
        g_top = top + ASC * s
        g_bot = top - (len(lines) - 1) * lead - DESC * s
        vdisp = clamp_shift(g_bot, g_top, container['D'] + min(pad, container['src_down_margin']),
                            container['U'] - min(pad, container['src_up_margin']))
        top += vdisp
    elif cls == 'open' and use_disp:
        disp = clamp_shift(e0, e1, container['FL'] + pad, container['FR'] - pad)

    if step == 'v-overflow' and overflow is None:
        overflow = {'word': None, 'needPt': max(widths), 'budgetPt': budget, 'sizePt': s, 'axis': 'width'}
    if overflow is not None and overflow['axis'] == 'width':
        # needPt names the WORD; the overhang a reader sees is the widest DRAWN line, which at open (v) - the
        # source line count forced at the floor - can be far wider than any one word (additive).
        overflow['linePt'] = max(widths)

    return {
        'lines': lines, 'size': s, 'align': align, 'anchor': anchor,
        'x0': [x + disp for x in x0], 'top': top, 'lead': lead, 'disp': disp, 'vdisp': vdisp,
        'step': step, 'overflow': overflow,
        'widths': widths, 'budget': budget, 'bound': bound, 'heightFit': height_fit, 'cls': cls,
    }
