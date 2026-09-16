#!/usr/bin/env python3
"""§C140 ⑩ — locate, measure and (when a gate approves) heal the ring `pdftocairo -svg`
writes around a soft-mask raster.

THE DEFECT (root cause measured 2026-09-13, `evidence/2026-09-13-t23/reports/c10-brain.md`).
A PDF soft mask is a group poppler rasterises at 1 px per user unit over the WHOLE-NUMBER
extents of the clip it is painted under.  It fills that surface with the mask's `/BC`
backdrop and then paints the group clipped, so an outer row or column the clip only partly
covers keeps the backdrop.  With `/BC [1.0]` that is ~opaque where the source mask is ~0.
The browser upsamples the raster bilinearly, which spreads the bright value inside the clip:
a 1–2 px light outline of the masked form's BBox, absent from the source and absent from
`pdftocairo -png` of the same file.

THE TRAP, AND WHY THIS MODULE HAS A GATE AT ALL.  The byte-level signature — outer ring far
brighter than its inner neighbour — is NOT sufficient.  Measured on `CNX_Chem_03_01_exocytosis`
(`evidence/2026-09-13-t23/reports/exo-spike.md` §7): `mask-491` carries the signature on three
sides, nothing is visible on screen, and overwriting the ring DESTROYS the axon's real edge
shading.  A heal driven by the byte signature alone is a content-destroying false positive on
8 of the 9 candidate masks in the artwork `pdftocairo` derives from this corpus's source PDFs
(measured 2026-09-15; the committed brain SVG has carried the heal since).  So the decision is made on a RENDER, by
intervention: heal a side only if healing it demonstrably removes a light line.

Public API (all pure; nothing here writes a file):

    find_candidates(svg_text)     -> [Candidate]   structure + byte statistics + geometry
    edgeline(profile, c)          -> float         the frozen c10 edge-line statistic
    side_profiles(lum, rect, s)   -> {side: (profile, position)}
    gate(candidates, lum_before, lum_after, scale) -> {mask_id: Verdict}
    heal(svg_text, approved)      -> (new_text, report)

Run `figure-rings.py` for the CLI, `test_figrings.py` for the tests.
"""
import base64
import io
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

HERE = Path(__file__).resolve().parent          # never process.cwd() — repo rule
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / 'pylibs'))

SVG_NS = 'http://www.w3.org/2000/svg'
XLINK_HREF = '{http://www.w3.org/1999/xlink}href'

# ---------------------------------------------------------------------------
# Thresholds.  Every one of these is a measured value, not a chosen one; the
# measurement that fixes it is named beside it.  They are conjunctive and
# fail-closed: a mask must clear ALL of them to be healed.
# ---------------------------------------------------------------------------

#: Byte-level candidate rule: outer ring minus next ring in, in alpha units.
#: c10's census rule.  Its job is to find CANDIDATES cheaply, without a browser;
#: it is deliberately NOT the heal decision — it false-positives 8 of 9 (see above).
RING_BYTES = 50.0

#: Render-level, per side.  `before` is the c10 edge-line statistic on the unhealed
#: render; `delta` is how much healing that side reduces it.
#: Measured spread on the whole corpus of candidates (9 masks, 36 sides, 2026-09-15):
#:   brain mask-2      4 sides, before 10.3‥35.0, delta 10.3‥34.5   (ring visible)
#:   exocytosis        32 sides, delta ≤ 10.2, and only ONE side ≥ 8 (mask-491 bottom,
#:                     the side exo-spike §7 measured the heal as DAMAGING)
#: So no per-side threshold separates them — brain's weakest side is 10.3 against
#: mask-491's 10.2.  The per-mask rules below are what separate.
SIDE_FLOOR = 10.0
SIDE_DROP = 8.0

