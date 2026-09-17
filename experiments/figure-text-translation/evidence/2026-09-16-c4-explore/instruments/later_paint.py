"""Extract the census's own 'later paint depends on it' figure list straight from
census/results.jsonl (n_later_paint_events > 0), NOT from the REPORT.md excerpt -- data, not
prose. Asserts the count matches REPORT.md's own stated 108; a disagreement is reported, not
silently reconciled. Writes render/later_paint_basenames.json.
"""
import json
from pathlib import Path

SCRATCH = Path('/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore')
CENSUS_RESULTS = SCRATCH / 'census/results.jsonl'
NONTEXT_TSV = SCRATCH / 'census/figures-with-nontext-in-bt.tsv'
OUT = SCRATCH / 'render/later_paint_basenames.json'


def main():
    later_paint = []
    n2o5_rows = []
    with open(CENSUS_RESULTS) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            d = json.loads(line)
            if d.get('basename') == 'CNX_Chem_18_07_N2O5':
                n2o5_rows.append({'variant': d.get('variant'), 'artwork': d.get('artwork'),
                                   'n_later_paint_events': d.get('n_later_paint_events')})
            if d.get('n_later_paint_events', 0) and d['n_later_paint_events'] > 0:
                later_paint.append({
                    'basename': d['basename'], 'bought': d.get('bought'),
                    'n_later_paint_events': d['n_later_paint_events'],
                })

    basenames = sorted(set(r['basename'] for r in later_paint))
    bought_suspects = sorted(r['basename'] for r in later_paint if r['bought'])

    print(f'later-paint figures (n_later_paint_events>0) in census/results.jsonl: {len(basenames)}')
    if len(basenames) != 108:
        print(f'*** DISAGREEMENT with REPORT.md\'s stated 108 -- got {len(basenames)}. '
              f'Reporting this discrepancy rather than reconciling it silently. ***')
    print(f'of which bought: {len(bought_suspects)} -> {bought_suspects}')

    print('N2O5 rows in census/results.jsonl:', n2o5_rows)
    # Which artwork_path does figures-with-nontext-in-bt.tsv carry for N2O5, if it appears there
    n2o5_in_tsv = []
    with open(NONTEXT_TSV, newline='') as tf:
        import csv
        for row in csv.DictReader(tf, delimiter='\t'):
            if row['basename'] == 'CNX_Chem_18_07_N2O5':
                n2o5_in_tsv.append(row)
    print('N2O5 row(s) in figures-with-nontext-in-bt.tsv:', n2o5_in_tsv)

    OUT.write_text(json.dumps({
        'basenames': basenames, 'bought_suspects': bought_suspects,
        'n2o5_census_rows': n2o5_rows, 'n2o5_tsv_rows': n2o5_in_tsv,
    }, indent=1))
    print(f'wrote {OUT}')


if __name__ == '__main__':
    main()
