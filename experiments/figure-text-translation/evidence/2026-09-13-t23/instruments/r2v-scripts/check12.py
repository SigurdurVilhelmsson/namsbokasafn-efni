#!/usr/bin/env python3
"""(1) scripts + (2) text sentinel, from the composed SVG text layer and runs.json - NOT from c2's code.

usage: check12.py WORKDIR SVGDIR OUTJSON [--sidecar-dir DIR] [--only b1,b2] [--plant-text]
  WORKDIR/<b>/items.json + compose-report.json ; SVGDIR/<b>.svg (or WORKDIR/<b>/translated.svg)

Expectation (independent):
  source lines   = clusters of BASE-size lettered runs on the text normal (gap < 0.5*base), every run to the
                   nearest line; per line base = size carrying most letters; baseline = letter-weighted mode
  stretch        = run with size < 0.9*base OR |dproj| > 0.12*base OR italic BaseFont; style (ratio, frac, italic)
  token          = maximal \\S+ on the source line holding a styled char, unstyled edge ,.;:!? trimmed
  expected value = every clean (non-alnum neighbours), non-overlapping exact occurrence of a token, longest first
Drawn:
  lines by clustering base-size (most-letters) items on the normal; baseline = letter-weighted mode;
  char style = (size/base, (normal-baseline)/base, italic) unless ratio~1, shift~0, not italic.
"""
import json, math, sys, collections, re
from pathlib import Path
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
from svgitems import *
from fontTools.ttLib import TTFont

FACES = {(False, False): 'LiberationSans-Regular.ttf', (True, False): 'LiberationSans-Bold.ttf',
         (False, True): 'LiberationSans-Italic.ttf', (True, True): 'LiberationSans-BoldItalic.ttf'}
_ft = {}


def adv(text, size, bold, italic):
    k = (bold, italic)
    if k not in _ft:
        f = TTFont('/usr/share/fonts/truetype/liberation/' + FACES[k])
        _ft[k] = (f.getBestCmap(), f['hmtx'], f['head'].unitsPerEm)
    cmap, hmtx, upm = _ft[k]
    tot = 0; miss = []
    for c in text:
        g = cmap.get(ord(c))
        if g is None:
            miss.append(c); g = '.notdef'
        tot += hmtx[g][0]
    return tot / upm * size, miss


EDGE = ',.;:!?'
TOL = 0.006


def src_lines(block):
    base_sz = collections.Counter()
    for r in block:
        base_sz[round(r['size'], 1)] += letters(r['text'])
    if not any(base_sz.values()):
        for r in block:
            base_sz[round(r['size'], 1)] += max(1, len(r['text']))
    bsz = max(base_sz.items(), key=lambda kv: (kv[1], kv[0]))[0]
    rot = block[0]['rot']
    pr = lambda r: normal(r['x'], r['y'], r['rot'])
    bases = sorted({round(pr(r), 3) for r in block if abs(r['size'] - bsz) < 0.2 and letters(r['text'])} or
                   {round(pr(r), 3) for r in block if abs(r['size'] - bsz) < 0.2}, reverse=True)
    cl = []
    for p in bases:
        if cl and cl[-1][-1] - p < 0.5 * bsz:
            cl[-1].append(p)
        else:
            cl.append([p])
    cent = [sum(c) / len(c) for c in cl]
    L = [[] for _ in cent]
    for r in block:
        j = min(range(len(cent)), key=lambda j: abs(cent[j] - pr(r)))
        L[j].append(r)
    return [sorted(l, key=lambda r: along(r['x'], r['y'], r['rot'])) for l in L]


def line_styles(line, fonts):
    by = collections.Counter()
    for r in line:
        by[round(r['size'], 1)] += letters(r['text'])
    if not any(by.values()):
        for r in line:
            by[round(r['size'], 1)] += max(1, len(r['text']))
    base = max(by.items(), key=lambda kv: (kv[1], kv[0]))[0]
    votes = collections.Counter()
    for r in line:
        if abs(r['size'] - base) < 0.2:
            votes[round(normal(r['x'], r['y'], r['rot']), 2)] += letters(r['text']) + 0.001 * len(r['text'])
    bl = max(votes.items(), key=lambda kv: kv[1])[0]
    text, st, sizeonly = '', [], []
    for r in line:
        sh = normal(r['x'], r['y'], r['rot']) - bl
        it = italic_font(fonts, r['font'])
        scr = r['size'] < 0.9 * base or abs(sh) > 0.12 * base
        s = (round(r['size'] / base, 4), round(sh / base, 4), it) if (scr or it) else None
        if s is None and abs(r['size'] - base) > 0.2 and r['text'].strip():
            sizeonly.append(dict(text=r['text'], size=r['size'], base=base, shift=round(sh, 3)))
        text += r['text']; st += [s] * len(r['text'])
    return text, st, base, sizeonly


