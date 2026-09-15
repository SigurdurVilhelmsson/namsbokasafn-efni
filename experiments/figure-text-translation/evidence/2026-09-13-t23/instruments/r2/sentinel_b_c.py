#!/usr/bin/env python3
"""(b) KEPT UNTOUCHED and (c) ② does nothing where there is nothing to style.

(b) decimal off: every run-exact item == prep's (V0) item, per figure, for every decimal-off tag.
    decimal on (V5_p2.0_f7.5_dec): the kept items that differ are listed; each must differ ONLY in `text`,
    and only by '.' -> ',' at the same character positions; count, figures and values are reported against
    c9's 35 (alsulfatemass 7, aspirin 7, chloroform 7, glycinemass 9, saltMass 5).
(c) transfer on (V5_p2.0_f7.5) vs transfer off (V5_p2.0_f7.5_notr): per layout block, items equal iff the
    block has no source token; figures with no token-bearing layout block are items-identical as a whole.
    Also: which token blocks change line count / size / step when styled widths are used (② x ③).
"""
import json, sys, collections
sys.dont_write_bytecode = True
sys.path.insert(0, '/home/siggi/dev/scratch-c140/c3b/scripts')
from c3lib import *
sys.path.insert(0, '/home/siggi/dev/scratch-c140/r2/tree')
import c2_scripts as TS

R2 = Path('/home/siggi/dev/scratch-c140/r2')
OFF = ['V0', 'V5_p2.0_f7.0', 'V5_p2.0_f7.5', 'V5_p2.0_f8.0', 'V5_p2.5_f7.0', 'V5_p2.5_f7.5', 'V5_p2.5_f8.0', 'V5_p2.0_f7.5_notr']
C9 = {'CNX_Chem_03_01_alsulfatemass_img': 7, 'CNX_Chem_03_01_aspirin': 7, 'CNX_Chem_03_01_chloroform': 7,
      'CNX_Chem_03_01_glycinemass_img': 9, 'CNX_Chem_03_01_saltMass': 5}
C9_VALUES = collections.Counter({'1.008': 4, '12.01': 4, '16.00': 3, '35.45': 3, '14.007': 2, '22.99': 2, '26.98': 1, '32.06': 1,
                                 '53.96': 1, '96.18': 1, '192.00': 1, '342.14': 1, '108.09': 1, '8.064': 1, '64.00': 1, '180.15': 1,
                                 '106.35': 1, '119.37': 1, '24.02': 1, '5.040': 1, '32.00': 1, '75.07': 1, '58.44': 1})
out = {}
kept = lambda its: [x for x in its if x['path'] != 'layout']
# ---- (b)
b_off = {}
for T in OFF:
    bad = []
    for b in names():
        a = kept(json.loads((R2 / 'work' / T / b / 'items.json').read_text()))
        p = kept(json.loads((PREP / 'figs' / b / 'items.json').read_text()))
        if a != p:
            bad.append(b)
    b_off[T] = dict(figures_equal=34 - len(bad), bad=bad)
out['b_decimal_off'] = b_off
diffs = []; shape_bad = []
for b in names():
    a = kept(json.loads((R2 / 'work/V5_p2.0_f7.5_dec' / b / 'items.json').read_text()))
    p = kept(json.loads((PREP / 'figs' / b / 'items.json').read_text()))
    assert len(a) == len(p), b
    for x, y in zip(a, p):
        if x == y:
            continue
        ok = {k for k in x if x[k] != y.get(k)} == {'text'} and len(x['text']) == len(y['text']) and \
            all(c1 == c2 or (c2 == '.' and c1 == ',') for c1, c2 in zip(x['text'], y['text']))
        diffs.append((b, y['text'], x['text']))
        if not ok:
            shape_bad.append((b, y, x))
byfig = collections.Counter(d[0] for d in diffs)
out['b_decimal_on'] = dict(n=len(diffs), by_figure=dict(byfig), figures_match_c9=dict(byfig) == C9,
                           values_match_c9=collections.Counter(d[1] for d in diffs) == C9_VALUES,
                           not_dot_to_comma_only=shape_bad, pairs=diffs)
rep_dec = []
for b in names():
    rep_dec += json.loads((R2 / 'work/V5_p2.0_f7.5_dec' / b / 'compose-report.json').read_text())['decimal']
