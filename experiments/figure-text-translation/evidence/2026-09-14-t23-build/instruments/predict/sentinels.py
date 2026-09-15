#!/usr/bin/env python3
"""Value-level sentinels a layout instrument cannot see. usage: sentinels.py TAG [--control]

(a) TEXT: per layout block, the drawn items grouped into lines BY GEOMETRY (not by the composer's r2line
    tag): base-size items clustered on the text normal (merge gap < 0.5*lead, lead = 1.222*sz0), every item
    assigned to the nearest line; within a line ordered along the baseline and concatenated with NO
    separator (word-edge segments carry their own spaces). PASS iff each line has no edge/double space and
    ' '.join(lines) == ' '.join(value.split()). Secondary: consecutive items abut (along gap < 0.02 pt).
(c) ② drawn placement: per block, the multiset of drawn STYLED items (size ratio != 1, or italic, or a
    baseline offset from the line) == for each source token, (clean occurrences in the value) x its stretches.
(d) rulings geometry: box lines centred on the container centre (0.5 pt); cell lines at the source anchor
    (0.5 pt) unless displaced (named, and checked inside [L+PAD, R-PAD]); OPEN step counts.
--control: plants 3 corruptions into COPIES of one figure's items and shows (a) fires on each.
"""
import json, math, sys, collections, re, copy
sys.dont_write_bytecode = True
sys.path.insert(0, '/home/siggi/dev/scratch-c140/plan/pred2/instruments')   # PRED ADAPTATION A1: import the adapted copies
from c3lib import *
sys.path.insert(0, '/home/siggi/dev/scratch-c140/r2/tree')
import c2_scripts as TS

R2 = Path('/home/siggi/dev/scratch-c140/r2')
import os   # PRED ADAPTATION A2: input work root and output dir
PRED = Path('/home/siggi/dev/scratch-c140/plan/pred2')
WORK_ROOT = Path(os.environ.get('PRED_WORK_ROOT', str(R2 / 'work')))
CEN = json.loads((R2 / 'census.json').read_text())
msurf = cairo.ImageSurface(cairo.FORMAT_A8, 8, 8); mctx = cairo.Context(msurf)


def ang(it):
    t = math.radians(it['rot'])
    return it['x'] * math.cos(t) + it['y'] * math.sin(t), -it['x'] * math.sin(t) + it['y'] * math.cos(t)


def group_lines(its, sz0):
    lead = 1.222 * sz0
    base = max(it['size'] for it in its)
    bas = [(ang(it)[1], it) for it in its if abs(it['size'] - base) < 1e-6]
    clusters = []
    for n, it in sorted(bas, key=lambda x: -x[0]):
        if clusters and abs(clusters[-1][-1][0] - n) < 0.5 * lead:
            clusters[-1].append((n, it))
        else:
            clusters.append([(n, it)])
    centres = []
    for c in clusters:
        votes = collections.Counter()
        for n, it in c:
            votes[round(n, 3)] += sum(ch.isalpha() for ch in it['text']) + 0.001
        centres.append(max(votes.items(), key=lambda kv: kv[1])[0])
    lines = [[] for _ in centres]
    for it in its:
        n = ang(it)[1]
        j = min(range(len(centres)), key=lambda j: abs(centres[j] - n))
        lines[j].append(it)
    return [sorted(l, key=lambda it: ang(it)[0]) for l in lines], centres, base


def text_check(its, value, sz0):
    lines, centres, base = group_lines(its, sz0)
    lt = [''.join(it['text'] for it in l) for l in lines]
    fails = []
    for t in lt:
        if t != ' '.join(t.split()):
            fails.append(f'edge/double space in line {t!r}')
    got = ' '.join(lt); want = ' '.join(value.split())
    if got != want:
        fails.append(f'text {got!r} != value {want!r}')
    adj = []
    for l in lines:
        for p, q in zip(l, l[1:]):
            w = measure_adv(mctx, p['text'], p['size'], p['bold'], p['italic'])
            gap = ang(q)[0] - (ang(p)[0] + w)
            if abs(gap) >= 0.02:
                adj.append((p['text'], q['text'], round(gap, 3)))
    return fails, adj, lines, centres, base


def styled_drawn(lines, centres, base):
    out = collections.Counter()
    for l, c in zip(lines, centres):
        for it in l:
            ratio = it['size'] / base; frac = (ang(it)[1] - c) / base
            if abs(ratio - 1) > 1e-3 or it['italic'] or abs(frac) > 1e-3:
                out[(it['text'], round(ratio, 2), round(frac, 2), bool(it['italic']))] += 1
    return out