#: Per-mask rule 1 — at least this many cut sides must pass the per-side test.
#: This is a MECHANISM, not a fitted number: poppler fills the whole raster surface with
#: `/BC`, so a genuine ring is a property of the entire perimeter the clip cuts.  A single
#: side firing alone is better explained by picture content than by the backdrop.
#: Measured: brain 4 of 4 sides; every exocytosis mask 0 or 1.
MASK_MIN_SIDES = 2

#: Per-mask rule 2 — the strongest side must clear this.  Measured: brain 34.5,
#: exocytosis best 10.2.
MASK_MIN_DELTA = 20.0


class Candidate:
    """One soft-mask raster that carries the byte signature, with the geometry needed to
    find it in a render.  `rect` is the wrapping clip's rect in ROOT user units."""

    __slots__ = ('mask', 'image', 'px', 'transformed', 'rect', 'raster_rect',
                 'ring', 'cut', 'refuse')

    def __init__(self, **kw):
        for k in self.__slots__:
            setattr(self, k, kw.get(k))

    def as_dict(self):
        return {k: getattr(self, k) for k in self.__slots__}

    def __repr__(self):
        return f'<Candidate {self.mask} {self.px} refuse={self.refuse}>'


# ---------------------------------------------------------------------------
# Geometry
# ---------------------------------------------------------------------------

def _tag(e):
    return e.tag.split('}')[-1]


def parse_transform(s):
    """Compose an SVG transform list into a 3×3 matrix (nested lists, no numpy).

    Only the forms cairo emits: matrix(), translate(), scale()."""
    m = [[1.0, 0, 0], [0, 1.0, 0], [0, 0, 1.0]]
    if not s:
        return m
    for name, args in re.findall(r'(matrix|translate|scale)\s*\(([^)]*)\)', s):
        v = [float(x) for x in re.split(r'[,\s]+', args.strip()) if x]
        if name == 'matrix':
            a, b, c, d, e, f = v
            t = [[a, c, e], [b, d, f], [0, 0, 1]]
        elif name == 'translate':
            e = v[0]
            f = v[1] if len(v) > 1 else 0.0
            t = [[1, 0, e], [0, 1, f], [0, 0, 1]]
        else:
            sx = v[0]
            sy = v[1] if len(v) > 1 else sx
            t = [[sx, 0, 0], [0, sy, 0], [0, 0, 1]]
        m = _matmul(m, t)
    return m


def _matmul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]


def _apply(m, x, y):
    return (m[0][0] * x + m[0][1] * y + m[0][2],
            m[1][0] * x + m[1][1] * y + m[1][2])


def _clip_rect(el):
    """Bounding rect of a <clipPath>.  cairo emits an axis-aligned rect, as a <rect> or as
    a 4-corner <path>; anything else returns None and the mask is refused, not guessed at."""
    for ch in el:
        if _tag(ch) == 'rect':
            x, y = float(ch.get('x', 0)), float(ch.get('y', 0))
            return (x, y, x + float(ch.get('width', 0)), y + float(ch.get('height', 0)))
        if _tag(ch) == 'path':
            nums = [float(n) for n in re.findall(r'-?\d+\.?\d*(?:e-?\d+)?', ch.get('d', ''))]
            if len(nums) < 8:
                return None
            xs, ys = nums[0::2], nums[1::2]
            return (min(xs), min(ys), max(xs), max(ys))
    return None


def _ring_from_png(b64, use_filter):
    """Per-side ring excess (outer row/col mean minus the next one in), in alpha units.

    The mask VALUE is what the SVG computes, which depends on the filter cairo attached:
    `filter-remove-color` leaves alpha alone, `filter-color-to-alpha` folds luminance in."""
    from PIL import Image
    raw = base64.b64decode(b64)
    im = Image.open(io.BytesIO(raw)).convert('RGBA')
    w, h = im.size
    px = im.load()

    def val(x, y):
        r, g, b, a = px[x, y]
        if 'color-to-alpha' in (use_filter or ''):
            return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0 * a
        return float(a)

    if w < 4 or h < 4:
        return None, (w, h)

    def mean(vals):
        vals = list(vals)
        return sum(vals) / len(vals) if vals else 0.0

    ring = {
        'top': mean(val(x, 0) for x in range(1, w - 1)) - mean(val(x, 1) for x in range(2, w - 2)),
        'bottom': mean(val(x, h - 1) for x in range(1, w - 1)) - mean(val(x, h - 2) for x in range(2, w - 2)),
        'left': mean(val(0, y) for y in range(1, h - 1)) - mean(val(1, y) for y in range(2, h - 2)),
        'right': mean(val(w - 1, y) for y in range(1, h - 1)) - mean(val(w - 2, y) for y in range(2, h - 2)),
    }
    return {k: round(v, 1) for k, v in ring.items()}, (w, h)


