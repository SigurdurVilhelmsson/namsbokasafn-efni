#!/usr/bin/env python3
"""SUPPLEMENTARY checks for the predictions (NOT frozen verdicts - every number here is labelled as such where used).

    PYTHONDONTWRITEBYTECODE=1 python3 -u supplementary.py     -> ../out/supplementary.json (+ stdout)

Reads only: plan/pred2/out/measure-{V5_p2.0_f7.5,FINAL}.jsonl, plan/pred2/work/FINAL/<b>/{diag,items}.json,
r2/work/{V0,V5_p2.0_f7.5}/<b>/{diag,items}.json, r2/census.json, prep/figs. Writes only plan/pred2/out.
  A  inverted base: lines on which figscripts.line_styles reports `inverted` (176 layout blocks, token lines)
  B  alignment: production container align vs census (cell_align / open_align_r2) on the 110 non-box blocks
  C  container geometry: production (figcontainers) vs census, per class
  D  box centring in LINEAR widths: each line's centre vs the production centre and vs the census centre
  E  cell anchors in LINEAR widths + ADV anchors: edge - (anchor + disp); inside [L+PAD, R-PAD] (production and census)
  F  sentinel adjacency re-measured with LINEAR advances (the frozen check measures with hinted advances)
  G  floor consequences: need/budget (production and census) and drawn margins (r2v overflow.py's definition)
  H  the 9 arrow labels (rows 14-19, 21): source lines, drawn lines, size
  I  R9-repartitioned blocks: drawn container / free-box margin before and after
  J  drawn items per layout block: FINAL vs V5_p2.0_f7.5 and vs V0 (exact (text,x,y,size,rot,bold,italic))
  K  cell displacements and ethene b0's column edge
PRED2 CHANGES (supplementary.py.adapt2.diff):
  G  FINAL margins (census AND production) are computed from the diag's UNROUNDED frame - a0 = min(x0), a1 = max(x0 + w),
     x0 displacement included, w = the build's linear widths - never from measure's 2-dp drawn_frame (spec reviewer,
     finding 1: the third decimal of the old production margins was rounding noise). The V5 prototype keeps the frozen
     measure rows. The measure-row (2-dp) census margins ride along as a cross-check.
  L  (new) every BOUNDED block with a drawn container margin < 2.5 pt (frozen measure geometry, 2 dp), with its PRODUCTION
     container margins from the unrounded frame, on the fixed build and on the previous build (plan/pred).
  P  (new) the blocks F1 (R9 symbols-only) repartitions against the previous build: text and margins before and after.
"""
import json, math, sys, collections
from pathlib import Path
sys.dont_write_bytecode = True
PRED = Path('/home/siggi/dev/scratch-c140/plan/pred2')
sys.path.insert(0, str(PRED / 'instruments'))
from c3lib import *            # Fig, FT, cairo, S, ASC, DESC, measure_adv (hinted)
import importlib.util
_spec = importlib.util.spec_from_file_location('figscripts', str(PRED / 'inst-C' / 'figscripts.py'))
FS = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(FS)
import sentinels as SN         # group_lines / ang (instrument code, unchanged)

R2 = Path('/home/siggi/dev/scratch-c140/r2')
FINW = PRED / 'work' / 'FINAL'
CEN = json.loads((R2 / 'census.json').read_text())
PAD = 2.0
short = lambda b, i: f"{b.replace('CNX_Chem_', '')} b{i}"
M = {T: {(r['basename'], r['block']): r for r in map(json.loads, open(PRED / 'out' / f'measure-{T}.jsonl'))} for T in ('V5_p2.0_f7.5', 'FINAL')}
KEYS = sorted(M['FINAL'])
_l = cairo.ImageSurface(cairo.FORMAT_A8, 8, 8); LCTX = cairo.Context(_l)
_fo = cairo.FontOptions(); _fo.set_hint_metrics(cairo.HINT_METRICS_OFF); LCTX.set_font_options(_fo)
HCTX = cairo.Context(cairo.ImageSurface(cairo.FORMAT_A8, 8, 8))


def lin(text, size, bold, italic=False):
    return measure_adv(LCTX, text, size, bold, italic)


