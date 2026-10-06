"""§C140 ③ - the layout DECISION for a translated figure label: line partition, size, anchor, displacement.

    layout = decide(words, width, container, cues, floor=7.5, pad=2.0)

PURE. No cairo, no pdfplumber, no file IO: `compose.py` measures (through `width`) and draws the result, so every
rule below is unit-tested with a fake width function (test_figlayout.py). Ported from the verified r2 prototype
(`r2v5.layout_block`, evidence/2026-09-13-t23/reports/r2-build.md) and extended with R9 short-token binding and a
box/cell HEIGHT budget, and then with the (A)+(E) line-count rules of [USER]'s 2026-09-15 ruling. With all three
switched off (the private `_r9=False, _height=False, _ae=False`) it reproduces the prototype's (lines, size,
anchor, step) on the 176 layout blocks of the 34 bought figures (equiv_figlayout.py). That equivalence is MEASURED
on those 176, not guaranteed by construction: the floor appended to an off-grid size ladder and the box/cell
line-count-before-size order have no switch, and both differ from the prototype elsewhere.

INPUTS
  words      [(word, styles)] from figscripts.words - `styles` is a per-character list of SourceStyle|None.
  width      width(chars, size, j) -> pt. `chars` = [(ch, style)] of ONE drawn line (a space between words is
             (' ', None)); `j` = the output line index, so the caller picks that line's font. THE one width
             function: the partition, the shrink loop, the anchor, the displacement and the overflow check all
             call it, and nothing here re-measures any other way. Inside the partition a span that would sit on
             line m is measured with j = m (the literal contract; the prototype measured every span with line 0's
             run, which cannot differ on the corpus - 0 of 176 blocks mix bold or fill across lines, r2-build §2).
  container  figcontainers.container_for(...) - 'box' | 'cell' | 'open', in the block's own along/normal frame.
  cues       {'n_src', 'sz0', 'starts', 'ends', 'projs'} per VISUAL source line (adv-based in production;
             compose.py builds them on figtext.visual_ink - the visual lines without a folded U+0020-only
             line's runs, so `n_src` is len(figtext.visual_lines) - §C140 ㉑, '6' M2).

RULES (design spec §4; rulings R2-R5, R9; [USER] 2026-09-15 (A) and (E))
  sizes      sz0, sz0-0.25, ... down to floor_eff = min(floor, sz0) inclusive (1e-9 slack); when sz0 is off the
             0.25 grid the grid misses the floor, so floor_eff is appended as the last step. A label the source
             set below the floor is never enlarged and never shrunk.
  lead       sz0 * 1.222 - the SOURCE body size, not the shrunk size. Every fit test of the count/size search uses
             it - and a cell's n_src count is ALSO tested at the source pitch (§C140 '6' M3, SOURCE_ROWS; cell (R3)
             below); the cell's vertical clamp (vdisp), which runs after the partition, reads the lead actually
             drawn. TWO cases where the drawn lead is NOT sz0 * 1.222. (1) A cell admitted on height ONLY at its
             source rows (M3, cell (R3) below) is drawn on them: lead = the source pitch, top = projs[0]. (2) After
             the partition (§C140 '6' M4, P1v; gates PITCH_SRC, PITCH_SRC_MIN): a non-box label not at step
             iv-gain, drawn on exactly n_src >= 2 lines whose source rows all descend by more than 0.5 * sz0 and
             none of which is blank (optional cues['blank'], one bool per visual line), is drawn on the source's
             own rows - lead (projs[0] - projs[-1]) / (n_src - 1), top projs[0] before any displacement - when
             sz0 * 1.222 would misplace the span of its outer lines by more than PITCH_SRC_MIN pt.
  partition  for a line count n: the min-max balanced partition (minimise the longest line); n <= number of words.
             Which n is tried in which order is per class, below.
  R9         SYMBOLS ONLY ([USER] ruling 2026-09-14, superseding the literal R9 of the design spec): a SHORT TOKEN is
             a word of 1-2 characters that is NOT lowercase alphabetic - `A`, `Cu`, `Ar`, `K`, `2`, `H2` bind to
             the word after them; `af`, `og`, `á`, `í` (w.isalpha() and w.islower()) may end a line. For the
             CHOSEN (size, n) and the chosen step's budget: if a partition that never cuts directly after a short
             token fits that budget, use the min-max partition among those; otherwise the unconstrained one.
             Binding never changes the line count, the size or the step.
             CLOSER exception ([USER] R-19, 2026-10-05, recorded in the campaign register; gate R9_CLOSER): a
             short token that ends in ')' and CLOSES a '(' opened by an earlier word of the label ('g)' in
             '(228 g)') binds BACKWARD instead - a line may end directly after it, and no line may start with it.
             An enumerator 'a)' with no '(' before it is unchanged (it binds forward), and so is (A).
  box  (R2)  align centre on (L+R)/2; width budget (R-L)-2 pad; height budget (U-D)-2 pad: n fits only if
             (n-1) lead + (ASC+DESC) size <= height budget. Vertical: the glyph box centred in the container.
  cell (R3)  align = container['align'] (the source's); anchor = the source anchor for that align; same budgets;
             horizontal displacement = the smallest shift keeping the line extents inside [L+pad, R-pad];
             vertical: source centre, clamped inside [D+min(pad, src_down_margin), U-min(pad, src_up_margin)].
             SOURCE ROWS (§C140 '6' M3, gate SOURCE_ROWS): a count n == n_src >= 2 also meets the height budget
             when the source's own rows do - (n-1) pitch + (ASC+DESC) size fits the vertical clamp interval
             above, where pitch = (projs[0] - projs[-1]) / (n_src - 1) is BELOW the lead and the rows are P1v's
             eligible ones (every row descends by more than 0.5 * sz0, none blank). A count admitted ONLY that way
             is drawn on the source rows (lead = pitch, top = projs[0]), so what is tested is what is drawn. Never a
             box (R2 centres its glyph box), never where the source pitch is the lead or wider. CELL_CLAMP_BUDGET
             (off, spec R-7) would make the clamp interval every cell count's height budget.
  box/cell   LINE COUNT BEFORE SIZE, as the open path's (iii) before (iv): every count n <= n_src, closest first,
             from sz0 down to floor_eff; only if none fits at the floor, every count n > n_src, closest first,
             each from sz0 down. A (count, size) fits when its partition meets the width budget AND its glyph box
             meets the height budget (for a cell, at the lead or on the SOURCE ROWS above).
             HEIGHT met by no (count, size): the count chosen by width alone is kept and shrunk toward the floor
             until its glyph box fits - which never happens above the floor (see the code) - and the overhang of
             the lines actually drawn (after (E)) is NAMED: step 'floor-overflow', axis 'height'.
             WIDTH met at no size: at the floor, partition with budget max(width budget, widest word) and NAME the
             widest word: step 'floor-overflow', axis 'width'. A label that ALSO misses height there carries the
             height overhang on the same entry (heightNeedPt, heightBudgetPt) - never heightFit alone.
  (E)        box/cell, every branch above: a line that does not shorten the longest line is never kept - n lines
             are rejected at a size where the min-max partition of n-1 lines is no wider than that of n (+EPS).
             In the fitting search it is a test on the COUNT: a count rejected at its largest fitting size is
             skipped and the next count is tried from sz0 down, so the size is the one the order above picks for
             the count that survives, never one only the rejected count needed. In the floor-overflow branches
             the size is already the floor, and n is stepped down there. The width budget stays met and the glyph
             box only gets shorter.
  (A)        box/cell: a SYMBOL (R9's notion, `is_symbol`) that ends the label may not stand alone on the LAST line.
             When the last of >= 2 words is a symbol, the whole box/cell selection above - counts, sizes, (E) - is
             run first with the cut before the last word forbidden; it is used when it yields step 'fit' (width AND
             height met at some size >= floor), which can mean fewer lines or a smaller size than without (A) (line
             count is still decided before size). Otherwise the label is laid out exactly as without (A). The final
             partition prefers, in order: R9 + (A), (A), R9, unconstrained - each only if it meets the step's budget.
             Open labels are not touched by (A) or (E): the ruling is for boxes and cells, and 0 of 84 open blocks
             on the 34 bought figures change under either (linebreak root-cause census, 2026-09-15).
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
  lead      sz0 * 1.222, or the source pitch (M3's source rows, or P1v)
                                                    disp / vdisp  horizontal / vertical displacement (pt)
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
            EQUAL the unconstrained one; False when no binding-honouring partition exists, it did not fit, or an
            (A)-only partition was preferred to it),
            heightFit (box/cell: whether the DRAWN line count, size AND lead meet the height budget - for a label
            drawn on the source rows that is the rows' test against the clamp interval, so heightFit can be True
            where the lead-based glyph box exceeds (U-D) - 2 pad, and only `rows` says why; None for open or when
            the height budget is switched off), cls,
            rows (True when the label is DRAWN on the source rows by M3's SOURCE ROWS - lead = the source pitch,
            top = projs[0]; False otherwise, including P1v's redraw)
"""

