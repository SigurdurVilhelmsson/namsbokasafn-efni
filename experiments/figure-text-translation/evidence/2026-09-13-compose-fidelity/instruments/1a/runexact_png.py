#!/usr/bin/env python3
"""Run-exact renderer — a CALIBRATION CEILING for fidelity.py, NOT a composer fix.

Draws every run of runs.json at its own x, y (baseline origin), size, rot and fill,
with the Liberation Sans face matching meta.fonts[run.font].base (Regular / Italic /
Bold / BoldItalic), onto artwork.png at 200 dpi.  Nothing is grouped, wrapped,
re-anchored or re-flowed.  What this scores against the source raster is therefore
the noise floor of "a faithful redraw by cairo-toy text": hinting/antialias
differences vs poppler's embedded-font rasterisation, the STIX->Liberation fallback,
and the loss of intra-run TJ kerning (runs.json carries one origin per run).

Usage:
  runexact_png.py <prepdir> <out.png> [--hint none|default] [--no-fit-adv]
                  [--shift BLOCKIDX DXPX DYPX] [--flatten BLOCKIDX]

  --fit-adv (default ON): a run whose cairo advance differs from its position-derived
      `adv` is drawn glyph by glyph with the difference spread evenly over its gaps, so
      the first and last glyph origins land where the PDF put them.  `adv` is data
      runs.json already holds; this is not layout.
  --shift / --flatten: PLANTED DEFECTS for control (iv).  BLOCKIDX is the index into
      figtext.merge_blocks(figtext.group(runs)) — the composer's own block order.
      --flatten draws every run of that block at the block's max size on the baseline
      of the max-size run of its line (sub/superscripts flattened, as compose.py does).

The item model is shared with fidelity.py's exact-attribution label renderer:
  {text, x, y (pt, PDF y-up baseline origin), rot (deg), size (pt), bold, italic,
   rgb, dx (pt, along-baseline offset), block}
and draw is: translate(x*S,(H-y)*S); rotate(-rot); move_to(dx*S,0); show_text.
That is exactly compose.py's two draw paths (straight: dx=0; arc: dx=-w/2).
"""
import sys, json, math
from pathlib import Path

EXP = Path('/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation')
sys.path.insert(0, str(EXP))
import cairo  # system pycairo
import figtext as FT  # noqa: E402

DPI = 200.0
S = DPI / 72.0
FAMILY = 'Liberation Sans'


def cmyk(f):
    """Identical to compose.py's cmyk() so colour is not a difference between the two."""
    if not f:
        return (0, 0, 0)
    _, c, m, y, k = f
    return ((1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k))


def face_of(base):
    b = base.split('+')[-1].lower()
    return ('bold' in b, 'italic' in b or 'oblique' in b, 'liberation' in b)


def font_options(hint):
    fo = cairo.FontOptions()
    if hint == 'none':
        fo.set_hint_style(cairo.HINT_STYLE_NONE)
        fo.set_hint_metrics(cairo.HINT_METRICS_OFF)
    return fo


_MEAS = None


def _meas_ctx():
    global _MEAS
    if _MEAS is None:
        s = cairo.ImageSurface(cairo.FORMAT_A8, 4, 4)
        _MEAS = cairo.Context(s)
        _MEAS.set_font_options(font_options('none'))
    return _MEAS


def advance_pt(text, size, bold, italic):
    c = _meas_ctx()
    c.select_font_face(FAMILY, cairo.FONT_SLANT_ITALIC if italic else cairo.FONT_SLANT_NORMAL,
                       cairo.FONT_WEIGHT_BOLD if bold else cairo.FONT_WEIGHT_NORMAL)
    c.set_font_size(size * S)
    return c.text_extents(text).x_advance / S


def load(prepdir):
    prepdir = Path(prepdir)
    meta = json.loads((prepdir / 'meta.json').read_text())
    runs = json.loads((prepdir / 'runs.json').read_text())
    blocks = FT.merge_blocks(FT.group(runs))
    return meta, runs, blocks


