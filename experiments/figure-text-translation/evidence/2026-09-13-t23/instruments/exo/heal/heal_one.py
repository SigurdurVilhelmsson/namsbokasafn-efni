import re as _re, base64 as _b64, io as _io
_MASK_RE = _re.compile(r'<mask id="(mask-\d+)">\n<g filter="url\(#filter-remove-color\)">\n'
                       r'<use xlink:href="#(source-\d+)"/>\n</g>\n</mask>')
_NUM = r'(-?[\d.]+)'


def heal_soft_mask_rings(text, only=None):
    from PIL import Image
    import numpy as np
    edits, rep = [], {'rasterMasks': 0, 'healed': 0, 'sidesHealed': 0,
                      'noClip': [], 'sharedImage': [], 'clipUncut': 0}
    for m in _MASK_RE.finditer(text):
        mid, sid = m.group(1), m.group(2)
        if only and mid != only: continue
        rep['rasterMasks'] += 1
        c = _re.search(r'<g clip-path="url\(#(clip-\d+)\)">\n<g mask="url\(#%s\)">' % mid, text)
        cp = c and _re.search(
            r'<clipPath id="%s">\n<path clip-rule="nonzero" d="M %s %s L %s %s L %s %s L %s %s Z'
            % ((c.group(1),) + (_NUM,) * 8), text)
        if not cp:
            rep['noClip'].append(mid)
            continue
        if len(_re.findall(r'href="#%s"' % sid, text)) != 1:
            rep['sharedImage'].append(sid)
            continue
        im = _re.search(r'<image id="%s" x="0" y="0" width="(\d+)" height="(\d+)" '
                        r'xlink:href="data:image/png;base64,([A-Za-z0-9+/=]+)"' % sid, text)
        w, h = int(im.group(1)), int(im.group(2))
        xs = [float(cp.group(i)) for i in (1, 3, 5, 7)]
        ys = [float(cp.group(i)) for i in (2, 4, 6, 8)]
        cut = {'left': min(xs) > 0, 'right': max(xs) < w, 'top': min(ys) > 0, 'bottom': max(ys) < h}
        if w < 3 or h < 3 or not any(cut.values()):
            rep['clipUncut'] += 1
            continue
        a = np.array(Image.open(_io.BytesIO(_b64.b64decode(im.group(3)))).convert('RGBA'))
        if cut['left']:   a[:, 0] = a[:, 1]
        if cut['right']:  a[:, -1] = a[:, -2]
        if cut['top']:    a[0, :] = a[1, :]
        if cut['bottom']: a[-1, :] = a[-2, :]
        buf = _io.BytesIO()
        Image.fromarray(a, 'RGBA').save(buf, 'PNG')
        edits.append((im.start(3), im.end(3), _b64.b64encode(buf.getvalue()).decode('ascii')))
        rep['healed'] += 1
        rep['sidesHealed'] += sum(cut.values())
    for s, e, new in sorted(edits, reverse=True):
        text = text[:s] + new + text[e:]
    return text, rep
