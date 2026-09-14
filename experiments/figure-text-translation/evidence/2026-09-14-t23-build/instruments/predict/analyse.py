#!/usr/bin/env python3
"""r2 analysis: every sweep cell vs V0 with c3b's verdict definitions (copied verbatim from
c3b/scripts/analyse.py: census_verdict, contact, ext_verdict, mech_resolved), plus r2 lists.
Writes r2/analysis.json and r2/tables.md."""
import json, collections, math
from pathlib import Path

C3 = Path('/home/siggi/dev/scratch-c140/c3'); R2 = Path('/home/siggi/dev/scratch-c140/r2')
import sys   # PRED ADAPTATION A2/A4: per-tag input paths, output dir, mode
PRED = Path('/home/siggi/dev/scratch-c140/plan/pred2')
MODE = sys.argv[1] if len(sys.argv) > 1 else 'final'
assert MODE in ('control', 'final'), MODE
NEWTAG = sys.argv[2] if len(sys.argv) > 2 else 'FINAL'   # the build under test (PRED/work/<NEWTAG>)
REMEASURED = {'V0', 'V5_p2.0_f7.5', NEWTAG}   # measured by the adapted measure.py into PRED/out
MEAS = lambda V: (PRED / 'out' if V in REMEASURED else R2) / f'measure-{V}.jsonl'
WORKDIR = lambda V: (PRED / 'work' if V == NEWTAG else R2 / 'work') / V
PREP = Path('/home/siggi/dev/scratch-c140/prep')
SWEEP = ['V5_p2.0_f7.0', 'V5_p2.0_f7.5', 'V5_p2.0_f8.0', 'V5_p2.5_f7.0', 'V5_p2.5_f7.5', 'V5_p2.5_f8.0']
TAGS = ['V0'] + SWEEP + ['V5_p2.0_f7.5_dec'] + ([NEWTAG] if MODE == 'final' else [])   # PRED ADAPTATION A4
M = {V: {(r['basename'], r['block']): r for r in map(json.loads, open(MEAS(V)))} for V in TAGS}
UF = json.loads((C3 / 'userflags.json').read_text())
CEN = json.loads((R2 / 'census.json').read_text())
KEYS = sorted(M['V0'])
assert len(KEYS) == 176 and all(set(M[V]) == set(KEYS) for V in TAGS)
short = lambda k: f"{k[0].replace('CNX_Chem_', '')} b{k[1]}"
PROSE_ROWS = {23, 24, 31}
names = [f['basename'] for f in json.loads((PREP / 'manifest.json').read_text())['figures']]


# ---------------- c3b definitions, verbatim ----------------
def census_verdict(r):
    v = []
    if r['ink_on_dark'] >= 10: v.append('hit-artwork')
    if r['ink_off_page'] > r['src_ink_off_page']: v.append('off-page')
    if r['shrunk']: v.append('shrunk')
    return v


def contact(r):
    if r['cls'] != 'BOUNDED':
        return False
    g = r['geometry'].get('container_vector') or r['geometry']['container']
    return min(g['drawn']['left'], g['drawn']['right']) < 1.0


def ext_verdict(r):
    v = [x for x in census_verdict(r) if x != 'shrunk']
    if r['spill'] >= 10: v.append('spill')
    if contact(r): v.append('contact')
    if r['text_coll'] >= 10: v.append('text-coll')
    return v


def mech_resolved(r, mech, row, k):
    if mech == 'WIDER':
        if r['cls'] == 'BOUNDED':
            g = r['geometry'].get('container_vector') or r['geometry']['container']
            return min(g['drawn']['left'], g['drawn']['right']) >= 1.0 and r['spill'] < 10 and r['ink_on_dark'] < 10
        g = r['geometry']['free_dark_or_labels']
        return min(g['drawn']['left'], g['drawn']['right']) >= 1.0 and r['ink_on_dark'] < 10
    if mech == 'NARROWER':
        if row in PROSE_ROWS:
            return r['lines'] <= r['src_lines'] and r['ink_on_dark'] < 10 and r['ink_off_page'] <= r['src_ink_off_page']
        return r['lines'] <= r['src_lines'] or (r['ink_on_dark'] < 10 and r['ink_off_page'] <= r['src_ink_off_page'] and r['text_coll'] < 10)
    if mech == 'ANCHOR':
        if k == ('CNX_Chem_04_03_ethene_img', 0):
            return r['lines'] <= r['src_lines']
        return abs(r['drawn_frame']['a0'] - r['src_left_edge']) <= 0.5
    if mech == 'SHRINK':
        return not r['shrunk']
    if mech == 'TABLE':
        return r['spill'] < 10 and r['lines'] == r['src_lines']
    raise ValueError(mech)
