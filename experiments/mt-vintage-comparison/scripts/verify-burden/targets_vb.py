import json, sys, os, pickle, re
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vb_lib import *
from collections import Counter
B = pickle.load(open(f'{S}/burden_vb_cls.pkl', 'rb'))
corpus = pickle.load(open(f'{S}/corpus_vb.pkl', 'rb'))
def isx(base, p):
    c = corpus[p['ch']][p['mod']]
    return c['isJ'][p['key']] if base == 'june' else (c['isN'][p['key']] if base == 'new' else c['hyb'][p['key']])
# per term: target, stems with lengths, and burden per base
rows = {}
for base in ('june','new','hybrid'):
    for p in B['results']['all'][base]:
        r = rows.setdefault((p['ch'], p['term']), Counter()); r[base+'_n'] += 1; r[base+'_bad'] += (not p['ok'])
dec = {(d['ch'], d['enNorm']): d for d in B['decided']}
short = []
for (ch, t), r in sorted(rows.items()):
    d = dec[(ch, t)]
    st = M.stems(d['target'])
    flag = any(len(w) <= 5 for w in st)
    if flag: short.append((ch, t, d['target'], st, r['june_bad'], r['new_bad'], r['hybrid_bad'], r['new_n']))
print('decided terms whose target has a content word of <=5 letters (blind to compound-initial use):')
for s in short: print('  ', s)
# Probe: among needing-change pairs, tokens that START with a short target word's stem (compound-initial use the matcher refuses)
print()
tot = Counter(); ex = {}
for base in ('june','new','hybrid'):
    for p in B['results']['all'][base]:
        if p['ok']: continue
        d = dec[(p['ch'], p['term'])]
        st = M.stems(d['target'])
        toks = re.findall(r'\w+', M.plain(isx(base, p)).lower())
        for w in st:
            if len(w) > 5: continue
            stem = M.stem_cut(w)
            # compound-initial: token begins with the word's root (+linking a/s/u) and continues with more letters
            root = M.NOM_ENDING.sub('', w) if len(w) > 3 else w
            hits = [tk for tk in toks if tk.startswith(stem) and not M.word_matches(tk, w) and len(tk) > len(w) + 2]
            if hits:
                tot[(base, d['enNorm'], w)] += 1
                ex.setdefault((base, d['enNorm'], w), (p['mod'], p['key'], hits[:4]))
for k, n in sorted(tot.items(), key=lambda x: -x[1])[:40]:
    print(k, n, ex[k])
