#!/usr/bin/env python3
"""§C140 ⑥a — the drawn text of composed figure SVGs, as data. Read-only.

    python3 textlist.py <svg> [<svg> ...]   -> JSON {path: {...}} on stdout

Per file: xml_ok (the whole file parses as XML), texts (every <text> in document order: text, x, y, size, weight,
style, fill, family), faces (every @font-face as family/weight/style, in order), metadata (a <metadata> element
exists), metadata_text (its text, or None).
"""
import json, re, sys
import xml.etree.ElementTree as ET

SVGNS = '{http://www.w3.org/2000/svg}'
FACE = re.compile(r"@font-face\{font-family:'([^']+)';font-weight:(\d+);font-style:(\w+);")


def one(path):
    data = open(path, 'rb').read()
    out = {'xml_ok': True, 'texts': [], 'faces': [], 'metadata': False, 'metadata_text': None}
    try:
        root = ET.fromstring(data)
    except ET.ParseError as exc:
        out['xml_ok'] = False
        out['error'] = str(exc)
        return out
    for el in root.iter():
        tag = el.tag.replace(SVGNS, '')
        if tag == 'text':
            a = el.attrib
            out['texts'].append(dict(text=el.text or '', x=a.get('x'), y=a.get('y'), size=a.get('font-size'),
                                     weight=a.get('font-weight'), style=a.get('font-style', 'normal'),
                                     fill=a.get('fill'), family=a.get('font-family')))
        elif tag == 'style':
            out['faces'] += [dict(family=f, weight=w, style=s) for f, w, s in FACE.findall(el.text or '')]
        elif tag == 'metadata':
            out['metadata'] = True
            out['metadata_text'] = el.text
    return out


if __name__ == '__main__':
    print(json.dumps({p: one(p) for p in sys.argv[1:]}, indent=1, ensure_ascii=False))
