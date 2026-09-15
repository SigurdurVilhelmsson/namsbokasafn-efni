"""Post-`pdftocairo -svg` artwork pass: collapse cairo's blend-mode lerp, and measure the
reference cost that makes a browser give up.

    import svgfix
    fixed, report = svgfix.collapse_blend_lerp(svg_bytes)
    log2_cost, depth = svgfix.reference_cost(svg_bytes)

Stdlib only (re, math, xml.etree.ElementTree). Called by `strip-text.py` straight after its
`pdftocairo -svg` call, and by `figure-prepare.py` for the sentinel.

WHAT CAIRO WRITES, AND WHY IT HANGS A BROWSER
---------------------------------------------
cairo 1.18's SVG surface paints every non-Normal blend mode (PDF `/BM /Multiply`, `/Screen`, ...)
as a lerp by the clip coverage:

    add( blend(S, D) masked by Ma ,  D masked by (1 - Ma) )          feComposite k = 0,1,1,0

where D is EVERYTHING PAINTED SO FAR and is referenced TWICE, and the next paint's D contains this
paint's result. A figure with N such paints is a 2^N reference tree to a renderer that does not
share: `CNX_Chem_03_01_exocytosis-88f6` (158 paints) never finishes loading in Chromium `<img>`.

In SVG terms one paint is:
  - F_add  = <filter>[feImage R "source", feImage L "destination", feComposite arithmetic 0 1 1 0]
  - R      = <g filter=url(#F_blend) mask=url(#Ma)> one rect == the subregion SR </g>
  - F_blend= <filter>[feImage S, feImage D, feBlend mode=...], same SR
  - Ma     = <mask><use href=#E/></mask>, E ends in an opaque white rect covering SR
  - L      = <g mask=url(#Mb)> <use href=#D/> </g>
  - Mb     = <mask><use href=#E2 filter=url(#invert-alpha)/></mask>, E2 opaque over SR
and the use site is `<g filter="url(#F_add)" ...>`.

THE COLLAPSE. Where Ma is 1 on SR, Mb is 0 on SR, so the L term is exactly zero and R is exactly
blend(S, D) over the same crop: the use site can point at F_blend directly. One byte per paint
(cairo numbers F_blend = F_add - 1), and one D reference per paint instead of two. Measured on the
34 bought figures (evidence `2026-09-13-t23/reports/exo-spike.md`, `exo-verify.md`): exocytosis
155 of 158 paints, 804,000 / 804,000 px identical in Chromium, never-loads -> ~2.1 s.

WHAT IS LEFT ALONE, AND COUNTED
-------------------------------
  - `clipped`   : the lerp scaffolding is all there but Ma is NOT an opaque white cover over SR -
                  a real clip, so the D-term is not zero (rxn3's 6, exocytosis filter-101/131/139).
  - `unmatched` : any other shape (IcePack's arithmetic add over a non-blend filter; anything cairo
                  may write tomorrow). A shape change makes this pass collapse NOTHING, and that is
                  why `reference_cost` exists: it depends on no shape at all.
Precedence: every structural check first, then Ma's coverage. A paint that is both mis-shaped and
clipped is `unmatched` - "clipped" asserts the scaffolding was recognised.

🔴 NEVER SERIALISE THE TREE. ElementTree decides the semantics; the edit is a BYTE substitution of
`filter="url(#F_add)"` at use sites, and its count is cross-checked against the parse. A mismatch
(a use site the parser sees and the byte pattern does not - another quoting, an entity) raises
ValueError and returns nothing half-rewritten; the caller keeps cairo's file and the sentinel
still fires. Re-serialising would rewrite 25 MB of cairo's layout to change 155 bytes.

This is a port of the verifier's parser (`instruments/exo-v/fix/lerpcollapse.py`), byte-equal to it
on the 34, with its crash-on-a-missing-number paths turned into `unmatched`. Its single
`rejected` bucket is split here into clipped / unmatched; the COLLAPSE decision is unchanged.
"""
import math
import re
import xml.etree.ElementTree as ET

REFCOST_WARN_LOG2 = 20