def find_candidates(svg_text, ring_bytes=RING_BYTES):
    """Every image-backed soft mask reachable from the root, with geometry and byte statistics.

    Returns candidates only (ring ≥ `ring_bytes` on some side, untransformed use, i.e. the
    shape this defect has).  A mask that carries the signature but cannot be paired with a
    rect clip, or whose image is referenced more than once, is returned with `.refuse` set —
    it is NEVER silently dropped, because c10 measured 0 of those in this corpus and an
    untested branch that quietly does nothing is how the defect comes back.
    """
    root = ET.fromstring(svg_text)
    ids = {e.get('id'): e for e in root.iter() if e.get('id')}

    rasters = {}
    for m in root.iter('{%s}mask' % SVG_NS):
        for u in m.iter('{%s}use' % SVG_NS):
            ref = (u.get(XLINK_HREF) or u.get('href') or '')[1:]
            el = ids.get(ref)
            if el is not None and _tag(el) == 'image':
                rasters[m.get('id')] = (ref, el, u)

    vb = [float(x) for x in re.split(r'[,\s]+', (root.get('viewBox') or '0 0 1 1').strip())]
    hits = []

    def walk(el, ctm, clips, depth, seen):
        if depth > 500:
            return
        ctm = _matmul(ctm, parse_transform(el.get('transform')))
        if _tag(el) == 'use':
            ctm = _matmul(ctm, parse_transform(
                'translate(%s,%s)' % (el.get('x', 0), el.get('y', 0))))
        cp = el.get('clip-path')
        if cp and '#' in cp:
            cid = cp[cp.find('#') + 1:cp.find(')')]
            cel = ids.get(cid)
            r = _clip_rect(cel) if cel is not None else None
            if r:
                clips = clips + [(cid, r, ctm)]
        # ⚠️ MEASURED, and it is the whole reason this branch exists: cairo emulates PDF
        # blend modes with <filter><feImage href="#g">…, so on a figure carrying blend
        # paints the masked groups are reachable ONLY through filters.  A walker that
        # skips filters finds 0 masks on CNX_Chem_03_01_exocytosis — the one figure in
        # the corpus where the byte detector false-positives — and reports it as clean.
        flt = el.get('filter')
        if flt and flt.startswith('url('):
            fel = ids.get(flt[flt.find('#') + 1:flt.find(')')])
            if fel is not None and _tag(fel) == 'filter':
                for fe in fel:
                    if _tag(fe) != 'feImage':
                        continue
                    ref = (fe.get(XLINK_HREF) or fe.get('href') or '')[1:]
                    tgt = ids.get(ref)
                    if tgt is None or ref in seen:
                        continue
                    fctm = _matmul(ctm, parse_transform(
                        'translate(%s,%s)' % (fe.get('x', 0), fe.get('y', 0))))
                    walk(tgt, fctm, clips, depth + 1, seen | {ref})
        mk = el.get('mask')
        if mk and '#' in mk:
            mid = mk[mk.find('#') + 1:mk.find(')')]
            if mid in rasters:
                hits.append((mid, ctm, clips))
        if _tag(el) == 'use':
            ref = (el.get(XLINK_HREF) or el.get('href') or '')[1:]
            tgt = ids.get(ref)
            if tgt is not None and _tag(tgt) != 'image':
                walk(tgt, ctm, clips, depth + 1, seen)
            return
        for ch in el:
            if _tag(ch) in ('defs', 'clipPath', 'mask', 'filter', 'image'):
                continue
            walk(ch, ctm, clips, depth + 1, seen)

    for ch in root:
        if _tag(ch) == 'defs':
            continue
        walk(ch, [[1.0, 0, 0], [0, 1.0, 0], [0, 0, 1.0]], [], 0, frozenset())

    out, seen_rec = [], set()
    for mid, ctm, clips in hits:
        key = (mid, tuple(round(v, 6) for row in ctm for v in row))
        if key in seen_rec:
            continue
        seen_rec.add(key)
        ref, img_el, use_el = rasters[mid]
        href = img_el.get(XLINK_HREF) or img_el.get('href')
        b64 = href.split('base64,', 1)[1]
        ring, (w, h) = _ring_from_png(b64, use_el.get('filter'))
        transformed = bool(use_el.get('transform'))
        if ring is None or transformed or not any(v >= ring_bytes for v in ring.values()):
            continue

        refuse = None
        rect = None
        if not clips:
            refuse = 'no-clip'
        else:
            cid, r, cctm = clips[-1]
            x0, y0 = _apply(cctm, r[0], r[1])
            x1, y1 = _apply(cctm, r[2], r[3])
            rect = [round(min(x0, x1), 4), round(min(y0, y1), 4),
                    round(max(x0, x1), 4), round(max(y0, y1), 4)]
        if svg_text.count('href="#%s"' % ref) != 1:
            refuse = 'shared-image'

        iw = float(img_el.get('width', w))
        ih = float(img_el.get('height', h))
        rx0, ry0 = _apply(ctm, 0, 0)
        rx1, ry1 = _apply(ctm, iw, ih)
        raster_rect = [round(min(rx0, rx1), 4), round(min(ry0, ry1), 4),
                       round(max(rx0, rx1), 4), round(max(ry0, ry1), 4)]

        cut = None
        if clips and refuse is None:
            _, r, _ = clips[-1]
            cut = {'left': r[0] > 0, 'right': r[2] < iw, 'top': r[1] > 0, 'bottom': r[3] < ih}
            if not any(cut.values()):
                refuse = 'clip-uncut'

        out.append(Candidate(mask=mid, image=ref, px=[w, h], transformed=transformed,
                             rect=rect, raster_rect=raster_rect, ring=ring, cut=cut,
                             refuse=refuse))
    out.sort(key=lambda c: int(re.sub(r'\D', '', c.mask) or 0))
    return out, vb


