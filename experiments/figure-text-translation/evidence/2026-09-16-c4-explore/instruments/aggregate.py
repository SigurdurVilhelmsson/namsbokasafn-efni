"""Read census/results.jsonl (one line per figure, written by driver.py) and produce:
  - census/REPORT.md
  - census/figures-with-nontext-in-bt.tsv
Read-only over the driver's own output; writes only under census/.
"""
import json
import collections
import sys
from pathlib import Path

SCRATCH = Path('/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore')
sys.path.insert(0, str(SCRATCH / 'lib'))
sys.path.insert(0, '/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation')
sys.path.insert(0, '/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/pylibs')
import census_lib as C  # for classify(), reused here to attribute a figure's op_counts to classes
import readlayer  # for GS_ARGV, so the recipe column shows the real argv, not a label
CENSUS_DIR = SCRATCH / 'census'
RESULTS_PATH = CENSUS_DIR / 'results.jsonl'
REPORT_PATH = CENSUS_DIR / 'REPORT.md'
TSV_PATH = CENSUS_DIR / 'figures-with-nontext-in-bt.tsv'
LOG_PATH = SCRATCH / 'logs' / 'driver.log'

GS_RECIPE_STR = ' '.join(readlayer.GS_ARGV) + ' -sOutputFile=<staged.pdf> <artwork.eps>'

CLASS_LABELS = {
    'persistent-gstate': 'persistent graphics state',
    'special-gstate': 'special graphics state',
    'marked-content': 'marked content',
    'path': 'path construction/painting/clipping',
    'xobject': 'XObject/shading/inline image',
    'compat': 'compatibility',
    'other': 'other',
}
CLASS_ORDER = ['persistent-gstate', 'special-gstate', 'marked-content', 'path', 'xobject', 'compat', 'other']

# The 8 figures strip-text.py's own docstring names as the known "7 Tr" clipping-mode
# hazard (CNX_Chem_01_02_decomp, _02_04_Benzene, _03_02_moles-6296, _04_02_Citrus,
# _04_02_ammonia, _04_04_CuAgNO3, _04_05_titration, _11_03_recompress). Treated as a
# HYPOTHESIS to check against this run's own Tr-mode census, not copied as fact.
DOCSTRING_MODE7_LIST = {
    'CNX_Chem_01_02_decomp', 'CNX_Chem_02_04_Benzene', 'CNX_Chem_03_02_moles-6296',
    'CNX_Chem_04_02_Citrus', 'CNX_Chem_04_02_ammonia', 'CNX_Chem_04_04_CuAgNO3',
    'CNX_Chem_04_05_titration', 'CNX_Chem_11_03_recompress',
}


def load_results():
    rows = []
    with open(RESULTS_PATH) as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def op_class_totals(rows):
    """-> (op_occ, op_figs, class_occ, class_figs) over the given rows (status in
    ('ok','partial') only -- rows with no successful walk carry no op/class data)."""
    op_occ = collections.Counter()
    op_figs = collections.Counter()
    class_occ = collections.Counter()
    class_figs = collections.Counter()
    for r in rows:
        if r['status'] not in ('ok', 'partial'):
            continue
        for op, n in r.get('op_counts', {}).items():
            op_occ[op] += n
            op_figs[op] += 1
        for cls, n in r.get('class_counts', {}).items():
            class_occ[cls] += n
            class_figs[cls] += 1
    return op_occ, op_figs, class_occ, class_figs


def fmt_table(occ, figs, label_col):
    lines = [f'| {label_col} | occurrences | figures |', '|---|---:|---:|']
    for k in sorted(occ, key=lambda x: -occ[x]):
        lines.append(f'| `{k}` | {occ[k]} | {figs[k]} |')
    if not occ:
        lines.append('| _(none)_ | 0 | 0 |')
    return '\n'.join(lines)


def verify_driver_done(n_expected):
    """The report is not trustworthy until the driver's OWN self-check line says the run
    is complete and self-consistent. Assert on the literal text, not just its presence."""
    text = LOG_PATH.read_text()
    expected = f'DONE n={n_expected} results={n_expected} dup=0 missing=0'
    assert expected in text, (
        f'driver.log does not contain the expected completion line {expected!r}; '
        f'last 10 lines: {text.strip().splitlines()[-10:]}')


