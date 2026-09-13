import json, sys, collections
sys.dont_write_bytecode = True
from pathlib import Path
R2 = Path('/home/siggi/dev/scratch-c140/r2')
fine = ['CNX_Chem_03_01_brain-ec0b','CNX_Chem_03_01_exocytosis-88f6']
for tag in ['V5_p2.0_f7.5_dec']:
    print('==', tag)
    for b in fine:
        a = json.loads((R2/'work/V0'/b/'items.json').read_text()); c = json.loads((R2/'work'/tag/b/'items.json').read_text())
        dg0 = {x['block']: x for x in json.loads((R2/'work/V0'/b/'diag.json').read_text())}
        dg5 = {x['block']: x for x in json.loads((R2/'work'/tag/b/'diag.json').read_text())}
        blocks = sorted({i['block'] for i in a if i['path']=='layout'} | {i['block'] for i in c if i['path']=='layout'})
        ch = []
        for bi in blocks:
            ia = [(i['text'], round(i['x'],2), round(i['y'],2), i['size']) for i in a if i['block']==bi and i['path']=='layout']
            ic = [(i['text'], round(i['x'],2), round(i['y'],2), i['size']) for i in c if i['block']==bi and i['path']=='layout']
            if ia != ic:
                d0 = dg0.get(bi, {}); d5 = dg5.get(bi, {})
                ch.append((bi, d0.get('wrapped'), d0.get('sz'), '->', d5.get('wrapped'), d5.get('sz'), d5.get('r2',{}).get('step'), d5.get('r2',{}).get('cls'),
                           'dx', round(min(i[1] for i in ic)-min(i[1] for i in ia),2), 'dy', round(max(i[2] for i in ic)-max(i[2] for i in ia),2)))
        print(b, 'layout blocks', len(blocks), 'changed', len(ch))
        for x in ch: print('   ', x)