# -----------------------------------------------------------


def cmargin(r):
    g = r['geometry'].get('container_vector') or r['geometry']['container']
    return min(g['drawn']['left'], g['drawn']['right'])


flag_checks = []
for k, flags in UF.items():
    b, bi = k.rsplit('#', 1); kk = (b, int(bi))
    for f in flags:
        for m in f['mechanism']:
            flag_checks.append((kk, f['row'], m))
assert len(flag_checks) == 50 and len({c[0] for c in flag_checks}) == 41

VERDICTS = [('hit', lambda r: r['ink_on_dark'] >= 10, lambda r: r['ink_on_dark']),
            ('offpage', lambda r: 'off-page' in census_verdict(r), lambda r: r['ink_off_page'] - r['src_ink_off_page']),
            ('spill', lambda r: r['spill'] >= 10, lambda r: r['spill']),
            ('contact', contact, lambda r: -cmargin(r) if r['cls'] == 'BOUNDED' else 0),
            ('text_coll', lambda r: r['text_coll'] >= 10, lambda r: r['text_coll']),
            ('shrunk', lambda r: r['shrunk'], lambda r: -r['size']),
            ('lines_differ', lambda r: r['lines'] != r['src_lines'], lambda r: abs(r['lines'] - r['src_lines']))]