ASC, DESC = 0.73, 0.21
EPS = 1e-9
STEP = 0.25
LEAD = 1.222
PITCH_SRC = True          # §C140 M4 (P1v) gate: a label drawn on the source's own line count is drawn on its rows
PITCH_SRC_MIN = 1.0       # ... when sz0 * LEAD would misplace the outer lines' span by more than this (pt)
SHORT_TOKEN = 2          # R9: a word of 1..SHORT_TOKEN characters binds to the word after it - unless lowercase alphabetic
# §C140 M3 gates - each one switch, so a combiner can take them independently.
SOURCE_ROWS = True       # (a) a CELL label on the source's own line count is admissible on height at the source's own
                         #     rows, and is then DRAWN on them (lead = source pitch, top = first source baseline)
CELL_CLAMP_BUDGET = False  # (a') a cell's height budget is the vertical clamp's own interval, not (U-D) - 2 pad
R9_CLOSER = True         # (c) a short token closing a bracket opened earlier on the label ends a line and binds backward

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


def is_symbol(w):
    """R9's and A's one notion of a SYMBOL: a word of 1..SHORT_TOKEN characters that is not lowercase alphabetic
    (`A`, `Cu`, `Ar`, `K`, `2`, `H2` are symbols; `af`, `og`, `á`, `í` are words)."""
    return len(w) <= SHORT_TOKEN and not (w.isalpha() and w.islower())