_SVG = '{http://www.w3.org/2000/svg}'
_XL = '{http://www.w3.org/1999/xlink}href'
# feColorMatrix of cairo's `filter-remove-color-and-invert-alpha`: rgb -> 1, alpha -> 1 - alpha.
_INV_VALUES = [0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -1, 1]
_WHITE = ('rgb(100%,100%,100%)', '#fff', '#ffffff', 'white')
_NUM = r'([-\d.eE+]+)'
_TRANSLATE = re.compile(r'\s*translate\(\s*' + _NUM + r'(?:[\s,]+' + _NUM + r')?\s*\)\s*')
_MATRIX = re.compile(r'\s*matrix\(\s*' + r'[\s,]+'.join([_NUM] * 6) + r'\s*\)\s*')
_URL = re.compile(r'\s*url\(#([^)]+)\)\s*')
# Every `filter="url(#X)"` in the bytes. `X` cannot hold `"` or `)`, so matches never overlap
# and the matches whose group is F_add are exactly the occurrences of that literal string.
_USE_SITE = re.compile(rb'filter="url\(#([^)"]*)\)"')


def _tag(e):
    t = e.tag
    return t[len(_SVG):] if isinstance(t, str) and t.startswith(_SVG) else t


def _href(e):
    v = e.get(_XL) or e.get('href')
    return v[1:] if v and v.startswith('#') else None


def _urlref(v):
    m = _URL.fullmatch(v or '')
    return m.group(1) if m else None


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _translate(t):
    """(tx, ty) for no transform, a translate, or an identity-linear matrix; else None."""
    if t is None:
        return (0.0, 0.0)
    m = _TRANSLATE.fullmatch(t)
    if m:
        tx, ty = _num(m.group(1)), _num(m.group(2) or 0)
        return None if tx is None or ty is None else (tx, ty)
    m = _MATRIX.fullmatch(t)
    if m:
        vals = [_num(g) for g in m.groups()]
        if None not in vals and vals[:4] == [1, 0, 0, 1]:
            return (vals[4], vals[5])
    return None


def _default_region(f):
    return (f.get('x') == '0%' and f.get('y') == '0%' and f.get('width') == '100%'
            and f.get('height') == '100%' and f.get('filterUnits') is None
            and f.get('primitiveUnits') is None)


def _subregion(fe):
    vals = tuple(_num(fe.get(k)) for k in ('x', 'y', 'width', 'height'))
    return None if None in vals else vals


def _two_image_filter(f, last_tag):
    """filter = [feImage "source", feImage "destination", <last_tag> in=source in2=destination]."""
    if f is None or _tag(f) != 'filter':
        return None
    kids = list(f)
    if len(kids) != 3 or not _default_region(f):
        return None
    a, b, c = kids
    if _tag(a) != 'feImage' or _tag(b) != 'feImage' or _tag(c) != last_tag:
        return None
    if a.get('result') != 'source' or b.get('result') != 'destination':
        return None
    if c.get('in') != 'source' or c.get('in2') != 'destination':
        return None
    sra, srb = _subregion(a), _subregion(b)
    if sra is None or sra != srb:
        return None
    return {'src': _href(a), 'dst': _href(b), 'sr': sra, 'op': c}


def _plain_mask_use(m, allowed):
    """<mask id> holding exactly one <use> whose attributes are within `allowed`; -> the use."""
    if m is None or _tag(m) != 'mask' or set(m.keys()) != {'id'} or len(m) != 1:
        return None
    use = m[0]
    if _tag(use) != 'use' or set(use.keys()) - allowed:
        return None
    return use


def _covers(box, sr, eps=1e-9):
    x0, y0, x1, y1 = box
    sx, sy, sw, sh = sr
    return x0 <= sx + eps and y0 <= sy + eps and x1 >= sx + sw - eps and y1 >= sy + sh - eps


def _opaque_over(group, sr):
    """-> '' when `group` is a <g> (pure translate) whose LAST child is a plain opaque white
    rect covering `sr`, else the reason. Source-over: a final opaque white paint leaves colour
    white and alpha 1 whatever came before it."""
    if _tag(group) != 'g':
        return 'E not g'
    if set(group.keys()) - {'id', 'transform'}:
        return 'E attrs %s' % sorted(set(group.keys()) - {'id', 'transform'})
    tr = _translate(group.get('transform'))
    if tr is None:
        return 'E transform'
    if not len(group):
        return 'E empty'
    rect = group[-1]
    if (_tag(rect) != 'rect'
            or set(rect.keys()) - {'x', 'y', 'width', 'height', 'fill', 'fill-opacity'}
            or (rect.get('fill') or '').replace(' ', '') not in _WHITE
            or rect.get('fill-opacity') not in (None, '1')):
        return 'E last child not a plain opaque white rect: <%s>' % _tag(rect)
    x, y = _num(rect.get('x', '0')), _num(rect.get('y', '0'))
    w, h = _num(rect.get('width')), _num(rect.get('height'))
    if None in (x, y, w, h):
        return 'E rect numbers'
    box = (x + tr[0], y + tr[1], x + tr[0] + w, y + tr[1] + h)
    if not _covers(box, sr):
        return 'E rect %s does not cover sr %s' % (box, sr)
    return ''


