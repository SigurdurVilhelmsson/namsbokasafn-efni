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

# ── 2. is_identity ──────────────────────────────────────────────────────────────────
check('2a a multi-line reply equal to what was sent is identity',
      FT.is_identity('Mass of reactant', 'Mass of reactant', False))
check('2b ... also when the reply is a LEGACY list of lines',
      FT.is_identity(['Mass of', 'reactant'], 'Mass of reactant', False))
check('2c whitespace is not content: a collapsed arrow gap is still identity',
      FT.is_identity('HCl(g) HCl(aq)', 'HCl(g)          HCl(aq)', False))
check('2d edge whitespace is not content (translate-blocks.mjs .trim()s the reply)',
      FT.is_identity('  Mass of reactant ', 'Mass of reactant', False))
check('2e an arc reply equal to its key is identity',
      FT.is_identity('ABCD', 'ABCD', True))
check('2f CONTROL a prefixed reply is NOT identity',
      not FT.is_identity('X Mass of reactant', 'Mass of reactant', False))
check('2g CONTROL one extra character is NOT identity',
      not FT.is_identity('Mass of reactants', 'Mass of reactant', False))
check('2h CONTROL a real translation is NOT identity',
      not FT.is_identity('Massi hvarfefnis', 'Mass of reactant', False))

# ── 3. run_face ─────────────────────────────────────────────────────────────────────
FONTS = {
    'R': {'base': '/ABCDEF+LiberationSans'},
    'B': {'base': '/LiberationSans-Bold'},
    'I': {'base': '/ABCDEF+LiberationSans-Italic'},
    'BI': {'base': '/LiberationSans-BoldItalic'},
    'O': {'base': '/Helvetica-Oblique'},
    'Bold': {'base': '/ABCDEF+Helvetica'},     # a RESOURCE name that lies
}
for key, want in (('R', (False, False)), ('B', (True, False)), ('I', (False, True)),
                  ('BI', (True, True)), ('O', (False, True))):
    got = FT.run_face({'font': key}, FONTS)
    check(f'3 {key}: the face comes from the BaseFont', got == want, f'{got!r} want {want!r}')
got = FT.run_face({'font': 'Bold'}, FONTS)
check('3f the RESOURCE name is never read (a key called "Bold" with a regular base)',
      got == (False, False), repr(got))
got = FT.run_face({'font': 'MISSING'}, FONTS)
check('3g a font absent from meta.fonts draws Regular rather than raising',
      got == (False, False), repr(got))

# ── 4. run_draw_text ────────────────────────────────────────────────────────────────
got = FT.run_draw_text({'text': '(cid:127) 5% or less'})
check('4a a placeholder is removed and flagged; the edge space it leaves is KEPT',
      got == (' 5% or less', True), repr(got))
got = FT.run_draw_text({'text': 'Mass of '})
check('4b a trailing space is a glyph position: unchanged and NOT flagged',
      got == ('Mass of ', False), repr(got))
got = FT.run_draw_text({'text': '(cid:127)'})
check('4c a run that is nothing but a placeholder becomes empty, flagged',
      got == ('', True), repr(got))
import readlayer as RL                          # noqa: E402 - pdfplumber via FIGTEXT_PYLIBS
probe = f'{RL.CID}42) y'
got = FT.run_draw_text({'text': probe})
check("4d DRIFT GUARD the remover matches everything readlayer's DETECTOR finds",
      RL.CID in probe and got == (' y', True), f'{probe!r} -> {got!r}')

print(f"\n{'ALL PASS' if not fails else str(len(fails)) + ' FAILED: ' + ', '.join(fails)}")
sys.exit(1 if fails else 0)