def hin(text, size, bold, italic=False):
    return measure_adv(HCTX, text, size, bold, italic)


DG = {T: {} for T in ('FINAL', 'V5', 'V0')}
IT = {T: {} for T in ('FINAL', 'V5', 'V0')}
for b in names():
    DG['FINAL'][b] = {d['block']: d for d in json.loads((FINW / b / 'diag.json').read_text())}
    DG['V5'][b] = {d['block']: d for d in json.loads((R2 / 'work/V5_p2.0_f7.5' / b / 'diag.json').read_text())}
    for T, root in (('FINAL', FINW), ('V5', R2 / 'work/V5_p2.0_f7.5'), ('V0', R2 / 'work/V0')):
        IT[T][b] = json.loads((root / b / 'items.json').read_text())
out = {}

# A ------------------------------------------------------------------------------------------------
inv = []; nlines = 0
for b in names():
    fig = Fig(b, items_dir=FINW, diag_dir=FINW)
    for bi in DG['FINAL'][b]:
        for line in FS.token_lines(fig.blocks[bi], fig.meta['fonts']):
            nlines += 1
            if FS.line_styles(line, fig.meta['fonts'])[3]:
                inv.append(short(b, bi))
out['A_inverted_base'] = dict(lines=nlines, inverted=inv)
print('A inverted-base lines among the 176 layout blocks:', len(inv), 'of', nlines, inv)

# B C ----------------------------------------------------------------------------------------------
align_dis, geo = [], collections.defaultdict(list)
for b in names():
    for bi, d in DG['FINAL'][b].items():
        ce = CEN[f'{b}#{bi}']; c = d['container']
        if c['cls'] == 'cell' and c['align'] != ce['cell_align']:
            align_dis.append((short(b, bi), 'cell', ce['cell_align'], ce['cell_align_why'], c['align'], c.get('align_why')))
        if c['cls'] == 'open' and c['align'] != ce['open_align_r2']:
            align_dis.append((short(b, bi), 'open', ce['open_align_r2'], ce['open_align_r2_why'], c['align'], c.get('align_why')))
        if c['cls'] in ('box', 'cell'):
            dd = {k: round(c[k] - ce[k], 3) for k in ('L', 'R', 'D', 'U')}
            geo[c['cls']].append((short(b, bi), dd, round((c['L'] + c['R']) / 2 - (ce['L'] + ce['R']) / 2, 3),
                                  round((c['R'] - c['L']) - (ce['R'] - ce['L']), 3), c['why'], ce.get('container_source')))
        else:
            geo['open'].append((short(b, bi), {k: round(c[k] - ce[k], 3) for k in ('FL', 'FR', 'room_up', 'room_down')}, c['why']))
out['B_align_disagreements'] = align_dis
print('\nB alignment production != census (110 non-box blocks):', len(align_dis))
for x in align_dis:
    print('   ', x)
out['C_geometry'] = {k: v for k, v in geo.items()}
for cls in ('box', 'cell'):
    big = [x for x in geo[cls] if max(abs(v) for v in x[1].values()) > 0.25]
    print(f'\nC {cls}: {len(geo[cls])} blocks; any side differs > 0.25 pt on {len(big)}; max |centre delta| '
          f'{max(abs(x[2]) for x in geo[cls]):.3f}; max |width delta| {max(abs(x[3]) for x in geo[cls]):.3f}')
    for x in big:
        print('   ', x)
big = [x for x in geo['open'] if max(abs(v) for v in x[1].values()) > 0.25]
print(f"C open: {len(geo['open'])}; FL/FR/room differ > 0.25 pt on {len(big)}:")
for x in big:
    print('   ', x)