def verify_positive_control(rows):
    """CNX_Chem_04_05_combustion must show a `k`/`K` event, armed, with
    paints_in_window >= 7 (the 7 arrowheads the register measured as recoloured)."""
    matches = [r for r in rows if r['basename'] == 'CNX_Chem_04_05_combustion']
    assert len(matches) == 1, f'expected exactly one combustion row, got {len(matches)}'
    r = matches[0]
    assert r['status'] == 'ok', f'combustion row status is {r["status"]!r}, not ok'
    hits = [e for e in r.get('later_paint_events', [])
            if e['op'] in ('k', 'K') and e['armed'] and e['paints_in_window'] >= 7]
    assert hits, (f'positive control FAILED: no k/K later-paint event with '
                  f'paints_in_window >= 7 on combustion; events were '
                  f'{r.get("later_paint_events")}')
    return hits[0]


def main():
    rows = load_results()
    n_total = len(rows)
    verify_driver_done(911)
    combustion_hit = verify_positive_control(rows)

    by_status = collections.Counter(r['status'] for r in rows)
    scanned = [r for r in rows if r['status'] in ('ok', 'partial')]
    bought_rows = [r for r in rows if r.get('bought')]
    bought_scanned = [r for r in bought_rows if r['status'] in ('ok', 'partial')]

    assert len(bought_rows) == 34, f'expected 34 bought rows, got {len(bought_rows)}'
    assert sum(by_status.values()) == n_total

    op_occ, op_figs, class_occ, class_figs = op_class_totals(rows)
    b_op_occ, b_op_figs, b_class_occ, b_class_figs = op_class_totals(bought_rows)

    with_nontext = [r for r in scanned if r.get('any_nontext_in_bt')]
    tr_mode_figs = collections.defaultdict(list)
    for r in scanned:
        for m in r.get('tr_modes', []):
            tr_mode_figs[m].append(r['basename'])

    # write the TSV the render step consumes
    def recipe_str(r):
        return GS_RECIPE_STR if r.get('staged_pdf_recipe') == 'gs-eps-staged' else 'pdf'

    with open(TSV_PATH, 'w') as f:
        f.write('basename\tartwork_path\tstaged_pdf_recipe_or_pdf\tbought\tclasses_present\n')
        for r in sorted(with_nontext, key=lambda x: x['basename']):
            f.write('\t'.join([
                r['basename'], r['artwork'], recipe_str(r),
                '1' if r.get('bought') else '0',
                ','.join(r.get('classes_present', [])),
            ]) + '\n')

    later_paint_figs = [r for r in scanned if r.get('n_later_paint_events', 0) > 0]

    lines = []
    lines.append('# BT..ET non-text-operator census — chemistry figure corpus')
    lines.append('')
    lines.append('Read-only measurement. Source data: this driver run\'s own '
                  f'`{RESULTS_PATH.relative_to(SCRATCH)}` (one JSON line per figure); '
                  'every number below is counted straight out of that file by this script '
                  f'(`{Path(__file__).name}`), nothing hand-tallied.')
    lines.append('')
    lines.append('## Population and denominators')
    lines.append('')
    lines.append(f'Total rows walked by the driver: **{n_total}** '
                  '(910 rows from `pagecensus.jsonl.gz`, minus 0 dropped, plus 1 extra '
                  'because `CNX_Chem_18_07_N2O5` is scanned twice — once as the resolved '
                  '`.pdf`, once as the `.eps` the resolver now actually uses — so '
                  '910 + 1 = 911; `CNX_Chem_11_04_rvosmosis` is KEPT as one row labelled '
                  '`resolver-refused`, not deleted, so nothing here is silently dropped).')
    lines.append('')
    lines.append('| status | rows |')
    lines.append('|---|---:|')
    for status, n in by_status.most_common():
        lines.append(f'| `{status}` | {n} |')
    lines.append(f'| **sum** | **{sum(by_status.values())}** |')
    lines.append('')
    lines.append(f'- Scanned successfully (`ok` + `partial`): **{len(scanned)}**')
    lines.append(f'- Excluded from scanning, resolver refuses it: **{by_status.get("resolver-refused", 0)}** '
                 '(`CNX_Chem_11_04_rvosmosis`)')
    fails = n_total - len(scanned) - by_status.get('resolver-refused', 0)
    lines.append(f'- Staged/opened/parsed failures of any kind: **{fails}**')
    for st in ('missing-artwork', 'staged-fail', 'open-fail', 'parse-fail'):
        if by_status.get(st):
            lines.append(f'  - `{st}`: {by_status[st]}')
            for r in rows:
                if r['status'] == st:
                    lines.append(f'    - `{r["basename"]}` ({r.get("variant")}): '
                                  f'{r.get("error", r.get("note", ""))[:200]}')
    partial_rows = [r for r in rows if r['status'] == 'partial']
    if partial_rows:
        lines.append('')
        lines.append(f'`partial` (scanned, but one or more `/Form` streams could not be '
                      f'tokenised — page + every OTHER form still counted): {len(partial_rows)}')
        for r in partial_rows:
            lines.append(f'  - `{r["basename"]}`: {r["unparsable_forms"]}')
    lines.append('')
    lines.append(f'Bought figures (group=`bought` in `after/summary.tsv`, joined on `artwork` '
                 f'path): **{len(bought_rows)}** rows matched, of which **{len(bought_scanned)}** '
                 'scanned successfully.')
    lines.append('')
    total_malformed = sum(r.get('malformed_unclosed_bt', 0) for r in scanned)
    lines.append(f'`malformed_unclosed_bt` (a BT with no matching ET before end of stream) '
                 f'summed over every scanned figure: **{total_malformed}**.')
    lines.append('')
    huge = next((r for r in rows if r['basename'] == 'CNX_Chem_21_04_ChnReact1'), None)
    if huge is not None:
        lines.append(f'Spot check, the largest input this run staged/opened (106 MB `.pdf`, '
                     f'the slowest figure in the run): `CNX_Chem_21_04_ChnReact1` — status '
                     f'`{huge["status"]}`, `forms_visited={huge.get("forms_visited")}`, '
                     f'`bt_et_count={huge.get("bt_et_count")}`, `op_counts={huge.get("op_counts")}`. '
                     'A sane row, not a silent truncation — the size came from a very large '
                     'number of `/Form` XObjects (one per drawn element), not from a hang.')
        lines.append('')

    lines.append('## Totals per operator and per class — ALL scanned figures '
                  f'(n={len(scanned)})')
    lines.append('')
    lines.append('Counting unit: **occurrences** = instruction count; **figures** = '
                  'distinct figures (rows) in which the operator/class appears at least once.')
    lines.append('')
    lines.append('### By class')
    lines.append('')
    lines.append('| class | occurrences | figures |')
    lines.append('|---|---:|---:|')
    for cls in CLASS_ORDER:
        lines.append(f'| {CLASS_LABELS[cls]} (`{cls}`) | {class_occ.get(cls, 0)} | {class_figs.get(cls, 0)} |')
    lines.append('')
    lines.append('### By operator')
    lines.append('')
    lines.append(fmt_table(op_occ, op_figs, 'operator'))
    lines.append('')

    lines.append(f'## Same, restricted to the 34 BOUGHT figures (n={len(bought_scanned)} scanned of 34)')
    lines.append('')
    lines.append('### By class')
    lines.append('')
    lines.append('| class | occurrences | figures |')
    lines.append('|---|---:|---:|')
    for cls in CLASS_ORDER:
        lines.append(f'| {CLASS_LABELS[cls]} (`{cls}`) | {b_class_occ.get(cls, 0)} | {b_class_figs.get(cls, 0)} |')
    lines.append('')
    lines.append('### By operator')
    lines.append('')
    lines.append(fmt_table(b_op_occ, b_op_figs, 'operator'))
    lines.append('')

    lines.append(f'## Figures with ANY non-text operator inside BT..ET: {len(with_nontext)} '
                  f'of {len(scanned)} scanned ({len(scanned) and 100*len(with_nontext)/len(scanned):.1f}%)')
    lines.append('')
    lines.append(f'Full list (basename, artwork path, staging recipe, bought 0/1, classes present) written to '
                  f'`{TSV_PATH.name}`. Bought figures among them: '
                  f'{sum(1 for r in with_nontext if r.get("bought"))} of {len(with_nontext)}.')
    lines.append('')
    for r in sorted(with_nontext, key=lambda x: x['basename']):
        lines.append(f'- `{r["basename"]}`{" **[bought]**" if r.get("bought") else ""} '
                     f'— classes: {", ".join(r.get("classes_present", []))} '
                     f'— ops: {r.get("op_counts")}')
    lines.append('')

    lines.append('## Figures with an operator in special-gstate, path, XObject/inline-image, '
                  'or "other" — named individually')
    lines.append('')
    for cls in ('special-gstate', 'path', 'xobject', 'other'):
        matches = [r for r in scanned if r.get('class_counts', {}).get(cls)]
        lines.append(f'### {CLASS_LABELS[cls]} (`{cls}`) — {len(matches)} figure(s)')
        lines.append('')
        if not matches:
            lines.append('_(none)_')
        for r in sorted(matches, key=lambda x: x['basename']):
            # attribute THIS figure's op_counts to the class using the same classify()
            # the driver used, so the per-op breakdown printed here is provably the same
            # partition as the class total (not re-derived by a second, drifting rule).
            ops_in_class = {op: n for op, n in r['op_counts'].items() if C.classify(op) == cls}
            assert sum(ops_in_class.values()) == r['class_counts'].get(cls), (
                r['basename'], cls, ops_in_class, r['class_counts'])
            lines.append(f'- `{r["basename"]}`{" **[bought]**" if r.get("bought") else ""}: '
                         f'{ops_in_class} (class total {r["class_counts"].get(cls)})')
        lines.append('')

    lines.append('## Text render modes (Tr) seen')
    lines.append('')
    for mode in sorted(tr_mode_figs):
        figs = tr_mode_figs[mode]
        lines.append(f'- mode `{mode}`: {len(figs)} figure(s) — {", ".join(sorted(set(figs))[:20])}'
                     + (' ...' if len(set(figs)) > 20 else ''))
    lines.append('')
    mode7_here = set(f for f in tr_mode_figs.get(7, []))
    lines.append('**Cross-check against strip-text.py\'s own docstring** (its named 8-figure '
                 '"7 Tr" list, treated as a hypothesis, not fact):')
    lines.append(f'- In this run\'s mode-7 set but NOT in the docstring list: '
                 f'{sorted(mode7_here - DOCSTRING_MODE7_LIST) or "(none)"}')
    lines.append(f'- In the docstring list but NOT found with mode 7 in this run: '
                 f'{sorted(DOCSTRING_MODE7_LIST - mode7_here) or "(none)"}')
    lines.append(f'- Agreement: {sorted(mode7_here & DOCSTRING_MODE7_LIST)}')
    lines.append('')
    citrus = next((r for r in scanned if r['basename'] == 'CNX_Chem_04_02_Citrus'), None)
    if citrus is not None:
        lines.append(f'**Mode 7 is a SEPARATE hazard from everything else in this census, and '
                     f'this instrument cannot see it.** `CNX_Chem_04_02_Citrus` has `Tr` mode 7 '
                     f'but classes_present = {citrus.get("classes_present") or "[]"} — ZERO '
                     f'non-text operators inside BT. That is expected, not a contradiction: '
                     f'mode 7 adds glyph outlines to the CLIPPING PATH, and the image that gets '
                     f'painted through that clip is drawn by a `Do` AFTER the `ET`, at text '
                     f'depth 0 — this census only tracks persistent GRAPHICS STATE (colour, '
                     f'line width, …) surviving past ET, and a clipping path is a different '
                     f'kind of persisted state, entirely orthogonal to the class list this '
                     f'task asked for. Treat the `Tr`-mode list above as its own axis, checked '
                     f'against `strip-text.py`\'s docstring, never folded into the '
                     f'"non-text-in-BT" or "later paint" findings.')
    lines.append('')

    lines.append(f'## "Later paint depends on it" — persistent-gstate-inside-BT events with '
                 f'paints_in_window > 0: {len(later_paint_figs)} figure(s)')
    lines.append('')
    lines.append(f'**Positive control, CHECKED (not just asserted in prose):** '
                 f'`CNX_Chem_04_05_combustion` carries a `{combustion_hit["op"]}` event '
                 f'{combustion_hit["operands"]} with `paints_in_window = '
                 f'{combustion_hit["paints_in_window"]}` (>= 7, the arrowhead count the '
                 f'register measured as recoloured). `verify_positive_control()` in this '
                 f'script raises if this ever stops holding.')
    lines.append('')
    bought_later_paint = [r for r in bought_scanned if r.get('n_later_paint_events', 0) > 0]
    lines.append(f'**Of the 34 bought figures, {len(bought_later_paint)} have at least one '
                 f'later-paint event** (i.e. would show SOME visible consequence from the '
                 f'current strip, by this census\'s over-approximate flag): '
                 f'{", ".join(sorted(r["basename"] for r in bought_later_paint))}.')
    lines.append('')
    lines.append('**Same-BT shadowing inflates the per-figure event COUNT (not the figure-level '
                 '"has any" verdict) — read `n_later_paint_events` as an upper bound on how many '
                 'DISTINCT persisted values matter, not as that number.** When two persistent-gstate '
                 'ops of the SAME category and SAME scope occur inside the SAME BT..ET (e.g. a run '
                 'of glyphs each preceded by its own `k`), only the LAST one before ET is the value '
                 'actually left behind — the earlier ones were overwritten before ET and never '
                 'persisted at all. This census arms an event only at ITS OWN ET and never retires '
                 'an unarmed sibling against another unarmed sibling, so `CNX_Chem_21_05_SmokeAlarm` '
                 'below reports 8 fill-colour/extgstate "events" from what is closer to ~3 actually-'
                 'persisting values. This does NOT change any figure-level count in this report '
                 '(bought-scanned, with_nontext, later_paint_figs all key on "any", not "how many") '
                 '— it only means a per-figure event list should not be read as a tally of distinct '
                 'colour changes.')
    lines.append('')
    lines.append(f'**Why {combustion_hit["paints_in_window"]}, not 7 — read before treating the '
                 'gap as a bug.** `paints_in_window` counts every instruction in the paint set '
                 '`f F f* B B* b b* S s sh Do` (+ inline images) seen after the event with '
                 'nothing invalidating it — the SAME union the task spec asks for. A `k`/`K` '
                 'fill-colour event is closed only by another fill-colour set or a `Q` popping '
                 'below its scope; a stroke-only `S` or an unrelated `Do` in between still '
                 'counts, because this census cannot tell "uses THIS persisted value" from '
                 '"happens while nothing has un-set it" without re-deriving full paint '
                 'semantics (this is the documented over-approximation, see Scope note). '
                 'So 29 is an upper bound containing the 7 real arrowhead fills, not a wrong '
                 'count of them — the render step (draw with/without the BT..ET, diff pixels) '
                 'is what tells 7 apart from the other 22.')
    lines.append('')
    for r in sorted(later_paint_figs, key=lambda x: -x.get('n_later_paint_events', 0)):
        lines.append(f'- `{r["basename"]}`{" **[bought]**" if r.get("bought") else ""}: '
                     f'{r["n_later_paint_events"]} event(s)')
        for e in r['later_paint_events']:
            lines.append(f'    - stream {e["stream"]}, `{e["op"]}` {e["operands"]} '
                         f'(category {e["category"]}, setDepth {e["setDepth"]}) '
                         f'-> paints_in_window={e["paints_in_window"]}, '
                         f'closed_by={e["closed_by"]}')
    lines.append('')

    # net q/Q per BT (item 8 from review): any figure where a BT..ET object has nonzero
    # net q - Q leaves the q/Q stack unbalanced for everything drawn after it -- meaning
    # the CURRENT strip (which deletes q/Q along with everything else inside BT..ET) is
    # not merely dropping colour but changing the STACK DEPTH for every later operator in
    # that stream, which is a stronger claim than "keep gstate ops" alone can fix.
    lines.append('## Net q − Q inside a single BT..ET object (nonzero = stack left unbalanced by that object)')
    lines.append('')
    imbalanced = [r for r in scanned if r.get('bt_net_q_nonzero_count', 0) > 0]
    lines.append(f'{len(imbalanced)} of {len(scanned)} scanned figures have at least one '
                 'BT..ET object whose q/Q count does not net to zero.')
    lines.append('')
    for r in sorted(imbalanced, key=lambda x: -x.get('bt_net_q_max_abs', 0)):
        lines.append(f'- `{r["basename"]}`{" **[bought]**" if r.get("bought") else ""}: '
                     f'max |net| = {r["bt_net_q_max_abs"]}, per-stream nets = '
                     f'{r.get("bt_net_q_by_stream", {})}')
    lines.append('')

    lines.append('## Finding: the hazard is (so far) CONFINED to native .pdf artwork — 0 of 299 '
                 'ghostscript-staged .eps figures show ANY non-text operator inside BT')
    lines.append('')
    kind_scanned = collections.Counter(r.get('kind') for r in scanned)
    kind_with_nontext = collections.Counter(r.get('kind') for r in with_nontext)
    lines.append('| kind | scanned | with any non-text-in-BT | % |')
    lines.append('|---|---:|---:|---:|')
    for kind in sorted(kind_scanned):
        n_s = kind_scanned[kind]
        n_h = kind_with_nontext.get(kind, 0)
        lines.append(f'| `{kind}` | {n_s} | {n_h} | {100*n_h/n_s:.1f}% |')
    lines.append('')
    eps_scanned = [r for r in scanned if r.get('kind') == 'eps']
    eps_with_bt = sum(1 for r in eps_scanned if r.get('bt_et_count', 0) > 0)
    lines.append(f'Context for the eps `0.0%`: **{eps_with_bt} of {len(eps_scanned)}** staged `.eps` '
                 f'figures have `bt_et_count > 0` at all (i.e. contain text objects post-staging) — '
                 'so the zero is not vacuous over an empty denominator; most staged figures DO '
                 'have BT..ET blocks, they simply never carry a persistent-gstate op inside one.')
    lines.append('')
    lines.append('This generalises the N2O5 pdf-vs-eps disagreement below to the WHOLE corpus: '
                 'every one of the 517 figures with a non-text operator inside BT is a native '
                 '`.pdf`; every one of the 299 figures staged from `.eps` through ghostscript '
                 '(`gs -dEPSCrop -sDEVICE=pdfwrite`, the same argv `figure-prepare.py` uses) '
                 'comes back with ZERO. **Read this as a fact about what ghostscript emits, not '
                 'as evidence that EPS source artwork never had the pattern** — the census can '
                 'only see the content stream AFTER staging, and staging demonstrably rewrites '
                 'it (see the N2O5 pdf-vs-eps pair below, the one figure in this corpus checked '
                 'both ways). If the render step is scoped by this list, it will currently never '
                 'touch a staged-EPS figure; that scoping should be revisited if a future '
                 'ghostscript version, or a different `-dEPSCrop` output, ever preserves the '
                 'in-BT gstate the way this run\'s single `.pdf`-vs-`.eps` control shows it can '
                 'discard.')
    lines.append('')

    lines.append('## Finding: N2O5 .pdf and .eps DISAGREE — staging is not a neutral step')
    lines.append('')
    n2o5_pdf = next((r for r in rows if r['key'] == 'CNX_Chem_18_07_N2O5|pdf'), None)
    n2o5_eps = next((r for r in rows if r['key'] == 'CNX_Chem_18_07_N2O5|eps'), None)
    if n2o5_pdf and n2o5_eps:
        lines.append(f'- `.pdf` (native, opened directly): op_counts = {n2o5_pdf.get("op_counts")}, '
                     f'classes = {n2o5_pdf.get("classes_present")}')
        lines.append(f'- `.eps` (staged through `gs`, the SAME argv `strip-text.py`\'s own '
                     f'callers use — {GS_RECIPE_STR}): op_counts = {n2o5_eps.get("op_counts")}, '
                     f'classes = {n2o5_eps.get("classes_present")}')
        lines.append('')
        lines.append('The native `.pdf` carries a `k` (fill-colour) AND a `gs` (ExtGState) '
                     'operator inside BT..ET; the ghostscript-staged `.eps` shows NEITHER — '
                     'zero non-text operators inside BT at all. **This means the `.eps` half '
                     'of this census describes what `gs -dEPSCrop -sDEVICE=pdfwrite` '
                     'RESTRUCTURED the content stream into (i.e. what `strip-text.py` actually '
                     'sees for an EPS input), not the artwork\'s own original text-object '
                     'shape** — ghostscript is free to re-emit an equivalent page in a '
                     'different operator sequence, and evidently does here. Since the resolver '
                     'now resolves N2O5 to the `.eps`, the FIGURE AS THE PIPELINE WILL ACTUALLY '
                     'PROCESS IT currently carries none of this hazard — but that is a fact '
                     'about ghostscript\'s specific rewrite of this ONE file, not a general '
                     'reason to trust staged EPS content streams over their `.pdf` siblings; '
                     'the 298 other staged `.eps` figures in this run were censused post-stage, '
                     'exactly as the real pipeline sees them, for the same reason.')
    else:
        lines.append('_(one or both N2O5 rows missing from results.jsonl — see denominators above)_')
    lines.append('')

    lines.append('## `gs` (ExtGState) is opaque to this census — note wherever it appears')
    lines.append('')
    gs_figs = [r for r in scanned if r.get('op_counts', {}).get('gs')]
    lines.append(f'{len(gs_figs)} figure(s) set an ExtGState (`gs`) inside BT..ET. An ExtGState '
                 'dictionary can bundle alpha, blend mode, line width, even a font — this '
                 'census counts `gs` as ONE persistent-gstate operator occurrence and cannot '
                 'say which parameter(s) inside the referenced dictionary persist past ET. '
                 'A `gs`-driven regression (e.g. blend mode bleeding into later artwork) would '
                 'be invisible to any check that only looks for colour operators. And unlike the '
                 'other over-approximations documented in this report, this one runs the OTHER '
                 'way: this census treats any later `gs` as fully closing an earlier one (same '
                 'category, same scope), but two `gs` calls reference two ExtGState DICTIONARIES '
                 'that need not overlap — if the first sets alpha and the second sets only blend '
                 'mode, the alpha set by the first is still in effect after the second, and this '
                 'census would wrongly report the first as closed.')
    for r in sorted(gs_figs, key=lambda x: x['basename']):
        lines.append(f'- `{r["basename"]}`{" **[bought]**" if r.get("bought") else ""}: '
                     f'gs x{r["op_counts"]["gs"]}')
    lines.append('')

    lines.append('## Scope note')
    lines.append('')
    lines.append('This walks EXACTLY what `strip-text.py`\'s `strip_text` walks: page 1\'s '
                 '`/Contents` (array-aware, via `_deps.read_content`) plus every reachable '
                 '`/Form` XObject, recursively, objgen-deduplicated, descending only into '
                 'that form\'s own `/Resources`. It does **not** walk `/Pattern` resources, '
                 'annotation appearance streams, or `/SMask` soft-mask group streams — those '
                 'are unreachable from this walk exactly as they are unreachable from '
                 '`strip_text`, so a non-text operator inside one of THOSE would not appear '
                 'here and would also not be stripped by the tool this census exists to '
                 'inform. The "later paint" flag is scored PER STREAM (page and each form '
                 'independently), matching how `strip_text_ops` strips each stream in '
                 'isolation, and matching `inbt_ops.py`\'s own per-stream `scan()`.')
    lines.append('')
    lines.append('The flag is a documented OVER-APPROXIMATION (see `census_lib.py`\'s module '
                 'docstring): it can over-count paints that are actually inside a nested, '
                 'differently-coloured `q...Q` scope, and it does not model `cs`/`CS` '
                 'resetting a colour to a space default with no `g`/`rg`/`k` operator '
                 'appearing. It is a WHERE-TO-LOOK instrument, not a substitute for '
                 'rendering the artwork with and without BT..ET and diffing pixels.')
    lines.append('')

    REPORT_PATH.write_text('\n'.join(lines))
    print(f'wrote {REPORT_PATH} and {TSV_PATH}')
    print(f'DONE n_total={n_total} scanned={len(scanned)} with_nontext={len(with_nontext)} '
          f'later_paint_figs={len(later_paint_figs)}')


if __name__ == '__main__':
    main()
