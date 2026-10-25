import sys, os, json, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from segs import *
from norm import *
D = load()
A = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'raw', 'astrans.json')))
files_raw_diff = 0; keys_raw_diff = 0; keys_norm_diff = []; keyset_diff = 0; nkeys = 0; ptype = collections.Counter()
eq_diff = []
for p in sorted(D['june']['en']):
    je, jo = parse_first(D['june']['en'][p])
    ae, ao = parse_first(A[p]['en'])
    ji, _ = parse_first(D['june']['is'][pair_path(p)])
    if set(ae) != set(je) or set(ae) != set(ji):
        keyset_diff += 1
    if A[p]['en'] != D['june']['en'][p]:
        files_raw_diff += 1
    for k in jo:
        nkeys += 1
        if k not in ae: continue
        if ae[k] != je[k]:
            keys_raw_diff += 1
            if visible(ae[k]) != visible(je[k]):
                keys_norm_diff.append((k, A[p]['commit'][:9], ae[k][:200], je[k][:200]))
    # equations
    jeq = None
    mod = module_of(p); ch = chapter_of(p)
print('files', len(D['june']['en']), 'files raw-differ', files_raw_diff, 'keyset differs (as-trans EN vs june EN/IS):', keyset_diff)
print('keys', nkeys, 'raw differ', keys_raw_diff, 'normalized differ', len(keys_norm_diff))
for x in keys_norm_diff: print('  ', x)
