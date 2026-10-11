"""Second, list-based (no dict) parse of the raw files: (1) recount ch09, ch15, ch16 independently;
(2) how many duplicate-marker segments (collapsed by dict parsing) carry a decided term."""
import json, sys, os, re, glob, pickle
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vb_lib import M, S, BOOK
from collections import Counter, defaultdict
SEGRE = re.compile(r'<!--\s*SEG:([^\s]+?)\s*-->')
def seglist(path):
    t = open(path, encoding='utf-8').read(); parts = SEGRE.split(t)
    return [(parts[i].split(':', 1)[-1], parts[i+1].strip()) for i in range(1, len(parts)-1, 2)]
B = pickle.load(open(f'{S}/burden_vb.pkl', 'rb'))
dec = B['decided']
for ch in ('ch09', 'ch15', 'ch16'):
    for v in ('june', 'new'):
        n = bad = 0; dupextra = 0
        for f in sorted(glob.glob(f'{S}/{v}/books/{BOOK}/02-for-mt/{ch}/m*-segments.en.md')):
            mod = os.path.basename(f).split('-segments')[0]
            en = seglist(f); is_ = seglist(f.replace('02-for-mt', '02-mt-output').replace('.en.md', '.is.md'))
            # pair by position-in-order of each key occurrence
            isq = defaultdict(list)
            for k, t in is_: isq[k].append(t)
            seen = Counter()
            for k, t in en:
                if k.startswith(('glossary-term:', 'glossary-def:')): continue
                occ = seen[k]; seen[k] += 1
                if k not in isq or occ >= len(isq[k]): continue
                it = isq[k][occ]
                for d in dec:
                    if d['ch'] != ch: continue
                    if M.en_pattern(d['enNorm']).search(M.plain(t)):
                        n += 1; ok = M.carries(it, M.stems(d['target'])); bad += (not ok)
                        if occ > 0: dupextra += 1
        print(f'{ch} {v}: list-parse prose pairs {n}, needing change {bad}, of which on 2nd+ duplicate markers {dupextra}')
# duplicates across the whole book
tot = Counter()
for v in ('june', 'new'):
    for f in sorted(glob.glob(f'{S}/{v}/books/{BOOK}/02-for-mt/ch*/m*-segments.en.md')):
        ch = f.split('/')[-2]
        en = seglist(f); seen = Counter()
        for k, t in en:
            seen[k] += 1
            if seen[k] > 1 and not k.startswith('glossary'):
                for d in dec:
                    if d['ch'] == ch and M.en_pattern(d['enNorm']).search(M.plain(t)):
                        tot[v] += 1
print('decided-term matches on duplicate (collapsed) markers, whole book:', dict(tot))
