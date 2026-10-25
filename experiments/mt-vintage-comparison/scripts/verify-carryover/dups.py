import sys, os, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from segs import *
D = load()
for v in ('june', 'new'):
    for lang in ('en', 'is'):
        n = 0; diff = 0; files = collections.Counter(); examples = []
        for p, txt in D[v][lang].items():
            recs = parse_records(txt); seen = {}
            for k, c in recs:
                if k in seen:
                    n += 1
                    if seen[k] != c:
                        diff += 1; files[module_of(p)] += 1
                        if len(examples) < 4: examples.append((k, seen[k][:80], c[:80]))
                else:
                    seen[k] = c
        print(v, lang, 'dup occurrences', n, 'differing from first', diff, 'modules', dict(files))
        for e in examples: print('   ', e)
