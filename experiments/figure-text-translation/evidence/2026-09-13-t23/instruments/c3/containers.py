#!/usr/bin/env python3
"""STEP 2 — container census for every LAYOUT-path block (the 176), from the TEXT-STRIPPED artwork.

RASTER (artwork.png, 200 dpi):
  seed      = source line boxes (runs' own adv; normal [-0.21,+0.73]*size), rasterised in rotation.
  seed rgb  = MODE colour of seed pixels (text is stripped, so these are the label's ground).
  colour region = 4-connected component of pixels within TOL (max channel) of the seed rgb that holds
              the most seed pixels. BOUNDED := does not touch the page edge AND area < AREA_MAX of page.
              OPEN-edge := touches the page edge; OPEN-large := enclosed but >= AREA_MAX (page frame).
  dark region = same with "L >= 128" as the connectivity rule (bounded by dark strokes only).
  inner extent (pt) along the baseline / along the normal, intersected over samples across the
  label (so a rounded corner or a notch narrows it), measured in the block's own rotation.
  clearance (pt) from the source block box outward to: colour-region edge / dark artwork (L<128) /
  another block's source box / page edge — min over samples.
  spill of the DRAWN (translated) block: ink px (alpha>=128) landing on pixels NOT in the filled colour
  region, with the same number for the SOURCE run-exact render as control.
VECTOR (artwork.pdf via pdfplumber): smallest rect/curve (not page-sized) whose bbox encloses the source
  block bbox (+0.5 pt); else a LINE-CELL from the nearest rule segments on all four sides.
"""
import json, math, sys, time
sys.path.insert(0, '/home/siggi/dev/scratch-c140/c3/scripts')
from c3lib import *
from scipy import ndimage as ndi
import pdfplumber

TOL = 24
AREA_MAX = 0.25
PAD = 120
STEP = 0.25   # pt


def seed_mask(fig, bi, dil=0.0):
    surf = cairo.ImageSurface(cairo.FORMAT_A8, fig.w, fig.h)
    ctx = cairo.Context(surf); ctx.set_antialias(cairo.ANTIALIAS_NONE); ctx.set_source_rgba(0, 0, 0, 1)
    for a0, a1, pj, sz, rot in fig.src_line_boxes(bi):
        fill_poly(ctx, rot_rect_dev(fig, a0 - dil, a1 + dil, pj - DESC * sz - dil, pj + ASC * sz + dil, rot, 0))
    return a8_array(surf) > 0


def block_frame(fig, bi):
    lbs = fig.src_line_boxes(bi)
    rot = fig.blocks[bi][0]['rot']
    a0 = min(l[0] for l in lbs); a1 = max(l[1] for l in lbs)
    n0 = min(l[2] - DESC * l[3] for l in lbs); n1 = max(l[2] + ASC * l[3] for l in lbs)
    return a0, a1, n0, n1, rot


def to_px(fig, a, n, rot):
    t = math.radians(rot)
    x = a * math.cos(t) - n * math.sin(t); y = a * math.sin(t) + n * math.cos(t)
    return x * S, (fig.H - y) * S


def march(fig, blocked, a_start, n, rot, direction, along=True, limit_pt=600):
    """distance (pt) from start until `blocked` (bool HxW) is hit or the page is left.
    along=True: move in along-axis (n fixed); else move in normal axis (a fixed = a_start, n=start)."""
    ts = np.arange(0, limit_pt, STEP)
    if along:
        A = a_start + direction * ts; N = np.full_like(ts, n)
    else:
        A = np.full_like(ts, a_start); N = n + direction * ts
    t = math.radians(rot)
    X = A * math.cos(t) - N * math.sin(t); Y = A * math.sin(t) + N * math.cos(t)
    px = np.floor(X * S).astype(int); py = np.floor((fig.H - Y) * S).astype(int)
    inside = (px >= 0) & (px < fig.w) & (py >= 0) & (py < fig.h)
    if not inside.all():
        first_out = int(np.argmin(inside))
    else:
        first_out = len(ts)
    hit = np.zeros(len(ts), bool)
    ok = np.where(inside)[0]
    hit[ok] = blocked[py[ok], px[ok]]
    hit[first_out:] = False
    idx = np.where(hit[:first_out])[0]
    if len(idx):
        return float(ts[idx[0]]), 'hit'
    return float(ts[first_out - 1] if first_out > 0 else 0.0), 'page'


def samples(lo, hi, k=7):
    if hi - lo < 1e-6:
        return [lo]
    return list(np.linspace(lo + 0.15 * (hi - lo), hi - 0.15 * (hi - lo), k))


def clearance(fig, bi, blocked):
    a0, a1, n0, n1, rot = block_frame(fig, bi)
    L = [march(fig, blocked, a0, n, rot, -1) for n in samples(n0, n1)]
    R = [march(fig, blocked, a1, n, rot, +1) for n in samples(n0, n1)]
    U = [march(fig, blocked, a, n1, rot, +1, along=False) for a in samples(a0, a1, 11)]
    D = [march(fig, blocked, a, n0, rot, -1, along=False) for a in samples(a0, a1, 11)]
    f = lambda v: dict(min=round(min(x[0] for x in v), 2), med=round(float(np.median([x[0] for x in v])), 2),
                       by=('page' if all(x[1] == 'page' for x in v) else 'hit'))
    return dict(left=f(L), right=f(R), up=f(U), down=f(D))