# ---------------------------------------------------------------------------
# Render-level statistics
# ---------------------------------------------------------------------------

def luminance(png_path):
    """Rec.709 luminance of a render, as a 2-D numpy array."""
    import numpy as np
    from PIL import Image
    a = np.asarray(Image.open(png_path).convert('RGB')).astype(float)
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def edgeline(profile, c):
    """The frozen c10 edge-line statistic: the brightest 1-px line inside a ±2 px band at
    `c`, minus the median of its ±6 px neighbourhood.  None when the band runs off the end.

    ⚠️ ONE-SIDED ON PURPOSE.  The ring paints the masked content where it should be
    transparent, which on this defect reads LIGHT.  A two-sided max-|·| rule instead reports
    the masked shape's own legitimate DARK boundary: measured on brain, it scores −25.5 on a
    correctly healed edge, i.e. it would call a repaired figure defective.
    """
    import numpy as np
    c = int(round(c))
    if c - 2 < 6 or c + 2 >= len(profile) - 6:
        return None
    return float(max(profile[x] - np.median(profile[x - 6:x + 7]) for x in range(c - 2, c + 3)))


def side_profiles(lum, rect, scale, inset=0.15):
    """Perpendicular profiles for the four sides of `rect` (root user units × `scale`).

    The run is inset from each end so a corner — where two edges meet and neither statistic
    is about one side alone — does not enter either profile."""
    x0, y0, x1, y1 = [v * scale for v in rect]
    h, w = lum.shape
    my = max(2.0, (y1 - y0) * inset)
    mx = max(2.0, (x1 - x0) * inset)
    ya, yb = max(0, int(y0 + my)), min(h, int(y1 - my))
    xa, xb = max(0, int(x0 + mx)), min(w, int(x1 - mx))
    pv = lum[ya:yb, :].mean(0) if yb - ya >= 3 else None
    ph = lum[:, xa:xb].mean(1) if xb - xa >= 3 else None
    return {'left': (pv, x0), 'right': (pv, x1), 'top': (ph, y0), 'bottom': (ph, y1)}


