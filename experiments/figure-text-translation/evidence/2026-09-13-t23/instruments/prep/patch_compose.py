#!/usr/bin/env python3
"""Instrument the SCRATCH copy of compose.py (never the repo's).

Mirrors t3_verify.py's tree(): every ITEMS entry carries `block` (index into
FT.merge_blocks(FT.group(runs)), i.e. the compose-report `blocks` list), and items.json
is written to OUT at the end. Additionally each ITEMS.append site stamps `path`
('run-exact' / 'arc' / 'layout') AT THE DRAW SITE, so the path is the code that drew it,
not an inference from the block's classification.

Every anchor is asserted to occur EXACTLY once before replacement.
svgout.write_svg reads only text/x/y/dx/size/bold/italic/rgb/rot, so the extra keys
cannot change translated.svg.
"""
import sys
from pathlib import Path

p = Path(sys.argv[1])
s = p.read_text()

TAG = '''
class _TagList(list):
    """Instrument: every drawn item carries the index of the block being drawn."""
    def append(self, it):
        super().append(dict(it, block=globals().get('BI')))
'''

PATCHES = [
    ('\nITEMS = []', TAG + '\nITEMS = _TagList()'),
    ('\nfor b in blocks:\n', '\nfor BI, b in enumerate(blocks):\n'),
    ("ITEMS.append(dict(text=text, x=px / S", "ITEMS.append(dict(path='run-exact', text=text, x=px / S"),
    ("ITEMS.append(dict(text=ch, x=px / S", "ITEMS.append(dict(path='arc', text=ch, x=px / S"),
    ("ITEMS.append(dict(text=t, x=px / S", "ITEMS.append(dict(path='layout', text=t, x=px / S"),
]
for old, new in PATCHES:
    n = s.count(old)
    assert n == 1, f'anchor occurs {n} times, need exactly 1: {old!r}'
    s = s.replace(old, new, 1)
# Positive control on the patch itself: exactly three append sites exist, all now tagged.
assert s.count('ITEMS.append(dict(') == 3, s.count('ITEMS.append(dict(')
assert s.count("ITEMS.append(dict(path=") == 3
s += "\n(OUT / 'items.json').write_text(json.dumps(ITEMS, ensure_ascii=False))\n"
p.write_text(s)
print('patched', p)
