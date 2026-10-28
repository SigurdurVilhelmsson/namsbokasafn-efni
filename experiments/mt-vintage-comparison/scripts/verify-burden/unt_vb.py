import json, sys, os, pickle, re
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vb_lib import *
from collections import Counter
B = pickle.load(open(f'{S}/burden_vb_cls.pkl', 'rb'))
corpus = pickle.load(open(f'{S}/corpus_vb.pkl', 'rb'))
latin = re.compile(r'[A-Za-z]')
def strict(a): return re.sub(r'\s+', ' ', M.plain(a)).strip()
for v in ('june', 'new'):
    for nm, f in (('norm_seg_en', norm_seg_en), ('plain', strict)):
        lst = []
        for ch in corpus:
            for mod, c in corpus[ch].items():
                en, is_ = (c['enJ'], c['isJ']) if v == 'june' else (c['enN'], c['isN'])
                for k in en.keys() & is_.keys():
                    a = f(en[k]); b = f(is_[k])
                    if a == b and len(latin.findall(a)) >= 40: lst.append((ch, mod, k))
        print(v, nm, len(lst), [x[2][:30] for x in lst])
        if v == 'new' and nm == 'norm_seg_en': unt_new = set(lst)
        if v == 'june' and nm == 'norm_seg_en': unt_june = set(lst)
for base in ('new', 'hybrid'):
    P = [p for p in B['results']['all'][base] if not p['ok'] and p['cls']['wide'] == 'X' and ((p['src'] in ('new', 'new-noJune', 'new-diffEN') and (p['ch'], p['mod'], p['key']) in unt_new) or (p['src'] == 'june' and (p['ch'], p['mod'], p['key']) in unt_june))]
    print(base, 'X pairs on untranslated segments:', len(P), 'segments:', len({(p['mod'], p['key']) for p in P}), [ (p['term'], p['key'][:25]) for p in P])
