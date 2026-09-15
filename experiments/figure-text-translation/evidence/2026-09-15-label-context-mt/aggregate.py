#!/usr/bin/env python3
"""Unblind the three-lens judgement and score joined (J1, J2) against per-label (P).

    python3 aggregate.py <workflow-output.json>   -> verdicts.json + printed summary
"""
import json, sys, statistics, collections
from pathlib import Path

HERE = Path(__file__).resolve().parent
ORD = {'wrong': 0, 'acceptable': 1, 'correct': 2}
NAME = {0: 'wrong', 1: 'acceptable', 2: 'correct'}

raw = json.loads(Path(sys.argv[1]).read_text())
res = raw.get('result', raw)
if isinstance(res, str):
    res = json.loads(res)
key = json.loads((HERE / 'key' / 'keymap.json').read_text())

lenses = {j['lens']: {it['id']: it for it in (j['result'] or {}).get('items', [])} for j in res['judged'] if j}
print('lenses returned:', {k: len(v) for k, v in lenses.items()}, 'of', len(key))

rows = []
for iid, k in key.items():
    per = {}
    for cid in k['cands']:
        scores = {}
        for lens, items in lenses.items():
            it = items.get(iid)
            v = next((x for x in (it or {}).get('verdicts', []) if x['cid'] == cid), None)
            if v:
                scores[lens] = ORD[v['verdict']]
        per[cid] = dict(text=k['cands'][cid]['text'], arms=k['cands'][cid]['arms'], scores=scores,
                        consensus=int(statistics.median_low(sorted(scores.values()))) if scores else None)
    arm_score = {a: next((p['consensus'] for p in per.values() if a in p['arms']), None) for a in ('C', 'P', 'J1', 'J2')}
    best = collections.Counter((lenses[l].get(iid) or {}).get('best') for l in lenses)
    rows.append(dict(id=iid, fig=k['fig'], en=k['en'], stable=k['stable'], cands=per, arm=arm_score,
                     best_votes={b: n for b, n in best.items() if b}))

def cmp(a, b):
    if a is None or b is None:
        return 'n/a'
    return 'better' if a > b else 'worse' if a < b else 'same'

summary = {}
for arm in ('J1', 'J2'):
    c = collections.Counter(cmp(r['arm'][arm], r['arm']['P']) for r in rows)
    summary[f'{arm} vs P'] = dict(c)
for label, pop in (('stable (J1==J2)', [r for r in rows if r['stable']]), ('unstable', [r for r in rows if not r['stable']])):
    summary[f'J1 vs P, {label}'] = dict(collections.Counter(cmp(r['arm']['J1'], r['arm']['P']) for r in pop))
summary['P consensus'] = dict(collections.Counter(NAME.get(r['arm']['P']) for r in rows))
summary['J1 consensus'] = dict(collections.Counter(NAME.get(r['arm']['J1']) for r in rows))
summary['J2 consensus'] = dict(collections.Counter(NAME.get(r['arm']['J2']) for r in rows))
summary['P wrong, J1 not wrong'] = sum(1 for r in rows if r['arm']['P'] == 0 and (r['arm']['J1'] or 0) > 0)
summary['J1 wrong, P not wrong'] = sum(1 for r in rows if r['arm']['J1'] == 0 and (r['arm']['P'] or 0) > 0)
summary['J2 wrong, P not wrong'] = sum(1 for r in rows if r['arm']['J2'] == 0 and (r['arm']['P'] or 0) > 0)
agree = collections.Counter()
for r in rows:
    for p in r['cands'].values():
        s = list(p['scores'].values())
        if len(s) == 3:
            agree['unanimous' if len(set(s)) == 1 else 'split'] += 1
summary['lens agreement over candidates'] = dict(agree)

(HERE / 'verdicts.json').write_text(json.dumps(dict(summary=summary, rows=rows), ensure_ascii=False, indent=1))
print(json.dumps(summary, ensure_ascii=False, indent=1))
print('\nPER ITEM (P → J1 / J2, consensus):')
for r in rows:
    txt = {a: next((p['text'] for p in r['cands'].values() if a in p['arms']), None) for a in ('P', 'J1', 'J2')}
    a = r['arm']
    print(f"{r['id']} {r['en'][:32]:32} P={txt['P']!r}:{NAME.get(a['P'])}  J1={txt['J1']!r}:{NAME.get(a['J1'])}"
          + ('' if r['stable'] else f"  J2={txt['J2']!r}:{NAME.get(a['J2'])}"))