def gate(candidates, lum_before, lum_after, scale,
         side_floor=SIDE_FLOOR, side_drop=SIDE_DROP,
         min_sides=MASK_MIN_SIDES, min_delta=MASK_MIN_DELTA):
    """Decide, per mask, whether the ring is a VISIBLE light line that healing removes.

    `lum_after` must be a render of the SAME svg with every cut side of every candidate
    healed — the counterfactual.  The decision is interventional: a side counts only if
    healing it actually reduces the edge-line statistic.  Measured 2026-09-15: a threshold
    on `lum_before` alone approves `mask-271` right (33.2) and `mask-189` right (11.0) on
    exocytosis, where the heal changes the statistic by 0.0 — those lines are picture
    content, and only the intervention tells them apart.

    Conjunctive and fail-closed: a refused candidate is never approved, whatever it scores.
    """
    verdicts = {}
    for c in candidates:
        v = {'mask': c.mask, 'refuse': c.refuse, 'sides': {}, 'approved': False,
             'reason': None}
        if c.refuse or not c.rect:
            v['reason'] = c.refuse or 'no-rect'
            verdicts[c.mask] = v
            continue
        pb = side_profiles(lum_before, c.rect, scale)
        pa = side_profiles(lum_after, c.rect, scale)
        passed, best = 0, 0.0
        for side in ('left', 'right', 'top', 'bottom'):
            if not (c.cut or {}).get(side):
                continue
            prof_b, pos = pb[side]
            prof_a, _ = pa[side]
            if prof_b is None or prof_a is None:
                v['sides'][side] = {'before': None, 'after': None, 'delta': None, 'pass': False}
                continue
            b = edgeline(prof_b, pos)
            a = edgeline(prof_a, pos)
            if b is None or a is None:
                v['sides'][side] = {'before': b, 'after': a, 'delta': None, 'pass': False}
                continue
            d = b - a
            ok = (b >= side_floor) and (d >= side_drop)
            passed += ok
            best = max(best, d)
            v['sides'][side] = {'before': round(b, 1), 'after': round(a, 1),
                                'delta': round(d, 1), 'pass': bool(ok)}
        v['sidesPassed'] = passed
        v['bestDelta'] = round(best, 1)
        if passed >= min_sides and best >= min_delta:
            v['approved'] = True
        else:
            v['reason'] = ('sides %d < %d' % (passed, min_sides) if passed < min_sides
                           else 'bestDelta %.1f < %.1f' % (best, min_delta))
        verdicts[c.mask] = v
    return verdicts


# ---------------------------------------------------------------------------
# The heal
# ---------------------------------------------------------------------------

_MASK_RE = re.compile(r'<mask id="(mask-\d+)">\n<g filter="url\(#filter-remove-color\)">\n'
                      r'<use xlink:href="#(source-\d+)"/>\n</g>\n</mask>')
_NUM = r'(-?[\d.]+)'


