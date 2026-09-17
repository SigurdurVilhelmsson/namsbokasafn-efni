#!/usr/bin/env python3
"""§C140 ⑥a — Task 4 Step 3 (P6): does FigSym actually render closer to the source than FigIS did?

    cd experiments/figure-text-translation
    FIGTEXT_PYLIBS=./pylibs python3 evidence/2026-09-17-c6a-build/instruments/chromium_stix.py \
        --recompose-set <recompose-set.txt> --after-textlists <after/textlists.json> \
        --before-work <SP/before/work> --after-work <SP/after/work> --after-prep <SP/after/prep> \
        --scratch <scratch dir> --out-dir <reports/after>

For every figure in the recompose set (one with >=1 FigSym item): render the SOURCE artwork PDF
(`<prep>/<b>/<b>.pdf` — the ORIGINAL staged artwork, not the de-texted `artwork.pdf` the composer
draws) with `pdftocairo -png -r 200 -singlefile`; render the BEFORE-SVG, the AFTER-SVG, and the
AFTER-SVG with its one `FigSym` `@font-face` rule surgically removed, each in a real browser
(`render-check.mjs`) at the source raster's own pixel size. For every FigSym `<text>` in the AFTER
textlist, crop a box around it (from its x/y/font-size, scaled by the SVG's own viewBox -> source
pixel ratio) in all four images, and record the mean absolute RGB difference to the source for
before/after, and the mean absolute difference between the no-rule and after crops (a mis-named
family falls back to a system font silently, so removing the rule MUST change something if the
family is actually in effect).

A blank-text run (chars are only `{' ', '+', '=', '×'}` on this corpus, per Task 1's recount) draws
no ink, so before == after == source there almost by construction; it is listed but EXCLUDED from
the "majority of FigSym texts" denominator P6 asks about (a tie on invisible ink is not evidence of
either rendering, and counting it would let a figure fail P6 for a reason that has nothing to do
with glyph fidelity). Both the raw (all texts) and glyph-only majority are reported.

Writes into --out-dir: `chromium-stix.txt` (per-figure and per-text numbers) and one composite
image per figure under `crops/<b>.png` (rows = FigSym texts, columns = source|before|after|no-rule,
nearest-neighbour zoomed for legibility). `chromium-look.md` is written separately, by hand, after
looking at >=3 crops (see the task report).
"""
import argparse, json, re, subprocess, sys
from pathlib import Path

import os

HERE = Path(__file__).resolve().parent
COMPOSER_DIR = HERE.parents[2]
os.environ.setdefault('FIGTEXT_PYLIBS', str(COMPOSER_DIR / 'pylibs'))
sys.path.insert(0, str(COMPOSER_DIR))
import _deps  # noqa: F401,E402  — puts pylibs (PIL, numpy) on sys.path

from PIL import Image, ImageDraw  # noqa: E402
import numpy as np  # noqa: E402

VIEWBOX = re.compile(r'viewBox="0 0 ([\d.]+) ([\d.]+)"')
FIGSYM_RULE = re.compile(r"@font-face\{font-family:'FigSym';[^}]*\}")
ZOOM = 5


def render_check(svg, out_png, w, h):
    subprocess.run(['node', str(COMPOSER_DIR / 'render-check.mjs'), str(svg), str(out_png), str(w), str(h), '1'],
                   check=True, cwd=str(COMPOSER_DIR), capture_output=True, text=True)


def make_no_rule_svg(after_svg_path, scratch_path):
    text = after_svg_path.read_text(encoding='utf-8')
    new_text, n = FIGSYM_RULE.subn('', text)
    assert n == 1, f'expected exactly 1 FigSym @font-face rule to remove in {after_svg_path}, found {n}'
    scratch_path.write_text(new_text, encoding='utf-8')
    return n


def crop_box(px, py, size_px, n_chars, w, h):
    width = max(size_px * (0.9 * max(n_chars, 1) + 1.2), 18)
    height = max(size_px * 2.1, 18)
    left = px - width * 0.3
    top = py - height * 0.72
    right = left + width
    bottom = top + height
    left, top = max(0, int(left)), max(0, int(top))
    right, bottom = min(w, int(right)), min(h, int(bottom))
    if right <= left:
        right = left + 1
    if bottom <= top:
        bottom = top + 1
    return left, top, right, bottom


