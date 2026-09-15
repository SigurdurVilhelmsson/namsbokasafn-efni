#!/usr/bin/env python3
"""STEP 4 — [USER] layout flags (USER-REVIEW.md rows) -> exact blocks + mechanism.

Mapping made by reading the row text against translated.png / source.png / the 3-panel crops, then
each mechanism is CHECKED against the measured geometry below (assertions print, never silently pass).

Mechanism vocabulary (the brief's):
  WIDER   budget wider than container: maxw > width available from the anchor to the container edge,
          so the value crams into <= source lines and spills horizontally.
  NARROWER budget narrower than needed: value gains lines while free space exists; under the vertical
          centre anchor the extra line lands on arrows/frames or off the page.
  ANCHOR  wrong horizontal anchor/alignment (single-line source defaulted to centre, or an ambiguous
          multi-line verdict).
  SHRINK  shrink fallback (a single word wider than maxw -> font size reduced).
  TABLE   the container is a table cell (rules lighter than the L<128 dark threshold).
"""
import json, sys
sys.path.insert(0, '/home/siggi/dev/scratch-c140/c3/scripts')
from c3lib import *

M = {  # (basename, block): (row, [mechanisms], confidence, note)
}
def add(row, b, blocks, mech, conf, note):
    for bi in blocks:
        M.setdefault((b, bi), []).append(dict(row=row, mechanism=mech, confidence=conf, note=note))

A = 'CNX_Chem_03_01_'; B2 = 'CNX_Chem_03_02_'; F4 = 'CNX_Chem_04_'
for row, b in ((7, A + 'alsulfatemass_img'), (8, A + 'aspirin'), (10, A + 'chloroform')):
    add(row, b, [3], ['TABLE', 'WIDER'], 'certain', "'Samtals (amu) not split to two lines like source and spills outside cell'")
add(14, B2 + 'argon_img-9025', [2], ['NARROWER'], 'certain', 'middle label 2->3 lines, overlaps arrow')
add(15, B2 + 'copperMoles_img-a962', [1, 4], ['NARROWER'], 'certain', "'additional line in translation results in overlap' (both arrow labels gain a line)")
add(16, B2 + 'glycine_img-7c96', [1], ['NARROWER'], 'certain', "'Additional line/overlap'")
add(17, B2 + 'potassium_img-f1d1', [1], ['NARROWER'], 'certain', "'Additional line/overlap'")
add(18, B2 + 'sacch_img-3278', [1], ['NARROWER'], 'certain', "'Same as 16' (arrow label gains a line)")
add(18, B2 + 'sacch_img-3278', [2], ['WIDER'], 'certain', "'source has 3 lines in box 1, translation crams into 2 lines and extends outside box'")
add(19, B2 + 'vitC_img-e537', [1], ['NARROWER'], 'certain', "'Same as 17'")
add(19, B2 + 'vitC_img-e537', [0], ['WIDER'], 'certain', "'text overlaps frame in box 2' (right box = block 0)")
add(20, 'CNX_Chem_03_03_empform', [2, 5], ['WIDER'], 'certain', "'Boxes on far left (top and bottom) have two lines in source, one in translation and text extends outside'")
add(20, 'CNX_Chem_03_03_empform', [8], ['WIDER', 'SHRINK'], 'certain', "'Same with last box'")
add(20, 'CNX_Chem_03_03_empform', [6], ['WIDER'], 'certain', "'Line break in next to last box leaves text outside box on first line'")
add(21, 'CNX_Chem_03_05_Example2_img', [1, 3], ['NARROWER'], 'certain', "'Extra lines in translation leaves overlap of arrow shapes'")
add(21, 'CNX_Chem_03_05_Example2_img', [0, 2], ['WIDER'], 'certain', "'no/incorrect linebreaks in boxes 2 and 3 lead to overlap' (box 2 = block 0, box 3 = block 2)")
add(23, F4 + '03_etheneBr_img', [2], ['NARROWER', 'ANCHOR'], 'certain', "'Unnecessary linebreak in bottom text (með umframmagni af Br2)'")
add(24, F4 + '03_ethene_img', [17], ['ANCHOR'], 'likely', "'First line indented' (left-flush source line re-centred)")
add(24, F4 + '03_ethene_img', [0], ['NARROWER', 'ANCHOR'], 'certain', "'second could be centered to avoid linebreak'")
add(25, F4 + '03_flowchart', [6, 9, 10, 11], ['WIDER'], 'certain', "'Fewer linebreaks in translated image leading to overflow in some boxes'")
add(29, F4 + '03_moleratio2_img', [3], ['SHRINK', 'WIDER'], 'certain', "'Efnajöfnustuðull overlaps box to the right'")
add(31, F4 + '04_sandwich', [2], ['NARROWER', 'ANCHOR'], 'certain', "'Unnecessary linebreaks' (left-flush source; centre anchor halves the free width to 63.8 pt)")
add(31, F4 + '04_sandwich', [5], ['NARROWER'], 'certain', "'Unnecessary linebreaks'")
add(32, F4 + '05_combmap_img', [8], ['SHRINK', 'WIDER'], 'certain', "'Prósentusamsetning in tiny font size'")
add(32, F4 + '05_combmap_img', [9, 10], ['WIDER'], 'certain', "'much overflow in boxes'")
add(32, F4 + '05_combmap_img', [0, 1, 4, 5], ['WIDER'], 'likely', "'much overflow in boxes' (text reaches the box border: drawn right margin < 1 pt)")
add(34, F4 + '05_map8_img', [3, 4, 5, 6], ['WIDER'], 'certain', "'overflow in boxes'")