def vector_container(objs, lines_, bbox_pt, page_area):
    """Smallest of (enclosing rect/curve, line-cell) around the source block bbox. Both reported."""
    x0, y0, x1, y1 = bbox_pt
    tol = 0.5
    area = lambda bb: (bb[2] - bb[0]) * (bb[3] - bb[1])
    res = {}
    enc = [o for o in objs if o['x0'] <= x0 + tol and o['x1'] >= x1 - tol and o['y0'] <= y0 + tol and o['y1'] >= y1 - tol
           and (o['x1'] - o['x0']) * (o['y1'] - o['y0']) < AREA_MAX * page_area]
    if enc:
        o = min(enc, key=lambda o: (o['x1'] - o['x0']) * (o['y1'] - o['y0']))
        res['shape'] = dict(type=o['object_type'], bbox=[round(o['x0'], 2), round(o['y0'], 2), round(o['x1'], 2), round(o['y1'], 2)])
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    V = [s for s in lines_ if abs(s['x1'] - s['x0']) < 1.0 and s['y0'] <= cy <= s['y1']]
    Hh = [s for s in lines_ if abs(s['y1'] - s['y0']) < 1.0 and s['x0'] <= cx <= s['x1']]
    left = max((s['x0'] for s in V if s['x0'] <= x0 + tol), default=None)
    right = min((s['x0'] for s in V if s['x0'] >= x1 - tol), default=None)
    below = max((s['y0'] for s in Hh if s['y0'] <= y0 + tol), default=None)
    above = min((s['y0'] for s in Hh if s['y0'] >= y1 - tol), default=None)
    if None not in (left, right, below, above):
        bb = [round(left, 2), round(below, 2), round(right, 2), round(above, 2)]
        if area(bb) < AREA_MAX * page_area:
            res['cell'] = dict(bbox=bb)
    cands = [('ENCLOSING_SHAPE', res['shape']['bbox'])] if 'shape' in res else []
    if 'cell' in res:
        cands.append(('LINE_CELL', res['cell']['bbox']))
    if cands:
        k, bb = min(cands, key=lambda c: area(c[1]))
        res.update(kind=k, bbox=bb)
    else:
        res.update(kind='NONE')
    return res


