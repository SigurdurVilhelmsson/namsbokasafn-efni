import json, re, sys, os
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vb_lib import *
from collections import Counter, defaultdict
V = json.load(open(f'{REPO}/experiments/terminology-consistency/results/2026-10-10/verdicts-2026-10-10.json'))['answers']
R = json.load(open(f'{S}/rulings.json'))
vby = {(a['chapter'], a['definitionId']): a for a in V}
terms = []
for ch in chapters():
    for mod in modules(ch):
        enN, isN = load('new', ch, mod)
        enJ, isJ = load('june', ch, mod)
        for key, txt in enN.items():
            if not key.startswith('glossary-term:'):
                continue
            did = key.split(':', 1)[1].rsplit('-term', 1)[0]
            terms.append(dict(ch=ch, mod=mod, key=key, did=did, en=M.plain(txt).strip(), enNorm=M.norm_en(txt),
                              Kn=isN.get(key), Kj=isJ.get(key), enJ=enJ.get(key)))
print('taught terms', len(terms))
# (a) verdicts
found = 0
for t in terms:
    a = vby.get((t['ch'], t['did']))
    if a:
        t['verdict'] = a; found += 1
print('verdicts joined', found, 'of', len(V))
# check verdict julyEntry/newEntry vs actual K strings
mism = [(t['ch'], t['en'], t['verdict']['julyEntry'], t['Kj'], t['verdict']['newEntry'], t['Kn']) for t in terms if 'verdict' in t and (M.norm_en(t['verdict']['julyEntry']) != M.norm_en(t['Kj'] or '') or M.norm_en(t['verdict']['newEntry']) != M.norm_en(t['Kn'] or ''))]
print('verdict entry vs segment K mismatches (norm_en):', len(mism)); [print('   ', m) for m in mism[:10]]
# (b) exact rulings
def exact_ruling(enNorm):
    hits = [(f.lower(), r['is']) for r in R for f in r['en'] if f.lower() == enNorm]
    return hits
rul = []
for t in terms:
    h = exact_ruling(t['enNorm'])
    if h:
        t['ruling'] = h[0]
        if 'verdict' not in t:
            rul.append(t)
print('terms with exact ruling', sum(1 for t in terms if 'ruling' in t), '; not in verdicts:', len(rul))
for t in rul: print('   R', t['ch'], t['did'], repr(t['en']), '->', t['ruling'][1], '| Kj', repr(t['Kj']), '| Kn', repr(t['Kn']))
# exact strict (no paren strip)
strict = [t for t in rul if t['en'].lower() != t['ruling'][0]]
print('of those, rulings that match only after parenthetical strip:', [(t['ch'], t['en']) for t in strict])
# verdict terms that ALSO have an exact ruling (conflicts / agreements)
for t in terms:
    if 'verdict' in t and 'ruling' in t:
        print('   V+R', t['ch'], t['en'], '| target', t['verdict']['targetIcelandic'], '| ruling', t['ruling'][1])
# same-headword duplicates within a chapter
c = Counter((t['ch'], t['enNorm']) for t in terms)
print('same-chapter duplicate headwords:', [(k, n) for k, n in c.items() if n > 1])
json.dump(terms, open(f'{S}/terms_vb.json', 'w'), ensure_ascii=False, indent=0)
