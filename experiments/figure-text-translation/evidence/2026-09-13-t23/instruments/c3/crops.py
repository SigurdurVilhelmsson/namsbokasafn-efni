#!/usr/bin/env python3
"""Crops per layout block: SOURCE (top) / TRANSLATED (middle) / TRANSLATED + overlay (bottom).
Overlay: blue = container (raster colour region bbox if BOUNDED), green = source block frame,
red = drawn line advance boxes. Same pixel rect in all three panels.
usage: crops.py <basename> [<basename> ...]   (all layout blocks of each)"""
import json, sys, math
sys.path.insert(0, '/home/siggi/dev/scratch-c140/c3/scripts')
from c3lib import *
from PIL import ImageDraw

ROWS = {(r['basename'], r['block']): r for r in map(json.loads, open(C3 / 'blocks.jsonl'))}
OUTD = C3 / 'crops'; OUTD.mkdir(exist_ok=True)
msurf = cairo.ImageSurface(cairo.FORMAT_A8, 8, 8); mctx = cairo.Context(msurf)


def poly_px(fig, a0, a1, n0, n1, rot):
    t = math.radians(rot); pts = []
    for a, n in ((a0, n0), (a1, n0), (a1, n1), (a0, n1)):
        x = a * math.cos(t) - n * math.sin(t); y = a * math.sin(t) + n * math.cos(t)
        pts.append((x * S, (fig.H - y) * S))
    return pts


for b in sys.argv[1:]:
    fig = Fig(b)
    src = Image.open(fig.d / 'source.png').convert('RGB')
    tr = Image.open(fig.d / 'translated.png').convert('RGB')
    for bi in fig.layout_blocks():
        r = ROWS[(b, bi)]
        fr = r['src']['frame']
        polys = [('green', poly_px(fig, fr['a0'], fr['a1'], fr['n0'], fr['n1'], fr['rot']))]
        for it in fig.block_items(bi):
            w = measure_adv(mctx, it['text'], it['size'], it['bold'])
            t = math.radians(it['rot'])
            a = it['x'] * math.cos(t) + it['y'] * math.sin(t); n = -it['x'] * math.sin(t) + it['y'] * math.cos(t)
            polys.append(('red', poly_px(fig, a, a + w, n - DESC * it['size'], n + ASC * it['size'], it['rot'])))
        c = r['container']
        if c['final'] == 'BOUNDED' and c['region_bbox_pt'] and not c['textured']:
            x0, y0, x1, y1 = c['region_bbox_pt']
            polys.append(('blue', [(x0 * S, (fig.H - y0) * S), (x1 * S, (fig.H - y0) * S), (x1 * S, (fig.H - y1) * S), (x0 * S, (fig.H - y1) * S)]))
        xs = [p[0] for _, pl in polys for p in pl]; ys = [p[1] for _, pl in polys for p in pl]
        pad = 14 * S
        box = (max(0, int(min(xs) - pad)), max(0, int(min(ys) - pad)), min(fig.w, int(max(xs) + pad)), min(fig.h, int(max(ys) + pad)))
        cw, ch = box[2] - box[0], box[3] - box[1]
        scale = 2 if cw < 400 else 1
        panels = [src.crop(box), tr.crop(box), tr.crop(box).copy()]
        dr = ImageDraw.Draw(panels[2])
        for col, pl in polys:
            dr.polygon([(x - box[0], y - box[1]) for x, y in pl], outline=col)
        canvas = Image.new('RGB', (cw, ch * 3 + 8), (255, 255, 255))
        for k, p in enumerate(panels):
            canvas.paste(p, (0, k * (ch + 4)))
        if scale != 1:
            canvas = canvas.resize((cw * scale, (ch * 3 + 8) * scale), Image.NEAREST)
        name = f"{b}__b{bi:02d}.png"
        canvas.save(OUTD / name)
    print(b, len(fig.layout_blocks()), flush=True)
