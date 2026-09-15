#!/usr/bin/env python3
"""r2v-numbers: INDEPENDENT per-block measurement of one tag's layout blocks from items.json.

usage: mym.py TAG [--pixels]   -> r2v-numbers/out/mym-<TAG>.jsonl

Independent of the builder's measure.py adaptation:
  * lines grouped by GEOMETRY (base-size items clustered on the projected normal; styled items to the
    nearest line) - never by r2line/r2seg/r2base tags;
  * base size = the item size carrying the most characters (ties -> larger) - never diag['sz'];
  * drawn extents from cairo x_advance of each ITEM's own text/size/bold/italic - never diag['drawn_widths'];
  * geometry margins: c3/blocks.jsonl src frame + c3/containers.jsonl clear_colour + blocks.jsonl
    clear_dark_or_labels (inherited c3 census), container_vector from c3b/census.json L/R (inherited).
Instrument definitions used (allowed): c3lib.Fig/ink_mask/measure_adv, containers.seed_mask/TOL, baseline.glyphbox_mask.
--pixels additionally computes ink_on_dark / ink_off_page / spill / text_coll with those instruments.
"""
import json, math, sys, collections, time
sys.dont_write_bytecode = True
sys.path.insert(0, '/home/siggi/dev/scratch-c140/c3b/scripts')
from c3lib import *            # Fig, ink_mask, measure_adv, cairo, np, FT, block_key, ASC, DESC, names, C3, PREP
from baseline import glyphbox_mask
from containers import seed_mask, TOL
from scipy import ndimage as ndi

TAG = sys.argv[1]; PIX = '--pixels' in sys.argv
ONLY = sys.argv[sys.argv.index('--fig') + 1] if '--fig' in sys.argv else None
ROOT = Path('/home/siggi/dev/scratch-c140'); R2 = ROOT / 'r2'; ME = ROOT / 'r2v-numbers'
WORK = R2 / 'work' / TAG
SIDE = Path('/home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi-2e/figure-text')
ROWS = {(r['basename'], r['block']): r for r in map(json.loads, open(C3 / 'blocks.jsonl'))}
CONT = {(r['basename'], r['block']): r for r in map(json.loads, open(C3 / 'containers.jsonl'))}
BASE = {(r['basename'], r['block']): r for r in map(json.loads, open(C3 / 'baseline.jsonl'))}
CEN3B = json.loads((ROOT / 'c3b/census.json').read_text())
PADPX = 120
mctx = cairo.Context(cairo.ImageSurface(cairo.FORMAT_A8, 8, 8))


def proj(it):
    t = math.radians(it['rot'])
    return it['x'] * math.cos(t) + it['y'] * math.sin(t) + it.get('dx', 0.0), -it['x'] * math.sin(t) + it['y'] * math.cos(t)


def group(its, sz0):
    w = collections.Counter()
    for it in its:
        w[round(it['size'], 6)] += len(it['text'])
    base = max(w.items(), key=lambda kv: (kv[1], kv[0]))[0]
    bas = sorted([it for it in its if abs(it['size'] - base) < 1e-6], key=lambda it: -proj(it)[1])
    cl = []
    for it in bas:
        n = proj(it)[1]
        if cl and abs(proj(cl[-1][-1])[1] - n) < 0.3 * sz0:
            cl[-1].append(it)
        else:
            cl.append([it])
    centres = [float(np.median([proj(i)[1] for i in c])) for c in cl]
    lines = [[] for _ in cl]
    for it in its:
        j = min(range(len(centres)), key=lambda j: abs(centres[j] - proj(it)[1]))
        lines[j].append(it)
    lines = [sorted(l, key=lambda it: proj(it)[0]) for l in lines]
    return base, lines, centres


