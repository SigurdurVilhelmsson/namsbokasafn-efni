#!/usr/bin/env python3
"""figlayout.decide - the §C140 ③ layout decision, with a FAKE width function (no cairo, no PDFs).

    PYTHONDONTWRITEBYTECODE=1 python3 test_figlayout.py

The fake width: every character is 0.5 em except 'ó' (0.9 em), scaled by a styled character's ratio - so 9 pt
text is 4.5 pt per ordinary character. Every number asserted below is derived from that in a comment beside it.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / 'pylibs'))

import figlayout as FLY

fails = []


def check(label, ok, detail=''):
    print(('  PASS  ' if ok else '  FAIL  ') + label + (': ' + detail if detail else ''), flush=True)
    fails.append(label) if not ok else None


EM = {'ó': 0.9}


def fw(chars, size, j):
    return sum(size * EM.get(ch, 0.5) * (st[0] if st else 1.0) for ch, st in chars)


def words_of(text):
    return [(w, [None] * len(w)) for w in text.split()]


def texts(lay):
    return [''.join(ch for ch, _ in line) for line in lay['lines']]


def near(a, b, tol=1e-9):
    return abs(a - b) <= tol


def box(L, R, D, U, up=5.0, down=5.0):
    return dict(cls='box', why='test', L=L, R=R, D=D, U=U, src_left_margin=5.0, src_right_margin=5.0,
                src_up_margin=up, src_down_margin=down, align='center', align_why='box')


def cell(L, R, D, U, align, up=5.0, down=5.0):
    return dict(cls='cell', why='test', L=L, R=R, D=D, U=U, src_left_margin=5.0, src_right_margin=5.0,
                src_up_margin=up, src_down_margin=down, align=align, align_why='test')


def open_(FL, FR, align, room_up=0.0, room_down=0.0):
    return dict(cls='open', why='test', FL=FL, FR=FR, room_up=room_up, room_down=room_down,
                free_left_clear=5.0, free_right_clear=5.0, align=align, align_why='test')


def cues(n_src=1, sz0=9.0, starts=None, ends=None, projs=None):
    starts = starts if starts is not None else [10.0] * n_src
    ends = ends if ends is not None else [s + 20.0 for s in starts]
    projs = projs if projs is not None else [50.0 - k * sz0 * 1.222 for k in range(n_src)]
    return dict(n_src=n_src, sz0=sz0, starts=starts, ends=ends, projs=projs)


def decide(text_or_words, container, cu, floor=7.5, pad=2.0, width=fw, **kw):
    ws = words_of(text_or_words) if isinstance(text_or_words, str) else text_or_words
    return FLY.decide(ws, width, container, cu, floor=floor, pad=pad, **kw)


print('sizes and the effective floor')
check('size steps 9.0 -> 7.5 inclusive', FLY.size_steps(9.0, 7.5) == [9.0, 8.75, 8.5, 8.25, 8.0, 7.75, 7.5],
      str(FLY.size_steps(9.0, 7.5)))
check('a 7 pt source never enlarged: size steps are [7.0]', FLY.size_steps(7.0, 7.5) == [7.0])
_s = FLY.size_steps(9.0001, 7.5)
# [F3] 9.0001 - 6 * 0.25 = 7.5001 is 1e-4 above the floor, so the floor itself is appended (8 steps, not 7).
check('[F3] a 9.0001 pt source steps to 7.5001 and then to the floor 7.5 itself',
      len(_s) == 8 and near(_s[-2], 7.5001, 1e-6) and _s[-1] == 7.5, str(_s))
# [F3] off the 0.25 grid: 8.9 ... 7.65 never lands on 7.5, which is appended.
_s = FLY.size_steps(8.9, 7.5)
check('[F3] an 8.9 pt source (off the grid) ends 7.65, 7.5',
      len(_s) == 7 and all(near(a, b, 1e-9) for a, b in zip(_s, [8.9, 8.65, 8.4, 8.15, 7.9, 7.65, 7.5])), str(_s))
# [F3] reviewer D2: 'aaaaaaa' (7 chars) is 26.775 at 7.65 and 26.25 at 7.5; box R 30.4 -> budget 26.4. It fits at the
# floor, so it must be drawn there - not named as overflowing at 7.65, the last grid step above the floor.
_l = decide('aaaaaaa', box(0, 30.4, 0, 100), cues(sz0=8.9))
check('[F3] an 8.9 pt label that fits only at the floor is drawn at 7.5 with step fit and no overflow',
      _l['size'] == 7.5 and _l['step'] == 'fit' and _l['overflow'] is None, f"{_l['size']} {_l['step']} {_l['overflow']}")
# 'aaaaaaaaaa' at 7 pt = 35 pt in a box of width budget 36 - 30 (R 34) ... does not fit -> floor-overflow AT 7.0
_l = decide('aaaaaaaaaa', box(0, 20, 0, 30), cues(sz0=7.0))
check('7 pt label that cannot fit is drawn at 7.0 (never enlarged, never below)', _l['size'] == 7.0, str(_l['size']))
check('... and named as overflow at 7.0', _l['overflow'] is not None and _l['overflow']['sizePt'] == 7.0)
# 'aaaaaaaaaaaaaaaaaaaa' (20 chars) at 7.5 = 75 pt > 36: shrink stops at the floor
_l = decide('aaaaaaaaaaaaaaaaaaaa', box(0, 40, 0, 30), cues())
check('a 9 pt label that cannot fit stops at exactly 7.5', _l['size'] == 7.5, str(_l['size']))
check('lead is the SOURCE body size * 1.222, not the shrunk size', near(_l['lead'], 9.0 * 1.222))

print('box (R2)')
# L 0 R 60: width budget 56; U 40: height budget 36. 'Hvarfefni' 9 chars = 40.5 pt at 9 -> fits, 1 line.
_l = decide('Hvarfefni', box(0, 60, 0, 40), cues())
check('box single word fits at sz0, step fit, no overflow',
      _l['step'] == 'fit' and _l['size'] == 9.0 and _l['overflow'] is None and texts(_l) == ['Hvarfefni'],
      f"{_l['step']} {_l['size']} {texts(_l)}")
check('box line centred on (L+R)/2', near(_l['x0'][0] + _l['widths'][0] / 2, 30.0), str(_l['x0']))
check('box anchor is (L+R)/2 and align centre', _l['anchor'] == 30.0 and _l['align'] == 'center')
# 3 source lines, 'aaaaaaa bbbbbbbbbbb ccccc': 1 line 25 chars = 112.5 > 56; 3 lines 7/11/5 -> 49.5 fits
_l = decide('aaaaaaa bbbbbbbbbbb ccccc', box(0, 60, 0, 40), cues(n_src=3))
check('box multi-line: 3 lines (closest to the source)', texts(_l) == ['aaaaaaa', 'bbbbbbbbbbb', 'ccccc'], str(texts(_l)))
check('box multi-line: EVERY line centred on (L+R)/2',
      all(near(x + w / 2, 30.0) for x, w in zip(_l['x0'], _l['widths'])), str(_l['x0']))
_n = len(_l['lines'])
check('box vertical: glyph box centred in the container',
      near(_l['top'], 20.0 + (_n - 1) / 2 * _l['lead'] - (0.73 - 0.21) / 2 * 9.0), str(_l['top']))
_gt = _l['top'] + 0.73 * 9.0
_gb = _l['top'] - (_n - 1) * _l['lead'] - 0.21 * 9.0
check('box vertical: glyph-box centre == (D+U)/2', near((_gt + _gb) / 2, 20.0), f'{(_gt + _gb) / 2}')
check('box has no displacement', _l['disp'] == 0.0 and _l['vdisp'] == 0.0)

# HEIGHT BUDGET BINDS. U 20 -> height budget 16. 2 lines at 9: 10.998 + 8.46 = 19.46 > 16; 1 line 8.46 fits.
# 'aaaaa bbbbbbb' 13 chars: 58.5 > 56 at 9, so width alone picks 2 lines at 9.0; with the height budget the only
# height-fitting count is 1, which first fits width at 8.5 (13 * 4.25 = 55.25).
_l = decide('aaaaa bbbbbbb', box(0, 60, 0, 20), cues(n_src=2))
check('height budget binds: 1 line at 8.5 instead of 2 lines at 9.0',
      texts(_l) == ['aaaaa bbbbbbb'] and _l['size'] == 8.5, f"{texts(_l)} {_l['size']}")
check('height budget binds: heightFit True, no overflow', _l['heightFit'] is True and _l['overflow'] is None)
_g = _l['top'] + 0.73 * _l['size'], _l['top'] - 0.21 * _l['size']
check('height budget binds: drawn glyph box inside [D+pad, U-pad]', _g[1] >= 2.0 - 1e-9 and _g[0] <= 18.0 + 1e-9, str(_g))
# [F2] HEIGHT NEVER FITS: U 6 -> height budget 2 < one line at the floor (0.94 * 7.5 = 7.05). Width alone picks the
# source's 2 lines (at 9.0 'bbbbbbb' is 31.5 <= 56); that count is KEPT and shrunk to the floor, where its glyph box
# is (2-1) * 10.998 + 0.94 * 7.5 = 18.048 > 2 - so the overhang is NAMED on the height axis, never silent.
_l = decide('aaaaa bbbbbbb', box(0, 60, 0, 6), cues(n_src=2))
check('[F2] height never fits: the width-chosen line count is kept and shrunk to the floor (2 lines at 7.5)',
      texts(_l) == ['aaaaa', 'bbbbbbb'] and _l['size'] == 7.5, f"{texts(_l)} {_l['size']}")
_o = _l['overflow'] or {}
check('[F2] height never fits: NAMED - word None, needPt = glyph-box height 18.048, budgetPt 2, sizePt 7.5, axis height',
      _o.get('axis') == 'height' and 'word' in _o and _o['word'] is None and near(_o.get('needPt', 0), 18.048)
      and near(_o.get('budgetPt', 0), 2.0) and _o.get('sizePt') == 7.5 and 'linePt' not in _o, str(_l['overflow']))
check('[F2] height never fits: step floor-overflow, heightFit False', _l['step'] == 'floor-overflow'
      and _l['heightFit'] is False, f"{_l['step']} {_l['heightFit']}")
# [F2] reviewer A: box 0-50 x 0-12 (budgets 46 / 8), 1-line source. One line never fits width (17 chars = 63.75 at
# 7.5); two lines fit width at 9.0 but never height. Drawn 2 lines at the floor, named: 18.048 > 8.
_l = decide('aaaaaaaa bbbbbbbb', box(0, 50, 0, 12), cues())
_o = _l['overflow'] or {}
check('[F2] reviewer A (box): 2 lines at 7.5, height overhang named 18.048 > 8',
      texts(_l) == ['aaaaaaaa', 'bbbbbbbb'] and _l['size'] == 7.5 and _o.get('axis') == 'height'
      and near(_o.get('needPt', 0), 18.048) and near(_o.get('budgetPt', 0), 8.0), f"{texts(_l)} {_l['size']} {_o}")
# [F2] reviewer B: the same label in a table CELL of the same size - the cell path is the same branch.
_l = decide('aaaaaaaa bbbbbbbb', cell(0, 50, 0, 12, 'left'), cues())
_o = _l['overflow'] or {}
check('[F2] reviewer B (cell): 2 lines at 7.5, height overhang named 18.048 > 8',
      texts(_l) == ['aaaaaaaa', 'bbbbbbbb'] and _l['size'] == 7.5 and _o.get('axis') == 'height'
      and near(_o.get('needPt', 0), 18.048) and near(_o.get('budgetPt', 0), 8.0), f"{texts(_l)} {_l['size']} {_o}")
# [F2] WIDTH at no size AND height at the floor: the width path names the WORD (axis width); heightFit False is the
# only trace of the height miss (one overflow per label). 'Prósentusamsetning' 70.5 > 36 at 7.5; one line is 7.05 > 2.
_l = decide('Prósentusamsetning', box(0, 40, 0, 6), cues())
check('[F2] width AND height missed: the word is named on the width axis, heightFit False',
      (_l['overflow'] or {}).get('axis') == 'width' and _l['overflow']['word'] == 'Prósentusamsetning'
      and _l['heightFit'] is False, f"{_l['overflow']} {_l['heightFit']}")
# ... AND the height miss is NAMED on the same entry, never left to heightFit alone (one line at 7.5: glyph box
# 0.94 * 7.5 = 7.05 against the height budget 6 - 2*2 = 2).
check('[F2] width AND height missed: the height overhang is named too - heightNeedPt 7.05, heightBudgetPt 2',
      near((_l['overflow'] or {}).get('heightNeedPt', -1), 7.05) and near(_l['overflow'].get('heightBudgetPt', -1), 2.0),
      f"{_l['overflow']}")
# CONTROL: a width overflow whose glyph box DOES fit carries no height fields.
_l = decide('Prósentusamsetning', box(0, 40, 0, 30), cues())
check('[F2] CONTROL width overflow with height met: no heightNeedPt / heightBudgetPt',
      (_l['overflow'] or {}).get('axis') == 'width' and 'heightNeedPt' not in _l['overflow']
      and 'heightBudgetPt' not in _l['overflow'] and _l['heightFit'] is True, f"{_l['overflow']} {_l['heightFit']}")
# Shrink stops at the floor; a word wider than the budget at the floor is NAMED with need/budget/size.
# 'Prósentusamsetning' at 7.5: 17 chars * 3.75 + 0.9 * 7.5 = 63.75 + 6.75 = 70.5 > 36 (R 40).
_l = decide('Prósentusamsetning', box(0, 40, 0, 30), cues())
_o = _l['overflow'] or {}
check('box floor-overflow: step, size 7.5', _l['step'] == 'floor-overflow' and _l['size'] == 7.5, f"{_l['step']} {_l['size']}")
check('box floor-overflow: word named with needPt / budgetPt / sizePt',
      _o.get('word') == 'Prósentusamsetning' and near(_o.get('needPt', 0), 70.5) and near(_o.get('budgetPt', 0), 36.0)
      and _o.get('sizePt') == 7.5, str(_o))
check('box floor-overflow: still centred (overhangs both sides equally)',
      near(_l['x0'][0] + _l['widths'][0] / 2, 20.0))
check('[F2] box floor-overflow is on the width axis', _o.get('axis') == 'width', str(_o))
check('[F4] box floor-overflow carries linePt = the widest drawn line (== needPt 70.5: one word, one line)',
      near(_o.get('linePt', 0), 70.5), str(_o))
# Two long words at the floor: 'aaaaaaaaaaa' (11 -> 41.25) and 'bbbbbbbbbb' (10 -> 37.5), budget 36:
# the partition is held to max(36, 41.25) -> one word per line, and the WIDEST word is the one named.
_l = decide('bbbbbbbbbb aaaaaaaaaaa', box(0, 40, 0, 30), cues(n_src=1))
check('box floor-overflow: partitioned under max(budget, widest word) -> 2 lines',
      texts(_l) == ['bbbbbbbbbb', 'aaaaaaaaaaa'], str(texts(_l)))
check('box floor-overflow: the widest word (not the first) is named, need 41.25',
      (_l['overflow'] or {}).get('word') == 'aaaaaaaaaaa' and near(_l['overflow']['needPt'], 41.25), str(_l['overflow']))
check('[F4] box floor-overflow over two lines: linePt is the widest drawn line 41.25 (<= needPt by construction)',
      near((_l['overflow'] or {}).get('linePt', 0), 41.25), str(_l['overflow']))

print('table cell (R3)')
# Right-flush source: start 55.4, end 95. 'Mólmassi' = 7 * 4.5 + 8.1 = 39.6 at 9; x0 = 55.4, inside [2, 98].
_c = cell(0, 100, 0, 20, 'right')
_l = decide('Mólmassi', _c, cues(starts=[60.0], ends=[95.0], projs=[8.0]))
check('right cell: anchor is max(ends)', _l['anchor'] == 95.0 and _l['align'] == 'right')
check('right cell: stays right-flush (right edge == source right edge)',
      near(_l['x0'][0] + _l['widths'][0], 95.0) and _l['disp'] == 0.0, f"{_l['x0']} {_l['widths']} {_l['disp']}")
# 'Molmassi efnasambands' = 21 * 4.5 = 94.5 <= 96: one line at 9, but from the anchor it starts at 0.5 < L+pad 2.
_l = decide('Molmassi efnasambands', _c, cues(starts=[60.0], ends=[95.0], projs=[8.0]))
check('right cell: long label keeps sz0 and one line', _l['size'] == 9.0 and len(_l['lines']) == 1, f"{_l['size']} {texts(_l)}")
check('right cell: displaced ONLY to stay inside (disp 1.5, left edge == L+pad)',
      near(_l['disp'], 1.5) and near(_l['x0'][0], 2.0), f"{_l['disp']} {_l['x0']}")
check('right cell: still right-aligned after displacement (right edge == anchor + disp)',
      near(_l['x0'][0] + _l['widths'][0], 96.5))
# Left and centre cells use the source anchor for their alignment.
_l = decide('Mól', cell(0, 100, 0, 20, 'left'), cues(n_src=2, starts=[12.0, 14.0], ends=[40.0, 30.0]))
check('left cell: anchor is min(starts), x0 == anchor', _l['anchor'] == 12.0 and near(_l['x0'][0], 12.0), str(_l['x0']))
_l = decide('Mól', cell(0, 100, 0, 20, 'center'), cues(n_src=2, starts=[12.0, 14.0], ends=[40.0, 30.0]))
check('centre cell: anchor is mean of (start+end)/2', near(_l['anchor'], (26.0 + 22.0) / 2), str(_l['anchor']))
# Vertical clamp. Cell D 0 U 24 (height budget 20). 'aaaaaaa bbbbbbb' 67.5 > 36 (R 40) -> 2 lines of 31.5, height
# 19.46 <= 20. Source proj 13 -> top = 13 + 5.499 = 18.499, glyph top 25.069 > U - min(2, 4.43) = 22 -> shift -3.069.
_l = decide('aaaaaaa bbbbbbb', cell(0, 40, 0, 24, 'center', up=4.43, down=5.0), cues(n_src=1, starts=[5.0], ends=[35.0], projs=[13.0]))
check('cell vertical: 2 lines at 9', texts(_l) == ['aaaaaaa', 'bbbbbbb'] and _l['size'] == 9.0, str(texts(_l)))
check('cell vertical: clamped just inside (glyph top == U - min(pad, src up margin))',
      near(_l['top'] + 0.73 * 9.0, 22.0) and _l['vdisp'] < 0, f"top {_l['top']} vdisp {_l['vdisp']}")
check('cell vertical: vdisp is the minimal shift', near(_l['vdisp'], 22.0 - (13.0 + 0.5 * 9 * 1.222 + 0.73 * 9)))
# The vertical clamp uses min(pad, src margin): a source that sat 1 pt from the top may stay 1 pt from the top.
_l = decide('aaaaaaaaaa', cell(0, 100, 0, 20, 'center', up=1.0), cues(starts=[5.0], ends=[50.0], projs=[20.0 - 1.0 - 0.73 * 9]))
check('cell vertical: an unchanged source position (1 pt from the top) does not move', near(_l['vdisp'], 0.0), str(_l['vdisp']))

print('open (steps i..v)')
# (i): left anchor 10, FL 0 FR 100: b_i = 88. 10 chars = 45.
_l = decide('aaaaaaaaaa', open_(0, 100, 'left'), cues(starts=[10.0]))
check('open (i): fits from the anchor at sz0, no displacement',
      _l['step'] == 'i' and _l['size'] == 9.0 and _l['disp'] == 0.0 and near(_l['x0'][0], 10.0), f"{_l['step']} {_l['x0']}")
# (ii): anchor 60 -> b_i 38, b_ii 96. 20 chars = 90.
_l = decide('a' * 20, open_(0, 100, 'left'), cues(starts=[60.0]))
check('open (ii): sz0, displaced', _l['step'] == 'ii' and _l['size'] == 9.0, f"{_l['step']} {_l['size']}")
check('open (ii): displacement is minimal (right edge == FR - pad)',
      near(_l['x0'][0] + _l['widths'][0], 98.0) and near(_l['disp'], -52.0), f"{_l['x0']} {_l['disp']}")
# (iii-anchor): FL 8, FR 100, anchor 8: b_i = 90, b_ii = 88. 21 chars: 94.5 / 91.875 / 89.25 at 9 / 8.75 / 8.5.
_l = decide('a' * 21, open_(8, 100, 'left'), cues(starts=[8.0]))
check('open (iii-anchor): shrinks to 8.5 at the anchor',
      _l['step'] == 'iii-anchor' and _l['size'] == 8.5 and _l['disp'] == 0.0, f"{_l['step']} {_l['size']} {_l['disp']}")
# (iii-displaced): anchor 60, b_ii 96. 22 chars: 99 / 96.25 / 93.5.
_l = decide('a' * 22, open_(0, 100, 'left'), cues(starts=[60.0]))
check('open (iii-displaced): shrinks to 8.5 and is displaced minimally',
      _l['step'] == 'iii-displaced' and _l['size'] == 8.5 and near(_l['x0'][0] + _l['widths'][0], 98.0),
      f"{_l['step']} {_l['size']} {_l['x0']}")
# (iv): FL 0 FR 40, anchor 2: b_i = b_ii = 36. 'aaaaaaa bbbbbbb' on 1 line is 56.25 at the floor -> no (i)-(iii).
# room_down 20 > room_up 5 -> grow down; 20 - 1 * 10.998 = 9.002 >= 2 -> n 2 at 9 (31.5 <= 36).
_cu = cues(starts=[2.0], ends=[30.0], projs=[50.0])
_l = decide('aaaaaaa bbbbbbb', open_(0, 40, 'left', room_up=5.0, room_down=20.0), _cu)
check('open (iv): gains a line at sz0', _l['step'] == 'iv-gain' and texts(_l) == ['aaaaaaa', 'bbbbbbb'] and _l['size'] == 9.0,
      f"{_l['step']} {texts(_l)} {_l['size']}")
check('open (iv) grow down: the source glyph-box TOP edge is pinned',
      _l['step'] == 'iv-gain' and len(_l['lines']) == 2 and near(_l['top'] + 0.73 * 9.0, 50.0 + 0.73 * 9.0),
      f"{_l['step']} {_l['top']}")
check('open (iv): no overflow', _l['overflow'] is None)
_l = decide('aaaaaaa bbbbbbb', open_(0, 40, 'left', room_up=20.0, room_down=5.0), _cu)
check('open (iv) grow up: the source glyph-box BOTTOM edge is pinned',
      _l['step'] == 'iv-gain' and near(_l['top'] - _l['lead'] - 0.21 * 9.0, 50.0 - 0.21 * 9.0), f"{_l['step']} {_l['top']}")
# (iv) boundary: room 13 -> 13 - 10.998 = 2.002 >= 2 gains; room 12.9 -> 1.902 < 2 does not.
_l = decide('aaaaaaa bbbbbbb', open_(0, 40, 'left', room_up=5.0, room_down=13.0), _cu)
check('open (iv): room - extra >= pad gains (room 13)', _l['step'] == 'iv-gain', _l['step'])
# (iv) at a shrunk size: FR 34 -> b_i = b_ii = 30; 2 lines of 7 chars are 31.5 / 30.625 / 29.75 at 9 / 8.75 / 8.5.
# The pin uses the SOURCE glyph box (sz0) and the drawn size: glyph top = 50 + 0.73 * 9.
_l = decide('aaaaaaa bbbbbbb', open_(0, 34, 'left', room_up=5.0, room_down=20.0), _cu)
check('open (iv) at 8.5: glyph top pinned to the source glyph top (sz0 vs drawn size kept apart)',
      _l['step'] == 'iv-gain' and _l['size'] == 8.5 and near(_l['top'] + 0.73 * 8.5, 50.0 + 0.73 * 9.0),
      f"{_l['step']} {_l['size']} {_l['top']}")
# (v) line-count overhang: every word fits b_ii (7 chars at 7.5 = 26.25 <= 36) but 1 line at the floor is 56.25.
_l = decide('aaaaaaa bbbbbbb', open_(0, 40, 'left', room_up=5.0, room_down=12.9), _cu)
_o = _l['overflow'] or {}
check('open (v): no room to gain -> source line count at the floor', _l['step'] == 'v-overflow' and _l['size'] == 7.5
      and texts(_l) == ['aaaaaaa bbbbbbb'], f"{_l['step']} {_l['size']} {texts(_l)}")
check('open (v) line-count overhang NAMED: word None, needPt = widest line, budgetPt = b_ii',
      'word' in _o and _o['word'] is None and near(_o['needPt'], 56.25) and near(_o['budgetPt'], 36.0) and _o['sizePt'] == 7.5, str(_o))
check('[F2] open (v) line-count overhang is on the width axis', _o.get('axis') == 'width', str(_o))
check('[F4] open (v) line-count overhang: linePt == needPt 56.25 (both are the widest drawn line)',
      near(_o.get('linePt', 0), 56.25), str(_o))
# (v) word overflow: 'Prósentusamsetning' 70.5 at 7.5 > b_ii 36.
_l = decide('Prósentusamsetning', open_(0, 40, 'left', room_up=30.0, room_down=30.0), _cu)
_o = _l['overflow'] or {}
check('open (v) word overflow NAMED with need / budget / size',
      _l['step'] == 'v-overflow' and _o.get('word') == 'Prósentusamsetning' and near(_o.get('needPt', 0), 70.5)
      and near(_o.get('budgetPt', 0), 36.0) and _o.get('sizePt') == 7.5, f"{_l['step']} {_o}")
check('[F2] open (v) word overflow is on the width axis', _o.get('axis') == 'width', str(_o))
# [F4] reviewer E: the source line count (1) is forced at the floor, so every word shares ONE drawn line.
# 'aaaaaaaaa bb cc dd' is 18 chars = 67.5 at 7.5; the widest word 'aaaaaaaaa' is 33.75; centre anchor 15 in FL 0 FR 30
# -> b_i = b_ii = 26. needPt stays the word (33.75); linePt says how far the drawn line really overhangs (67.5).
_l = decide('aaaaaaaaa bb cc dd', open_(0, 30, 'center'), cues(n_src=1, starts=[5.0], ends=[25.0]))
_o = _l['overflow'] or {}
check('[F4] open (v) word overflow: needPt stays the word 33.75, linePt is the drawn line 67.5',
      _l['step'] == 'v-overflow' and _o.get('word') == 'aaaaaaaaa' and near(_o.get('needPt', 0), 33.75)
      and near(_o.get('linePt', 0), 67.5) and near(_o.get('budgetPt', 0), 26.0), f"{_l['step']} {_o} {_l['widths']}")
# centre open budget from the anchor: 2 * (min(anchor - FL, FR - anchor) - pad).
_l = decide('a' * 10, open_(0, 100, 'center'), cues(starts=[20.0], ends=[40.0]))
check('open centre (i): anchor mean of (start+end)/2, line centred on it',
      _l['step'] == 'i' and near(_l['x0'][0] + _l['widths'][0] / 2, 30.0), f"{_l['step']} {_l['x0']}")
# centre anchor 20 near FL 0: b_i = 2 * (20 - 2) = 36 < 45 <= b_ii 96 -> (ii), pulled right just to FL + pad.
_l = decide('a' * 10, open_(0, 100, 'center'), cues(starts=[10.0], ends=[30.0]))
check('open centre (ii): from-anchor budget is 2*(min side - pad); displaced to FL + pad',
      _l['step'] == 'ii' and near(_l['x0'][0], 2.0) and near(_l['disp'], 4.5), f"{_l['step']} {_l['x0']} {_l['disp']}")

print('line partition')
_l = decide('Mólmassi', box(0, 100, 0, 60), cues(n_src=3))
check('fewer words than source lines: 1 word, 3 source lines -> 1 line', texts(_l) == ['Mólmassi'], str(texts(_l)))
_l = decide('aaa bbb ccc', box(0, 100, 0, 60), cues(n_src=3))
check('closest to source: 3 lines even though 1 line fits', texts(_l) == ['aaa', 'bbb', 'ccc'], str(texts(_l)))
# [F5] LINE COUNT BEFORE SIZE (box/cell). Reviewer H2: 1-line source 'aaaaa bbbbb' (11 chars: 49.5 / 48.125 / 46.75
# at 9 / 8.75 / 8.5); box R 51.4 -> budget 47.4. One line fits at 8.5, so the source count is kept and shrunk -
# never 2 lines at full size.
_l = decide('aaaaa bbbbb', box(0, 51.4, 0, 100), cues(n_src=1))
check('[F5] reviewer H2: a 1-line source that fits on 1 line at 8.5 draws 1 line at 8.5, not 2 lines at 9.0',
      texts(_l) == ['aaaaa bbbbb'] and _l['size'] == 8.5 and _l['step'] == 'fit', f"{texts(_l)} {_l['size']}")
# [F5] only when no count <= n_src fits even at the floor does a count > n_src get a turn, from sz0 down. Reviewer H:
# box R 44 -> budget 40; one line is 41.25 even at 7.5 -> 2 lines at 9.0 (5 chars = 22.5).
_l = decide('aaaaa bbbbb', box(0, 44, 0, 100), cues(n_src=1))
check('[F5] no count <= n_src fits at the floor: n_src + 1 lines from sz0 (2 lines at 9.0)',
      texts(_l) == ['aaaaa', 'bbbbb'] and _l['size'] == 9.0 and _l['overflow'] is None, f"{texts(_l)} {_l['size']}")
# [F5] under the height budget: box D 0 U 22.6 -> hb 18.6. The source's 2 lines need 10.998 + 0.94 s: 19.458 at 9.0,
# 18.753 at 8.25, 18.518 at 8.0 (fits). One line at 9.0 (49.5 <= 56, 8.46 tall) would fit too - but the count is
# decided before the size, so the 2 source lines are shrunk to 8.0.
_l = decide('aaaaa bbbbb', box(0, 60, 0, 22.6), cues(n_src=2))
check('[F5] height budget: the source line count shrinks to 8.0 before a fewer-line label at 9.0 is considered',
      texts(_l) == ['aaaaa', 'bbbbb'] and _l['size'] == 8.0 and _l['heightFit'] is True, f"{texts(_l)} {_l['size']}")


def penal(chars, size, j):
    """j-dependent: a line with index 1 that ends in 'zzz' costs 1000 pt."""
    t = ''.join(c for c, _ in chars)
    return fw(chars, size, j) + (1000.0 if j == 1 and t.endswith('zzz') else 0.0)


# n_src 2; n = 1 fits, both 2-line partitions put 'zzz' at the end of line 1, n = 3 fits (line 1 is 'yyy').
_l = decide('xxx yyy zzz', box(0, 100, 0, 60), cues(n_src=2), width=penal)
check('tie between n_src-1 and n_src+1 -> fewer lines', texts(_l) == ['xxx yyy zzz'], str(texts(_l)))
_l0 = decide('xxx yyy zzz', box(0, 100, 0, 60), cues(n_src=2))
check('tie control: with a j-blind width the same label takes the source count (so the partition DID measure '
      'each span at its own output line index j)', len(_l0['lines']) == 2, str(texts(_l0)))
# Balance: 'aaaaaaaaa bbb ccc ddddddddd' (9/3/3/9). Budget 76 (R 80) holds 17 chars (76.5 no, 17*4.5 = 76.5 > 76);
# use R 82 -> 78: greedy would take 'aaaaaaaaa bbb ccc' (17 -> 76.5); min-max takes 13 | 13.
_l = decide('aaaaaaaaa bbb ccc ddddddddd', box(0, 82, 0, 60), cues(n_src=2))
check('balance: min-max partition, not greedy', texts(_l) == ['aaaaaaaaa bbb', 'ccc ddddddddd'], str(texts(_l)))
# A min-max TIE ('aaaa | bbbb cccc' and 'aaaa bbbb | cccc' both 9 chars) takes the earliest break - the prototype's
# order, which the 176-block equivalence depends on.
_l = decide('aaaa bbbb cccc', box(0, 60, 0, 60), cues(n_src=2))
check('balance tie: the earliest break wins', texts(_l) == ['aaaa', 'bbbb cccc'], str(texts(_l)))

print('R9 short-token binding - symbols only ([USER] 2026-09-14)')
# [F1] 'Stig <t> lausnarefnis', 2 source lines, box R 72 (budget 68). 'Stig <t>' is 27 / 31.5 (1 / 2-char t),
# 'lausnarefnis' 54: unconstrained min-max = 'Stig <t> | lausnarefnis' (54). Binding t: 'Stig | <t> lausnarefnis'
# = 63 / 67.5 <= 68, so a binding token is honoured and a free one is not.
for _t in ('2', 'm2', 'Cu', 'Ar', 'A', 'K'):
    _l = decide(f'Stig {_t} lausnarefnis', box(0, 72, 0, 40), cues(n_src=2))
    check(f'[F1] a symbol {_t!r} still binds to the word after it',
          texts(_l) == ['Stig', f'{_t} lausnarefnis'] and _l['bound'] is True, str(texts(_l)))
for _t in ('af', 'og', 'á', 'í'):
    _l = decide(f'Stig {_t} lausnarefnis', box(0, 72, 0, 40), cues(n_src=2))
    check(f'[F1] a lowercase word {_t!r} may end a line (balance decides)',
          texts(_l) == [f'Stig {_t}', 'lausnarefnis'], str(texts(_l)))
# [F1] the REAL argon b0 shape. 'Mól af Ar | atómum (mól)' 44.1 / 61.2 (unconstrained 61.2); 'Mól af | Ar atómum (mól)'
# 30.6 / 74.7; 'Mól af Ar atómum | (mól)' 79.2 / 26.1; 'Mól | af Ar atómum (mól)' 17.1 / 88.2. Box R 84 (budget 80):
# 'Ar' binds and 'af' is free -> 74.7. (The literal rule, binding 'af' too, took 79.2.)
_l = decide('Mól af Ar atómum (mól)', box(0, 84, 0, 40), cues(n_src=2))
check('[F1] REAL argon b0 shape: Mól af | Ar atómum (mól)', texts(_l) == ['Mól af', 'Ar atómum (mól)'] and _l['bound'] is True,
      str(texts(_l)))
_l0 = decide('Mól af Ar atómum (mól)', box(0, 84, 0, 40), cues(n_src=2), _r9=False)
check('[F1] CONTROL: without R9 the same label breaks after Ar (so the binding above did the work)',
      texts(_l0) == ['Mól af Ar', 'atómum (mól)'], str(texts(_l0)))
# 'Massi A atóma' at 9: 'Massi A' 31.5, 'atóma' 4*4.5 + 8.1 = 26.1, 'Massi' 22.5, 'A atóma' 35.1, 1 line 62.1.
# Box R 60 (budget 56): unconstrained min-max = 'Massi A' | 'atóma' (31.5); binding 'Massi' | 'A atóma' (35.1) fits.
_l = decide('Massi A atóma', box(0, 60, 0, 40), cues(n_src=2))
check('R9 binds: Massi | A atóma', texts(_l) == ['Massi', 'A atóma'], str(texts(_l)))
check('R9 binds: bound True, size 9, 2 lines', _l['bound'] is True and _l['size'] == 9.0 and len(_l['lines']) == 2)
_l0 = decide('Massi A atóma', box(0, 60, 0, 40), cues(n_src=2), _r9=False)
check('R9 control: unconstrained balance picks Massi A | atóma (the case is not a tie)',
      texts(_l0) == ['Massi A', 'atóma'], str(texts(_l0)))
# Budget 33 (R 37): unconstrained 31.5 fits, binding 35.1 does not -> unconstrained, no shrink.
_l = decide('Massi A atóma', box(0, 37, 0, 40), cues(n_src=2))
check('R9 falls back: binding does not fit -> unconstrained Massi A | atóma at 9.0',
      texts(_l) == ['Massi A', 'atóma'] and _l['size'] == 9.0 and _l['bound'] is False, f"{texts(_l)} {_l['size']}")
# Open (i): anchor 65 -> b_i = 100 - 65 - 2 = 33, b_ii = 96. Binding fits b_ii but not b_i: step (i) holds.
_l = decide('Massi A atóma', open_(0, 100, 'left'), cues(n_src=2, starts=[65.0, 65.0], ends=[90.0, 90.0]))
check("R9 never changes the step: measured against (i)'s budget, stays unconstrained",
      _l['step'] == 'i' and texts(_l) == ['Massi A', 'atóma'] and _l['disp'] == 0.0, f"{_l['step']} {texts(_l)}")
# Binding never changes the line count: 2 words 'af Mól' in a 1-source-line label that fits -> 1 line.
_l = decide('af Mólmassi', box(0, 100, 0, 40), cues(n_src=1))
check('R9 never changes the line count', texts(_l) == ['af Mólmassi'], str(texts(_l)))

print('styles and alignment through width()')
_st = (0.78, -0.2, False)
_co2 = [('CO2', [None, None, _st])]
# styled 'CO2' = 4.5 + 4.5 + 3.51 = 12.51 at 9; flat 13.5. Box R 17 -> budget 13.
_l = decide(_co2, box(0, 17, 0, 40), cues())
check('styled word (ratio 0.78) measured through width(): fits at 9.0', _l['size'] == 9.0, str(_l['size']))
check('styled word: the drawn line carries the style per character', _l['lines'][0] == [('C', None), ('O', None), ('2', _st)])
_l = decide('CO2', box(0, 17, 0, 40), cues())
check('styled control: the same word unstyled must shrink (13.5 > 13 -> 8.5)', _l['size'] == 8.5, str(_l['size']))


def bold2(chars, size, j):
    return fw(chars, size, j) * (1.1 if j == 1 else 1.0)


_l = decide('aaaaaaa bbbbbbb', cell(0, 100, 0, 40, 'right'), cues(n_src=2, starts=[40.0, 40.0], ends=[90.0, 90.0], projs=[20.0, 9.0]),
            width=bold2)
check('x0 per line uses that line\'s own width(chars, size, j)',
      near(_l['widths'][1], 31.5 * 1.1) and all(near(x + w, 90.0) for x, w in zip(_l['x0'], _l['widths'])),
      f"{_l['widths']} {_l['x0']}")

print('contract')
try:
    FLY.decide([], fw, box(0, 10, 0, 10), cues())
    check('no words raises ValueError', False)
except ValueError:
    check('no words raises ValueError', True)
try:
    FLY.decide(words_of('a'), fw, dict(cls='mystery'), cues())
    check('unknown container class raises ValueError', False)
except ValueError:
    check('unknown container class raises ValueError', True)
_l = decide('Hvarfefni', box(0, 60, 0, 40), cues())
check('Layout carries every contract key',
      all(k in _l for k in ('lines', 'size', 'align', 'anchor', 'x0', 'top', 'lead', 'disp', 'vdisp', 'step', 'overflow')))
check('clamp_shift: inside -> 0; too far right -> exact pull-in; wider -> covers',
      FLY.clamp_shift(5, 10, 0, 20) == 0.0 and FLY.clamp_shift(15, 25, 0, 20) == -5 and FLY.clamp_shift(-5, 30, 0, 20) == 0.0)

print('\nALL PASS' if not fails else f'\n{len(fails)} FAILED: ' + ', '.join(fails))
sys.exit(1 if fails else 0)
