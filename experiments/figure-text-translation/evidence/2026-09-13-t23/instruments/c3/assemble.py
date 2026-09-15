#!/usr/bin/env python3
"""Join baseline (step 1), containers (step 2) and diag (step 3) into per-block rows for the 176
LAYOUT-path blocks. User-flag mapping (step 4) is merged from userflags.json if present.

Post-processing rules applied here (named, so they can be argued with):
  R1 TEXTURED: seed mode-colour fraction < 0.5 -> the raster colour region is not a container.
     Final class then comes from the vector (ENCLOSING_SHAPE/LINE_CELL -> BOUNDED, NONE -> OPEN).
  R2 page-edge cell: a vector LINE_CELL with a side within 0.25 pt of the page edge (a table's own outer rule sits 0.5-0.9 pt in) is NOT a container
     (its 'rule' is the page background rect); vector class OPEN. Same definition as raster OPEN-edge.
  Final container class = raster class unless R1 fires.
"""
import json, sys, collections
sys.path.insert(0, '/home/siggi/dev/scratch-c140/c3/scripts')
from c3lib import *

B = {(r['basename'], r['block']): r for r in map(json.loads, open(C3 / 'baseline.jsonl'))}
CN = {(r['basename'], r['block']): r for r in map(json.loads, open(C3 / 'containers.jsonl'))}
UF = json.loads((C3 / 'userflags.json').read_text()) if (C3 / 'userflags.json').exists() else {}
AMBIG_PT = 0.5


def vec_class(v, W, H):
    if v['kind'] == 'NONE':
        return 'OPEN'
    bb = v['bbox']
    if v['kind'] == 'LINE_CELL' and (bb[0] <= 0.25 or bb[1] <= 0.25 or bb[2] >= W - 0.25 or bb[3] >= H - 0.25):
        return 'OPEN'
    return 'BOUNDED'