# D E ------------------------------------------------------------------------------------------------
boxD, cellE = [], []
for b in names():
    for bi, d in DG['FINAL'][b].items():
        c = d['container']; ce = CEN[f'{b}#{bi}']
        ws, x0 = d['drawn_widths'], d['x0']
        if c['cls'] == 'box':
            cen_p = (c['L'] + c['R']) / 2; cen_c = (ce['L'] + ce['R']) / 2
            offs_p = [x + w / 2 - cen_p for x, w in zip(x0, ws)]; offs_c = [x + w / 2 - cen_c for x, w in zip(x0, ws)]
            boxD.append((short(b, bi), round(max(map(abs, offs_p)), 4), round(max(map(abs, offs_c)), 4)))
        elif c['cls'] == 'cell':
            al = d['align']; anc = d['anchor']; disp = d['r2']['disp_pt']
            edges = [{'left': x, 'right': x + w, 'center': x + w / 2}[al] for x, w in zip(x0, ws)]
            e0, e1 = min(x0), max(x + w for x, w in zip(x0, ws))
            cellE.append(dict(block=short(b, bi), align=al, disp=round(disp, 4), vdisp=round(d['r2']['vdisp_pt'], 4),
                              max_edge_minus_anchor_disp=round(max(abs(e - anc - disp) for e in edges), 6),
                              inside_prod=(e0 >= c['L'] + PAD - 1e-6 and e1 <= c['R'] - PAD + 1e-6),
                              inside_census=(e0 >= ce['L'] + PAD - 0.5 and e1 <= ce['R'] - PAD + 0.5),
                              margins_prod=(round(e0 - c['L'], 3), round(c['R'] - e1, 3)),
                              margins_census=(round(e0 - ce['L'], 3), round(ce['R'] - e1, 3))))
out['D_box_centring_linear'] = boxD
out['E_cell_linear_adv'] = cellE
print('\nD box centring, linear widths: max |line centre - production centre| =', max(x[1] for x in boxD),
      '; vs census centre: max', max(x[2] for x in boxD), '; > 0.5 pt vs census:', [x for x in boxD if x[2] > 0.5])
print('E cells, linear widths + adv anchors: max |edge - anchor - disp| =', max(x['max_edge_minus_anchor_disp'] for x in cellE),
      '; outside production [L+PAD, R-PAD]:', [x['block'] for x in cellE if not x['inside_prod']],
      '; outside census [L+PAD-0.5, R-PAD+0.5]:', [x['block'] for x in cellE if not x['inside_census']])
for x in cellE:
    if abs(x['disp']) > 1e-9 or abs(x['vdisp']) > 1e-9:
        print('   displaced', x)
v5disp = {}
for b in names():
    for bi, d in DG['V5'][b].items():
        if d['r2']['cls'] == 'cell' and (abs(d['r2']['disp_pt']) > 1e-9 or abs(d['r2']['vdisp_pt']) > 1e-9):
            v5disp[short(b, bi)] = (d['r2']['disp_pt'], d['r2']['vdisp_pt'])
out['K_cell_displaced_V5'] = v5disp
print('   V5 displaced cells:', v5disp)
# chloroform b2: why the frozen (hinted) cell sentinel fails
fig = Fig('CNX_Chem_03_01_chloroform', items_dir=FINW, diag_dir=FINW)
d = DG['FINAL']['CNX_Chem_03_01_chloroform'][2]; bold = fig.blocks[2][0]['font'] in fig.bold_fonts
chl = [(t, round(lin(t, d['sz'], bold), 3), round(hin(t, d['sz'], bold), 3)) for t in d['lines']]
out['E_chloroform_b2_line_widths_linear_vs_hinted'] = chl
print('   chloroform b2 line widths at', d['sz'], 'pt (text, linear, hinted):', chl)

# F ----------------------------------------------------------------------------------------------------
adjF, adjF_lin = 0, []
for b in names():
    fig = Fig(b, items_dir=FINW, diag_dir=FINW)
    for bi in fig.layout_blocks():
        its = fig.block_items(bi)
        lines, centres, base = SN.group_lines(its, fig.blocks[bi][0]['size'])
        bad_h, bad_l = [], []
        for l in lines:
            for p, q in zip(l, l[1:]):
                gh = SN.ang(q)[0] - (SN.ang(p)[0] + hin(p['text'], p['size'], p['bold'], p['italic']))
                gl = SN.ang(q)[0] - (SN.ang(p)[0] + lin(p['text'], p['size'], p['bold'], p['italic']))
                if abs(gh) >= 0.02: bad_h.append(round(gh, 3))
                if abs(gl) >= 0.02: bad_l.append((p['text'], q['text'], round(gl, 4)))
        adjF += bool(bad_h)
        if bad_l:
            adjF_lin.append((short(b, bi), bad_l))
