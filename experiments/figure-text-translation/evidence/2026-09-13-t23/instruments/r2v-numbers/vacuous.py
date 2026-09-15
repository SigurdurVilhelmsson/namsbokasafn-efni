import json, collections
from pathlib import Path
ROOT = Path('/home/siggi/dev/scratch-c140'); ME = ROOT / 'r2v-numbers'
UF = json.loads((ROOT / 'c3/userflags.json').read_text())
M = {(r['basename'], r['block']): r for r in map(json.loads, open(ME / 'out/mym-V5_p2.0_f7.0.jsonl'))}
V0 = {(r['basename'], r['block']): r for r in map(json.loads, open(ME / 'out/mym-V0.jsonl'))}
PROSE = {23, 24, 31}
rows = collections.Counter(); detail = []
for k, fl in UF.items():
    kk = (k.rsplit('#', 1)[0], int(k.rsplit('#', 1)[1])); r = M[kk]
    for f in fl:
        for m in f['mechanism']:
            if m == 'NARROWER' and f['row'] not in PROSE:
                alt = r['ink_on_dark'] < 10 and r['ink_off_page'] <= r['src_ink_off_page'] and r['text_coll'] < 10
                via = 'lines<=src' if r['lines'] <= r['src_lines'] else ('pixels' if alt else 'UNRESOLVED')
                rows[('NARROWER-nonprose', via, 'pixel-disjunct-also-true' if alt else 'pixel-disjunct-false')] += 1
                detail.append((kk[0][9:], kk[1], f['row'], V0[kk]['lines'], r['src_lines'], r['lines'], r['size']))
            elif m == 'ANCHOR' and kk == ('CNX_Chem_04_03_ethene_img', 0):
                rows[('ANCHOR-ethene-b0', 'lines<=src')] += 1
print(dict(rows))
print('NARROWER non-prose blocks (fig, block, row, V0 lines, src lines, V5 lines, V5 size):')
for d in sorted(set(detail)): print('  ', d)