A = {'per_tag': {}, 'flag_table': [], 'blocks': {}}
for V in TAGS:
    P = {}
    rows = M[V]
    unresolved = [(short(kk), row, m) for (kk, row, m) in flag_checks if not mech_resolved(rows[kk], m, row, kk)]
    unres_blocks = {u[0] for u in unresolved}
    problem = [short(k) for k in KEYS if ext_verdict(rows[k]) or short(k) in unres_blocks]
    bycls = {}
    for c in ('box', 'cell', 'open'):
        ks = [k for k in KEYS if CEN[f'{k[0]}#{k[1]}']['r2cls'] == c]
        bycls[c] = dict(n=len(ks), **{nm: sum(1 for k in ks if f(rows[k])) for nm, f, _ in VERDICTS},
                        more_lines=sum(1 for k in ks if rows[k]['lines'] > rows[k]['src_lines']),
                        fewer_lines=sum(1 for k in ks if rows[k]['lines'] < rows[k]['src_lines']))
    totals = {nm: sum(1 for k in KEYS if f(rows[k])) for nm, f, _ in VERDICTS}
    totals['more_lines'] = sum(1 for k in KEYS if rows[k]['lines'] > rows[k]['src_lines'])
    totals['fewer_lines'] = sum(1 for k in KEYS if rows[k]['lines'] < rows[k]['src_lines'])
    totals['ink_sum'] = sum(rows[k]['ink_on_dark'] for k in KEYS)
    totals['census_union'] = sum(1 for k in KEYS if census_verdict(rows[k]))
    tr = {}
    for nm, f, sev in VERDICTS:
        f0 = {k for k in KEYS if f(M['V0'][k])}; f1 = {k for k in KEYS if f(rows[k])}
        worse = []
        for k in sorted(f0 & f1):
            d = sev(rows[k]) - sev(M['V0'][k])
            thr = {'hit': 10, 'offpage': 1, 'spill': 10, 'contact': 0.25, 'text_coll': 10, 'shrunk': 0.01, 'lines_differ': 1}[nm]
            if d >= thr - 1e-9:
                worse.append((short(k), round(sev(M['V0'][k]), 2), round(sev(rows[k]), 2)))
        tr[nm] = dict(fixed=sorted(map(short, f0 - f1)), broken=sorted(map(short, f1 - f0)), still=len(f0 & f1),
                      worsened=worse, unchanged_clean=len(set(KEYS) - f0 - f1))
    # the extended problem union
    p0 = set(A['per_tag']['V0']['problem']) if V != 'V0' else set(problem)
    tr['problem'] = dict(fixed=sorted(p0 - set(problem)), broken=sorted(set(problem) - p0), still=len(p0 & set(problem)))
    below = [(short(k), rows[k]['size'], rows[k]['sz0']) for k in KEYS if rows[k]['size'] < 8.5 - 1e-9]
    below_new = [x for x in below if x[2] >= 8.5]
    below_src = [x for x in below if x[2] < 8.5]
    shrunk = [(short(k), rows[k]['sz0'], rows[k]['size']) for k in KEYS if rows[k]['shrunk']]
    rep_over, rep_fb = [], []
    for b in names:
        rp = json.loads((WORKDIR(V) / b / 'compose-report.json').read_text())
        if V == NEWTAG:   # PRED ADAPTATION A5: the build's field names -> r2's; word None = line-count overhang
            dg = {d['block']: d for d in json.loads((WORKDIR(V) / b / 'diag.json').read_text())}
            conv = [dict(key=o['key'], block=o['block'], word=o['word'], need_pt=round(o['needPt'], 3),
                         budget_pt=round(o['budgetPt'], 3), size=o['sizePt'], cls=dg[o['block']]['cls']) for o in rp.get('overflow', [])]
            rp = dict(overflow=[o for o in conv if o['word'] is not None], openFallback=[o for o in conv if o['word'] is None])
        rep_over += [dict(basename=b.replace('CNX_Chem_', ''), **o) for o in rp.get('overflow', [])]
        rep_fb += [dict(basename=b.replace('CNX_Chem_', ''), **o) for o in rp.get('openFallback', [])]
    offp = [(short(k), rows[k]['ink_off_page'] - rows[k]['src_ink_off_page']) for k in KEYS if 'off-page' in census_verdict(rows[k])]
    changed = [short(k) for k in KEYS if rows[k]['text'] != M['V0'][k]['text'] or rows[k]['drawn_frame'] != M['V0'][k]['drawn_frame'] or rows[k]['size'] != M['V0'][k]['size']]
    steps = collections.defaultdict(list)
    for k in KEYS:
        r2 = rows[k].get('r2')
        if r2:
            steps[f"{r2['cls']}:{r2['step']}"].append(short(k))
    lines_more = [(short(k), rows[k]['src_lines'], rows[k]['lines']) for k in KEYS if rows[k]['lines'] > rows[k]['src_lines']]
    lines_fewer = [(short(k), rows[k]['src_lines'], rows[k]['lines']) for k in KEYS if rows[k]['lines'] < rows[k]['src_lines']]
    P.update(problem=sorted(problem), problem_n=len(problem), unresolved=unresolved, unresolved_n=len(unresolved),
             by_class=bycls, totals=totals, transitions=tr, below_8_5=below, below_8_5_new=below_new, below_8_5_src=below_src,
             below_new_sum=round(sum(8.5 - x[1] for x in below_new), 2), shrunk=shrunk, overflow=rep_over,
             open_fallback=rep_fb, offpage=offp, changed_vs_V0=len(changed), steps={k: v for k, v in steps.items()},
             lines_more=lines_more, lines_fewer=lines_fewer)
    P['rank'] = (P['problem_n'], P['unresolved_n'], len(rep_over), len(below_new), P['below_new_sum'], len(offp))
    A['per_tag'][V] = P

for (kk, row, m) in flag_checks:
    A['flag_table'].append(dict(block=short(kk), key=M['V0'][kk]['key'], row=row, mech=m, cls=CEN[f'{kk[0]}#{kk[1]}']['r2cls'],
                                **{V: mech_resolved(M[V][kk], m, row, kk) for V in TAGS},
                                lines={V: f"{M[V][kk]['src_lines']}->{M[V][kk]['lines']}" for V in TAGS},
                                size={V: M[V][kk]['size'] for V in TAGS}))
