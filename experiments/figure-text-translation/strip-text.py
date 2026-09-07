#!/usr/bin/env python3
"""Stage 2 - remove every BT..ET block, drop the embedded Illustrator private data,
and render the artwork alone.  Produces out/artwork.pdf and out/artwork.png.

Stripping text in the PDF is what makes this safe: the English is a separate object
that simply is not drawn.  Erasing it from the published raster instead would mean
inpainting pixels.

Text is NOT only in the page content stream.  Illustrator routinely puts it inside
/Form XObjects, and 274 of 895 chemistry vectors keep ALL of theirs there - stripping
the page alone leaves the English drawn underneath the translation.  So the walk
descends into every reachable /Form, recursively.

    FIGTEXT_PYLIBS=./pylibs python3 strip-text.py ~/path/figure.pdf [--dpi 200]
"""
import sys, re, subprocess
import _deps
from _deps import read_content
from _deps import OUT
import pikepdf

DEFAULT_DPI = 200   # the DPI at which OpenStax rendered the published jpg

BT_BLOCK = re.compile(rb'BT.*?ET', re.S)   # NON-greedy: artwork drawn BETWEEN two text
                                           # blocks must survive.  `BT.*ET` erases it.


def strip_text(pdf):
    """Remove every BT..ET block from page 1's content stream AND from every /Form
    XObject reachable from it.  Mutates `pdf` in place; writes nothing to disk.

    -> {'page_before': int, 'page_after': int,
        'forms_visited': int, 'forms_rewritten': int}

    🔴 A form's stream is rewritten with `Stream.write()`, which mutates the EXISTING
    object and keeps its dictionary.  NEVER `pdf.make_stream()`: that mints a stream
    carrying only /Length, so assigning it over an XObject discards /Subtype /Form,
    /BBox, /Matrix, /Resources and /Group - and the artwork stops being drawn.
    Measured on CNX_Chem_02_01_Dalton10_img at 200 dpi: 435 non-white pixels against
    8,927.  The figure is erased, and it still contains no BT, so a test that checks
    only for leftover text passes on the wreckage.  (Ruling R-9.)

    The page's own /Contents is a different case and `make_stream` is correct there:
    a content stream's dictionary legitimately holds nothing but /Length, and
    read_content() has already concatenated the array form into one buffer.

    Every reachable form is rewritten, not only the ones whose bytes change.  Measured
    against a skip-if-unchanged rule over 60 figures: 0 differ in rendered pixels and 0
    in extracted text; 7 differ in BYTES, because re-writing a stream drops the original
    /Filter and pikepdf recompresses on save.  So the two rules are observationally
    equivalent to a reader but NOT byte-identical - do not claim they are.
    Rewriting always is preferred because it keeps the R-9 protection live on real
    artwork: on this corpus the forms that DRAW carry no text and the text sits in
    sibling forms, so under skip-if-unchanged the destructive path is never reached and
    no test on a real figure could see a regression back to make_stream.
    """
    page = pdf.pages[0]
    content = read_content(page)
    stripped = BT_BLOCK.sub(b'', content.encode('latin-1'))
    page.Contents = pdf.make_stream(stripped)

    seen = set()
    stats = {'page_before': len(content.encode('latin-1')), 'page_after': len(stripped),
             'forms_visited': 0, 'forms_rewritten': 0}

    def walk(res):
        xobjects = res.get('/XObject')
        if xobjects is None:
            return
        for _name, xobj in xobjects.items():
            if str(xobj.get('/Subtype', '')) != '/Form':
                continue
            if not isinstance(xobj, pikepdf.Stream):
                continue
            # A form can be referenced from several places and the reference graph can
            # contain a cycle, which an unguarded recursive walk never leaves.  Measured
            # nesting depth in this corpus is 1; the guard does not assume that.
            objgen = xobj.objgen
            if objgen in seen:
                continue
            seen.add(objgen)
            stats['forms_visited'] += 1
            old = xobj.read_bytes()
            new = BT_BLOCK.sub(b'', old)
            xobj.write(new)                      # IN PLACE - see R-9 above
            if new != old:
                stats['forms_rewritten'] += 1
            sub = xobj.get('/Resources')
            if sub is not None:
                walk(sub)

    res = pikepdf.Page(page).obj.get('/Resources')
    if res is not None:
        walk(res)
    return stats


def main(pdf_path, dpi=DEFAULT_DPI):
    OUT.mkdir(exist_ok=True)
    pdf = pikepdf.open(pdf_path)
    page = pdf.pages[0]
    stats = strip_text(pdf)
    print(f"content stream: {stats['page_before']} -> {stats['page_after']} bytes")
    print(f"form XObjects: {stats['forms_visited']} visited, "
          f"{stats['forms_rewritten']} contained text")

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
