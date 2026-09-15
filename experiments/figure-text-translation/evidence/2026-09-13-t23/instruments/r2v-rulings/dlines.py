"""D-lines check (independent): line count == min(n_src, words) where the ruling forces it, and the drawn
partition is min-max balanced among partitions with the same line count (plain-text widths at drawn size;
styled chars measured at base size on BOTH sides, so the comparison is like-for-like)."""
import json, sys, itertools
sys.dont_write_bytecode = True
sys.path.insert(0, '/home/siggi/dev/scratch-c140/c3b/scripts')
from c3lib import *
R2 = Path('/home/siggi/dev/scratch-c140/r2'); TAG = sys.argv[1]
msurf = cairo.ImageSurface(cairo.FORMAT_A8, 8, 8); mctx = cairo.Context(msurf)
CEN = json.loads((R2 / 'census.json').read_text())
bad_count, unbalanced, checked = [], [], 0
for b in names():
    dg = json.loads((R2 / 'work' / TAG / b / 'diag.json').read_text())
    meta = json.loads((PREP / 'figs' / b / 'meta.json').read_text())
    for x in dg:
        if 'r2' not in x: continue
        bi = x['block']; ce = CEN[f'{b}#{bi}']
        words = ' '.join(x['value']).split()
        W = len(words); n = x['n_out_lines']; n_src = x['n_src_lines']; s = x['sz']
        bold = False
        # bold from the drawn items
        its = [it for it in json.loads((R2 / 'work' / TAG / b / 'items.json').read_text()) if it['block'] == bi and it['path'] == 'layout']
        bold = its[0]['bold']
        if n != min(n_src, W) and x['r2']['step'] != 'iv-gain':
            bad_count.append((f'{b}#{bi}', ce['r2cls'], n, n_src, W, x['wrapped']))
        if W > 12 or n == 1 or n == W:
            continue
        checked += 1
        wm = lambda seq: measure_adv(mctx, ' '.join(seq), s, bold)
        drawn = max(wm(l.split()) for l in x['wrapped'])
        best = None
        for cuts in itertools.combinations(range(1, W), n - 1):
            idx = (0,) + cuts + (W,)
            m = max(wm(words[idx[i]:idx[i + 1]]) for i in range(n))
            if best is None or m < best[0]:
                best = (m, [' '.join(words[idx[i]:idx[i + 1]]) for i in range(n)])
        if drawn > best[0] + 0.3:
            unbalanced.append((f'{b}#{bi}', x['wrapped'], round(drawn, 2), best[1], round(best[0], 2)))
print(TAG, 'line count != min(n_src, words):', len(bad_count))
for r in bad_count: print('   ', r)
print('multi-line partitions checked for min-max:', checked, 'unbalanced (>0.3pt):', len(unbalanced))
for r in unbalanced: print('   ', r)
