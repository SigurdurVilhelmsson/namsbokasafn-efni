#!/usr/bin/env python3
"""Final review code-1 (controller ruling R22, register §C140 ㉑) exposure: send:true blocks whose FT.lines count
exceeds their VISUAL line count - a one-line source label that the layout would count as 2-3 source lines. 0 ISK,
read-only (reads prepared figure directories, writes nothing).

Visual count, two instruments (reported separately and as a union):
  A  merge consecutive FT.lines whose FIRST-run proj differs by < 0.6 * 1.222 * size (size = max of the
     two lines' first-run sizes), chained onto the accumulated line;
  B  figscripts.token_lines (stacked-split attachment).
Blocks are formed exactly as compose.py forms them (FT.merge_blocks(FT.group(runs))) and keyed by
blockkey.block_key; a block counts if its key is a send:true key in blocks.json (with multiplicity).
    python3 -u code1_exposure.py <figdir> [<figdir> ...]     (each <figdir> holds runs.json, meta.json, blocks.json)

Output: one HIT line per exposed block, then `TOTAL {figs, send, A, B, U}` - `send` is the denominator (send:true
blocks matched to a drawn block, with multiplicity), A / B / U the blocks instrument A / B / either flags. A key in
blocks.json that no drawn block produces prints a WARNING (the denominator would be short). Arcs count in `send`
and are never flagged (the straight layout path does not draw them).
"""
import sys, json, collections
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))   # experiments/figure-text-translation, never cwd
import figtext as FT, figscripts as FS
from blockkey import block_key

def visual_a(ls):
    out = [ls[0]]
    for l in ls[1:]:
        p = out[-1]
        s = max(p[0]['size'], l[0]['size'])
        if abs(FT.proj(l[0]) - FT.proj(p[0])) < 0.6 * 1.222 * s:
            out[-1] = p + l
        else:
            out.append(l)
    return out

tot = dict(figs=0, send=0, A=0, B=0, U=0)
hits = []
for d in map(Path, sys.argv[1:]):
    runs = json.loads((d / 'runs.json').read_text())
    meta = json.loads((d / 'meta.json').read_text())
    bj = json.loads((d / 'blocks.json').read_text())
    send = collections.Counter(x['key'] for x in bj if x.get('send'))
    tot['figs'] += 1
    for b in FT.merge_blocks(FT.group(runs)):
        k = block_key(b)
        if send.get(k, 0) <= 0:
            continue
        send[k] -= 1
        tot['send'] += 1
        ls = FT.lines(b)
        if FT.is_arc(b):
            continue  # an arc is never laid out by the straight path
        na, nb = len(visual_a(ls)), len(FS.token_lines(b, meta['fonts']))
        a, bb = len(ls) > na, len(ls) > nb
        tot['A'] += a; tot['B'] += bb; tot['U'] += (a or bb)
        if a or bb:
            hits.append(dict(fig=d.name, key=k, ftLines=len(ls), visualA=na, tokenLines=nb))
    left = +send
    if left:
        print('WARNING unmatched send:true keys', d.name, dict(left))
for h in hits:
    print('HIT', json.dumps(h, ensure_ascii=False))
print('TOTAL', json.dumps(tot))
