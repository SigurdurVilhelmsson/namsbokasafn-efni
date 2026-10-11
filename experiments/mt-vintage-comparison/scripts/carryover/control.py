#!/usr/bin/env python3
"""Positive control for the normalizer: June-ref EN vs as-translated EN, same keys,
two extractions of the same source.  visible() must agree on (nearly) all keys."""
import sys, json, collections
sys.path.insert(0, '.')
from segparse import parse, load, key_of
from markers import visible, loose
meta = json.load(open('raw/meta.json'))
tot = 0; same = 0; diffs = []
for r in meta:
    J = {}; A = {}; N = {}
    for s, t in parse(load('.', 'june_en', r['chdir'], r['module'])): J.setdefault(key_of(s), t)
    for s, t in parse(load('.', 'astrans_en', r['chdir'], r['module'])): A.setdefault(key_of(s), t)
    for s, t in parse(load('.', 'new_en', r['chdir'], r['module'])): N.setdefault(key_of(s), t)
    for k in J:
        tot += 1
        lit = N[k].count('*') if k in N else J[k].count('*')
        vj, va = visible(J[k], lit), visible(A[k], lit)
        if vj == va: same += 1
        else: diffs.append((r['chdir'], r['module'], k, vj, va, loose(vj) == loose(va), J[k] == A[k]))
print('keys', tot, 'visible-equal', same, 'differ', len(diffs))
print('of differing: loose-equal', sum(1 for d in diffs if d[5]))
json.dump(diffs, open('control_diffs.json', 'w'), ensure_ascii=False, indent=0)
import difflib
for d in diffs[:25]:
    a, b = d[3], d[4]
    sm = difflib.SequenceMatcher(None, a, b)
    ops = [(op, a[i1:i2], b[j1:j2]) for op, i1, i2, j1, j2 in sm.get_opcodes() if op != 'equal']
    print(d[0], d[1], d[2], 'loose=', d[5], ops[:4])
