import json, sys, os, pickle, re
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vb_lib import *
from collections import Counter
corpus = pickle.load(open(f'{S}/corpus_vb.pkl', 'rb'))
terms = json.load(open(f'{S}/terms_vb.json'))
und = []; seen = set(); skipped_dup = 0; carry_each_other = 0
for t in terms:
    if 'verdict' in t or 'ruling' in t: continue
    if M.norm_en(t['Kj'] or '') == M.norm_en(t['Kn'] or ''): continue
    hk = (t['ch'], t['enNorm'])
    if hk in seen: skipped_dup += 1; continue
    if "--exclude-decided-twin" in sys.argv and hk in {(x["ch"], x["enNorm"]) for x in terms if "verdict" in x or "ruling" in x}: continue
    seen.add(hk); und.append(t)
    if t['Kj'] and t['Kn'] and M.carries(t['Kj'], M.stems(t['Kn'])) and M.carries(t['Kn'], M.stems(t['Kj'])): carry_each_other += 1
print('undecided headwords', len(und), '(same-chapter dup skipped', skipped_dup, ') ; entries that carry each other:', carry_each_other)
# also: how many undecided twins have a decided twin? (a twin of a decided headword in the same chapter)
dec_heads = {(t['ch'], t['enNorm']) for t in terms if 'verdict' in t or 'ruling' in t}
print('undecided whose same-chapter headword is decided:', sum(1 for t in und if (t['ch'], t['enNorm']) in dec_heads))
def it(ch, base):
    for mod, c in corpus[ch].items():
        if base == 'june': en, is_ = c['enJ'], c['isJ']; keys = en.keys() & is_.keys()
        else: en = c['enN']; is_ = c['isN'] if base == 'new' else c['hyb']; keys = en.keys() & c['isN'].keys()
        for k in keys:
            if k.startswith(('glossary-term:', 'glossary-def:')): continue
            yield mod, k, en[k], is_[k]
tot = Counter(); lown = 0
perch = {}
for t in und:
    pat = M.en_pattern(t['enNorm']); sj = M.stems(t['Kj'] or ''); sn = M.stems(t['Kn'] or '')
    nnew = 0
    for base in ('june', 'new', 'hybrid'):
        for mod, k, en, is_ in it(t['ch'], base):
            if not pat or not pat.search(M.plain(en)): continue
            tot[(base, 'prose')] += 1
            tot[(base, 'july')] += not M.carries(is_, sj)
            tot[(base, 'new')] += not M.carries(is_, sn)
            perch.setdefault(t['ch'], Counter())[(base, 'prose')] += 1
            if base == 'new': nnew += 1
    lown += nnew < 3
print('undecided with <3 prose in NEW:', lown)
for base in ('june', 'new', 'hybrid'):
    print(f"{base:7s} prose {tot[(base,'prose')]}  needing change if ruled July {tot[(base,'july')]}  if ruled new {tot[(base,'new')]}")
