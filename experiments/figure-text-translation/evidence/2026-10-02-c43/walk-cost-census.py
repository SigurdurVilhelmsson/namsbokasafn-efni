#!/usr/bin/env python3
"""§C140 ㊸ census (read-only, scratch): predict find_candidates' walk cost per file.

Mirrors figrings.find_candidates' traversal rules exactly (filter→feImage targets,
mask check, `use` → its non-image target and NO children, otherwise children minus
defs/clipPath/mask/filter/image; root's non-defs children), but COUNTS visits with a
memo instead of walking every path. Prints one JSON line per file, then a DONE marker.
"""
import json, re, sys, time
import xml.etree.ElementTree as ET
from pathlib import Path

sys.setrecursionlimit(100000)
SVG = 'http://www.w3.org/2000/svg'
XL = '{http://www.w3.org/1999/xlink}href'
SKIP = ('defs', 'clipPath', 'mask', 'filter', 'image')

def tag(e):
    return e.tag.rsplit('}', 1)[-1]

def census(path):
    t0 = time.time()
    text = path.read_text(encoding='utf-8')
    root = ET.fromstring(text)
    t_parse = time.time() - t0
    ids = {e.get('id'): e for e in root.iter() if e.get('id')}
    rasters = set()
    n_masks = 0
    for m in root.iter('{%s}mask' % SVG):
        n_masks += 1
        for u in m.iter('{%s}use' % SVG):
            el = ids.get((u.get(XL) or u.get('href') or '')[1:])
            if el is not None and tag(el) == 'image':
                rasters.add(m.get('id'))
    n_use = sum(1 for e in root.iter('{%s}use' % SVG))

    def edges(el):
        out = []
        flt = el.get('filter')
        if flt and flt.startswith('url('):
            fel = ids.get(flt[flt.find('#') + 1:flt.find(')')])
            if fel is not None and tag(fel) == 'filter':
                for fe in fel:
                    if tag(fe) == 'feImage':
                        tgt = ids.get((fe.get(XL) or fe.get('href') or '')[1:])
                        if tgt is not None:
                            out.append(tgt)
        if tag(el) == 'use':
            tgt = ids.get((el.get(XL) or el.get('href') or '')[1:])
            if tgt is not None and tag(tgt) != 'image':
                out.append(tgt)
            return out
        out.extend(ch for ch in el if tag(ch) not in SKIP)
        return out

    def masked(el):
        mk = el.get('mask')
        return bool(mk and '#' in mk and mk[mk.find('#') + 1:mk.find(')')] in rasters)

    cost, prod, busy = {}, {}, set()
    cyc = [0]
    def visit(el):
        k = id(el)
        if k in cost:
            return cost[k], prod[k]
        if k in busy:
            cyc[0] += 1
            return 0, False
        busy.add(k)
        c, p = 1, masked(el)
        for t in edges(el):
            cc, pp = visit(t)
            c += cc
            p = p or pp
        busy.discard(k)
        cost[k], prod[k] = c, p
        return c, p

    total = 0
    productive_cost = 0
    for ch in root:
        if tag(ch) == 'defs':
            continue
        c, p = visit(ch)
        total += c

    # pruned cost: visits that a "skip non-productive subtrees" walk would still make
    pmemo = {}
    def pvisit(el):
        k = id(el)
        if k in pmemo:
            return pmemo[k]
        if not prod.get(k):
            pmemo[k] = 0
            return 0
        c = 1 + sum(pvisit(t) for t in edges(el))
        pmemo[k] = c
        return c
    for ch in root:
        if tag(ch) != 'defs':
            productive_cost += pvisit(ch)

    return dict(file=path.name, mb=round(path.stat().st_size / 2**20, 2),
                elements=len(cost), masks=n_masks, rasters=len(rasters), uses=n_use,
                walk_visits=total, pruned_visits=productive_cost, cycles=cyc[0],
                parse_s=round(t_parse, 2), census_s=round(time.time() - t0, 2))

if __name__ == '__main__':
    media = Path(sys.argv[1])
    files = sorted(media.glob('*_IS.svg'))
    print(json.dumps({'files': len(files)}), flush=True)
    for p in files:
        try:
            print(json.dumps(census(p)), flush=True)
        except Exception as e:  # noqa: BLE001
            print(json.dumps({'file': p.name, 'error': repr(e)[:200]}), flush=True)
    print('DONE', flush=True)
