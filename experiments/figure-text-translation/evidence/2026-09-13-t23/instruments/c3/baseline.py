#!/usr/bin/env python3
"""STEP 1 — collision baseline on the current (E) composer output, all 367 drawn blocks.

The instruments that produced the inherited numbers were NOT kept (verify-dm/inkov*.py and 1d's
analyse.py lived in a dead tmpfs scratchpad). Rebuilt from their written definitions:

 INK (verify-dm): render the composer's own drawn items for ONE block with cairo (compose.py's draw
   statements) as an A8 mask on a canvas padded by PAD px; count ink px over dark artwork
   (PIL L < 128 in artwork.png). Hit >= 10 px. Off-page = ink outside the page rect.
   Both at alpha>0 and alpha>=128 (the definition does not say which).
   SOURCE CONTROL per block: the same instrument on the block's SOURCE runs drawn run-exact.
 GLYPHBOX (1d): new ink = dark artwork px inside the DRAWN glyph boxes but outside the SOURCE glyph
   boxes dilated by 1 pt. Glyph box = hmtx proportion of the run's advance (spaces excluded) x
   [-0.21, +0.73] * size. Hit >= 30 px. Advance-box page overhang recorded too.
 SHRUNK: drawn size < block's first-run size. LINES: drawn lines vs source lines.

Draw control: all items re-drawn with colour onto artwork.png must equal translated.png.
"""
import json, math, sys
sys.path.insert(0, '/home/siggi/dev/scratch-c140/c3/scripts')
from c3lib import *
from fontTools.ttLib import TTFont

PAD = 120
_F = {}
for _w in ('Regular', 'Bold'):
    _t = TTFont(f'/usr/share/fonts/truetype/liberation/LiberationSans-{_w}.ttf')
    _F[_w == 'Bold'] = (_t.getBestCmap(), _t['hmtx'].metrics)


def spans(text, total, bold):
    cmap, hmtx = _F[bool(bold)]
    adv = [hmtx[cmap[ord(c)]][0] if ord(c) in cmap else 500 for c in text]
    s = sum(adv) or 1; out = []; x = 0.0
    for c, a in zip(text, adv):
        w = total * a / s
        if not c.isspace():
            out.append((x, x + w))
        x += w
    return out


def glyphbox_mask(fig, items, pad, dil_pt=0.0, measure_ctx=None, use_adv=False):
    surf, ctx = new_a8(fig, pad)
    ctx.set_source_rgba(0, 0, 0, 1)
    ctx.set_antialias(cairo.ANTIALIAS_NONE)
    for it in items:
        total = it['adv'] if use_adv else measure_adv(measure_ctx, it['text'], it['size'], it['bold'], it['italic'])
        t = math.radians(it['rot'])
        a_org = it['x'] * math.cos(t) + it['y'] * math.sin(t) + it['dx']
        n_org = -it['x'] * math.sin(t) + it['y'] * math.cos(t)
        for g0, g1 in spans(it['text'], total, it['bold']):
            fill_poly(ctx, rot_rect_dev(fig, a_org + g0 - dil_pt, a_org + g1 + dil_pt,
                                        n_org - DESC * it['size'] - dil_pt, n_org + ASC * it['size'] + dil_pt,
                                        it['rot'], pad))
    return a8_array(surf) > 0


def adv_box_overhang(fig, items, measure_ctx, use_adv=False):
    """max distance (pt) any glyph-box corner lies outside the page."""
    worst = 0.0
    for it in items:
        total = it['adv'] if use_adv else measure_adv(measure_ctx, it['text'], it['size'], it['bold'], it['italic'])
        t = math.radians(it['rot'])
        a_org = it['x'] * math.cos(t) + it['y'] * math.sin(t) + it['dx']
        n_org = -it['x'] * math.sin(t) + it['y'] * math.cos(t)
        for a in (a_org, a_org + total):
            for n in (n_org - DESC * it['size'], n_org + ASC * it['size']):
                x = a * math.cos(t) - n * math.sin(t); y = a * math.sin(t) + n * math.cos(t)
                worst = max(worst, -x, x - fig.W, -y, y - fig.H)
    return worst