def styled_expected(block, fonts, value, unf):
    toks = TS.source_tokens(block, fonts)
    exp = collections.Counter(); n_str = 0
    for t in sorted(toks, key=lambda t: -len(t['text'])):
        sts = t['styles']
        if all(s is not None for s in sts):
            continue
        occ = [i for i in TS._occ(value, t['text']) if TS._clean(value, i, len(t['text']))]
        for s0, e0 in TS._stretches(sts):
            n_str += 1
            st = sts[s0]
            # exact clean occurrences; with none, the anchored fallback places a stretch ONCE unless it is NAMED
            k_ = len(occ) if occ else (0 if (t['text'], t['text'][s0:e0]) in unf else 1)
            exp[(t['text'][s0:e0], round(st[0], 2), round(st[1], 2), bool(st[2]))] += k_
    return exp, toks, n_str


def main(tag, control=False):
    SIDE = json.loads
    res = dict(tag=tag, text_fail=[], adjacency=[], blocks=0, styled_mismatch=[], styled_blocks=0, stretches=0,
               stretches_placed=0, unformatted=[], box=dict(n=0, fail=[]), cell=dict(n=0, fail=[], displaced=[]),
               open_steps=collections.Counter(), open_steps_named=collections.defaultdict(list))
    for b in names():
        work = WORK_ROOT / tag / b
        items = json.loads((work / 'items.json').read_text())
        rep = json.loads((work / 'compose-report.json').read_text())
        diag = {d['block']: d for d in json.loads((work / 'diag.json').read_text())}
        fig = Fig(b, items_dir=WORK_ROOT / tag, diag_dir=WORK_ROOT / tag)
        tr = json.loads((SIDE_DIR / f'{b}.is.json').read_text())['blocks']
        res['unformatted'] += [dict(basename=b, **u) for u in rep.get('unformatted', [])]
        for bi in fig.layout_blocks():
            its = fig.block_items(bi); blk = fig.blocks[bi]; key = fig.keys[bi]
            value = tr[key]; assert isinstance(value, str)
            sz0 = blk[0]['size']
            res['blocks'] += 1
            fails, adj, lines, centres, base = text_check(its, value, sz0)
            nm = f"{b.replace('CNX_Chem_', '')} b{bi}"
            if fails:
                res['text_fail'].append((nm, fails))
            if adj:
                res['adjacency'].append((nm, adj))
            unf_b = {(u['token'], u['stretch']) for u in rep.get('unformatted', []) if u['block'] == bi}
            exp, toks, n_str = styled_expected(blk, fig.meta['fonts'], value, unf_b)
            got = styled_drawn(lines, centres, base)
            if toks:
                res['styled_blocks'] += 1
                res['stretches'] += n_str
                res['stretches_placed'] += n_str - sum(1 for u in rep.get('unformatted', []) if u['block'] == bi)
            if exp + collections.Counter() != got:
                res['styled_mismatch'].append((nm, dict(expected={str(k): v for k, v in exp.items() if v}, drawn={str(k): v for k, v in got.items()})))
            ce = CEN[f'{b}#{bi}']; d = diag[bi]; r2 = d.get('r2') or {}
            t = math.radians(blk[0]['rot'])
            ext = []
            for l in lines:
                a0 = ang(l[0])[0]
                a1 = ang(l[-1])[0] + measure_adv(mctx, l[-1]['text'], l[-1]['size'], l[-1]['bold'], l[-1]['italic'])
                ext.append((a0, a1))
            if ce['r2cls'] == 'box' and r2:
                res['box']['n'] += 1
                cc = (ce['L'] + ce['R']) / 2
                off = [round((a0 + a1) / 2 - cc, 3) for a0, a1 in ext]
                if max(abs(o) for o in off) > 0.5:
                    res['box']['fail'].append((nm, off))
            elif ce['r2cls'] == 'cell' and r2:
                res['cell']['n'] += 1
                bold = {k for k, v in fig.meta['fonts'].items() if 'bold' in v['base'].lower()}
                ls = FT.lines(blk)
                starts = [FT.along(l[0]) for l in ls]
                widths = [sum(measure_adv(mctx, r['text'], r['size'], r['font'] in bold) for r in l) for l in ls]
                al = ce['cell_align']
                anc = {'left': min(starts), 'right': max(s + w for s, w in zip(starts, widths)),
                       'center': sum(s + w / 2 for s, w in zip(starts, widths)) / len(ls)}[al]
                edge = [{'left': a0, 'right': a1, 'center': (a0 + a1) / 2}[al] for a0, a1 in ext]
                dev_ = [round(e - anc, 3) for e in edge]
                disp = r2.get('disp_pt', 0.0); vdisp = r2.get('vdisp_pt', 0.0)
                if abs(disp) > 1e-6 or abs(vdisp) > 1e-6:
                    inside = min(a0 for a0, _ in ext) >= ce['L'] + r2['pad'] - 0.5 and max(a1 for _, a1 in ext) <= ce['R'] - r2['pad'] + 0.5
                    res['cell']['displaced'].append((nm, al, dict(disp_pt=disp, vdisp_pt=vdisp, edge_minus_anchor=dev_, inside_cell_pad=inside)))
                    if max(abs(x - disp) for x in dev_) > 0.5:
                        res['cell']['fail'].append((nm, 'displaced but lines not at anchor+disp', dev_, disp))
                elif max(abs(x) for x in dev_) > 0.5:
                    res['cell']['fail'].append((nm, al, dev_))
            elif ce['r2cls'] == 'open' and r2:
                res['open_steps'][r2['step']] += 1
                res['open_steps_named'][r2['step']].append(nm)
    res['open_steps'] = dict(res['open_steps']); res['open_steps_named'] = dict(res['open_steps_named'])
    return res


