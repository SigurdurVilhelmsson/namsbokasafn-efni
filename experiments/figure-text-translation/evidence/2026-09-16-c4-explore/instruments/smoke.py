import sys, json
sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parent))
import driver as D

pop = D.load_population()
bought = D.load_bought()
by_basename = {r['key']: r for r in pop}

targets = [
    'CNX_Chem_04_05_combustion|default',   # positive control, bought, .pdf
    'CNX_Chem_04_02_Citrus|default',       # type0-unreadable / mode-7 Tr candidate, .pdf, bought? check
    'CNX_Chem_11_04_rvosmosis|refused',    # excluded
    'CNX_Chem_18_07_N2O5|pdf',
    'CNX_Chem_18_07_N2O5|eps',
]
# also grab one plain .eps figure and one with many forms, from the population itself
eps_candidates = [r for r in pop if r.get('kind') == 'eps' and r['variant'] == 'default']
print('eps candidate example:', eps_candidates[0]['key'])
targets.append(eps_candidates[0]['key'])

for key in targets:
    row = by_basename.get(key)
    if row is None:
        print('MISSING ROW', key)
        continue
    res = D.census_one(row, bought)
    print('---', key, '---')
    print(json.dumps({k: v for k, v in res.items() if k not in ('later_paint_events',)}, indent=0)[:2000])
    if res.get('later_paint_events'):
        print('later_paint_events:', res['later_paint_events'][:3])

print('DONE smoke')