out['b_decimal_on']['report_decimal_entries'] = len(rep_dec)
# keys / blocks / report multisets untouched in the decimal run
kb = []
for b in names():
    rp = json.loads((R2 / 'work/V5_p2.0_f7.5_dec' / b / 'compose-report.json').read_text())
    pp = json.loads((PREP / 'figs' / b / 'compose-report.json').read_text())
    if any(rp[k] != pp[k] for k in ('blocks', 'missing', 'translated', 'identity', 'runExact')):
        kb.append(b)
out['b_decimal_on']['report_multisets_differ'] = kb
# layout items identical between dec and non-dec at the same cell
lay_diff = [b for b in names() if [x for x in json.loads((R2 / 'work/V5_p2.0_f7.5_dec' / b / 'items.json').read_text()) if x['path'] == 'layout'] !=
            [x for x in json.loads((R2 / 'work/V5_p2.0_f7.5' / b / 'items.json').read_text()) if x['path'] == 'layout']]
out['b_decimal_on']['layout_items_differ_from_same_cell_decimal_off'] = lay_diff

# ---- (c)
tok_blocks = []; nontok_bad = []; tok_same = []; fig_equal = []; fig_scripted = []; interaction = []
for b in names():
    fig = Fig(b, items_dir=R2 / 'work/V5_p2.0_f7.5', diag_dir=R2 / 'work/V5_p2.0_f7.5')
    on = json.loads((R2 / 'work/V5_p2.0_f7.5' / b / 'items.json').read_text())
    off = json.loads((R2 / 'work/V5_p2.0_f7.5_notr' / b / 'items.json').read_text())
    don = {d['block']: d for d in json.loads((R2 / 'work/V5_p2.0_f7.5' / b / 'diag.json').read_text())}
    doff = {d['block']: d for d in json.loads((R2 / 'work/V5_p2.0_f7.5_notr' / b / 'diag.json').read_text())}
    has_tok = False
    for bi in fig.layout_blocks():
        toks = TS.source_tokens(fig.blocks[bi], fig.meta['fonts'])
        a = [x for x in on if x['block'] == bi]; c = [x for x in off if x['block'] == bi]
        nm = f"{b.replace('CNX_Chem_', '')} b{bi}"
        if toks:
            has_tok = True; tok_blocks.append(nm)
            if a == c:
                tok_same.append(nm)
            d1, d0 = don[bi], doff[bi]
            if (d1['n_out_lines'], d1['sz'], d1['r2']['step']) != (d0['n_out_lines'], d0['sz'], d0['r2']['step']):
                interaction.append(dict(block=nm, src_lines=d1['n_src_lines'], flat=(d0['n_out_lines'], d0['sz'], d0['r2']['step']),
                                        styled=(d1['n_out_lines'], d1['sz'], d1['r2']['step']), flat_text=d0['wrapped'], styled_text=d1['wrapped']))
        elif a != c:
            nontok_bad.append(nm)
    if has_tok:
        fig_scripted.append(b.replace('CNX_Chem_', ''))
    elif on == off:
        fig_equal.append(b.replace('CNX_Chem_', ''))
out['c_transfer'] = dict(token_blocks=len(tok_blocks), token_blocks_items_identical_anyway=tok_same,
                         nontoken_blocks_that_differ=nontok_bad, figures_without_token_blocks_identical=len(fig_equal),
                         figures_with_token_blocks=fig_scripted, n_fig_scripted=len(fig_scripted),
                         styled_vs_flat_layout_changes=interaction)
(R2 / 'sentinel-b-c.json').write_text(json.dumps(out, ensure_ascii=False, indent=1))
print('(b) decimal off:', {T: v['figures_equal'] for T, v in b_off.items()})
bo = out['b_decimal_on']
print('(b) decimal on: differing kept items', bo['n'], bo['by_figure'], 'figures==c9', bo['figures_match_c9'], 'values==c9', bo['values_match_c9'],
      'not-dot-to-comma-only', len(bo['not_dot_to_comma_only']), 'report entries', bo['report_decimal_entries'],
      'report multisets differ', bo['report_multisets_differ'], 'layout differs from dec-off', bo['layout_items_differ_from_same_cell_decimal_off'])
c = out['c_transfer']
print('(c) token blocks', c['token_blocks'], 'in', c['n_fig_scripted'], 'figures', c['figures_with_token_blocks'])
print('    token blocks identical with transfer off (should be none if every token block is drawn styled):', c['token_blocks_items_identical_anyway'])
print('    NON-token blocks that differ:', c['nontoken_blocks_that_differ'], '| figures without token blocks identical:', c['figures_without_token_blocks_identical'])
for x in c['styled_vs_flat_layout_changes']:
    print('    ②x③', x)
