import json, sys, os, pickle, re
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vb_lib import *
from collections import Counter
B = pickle.load(open(f'{S}/burden_vb_cls.pkl', 'rb'))
corpus = pickle.load(open(f'{S}/corpus_vb.pkl', 'rb'))
base = sys.argv[1]; term = sys.argv[2]; nmax = int(sys.argv[3]) if len(sys.argv) > 3 else 8
def get(base, p):
    c = corpus[p['ch']][p['mod']]
    en = c['enJ'][p['key']] if base == 'june' else c['enN'][p['key']]
    is_ = c['isJ'][p['key']] if base == 'june' else (c['isN'][p['key']] if base == 'new' else c['hyb'][p['key']])
    return en, is_
pat = M.en_pattern(term)
bad = [p for p in B['results']['all'][base] if p['term'] == term and not p['ok']]
print(len(bad), 'needing change for', term, 'in', base, Counter(p['cls']['wide'] for p in bad))
# token census over bad segments: tokens starting with first 3 letters of competitor/target families
fam = Counter()
for p in bad:
    en, is_ = get(base, p)
    for tk in re.findall(r'\w+', M.plain(is_).lower()):
        if tk.startswith(('varm', 'hit')): fam[tk] += 1
print('varm*/hit* tokens in those segments:', fam.most_common(40))
for p in bad[:nmax]:
    en, is_ = get(base, p)
    pe = M.plain(en)
    ms = [pe[max(0, m.start()-50):m.end()+50] for m in pat.finditer(pe)]
    print(f"\n--- {p['mod']} {p['key']} [{p['cls']['wide']}] src={p['src']}\n EN matches: {ms}\n IS: {M.plain(is_)[:700]}")
