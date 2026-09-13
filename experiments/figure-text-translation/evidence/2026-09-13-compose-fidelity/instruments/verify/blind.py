#!/usr/bin/env python3
"""verify-pi: construct defects and ask whether 1a's instrument scores them as faithful.

Base picture = run-exact, NO advance fitting, hint default (== 2a's prototype kept path == 1a's no-fit ceiling).
For each block, one defect at a time, re-render and score THAT block with fidelity.score_block:
  flagged_same  : vs the unmodified base render (pure defect effect)  d_runmin >= .17 or d_cno >= 1.5
  flagged_1a    : 1a's operational paired rule vs worst-of(fit ceiling, no-fit ceiling) from fid/ files
  gross_1a      : flagged_1a and (runmin <= .35 or d_cno >= 2.3)
Defects: shift_v2 (POSITIVE CONTROL), shift_v1, fill_red, fill_blue, italic_toggle, bold_toggle,
         digit_lookalike (last digit), O_to_0, l_to_I, charge_flip (+ <-> en dash, script runs only),
         charge_drop, decimal_comma, swap (text of two same-length single-run blocks exchanged).
Resumable: verify-pi/data/blind.jsonl, one row per (figure, block, defect).
"""
import sys, json, math, re
from pathlib import Path
SP = Path('/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/d293cd29-19d8-4ccc-a2b3-244bf111501b/scratchpad')
sys.path.insert(0, str(SP / 'tools'))
import fidelity as F, runexact_png as R   # noqa: E402

OUT = SP / 'verify-pi/data/blind.jsonl'
REF = {}
for line in (SP / 'findings/1a-blocks.jsonl').read_text().splitlines():
    r = json.loads(line)
    REF[(r['basename'], r['block'])] = r
LOOK = {'0': '8', '1': '7', '2': '3', '3': '8', '4': '9', '5': '6', '6': '8', '7': '1', '8': '3', '9': '4'}


def c(v):
    if isinstance(v, float):
        return None if math.isnan(v) else (999.0 if math.isinf(v) else round(v, 4))
    return v


def rule(ref_rmin, ref_cno, t_rmin, t_cno, T1=0.17, T2=1.5):
    if ref_rmin is None or t_rmin is None:
        return None
    if ref_cno is None or t_cno is None:
        return bool(ref_rmin - t_rmin >= T1)
    return bool((ref_rmin - t_rmin >= T1) or (t_cno - ref_cno >= T2))


def defects_for(f, bi, items):
    mine = [i for i, it in enumerate(items) if it['block'] == bi]
    msz = max(items[i]['size'] for i in mine)
    text = ''.join(items[i]['text'] for i in mine)
    out = []

    def mod(name, fn):
        new = [dict(it) for it in items]
        changed = fn(new)
        if changed:
            out.append((name, [it for it in new if it is not None]))

    def shift(px):
        def g(new):
            for i in mine:
                new[i]['y'] -= px / F.S
            return True
        return g
    mod('shift_v2', shift(2)); mod('shift_v1', shift(1))

    def fill(rgb):
        def g(new):
            for i in mine:
                new[i]['rgb'] = rgb
            return True
        return g
    mod('fill_red', fill((0.70, 0.0, 0.0))); mod('fill_blue', fill((0.0, 0.0, 0.60)))

    def toggle(k):
        def g(new):
            for i in mine:
                new[i][k] = not new[i][k]
            return True
        return g
    mod('italic_toggle', toggle('italic')); mod('bold_toggle', toggle('bold'))

    def digit(new):
        for i in reversed(mine):
            t = new[i]['text']
            m = [j for j, ch in enumerate(t) if ch.isdigit()]
            if m:
                j = m[-1]
                new[i]['text'] = t[:j] + LOOK[t[j]] + t[j + 1:]
                return True
        return False
    mod('digit_lookalike', digit)

    def sub(a, b_):
        def g(new):
            hit = False
            for i in mine:
                if a in new[i]['text']:
                    new[i]['text'] = new[i]['text'].replace(a, b_); hit = True
            return hit
        return g
    mod('O_to_0', sub('O', '0')); mod('l_to_I', sub('l', 'I'))

    def charge(drop):
        def g(new):
            hit = False
            for i in mine:
                t = new[i]['text']
                if new[i]['size'] <= msz - 1 and t and all(ch in '+–−' for ch in t.strip()) and t.strip():
                    hit = True
                    if drop:
                        new[i] = None
                    else:
                        new[i]['text'] = t.replace('+', '\0').replace('–', '+').replace('−', '+').replace('\0', '–')
            return hit
        return g
    mod('charge_flip', charge(False)); mod('charge_drop', charge(True))

    def dec(new):
        for i in mine:
            t = new[i]['text']
            m = re.search(r'(?<=\d)\.(?=\d)', t)
            if m:
                new[i]['text'] = t[:m.start()] + ',' + t[m.end():]
                return True
        return False
    mod('decimal_comma', dec)
    return out


