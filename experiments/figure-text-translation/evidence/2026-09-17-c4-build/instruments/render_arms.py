"""§C140 ④ P1/P2 — full-population render comparison, BEFORE (base commit 7a45f050's
strip-text.py) vs AFTER (the fixed strip-text.py on disk).

Change list over evidence/2026-09-16-c4-explore/instruments/driver_render.py and
strip_variants.py (read in full before this was written; controller ruling R1):

  1. Arms by WHOLE MODULE, never by replacing a function. BEFORE and AFTER are two
     independently `importlib.util.spec_from_file_location`-loaded module objects --
     BEFORE from instruments/strip_text_before.py (Task 1's byte copy of strip-text.py at
     7a45f050; its strip_text_ops returns 2 values), AFTER from
     experiments/figure-text-translation/strip-text.py (the fixed file; 3 values). The
     variants are BEFORE (BEFORE.strip_text(pdf)) and AFTER (AFTER.strip_text(pdf)) --
     each module's OWN function, never one shared module with strip_text_ops swapped
     onto it the way strip_variants.py's ORIG/PERSIST/NONTEXT did. There is no PERSIST or
     NONTEXT variant here.
  2. Paths repointed at this build's evidence folder (see SCRATCH/RESULTS/CROPS below).
  3. Population comes from population.py's builder (copied alongside, unmodified logic,
     paths repointed -- see that file), which is why "533 figures" appears verbatim
     in this docstring and nowhere else.
  4. Kept: the SERIALISER control (BEFORE stripped twice -- must be 0 px, proving
     re-serialisation alone introduces no change), the PLANTED control (a drawn
     rectangle on a copy of a render -- must be detected, proving the diff instrument
     sees a real change when one is present), the per-figure "direction toward source"
     measurement for changed figures, and the final "DONE n=..." terminal line.

A TextObjectOperatorRefused raised by AFTER is recorded as status='refused' with its
message -- never swallowed, never let crash the batch.

Run with: PYTHONDONTWRITEBYTECODE=1 FIGTEXT_PYLIBS=./pylibs python3 -u render_arms.py
(from experiments/figure-text-translation/, per the task brief). Judge completion by the
final "DONE n=533 ..." line, never by exit code.
"""
import gzip
import importlib.util
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve()
BUILD = HERE.parents[1]                         # .../evidence/2026-09-17-c4-build
EXP = HERE.parents[3]                           # .../experiments/figure-text-translation
sys.path.insert(0, str(BUILD / 'instruments'))  # for `import population`
sys.path.insert(0, str(EXP))
import _deps  # noqa: F401,E402  (side effect: puts pylibs/ + EXP on sys.path)
import numpy as np  # noqa: E402  (must come AFTER _deps puts pylibs on sys.path)
import pikepdf  # noqa: E402
import readlayer  # noqa: E402
import render_diff as rd  # noqa: E402
import population as poplib  # noqa: E402

GS_ARGV = readlayer.GS_ARGV
STAGE_TIMEOUT = 300

SCRATCH = Path('/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-build/render')
PDF_TMP = SCRATCH / 'pdf_tmp'
PNG_TMP = SCRATCH / 'png_tmp'
CROPS = SCRATCH / 'crops'
CTRL_PDF = SCRATCH / 'controls_pdf'
CTRL_PNG = SCRATCH / 'controls_png'
for d in (PDF_TMP, PNG_TMP, CROPS, CTRL_PDF, CTRL_PNG):
    d.mkdir(parents=True, exist_ok=True)

RESULTS = BUILD / 'reports/after/render-results.jsonl'
CONTROLS_PATH = BUILD / 'reports/after/render-controls.json'
SUMMARY_PATH = BUILD / 'reports/after/render-summary.md'
PERSIST_CROPS_DIR = BUILD / 'reports/after/crops'
EXPLORE_RESULTS = EXP / 'evidence/2026-09-16-c4-explore/render/results.jsonl.gz'
PERSIST_CROPS = ('CNX_Chem_04_05_combustion', 'CNX_Chem_07_06_Egeom')

VARIANTS = ('BEFORE', 'AFTER')

# --- load the two whole modules, never swap a function onto one shared module -------
_before_spec = importlib.util.spec_from_file_location(
    'strip_before_c4build', str(BUILD / 'instruments/strip_text_before.py'))
BEFORE = importlib.util.module_from_spec(_before_spec)
_before_spec.loader.exec_module(BEFORE)

_after_spec = importlib.util.spec_from_file_location(
    'strip_after_c4build', str(EXP / 'strip-text.py'))
AFTER = importlib.util.module_from_spec(_after_spec)
_after_spec.loader.exec_module(AFTER)


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


