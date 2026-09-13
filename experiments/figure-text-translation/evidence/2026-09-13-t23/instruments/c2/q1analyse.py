import json, sys, collections
rows=[json.loads(l) for l in open(sys.argv[1])]
print('vintage mismatches:', sorted({r['basename'] for r in rows if not r['vintage_ok']}))
nb=[r for r in rows if r['text'].strip()]
print('runs', len(rows), 'non-blank', len(nb))
# script per 2b
c=collections.Counter((r['rule_2b'], r['rule_1b_has_script'], r['rule_1b_shift075']) for r in nb)
print('(2b, 1b_has_script, 1b_shift075) -> runs'); [print('  ',k,v) for k,v in sorted(c.items(), key=str)]
# group clause decisive vs 2b script
c2=collections.Counter((r['rule_2b'] in ('sub','sup'), r['group_script_clause'], r['group_script_decisive']) for r in nb if r['group_script_clause'] is not None)
print('(2b sub/sup, group script clause true, script decisive) -> runs'); [print('  ',k,v) for k,v in sorted(c2.items(), key=str)]
print('\nruns where rules disagree:')
for r in nb:
    s2b = r['rule_2b'] in ('sub','sup')
    if s2b != r['rule_1b_has_script'] or s2b != r['rule_1b_shift075'] or r['rule_2b']=='small':
        print(f"  {r['basename'][9:]:32} {r['state']:10} {r['key']!r:40} run={r['text']!r:14} size={r['size']} base={r['base_size']} ratio={r['ratio']} shift={r['shift_pt']} ({r['shift_frac']}) 2b={r['rule_2b']} 1b={r['rule_1b_has_script']} 075={r['rule_1b_shift075']} font={r['font'].split('+')[-1]}")
print('\nscript runs (2b sub/sup) geometry:')
g=collections.Counter()
for r in nb:
    if r['rule_2b'] in ('sub','sup'):
        g[(r['basename'][9:], r['rule_2b'], r['size'], r['base_size'], r['shift_pt'], r['shift_frac'], r['ratio'], r['state'])]+=1
for k,v in sorted(g.items()): print('  ',v,'x',k)
print('\ndistinct (kind, ratio, shift_frac) over script runs:')
h=collections.Counter((r['rule_2b'], r['ratio'], r['shift_frac']) for r in nb if r['rule_2b'] in ('sub','sup'))
for k,v in sorted(h.items(), key=str): print('  ',v,k)
print('\nby state, script runs:', collections.Counter(r['state'] for r in nb if r['rule_2b'] in ('sub','sup')))
print('shift magnitudes of NON-script non-blank runs (max abs):', max(abs(r['shift_pt']) for r in nb if r['rule_2b'] not in ('sub','sup')))
print('min abs shift of script runs:', min(abs(r['shift_pt']) for r in nb if r['rule_2b'] in ('sub','sup')))
print('italic runs by state:', collections.Counter((r['state'], r['text']) for r in nb if r['italic']))
