#!/usr/bin/env python3
"""§C140 ⑥b — per-item kerning census of composed figure SVGs: browser length vs the width the composer planned,
explained item by item by the font's own kern pairs. 0 ISK, no MT, read-only on books/.

    cd experiments/figure-text-translation
    P=evidence/2026-09-17-c6b-build/instruments
    FIGTEXT_PYLIBS=./pylibs python3 -u $P/kern_census.py jobs    <root> <out-dir>        # writes <out-dir>/jobs.json
    node $P/kern_census.mjs <out-dir>/jobs.json 1,2.0833333,3 <out-dir>/lengths.json
    FIGTEXT_PYLIBS=./pylibs python3 -u $P/kern_census.py join    <root> <out-dir>        # census.json + census.txt
    FIGTEXT_PYLIBS=./pylibs python3 -u $P/kern_census.py compare <before-out> <after-out> <report.txt>
    FIGTEXT_PYLIBS=./pylibs python3 -u $P/kern_census.py strip   <after-root> <stripped-root>
    FIGTEXT_PYLIBS=./pylibs python3 -u $P/kern_census.py labels  <report.txt>           # the decision's label unit

<root>: a compose34.py output root; <root>/work/<fig>/{translated.svg, items.json} per figure (items.json from
compose_items.py). SVG and items are PAIRED and checked: the <text> count and every <text> body (XML-parsed, so
unescaped) must equal items.json's texts in order, else the run stops — items that do not describe the SVG
cannot be used silently.

Per item (one <text>):
  planned    the LINEAR advance compose.py's measuring context gives: cairo toy 'Liberation Sans', hint metrics
             OFF, weight from `bold`, slant from `italic`, size = the item's drawn `size` × 200/72 px — the exact
             key of compose.lin_advance's memo (text, bold, italic, size × ratio × S).
  kern       the sum of the legacy `kern` table pairs over the item's adjacent characters, from the SAME system TTF
             svgout.FACES subsets for (bold, italic). For Latin text the legacy table and the subset's GPOS `kern`
             agree (critic.md § Imprecise: 908/908 pairs; no GPOS-only Latin pair).
  rendered   kern_census.mjs's getComputedTextLength at each scale.
  resid_k    rendered - planned - kern      (0 when the browser kerned exactly as the table says)
  resid_0    rendered - planned             (0 when the browser did not kern)
Classification per item at each scale, tolerance TOL pt: `short` resid_0 < -TOL, `long` resid_0 > TOL, else `equal`.
Items drawn in FigSym (the STIX subset) are counted but not classified: their planned width is not Liberation's.

Terminal marker: the last stdout line of every mode is `KERN-<MODE>-DONE`.
"""
import html, json, re, sys
import xml.etree.ElementTree as ET
from pathlib import Path

HERE = Path(__file__).resolve().parents[3]          # experiments/figure-text-translation
sys.path.insert(0, str(HERE))
import _deps                                         # noqa: E402,F401
import svgout                                        # noqa: E402

TOL = 0.05
S = 200.0 / 72.0
SVGNS = '{http://www.w3.org/2000/svg}'
SIDECARS = HERE.parents[1] / 'books' / 'efnafraedi-2e' / 'figure-text'
_FONTS, _CTX, _SURF, _ADV = {}, None, None, {}


def font(bold, italic):
    from fontTools.ttLib import TTFont
    k = (bool(bold), bool(italic))
    if k not in _FONTS:
        f = TTFont(svgout.FACES[k])
        kt = f['kern'].kernTables[0].kernTable if 'kern' in f else {}
        _FONTS[k] = (f['head'].unitsPerEm, f.getBestCmap(), kt)
    return _FONTS[k]


def kern_pairs(text, bold, italic, size):
    upm, cmap, kt = font(bold, italic)
    unmapped = sorted({c for c in text if ord(c) not in cmap})
    g = [cmap.get(ord(c)) for c in text]
    pairs = [(a, b, kt[(a, b)]) for a, b in zip(g, g[1:]) if a and b and (a, b) in kt]
    return sum(v for _, _, v in pairs) * size / upm, pairs, unmapped


