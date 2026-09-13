#!/usr/bin/env python3
"""Crops + contact sheets for the recommended-by-brief cell (V5_p2.0_f7.5_dec). Adapted from
c3b/scripts/crops_c3b.py (same panel geometry and overlay colours; panels SOURCE | V0 | V5, and the same
three with overlay: green = source block frame, red = drawn item advance boxes, blue = census container
(box/cell) or free box (open)).  An optional 4th panel (ALT) is added for the blocks whose drawing differs
between F 7.0 and F 7.5, so the floor choice can be judged by eye.

crops/<basename>__bNN.png   contact/<basename>.png (SOURCE / V0 / V5, full figure)
"""
import json, sys, math
sys.dont_write_bytecode = True
sys.path.insert(0, '/home/siggi/dev/scratch-c140/c3b/scripts')
from c3lib import *
from PIL import ImageDraw

R2 = Path('/home/siggi/dev/scratch-c140/r2')
BEST = 'V5_p2.0_f7.5_dec'; ALT = 'V5_p2.0_f7.0'
A = json.loads((R2 / 'analysis.json').read_text())
CEN = json.loads((R2 / 'census.json').read_text())
ROWS = {(r['basename'], r['block']): r for r in map(json.loads, open(C3 / 'blocks.jsonl'))}
UF = json.loads((C3 / 'userflags.json').read_text())
msurf = cairo.ImageSurface(cairo.FORMAT_A8, 8, 8); mctx = cairo.Context(msurf)
(R2 / 'crops').mkdir(exist_ok=True); (R2 / 'contact').mkdir(exist_ok=True)

P = A['per_tag']['V5_p2.0_f7.5']
why = {}
def add(s, w):
    fig_short, bi = s.rsplit(' b', 1)
    why.setdefault(('CNX_Chem_' + fig_short, int(bi)), []).append(w)
for k in UF:
    b, bi = k.rsplit('#', 1); why.setdefault((b, int(bi)), []).append('flag')
for nm, t in P['transitions'].items():
    for s in t['broken']:
        add(s, f'broken-{nm}')
    for s in t.get('worsened', []):
        add(s[0], f'worsened-{nm}')
for o in P['overflow']:
    add(f"{o['basename']} b{o['block']}", 'overflow')
for s, size, z in P['below_8_5']:
    add(s, f'below8.5({size})')
FDIFF = ['03_03_empform b8', '04_03_flowchart b13', '04_03_flowchart b14', '04_05_combmap_img b8']
for s in FDIFF:
    add(s, 'F7.0-vs-F7.5')
for x in json.loads((R2 / 'sentinels-V5_p2.0_f7.5_dec.json').read_text())['cell']['displaced']:
    add(x[0], 'cell-displaced')


def poly(fig, a0, a1, n0, n1, rot):
    t = math.radians(rot); pts = []
    for a, n in ((a0, n0), (a1, n0), (a1, n1), (a0, n1)):
        x = a * math.cos(t) - n * math.sin(t); y = a * math.sin(t) + n * math.cos(t)
        pts.append((x * S, (fig.H - y) * S))
    return pts


def drawn_polys(fig, bi):
    out = []
    for it in fig.block_items(bi):
        w = measure_adv(mctx, it['text'], it['size'], it['bold'], it['italic'])
        t = math.radians(it['rot'])
        a = it['x'] * math.cos(t) + it['y'] * math.sin(t); n = -it['x'] * math.sin(t) + it['y'] * math.cos(t)
        out.append(poly(fig, a, a + w, n - DESC * it['size'], n + ASC * it['size'], it['rot']))
    return out


figs = {}
def F(b, V):
    if (b, V) not in figs:
        figs[(b, V)] = Fig(b, items_dir=R2 / 'work' / V, diag_dir=R2 / 'work' / V)
    return figs[(b, V)]