def main(names):
    done = set()
    if OUT.exists():
        done = {json.loads(l)['basename'] for l in OUT.read_text().splitlines() if l.strip()}
    for b in names:
        if b in done:
            print('skip', b); continue
        f = F.Figure(b)
        items, _ = R.run_items(f.meta, f.blocks, fit_adv=False)
        base = F.surf_to_rgb(R.render(f.prep, items, f.meta, hint='default'))
        rows = []
        basescore = {bi: f.score_block(base, bi) for bi in range(f.nb)}
        for bi in range(f.nb):
            ref = REF[(b, bi)]
            rr = [x for x in (ref['score_ceiling']['run_iou1_min'], ref['score_ceiling_nofit']['run_iou1_min']) if x is not None]
            rc = [x for x in (ref['score_ceiling']['run_cno_max'], ref['score_ceiling_nofit']['run_cno_max']) if x is not None]
            ref_rmin, ref_cno = (min(rr) if rr else None), (max(rc) if rc else None)
            b0 = basescore[bi]
            for name, new in defects_for(f, bi, items):
                img = F.surf_to_rgb(R.render(f.prep, new, f.meta, hint='default'))
                t = f.score_block(img, bi)
                t_rmin, t_cno = c(t['run_iou1_min']), c(t['run_cno_max'])
                fl1a = rule(ref_rmin, ref_cno, t_rmin, t_cno)
                rows.append(dict(basename=b, block=bi, key=f.keys[bi], defect=name, clean=REF[(b, bi)]['clean'],
                                 feats={k: f.feat[bi][k] for k in ('has_script', 'has_italic', 'has_bold', 'has_symfont', 'rotated')},
                                 nA=t['nA'], base_rmin=c(b0['run_iou1_min']), base_cno=c(b0['run_cno_max']), base_iou1=c(b0['iou1']),
                                 t_rmin=t_rmin, t_cno=t_cno, t_iou1=c(t['iou1']),
                                 flagged_same=rule(c(b0['run_iou1_min']), c(b0['run_cno_max']), t_rmin, t_cno),
                                 flagged_1a=fl1a,
                                 gross_1a=bool(fl1a) and ((t_rmin is not None and t_rmin <= 0.35) or (t_cno is not None and ref_cno is not None and t_cno - ref_cno >= 2.3))))
        # swaps: single-run single-line non-rotated non-symfont blocks, same text length >= 2, same size, different text
        cand = [bi for bi in range(f.nb) if len(f.blocks[bi]) == 1 and not f.feat[bi]['rotated'] and not f.feat[bi]['has_symfont']
                and len(f.blocks[bi][0]['text'].strip()) >= 2]
        pairs = []
        for i, a in enumerate(cand):
            for bb in cand[i + 1:]:
                ra, rb = f.blocks[a][0], f.blocks[bb][0]
                if len(ra['text']) == len(rb['text']) and ra['text'] != rb['text'] and abs(ra['size'] - rb['size']) < 0.01 and ra['font'] == rb['font']:
                    pairs.append((a, bb))
        for a, bb in pairs[:4]:
            new = [dict(it) for it in items]
            ia = [i for i, it in enumerate(new) if it['block'] == a][0]
            ib = [i for i, it in enumerate(new) if it['block'] == bb][0]
            new[ia]['text'], new[ib]['text'] = items[ib]['text'], items[ia]['text']
            img = F.surf_to_rgb(R.render(f.prep, new, f.meta, hint='default'))
            for bi, other in ((a, bb), (bb, a)):
                ref = REF[(b, bi)]
                rr = [x for x in (ref['score_ceiling']['run_iou1_min'], ref['score_ceiling_nofit']['run_iou1_min']) if x is not None]
                rc = [x for x in (ref['score_ceiling']['run_cno_max'], ref['score_ceiling_nofit']['run_cno_max']) if x is not None]
                t = f.score_block(img, bi); b0 = basescore[bi]
                t_rmin, t_cno = c(t['run_iou1_min']), c(t['run_cno_max'])
                fl1a = rule(min(rr) if rr else None, max(rc) if rc else None, t_rmin, t_cno)
                rows.append(dict(basename=b, block=bi, key=f.keys[bi], defect='swap', swapped_with=f.keys[other], clean=ref['clean'],
                                 feats={k: f.feat[bi][k] for k in ('has_script', 'has_italic', 'has_bold', 'has_symfont', 'rotated')},
                                 nA=t['nA'], base_rmin=c(b0['run_iou1_min']), base_cno=c(b0['run_cno_max']), base_iou1=c(b0['iou1']),
                                 t_rmin=t_rmin, t_cno=t_cno, t_iou1=c(t['iou1']),
                                 flagged_same=rule(c(b0['run_iou1_min']), c(b0['run_cno_max']), t_rmin, t_cno), flagged_1a=fl1a,
                                 gross_1a=bool(fl1a) and ((t_rmin is not None and t_rmin <= 0.35))))
        with OUT.open('a') as fo:
            for r in rows:
                fo.write(json.dumps(r, ensure_ascii=False, default=lambda o: o.item()) + '\n')
        print(b, len(rows), flush=True)


if __name__ == '__main__':
    main(sys.argv[1:] or (SP / 'prep' / 'bought.txt').read_text().split())
