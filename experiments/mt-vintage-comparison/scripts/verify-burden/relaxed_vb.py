"""Which needing-change pairs flip to 'carried' if a SHORT target word (<=5 letters) may also appear
inside a compound (any position)? Upper bound of the compound-blindness artefact; tokens listed for reading."""
import json, sys, os, pickle, re
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vb_lib import *
from collections import Counter, defaultdict
B = pickle.load(open(f'{S}/burden_vb_cls.pkl', 'rb'))
corpus = pickle.load(open(f'{S}/corpus_vb.pkl', 'rb'))
dec = {(d['ch'], d['enNorm']): d for d in B['decided']}
def isx(base, p):
    c = corpus[p['ch']][p['mod']]
    return c['isJ'][p['key']] if base == 'june' else (c['isN'][p['key']] if base == 'new' else c['hyb'][p['key']])
def relaxed_word(tok, w):
    if M.word_matches(tok, w): return True
    if len(w) > 5: return False
    root = M.NOM_ENDING.sub('', w) if len(w) >= 4 else w
    if len(root) < 3: root = w
    # root anywhere inside a longer token, a<->ö tolerant
    for p in range(0, len(tok) - len(root) + 1):
        if all(M.same_letter(a, b) for a, b in zip(tok[p:p+len(root)], root)) and len(tok) > len(root) + 1:
            return True
    return False
def relaxed(is_text, words):
    toks = re.findall(r'\w+', M.plain(is_text).lower())
    return all(any(relaxed_word(t, f) for t in toks for f in M.word_forms(w)) for w in words)
for base in ('june', 'new', 'hybrid'):
    flips = Counter(); toks_by = defaultdict(Counter)
    for p in B['results']['all'][base]:
        if p['ok']: continue
        d = dec[(p['ch'], p['term'])]
        st = M.stems(d['target'])
        if not any(len(w) <= 5 for w in st): continue
        it = isx(base, p)
        if relaxed(it, st):
            flips[(p['ch'], p['term'], d['target'])] += 1
            for w in st:
                if len(w) <= 5:
                    root = M.NOM_ENDING.sub('', w) if len(w) >= 4 else w
                    for tk in re.findall(r'\w+', M.plain(it).lower()):
                        if root in tk.replace('ö', 'a') or root in tk:
                            if not M.word_matches(tk, w): toks_by[(p['ch'], p['term'])][tk] += 1
    print(f'== {base}: needing-change pairs that flip under a compound-tolerant short-word matcher: {sum(flips.values())}')
    for k, n in flips.most_common():
        print('   ', k, n, toks_by[(k[0], k[1])].most_common(8))
