"""Full-population render driver. For each figure in population.build(): stage if needed,
render ORIG/PERSIST/NONTEXT (each: fresh open -> strip via strip_variants -> save temp pdf ->
pdftocairo -png -r 200 -singlefile -> load as array -> delete temp pdf immediately), diff
PERSIST vs ORIG and NONTEXT vs ORIG (and PERSIST vs NONTEXT), and -- ONLY for a figure with a
nonzero diff in either variant -- render the untouched SOURCE pdf, compute mean-distance
"toward source" direction, and save a small SOURCE|ORIG|PERSIST|NONTEXT crop under
render/crops/. All full-size PNGs and temp PDFs for a figure are deleted before moving to the
next one; only crops (small) persist on disk.

Resumable at FIGURE granularity: a basename already fully represented in results.jsonl (i.e.
carrying at least one line whose variant=='NONTEXT', which is always the LAST line written for
a figure) is skipped.

Run with: PYTHONDONTWRITEBYTECODE=1 python3 -u driver_render.py >> ../logs/driver_render.log 2>&1
Judge completion by the final "DONE n=..." line, never by exit code.
"""
import json
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import strip_variants as sv  # noqa: E402  (also sets up FIGTEXT/pylibs on sys.path)
import numpy as np  # noqa: E402  (must come AFTER strip_variants puts pylibs on sys.path)
import render_diff as rd  # noqa: E402
import population as poplib  # noqa: E402
import readlayer  # noqa: E402

GS_ARGV = readlayer.GS_ARGV
STAGE_TIMEOUT = 300

SCRATCH = Path('/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore')
PDF_TMP = SCRATCH / 'render/pdf_tmp'
PNG_TMP = SCRATCH / 'render/png_tmp'
CROPS = SCRATCH / 'render/crops'
RESULTS = SCRATCH / 'render/results.jsonl'
for d in (PDF_TMP, PNG_TMP, CROPS):
    d.mkdir(parents=True, exist_ok=True)

VARIANTS = ('ORIG', 'PERSIST', 'NONTEXT')


def stage_eps(artwork_path, basename):
    dst = PDF_TMP / f'{basename}__staged.pdf'
    if dst.exists():
        dst.unlink()
    try:
        result = subprocess.run(GS_ARGV + [f'-sOutputFile={dst}', str(artwork_path)],
                                 capture_output=True, timeout=STAGE_TIMEOUT)
    except subprocess.TimeoutExpired as exc:
        return None, f'TimeoutExpired: {exc}'
    if result.returncode != 0 or not dst.exists() or dst.stat().st_size == 0:
        if dst.exists():
            dst.unlink()
        return None, f'gs exit {result.returncode}: {result.stderr.decode("utf-8","replace").strip()[-400:]}'
    return dst, None


