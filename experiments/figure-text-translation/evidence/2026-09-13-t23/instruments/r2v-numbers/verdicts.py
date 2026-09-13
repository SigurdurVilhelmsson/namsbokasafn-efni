#!/usr/bin/env python3
"""Verdict totals, named lists, [USER] mechanism resolution, broken/worsened, rank tuples - from MY rows
(out/mym-TAG.jsonl), with c3b's verdict definitions (instrument definitions, re-typed below), c3/userflags.json
(inherited). Overflow lists are read from compose-report.json (composer output) separately in overflow.py."""
import json, collections
from pathlib import Path
ROOT = Path('/home/siggi/dev/scratch-c140'); ME = ROOT / 'r2v-numbers'; R2 = ROOT / 'r2'; C3 = ROOT / 'c3'
TAGS = ['V0', 'V5_p2.0_f7.0', 'V5_p2.0_f7.5', 'V5_p2.0_f8.0', 'V5_p2.5_f7.0', 'V5_p2.5_f7.5', 'V5_p2.5_f8.0', 'V5_p2.0_f7.5_dec',
        'V5_p2.0_f7.5_notr', 'CTRL_V5_p2.0_f9.0']
SWEEP = TAGS[1:7]
short = lambda k: f"{k[0].replace('CNX_Chem_', '')} b{k[1]}"
M = {T: {(r['basename'], r['block']): r for r in map(json.loads, open(ME / 'out' / f'mym-{T}.jsonl'))} for T in TAGS}
KEYS = sorted(M['V0'])
UF = json.loads((C3 / 'userflags.json').read_text())
checks = [((k.rsplit('#', 1)[0], int(k.rsplit('#', 1)[1])), f['row'], m) for k, fl in UF.items() for f in fl for m in f['mechanism']]
print('userflags: checks', len(checks), 'blocks', len({c[0] for c in checks}), 'by mech', dict(collections.Counter(c[2] for c in checks)))
PROSE = {23, 24, 31}


def cls_of(r):   # my own r2 class, from the inherited c3 census container fields
    if r['cont_final'] != 'BOUNDED':
        return 'open'
    return 'box' if (r['cont_dark'] == 'BOUNDED' and not r['textured']) else 'cell'


def cm(r):
    g = r['geo'].get('container_vector') or r['geo']['container']
    return min(g['left'], g['right'])


def hit(r): return r['ink_on_dark'] >= 10
def offp(r): return r['ink_off_page'] > r['src_ink_off_page']
def shr(r): return r['size'] < r['sz0'] - 1e-9
def spill(r): return r['spill'] >= 10
def contact(r): return r['c3b_cls'] == 'BOUNDED' and round(cm(r), 2) < 1.0
def tc(r): return r['text_coll'] >= 10
def ext(r): return [n for n, f in (('hit', hit), ('offpage', offp), ('spill', spill), ('contact', contact), ('text_coll', tc)) if f(r)]


def resolved(r, mech, row, k):
    if mech == 'WIDER':
        if r['c3b_cls'] == 'BOUNDED':
            return round(cm(r), 2) >= 1.0 and r['spill'] < 10 and r['ink_on_dark'] < 10
        g = r['geo']['free']
        return round(min(g['left'], g['right']), 2) >= 1.0 and r['ink_on_dark'] < 10
    if mech == 'NARROWER':
        if row in PROSE:
            return r['lines'] <= r['src_lines'] and r['ink_on_dark'] < 10 and r['ink_off_page'] <= r['src_ink_off_page']
        return r['lines'] <= r['src_lines'] or (r['ink_on_dark'] < 10 and r['ink_off_page'] <= r['src_ink_off_page'] and r['text_coll'] < 10)
    if mech == 'ANCHOR':
        if k == ('CNX_Chem_04_03_ethene_img', 0):
            return r['lines'] <= r['src_lines']
        return abs(round(r['frame']['a0'], 2) - round(r['src_left_edge'], 2)) <= 0.5
    if mech == 'SHRINK':
        return not shr(r)
    if mech == 'TABLE':
        return r['spill'] < 10 and r['lines'] == r['src_lines']
    raise ValueError(mech)


