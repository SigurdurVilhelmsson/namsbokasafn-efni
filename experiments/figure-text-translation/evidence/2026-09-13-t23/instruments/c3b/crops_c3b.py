#!/usr/bin/env python3
"""Crops and contact sheets (visual evidence; the instrument is layout-only).

crops/<basename>__bNN.png   panels left->right: SOURCE | V0 | BEST (plain), then the same three with overlay
                            (green = source block frame, red = drawn line advance boxes, blue = census container
                            box for BOUNDED / free box for OPEN). Same pixel rect in every panel = union of all boxes.
contact/<basename>.png      full figure, stacked: SOURCE, V0, V1, V2, V3, V3L (each labelled).
usage: crops_c3b.py BEST
"""
import json, sys, math
sys.path.insert(0, '/home/siggi/dev/scratch-c140/c3b/scripts')
from c3lib import *
from PIL import ImageDraw

BEST = sys.argv[1]
VS = ['V0', 'V1', 'V2', 'V3', 'V3L']
A = json.loads((C3B / 'analysis.json').read_text())
CEN = json.loads((C3B / 'census.json').read_text())
ROWS = {(r['basename'], r['block']): r for r in map(json.loads, open(C3 / 'blocks.jsonl'))}
UF = json.loads((C3 / 'userflags.json').read_text())
msurf = cairo.ImageSurface(cairo.FORMAT_A8, 8, 8); mctx = cairo.Context(msurf)
(C3B / 'crops').mkdir(exist_ok=True); (C3B / 'contact').mkdir(exist_ok=True)

extra = set()
for V in ('V3', 'V3L'):
    for nm in ('census', 'offpage', 'spill', 'shrunk'):
        extra |= set(A['per_variant'][V]['transitions'][nm]['broken'])
WIDE = ['03_01_saltMass b10', '03_01_alsulfatemass_img b13', '03_01_aspirin b13', '03_01_chloroform b13', '03_01_glycinemass_img b13',
        '03_01_brain-ec0b b0', '04_03_map3_img b0']
targets = {}
for k in UF:
    b, bi = k.rsplit('#', 1); targets[(b, int(bi))] = 'flag'
for s in list(extra) + WIDE:
    fig_short, bi = s.rsplit(' b', 1)
    targets.setdefault(('CNX_Chem_' + fig_short, int(bi)), 'extra')


def poly(fig, a0, a1, n0, n1, rot):
    t = math.radians(rot); pts = []
    for a, n in ((a0, n0), (a1, n0), (a1, n1), (a0, n1)):
        x = a * math.cos(t) - n * math.sin(t); y = a * math.sin(t) + n * math.cos(t)
        pts.append((x * S, (fig.H - y) * S))
    return pts


def drawn_polys(fig, bi):
    out = []
    for it in fig.block_items(bi):
        w = measure_adv(mctx, it['text'], it['size'], it['bold'])
        t = math.radians(it['rot'])
        a = it['x'] * math.cos(t) + it['y'] * math.sin(t); n = -it['x'] * math.sin(t) + it['y'] * math.cos(t)
        out.append(poly(fig, a, a + w, n - DESC * it['size'], n + ASC * it['size'], it['rot']))
    return out


figs = {}
def F(b, V):
    if (b, V) not in figs:
        figs[(b, V)] = Fig(b, items_dir=C3B / 'work' / V, diag_dir=C3B / 'work' / V)
    return figs[(b, V)]


