#!/usr/bin/env python3
"""§C140 ⑥b R-d — which WRITTEN FORM of `font-kerning:none` does Chromium honour? 0 ISK, no MT.

    cd experiments/figure-text-translation
    FIGTEXT_PYLIBS=./pylibs python3 -u evidence/2026-09-17-c6b-build/instruments/rd_form_probe.py gen <scratch>
    node evidence/2026-09-17-c6b-build/instruments/rd_inline.mjs <scratch>          # inline DOM lengths
    for v in V0 V1 V2 V3 V4; do node render-check.mjs <scratch>/$v.svg <scratch>/$v.png 1200 520 1; done
    FIGTEXT_PYLIBS=./pylibs python3 -u evidence/2026-09-17-c6b-build/instruments/rd_form_probe.py analyse <scratch>

`gen` writes five planted SVGs that differ ONLY in how `font-kerning:none` is written on the probe <text>
elements, each built the way svgout.write_svg builds a real figure (an embedded FigIS woff2 subset from
svgout.subset_face, every <text> inside <g text-rendering="geometricPrecision">):
  V0  nothing (today's composer)
  V1  inline  style="font-kerning:none"
  V2  a <style> rule  .nk{font-kerning:none}  plus  class="nk"
  V3  a presentation attribute  font-kerning="none"
  V4  inline  style="font-kerning:normal"          (CONTROL: must equal V0)
and predictions.json: for each probe line, the kern-table sum (legacy `kern` of the same system TTF
svgout.FACES subsets; GPOS agrees for Latin, critic.md § Imprecise), the unkerned hmtx width, and the
LINEAR width compose.py's measuring context gives (hint metrics OFF - the planned width).

Probe lines (one per row, same x):
  L0 'AVAVAVAV'   Regular 9 pt   - many negative pairs
  L1 'Taugafrumur' Regular 9 pt  - the decision's own example (Ta)
  L2 'Taugafrumur' Bold 9 pt
  L3 'lllllll'    Regular 9 pt   - CONTROL: no kern pair, must not move under any form

`analyse` reads rd_inline.json (inline getComputedTextLength per variant per line) and V*.png (the
<img> route, render-check.mjs at 8 px/pt): the right ink edge of each row, in pt. Prints a table and a
verdict per form. Terminal marker: last stdout line `RD-DONE`.
"""
import json, sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[3]          # experiments/figure-text-translation
sys.path.insert(0, str(HERE))
import _deps                                         # noqa: E402,F401  (pylibs on sys.path)
import svgout                                        # noqa: E402

SCALE = 8.0                                          # px per pt in the <img> render
X0, Y0, DY, SIZE = 10.0, 16.0, 14.0, 9.0
W_PT, H_PT = 150.0, 65.0
LINES = [('L0', 'AVAVAVAV', False), ('L1', 'Taugafrumur', False),
         ('L2', 'Taugafrumur', True), ('L3', 'lllllll', False)]
VARIANTS = {
    'V0': dict(attr='', rule=''),
    'V1': dict(attr=' style="font-kerning:none"', rule=''),
    'V2': dict(attr=' class="nk"', rule='.nk{font-kerning:none}'),
    'V3': dict(attr=' font-kerning="none"', rule=''),
    'V4': dict(attr=' style="font-kerning:normal"', rule=''),
}


def kern_and_hmtx(text, bold):
    from fontTools.ttLib import TTFont
    f = TTFont(svgout.FACES[(bold, False)])
    upm = f['head'].unitsPerEm
    cmap = f.getBestCmap()
    g = [cmap[ord(c)] for c in text]
    hm = sum(f['hmtx'][n][0] for n in g)
    kt = f['kern'].kernTables[0] if 'kern' in f else None
    pairs = [(a, b, kt[(a, b)]) for a, b in zip(g, g[1:]) if kt is not None and (a, b) in kt.kernTable]
    k = sum(v for _, _, v in pairs)
    return hm * SIZE / upm, k * SIZE / upm, [(a, b, v) for a, b, v in pairs]


def linear(text, bold):
    import cairo
    S = 200.0 / 72.0
    surf = cairo.ImageSurface(cairo.FORMAT_A8, 8, 8)
    ctx = cairo.Context(surf)
    fo = cairo.FontOptions()
    fo.set_hint_metrics(cairo.HINT_METRICS_OFF)
    ctx.set_font_options(fo)
    ctx.select_font_face('Liberation Sans', cairo.FONT_SLANT_NORMAL,
                         cairo.FONT_WEIGHT_BOLD if bold else cairo.FONT_WEIGHT_NORMAL)
    ctx.set_font_size(SIZE * S)
    return ctx.text_extents(text).x_advance / S