out['F_adjacency'] = dict(hinted_blocks=adjF, linear_fail=adjF_lin)
print('\nF adjacency: blocks failing with HINTED advances (frozen definition):', adjF, '; with LINEAR advances:', len(adjF_lin), adjF_lin[:5])

# G -----------------------------------------------------------------------------------------------------
SPOT = ['03_03_empform b8', '04_03_flowchart b13', '04_03_flowchart b14', '04_05_combmap_img b8', '04_05_combmap_img b10',
        '04_05_combmap_img b11', '04_05_combmap_img b12', '04_05_combmap_img b13', '04_05_combmap_img b14',
        '04_03_moleratio2_img b3', '04_03_ethene_img b0']
spot = {}
for k in KEYS:
    s = short(*k)
    if s not in SPOT:
        continue
    b, bi = k; ce = CEN[f'{b}#{bi}']
    row = {}
    for T in ('V5_p2.0_f7.5', 'FINAL'):
        r = M[T][k]; fr = r['drawn_frame']
        if T == 'FINAL':   # PRED2: unrounded frame from the diag (x0 includes displacement; linear widths)
            dgr = DG['FINAL'][b][bi]
            fr_m = fr
            fr = dict(a0=min(dgr['x0']), a1=max(x + w for x, w in zip(dgr['x0'], dgr['drawn_widths'])))
            assert abs(fr['a0'] - fr_m['a0']) <= 0.005 + 1e-9 and abs(fr['a1'] - fr_m['a1']) <= 0.005 + 1e-9, (b, bi, fr, fr_m)
        cls = ce['r2cls']
        if cls in ('box', 'cell'):
            outer = (ce['L'], ce['R'])
        else:
            outer = (ce['FL'], ce['FR'])
        ent = dict(size=r['size'], lines=r['lines'], text=r['text'], census_margin_L=round(fr['a0'] - outer[0], 6),
                   census_margin_R=round(outer[1] - fr['a1'], 6), census_budget=round(outer[1] - outer[0] - 2 * PAD, 3),
                   ink=r['ink_on_dark'], spill=r['spill'])
        if T == 'FINAL':
            c = DG['FINAL'][b][bi]['container']
            po = (c['L'], c['R']) if cls in ('box', 'cell') else (c['FL'], c['FR'])
            ent.update(census_margin_from_measure_row_2dp=[round(fr_m['a0'] - outer[0], 2), round(outer[1] - fr_m['a1'], 2)],
                       frame_unrounded=[round(fr['a0'], 6), round(fr['a1'], 6)])
            ent.update(prod_margin_L=round(fr['a0'] - po[0], 6), prod_margin_R=round(po[1] - fr['a1'], 6),
                       prod_budget=round(po[1] - po[0] - 2 * PAD, 3), prod_outer=[round(po[0], 3), round(po[1], 3)],
                       census_outer=[round(outer[0], 3), round(outer[1], 3)],
                       step=DG['FINAL'][b][bi]['step'], overflow=DG['FINAL'][b][bi]['overflow'], why=c['why'])
            fig = Fig(b, items_dir=FINW, diag_dir=FINW)
            bold = fig.blocks[bi][0]['font'] in fig.bold_fonts
            ww = max((lin(w, r['size'], bold), w) for w in ' '.join(r['text']).split())
            ent.update(widest_word=ww[1], need_linear=round(ww[0], 3), need_hinted=round(hin(ww[1], r['size'], bold), 3))
        else:
            ent.update(step=DG['V5'][b][bi]['r2']['step'])
        row[T] = ent
    spot[s] = row
out['G_floor_spot'] = spot
print('\nG floor consequences and spot margins (drawn frame from measure rows; census / production outer):')
for s, row in spot.items():
    print('  ', s)
    for T, e in row.items():
        print('      ', T, json.dumps(e, ensure_ascii=False))

