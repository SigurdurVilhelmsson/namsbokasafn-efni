"""Planted positive controls for each zero reported, plus the 5th-corpus (as-translated EN) duplicate check."""
import sys, os, json, collections, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from segs import *
from norm import *
HERE = os.path.dirname(os.path.abspath(__file__))
D = load(); A = json.load(open(os.path.join(HERE, 'raw', 'astrans.json')))
NE, NI = {}, {}
for p in D['new']['en']:
    NE.update(parse_first(D['new']['en'][p])[0]); NI.update(parse_first(D['new']['is'][pair_path(p)])[0])
rows = [json.loads(l) for l in open(os.path.join(HERE, 'my_classes_gated-newen-reuse.jsonl'))]
# (1) term-id reorder detector: real corpus, then one planted swap
def reorders(store):
    n = 0
    for k, en in NE.items():
        e_ids = [nd[1] for nd in preorder(parse_brackets(en), {'term'})]
        if len(e_ids) < 2: continue
        i_ids = [nd[1] for nd in preorder(parse_brackets(store[k]), {'term'})]
        if sorted(i_ids) == sorted(e_ids) and i_ids != e_ids: n += 1
    return n
k0 = 'm68664:para:fs-idp4269776'
planted = dict(NI); planted[k0] = NI[k0].replace('term-00003', 'TMP').replace('term-00004', 'term-00003').replace('TMP', 'term-00004')
print('(1) term-id reorders: real', reorders(NI), '| with 1 planted swap', reorders(planted))
# (2) empty-June-source and (3) truncation detectors on carried rows, then planted defects
def detect(rows_, override):
    emp = trunc = 0
    for r in rows_:
        if not (r.get('src_ext') and r.get('clean')): continue
        car = override.get(r['key'], r['carried'])
        e = NE[r['key']]
        if visible(car, legacy=False) == '' and visible(e) != '': emp += 1
        el = len(chars(e))
        if el >= 120 and len(chars(car, legacy=False)) / el < 0.6: trunc += 1
    return emp, trunc
big = next(r for r in rows if r.get('clean') and len(chars(NE[r['key']])) > 400)
small = next(r for r in rows if r.get('clean') and r['key'] != big['key'] and len(chars(NE[r['key']])) > 50)
print('(2,3) empty, truncated: real', detect(rows, {}), '| planted 1 empty + 1 half-length', detect(rows, {small['key']: '', big['key']: big['carried'][:len(big['carried']) // 2]}))
# (4) source text-equality control: the same test must reject exactly the 3 known changed keys
rej = [r['key'] for r in rows if r['type'] not in ('alt', 'table-summary') and not r.get('src_ext')]
print('(4) non-alt/summary keys with no equal-text June source (expected the 3 real changes):', rej)
# (5) duplicates in the 5th corpus: as-translated EN
tot = raw = gen = 0
for p, v in A.items():
    first = {}
    for k, c in parse_records(v['en']):
        if k in first:
            tot += 1; raw += c != first[k]; gen += visible(c) != visible(first[k])
        else: first[k] = c
print('(5) as-translated EN duplicate occurrences:', tot, '| differ raw', raw, '| differ after generic normalization', gen)
