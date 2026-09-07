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
import sys, subprocess
import _deps
from _deps import read_content
from _deps import OUT
import pikepdf

DEFAULT_DPI = 200   # the DPI at which OpenStax rendered the published jpg

class UnparsableStream(Exception):
    """A stream this tool cannot tokenise. RAISED, never worked around.

    A strip that cannot parse must not WRITE: falling back to a byte regex is what this
    class exists to prevent, and a partial strip on artwork is unrecoverable (the source
    PDF is READ-ONLY, but the composed raster is what readers get).
    """


def strip_text_ops(source):
    """Remove every BT..ET text object from one content stream, TOKEN-AWARE.

    `source` is a `pikepdf.Stream` (a /Form XObject), a `pikepdf.Page`, or raw `bytes`.
    -> (new_bytes, blocks_removed)

    ⚠️ `pikepdf.parse_content_stream` DOES NOT ACCEPT BYTES — it raises
    `TypeError: stream must be a pikepdf.Object or pikepdf.Page`. Bytes are wrapped in a
    throwaway Pdf rather than parsed via the real page, because `_deps.read_content` is
    what handles a /Contents ARRAY (several streams the viewer concatenates), and that
    handling is load-bearing: a reader that takes only the first element silently reports
    perfectly good figures as unreadable. Wrapping keeps that one owner.

    🔴 THIS REPLACES `re.compile(rb'BT.*?ET', re.S)`, AND THE REASON IS THE REPO'S OWN
    DURABLE RULE ABOUT FINDING THE END OF A TAG WITH A BYTE SCAN — here applied to the
    START of the match, which is the direction that destroys artwork. `BT` are two
    ordinary bytes and they occur inside the FLATE PAYLOAD of an inline image
    (`BI … ID <binary> EI`). The non-greedy match then runs forward to the next REAL `ET`,
    deleting the image's tail, its `EI`, and every drawing operator in between.

    Measured over all 817 in-scope figures: 8 such matches on 6 `.eps` figures. Artwork
    cost against a syntax-aware strip removing the SAME text spans —
    CNX_Chem_09_03_BoylesLaw1 **147,074 non-white pixels, 53.9% of the drawing** (the
    pressure gauge and BOTH Boyle's-law graphs; only the syringe barrel survives),
    Testtubeoi_img 9.5%, osmosis 6.4%, WaterVapor 10.1%, VapPress1 0.8%.

    🔴 AND EVERY TEXT-BASED CHECK PASSES ON THAT WRECKAGE. `pdftotext` returns 0 words on
    both arms, so a BT-residue count and a word-count oracle both read clean — this
    module's own R-9 docstring says exactly that about the `make_stream` failure ("The
    figure is erased, and it still contains no BT"), and the same blindness applied to its
    own regex. Worse, `test_readlayer.py`'s checker counted with the IDENTICAL pattern, so
    the two sides derived from one token and the check could not see damage to its own
    anchor.

    ⚠️ A `\b`-STYLE TOKEN BOUNDARY IS NOT A SUFFICIENT FIX and must not be substituted for
    this: `CNX_Chem_11_04_osmosis` carries 7.7 MB of binary payload, in which a
    token-LOOKING `BT` occurs by chance. Only skipping the payload works, which means
    tokenising.

    The mirror case is real but INERT, and is fixed here for free: a literal `(...)`
    string containing the bytes `ET` closes a byte-level match EARLY, leaving `) Tj ET`
    behind. That removes a SUBSET of the true span, so it can never eat artwork — measured
    0 occurrences in this corpus — but it leaves malformed content in the stream.
    """
    # ⚠️ `owner` MUST BE A NAMED LOCAL. `pikepdf.new().make_stream(...)` inline drops the
    # only reference to the Pdf the moment the expression ends, and the stream dies with
    # it: `ValueError: ... cannot get key '/Type' on object of type destroyed`, raised
    # from inside the parse. Binding it keeps it alive until this function returns.
    owner = None
    if isinstance(source, (bytes, bytearray)):
        owner = pikepdf.new()
        source = owner.make_stream(bytes(source))
    ops = list(pikepdf.parse_content_stream(source))
    out, depth, removed = [], 0, 0
    for instruction in ops:
        # An inline image is its own instruction, so its payload is never scanned for
        # operators at all — which is the whole point.
        if isinstance(instruction, pikepdf.ContentStreamInlineImage):
            if depth == 0:
                out.append(instruction)
            continue
        op = str(instruction.operator)
        if op == 'BT':
            # DEPTH, not a boolean: BT..ET does not nest in valid PDF, but a malformed
            # stream that opens twice must not be closed by the first ET and drop the
            # rest of the text object back into the output.
            depth += 1
            removed += 1
            continue
        if op == 'ET':
            depth = max(0, depth - 1)
            continue
        if depth == 0:
            out.append(instruction)
    result = pikepdf.unparse_content_stream(out)
    del owner            # explicit: nothing below may reference the throwaway Pdf
    return result, removed


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
    ⚠️ SINCE THE STRIP BECAME TOKEN-AWARE, **NO** STREAM IS BYTE-IDENTICAL ANY MORE, EVEN
    WHERE NOTHING IS REMOVED: `parse_content_stream` -> `unparse_content_stream` is a
    re-SERIALISATION, so number formatting and whitespace are pikepdf's rather than the
    producer's.  That is why the fix ships with a serialiser control - an unfiltered
    parse/unparse round trip must render pixel-identically - because "the bytes changed"
    can no longer be read as "something was removed".
    Rewriting always is preferred because it keeps the R-9 protection live on real
    artwork: on this corpus the forms that DRAW carry no text and the text sits in
    sibling forms, so under skip-if-unchanged the destructive path is never reached and
    no test on a real figure could see a regression back to make_stream.
    """
    page = pdf.pages[0]
    content = read_content(page).encode('latin-1')
    try:
        stripped, _n = strip_text_ops(content)
    except Exception as exc:
        raise UnparsableStream(
            f'page content stream: {type(exc).__name__}: {exc}') from exc
    page.Contents = pdf.make_stream(stripped)

    seen = set()
    stats = {'page_before': len(content), 'page_after': len(stripped),
             'forms_visited': 0, 'forms_rewritten': 0, 'unparsable': []}

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
            # nesting depth in this corpus reaches 3 - the branch's own R-9 artwork
            # fixture is one of them, and 64 of 817 in-scope figures nest deeper than 1 -
            # so the guard is load-bearing, not defensive.  (This comment said "measured
            # nesting depth in this corpus is 1" until 2026-09-07; it was wrong, and the
            # only reason it cost nothing is that the guard never believed it.)
            objgen = xobj.objgen
            if objgen in seen:
                continue
            seen.add(objgen)
            stats['forms_visited'] += 1
            old = xobj.read_bytes()
            try:
                new, _n = strip_text_ops(old)
            except Exception as exc:
                # NAMED and re-raised at the end, never skipped: a form we could not
                # tokenise is a form whose English may still be drawn under the
                # translation.  Writing the rest and saying nothing is the failure this
                # whole tool exists to avoid.
                stats['unparsable'].append(f'{objgen}: {type(exc).__name__}: {exc}')
                continue
            xobj.write(new)                      # IN PLACE - see R-9 above
            if new != old:
                stats['forms_rewritten'] += 1
            sub = xobj.get('/Resources')
            if sub is not None:
                walk(sub)

    res = pikepdf.Page(page).obj.get('/Resources')
    if res is not None:
        walk(res)
    if stats['unparsable']:
        raise UnparsableStream(
            f"{len(stats['unparsable'])} /Form stream(s) could not be tokenised, so their "
            f"text was NOT removed: {stats['unparsable'][:3]}")
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
