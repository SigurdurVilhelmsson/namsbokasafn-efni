"""Independent re-implementation of the candidate re-wrap rule on the kind-mismatch fallbacks."""
import sys, os, json, collections, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from segs import *
from norm import *
import norm as N
HERE = os.path.dirname(os.path.abspath(__file__))
D = load()
NE, JI = {}, {}
for p in D['new']['en']:
    NE.update(parse_first(D['new']['en'][p])[0]); JI.update(parse_first(D['june']['is'][pair_path(p)])[0])
rows = [json.loads(l) for l in open(os.path.join(HERE, 'my_classes_gated-newen-reuse.jsonl'))]
NEUT = {'i', 'b', 'sub', 'sup'}
def runs(nodes):
    return [(nd[0], visible(ser(nd[2]))) for nd in preorder(nodes, NEUT)]
res = collections.Counter(); ok = []
for r in rows:
    if not r.get('src_ext') or r['clean'] or r['conv_reasons'] != ['kinds']: continue
    kd = r.get('kind_delta') or {}
    if not kd or any(v > 0 for v in kd.values()) or any(k not in NEUT for k in kd):
        res['not eligible (extra or non-neutral kinds)'] += 1; continue
    conv = N.legacy_to_bracket(JI[r['src_ext']], literal_asterisks=NE[r['key']].count('*'))
    en_runs = collections.Counter(runs(parse_brackets(NE[r['key']])))
    is_runs = collections.Counter(runs(parse_brackets(conv)))
    missing = en_runs - is_runs
    s = conv; fail = False
    for (kind, t), n in missing.items():
        if not t or n != 1 or s.count(t) != 1:
            fail = True; break
        s = s.replace(t, f'[[{kind}:{t}]]', 1)
    if fail: res['eligible, not rescued'] += 1; continue
    try:
        if kinds(parse_brackets(s)) == kinds(parse_brackets(NE[r['key']])):
            res['rescued'] += 1; ok.append((r['key'], s[:100]))
        else: res['eligible, re-gate failed'] += 1
    except ParseError:
        res['eligible, parse failed'] += 1
print(dict(res))
for o in ok[:6]: print('  ', o)
