"""Resolve the driver population exactly as tools/figure-run.js does, per chapter:
basename pass (sources.resolve with supersededArtwork) -> de-hash LOOKUP-ONLY for
unresolved hashed names whose stem is not contested in the chapter -> artwork-collision
backstop within the chapter."""
import json, re, sys, os
from pathlib import Path
from collections import defaultdict
EXP = Path('/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation')
sys.path.insert(0, str(EXP)); sys.path.insert(0, str(EXP / 'pylibs'))
os.environ.setdefault('FIGTEXT_PYLIBS', str(EXP / 'pylibs'))
import sources as S
HASH = re.compile(r'-[0-9a-f]{4}$')
pop = json.load(open('population.json'))
cfg = S.load_config(); trees = S.load_trees('efnafraedi-2e', cfg)
prec = cfg['editionPrecedence']; sup = cfg.get('supersededArtwork')
memo = {}
bych = defaultdict(list)
for f in pop['figures']:
    bych[f['chapter']].append(f)
rows = []
for ch, figs in bych.items():
    names = [f['basename'] for f in figs]
    unhashed = {b for b in names if not HASH.search(b)}
    stems = defaultdict(set)
    for b in names:
        if HASH.search(b): stems[HASH.sub('', b)].add(b)
    contested = {}
    for st, cl in stems.items():
        if st in unhashed: cl = cl | {st}
        if len(cl) > 1: contested[st] = sorted(cl)
    recs = []
    for f in figs:
        p, key = S.resolve(f['basename'], trees, prec, superseded=sup, _memo=memo)
        rec = dict(f, artwork=str(p) if p else None, edition=key, via='basename' if p else None)
        if not p and HASH.search(f['basename']):
            st = HASH.sub('', f['basename'])
            if st in contested:
                rec['contest'] = contested[st]
            else:
                p2, k2 = S.resolve(st, trees, prec, superseded=sup, _memo=memo)
                if p2: rec.update(artwork=str(p2), edition=k2, via='de-hashed')
        if not rec['artwork'] and sup and S._normkey(f['basename']) in {S._normkey(k) for k in sup}:
            rec['superseded'] = True
        recs.append(rec)
    byart = defaultdict(list)
    for r in recs:
        if r['artwork']: byart[r['artwork']].append(r)
    for a, cl in byart.items():
        if len(cl) > 1:
            for r in cl:
                r.update(artwork=None, edition=None, via=None, contest=sorted(x['basename'] for x in cl))
    rows += recs
json.dump(rows, open('resolved.json', 'w'), indent=1)
from collections import Counter
print('enumerated', len(rows))
print('resolved', sum(1 for r in rows if r['artwork']), Counter(r['via'] for r in rows))
print('superseded-refused', sum(1 for r in rows if r.get('superseded')), 'contested', sum(1 for r in rows if r.get('contest')))
print('ext', Counter(Path(r['artwork']).suffix.lower() for r in rows if r['artwork']))
print('edition', Counter(r['edition'] for r in rows if r['artwork']))