for k in KEYS:
    A['blocks'][short(k)] = {V: dict(lines=M[V][k]['lines'], size=M[V][k]['size'], text=M[V][k]['text'], ext=ext_verdict(M[V][k]),
                                     census=census_verdict(M[V][k]), ink=M[V][k]['ink_on_dark'], spill=M[V][k]['spill'],
                                     tc=M[V][k]['text_coll'], off=M[V][k]['ink_off_page'], cm=round(cmargin(M[V][k]), 2) if M[V][k]['cls'] == 'BOUNDED' else None,
                                     step=(M[V][k].get('r2') or {}).get('step')) for V in TAGS}
    A['blocks'][short(k)]['cls'] = CEN[f'{k[0]}#{k[1]}']['r2cls']; A['blocks'][short(k)]['src_lines'] = M['V0'][k]['src_lines']
    A['blocks'][short(k)]['key'] = M['V0'][k]['key']
A['best_by_rule'] = min(SWEEP, key=lambda V: A['per_tag'][V]['rank'])
A['ranks'] = {V: A['per_tag'][V]['rank'] for V in TAGS}
(PRED / 'out' / (f'analysis-{MODE}.json' if NEWTAG == 'FINAL' or MODE == 'control' else f'analysis-{MODE}-{NEWTAG}.json')).write_text(json.dumps(A, ensure_ascii=False, indent=1))

# ---------------- tables.md ----------------
L = []
w = L.append
w('# r2 generated tables (population: 176 layout-path drawn blocks; unit: drawn block)\n')
w('## T1 totals\n')
w('| measure | ' + ' | '.join(TAGS) + ' |'); w('|---|' + '---|' * len(TAGS))
for nm in ['hit', 'offpage', 'spill', 'contact', 'text_coll', 'shrunk', 'lines_differ', 'more_lines', 'fewer_lines', 'ink_sum', 'census_union']:
    w(f'| {nm} | ' + ' | '.join(str(A['per_tag'][V]['totals'][nm]) for V in TAGS) + ' |')
for nm, f in [('PROBLEM blocks', lambda P: P['problem_n']), ('unresolved [USER] mechanisms /50', lambda P: P['unresolved_n']),
              ('overflow blocks', lambda P: len(P['overflow'])), ('open line-count fallback', lambda P: len(P['open_fallback'])),
              ('below 8.5 pt (sz0>=8.5)', lambda P: len(P['below_8_5_new'])), ('sum (8.5 - size) of those', lambda P: P['below_new_sum']),
              ('below 8.5 pt because sz0 < 8.5', lambda P: len(P['below_8_5_src'])), ('blocks drawn differently from V0', lambda P: P['changed_vs_V0'])]:
    w(f'| {nm} | ' + ' | '.join(str(f(A['per_tag'][V])) for V in TAGS) + ' |')
w(f"\nrank tuples (problem, unresolved, overflow, below8.5 new, sum, offpage): " + '; '.join(f"{V} {A['ranks'][V]}" for V in TAGS))
w(f"\nbest by the pre-registered rule: **{A['best_by_rule']}**\n")
w('## T2 per class\n')
w('| tag | class | n | hit | offpage | spill | contact | text_coll | shrunk | more lines | fewer lines |'); w('|---|---|---|---|---|---|---|---|---|---|---|')
for V in TAGS:
    for c, d in A['per_tag'][V]['by_class'].items():
        w(f"| {V} | {c} | {d['n']} | {d['hit']} | {d['offpage']} | {d['spill']} | {d['contact']} | {d['text_coll']} | {d['shrunk']} | {d['more_lines']} | {d['fewer_lines']} |")
w('\n## T3 transitions vs V0 (fixed / broken / still / worsened), broken and worsened NAMED\n')
for V in TAGS[1:]:
    w(f'### {V}\n')
    w('| verdict | fixed | broken | still | worsened | broken blocks | worsened (V0 -> this) |'); w('|---|---|---|---|---|---|---|')
    for nm, t in A['per_tag'][V]['transitions'].items():
        wr = t.get('worsened', [])
        w(f"| {nm} | {len(t['fixed'])} | {len(t['broken'])} | {t['still']} | {len(wr)} | {', '.join(t['broken']) or '—'} | {'; '.join(f'{a} {b0}->{b1}' for a, b0, b1 in wr) or '—'} |")
    w('')
