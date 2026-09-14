#!/usr/bin/env python3
"""PRED2: name every difference between the PREVIOUS prediction build (plan/pred/work/FINAL = tree-int stage C) and
the FIXED build (plan/pred2/work/FINAL = tree-fix), block by block, at every layer the predictions read.

    PYTHONDONTWRITEBYTECODE=1 python3 -u compare_prev.py     -> ../out/compare_prev.json (+ stdout)

Layers:
  items    drawn items per layout block (path == 'layout', every key) and the kept items per figure
  report   compose-report.json: every key; `overflow` compared after checking the new `axis`/`linePt` and removing
           them; `containerErrors` must be [] (it is a new key, absent before)
  diag     every DIAG field per block; `overflow` normalised as in the report
  measure  measure-FINAL.jsonl rows per block, every field
  svg      translated.svg byte-equality per figure (informational)
Expected (the fix round's own claim, re-measured here): layout items move on exactly the blocks F1 (R9 symbols-only)
repartitions; nothing else moves at any layer except the additive report/diag keys.
"""
import json, sys, collections
from pathlib import Path
sys.dont_write_bytecode = True
OLD = Path('/home/siggi/dev/scratch-c140/plan/pred')
NEW = Path('/home/siggi/dev/scratch-c140/plan/pred2')
OW, NW = OLD / 'work/FINAL', NEW / 'work/FINAL'
short = lambda b, i: f"{b.replace('CNX_Chem_', '')} b{i}"
names = sorted(p.name for p in NW.iterdir() if p.is_dir())
assert len(names) == 34 and names == sorted(p.name for p in OW.iterdir() if p.is_dir())
res = dict(items_layout_changed=[], items_kept_changed=[], report=[], diag={}, measure={}, svg_changed=[],
           overflow_axis_linePt=[], container_errors=0)


def norm_over(o, where):
    if o is None:
        return None
    o = dict(o)
    ax = o.pop('axis', None); lp = o.pop('linePt', None)
    res['overflow_axis_linePt'].append(dict(where=where, word=o.get('word'), axis=ax, linePt=lp, needPt=o.get('needPt'),
                                            linePt_eq_needPt=(lp is not None and abs(lp - o['needPt']) < 1e-9)))
    return o


for b in names:
    oi = json.loads((OW / b / 'items.json').read_text()); ni = json.loads((NW / b / 'items.json').read_text())
    lo, ln = collections.defaultdict(list), collections.defaultdict(list)
    for it in oi:
        (lo[it['block']] if it['path'] == 'layout' else lo['kept']).append(it)
    for it in ni:
        (ln[it['block']] if it['path'] == 'layout' else ln['kept']).append(it)
    assert set(lo) == set(ln), b
    for k in lo:
        if k == 'kept':
            if lo[k] != ln[k]:
                res['items_kept_changed'].append(b)
        elif lo[k] != ln[k]:
            res['items_layout_changed'].append(short(b, k))
    # report
    ro = json.loads((OW / b / 'compose-report.json').read_text()); rn = json.loads((NW / b / 'compose-report.json').read_text())
    assert rn.get('containerErrors') == [], (b, rn.get('containerErrors'))
    res['container_errors'] += len(rn['containerErrors'])
    rn2 = {k: v for k, v in rn.items() if k != 'containerErrors'}
    rn2['overflow'] = [norm_over(o, f'report {short(b, o["block"])}') for o in rn['overflow']]
    diffk = sorted(k for k in set(ro) | set(rn2) if ro.get(k) != rn2.get(k))
    if diffk or set(ro) != set(rn2):
        res['report'].append((b, diffk))
    # diag
    do = {d['block']: d for d in json.loads((OW / b / 'diag.json').read_text())}
    dn = {d['block']: d for d in json.loads((NW / b / 'diag.json').read_text())}
    assert set(do) == set(dn)
    for bi in do:
        a, c = do[bi], dict(dn[bi])
        c['overflow'] = norm_over(c['overflow'], f'diag {short(b, bi)}')
        if c.get('r2') is not None:
            pass
        fields = sorted(k for k in set(a) | set(c) if a.get(k) != c.get(k))
        if fields:
            res['diag'][short(b, bi)] = {k: (a.get(k), c.get(k)) if k in ('lines', 'bound', 'step', 'size') else '(differs)' for k in fields}
    if (OW / b / 'translated.svg').read_bytes() != (NW / b / 'translated.svg').read_bytes():
        res['svg_changed'].append(b)

MO = {(r['basename'], r['block']): r for r in map(json.loads, open(OLD / 'out/measure-FINAL.jsonl'))}
MN = {(r['basename'], r['block']): r for r in map(json.loads, open(NEW / 'out/measure-FINAL.jsonl'))}
assert set(MO) == set(MN) and len(MN) == 176
for k in sorted(MN):
    a, c = MO[k], MN[k]
    fields = sorted(f for f in set(a) | set(c) if a.get(f) != c.get(f))
    if fields:
        res['measure'][short(*k)] = fields

L = set(res['items_layout_changed'])
print('items: layout blocks changed', len(L), sorted(L))
print('items: kept items changed in figures', res['items_kept_changed'])
print('report: keys differing after normalising overflow (axis/linePt removed) and dropping containerErrors == []:', res['report'])
print('report containerErrors total:', res['container_errors'])
ax = collections.Counter((x['axis'], x['linePt_eq_needPt']) for x in res['overflow_axis_linePt'])
print('overflow entries (report + diag) by (axis, linePt == needPt):', dict(ax))
print('diag: blocks with any field changed', len(res['diag']))
for s, f in sorted(res['diag'].items()):
    print('   ', s, json.dumps(f, ensure_ascii=False))
print('diag changed blocks NOT in the layout-items set:', sorted(set(res['diag']) - L))
print('measure: rows with any field changed', len(res['measure']))
for s, f in sorted(res['measure'].items()):
    print('   ', s, f)
print('measure changed rows NOT in the layout-items set:', {s: f for s, f in res['measure'].items() if s not in L})
print('translated.svg changed in figures:', len(res['svg_changed']), res['svg_changed'])
(NEW / 'out/compare_prev.json').write_text(json.dumps(res, indent=1, ensure_ascii=False))