def tokens_of(block, fonts):
    toks, so = [], []
    for li, l in enumerate(src_lines(block)):
        text, st, base, sizeonly = line_styles(l, fonts)
        so += sizeonly
        for m in re.finditer(r'\S+', text):
            s, e = m.start(), m.end()
            while s < e and text[s] in EDGE and st[s] is None:
                s += 1
            while e > s and text[e - 1] in EDGE and st[e - 1] is None:
                e -= 1
            if any(st[s:e]):
                toks.append(dict(line=li, text=text[s:e], styles=st[s:e], base=base))
    return toks, so


def stretches(text, st):
    out, i = [], 0
    while i < len(st):
        if st[i] is None:
            i += 1; continue
        j = i
        while j < len(st) and st[j] is not None and same(st[j], st[i]):
            j += 1
        out.append((text[i:j], st[i], i)); i = j
    return out


def same(a, b):
    if a is None or b is None:
        return a is b
    return abs(a[0] - b[0]) <= TOL and abs(a[1] - b[1]) <= TOL and a[2] == b[2]


def expected_mask(v, toks):
    exp = [None] * len(v); taken = [False] * len(v); noexact = []
    uniq = {}
    for t in toks:
        uniq.setdefault((t['text'], tuple(t['styles'])), t)
    for (tt, sts), t in sorted(uniq.items(), key=lambda kv: -len(kv[0][0])):
        if all(s is not None for s in sts):
            noexact.append(dict(token=tt, why='no-base'))
            continue
        n = 0
        i = v.find(tt)
        while i >= 0:
            b_ = v[i - 1] if i > 0 else ''
            a_ = v[i + len(tt)] if i + len(tt) < len(v) else ''
            if not (b_.isalnum() or a_.isalnum()) and not any(taken[i:i + len(tt)]):
                for k in range(len(tt)):
                    taken[i + k] = True
                    exp[i + k] = sts[k]
                n += 1
            i = v.find(tt, i + 1)
        if n == 0:
            ent = dict(token=tt, why='no clean exact occurrence', fallback=[])
            # design's anchored fallback (c2 Q5), re-implemented: needle = left char + stretch, right-clean or == right
            for s_txt, s_st, s0 in stretches(tt, list(sts)):
                if s0 == 0:
                    ent['fallback'].append(dict(stretch=s_txt, expect='named no-anchor')); continue
                needle = tt[s0 - 1] + s_txt; right = tt[s0 + len(s_txt)] if s0 + len(s_txt) < len(tt) else ''
                raw = [i for i in range(len(v)) if v.startswith(needle, i)]
                cands = [i for i in raw if not any(taken[i:i + len(needle)]) and
                         (i + len(needle) >= len(v) or not v[i + len(needle)].isalnum() or v[i + len(needle)] == right)]
                if len(cands) == 1:
                    i = cands[0]
                    for k in range(1, len(needle)):
                        exp[i + k] = sts[s0 + k - 1]; taken[i + k] = True
                    ent['fallback'].append(dict(stretch=s_txt, expect='placed once', raw_needle_occurrences=len(raw),
                                                SILENT_PARTIAL=len(raw) > 1))
                else:
                    ent['fallback'].append(dict(stretch=s_txt, expect='named ' + ('absent' if not cands else 'ambiguous'), candidates=len(cands)))
            noexact.append(ent)
    return exp, noexact


