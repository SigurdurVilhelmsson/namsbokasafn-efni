"""exo-v verifier: independent implementation of the proposed blend-lerp collapse.

Parser-based (ElementTree), semantic checks, then a byte substitution of use-site
filter attributes whose count is cross-checked against the parse.  Shares no code
with exo/fix/collapse_blend_lerp.py.

usage: lerpcollapse.py <in.svg> <out.svg|-> [--report report.json]
"""
import sys, re, json
import xml.etree.ElementTree as ET

SVG = '{http://www.w3.org/2000/svg}'
XL = '{http://www.w3.org/1999/xlink}href'
INV_VALUES = [0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -1, 1]


def tag(e):
    return e.tag[len(SVG):] if e.tag.startswith(SVG) else e.tag


def href(e):
    v = e.get(XL) or e.get('href')
    return v[1:] if v and v.startswith('#') else None


def urlref(v):
    m = re.fullmatch(r'\s*url\(#([^)]+)\)\s*', v or '')
    return m.group(1) if m else None


def num(v):
    return float(v)


def parse_translate(t):
    """Return (tx, ty) for a pure translate / identity-matrix transform, else None."""
    if t is None:
        return (0.0, 0.0)
    m = re.fullmatch(r'\s*translate\(\s*([-\d.eE+]+)(?:[\s,]+([-\d.eE+]+))?\s*\)\s*', t)
    if m:
        return (float(m.group(1)), float(m.group(2) or 0))
    m = re.fullmatch(r'\s*matrix\(\s*([-\d.eE+]+)[\s,]+([-\d.eE+]+)[\s,]+([-\d.eE+]+)[\s,]+([-\d.eE+]+)[\s,]+([-\d.eE+]+)[\s,]+([-\d.eE+]+)\s*\)\s*', t)
    if m:
        a, b, c, d, e, f = map(float, m.groups())
        if (a, b, c, d) == (1, 0, 0, 1):
            return (e, f)
    return None


def filter_region_default(f):
    return (f.get('x') == '0%' and f.get('y') == '0%' and f.get('width') == '100%' and f.get('height') == '100%'
            and f.get('filterUnits') is None and f.get('primitiveUnits') is None)


def fe_subregion(fe):
    try:
        return tuple(num(fe.get(k)) for k in ('x', 'y', 'width', 'height'))
    except (TypeError, ValueError):
        return None


def two_image_filter(f, last_tag):
    """filter = [feImage source, feImage destination, <last_tag> in=source in2=destination]."""
    kids = list(f)
    if len(kids) != 3 or not filter_region_default(f):
        return None
    a, b, c = kids
    if tag(a) != 'feImage' or tag(b) != 'feImage' or tag(c) != last_tag:
        return None
    if a.get('result') != 'source' or b.get('result') != 'destination':
        return None
    if c.get('in') != 'source' or c.get('in2') != 'destination':
        return None
    sra, srb = fe_subregion(a), fe_subregion(b)
    if sra is None or sra != srb:
        return None
    return {'src': href(a), 'dst': href(b), 'sr': sra, 'op': c}


ALLOWED_NOPAINT = {'id', 'filter', 'mask'}


def white_opaque_rect_cover(rect, tx, ty):
    """Rect painted opaque white; returns its user-space box after (tx,ty) or None."""
    if tag(rect) != 'rect':
        return None
    extra = set(rect.keys()) - {'x', 'y', 'width', 'height', 'fill', 'fill-opacity'}
    if extra:
        return None
    fill = (rect.get('fill') or '').replace(' ', '')
    if fill not in ('rgb(100%,100%,100%)', '#fff', '#ffffff', 'white'):
        return None
    if rect.get('fill-opacity') not in (None, '1'):
        return None
    x, y = num(rect.get('x', '0')), num(rect.get('y', '0'))
    return (x + tx, y + ty, x + tx + num(rect.get('width')), y + ty + num(rect.get('height')))


def covers(box, sr, eps=1e-9):
    x0, y0, x1, y1 = box
    sx, sy, sw, sh = sr
    return x0 <= sx + eps and y0 <= sy + eps and x1 >= sx + sw - eps and y1 >= sy + sh - eps


def extents_group_opaque_over(E, sr):
    """E is a <g> (optionally pure-translate) whose LAST child is an opaque white rect covering sr.
    Source-over: a final opaque white paint makes alpha 1 and colour white regardless of what came before."""
    if E is None or tag(E) != 'g':
        return False, 'E not g'
    if set(E.keys()) - {'id', 'transform'}:
        return False, 'E attrs %s' % sorted(set(E.keys()) - {'id', 'transform'})
    tr = parse_translate(E.get('transform'))
    if tr is None:
        return False, 'E transform'
    kids = list(E)
    if not kids:
        return False, 'E empty'
    box = white_opaque_rect_cover(kids[-1], *tr)
    if box is None:
        return False, 'E last child not plain opaque white rect: <%s %s>' % (tag(kids[-1]), dict(kids[-1].attrib))
    if not covers(box, sr):
        return False, 'E rect %s does not cover sr %s' % (box, sr)
    return True, ''


def plain_mask(M):
    return tag(M) == 'mask' and set(M.keys()) == {'id'}


