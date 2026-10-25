"""Build the three bases' segment populations (per chapter, per module) and the splice stats."""
import json, sys, os
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vb_lib import *
from collections import Counter
stats = Counter(); kinds = Counter(); diff_types = Counter(); ph_diff = 0
enonly_new = Counter(); dups = Counter()
corpus = {}
for ch in chapters():
    corpus[ch] = {}
    for mod in modules(ch):
        enJ, isJ = load('june', ch, mod); enN, isN = load('new', ch, mod)
        for v in ('june', 'new'):
            dups[v] += dup_count(f'{S}/{v}/books/{BOOK}/02-for-mt/{ch}/{mod}-segments.en.md') + dup_count(f'{S}/{v}/books/{BOOK}/02-mt-output/{ch}/{mod}-segments.is.md')
        enonly_new['newEN-not-IS'] += len(enN.keys() - isN.keys()); enonly_new['newIS-not-EN'] += len(isN.keys() - enN.keys())
        enonly_new['juneEN-not-IS'] += len(enJ.keys() - isJ.keys()); enonly_new['juneIS-not-EN'] += len(isJ.keys() - enJ.keys())
        hyb = {}; src = {}
        for k in enN.keys() & isN.keys():
            stats['newkeys'] += 1
            if k in enJ and k in isJ:
                if norm_seg_en(enJ[k]) == norm_seg_en(enN[k]):
                    hyb[k] = isJ[k]; src[k] = 'june'; stats['takeJune'] += 1
                    # placeholder ids differ?
                    import re
                    pj = re.findall(r'\[\[(?:MATH|MEDIA|TABLE|xref|docref):[^\]|]*', enJ[k]); pn = re.findall(r'\[\[(?:MATH|MEDIA|TABLE|xref|docref):[^\]|]*', enN[k])
                    if pj != pn: ph_diff += 1
                else:
                    hyb[k] = isN[k]; src[k] = 'new-diffEN'; stats['sameIdDiffEN'] += 1; diff_types[k.split(':')[0]] += 1
            else:
                hyb[k] = isN[k]; src[k] = 'new-noJune'; stats['noJuneKey'] += 1; kinds[k.split(':')[0]] += 1
        corpus[ch][mod] = dict(enJ=enJ, isJ=isJ, enN=enN, isN=isN, hyb=hyb, src=src)
print('splice:', dict(stats)); print('no-June-key by type:', dict(kinds)); print('same id, different EN by type:', dict(diff_types))
print('June picks with differing [[MATH|MEDIA|TABLE|xref|docref]] id sequences:', ph_diff)
print('pairing gaps:', dict(enonly_new)); print('duplicate SEG keys within a file:', dict(dups))
import pickle
pickle.dump(corpus, open(f'{S}/corpus_vb.pkl', 'wb'))
