import sys, json, collections
sys.path.insert(0, '.')
from segs import parse, norm_en, git_show
R = json.load(open('data/reattach.json'))
NEW='98a5fe2ff'; BOOK='books/efnafraedi-2e'
newmt = {}
def nmt(ch, mod):
    if (ch,mod) not in newmt:
        p = f'{BOOK}/02-mt-output/{ch}/{mod}-segments.is.md'
        newmt[(ch,mod)] = collections.defaultdict(list)
        for i,t in parse(git_show(NEW, p) or ''):
            newmt[(ch,mod)][i].append(t)
    return newmt[(ch,mod)]
U = {}  # (module, segId) -> info
for r in R:
    key = (r['module'], r['segId'])
    if r['source'] == 'faithful':
        if not r['editedVsMT']: continue
        u = U.setdefault(key, {'chapter': r['chapter'], 'faithful': None, 'rows': [], 'verdicts': set(), 'newIds': set()})
        u['faithful'] = r['isHuman']
    else:
        u = U.setdefault(key, {'chapter': r['chapter'], 'faithful': None, 'rows': [], 'verdicts': set(), 'newIds': set()})
        u['rows'].append(r)
    u['verdicts'].add(r['verdict'])
    for x in r.get('detail', {}).get('newIds', []): u['newIds'].add(x)
tab = collections.defaultdict(collections.Counter)
for (mod, sid), u in U.items():
    rows = sorted(u['rows'], key=lambda r: r['created'])
    latest = rows[-1] if rows else None
    if u['faithful'] is not None and latest is None:
        cls = 'faithful-only (no DB row)'
        text = u['faithful']
    elif latest is None:
        continue
    else:
        st = latest['status']
        inFA = u['faithful'] is not None and norm_en(u['faithful']) == norm_en(latest['isHuman'] or '')
        if st == 'approved' and inFA: cls = 'approved, in faithful file'
        elif st == 'approved' and u['faithful'] is not None: cls = 'approved, faithful holds DIFFERENT text'
        elif st == 'approved': cls = 'approved, NOT in any faithful file'
        else: cls = 'latest row PENDING' + (' (faithful holds an older approved text)' if u['faithful'] is not None else '')
        text = latest['isHuman'] or ''
    content_ok = all(v.startswith('match-same-module') or v == 'chapter-title' for v in u['verdicts'])
    # converged: latest human text already equals the NEW MT at the content-matched new id(s)
    conv = False
    if mod != 'chapter-metadata':
        ids = [x for x in u['newIds'] if ':' in x and not x.startswith(mod + ':' + mod)]
        mt = nmt(u['chapter'], mod)
        conv = any(norm_en(t) == norm_en(text) for i in u['newIds'] for t in mt.get(i, []))
    else:
        mt = nmt(u['chapter'], 'chapter-metadata')
        conv = any(norm_en(t) == norm_en(text) for t in mt.get(sid, []))
    tab[mod][cls] += 1
    tab[mod]['content-matched' if content_ok else 'NOT content-matched'] += 1
    tab[mod]['new MT already == human text' if conv else 'new MT != human text'] += 1
tot = collections.Counter()
for mod in sorted(tab):
    print(mod, dict(tab[mod])); tot += tab[mod]
print('TOTAL', dict(tot))
print('distinct segments with human-edited text:', len(U))
