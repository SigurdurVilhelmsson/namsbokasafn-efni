"""Independent classification of NEW segments against June (verify-carryover)."""
import sys, os, json, collections, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from segs import *
from norm import *
D = load()
HERE = os.path.dirname(os.path.abspath(__file__))

def vis_safe(s):
    try:
        return visible(s)
    except ParseError:
        return None

rows = []
pe = collections.Counter()
for p in sorted(D['new']['en']):
    ch = chapter_of(p); mod = module_of(p)
    ip = pair_path(p)
    ne, norder = parse_first(D['new']['en'][p])
    ni, _ = parse_first(D['new']['is'][ip])
    je, jorder = parse_first(D['june']['en'].get(p))
    ji, _ = parse_first(D['june']['is'].get(ip))
    # June visible index (by text) for the module
    jvis = {}
    for k in jorder:
        v = vis_safe(je[k])
        if v is None: pe['june_en'] += 1
        jvis[k] = v
    bytext = collections.defaultdict(list)
    for k in jorder:
        bytext[jvis[k]].append(k)
    for k in norder:
        if k not in ni:
            continue
        e = ne[k]
        v = vis_safe(e)
        if v is None: pe['new_en'] += 1
        typ = k.split(':')[1]; eid = k.split(':', 2)[2]
        r = {'ch': ch, 'mod': mod, 'key': k, 'type': typ, 'chars': len(chars(e)) if v is not None else None}
        if k in je and k in ji:
            r['cls'] = 1 if (v is not None and v == jvis[k]) else 2
            if r['cls'] == 2:
                cand = [x for x in bytext.get(v, [])]
                r['textmatch_n'] = len(cand)
        else:
            cand = bytext.get(v, [])
            r['textmatch_n'] = len(cand)
            r['cls'] = 3 if len(cand) == 1 else 4
            if len(cand) == 1: r['src'] = cand[0]
        rows.append(r)
print('parse errors', dict(pe))
c = collections.Counter(r['cls'] for r in rows)
print('total NEW keys with EN+IS', len(rows), 'classes', dict(sorted(c.items())))
c4 = collections.Counter((r['type'], r['textmatch_n']>1) for r in rows if r['cls'] == 4)
print('class 4 by (type, multi-match):', dict(c4))
c2 = collections.Counter((r['type'], r['textmatch_n']) for r in rows if r['cls'] == 2)
print('class 2 by (type, #textmatches in June module):', dict(sorted(c2.items(), key=lambda x:-x[1])[:20]))
c3 = collections.Counter(r['type'] for r in rows if r['cls'] == 3)
print('class 3 by type:', dict(c3))
with open(os.path.join(HERE, 'my_classes_juneref.jsonl'), 'w') as f:
    for r in rows: f.write(json.dumps(r, ensure_ascii=False) + '\n')
