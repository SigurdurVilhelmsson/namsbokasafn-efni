#!/usr/bin/env python3
"""§C140 ㊸ probe (scratch): how many DISTINCT walk states does a file have?

A state is what the hits below an element depend on: (element, exact ctm, the last clip
entering it). Mirrors find_candidates' traversal; counts states visited once each, and the
number of hits (mask reached) a state-memoized walk would record. Also the max depth.
"""
import sys, time
from pathlib import Path
HERE = Path(__file__).resolve().parents[2]          # experiments/figure-text-translation
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE / 'pylibs'))
import figrings as F
import xml.etree.ElementTree as ET

def probe(path):
    t0 = time.time()
    root = ET.fromstring(Path(path).read_text(encoding='utf-8'))
    ids = {e.get('id'): e for e in root.iter() if e.get('id')}
    rasters = set()
    for m in root.iter('{%s}mask' % F.SVG_NS):
        for u in m.iter('{%s}use' % F.SVG_NS):
            el = ids.get((u.get(F.XLINK_HREF) or u.get('href') or '')[1:])
            if el is not None and F._tag(el) == 'image':
                rasters.add(m.get('id'))
    states, hits, maxd = set(), [], [0]
    sys.setrecursionlimit(100000)
    def key(ctm):
        return tuple(v for row in ctm for v in row)
    def walk(el, ctm, last, depth):
        maxd[0] = max(maxd[0], depth)
        ctm = F._matmul(ctm, F.parse_transform(el.get('transform')))
        if F._tag(el) == 'use':
            ctm = F._matmul(ctm, F.parse_transform('translate(%s,%s)' % (el.get('x', 0), el.get('y', 0))))
        cp = el.get('clip-path')
        if cp and '#' in cp:
            cel = ids.get(cp[cp.find('#') + 1:cp.find(')')])
            r = F._clip_rect(cel) if cel is not None else None
            if r:
                last = (cp[cp.find('#') + 1:cp.find(')')], tuple(r), key(ctm))
        st = (id(el), key(ctm), last)
        if st in states:
            return
        states.add(st)
        flt = el.get('filter')
        if flt and flt.startswith('url('):
            fel = ids.get(flt[flt.find('#') + 1:flt.find(')')])
            if fel is not None and F._tag(fel) == 'filter':
                for fe in fel:
                    if F._tag(fe) != 'feImage':
                        continue
                    tgt = ids.get((fe.get(F.XLINK_HREF) or fe.get('href') or '')[1:])
                    if tgt is None:
                        continue
                    fctm = F._matmul(ctm, F.parse_transform('translate(%s,%s)' % (fe.get('x', 0), fe.get('y', 0))))
                    walk(tgt, fctm, last, depth + 1)
        mk = el.get('mask')
        if mk and '#' in mk and mk[mk.find('#') + 1:mk.find(')')] in rasters:
            hits.append((mk, key(ctm)))
        if F._tag(el) == 'use':
            tgt = ids.get((el.get(F.XLINK_HREF) or el.get('href') or '')[1:])
            if tgt is not None and F._tag(tgt) != 'image':
                walk(tgt, ctm, last, depth + 1)
            return
        for ch in el:
            if F._tag(ch) in ('defs', 'clipPath', 'mask', 'filter', 'image'):
                continue
            walk(ch, ctm, last, depth + 1)
    I = [[1.0, 0, 0], [0, 1.0, 0], [0, 0, 1.0]]
    for ch in root:
        if F._tag(ch) != 'defs':
            walk(ch, I, None, 0)
    return dict(file=Path(path).name, states=len(states), hits=len(hits),
                distinct_hit_keys=len(set(hits)), max_depth=maxd[0], s=round(time.time() - t0, 2))

if __name__ == '__main__':
    for p in sys.argv[1:]:
        print(probe(p), flush=True)
    print('DONE', flush=True)
