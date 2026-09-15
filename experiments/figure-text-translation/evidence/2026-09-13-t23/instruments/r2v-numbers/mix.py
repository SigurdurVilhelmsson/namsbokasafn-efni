import json, sys
sys.dont_write_bytecode = True
sys.path.insert(0, '/home/siggi/dev/scratch-c140/c3b/scripts')
from c3lib import *
mix = []; n = 0
for b in names():
    fig = Fig(b, items_dir=Path('/home/siggi/dev/scratch-c140/r2/work/V0'), diag_dir=Path('/home/siggi/dev/scratch-c140/r2/work/V0'))
    for bi in fig.layout_blocks():
        n += 1
        ls = FT.lines(fig.blocks[bi])
        bold = {l[0]['font'] in fig.bold_fonts for l in ls}; fill = {json.dumps(l[0].get('fill')) for l in ls}
        allbold = {r['font'] in fig.bold_fonts for l in ls for r in l}; allfill = {json.dumps(r.get('fill')) for l in ls for r in l}
        if len(bold) > 1 or len(fill) > 1: mix.append((b[9:], bi, 'line-first-run', bold, len(fill)))
        elif len(allbold) > 1 or len(allfill) > 1: mix.append((b[9:], bi, 'within-line-only', allbold, len(allfill)))
print('layout blocks', n, 'mixing bold/fill across line first runs or within:', mix)
