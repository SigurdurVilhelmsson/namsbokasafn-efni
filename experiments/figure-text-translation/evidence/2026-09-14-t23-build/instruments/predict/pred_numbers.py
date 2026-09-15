#!/usr/bin/env python3
"""Print every number PREDICTIONS.md quotes, straight from the JSON the instruments wrote (no hand transcription).

    PYTHONDONTWRITEBYTECODE=1 python3 -u pred_numbers.py > ../out/numbers.txt
"""
import json, collections, sys
from pathlib import Path
P = Path('/home/siggi/dev/scratch-c140/plan/pred2/out')
W = Path('/home/siggi/dev/scratch-c140/plan/pred2/work/FINAL')
CEN = json.loads(Path('/home/siggi/dev/scratch-c140/r2/census.json').read_text())
A = json.loads((P / 'analysis-final.json').read_text())
S = {T: json.loads((P / f'sentinels-{T}.json').read_text()) for T in ('V5_p2.0_f7.5', 'FINAL')}
SUP = json.loads((P / 'supplementary.json').read_text())
ATT = json.loads((P / 'attribution.json').read_text())
M = {T: {(r['basename'], r['block']): r for r in map(json.loads, open(P / f'measure-{T}.jsonl'))}
     for T in ('V5_p2.0_f7.5', 'FINAL', 'V5_p2.0_f7.5.SUPP-linear', 'FINAL.SUPP-linear')}
sh = lambda k: f"{k[0].replace('CNX_Chem_', '')} b{k[1]}"
T5, TF = 'V5_p2.0_f7.5', 'FINAL'


def cm(r):
    g = r['geometry'].get('container_vector') or r['geometry']['container']
    return round(min(g['drawn']['left'], g['drawn']['right']), 2)


for T in (T5, TF):
    p = A['per_tag'][T]; t = p['totals']; rows = M[T]
    print(f'==================== {T}')
    print('PROBLEM', p['problem_n'], p['problem'])
    print('UNRESOLVED', p['unresolved_n'], p['unresolved'], '| resolved', sum(f[T] for f in A['flag_table']), '/', len(A['flag_table']))
    print('HIT', t['hit'], [(sh(k), r['ink_on_dark']) for k, r in sorted(rows.items()) if r['ink_on_dark'] >= 10], '| ink_sum', t['ink_sum'])
    print('OFFPAGE', t['offpage'], p['offpage'])
    print('SPILL', t['spill'], [(sh(k), r['spill']) for k, r in sorted(rows.items()) if r['spill'] >= 10])
    print('CONTACT', t['contact'], [(sh(k), cm(r)) for k, r in sorted(rows.items()) if r['cls'] == 'BOUNDED' and cm(r) < 1.0])
    print('TEXT_COLL', t['text_coll'])
    print('CENSUS_UNION', t['census_union'], '| RANK', p['rank'])
    print('SHRUNK', t['shrunk'], p['shrunk'])
    print('BELOW8.5 new', len(p['below_8_5_new']), p['below_8_5_new'], 'sum', p['below_new_sum'], '| src<8.5', p['below_8_5_src'])
    print('OVERFLOW', len(p['overflow']), [(o['basename'], o['block'], o['cls'], o['word'], o['need_pt'], o['budget_pt'], o['size']) for o in p['overflow']])
    print('OPENFALLBACK', len(p['open_fallback']))
    print('LINES differ', t['lines_differ'], 'more', t['more_lines'], p['lines_more'], 'fewer', t['fewer_lines'])
    print('FEWER', p['lines_fewer'])
    print('CHANGED_VS_V0', p['changed_vs_V0'])
    print('BY_CLASS', p['by_class'])
    st = {k: (len(v), v if k not in ('box:fit', 'cell:fit', 'open:i') else '') for k, v in sorted(p['steps'].items())}
    print('STEPS', st)
    s = S[T]
    print('SENTINEL text_fail', len(s['text_fail']), '/', s['blocks'], '| adjacency', len(s['adjacency']), '| styled blocks', s['styled_blocks'],
          'placed', s['stretches_placed'], '/', s['stretches'], 'mismatch', len(s['styled_mismatch']), 'unformatted', len(s['unformatted']))
    print('SENTINEL box', s['box']['n'], 'fail', s['box']['fail'], '| cell', s['cell']['n'], 'fail', s['cell']['fail'])
    print('SENTINEL displaced', [(x[0], x[1], round(x[2]['disp_pt'], 3), x[2]['inside_cell_pad']) for x in s['cell']['displaced']])
    print('SENTINEL open steps', s['open_steps'])
    print('BOUNDED margin < 2.5', sorted([(sh(k), cm(r)) for k, r in rows.items() if r['cls'] == 'BOUNDED' and cm(r) < 2.5], key=lambda x: x[1]))