made = []
for (b, bi), ws in sorted(why.items()):
    extra = 'F7.0-vs-F7.5' in ws
    tags = ['V0', BEST] + ([ALT] if extra else [])
    f0 = F(b, 'V0'); fs = [F(b, T) for T in tags]
    r = ROWS[(b, bi)]; fr = r['src']['frame']; ce = CEN[f'{b}#{bi}']
    green = poly(f0, fr['a0'], fr['a1'], fr['n0'], fr['n1'], fr['rot'])
    box = (ce['L'], ce['R'], ce['D'], ce['U']) if ce['r2cls'] in ('box', 'cell') else (ce['FL'], ce['FR'], ce['FD'], ce['FU'])
    blue = poly(f0, box[0], box[1], box[2], box[3], fr['rot'])
    reds = [[]] + [drawn_polys(f, bi) for f in fs]
    allp = green + [p for rl in reds for pl in rl for p in pl]
    xs = [p[0] for p in allp]; ys = [p[1] for p in allp]
    pad = 14 * S
    x0 = max(0, int(min(xs) - pad)); y0 = max(0, int(min(ys) - pad)); x1 = min(f0.w, int(max(xs) + pad)); y1 = min(f0.h, int(max(ys) + pad))
    if ce['r2cls'] in ('box', 'cell'):
        bx = [p[0] for p in blue]; by = [p[1] for p in blue]
        x0 = max(0, min(x0, int(min(bx) - 6))); y0 = max(0, min(y0, int(min(by) - 6)))
        x1 = min(f0.w, max(x1, int(max(bx) + 6))); y1 = min(f0.h, max(y1, int(max(by) + 6)))
    x1 = max(x1, x0 + 10); y1 = max(y1, y0 + 10)
    crop = (x0, y0, x1, y1); cw, ch = x1 - x0, y1 - y0
    imgs = [Image.open(f0.d / 'source.png').convert('RGB')] + [Image.open(R2 / 'work' / T / b / 'translated.png').convert('RGB') for T in tags]
    labels = ['SOURCE', 'V0 (E composer)', 'V5 PAD2.0 F7.5 dec'] + (['ALT V5 PAD2.0 F7.0'] if extra else [])
    head = 14; npan = len(imgs)
    canvas = Image.new('RGB', (cw * npan + 8 * (npan - 1), (ch + head) * 2 + 8 + 14), (255, 255, 255))
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
    dr.text((2, canvas.height - 13), f"{b.replace('CNX_Chem_', '')} b{bi} [{ce['r2cls']}] " + ', '.join(sorted(set(ws))), fill=(160, 0, 0))
    if canvas.width < 900:
        canvas = canvas.resize((canvas.width * 2, canvas.height * 2), Image.NEAREST)
    fn = R2 / 'crops' / f'{b}__b{bi:02d}.png'
    canvas.save(fn); made.append((fn.name, sorted(set(ws))))
(R2 / 'crops' / 'INDEX.json').write_text(json.dumps(made, indent=1))
print('crops', len(made), 'flagged', sum(1 for _, w in made if 'flag' in w))

for b in names():
    base = PREP / 'figs' / b
    ims = [('SOURCE', Image.open(base / 'source.png').convert('RGB')),
           ('V0 (E composer)', Image.open(R2 / 'work/V0' / b / 'translated.png').convert('RGB')),
           ('V5 PAD 2.0 F 7.5 decimal on', Image.open(R2 / 'work' / BEST / b / 'translated.png').convert('RGB'))]
    w = ims[0][1].width; h = ims[0][1].height
    scale = min(1.0, 1300 / w)
    sw, shh = int(w * scale), int(h * scale)
    sheet = Image.new('RGB', (sw, (shh + 16) * len(ims)), (255, 255, 255))
    dr = ImageDraw.Draw(sheet)
    for i, (lab, im) in enumerate(ims):
        sheet.paste(im.resize((sw, shh)) if scale != 1 else im, (0, i * (shh + 16) + 16))
        dr.text((3, i * (shh + 16) + 2), lab, fill=(200, 0, 0))
    sheet.save(R2 / 'contact' / f'{b}.png')
print('contact sheets', len(names()))
