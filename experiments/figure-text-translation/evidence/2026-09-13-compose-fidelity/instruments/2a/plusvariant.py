"""PLUS variant of the prototype SVG (browser path only), three residual fixes layered on the run-exact items:
  (1) STIX runs drawn in the source PDF's own embedded STIX subset (stixface.py)   [--no-stix to disable]
  (2) text-rendering:geometricPrecision on every <text>  (Chromium stops rounding advances to whole px) [--no-geo]
  (3) per-run font-kerning chosen FROM THE DATA: 'normal' iff the run's position-derived adv matches
      hmtx+kern better than hmtx alone, else 'none'  [--no-kern]
CONTROL: all three off -> <text> list identical to the prototype SVG.  -> proto/plus/<b>/plus-<mode>.svg"""
import sys, json, re, base64, io
from pathlib import Path
SP = Path('/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/d293cd29-19d8-4ccc-a2b3-244bf111501b/scratchpad')
sys.path.insert(0, str(SP / 'proto'))
import figtext as FT
import svgout as SO
import stixface
from fontTools.ttLib import TTFont

LIB = {}
for k, p in {(False, False): 'Regular', (True, False): 'Bold', (False, True): 'Italic', (True, True): 'BoldItalic'}.items():
    f = TTFont(f'/usr/share/fonts/truetype/liberation/LiberationSans-{p}.ttf')
    LIB[k] = (f.getBestCmap(), f['hmtx'], f['head'].unitsPerEm, f['kern'].kernTables[0].kernTable)

def kern_wanted(text, size, bold, italic, adv):
    cmap, hm, upm, kt = LIB[(bold, italic)]
    if len(text) < 2 or any(ord(c) not in cmap for c in text):
        return None
    h = sum(hm[cmap[ord(c)]][0] for c in text) / upm * size
    k = sum(kt.get((cmap[ord(a)], cmap[ord(c)]), 0) for a, c in zip(text, text[1:])) / upm * size
    if abs(k) < 0.01:
        return None
    return abs(adv - (h + k)) < abs(adv - h)

def cmyk(f):
    if not f: return (0, 0, 0)
    _, c, m, y, k = f
    return ((1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k))

def build(b, mode, stix=True, geo=True, kern=True):
    o = SP / 'proto/out' / b / f'proto-{mode}'
    name = 'control' if mode == 'control' else 'translated'
    meta = json.loads((o / 'meta.json').read_text()); runs = json.loads((o / 'runs.json').read_text())
    blocks = FT.merge_blocks(FT.group(runs))
    old = json.loads((o / f'items-{name}.json').read_text())
    kept = {i['block'] for i in old if i['path'] == 'runexact'}
    items = []
    for bi, blk in enumerate(blocks):
        if bi not in kept:
            items += [dict(i) for i in old if i['block'] == bi]; continue
        for r in blk:
            text = FT._CID_TOKEN.sub('', r['text'])
            if text == '': continue
            base = meta['fonts'].get(r['font'], {}).get('base', '').split('+')[-1].lower()
            bold, italic = 'bold' in base, ('italic' in base or 'oblique' in base)
            S = 200.0 / 72.0; H = meta['page'][1]
            items.append(dict(text=text, x=(r['x'] * S) / S, y=H - ((H - r['y']) * S) / S, rot=r['rot'], size=r['size'], bold=bold, italic=italic,
                              rgb=cmyk(r['fill']), dx=0.0, block=bi, path='runexact', stix='stix' in base,
                              kern=None if 'liberation' not in base else kern_wanted(text, r['size'], bold, italic, r['adv'])))
    d = SP / 'proto/plus' / b; d.mkdir(parents=True, exist_ok=True)
    tag = 'plus' if (stix or geo or kern) else 'rebuild'
    dst = d / f'{tag}-{mode}.svg'
    # svgout subsets Liberation faces from ALL items it is given; STIX items must not pull glyphs into
    # Liberation faces when drawn in FigSTIX, so pass them with a marker and fix the family afterwards.
    SO.write_svg(o / 'artwork.svg', dst, [i for i in items], meta['page'][1])
    s = dst.read_text(encoding='utf-8')
    texts = list(re.finditer(r'<text [^>]*>[^<]*</text>', s))
    assert len(texts) == len(items), (len(texts), len(items))
    parts, last, nst, nk = [], 0, 0, {True: 0, False: 0}
    for m, it in zip(texts, items):
        parts.append(s[last:m.start()]); t = m.group(0)
        if stix and it.get('stix'):
            t = t.replace('font-family="FigIS"', 'font-family="FigSTIX"', 1); nst += 1
        if kern and it.get('kern') is not None:
            t = t.replace('<text ', f'<text style="font-kerning:{"normal" if it["kern"] else "none"}" ', 1); nk[it['kern']] += 1
        parts.append(t); last = m.end()
    parts.append(s[last:]); s = ''.join(parts)
    css = ''
    if geo:
        css += 'text{text-rendering:geometricPrecision}'
    if stix and nst:
        got = stixface.embedded_stix(SP / 'prep' / b / f'{b}.pdf')
        otf, _ = stixface.build_otf(got[1], got[2], got[3], diffs=got[4])
        f = TTFont(io.BytesIO(otf)); f.flavor = 'woff2'; buf = io.BytesIO(); f.save(buf)
        css += (f"@font-face{{font-family:'FigSTIX';font-weight:400;font-style:normal;"
                f"src:url(data:font/woff2;base64,{base64.b64encode(buf.getvalue()).decode('ascii')}) format('woff2');}}")
    s = s.replace('<style>', '<style>' + css, 1)
    dst.write_text(s, encoding='utf-8')
    return dst, dict(stix_items=nst, kern_on=nk[True], kern_off=nk[False], bytes=len(s.encode('utf-8')))

if __name__ == '__main__':
    rows = []
    names = [a for a in sys.argv[1:] if not a.startswith('-')] or (SP / 'prep/bought.txt').read_text().split()
    T = lambda p: re.findall(r'<text [^>]*>[^<]*</text>', Path(p).read_text(encoding='utf-8'))
    for b in names:
        for mode in ('control', 'tr'):
            name = 'control' if mode == 'control' else 'translated'
            reb, _ = build(b, mode, False, False, False)
            ok = T(reb) == T(SP / 'proto/out' / b / f'proto-{mode}' / f'{name}.svg')
            reb.unlink()
            _, info = build(b, mode)
            row = dict(basename=b, mode=mode, rebuild_equals_proto=ok, **info); rows.append(row)
            print(json.dumps(row), flush=True)
    with (SP / 'proto/data/plus.jsonl').open('a') as fo:
        for r in rows: fo.write(json.dumps(r) + '\n')