print('==================== transitions FINAL vs V0 (broken / worsened)')
for nm, tr in A['per_tag'][TF]['transitions'].items():
    print(' ', nm, 'fixed', len(tr['fixed']), 'broken', tr['broken'], 'still', tr['still'], 'worsened', tr.get('worsened'))
print('mechanism flips V5 -> FINAL:', [(f['row'], f['block'], f['mech']) for f in A['flag_table'] if f[T5] != f[TF]])
adj_styled = sorted(x[0] for x in S[TF]['adjacency'])
styled = sorted({sh((b.name, it['block'])) for b in W.iterdir() if b.is_dir() for it in json.loads((b / 'items.json').read_text()) if it.get('styled')})
print('adjacency blocks == blocks with a styled segment:', adj_styled == styled, len(adj_styled), len(styled))

print('==================== classes (FINAL diag) vs census')
cnt = collections.Counter(); dis = []
for b in W.iterdir():
    if not b.is_dir():
        continue
    for d in json.loads((b / 'diag.json').read_text()):
        cnt[d['cls']] += 1
        if d['cls'] != CEN[f'{b.name}#{d["block"]}']['r2cls']:
            dis.append(sh((b.name, d['block'])))
        cnt['bound'] += bool(d['bound']); cnt['heightFitFalse'] += d['heightFit'] is False
print(dict(cnt), 'disagreements', dis)

print('==================== supplementary')
for k in ('A_inverted_base', 'B_align_disagreements', 'D_box_centring_linear', 'F_adjacency', 'H_arrow_labels', 'I_r9_margins', 'J_items_identity', 'K_cell_displaced_V5'):
    v = SUP[k]
    if k == 'D_box_centring_linear':
        v = dict(max_vs_production=max(x[1] for x in v), max_vs_census=max(x[2] for x in v), worst=max(v, key=lambda x: x[2]))
    print(k, json.dumps(v, ensure_ascii=False))
print('E cells', json.dumps([x for x in SUP['E_cell_linear_adv'] if abs(x['disp']) > 1e-9 or not x['inside_prod'] or not x['inside_census']], ensure_ascii=False))
print('E chloroform', SUP['E_chloroform_b2_line_widths_linear_vs_hinted'])
geo = SUP['C_geometry']
for c in ('box', 'cell'):
    print('C', c, 'n', len(geo[c]), 'side>0.25', len([x for x in geo[c] if max(abs(y) for y in x[1].values()) > 0.25]),
          'max|centre|', max(abs(x[2]) for x in geo[c]), 'max|width|', max(abs(x[3]) for x in geo[c]))
print('C open side/room>0.25', len([x for x in geo['open'] if max(abs(y) for y in x[1].values()) > 0.25]))
for s, row in SUP['G_floor_spot'].items():
    print('G', s, json.dumps(row, ensure_ascii=False))
for T in ('V5_p2.0_f7.5', 'V5_p2.0_f7.5.SUPP-linear', 'FINAL', 'FINAL.SUPP-linear'):
    rows = M[T]
    print('RENDER', T, 'hit', [(sh(k), r['ink_on_dark']) for k, r in sorted(rows.items()) if r['ink_on_dark'] >= 10],
          'spill', [(sh(k), r['spill']) for k, r in sorted(rows.items()) if r['spill'] >= 10], 'ink_sum', sum(r['ink_on_dark'] for r in rows.values()))
print('==================== attribution (decision movers; forward chain | leave-one-out)')
print('controls', {k: (len(v) if isinstance(v, list) else v) for k, v in ATT['controls'].items()})
for view in ('forward', 'leave_one_out'):
    for k, l in sorted(ATT['by_factor'][view].items()):
        if not k.endswith(':x0') and not k.endswith(':top'):
            print(' ', view, k, len(l), l)
        else:
            print(' ', view, k, len(l))
movers = {k: v for k, v in ATT['blocks'].items() if set(v['total']) & {'lines', 'size', 'step', 'align', 'overflow'}}
print('decision movers (lines/size/step/align/overflow):', len(movers))
for k, v in sorted(movers.items()):
    print('   ', k, v['cls'], v['proto'], '->', v['final'], '| fwd', [(x['factor'], x['changes']) for x in v['forward']], '| loo', [(x['factor'], x['changes']) for x in v['leave_one_out']])
print('identical decision (no x0/top > 0.01 either):', len([k for k, v in ATT['blocks'].items() if not v['total']]))