def planned(text, bold, italic, size):
    global _CTX, _SURF
    import cairo
    if _CTX is None:
        _SURF = cairo.ImageSurface(cairo.FORMAT_A8, 8, 8)
        _CTX = cairo.Context(_SURF)
        fo = cairo.FontOptions()
        fo.set_hint_metrics(cairo.HINT_METRICS_OFF)
        _CTX.set_font_options(fo)
    k = (text, bool(bold), bool(italic), size * S)
    if k not in _ADV:
        _CTX.select_font_face('Liberation Sans', cairo.FONT_SLANT_ITALIC if italic else cairo.FONT_SLANT_NORMAL,
                              cairo.FONT_WEIGHT_BOLD if bold else cairo.FONT_WEIGHT_NORMAL)
        _CTX.set_font_size(size * S)
        _ADV[k] = _CTX.text_extents(text).x_advance / S
    return _ADV[k]


def svg_texts(svg):
    root = ET.fromstring(Path(svg).read_bytes())
    return [(el.text or '', dict(el.attrib)) for el in root.iter(SVGNS + 'text')]


def figures(root):
    return sorted(p.name for p in (Path(root) / 'work').iterdir() if (p / 'items.json').is_file())


def paired(root, fig):
    wd = Path(root) / 'work' / fig
    items = json.loads((wd / 'items.json').read_text())
    texts = svg_texts(wd / 'translated.svg')
    assert len(items) == len(texts), f'{fig}: {len(items)} items vs {len(texts)} <text>'
    for i, (it, (t, _)) in enumerate(zip(items, texts)):
        assert it['text'] == t, f'{fig} item {i}: items.json {it["text"]!r} vs svg {t!r}'
    return wd, items, texts


def jobs(root, out):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    js = []
    for fig in figures(root):
        wd, items, texts = paired(root, fig)
        js.append(dict(fig=fig, svg=str(wd / 'translated.svg'), n=len(texts)))
    (out / 'jobs.json').write_text(json.dumps(js, indent=1))
    print(f'{len(js)} jobs')
    print('KERN-JOBS-DONE')


