#!/usr/bin/env python3
"""§C140 ⑥b — compare the drawn <text> lists of two sets of composed SVGs (P1, P3). Read-only.

    python3 -u compare_lists.py p1 <before-root> <media-dir> <report.txt>
    python3 -u compare_lists.py p3 <before-root> <after-root> <report.txt>

<root>: a compose34.py output root (<root>/work/<fig>/translated.svg, items.json). <media-dir>: books/<slug>/media
(<fig>_IS.svg).

Per figure, every <text> as data (XML-parsed): text, x, y, font-size, font-weight, font-style, fill, font-family,
transform, style, and the ORDER of its attribute names (from the raw opening tag); plus the @font-face rules
(family/weight/style, in order) and whether a <metadata> element exists and its text.

p1 — the fields text/x/y/size/weight/style/fill/family/transform must be equal, index by index; faces and
     metadata equal. Reports every difference by figure.
p3 — the same fields must be equal; additionally, for each index, `style` must be absent in BEFORE, and in AFTER
     equal to 'font-kerning:none' EXACTLY when items.json says path == 'layout' (absent otherwise), and when present
     be the LAST attribute of the opening tag. Faces and metadata equal. Prints the recompose set (figures with
     >= 1 layout item) and the figures whose text list changed.

Terminal marker: last stdout line `COMPARE-<MODE>-DONE ok=<bool>`.
"""
import json, re, sys
import xml.etree.ElementTree as ET
from pathlib import Path

SVGNS = '{http://www.w3.org/2000/svg}'
FACE = re.compile(r"@font-face\{font-family:'([^']+)';font-weight:(\d+);font-style:(\w+);")
FIELDS = ('text', 'x', 'y', 'font-size', 'font-weight', 'font-style', 'fill', 'font-family', 'transform')


def read(svg):
    data = Path(svg).read_bytes()
    root = ET.fromstring(data)
    texts, faces, meta = [], [], None
    for el in root.iter():
        tag = el.tag.replace(SVGNS, '')
        if tag == 'text':
            d = {k: el.attrib.get(k) for k in FIELDS if k != 'text'}
            d['text'] = el.text or ''
            d['style'] = el.attrib.get('style')
            texts.append(d)
        elif tag == 'style':
            faces += [f'{f}/{w}/{s}' for f, w, s in FACE.findall(el.text or '')]
        elif tag == 'metadata':
            meta = el.text
    orders = [re.findall(r'([\w:-]+)="', m.group(1))
              for m in re.finditer(rb'<text ([^>]*)>'.decode(), data.decode('utf-8'))]
    assert len(orders) == len(texts), f'{svg}: raw tag count {len(orders)} vs parsed {len(texts)}'
    for d, o in zip(texts, orders):
        d['attr_order'] = o
    return dict(texts=texts, faces=faces, metadata=meta)


def main():
    mode, a_root, b_root, report = sys.argv[1:5]
    lines, ok = [f'# compare_lists {mode}  A={a_root}  B={b_root}'], True
    figs = sorted(p.name for p in (Path(a_root) / 'work').iterdir() if (p / 'translated.svg').is_file())
    recompose, changed = [], []
    for fig in figs:
        A = read(Path(a_root) / 'work' / fig / 'translated.svg')
        if mode == 'p1':
            B = read(Path(b_root) / f'{fig}_IS.svg')
            items = None
        else:
            B = read(Path(b_root) / 'work' / fig / 'translated.svg')
            items = json.loads((Path(b_root) / 'work' / fig / 'items.json').read_text())
            assert len(items) == len(B['texts'])
        diffs = []
        if len(A['texts']) != len(B['texts']):
            diffs.append(f'text count {len(A["texts"])} vs {len(B["texts"])}')
        for i, (x, y) in enumerate(zip(A['texts'], B['texts'])):
            for k in FIELDS:
                if x.get(k) != y.get(k):
                    diffs.append(f'#{i} {k}: {x.get(k)!r} vs {y.get(k)!r}')
            if mode == 'p1':
                if x['style'] != y['style']:
                    diffs.append(f'#{i} style: {x["style"]!r} vs {y["style"]!r}')
            else:
                if x['style'] is not None:
                    diffs.append(f'#{i} BEFORE carries style {x["style"]!r}')
                want = 'font-kerning:none' if items[i]['path'] == 'layout' else None
                if y['style'] != want:
                    diffs.append(f'#{i} path={items[i]["path"]} style={y["style"]!r} want {want!r}')
                if y['style'] is not None and y['attr_order'][-1] != 'style':
                    diffs.append(f'#{i} style is not the last attribute: {y["attr_order"]}')
                if y['attr_order'][:len(x['attr_order'])] != x['attr_order']:
                    diffs.append(f'#{i} attribute order changed: {x["attr_order"]} -> {y["attr_order"]}')
        if A['faces'] != B['faces']:
            diffs.append(f'faces {A["faces"]} vs {B["faces"]}')
        if A['metadata'] != B['metadata']:
            diffs.append('metadata differs')
        n_layout = None if items is None else sum(1 for it in items if it['path'] == 'layout')
        if mode == 'p3':
            if n_layout:
                recompose.append(fig)
            if any(x != y for x, y in zip(A['texts'], B['texts'])):
                changed.append(fig)
        ok = ok and not diffs
        lines.append(f'{fig:40} texts={len(A["texts"])}/{len(B["texts"])}'
                     + ('' if n_layout is None else f' layout={n_layout}') + f' diffs={len(diffs)}')
        lines += [f'    {d}' for d in diffs[:50]]
    if mode == 'p3':
        lines.append(f'\nrecompose set (figures with >= 1 layout item): {len(recompose)} {recompose}')
        lines.append(f'figures whose <text> list changed: {len(changed)}')
        lines.append(f'recompose set == changed set: {recompose == changed}')
        ok = ok and recompose == changed
    lines.append(f'\nok={ok}')
    Path(report).write_text('\n'.join(lines) + '\n')
    print('\n'.join(lines[-6:]))
    print(f'COMPARE-{mode.upper()}-DONE ok={ok}')


if __name__ == '__main__':
    main()