def run_items(meta, blocks, fit_adv=True, shift=None, flatten=None):
    """One item per run (or per glyph when fit_adv spreads a run).  Returns (items, stats)."""
    items, stats = [], {'runs': 0, 'symfont_runs': 0, 'adv_fit_runs': 0, 'max_adv_err_pt': 0.0}
    for bi, b in enumerate(blocks):
        flat = {}
        if flatten is not None and bi == flatten:
            msz = max(r['size'] for r in b)
            for line in FT.lines(b):
                big = max(line, key=lambda r: r['size'])
                for r in line:
                    flat[id(r)] = (msz, big)
        for r in b:
            stats['runs'] += 1
            bold, italic, lib = face_of(meta['fonts'][r['font']]['base'])
            if not lib:
                stats['symfont_runs'] += 1
            size, x, y = r['size'], r['x'], r['y']
            if id(r) in flat:
                size, big = flat[id(r)]
                # move the run's origin onto the big run's baseline (along the normal)
                a = math.radians(r['rot'])
                dp = FT.proj(big) - FT.proj(r)
                x, y = x - dp * math.sin(a), y + dp * math.cos(a)
            if shift is not None and bi == shift[0]:
                x += shift[1] / S
                y -= shift[2] / S          # device +dy is PDF -y
            base = dict(rot=r['rot'], size=size, bold=bold, italic=italic,
                        rgb=cmyk(r['fill']), block=bi)
            text = r['text']
            n = len(text)
            if fit_adv and n > 1:
                advs = [advance_pt(ch, size, bold, italic) for ch in text]
                err = r['adv'] - sum(advs)
                # the run's adv ends at the LAST glyph's own advance, so spread over n-1 gaps
                stats['max_adv_err_pt'] = max(stats['max_adv_err_pt'], abs(err))
                if abs(err) > 0.05:
                    stats['adv_fit_runs'] += 1
                    extra = err / (n - 1)
                    a = math.radians(r['rot'])
                    off = 0.0
                    for ch, w in zip(text, advs):
                        items.append(dict(base, text=ch, x=x + off * math.cos(a),
                                          y=y + off * math.sin(a), dx=0.0))
                        off += w + extra
                    continue
            items.append(dict(base, text=text, x=x, y=y, dx=0.0))
    return items, stats


def draw_items(ctx, items, H_PT, hint='default', italic_ok=True, color=None):
    if hint == 'none':
        ctx.set_font_options(font_options('none'))
    for it in items:
        ctx.select_font_face(FAMILY,
                             cairo.FONT_SLANT_ITALIC if (italic_ok and it.get('italic')) else cairo.FONT_SLANT_NORMAL,
                             cairo.FONT_WEIGHT_BOLD if it['bold'] else cairo.FONT_WEIGHT_NORMAL)
        ctx.set_font_size(it['size'] * S)
        ctx.save()
        ctx.translate(it['x'] * S, (H_PT - it['y']) * S)
        ctx.rotate(-math.radians(it['rot']))
        ctx.set_source_rgb(*(color or it['rgb']))
        ctx.move_to(it['dx'] * S, 0)
        ctx.show_text(it['text'])
        ctx.restore()


def render(prepdir, items, meta, hint='default'):
    """items drawn over artwork.png exactly as compose.py composites (white, artwork, text)."""
    prepdir = Path(prepdir)
    H_PT = meta['page'][1]
    art = cairo.ImageSurface.create_from_png(str(prepdir / 'artwork.png'))
    out = cairo.ImageSurface(cairo.FORMAT_RGB24, art.get_width(), art.get_height())
    ctx = cairo.Context(out)
    ctx.set_source_rgb(1, 1, 1); ctx.paint()
    ctx.set_source_surface(art, 0, 0); ctx.paint()
    draw_items(ctx, items, H_PT, hint=hint)
    return out


def main(argv):
    args = [a for a in argv]
    if len(args) < 2:
        sys.exit(__doc__)
    prepdir, outpng = args[0], args[1]
    hint = args[args.index('--hint') + 1] if '--hint' in args else 'none'
    fit = '--no-fit-adv' not in args
    shift = None
    if '--shift' in args:
        i = args.index('--shift')
        shift = (int(args[i + 1]), float(args[i + 2]), float(args[i + 3]))
    flatten = int(args[args.index('--flatten') + 1]) if '--flatten' in args else None
    meta, runs, blocks = load(prepdir)
    items, stats = run_items(meta, blocks, fit_adv=fit, shift=shift, flatten=flatten)
    surf = render(prepdir, items, meta, hint=hint)
    surf.write_to_png(outpng)
    print(json.dumps(dict(stats, out=outpng, hint=hint, fit_adv=fit, shift=shift, flatten=flatten)))


if __name__ == '__main__':
    main(sys.argv[1:])
