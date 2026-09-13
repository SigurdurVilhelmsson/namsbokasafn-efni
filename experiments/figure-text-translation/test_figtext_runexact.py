#!/usr/bin/env python3
"""E's pure decisions, tested alone (spec §C140 ① T1).

    FIGTEXT_PYLIBS=./pylibs python3 test_figtext_runexact.py

Plain asserts and a module-level `fails` list, like test_figtext_normalise.py - there is
no pytest in this tree.

WHAT IS PINNED
--------------
* `blockkey.block_english` - what emit-blocks.py SENT. It is the other half of "what was
  bought" (the key is the first), so it lives beside `block_key` and every consumer imports
  it. 🔴 THE DEGENERATE-ARC CASE IS THE REASON IT EXISTS: the 2a prototype derived the wire
  text from compose.py's own `arc`, which also requires a usable circle, while emit-blocks.py
  decides with `FT.is_arc` alone - so on a multi-line degenerate arc the prototype compared
  a reply against a string that was never sent.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent          # never process.cwd() - repo rule
sys.path.insert(0, str(HERE))

import _deps  # noqa: F401,E402 - puts this directory and FIGTEXT_PYLIBS on sys.path
import figtext as FT                            # noqa: E402
import blockkey as BK                            # noqa: E402

fails = []


def check(label, ok, detail=''):
    print(f"  {'PASS' if ok else 'FAIL'}  {label}" + (f": {detail}" if detail else ''),
          flush=True)
    if not ok:
        fails.append(label)


def run(text, x, y, size=12.0, rot=0.0, font='PAGE/F1'):
    return dict(text=text, font=font, size=size, rot=rot, x=x, y=y,
                adv=0.6 * size * len(text), fill=None)


# ── 1. block_english ────────────────────────────────────────────────────────────────
straight = [run('Mass of', 10, 100), run('reactant', 10, 100 - 12 * 1.222)]
check('1a PRECONDITION the straight block is two lines and not an arc',
      len(FT.lines(straight)) == 2 and not FT.is_arc(straight), repr(FT.lines(straight)))
check('1b a straight multi-line block sends its lines joined by ONE space',
      BK.block_english(straight) == 'Mass of reactant', repr(BK.block_english(straight)))

curved = [run('A', 10, 100, rot=10), run('B', 20, 99, rot=0),
          run('C', 30, 99, rot=-10), run('D', 40, 100, rot=-20)]
check('1c PRECONDITION the curved block is an arc',
      FT.is_arc(curved), repr([r['rot'] for r in curved]))
check('1d an arc sends its key - the bare concatenation',
      BK.block_english(curved) == BK.block_key(curved) == 'ABCD',
      repr(BK.block_english(curved)))

# Four single glyphs on TWO straight lines: is_arc says arc (len > 3, every run <= 1 char),
# although no circle fits. emit-blocks.py sends the key.
degen = [run('a', 10, 100), run('b', 20, 100),
         run('c', 10, 100 - 12 * 1.222), run('d', 20, 100 - 12 * 1.222)]
check('1e PRECONDITION the degenerate block is is_arc AND spans two lines',
      FT.is_arc(degen) and len(FT.lines(degen)) == 2, repr(BK.block_lines(degen)))
check('1f a degenerate multi-line arc sends its KEY, not its space-joined lines',
      BK.block_english(degen) == 'abcd', repr(BK.block_english(degen)))
check('1g CONTROL the space-joined form really differs here (the prototype\'s miss)',
      ' '.join(BK.block_lines(degen)) == 'ab cd', repr(' '.join(BK.block_lines(degen))))

print(f"\n{'ALL PASS' if not fails else str(len(fails)) + ' FAILED: ' + ', '.join(fails)}")
sys.exit(1 if fails else 0)