def _classify_paint(ids, a):
    """-> ('collapsed', F_blend id, mode) | ('clipped', why) | ('unmatched', why)."""
    sr = a['sr']
    R, L = ids.get(a['src']), ids.get(a['dst'])
    if R is None or L is None:
        return ('unmatched', 'R/L missing')
    if _tag(R) != 'g' or set(R.keys()) != {'id', 'filter', 'mask'}:
        return ('unmatched', 'R shape')
    kids = list(R)
    if len(kids) != 1 or _tag(kids[0]) != 'rect' or kids[0].get('stroke') is not None:
        return ('unmatched', 'R content')
    rr = kids[0]
    rbox = (_num(rr.get('x', '0')), _num(rr.get('y', '0')), _num(rr.get('width')),
            _num(rr.get('height')))
    if rbox != sr:
        return ('unmatched', 'R rect %s != add sr %s' % (rbox, sr))
    fb_id = _urlref(R.get('filter'))
    b = _two_image_filter(ids.get(fb_id), 'feBlend')
    if not b:
        return ('unmatched', 'R filter is not a two-image feBlend')
    if b['sr'] != sr:
        return ('unmatched', 'blend sr != add sr')
    ma_use = _plain_mask_use(ids.get(_urlref(R.get('mask'))), {_XL, 'href'})
    if ma_use is None:
        return ('unmatched', 'Ma shape')
    E = ids.get(_href(ma_use))
    if E is None:
        return ('unmatched', 'Ma target missing')
    if _tag(L) != 'g' or set(L.keys()) != {'id', 'mask'}:
        return ('unmatched', 'L shape')
    mb_use = _plain_mask_use(ids.get(_urlref(L.get('mask'))), {_XL, 'href', 'filter'})
    if mb_use is None:
        return ('unmatched', 'Mb shape')
    inv = ids.get(_urlref(mb_use.get('filter')))
    ik = list(inv) if inv is not None else []
    try:
        inv_values = [float(v) for v in (ik[0].get('values', '') if ik else '').split()]
    except ValueError:
        inv_values = None
    if not (inv is not None and _tag(inv) == 'filter' and _default_region(inv) and len(ik) == 1
            and _tag(ik[0]) == 'feColorMatrix'
            and ik[0].get('color-interpolation-filters') == 'sRGB'
            and inv_values == _INV_VALUES):
        return ('unmatched', 'Mb filter not invert-alpha')
    E2 = ids.get(_href(mb_use))
    if E2 is None:
        return ('unmatched', 'Mb target missing')
    why = _opaque_over(E, sr)
    if why:
        return ('clipped', 'Ma not opaque over sr: ' + why)
    why = _opaque_over(E2, sr)
    if why:
        return ('unmatched', 'Mb source not opaque over sr: ' + why)
    return ('collapsed', fb_id, b['op'].get('mode'))


def _analyse(root):
    ids = {}
    users = {}                                   # filter id -> number of referencing elements
    for e in root.iter():
        i = e.get('id')
        if i is not None:
            ids[i] = e
        fid = _urlref(e.get('filter'))
        if fid:
            users[fid] = users.get(fid, 0) + 1
    out = {'addOps': 0, 'collapse': {}, 'clipped': {}, 'unmatched': {}}
    for fid, F in ids.items():
        a = _two_image_filter(F, 'feComposite')
        if not a:
            continue
        op = a['op']
        if (op.get('operator') != 'arithmetic'
                or [op.get(k) for k in ('k1', 'k2', 'k3', 'k4')] != ['0', '1', '1', '0']):
            continue
        out['addOps'] += 1
        verdict = _classify_paint(ids, a)
        if verdict[0] == 'collapsed':
            out['collapse'][fid] = {'blend': verdict[1], 'mode': verdict[2],
                                    'users': users.get(fid, 0)}
        else:
            out[verdict[0]][fid] = verdict[1]
    return out