def analyse(root):
    ids = {}
    for e in root.iter():
        i = e.get('id')
        if i is not None:
            ids[i] = e
    refs = {}   # filter id -> list of referencing elements
    for e in root.iter():
        fid = urlref(e.get('filter'))
        if fid:
            refs.setdefault(fid, []).append(e)
    out = {'add': 0, 'collapse': {}, 'rejected': {}}
    for fid, F in ids.items():
        if tag(F) != 'filter':
            continue
        a = two_image_filter(F, 'feComposite')
        if not a:
            continue
        op = a['op']
        if op.get('operator') != 'arithmetic' or [op.get(k) for k in ('k1', 'k2', 'k3', 'k4')] != ['0', '1', '1', '0']:
            continue
        out['add'] += 1
        why = None
        R, L = ids.get(a['src']), ids.get(a['dst'])
        FB = MA = MB = None
        if R is None or L is None:
            why = 'R/L missing'
        elif tag(R) != 'g' or set(R.keys()) != {'id', 'filter', 'mask'}:
            why = 'R shape %s' % sorted(R.keys())
        else:
            FB = ids.get(urlref(R.get('filter')))
            MA = ids.get(urlref(R.get('mask')))
            rk = list(R)
            if len(rk) != 1 or tag(rk[0]) != 'rect' or rk[0].get('stroke') is not None:
                why = 'R content'
            else:
                rr = rk[0]
                rbox = (num(rr.get('x', '0')), num(rr.get('y', '0')), num(rr.get('width')), num(rr.get('height')))
                if rbox != a['sr']:
                    why = 'R rect %s != add sr %s' % (rbox, a['sr'])
        if why is None:
            b = FB is not None and two_image_filter(FB, 'feBlend')
            if not b:
                why = 'R filter is not a 2-image feBlend (%s)' % (FB is not None and [tag(k) for k in FB])
            elif b['sr'] != a['sr']:
                why = 'blend sr != add sr'
        if why is None:
            if MA is None or not plain_mask(MA) or len(MA) != 1 or tag(MA[0]) != 'use' or set(MA[0].keys()) - {XL, 'href'}:
                why = 'Ma shape'
            else:
                ok, w = extents_group_opaque_over(ids.get(href(MA[0])), a['sr'])
                if not ok:
                    why = 'Ma not opaque over sr: ' + w
        if why is None:
            # L = <g mask=Mb> ... ; Mb = <mask><use href=#E2 filter=url(#INV)/></mask>, E2 opaque over sr -> Mb == 0 on sr
            if tag(L) != 'g' or set(L.keys()) != {'id', 'mask'}:
                why = 'L shape %s' % sorted(L.keys())
            else:
                MB = ids.get(urlref(L.get('mask')))
                if MB is None or not plain_mask(MB) or len(MB) != 1 or tag(MB[0]) != 'use' or set(MB[0].keys()) - {XL, 'href', 'filter'}:
                    why = 'Mb shape'
                else:
                    INV = ids.get(urlref(MB[0].get('filter')))
                    ik = list(INV) if INV is not None else []
                    if not (INV is not None and filter_region_default(INV) and len(ik) == 1 and tag(ik[0]) == 'feColorMatrix'
                            and ik[0].get('color-interpolation-filters') == 'sRGB'
                            and [float(v) for v in ik[0].get('values', '').split()] == INV_VALUES):
                        why = 'Mb filter not invert-alpha'
                    else:
                        ok, w = extents_group_opaque_over(ids.get(href(MB[0])), a['sr'])
                        if not ok:
                            why = 'Mb source not opaque over sr: ' + w
        if why:
            out['rejected'][fid] = why
            continue
        users = refs.get(fid, [])
        info = {'blend': urlref(R.get('filter')), 'mode': b['op'].get('mode'), 'sr': a['sr'],
                'users': len(users), 'userTags': sorted({tag(u) for u in users}),
                'Ldst_eq_blend_dst': [href(k) for k in L] == [b['dst']]}
        out['collapse'][fid] = info
    return out


def main():
    src, dst = sys.argv[1], sys.argv[2]
    raw = open(src, 'rb').read()
    root = ET.fromstring(raw)
    res = analyse(root)
    text = raw
    nsub = 0
    for fa, info in res['collapse'].items():
        old = b'filter="url(#%s)"' % fa.encode()
        new = b'filter="url(#%s)"' % info['blend'].encode()
        c = text.count(old)
        if c != info['users']:
            raise SystemExit('count mismatch for %s: bytes %d parse %d' % (fa, c, info['users']))
        text = text.replace(old, new)
        nsub += c
    modes = {}
    for info in res['collapse'].values():
        modes[info['mode']] = modes.get(info['mode'], 0) + 1
    rep = {'file': src, 'addFilters': res['add'], 'collapsed': len(res['collapse']), 'useSitesRewritten': nsub,
           'rejected': res['rejected'], 'modes': modes,
           'usersPerCollapsed': sorted({i['users'] for i in res['collapse'].values()}),
           'userTags': sorted({t for i in res['collapse'].values() for t in i['userTags']}),
           'L_dst_mismatch': [k for k, i in res['collapse'].items() if not i['Ldst_eq_blend_dst']],
           'srs': sorted({i['sr'] for i in res['collapse'].values()}),
           'collapsedIds': sorted(res['collapse'], key=lambda s: int(s.split('-')[1]))}
    if dst != '-':
        open(dst, 'wb').write(text)
    if '--report' in sys.argv:
        json.dump(rep, open(sys.argv[sys.argv.index('--report') + 1], 'w'), indent=1)
    short = dict(rep); short.pop('collapsedIds'); short['rejected'] = {k: v[:90] for k, v in rep['rejected'].items()}
    print(json.dumps(short))


if __name__ == '__main__':
    main()
