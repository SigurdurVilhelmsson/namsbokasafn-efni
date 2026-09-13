#!/usr/bin/env python3
"""NOT COMPOSED - geometry only. For OPEN blocks that still GAIN lines in V3: what would holding the
source line count cost? For each, with compose's measure (family, first-run weight, size*S, x_advance/S):
  w_src_n(sz0)  min-max width of the value partitioned into n_src lines at sz0
  budgets       V3 budget (source anchor, free box, pad 2) and the WHOLE free width centred in the free box (pad 2)
  s_hold_v3     largest size (0.25 steps, >=5) at which the n_src partition fits the V3 budget
  s_hold_free   same, against the whole free width
  vertical      extra height a gained line needs (lead = 1.222*sz0) vs free room up/down (census)"""
import json, sys
sys.path.insert(0, '/home/siggi/dev/scratch-c140/c3b/scripts')
from c3lib import *
A = json.loads((C3B / 'analysis.json').read_text()); CEN = json.loads((C3B / 'census.json').read_text())
M3 = {(r['basename'], r['block']): r for r in map(json.loads, open(C3B / 'measure-V3.jsonl'))}
surf = cairo.ImageSurface(cairo.FORMAT_RGB24, 8, 8); ctx = cairo.Context(surf)
def minmax(words, n, size, bold):
    W = len(words); INF = float('inf')
    wd = {(i, j): measure_adv(ctx, ' '.join(words[i:j]), size, bold) for i in range(W) for j in range(i + 1, W + 1)}
    best = [[INF] * (W + 1) for _ in range(n + 1)]; best[0][0] = 0
    for m in range(1, n + 1):
        for j in range(m, W + 1):
            best[m][j] = min(max(best[m - 1][k], wd[(k, j)]) for k in range(m - 1, j))
    return best[n][W]
out = []
for k, r in sorted(M3.items()):
    if r['cls'] != 'OPEN' or r['lines'] <= r['src_lines']:
        continue
    fig = Fig(k[0], items_dir=C3B / 'work/V3', diag_dir=C3B / 'work/V3')
    d = fig.diag[k[1]]; ce = CEN[f'{k[0]}#{k[1]}']; ref = fig.blocks[k[1]][0]; bold = ref['font'] in fig.bold_fonts
    words = ' '.join(' '.join(d['value']).split()).split(); n = r['src_lines']; sz0 = d['sz0']
    if len(words) < n:
        n = len(words)
    b3 = d['c3b']['maxw']; free_c = (ce['FR'] - ce['FL']) - 4.0
    def s_hold(budget):
        s = sz0
        while s >= 5 and minmax(words, n, s, bold) > budget:
            s -= 0.25
        return s if s >= 5 else None
    row = dict(block=f"{k[0].replace('CNX_Chem_', '')} b{k[1]}", key=r['key'], n_src=r['src_lines'], n_v3=r['lines'], sz0=sz0,
               w_src_n_sz0=round(minmax(words, n, sz0, bold), 2), budget_v3=round(b3, 2), free_centred_budget=round(free_c, 2),
               s_hold_v3=s_hold(b3), s_hold_free=s_hold(free_c),
               gained_line_needs_pt=round((r['lines'] - r['src_lines']) * 1.222 * sz0, 2),
               room_up=ce['room_up'], room_down=ce['room_down'], by_up=ce['room_up_by'], by_down=ce['room_down_by'],
               user_flag=bool(A['blocks'][f"{k[0].replace('CNX_Chem_', '')} b{k[1]}"] and [f for f in A['flag_table'] if f['block'] == f"{k[0].replace('CNX_Chem_', '')} b{k[1]}"]))
    out.append(row); print(row)
(C3B / 'hold-lines.json').write_text(json.dumps(out, ensure_ascii=False, indent=1))
print(len(out))
