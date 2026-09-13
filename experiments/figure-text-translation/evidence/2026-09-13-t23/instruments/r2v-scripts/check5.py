#!/usr/bin/env python3
"""(5) `overflow` / `unformatted` consistency with what is DRAWN, per sweep cell (items.json; the text layer of the
F7.5 cells was verified 1:1 against the SVG by check12/check34).

For every layout block: drawn words with their along-extent (item origin + cumulative advance, cairo-hinted exactly
as compose measures, AND fontTools unhinted as a browser measures); budget from census (box/cell: (R-L)-2PAD,
open: (FR-FL)-2PAD); floor_eff = min(F, sz0).
 - each named overflow entry: block drawn at entry size, word drawn, need_pt == measured width, need > budget, budget == census budget
 - UNNAMED: widest drawn word > budget (cairo) and block not named
 - BROWSER-ONLY: widest drawn word > budget with fontTools advances but <= with cairo, not named
 - drawn extent outside the class box ([L+PAD,R-PAD] / [FL+PAD,FR-PAD]) by > 0.05 pt (cairo), named vs unnamed
 - base size below floor_eff
"""
import json, math, sys, collections, re
from pathlib import Path
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
from svgitems import *
import cairo
from check12 import adv as ft_adv, drawn_lines

S = 200.0 / 72.0
surf = cairo.ImageSurface(cairo.FORMAT_RGB24, 10, 10); ctx = cairo.Context(surf)


def cz_adv(text, size, bold, italic):
    ctx.select_font_face('Liberation Sans', cairo.FONT_SLANT_ITALIC if italic else cairo.FONT_SLANT_NORMAL,
                         cairo.FONT_WEIGHT_BOLD if bold else cairo.FONT_WEIGHT_NORMAL)
    ctx.set_font_size(size * S)
    return ctx.text_extents(text).x_advance / S


CEN = json.loads((R2 / 'census.json').read_text())


def words_of_line(l, advf):
    """-> [(word, a0, a1)] and line extent, char positions from item origins + per-char cumulative advance."""
    chars = []
    for it in l['items']:
        a = along(it['x'], it['y'], it['rot'])
        w_total = advf(it['text'], it['size'], it['bold'], it['italic'])
        off = 0.0
        for k, c in enumerate(it['text']):
            w = advf(it['text'][:k + 1], it['size'], it['bold'], it['italic'])
            chars.append((c, a + off, a + w)); off = w
    words, cur = [], []
    for c, a0, a1 in chars:
        if c.isspace():
            if cur:
                words.append(cur); cur = []
        else:
            cur.append((c, a0, a1))
    if cur:
        words.append(cur)
    ext = (chars[0][1], chars[-1][2]) if chars else (0, 0)
    # trim edge spaces from the extent
    nz = [(a0, a1) for c, a0, a1 in chars if not c.isspace()]
    ext = (nz[0][0], nz[-1][1]) if nz else ext
    return [(''.join(c for c, _, _ in w), w[0][1], w[-1][2]) for w in words], ext