def run_variant(mod, pdf_path, out_pdf_path):
    """Open pdf_path fresh, call mod.strip_text(pdf) -- mod's OWN function (BEFORE and
    AFTER are two independently loaded module objects) -- run the same post-steps
    strip-text.py's main() does, save to out_pdf_path.
    -> dict(ok, status, error, stats). status is 'ok' / 'refused' / 'error'. A
    TextObjectOperatorRefused (only AFTER can raise it) is 'refused', with its message;
    anything else is 'error', also with its message -- neither is ever swallowed.
    """
    refused_cls = getattr(mod, 'TextObjectOperatorRefused', None)
    try:
        with pikepdf.open(str(pdf_path)) as pdf:
            stats = mod.strip_text(pdf)
            page = pdf.pages[0]
            for k in ('/PieceInfo', '/LastModified', '/Metadata', '/Thumb'):
                if k in page.obj:
                    del page.obj[k]
            pdf.remove_unreferenced_resources()
            pdf.save(str(out_pdf_path))
        return {'ok': True, 'status': 'ok', 'error': None, 'stats': stats}
    except Exception as exc:  # noqa: BLE001 - named and recorded, never swallowed
        status = 'refused' if (refused_cls is not None and isinstance(exc, refused_cls)) else 'error'
        return {'ok': False, 'status': status, 'error': f'{type(exc).__name__}: {exc}', 'stats': None}


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
        for variant, mod in (('BEFORE', BEFORE), ('AFTER', AFTER)):
            out_pdf = figdir_pdf / f'{variant}.pdf'
            r = run_variant(mod, pdf_src, out_pdf)
            if not r['ok']:
                variant_status[variant] = {'status': r['status'], 'error': r['error']}
                out_pdf.unlink(missing_ok=True)
                continue
            ok, err = rd.render_pdf_to_png(out_pdf, figdir_png / variant)
            out_pdf.unlink(missing_ok=True)   # delete the variant PDF the instant its PNG exists (or failed)
            if not ok:
                variant_status[variant] = {'status': 'render-fail', 'error': err}
                continue
            variant_arrs[variant] = rd.load_rgb(str(figdir_png / f'{variant}.png'))
            variant_status[variant] = {'status': 'ok'}
            if r['stats'] is not None:
                variant_status[variant]['stats'] = r['stats']

        diff = None
        if 'BEFORE' in variant_arrs and 'AFTER' in variant_arrs:
            diff = rd.diff_stats(variant_arrs['AFTER'], variant_arrs['BEFORE'])
        changed = diff is not None and diff.get('size_match') and diff['count_gt0'] > 0

        direction = {}
        crop_path = None
        source_render_error = None
        if changed:
            ok, err = rd.render_pdf_to_png(pdf_src, figdir_png / 'SOURCE')
            if ok:
                source_arr = rd.load_rgb(str(figdir_png / 'SOURCE.png'))
                if (source_arr.shape == variant_arrs['BEFORE'].shape
                        and source_arr.shape == variant_arrs['AFTER'].shape):
                    mask = np.max(np.abs(variant_arrs['BEFORE'] - variant_arrs['AFTER']), axis=2) > 0
                    dist_before = rd.mean_distance(variant_arrs['BEFORE'], source_arr, mask)
                    dist_after = rd.mean_distance(variant_arrs['AFTER'], source_arr, mask)
                    direction = {
                        'mean_dist_BEFORE_to_SOURCE': dist_before,
                        'mean_dist_AFTER_to_SOURCE': dist_after,
                        'moves_toward_source': (dist_after < dist_before)
                        if (dist_before is not None and dist_after is not None) else None,
                    }
                    bbox = diff.get('bbox_gt0')
                    if bbox is not None:
                        crop_path = CROPS / f'{basename}.png'
                        rd.save_triptych_crop(
                            [('SOURCE', source_arr), ('BEFORE', variant_arrs['BEFORE']),
                             ('AFTER', variant_arrs['AFTER'])], bbox, crop_path, margin=15)
                else:
                    direction = {'note': 'source size mismatch vs variant, direction not computed'}
            else:
                source_render_error = err
            (figdir_png / 'SOURCE.png').unlink(missing_ok=True)

        lines = []
        for variant in VARIANTS:
            line = {**base_info, 'variant': variant, **variant_status.get(variant, {'status': 'skipped'})}
            if variant == 'AFTER' and diff is not None:
                line['diff_vs_before'] = diff
            if direction:
                line['direction_vs_source'] = direction
            if crop_path is not None:
                line['crop_path'] = str(crop_path)
            if source_render_error is not None and variant == 'AFTER':
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


