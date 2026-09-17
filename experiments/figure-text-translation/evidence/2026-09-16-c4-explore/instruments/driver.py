"""Driver: walk every figure in the population, census its BT..ET non-text operators,
and append one JSONL result line per figure to census/results.jsonl (resumable, one
figure at a time, staged PDF deleted immediately after each figure).

Run with: PYTHONDONTWRITEBYTECODE=1 python3 -u driver.py >> logs/driver.log 2>&1
Judge completion by the final "DONE n=..." line in the log, never by exit code.
"""
import csv
import gzip
import json
import os
import subprocess
import sys
import time
from pathlib import Path

REPO = Path('/home/siggi/dev/repos/namsbokasafn-efni')
FIGTEXT = REPO / 'experiments/figure-text-translation'
SCRATCH = Path('/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore')
PAGECENSUS = FIGTEXT / 'evidence/2026-09-16-c7-explore/data/pagecensus.jsonl.gz'
BOUGHT_TSV = FIGTEXT / 'evidence/2026-09-16-c7-build/reports/after/summary.tsv'
N2O5_EPS = Path('/home/siggi/dev/repos/Myndir/chemistry-2e/base/Ch_18/Source_File/CNX_Chem_18_07_N2O5.eps')

sys.path.insert(0, str(FIGTEXT / 'pylibs'))
sys.path.insert(0, str(FIGTEXT))
sys.path.insert(0, str(SCRATCH / 'lib'))
os.environ.setdefault('FIGTEXT_PYLIBS', str(FIGTEXT / 'pylibs'))

import pikepdf  # noqa: E402
import census_lib as C  # noqa: E402

STAGED_DIR = SCRATCH / 'staged'
CENSUS_DIR = SCRATCH / 'census'
RESULTS_PATH = CENSUS_DIR / 'results.jsonl'
STAGED_DIR.mkdir(parents=True, exist_ok=True)
CENSUS_DIR.mkdir(parents=True, exist_ok=True)

# Same argv figure-prepare.py's stage_artwork uses (imported from readlayer.GS_ARGV, the
# single source both figure-prepare.py and readlayer.py already share -- see readlayer.py
# comment: "the two copies of this argv must not drift, because a different -d flag is a
# different rasterisation"). Read fresh here rather than hand-copied.
import readlayer  # noqa: E402
GS_ARGV = readlayer.GS_ARGV
assert GS_ARGV == ['gs', '-q', '-dNOPAUSE', '-dBATCH', '-dSAFER', '-dEPSCrop', '-sDEVICE=pdfwrite']
STAGE_TIMEOUT = 300  # matches figure-prepare.py's stage_artwork -> run_child pairing intent


def load_population():
    rows = []
    with gzip.open(PAGECENSUS, 'rt') as f:
        for line in f:
            rows.append(json.loads(line))
    assert len(rows) == 910, f'expected 910 rows in pagecensus.jsonl.gz, got {len(rows)}'

    out = []
    for d in rows:
        if d['basename'] == 'CNX_Chem_11_04_rvosmosis':
            out.append({**d, 'variant': 'refused', 'key': d['basename'] + '|refused',
                        'note': 'resolver refuses this figure as of 2026-09-16+; not scanned'})
            continue
        if d['basename'] == 'CNX_Chem_18_07_N2O5':
            out.append({**d, 'variant': 'pdf', 'key': d['basename'] + '|pdf'})
            eps_row = dict(d)
            eps_row['artwork'] = str(N2O5_EPS)
            eps_row['kind'] = 'eps'
            eps_row['variant'] = 'eps'
            eps_row['key'] = d['basename'] + '|eps'
            eps_row['note'] = 'resolver now resolves N2O5 to this .eps instead of the .pdf; scanned in addition'
            out.append(eps_row)
            continue
        out.append({**d, 'variant': 'default', 'key': d['basename'] + '|default'})
    # 910 source rows: 908 untouched + rvosmosis (kept, 1 row, relabelled 'refused') +
    # N2O5 (split into 2 rows: 'pdf' and 'eps') = 908 + 1 + 2 = 911 total rows to iterate.
    # Of those 911, 1 (rvosmosis) is excluded from SCAN totals (never staged/opened) but
    # is still present in the output so nothing is silently dropped.
    assert len(out) == 911, f'expected 911 rows (908 unchanged + rvosmosis x1 + N2O5 x2), got {len(out)}'
    return out


def load_bought():
    bought = set()
    with open(BOUGHT_TSV, newline='') as f:
        for row in csv.DictReader(f, delimiter='\t'):
            if row['group'] == 'bought':
                bought.add(row['artwork'])
    assert len(bought) == 34, f'expected 34 bought artwork paths, got {len(bought)}'
    return bought


def stage_eps(artwork_path, key):
    safe = key.replace('/', '_').replace('|', '__')
    dst = STAGED_DIR / f'{safe}.pdf'
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


