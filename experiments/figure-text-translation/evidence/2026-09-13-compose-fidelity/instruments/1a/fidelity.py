#!/usr/bin/env python3
"""Per-block, text-isolated PIXEL FIDELITY instrument for composed figures.

WHY: check.py compares whole images; its own docstring says antialiasing swamps layout
error.  This scores EACH BLOCK, using only TEXT ink, against the untouched source raster.

MODEL
  src.png  = pdftocairo -png -r 200 of <prep>/<basename>.pdf  (the rasterizer that made
             artwork.png, from the same page box; shapes asserted equal)
  art.png  = <prep>/artwork.png (every glyph stripped)
  ours     = any image composited onto artwork.png (compose.py control.png, a ceiling render,
             a browser render of the SVG, ...)
  text ink = ink(img) := dark(img) & ~dark(art)        [mode 'dark', L < T, T=128 primary]
             or        |img - art|_max > T             [mode 'diff', sensitivity check]
             Outside text, src and ours are pixel-identical to art by construction (same
             rasterizer / composited onto art), so text ink is exactly "what text added".
             Text drawn over DARK artwork is invisible in mode 'dark' (reported per block as
             src_hidden = diff-ink pixels that fall on dark artwork).

REGIONS / ATTRIBUTION
  Each run is a rotated rectangle: along [0, adv], normal [-0.22*size, +0.80*size] from its
  baseline origin.  EVERY ink pixel (src side and ours side separately) is attributed to the
  block whose run-rectangle is NEAREST (distance 0 inside; tie-break by distance to the run's
  mid-line), capped at DMAX = max(60 px, 2.4*size*S).  Ink beyond the cap is 'unattributed'
  and reported per figure.  Nearest-box (not a fixed dilation) because stacked labels sit
  ~50 px apart and a generous dilation would bleed one block's ink into its neighbour; the
  cap keeps a far-flung composed label from being silently credited to anything.
  Validated against EXACT per-block labels (each block's items rendered alone) — see
  `exact_labels` / agreement fields.

SCORE per block (A = src ink of the block, B = ours ink of the block)
  iou1       IoU of the 1-px-dilated masks (primary);  iou0 / iou2 for resolution study
  p1, r1     |B & dil1(A)|/|B|,  |A & dil1(B)|/|A|
  ours_only1 |B - dil1(A)|;   src_only1 |A - dil1(B)|
  c_al, c_no centroid offset ours-src in px, along the block's baseline / along its UP normal
  w_ratio    ours/src ink extent along the baseline (1st..99th pct)  -> sees whitespace collapse
  h_ratio    ours/src ink extent along the normal                    -> sees flattened scripts
  NaN when A is empty (nothing visible to compare).
"""
import sys, json, math, re, subprocess
from pathlib import Path
import numpy as np
from scipy import ndimage as ndi
from PIL import Image

SP = Path('/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/d293cd29-19d8-4ccc-a2b3-244bf111501b/scratchpad')
EXP = Path('/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation')
SIDECARS = Path('/home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi-2e/figure-text')
sys.path.insert(0, str(EXP))
sys.path.insert(0, str(SP / 'tools'))
import figtext as FT            # noqa: E402
from blockkey import block_key, block_lines  # noqa: E402
import runexact_png as R        # noqa: E402

DPI = 200.0
S = DPI / 72.0
ASC, DESC = 0.80, 0.22
DMAX_MIN_PX, DMAX_SIZES = 60.0, 2.4


def load_rgb(p):
    return np.asarray(Image.open(p).convert('RGB')).astype(np.int16)


def lum(a):
    return 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]


def surf_to_rgb(surf):
    """cairo RGB24 ImageSurface -> HxWx3 int16 (BGRx little-endian)."""
    w, h, st = surf.get_width(), surf.get_height(), surf.get_stride()
    buf = np.frombuffer(surf.get_data(), dtype=np.uint8).reshape(h, st)[:, :w * 4].reshape(h, w, 4)
    return buf[..., [2, 1, 0]].astype(np.int16)


