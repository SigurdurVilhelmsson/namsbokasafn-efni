import json, sys, os, pickle, re
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vb_lib import *
from collections import Counter
B = pickle.load(open(f'{S}/burden_vb_cls.pkl', 'rb'))
rows = Counter(); tot = Counter()
for base in ('june', 'new', 'hybrid'):
    for p in B['results']['all'][base]:
        if ' ' in p['term'] or '-' in p['term']: continue
        tot[(p['ch'], p['term'], base)] += 1
        rows[(p['ch'], p['term'], base)] += (not p['ok'])
terms = sorted({(c, t) for c, t, b in rows})
dec = {(d['ch'], d['enNorm']): d for d in B['decided']}
for c, t in terms:
    print(f"{c} {t:18s} target={dec[(c,t)]['target']:22s} J {rows[(c,t,'june')]:3d}/{tot[(c,t,'june')]:3d}  N {rows[(c,t,'new')]:3d}/{tot[(c,t,'new')]:3d}  H {rows[(c,t,'hybrid')]:3d}/{tot[(c,t,'hybrid')]:3d}")
