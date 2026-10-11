import json, sys, os, pickle, re, random
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vb_lib import *
from collections import Counter, defaultdict
B = pickle.load(open(f'{S}/burden_vb_cls.pkl', 'rb'))
corpus = pickle.load(open(f'{S}/corpus_vb.pkl', 'rb'))
dec = {(d['ch'], d['enNorm']): d for d in B['decided']}
def get(base, p):
    c = corpus[p['ch']][p['mod']]
    en = c['enJ'][p['key']] if base == 'june' else c['enN'][p['key']]
    is_ = c['isJ'][p['key']] if base == 'june' else (c['isN'][p['key']] if base == 'new' else c['hyb'][p['key']])
    return en, is_
rng = random.Random(20261010)
plan = [('new', 'X', 8), ('new', 'A', 4), ('new', 'P', 4), ('june', 'X', 5), ('june', 'A', 3), ('june', 'P', 3), ('hybrid-alt', 'X', 2), ('hybrid-alt', 'A', 2)]
EXCL = {'heat', 'lewis structure'}
picked = []
for base, cls, n in plan:
    b = 'hybrid' if base.startswith('hybrid') else base
    pool = [p for p in B['results']['all'][b] if not p['ok'] and p['cls']['wide'] == cls and p['term'] not in EXCL]
    if base == 'hybrid-alt': pool = [p for p in pool if p['src'] != 'june' and p['key'].startswith('alt:')]
    # one per term
    byterm = defaultdict(list)
    for p in pool: byterm[(p['ch'], p['term'])].append(p)
    keys = sorted(byterm); rng.shuffle(keys)
    for k in keys[:n]:
        picked.append((b, rng.choice(byterm[k])))
for i, (b, p) in enumerate(picked, 1):
    d = dec[(p['ch'], p['term'])]
    en, is_ = get(b, p)
    pe = M.plain(en); pat = M.en_pattern(p['term'])
    ctx = [pe[max(0, m.start()-60):m.end()+60] for m in pat.finditer(pe)]
    print(f"\n#{i} [{b} {p['cls']['wide']}] {p['ch']} {p['mod']} {p['key']}  term={p['term']!r} target={d['target']!r}  Kj={d['Kj']!r} Kn={d['Kn']!r} src={p['src']}")
    print('  EN ctx:', ctx)
    print('  IS    :', M.plain(is_)[:600])