made = 0
for (b, bi), why in sorted(targets.items()):
    f0 = F(b, 'V0'); fb = F(b, BEST)
    r = ROWS[(b, bi)]; fr = r['src']['frame']; ce = CEN[f'{b}#{bi}']
    green = poly(f0, fr['a0'], fr['a1'], fr['n0'], fr['n1'], fr['rot'])
    box = (ce['L'], ce['R'], ce['D'], ce['U']) if ce['cls'] == 'BOUNDED' else (ce['FL'], ce['FR'], ce['FD'], ce['FU'])
    blue = poly(f0, box[0], box[1], box[2], box[3], fr['rot'])
    red0 = drawn_polys(f0, bi); redb = drawn_polys(fb, bi)
    allp = green + [p for pl in red0 + redb for p in pl]
    # clamp the blue box's contribution (open free boxes can be page-wide)
    xs = [p[0] for p in allp]; ys = [p[1] for p in allp]
    pad = 14 * S
    x0 = max(0, int(min(xs) - pad)); y0 = max(0, int(min(ys) - pad)); x1 = min(f0.w, int(max(xs) + pad)); y1 = min(f0.h, int(max(ys) + pad))
    if ce['cls'] == 'BOUNDED':
        bx = [p[0] for p in blue]; by = [p[1] for p in blue]
        x0 = max(0, min(x0, int(min(bx) - 6))); y0 = max(0, min(y0, int(min(by) - 6)))
        x1 = min(f0.w, max(x1, int(max(bx) + 6))); y1 = min(f0.h, max(y1, int(max(by) + 6)))
    crop = (x0, y0, x1, y1); cw, ch = x1 - x0, y1 - y0
    imgs = [Image.open(f0.d / 'source.png').convert('RGB'), Image.open(C3B / 'work/V0' / b / 'translated.png').convert('RGB'),
            Image.open(C3B / 'work' / BEST / b / 'translated.png').convert('RGB')]
    labels = ['SOURCE', 'V0 (current)', f'{BEST}']
    reds = [[], red0, redb]
    head = 14
    canvas = Image.new('RGB', (cw * 3 + 16, (ch + head) * 2 + 8), (255, 255, 255))
    dr = ImageDraw.Draw(canvas)
    for i, im in enumerate(imgs):
        pl = im.crop(crop)
        canvas.paste(pl, (i * (cw + 8), head))
        dr.text((i * (cw + 8) + 2, 1), labels[i], fill=(0, 0, 0))
        ov = pl.copy(); d2 = ImageDraw.Draw(ov)
        d2.polygon([(x - x0, y - y0) for x, y in blue], outline=(0, 0, 255))
        d2.polygon([(x - x0, y - y0) for x, y in green], outline=(0, 160, 0))
        for p in reds[i]:
            d2.polygon([(x - x0, y - y0) for x, y in p], outline=(255, 0, 0))
        canvas.paste(ov, (i * (cw + 8), 2 * head + ch + 8))
        dr.text((i * (cw + 8) + 2, head + ch + 8), labels[i] + ' + overlay', fill=(0, 0, 0))
    if canvas.width < 900:
        canvas = canvas.resize((canvas.width * 2, canvas.height * 2), Image.NEAREST)
    canvas.save(C3B / 'crops' / f'{b}__b{bi:02d}.png'); made += 1
print('crops', made, 'targets', len(targets), 'flagged', sum(1 for v in targets.values() if v == 'flag'))

# contact sheets
for b in names():
    base = PREP / 'figs' / b
    ims = [('SOURCE', Image.open(base / 'source.png').convert('RGB'))] + \
          [(V, Image.open(C3B / 'work' / V / b / 'translated.png').convert('RGB')) for V in VS]
    w = ims[0][1].width; h = ims[0][1].height
    scale = min(1.0, 1300 / w)
    sw, shh = int(w * scale), int(h * scale)
    sheet = Image.new('RGB', (sw, (shh + 16) * len(ims)), (255, 255, 255))
    dr = ImageDraw.Draw(sheet)
    for i, (lab, im) in enumerate(ims):
        sheet.paste(im.resize((sw, shh)) if scale != 1 else im, (0, i * (shh + 16) + 16))
        dr.text((3, i * (shh + 16) + 2), lab + (f'  (BEST by pre-registered rule)' if lab == BEST else ''), fill=(200, 0, 0))
    sheet.save(C3B / 'contact' / f'{b}.png')
print('contact sheets', len(names()))
