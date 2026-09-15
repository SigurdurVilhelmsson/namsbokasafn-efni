"""For each collapsed add filter, find every CTM its use site is reached with (through children,
use, mask content and feImage element references) and test whether the filter subregion covers
the whole viewport in root user space.  If it does, the anti-aliased boundary of Ma/Mb (the only
place the lerp and the bare blend can differ) lies outside the picture at every scale.

usage: srwalk.py <svg> <lerpcollapse report.json>
"""
import sys, re, json
import xml.etree.ElementTree as ET
sys.setrecursionlimit(100000)
SVG = '{http://www.w3.org/2000/svg}'
XL = '{http://www.w3.org/1999/xlink}href'


def tag(e):
    return e.tag[len(SVG):] if e.tag.startswith(SVG) else e.tag


def mul(m, n):
    a, b, c, d, e, f = m
    A, B, C, D, E, F = n
    return (a * A + c * B, b * A + d * B, a * C + c * D, b * C + d * D, a * E + c * F + e, b * E + d * F + f)


def parse_tr(t):
    m = (1, 0, 0, 1, 0, 0)
    if not t:
        return m
    for name, args in re.findall(r'(\w+)\s*\(([^)]*)\)', t):
        v = [float(x) for x in re.split(r'[\s,]+', args.strip()) if x]
        if name == 'translate':
            n = (1, 0, 0, 1, v[0], v[1] if len(v) > 1 else 0)
        elif name == 'matrix':
            n = tuple(v)
        elif name == 'scale':
            n = (v[0], 0, 0, v[1] if len(v) > 1 else v[0], 0, 0)
        else:
            raise SystemExit('unsupported transform ' + name)
        m = mul(m, n)
    return m


def key(m):
    return tuple(round(x, 6) for x in m)


def urlref(v):
    mm = re.fullmatch(r'\s*url\(#([^)]+)\)\s*', v or '')
    return mm.group(1) if mm else None


def main():
    svgp, repp = sys.argv[1], sys.argv[2]
    root = ET.parse(svgp).getroot()
    vb = [float(x) for x in root.get('viewBox').split()]
    ids = {e.get('id'): e for e in root.iter() if e.get('id') is not None}
    rep = json.load(open(repp))
    coll = set(rep['collapsedIds'])
    srs = {}
    for fid in coll:
        fe = ids[fid][0]
        srs[fid] = tuple(float(fe.get(k)) for k in ('x', 'y', 'width', 'height'))
    seen = set()
    hits = {}   # fid -> set of ctm keys
    SKIP = {'defs', 'clipPath', 'linearGradient', 'radialGradient', 'pattern', 'filter', 'style', 'mask', 'symbol', 'title', 'desc', 'metadata'}
    stack = []

    def visit(e, ctm):
        k = (id(e), key(ctm))
        if k in seen:
            return
        seen.add(k)
        local = mul(ctm, parse_tr(e.get('transform')))
        t = tag(e)
        f = urlref(e.get('filter'))
        if f and f in ids:
            if f in coll:
                hits.setdefault(f, set()).add(key(local))
            for fe in ids[f]:
                if tag(fe) == 'feImage':
                    h = (fe.get(XL) or '')[1:]
                    if h in ids:
                        stack.append((ids[h], local))
        mk = urlref(e.get('mask'))
        if mk and mk in ids:
            for ch in ids[mk]:
                stack.append((ch, local))
        if t == 'use':
            h = (e.get(XL) or e.get('href') or '')[1:]
            if h in ids:
                ul = mul(local, (1, 0, 0, 1, float(e.get('x', 0)), float(e.get('y', 0))))
                stack.append((ids[h], ul))
        for ch in e:
            if tag(ch) in SKIP:
                continue
            stack.append((ch, local))

    for ch in root:
        if tag(ch) in SKIP:
            continue
        stack.append((ch, (1, 0, 0, 1, 0, 0)))
    while stack:
        e, c = stack.pop()
        visit(e, c)
    out = {'viewBox': vb, 'visitedPairs': len(seen), 'collapsed': len(coll), 'reached': len(hits), 'notReached': sorted(coll - set(hits)),
           'coverViewport': 0, 'boundaryInside': []}
    x0, y0, w, h = vb
    for fid, ctms in hits.items():
        sx, sy, sw, sh = srs[fid]
        for m in ctms:
            pts = [(m[0] * px + m[2] * py + m[4], m[1] * px + m[3] * py + m[5]) for px, py in
                   ((sx, sy), (sx + sw, sy), (sx, sy + sh), (sx + sw, sy + sh))]
            axis_aligned = abs(m[1]) < 1e-12 and abs(m[2]) < 1e-12
            bx0, bx1 = min(p[0] for p in pts), max(p[0] for p in pts)
            by0, by1 = min(p[1] for p in pts), max(p[1] for p in pts)
            if axis_aligned and bx0 <= x0 and by0 <= y0 and bx1 >= x0 + w and by1 >= y0 + h:
                out['coverViewport'] += 1
            else:
                out['boundaryInside'].append({'f': fid, 'ctm': m, 'box': (bx0, by0, bx1, by1)})
    out['ctmPairsChecked'] = sum(len(v) for v in hits.values())
    out['distinctCtmsPerFilterMax'] = max((len(v) for v in hits.values()), default=0)
    print(json.dumps(out)[:3000])


main()
