#!/usr/bin/env python3
"""Stage 2 - remove every BT..ET block, drop the embedded Illustrator private data,
and render the artwork alone.  Produces out/artwork.pdf and out/artwork.png.

Stripping text in the PDF is what makes this safe: the English is a separate object
that simply is not drawn.  Erasing it from the published raster instead would mean
inpainting pixels.

    FIGTEXT_PYLIBS=./pylibs python3 strip-text.py ~/path/figure.pdf [--dpi 200]
"""
import sys, re, subprocess
import _deps
from _deps import read_content
from _deps import OUT
import pikepdf

DEFAULT_DPI = 200   # the DPI at which OpenStax rendered the published jpg


def main(pdf_path, dpi=DEFAULT_DPI):
    OUT.mkdir(exist_ok=True)
    pdf = pikepdf.open(pdf_path)
    page = pdf.pages[0]
    content = read_content(page)
    stripped = re.sub(r'BT.*?ET', '', content, flags=re.S)
    print(f"content stream: {len(content)} -> {len(stripped)} bytes")

    page.Contents = pdf.make_stream(stripped.encode('latin-1'))
    for k in ('/PieceInfo', '/LastModified', '/Metadata', '/Thumb'):
        if k in page.obj:
            del page.obj[k]
    pdf.remove_unreferenced_resources()
    out_pdf = OUT / 'artwork.pdf'
    pdf.save(out_pdf)

    import os
    print(f"artwork.pdf: {os.path.getsize(out_pdf)} bytes "
          f"(source {os.path.getsize(pdf_path)})")
    subprocess.run(['pdftocairo', '-png', '-r', str(dpi), '-singlefile',
                    str(out_pdf), str(OUT / 'artwork')], check=True)
    print(f"artwork.png at {dpi} dpi -> out/artwork.png")


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    dpi = int(sys.argv[sys.argv.index('--dpi') + 1]) if '--dpi' in sys.argv else DEFAULT_DPI
    main(sys.argv[1], dpi)