def gen(out):
    out.mkdir(parents=True, exist_ok=True)
    import base64
    faces = []
    for bold in (False, True):
        chars = {c for _, t, b in LINES if b is bold for c in t}
        b64 = base64.b64encode(svgout.subset_face(svgout.FACES[(bold, False)], chars)).decode('ascii')
        faces.append(f"@font-face{{font-family:'{svgout.FAMILY}';font-weight:{700 if bold else 400};"
                     f"font-style:normal;src:url(data:font/woff2;base64,{b64}) format('woff2');}}")
    pred = {}
    for name, text, bold in LINES:
        h, k, pairs = kern_and_hmtx(text, bold)
        pred[name] = dict(text=text, bold=bold, size=SIZE, hmtx_pt=h, kern_pt=k,
                          kerned_pt=h + k, linear_pt=linear(text, bold), pairs=pairs)
    for v, spec in VARIANTS.items():
        texts = []
        for i, (name, text, bold) in enumerate(LINES):
            texts.append(f'<text id="{name}" x="{X0:.3f}" y="{Y0 + i * DY:.3f}" font-family="{svgout.FAMILY}" '
                         f'font-weight="{700 if bold else 400}" font-size="{SIZE:.3f}" fill="#000000" '
                         f'xml:space="preserve"{spec["attr"]}>{text}</text>')
        svg = (f'<?xml version="1.0" encoding="UTF-8"?>\n'
               f'<svg xmlns="http://www.w3.org/2000/svg" width="{W_PT * SCALE:.0f}" height="{H_PT * SCALE:.0f}" '
               f'viewBox="0 0 {W_PT} {H_PT}">\n<rect width="{W_PT}" height="{H_PT}" fill="#ffffff"/>\n'
               f"<style>{''.join(faces)}{spec['rule']}</style>\n"
               f'<g text-rendering="geometricPrecision">\n' + '\n'.join(texts) + '\n</g>\n</svg>\n')
        (out / f'{v}.svg').write_text(svg, encoding='utf-8')
    (out / 'predictions.json').write_text(json.dumps(pred, indent=1))
    print(json.dumps(pred, indent=1))
    print('RD-GEN-DONE')


def ink_right_pt(png, i):
    from PIL import Image
    im = Image.open(png).convert('L')
    w, h = im.size
    y_base = (Y0 + i * DY) * SCALE
    top, bot = int(y_base - SIZE * SCALE), int(y_base + 0.3 * SIZE * SCALE)
    px = im.load()
    right = None
    for x in range(w - 1, -1, -1):
        if any(px[x, y] < 128 for y in range(max(top, 0), min(bot, h))):
            right = x
            break
    return None if right is None else (right + 1) / SCALE


def analyse(out):
    pred = json.loads((out / 'predictions.json').read_text())
    inline = json.loads((out / 'rd_inline.json').read_text())
    rows = []
    for i, (name, text, bold) in enumerate(LINES):
        p = pred[name]
        r = dict(line=name, text=text, bold=bold, kern_pt=round(p['kern_pt'], 4),
                 linear_pt=round(p['linear_pt'], 4), kerned_pt=round(p['kerned_pt'], 4))
        for v in VARIANTS:
            r[f'{v}_inline'] = round(inline[v][name], 4)
            r[f'{v}_img_ink'] = ink_right_pt(out / f'{v}.png', i)
        rows.append(r)
    print(json.dumps(rows, indent=1))
    print('\n# verdicts (inline: |len - linear| <= 0.02 pt means unkerned; <img>: ink moved vs V0 by the predicted -kern)')
    for v in VARIANTS:
        un_inline = all(abs(r[f'{v}_inline'] - r['linear_pt']) <= 0.02 for r in rows)
        kerned_inline = all(abs(r[f'{v}_inline'] - r['kerned_pt']) <= 0.02 for r in rows)
        img_moves = [(r['line'], None if r[f'{v}_img_ink'] is None or r['V0_img_ink'] is None
                      else round(r[f'{v}_img_ink'] - r['V0_img_ink'], 3), round(-r['kern_pt'], 3)) for r in rows]
        img_unkerned = all(d is not None and abs(d - e) <= 0.2 for _, d, e in img_moves)
        img_same_as_v0 = all(d is not None and abs(d) <= 0.13 for _, d, e in img_moves)
        print(f'{v}: inline unkerned={un_inline} inline kerned={kerned_inline} | '
              f'img moved-as-unkerned={img_unkerned} img same-as-V0={img_same_as_v0} | '
              f'img Δ vs V0 (line, measured, predicted-if-unkerned) {img_moves}')
    (out / 'rd-analysis.json').write_text(json.dumps(rows, indent=1))
    print('RD-DONE')


if __name__ == '__main__':
    mode, out = sys.argv[1], Path(sys.argv[2])
    gen(out) if mode == 'gen' else analyse(out)
