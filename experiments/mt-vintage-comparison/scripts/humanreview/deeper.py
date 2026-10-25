import sys, json, re, collections
sys.path.insert(0, '.')
from segs import parse, norm_en, git_show
R = json.load(open('data/reattach.json'))
NEW='98a5fe2ff'; BOOK='books/efnafraedi-2e'
newen, newmt = {}, {}
def load_new(ch, mod):
    if (ch,mod) not in newen:
        newen[(ch,mod)] = parse(git_show(NEW, f'{BOOK}/02-for-mt/{ch}/{mod}-segments.en.md') or '')
        newmt[(ch,mod)] = parse(git_show(NEW, f'{BOOK}/02-mt-output/{ch}/{mod}-segments.is.md') or '')
    return newen[(ch,mod)], newmt[(ch,mod)]
def markers(s):
    c = collections.Counter()
    for m in re.finditer(r'\[\[([A-Za-z_-]+)', s): c['[['+m.group(1)] += 1
    for m in re.finditer(r'\{\{(/?)([A-Za-z0-9_-]+)', s): c['{{'+m.group(1)+m.group(2)] += 1
    c['__'] += len(re.findall(r'__[^_\s][^_]*?__', s))
    return +c
out = collections.Counter()
amb = collections.Counter()
rows = []
for r in R:
    if r['verdict'] == 'chapter-title' or r['enOld'] is None: continue
    ch = r['chapter']; mod = r['module']
    en, mt = load_new(ch, mod)
    n = norm_en(r['enOld'])
    cands = [k for k,(i,t) in enumerate(en) if norm_en(t) == n]
    key = 'faithful-edited' if (r['source']=='faithful' and r['editedVsMT']) else ('faithful-unedited' if r['source']=='faithful' else 'harvest-'+r['status'])
    amb[(key, 'unique' if len(cands)==1 else f'{len(cands)} candidates')] += 1
    k = cands[0] if cands else None
    rawSame = (k is not None and en[k][1] == r['enOld'])
    mOld, mNew = markers(r['enOld']), markers(en[k][1]) if k is not None else None
    hum = r.get('isHuman') or ''
    humMarkers = markers(hum)
    newMtText = mt[k][1] if (k is not None and k < len(mt) and mt[k][0]==en[k][0]) else None
    humEqNewMT = newMtText is not None and norm_en(newMtText) == norm_en(hum)
    out[(key, 'EN raw identical' if rawSame else 'EN raw differs (dialect/markers)')] += 1
    out[(key, 'human IS has markers' if humMarkers else 'human IS marker-free')] += 1
    out[(key, 'human == new MT (normalised)' if humEqNewMT else 'human != new MT')] += 1
    rows.append({'key':key,'module':mod,'segId':r['segId'],'newId':en[k][0] if k is not None else None,'nCand':len(cands),
                 'enRawSame':rawSame,'mOld':dict(mOld),'mNew':dict(mNew) if mNew else None,'humMarkers':dict(humMarkers),
                 'humEqNewMT':humEqNewMT})
for k in sorted(out): print(k, out[k])
print()
for k in sorted(amb): print('ambiguity', k, amb[k])
json.dump(rows, open('data/deeper.json','w'), ensure_ascii=False, indent=1)
