#!/usr/bin/env python3
"""Per-block verdicts, transitions vs V0, [USER]-flag resolution, shrinks, off-page, invariants.
Writes c3b/analysis.json and prints the tables the report is built from."""
import json, collections, math
from pathlib import Path

C3 = Path('/home/siggi/dev/scratch-c140/c3'); C3B = Path('/home/siggi/dev/scratch-c140/c3b')
VS = ['V0', 'V1', 'V2', 'V3', 'V3L']
M = {V: {(r['basename'], r['block']): r for r in map(json.loads, open(C3B / f'measure-{V}.jsonl'))} for V in VS}
UF = json.loads((C3 / 'userflags.json').read_text())
CEN = json.loads((C3B / 'census.json').read_text())
KEYS = sorted(M['V0'])
assert len(KEYS) == 176 and all(set(M[V]) == set(KEYS) for V in VS)
short = lambda k: f"{k[0].replace('CNX_Chem_', '')} b{k[1]}"
PROSE_ROWS = {23, 24, 31}


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
    """Symptom post-conditions, fixed before any variant was read (see verify/best-rule.txt)."""
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
        if k == ('CNX_Chem_04_03_ethene_img', 0):   # [USER]: "second could be centered to avoid linebreak"
            return r['lines'] <= r['src_lines']
        return abs(r['drawn_frame']['a0'] - r['src_left_edge']) <= 0.5
    if mech == 'SHRINK':
        return not r['shrunk']
    if mech == 'TABLE':
        return r['spill'] < 10 and r['lines'] == r['src_lines']
    raise ValueError(mech)


A = {'per_variant': {}, 'blocks': {}}
flag_checks = []
for k, flags in UF.items():
    b, bi = k.rsplit('#', 1); kk = (b, int(bi))
    for f in flags:
        for m in f['mechanism']:
            flag_checks.append((kk, f['row'], m))
assert len({c[0] for c in flag_checks}) == 41, len({c[0] for c in flag_checks})
print('flag mechanism checks', len(flag_checks), 'on', len({c[0] for c in flag_checks}), 'blocks')

for V in VS:
    P = {}
    unresolved = []
    for (kk, row, m) in flag_checks:
        ok = mech_resolved(M[V][kk], m, row, kk)
        if not ok:
            unresolved.append((short(kk), row, m))
    unres_blocks = {u[0] for u in unresolved}
    problem = [k for k in KEYS if ext_verdict(M[V][k]) or short(k) in unres_blocks]
    shr = [(short(k), M[V][k]['size'], round(M[V][k]['sz0'] - M[V][k]['size'], 2)) for k in KEYS if M[V][k]['shrunk']]
    off = [(short(k), M[V][k]['ink_off_page']) for k in KEYS if 'off-page' in census_verdict(M[V][k])]
    cv = collections.Counter(tuple(census_verdict(M[V][k]) or ['clean']) for k in KEYS)
    lab = collections.Counter(x for k in KEYS for x in (census_verdict(M[V][k]) + [e for e in ext_verdict(M[V][k]) if e not in census_verdict(M[V][k])]))
    bycls = {c: dict(
        census_bad=sum(1 for k in KEYS if M[V][k]['cls'] == c and [x for x in census_verdict(M[V][k])]),
        hit=sum(1 for k in KEYS if M[V][k]['cls'] == c and M[V][k]['ink_on_dark'] >= 10),
        offpage=sum(1 for k in KEYS if M[V][k]['cls'] == c and 'off-page' in census_verdict(M[V][k])),
        shrunk=sum(1 for k in KEYS if M[V][k]['cls'] == c and M[V][k]['shrunk']),
        spill=sum(1 for k in KEYS if M[V][k]['cls'] == c and M[V][k]['spill'] >= 10),
        contact=sum(1 for k in KEYS if M[V][k]['cls'] == c and contact(M[V][k])),
        text_coll=sum(1 for k in KEYS if M[V][k]['cls'] == c and M[V][k]['text_coll'] >= 10),
        ext_bad=sum(1 for k in KEYS if M[V][k]['cls'] == c and ext_verdict(M[V][k])),
        lines_more=sum(1 for k in KEYS if M[V][k]['cls'] == c and M[V][k]['lines'] > M[V][k]['src_lines']),
        lines_fewer=sum(1 for k in KEYS if M[V][k]['cls'] == c and M[V][k]['lines'] < M[V][k]['src_lines']),
        n=sum(1 for k in KEYS if M[V][k]['cls'] == c)) for c in ('BOUNDED', 'OPEN')}
    ink_sum = sum(M[V][k]['ink_on_dark'] for k in KEYS)
    census_union = [k for k in KEYS if census_verdict(M[V][k])]
    # transitions vs V0
    tr = {}
    for nm, fn in (('census', lambda r: bool(census_verdict(r))), ('census_no_shrink', lambda r: bool([x for x in census_verdict(r) if x != 'shrunk'])),
                   ('extended', lambda r: bool(ext_verdict(r))), ('hit', lambda r: r['ink_on_dark'] >= 10),
                   ('offpage', lambda r: 'off-page' in census_verdict(r)), ('shrunk', lambda r: r['shrunk']),
                   ('spill', lambda r: r['spill'] >= 10), ('contact', contact), ('text_coll', lambda r: r['text_coll'] >= 10),
                   ('problem', lambda r: None)):
        if nm == 'problem':
            p0 = set(A['per_variant'].get('V0', {}).get('problem', [])) if V != 'V0' else set(map(short, problem))
            p1 = set(map(short, problem))
            tr[nm] = dict(fixed=sorted(p0 - p1), broken=sorted(p1 - p0), still=len(p0 & p1))
            continue
        f0 = {k for k in KEYS if fn(M['V0'][k])}; f1 = {k for k in KEYS if fn(M[V][k])}
        tr[nm] = dict(fixed=sorted(map(short, f0 - f1)), broken=sorted(map(short, f1 - f0)), still=len(f0 & f1),
                      unchanged_clean=len(set(KEYS) - f0 - f1))
    changed_items = [short(k) for k in KEYS if M[V][k]['text'] != M['V0'][k]['text'] or M[V][k]['drawn_frame'] != M['V0'][k]['drawn_frame'] or M[V][k]['size'] != M['V0'][k]['size']]
    floor = [short(k) for k in KEYS if (M[V][k].get('c3b') or {}).get('floor_binds')]
    greedy_fb = [short(k) for k in KEYS if (M[V][k].get('c3b') or {}).get('prefer_fallback_greedy')]
    P.update(census_verdict_counts={'|'.join(k): v for k, v in cv.items()}, labels=dict(lab), by_class=bycls,
             census_union=len(census_union), census_union_figs=len({k[0] for k in census_union}), ink_sum=ink_sum,
             problem=sorted(map(short, problem)), problem_n=len(problem), unresolved=unresolved,
             unresolved_n=len(unresolved), shrunk=shr, shrunk_n=len(shr), shrink_pt_sum=round(sum(s[2] for s in shr), 2),
             offpage=off, transitions=tr, changed_blocks_vs_V0=len(changed_items), changed_vs_V0=changed_items,
             floor_binds=floor, prefer_fallback_greedy=greedy_fb,
             lines_changed=sum(1 for k in KEYS if M[V][k]['lines'] != M[V][k]['src_lines']))
    A['per_variant'][V] = P