ROWS = {(r['basename'], r['block']): r for r in map(json.loads, open(C3 / 'blocks.jsonl'))}
W = json.loads((C3 / 'words.json').read_text())
checks = []
for (b, bi), flags in M.items():
    r = ROWS[(b, bi)]
    g = r['geometry']['container'] if r['container']['final'] == 'BOUNDED' else r['geometry']['free_dark_or_labels']
    for f in flags:
        for m in f['mechanism']:
            if m == 'WIDER':
                ok = r['budget']['maxw'] > g['avail_from_anchor'] + 1e-6 and r['out']['n_lines'] <= r['src']['n_lines'] and min(g['drawn']['left'], g['drawn']['right']) < 1.0
                ev = f"maxw {r['budget']['maxw']} > avail_from_anchor {g['avail_from_anchor']}; lines {r['src']['n_lines']}->{r['out']['n_lines']}; drawn L/R margin {g['drawn']['left']}/{g['drawn']['right']} (src {g['src']['left']}/{g['src']['right']})"
            elif m == 'NARROWER':
                ok = r['out']['n_lines'] > r['src']['n_lines'] and r['budget']['maxw'] < g['width']
                ev = f"lines {r['src']['n_lines']}->{r['out']['n_lines']}; maxw {r['budget']['maxw']} < free width {g['width']}; drawn up/down {g['drawn']['up']}/{g['drawn']['down']} (src {g['src']['up']}/{g['src']['down']})"
            elif m == 'ANCHOR':
                ok = r['align']['ambiguous']
                ev = f"align {r['align']['verdict']} ambiguous={r['align']['ambiguous']} ({r['align']['why']})"
            elif m == 'SHRINK':
                ok = r['baseline']['shrunk']
                ev = f"size {r['out']['size']} < {r['src']['sz0']}; longest word '{W[f'{b}#{bi}']['longest_word']}' {W[f'{b}#{bi}']['longest_word_w_sz0']} pt > maxw {r['budget']['maxw']}"
            elif m == 'TABLE':
                ok = r['container']['final'] == 'BOUNDED' and r['container']['dark'] != 'BOUNDED'
                ev = f"colour region {r['container']['raster']}, dark region {r['container']['dark']}, vector {r['container']['vector_kind']}"
            checks.append(dict(basename=b, block=bi, row=f['row'], mechanism=m, geometry_agrees=ok, evidence=ev))
        f['crop'] = f"/home/siggi/dev/scratch-c140/c3/crops/{b}__b{bi:02d}.png"
        f['evidence'] = [c['evidence'] for c in checks if c['basename'] == b and c['block'] == bi and c['row'] == f['row']]
(C3 / 'userflags.json').write_text(json.dumps({f'{b}#{bi}': v for (b, bi), v in M.items()}, ensure_ascii=False, indent=1))
(C3 / 'userflag-checks.json').write_text(json.dumps(checks, ensure_ascii=False, indent=1))
print('flagged blocks', len(M), 'mechanism checks', len(checks), 'geometry disagrees', sum(not c['geometry_agrees'] for c in checks))
for c in checks:
    if not c['geometry_agrees']:
        print('  DISAGREE', c)