def drawn_lines(its):
    rot = its[0]['rot']
    by = collections.Counter()
    for it in its:
        by[round(it['size'], 3)] += letters(it['text'])
    if not any(by.values()):
        for it in its:
            by[round(it['size'], 3)] += len(it['text'])
    base = max(by.items(), key=lambda kv: (kv[1], kv[0]))[0]
    nb = sorted({round(normal(it['x'], it['y'], it['rot']), 3) for it in its if abs(it['size'] - base) < 1e-3}, reverse=True)
    cl = []
    for p in nb:
        if cl and cl[-1][-1] - p < 0.5 * base:
            cl[-1].append(p)
        else:
            cl.append([p])
    cent = [sum(c) / len(c) for c in cl]
    L = [[] for _ in cent]
    for it in its:
        n = normal(it['x'], it['y'], it['rot'])
        L[min(range(len(cent)), key=lambda j: abs(cent[j] - n))].append(it)
    out = []
    for l in L:
        l = sorted(l, key=lambda it: along(it['x'], it['y'], it['rot']))
        lb = collections.Counter()
        for it in l:
            if abs(it['size'] - base) < 1e-3:
                lb[round(normal(it['x'], it['y'], it['rot']), 3)] += letters(it['text']) + 0.001
        bl = max(lb.items(), key=lambda kv: kv[1])[0] if lb else normal(l[0]['x'], l[0]['y'], l[0]['rot'])
        text, st, seg = '', [], []
        for k, it in enumerate(l):
            ratio = it['size'] / base; fr = (normal(it['x'], it['y'], it['rot']) - bl) / base
            s = None if (abs(ratio - 1) < 1e-3 and abs(fr) < 1e-3 and not it['italic']) else (round(ratio, 4), round(fr, 4), it['italic'])
            text += it['text']; st += [s] * len(it['text']); seg += [k] * len(it['text'])
        out.append(dict(items=l, text=text, st=st, seg=seg, base=base, baseline=bl))
    return out


