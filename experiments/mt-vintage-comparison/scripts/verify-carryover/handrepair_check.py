import sys, os, json, subprocess, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from segs import *
from norm import *
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = '/home/siggi/dev/repos/namsbokasafn-efni'
D = load()
mine = {}
for l in open(os.path.join(HERE, 'my_classes_gated-newen.jsonl')):
    r = json.loads(l); mine[(r['ch'], r['key'])] = r
def show(ref, path):
    r = subprocess.run(['git', '-C', REPO, 'show', f'{ref}:{path}'], capture_output=True)
    return r.stdout.decode() if r.returncode == 0 else None
keys = {}
for c in ('6417625c9', '42536323b', 'f313fee32', '8271886b0'):
    files = subprocess.run(['git', '-C', REPO, 'show', '--name-only', '--format=', c], capture_output=True, text=True).stdout.split()
    files = [f for f in files if f.startswith('books/efnafraedi-2e/02-mt-output/') and f.endswith('segments.is.md')]
    n = 0
    for f in files:
        b, _ = parse_first(show(c + '^', f)); a, _ = parse_first(show(c, f))
        for k in set(a) | set(b):
            if a.get(k) != b.get(k):
                keys[(chapter_of(f), k)] = {'commit': c, 'before': b.get(k), 'after': a.get(k), 'file': f}
                n += 1
    print(c, 'files', len(files), 'changed keys', n)
print('total distinct hand-repaired keys', len(keys))
st = collections.Counter(); undo = []
for (ch, k), v in keys.items():
    f = v['file']
    ni, _ = parse_first(D['new']['is'][f]); ji, _ = parse_first(D['june']['is'][f])
    still = ni.get(k) == v['after']
    r = mine.get((ch, k), {})
    carried = r.get('carried')
    raw_eq = ji.get(k) == v['after']
    vis_eq = (ji.get(k) is not None) and visible(ji[k]) == visible(v['after'])
    car_eq = carried == v['after'] if carried is not None else None
    st[('still_in_NEW', still, 'carried', carried is not None, 'carry==repair', car_eq, 'visJune==repair', vis_eq)] += 1
    if carried is not None and not car_eq:
        undo.append((ch, k, v['commit'][:9], (ji.get(k) or '')[:90], v['after'][:90]))
for x, n in sorted(st.items(), key=lambda x: -x[1]): print(n, x)
print('carry would differ from the ruled text (would revert):', len(undo))
for u in undo[:25]: print('  ', u)
