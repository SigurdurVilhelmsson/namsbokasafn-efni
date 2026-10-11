#!/usr/bin/env python3
"""Measure a SECOND-STAGE rule for kind-count fallbacks: when the June IS lacks markers the
NEW EN has, re-insert each missing language-neutral marked run (e.g. [[i:N]][[sub:A]]) at
the UNIQUE place its visible text occurs in the June IS.  Count rescues; write nothing."""
import json, sys, re, collections
sys.path.insert(0, '.')
from segparse import parse, load, key_of
from markers import parse as bp, walk, serialize, legacy_to_bracket, Marker
from convert import convert, kind_key
rows = [json.loads(l) for l in open(sys.argv[1] if len(sys.argv) > 1 else 'classification-mathres.jsonl')]
cache = {}
def seg(tag, chdir, mod, key):
    k = (tag, chdir, mod)
    if k not in cache: cache[k] = {key_of(x): t for x, t in parse(load('.', tag, chdir, mod))}
    return cache[k].get(key)
def vis(nodes):
    out = []
    for n in nodes:
        out.append(n if isinstance(n, str) else vis(n.children))
    return ''.join(out)
NEUTRAL = {'i', 'b', 'sub', 'sup'}
res = collections.Counter(); ex = []
for r in rows:
    if r.get('conv_status') != 'fallback' or not r['conv_reasons'][0].startswith('kind-count-mismatch'): continue
    en = seg('new_en', r['chdir'], r['module'], r['key'])
    jis = r['june_is_raw']
    bis, _ = legacy_to_bracket(jis, en.count('*'))
    en_nodes = bp(en)
    # top-level runs of adjacent neutral markers in EN
    runs = []; cur = []
    for n in en_nodes + ['\0']:
        if isinstance(n, Marker) and n.kind in NEUTRAL:
            cur.append(n)
        else:
            if cur: runs.append(cur); cur = []
    is_nodes = bp(bis)
    is_count = collections.Counter(kind_key(m) for m in walk(is_nodes))
    en_count = collections.Counter(kind_key(m) for m in walk(en_nodes))
    out = bis
    for run in runs:
        text = vis(run)
        markup = serialize(run)
        if markup in out: continue  # already present in the IS
        # occurrences of the run's visible text in IS plain (outside markers) -- word-bounded
        pat = re.compile(r'(?<![\w\[|:])' + re.escape(text) + r'(?![\w\]|])')
        plain_hits = [m for m in pat.finditer(out)]
        if len(plain_hits) == 1:
            m = plain_hits[0]
            out = out[:m.start()] + markup + out[m.end():]
    c = convert(out, en, r['june_is_raw'] if False else seg('astrans_en', r['chdir'], r['module'], r['source_key']))
    ok = c['status'] == 'clean'
    res['rescued' if ok else 'still-fallback'] += 1
    if len(ex) < 8: ex.append((r['module'], r['key'], jis[:80], '->', (c['converted'] or out)[:100], ok))
print(dict(res))
for e in ex: print(' ', e)
