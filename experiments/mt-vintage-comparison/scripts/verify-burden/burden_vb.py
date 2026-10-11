"""verify-burden: my own count of segment-term pairs needing a change, per base."""
import json, sys, os, pickle, re
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vb_lib import *
from collections import Counter, defaultdict
corpus = pickle.load(open(f'{S}/corpus_vb.pkl', 'rb'))
terms = json.load(open(f'{S}/terms_vb.json'))
ALT_RULING_TARGET = '--ruling-wins' in sys.argv   # sensitivity: rulings override verdicts on conflict
decided = []
for t in terms:
    if 'verdict' in t:
        tgt = t['verdict']['targetIcelandic']; srcd = 'verdict'
        if ALT_RULING_TARGET and 'ruling' in t: tgt = t['ruling'][1]
    elif 'ruling' in t:
        tgt = t['ruling'][1]; srcd = 'ruling'
    else:
        continue
    decided.append(dict(t, target=tgt, source=srcd))
print('decided terms', len(decided), Counter(d['source'] for d in decided))
# same-chapter duplicates among ALL taught terms; are both entries decided?
dupkeys = Counter((t['ch'], t['enNorm']) for t in terms)
for d in decided:
    if dupkeys[(d['ch'], d['enNorm'])] > 1: print('  decided term with same-chapter twin:', d['ch'], d['enNorm'], d['did'], d['source'])

def base_iter(ch, base, common=False):
    """yield (mod, key, en_text, is_text, src) for prose candidates of a base."""
    for mod, c in corpus[ch].items():
        if base == 'june':
            en, is_ = c['enJ'], c['isJ']; keys = en.keys() & is_.keys()
        else:
            en = c['enN']; is_ = c['isN'] if base == 'new' else c['hyb']; keys = en.keys() & c['isN'].keys()
        if common:
            keys = keys & (c['enJ'].keys() & c['isJ'].keys()) & (c['enN'].keys() & c['isN'].keys())
        for k in keys:
            if k.startswith(('glossary-term:', 'glossary-def:')):
                continue
            yield mod, k, en[k], is_[k], (c['src'].get(k) if base == 'hybrid' else base)

results = {}
for common in (False, True):
    tag = 'common' if common else 'all'
    res = {}
    for base in ('june', 'new', 'hybrid'):
        pairs = []   # (ch, term enNorm, did, source, mod, key, src, carries)
        seen_ch_head = set()
        for d in decided:
            hk = (d['ch'], d['enNorm'])
            if hk in seen_ch_head:
                continue   # same-chapter twin: prose counted once
            seen_ch_head.add(hk)
            pat = M.en_pattern(d['enNorm']); tst = M.stems(d['target'])
            for mod, k, en, is_, src in base_iter(d['ch'], base, common):
                if not pat or not pat.search(M.plain(en)):
                    continue
                c = M.carries(is_, tst)
                pairs.append(dict(ch=d['ch'], term=d['enNorm'], did=d['did'], source=d['source'], mod=mod, key=k, src=src, ok=c))
        res[base] = pairs
    results[tag] = res
    print(f'\n==== population: {tag}')
    for base in ('june', 'new', 'hybrid'):
        P = res[base]; bad = [p for p in P if not p['ok']]
        useg = {(p['mod'], p['key']) for p in bad}
        bys = Counter(p['source'] for p in bad)
        print(f'{base:7s} pairs needing change {len(bad):4d} of {len(P):4d} ({100*len(bad)/max(1,len(P)):.1f}%)  unique segs {len(useg):4d}  by source {dict(bys)}')
        if base == 'hybrid':
            print('        hybrid needing change by IS source:', Counter(p['src'] for p in bad), '| by seg type of new-IS picks:', Counter(p['key'].split(':')[0] for p in bad if p['src'] != 'june'))
# per chapter (all population)
print('\nper chapter (all):  pairs needing change / prose')
for ch in chapters():
    row = []
    for base in ('june', 'new', 'hybrid'):
        P = [p for p in results['all'][base] if p['ch'] == ch]; bad = [p for p in P if not p['ok']]
        row.append(f'{base[0].upper()} {len(bad):3d}/{len(P):3d} (v{sum(1 for p in bad if p["source"]=="verdict")} r{sum(1 for p in bad if p["source"]=="ruling")}) u{len({(p["mod"],p["key"]) for p in bad})}')
    print(ch, ' | '.join(row))
# heaviest terms
for base in ('june', 'new', 'hybrid'):
    c = Counter((p['ch'], p['term']) for p in results['all'][base] if not p['ok'])
    print(f'\nheaviest {base}:', ', '.join(f'{t} ({ch}) {n}' for (ch, t), n in c.most_common(15)))
# headword fixes
print('\nkey-terms headword fixes:')
for base in ('june', 'new', 'hybrid'):
    n_str = n_car = 0; tot = 0; lst = []
    for d in decided:
        tot += 1
        K = d['Kj'] if base == 'june' else d['Kn']
        if base == 'hybrid':
            enJ = d['enJ']; ok_take = enJ is not None and d['Kj'] is not None and norm_seg_en(enJ) == norm_seg_en(corpus[d['ch']][d['mod']]['enN'][d['key']])
            K = d['Kj'] if ok_take else d['Kn']
        s = M.norm_en(K or '') != M.norm_en(d['target']); c = not M.carries(K or '', M.stems(d['target']))
        n_str += s; n_car += c
        if s: lst.append((d['ch'], d['enNorm'], K, d['target']))
    print(f'  {base:7s} string-differs {n_str} / carries-fails {n_car} of {tot}')
    if base == 'june': june_list = lst
pickle.dump(dict(results=results, decided=decided), open(f'{S}/burden_vb' + ('_rulingwins' if ALT_RULING_TARGET else '') + '.pkl', 'wb'))
