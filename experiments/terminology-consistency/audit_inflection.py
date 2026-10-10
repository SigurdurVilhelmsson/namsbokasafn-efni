#!/usr/bin/env python3
"""Residual-blindness audit for the matcher. A prose miss is a NEAR-MISS when every content
word of the key-terms entry has a token in the Icelandic sharing its first 5 letters (the whole
word if shorter), yet measure.carries() said no. Near-misses are the candidates for inflection
false negatives; read the printed examples, because a shared prefix is also how compounds and
unrelated words collide. Usage: python3 audit_inflection.py old|new  (examples from that vintage)"""
# Count prose misses that look like inflection false negatives: every content word of K has an
# IS token sharing a prefix of >= 5 chars (or the whole word if shorter) — yet carries() said no.
import sys, re, json, importlib.util
from collections import Counter
spec = importlib.util.spec_from_file_location('m', __file__.replace('audit_inflection.py', 'measure.py')); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
OLD, NEW = '9a69414d5', 'origin/main'
def near(is_text, K):
    toks = re.findall(r'\w+', m.plain(is_text).lower())
    for w in re.findall(r'\w+', m.PAREN.sub('', m.plain(K)).lower()):
        if len(w) <= 2: continue
        p = w[:min(5, len(w))]
        if not any(t.startswith(p) for t in toks): return False
    return True
tot = Counter(); ex = []
for ch in [f'ch{i:02d}' for i in range(1, 22)]:
    mods = sorted({n.split('-segments')[0] for n in m.git_ls(NEW, f'books/efnafraedi-2e/02-mt-output/{ch}') if n.endswith('-segments.is.md') and n.startswith('m')})
    data = {mo: {'old': m.load_vintage(OLD, 'efnafraedi-2e', ch, mo), 'new': m.load_vintage(NEW, 'efnafraedi-2e', ch, mo)} for mo in mods}
    for mo, d in data.items():
        for key, txt in d['new'][0].items():
            if not key.startswith('glossary-term:'): continue
            pat = m.en_pattern(m.norm_en(txt))
            for v in ('old', 'new'):
                K = d[v][1].get(key)
                if not K or not pat: continue
                st = m.stems(K)
                for mo2, d2 in data.items():
                    en, is_ = d2[v]
                    for k2, e in en.items():
                        if k2.startswith(('glossary-term:', 'glossary-def:')) or k2 not in is_ or not pat.search(m.plain(e)): continue
                        tot[v, 'prose'] += 1
                        if m.carries(is_[k2], st): continue
                        tot[v, 'miss'] += 1
                        if near(is_[k2], K):
                            tot[v, 'nearMiss'] += 1
                            if len(ex) < 40 and v == sys.argv[1]: ex.append((ch, K, [t for t in re.findall(r'\w+', m.plain(is_[k2]).lower()) if any(t.startswith(w[:5]) for w in re.findall(r'\w+', K.lower()) if len(w) > 2)][:4]))
print(dict(tot))
for e in ex: print(e)
