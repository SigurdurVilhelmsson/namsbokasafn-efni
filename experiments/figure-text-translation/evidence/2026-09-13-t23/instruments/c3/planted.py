#!/usr/bin/env python3
"""Planted-overlap controls for the ink instrument (baseline.py's definition, alpha>=128, L<128).

P1 (positive): argon block 1 'Massi Ar|atóma (g)' (clean at baseline) shifted LEFT 15 pt so it
    crosses the yellow box's dark left border -> must fire (>=10 px).
P2 (positive, rotated): flowchart first rotated layout block shifted 12 pt along -x.
P3 (blindness probe): alsulfatemass 'Fjöldi' (key Quantity) header shifted onto the blue vertical table rule;
    the table rule luminance is reported -> if L>=128 the instrument CANNOT fire (a named limit).
"""
import json, sys, math
sys.path.insert(0, '/home/siggi/dev/scratch-c140/c3/scripts')
from c3lib import *

PAD = 120


def ink_on_dark(fig, items):
    m = ink_mask(fig, items, PAD) > 127
    dark = np.zeros_like(m); dark[PAD:PAD + fig.h, PAD:PAD + fig.w] = fig.art_L < 128
    return int((m & dark).sum())


def shifted(items, dx=0.0, dy=0.0):
    return [dict(it, x=it['x'] + dx, y=it['y'] + dy) for it in items]


res = {}
f = Fig('CNX_Chem_03_02_argon_img-9025')
its = f.block_items(1)
res['P1_argon_b1_base'] = ink_on_dark(f, its)
res['P1_argon_b1_shift_-15pt'] = ink_on_dark(f, shifted(its, dx=-15))
for dx in (-5, -10, -20):
    res[f'P1_argon_b1_shift_{dx}pt'] = ink_on_dark(f, shifted(its, dx=dx))

f = Fig('CNX_Chem_04_03_flowchart')
rot = [bi for bi in f.layout_blocks() if abs(f.blocks[bi][0]['rot']) > 45]
bi = rot[0]
its = f.block_items(bi)
res['P2_flowchart_rot_block'] = (bi, f.keys[bi], f.blocks[bi][0]['rot'])
res['P2_base'] = ink_on_dark(f, its)
for dx in (-6, -12, 6, 12):
    res[f'P2_shift_x{dx}'] = ink_on_dark(f, shifted(its, dx=dx))

f = Fig('CNX_Chem_03_01_alsulfatemass_img')
bi = f.keys.index('Quantity')
its = f.block_items(bi) or f.src_runs_as_items(bi)
res['P3_block'] = (bi, f.keys[bi], f.path.get(bi))
res['P3_base'] = ink_on_dark(f, its)
# luminance of the table rule: darkest pixel in a horizontal scan through the header row
y = int((f.H - f.blocks[bi][0]['y']) * S) - 8
row = f.art_L[y]
mins = sorted(set(int(v) for v in row))[:5]
res['P3_header_row_luma_min5'] = mins
res['P3_header_row_dark_px_L<128'] = int((row < 128).sum())
for dx in (-25, -30, -35, 20, 25):
    res[f'P3_shift_x{dx}'] = ink_on_dark(f, shifted(its, dx=dx))
print(json.dumps(res, ensure_ascii=False, indent=1))
(C3 / 'planted.json').write_text(json.dumps(res, ensure_ascii=False, indent=1))