SIDE_DIR = Path('/home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi-2e/figure-text')

if __name__ == '__main__':
    tag = sys.argv[1]
    if '--control' in sys.argv:
        b = 'CNX_Chem_04_03_ethene_img'
        fig = Fig(b, items_dir=WORK_ROOT / tag, diag_dir=WORK_ROOT / tag)
        tr = json.loads((SIDE_DIR / f'{b}.is.json').read_text())['blocks']
        bi = 0; its = fig.block_items(bi); value = tr[fig.keys[bi]]; sz0 = fig.blocks[bi][0]['size']
        out = {'clean': text_check(its, value, sz0)[:2]}
        c1 = copy.deepcopy(its); j = max(range(len(c1)), key=lambda j: len(c1[j]['text'])); c1[j]['text'] = c1[j]['text'][:3] + c1[j]['text'][4:]
        out['deleted_char'] = text_check(c1, value, sz0)[:2]
        c2 = copy.deepcopy(its)
        if len(c2) >= 2:
            c2[0]['x'], c2[1]['x'] = c2[1]['x'], c2[0]['x']; c2[0]['y'], c2[1]['y'] = c2[1]['y'], c2[0]['y']
        out['swapped_positions'] = text_check(c2, value, sz0)[:2]
        c3 = copy.deepcopy(its) + [copy.deepcopy(its[-1])]
        out['duplicated_item'] = text_check(c3, value, sz0)[:2]
        print(json.dumps(dict(block=f'{b} b{bi}', n_items=len(its), texts=[i['text'] for i in its],
                              results={k: dict(fires=bool(v[0]), fails=v[0], adjacency=v[1]) for k, v in out.items()}), ensure_ascii=False, indent=1))
        sys.exit(0)
    res = main(tag)
    (PRED / 'out' / f'sentinels-{tag}.json').write_text(json.dumps(res, ensure_ascii=False, indent=1))
    print(tag, 'blocks', res['blocks'], 'TEXT fail', len(res['text_fail']), 'adjacency', len(res['adjacency']),
          '| styled blocks', res['styled_blocks'], 'stretches placed', res['stretches_placed'], '/', res['stretches'],
          'drawn-styled mismatch', len(res['styled_mismatch']), 'unformatted', len(res['unformatted']),
          '| box', res['box']['n'], 'fail', len(res['box']['fail']), '| cell', res['cell']['n'], 'fail', len(res['cell']['fail']),
          'displaced', len(res['cell']['displaced']), '| open steps', res['open_steps'])
    for k in ('text_fail', 'adjacency', 'styled_mismatch'):
        for x in res[k][:10]:
            print(' ', k, x)
    for x in res['box']['fail'] + res['cell']['fail']:
        print('  geometry fail', x)
    for x in res['cell']['displaced']:
        print('  cell displaced', x)