w('## T4 [USER] mechanisms (41 blocks, 50 checks)\n')
w('| row | block | class | mech | ' + ' | '.join(TAGS) + ' | lines src->V0 / V5_p2.0_f7.5 | size V0 / V5_p2.0_f7.5 |'); w('|---|---|---|---|' + '---|' * len(TAGS) + '---|---|')
for f in A['flag_table']:
    w(f"| {f['row']} | {f['block']} `{f['key']}` | {f['cls']} | {f['mech']} | " + ' | '.join('✅' if f[V] else '❌' for V in TAGS) +
      f" | {f['lines']['V0']} / {f['lines']['V5_p2.0_f7.5']} | {f['size']['V0']} / {f['size']['V5_p2.0_f7.5']} |")
w('\n## T5 unresolved mechanisms per tag, named\n')
for V in TAGS:
    w(f"- **{V}** ({A['per_tag'][V]['unresolved_n']}): " + '; '.join(f'row {r} {b} {m}' for b, r, m in A['per_tag'][V]['unresolved']))
w('\n## T6 overflow (named overhang at the floor) and open line-count fallback\n')
for V in TAGS:
    P = A['per_tag'][V]
    w(f"- **{V}** overflow {len(P['overflow'])}: " + '; '.join(f"{o['basename']} b{o['block']} [{o['cls']}] '{o['word']}' need {o['need_pt']} > budget {o['budget_pt']} at {o['size']} pt" for o in P['overflow']))
    if P['open_fallback']:
        w(f"  - open fallback: " + '; '.join(f"{o['basename']} b{o['block']}" for o in P['open_fallback']))
w('\n## T7 blocks below 8.5 pt (named, size)\n')
for V in TAGS:
    P = A['per_tag'][V]
    w(f"- **{V}** sz0>=8.5 ({len(P['below_8_5_new'])}): " + ', '.join(f'{a} {s}' for a, s, _ in P['below_8_5_new']) +
      f" | sz0<8.5 ({len(P['below_8_5_src'])}): " + ', '.join(f'{a} {s} (sz0 {z})' for a, s, z in P['below_8_5_src']))
w('\n## T8 shrunk (sz0 -> size) and off-page (px beyond source)\n')
for V in TAGS:
    P = A['per_tag'][V]
    w(f"- **{V}** shrunk {len(P['shrunk'])}: " + ', '.join(f'{a} {z}->{s}' for a, z, s in P['shrunk']))
    w(f"  - off-page {len(P['offpage'])}: " + ', '.join(f'{a} {p}px' for a, p in P['offpage']))
w('\n## T9 line count vs source (named)\n')
for V in TAGS:
    P = A['per_tag'][V]
    w(f"- **{V}** more {len(P['lines_more'])}: " + ', '.join(f'{a} {s}->{n}' for a, s, n in P['lines_more']))
    w(f"  - fewer {len(P['lines_fewer'])}: " + ', '.join(f'{a} {s}->{n}' for a, s, n in P['lines_fewer']))
w('\n## T10 V5 steps per tag (class:step -> blocks)\n')
for V in TAGS[1:]:
    w(f'- **{V}**')
    for s, bl in sorted(A['per_tag'][V]['steps'].items()):
        if s in ('box:fit', 'cell:fit', 'open:i'):
            w(f'  - {s}: {len(bl)}')
        else:
            w(f'  - {s} ({len(bl)}): ' + ', '.join(bl))
(PRED / 'out' / (f'tables-{MODE}.md' if NEWTAG == 'FINAL' or MODE == 'control' else f'tables-{MODE}-{NEWTAG}.md')).write_text('\n'.join(L) + '\n')
for V in TAGS:
    P = A['per_tag'][V]
    print(V, 'rank', P['rank'], 'totals', P['totals'])
print('best by rule', A['best_by_rule'])
