import json, random, sys
sys.path.insert(0, sys.argv[1])
import lib
M = lib.M
B = json.load(open(sys.argv[2])); C, S = lib.load(sys.argv[3])
nested = {tuple(x) for x in json.load(open(sys.argv[4]))}
random.seed(int(sys.argv[5])); n = int(sys.argv[6])
skip_terms = set(sys.argv[7].split('|'))
recs = [r for r in B['records'] if r['class'] == 'ABSENT' and r['en'] not in skip_terms
        and (r['base'], r['chapter'], r['definitionId'], r['mod'], r['key']) not in nested]
# one record per term, uniform over terms (so light terms are represented), random base
by = {}
for r in recs: by.setdefault((r['chapter'], r['en']), []).append(r)
keys = random.sample(sorted(by), min(n, len(by)))
for i, k in enumerate(keys, 1):
    r = random.choice(by[k])
    v_en = 'old' if r['base'] == 'june' else 'new'; v_is = 'old' if r['isSrc'] == 'june' else 'new'
    en = M.plain(S[(r['chapter'], r['mod'], v_en)][0][r['key']]); is_ = M.plain(S[(r['chapter'], r['mod'], v_is)][1][r['key']])
    print(f"#{i} [ABSENT/{r['absentSub']}] base={r['base']} isSrc={r['isSrc']} {r['chapter']} {r['mod']} {r['key']} (term has {len(by[k])} ABSENT pairs over bases)")
    print(f"   term: {r['en']!r} -> target {r['target']!r} ({r['how']}/{r['choice']}) present={r['present']}")
    print(f"   EN: {en[:600]}"); print(f"   IS: {is_[:600]}")
print('ABSENT terms available:', len(by))
