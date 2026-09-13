"""Pixel measures per block, all at 200 dpi, same rasteriser (pdftocairo) for source and artwork.

  visible_src_px : px inside the block's SOURCE glyph boxes where source raster differs from the
                   stripped artwork (max channel diff > 60)  -> did the source text show at all?
  box_px         : area of those boxes
  ctl_xor_px     : dark-mask XOR between source raster and control.png (--control: English re-laid)
                   inside union(source glyph boxes, drawn line boxes), both dilated 1pt.
Per figure:
  outside_diff_px: px OUTSIDE every source glyph box (dilated 2pt) where source raster and stripped
                   artwork differ (max channel diff > 60) -> did stripping change non-text artwork?
"""
import json, sys, math
from pathlib import Path
sys.path.insert(0, '/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/pylibs')
from PIL import Image, ImageChops

S = Path(sys.argv[1]); names = sys.argv[2].split(',') if len(sys.argv) > 2 else (S / 'prep/bought.txt').read_text().split()
OUTF = S / '1d/data/pixel.jsonl'
done = set()
if OUTF.exists():
    done = {json.loads(l)['fig'] for l in OUTF.read_text().splitlines() if l.strip()}
k = 200 / 72.0
sys.path.insert(0, str(S / '1d'))
ASC, DESC = 0.73, 0.21
from fontTools.ttLib import TTFont
_F = {}
for _w in ('Regular', 'Bold'):
    _t = TTFont(f'/usr/share/fonts/truetype/liberation/LiberationSans-{_w}.ttf')
    _F[_w == 'Bold'] = (_t.getBestCmap(), _t['hmtx'].metrics)


def spans(text, x0, total, bold):
    cmap, hmtx = _F[bool(bold)]
    adv = [hmtx[cmap[ord(c)]][0] if ord(c) in cmap else 500 for c in text]
    s = sum(adv) or 1; out = []; x = x0
    for c, a in zip(text, adv):
        w = total * a / s
        if not c.isspace():
            out.append((x, x + w))
        x += w
    return out


for n in names:
    if n in done:
        print('skip', n); continue
    D = json.loads((S / '1d/work' / n / 'diag-control.json').read_text())
    Wpt, H = D['page']
    src = Image.open(S / '1d/src' / f'{n}.png').convert('RGB')
    art = Image.open(S / '1d/work' / n / 'artwork.png').convert('RGB')
    ctl = Image.open(S / '1d/work' / n / 'control.png').convert('RGB')
    if src.size != art.size or src.size != ctl.size:
        print('SIZE MISMATCH', n, src.size, art.size, ctl.size)
    w, h = src.size
    diff = ImageChops.difference(src, art).convert('L')          # max-ish channel diff proxy (luma of diff)
    dpx = diff.load()
    sd = src.convert('L').point(lambda v: 255 if v < 128 else 0)
    cd = ctl.convert('L').point(lambda v: 255 if v < 128 else 0)
    xor = ImageChops.difference(sd, cd).load()

    def rect(x0, x1, y0, y1, pad=0.0):
        return (max(0, int(math.floor((x0 - pad) * k))), max(0, int(math.floor((H - y1 - pad) * k))),
                min(w, int(math.ceil((x1 + pad) * k))), min(h, int(math.ceil((H - y0 + pad) * k))))

    textmask = Image.new('L', (w, h), 0)
    recs = []
    for b in D['blocks']:
        if b['arc']:
            continue
        runs = [x for l in b['src_lines'] for x in l]
        g = []
        for x in runs:
            bold = 'bold' in (x['base'] or '').lower()
            for g0, g1 in spans(x['text'], x['along'], x['adv'], bold):
                g.append(rect(g0, g1, x['proj'] - DESC * x['size'], x['proj'] + ASC * x['size']))
        for x0, y0, x1, y1 in g:
            textmask.paste(255, rect(0, 0, 0, 0) if False else (x0 - int(2 * k), y0 - int(2 * k), x1 + int(2 * k), y1 + int(2 * k)))
        vis = 0; area = 0; seen = set()
        for x0, y0, x1, y1 in g:
            for Y in range(y0, y1):
                for X in range(x0, x1):
                    if (X, Y) in seen: continue
                    seen.add((X, Y)); area += 1
                    if dpx[X, Y] > 60: vis += 1
        # control xor in union(source glyph boxes, drawn line boxes)
        ub = [(x0 - 3, y0 - 3, x1 + 3, y1 + 3) for x0, y0, x1, y1 in g]
        for o in b['out']:
            ub.append(rect(o['a'], o['a'] + o['w'], o['p'] - DESC * b['sz'], o['p'] + ASC * b['sz'], pad=1.0))
        seen2 = set(); xr = 0
        for x0, y0, x1, y1 in ub:
            for Y in range(max(0, y0), min(h, y1)):
                for X in range(max(0, x0), min(w, x1)):
                    if (X, Y) in seen2: continue
                    seen2.add((X, Y))
                    if xor[X, Y]: xr += 1
        recs.append(dict(key=b['key'], idx=b['idx'], visible_src_px=vis, box_px=area, ctl_xor_px=xr))
    tm = textmask.load()
    outside = 0
    for Y in range(h):
        for X in range(w):
            if not tm[X, Y] and dpx[X, Y] > 60:
                outside += 1
    with open(OUTF, 'a') as f:
        f.write(json.dumps(dict(fig=n, outside_diff_px=outside, img=[w, h], blocks=recs), ensure_ascii=False) + '\n')
    print(n, 'outside_diff_px', outside, 'blocks', len(recs))
