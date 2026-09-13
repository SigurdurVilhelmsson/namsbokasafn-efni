# mkvariant.py <orig.svg> <report.json> <out.svg> <keep-uncollapsed ids comma-separated or range a-b over the sorted collapsed list>
import sys, json
orig, repp, out, spec = sys.argv[1:5]
rep = json.load(open(repp)); coll = rep['collapsedIds']
if ':' in spec:
    a, b = map(int, spec.split(':')); keep = set(coll[a:b])
else:
    keep = set(x for x in spec.split(',') if x)
raw = open(orig, 'rb').read()
import re
n = 0
for fa in coll:
    if fa in keep: continue
    num = int(fa.split('-')[1]); fb = 'filter-%d' % (num - 1)
    old = b'<g filter="url(#%s)"' % fa.encode(); new = b'<g filter="url(#%s)"' % fb.encode()
    c = raw.count(old); assert c == 1, (fa, c)
    raw = raw.replace(old, new); n += 1
# sanity: the blend id really is F_add-1 for every collapsed id (cross-check with report written by lerpcollapse)
open(out, 'wb').write(raw)
print(json.dumps({'out': out, 'collapsed': n, 'leftUncollapsed': sorted(keep & set(coll), key=lambda s: int(s.split('-')[1]))}))