def main():
    only = sys.argv[1:] or names()
    out = open(C3 / 'baseline.jsonl', 'w')
    ctrl = []
    for b in only:
        fig = Fig(b)
        # ---- draw control: re-draw every item with colour over artwork == translated.png
        surf = cairo.ImageSurface.create_from_png(str(fig.d / 'artwork.png'))
        o = cairo.ImageSurface(cairo.FORMAT_RGB24, surf.get_width(), surf.get_height())
        cx = cairo.Context(o); cx.set_source_rgb(1, 1, 1); cx.paint(); cx.set_source_surface(surf, 0, 0); cx.paint()
        for it in fig.items:
            cx.select_font_face(FAMILY, cairo.FONT_SLANT_ITALIC if it['italic'] else cairo.FONT_SLANT_NORMAL,
                                cairo.FONT_WEIGHT_BOLD if it['bold'] else cairo.FONT_WEIGHT_NORMAL)
            cx.set_font_size(it['size'] * S)
            px, py = fig.dev(it['x'], it['y'])
            cx.save(); cx.translate(px, py); cx.rotate(-math.radians(it['rot']))
            cx.set_source_rgb(*it['rgb']); cx.move_to(it['dx'] * S, 0); cx.show_text(it['text']); cx.restore()
        o.flush()
        st = o.get_stride()
        mine = np.frombuffer(o.get_data(), dtype=np.uint8).reshape(fig.h, st)[:, :fig.w * 4].reshape(fig.h, fig.w, 4)[..., [2, 1, 0]]
        ref = np.asarray(Image.open(fig.d / 'translated.png').convert('RGB'))
        ndiff = int((np.abs(mine.astype(int) - ref.astype(int)).max(axis=2) > 0).sum())
        ctrl.append((b, ndiff))

        dark = fig.art_L < 128
        darkP = np.zeros((fig.h + 2 * PAD, fig.w + 2 * PAD), bool); darkP[PAD:PAD + fig.h, PAD:PAD + fig.w] = dark
        page = np.zeros_like(darkP); page[PAD:PAD + fig.h, PAD:PAD + fig.w] = True
        msurf = cairo.ImageSurface(cairo.FORMAT_A8, 8, 8); mctx = cairo.Context(msurf)
        for bi in range(len(fig.blocks)):
            its = fig.block_items(bi)
            src = fig.src_runs_as_items(bi)
            m_t = ink_mask(fig, its, PAD); m_s = ink_mask(fig, src, PAD)
            rec = dict(basename=b, block=bi, key=fig.keys[bi], path=fig.path.get(bi))
            for thr, tag in ((0, 'a0'), (127, 'a128')):
                T = m_t > thr; Sm = m_s > thr
                rec[f'ink_on_dark_{tag}'] = int((T & darkP).sum())
                rec[f'src_ink_on_dark_{tag}'] = int((Sm & darkP).sum())
                rec[f'ink_off_page_{tag}'] = int((T & ~page).sum())
                rec[f'src_ink_off_page_{tag}'] = int((Sm & ~page).sum())
                rec[f'ink_px_{tag}'] = int(T.sum())
            # glyph-box new ink (1d)
            gb_t = glyphbox_mask(fig, its, PAD, 0.0, mctx)
            gb_s = glyphbox_mask(fig, src, PAD, 1.0, mctx, use_adv=True)
            rec['gb_new_ink'] = int((gb_t & ~gb_s & darkP).sum())
            gb_s0 = glyphbox_mask(fig, src, PAD, 0.0, mctx, use_adv=True)
            rec['gb_src_self_ink'] = int((gb_s0 & darkP).sum())
            rec['adv_overhang_pt'] = round(adv_box_overhang(fig, its, mctx), 3)
            rec['src_adv_overhang_pt'] = round(adv_box_overhang(fig, src, mctx, use_adv=True), 3)
            sz0 = fig.blocks[bi][0]['size']
            rec['sz0'] = sz0
            rec['min_drawn_size'] = min((it['size'] for it in its), default=None)
            rec['shrunk'] = bool(its and rec['path'] == 'layout' and min(it['size'] for it in its) < sz0 - 1e-9)
            rec['src_lines'] = len(FT.lines(fig.blocks[bi]))
            rec['drawn_lines'] = len(its) if rec['path'] == 'layout' else None
            out.write(json.dumps(rec, ensure_ascii=False) + '\n')
        print(b, 'drawctl_diffpx', ndiff, flush=True)
    out.close()
    (C3 / 'baseline-drawcontrol.json').write_text(json.dumps(ctrl))


if __name__ == '__main__':
    main()
