import json, random, sys
from collections import Counter, defaultdict
sys.path.insert(0, sys.argv[1])
import lib
M = lib.M
B = json.load(open(sys.argv[2])); C, S = lib.load(sys.argv[3])
nested = {tuple(x) for x in json.load(open(sys.argv[4]))}
random.seed(int(sys.argv[5]))
recs = [r for r in B['records'] if (r['base'], r['chapter'], r['definitionId'], r['mod'], r['key']) not in nested]
def full(r):
    v_en = 'old' if r['base'] == 'june' else 'new'
    v_is = 'old' if r['isSrc'] == 'june' else 'new'
    return M.plain(S[(r['chapter'], r['mod'], v_en)][0][r['key']]), M.plain(S[(r['chapter'], r['mod'], v_is)][1][r['key']])
picked = []
# ABSENT: one record from each of the 12 heaviest ABSENT terms (pooled over bases), random base
ab = defaultdict(list)
for r in recs:
    if r['class'] == 'ABSENT': ab[(r['chapter'], r['en'])].append(r)
for k, lst in sorted(ab.items(), key=lambda kv: -len(kv[1]))[:12]:
    picked.append(random.choice(lst))
for c in ('SWAP-PARALLEL', 'SWAP-AGREEMENT'):
    by = defaultdict(list)
    for r in recs:
        if r['class'] == c: by[(r['chapter'], r['en'])].append(r)
    keys = random.sample(sorted(by), min(6, len(by)))
    for k in keys: picked.append(random.choice(by[k]))
for i, r in enumerate(picked, 1):
    en, is_ = full(r)
    print(f"#{i} [{r['class']}{'/'+r.get('absentSub','') if r['class']=='ABSENT' else ''}] base={r['base']} isSrc={r['isSrc']} {r['chapter']} {r['mod']} {r['key']}")
    print(f"   term: {r['en']!r} -> target {r['target']!r} ({r['how']}/{r['choice']})" + (f"  variant={r['variant']!r} [{r['variantSrc']}]" if 'variant' in r else f"  present={r.get('present')}"))
    print(f"   EN: {en[:700]}")
    print(f"   IS: {is_[:700]}")
