"""MathML-resolved classification: MATH token = sha1(MathML) from each vintage's own equations store."""
import sys, os, json, subprocess, hashlib, collections, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from segs import *
from norm import *
HERE = os.path.dirname(os.path.abspath(__file__)); REPO = '/home/siggi/dev/repos/namsbokasafn-efni'
D = load(); A = json.load(open(os.path.join(HERE, 'raw', 'astrans.json')))
def store(ref, ch, mod):
    r = subprocess.run(['git','-C',REPO,'show',f'{ref}:books/efnafraedi-2e/02-structure/{ch}/{mod}-equations.json'],capture_output=True)
    if r.returncode: return {}
    d = json.loads(r.stdout); return {k: (v.get('mathml') if isinstance(v, dict) else v) for k, v in d.items()}
MT = re.compile(r'\[\[MATH:(\d+)\]\]')
def vres(s, st):
    s2 = MT.sub(lambda m: '' + hashlib.sha1((st.get('math-' + m.group(1)) or ('?' + m.group(1))).encode()).hexdigest()[:12] + '', s)
    return visible(s2)
c = collections.Counter()
for p in sorted(D['new']['en']):
    ch, mod = chapter_of(p), module_of(p)
    sN = store('98a5fe2ff', ch, mod); sA = {}
    if A[p]['eq']:
        d = json.loads(A[p]['eq']); sA = {k: (v.get('mathml') if isinstance(v, dict) else v) for k, v in d.items()}
    ne, no = parse_first(D['new']['en'][p]); je, jo = parse_first(D['june']['en'][p]); ae, _ = parse_first(A[p]['en'])
    nv = {k: vres(ne[k], sN) for k in no}
    jv = {k: vres(je[k], sN) for k in jo}   # June-ref store == NEW store (121/121 identical)
    av = {k: vres(ae[k], sA) for k in jo}
    jt = collections.Counter(jv[k] for k in jo if jv[k] == av[k])
    for k in no:
        typ = k.split(':')[1]
        if typ in ('alt', 'table-summary'): c['4-none'] += 1; continue
        if k in je:
            if nv[k] == jv[k] == av[k]: c['1'] += 1
            elif jt[nv[k]]: c['2-recovered'] += 1
            else: c['2-unrecoverable'] += 1
        else:
            if jt[nv[k]] == 1: c['3'] += 1
            elif jt[nv[k]] > 1: c['4-aligned'] += 1
            else: c['4-nomatch'] += 1
print(dict(sorted(c.items())), 'carriable', c['1'] + c['2-recovered'] + c['3'] + c['4-aligned'])