def main():
    tags = sys.argv[1:]
    out = {}
    for tag in tags:
        pad = float(re.search(r'_p([\d.]+)_', tag).group(1)); F = float(re.search(r'_f([\d.]+)', tag).group(1))
        work = R2 / 'work' / tag
        r = dict(named=[], named_bad=[], unnamed=[], browser_only=[], outside_named=[], outside_unnamed=[], below_floor=[],
                 unformatted=[], n_blocks=0, max_browser_minus_cairo_word=0.0)
        for b in names():
            items = json.loads((work / b / 'items.json').read_text())
            rep = json.loads((work / b / 'compose-report.json').read_text())
            runs = json.loads((PREP / 'figs' / b / 'runs.json').read_text())
            blocks = FT.merge_blocks(FT.group(runs)); keys = [block_key(x) for x in blocks]
            r['unformatted'] += [dict(b=b, **u) for u in rep.get('unformatted', [])]
            ov = {e['block']: e for e in rep.get('overflow', [])}
            assert len(ov) == len(rep.get('overflow', [])), 'duplicate overflow block'
            for bi in sorted({it['block'] for it in items if it['path'] == 'layout'}):
                its = [it for it in items if it['block'] == bi]
                r['n_blocks'] += 1
                cz = CEN[f'{b}#{bi}']; cls = cz['r2cls']
                nm = f"{b.replace('CNX_Chem_', '')} b{bi}"
                sz0 = blocks[bi][0]['size']; feff = min(F, sz0)
                dl = drawn_lines(its)
                base = dl[0]['base']
                if base < feff - 1e-6:
                    r['below_floor'].append((nm, base, feff))
                if cls in ('box', 'cell'):
                    budget = (cz['R'] - cz['L']) - 2 * pad; lo, hi = cz['L'] + pad, cz['R'] - pad
                else:
                    budget = (cz['FR'] - cz['FL']) - 2 * pad; lo, hi = cz['FL'] + pad, cz['FR'] - pad
                wc, wf = [], []
                ext_c = []
                for l in dl:
                    ws, ex = words_of_line(l, cz_adv); wc += ws; ext_c.append(ex)
                    ws2, _ = words_of_line(l, ft_adv_wrap); wf += ws2
                widest_c = max(wc, key=lambda w: w[2] - w[1]); widest_f = max(wf, key=lambda w: w[2] - w[1])
                wcw = widest_c[2] - widest_c[1]; wfw = widest_f[2] - widest_f[1]
                r['max_browser_minus_cairo_word'] = max(r['max_browser_minus_cairo_word'], wfw - wcw)
                e0 = min(a for a, _ in ext_c); e1 = max(b_ for _, b_ in ext_c)
                outside = max(lo - e0, e1 - hi)
                named = bi in ov
                if named:
                    e = ov[bi]
                    probs = []
                    if abs(e['size'] - base) > 1e-6: probs.append(f"size {e['size']} != drawn {base}")
                    if e['word'] not in [w for w, _, _ in wc]: probs.append('word not drawn')
                    if abs(e['need_pt'] - wcw) > 0.02 or e['word'] != widest_c[0]: probs.append(f"need {e['need_pt']} vs widest drawn {widest_c[0]} {wcw:.3f}")
                    if not e['need_pt'] > e['budget_pt']: probs.append('need <= budget')
                    if abs(e['budget_pt'] - budget) > 0.01: probs.append(f"budget {e['budget_pt']} != census {budget:.3f}")
                    if keys[bi] != e['key']: probs.append('key mismatch')
                    r['named'].append((nm, e['word'], e['need_pt'], e['budget_pt'], round(wcw, 3), round(wfw, 3), round(outside, 3)))
                    if probs:
                        r['named_bad'].append((nm, probs))
                else:
                    if wcw > budget + 0.01:
                        r['unnamed'].append((nm, widest_c[0], round(wcw, 3), round(budget, 3)))
                    elif wfw > budget + 0.01:
                        r['browser_only'].append((nm, widest_f[0], round(wfw, 3), round(wcw, 3), round(budget, 3)))
                if outside > 0.05:
                    (r['outside_named'] if named else r['outside_unnamed']).append((nm, cls, round(outside, 3), round(e0, 2), round(e1, 2), round(lo, 2), round(hi, 2)))
        out[tag] = r
        print(tag, 'blocks', r['n_blocks'], '| named', len(r['named']), 'named_bad', len(r['named_bad']), '| UNNAMED word>budget', len(r['unnamed']),
              '| browser-only word>budget', len(r['browser_only']), '| outside box named', len(r['outside_named']), 'UNNAMED', len(r['outside_unnamed']),
              '| below floor', len(r['below_floor']), '| unformatted', len(r['unformatted']), '| max ft-cairo word %.3f' % r['max_browser_minus_cairo_word'])
    Path('/home/siggi/dev/scratch-c140/r2v-scripts/out/check5.json').write_text(json.dumps(out, ensure_ascii=False, indent=1))


def ft_adv_wrap(text, size, bold, italic):
    return ft_adv(text, size, bold, italic)[0]


if __name__ == '__main__':
    main()
