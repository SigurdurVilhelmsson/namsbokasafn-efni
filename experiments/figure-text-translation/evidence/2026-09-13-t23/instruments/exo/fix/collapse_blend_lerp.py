# SPIKE (exocytosis load) — collapse cairo's redundant clip-lerp around each blend-mode paint.
# cairo's SVG surface paints a non-Normal blend mode (PDF /BM Multiply, Screen, ...) as
#   result = add( blend(S, D) masked by Ma ,  D masked by (1 - Ma) )       [feComposite k2=1 k3=1]
# where Ma is the clip coverage and D is "everything painted on this surface so far".
# The next paint's D contains this result, so D is referenced TWICE per paint and a page with
# N blend paints is a 2^N reference tree; Chromium's <img> never finishes CNX_Chem_03_01_exocytosis-88f6
# (158 paints). When Ma is an opaque rect covering the whole filter region (no clip), the second
# term is exactly 0 and the first is exactly blend(S, D) over that region, so the use site
#   <g filter="url(#F_add)" ...>   can point at   <g filter="url(#F_blend)" ...>   directly.
# That is a ONE-DIGIT edit per paint (F_blend is always F_add - 1 in cairo's numbering, but we
# resolve it, never assume it). Paints under a real clip (Ma not a full rect) are LEFT ALONE and COUNTED.
import re as _re

_ADD = _re.compile(
    r'<filter id="(filter-\d+)" x="0%" y="0%" width="100%" height="100%">\n'
    r'<feImage xlink:href="#(compositing-group-\d+)" result="source" x="0" y="0" width="([\d.]+)" height="([\d.]+)"/>\n'
    r'<feImage xlink:href="#(compositing-group-\d+)" result="destination" x="0" y="0" width="\3" height="\4"/>\n'
    r'<feComposite in="source" in2="destination" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" color-interpolation-filters="sRGB"/>\n'
    r'</filter>')
_BLEND = r'<filter id="%s" x="0%%" y="0%%" width="100%%" height="100%%">\n' \
         r'<feImage xlink:href="#(compositing-group-\d+)" result="source" x="0" y="0" width="%s" height="%s"/>\n' \
         r'<feImage xlink:href="#(compositing-group-\d+)" result="destination" x="0" y="0" width="%s" height="%s"/>\n' \
         r'<feBlend in="source" in2="destination" mode="(\w[\w-]*)" color-interpolation-filters="sRGB"/>\n</filter>'


def collapse_blend_lerp(text):
    rep = {'addOps': 0, 'collapsed': 0, 'useSitesRewritten': 0, 'clipped': [], 'unmatched': [], 'modes': {}}
    edits = {}
    for m in _ADD.finditer(text):
        fa, R, W, H, L = m.group(1), m.group(2), m.group(3), m.group(4), m.group(5)
        rep['addOps'] += 1
        r = _re.search(r'<g id="%s" filter="url\(#(filter-\d+)\)" mask="url\(#(mask-\d+)\)">\n'
                       r'<rect x="0" y="0" width="%s" height="%s" fill="rgb\(0%%, 0%%, 0%%\)" fill-opacity="1"/>\n</g>'
                       % (R, _re.escape(W), _re.escape(H)), text)
        l = _re.search(r'<g id="%s" mask="url\(#(mask-\d+)\)">\n<use xlink:href="#(compositing-group-\d+)"/>\n</g>' % L, text)
        if not (r and l):
            rep['unmatched'].append(fa); continue
        fb, ma = r.group(1), r.group(2)
        mb, D = l.group(1), l.group(2)
        b = _re.search(_BLEND % ((fb,) + (_re.escape(W), _re.escape(H)) * 2), text)
        mua = _re.search(r'<mask id="%s">\n<use xlink:href="#(compositing-group-\d+)"/>\n</mask>' % ma, text)
        mub = mua and _re.search(r'<mask id="%s">\n<use xlink:href="#%s" filter="url\(#filter-remove-color-and-invert-alpha\)"/>\n</mask>'
                                 % (mb, mua.group(1)), text)
        if not (b and b.group(2) == D and mua and mub):
            rep['unmatched'].append(fa); continue
        g = _re.search(r'<g id="%s" transform="translate\((-?[\d.]+), (-?[\d.]+)\)">\n'
                       r'<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="%s" height="%s" fill="rgb\(0%%, 0%%, 0%%\)" fill-opacity="0"/>\n'
                       r'<rect x="\3" y="\4" width="%s" height="%s" fill="rgb\(100%%, 100%%, 100%%\)" fill-opacity="1"/>\n</g>'
                       % ((mua.group(1),) + (_re.escape(W), _re.escape(H)) * 2), text)
        if not (g and abs(float(g.group(1)) + float(g.group(3))) < 1e-9 and abs(float(g.group(2)) + float(g.group(4))) < 1e-9):
            rep['clipped'].append(fa); continue      # Ma is a real clip: the D-term is not zero; leave cairo's lerp
        edits[fa] = fb
        rep['collapsed'] += 1
        rep['modes'][b.group(3)] = rep['modes'].get(b.group(3), 0) + 1
    if edits:
        def sub(mm):
            rep['useSitesRewritten'] += 1
            return '<g filter="url(#%s)"' % edits[mm.group(1)]
        text = _re.sub(r'<g filter="url\(#(%s)\)"' % '|'.join(map(_re.escape, edits)), sub, text)
    return text, rep
