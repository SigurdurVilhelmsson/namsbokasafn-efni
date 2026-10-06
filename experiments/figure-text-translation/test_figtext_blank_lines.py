#!/usr/bin/env python3
"""§C140 '6', M2 - a visual line that draws only U+0020 is no line of its own (figtext.visual_lines).

    FIGTEXT_PYLIBS=./pylibs python3 -B -u test_figtext_blank_lines.py

Plain checks and a module-level `fails` list, like its siblings - there is no pytest in this tree. PURE: no
artwork, no cairo, nothing spawned. One file read: the committed fixture
evidence/2026-10-06-c140-v6-m2/foodlabel-purple-runs.json (11 runs of CNX_Chem_05_02_FoodLabel blocks 41-46,
verbatim, and a `containers` snapshot of those blocks' real cell; provenance in that directory's README).

Design: docs/superpowers/specs/2026-10-05-c140-composer-formatting-class-design.md, D-b (ruling R-17). The
defect: `figtext.group()`'s `nl` rule attaches the NEXT row's indent space (a run of one U+0020) to the block
above, so `(cid:127) 5% or less| `, `(cid:127) 20% or| ` and `more is| ` read as two visual lines. compose.py
then drew `more is` as `meira` / `er` from x 385.611 (the space's x), and `er` landed on `hátt`; heldplan refused
[USER]'s one-line bullets `line-count`. The fix folds such a line into its neighbour (`visual_lines`), takes the
geometry from the ink runs (`visual_ink`) and keeps the pre-fold lines for the ALIGNMENT decision only
(`visual_lines_unfolded`).

WHAT IS PINNED, AND WHY EACH ONE CAN FAIL
----------------------------------------
* C1  CONTROL: the six block keys are unmoved (blockkey stays on FT.lines; a bought key that moved would orphan
      its sidecar value).
* T1, T1c  the bullet block (42) and `more is` (45) have ONE visual line, not two. Red on the pre-M2 composer.
* T1b CONTROL: the visual lines still partition every block, in order (heldplan and compose sum offsets).
* T2  `visual_ink` of `more is` starts at the ink run's 389.611, not the folded space's 385.611 (abs < 0.01;
      the run's x is a 3-decimal value). Red before M2 (no visual_ink).
* T3, T3b  CONTROLS: a line of `\\x1f` (a glyph, blockkey.py) and a line of U+00A0 are NOT blank - only U+0020 is
      measured blank on the corpus (8 of 8 whitespace-only FT.lines). A `strip()`-based predicate turns both red.
* T4  CONTROL: the blocks with no blank line keep their FT.lines partition (3/1/1), and ink == visual.
* T4b CONTROL: an all-blank block is left as it is (the identity rule; Frequency's single ' ' blocks).
* T4c a FIRST blank line folds forward onto the next line, and the ink is the next line alone. A design pin with
      0 corpus instances (census `firstBlank` []). Red before M2.
* T9  CONTROL (arm C's property): `figcontainers.cell_alignment` on blocks 42/44/45 with the snapshot's own source
      margins is `left` (`multi(...)`), the pre-M2 decision. Folding the frames too (the rejected arm B) moves them
      to the single-line margin rule - right/center/center - and turns T9 red.
Every check guards a missing `visual_ink` with getattr, so the pre-M2 run reports a red per check, not one crash.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent          # never process.cwd() - repo rule
sys.path.insert(0, str(HERE))

import figtext as FT                            # noqa: E402
import figcontainers as FC                      # noqa: E402
import blockkey as BK                           # noqa: E402

FIXTURE = HERE / 'evidence' / '2026-10-06-c140-v6-m2' / 'foodlabel-purple-runs.json'
FX = json.loads(FIXTURE.read_text(encoding='utf-8'))
KEYS = ['Quick|guide to|% DV', '(cid:127) 5% or less| ', 'is low', '(cid:127) 20% or| ', 'more is| ', 'high']

fails = []


def check(label, ok, detail=''):
    print(('  PASS  ' if ok else '  FAIL  ') + label + (': ' + detail if detail else ''), flush=True)
    if not ok:
        fails.append(label)


def attempt(label, fn):
    """Run one arm; an exception is a FAIL of that arm, never a crash of the file."""
    try:
        fn()
    except Exception as e:                      # noqa: BLE001 - reported, not swallowed
        check(label + ' (raised)', False, f'{type(e).__name__}: {e}')


ink = getattr(FT, 'visual_ink', None)


def ids(ls):
    return [[id(r) for r in l] for l in ls]


def texts(ls):
    return [[r['text'] for r in l] for l in ls]


blocks = FT.merge_blocks(FT.group(FX['runs']))
keys = [BK.block_key(b) for b in blocks]
check('C1 CONTROL: the six block keys did not move (bought sidecar keys stay addressable)', keys == KEYS, repr(keys))
by = dict(zip(keys, blocks))
B42, B44, B45 = by['(cid:127) 5% or less| '], by['(cid:127) 20% or| '], by['more is| ']


def t1():
    check('T1 bullet block 42: its blank 2nd line is no visual line (2 -> 1)', len(FT.visual_lines(B42)) == 1,
          repr(texts(FT.visual_lines(B42))))
    check('T1c `more is` block 45: 2 -> 1 visual line', len(FT.visual_lines(B45)) == 1,
          repr(texts(FT.visual_lines(B45))))
    check('T1b CONTROL: visual lines still partition every block, in order',
          all([id(r) for l in FT.visual_lines(b) for r in l] == [id(r) for r in b] for b in blocks))


def t2():
    s45 = None if ink is None else min(FT.along(r) for r in ink(B45)[0])
    check("T2 the ink geometry of `more is` starts at the source 389.611, not the blank's 385.611",
          s45 is not None and abs(s45 - 389.611) < 0.01, repr(s45))


def t3():
    x1f = B45[:-1] + [dict(B45[-1], text='\x1f')]
    check('T3 CONTROL: a \\x1f line is NOT blank (it is a glyph)', len(FT.visual_lines(x1f)) == 2,
          repr(texts(FT.visual_lines(x1f))))
    nb = B45[:-1] + [dict(B45[-1], text=' ')]
    check('T3b CONTROL: a U+00A0 line is NOT blank (only U+0020 is measured on the corpus)',
          len(FT.visual_lines(nb)) == 2, repr(texts(FT.visual_lines(nb))))
    if hasattr(FT, 'is_blank_line'):
        check('T3c is_blank_line: U+0020 yes; empty, U+00A0, \\x1f and a letter no',
              [FT.is_blank_line([dict(B45[-1], text=t)]) for t in (' ', '  ', '', ' ', '\x1f', 'a')]
              == [True, True, False, False, False, False])
    else:
        check('T3c is_blank_line exists', False, 'figtext has no is_blank_line')


def t4():
    others = [by[k] for k in ('Quick|guide to|% DV', 'is low', 'high')]
    check('T4 CONTROL: blocks with no blank line keep their FT.lines partition (3/1/1 lines), ink == visual',
          [len(FT.visual_lines(b)) for b in others] == [3, 1, 1]
          and all(ids(FT.visual_lines(b)) == ids(FT.lines(b)) for b in others)
          and (ink is None or all(ids(ink(b)) == ids(FT.visual_lines(b)) for b in others)),
          repr([len(FT.visual_lines(b)) for b in others]))
    sp = B45[-1]
    allblank = [dict(sp), dict(sp, y=sp['y'] - 5.5, tm=sp['tm'][:5] + [sp['y'] - 5.5])]
    check("T4b CONTROL: an all-blank block is left as it is (identity rule; Frequency's single ' ' blocks)",
          len(FT.visual_lines(allblank)) == len(FT.lines(allblank)) == 2,
          f'{len(FT.visual_lines(allblank))} visual, {len(FT.lines(allblank))} FT.lines')
    first = [dict(sp, y=B45[0]['y'] + 5.5, tm=sp['tm'][:5] + [B45[0]['y'] + 5.5])] + B45[:1]
    fl = FT.visual_lines(first)
    check('T4c design pin: a FIRST blank line folds forward onto the next line (0 corpus instances), its ink is '
          'that line alone', len(FT.lines(first)) == 2 and len(fl) == 1 and ink is not None
          and texts(ink(first)) == [['more is']] and ids(fl) == [[id(r) for r in first]],
          f'visual {texts(fl)} ink {None if ink is None else texts(ink(first))}')


def t9():
    cont = FX['containers']
    got = {}
    for k, i in (('(cid:127) 5% or less| ', '1'), ('(cid:127) 20% or| ', '3'), ('more is| ', '4')):
        c = cont[i]
        got[k] = FC.cell_alignment(by[k], c['src_left_margin'], c['src_right_margin'])
    check("T9 CONTROL (arm C's property): blocks 42/44/45 keep the pre-M2 alignment decision - left, multi-line",
          all(a == 'left' and w.startswith('multi(') for a, w in got.values()), repr(got))


for name, fn in (('T1', t1), ('T2', t2), ('T3', t3), ('T4', t4), ('T9', t9)):
    attempt(name, fn)

print(f"\n{'ALL PASS' if not fails else str(len(fails)) + ' FAILED: ' + ', '.join(fails)}")
sys.exit(1 if fails else 0)
