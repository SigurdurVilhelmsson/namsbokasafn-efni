"""Build (newEN, newMT, humanIS) triples for the 137 distinct human-text segments, keyed on the
content-matched NEW segment (same id preferred; else the unique/ordered content match)."""
import sys, json, collections
sys.path.insert(0, '.')
from segs import parse, norm_en, git_show
R = json.load(open('data/reattach.json'))
NEW='98a5fe2ff'; BOOK='books/efnafraedi-2e'
cache = {}
def newfiles(ch, mod):
    if (ch, mod) not in cache:
        cache[(ch, mod)] = (parse(git_show(NEW, f'{BOOK}/02-for-mt/{ch}/{mod}-segments.en.md') or ''),
                            parse(git_show(NEW, f'{BOOK}/02-mt-output/{ch}/{mod}-segments.is.md') or ''))
    return cache[(ch, mod)]
U = {}
for r in R:
    if r['source'] == 'faithful' and not r['editedVsMT']: continue
    if r.get('enOld') is None: continue
    key = (r['module'], r['segId'])
    u = U.setdefault(key, {'chapter': r['chapter'], 'enOld': r['enOld'], 'faithful': None, 'rows': []})
    if r['source'] == 'faithful': u['faithful'] = r['isHuman']
    else: u['rows'].append(r)
out = []
for (mod, sid), u in U.items():
    rows = sorted(u['rows'], key=lambda r: r['created'])
    text = rows[-1]['isHuman'] if rows else u['faithful']
    status = rows[-1]['status'] if rows else 'faithful-only'
    en, mt = newfiles(u['chapter'], mod)
    n = norm_en(u['enOld'])
    cands = [k for k, (i, t) in enumerate(en) if norm_en(t) == n]
    same = [k for k in cands if en[k][0] == sid]
    k = same[0] if same else (cands[0] if cands else None)
    mtmap = collections.defaultdict(list)
    for i, t in mt: mtmap[i].append(t)
    newId = en[k][0] if k is not None else None
    out.append({'module': mod, 'oldId': sid, 'newId': newId, 'status': status,
                'newEN': en[k][1] if k is not None else None,
                'newMT': (mtmap.get(newId) or [''])[0], 'human': text or ''})
json.dump(out, open('data/gate-input.json', 'w'), ensure_ascii=False, indent=1)
print(len(out))
