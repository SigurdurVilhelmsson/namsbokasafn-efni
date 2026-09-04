"""A sidecar stores ONE STRING per block. The composer must not iterate it per character."""
import sys
from figtext import normalise_block_value

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

print('\nALL PASS' if not fails else f'\n{len(fails)} FAILED')
sys.exit(1 if fails else 0)
