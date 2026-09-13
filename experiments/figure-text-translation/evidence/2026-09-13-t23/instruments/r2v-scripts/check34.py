#!/usr/bin/env python3
"""(3) kept/identity run-exact <text> untouched vs the E composition, and (4) decimal toggle, from the SVG text layer.

usage: check34.py OFF_WORK ON_WORK OUTJSON
  prep/figs/<b>/translated.svg + items.json = the E composition (control)
  OFF_WORK/<b>/translated.svg + items.json  = V5 decimal OFF;  ON_WORK/... = V5 decimal ON
Also: coverage (every translated non-identity block has layout items; every kept block draws every non-empty run),
artwork prefix byte-equality, and an INDEPENDENT R3 enumeration over kept runs from runs.json (regex written from
c9-decimal.md section 7 prose, not copied from r2dec.py), per RUN and per LINE, to find run-split numbers.
"""
import json, re, sys, collections
from pathlib import Path
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
from svgitems import *

RAW_RE = re.compile(r'<text [^>]*font-family="FigIS"[^>]*>.*?</text>', re.S)


def my_r3(t):
    """c9 §7 R3, from the prose: leave a text holding a decimal followed by ', <number>' (tuple); every thousands
    group d{1,3}(,ddd)+ -> '.'; every digit-flanked '.' -> ','; a text that is exactly digits+'.' -> ','; leading point left."""
    if re.search(r'\d\.\d+\s*,\s*[-–−]?\d', t):
        return t
    marks = []
    def th(m):
        return m.group().replace(',', '\x00')
    t2 = re.sub(r'(?<![\d.,])\d{1,3}(?:,\d{3})+(?![\d,])', th, t)
    t2 = re.sub(r'(?<=\d)\.(?=\d)', ',', t2)
    t2 = t2.replace('\x00', '.')
    if re.fullmatch(r'\s*\d+\.\s*', t2):
        t2 = t2.replace('.', ',')
    return t2


def split(path, items, H):
    s = Path(path).read_text(encoding='utf-8')
    raws = RAW_RE.findall(s)
    pre = s[:s.find('<style>')] if '<style>' in s else None
    parsed = parse_svg(path, H)
    zi, bad = zip_items(parsed, items)
    assert not bad and len(raws) == len(items), (path, bad[:2], len(raws), len(items))
    return pre, [(raw, it) for raw, it in zip(raws, zi)]