# H ------------------------------------------------------------------------------------------------------
ARROWS = ['03_02_argon_img-9025 b2', '03_02_copperMoles_img-a962 b1', '03_02_copperMoles_img-a962 b4', '03_02_glycine_img-7c96 b1',
          '03_02_potassium_img-f1d1 b1', '03_02_sacch_img-3278 b1', '03_02_vitC_img-e537 b1', '03_05_Example2_img b1', '03_05_Example2_img b3']
arr = {}
for k in KEYS:
    s = short(*k)
    if s in ARROWS:
        arr[s] = {T: (M[T][k]['src_lines'], M[T][k]['lines'], M[T][k]['size']) for T in M}
out['H_arrow_labels'] = arr
print('\nH arrow labels (src lines, drawn lines, size):')
for s in ARROWS:
    print('   ', s, arr[s])
for T in M:
    print('    ', T, 'hold source line count', sum(arr[s][T][0] == arr[s][T][1] for s in ARROWS), '/ 9; sizes',
          dict(collections.Counter(arr[s][T][2] for s in ARROWS)))

# I -------------------------------------------------------------------------------------------------------
att = json.loads((PRED / 'out' / 'attribution.json').read_text())
r9 = sorted(att['by_factor']['forward'].get('r9:lines', []))
def margin(r):
    if r['cls'] == 'BOUNDED':
        g = r['geometry'].get('container_vector') or r['geometry']['container']
    else:
        g = r['geometry']['free_dark_or_labels']
    return round(min(g['drawn']['left'], g['drawn']['right']), 2)
r9m = []
for k in KEYS:
    s = short(*k)
    if s in r9:
        r9m.append((s, M['V5_p2.0_f7.5'][k]['text'], M['FINAL'][k]['text'], margin(M['V5_p2.0_f7.5'][k]), margin(M['FINAL'][k])))
out['I_r9_margins'] = r9m
print('\nI R9-repartitioned blocks (text V5 -> FINAL, min drawn side margin V5 -> FINAL; container for BOUNDED, free box for OPEN):')
for x in sorted(r9m, key=lambda x: x[4]):
    print('   ', x)

# J -------------------------------------------------------------------------------------------------------
KEYF = ('text', 'x', 'y', 'size', 'rot', 'bold', 'italic')
def lay(items):
    d = collections.defaultdict(list)
    for it in items:
        if it['path'] == 'layout':
            d[it['block']].append(tuple(it[k] for k in KEYF))
    return d
same5 = same0 = 0; n = 0; maxd = []
for b in names():
    F, V5, V0 = lay(IT['FINAL'][b]), lay(IT['V5'][b]), lay(IT['V0'][b])
    for bi in F:
        n += 1
        same5 += F[bi] == V5[bi]; same0 += F[bi] == V0[bi]
out['J_items_identity'] = dict(blocks=n, identical_to_V5=same5, identical_to_V0=same0)
print(f'\nJ drawn layout items identical per block: FINAL==V5_p2.0_f7.5 {same5}/{n}; FINAL==V0 {same0}/{n}')

# K ethene b0 -----------------------------------------------------------------------------------------------
for T in M:
    r = M[T][('CNX_Chem_04_03_ethene_img', 0)]; r17 = M[T][('CNX_Chem_04_03_ethene_img', 17)] if ('CNX_Chem_04_03_ethene_img', 17) in M[T] else None
    print(f"K ethene b0 {T}: drawn a0 {r['drawn_frame']['a0']} source left edge {r['src_left_edge']} -> {round(r['drawn_frame']['a0'] - r['src_left_edge'], 2)} pt",
          '' if r17 is None else f"(b17 source left edge {r17['src_left_edge']}, drawn a0 {r17['drawn_frame']['a0']})")
    out[f'K_ethene_b0_{T}'] = dict(a0=r['drawn_frame']['a0'], src_left_edge=r['src_left_edge'])
