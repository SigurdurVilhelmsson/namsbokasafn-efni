#!/usr/bin/env python3
"""Patch the SCRATCH compose.py (already prep-tagged + c3-DIAG-patched) with census-driven layout variants.

Selected by env:
  C3B_VARIANT   V0 | V1 | V2 | V3 | V3L        (V0 = the original statements, untouched)
  C3B_CENSUS    path to c3b/census.json         (per (basename, block) container / free-space boxes)
  C3B_BASENAME  the figure's basename           (census rows are keyed basename#block, NEVER on key)

Variants (layout path only; kept / identity blocks are never touched):
  V1  BOUNDED: budget = container inner width - 2*PAD; anchor = container centre (h), glyph-box
      vertical centre on the container's vertical centre. OPEN: unchanged.
  V2  V1 + line-count preference for ALL layout blocks: among partitions whose every line fits the
      budget, choose |n - n_src| minimal (tie -> fewer lines), balanced (min-max line width);
      shrink by 0.25 pt only when no partition fits.
  V3  V2 + OPEN: source alignment (sibling-edge cue for single lines, ambiguous multi-line -> centre),
      budget = free width available from that anchor (census free_dark_or_labels box) - PAD on each
      growing side; vertical = source centre (unchanged).
  V3L V2 + OPEN: source alignment as V3, budget UNCHANGED (maxw), and when the block gains lines the
      glyph-box edge on the side with LESS free room is pinned at the source's edge there, so gained
      lines grow toward the roomier side (the literal away-from-artwork rule).
Budget floor for every census-driven budget: never below the source's own widest FLATTENED line at sz0
(the N1 lesson - widths per run at run size under-measure a subscript line).
Every anchor is asserted to occur exactly once.
"""
import sys
from pathlib import Path

p = Path(sys.argv[1])
s = p.read_text()

HEAD_OLD = "\nDIAG = []\n"
HEAD_NEW = '''
DIAG = []
import os as _os
C3B_VARIANT = _os.environ.get('C3B_VARIANT', 'V0')
C3B_BASENAME = _os.environ.get('C3B_BASENAME', '')
C3B_CENSUS = {}
if C3B_VARIANT != 'V0':
    C3B_CENSUS = json.loads(Path(_os.environ['C3B_CENSUS']).read_text())
assert C3B_VARIANT in ('V0', 'V1', 'V2', 'V3', 'V3L'), C3B_VARIANT
C3B_PAD = 2.0      # pt per side; compose.py's own BOXW comment: "67.3pt wide; 2pt padding each side"
C3B_ASC, C3B_DESC = 0.73, 0.21
'''

# 1. after `ref = ls[0][0]`: variant budget / anchor / alignment
REF_OLD = "    ref = ls[0][0]\n"
REF_NEW = '''    ref = ls[0][0]
    # ---- c3b VARIANT: budget / anchor from the census ----
    _cz = C3B_CENSUS.get(f"{C3B_BASENAME}#{BI}") if C3B_VARIANT != 'V0' else None
    _vinfo = dict(variant=C3B_VARIANT, census=_cz is not None)
    _vcentre = None      # glyph-box vertical centre target (BOUNDED)
    _edge = None         # V3L: ('up'|'down', normal coordinate of the source glyph-box edge)
    _prefer = C3B_VARIANT in ('V2', 'V3', 'V3L')
    _srcflat = max(measure(''.join(r['text'] for r in l), ref, sz0) for l in ls)
    if _cz is not None:
        assert _cz['n_src'] == len(ls), (_cz, len(ls))
        if _cz['cls'] == 'BOUNDED':
            assert abs(rot) < 0.5, ('rotated BOUNDED', C3B_BASENAME, BI, rot)
            align = 'center'
            anchor = (_cz['L'] + _cz['R']) / 2
            _bud = (_cz['R'] - _cz['L']) - 2 * C3B_PAD
            _vcentre = (_cz['D'] + _cz['U']) / 2
            _vinfo.update(cls='BOUNDED', budget_raw=_bud)
            maxw = max(_bud, _srcflat)
            _vinfo['floor_binds'] = _srcflat > _bud
        elif C3B_VARIANT in ('V3', 'V3L'):
            align = _cz['open_align']
            _ends_ = [s_ + w_ for s_, w_ in zip(starts, widths)]
            anchor = {'left': min(starts), 'right': max(_ends_),
                      'center': sum(s_ + w_ / 2 for s_, w_ in zip(starts, widths)) / len(ls)}[align]
            _vinfo.update(cls='OPEN', open_align=align)
            if C3B_VARIANT == 'V3':
                FL, FR = _cz['FL'], _cz['FR']
                _bud = {'left': FR - anchor - C3B_PAD, 'right': anchor - FL - C3B_PAD,
                        'center': 2 * (min(anchor - FL, FR - anchor) - C3B_PAD)}[align]
                _vinfo['budget_raw'] = _bud
                maxw = max(_bud, _srcflat)
                _vinfo['floor_binds'] = _srcflat > _bud
        else:
            _vinfo.update(cls='OPEN')
    _vinfo.update(align=align, anchor=anchor, maxw=maxw, srcflat=_srcflat)
'''