class _Partition:
    """Min-max balanced partitions of `words` into n lines, per size, optionally honouring R9. Rows are computed
    lazily and every width is memoised on (i, j, line index, size) - one decide() call may ask for many sizes."""

    def __init__(self, words, width, r9close=False):
        self.r9close = r9close
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
        may not). k is the index of the next line's first word; k == 0 is the start of the text, never a cut.
        With `r9close` (R9_CLOSER, [USER] R-19, 2026-10-05): a short token ending in ')' that closes a '(' opened by
        an earlier word (`_closer`) binds BACKWARD - a cut directly after it is allowed and a cut directly before it
        is not. An enumerator 'a)' with no earlier '(' is not a closer."""
        if k == 0:
            return True
        if self.r9close:
            # §C140 M3 (c): a short token that CLOSES a bracket opened earlier ('(228 g)') belongs to what precedes
            # it: it may end a line, and a line may not START with it. FoodLabel's ruled value broke '(228 | g)'.
            # An enumerator 'a)' (no opener before it) and A's final lone symbol are untouched.
            if self._closer(k - 1):
                return True
            if k < self.W and self._closer(k):
                return False
        return not is_symbol(self.words[k - 1][0])

    def _closer(self, i):
        w = self.words[i][0]
        return is_symbol(w) and w.endswith(')') and any('(' in v for v, _ in self.words[:i])

    def lone_tail(self):
        """(A) True when the LAST word is a symbol (is_symbol) that a cut could leave alone on the last line."""
        return self.W >= 2 and is_symbol(self.words[-1][0])

    def _row(self, size, n, bound, tail=False):
        """`tail` (A): forbid the cut directly before the last word - callers pass it only when lone_tail()."""
        rows = self._rows.setdefault((size, bound, tail), [None])
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
                    if tail and k == W - 1:
                        continue
                    v = max(prev[k][0], self.wd(k, j, m - 1, size))
                    if v < bv - 1e-9:         # earliest k wins a near-tie (the prototype's order)
                        bv, bk = v, k
                row[j] = (bv, bk)
            rows.append(row)
        return rows

    def minmax(self, size, n, bound=False, tail=False):
        return self._row(size, n, bound, tail)[n][self.W][0]

    def cut(self, size, n, bound=False, tail=False):
        rows = self._row(size, n, bound, tail)
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


def decide(words, width, container, cues, floor=7.5, pad=2.0, *, _r9=True, _height=True, _ae=True,
           _rows=None, _cclamp=None, _r9close=None):
    """-> Layout dict (see the module docstring). `_r9` / `_height` / `_ae` exist ONLY for the prototype-equivalence
    harness and the RED-first runs; production never passes them. `_rows` / `_cclamp` / `_r9close` (default: the
    module gates SOURCE_ROWS / CELL_CLAMP_BUDGET / R9_CLOSER) exist for the §C140 M3 blast harness and the committed
    gates-off controls (test_figlayout_rows.py); production never passes them either."""
    _rows = SOURCE_ROWS if _rows is None else _rows
    _cclamp = CELL_CLAMP_BUDGET if _cclamp is None else _cclamp
    _r9close = R9_CLOSER if _r9close is None else _r9close
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
    P = _Partition(words, width, _r9close)

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

    # §C140 M3 (a) SOURCE ROWS. sz0 * LEAD is a guess at the source's pitch; where the source set its n_src lines
    # CLOSER than that (FoodLabel's green band: 5.5 against 6.11 at 5 pt), the guess makes the source's own line
    # count taller than the source itself, and the height budget refused the count the source uses. A CELL label on
    # exactly n_src lines is therefore also admissible at the source's own pitch, tested against the interval the
    # vertical clamp below already places into - and when only that test admits it, it is DRAWN on the source rows,
    # so what is tested is what is drawn. A pure relaxation: never where the source pitch is wider than the lead,
    # never a box (R2 centres a box's glyph box), never a source with a whitespace-only visual line or rows that do
    # not descend by more than half a size (the eligibility of M4's P1v, verbatim). On a real figure the clamp
    # interval contains the source frame by construction (src margins are measured from it), so the source's own
    # rows at any size <= sz0 always pass; the test is kept so a fixture or a future margin source cannot slip by.
    rows_pitch = None
    if (_rows and cls == 'cell' and n_src >= 2 and len(projs) == n_src
            and not any(cues.get('blank', ()))
            and all(projs[i] - projs[i + 1] > 0.5 * sz0 for i in range(n_src - 1))):
        _p = (projs[0] - projs[-1]) / (n_src - 1)
        if _p < lead - EPS:
            rows_pitch = _p
    hb_clamp = None
    if cls == 'cell':
        hb_clamp = ((container['U'] - container['D']) - min(pad, container['src_up_margin'])
                    - min(pad, container['src_down_margin']))

    def on_rows(n, size):
        """(a) n lines at `size` are admissible ON THE SOURCE ROWS (see above)."""
        return (rows_pitch is not None and n == n_src
                and (n - 1) * rows_pitch + (ASC + DESC) * size <= hb_clamp + EPS)

    def fits_h(n, size, h):
        """The height test of every box/cell branch: the glyph box at the lead fits `h`, or (a) the source rows do."""
        return glyph_h(n, size) <= h + EPS or on_rows(n, size)

    def choose(size, budget, hb=None, tail=False):
        """The line count closest to the source (tie -> fewer) whose min-max partition fits `budget` and, when
        `hb` is given, whose glyph box fits the height budget; None if no count fits."""
        for n in sorted(range(1, W + 1), key=lambda n: (abs(n - n_src), n)):
            if hb is not None and not fits_h(n, size, hb):
                continue
            if P.minmax(size, n, tail=tail) <= budget + EPS:
                return n
        return None

    overflow = None
    height_fit = None
    rows = False
    use_disp = False
    grow = None
    # (A) is live only for a box/cell label whose last word is a symbol.
    lone = bool(_ae) and cls in ('box', 'cell') and P.lone_tail()

    if cls in ('box', 'cell'):
        L, R, D, U = container['L'], container['R'], container['D'], container['U']
        budget = (R - L) - 2 * pad
        hb = (U - D) - 2 * pad if _height else None
        if hb is not None and _cclamp and cls == 'cell':   # (a') the clamp's own interval (box: R2, untouched)
            hb = hb_clamp
        # LINE COUNT BEFORE SIZE, as the open path's (iii) before (iv): every count n <= n_src (closest first) is
        # tried from sz0 down to the floor before any count n > n_src (closest first), each from sz0 down.
        counts = sorted(range(1, W + 1), key=lambda n: (n > n_src, abs(n - n_src), n))

        def select(tl):
            """(n, s, step, bud, overflow): the box/cell count and size, with partitions constrained by (A) when
            `tl`, and (E) deciding which counts are admissible."""

            def useless(n, s):
                """(E) [USER] 2026-09-15: the n-th line shortens nothing - n-1 lines are no wider than n at `s`."""
                return bool(_ae) and n > 1 and P.minmax(s, n - 1, tail=tl) <= P.minmax(s, n, tail=tl) + EPS

            def first_fit(h):
                """(n, size): the first count in `counts` order, at the largest size where its min-max partition
                meets the width budget and - when `h` is given - its glyph box meets `h`; (None, None) if none.
                (E) is a test on the COUNT, not a pass after it: a count whose largest fitting size carries a line
                that shortens nothing is skipped, and the next count is tried from sz0 down - so a size that only
                the rejected count needed is never kept (R17). Nothing else moves: when n fits at s and is rejected,
                n-1 fits at s too (same longest line, shorter glyph box), and every count <= n_src precedes every
                count > n_src in `counts`, so the skip walks n_src, n_src-1, ... as the old step-down did and only
                the size of the surviving count changes - never down. A first-fitting count > n_src is never
                rejected: n-1 would fit at s, and it was tried before n."""
                for n_try in counts:
                    for s_try in sizes:
                        if h is not None and not fits_h(n_try, s_try, h):
                            continue
                        if P.minmax(s_try, n_try, tail=tl) <= budget + EPS:
                            if useless(n_try, s_try):
                                break
                            return n_try, s_try
                return None, None

            def fewer(n, s):
                """(E) at a size a floor-overflow branch has already pinned to the floor: step the count down while
                the n-th line shortens nothing. The size cannot move, so no rejected count can influence it; the
                width budget stays met (the longest line does not grow) and the glyph box only gets shorter."""
                while useless(n, s):
                    n -= 1
                return n

            ov = None
            n, s = first_fit(hb)
            st = 'fit'
            bd = budget
            if n is None and hb is not None:  # no (count, size) meets width AND height: width decides the count
                n, s = first_fit(None)
                if n is not None:
                    # Keep that count and shrink toward the floor until its glyph box meets the height budget. It
                    # never stops above the floor: first_fit(hb) tried this count at every size, the count meets
                    # width at this size and at every smaller one, and a glyph box only shrinks with size - so it
                    # meets height at no size at all, and the overhang is NAMED (R5), never silent. (E) chose the
                    # count inside first_fit; `fewer` re-applies it at the floor the size was shrunk to (a no-op
                    # while widths scale with size). Fewer lines never meet height either (first_fit(hb) tried every
                    # count), so the overhang stays, measured on the lines actually drawn.
                    for s_try in sizes[sizes.index(s):]:
                        s = s_try
                        if fits_h(n, s, hb):
                            break
                    n = fewer(n, s)
                    if not fits_h(n, s, hb):
                        st = 'floor-overflow'
                        ov = {'word': None, 'needPt': glyph_h(n, s), 'budgetPt': hb, 'sizePt': s,
                              'axis': 'height'}
            if n is None:
                s = sizes[-1]
                ww, wword = P.widest_word(s)
                bd = max(budget, ww)
                n = choose(s, bd, hb, tl)
                if n is None and hb is not None:
                    n = choose(s, bd, None, tl)
                if n is not None:
                    n = fewer(n, s)
                st = 'floor-overflow'
                if ww > budget + EPS:
                    ov = {'word': wword, 'needPt': ww, 'budgetPt': budget, 'sizePt': s, 'axis': 'width'}
            return n, s, st, bd, ov

        # (A) [USER] 2026-09-15: a lone SYMBOL may not stand alone on the last line. Every (count, size) is tried
        # under that constraint first, in the same order; only when none of them FITS (width and height) is the
        # label laid out exactly as without (A). A count of 1 always honours it, so this can mean fewer lines - or a
        # smaller size, when the binding count fits only shrunk: line count is still decided before size.
        n, s, step, bud, overflow = select(True) if lone else (None, None, None, None, None)
        if n is None or step != 'fit':
            n, s, step, bud, overflow = select(False)
        assert n is not None, 'unreachable: one word per line fits max(budget, widest word)'
        if hb is not None:
            height_fit = fits_h(n, s, hb)
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
            if hb is not None and glyph_h(n, s) > hb + EPS and on_rows(n, s):
                # (a) admitted ONLY on the source rows: draw it there. Nothing is drawn where it was not measured.
                lead, top, rows = rows_pitch, max(projs), True
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

    # The final partition at the chosen (n, s): R9 when it fits; for a box/cell label ending in a symbol, (A) first -
    # it is guaranteed to fit when the count was chosen under it, and is taken in an overflow path whenever it fits
    # the budget that path holds the lines to.
    modes = [(True, True), (False, True)] if lone else []
    modes += [(True, False), (False, False)]
    for b_try, t_try in modes:
        if (b_try and not _r9) or P.minmax(s, n, bound=b_try, tail=t_try) > bud + EPS:
            continue
        bound, tail = b_try, t_try
        break
    else:
        bound, tail = False, False
    spans = P.cut(s, n, bound=bound, tail=tail)
    lines = [P.chars(a, c) for a, c in spans]
    # §C140 M4 (P1v): sz0 * LEAD is a guess at the source's line pitch, centred on its mean baseline. A label drawn
    # on EXACTLY the source's line count is drawn on the source's own rows instead - its first baseline and its mean
    # pitch - when the guess misplaces the span by more than PITCH_SRC_MIN (FoodLabel's lower table: 4.89 against
    # 5.5 at 4 pt; FracDistil: 11.0 against 9.21). Not a box (R2 centres a box's glyph box, pinned by
    # test_figlayout's box-vertical cases), not (iv)'s pinned growth, not a source with a whitespace-only line
    # (cues['blank']: that line is not a row - FoodLabel 'more is| ' would land on 'high'), and only when the
    # source rows descend by more than half a size. The size never feeds the pitch: lead stays a source length.
    if (PITCH_SRC and cls != 'box' and step != 'iv-gain' and len(lines) == n_src >= 2
            and not any(cues.get('blank', ()))
            and all(projs[i] - projs[i + 1] > 0.5 * sz0 for i in range(n_src - 1))
            and abs((projs[0] - projs[-1]) - (n_src - 1) * lead) > PITCH_SRC_MIN):
        lead = (projs[0] - projs[-1]) / (n_src - 1)
        top = projs[0]
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
        'rows': rows,
    }