# invariants
inv = {}
def same_block(V1_, V2_, k):
    a, b = M[V1_][k], M[V2_][k]
    return a['text'] == b['text'] and a['drawn_frame'] == b['drawn_frame'] and a['size'] == b['size']
inv['V1_OPEN_identical_to_V0'] = [short(k) for k in KEYS if M['V0'][k]['cls'] == 'OPEN' and not same_block('V0', 'V1', k)]
inv['V3_BOUNDED_identical_to_V2'] = [short(k) for k in KEYS if M['V0'][k]['cls'] == 'BOUNDED' and not same_block('V2', 'V3', k)]
inv['V3L_BOUNDED_identical_to_V2'] = [short(k) for k in KEYS if M['V0'][k]['cls'] == 'BOUNDED' and not same_block('V2', 'V3L', k)]
A['invariants'] = inv

# user-flag table per block
ftab = []
for (kk, row, m) in flag_checks:
    ftab.append(dict(block=short(kk), key=M['V0'][kk]['key'], row=row, mech=m, cls=M['V0'][kk]['cls'],
                     **{V: mech_resolved(M[V][kk], m, row, kk) for V in VS},
                     lines={V: f"{M[V][kk]['src_lines']}->{M[V][kk]['lines']}" for V in VS},
                     size={V: M[V][kk]['size'] for V in VS}))
A['flag_table'] = ftab

# best
score = {V: (A['per_variant'][V]['problem_n'], A['per_variant'][V]['unresolved_n'], A['per_variant'][V]['shrunk_n'], A['per_variant'][V]['shrink_pt_sum']) for V in VS}
A['score'] = score
A['best'] = min(VS[1:], key=lambda V: score[V])

# per-block compact rows (for the report appendix)
for k in KEYS:
    A['blocks'][short(k)] = {V: dict(lines=M[V][k]['lines'], src_lines=M[V][k]['src_lines'], size=M[V][k]['size'],
                                     text=M[V][k]['text'], census=census_verdict(M[V][k]), ext=ext_verdict(M[V][k]),
                                     ink=M[V][k]['ink_on_dark'], spill=M[V][k]['spill'], tc=M[V][k]['text_coll'],
                                     off=M[V][k]['ink_off_page'],
                                     cmargin=(lambda g: [g['drawn']['left'], g['drawn']['right'], g['drawn']['up'], g['drawn']['down']])(M[V][k]['geometry'].get('container_vector') or M[V][k]['geometry']['container']),
                                     fmargin=(lambda g: [g['drawn']['left'], g['drawn']['right'], g['drawn']['up'], g['drawn']['down']])(M[V][k]['geometry']['free_dark_or_labels']),
                                     a0=M[V][k]['drawn_frame']['a0'], c3b=M[V][k].get('c3b'))
                            for V in VS}
    A['blocks'][short(k)]['cls'] = M['V0'][k]['cls']
    A['blocks'][short(k)]['key'] = M['V0'][k]['key']
(C3B / 'analysis.json').write_text(json.dumps(A, ensure_ascii=False, indent=1))

for V in VS:
    P = A['per_variant'][V]
    print(f"\n==== {V}  score {score[V]}  changed blocks vs V0 {P['changed_blocks_vs_V0']}")
    print(' census verdict counts', P['census_verdict_counts'], ' census union', P['census_union'], '/', P['census_union_figs'], 'figs  ink sum', P['ink_sum'])
    print(' labels', P['labels'])
    for c, d in P['by_class'].items():
        print('  ', c, d)
    print(' shrunk', P['shrunk_n'], P['shrink_pt_sum'], P['shrunk'])
    print(' offpage', P['offpage'])
    print(' floor binds', P['floor_binds'], ' greedy fallback', P['prefer_fallback_greedy'])
    print(' unresolved', P['unresolved_n'], P['unresolved'])
    for nm, t in P['transitions'].items():
        print(f"  tr {nm:17} fixed {len(t['fixed']):3} broken {len(t['broken']):3} still {t['still']:3}  BROKEN: {t['broken']}")
print('\ninvariants', inv)
print('best', A['best'])