def process_figure(row):
    basename = row['basename']
    artwork = Path(row['artwork'])
    base_info = {'basename': basename, 'bought': row['bought'], 'artwork': str(artwork), 'kind': row['kind']}

    if not artwork.exists():
        return [{**base_info, 'variant': v, 'status': 'missing-artwork'} for v in VARIANTS]

    pdf_src = artwork
    staged_path = None
    if row['kind'] in ('eps', 'ai'):
        staged_path, err = stage_eps(artwork, basename)
        if staged_path is None:
            return [{**base_info, 'variant': v, 'status': 'stage-fail', 'error': err} for v in VARIANTS]
        pdf_src = staged_path

    figdir_pdf = PDF_TMP / basename
    figdir_png = PNG_TMP / basename
    figdir_pdf.mkdir(parents=True, exist_ok=True)
    figdir_png.mkdir(parents=True, exist_ok=True)

    variant_arrs = {}
    variant_status = {}
    try:
        for variant in VARIANTS:
            out_pdf = figdir_pdf / f'{variant}.pdf'
            r = sv.run_variant(pdf_src, variant, out_pdf)
            if not r['ok']:
                variant_status[variant] = {'status': 'strip-fail', 'error': r['error']}
                out_pdf.unlink(missing_ok=True)
                continue
            ok, err = rd.render_pdf_to_png(out_pdf, figdir_png / variant)
            out_pdf.unlink(missing_ok=True)   # delete the variant PDF the instant its PNG exists (or failed)
            if not ok:
                variant_status[variant] = {'status': 'render-fail', 'error': err}
                continue
            variant_arrs[variant] = rd.load_rgb(str(figdir_png / f'{variant}.png'))
            variant_status[variant] = {'status': 'ok'}

        diff_persist = diff_nontext = diff_pn = None
        if 'PERSIST' in variant_arrs and 'ORIG' in variant_arrs:
            diff_persist = rd.diff_stats(variant_arrs['PERSIST'], variant_arrs['ORIG'])
        if 'NONTEXT' in variant_arrs and 'ORIG' in variant_arrs:
            diff_nontext = rd.diff_stats(variant_arrs['NONTEXT'], variant_arrs['ORIG'])
        if 'PERSIST' in variant_arrs and 'NONTEXT' in variant_arrs:
            diff_pn = rd.diff_stats(variant_arrs['PERSIST'], variant_arrs['NONTEXT'])

        changed = any(
            d is not None and d.get('size_match') and d['count_gt0'] > 0
            for d in (diff_persist, diff_nontext)
        )

        direction = {}
        crop_path = None
        source_render_error = None
        if changed and 'ORIG' in variant_arrs:
            ok, err = rd.render_pdf_to_png(pdf_src, figdir_png / 'SOURCE')
            if ok:
                source_arr = rd.load_rgb(str(figdir_png / 'SOURCE.png'))
                union_bbox = None
                for d in (diff_persist, diff_nontext):
                    if d and d.get('bbox_gt0'):
                        r0, r1, c0, c1 = d['bbox_gt0']
                        union_bbox = [r0, r1, c0, c1] if union_bbox is None else [
                            min(union_bbox[0], r0), max(union_bbox[1], r1),
                            min(union_bbox[2], c0), max(union_bbox[3], c1)]
                for name, arr, dd in (('PERSIST', variant_arrs.get('PERSIST'), diff_persist),
                                      ('NONTEXT', variant_arrs.get('NONTEXT'), diff_nontext)):
                    if arr is None or dd is None or not dd.get('size_match'):
                        continue
                    if source_arr.shape != variant_arrs['ORIG'].shape or source_arr.shape != arr.shape:
                        direction[name] = {'note': 'source size mismatch vs variant, direction not computed'}
                        continue
                    mask = np.max(np.abs(variant_arrs['ORIG'] - arr), axis=2) > 0
                    dist_orig = rd.mean_distance(variant_arrs['ORIG'], source_arr, mask)
                    dist_var = rd.mean_distance(arr, source_arr, mask)
                    direction[name] = {
                        'mean_dist_ORIG_to_SOURCE': dist_orig,
                        f'mean_dist_{name}_to_SOURCE': dist_var,
                        'moves_toward_source': (dist_var < dist_orig)
                        if (dist_orig is not None and dist_var is not None) else None,
                    }
                if union_bbox is not None and source_arr.shape == variant_arrs['ORIG'].shape:
                    crop_arrays = [('SOURCE', source_arr), ('ORIG', variant_arrs['ORIG'])]
                    if 'PERSIST' in variant_arrs:
                        crop_arrays.append(('PERSIST', variant_arrs['PERSIST']))
                    if 'NONTEXT' in variant_arrs:
                        crop_arrays.append(('NONTEXT', variant_arrs['NONTEXT']))
                    crop_path = CROPS / f'{basename}.png'
                    rd.save_triptych_crop(crop_arrays, union_bbox, crop_path, margin=15)
            else:
                source_render_error = err
            (figdir_png / 'SOURCE.png').unlink(missing_ok=True)

        lines = []
        for variant in VARIANTS:
            line = {**base_info, 'variant': variant, **variant_status.get(variant, {'status': 'skipped'})}
            if variant == 'PERSIST' and diff_persist is not None:
                line['diff_vs_orig'] = diff_persist
            if variant == 'NONTEXT':
                if diff_nontext is not None:
                    line['diff_vs_orig'] = diff_nontext
                if diff_pn is not None:
                    line['diff_persist_vs_nontext'] = diff_pn
            if variant in direction:
                line['direction_vs_source'] = direction[variant]
            if crop_path is not None:
                line['crop_path'] = str(crop_path)
            if source_render_error is not None and variant == 'NONTEXT':
                line['source_render_error'] = source_render_error
            lines.append(line)
        return lines
    finally:
        for variant in VARIANTS:
            (figdir_png / f'{variant}.png').unlink(missing_ok=True)
        (figdir_png / 'SOURCE.png').unlink(missing_ok=True)
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
    population, pop_a, pop_b = poplib.build()
    print(f'population total={len(population)} (a)={len(pop_a)} (b)={len(pop_b)}', flush=True)

    done = set()
    if RESULTS.exists():
        with open(RESULTS) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                d = json.loads(line)
                if d.get('variant') == 'NONTEXT':
                    done.add(d['basename'])
    print(f'resuming: {len(done)} figures already fully done', flush=True)

    t0 = time.time()
    n_done = 0
    with open(RESULTS, 'a') as out_f:
        for i, row in enumerate(population):
            if row['basename'] in done:
                continue
            try:
                lines = process_figure(row)
            except Exception as exc:  # noqa: BLE001 - never let one bad figure kill the batch
                lines = [{'basename': row['basename'], 'bought': row['bought'],
                          'artwork': row['artwork'], 'kind': row['kind'], 'variant': v,
                          'status': 'driver-exception', 'error': f'{type(exc).__name__}: {exc}'}
                         for v in VARIANTS]
            for line in lines:
                out_f.write(json.dumps(line) + '\n')
            out_f.flush()
            n_done += 1
            if n_done % 10 == 0:
                print(f'... {i+1}/{len(population)} processed this run '
                      f'({n_done} this run), {time.time()-t0:.1f}s elapsed', flush=True)

    # verify every basename made it in with all 3 variants
    seen = {}
    with open(RESULTS) as f:
        for line in f:
            d = json.loads(line)
            seen.setdefault(d['basename'], set()).add(d['variant'])
    incomplete = [b for b, vs in seen.items() if vs != set(VARIANTS)]
    missing = [r['basename'] for r in population if r['basename'] not in seen]
    print(f'population={len(population)} distinct_basenames_in_results={len(seen)} '
          f'incomplete={len(incomplete)} missing={len(missing)}', flush=True)
    if incomplete:
        print(f'incomplete basenames (first 10): {incomplete[:10]}', flush=True)
    if missing:
        print(f'missing basenames (first 10): {missing[:10]}', flush=True)

    print(f'DONE n={len(population)} distinct={len(seen)} incomplete={len(incomplete)} missing={len(missing)}',
          flush=True)


if __name__ == '__main__':
    main()