def join(root, out):
    out = Path(out)
    L = json.loads((out / 'lengths.json').read_text())
    census, lines = {}, []
    tot = {}
    for fig in figures(root):
        wd, items, texts = paired(root, fig)
        rec = L[fig]
        bad_fonts = [f for f in rec['fonts'] if f[3] != 'loaded']
        rows = []
        for i, (it, (t, attrs)) in enumerate(zip(items, texts)):
            path = it['path']
            fam = it.get('family', svgout.FAMILY)
            row = dict(i=i, path=path, text=t, size=it['size'], bold=bool(it['bold']), italic=bool(it.get('italic')),
                       family=fam, style_attr=attrs.get('style'), computed_kerning=rec['kerning'][i])
            if fam == svgout.FAMILY:
                k, pairs, unmapped = kern_pairs(t, it['bold'], it.get('italic'), it['size'])
                p = planned(t, it['bold'], it.get('italic'), it['size'])
                row.update(planned=p, kern=k, pairs=[[a, b, v] for a, b, v in pairs], unmapped=unmapped,
                           rendered={s: v[i] for s, v in rec['len'].items()})
                row['resid_0'] = {s: r - p for s, r in row['rendered'].items()}
                row['resid_k'] = {s: r - p - k for s, r in row['rendered'].items()}
                row['cls'] = {s: ('short' if d < -TOL else 'long' if d > TOL else 'equal')
                              for s, d in row['resid_0'].items()}
            rows.append(row)
        census[fig] = dict(fonts=rec['fonts'], bad_fonts=bad_fonts, items=rows)
        for r in rows:
            t_ = tot.setdefault(r['path'], dict(items=0, figsym=0, kern_items=0, short={}, long={}, equal={},
                                                max_abs_resid_k=0.0, max_abs_resid_0=0.0, kern_explains=0,
                                                style_none=0, computed_none=0, figs_with_kern=set()))
            t_['items'] += 1
            t_['style_none'] += r['style_attr'] == 'font-kerning:none'
            t_['computed_none'] += r['computed_kerning'] == 'none'
            if 'planned' not in r:
                t_['figsym'] += 1
                continue
            if abs(r['kern']) > 1e-9:
                t_['kern_items'] += 1
                t_['figs_with_kern'].add(fig)
            for s, c in r['cls'].items():
                t_[c][s] = t_[c].get(s, 0) + 1
            mk = max(abs(v) for v in r['resid_k'].values())
            m0 = max(abs(v) for v in r['resid_0'].values())
            t_['max_abs_resid_k'] = max(t_['max_abs_resid_k'], mk)
            t_['max_abs_resid_0'] = max(t_['max_abs_resid_0'], m0)
            t_['kern_explains'] += mk <= TOL
    for p_, t_ in tot.items():
        t_['figs_with_kern'] = sorted(t_['figs_with_kern'])
    (out / 'census.json').write_text(json.dumps(dict(tol=TOL, totals=tot, figures=census), indent=1, ensure_ascii=False))
    lines.append(f'# kern census  root={root}  figures={len(census)}  tol={TOL} pt')
    lines.append(f'bad fonts (status != loaded): {sum(len(c["bad_fonts"]) for c in census.values())}')
    for p_, t_ in sorted(tot.items()):
        lines.append(f'\n## path={p_}')
        for k in ('items', 'figsym', 'kern_items', 'kern_explains', 'style_none', 'computed_none',
                  'max_abs_resid_k', 'max_abs_resid_0'):
            v = t_[k]
            lines.append(f'  {k:16} {round(v, 4) if isinstance(v, float) else v}')
        for k in ('short', 'long', 'equal'):
            lines.append(f'  {k:16} {json.dumps(t_[k], sort_keys=True)}')
        lines.append(f'  figs_with_kern   {len(t_["figs_with_kern"])} {t_["figs_with_kern"]}')
    lines.append('\n## items whose browser length is NOT explained by the kern table (|resid_k| > tol at any scale)')
    for fig, c in census.items():
        for r in c['items']:
            if 'planned' in r and max(abs(v) for v in r['resid_k'].values()) > TOL:
                lines.append(f'  {fig} #{r["i"]} {r["path"]} {r["text"]!r} planned={r["planned"]:.3f} kern={r["kern"]:.3f} '
                             f'resid_k={json.dumps({s: round(v, 3) for s, v in r["resid_k"].items()})}')
    lines.append('\n## layout items with a kern pair (the population the ruling changes)')
    for fig, c in census.items():
        for r in c['items']:
            if r['path'] == 'layout' and 'planned' in r and abs(r['kern']) > 1e-9:
                lines.append(f'  {fig} #{r["i"]} {r["text"]!r} size={r["size"]:.2f} bold={r["bold"]} italic={r["italic"]} '
                             f'kern={r["kern"]:.3f} pairs={[(a, b, v) for a, b, v in r["pairs"]]} '
                             f'resid_0={json.dumps({s: round(v, 3) for s, v in r["resid_0"].items()})}')
    (out / 'census.txt').write_text('\n'.join(lines) + '\n')
    print('\n'.join(lines[:40]))
    print('KERN-JOIN-DONE')