def main():
    A = sys.argv[1:]
    work = Path(A[0]); svgdir = Path(A[1]); outp = Path(A[2])
    side = Path(A[A.index('--sidecar-dir') + 1]) if '--sidecar-dir' in A else SIDE
    only = set(A[A.index('--only') + 1].split(',')) if '--only' in A else None
    res = dict(work=str(work), svgdir=str(svgdir), figures={}, zip_bad=[], text_fail=[], line_space_fail=[],
               style_fail=[], seg_granularity=[], adjacency_max=0.0, adjacency_over=[], noexact=[], unformatted=[],
               sz0_vs_base=[], sizeonly_in_layout=[], plain_formula_like=[], missing_glyphs=[], n_layout_blocks=0,
               scripted_figures=[], n_expected_stretches=0, n_drawn_stretches=0)
    for b in names():
        if only and b not in only:
            continue
        d = PREP / 'figs' / b
        meta = json.loads((d / 'meta.json').read_text()); runs = json.loads((d / 'runs.json').read_text())
        H = meta['page'][1]
        blocks = FT.merge_blocks(FT.group(runs)); keys = [block_key(x) for x in blocks]
        items = json.loads((work / b / 'items.json').read_text())
        rep = json.loads((work / b / 'compose-report.json').read_text())
        sp = svgdir / f'{b}.svg'
        if not sp.exists():
            sp = work / b / 'translated.svg'
        if sp.exists():
            svg = parse_svg(sp, H)
            zi, bad = zip_items(svg, items)
        else:   # items-only mode (cells without an SVG): same fields, no SVG cross-check
            res['items_only'] = True
            zi = [dict(text=it['text'], x=it['x'] + it['dx'], y=it['y'], size=it['size'], bold=bool(it['bold']),
                       italic=bool(it.get('italic')), rot=it['rot'], block=it['block'], path=it['path']) for it in items]
            bad = []
        if bad:
            res['zip_bad'].append((b, [str(x)[:300] for x in bad[:5]], len(bad)))
            continue
        tr = json.loads((side / f'{b}.is.json').read_text())['blocks']
        fig = dict(expected=[], drawn=[], blocks=[])
        res['unformatted'] += [dict(b=b, **u) for u in rep.get('unformatted', [])]
        lay = sorted({it['block'] for it in zi if it['path'] == 'layout'})
        for bi in lay:
            its = [it for it in zi if it['block'] == bi]
            assert all(it['path'] == 'layout' for it in its), (b, bi)
            res['n_layout_blocks'] += 1
            blk = blocks[bi]; key = keys[bi]; value = tr[key]
            v = ' '.join(value.split())
            nm = f"{b.replace('CNX_Chem_', '')} b{bi}"
            toks, so = tokens_of(blk, meta['fonts'])
            if so:
                res['sizeonly_in_layout'].append((nm, so))
            # sz0 vs letter-weighted base of the whole block
            bl0 = collections.Counter()
            for r in blk:
                bl0[round(r['size'], 1)] += letters(r['text'])
            lwb = max(bl0.items(), key=lambda kv: (kv[1], kv[0]))[0] if any(bl0.values()) else None
            if lwb is not None and abs(blk[0]['size'] - lwb) > 0.05:
                res['sz0_vs_base'].append((nm, blk[0]['size'], lwb, blk[0]['text']))
            exp, noex = expected_mask(v, toks)
            for t in toks:
                for s_txt, s_st, _ in stretches(t['text'], t['styles']):
                    fig['expected'].append(dict(block=bi, token=t['text'], stretch=s_txt, ratio=s_st[0], frac=s_st[1], italic=s_st[2]))
            if noex:
                res['noexact'].append((nm, noex, v))
            dl = drawn_lines(its)
            lt = [l['text'] for l in dl]
            for t in lt:
                if t != ' '.join(t.split()):
                    res['line_space_fail'].append((nm, t))
            got = ' '.join(lt)
            if got != v:
                res['text_fail'].append((nm, got, v))
                fig['blocks'].append(dict(block=bi, text_ok=False))
                continue
            dst = []
            for j, l in enumerate(dl):
                if j:
                    dst.append(None)
                dst += l['st']
            fails = [(k, v[k], exp[k], dst[k]) for k in range(len(v)) if not same(exp[k], dst[k])]
            if fails:
                res['style_fail'].append((nm, v, fails))
            # stretch granularity: every maximal drawn styled stretch is exactly ONE <text> equal to it
            for l in dl:
                for s_txt, s_st, i0 in stretches(l['text'], l['st']):
                    segs = set(l['seg'][i0:i0 + len(s_txt)])
                    ok = len(segs) == 1 and l['items'][list(segs)[0]]['text'] == s_txt
                    if not ok:
                        res['seg_granularity'].append((nm, s_txt, [l['items'][k]['text'] for k in sorted(segs)]))
                    fig['drawn'].append(dict(block=bi, text=s_txt, ratio=s_st[0], frac=s_st[1], italic=s_st[2],
                                             drawn_base=l['base'], own_text=ok))
                # adjacency along the line (fontTools advances, unkerned)
                for p, q in zip(l['items'], l['items'][1:]):
                    w, miss = adv(p['text'], p['size'], p['bold'], p['italic'])
                    gap = along(q['x'], q['y'], q['rot']) - (along(p['x'], p['y'], p['rot']) + w)
                    res['adjacency_max'] = max(res['adjacency_max'], abs(gap))
                    if abs(gap) > 0.05:
                        res['adjacency_over'].append((nm, p['text'], q['text'], round(gap, 3)))
                for it in l['items']:
                    _, miss = adv(it['text'], it['size'], it['bold'], it['italic'])
                    if miss:
                        res['missing_glyphs'].append((nm, it['text'], miss))
                # plain formula-like text: element symbol followed by a PLAIN digit
                for m in re.finditer(r'(?<![A-Za-zÁÉÍÓÚÝÞÆÖÐáéíóúýþæöð])(?:[A-Z][a-z]?)(\d+)', l['text']):
                    k = m.start(1)
                    if l['st'][k] is None:
                        res['plain_formula_like'].append((nm, l['text'], m.group()))
            fig['blocks'].append(dict(block=bi, text_ok=True, n_style_fail=len(fails), tokens=[t['text'] for t in toks]))
        ex_ms = collections.Counter((e['block'], e['stretch'], round(e['ratio'], 3), round(e['frac'], 3), e['italic']) for e in fig['expected'])
        dr_ms = collections.Counter((e['block'], e['text'], round(e['ratio'], 3), round(e['frac'], 3), e['italic']) for e in fig['drawn'])
        fig['n_expected_source_stretches'] = sum(ex_ms.values()); fig['n_drawn_stretches'] = sum(dr_ms.values())
        res['n_expected_stretches'] += fig['n_expected_source_stretches']; res['n_drawn_stretches'] += fig['n_drawn_stretches']
        if fig['expected'] or fig['drawn']:
            res['scripted_figures'].append(b)
        res['figures'][b] = fig
    outp.write_text(json.dumps(res, ensure_ascii=False, indent=1))
    print('layout blocks', res['n_layout_blocks'], '| zip_bad', len(res['zip_bad']), '| text_fail', len(res['text_fail']),
          '| line_space_fail', len(res['line_space_fail']), '| style_fail', len(res['style_fail']),
          '| seg_granularity', len(res['seg_granularity']), '| adjacency max %.4f over0.05 %d' % (res['adjacency_max'], len(res['adjacency_over'])),
          '| noexact', len(res['noexact']), '| unformatted', len(res['unformatted']), '| sz0!=base', len(res['sz0_vs_base']),
          '| sizeonly', len(res['sizeonly_in_layout']), '| plain formula-like', len(res['plain_formula_like']),
          '| missing glyphs', len(res['missing_glyphs']), '| scripted figs', len(res['scripted_figures']),
          '| source stretches (per token occurrence in source)', res['n_expected_stretches'], '| drawn styled stretches', res['n_drawn_stretches'])


if __name__ == '__main__':
    main()