# L (PRED2) -------------------------------------------------------------------------------------------------
PREV = Path('/home/siggi/dev/scratch-c140/plan/pred')
MP = {(r['basename'], r['block']): r for r in map(json.loads, open(PREV / 'out' / 'measure-FINAL.jsonl'))}
DGP = {b: {d['block']: d for d in json.loads((PREV / 'work/FINAL' / b / 'diag.json').read_text())} for b in names()}


def cm2(r):
    g = r['geometry'].get('container_vector') or r['geometry']['container']
    return min(g['drawn']['left'], g['drawn']['right'])


def prod_margins(dg):
    c = dg['container']; a0 = min(dg['x0']); a1 = max(x + w for x, w in zip(dg['x0'], dg['drawn_widths']))
    if c['cls'] in ('box', 'cell'):
        return round(a0 - c['L'], 6), round(c['R'] - a1, 6)
    return round(a0 - c['FL'], 6), round(c['FR'] - a1, 6)


L25 = {}
for tag, MM, DD in (('FINAL', M['FINAL'], DG['FINAL']), ('PREV', MP, DGP)):
    L25[tag] = sorted([dict(block=short(*k), census_min_margin_2dp=cm2(r), text=r['text'], prod_LR=prod_margins(DD[k[0]][k[1]]))
                       for k, r in MM.items() if r['cls'] == 'BOUNDED' and cm2(r) < 2.5], key=lambda x: x['census_min_margin_2dp'])
out['L_bounded_margin_lt_2_5'] = L25
print('\nL BOUNDED blocks with drawn container margin < 2.5 pt (census 2 dp; production L/R unrounded):')
for tag in ('PREV', 'FINAL'):
    print('  ', tag, len(L25[tag]))
    for x in L25[tag]:
        print('      ', x['block'], f"{x['census_min_margin_2dp']:.2f}", 'prod', tuple(f'{v:.2f}' for v in x['prod_LR']), x['text'])

# P (PRED2) -------------------------------------------------------------------------------------------------
cmpj = json.loads((PRED / 'out' / 'compare_prev.json').read_text())
r9j = json.loads((PRED / 'out' / 'r9_variants.json').read_text())
PP = {}
for k in KEYS:
    s = short(*k)
    if s not in set(cmpj['items_layout_changed']) and s not in set(r9j['symbols_vs_off']):
        continue
    rp, rn = MP[k], M['FINAL'][k]
    def mg(r):
        return round(cm2(r), 2) if r['cls'] == 'BOUNDED' else round(min(r['geometry']['free_dark_or_labels']['drawn']['left'], r['geometry']['free_dark_or_labels']['drawn']['right']), 2)
    PP[s] = dict(cls=rn['cls'], F1_moved=s in set(cmpj['items_layout_changed']), R9_binds=s in set(r9j['symbols_vs_off']),
                 prev_text=rp['text'], new_text=rn['text'], unbound_text=r9j['blocks'][s]['off']['lines'],
                 prev_census_min=mg(rp), new_census_min=mg(rn),
                 prev_prod_LR=prod_margins(DGP[k[0]][k[1]]), new_prod_LR=prod_margins(DG['FINAL'][k[0]][k[1]]),
                 ink=(rp['ink_on_dark'], rn['ink_on_dark']), spill=(rp['spill'], rn['spill']), text_coll=(rp['text_coll'], rn['text_coll']))
out['P_f1_and_r9_blocks'] = PP
print('\nP blocks F1 moved (literal -> symbols) or where symbols-only R9 binds (vs no R9): prev -> new; min drawn margin (census; free box for OPEN)')
for s_, x in sorted(PP.items()):
    print('   ', s_, x['cls'], 'F1' if x['F1_moved'] else '  ', 'R9' if x['R9_binds'] else '  ', ' | '.join(x['prev_text']), '->', ' | '.join(x['new_text']),
          f"| {x['prev_census_min']:.2f} -> {x['new_census_min']:.2f}", 'prod', tuple(f'{v:.2f}' for v in x['prev_prod_LR']), '->', tuple(f'{v:.2f}' for v in x['new_prod_LR']),
          'ink', x['ink'], 'spill', x['spill'], 'tc', x['text_coll'])
(PRED / 'out' / 'supplementary.json').write_text(json.dumps(out, indent=1, ensure_ascii=False))