def main():
    out = open(ME / 'out' / f'mym-{TAG}.jsonl', 'w')  # --fig runs write the same name; used for controls only
    t0 = time.time()
    for b in ([ONLY] if ONLY else names()):
        fig = Fig(b, items_dir=WORK, diag_dir=WORK)
        lb = fig.layout_blocks()
        if not lb:
            continue
        tr = json.loads((SIDE / f'{b}.is.json').read_text())['blocks']
        if PIX:
            dark = fig.art_L < 128
            darkP = np.zeros((fig.h + 2 * PADPX, fig.w + 2 * PADPX), bool); darkP[PADPX:PADPX + fig.h, PADPX:PADPX + fig.w] = dark
            page = np.zeros_like(darkP); page[PADPX:PADPX + fig.h, PADPX:PADPX + fig.w] = True
            gbd = {bi: glyphbox_mask(fig, fig.block_items(bi), PADPX, 0.0, mctx) for bi in range(len(fig.blocks))}
            alld = np.zeros(darkP.shape, np.uint16)
            for m in gbd.values():
                alld += m
        for bi in lb:
            its = fig.block_items(bi)
            assert len({it['rot'] for it in its}) == 1
            sz0 = fig.blocks[bi][0]['size']
            base, lines, centres = group(its, sz0)
            rec = dict(basename=b, block=bi, key=fig.keys[bi], tag=TAG, sz0=sz0, size=base, n_items=len(its),
                       lines=len(lines), src_lines=len(FT.lines(fig.blocks[bi])))
            rec['text'] = [''.join(it['text'] for it in l) for l in lines]
            val = tr.get(fig.keys[bi])
            rec['value'] = val
            rec['words'] = len(val.split()) if isinstance(val, str) else None
            rec['text_ok'] = isinstance(val, str) and ' '.join(rec['text']) == ' '.join(val.split()) and all(t == ' '.join(t.split()) for t in rec['text'])
            per_line = []
            A0 = A1 = None
            for l in lines:
                e0 = min(proj(it)[0] for it in l)
                e1 = max(proj(it)[0] + measure_adv(mctx, it['text'], it['size'], it['bold'], it['italic']) for it in l)
                per_line.append([round(e0, 4), round(e1, 4)])
            A0 = min(p[0] for p in per_line); A1 = max(p[1] for p in per_line)
            N1 = max(proj(it)[1] + ASC * it['size'] for it in its); N0 = min(proj(it)[1] - DESC * it['size'] for it in its)
            rec['frame'] = dict(a0=A0, a1=A1, n0=N0, n1=N1)
            rec['line_extents'] = per_line
            rec['styled_items'] = sum(1 for it in its if abs(it['size'] - base) > 1e-6 or it['italic'])
            row = ROWS[(b, bi)]; fr = row['src']['frame']
            cc = CONT[(b, bi)]['clear_colour']; cdl = row['container']['clear_dark_or_labels']
            geo = {}
            for nm, c in (('container', cc), ('free', cdl)):
                L_, R_, D_, U_ = fr['a0'] - c['left']['min'], fr['a1'] + c['right']['min'], fr['n0'] - c['down']['min'], fr['n1'] + c['up']['min']
                geo[nm] = dict(L=L_, R=R_, D=D_, U=U_, left=A0 - L_, right=R_ - A1, up=U_ - N1, down=N0 - D_)
            ce = CEN3B[f'{b}#{bi}']
            rec['c3b_cls'] = ce['cls']; rec['container_source'] = ce.get('container_source')
            if ce['cls'] == 'BOUNDED' and 'vector' in (ce.get('container_source') or ''):
                geo['container_vector'] = dict(L=ce['L'], R=ce['R'], D=ce['D'], U=ce['U'], left=A0 - ce['L'], right=ce['R'] - A1, up=ce['U'] - N1, down=N0 - ce['D'])
            rec['geo'] = geo
            rec['src_left_edge'] = min(FT.along(l[0]) for l in FT.lines(fig.blocks[bi]))
            rec['cont_final'] = row['container']['final']; rec['cont_dark'] = row['container']['dark']; rec['textured'] = row['container']['textured']
            if PIX:
                T = ink_mask(fig, its, PADPX) > 127
                rec['ink_on_dark'] = int((T & darkP).sum())
                rec['ink_off_page'] = int((T & ~page).sum())
                rec['src_ink_off_page'] = BASE[(b, bi)]['src_ink_off_page_a128']
                sm = seed_mask(fig, bi); ys, xs = np.nonzero(sm); art = fig.art_rgb
                cols = art[ys, xs]; kc = cols[:, 0].astype(np.int64) * 65536 + cols[:, 1] * 256 + cols[:, 2]
                vals, cnt = np.unique(kc, return_counts=True); mode = int(vals[np.argmax(cnt)])
                seed = [mode // 65536, (mode // 256) % 256, mode % 256]
                lab, _ = ndi.label(np.abs(art - np.array(seed)).max(axis=2) <= TOL)
                ls_ = lab[ys, xs]; ls_ = ls_[ls_ > 0]; li, lc = np.unique(ls_, return_counts=True)
                filled = ndi.binary_fill_holes(lab == int(li[np.argmax(lc)]))
                fP = np.zeros_like(T); fP[PADPX:PADPX + fig.h, PADPX:PADPX + fig.w] = ndi.binary_dilation(filled, iterations=1)
                Sm = ink_mask(fig, fig.src_runs_as_items(bi), PADPX) > 127
                rec['spill'] = int((T & ~fP).sum()) - int((Sm & ~fP).sum())
                rec['text_coll'] = int((gbd[bi] & ((alld - gbd[bi]) > 0)).sum())
            out.write(json.dumps(rec, ensure_ascii=False) + '\n')
        print(b, len(lb), f'{time.time() - t0:.1f}s', flush=True)
    out.close()


main()
