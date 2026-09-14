#!/usr/bin/env python3
"""Measure one variant's LAYOUT blocks (the 176) with c3's instruments, per block.

usage: measure.py TAG        -> r2/measure-<TAG>.jsonl   (r2 copy of c3b/scripts/measure.py)

r2 CHANGES (only where c3b assumed one layout item per line; a V0 row takes the unchanged c3b code path):
  lines / text / drawn_frame are grouped by the item's r2line tag when present; size = the block's drawn
  BASE size (diag sz, asserted == max item size) instead of min item size (a 7 pt subscript is not a shrink);
  drawn frame normal extent uses each item's own size and baseline (scripts).

THE CENSUS INSTRUMENT (c3 baseline.py / containers.py / assemble.py, copied; only paths parametrised):
  ink_on_dark      A8 ink (alpha>=128) of the block's drawn items over artwork L<128      hit-artwork >= 10 px
  ink_off_page     ink outside the page rect; verdict off-page := drawn > source          (source from c3 baseline.jsonl)
  shrunk           min drawn size < sz0
  gb_new_ink       1d glyph-box new ink (drawn glyph boxes & ~source boxes dilated 1 pt & dark)
  spill            ink outside the block's filled colour region (dilated 1 px) minus the source's   (c3: >= 10 px)
  drawn margins    drawn frame vs container box (clear_colour) and free box (clear_dark_or_labels), 4 sides, pt
SUPPLEMENTARY (NEW, not the census instrument - labelled everywhere it is used):
  text_coll        this block's drawn glyph boxes & the union of every OTHER block's drawn glyph boxes (same variant,
                   all 367 blocks incl. kept run-exact), px. Source control: same on source run-exact items.
"""
import json, math, sys, time
sys.path.insert(0, '/home/siggi/dev/scratch-c140/plan/pred2/instruments')   # PRED ADAPTATION A1: import the adapted copies
sys.dont_write_bytecode = True
from c3lib import *
R2 = Path('/home/siggi/dev/scratch-c140/r2')
import os   # PRED ADAPTATION A2: input work root and output dir
PRED = Path('/home/siggi/dev/scratch-c140/plan/pred2')
WORK_ROOT = Path(os.environ.get('PRED_WORK_ROOT', str(R2 / 'work')))
from baseline import glyphbox_mask, adv_box_overhang
from containers import seed_mask, TOL
from scipy import ndimage as ndi

V = sys.argv[1]
PAD = 120
WORK = WORK_ROOT / V
BASE = {(r['basename'], r['block']): r for r in map(json.loads, open(C3 / 'baseline.jsonl'))}
ROWS = {(r['basename'], r['block']): r for r in map(json.loads, open(C3 / 'blocks.jsonl'))}
CONT = {(r['basename'], r['block']): r for r in map(json.loads, open(C3 / 'containers.jsonl'))}
CEN = json.loads((R2 / 'census.json').read_text())


