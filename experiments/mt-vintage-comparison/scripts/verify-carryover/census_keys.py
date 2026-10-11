import sys, os, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from segs import *
D = load()
tot = {}
for v in ('june', 'new'):
    nk = 0; dup = 0; dupdiff = 0; types = collections.Counter(); keymismatch = 0; mods = set()
    en_only = 0; is_only = 0
    for p, txt in D[v]['en'].items():
        recs = parse_records(txt)
        first, order = parse_first(txt)
        dup += len(recs) - len(first)
        # duplicates with differing content
        seen = {}
        for k, c in recs:
            if k in seen and seen[k] != c:
                dupdiff += 1
            seen.setdefault(k, c)
        ip = pair_path(p)
        itxt = D[v]['is'].get(ip)
        ifirst, _ = parse_first(itxt)
        if set(first) != set(ifirst):
            keymismatch += 1
            en_only += len(set(first) - set(ifirst)); is_only += len(set(ifirst) - set(first))
        nk += len(first)
        for k in first:
            types[k.split(':')[1]] += 1
        mods.add(module_of(p))
    print(v, 'files', len(D[v]['en']), 'unique keys', nk, 'dup occurrences', dup, 'dups w/ different content', dupdiff,
          'files with EN/IS key-set mismatch', keymismatch, 'en_only', en_only, 'is_only', is_only)
    print('  types:', dict(types.most_common()))
    tot[v] = types
print('type delta new-june:', {t: tot['new'][t]-tot['june'][t] for t in set(tot['new'])|set(tot['june']) if tot['new'][t]!=tot['june'][t]})