def mean_abs_diff(a, b):
    aa = np.asarray(a.convert('RGB'), dtype=np.int16)
    bb = np.asarray(b.convert('RGB'), dtype=np.int16)
    if aa.shape != bb.shape:
        bb = np.asarray(b.convert('RGB').resize(a.size), dtype=np.int16)
    return float(np.abs(aa - bb).mean())


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--recompose-set', required=True)
    ap.add_argument('--after-textlists', required=True)
    ap.add_argument('--before-work', required=True)
    ap.add_argument('--after-work', required=True)
    ap.add_argument('--after-prep', required=True)
    ap.add_argument('--scratch', required=True)
    ap.add_argument('--out-dir', required=True)
    a = ap.parse_args()

    figs = [l for l in Path(a.recompose_set).read_text().split('\n') if l.strip()]
    assert figs, 'recompose set is empty — nothing to render (NEEDS_CONTEXT per the task rules)'
    textlists = json.loads(Path(a.after_textlists).read_text())
    by_base = {Path(p).parent.name: v for p, v in textlists.items()}

    scratch = Path(a.scratch)
    scratch.mkdir(parents=True, exist_ok=True)
    out_dir = Path(a.out_dir)
    crops_dir = out_dir / 'crops'
    crops_dir.mkdir(parents=True, exist_ok=True)

    report_lines = []
    for b in figs:
        assert b in by_base, f'{b} (in recompose set) has no after-textlist entry'
        entry = by_base[b]
        after_svg = Path(a.after_work) / b / 'translated.svg'
        before_svg = Path(a.before_work) / b / 'translated.svg'
        svg_text = after_svg.read_text(encoding='utf-8')
        m = VIEWBOX.search(svg_text)
        assert m, f'{b}: no viewBox found in after-SVG'
        vb_w, vb_h = float(m.group(1)), float(m.group(2))

        prep_dir = Path(a.after_prep) / b
        b_pdf = prep_dir / f'{b}.pdf'
        art_png = prep_dir / 'artwork.png'
        src_base = scratch / f'{b}-source'
        subprocess.run(['pdftocairo', '-png', '-r', '200', '-singlefile', str(b_pdf), str(src_base)], check=True)
        src_img = Image.open(f'{src_base}.png').convert('RGB')
        w, h = src_img.size
        with Image.open(art_png) as ai:
            assert ai.size == src_img.size, (f'{b}: source raster {src_img.size} != '
                                              f'prep artwork.png {ai.size} — page-box mismatch, skipping numbers')

        no_rule_svg = scratch / f'{b}-noRule.svg'
        make_no_rule_svg(after_svg, no_rule_svg)

        before_png = scratch / f'{b}-before.png'
        after_png = scratch / f'{b}-after.png'
        norule_png = scratch / f'{b}-noRule.png'
        render_check(before_svg, before_png, w, h)
        render_check(after_svg, after_png, w, h)
        render_check(no_rule_svg, norule_png, w, h)
        before_img = Image.open(before_png).convert('RGB').resize((w, h))
        after_img = Image.open(after_png).convert('RGB').resize((w, h))
        norule_img = Image.open(norule_png).convert('RGB').resize((w, h))

        scale_x, scale_y = w / vb_w, h / vb_h
        figsym_idx = [i for i, t in enumerate(entry['texts']) if t.get('family') == 'FigSym']
        assert figsym_idx, f'{b} is in the recompose set but has no FigSym text — inconsistent (NEEDS_CONTEXT)'

        rows = []
        diffs_before, diffs_after, norule_diffs = [], [], []
        glyph_before, glyph_after = [], []
        for i in figsym_idx:
            t = entry['texts'][i]
            x, y, size = float(t['x']), float(t['y']), float(t['size'])
            px, py = x * scale_x, y * scale_y
            size_px = size * scale_y
            box = crop_box(px, py, size_px, len(t['text']), w, h)
            c_src = src_img.crop(box)
            c_before = before_img.crop(box)
            c_after = after_img.crop(box)
            c_norule = norule_img.crop(box)
            d_before = mean_abs_diff(c_src, c_before)
            d_after = mean_abs_diff(c_src, c_after)
            d_norule = mean_abs_diff(c_after, c_norule)
            diffs_before.append(d_before)
            diffs_after.append(d_after)
            norule_diffs.append(d_norule)
            is_blank = t['text'].strip() == ''
            if not is_blank:
                glyph_before.append(d_before)
                glyph_after.append(d_after)
            report_lines.append(
                f'{b}\ttext_idx={i}\tchar={t["text"]!r}\tbox={box}\tdiff_before={d_before:.3f}'
                f'\tdiff_after={d_after:.3f}\timproved={d_after < d_before}\tblank={is_blank}'
                f'\tnorule_vs_after_diff={d_norule:.3f}\tnorule_differs={d_norule > 0.5}'
            )
            zoom = lambda im: im.resize(((box[2] - box[0]) * ZOOM, (box[3] - box[1]) * ZOOM), Image.NEAREST)
            rows.append([zoom(c_src), zoom(c_before), zoom(c_after), zoom(c_norule)])

        n = len(figsym_idx)
        raw_improved = sum(1 for db, da in zip(diffs_before, diffs_after) if da < db)
        glyph_improved = sum(1 for db, da in zip(glyph_before, glyph_after) if da < db)
        report_lines.append(
            f'{b}\tSUMMARY texts={n} raw_improved={raw_improved}/{n} '
            f'glyph_only_improved={glyph_improved}/{len(glyph_before)} '
            f'majority_raw={raw_improved * 2 > n} majority_glyph={len(glyph_before) > 0 and glyph_improved * 2 > len(glyph_before)} '
            f'any_norule_differs={any(d > 0.5 for d in norule_diffs)}'
        )

        # composite crop image: one row per FigSym text, 4 columns, labelled
        cell_w = max(r[0].width for r in rows)
        cell_h = max(r[0].height for r in rows)
        pad, label_h = 4, 18
        img_w = 4 * cell_w + 5 * pad
        img_h = len(rows) * (cell_h + pad) + label_h + pad
        canvas = Image.new('RGB', (img_w, img_h), 'white')
        draw = ImageDraw.Draw(canvas)
        for ci, label in enumerate(('source', 'before', 'after', 'no-rule')):
            draw.text((pad + ci * (cell_w + pad), 2), label, fill='black')
        for ri, row in enumerate(rows):
            y0 = label_h + ri * (cell_h + pad)
            for ci, im in enumerate(row):
                canvas.paste(im, (pad + ci * (cell_w + pad), y0))
        canvas.save(crops_dir / f'{b}.png')
        print(f'{b}: {n} FigSym texts, raw_improved={raw_improved}/{n}, '
              f'glyph_improved={glyph_improved}/{len(glyph_before)} -> {crops_dir / f"{b}.png"}', flush=True)

    (out_dir / 'chromium-stix.txt').write_text('\n'.join(report_lines) + '\n')
    print('DONE')


if __name__ == '__main__':
    main()
