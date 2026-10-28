#!/usr/bin/env python3
"""For carried segments with >=2 terms (ids assigned by ORDER), check the order against the
NEW Icelandic, whose [[term:X|id]] markers carry ids: does June term i match the NEW IS term
with the id it was given (inflection-aware matcher from experiments/terminology-consistency)?"""
import json, sys, collections, importlib.util, re
sys.path.insert(0, '.')
from segparse import parse, load, key_of
from markers import parse as bp, walk, serialize
spec = importlib.util.spec_from_file_location('measure', '/home/siggi/dev/repos/namsbokasafn-efni/experiments/terminology-consistency/measure.py')
M = importlib.util.module_from_spec(spec); spec.loader.exec_module(M)
fn = sys.argv[1] if len(sys.argv) > 1 else 'classification-mathres.jsonl'
rows = [json.loads(l) for l in open(fn)]
cache = {}
def nis(r):
    k = (r['chdir'], r['module'])
    if k not in cache: cache[k] = {key_of(x): t for x, t in parse(load('.', 'new_is', *k))}
    return cache[k].get(r['key'])
def match(a, b):
    a, b = a.strip(), b.strip()
    if not a or not b: return False
    if a.lower() == b.lower(): return True
    return M.carries(a, M.stems(b)) or M.carries(b, M.stems(a))
res = collections.Counter(); examples = collections.defaultdict(list)
for r in rows:
    if not any(f.startswith('positional-term') for f in (r.get('conv_flags') or [])): continue
    ci = r['carried_is']; ni = nis(r)
    jt = [(m.attr, serialize(m.children)) for m in walk(bp(ci)) if m.kind == 'term']
    nt = {m.attr: serialize(m.children) for m in walk(bp(ni)) if m.kind == 'term'}
    ok = sum(1 for a, t in jt if a in nt and match(t, nt[a]))
    # alternative: is some OTHER id a better match?
    cross = 0
    for a, t in jt:
        if a in nt and match(t, nt[a]): continue
        if any(match(t, nt[b]) for b in nt if b != a): cross += 1
    if ok == len(jt): v = 'order-verified'
    elif cross: v = 'order-CONFLICT'
    elif ok > 0: v = 'partly-verified (rest unmatched)'
    else: v = 'unverifiable (vintages use different words)'
    res[v] += 1
    if len(examples[v]) < 4: examples[v].append((r['module'], r['key'], jt, nt))
print(dict(res))
for v, ex in examples.items():
    print('==', v)
    for e in ex: print('  ', e[0], e[1], 'JUNE->', [(a, t) for a, t in e[2]], ' NEW IS:', e[3])
