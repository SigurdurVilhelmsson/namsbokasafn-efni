import json, sys
from collections import Counter, defaultdict
B = json.load(open(sys.argv[1])); nested = {tuple(x) for x in json.load(open(sys.argv[2]))}
bases = ('june', 'new', 'hybrid'); CL = ('SWAP-PARALLEL', 'SWAP-AGREEMENT', 'ABSENT'); RANK = {c: i for i, c in enumerate(CL)}
chs = sorted({r['chapter'] for r in B['prose']} | {u['chapter'] for u in B['undecided']})
out = {}
for ch in chs:
    v = {}
    for b in bases:
        recs = [r for r in B['records'] if r['base'] == b and r['chapter'] == ch]
        pr = [r for r in B['prose'] if r['base'] == b and r['chapter'] == ch]
        cls = Counter(r['class'] for r in recs)
        segs = {}
        for r in recs:
            k = (r['mod'], r['key'])
            if k not in segs or RANK[r['class']] > RANK[segs[k]]: segs[k] = r['class']
        hw = [h for h in B['headwords'] if h['base'] == b and h['chapter'] == ch]
        src = Counter('verdict' if r['how'] in ('verdict', 'same-headword-in-chapter') else 'ruling' for r in recs)
        nest = sum(1 for r in recs if (r['base'], r['chapter'], r['definitionId'], r['mod'], r['key']) in nested)
        v[b] = {'prosePairs': sum(r['prose'] for r in pr), 'fixPairs': len(recs), 'P': cls['SWAP-PARALLEL'], 'A': cls['SWAP-AGREEMENT'],
                'X': cls['ABSENT'], 'uniqueSegs': len(segs), 'fixPairsVerdict': src['verdict'], 'fixPairsRuling': src['ruling'],
                'nestedOnlyPairs': nest, 'headwordFixesExact': sum(1 for h in hw if not h['exactOk']), 'headwordsDecided': len(hw)}
    u = [x for x in B['undecided'] if x['chapter'] == ch]
    und = {'terms': len({x['definitionId'] for x in u})}
    for b in bases:
        ub = [x for x in u if x['base'] == b]
        und[b] = {'prose': sum(x.get('prose', 0) for x in ub),
                  'ifRuledJuly': sum(x.get('prose', 0) - x.get('old', 0) - x.get('both', 0) for x in ub),
                  'ifRuledNew': sum(x.get('prose', 0) - x.get('new', 0) - x.get('both', 0) for x in ub)}
    v['undecided'] = und
    out[ch] = v
json.dump(out, open(sys.argv[3], 'w'), indent=1)
tot = {b: Counter() for b in bases}
for ch, v in out.items():
    for b in bases: tot[b].update(v[b])
for b in bases: print(b, dict(tot[b]))
