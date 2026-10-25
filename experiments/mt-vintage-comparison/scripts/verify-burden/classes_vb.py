"""verify-burden: my own SWAP-PARALLEL / SWAP-AGREEMENT / ABSENT classifier, with narrow and wide competitor sets."""
import json, sys, os, pickle, re
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vb_lib import *
from collections import Counter, defaultdict
corpus = pickle.load(open(f'{S}/corpus_vb.pkl', 'rb'))
B = pickle.load(open(f'{S}/burden_vb.pkl', 'rb'))
terms = json.load(open(f'{S}/terms_vb.json'))
R = json.load(open(f'{S}/rulings.json'))
by_en = defaultdict(set)
for t in terms:
    for K in (t['Kj'], t['Kn']):
        if K: by_en[t['enNorm']].add(K)
ruling_exact = {f.lower(): r['is'] for r in R for f in r['en']}
# definition sites, both vintages, all segments of the term's chapter
def def_sites(ch, enNorm):
    out = Counter()
    for mod, c in corpus[ch].items():
        for (en, is_) in ((c['enJ'], c['isJ']), (c['enN'], c['isN'])):
            for k, et in en.items():
                if k.startswith(('glossary-term:', 'glossary-def:')) or k not in is_: continue
                es = M.term_spans(et)
                hits = [i for i, s in enumerate(es) if M.norm_en(s) == enNorm]
                if not hits: continue
                isp = M.term_spans(is_[k])
                if len(isp) != len(es): continue
                for i in hits: out[isp[i]] += 1
    return out
def final2(s):
    st = M.stems(s)
    return st[-1][-2:] if st else ''
decided = {(d['ch'], d['enNorm']): d for d in B['decided']}
comp_cache = {}
def competitors(d, wide):
    key = (d['ch'], d['enNorm'], wide)
    if key in comp_cache: return comp_cache[key]
    tn = M.norm_en(d['target']); tst = M.stems(d['target'])
    cands = {d['Kj'] or '', d['Kn'] or ''}
    if d['enNorm'] in ruling_exact: cands.add(ruling_exact[d['enNorm']])
    if wide:
        cands |= by_en[d['enNorm']]
        cands |= set(def_sites(d['ch'], d['enNorm']))
    out = []
    for c in cands:
        if not c or M.norm_en(c) == tn or not M.stems(c) or M.stems(c) == tst: continue
        out.append(c)
    comp_cache[key] = out
    return out
summary = {}
for wide in (False, True):
    for base in ('june', 'new', 'hybrid'):
        cls_any = Counter(); cls_strict = Counter()
        for p in B['results']['all'][base]:
            if p['ok']: continue
            d = decided[(p['ch'], p['term'])]
            c = corpus[p['ch']][p['mod']]
            is_ = c['isJ'][p['key']] if base == 'june' else (c['isN'][p['key']] if base == 'new' else c['hyb'][p['key']])
            carried = [x for x in competitors(d, wide) if M.carries(is_, M.stems(x))]
            if not carried:
                k1 = k2 = 'X'
            else:
                par = [final2(x) == final2(d['target']) for x in carried]
                k1 = 'P' if any(par) else 'A'      # P if any carried competitor is parallel
                k2 = 'P' if all(par) else 'A'      # P only if all are parallel
            cls_any[k1] += 1; cls_strict[k2] += 1
            p.setdefault('cls', {})[('wide' if wide else 'narrow')] = k1
        print(f'{"wide  " if wide else "narrow"} {base:7s} P-if-any {dict(sorted(cls_any.items()))}   P-if-all {dict(sorted(cls_strict.items()))}')
pickle.dump(B, open(f'{S}/burden_vb_cls.pkl', 'wb'))
