#!/usr/bin/env python3
"""Build c3b/census.json from c3/blocks.jsonl (read-only input). One entry per LAYOUT block, keyed
"<basename>#<block index>" - never on the block key (14 twin keys).

Boxes are in the block's own (along, normal) frame, i.e. compose.py's FT.along / FT.proj:
  container (BOUNDED): src.frame +/- container.src_margin_*   (== c3 assemble.py box_from(clear_colour))
      EXCEPTION, named: textured blocks (c3 rule R1) - the colour clearance is meaningless there; the
      container is the VECTOR bbox (brain b0: the translucent label box). Asserted unrotated.
  free box (all): src.frame +/- clear_dark_or_labels.*.min    (== c3 geometry.free_dark_or_labels)
open_align (used by V3/V3L for OPEN blocks only):
  multi-line & not ambiguous (c3 AMBIG_PT 0.5)   -> FT.alignment verdict
  multi-line & ambiguous                           -> center
  single-line: sibling cue left-only -> left; right-only -> right; anything else -> center
"""
import json, collections
from pathlib import Path

C3 = Path('/home/siggi/dev/scratch-c140/c3')
C3B = Path('/home/siggi/dev/scratch-c140/c3b')
out = {}
why = collections.Counter()
for line in open(C3 / 'blocks.jsonl'):
    r = json.loads(line)
    c, fr = r['container'], r['src']['frame']
    k = f"{r['basename']}#{r['block']}"
    e = dict(cls=c['final'], n_src=r['src']['n_lines'], rot=r['rot'])
    if c['final'] == 'BOUNDED':
        if c['textured']:
            assert abs(r['rot']) < 0.5
            x0, y0, x1, y1 = c['vector_bbox_pt']
            e.update(L=x0, R=x1, D=y0, U=y1, container_source='vector_bbox (textured, R1)')
        else:
            e.update(L=fr['a0'] - c['src_margin_left_pt'], R=fr['a1'] + c['src_margin_right_pt'],
                     D=fr['n0'] - c['src_margin_down_pt'], U=fr['n1'] + c['src_margin_up_pt'],
                     container_source='colour region clearance')
            assert abs((e['R'] - e['L']) - c['inner_along_pt']) < 0.02, (k, e, c['inner_along_pt'])
    cd = c['clear_dark_or_labels']
    e.update(FL=fr['a0'] - cd['left']['min'], FR=fr['a1'] + cd['right']['min'],
             FD=fr['n0'] - cd['down']['min'], FU=fr['n1'] + cd['up']['min'],
             room_up=cd['up']['min'], room_down=cd['down']['min'],
             room_up_by=cd['up']['by'], room_down_by=cd['down']['by'])
    a = r['align']
    if r['src']['n_lines'] >= 2:
        if a['ambiguous']:
            e['open_align'] = 'center'; w = 'multi-ambiguous->center'
        else:
            e['open_align'] = a['verdict']; w = f"multi->{a['verdict']}"
    else:
        se = a['sibling_edges']
        L_, C_, R_ = bool(se['left']), bool(se['center']), bool(se['right'])
        if L_ and not C_ and not R_:
            e['open_align'] = 'left'; w = 'single-left-only->left'
        elif R_ and not C_ and not L_:
            e['open_align'] = 'right'; w = 'single-right-only->right'
        else:
            e['open_align'] = 'center'; w = f"single-cue(L{int(L_)}C{int(C_)}R{int(R_)})->center"
    e['open_align_why'] = w
    e['fta_verdict'] = a['verdict']
    if c['final'] != 'BOUNDED':
        why[w] += 1
    out[k] = e
(C3B / 'census.json').write_text(json.dumps(out, ensure_ascii=False, indent=0))
print('entries', len(out), collections.Counter(v['cls'] for v in out.values()))
print('OPEN alignment rule outcomes:', dict(why))
chg = [(k, v['fta_verdict'], v['open_align']) for k, v in out.items() if v['cls'] != 'BOUNDED' and v['fta_verdict'] != v['open_align']]
print('OPEN blocks whose V3 alignment differs from FT.alignment:', len(chg))
for x in chg:
    print('  ', x)
