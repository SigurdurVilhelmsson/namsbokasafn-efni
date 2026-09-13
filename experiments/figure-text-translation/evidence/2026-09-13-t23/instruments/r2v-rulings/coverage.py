import json, sys
sys.dont_write_bytecode = True
from pathlib import Path
R2 = Path('/home/siggi/dev/scratch-c140/r2'); T = 'V5_p2.0_f7.5_dec'
man = json.loads(Path('/home/siggi/dev/scratch-c140/prep/manifest.json').read_text())
names = [f['basename'] for f in man['figures']]
viewed = set()
for fn, _ in json.loads((R2 / 'crops/INDEX.json').read_text()):
    b, bi = fn[:-4].rsplit('__b', 1); viewed.add((b, int(bi)))
for b in names:
    for x in json.loads((R2 / 'work' / T / b / 'diag.json').read_text()):
        if x.get('r2', {}).get('transfer'): viewed.add((b, x['block']))
extra = [('CNX_Chem_03_01_alsulfatemass_img', 13), ('CNX_Chem_03_01_aspirin', 13), ('CNX_Chem_03_01_chloroform', 13),
         ('CNX_Chem_03_01_glycinemass_img', 13), ('CNX_Chem_03_01_saltMass', 10), ('CNX_Chem_03_01_brain-ec0b', 0),
         ('CNX_Chem_04_01_rxn2', 12), ('CNX_Chem_04_01_rxn2', 9), ('CNX_Chem_04_04_sandwich', 0), ('CNX_Chem_04_04_sandwich', 6),
         ('CNX_Chem_03_01_exocytosis-88f6', 0), ('CNX_Chem_03_01_exocytosis-88f6', 1), ('CNX_Chem_03_01_exocytosis-88f6', 2),
         ('CNX_Chem_03_01_exocytosis-88f6', 4), ('CNX_Chem_04_03_etheneBr_img', 1), ('CNX_Chem_04_03_flowchart', 5),
         ('CNX_Chem_04_03_flowchart', 15), ('CNX_Chem_04_03_flowchart', 18), ('CNX_Chem_04_05_map7_img', 6)]
viewed |= set(extra)
# whole figures whose contact sheet I read at full width
sheets = {'CNX_Chem_04_05_map7_img', 'CNX_Chem_04_01_rxn2', 'CNX_Chem_04_05_combustion', 'CNX_Chem_04_03_ethene_img', 'CNX_Chem_03_01_glycinemass_img'}
changed = []; tot = 0
for b in names:
    a = json.loads((R2 / 'work/V0' / b / 'items.json').read_text()); c = json.loads((R2 / 'work' / T / b / 'items.json').read_text())
    d5 = {x['block']: x for x in json.loads((R2 / 'work' / T / b / 'diag.json').read_text())}
    d0 = {x['block']: x for x in json.loads((R2 / 'work/V0' / b / 'diag.json').read_text())}
    for bi in sorted({i['block'] for i in c if i['path'] == 'layout'}):
        ia = [(i['text'], round(i['x'], 2), round(i['y'], 2), i['size']) for i in a if i['block'] == bi and i['path'] == 'layout']
        ic = [(i['text'], round(i['x'], 2), round(i['y'], 2), i['size']) for i in c if i['block'] == bi and i['path'] == 'layout']
        if ia != ic:
            tot += 1
            if (b, bi) not in viewed and b not in sheets:
                dx = round(min(i[1] for i in ic) - min(i[1] for i in ia), 2)
                changed.append((b.replace('CNX_Chem_', ''), bi, d0[bi]['wrapped'], d0[bi]['sz'], '->', d5[bi]['wrapped'], d5[bi]['sz'], d5[bi]['r2']['cls'], d5[bi]['r2']['step'], 'dx', dx))
print('changed layout blocks vs V0:', tot, '| not covered by any crop or full-sheet look:', len(changed))
for r in changed: print('  ', r)
