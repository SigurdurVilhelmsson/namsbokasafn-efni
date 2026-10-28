import json, sys, os, pickle
sys.dont_write_bytecode = True
from collections import Counter
S = os.path.dirname(os.path.abspath(__file__)); B = sys.argv[1]
mine = pickle.load(open(f'{S}/burden_vb_cls.pkl', 'rb'))
theirs = json.load(open(f'{B}/perchapter.json'))
bad = 0; checked = 0
for ch, row in theirs.items():
    for base in ('june', 'new', 'hybrid'):
        t = row.get(base)
        if not isinstance(t, dict) or 'prosePairs' not in t: continue
        P = [p for p in mine['results']['all'][base] if p['ch'] == ch]
        f = [p for p in P if not p['ok']]
        m = dict(prosePairs=len(P), fixPairs=len(f), uniqueSegs=len({(p['mod'], p['key']) for p in f}),
                 fixPairsVerdict=sum(p['source'] == 'verdict' for p in f), fixPairsRuling=sum(p['source'] == 'ruling' for p in f),
                 P=sum(p['cls']['wide'] == 'P' for p in f), A=sum(p['cls']['wide'] == 'A' for p in f), X=sum(p['cls']['wide'] == 'X' for p in f))
        for k, v in m.items():
            checked += 1
            if t.get(k, 0) != v:
                bad += 1; print('DIFF', ch, base, k, 'theirs', t.get(k), 'mine', v)
print('per-chapter cells compared', checked, 'differing', bad)
# record-level comparison
rec = json.load(open(f'{B}/burden.json'))['records']
print('their record sample:', json.dumps(rec[0], ensure_ascii=False)[:600] if isinstance(rec, list) else type(rec))
