"""Positional term-id assignment check (independent decision rule).
For clean carried segments where the June IS terms carry no id and there are >=2 terms:
June term texts (in Icelandic order) get NEW EN term ids by position. The NEW IS is id-anchored,
so NEW IS term text for each id is the reference. Score identity vs the best other permutation."""
import sys, os, json, itertools, collections, importlib.util, re, unicodedata
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
def words(s):
    return [w for w in re.findall(r'\w+', unicodedata.normalize('NFC', s.lower())) if len(w) >= 3]
def sim(a, b):
    """prefix-overlap similarity between two Icelandic term strings (0..1)."""
    wa, wb = words(a), words(b)
    if not wa or not wb: return 0.0
    best = 0
    for x in wa:
        for y in wb:
            p = 0
            while p < min(len(x), len(y)) and x[p] == y[p]: p += 1
            best = max(best, p / max(4, min(len(x), len(y))))
    return min(best, 1.0)
def term_texts(nodes):
    return [(visible(ser(nd[2])), nd[1]) for nd in preorder(nodes, {'term'})]
res = collections.Counter(); examples = collections.defaultdict(list); n = 0
for p in sorted(D['new']['en']):
    ip = pair_path(p)
    ne, _ = parse_first(D['new']['en'][p]); ni, _ = parse_first(D['new']['is'][ip]); ji, _ = parse_first(D['june']['is'][ip])
    for k in ne:
        r = rows.get(k)
        if not r or not r.get('src_ext') or not r['clean']: continue
        jconv = parse_brackets(N.legacy_to_bracket(ji[r['src_ext']], literal_asterisks=ne[k].count('*')))
        jt = term_texts(jconv)
        if len(jt) < 2 or any(a is not None and a != '' for _, a in jt): continue
        n += 1
        et = [a for _, a in term_texts(parse_brackets(ne[k]))]
        nt = {a: t for t, a in term_texts(parse_brackets(ni[k]))}
        ref = [nt.get(e, '') for e in et]
        J = [t for t, _ in jt]
        ident = [sim(J[i], ref[i]) for i in range(len(J))]
        # measure.py second opinion: does June term i carry the NEW IS headword stems?
        mcar = []
        for i in range(len(J)):
            try:
                mcar.append(bool(M.carries(J[i], M.stems(ref[i]))) if ref[i] else None)
            except Exception:
                mcar.append(None)
        best_perm, best_score = None, sum(ident)
        if len(J) <= 6:
            for perm in itertools.permutations(range(len(J))):
                if list(perm) == list(range(len(J))): continue
                sc = sum(sim(J[i], ref[perm[i]]) for i in range(len(J)))
                if sc > best_score + 0.5: best_perm, best_score = perm, sc
        matched = sum(1 for x in ident if x >= 0.75)
        if best_perm is not None: v = 'SWAP-SUSPECT'
        elif matched == len(J): v = 'verified'
        elif matched > 0: v = 'partly'
        else: v = 'undecidable'
        res[v] += 1
        if len(examples[v]) < 4: examples[v].append((k, J, ref, [round(x, 2) for x in ident], mcar, best_perm))
print('multi-term (>=2) clean carried segments with positional ids:', n)
print(dict(res))
for v, ex in examples.items():
    print(v)
    for e in ex: print('   ', e)
# planted control: swap the two June terms in a verified example and re-score
