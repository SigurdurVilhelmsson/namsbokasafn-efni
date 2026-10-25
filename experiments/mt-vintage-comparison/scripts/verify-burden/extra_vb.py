import json, sys, os, pickle, re
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vb_lib import *
import classes_vb as C
from collections import Counter, defaultdict
B = C.B; corpus = C.corpus; dec = C.decided
terms = json.load(open(f'{S}/terms_vb.json'))
R = json.load(open(f'{S}/rulings.json'))
def isx(base, p):
    c = corpus[p['ch']][p['mod']]
    return c['isJ'][p['key']] if base == 'june' else (c['isN'][p['key']] if base == 'new' else c['hyb'][p['key']])
def enx(base, p):
    c = corpus[p['ch']][p['mod']]
    return c['enJ'][p['key']] if base == 'june' else c['enN'][p['key']]
# 1. untranslated: normalised IS == normalised EN with >= 40 Latin letters
latin = re.compile(r'[A-Za-z]')
unt = {}
for v in ('june', 'new'):
    lst = []
    for ch in corpus:
        for mod, c in corpus[ch].items():
            en, is_ = (c['enJ'], c['isJ']) if v == 'june' else (c['enN'], c['isN'])
            for k in en.keys() & is_.keys():
                a = norm_seg_en(en[k]); b = norm_seg_en(is_[k])
                if a == b and len(latin.findall(a)) >= 40:
                    lst.append((ch, mod, k))
    unt[v] = set(lst)
    print('untranslated', v, len(lst), Counter(x[0] for x in lst))
for base in ('new', 'hybrid', 'june'):
    xs = {(p['mod'], p['key']) for p in B['results']['all'][base] if not p['ok'] and p['cls']['wide'] == 'X'}
    src = 'june' if base == 'june' else 'new'
    hit = {(m, k) for (ch, m, k) in unt[src]} & xs
    if base == 'hybrid':
        hit = {(p['mod'], p['key']) for p in B['results']['all'][base] if not p['ok'] and p['cls']['wide'] == 'X' and p['src'] != 'june' and (p['ch'], p['mod'], p['key']) in unt['new']} | {(p['mod'], p['key']) for p in B['results']['all'][base] if not p['ok'] and p['cls']['wide'] == 'X' and p['src'] == 'june' and (p['ch'], p['mod'], p['key']) in unt['june']}
    print(f'   untranslated segments among {base} X needing-change segments: {len(hit)}')
# 2. nested-only: every EN match of the term lies inside a match of a longer same-chapter key-terms headword or ruling EN form
heads_by_ch = defaultdict(set)
for t in terms: heads_by_ch[t['ch']].add(t['enNorm'])
rul_en = {f.lower() for r in R for f in r['en']}
nested = {}
for base in ('june', 'new', 'hybrid'):
    n = Counter()
    for p in B['results']['all'][base]:
        if p['ok']: continue
        pe = M.plain(enx(base, p))
        spans = [(m.start(), m.end()) for m in M.en_pattern(p['term']).finditer(pe)]
        longer = [h for h in (heads_by_ch[p['ch']] | rul_en) if len(h) > len(p['term']) and re.search(r'(?<![\w-])' + re.escape(p['term']), h)]
        lspans = []
        for h in longer:
            pat = M.en_pattern(h)
            if pat: lspans += [(m.start(), m.end()) for m in pat.finditer(pe)]
        if spans and all(any(a <= s and e <= b for a, b in lspans) for s, e in spans):
            n[p['term']] += 1
    nested[base] = n
    print(f'nested-only {base}: {sum(n.values())}', n.most_common(8))
# 3. renumbered entries re-matchable by content
uniq = amb = tot = 0
for ch in corpus:
    for mod, c in corpus[ch].items():
        jn = defaultdict(list)
        for k, t in c['enJ'].items():
            if k in c['isJ']: jn[norm_seg_en(t)].append(k)
        for k, s in c['src'].items():
            if s == 'new-diffEN' and k.startswith('entry:'):
                tot += 1
                hits = jn.get(norm_seg_en(c['enN'][k]), [])
                if len(hits) == 1: uniq += 1
                elif len(hits) > 1: amb += 1
print('renumbered entries (same id, diff EN):', tot, 'unique content match', uniq, 'ambiguous', amb)
# 4. SWAP decided only on definition-site surface forms (carried competitors none of which is a K entry or a ruling)
citation = set()
for t in terms:
    for K in (t['Kj'], t['Kn']):
        if K: citation.add(M.norm_en(K))
for r in R: citation.add(M.norm_en(r['is']))
for base in ('june', 'new', 'hybrid'):
    cnt = Counter()
    for p in B['results']['all'][base]:
        if p['ok'] or p['cls']['wide'] == 'X': continue
        d = dec[(p['ch'], p['term'])]
        carried = [x for x in C.competitors(d, True) if M.carries(isx(base, p), M.stems(x))]
        if carried and all(M.norm_en(x) not in citation for x in carried):
            cnt[p['cls']['wide']] += 1
    print(f'SWAP pairs resting only on def-site surface forms, {base}: {sum(cnt.values())} {dict(cnt)}')
