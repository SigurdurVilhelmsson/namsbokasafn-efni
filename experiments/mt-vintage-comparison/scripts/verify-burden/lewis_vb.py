import json, sys, os, pickle, re
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vb_lib import *
from collections import Counter
B = pickle.load(open(f'{S}/burden_vb_cls.pkl', 'rb'))
corpus = pickle.load(open(f'{S}/corpus_vb.pkl', 'rb'))
for base in ('june', 'new', 'hybrid'):
    bad = [p for p in B['results']['all'][base] if p['term'] == 'lewis structure' and not p['ok']]
    tok = Counter(); cls = Counter(p['cls']['wide'] for p in bad); none = 0
    for p in bad:
        c = corpus[p['ch']][p['mod']]
        is_ = c['isJ'][p['key']] if base == 'june' else (c['isN'][p['key']] if base == 'new' else c['hyb'][p['key']])
        found = re.findall(r'Lewis[\s-]+(\w+)', M.plain(is_))
        for f in found: tok[f.lower()] += 1
        if not found: none += 1
    print(base, len(bad), dict(cls), 'segments with no "Lewis X":', none, '| Lewis-X words:', tok.most_common(12))
