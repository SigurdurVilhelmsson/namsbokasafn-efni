import json, sys
from collections import Counter, defaultdict
B = json.load(open(sys.argv[1]))
cls = defaultdict(Counter)
for r in B['records']:
    cls[(r['base'], r['chapter'], r['definitionId'])][r['class']] += 1
hw = {(h['base'], h['chapter'], h['definitionId']): h for h in B['headwords']}
for b in ('june', 'new', 'hybrid'):
    rows = [r for r in B['prose'] if r['base'] == b]
    rows.sort(key=lambda r: -(r['prose'] - r['ok']))
    print(f'\n== {b.upper()}: 15 heaviest terms (segment-term pairs needing change = prose - carrying)')
    for r in rows[:15]:
        c = cls[(b, r['chapter'], r['definitionId'])]
        h = hw[(b, r['chapter'], r['definitionId'])]
        print(f"  {r['chapter']} {r['en'][:34]:34s} -> {r['target'][:26]:26s} [{r['how']:7s}] fix {r['prose']-r['ok']:3d}/{r['prose']:3d}"
              f"  P{c['SWAP-PARALLEL']:3d} A{c['SWAP-AGREEMENT']:3d} X{c['ABSENT']:3d}  headword {'ok' if h['exactOk'] else 'FIX ('+str(h['K'])+')'}")
