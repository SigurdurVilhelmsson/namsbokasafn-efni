import json, collections, sys
from pathlib import Path
sys.dont_write_bytecode = True
ROOT = Path('/home/siggi/dev/scratch-c140'); R2 = ROOT / 'r2'; PREP = ROOT / 'prep'
names = [f['basename'] for f in json.loads((PREP / 'manifest.json').read_text())['figures']]
# 1. blocks my item-compare says changed but builder row-compare (text, drawn_frame 2dp, size) says unchanged
his0 = {(r['basename'], r['block']): r for r in map(json.loads, open(R2 / 'measure-V0.jsonl'))}
for T in ('V5_p2.0_f7.0', 'V5_p2.5_f7.0'):
    h = {(r['basename'], r['block']): r for r in map(json.loads, open(R2 / f'measure-{T}.jsonl'))}
    for b in names:
        a = [it for it in json.loads((R2 / 'work/V0' / b / 'items.json').read_text()) if it['path'] == 'layout']
        c = [it for it in json.loads((R2 / 'work' / T / b / 'items.json').read_text()) if it['path'] == 'layout']
        for bi in sorted({it['block'] for it in a}):
            ia = [it for it in a if it['block'] == bi]; ic = [it for it in c if it['block'] == bi]
            key = lambda it: (it['text'], it['size'], it['bold'], it['italic'], round(it['x'], 3), round(it['y'], 3))
            if [key(x) for x in ia] != [key(x) for x in ic]:
                r0, r1 = his0[(b, bi)], h[(b, bi)]
                if r0['text'] == r1['text'] and r0['drawn_frame'] == r1['drawn_frame'] and r0['size'] == r1['size']:
                    print(T, b, bi, 'V0 items', [(x['text'], round(x['x'], 4), round(x['y'], 4), x['size']) for x in ia])
                    print('   ', T, 'items', [(x['text'], round(x['x'], 4), round(x['y'], 4), x['size']) for x in ic])
# 2. sandwich b6 source runs
sys.path.insert(0, '/home/siggi/dev/scratch-c140/c3b/tree')
import figtext as FT
from blockkey import block_key
b = 'CNX_Chem_04_04_sandwich'
runs = json.loads((PREP / 'figs' / b / 'runs.json').read_text()); bl = FT.merge_blocks(FT.group(runs))
print('sandwich b6 key', block_key(bl[6]))
for r in bl[6]:
    print('  run', repr(r['text']), r['size'], round(r['x'], 2), round(r['y'], 2), r['font'])
tr = json.loads(Path('/home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi-2e/figure-text/CNX_Chem_04_04_sandwich.is.json').read_text())['blocks']
print('  value', repr(tr[block_key(bl[6])]))
for d in json.loads((R2 / 'work/V5_p2.0_f7.5' / b / 'diag.json').read_text()):
    if d['block'] == 6: print('  diag', json.dumps(d, ensure_ascii=False)[:900])
rep = json.loads((R2 / 'work/V5_p2.0_f7.5' / b / 'compose-report.json').read_text()); print('  unformatted', rep.get('unformatted'))
# 3. step differences on/off for token blocks
for b in names:
    on = {d['block']: d for d in json.loads((R2 / 'work/V5_p2.0_f7.5' / b / 'diag.json').read_text())}
    off = {d['block']: d for d in json.loads((R2 / 'work/V5_p2.0_f7.5_notr' / b / 'diag.json').read_text())}
    for bi, d in on.items():
        r_on, r_off = d.get('r2') or {}, off[bi].get('r2') or {}
        if r_on.get('n_tokens') and (r_on.get('step') != r_off.get('step') or d['sz'] != off[bi]['sz'] or d['n_out_lines'] != off[bi]['n_out_lines'] or abs(r_on.get('disp_pt', 0) - r_off.get('disp_pt', 0)) > 1e-3):
            print('on/off', b, bi, r_on.get('step'), r_off.get('step'), d['sz'], off[bi]['sz'], d['n_out_lines'], off[bi]['n_out_lines'], r_on.get('disp_pt'), r_off.get('disp_pt'))
