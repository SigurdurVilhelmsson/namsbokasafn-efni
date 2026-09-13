"""Shared: parse a composed SVG's FigIS <text> layer, zip it 1:1 against items.json (the only trust
taken from items.json is the `block` tag and `path`); independent geometry helpers (not figtext)."""
import json, math, re, html, sys
from pathlib import Path

sys.dont_write_bytecode = True
R2 = Path('/home/siggi/dev/scratch-c140/r2')
PREP = Path('/home/siggi/dev/scratch-c140/prep')
REPO = Path('/home/siggi/dev/repos/namsbokasafn-efni')
SIDE = REPO / 'books/efnafraedi-2e/figure-text'
sys.path.insert(0, str(REPO / 'experiments/figure-text-translation/pylibs'))
sys.path.insert(0, str(R2 / 'tree'))           # figtext/blockkey: used ONLY to form blocks + keys (the bought unit)
import figtext as FT
from blockkey import block_key, block_english

TEXT_RE = re.compile(r'<text ([^>]*font-family="FigIS"[^>]*)>(.*?)</text>', re.S)
ATTR_RE = re.compile(r'([\w:-]+)="([^"]*)"')


def names():
    return [f['basename'] for f in json.loads((PREP / 'manifest.json').read_text())['figures']]


def parse_svg(path, page_h):
    s = Path(path).read_text(encoding='utf-8')
    out = []
    for m in TEXT_RE.finditer(s):
        a = dict(ATTR_RE.findall(m.group(1)))
        x = float(a['x']); ysvg = float(a['y'])
        rot = 0.0
        if 'transform' in a:
            mm = re.match(r'rotate\(([-\d.e]+) ([-\d.e]+) ([-\d.e]+)\)', a['transform'])
            rot = -float(mm.group(1))
        out.append(dict(text=html.unescape(m.group(2)), x=x, y=page_h - ysvg, size=float(a['font-size']),
                        bold=a.get('font-weight') == '700', italic=a.get('font-style') == 'italic', rot=rot,
                        fill=a.get('fill'), space=a.get('xml:space')))
    return out


def zip_items(svg_texts, items):
    """Assert the SVG text layer and items.json agree 1:1 (text exact; x,y,size to svgout's 3 dp)."""
    bad = []
    if len(svg_texts) != len(items):
        return None, [f'count svg {len(svg_texts)} != items {len(items)}']
    for k, (s, it) in enumerate(zip(svg_texts, items)):
        if s['text'] != it['text'] or abs(s['x'] - (it['x'] + it['dx'])) > 6e-4 or abs(s['size'] - it['size']) > 6e-4 \
                or abs(s['y'] - it['y']) > 2e-3 or abs(s['rot'] - it['rot']) > 1e-3 or s['italic'] != bool(it.get('italic')) \
                or s['bold'] != bool(it['bold']):
            bad.append((k, s, it))
    return [dict(s, block=it['block'], path=it['path']) for s, it in zip(svg_texts, items)], bad


def along(x, y, rot):
    a = math.radians(rot)
    return x * math.cos(a) + y * math.sin(a)


def normal(x, y, rot):
    a = math.radians(rot)
    return -x * math.sin(a) + y * math.cos(a)


def letters(t):
    return sum(c.isalpha() for c in t)


def italic_font(fonts, fk):
    n = fonts.get(fk, {}).get('base', '').lower()
    return 'italic' in n or 'oblique' in n
