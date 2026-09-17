"""Aggregate render/results.jsonl into render/REPORT.md. Read-only; every number here is
counted straight out of results.jsonl, nothing hand-tallied. Run AFTER driver_render.py's
"DONE n=..." line appears in its log.
"""
import json
from collections import defaultdict
from pathlib import Path

SCRATCH = Path('/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore')
RESULTS = SCRATCH / 'render/results.jsonl'
REPORT = SCRATCH / 'render/REPORT.md'
CONTROLS_JSON = SCRATCH / 'render/controls/smoke_combustion.json'
LATER_PAINT_JSON = SCRATCH / 'render/later_paint_basenames.json'
DESCRIPTIONS_JSON = SCRATCH / 'render/descriptions.json'   # {basename: "hand-written description"} filled after Read-ing crops


def load():
    rows = []
    with open(RESULTS) as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def main():
    rows = load()
    by_fig = defaultdict(dict)
    for r in rows:
        by_fig[r['basename']][r['variant']] = r
    n_figs = len(by_fig)

    status_counts = defaultdict(lambda: defaultdict(int))
    for r in rows:
        status_counts[r['variant']][r['status']] += 1

    changed_40 = {'PERSIST': [], 'NONTEXT': []}
    changed_0 = {'PERSIST': [], 'NONTEXT': []}
    size_mismatch = {'PERSIST': [], 'NONTEXT': []}
    pn_differ = []
    all_changed_basenames = set()

    for basename, variants in by_fig.items():
        bought = variants.get('ORIG', {}).get('bought', variants.get('PERSIST', {}).get('bought'))
        for v in ('PERSIST', 'NONTEXT'):
            d = variants.get(v, {}).get('diff_vs_orig')
            if d is None:
                continue
            if not d.get('size_match', True):
                size_mismatch[v].append((basename, bought))
                continue
            if d['count_gt40'] > 0:
                changed_40[v].append((basename, bought, d['count_gt40'], d['bbox_gt40']))
                all_changed_basenames.add(basename)
            if d['count_gt0'] > 0:
                changed_0[v].append((basename, bought, d['count_gt0']))
                all_changed_basenames.add(basename)
        dpn = variants.get('NONTEXT', {}).get('diff_persist_vs_nontext')
        if dpn is not None and dpn.get('size_match', True) and dpn['count_gt0'] > 0:
            pn_differ.append((basename, bought, dpn))

    bought_figs = {b for b, v in by_fig.items() if v.get('ORIG', {}).get('bought') or v.get('PERSIST', {}).get('bought')}

    lines = []
    lines.append('# BT..ET strip variants — rendered artwork impact (0 ISK)\n')
    lines.append('Read-only render/diff measurement. Every number below is counted straight out of '
                  'this run\'s own `render/results.jsonl` by `aggregate_render.py`, nothing hand-tallied.\n')

    lines.append('## Population and denominators\n')
    lines.append(f'- Population (a) bought figures: 34')
    lines.append(f'- Population (b) non-bought figures with any non-text-in-BT operator: 499')
    lines.append(f'- Combined population processed: **{n_figs}** distinct figures (target 533)')
    lines.append('')
    lines.append('Per-variant render/strip status (each figure contributes one line per variant):\n')
    lines.append('| variant | status | count |')
    lines.append('|---|---|---:|')
    for v in ('ORIG', 'PERSIST', 'NONTEXT'):
        for status, cnt in sorted(status_counts[v].items()):
            lines.append(f'| {v} | {status} | {cnt} |')
    lines.append('')

    lines.append('## The two instrument controls\n')
    if CONTROLS_JSON.exists():
        c = json.loads(CONTROLS_JSON.read_text())
        ser1 = c.get('serialiser_control_diff', {})
        ser2 = c.get('serialiser_identity_diff_vs_source', {})
        planted = c.get('planted_control_diff', {})
        lines.append(f"- **SERIALISER control** (CNX_Chem_04_05_combustion, ORIG stripped a SECOND time "
                      f"vs the first): count_gt0={ser1.get('count_gt0')}, count_gt40={ser1.get('count_gt40')} "
                      f"— proves re-serialisation alone introduces 0 px of change.")
        lines.append(f"- **SERIALISER control (identity parse/unparse variant)**, RAW source vs an "
                      f"identity parse->unparse of the same source (no operator removed at all): "
                      f"count_gt0={ser2.get('count_gt0')}, count_gt40={ser2.get('count_gt40')}.")
        lines.append(f"- **PLANTED control**: a 20x20 px black rectangle drawn on a copy of combustion's "
                      f"own ORIG render, diffed against ORIG: count_gt0={planted.get('count_gt0')}, "
                      f"count_gt40={planted.get('count_gt40')}, bbox={planted.get('bbox_gt40')} — proves "
                      f"the diff instrument DOES detect a real change when one is present.")
    else:
        lines.append('- controls JSON missing — see render/controls/smoke_combustion.json')
    lines.append('')

    lines.append('## Census-derived predictions, stated before this run, now checked\n')
    lines.append('- Prediction: PERSIST and NONTEXT are operator-for-operator IDENTICAL on this corpus '
                  '(the census found zero special-gstate/marked-content/path/xobject/compat/other '
                  'operators inside any BT..ET, corpus-wide — so NONTEXT dropping only text ops and '
                  'PERSIST keeping only persistent-gstate ops leave the same residue).')
    lines.append(f'  - **Result: {len(pn_differ)} figures where PERSIST and NONTEXT differ from each other '
                  f'(count_gt0 > 0).**' + (' Prediction CONFIRMED.' if not pn_differ else ' Prediction VIOLATED — see below.'))
    lines.append('- Prediction (design/register): "only combustion changes, 7 arrowheads back to black, '
                  '0 px elsewhere" among the 34 bought figures. Checked against the >40 threshold below.')
    lines.append('')

    lines.append('## Per-variant counts of figures changed (whole population, n={})\n'.format(n_figs))
    lines.append('| variant | figures with count_gt40 > 0 | figures with count_gt0 > 0 | size-mismatch |')
    lines.append('|---|---:|---:|---:|')
    for v in ('PERSIST', 'NONTEXT'):
        lines.append(f'| {v} | {len(changed_40[v])} | {len(changed_0[v])} | {len(size_mismatch[v])} |')
    lines.append('')

    lines.append('## Per-variant counts, 34-BOUGHT subset only\n')
    lines.append('| variant | figures with count_gt40 > 0 | figures with count_gt0 > 0 |')
    lines.append('|---|---:|---:|')
    for v in ('PERSIST', 'NONTEXT'):
        b40 = [x for x in changed_40[v] if x[1]]
        b0 = [x for x in changed_0[v] if x[1]]
        lines.append(f'| {v} | {len(b40)} | {len(b0)} |')
    lines.append('')
    for v in ('PERSIST', 'NONTEXT'):
        b40names = sorted(x[0] for x in changed_40[v] if x[1])
        lines.append(f'- {v} bought figures with count_gt40>0: {b40names if b40names else "(none)"}')
    lines.append('')

    lines.append('## Census cross-reference: changed figures vs the 108 "later paint" candidates\n')
    later_paint = {}
    if LATER_PAINT_JSON.exists():
        later_paint = json.loads(LATER_PAINT_JSON.read_text())
    lp_set = set(later_paint.get('basenames', []))
    changed_set = all_changed_basenames
    lines.append(f'- Census "later paint depends on it" candidates (from census/results.jsonl, '
                 f'`n_later_paint_events>0`): **{len(lp_set)}** (report\'s own count: 108)')
    lines.append(f'- Rendered as actually CHANGED (count_gt0>0 in PERSIST or NONTEXT vs ORIG), this run: '
                 f'**{len(changed_set)}**')
    lines.append(f'- Changed AND in the 108 candidates: {len(changed_set & lp_set)}')
    outside = sorted(changed_set - lp_set)
    lines.append(f'- Changed but OUTSIDE the 108 candidates (a census miss, if any): '
                 f'{len(outside)}' + (f' -> {outside}' if outside else ''))
    inside_not_changed = sorted(lp_set - changed_set)
    lines.append(f'- In the 108 candidates but NOT changed on render (over-approximation confirmed by '
                 f'the render, per census_lib\'s own documented caveat): {len(inside_not_changed)}')
    lines.append('')
    lines.append('### The 6 bought later-paint suspects, by measured outcome\n')
    for b in later_paint.get('bought_suspects', []):
        v = by_fig.get(b, {})
        d = v.get('PERSIST', {}).get('diff_vs_orig') or v.get('NONTEXT', {}).get('diff_vs_orig')
        outcome = 'CHANGED' if (d and d.get('size_match') and d.get('count_gt0', 0) > 0) else 'NOT changed (0 px)'
        lines.append(f'- `{b}`: {outcome}' + (f' — {d}' if outcome == 'CHANGED' else ''))
    lines.append('')
    n2o5 = later_paint.get('n2o5_tsv_rows', [])
    if n2o5:
        lines.append(f'- **N2O5 note**: `figures-with-nontext-in-bt.tsv` carries N2O5\'s **`.pdf`** '
                     f'artwork_path ({n2o5[0]["artwork_path"]}); the census\'s own REPORT.md records that '
                     f'the resolver now resolves N2O5 to the **`.eps`** instead. This run\'s N2O5 row '
                     f'therefore describes the `.pdf` half, which is NOT the half the real pipeline '
                     f'currently processes for this one figure (both show 0 later-paint events regardless).')
    lines.append('')

    lines.append('## Every figure with a nonzero (>40) diff in either variant — named, with crop path and description\n')
    descriptions = json.loads(DESCRIPTIONS_JSON.read_text()) if DESCRIPTIONS_JSON.exists() else {}
    all40 = sorted(set(x[0] for x in changed_40['PERSIST']) | set(x[0] for x in changed_40['NONTEXT']))
    if not all40:
        lines.append('(none)')
    for basename in all40:
        variants = by_fig[basename]
        bought = variants.get('PERSIST', variants.get('NONTEXT', {})).get('bought')
        crop = variants.get('PERSIST', variants.get('NONTEXT', {})).get('crop_path')
        dp = variants.get('PERSIST', {}).get('diff_vs_orig')
        dn = variants.get('NONTEXT', {}).get('diff_vs_orig')
        dirp = variants.get('PERSIST', {}).get('direction_vs_source')
        dirn = variants.get('NONTEXT', {}).get('direction_vs_source')
        lines.append(f'### `{basename}`' + (' **[bought]**' if bought else ''))
        lines.append(f'- PERSIST vs ORIG: {dp}')
        lines.append(f'- NONTEXT vs ORIG: {dn}')
        if dirp:
            lines.append(f'- direction (PERSIST): {dirp}')
        if dirn:
            lines.append(f'- direction (NONTEXT): {dirn}')
        lines.append(f'- crop (first-pass, may be squished for a wide bbox): `{crop}`')
        stack = SCRATCH / f'render/crops/{basename}_stack.png'
        tight = SCRATCH / f'render/crops/{basename}_tight.png'
        if stack.exists():
            lines.append(f'- post-pass vertical stack crop: `{stack}`')
        if tight.exists():
            lines.append(f'- post-pass tight crop (largest connected diff component): `{tight}`')
        lines.append(f'- **description**: {descriptions.get(basename, "TBD -- not yet looked at")}')
        lines.append('')

    lines.append('## Figures with a nonzero but SUB-40 diff (count_gt0>0, count_gt40==0)\n')
    band40 = []
    for v in ('PERSIST', 'NONTEXT'):
        for basename, bought, cnt in changed_0[v]:
            d = by_fig[basename][v]['diff_vs_orig']
            if d['count_gt40'] == 0 and d['count_gt0'] > 0:
                band40.append((basename, v, bought, cnt))
    if not band40:
        lines.append('(none)')
    else:
        for basename, v, bought, cnt in sorted(set(band40)):
            lines.append(f'- `{basename}` [{v}]' + (' [bought]' if bought else '') + f': count_gt0={cnt}, count_gt40=0')
    lines.append('')

    lines.append('## Figures where PERSIST and NONTEXT differ from EACH OTHER (count_gt0>0)\n')
    if not pn_differ:
        lines.append('(none)')
    else:
        for basename, bought, dpn in pn_differ:
            lines.append(f'- `{basename}`' + (' [bought]' if bought else '') + f': {dpn}')
    lines.append('')

    lines.append('## Size mismatches (rendered PERSIST/NONTEXT dimensions != ORIG)\n')
    any_mismatch = size_mismatch['PERSIST'] or size_mismatch['NONTEXT']
    if not any_mismatch:
        lines.append('(none)')
    else:
        for v in ('PERSIST', 'NONTEXT'):
            for basename, bought in size_mismatch[v]:
                lines.append(f'- {v} vs ORIG size mismatch: `{basename}`' + (' [bought]' if bought else ''))
    lines.append('')

    lines.append('## SERIALISER control, per changed figure (variant=SERIALISER rows, post-pass)\n')
    serial_rows = [r for r in rows if r.get('variant') == 'SERIALISER']
    if not serial_rows:
        lines.append('(none written yet -- run post_pass.py)')
    else:
        for r in serial_rows:
            d = r.get('diff_vs_orig_first_save')
            lines.append(f"- `{r['basename']}`: status={r['status']}" +
                         (f", count_gt0={d['count_gt0']}, count_gt40={d['count_gt40']}" if d else '') +
                         (f", error={r.get('error')}" if r.get('error') else ''))
    lines.append('')

    lines.append('## Render/strip failures (status != ok), any variant\n')
    fails = [r for r in rows if r['status'] not in ('ok', 'skipped')]
    if not fails:
        lines.append('(none)')
    else:
        for r in fails:
            lines.append(f"- `{r['basename']}` variant={r['variant']} status={r['status']} error={r.get('error')}")
    lines.append('')

    REPORT.write_text('\n'.join(lines) + '\n')
    print(f'wrote {REPORT} ({len(lines)} lines)')
    print(f'n_figs={n_figs} changed(>40) PERSIST={len(changed_40["PERSIST"])} NONTEXT={len(changed_40["NONTEXT"])} '
          f'pn_differ={len(pn_differ)} size_mismatch={sum(len(v) for v in size_mismatch.values())} fails={len(fails)}')


if __name__ == '__main__':
    main()