def census_one(row, bought_set):
    key = row['key']
    artwork = Path(row['artwork'])
    out = {
        'key': key, 'basename': row['basename'], 'chapter': row.get('chapter'),
        'artwork': str(artwork), 'kind': row.get('kind'), 'variant': row['variant'],
        'bought': str(artwork) in bought_set,
    }

    if row['variant'] == 'refused':
        out['status'] = 'resolver-refused'
        out['note'] = row.get('note', '')
        return out

    if not artwork.exists():
        out['status'] = 'missing-artwork'
        return out

    staged_path = None
    pdf_to_open = artwork
    recipe = 'pdf'
    if artwork.suffix.lower() in ('.eps', '.ai'):
        recipe = 'gs-eps-staged'
        staged_path, err = stage_eps(artwork, key)
        if staged_path is None:
            out['status'] = 'staged-fail'
            out['error'] = err
            return out
        pdf_to_open = staged_path
    out['staged_pdf_recipe'] = recipe

    try:
        with pikepdf.open(str(pdf_to_open)) as pdf:
            try:
                walk = C.walk_pdf(pdf)
            except Exception as exc:  # page-stream parse failure
                out['status'] = 'parse-fail'
                out['error'] = f'{type(exc).__name__}: {exc}'
                return out
    except Exception as exc:  # pikepdf.open failure
        out['status'] = 'open-fail'
        out['error'] = f'{type(exc).__name__}: {exc}'
        return out
    finally:
        if staged_path is not None and staged_path.exists():
            staged_path.unlink()

    op_counts = {}
    class_counts = {}
    bt_et_count = 0
    tr_modes = set()
    malformed_unclosed_bt = 0
    events = []
    bt_net_q_by_stream = {}   # {stream_label: [net q-Q per top-level BT..ET object, in order]}
    for s in walk['streams']:
        bt_et_count += s['bt_et_count']
        malformed_unclosed_bt += s['malformed_unclosed_bt']
        tr_modes |= set(s['tr_modes'])
        for k, v in s['op_counts'].items():
            op_counts[k] = op_counts.get(k, 0) + v
        for k, v in s['class_counts'].items():
            class_counts[k] = class_counts.get(k, 0) + v
        for e in s['events']:
            events.append({**e, 'stream': s['stream']})
        if s['bt_net_q']:
            bt_net_q_by_stream[s['stream']] = s['bt_net_q']

    out['status'] = 'ok' if not walk['unparsable'] else 'partial'
    out['forms_visited'] = walk['forms_visited']
    out['unparsable_forms'] = walk['unparsable']
    out['bt_et_count'] = bt_et_count
    out['malformed_unclosed_bt'] = malformed_unclosed_bt
    out['tr_modes'] = sorted(tr_modes)
    out['bt_net_q_by_stream'] = bt_net_q_by_stream
    all_net_q = [v for vals in bt_net_q_by_stream.values() for v in vals]
    out['bt_net_q_nonzero_count'] = sum(1 for v in all_net_q if v != 0)
    out['bt_net_q_max_abs'] = max((abs(v) for v in all_net_q), default=0)
    out['op_counts'] = op_counts
    out['class_counts'] = class_counts
    out['classes_present'] = sorted(k for k, v in class_counts.items() if v > 0)
    out['any_nontext_in_bt'] = sum(class_counts.values()) > 0
    later_paint_events = [e for e in events if e['armed'] and e['paints_in_window'] > 0]
    out['later_paint_events'] = later_paint_events
    out['n_later_paint_events'] = len(later_paint_events)
    return out


def main():
    population = load_population()
    bought_set = load_bought()

    done_keys = set()
    if RESULTS_PATH.exists():
        with open(RESULTS_PATH) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                done_keys.add(json.loads(line)['key'])
    print(f'resuming: {len(done_keys)} already done of {len(population)}', flush=True)

    t0 = time.time()
    n_done = 0
    with open(RESULTS_PATH, 'a') as out_f:
        for i, row in enumerate(population):
            if row['key'] in done_keys:
                continue
            result = census_one(row, bought_set)
            out_f.write(json.dumps(result) + '\n')
            out_f.flush()
            n_done += 1
            if n_done % 25 == 0:
                print(f'... {i+1}/{len(population)} processed this run, '
                      f'{time.time()-t0:.1f}s elapsed', flush=True)

    # Verify every key in the population made it into results.jsonl exactly once.
    seen = {}
    with open(RESULTS_PATH) as f:
        for line in f:
            d = json.loads(line)
            seen[d['key']] = seen.get(d['key'], 0) + 1
    dup = {k: v for k, v in seen.items() if v != 1}
    missing = [r['key'] for r in population if r['key'] not in seen]
    print(f'population={len(population)} results_rows={sum(seen.values())} '
          f'distinct_keys={len(seen)} dup={dup} missing={missing}', flush=True)

    print(f'DONE n={len(population)} results={sum(seen.values())} dup={len(dup)} missing={len(missing)}',
          flush=True)


if __name__ == '__main__':
    main()
