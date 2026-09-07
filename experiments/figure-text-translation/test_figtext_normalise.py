"""A sidecar stores ONE STRING per block. The composer must not iterate it per character.

Also pins P3: the two block-builders must survive a figure with NO live text.
"""
import sys
import _deps  # noqa: F401  - puts this directory on sys.path; never process.cwd()
from figtext import normalise_block_value, group, merge_blocks

fails = []
def check(label, got, want):
    ok = got == want
    print(f"  {'PASS' if ok else 'FAIL'}  {label}: {got!r}")
    if not ok:
        fails.append(label)

# A non-arc block: one string becomes a ONE-ELEMENT list of lines, never a list of chars.
check('str -> single line', normalise_block_value('Sudumark vatns', False), ['Sudumark vatns'])
check('str is not exploded', len(normalise_block_value('abc', False)), 1)

# Backward compatibility: the placeholder files stored pre-split lines.
check('list passes through', normalise_block_value(['a', 'b'], False), ['a', 'b'])

# An arc block is laid out per glyph, so it stays a string.
check('arc stays a string', normalise_block_value('Naest ...', True), 'Naest ...')

# CONTROL: the two branches must actually differ, or this test proves nothing.
check('arc and non-arc differ',
      normalise_block_value('x', True) != normalise_block_value('x', False), True)

# ── P3: an EMPTY run list is a real corpus state, not a caller error ────────────────
# CNX_Chem_06_01_Vibrstring reads 0 runs (harness outcome 'empty', 1 of 817). Both of
# these indexed [0] unguarded, so emit-blocks.py died with IndexError on it rather than
# reporting "nothing to buy".
check('P3 group([]) -> []', group([]), [])
check('P3 merge_blocks([]) -> []', merge_blocks([]), [])

# CONTROL: the guards must not have turned these into functions that return [] for
# EVERYTHING. A refusal-only pair of assertions would pass on `return []`.
_RUN = dict(text='Hi', x=0.0, y=0.0, size=9.0, rot=0.0, adv=6.0, font='PAGE/T1_0')
check('P3 CONTROL non-empty input still groups', len(group([dict(_RUN)])), 1)
check('P3 CONTROL non-empty input still merges', len(merge_blocks([[dict(_RUN)]])), 1)

print('\nALL PASS' if not fails else f'\n{len(fails)} FAILED')
sys.exit(1 if fails else 0)