def main():
    only = sys.argv[1:] or names()
    out = open(C3 / 'containers.jsonl', 'w')
    for b in only:
        t0 = time.time()
        fig = Fig(b)
        page_area = fig.w * fig.h
        art = fig.art_rgb
        dark = fig.art_L < 128
        # other blocks' source boxes (all 367-population blocks of this figure), as label obstacles
        seeds = {bi: seed_mask(fig, bi) for bi in range(len(fig.blocks))}
        # vector objects
        with pdfplumber.open(fig.d / 'artwork.pdf') as pdf:
            p = pdf.pages[0]
            objs = [dict(object_type=o['object_type'], x0=o['x0'], x1=o['x1'], y0=o['y0'], y1=o['y1']) for o in p.rects + p.curves]
            segs = []
            for o in p.lines:
                segs.append(dict(x0=min(o['x0'], o['x1']), x1=max(o['x0'], o['x1']), y0=min(o['y0'], o['y1']), y1=max(o['y0'], o['y1'])))
            for o in p.rects:   # thin rects are rules too
                if (o['x1'] - o['x0']) < 1.0 or (o['y1'] - o['y0']) < 1.0:
                    segs.append(dict(x0=o['x0'], x1=o['x1'], y0=o['y0'], y1=o['y1']))
                else:  # rect edges as rules
                    segs += [dict(x0=o['x0'], x1=o['x0'], y0=o['y0'], y1=o['y1']), dict(x0=o['x1'], x1=o['x1'], y0=o['y0'], y1=o['y1']),
                             dict(x0=o['x0'], x1=o['x1'], y0=o['y0'], y1=o['y0']), dict(x0=o['x0'], x1=o['x1'], y0=o['y1'], y1=o['y1'])]
            nvec = dict(rects=len(p.rects), curves=len(p.curves), lines=len(p.lines))
        for bi in fig.layout_blocks():
            sm = seeds[bi]
            ys, xs = np.nonzero(sm)
            cols = art[ys, xs]
            keyc = cols[:, 0].astype(np.int64) * 65536 + cols[:, 1] * 256 + cols[:, 2]
            vals, cnt = np.unique(keyc, return_counts=True)
            mode = int(vals[np.argmax(cnt)]); seed_rgb = [mode // 65536, (mode // 256) % 256, mode % 256]
            seed_frac_mode = float(cnt.max() / cnt.sum())
            seed_dark_frac = float(dark[ys, xs].mean())
            similar = (np.abs(art - np.array(seed_rgb)).max(axis=2) <= TOL)
            lab, _ = ndi.label(similar)
            ls_ = lab[ys, xs]; ls_ = ls_[ls_ > 0]
            rec = dict(basename=b, block=bi, key=fig.keys[bi], seed_rgb=seed_rgb, seed_mode_frac=round(seed_frac_mode, 3),
                       seed_dark_frac=round(seed_dark_frac, 3))
            if len(ls_) == 0:
                rec['raster_class'] = 'NO_SEED_REGION'
                out.write(json.dumps(rec, ensure_ascii=False) + '\n'); continue
            li, lc = np.unique(ls_, return_counts=True)
            comp_id = int(li[np.argmax(lc)])
            comp = lab == comp_id
            rec['seed_cover'] = round(float(lc.max() / len(xs)), 3)
            cy, cx = np.nonzero(comp)
            touches = bool(cy.min() == 0 or cx.min() == 0 or cy.max() == fig.h - 1 or cx.max() == fig.w - 1)
            area_frac = float(comp.sum() / page_area)
            cls = 'OPEN-edge' if touches else ('BOUNDED' if area_frac < AREA_MAX else 'OPEN-large')
            rec.update(raster_class=cls, region_area_frac=round(area_frac, 4),
                       region_bbox_pt=[round(cx.min() / S, 2), round(fig.H - (cy.max() + 1) / S, 2), round((cx.max() + 1) / S, 2), round(fig.H - cy.min() / S, 2)])
            # dark-bounded region
            nd_lab, _ = ndi.label(~dark)
            nl = nd_lab[ys, xs]; nl = nl[nl > 0]
            if len(nl):
                ni, nc = np.unique(nl, return_counts=True)
                dcomp = nd_lab == int(ni[np.argmax(nc)])
                dy, dx_ = np.nonzero(dcomp)
                dt = bool(dy.min() == 0 or dx_.min() == 0 or dy.max() == fig.h - 1 or dx_.max() == fig.w - 1)
                dfrac = float(dcomp.sum() / page_area)
                rec['dark_region_class'] = 'OPEN-edge' if dt else ('BOUNDED' if dfrac < AREA_MAX else 'OPEN-large')
                rec['dark_region_area_frac'] = round(dfrac, 4)
            # obstacles
            others = np.zeros_like(dark)
            for oj, m in seeds.items():
                if oj != bi:
                    others |= m
            filled = ndi.binary_fill_holes(comp)
            rec['clear_colour'] = clearance(fig, bi, ~comp)
            rec['clear_dark'] = clearance(fig, bi, dark)
            rec['clear_labels'] = clearance(fig, bi, others)
            rec['clear_dark_or_labels'] = clearance(fig, bi, dark | others)
            a0, a1, n0, n1, rot = block_frame(fig, bi)
            rec['src_frame'] = dict(a0=round(a0, 2), a1=round(a1, 2), n0=round(n0, 2), n1=round(n1, 2), rot=rot)
            cc = rec['clear_colour']
            rec['inner_along'] = round(cc['left']['min'] + (a1 - a0) + cc['right']['min'], 2)
            rec['inner_normal'] = round(cc['down']['min'] + (n1 - n0) + cc['up']['min'], 2)
            # spill: drawn ink outside the FILLED colour region; source control
            T = ink_mask(fig, fig.block_items(bi), PAD) > 127
            Sm = ink_mask(fig, fig.src_runs_as_items(bi), PAD) > 127
            fP = np.zeros_like(T); fP[PAD:PAD + fig.h, PAD:PAD + fig.w] = ndi.binary_dilation(filled, iterations=1)
            cP = np.zeros_like(T); cP[PAD:PAD + fig.h, PAD:PAD + fig.w] = ndi.binary_dilation(comp, iterations=1)
            rec['ink_px'] = int(T.sum()); rec['src_ink_px'] = int(Sm.sum())
            rec['ink_outside_filled_region'] = int((T & ~fP).sum())
            rec['src_ink_outside_filled_region'] = int((Sm & ~fP).sum())
            rec['ink_off_region'] = int((T & ~cP).sum())
            rec['src_ink_off_region'] = int((Sm & ~cP).sum())
            # vector: source block bbox in page pt
            corners = [to_px(fig, a, n, rot) for a in (a0, a1) for n in (n0, n1)]
            bx0 = min(c[0] for c in corners) / S; bx1 = max(c[0] for c in corners) / S
            by0 = fig.H - max(c[1] for c in corners) / S; by1 = fig.H - min(c[1] for c in corners) / S
            rec['src_bbox_pt'] = [round(bx0, 2), round(by0, 2), round(bx1, 2), round(by1, 2)]
            rec['vector'] = vector_container(objs, segs, (bx0, by0, bx1, by1), fig.W * fig.H)
            out.write(json.dumps(rec, ensure_ascii=False) + '\n')
        print(b, 'layout blocks', len(fig.layout_blocks()), 'vec', nvec, f'{time.time() - t0:.1f}s', flush=True)
    out.close()


if __name__ == '__main__':
    main()
