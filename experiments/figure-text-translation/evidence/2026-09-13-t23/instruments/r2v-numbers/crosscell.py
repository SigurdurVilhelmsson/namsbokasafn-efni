#!/usr/bin/env python3
"""Cross-cell identity claims, from items.json per block (layout items only; key fields text/x/y/size/bold/italic/rgb/rot).
- blocks drawn differently from V0 per tag (items compared rounding coordinates to 1e-3 pt)
- p2.0 f7.0 vs f7.5 / f8.0; p2.5 vs p2.0 at each F
- transfer-off vs transfer-on: which blocks differ, which figures identical; token blocks from the builder's r2 diag
  (n_tokens) AND independently from the source runs' size ratios (a run whose size differs from the block's first run)
- decimal on vs off: layout items identical?
- 2x3 layout ([USER]-visible) differences: line partition text / base size between notr and on for token blocks
"""
import json, collections, math
from pathlib import Path
ROOT = Path('/home/siggi/dev/scratch-c140'); R2 = ROOT / 'r2'; PREP = ROOT / 'prep'; ME = ROOT / 'r2v-numbers'
names = [f['basename'] for f in json.loads((PREP / 'manifest.json').read_text())['figures']]
short = lambda b, i: f"{b.replace('CNX_Chem_', '')} b{i}"
F = ('text', 'size', 'bold', 'italic', 'rot')


def blocks_of(tag, b):
    d = collections.defaultdict(list)
    for it in json.loads((R2 / 'work' / tag / b / 'items.json').read_text()):
        if it['path'] == 'layout':
            d[it['block']].append(tuple([it[f] for f in F] + [round(it['x'], 3), round(it['y'], 3), tuple(round(c, 4) for c in it['rgb'])]))
    return d


def diff(t1, t2):
    out = []
    for b in names:
        a, c = blocks_of(t1, b), blocks_of(t2, b)
        assert set(a) == set(c)
        out += [short(b, i) for i in sorted(a) if a[i] != c[i]]
    return out


TAGS = ['V5_p2.0_f7.0', 'V5_p2.0_f7.5', 'V5_p2.0_f8.0', 'V5_p2.5_f7.0', 'V5_p2.5_f7.5', 'V5_p2.5_f8.0']
for T in TAGS:
    d = diff('V0', T)
    print(f'drawn differently from V0: {T} {len(d)}')
unchanged = sorted(set(short(b, i) for b in names for i in blocks_of('V0', b)) - set(diff('V0', 'V5_p2.0_f7.0')))
figs_unchanged = [b for b in names if blocks_of('V0', b) and all(short(b, i) in unchanged for i in blocks_of('V0', b))]
print('figures with layout blocks, all blocks identical V0 vs 2.0/7.0:', [b.replace('CNX_Chem_', '') for b in figs_unchanged])
print('2.0/7.0 vs 2.0/7.5:', diff('V5_p2.0_f7.0', 'V5_p2.0_f7.5'))
print('2.0/7.5 vs 2.0/8.0:', diff('V5_p2.0_f7.5', 'V5_p2.0_f8.0'))
print('2.0/7.0 vs 2.0/8.0:', diff('V5_p2.0_f7.0', 'V5_p2.0_f8.0'))
for f in ('7.0', '7.5', '8.0'):
    print(f'2.0 vs 2.5 at F {f}:', diff(f'V5_p2.0_f{f}', f'V5_p2.5_f{f}'))
print('dec vs 2.0/7.5 (layout):', diff('V5_p2.0_f7.5', 'V5_p2.0_f7.5_dec'))
# transfer-off
tro = diff('V5_p2.0_f7.5', 'V5_p2.0_f7.5_notr')
figs = sorted({x.rsplit(' b', 1)[0] for x in tro})
print(f'transfer on vs off: {len(tro)} blocks differ in {len(figs)} figures: {figs}')
# token blocks per builder diag
tok = []
for b in names:
    for d in json.loads((R2 / 'work/V5_p2.0_f7.5' / b / 'diag.json').read_text()):
        if (d.get('r2') or {}).get('n_tokens'):
            tok.append(short(b, d['block']))
print('token blocks per diag n_tokens:', len(tok), 'set equal to transfer-diff set:', set(tok) == set(tro),
      'extra in diff:', sorted(set(tro) - set(tok)), 'missing from diff:', sorted(set(tok) - set(tro)))
tokfigs = sorted({x.rsplit(' b', 1)[0] for x in tok}); print('token figures', len(tokfigs), tokfigs)
# independent token-ish blocks: layout blocks whose source runs contain a run of smaller size or baseline offset
import sys
sys.path.insert(0, '/home/siggi/dev/scratch-c140/c3b/tree'); sys.dont_write_bytecode = True
import figtext as FT
from blockkey import block_key
indep = []
for b in names:
    runs = json.loads((PREP / 'figs' / b / 'runs.json').read_text())
    bl = FT.merge_blocks(FT.group(runs))
    lay = blocks_of('V0', b)
    for i in lay:
        sizes = [r['size'] for r in bl[i]]
        if max(sizes) - min(sizes) > 0.01:
            indep.append(short(b, i))
print('layout blocks with mixed source run sizes (independent proxy):', len(indep), 'minus token set:', sorted(set(indep) - set(tok)), 'token minus proxy:', sorted(set(tok) - set(indep)))
# 2x3: line text (styling dropped) and base size, token blocks
def lines_sz(tag):
    m = {(r['basename'], r['block']): r for r in map(json.loads, open(ME / 'out' / f'mym-{tag}.jsonl'))}
    return {short(*k): (tuple(v['text']), v['size']) for k, v in m.items()}
on, off = lines_sz('V5_p2.0_f7.5'), lines_sz('V5_p2.0_f7.5_notr')
print('token blocks whose line partition or base size differs on vs off:', [(k, on[k], off[k]) for k in tok if on[k] != off[k]])
