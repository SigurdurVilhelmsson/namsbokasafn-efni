"""Post-pass, run AFTER driver_render.py's DONE line. For every figure with count_gt0>0 in
either PERSIST-vs-ORIG or NONTEXT-vs-ORIG (from render/results.jsonl):
  1. Re-render SOURCE/ORIG/PERSIST/NONTEXT (cheap -- these are few figures) and save a
     VERTICAL-stack crop (full width, one panel per row: SOURCE/ORIG/PERSIST/NONTEXT) plus a
     TIGHT crop of the largest connected diff component, at native resolution (no downscale).
  2. Run the SERIALISER control (strip ORIG's own output a second time) on THIS figure and
     append a variant=SERIALISER row to results.jsonl recording count_gt0/count_gt40 vs the
     first ORIG render.
Writes: render/crops/<basename>_stack.png, render/crops/<basename>_tight.png
Appends: render/results.jsonl (SERIALISER rows)
Prints one JSON line per figure to render/logs/post_pass.log; final line "DONE post_pass n=..".
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import strip_variants as sv  # noqa: E402
import numpy as np  # noqa: E402
import render_diff as rd  # noqa: E402
import population as poplib  # noqa: E402

SCRATCH = Path('/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore')
RESULTS = SCRATCH / 'render/results.jsonl'
PDF_TMP = SCRATCH / 'render/pdf_tmp'
PNG_TMP = SCRATCH / 'render/png_tmp'
CROPS = SCRATCH / 'render/crops'
for d in (PDF_TMP, PNG_TMP, CROPS):
    d.mkdir(parents=True, exist_ok=True)


def load_results():
    rows = []
    with open(RESULTS) as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def find_changed(rows):
    by_fig = {}
    for r in rows:
        by_fig.setdefault(r['basename'], {})[r['variant']] = r
    changed = []
    for basename, variants in by_fig.items():
        hit = False
        for v in ('PERSIST', 'NONTEXT'):
            d = variants.get(v, {}).get('diff_vs_orig')
            if d and d.get('size_match') and d.get('count_gt0', 0) > 0:
                hit = True
        if hit:
            changed.append(basename)
    return sorted(changed)


def connected_components(mask):
    """Pure-numpy/BFS 4-connectivity labelling (no scipy in pylibs). -> list of (size, bbox)
    sorted by size descending. bbox = [r0,r1,c0,c1] inclusive."""
    visited = np.zeros_like(mask, dtype=bool)
    h, w = mask.shape
    comps = []
    ys, xs = np.where(mask)
    coords = set(zip(ys.tolist(), xs.tolist()))
    seen = set()
    for start in coords:
        if start in seen:
            continue
        stack = [start]
        seen.add(start)
        members = []
        while stack:
            y, x = stack.pop()
            members.append((y, x))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if (ny, nx) in coords and (ny, nx) not in seen:
                    seen.add((ny, nx))
                    stack.append((ny, nx))
        ys_m = [m[0] for m in members]
        xs_m = [m[1] for m in members]
        comps.append((len(members), [min(ys_m), max(ys_m), min(xs_m), max(xs_m)]))
    comps.sort(key=lambda c: -c[0])
    return comps


def save_vertical_stack(arrays_labeled, out_path, max_width=1600):
    from PIL import Image, ImageDraw
    h, w = arrays_labeled[0][1].shape[:2]
    scale = min(1.0, max_width / w)
    pw, ph = int(w * scale), int(h * scale)
    label_h = 16
    total_h = (ph + label_h) * len(arrays_labeled)
    canvas = Image.new('RGB', (pw, total_h), (240, 240, 240))
    draw = ImageDraw.Draw(canvas)
    y = 0
    for label, arr in arrays_labeled:
        im = Image.fromarray(arr.astype(np.uint8), mode='RGB')
        if scale != 1.0:
            im = im.resize((pw, ph))
        draw.text((2, y + 1), label, fill=(0, 0, 0))
        canvas.paste(im, (0, y + label_h))
        y += ph + label_h
    canvas.save(out_path)


def save_tight_crop(arrays_labeled, bbox, out_path, margin=10):
    from PIL import Image, ImageDraw
    h, w = arrays_labeled[0][1].shape[:2]
    r0, r1, c0, c1 = bbox
    r0 = max(0, r0 - margin); r1 = min(h - 1, r1 + margin)
    c0 = max(0, c0 - margin); c1 = min(w - 1, c1 + margin)
    crops = []
    for label, arr in arrays_labeled:
        crop = arr[r0:r1 + 1, c0:c1 + 1].astype(np.uint8)
        crops.append((label, Image.fromarray(crop, mode='RGB')))
    sep = 6
    label_h = 16
    cw, ch = crops[0][1].size
    total_w = cw * len(crops) + sep * (len(crops) - 1)
    total_h = ch + label_h
    canvas = Image.new('RGB', (total_w, total_h), (240, 240, 240))
    draw = ImageDraw.Draw(canvas)
    x = 0
    for label, im in crops:
        canvas.paste(im, (x, label_h))
        draw.text((x + 2, 2), label, fill=(0, 0, 0))
        x += cw + sep
    canvas.save(out_path)


def process_one(basename, row):
    artwork = Path(row['artwork'])
    pdf_src = artwork
    staged_path = None
    if row['kind'] in ('eps', 'ai'):
        import driver_render as dr
        staged_path, err = dr.stage_eps(artwork, basename)
        if staged_path is None:
            return {'basename': basename, 'status': 'stage-fail', 'error': err}
        pdf_src = staged_path

    figdir_pdf = PDF_TMP / ('pp_' + basename)
    figdir_png = PNG_TMP / ('pp_' + basename)
    figdir_pdf.mkdir(parents=True, exist_ok=True)
    figdir_png.mkdir(parents=True, exist_ok=True)
    out = {'basename': basename}
    try:
        arrs = {}
        for variant in ('ORIG', 'PERSIST', 'NONTEXT'):
            out_pdf = figdir_pdf / f'{variant}.pdf'
            r = sv.run_variant(pdf_src, variant, out_pdf)
            if not r['ok']:
                out[f'{variant}_error'] = r['error']
                continue
            ok, err = rd.render_pdf_to_png(out_pdf, figdir_png / variant)
            out_pdf.unlink(missing_ok=True)
            if not ok:
                out[f'{variant}_render_error'] = err
                continue
            arrs[variant] = rd.load_rgb(str(figdir_png / f'{variant}.png'))
        ok, err = rd.render_pdf_to_png(pdf_src, figdir_png / 'SOURCE')
        if ok:
            arrs['SOURCE'] = rd.load_rgb(str(figdir_png / 'SOURCE.png'))
        else:
            out['source_render_error'] = err

        if 'ORIG' not in arrs:
            out['status'] = 'no-orig'
            return out

        # union diff mask across PERSIST and NONTEXT (whichever present)
        mask = None
        for v in ('PERSIST', 'NONTEXT'):
            if v in arrs and arrs[v].shape == arrs['ORIG'].shape:
                m = np.max(np.abs(arrs['ORIG'] - arrs[v]), axis=2) > 0
                mask = m if mask is None else (mask | m)
        if mask is None or not mask.any():
            out['status'] = 'no-diff-on-rerender'
            print(f'*** NON-DETERMINISM OR BUG: {basename} showed a diff in the main batch but '
                  f'NONE on re-render here -- investigate before trusting either run ***', flush=True)
            return out

        n_mask_px = int(mask.sum())
        if n_mask_px > 200_000:
            # A mask this large is a recoloured REGION, not a handful of small glyphs --
            # connected-component labelling here would be a slow Python BFS over hundreds of
            # thousands of pixels for no benefit. Use the whole-mask bbox instead and say so.
            rows_any = np.any(mask, axis=1); cols_any = np.any(mask, axis=0)
            r0, r1 = np.where(rows_any)[0][[0, -1]]
            c0, c1 = np.where(cols_any)[0][[0, -1]]
            out['n_components'] = None
            out['component_reason'] = f'mask too large ({n_mask_px} px > 200000) -- used whole-mask bbox'
            out['largest_component'] = {'size': n_mask_px, 'bbox': [int(r0), int(r1), int(c0), int(c1)]}
            comps = [(n_mask_px, out['largest_component']['bbox'])]
        else:
            comps = connected_components(mask)
            out['n_components'] = len(comps)
            out['largest_component'] = {'size': comps[0][0], 'bbox': comps[0][1]}

        order = [n for n in ('SOURCE', 'ORIG', 'PERSIST', 'NONTEXT') if n in arrs]
        stack_arrays = [(n, arrs[n]) for n in order]
        save_vertical_stack(stack_arrays, CROPS / f'{basename}_stack.png')
        save_tight_crop(stack_arrays, comps[0][1], CROPS / f'{basename}_tight.png', margin=12)
        out['stack_path'] = str(CROPS / f'{basename}_stack.png')
        out['tight_path'] = str(CROPS / f'{basename}_tight.png')

        # SERIALISER control on THIS figure: strip ORIG's own output a 2nd time
        orig_pdf2 = figdir_pdf / 'ORIG_for_serial.pdf'
        r = sv.run_variant(pdf_src, 'ORIG', orig_pdf2)
        serial_row = {'basename': basename, 'bought': row['bought'], 'artwork': row['artwork'],
                      'kind': row['kind'], 'variant': 'SERIALISER'}
        if r['ok']:
            serial2_pdf = figdir_pdf / 'ORIG_resaved.pdf'
            r2 = sv.run_variant(orig_pdf2, 'ORIG', serial2_pdf)
            orig_pdf2.unlink(missing_ok=True)
            if r2['ok']:
                ok2, err2 = rd.render_pdf_to_png(serial2_pdf, figdir_png / 'ORIG_resaved')
                serial2_pdf.unlink(missing_ok=True)
                if ok2:
                    resaved_arr = rd.load_rgb(str(figdir_png / 'ORIG_resaved.png'))
                    d = rd.diff_stats(arrs['ORIG'], resaved_arr)
                    serial_row['status'] = 'ok'
                    serial_row['diff_vs_orig_first_save'] = d
                else:
                    serial_row['status'] = 'render-fail'
                    serial_row['error'] = err2
            else:
                serial_row['status'] = 'strip-fail'
                serial_row['error'] = r2['error']
        else:
            serial_row['status'] = 'strip-fail'
            serial_row['error'] = r['error']
        with open(RESULTS, 'a') as f:
            f.write(json.dumps(serial_row) + '\n')
        out['serialiser_row'] = serial_row

        out['status'] = 'ok'
        return out
    finally:
        for p in figdir_pdf.glob('*'):
            p.unlink(missing_ok=True)
        for p in figdir_png.glob('*'):
            p.unlink(missing_ok=True)
        try:
            figdir_pdf.rmdir()
        except OSError:
            pass
        try:
            figdir_png.rmdir()
        except OSError:
            pass
        if staged_path is not None:
            Path(staged_path).unlink(missing_ok=True)


def main():
    rows = load_results()
    changed = find_changed(rows)
    population, _, _ = poplib.build()
    by_name = {r['basename']: r for r in population}
    print(f'changed figures (count_gt0>0 in PERSIST or NONTEXT vs ORIG): {len(changed)}', flush=True)
    print(json.dumps(changed), flush=True)
    for basename in changed:
        row = by_name[basename]
        out = process_one(basename, row)
        print(json.dumps(out), flush=True)
    print(f'DONE post_pass n={len(changed)}', flush=True)


if __name__ == '__main__':
    main()
