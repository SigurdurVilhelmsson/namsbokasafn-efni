import re, sys, os, glob
from collections import Counter, defaultdict
S = os.path.dirname(os.path.abspath(__file__))
SEGRE = re.compile(r'<!--\s*SEG:([^\s]+?)\s*-->')
for v in ('june','new'):
    for sub, pat in (('02-for-mt','*-segments.en.md'),('02-mt-output','*-segments.is.md')):
        tot = Counter(); samecontent = 0; diffcontent = 0; ex = []
        for f in sorted(glob.glob(f'{S}/{v}/books/efnafraedi-2e/{sub}/ch*/{pat}')):
            if not os.path.basename(f).startswith('m'): continue
            t = open(f, encoding='utf-8').read()
            parts = SEGRE.split(t)
            seen = defaultdict(list)
            for i in range(1, len(parts)-1, 2):
                seen[parts[i]].append(parts[i+1].strip())
            for k, vals in seen.items():
                if len(vals) > 1:
                    tot[k.split(':')[1]] += len(vals)-1
                    if len(set(vals)) == 1: samecontent += len(vals)-1
                    else:
                        diffcontent += len(vals)-1
                        if len(ex) < 3: ex.append((os.path.basename(f), k, [x[:90] for x in vals]))
        print(v, sub, 'extra duplicate markers by type:', dict(tot), '| identical content', samecontent, '| differing content', diffcontent)
        for e in ex: print('   ', e)