# 2. the wrap / shrink block
WS_OLD = '''    sz = sz0
    wrapped = wrap(new, sz)
    while sz > 5 and max((measure(t, ref, sz) for t in wrapped), default=0) > maxw:
        sz -= 0.25
        wrapped = wrap(new, sz)
    new = wrapped
'''
WS_NEW = '''    def _choose(lines_in, size):
        """V2: min-max partition for every line count; pick |n - n_src| minimal (tie -> fewer)."""
        words = ' '.join(lines_in).split()
        W_ = len(words)
        if W_ == 0:
            return None
        wd = {}
        for i in range(W_):
            for j in range(i + 1, W_ + 1):
                wd[(i, j)] = measure(' '.join(words[i:j]), ref, size)
        INF = float('inf')
        # best[n][j] = (min over partitions of words[:j] into n lines of max width, backpointer)
        best = [[(INF, None)] * (W_ + 1) for _ in range(W_ + 1)]
        best[0][0] = (0.0, None)
        for n in range(1, W_ + 1):
            for j in range(n, W_ + 1):
                bv, bk = INF, None
                for k in range(n - 1, j):
                    if best[n - 1][k][0] == INF:
                        continue
                    v = max(best[n - 1][k][0], wd[(k, j)])
                    if v < bv - 1e-9:
                        bv, bk = v, k
                best[n][j] = (bv, bk)
        cands = [(abs(n - len(ls)), n) for n in range(1, W_ + 1) if best[n][W_][0] <= maxw]
        if not cands:
            return None
        n = min(cands)[1]
        cuts = []; j = W_; m = n
        while m > 0:
            k = best[m][j][1]; cuts.append((k, j)); j = k; m -= 1
        return [' '.join(words[a:b]) for a, b in reversed(cuts)]

    if not _prefer:
        sz = sz0
        wrapped = wrap(new, sz)
        while sz > 5 and max((measure(t, ref, sz) for t in wrapped), default=0) > maxw:
            sz -= 0.25
            wrapped = wrap(new, sz)
        new = wrapped
    else:
        sz = sz0
        ch_ = _choose(new, sz)
        while sz > 5 and ch_ is None:
            sz -= 0.25
            ch_ = _choose(new, sz)
        _vinfo['prefer_fallback_greedy'] = ch_ is None
        new = ch_ if ch_ is not None else wrap(new, sz)
'''

# 3. vertical anchor
TOP_OLD = "    top = centre + (len(new) - 1) / 2.0 * lead\n"
TOP_NEW = '''    top = centre + (len(new) - 1) / 2.0 * lead
    if _vcentre is not None:
        top = _vcentre + (len(new) - 1) / 2.0 * lead - (C3B_ASC - C3B_DESC) / 2.0 * sz
    elif C3B_VARIANT == 'V3L' and _cz is not None and _cz['cls'] == 'OPEN' and len(new) > len(ls):
        _src_top = max(projs) + C3B_ASC * sz0          # source glyph-box top edge (normal coordinate)
        _src_bot = min(projs) - C3B_DESC * sz0
        if _cz['room_up'] <= _cz['room_down']:          # nearer obstacle ABOVE: pin top, grow down
            top = _src_top - C3B_ASC * sz
            _edge = ('up', _src_top)
        else:                                           # nearer obstacle BELOW: pin bottom, grow up
            top = _src_bot + C3B_DESC * sz + (len(new) - 1) * lead
            _edge = ('down', _src_bot)
    _vinfo.update(top=top, vcentre=_vcentre, edge=_edge)
'''

# 4. diag: carry the variant info
DG_OLD = "        bold=[ls[min(j, len(ls) - 1)][0]['font'] in BOLD for j in range(len(new))],\n    ))\n"
DG_NEW = "        bold=[ls[min(j, len(ls) - 1)][0]['font'] in BOLD for j in range(len(new))],\n        c3b=_vinfo,\n    ))\n"

for old, new in [(HEAD_OLD, HEAD_NEW), (REF_OLD, REF_NEW), (WS_OLD, WS_NEW), (TOP_OLD, TOP_NEW), (DG_OLD, DG_NEW)]:
    n = s.count(old)
    assert n == 1, f'anchor occurs {n} times: {old!r}'
    s = s.replace(old, new, 1)
p.write_text(s)
print('variant-patched', p)
