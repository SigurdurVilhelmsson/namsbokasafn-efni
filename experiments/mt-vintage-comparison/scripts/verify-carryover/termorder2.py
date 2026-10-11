"""Second, NEW-independent swap check: use JUNE's own key-terms list (glossary-term segments, EN+IS at the June ref,
same chapter) to map each June in-text term to an English headword, then compare with the NEW EN term at the same position."""
import sys, os, json, itertools, collections, importlib.util, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from segs import *
from norm import *
import norm as N
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('measure', '/home/siggi/dev/repos/namsbokasafn-efni/experiments/terminology-consistency/measure.py')
M = importlib.util.module_from_spec(spec); spec.loader.exec_module(M)
D = load()
rows = {}
for l in open(os.path.join(HERE, 'my_classes_gated-newen-reuse.jsonl')):
    r = json.loads(l); rows[r['key']] = r
# chapter glossary: June IS headword -> June EN headword
gloss = collections.defaultdict(list)
for p in D['june']['en']:
    ch = chapter_of(p)
    je, _ = parse_first(D['june']['en'][p]); ji, _ = parse_first(D['june']['is'][pair_path(p)])
    for k in je:
        if k.split(':')[1] == 'glossary-term':
            gloss[ch].append((visible(ji[k]), visible(je[k])))
def en_eq(a, b):
    a, b = M.norm_en(a), M.norm_en(b)
    return a == b or a.rstrip('s') == b.rstrip('s')
def term_texts(nodes):
    return [visible(ser(nd[2])) for nd in preorder(nodes, {'term'})]
res = collections.Counter(); swaps = []; n = 0
for p in sorted(D['new']['en']):
    ch = chapter_of(p); ip = pair_path(p)
    ne, _ = parse_first(D['new']['en'][p]); ji, _ = parse_first(D['june']['is'][ip])
    for k in ne:
        r = rows.get(k)
        if not r or not r.get('src_ext') or not r['clean']: continue
        jc = parse_brackets(N.legacy_to_bracket(ji[r['src_ext']], literal_asterisks=ne[k].count('*')))
        jt = [(visible(ser(nd[2])), nd[1]) for nd in preorder(jc, {'term'})]
        if len(jt) < 2 or any(a for _, a in jt): continue
        n += 1
        J = [t for t, _ in jt]; E = term_texts(parse_brackets(ne[k]))
        # candidate English headwords for each June term via June's own glossary (Icelandic stem match)
        cand = []
        for t in J:
            c = set()
            for gi, ge in gloss[ch]:
                try:
                    if M.carries(t, M.stems(gi)) or M.carries(gi, M.stems(t)): c.add(ge)
                except Exception:
                    pass
            cand.append(c)
        ok = [any(en_eq(e, E[i]) for e in cand[i]) for i in range(len(J))]
        other = [[j for j in range(len(E)) if j != i and any(en_eq(e, E[j]) for e in cand[i])] for i in range(len(J))]
        if any(other[i] and not ok[i] for i in range(len(J))):
            res['SWAP (June glossary maps term i to EN term j!=i)'] += 1; swaps.append((k, J, E, [sorted(c)[:3] for c in cand]))
        elif all(ok): res['verified'] += 1
        elif any(ok): res['partly'] += 1
        else: res['undecidable'] += 1
print('segments', n, dict(res))
for s in swaps: print('  ', s)