rows = []
for b in names():
    fig = Fig(b)
    diag = fig.diag
    for bi in fig.layout_blocks():
        bl, cn, d = B[(b, bi)], CN[(b, bi)], diag[bi]
        textured = cn['seed_mode_frac'] < 0.5
        vc = vec_class(cn['vector'], fig.W, fig.H)
        rc = 'BOUNDED' if cn['raster_class'] == 'BOUNDED' else 'OPEN'
        final = vc if textured else rc
        # verdict (inherited definitions; alpha>=128)
        hit = bl['ink_on_dark_a128'] >= 10
        off = bl['ink_off_page_a128'] > bl['src_ink_off_page_a128']
        shrunk = bl['shrunk']
        verdicts = [v for v, f in (('hit-artwork', hit), ('off-page', off), ('shrunk', shrunk)) if f]
        spill = cn['ink_outside_filled_region'] - cn['src_ink_outside_filled_region']
        # alignment cues
        if d['n_src_lines'] < 2:
            amb, margin, why = True, None, 'single-line: FT.alignment returns center without evidence'
        else:
            sp = sorted(d['spreads'].items(), key=lambda kv: kv[1])
            margin = sp[1][1] - sp[0][1]
            tie_by_order = margin == 0
            amb = margin < AMBIG_PT
            why = (f"tie ({sp[0][0]}={sp[1][0]}={sp[0][1]:.2f}); dict order picks {d['align']}" if tie_by_order
                   else f"margin {margin:.2f} pt between {sp[0][0]} and {sp[1][0]}")
        cc = cn['clear_colour']; cdl = cn['clear_dark_or_labels']
        fr = cn['src_frame']
        src_w = fr['a1'] - fr['a0']
        row = dict(
            basename=b, block=bi, key=fig.keys[bi], path='layout', rot=d['rot'],
            container=dict(final=final, raster=cn['raster_class'], dark=cn.get('dark_region_class'),
                           vector=vc, vector_kind=cn['vector']['kind'], textured=textured,
                           region_bbox_pt=cn.get('region_bbox_pt'), vector_bbox_pt=cn['vector'].get('bbox'),
                           region_area_frac=cn.get('region_area_frac'),
                           inner_along_pt=cn['inner_along'], inner_normal_pt=cn['inner_normal'],
                           src_margin_left_pt=cc['left']['min'], src_margin_right_pt=cc['right']['min'],
                           src_margin_up_pt=cc['up']['min'], src_margin_down_pt=cc['down']['min'],
                           clear_dark_or_labels=cdl, clear_dark=cn['clear_dark'], clear_labels=cn['clear_labels']),
            src=dict(n_lines=d['n_src_lines'], line_text=d['src_line_text'], line_widths_pt=[round(w, 2) for w in d['widths']],
                     line_flat_widths_sz0_pt=[round(w, 2) for w in d['src_flat_widths']],
                     starts=[round(s, 2) for s in d['starts']], width_pt=round(src_w, 2),
                     frame=fr, bbox_pt=cn['src_bbox_pt'], sz0=d['sz0']),
            align=dict(verdict=d['align'], ambiguous=amb, margin_pt=None if margin is None else round(margin, 3),
                       spreads=d['spreads'], why=why),
            budget=dict(maxw=round(d['maxw'], 2), boxw=d['boxw'], budget_source=('BOXW' if abs(d['rot']) < 0.5 and d['maxw'] == d['boxw']
                                                                                  else ('rotated-999' if abs(d['rot']) >= 0.5 else 'english+1')),
                        maxw_minus_inner=round(d['maxw'] - cn['inner_along'], 2)),
            value=' '.join(' '.join(d['value']).split()), natural_w_sz0_pt=round(d['natural_w_sz0'], 2),
            out=dict(lines=d['wrapped'], n_lines=d['n_out_lines'], size=d['sz'], drawn_widths_pt=[round(w, 2) for w in d['drawn_widths']],
                     wrap_at_sz0=d['wrap_sz0']),
            baseline=dict(verdict=verdicts or ['clean'], ink_on_dark_px=bl['ink_on_dark_a128'], src_ink_on_dark_px=bl['src_ink_on_dark_a128'],
                          ink_off_page_px=bl['ink_off_page_a128'], src_ink_off_page_px=bl['src_ink_off_page_a128'],
                          glyphbox_new_ink_px=bl['gb_new_ink'], shrunk=shrunk, min_size=bl['min_drawn_size'],
                          spill_outside_container_px=spill, ink_outside_container_px=cn['ink_outside_filled_region'],
                          src_ink_outside_container_px=cn['src_ink_outside_filled_region'],
                          line_change=d['n_out_lines'] - d['n_src_lines']),
        )
        # ---- geometric margins (pt) of SOURCE and DRAWN block vs the container / free space ----
        import math as _m
        t = _m.radians(d['rot'])
        its = fig.block_items(bi)
        dA0 = min(it['x'] * _m.cos(t) + it['y'] * _m.sin(t) for it in its)
        dA1 = max(it['x'] * _m.cos(t) + it['y'] * _m.sin(t) + w for it, w in zip(its, d['drawn_widths']))
        dN1 = max(-it['x'] * _m.sin(t) + it['y'] * _m.cos(t) for it in its) + ASC * d['sz']
        dN0 = min(-it['x'] * _m.sin(t) + it['y'] * _m.cos(t) for it in its) - DESC * d['sz']
        def box_from(cl):
            return (fr['a0'] - cl['left']['min'], fr['a1'] + cl['right']['min'], fr['n0'] - cl['down']['min'], fr['n1'] + cl['up']['min'])
        geo = {}
        for nm, cl in (('container', cc), ('free_dark_or_labels', cdl)):
            L_, R_, D_, U_ = box_from(cl)
            geo[nm] = dict(width=round(R_ - L_, 2), height=round(U_ - D_, 2),
                           src=dict(left=round(fr['a0'] - L_, 2), right=round(R_ - fr['a1'], 2), up=round(U_ - fr['n1'], 2), down=round(fr['n0'] - D_, 2)),
                           drawn=dict(left=round(dA0 - L_, 2), right=round(R_ - dA1, 2), up=round(U_ - dN1, 2), down=round(dN0 - D_, 2)))
            anc = d['anchor']
            geo[nm]['avail_from_anchor'] = round({'left': R_ - anc, 'right': anc - L_, 'center': 2 * min(anc - L_, R_ - anc)}[d['align']], 2)
        row['geometry'] = geo
        row['drawn_frame'] = dict(a0=round(dA0, 2), a1=round(dA1, 2), n0=round(dN0, 2), n1=round(dN1, 2))
        CU = json.loads((C3 / 'cues.json').read_text()); WD = json.loads((C3 / 'words.json').read_text())
        row['align']['sibling_edges'] = CU[f'{b}#{bi}']
        row['longest_word'] = WD[f'{b}#{bi}']
        uf = UF.get(f'{b}#{bi}')
        row['user_flag'] = uf
        rows.append(row)

with open(C3 / 'blocks.jsonl', 'w') as f:
    for r in rows:
        f.write(json.dumps(r, ensure_ascii=False) + '\n')
print('rows', len(rows), 'figures', len({r['basename'] for r in rows}))
print('final', collections.Counter(r['container']['final'] for r in rows))
print('raster x vector', collections.Counter((r['container']['raster'], r['container']['vector'], r['container']['textured']) for r in rows))
