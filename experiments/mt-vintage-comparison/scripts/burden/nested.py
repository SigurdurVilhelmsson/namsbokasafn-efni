"""How many needing-change pairs match the term ONLY inside a longer headword (a taught headword of the same
chapter, or a house-style ruling's English form) that contains it, e.g. 'resonance' inside 'resonance form'."""
import json, re, sys
from collections import Counter, defaultdict
sys.path.insert(0, sys.argv[1])
import lib
M = lib.M
B = json.load(open(sys.argv[2])); T = json.load(open(sys.argv[3]))
C, S = lib.load(sys.argv[4])
heads = defaultdict(set)
for t in T['terms']: heads[t['chapter']].add(t['enNorm'])
rul_en = {f.lower() for r in T['rulings'] for f in r['en']}
def longer(ch, h):
    pool = heads[ch] | rul_en
    return [x for x in pool if x != h and len(x) > len(h) and re.search(r'(?<![\w-])' + re.escape(h) + r'(?![\w-])', x)]
seg_en = {}
for (ch, m, v), (en, is_) in S.items():
    for k, e in en.items(): seg_en[(ch, m, v, k)] = M.plain(e)
def nested_only(r):
    h = [t for t in T['terms'] if t['chapter'] == r['chapter'] and t['definitionId'] == r['definitionId']][0]['enNorm']
    L = longer(r['chapter'], h)
    if not L: return False, []
    v = 'old' if r['isSrc'] == 'june' and r['base'] == 'june' else 'new'
    en = seg_en[(r['chapter'], r['mod'], v, r['key'])]
    spans = [m.span() for m in M.en_pattern(h).finditer(en)]
    lspans = [m.span() for x in L for m in M.en_pattern(x).finditer(en)]
    if not spans: return False, L
    return all(any(a <= s and e <= b for a, b in lspans) for s, e in spans), L
cnt = Counter(); byterm = defaultdict(Counter); nested_keys = []
for r in B['records']:
    ok, L = nested_only(r)
    if ok:
        cnt[(r['base'], r['class'])] += 1
        byterm[r['base']][(r['chapter'], r['en'], r['target'])] += 1
        nested_keys.append((r['base'], r['chapter'], r['definitionId'], r['mod'], r['key']))
print('nested-only needing-change pairs by base/class:', {f'{b}:{c}': n for (b, c), n in sorted(cnt.items())})
for b in ('june', 'new', 'hybrid'):
    print(b, 'total', sum(v for (bb, c), v in cnt.items() if bb == b), byterm[b].most_common(12))
json.dump(nested_keys, open(sys.argv[5], 'w'))
