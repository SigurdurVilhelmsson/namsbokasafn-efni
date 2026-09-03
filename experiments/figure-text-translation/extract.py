#!/usr/bin/env python3
"""Stage 1 - read an OpenStax figure PDF, emit positioned text runs to out/runs.json.

    FIGTEXT_PYLIBS=./pylibs python3 extract.py ~/path/CNX_Chem_01_01_SciMethod.pdf
"""
import sys, json
import _deps
from _deps import read_content
from _deps import OUT
import pikepdf
from pdftext import parse


def main(pdf_path):
    OUT.mkdir(exist_ok=True)
    pdf = pikepdf.open(pdf_path)
    page = pdf.pages[0]
    content = read_content(page)

    widths, fontmap = {}, {}
    for name, fobj in page.Resources.Font.items():
        first = int(fobj.FirstChar)
        ws = [float(w) for w in fobj.Widths]
        key = '/' + str(name).lstrip('/')
        widths[key] = {first + i: w / 1000.0 for i, w in enumerate(ws)}
        fontmap[key] = dict(base=str(fobj.BaseFont), first=first,
                            last=int(fobj.LastChar), subtype=str(fobj.Subtype),
                            encoding=str(fobj.get('/Encoding', '')))

    runs = parse(content, widths)
    box = page.MediaBox
    meta = dict(source=str(pdf_path), fonts=fontmap,
                page=[float(box[2]), float(box[3])], runs=len(runs))
    (OUT / 'runs.json').write_text(json.dumps(runs, indent=1, ensure_ascii=False))
    (OUT / 'meta.json').write_text(json.dumps(meta, indent=1, ensure_ascii=False))

    print(f"fonts: {json.dumps(fontmap, indent=1)}")
    print(f"page:  {meta['page'][0]} x {meta['page'][1]} pt")
    print(f"runs:  {len(runs)}  -> out/runs.json")
    sub = [f for f, d in fontmap.items() if d['last'] < 200]
    if sub:
        print(f"\n!! subset fonts (no Icelandic glyphs): {sub}")
        print("   the composer substitutes the full system font instead.")


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1])