OUT = {}
for T in TAGS:
    R = M[T]
    unres = [(short(k), row, m) for k, row, m in checks if not resolved(R[k], m, row, k)]
    ub = {u[0] for u in unres}
    prob = sorted(short(k) for k in KEYS if ext(R[k]) or short(k) in ub)
    tot = {n: sorted(short(k) for k in KEYS if f(R[k])) for n, f in (('hit', hit), ('offpage', offp), ('spill', spill), ('contact', contact), ('text_coll', tc), ('shrunk', shr))}
    more = sorted((short(k), R[k]['src_lines'], R[k]['lines']) for k in KEYS if R[k]['lines'] > R[k]['src_lines'])
    fewer = sorted((short(k), R[k]['src_lines'], R[k]['lines']) for k in KEYS if R[k]['lines'] < R[k]['src_lines'])
    below_new = sorted((short(k), R[k]['size']) for k in KEYS if R[k]['size'] < 8.5 - 1e-9 and R[k]['sz0'] >= 8.5)
    below_src = sorted((short(k), R[k]['size'], R[k]['sz0']) for k in KEYS if R[k]['size'] < 8.5 - 1e-9 and R[k]['sz0'] < 8.5)
    lines_rule = [short(k) for k in KEYS if R[k]['lines'] != min(R[k]['src_lines'], R[k]['words'])]
    percls = collections.Counter(cls_of(R[k]) for k in KEYS)
    bycls = {c: {n: sum(1 for k in KEYS if cls_of(R[k]) == c and short(k) in set(v)) for n, v in tot.items()} for c in ('box', 'cell', 'open')}
    for c in bycls:
        bycls[c]['more'] = sum(1 for k in KEYS if cls_of(R[k]) == c and R[k]['lines'] > R[k]['src_lines'])
        bycls[c]['fewer'] = sum(1 for k in KEYS if cls_of(R[k]) == c and R[k]['lines'] < R[k]['src_lines'])
    O = dict(problem=prob, unresolved=unres, totals={n: len(v) for n, v in tot.items()}, named=tot, more=more, fewer=fewer,
             below_new=below_new, below_new_sum=round(sum(8.5 - s for _, s in below_new), 2), below_src=below_src,
             ink_sum=sum(R[k]['ink_on_dark'] for k in KEYS), lines_rule_fail=lines_rule, classes=dict(percls), bycls=bycls,
             text_fail=[short(k) for k in KEYS if not R[k]['text_ok']])
    if T != 'V0':
        tr = {}
        for n, f in (('hit', hit), ('offpage', offp), ('spill', spill), ('contact', contact), ('text_coll', tc), ('shrunk', shr),
                     ('lines', lambda r: r['lines'] != r['src_lines'])):
            f0 = {k for k in KEYS if f(M['V0'][k])}; f1 = {k for k in KEYS if f(R[k])}
            tr[n] = dict(fixed=len(f0 - f1), broken=sorted(map(short, f1 - f0)), still=len(f0 & f1))
        p0 = set(OUT['V0']['problem'])
        tr['problem'] = dict(fixed=len(p0 - set(prob)), broken=sorted(set(prob) - p0), still=len(p0 & set(prob)))
        # worsened (bad in both): ink +>=10, spill +>=10, deeper shrink, contact margin -0.25
        wor = []
        for k in KEYS:
            a, b = M['V0'][k], R[k]
            if hit(a) and hit(b) and b['ink_on_dark'] - a['ink_on_dark'] >= 10: wor.append(('hit', short(k), a['ink_on_dark'], b['ink_on_dark']))
            if spill(a) and spill(b) and b['spill'] - a['spill'] >= 10: wor.append(('spill', short(k), a['spill'], b['spill']))
            if shr(a) and shr(b) and b['size'] < a['size'] - 0.001: wor.append(('shrunk', short(k), a['size'], b['size']))
            if contact(a) and contact(b) and cm(b) < cm(a) - 0.25: wor.append(('contact', short(k), round(cm(a), 2), round(cm(b), 2)))
            # any-instrument worsening regardless of verdict flag
        wor_any = [(short(k), M['V0'][k]['ink_on_dark'], R[k]['ink_on_dark'], M['V0'][k]['spill'], R[k]['spill']) for k in KEYS
                   if R[k]['ink_on_dark'] > M['V0'][k]['ink_on_dark'] or R[k]['spill'] > M['V0'][k]['spill'] + 9]
        O.update(transitions=tr, worsened=wor, ink_or_spill_up=wor_any)
    OUT[T] = O
    O['rank_partial'] = (len(prob), len(unres), None, len(below_new), O['below_new_sum'], O['totals']['offpage'])

(ME / 'out' / 'verdicts.json').write_text(json.dumps(OUT, ensure_ascii=False, indent=1))
for T in TAGS:
    O = OUT[T]
    print(f"\n==== {T}")
    print(' classes', O['classes'], ' text fails', O['text_fail'])
    print(' totals', O['totals'], 'more', len(O['more']), 'fewer', len(O['fewer']), 'ink_sum', O['ink_sum'])
    print(' named', {n: v for n, v in O['named'].items() if n != 'shrunk' and len(v) <= 6})
    print(' shrunk', O['named']['shrunk'])
    print(' PROBLEM', len(O['problem']), O['problem'] if len(O['problem']) < 10 else '')
    print(' UNRESOLVED', len(O['unresolved']), O['unresolved'] if len(O['unresolved']) < 10 else '')
    print(' below8.5 new', len(O['below_new']), O['below_new'], 'sum', O['below_new_sum'], '| src<8.5', O['below_src'])
    print(' lines != min(src,words):', O['lines_rule_fail'])
    print(' fewer', O['fewer'] if T != 'V0' else len(O['fewer']))
    print(' bycls', O['bycls'])
    if T != 'V0':
        for n, t in O['transitions'].items():
            print(f"  tr {n:9} fixed {t['fixed']:3} broken {len(t['broken']):2} still {t['still']:3} BROKEN {t['broken']}")
        print('  worsened', O['worsened'])
        print('  ink up or spill up>=10 (any, regardless of verdict)', O['ink_or_spill_up'])