def main():
    out = open(PRED / 'out' / f'measure-{V}.jsonl', 'w')
    t0 = time.time()
    msurf = cairo.ImageSurface(cairo.FORMAT_A8, 8, 8); mctx = cairo.Context(msurf)
    for b in (sys.argv[2:] or names()):   # r2: optional figure filter (planted controls only)
        fig = Fig(b, items_dir=WORK, diag_dir=WORK)
        lb = fig.layout_blocks()
        if not lb:
            continue
        dark = fig.art_L < 128
        darkP = np.zeros((fig.h + 2 * PAD, fig.w + 2 * PAD), bool); darkP[PAD:PAD + fig.h, PAD:PAD + fig.w] = dark
        page = np.zeros_like(darkP); page[PAD:PAD + fig.h, PAD:PAD + fig.w] = True
        # supplementary text-collision masks: drawn glyph boxes of every block, and source glyph boxes
        gb_draw = {bi: glyphbox_mask(fig, fig.block_items(bi), PAD, 0.0, mctx) for bi in range(len(fig.blocks))}
        gb_src = {bi: glyphbox_mask(fig, fig.src_runs_as_items(bi), PAD, 0.0, mctx, use_adv=True) for bi in range(len(fig.blocks))}
        all_draw = np.zeros_like(darkP, dtype=np.uint16); all_src = np.zeros_like(darkP, dtype=np.uint16)
        for bi in gb_draw:
            all_draw += gb_draw[bi]; all_src += gb_src[bi]
        art = fig.art_rgb
        for bi in lb:
            its = fig.block_items(bi); src = fig.src_runs_as_items(bi)
            bl = BASE[(b, bi)]; d = fig.diag[bi]; row = ROWS[(b, bi)]
            rec = dict(basename=b, block=bi, key=fig.keys[bi], variant=V, cls=CEN[f'{b}#{bi}']['cls'])
            T = ink_mask(fig, its, PAD) > 127
            rec['ink_on_dark'] = int((T & darkP).sum())
            rec['ink_off_page'] = int((T & ~page).sum())
            rec['src_ink_off_page'] = bl['src_ink_off_page_a128']
            gb_t = glyphbox_mask(fig, its, PAD, 0.0, mctx)
            gb_s = glyphbox_mask(fig, src, PAD, 1.0, mctx, use_adv=True)
            rec['gb_new_ink'] = int((gb_t & ~gb_s & darkP).sum())
            sz0 = fig.blocks[bi][0]['size']
            rec['sz0'] = sz0
            R2L = 'r2line' in its[0] or 'line' in its[0]   # PRED ADAPTATION A3: r2line <- line, r2seg <- seg
            LN, SG = ('r2line', 'r2seg') if 'r2line' in its[0] else ('line', 'seg')
            if R2L:
                assert all(LN in it for it in its)
                assert abs(d['sz'] - max(it['size'] for it in its)) < 1e-9, (b, bi)
                rec['size'] = d['sz']
            else:
                rec['size'] = min(it['size'] for it in its)
            rec['shrunk'] = bool(rec['size'] < sz0 - 1e-9)
            rec['src_lines'] = len(FT.lines(fig.blocks[bi]))
            if R2L:
                nl = max(it[LN] for it in its) + 1
                assert sorted({it[LN] for it in its}) == list(range(nl)) and nl == len(d['drawn_widths'])
                rec['lines'] = nl
                rec['text'] = [''.join(it['text'] for it in its if it[LN] == j) for j in range(nl)]
            else:
                rec['lines'] = len(its)
                rec['text'] = [it['text'] for it in its]
            # ---- spill: containers.py's exact region code ----
            sm = seed_mask(fig, bi)
            ys, xs = np.nonzero(sm)
            cols = art[ys, xs]
            keyc = cols[:, 0].astype(np.int64) * 65536 + cols[:, 1] * 256 + cols[:, 2]
            vals, cnt = np.unique(keyc, return_counts=True)
            mode = int(vals[np.argmax(cnt)]); seed_rgb = [mode // 65536, (mode // 256) % 256, mode % 256]
            similar = (np.abs(art - np.array(seed_rgb)).max(axis=2) <= TOL)
            lab, _ = ndi.label(similar)
            ls_ = lab[ys, xs]; ls_ = ls_[ls_ > 0]
            li, lc = np.unique(ls_, return_counts=True)
            comp = lab == int(li[np.argmax(lc)])
            filled = ndi.binary_fill_holes(comp)
            fP = np.zeros_like(T); fP[PAD:PAD + fig.h, PAD:PAD + fig.w] = ndi.binary_dilation(filled, iterations=1)
            Sm = ink_mask(fig, src, PAD) > 127
            rec['ink_outside_filled_region'] = int((T & ~fP).sum())
            rec['src_ink_outside_filled_region'] = int((Sm & ~fP).sum())
            rec['spill'] = rec['ink_outside_filled_region'] - rec['src_ink_outside_filled_region']
            # ---- supplementary text collision ----
            others_draw = (all_draw - gb_draw[bi]) > 0
            others_src = (all_src - gb_src[bi]) > 0
            rec['text_coll'] = int((gb_draw[bi] & others_draw).sum())
            rec['src_text_coll'] = int((gb_src[bi] & others_src).sum())
            # ---- drawn margins (assemble.py's geometry, with this variant's items + diag) ----
            fr = row['src']['frame']; cc = CONT[(b, bi)]['clear_colour']; cdl = row['container']['clear_dark_or_labels']
            t = math.radians(d['rot'])
            if R2L:
                firsts = [next(it for it in its if it[LN] == j and it[SG] == 0) for j in range(rec['lines'])]
                dA0 = min(it['x'] * math.cos(t) + it['y'] * math.sin(t) for it in its)
                dA1 = max(it['x'] * math.cos(t) + it['y'] * math.sin(t) + w for it, w in zip(firsts, d['drawn_widths']))
                dN1 = max(-it['x'] * math.sin(t) + it['y'] * math.cos(t) + ASC * it['size'] for it in its)
                dN0 = min(-it['x'] * math.sin(t) + it['y'] * math.cos(t) - DESC * it['size'] for it in its)
            else:
                dA0 = min(it['x'] * math.cos(t) + it['y'] * math.sin(t) for it in its)
                dA1 = max(it['x'] * math.cos(t) + it['y'] * math.sin(t) + w for it, w in zip(its, d['drawn_widths']))
                dN1 = max(-it['x'] * math.sin(t) + it['y'] * math.cos(t) for it in its) + ASC * d['sz']
                dN0 = min(-it['x'] * math.sin(t) + it['y'] * math.cos(t) for it in its) - DESC * d['sz']
            rec['drawn_frame'] = dict(a0=round(dA0, 2), a1=round(dA1, 2), n0=round(dN0, 2), n1=round(dN1, 2))
            geo = {}
            for nm, cl in (('container', cc), ('free_dark_or_labels', cdl)):
                L_, R_, D_, U_ = (fr['a0'] - cl['left']['min'], fr['a1'] + cl['right']['min'],
                                  fr['n0'] - cl['down']['min'], fr['n1'] + cl['up']['min'])
                geo[nm] = dict(src=dict(left=round(fr['a0'] - L_, 2), right=round(R_ - fr['a1'], 2), up=round(U_ - fr['n1'], 2), down=round(fr['n0'] - D_, 2)),
                               drawn=dict(left=round(dA0 - L_, 2), right=round(R_ - dA1, 2), up=round(U_ - dN1, 2), down=round(dN0 - D_, 2)))
            ce = CEN[f'{b}#{bi}']
            if ce['cls'] == 'BOUNDED' and 'vector' in ce['container_source']:
                geo['container_vector'] = dict(drawn=dict(left=round(dA0 - ce['L'], 2), right=round(ce['R'] - dA1, 2),
                                                          up=round(ce['U'] - dN1, 2), down=round(dN0 - ce['D'], 2)))
            rec['geometry'] = geo
            rec['src_left_edge'] = round(min(FT.along(l[0]) for l in FT.lines(fig.blocks[bi])), 2)
            rec['c3b'] = d.get('c3b')
            if d.get('r2') is not None:
                rec['r2'] = d['r2']
            rec['drawn_widths'] = [round(w, 2) for w in d['drawn_widths']]
            out.write(json.dumps(rec, ensure_ascii=False) + '\n')
        print(b, len(lb), f'{time.time() - t0:.1f}s', flush=True)
    out.close()


if __name__ == '__main__':
    main()
