import sys, os, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from segs import *
D = load()
pat = re.compile(sys.argv[3])
n = 0
for p, txt in D[sys.argv[1]][sys.argv[2]].items():
    recs, _ = parse_first(txt)
    for k, s in recs.items():
        m = pat.search(s)
        if m:
            n += 1
            if n <= int(sys.argv[4]):
                a = max(0, m.start()-60); print(k, '|', s[a:m.end()+60].replace('\n', ' '))
print('segments matching:', n)
