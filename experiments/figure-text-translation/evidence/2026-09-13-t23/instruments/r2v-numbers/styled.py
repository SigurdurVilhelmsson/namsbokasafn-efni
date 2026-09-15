import json, sys, collections, re
sys.dont_write_bytecode = True
sys.path.insert(0, '/home/siggi/dev/scratch-c140/c3b/scripts')
from c3lib import *
ROOT = Path('/home/siggi/dev/scratch-c140'); R2 = ROOT / 'r2'
SIDE = Path('/home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi-2e/figure-text')
T = sys.argv[1] if len(sys.argv) > 1 else 'V5_p2.0_f7.0'
tot_src = tot_draw = 0; mism = []; nblk = 0
for b in names():
    fig = Fig(b, items_dir=R2 / 'work' / T, diag_dir=R2 / 'work' / T)
    tr = json.loads((SIDE / f'{b}.is.json').read_text())['blocks']
    for bi in fig.layout_blocks():
        runs = fig.blocks[bi]
        w = collections.Counter()
        for r in runs: w[round(r['size'], 3)] += len(r['text'])
        base = max(w.items(), key=lambda kv: (kv[1], kv[0]))[0]
        # merge consecutive small runs into one stretch (per line order)
        src = []
        for l in FT.lines(runs):
            cur = ''
            for r in sorted(l, key=FT.along):
                if r['size'] < 0.9 * base and r['text'].strip():
                    cur += r['text']
                else:
                    if cur.strip(): src.append(cur.strip())
                    cur = ''
            if cur.strip(): src.append(cur.strip())
        its = fig.block_items(bi)
        wi = collections.Counter()
        for it in its: wi[round(it['size'], 6)] += len(it['text'])
        ib = max(wi.items(), key=lambda kv: (kv[1], kv[0]))[0]
        drawn = [it['text'].strip() for it in its if it['size'] < 0.9 * ib and it['text'].strip()]
        if src or drawn:
            nblk += 1
            tot_src += len(src); tot_draw += len(drawn)
            # expected occurrences: count clean occurrences of each source stretch's preceding base context? -> simple: occurrences of stretch text in the value
            val = tr[fig.keys[bi]]
            if collections.Counter(src) != collections.Counter(drawn):
                mism.append((b[9:], bi, fig.keys[bi], src, drawn, val))
print(T, 'blocks with small source runs or small drawn items:', nblk, 'source small stretches', tot_src, 'drawn small items', tot_draw)
for m in mism: print('  MISMATCH', m)