def run_controls(bought_by_name):
    """SERIALISER control: strip combustion's own BEFORE output a SECOND time with
    BEFORE, diff vs the first save -- must be 0 px (proves re-serialisation alone
    introduces no change; this is the control the whole diff instrument depends on
    being trustworthy). PLANTED control: draw a 20x20 black rectangle on a copy of that
    first render, diff -- must be detected (proves the instrument sees a REAL change
    when one is present, i.e. it is not just reporting 0 no matter what)."""
    row = bought_by_name['CNX_Chem_04_05_combustion']
    artwork = Path(row['artwork'])
    pdf_src = artwork
    staged_path = None
    if row['kind'] in ('eps', 'ai'):
        staged_path, err = stage_eps(artwork, 'controls_combustion')
        if staged_path is None:
            return {'serialiser': {'error': err}, 'planted': {'error': err}}
        pdf_src = staged_path

    serialiser = None
    planted = None
    try:
        first_pdf = CTRL_PDF / 'BEFORE_1.pdf'
        r1 = run_variant(BEFORE, pdf_src, first_pdf)
        if not r1['ok']:
            return {'serialiser': {'error': f"first strip failed: {r1['error']}"},
                    'planted': {'error': f"first strip failed: {r1['error']}"}}
        second_pdf = CTRL_PDF / 'BEFORE_2.pdf'
        r2 = run_variant(BEFORE, first_pdf, second_pdf)
        ok1, err1 = rd.render_pdf_to_png(first_pdf, CTRL_PNG / 'BEFORE_1')
        if not ok1:
            return {'serialiser': {'error': f'render fail: {err1}'}, 'planted': {'error': f'render fail: {err1}'}}
        arr1 = rd.load_rgb(str(CTRL_PNG / 'BEFORE_1.png'))

        if r2['ok']:
            ok2, err2 = rd.render_pdf_to_png(second_pdf, CTRL_PNG / 'BEFORE_2')
            if ok2:
                arr2 = rd.load_rgb(str(CTRL_PNG / 'BEFORE_2.png'))
                serialiser = rd.diff_stats(arr1, arr2)
            else:
                serialiser = {'error': f'render fail: {err2}'}
        else:
            serialiser = {'error': f"second strip failed: {r2['error']}"}

        from PIL import Image, ImageDraw
        im = Image.open(CTRL_PNG / 'BEFORE_1.png').convert('RGB')
        im2 = im.copy()
        draw = ImageDraw.Draw(im2)
        w, h = im2.size
        draw.rectangle([w // 4, h // 4, w // 4 + 20, h // 4 + 20], fill=(0, 0, 0))
        planted_path = CTRL_PNG / 'PLANTED.png'
        im2.save(planted_path)
        arr_planted = rd.load_rgb(str(planted_path))
        planted = rd.diff_stats(arr1, arr_planted)
        return {'serialiser': serialiser, 'planted': planted}
    finally:
        for p in CTRL_PDF.glob('*'):
            p.unlink(missing_ok=True)
        for p in CTRL_PNG.glob('*'):
            p.unlink(missing_ok=True)
        if staged_path is not None:
            Path(staged_path).unlink(missing_ok=True)


def persist_crops():
    """Copy only combustion's and Egeom's crop PNGs (if produced -- both are expected to
    be in the changed set) from the scratch dir into the evidence folder; every other
    crop stays in scratch, ephemeral."""
    PERSIST_CROPS_DIR.mkdir(parents=True, exist_ok=True)
    copied = []
    for name in PERSIST_CROPS:
        src = CROPS / f'{name}.png'
        if src.exists():
            dst = PERSIST_CROPS_DIR / f'{name}.png'
            shutil.copyfile(src, dst)
            copied.append(name)
    return copied


def exploration_34():
    rows = [json.loads(l) for l in gzip.open(EXPLORE_RESULTS, 'rt')]
    persist = [r for r in rows if r.get('variant') == 'PERSIST']
    changed = [r for r in persist
               if r.get('diff_vs_orig', {}).get('count_gt0', 0) and r['diff_vs_orig']['count_gt0'] > 0]
    return sorted(r['basename'] for r in changed)


def write_summary(controls, bought_names):
    rows = []
    with open(RESULTS) as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    after_rows = [r for r in rows if r.get('variant') == 'AFTER']
    changed = [r for r in after_rows
               if r.get('diff_vs_before', {}).get('count_gt0', 0) and r['diff_vs_before']['count_gt0'] > 0]
    changed_names = sorted(r['basename'] for r in changed)
    gt40 = [r for r in changed if r['diff_vs_before'].get('count_gt40', 0) > 0]
    gt40_names = sorted(r['basename'] for r in gt40)

    explore_names = exploration_34()
    only_new = sorted(set(changed_names) - set(explore_names))
    only_explore = sorted(set(explore_names) - set(changed_names))

    bought_changed = sorted(n for n in changed_names if n in bought_names)

    dists = [r['direction_vs_source']['mean_dist_AFTER_to_SOURCE'] for r in changed
             if 'direction_vs_source' in r and r['direction_vs_source'].get('mean_dist_AFTER_to_SOURCE') is not None]
    mean_dist = (sum(dists) / len(dists)) if dists else None

    refused = [r for r in rows if r.get('status') == 'refused']

    lines = []
    lines.append('# §C140 ④ render-summary — BEFORE vs AFTER, 533 figures\n')
    lines.append(f'- Population: {len(set(r["basename"] for r in rows))} distinct basenames '
                 f'(expected 533).')
    lines.append(f'- **Changed (count_gt0 > 0): {len(changed_names)}** (expected 34).')
    lines.append(f'- **Changed above 40/channel (count_gt40 > 0): {len(gt40_names)}** (expected 15).')
    lines.append('')
    lines.append('## Changed set, by name\n')
    for n in changed_names:
        lines.append(f'- {n}' + (' (>40)' if n in gt40_names else ''))
    lines.append('')
    lines.append('## Comparison by name with the exploration\'s 34 (evidence/2026-09-16-c4-explore/'
                 'render/results.jsonl.gz, PERSIST rows with count_gt0 > 0)\n')
    lines.append(f'- Only in THIS run, not in the exploration\'s 34: {only_new or "[]"}')
    lines.append(f'- Only in the exploration\'s 34, not in THIS run: {only_explore or "[]"}')
    lines.append(f'- **Sets equal by name: {only_new == [] and only_explore == []}**')
    lines.append('')
    lines.append(f'## Bought figures changed (of 34 bought)\n')
    lines.append(f'- {bought_changed} (expected: only [\'CNX_Chem_04_05_combustion\'])')
    lines.append('')
    lines.append('## Direction toward source (changed figures only)\n')
    lines.append(f'- n with a direction measurement: {len(dists)} of {len(changed_names)}')
    lines.append(f'- mean_dist_AFTER_to_SOURCE, averaged over those: {mean_dist} (expected 0.0)')
    all_zero = all(d == 0.0 for d in dists) if dists else None
    lines.append(f'- every changed figure at distance 0.0 from source: {all_zero}')
    lines.append('')
    lines.append('## Controls\n')
    lines.append(f'- SERIALISER (combustion, BEFORE stripped twice): {controls["serialiser"]}')
    lines.append(f'- PLANTED (20x20 rect on a copy of combustion\'s BEFORE render): {controls["planted"]}')
    lines.append('')
    lines.append('## Refused\n')
    lines.append(f'- **refused count: {len(refused)}** (expected 0)')
    if refused:
        for r in refused:
            lines.append(f'  - {r["basename"]} ({r["variant"]}): {r.get("error")}')
    lines.append('')
    SUMMARY_PATH.write_text('\n'.join(lines) + '\n')


def main():
    population, pop_a, pop_b = poplib.build()
    bought_by_name = {r['basename']: r for r in pop_a}
    bought_names = set(bought_by_name)
    assert len(population) == 533, f'expected population=533, got {len(population)}'
    print(f'population total={len(population)} bought={len(pop_a)} nontext-not-bought={len(pop_b)}', flush=True)

    done = set()
    if RESULTS.exists():
        with open(RESULTS) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                d = json.loads(line)
                if d.get('variant') == 'AFTER':
                    done.add(d['basename'])
    print(f'resuming: {len(done)} figures already fully done', flush=True)

    t0 = time.time()
    n_done = 0
    RESULTS.parent.mkdir(parents=True, exist_ok=True)
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
            if n_done % 25 == 0:
                print(f'... {i+1}/{len(population)} processed this run '
                      f'({n_done} this run), {time.time()-t0:.1f}s elapsed', flush=True)

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

    controls = run_controls(bought_by_name)
    CONTROLS_PATH.write_text(json.dumps(controls, indent=1))
    print(f'controls: serialiser={controls["serialiser"]} planted={controls["planted"]}', flush=True)

    copied = persist_crops()
    print(f'persisted crops: {copied}', flush=True)

    write_summary(controls, bought_names)
    print(f'wrote {SUMMARY_PATH}', flush=True)

    print(f'DONE n={len(population)} distinct={len(seen)} incomplete={len(incomplete)} missing={len(missing)}',
          flush=True)


if __name__ == '__main__':
    main()
