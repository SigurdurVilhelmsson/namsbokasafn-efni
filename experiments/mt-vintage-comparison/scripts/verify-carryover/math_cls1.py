import sys, os, json, subprocess, re, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from segs import *
HERE = os.path.dirname(os.path.abspath(__file__)); REPO = '/home/siggi/dev/repos/namsbokasafn-efni'
D = load()
mine = {}
for l in open(os.path.join(HERE, 'my_classes_gated-newen.jsonl')):
    r = json.loads(l); mine[r['key']] = r
def eqs(ch, mod):
    r = subprocess.run(['git','-C',REPO,'show',f'98a5fe2ff:books/efnafraedi-2e/02-structure/{ch}/{mod}-equations.json'],capture_output=True)
    if r.returncode: return {}
    d = json.loads(r.stdout); return {k: (v.get('mathml') if isinstance(v, dict) else v) for k, v in d.items()}
M = re.compile(r'\[\[MATH:(\d+)\]\]')
seqdiff = 0; mathml_diff = 0; types = collections.Counter(); ex = []
for p in sorted(D['new']['en']):
    ch, mod = chapter_of(p), module_of(p)
    ne, _ = parse_first(D['new']['en'][p]); je, _ = parse_first(D['june']['en'][p])
    E = None
    for k in ne:
        r = mine.get(k)
        if not r or r['cls'] != '1': continue
        a, b = M.findall(ne[k]), M.findall(je[k])
        if a != b:
            seqdiff += 1; types[k.split(':')[1]] += 1
            if E is None: E = eqs(ch, mod)
            if [E.get('math-' + x) for x in a] != [E.get('math-' + x) for x in b]:
                mathml_diff += 1
                if len(ex) < 4: ex.append((k, ne[k][:80], je[k][:80]))
print('class-1 keys whose MATH number sequence differs NEW EN vs June-ref EN:', seqdiff, dict(types), '| of which the MathML also differs:', mathml_diff)
for e in ex: print('  ', e)
