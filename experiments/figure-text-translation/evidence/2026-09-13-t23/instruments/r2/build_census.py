#!/usr/bin/env python3
"""Build r2/census.json = c3b/census.json (every field verbatim, asserted) + the r2 rule fields.

Keyed "<basename>#<block>" - NEVER on the block key (14 twin keys).  Inputs are read-only:
c3b/census.json (container / free boxes, FT verdicts) and c3/blocks.jsonl (dark class, textured,
source margins, sibling cue, free-box clearances).

r2cls   box   BOUNDED and the dark-stroke region is itself BOUNDED and not textured (R-box)
        cell  BOUNDED and dark-open (colour-bounded) - the 25 ch03 mass-table cells (R-cell) PLUS
              brain b0 (textured, vector-bounded, dark-open): NAMED as a classification choice
        open  OPEN (84)
cell_align (cells only; the ruling is 'keep the source alignment')
        multi-line: FT.alignment verdict (c3 align.verdict), ambiguous (<0.5 pt) -> center
        single-line: source margins INSIDE THE CELL, far/tight >= CELL_RATIO -> flush to the tight side,
        else center.  The sibling cue is NOT used for cells: glycinemass b13 carries a left sibling cue
        (coincident with '1','2','5') while its source is visibly right-flush (ml 78.75 / mr 2.5).
open_align_r2 (OPEN only; D-open)
        multi-line: FT verdict, ambiguous -> center (== c3b open_align)
        single-line: FLUSH (tight free-box side <= 4.75 pt and far/tight >= 20, c3b design fact 4)
        -> tight side; else sibling cue left-only/right-only; else center.
"""
import json, collections
from pathlib import Path

C3 = Path('/home/siggi/dev/scratch-c140/c3')
C3B = Path('/home/siggi/dev/scratch-c140/c3b')
R2 = Path('/home/siggi/dev/scratch-c140/r2')
CELL_RATIO = 20.0
FLUSH_TIGHT, FLUSH_RATIO = 4.75, 20.0

cen = json.loads((C3B / 'census.json').read_text())
rows = {f"{r['basename']}#{r['block']}": r for r in map(json.loads, open(C3 / 'blocks.jsonl'))}
assert set(cen) == set(rows) and len(cen) == 176
out = {}
why = collections.Counter()
for k, e0 in cen.items():
    r = rows[k]; c = r['container']; a = r['align']; fr = r['src']['frame']
    e = dict(e0)
    n = r['src']['n_lines']
    assert e['n_src'] == n and e['cls'] == c['final']
    if c['final'] == 'BOUNDED':
        e['r2cls'] = 'box' if (c['dark'] == 'BOUNDED' and not c['textured']) else 'cell'
        e['src_up_margin'] = round(e['U'] - fr['n1'], 4)
        e['src_down_margin'] = round(fr['n0'] - e['D'], 4)
        e['src_left_margin'] = round(fr['a0'] - e['L'], 4)
        e['src_right_margin'] = round(e['R'] - fr['a1'], 4)
        if e['r2cls'] == 'cell':
            if n >= 2:
                if a['ambiguous']:
                    e['cell_align'], w = 'center', 'cell-multi-ambiguous->center'
                else:
                    e['cell_align'], w = a['verdict'], f"cell-multi->{a['verdict']}"
            else:
                ml, mr = e['src_left_margin'], e['src_right_margin']
                tight, far = min(ml, mr), max(ml, mr)
                ratio = far / tight if tight > 0 else float('inf')
                e['cell_margin_ratio'] = round(ratio, 3) if ratio != float('inf') else 'inf'
                if ratio >= CELL_RATIO:
                    side = 'left' if ml <= mr else 'right'
                    e['cell_align'], w = side, f'cell-single-margins(ratio {ratio:.1f})->{side}'
                else:
                    e['cell_align'], w = 'center', f'cell-single-margins(ratio {ratio:.2f})->center'
            e['cell_align_why'] = w; why[w.split('(')[0] + '->' + e['cell_align']] += 1
    else:
        e['r2cls'] = 'open'
        cd = c['clear_dark_or_labels']
        L, R = cd['left']['min'], cd['right']['min']
        e['free_left_clear'], e['free_right_clear'] = L, R
        if n >= 2:
            e['open_align_r2'] = e['open_align']
            e['open_align_r2_why'] = e['open_align_why']
            assert e['open_align_why'].startswith('multi')
        else:
            tight, far = min(L, R), max(L, R)
            ratio = far / tight if tight > 0 else float('inf')
            se = a['sibling_edges']
            cue = (bool(se['left']), bool(se['center']), bool(se['right']))
            if tight <= FLUSH_TIGHT and ratio >= FLUSH_RATIO:
                side = 'left' if L <= R else 'right'
                e['open_align_r2'], w = side, f'single-flush(tight {tight}, ratio {ratio:.1f})->{side}'
                if (cue[0] and not cue[1] and not cue[2] and side != 'left') or (cue[2] and not cue[0] and not cue[1] and side != 'right'):
                    raise SystemExit(f'flush/cue CONFLICT {k}')
            elif cue == (True, False, False):
                e['open_align_r2'], w = 'left', 'single-cue-left-only->left'
            elif cue == (False, False, True):
                e['open_align_r2'], w = 'right', 'single-cue-right-only->right'
            else:
                e['open_align_r2'], w = 'center', f'single-cue(L{int(cue[0])}C{int(cue[1])}R{int(cue[2])})->center'
            e['open_align_r2_why'] = w
        why[e['open_align_r2_why'].split('(')[0] + '->' + e['open_align_r2']] += 1
    for k0 in e0:
        assert e[k0] == e0[k0], (k, k0)
    out[k] = e
(R2 / 'census.json').write_text(json.dumps(out, ensure_ascii=False, indent=0))
print('entries', len(out), collections.Counter(v['r2cls'] for v in out.values()))
print('cells by figure', collections.Counter(k.split('#')[0] for k, v in out.items() if v['r2cls'] == 'cell'))
for w, n in sorted(why.items()):
    print(f'  {n:3}  {w}')
print('cells not single-centre:', [(k, v['cell_align'], v['cell_align_why']) for k, v in out.items() if v['r2cls'] == 'cell' and v['cell_align'] != 'center'])
print('OPEN r2 alignment differs from c3b open_align:', [(k, v['open_align'], v['open_align_r2'], v['open_align_r2_why']) for k, v in out.items() if v['r2cls'] == 'open' and v['open_align'] != v['open_align_r2']])
