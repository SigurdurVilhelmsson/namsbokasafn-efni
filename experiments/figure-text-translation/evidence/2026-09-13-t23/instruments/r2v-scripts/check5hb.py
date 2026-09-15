#!/usr/bin/env python3
"""(5b) the overflow verdict under a browser-like shaper: HarfBuzz (PIL raqm, GPOS kerning on) at 1000 px, scaled.
Per layout block per cell: widest drawn word (text from items, words split on spaces within each drawn line, styled
segments measured at their own size) under cairo-hinted (compose's) and HarfBuzz metrics, vs census budget."""
import json, sys, re
from pathlib import Path
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
from svgitems import *
from check5 import cz_adv, CEN
from check12 import drawn_lines
from PIL import ImageFont
P = '/usr/share/fonts/truetype/liberation/'
FF = {(False, False): 'LiberationSans-Regular.ttf', (True, False): 'LiberationSans-Bold.ttf', (False, True): 'LiberationSans-Italic.ttf', (True, True): 'LiberationSans-BoldItalic.ttf'}
_f = {}
def hb_adv(t, size, bold, italic):
    k = (bold, italic)
    if k not in _f:
        _f[k] = ImageFont.truetype(P + FF[k], 1000, layout_engine=ImageFont.Layout.RAQM)
    return _f[k].getlength(t) / 1000.0 * size

def word_widths(dl, advf):
    """word = maximal non-space run across items of a line; width = sum over its pieces (each piece in its item's face/size)."""
    out = []
    for l in dl:
        pieces = []   # (char-run, item)
        cur = []
        for it in l['items']:
            for part in re.split(r'(\s+)', it['text']):
                if part == '':
                    continue
                if part.isspace():
                    if cur: out.append(cur); cur = []
                else:
                    cur.append((part, it))
        if cur: out.append(cur)
    res = []
    for w in out:
        res.append((''.join(p for p, _ in w), sum(advf(p, it['size'], it['bold'], it['italic']) for p, it in w)))
    return res

rows = {}
for tag in sys.argv[1:]:
    pad = float(re.search(r'_p([\d.]+)_', tag).group(1))
    work = R2 / 'work' / tag
    r = dict(hb_over_unnamed=[], named_hb_fits=[], cairo_fits_hb_over=[], hb_minus_cairo_max=0.0, n=0)
    for b in names():
        items = json.loads((work / b / 'items.json').read_text())
        rep = json.loads((work / b / 'compose-report.json').read_text())
        ov = {e['block'] for e in rep.get('overflow', [])}
        for bi in sorted({it['block'] for it in items if it['path'] == 'layout'}):
            its = [it for it in items if it['block'] == bi]; r['n'] += 1
            cz = CEN[f'{b}#{bi}']
            budget = (cz['R'] - cz['L']) - 2 * pad if cz['r2cls'] in ('box', 'cell') else (cz['FR'] - cz['FL']) - 2 * pad
            dl = drawn_lines(its)
            wc = max(word_widths(dl, cz_adv), key=lambda x: x[1]); wh = max(word_widths(dl, hb_adv), key=lambda x: x[1])
            nm = f"{b.replace('CNX_Chem_', '')} b{bi}"
            r['hb_minus_cairo_max'] = max(r['hb_minus_cairo_max'], abs(wh[1] - wc[1]))
            if wh[1] > budget + 0.01 and bi not in ov:
                r['hb_over_unnamed'].append((nm, wh[0], round(wh[1], 3), round(wc[1], 3), round(budget, 3)))
            if bi in ov and wh[1] <= budget + 0.01:
                r['named_hb_fits'].append((nm, wh[0], round(wh[1], 3), round(wc[1], 3), round(budget, 3)))
    rows[tag] = r
    print(tag, 'blocks', r['n'], '| HB widest word > budget, NOT named:', r['hb_over_unnamed'], '| named but HB fits:', r['named_hb_fits'], '| max |HB-cairo| word %.3f' % r['hb_minus_cairo_max'])
Path('/home/siggi/dev/scratch-c140/r2v-scripts/out/check5hb.json').write_text(json.dumps(rows, ensure_ascii=False, indent=1))
