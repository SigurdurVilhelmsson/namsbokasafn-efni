import sys, os, json, subprocess, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from segs import *
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = '/home/siggi/dev/repos/namsbokasafn-efni'
A = json.load(open(os.path.join(HERE, 'raw', 'astrans.json')))
def ls(ref):
    return [p for p in subprocess.run(['git','-C',REPO,'ls-tree','-r','--name-only',ref,'books/efnafraedi-2e/02-structure/'],capture_output=True,text=True).stdout.split() if p.endswith('-equations.json')]
def show(ref, p):
    r = subprocess.run(['git','-C',REPO,'show',f'{ref}:{p}'],capture_output=True)
    return json.loads(r.stdout) if r.returncode == 0 else None
J, N = set(ls('9a69414d5')), set(ls('98a5fe2ff'))
print('equations.json files: June', len(J), 'NEW', len(N), 'common', len(J & N))
def mm(d):
    if d is None: return None
    # store may be {math-N: {mathml:..}} or nested; reduce to math-N -> mathml string
    out = {}
    for k, v in (d.items() if isinstance(d, dict) else []):
        out[k] = v.get('mathml') if isinstance(v, dict) else v
    return out
same = diff = 0; diffs = []
for p in sorted(J & N):
    a, b = mm(show('9a69414d5', p)), mm(show('98a5fe2ff', p))
    if a == b: same += 1
    else:
        diff += 1; diffs.append((p, len(a or {}), len(b or {}), sum(1 for k in set(a)|set(b) if (a or {}).get(k) != (b or {}).get(k))))
print('June-ref vs NEW (math-N -> mathml): identical', same, 'differ', diff, diffs[:5])
# full-object equality too (all fields)
same_full = sum(1 for p in sorted(J & N) if show('9a69414d5', p) == show('98a5fe2ff', p))
print('June-ref vs NEW full JSON object equality:', same_full, 'of', len(J & N))
# as-translated vs June-ref
s2 = d2 = 0; dl = []
for p, v in A.items():
    ch = chapter_of(p); mod = module_of(p)
    ep = f'books/efnafraedi-2e/02-structure/{ch}/{mod}-equations.json'
    if ep not in J: continue
    a = mm(json.loads(v['eq'])) if v['eq'] else None
    b = mm(show('9a69414d5', ep))
    if a == b: s2 += 1
    else: d2 += 1; dl.append((mod, v['commit'][:9], None if a is None else len(a), len(b or {})))
print('as-translated commit vs June-ref: identical', s2, 'differ', d2, dl)
