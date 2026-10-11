import sys, re
from collections import Counter
sys.path.insert(0, sys.argv[1])
import lib
C, S = lib.load(sys.argv[2])
tot = Counter(); diffs = []
for ch in C['chapters']:
    for m in C['modules'][ch]['new']:
        en_o, is_o = S[(ch, m, 'old')]; en_n, is_n = S[(ch, m, 'new')]
        for k, e in en_n.items():
            tot['newKeys'] += 1
            if k not in is_n: tot['newEnOnly'] += 1
            if k not in en_o:
                tot['notInJune'] += 1; tot['notInJune:' + k.split(':')[0]] += 1; continue
            if k not in is_o:
                tot['inJuneEnNotIs'] += 1; continue
            a, b = lib.norm_en_seg(en_o[k]), lib.norm_en_seg(e)
            if a == b: tot['sameNorm'] += 1
            else:
                tot['diffNorm'] += 1; tot['diffNorm:' + k.split(':')[0]] += 1
                diffs.append((ch, m, k, en_o[k], e, a, b))
        for k in en_o:
            if k not in en_n: tot['juneOnly'] += 1; tot['juneOnly:' + k.split(':')[0]] += 1
for k, v in sorted(tot.items(), key=lambda x: (-x[1])): print(k, v)
import random
random.seed(1)
print('\n=== sample of diffNorm (raw old / raw new / norm old / norm new)')
for d in random.sample(diffs, min(25, len(diffs))):
    print('---', d[0], d[1], d[2]); print(' O:', d[3][:300]); print(' N:', d[4][:300]); print(' o:', d[5][:300]); print(' n:', d[6][:300])