class Figure:
    def __init__(self, basename, prep_root=SP / 'prep', fid_root=SP / 'fid', mode='dark', T=128):
        self.b = basename
        self.prep = Path(prep_root) / basename
        self.fid = Path(fid_root) / basename
        self.fid.mkdir(parents=True, exist_ok=True)
        self.mode, self.T = mode, T
        self.meta = json.loads((self.prep / 'meta.json').read_text())
        self.runs = json.loads((self.prep / 'runs.json').read_text())
        self.blocks = FT.merge_blocks(FT.group(self.runs))
        self.keys = [block_key(b) for b in self.blocks]
        self.W_PT, self.H_PT = self.meta['page']
        srcpng = self.fid / 'src.png'
        if not srcpng.exists():
            subprocess.run(['pdftocairo', '-png', '-r', '200', '-singlefile',
                            str(self.prep / f'{basename}.pdf'), str(self.fid / 'src')],
                           check=True, timeout=300)
        self.src = load_rgb(srcpng)
        self.art = load_rgb(self.prep / 'artwork.png')
        assert self.src.shape == self.art.shape, (basename, self.src.shape, self.art.shape)
        self.art_dark = lum(self.art) < T
        # registration control: stripping text must never ADD ink
        self.reg_art_not_src = int((self.art_dark & ~(lum(self.src) < T)).sum())
        self.reg_diff_far = None  # filled by census()
        self._geometry()
        self.src_ink = self.ink(self.src)
        self.src_lab = self.attribute(self.src_ink)
        self.src_diffink = np.abs(self.src - self.art).max(axis=2) > 40
        self.src_diff_lab = self.attribute(self.src_diffink)
        self._classes()
        self._features()

    # ---------------------------------------------------------------- ink
    def ink(self, img):
        if self.mode == 'dark':
            return (lum(img) < self.T) & ~self.art_dark
        return np.abs(img - self.art).max(axis=2) > self.T

    # ------------------------------------------------------------ geometry
    def _geometry(self):
        g = []
        for bi, b in enumerate(self.blocks):
            for r in b:
                a = math.radians(r['rot'])
                g.append((r['x'] * S, (self.H_PT - r['y']) * S,
                          math.cos(a), -math.sin(a),       # along (device)
                          -math.sin(a), -math.cos(a),      # up normal (device)
                          max(r['adv'], 0.1) * S, ASC * r['size'] * S, DESC * r['size'] * S, bi))
        self.geo = np.array(g, dtype=np.float64)
        self.nb = len(self.blocks)
        self.bsize = np.array([max(r['size'] for r in b) for b in self.blocks])
        self.dmax = np.maximum(DMAX_MIN_PX, DMAX_SIZES * self.bsize * S)
        # block frame = first run's along/normal
        self.frame = np.array([self.geo[[i for i in range(len(self.geo)) if self.geo[i, 9] == bi][0], 2:6]
                               for bi in range(self.nb)])

    def _run_dist(self, px, py):
        """(N, nb) box distance and (N, nb) midline distance, min over each block's runs."""
        N = len(px)
        dbox = np.full((N, self.nb), np.inf)
        dmid = np.full((N, self.nb), np.inf)
        for ox, oy, ux, uy, nx, ny, adv, asc, desc, bi in self.geo:
            bi = int(bi)
            dx, dy = px - ox, py - oy
            u = dx * ux + dy * uy
            v = dx * nx + dy * ny
            du = np.maximum(np.maximum(-u, 0), u - adv)
            dv = np.maximum(np.maximum(-desc - v, 0), v - asc)
            d = np.hypot(du, dv)
            m = np.hypot(du, v - (asc - desc) / 2)
            better = (d < dbox[:, bi]) | ((d == dbox[:, bi]) & (m < dmid[:, bi]))
            dbox[:, bi] = np.where(better, d, dbox[:, bi])
            dmid[:, bi] = np.where(better, m, dmid[:, bi])
        return dbox, dmid

    def attribute(self, mask):
        """-> dict(ys, xs, lab) ; lab = block index or -1 (beyond DMAX of the nearest block)."""
        ys, xs = np.nonzero(mask)
        if self.nb == 0 or len(ys) == 0:
            return dict(ys=ys, xs=xs, lab=np.full(len(ys), -1, dtype=np.int32))
        px, py = xs + 0.5, ys + 0.5
        lab = np.empty(len(ys), dtype=np.int32)
        CH = 20000
        for s in range(0, len(ys), CH):
            dbox, dmid = self._run_dist(px[s:s + CH], py[s:s + CH])
            key = dbox + 1e-3 * np.minimum(dmid, 1e6)
            j = np.argmin(key, axis=1)
            dj = dbox[np.arange(len(j)), j]
            lab[s:s + CH] = np.where(dj <= self.dmax[j], j, -1)
        return dict(ys=ys, xs=xs, lab=lab)

    def box_mask(self, bi, pad=0):
        """boolean mask of block bi's run rectangles (for art_dark_frac)."""
        rows = self.geo[self.geo[:, 9] == bi]
        pts = []
        for ox, oy, ux, uy, nx, ny, adv, asc, desc, _ in rows:
            for uu, vv in ((0, -desc), (adv, -desc), (adv, asc), (0, asc)):
                pts.append((ox + uu * ux + vv * nx, oy + uu * uy + vv * ny))
        pts = np.array(pts)
        H, W = self.art_dark.shape
        x0, y0 = max(int(pts[:, 0].min()) - pad, 0), max(int(pts[:, 1].min()) - pad, 0)
        x1, y1 = min(int(pts[:, 0].max()) + 2 + pad, W), min(int(pts[:, 1].max()) + 2 + pad, H)
        if x1 <= x0 or y1 <= y0:
            return None, (0, 0, 0, 0)
        yy, xx = np.mgrid[y0:y1, x0:x1]
        dbox, _ = self._run_dist(xx.ravel() + 0.5, yy.ravel() + 0.5)
        return (dbox[:, bi] <= pad).reshape(yy.shape), (x0, y0, x1, y1)

    # -------------------------------------------------------------- classes
    def _classes(self):
        bj = json.loads((self.prep / 'blocks.json').read_text())
        self.blocks_json_keys = [e['key'] for e in bj]
        self.keys_match = self.blocks_json_keys == self.keys
        send = [e['send'] for e in bj] if self.keys_match else [None] * self.nb
        sc_path = SIDECARS / f'{self.b}.is.json'
        sc = json.loads(sc_path.read_text())['blocks'] if sc_path.exists() else None
        self.sidecar_found = sc is not None
        self.cls = []
        for k, s in zip(self.keys, send):
            if s is None:
                c = 'unknown'
            elif not s:
                c = 'never-sent'
            elif sc is None or k not in sc:
                c = 'sent-missing'
            elif sc[k] == k:
                c = 'sent-identity'
            else:
                c = 'sent-translated'
            self.cls.append(c)

    # ------------------------------------------------------------- features
    def _features(self):
        self.feat = []
        fonts = self.meta['fonts']
        for bi, b in enumerate(self.blocks):
            ls = FT.lines(b)
            msz = max(r['size'] for r in b)
            has_script = any(abs(p['size'] - q['size']) >= 1 and abs(FT.proj(p) - FT.proj(q)) >= 1
                             for i, p in enumerate(b) for q in b[i + 1:])
            bases = [fonts[r['font']]['base'].split('+')[-1].lower() for r in b]
            big = [FT.proj(max(l, key=lambda r: r['size'])) for l in ls]
            stacked = len(ls) > 1 and any(abs(big[j] - big[j + 1]) < 0.8 * msz for j in range(len(ls) - 1))
            bm, (x0, y0, x1, y1) = self.box_mask(bi)
            adf = float(self.art_dark[y0:y1, x0:x1][bm].mean()) if bm is not None and bm.any() else float('nan')
            self.feat.append(dict(
                has_script=bool(has_script),
                has_italic=any('italic' in x or 'oblique' in x for x in bases),
                has_bold=any('bold' in x for x in bases),
                has_symfont=any('liberation' not in x for x in bases),
                has_multispace=any(re.search(r' {2,}', t) for t in block_lines(b)),
                n_lines=len(ls), stacked_split=bool(stacked),
                arc=bool(FT.is_arc(b)), rotated=any(abs(r['rot']) > 0.5 for r in b),
                size_max=msz, n_chars=sum(len(r['text']) for r in b),
                art_dark_frac=round(adf, 4)))

    # ---------------------------------------------------------------- score
    def score(self, ours, exact=None):
        """ours: HxWx3 int16 array.  exact: optional dict(src=labelmap, ours=labelmap) (-1 = none)
        of EXACT per-block ink ownership, used only to validate nearest-box attribution."""
        assert ours.shape == self.art.shape, (self.b, ours.shape, self.art.shape)
        oink = self.ink(ours)
        olab = self.attribute(oink)
        H, W = self.art_dark.shape
        rows = []
        diff_on_dark = self.src_diffink & self.art_dark
        dlab = self.src_diff_lab
        for bi in range(self.nb):
            sa = self.src_lab['lab'] == bi
            ob = olab['lab'] == bi
            Ay, Ax = self.src_lab['ys'][sa], self.src_lab['xs'][sa]
            By, Bx = olab['ys'][ob], olab['xs'][ob]
            dsel = dlab['lab'] == bi
            hidden = int(diff_on_dark[dlab['ys'][dsel], dlab['xs'][dsel]].sum())
            row = dict(block=bi, nA=int(len(Ay)), nB=int(len(By)), src_hidden=hidden,
                       src_diffink=int(dsel.sum()))
            row.update(self._metrics(bi, Ay, Ax, By, Bx, H, W))
            if exact is not None:
                row.update(self._agreement(bi, exact, self.src_lab, olab, H, W))
            rows.append(row)
        fig = dict(unattr_src=int((self.src_lab['lab'] < 0).sum()),
                   unattr_ours=int((olab['lab'] < 0).sum()),
                   ink_src=int(len(self.src_lab['lab'])), ink_ours=int(len(olab['lab'])))
        return rows, fig

    def score_block(self, ours, bi):
        """Metrics for ONE block; exact same attribution as score(): a pixel farther than
        dmax[bi] from bi's run boxes can never be attributed to bi, so only the window around
        bi's boxes (expanded by dmax) is attributed."""
        H, W = self.art_dark.shape
        rows = self.geo[self.geo[:, 9] == bi]
        xs_, ys_ = [], []
        for ox, oy, ux, uy, nx, ny, adv, asc, desc, _ in rows:
            for uu, vv in ((0, -desc), (adv, -desc), (adv, asc), (0, asc)):
                xs_.append(ox + uu * ux + vv * nx); ys_.append(oy + uu * uy + vv * ny)
        m = self.dmax[bi] + 2
        x0, x1 = max(int(min(xs_) - m), 0), min(int(max(xs_) + m) + 1, W)
        y0, y1 = max(int(min(ys_) - m), 0), min(int(max(ys_) + m) + 1, H)
        oink = np.zeros((H, W), bool)
        sub = ours[y0:y1, x0:x1]
        if self.mode == 'dark':
            oink[y0:y1, x0:x1] = (lum(sub) < self.T) & ~self.art_dark[y0:y1, x0:x1]
        else:
            oink[y0:y1, x0:x1] = np.abs(sub - self.art[y0:y1, x0:x1]).max(axis=2) > self.T
        olab = self.attribute(oink)
        sa = self.src_lab['lab'] == bi
        ob = olab['lab'] == bi
        r = dict(block=bi, nA=int(sa.sum()), nB=int(ob.sum()))
        r.update(self._metrics(bi, self.src_lab['ys'][sa], self.src_lab['xs'][sa],
                               olab['ys'][ob], olab['xs'][ob], H, W))
        return r

    def _metrics(self, bi, Ay, Ax, By, Bx, H, W):
        nan = float('nan')
        if len(Ay) == 0:
            return dict(iou0=nan, iou1=nan, iou2=nan, p1=nan, r1=nan, ours_only1=int(len(By)),
                        src_only1=0, c_al=nan, c_no=nan, w_ratio=nan, h_ratio=nan,
                        run_iou1_min=nan, run_min_text=None, run_cal_max=nan, run_cno_max=nan, n_runs=0)
        ys = np.concatenate([Ay, By]); xs = np.concatenate([Ax, Bx])
        y0, x0 = max(ys.min() - 4, 0), max(xs.min() - 4, 0)
        y1, x1 = min(ys.max() + 5, H), min(xs.max() + 5, W)
        A = np.zeros((y1 - y0, x1 - x0), bool); A[Ay - y0, Ax - x0] = True
        B = np.zeros_like(A); B[By - y0, Bx - x0] = True
        st1 = np.ones((3, 3), bool); st2 = np.ones((5, 5), bool)
        dA1, dB1 = ndi.binary_dilation(A, st1), ndi.binary_dilation(B, st1)
        dA2, dB2 = ndi.binary_dilation(A, st2), ndi.binary_dilation(B, st2)

        def iou(p, q):
            u = (p | q).sum()
            return float((p & q).sum() / u) if u else nan
        nB = B.sum()
        ux, uy, nx, ny = self.frame[bi]
        if nB:
            ca = (Ax.mean() - 0) * ux + (Ay.mean()) * uy
            cb = Bx.mean() * ux + By.mean() * uy
            na_ = Ax.mean() * nx + Ay.mean() * ny
            nb_ = Bx.mean() * nx + By.mean() * ny
            pa_u, pb_u = Ax * ux + Ay * uy, Bx * ux + By * uy
            pa_n, pb_n = Ax * nx + Ay * ny, Bx * nx + By * ny
            ext = lambda v: float(np.percentile(v, 99) - np.percentile(v, 1) + 1)
            c_al, c_no = float(cb - ca), float(nb_ - na_)
            w_ratio, h_ratio = ext(pb_u) / ext(pa_u), ext(pb_n) / ext(pa_n)
        else:
            c_al = c_no = w_ratio = h_ratio = nan
        out = dict(iou0=iou(A, B), iou1=iou(dA1, dB1), iou2=iou(dA2, dB2),
                   p1=float((B & dA1).sum() / nB) if nB else nan,
                   r1=float((A & dB1).sum() / A.sum()),
                   ours_only1=int((B & ~dA1).sum()), src_only1=int((A & ~dB1).sum()),
                   c_al=c_al, c_no=c_no, w_ratio=w_ratio, h_ratio=h_ratio)
        out.update(self._run_metrics(bi, Ay, Ax, By, Bx, H, W))
        return out

    RUN_MIN = 10   # a run needs this many src ink px to be scored locally

    def _run_metrics(self, bi, Ay, Ax, By, Bx, H, W):
        """LOCAL fidelity: re-attribute the block's ink to its nearest RUN (sub/superscripts,
        italics and font changes are separate runs) and score each run. A block-level score is
        diluted by length - one flattened subscript in a 40-character line barely moves it."""
        nan = float('nan')
        idx = [i for i in range(len(self.geo)) if int(self.geo[i, 9]) == bi]
        rows = self.geo[idx]
        texts = [r['text'] for r in self.blocks[bi]]

        def nearest(py, px):
            if len(py) == 0:
                return np.zeros(0, int)
            best = np.full(len(py), np.inf); arg = np.zeros(len(py), int)
            for k, (ox, oy, ux, uy, nx, ny, adv, asc, desc, _) in enumerate(rows):
                dx, dy = px + 0.5 - ox, py + 0.5 - oy
                u = dx * ux + dy * uy; v = dx * nx + dy * ny
                d = np.hypot(np.maximum(np.maximum(-u, 0), u - adv),
                             np.maximum(np.maximum(-desc - v, 0), v - asc))
                m = d + 1e-3 * np.hypot(np.maximum(np.maximum(-u, 0), u - adv), v - (asc - desc) / 2)
                better = m < best
                best = np.where(better, m, best); arg = np.where(better, k, arg)
            return arg
        ra, rb = nearest(Ay, Ax), nearest(By, Bx)
        ux, uy, nx, ny = self.frame[bi]
        st1 = np.ones((3, 3), bool)
        worst = (2.0, None); cal = cno = 0.0; n = 0
        for k in range(len(rows)):
            sa, sb = ra == k, rb == k
            if sa.sum() < self.RUN_MIN:
                continue
            n += 1
            ay, ax, by, bx = Ay[sa], Ax[sa], By[sb], Bx[sb]
            if len(by) == 0:
                v = 0.0
                cal = cno = float('inf')
            else:
                yy = np.concatenate([ay, by]); xx = np.concatenate([ax, bx])
                y0, x0 = yy.min() - 2, xx.min() - 2
                A = np.zeros((yy.max() - y0 + 3, xx.max() - x0 + 3), bool); A[ay - y0, ax - x0] = True
                B = np.zeros_like(A); B[by - y0, bx - x0] = True
                dA, dB = ndi.binary_dilation(A, st1), ndi.binary_dilation(B, st1)
                v = float((dA & dB).sum() / (dA | dB).sum())
                cal = max(cal, abs((bx.mean() - ax.mean()) * ux + (by.mean() - ay.mean()) * uy))
                cno = max(cno, abs((bx.mean() - ax.mean()) * nx + (by.mean() - ay.mean()) * ny))
            if v < worst[0]:
                worst = (v, texts[k])
        if n == 0:
            return dict(run_iou1_min=nan, run_min_text=None, run_cal_max=nan, run_cno_max=nan, n_runs=0)
        return dict(run_iou1_min=worst[0], run_min_text=worst[1], run_cal_max=cal, run_cno_max=cno, n_runs=n)

    def _agreement(self, bi, exact, slab, olab, H, W):
        out = {}
        for side, lab, lm in (('src', slab, exact.get('src')), ('ours', olab, exact.get('ours'))):
            if lm is None:
                continue
            ex = lm[lab['ys'], lab['xs']]
            known = ex >= 0
            mine_exact = known & (ex == bi)
            mine_near = known & (lab['lab'] == bi)
            out[f'{side}_exact_n'] = int(mine_exact.sum())
            out[f'{side}_lost_to_other'] = int((mine_exact & (lab['lab'] != bi)).sum())
            out[f'{side}_stolen_from_other'] = int((mine_near & (ex != bi)).sum())
            # ink attributed to this block that NO drawn text item covers (within 2 px): for the
            # src side this is non-text artwork that changed when text was stripped
            out[f'{side}_nontext'] = int(((lab['lab'] == bi) & ~known).sum())
        return out

    # -------------------------------------------------------- exact labels
    def label_map(self, items, hint='default', grow=2):
        """Render each block's items ALONE; label = block of max coverage.  Ink pixels a few px
        outside any coverage (threshold/antialias) take the nearest label within `grow` px."""
        import cairo
        H, W = self.art_dark.shape
        best = np.zeros((H, W), np.uint8)
        lab = np.full((H, W), -1, np.int32)
        by = {}
        for it in items:
            by.setdefault(it['block'], []).append(it)
        for bi, its in by.items():
            s = cairo.ImageSurface(cairo.FORMAT_A8, W, H)
            c = cairo.Context(s)
            R.draw_items(c, its, self.H_PT, hint=hint, color=(0, 0, 0))
            st = s.get_stride()
            cov = np.frombuffer(s.get_data(), np.uint8).reshape(H, st)[:, :W]
            upd = cov > best
            best = np.where(upd, cov, best)
            lab = np.where(upd, bi, lab)
        if grow:
            none = lab < 0
            _, (iy, ix) = ndi.distance_transform_edt(none, return_indices=True)
            grown = lab[iy, ix]
            dist = ndi.distance_transform_edt(none)
            lab = np.where(none & (dist <= grow), grown, lab)
        return lab


def classify_census(basenames):
    tot = {}
    for b in basenames:
        f = Figure(b)
        for c in f.cls:
            tot[c] = tot.get(c, 0) + 1
    return tot


if __name__ == '__main__':
    # CLI: fidelity.py <basename> <ours.png> [--mode dark|diff] [--T n]
    a = sys.argv[1:]
    if len(a) < 2:
        sys.exit(__doc__)
    mode = a[a.index('--mode') + 1] if '--mode' in a else 'dark'
    T = int(a[a.index('--T') + 1]) if '--T' in a else (128 if mode == 'dark' else 40)
    f = Figure(a[0], mode=mode, T=T)
    rows, fig = f.score(load_rgb(a[1]))
    for r in rows:
        print(json.dumps(dict(key=f.keys[r['block']], cls=f.cls[r['block']], **r), ensure_ascii=False))
    print(json.dumps(fig))