def compare(before, after, report):
    B = json.loads((Path(before) / 'census.json').read_text())['figures']
    A = json.loads((Path(after) / 'census.json').read_text())['figures']
    lines = [f'# compare before={before} after={after}']
    assert sorted(B) == sorted(A), 'figure sets differ'
    changed = {}
    for fig in sorted(B):
        bi, ai = B[fig]['items'], A[fig]['items']
        assert len(bi) == len(ai), f'{fig}: item count {len(bi)} vs {len(ai)}'
        for b, a in zip(bi, ai):
            for k in ('path', 'text', 'size', 'bold', 'italic', 'family'):
                assert b[k] == a[k], f'{fig} #{b["i"]}: {k} {b[k]!r} vs {a[k]!r}'
            if 'rendered' not in b:
                continue
            if b['rendered'] != a['rendered']:
                changed.setdefault(fig, []).append((b['i'], b['path'], b['text'], b['kern'],
                                                    {s: round(a['rendered'][s] - b['rendered'][s], 4) for s in b['rendered']}))
    by_path = {}
    for fig, rows in changed.items():
        for i, p, t, k, d in rows:
            by_path.setdefault(p, []).append((fig, i, t, k, d))
    lines.append(f'items whose rendered length changed, by path: {json.dumps({p: len(v) for p, v in by_path.items()})}')
    nonlayout = [r for p, v in by_path.items() if p != 'layout' for r in v]
    lines.append(f'non-layout items whose rendered length changed: {len(nonlayout)}')
    kerned_changed = sum(1 for r in by_path.get('layout', []) if abs(r[3]) > 1e-9)
    unkerned_changed = sum(1 for r in by_path.get('layout', []) if abs(r[3]) <= 1e-9)
    lines.append(f'layout items changed WITH a kern pair: {kerned_changed}; WITHOUT one: {unkerned_changed}')
    lines.append(f'figures with any changed length: {len(changed)} {sorted(changed)}')
    for p, v in sorted(by_path.items()):
        lines.append(f'\n## {p}')
        for fig, i, t, k, d in v:
            lines.append(f'  {fig} #{i} {t!r} kern={k:.3f} Δlen={json.dumps(d)}')
    Path(report).write_text('\n'.join(lines) + '\n')
    print('\n'.join(lines[:8]))
    print('KERN-COMPARE-DONE')


def strip(after_root, stripped_root):
    A, T = Path(after_root), Path(stripped_root)
    n_total = 0
    for fig in figures(A):
        wd, items, texts = paired(A, fig)
        svg = (wd / 'translated.svg').read_text(encoding='utf-8')
        n_layout = sum(1 for it in items if it['path'] == 'layout')
        n = svg.count(' style="font-kerning:none"')
        assert n == n_layout, f'{fig}: {n} properties vs {n_layout} layout items'
        td = T / 'work' / fig
        td.mkdir(parents=True, exist_ok=True)
        (td / 'translated.svg').write_text(svg.replace(' style="font-kerning:none"', ''), encoding='utf-8')
        (td / 'items.json').write_text((wd / 'items.json').read_text())
        n_total += n
    print(f'stripped {n_total} properties')
    print('KERN-STRIP-DONE')


def labels(report):
    """The decision record's own unit: sidecar block VALUES that differ from their English ('|' read as a space) -
    translated labels; the identity values are drawn run-exact and excluded - each adjacent character pair looked up
    in Regular and Bold (Italic not checked, as the decision did not)."""
    lines, tight, wide, n, ident = [], 0, 0, 0, 0
    for sc in sorted(SIDECARS.glob('*.is.json')):
        for eng, ice in json.loads(sc.read_text())['blocks'].items():
            if ice == eng.replace('|', ' '):       # IDENTITY - drawn run-exact, not a translated label
                ident += 1
                continue
            n += 1
            neg, pos = set(), set()
            for bold in (False, True):
                _, pairs, _ = kern_pairs(ice, bold, False, 1.0)
                neg |= {(a, b, v) for a, b, v in pairs if v < 0}
                pos |= {(a, b, v) for a, b, v in pairs if v > 0}
            tight += bool(neg)
            wide += bool(pos)
            if neg or pos:
                lines.append(f'  {sc.name[:-8]} {ice!r} tight={sorted(neg)} wide={sorted(pos)}')
    head = [f'# decision unit: {n} translated block values (identity values excluded: {ident}); with a tightening pair: {tight}; with a widening pair: {wide}']
    Path(report).write_text('\n'.join(head + lines) + '\n')
    print(head[0])
    print('KERN-LABELS-DONE')


if __name__ == '__main__':
    mode, *rest = sys.argv[1:]
    dict(jobs=jobs, join=join, compare=compare, strip=strip, labels=labels)[mode](*rest)
