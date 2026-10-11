import json, sys, os, pickle, re
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vb_lib import *
B = pickle.load(open(f'{S}/burden_vb_cls.pkl', 'rb'))
corpus = pickle.load(open(f'{S}/corpus_vb.pkl', 'rb'))
base = sys.argv[1]; term = sys.argv[2]
pat = M.en_pattern(term)
rx = re.compile(sys.argv[3]) if len(sys.argv) > 3 else None
bad = [p for p in B['results']['all'][base] if p['term'] == term and not p['ok']]
for i, p in enumerate(bad, 1):
    c = corpus[p['ch']][p['mod']]
    en = c['enJ'][p['key']] if base == 'june' else c['enN'][p['key']]
    is_ = c['isJ'][p['key']] if base == 'june' else (c['isN'][p['key']] if base == 'new' else c['hyb'][p['key']])
    pe = M.plain(en); pi = M.plain(is_)
    ctx = ['…' + pe[max(0, m.start()-35):m.end()+35] + '…' for m in pat.finditer(pe)]
    ictx = []
    if rx:
        for m in rx.finditer(pi):
            ictx.append(pi[max(0, m.start()-30):m.end()+25])
    print(f"{i:2d} {p['mod']} {p['key'][:40]:40s} EN{ctx}\n      IS{ictx}")
