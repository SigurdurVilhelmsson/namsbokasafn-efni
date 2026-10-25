import json, sys
from collections import Counter, defaultdict
B = json.load(open(sys.argv[1])); T = json.load(open(sys.argv[2]))
U = B['undecided']
bases = ('june', 'new', 'hybrid')
print('undecided headwords (K_old != K_new, no verdict, no exact ruling):', len({(u['chapter'], u['definitionId']) for u in U}))
print('HYBRID key-terms entry source for undecided:', Counter(u['Ksrc'] for u in U if u['base'] == 'hybrid'))
agg = defaultdict(Counter)
for u in U:
    a = agg[(u['base'], u['chapter'])]
    a['terms'] += 1; a['prose'] += u.get('prose', 0)
    for k in ('old', 'new', 'both', 'neither'): a[k] += u.get(k, 0)
    a['ifJuly'] += u.get('prose', 0) - u.get('old', 0) - u.get('both', 0)
    a['ifNew'] += u.get('prose', 0) - u.get('new', 0) - u.get('both', 0)
    a['lowN'] += (u.get('prose', 0) < 3)
chs = sorted({u['chapter'] for u in U})
print('unit: segment-term pairs. carries: O = July entry only, N = new entry only, B = both, X = neither; if-July / if-new = pairs needing change if [USER] later picks that entry')
for ch in chs:
    line = f'{ch} terms {agg[("new", ch)]["terms"]:3d} |'
    for b in bases:
        a = agg[(b, ch)]
        line += f" {b[:3].upper()} pr{a['prose']:4d} O{a['old']:4d} N{a['new']:4d} B{a['both']:3d} X{a['neither']:4d} ifJ{a['ifJuly']:4d} ifN{a['ifNew']:4d} |"
    print(line)
tot = {b: Counter() for b in bases}
for (b, ch), a in agg.items(): tot[b].update(a)
for b in bases:
    t = tot[b]
    print(f"{b.upper():7s} terms {t['terms']} (prose<3: {t['lowN']}), prose pairs {t['prose']}: July-only {t['old']}, new-only {t['new']}, both {t['both']}, neither {t['neither']}; "
          f"needing change if all ruled July {t['ifJuly']}, if all ruled new {t['ifNew']}")
# undecided headwords that have a decision on the same headword in ANOTHER chapter
dec = defaultdict(list)
for t in T['terms']:
    if t.get('target'): dec[t['enNorm']].append((t['chapter'], t['target']))
seen = set()
for u in U:
    if u['base'] != 'new': continue
    t = [x for x in T['terms'] if x['chapter'] == u['chapter'] and x['definitionId'] == u['definitionId']][0]
    other = [d for d in dec.get(t['enNorm'], []) if d[0] != u['chapter']]
    if other and (u['chapter'], t['enNorm']) not in seen:
        seen.add((u['chapter'], t['enNorm']))
        print(f"  decided elsewhere: {u['chapter']} {u['en']!r} (July {u['Kold']!r} / new {u['Knew']!r}) <- {other}")
# heaviest undecided by prose in NEW
rows = sorted([u for u in U if u['base'] == 'new'], key=lambda u: -u.get('prose', 0))[:15]
print('15 undecided with most prose (NEW base): ch, en, July entry, new entry, prose, carries July/new/both/neither')
for u in rows:
    print(f"  {u['chapter']} {u['en'][:30]:30s} {str(u['Kold'])[:24]:24s} {str(u['Knew'])[:24]:24s} pr {u.get('prose',0):3d} O{u.get('old',0):3d} N{u.get('new',0):3d} B{u.get('both',0):3d} X{u.get('neither',0):3d}")
