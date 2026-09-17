"""Build the render-driver's population list. §C140 ④ build: paths repointed per the task
brief -- SUMMARY_TSV at THIS build's own "before" keys (Task 1's prepare_corpus --label
before, byte-identical to the c7-build's after/summary.tsv, per Task 1's report), and
NONTEXT_TSV at the FROZEN exploration folder's committed census TSV (not the exploration's
scratch copy, which is not guaranteed to still exist).
(a) all 34 bought figures (group=='bought' rows in reports/before/summary.tsv, its own
    `artwork` path).
(b) every row in evidence/2026-09-16-c4-explore/census/figures-with-nontext-in-bt.tsv whose
    `bought` column is '0' (i.e. not already counted in (a)) -- basename + artwork_path +
    recipe.
-> list of dict(basename, artwork, kind, bought, recipe)
`kind` is the artwork suffix lower-cased without the dot ('pdf'/'eps'/'ai'), used to decide
whether staging through ghostscript is needed (see driver_render.py's stage_if_needed).
"""
import csv
from pathlib import Path

FIGTEXT = Path('/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation')
SUMMARY_TSV = FIGTEXT / 'evidence/2026-09-17-c4-build/reports/before/summary.tsv'
NONTEXT_TSV = FIGTEXT / 'evidence/2026-09-16-c4-explore/census/figures-with-nontext-in-bt.tsv'


def build():
    bought_rows = []
    with open(SUMMARY_TSV, newline='') as f:
        for row in csv.DictReader(f, delimiter='\t'):
            if row['group'] == 'bought':
                artwork = Path(row['artwork'])
                bought_rows.append({
                    'basename': row['basename'], 'artwork': str(artwork),
                    'kind': artwork.suffix.lower().lstrip('.'), 'bought': True,
                    'recipe': 'gs-eps-staged' if artwork.suffix.lower() in ('.eps', '.ai') else 'pdf',
                })
    assert len(bought_rows) == 34, f'expected 34 bought rows, got {len(bought_rows)}'
    bought_basenames = {r['basename'] for r in bought_rows}

    pop_b_rows = []
    with open(NONTEXT_TSV, newline='') as f:
        for row in csv.DictReader(f, delimiter='\t'):
            if row['bought'] == '1':
                continue   # already in (a)
            if row['basename'] in bought_basenames:
                continue   # defensive; should not happen given the tsv's own bought column
            artwork = Path(row['artwork_path'])
            pop_b_rows.append({
                'basename': row['basename'], 'artwork': str(artwork),
                'kind': artwork.suffix.lower().lstrip('.'), 'bought': False,
                'recipe': row['staged_pdf_recipe_or_pdf'],
            })

    population = bought_rows + pop_b_rows
    # de-dup by basename, keeping the FIRST occurrence (bought rows come first, so a bought
    # row's own artwork path always wins over anything a later source might suggest)
    seen = set()
    out = []
    for r in population:
        if r['basename'] in seen:
            continue
        seen.add(r['basename'])
        out.append(r)
    return out, bought_rows, pop_b_rows


if __name__ == '__main__':
    pop, a, b = build()
    print(f'population(a) bought = {len(a)}')
    print(f'population(b) non-bought-with-nontext = {len(b)}')
    print(f'population total (deduped) = {len(pop)}')
    kinds = {}
    for r in pop:
        kinds[r['kind']] = kinds.get(r['kind'], 0) + 1
    print('kinds:', kinds)