def heal(svg_text, approved):
    """Overwrite each cut outer row/column of every APPROVED mask with its inner neighbour.

    `approved` is a set of mask ids — normally the ones `gate()` approved.  A mask not in
    that set is not touched, and neither is a mask whose structure does not match exactly:
    this function re-derives the pairing itself rather than trusting the caller's geometry,
    so a caller that got its ids from somewhere else still cannot damage an unpaired mask.

    Returns (new_text, report).  Only the base64 payload of an approved mask's <image>
    changes; every other byte of the document is left alone.
    """
    from PIL import Image
    import numpy as np
    edits = []
    rep = {'rasterMasks': 0, 'healed': 0, 'sidesHealed': 0, 'notApproved': [],
           'noClip': [], 'sharedImage': [], 'clipUncut': [], 'unmatched': []}
    for m in _MASK_RE.finditer(svg_text):
        mid, sid = m.group(1), m.group(2)
        rep['rasterMasks'] += 1
        if mid not in approved:
            rep['notApproved'].append(mid)
            continue
        c = re.search(r'<g clip-path="url\(#(clip-\d+)\)">\n<g mask="url\(#%s\)">' % mid, svg_text)
        cp = c and re.search(
            r'<clipPath id="%s">\n<path clip-rule="nonzero" d="M %s %s L %s %s L %s %s L %s %s Z'
            % ((c.group(1),) + (_NUM,) * 8), svg_text)
        if not cp:
            rep['noClip'].append(mid)
            continue
        if len(re.findall(r'href="#%s"' % sid, svg_text)) != 1:
            rep['sharedImage'].append(sid)
            continue
        im = re.search(r'<image id="%s" x="0" y="0" width="(\d+)" height="(\d+)" '
                       r'xlink:href="data:image/png;base64,([A-Za-z0-9+/=]+)"' % sid, svg_text)
        if not im:
            rep['unmatched'].append(sid)
            continue
        w, h = int(im.group(1)), int(im.group(2))
        xs = [float(cp.group(i)) for i in (1, 3, 5, 7)]
        ys = [float(cp.group(i)) for i in (2, 4, 6, 8)]
        cut = {'left': min(xs) > 0, 'right': max(xs) < w,
               'top': min(ys) > 0, 'bottom': max(ys) < h}
        if w < 3 or h < 3 or not any(cut.values()):
            rep['clipUncut'].append(mid)
            continue
        a = np.array(Image.open(io.BytesIO(base64.b64decode(im.group(3)))).convert('RGBA'))
        # Order is load-bearing at the four CORNERS only: columns are written before rows,
        # so a corner ends up holding its DIAGONAL inner neighbour rather than the one the
        # row would have given it.  That is 4 pixels of a raster and it is what c10
        # measured; it is pinned in test_figrings.py so a reorder cannot change it silently.
        if cut['left']:
            a[:, 0] = a[:, 1]
        if cut['right']:
            a[:, -1] = a[:, -2]
        if cut['top']:
            a[0, :] = a[1, :]
        if cut['bottom']:
            a[-1, :] = a[-2, :]
        buf = io.BytesIO()
        Image.fromarray(a, 'RGBA').save(buf, 'PNG')
        edits.append((im.start(3), im.end(3), base64.b64encode(buf.getvalue()).decode('ascii')))
        rep['healed'] += 1
        rep['sidesHealed'] += sum(cut.values())
    for s, e, new in sorted(edits, reverse=True):
        svg_text = svg_text[:s] + new + svg_text[e:]
    return svg_text, rep


def all_cut_sides(candidates):
    """Every candidate that could be healed at all — the set the counterfactual render needs.

    The `after` render the gate compares against must have EVERY candidate healed, or a
    mask left out reads as delta 0 and is refused for the wrong reason."""
    return {c.mask for c in candidates if not c.refuse and c.cut and any(c.cut.values())}


def summary(candidates, verdicts=None):
    rows = []
    for c in candidates:
        row = c.as_dict()
        if verdicts:
            row['verdict'] = verdicts.get(c.mask)
        rows.append(row)
    return rows


if __name__ == '__main__':          # a bare run is a usage error, not a no-op
    sys.stderr.write(__doc__ + '\nRun figure-rings.py for the CLI.\n')
    sys.exit(2)