def collapse_blend_lerp(data):
    """Retarget every collapsible blend-lerp use site from its add filter to its blend filter.

    data: the bytes of an SVG as `pdftocairo -svg` wrote it.
    -> (bytes, report). report = {addOps, collapsed, useSitesRewritten, clipped, unmatched,
       modes: {feBlend mode: collapsed paints}}. With nothing rewritten the SAME object is
       returned. Raises ValueError when a byte count disagrees with the parse (nothing is
       rewritten), and ElementTree.ParseError on malformed XML.
    """
    if not isinstance(data, bytes):
        raise TypeError('collapse_blend_lerp takes bytes, got %s' % type(data).__name__)
    res = _analyse(ET.fromstring(data))
    modes = {}
    for info in res['collapse'].values():
        modes[info['mode']] = modes.get(info['mode'], 0) + 1
    edits = {fid.encode('utf-8'): info['blend'].encode('utf-8')
             for fid, info in res['collapse'].items()}
    counts = {}
    for m in _USE_SITE.finditer(data):
        if m.group(1) in edits:
            counts[m.group(1)] = counts.get(m.group(1), 0) + 1
    mismatched = sorted(fid for fid, info in res['collapse'].items()
                        if counts.get(fid.encode('utf-8'), 0) != info['users'])
    if mismatched:
        raise ValueError('use-site byte count disagrees with the parse for %s (bytes %s, parse %s)'
                         % (mismatched, [counts.get(f.encode('utf-8'), 0) for f in mismatched],
                            [res['collapse'][f]['users'] for f in mismatched]))
    rewritten = sum(counts.values())
    report = {'addOps': res['addOps'], 'collapsed': len(res['collapse']),
              'useSitesRewritten': rewritten, 'clipped': len(res['clipped']),
              'unmatched': len(res['unmatched']), 'modes': modes}
    if not rewritten:
        return data, report

    def swap(m):
        new = edits.get(m.group(1))
        return m.group(0) if new is None else b'filter="url(#' + new + b')"'

    return _USE_SITE.sub(swap, data), report


# ── the sentinel ──────────────────────────────────────────────────────────────────────
_LEAF = frozenset({'path', 'rect', 'image', 'text', 'circle', 'ellipse', 'line', 'polygon',
                   'polyline'})
_URL_PREFIX = re.compile(r'url\(#([^)]+)\)')     # refgraph.py's `re.match`, kept as is


def reference_cost(data):
    """No-sharing reference cost of an SVG: the number of leaf paints a renderer that re-renders
    every reference would perform. A MODEL, not a measurement - and shape-independent, which is
    the point: whatever cairo writes tomorrow, a doubling reference chain shows up here.

    Port of `instruments/exo/tools/refgraph.py`: cost(e) = [e is a leaf paint] + children (none for
    <defs>) + a <use> target + an <feImage> target + mask / clip-path / filter targets, memoised
    per id; depth counts <feImage> hops. Root <defs> is skipped. Iterative (exocytosis nests far
    past Python's recursion limit) and cycle-safe (a reference back to an element still being
    costed contributes 0 - refgraph.py recurses forever there).

    -> (log2 of the root cost, max feImage nesting depth).
    """
    root = ET.fromstring(data)
    ids = {}
    for e in root.iter():
        i = e.get('id')
        if i:
            ids[i] = e
    memo = {}

    def deps(e):
        t = _tag(e)
        out = [] if t == 'defs' else [(ch, 0) for ch in e]
        if t == 'use' or t == 'feImage':
            target = ids.get(_href(e))
            if target is not None:
                out.append((target, 1 if t == 'feImage' else 0))
        for attr in ('mask', 'clip-path', 'filter'):
            m = _URL_PREFIX.match(e.get(attr) or '')
            target = ids.get(m.group(1)) if m else None
            if target is not None:
                out.append((target, 0))
        return out

    def cost(start):
        # frame: [element, deps, next dep index, cost so far, depth so far]
        stack = [[start, deps(start), 0, 1 if _tag(start) in _LEAF else 0, 0]]
        active = {id(start)}
        while True:
            frame = stack[-1]
            e, ds, k = frame[0], frame[1], frame[2]
            if k < len(ds):
                frame[2] = k + 1
                child, inc = ds[k]
                key = child.get('id')
                if key and key in memo:
                    c, d = memo[key]
                elif id(child) in active:
                    c, d = 0, 0
                else:
                    stack.append([child, deps(child), 0, 1 if _tag(child) in _LEAF else 0, 0])
                    active.add(id(child))
                    continue
                frame[3] += c
                frame[4] = max(frame[4], d + inc)
                continue
            stack.pop()
            active.discard(id(e))
            key = e.get('id')
            if key:
                memo[key] = (frame[3], frame[4])
            if not stack:
                return frame[3], frame[4]
            parent = stack[-1]
            inc = parent[1][parent[2] - 1][1]
            parent[3] += frame[3]
            parent[4] = max(parent[4], frame[4] + inc)

    total, depth = 0, 0
    for ch in root:
        if _tag(ch) == 'defs':
            continue
        key = ch.get('id')
        c, d = memo[key] if key and key in memo else cost(ch)
        total += c
        depth = max(depth, d)
    return math.log2(max(total, 1)), depth