def main():
    off, on, outp = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    res = dict(kept_off_fail=[], kept_on_diff=[], kept_on_bad_shape=[], artwork_prefix_diff=[], coverage_fail=[],
               kept_counts={}, n_kept_texts=0, layout_on_vs_off_diff=[], report_decimal_vs_drawn=[],
               indep_r3_run_changes=[], indep_r3_line_changes=[], indep_vs_drawn_mismatch=[], split_numbers=[],
               kept_numeric_unchanged=[], translated_texts_with_dot_decimal=[])
    for b in names():
        d = PREP / 'figs' / b
        meta = json.loads((d / 'meta.json').read_text()); H = meta['page'][1]
        runs = json.loads((d / 'runs.json').read_text())
        blocks = FT.merge_blocks(FT.group(runs)); keys = [block_key(x) for x in blocks]
        tr = json.loads((SIDE / f'{b}.is.json').read_text())['blocks']
        pre0, E = split(d / 'translated.svg', json.loads((d / 'items.json').read_text()), H)
        preF, F = split(off / b / 'translated.svg', json.loads((off / b / 'items.json').read_text()), H)
        preN, N = split(on / b / 'translated.svg', json.loads((on / b / 'items.json').read_text()), H)
        if not (pre0 == preF == preN):
            res['artwork_prefix_diff'].append(b)
        kE = [(r, it) for r, it in E if it['path'] != 'layout']
        kF = [(r, it) for r, it in F if it['path'] != 'layout']
        kN = [(r, it) for r, it in N if it['path'] != 'layout']
        res['kept_counts'][b] = (len(kE), len(kF), len(kN))
        res['n_kept_texts'] += len(kE)
        if [r for r, _ in kE] != [r for r, _ in kF] or [it['block'] for _, it in kE] != [it['block'] for _, it in kF]:
            res['kept_off_fail'].append(b)
        if len(kE) != len(kN):
            res['kept_on_bad_shape'].append((b, 'count'))
        else:
            for (r0, i0), (r1, i1) in zip(kE, kN):
                if r0 == r1:
                    continue
                t0, t1 = i0['text'], i1['text']
                strip = lambda r: re.sub(r'>.*?</text>$', '>', r, flags=re.S)
                ok = strip(r0) == strip(r1) and len(t0) == len(t1) and all(a == c or (a == '.' and c == ',') for a, c in zip(t0, t1))
                res['kept_on_diff'].append((b, keys[i0['block']], t0, t1))
                if not ok:
                    res['kept_on_bad_shape'].append((b, r0, r1))
        # layout texts identical between dec on and off
        if [r for r, it in F if it['path'] == 'layout'] != [r for r, it in N if it['path'] == 'layout']:
            res['layout_on_vs_off_diff'].append(b)
        # coverage
        rep = json.loads((on / b / 'compose-report.json').read_text())
        lay_blocks = collections.Counter(it['block'] for _, it in N if it['path'] == 'layout')
        kept_blocks = collections.Counter(it['block'] for _, it in N if it['path'] == 'run-exact')
        for bi, blk in enumerate(blocks):
            k = keys[bi]
            v = tr.get(k)
            translated = v is not None and v.strip() != ''
            ident = translated and FT.is_identity(v, block_english(blk), False)
            if translated and not ident:
                if lay_blocks[bi] == 0 or kept_blocks[bi]:
                    res['coverage_fail'].append((b, bi, k, 'translated block not drawn on layout only'))
            else:
                nonempty = sum(1 for r in blk if r['text'] != '')
                if kept_blocks[bi] != nonempty or lay_blocks[bi]:
                    res['coverage_fail'].append((b, bi, k, f'kept block drew {kept_blocks[bi]} of {nonempty} runs'))
            if translated and not ident and re.search(r'\d\.\d', v):
                res['translated_texts_with_dot_decimal'].append((b, k, v))
        # report decimal entries vs drawn
        rd = collections.Counter((e['run'], e['drawn']) for e in rep.get('decimal', []))
        dd = collections.Counter((i0['text'], i1['text']) for (r0, i0), (r1, i1) in zip(kE, kN) if r0 != r1)
        if rd != dd:
            res['report_decimal_vs_drawn'].append((b, dict(rd), dict(dd)))
        # independent R3 enumeration over kept runs (kept = not a translated non-identity block)
        drawn_on = {}
        for (r0, i0), (r1, i1) in zip(kE, kN):
            drawn_on.setdefault(i0['block'], []).append((i0['text'], i1['text']))
        for bi, blk in enumerate(blocks):
            v = tr.get(keys[bi]); translated = v is not None and v.strip() != ''
            if translated and not FT.is_identity(v, block_english(blk), False):
                continue
            texts = [r['text'] for r in blk if r['text'] != '']
            exp = [my_r3(t) for t in texts]
            got = [t1 for _, t1 in drawn_on.get(bi, [])]
            if exp != got:
                res['indep_vs_drawn_mismatch'].append((b, keys[bi], texts, exp, got))
            for t, e in zip(texts, exp):
                if t != e:
                    res['indep_r3_run_changes'].append((b, t, e))
                elif re.search(r'\d[.,]|[.,]\d', t):
                    res['kept_numeric_unchanged'].append((b, keys[bi], t))
            # per LINE (c9's own unit): does joining the runs change the verdict? (run-split numbers)
            for li, line in enumerate(keys[bi].split('|')):
                le = my_r3(line)
                if le != line:
                    res['indep_r3_line_changes'].append((b, line, le))
            for p, q in zip(blk, blk[1:]):
                if (re.search(r'\d$', p['text']) and re.match(r'[.,]\d', q['text'])) or \
                        (re.search(r'\d[.,]$', p['text']) and re.match(r'\d', q['text'])):
                    res['split_numbers'].append((b, keys[bi], p['text'], q['text']))
    outp.write_text(json.dumps(res, ensure_ascii=False, indent=1))
    c = lambda k: len(res[k])
    print('kept texts (E)', res['n_kept_texts'], '| kept off != E', c('kept_off_fail'), '| kept on diffs', c('kept_on_diff'),
          '| bad shape', c('kept_on_bad_shape'), '| artwork prefix diff', c('artwork_prefix_diff'), '| coverage fail', c('coverage_fail'),
          '| layout on!=off', c('layout_on_vs_off_diff'), '| report decimal != drawn', c('report_decimal_vs_drawn'),
          '| indep R3 run changes', c('indep_r3_run_changes'), '| indep R3 line changes', c('indep_r3_line_changes'),
          '| indep vs drawn mismatch', c('indep_vs_drawn_mismatch'), '| split numbers', c('split_numbers'),
          '| kept numeric unchanged', c('kept_numeric_unchanged'), '| translated with d.d', c('translated_texts_with_dot_decimal'))


if __name__ == '__main__':
    main()
