"""Scratch: production-shaped classifier with per-side inset. classify(page, frame) -> (cls, inner(L,D,R,U) or None, why)."""
import json, sys, collections, math, statistics
sys.path.insert(0, '/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation')
sys.path.insert(0, '/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/pylibs')
import pdfplumber
import figtext as FT
ASC, DESC = 0.73, 0.21
TOL = 0.5; SPAN = 1.0; AREA_MAX = 0.25; EDGE = 0.25; MIN_RULE = 1.0

def frame(block):
    rot = block[0]['rot']; t = math.radians(rot)
    a0 = min(FT.along(r) for r in block); a1 = max(FT.along(r) + r['adv'] for r in block)
    n0 = min(FT.proj(r) - DESC * r['size'] for r in block); n1 = max(FT.proj(r) + ASC * r['size'] for r in block)
    pts = [(a * math.cos(t) - n * math.sin(t), a * math.sin(t) + n * math.cos(t)) for a in (a0, a1) for n in (n0, n1)]
    return (min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts))

def closed(o):
    if o['object_type'] == 'rect':
        return True
    path = o.get('path') or []
    if path and path[-1][0] == 'h':
        return True
    pts = o.get('pts') or []
    return len(pts) > 2 and abs(pts[0][0] - pts[-1][0]) < 0.01 and abs(pts[0][1] - pts[-1][1]) < 0.01

def classify(page, fr):
    W, H = float(page.width), float(page.height); parea = W * H
    area = lambda bb: (bb[2] - bb[0]) * (bb[3] - bb[1])
    edge = lambda bb: bb[0] <= EDGE or bb[1] <= EDGE or bb[2] >= W - EDGE or bb[3] >= H - EDGE
    enc = lambda bb: bb[0] <= fr[0] + TOL and bb[2] >= fr[2] - TOL and bb[1] <= fr[1] + TOL and bb[3] >= fr[3] - TOL
    cands = []
    objs = list(page.rects) + list(page.curves)
    for o in objs:
        bb = (o['x0'], o['y0'], o['x1'], o['y1'])
        if not enc(bb) or area(bb) >= AREA_MAX * parea or edge(bb):
            continue
        if o.get('stroke') and closed(o):
            h = max(o.get('linewidth') or 0.0, MIN_RULE) / 2
            cands.append(('box', area(bb), (bb[0] + h, bb[1] + h, bb[2] - h, bb[3] - h), 'stroked-closed'))
        elif o.get('fill') and not o.get('stroke') and o['object_type'] == 'rect':
            cands.append(('cell', area(bb), bb, 'fill-rect'))
    segs = []   # (x0, y0, x1, y1, owner, half-thickness)
    for o in page.lines:
        segs.append((min(o['x0'], o['x1']), min(o['y0'], o['y1']), max(o['x0'], o['x1']), max(o['y0'], o['y1']),
                     id(o), max(o.get('linewidth') or 0.0, MIN_RULE) / 2))
    for o in objs:
        x0, y0, x1, y1 = o['x0'], o['y0'], o['x1'], o['y1']
        if o['object_type'] == 'rect' and ((x1 - x0) < 1.0 or (y1 - y0) < 1.0):
            h = max(min(x1 - x0, y1 - y0), MIN_RULE) / 2
            segs.append(((x0 + x1) / 2 if x1 - x0 < 1.0 else x0, (y0 + y1) / 2 if y1 - y0 < 1.0 else y0,
                         (x0 + x1) / 2 if x1 - x0 < 1.0 else x1, (y0 + y1) / 2 if y1 - y0 < 1.0 else y1, id(o), h))
        elif o.get('stroke') and closed(o):
            h = max(o.get('linewidth') or 0.0, MIN_RULE) / 2
            segs += [(x0, y0, x0, y1, id(o), h), (x1, y0, x1, y1, id(o), h), (x0, y0, x1, y0, id(o), h), (x0, y1, x1, y1, id(o), h)]
    cx, cy = (fr[0] + fr[2]) / 2, (fr[1] + fr[3]) / 2
    V = [s for s in segs if s[2] - s[0] < 1.0 and s[1] <= cy <= s[3]]
    Hh = [s for s in segs if s[3] - s[1] < 1.0 and s[0] <= cx <= s[2]]
    L = max((s for s in V if s[2] <= fr[0] + TOL), key=lambda s: s[0], default=None)
    R = min((s for s in V if s[0] >= fr[2] - TOL), key=lambda s: s[0], default=None)
    D = max((s for s in Hh if s[3] <= fr[1] + TOL), key=lambda s: s[1], default=None)
    U = min((s for s in Hh if s[1] >= fr[3] - TOL), key=lambda s: s[1], default=None)
    if None not in (L, R, D, U):
        bb = ((L[0] + L[2]) / 2, (D[1] + D[3]) / 2, (R[0] + R[2]) / 2, (U[1] + U[3]) / 2)
        spans = (all(s[1] <= bb[1] + SPAN and s[3] >= bb[3] - SPAN for s in (L, R))
                 and all(s[0] <= bb[0] + SPAN and s[2] >= bb[2] - SPAN for s in (D, U)))
        if spans and area(bb) < AREA_MAX * parea and not edge(bb) and len({L[4], R[4], D[4], U[4]}) > 1:
            cands.append(('cell', area(bb), (bb[0] + L[5], bb[1] + D[5], bb[2] - R[5], bb[3] - U[5]), 'rules'))
    if not cands:
        return 'open', None, None
    k, _, inner, why = min(cands, key=lambda c: (c[1], 0 if c[0] == 'box' else 1))
    return k, inner, why

if __name__ == '__main__':
    PREP = '/home/siggi/dev/scratch-c140/prep/figs/'
    rows = [json.loads(l) for l in open('/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/evidence/2026-09-13-t23/data/c3-blocks.jsonl')]
    cen = json.load(open('/home/siggi/dev/scratch-c140/r2/census.json'))
    truth = lambda r: 'open' if r['container']['final'] == 'OPEN' else ('box' if (r['container']['dark'] == 'BOUNDED' and not r['container']['textured']) else 'cell')
    conf = collections.Counter(); dev = collections.defaultdict(list); worst = []
    byfig = collections.defaultdict(list)
    for r in rows: byfig[r['basename']].append(r)
    for b, rs in byfig.items():
        blocks = FT.merge_blocks(FT.group(json.load(open(PREP + b + '/runs.json'))))
        with pdfplumber.open(PREP + b + '/artwork.pdf') as pdf:
            p = pdf.pages[0]
            for r in rs:
                k, inner, why = classify(p, frame(blocks[r['block']]))
                conf[(truth(r), k)] += 1
                if inner:
                    e = cen[f"{b}#{r['block']}"]
                    d = (inner[0] - e['L'], inner[2] - e['R'], inner[1] - e['D'], inner[3] - e['U'])
                    for n, x in zip('LRDU', d): dev[(k, why, n)].append(x)
                    worst.append((round(max(abs(x) for x in d), 3), b, r['block'], r['key'], k, why, [round(x, 2) for x in d]))
    print(conf)
    print({k: (round(min(v), 2), round(statistics.median(v), 2), round(max(v), 2), len(v)) for k, v in sorted(dev.items())})
    worst.sort(reverse=True)
    print('max |dev|', worst[0][0], 'n>0.25:', sum(w[0] > 0.25 for w in worst), 'n>0.5:', sum(w[0] > 0.5 for w in worst))
    for w in worst[:8]: print(w)
