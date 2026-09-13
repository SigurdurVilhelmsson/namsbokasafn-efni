"""EXPERIMENT (2a residuals): rebuild the source PDF's OWN embedded STIXGeneral subset (FontFile3 = bare CFF)
into a web-loadable OTF, so symbol-font runs can be drawn in their real face instead of Liberation.
STIX fonts are SIL OFL 1.1. Advance widths come from the PDF font's /Widths (what positioned the text)."""
import io, sys
from pathlib import Path
import pikepdf
from fontTools.cffLib import CFFFontSet
from fontTools.ttLib import TTFont
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.agl import toUnicode

def embedded_stix(pdf_path):
    """The (single) STIX font object anywhere in the PDF, including inside Form XObjects.
    Returns (BaseFont, cff bytes, FirstChar, Widths, {code: glyph name from /Differences})."""
    pdf = pikepdf.open(pdf_path)
    for o in pdf.objects:
        if isinstance(o, pikepdf.Dictionary) and o.get('/Type') == '/Font' and 'STIX' in str(o.get('/BaseFont')):
            fd = o['/FontDescriptor']
            diffs = {}
            enc = o.get('/Encoding')
            if isinstance(enc, pikepdf.Dictionary) and '/Differences' in enc:
                code = None
                for x in enc['/Differences']:
                    if isinstance(x, pikepdf.Name):
                        diffs[code] = str(x)[1:]; code += 1
                    else:
                        code = int(x)
            return (str(o['/BaseFont']), fd['/FontFile3'].read_bytes(), int(o['/FirstChar']),
                    [float(w) for w in o['/Widths']], diffs)
    return None

def build_otf(cff_bytes, first, widths, family='FigSTIX', diffs=None):
    tt = TTFont()
    cs = CFFFontSet(); cs.decompile(io.BytesIO(cff_bytes), tt)
    top = cs[cs.fontNames[0]]
    fm = getattr(top, 'FontMatrix', [0.001, 0, 0, 0.001, 0, 0])
    assert abs(fm[0] - 0.001) < 1e-9 and abs(fm[3] - 0.001) < 1e-9, fm
    order = list(top.charset)
    # width by glyph name via WinAnsi code -> AGL name; fall back to charstring width
    from fontTools.encodings.codecs import search_function  # noqa
    import codecs
    wmap = {}
    for i, w in enumerate(widths):
        code = first + i
        if diffs and code in diffs:
            wmap[diffs[code]] = w; continue
        try:
            ch = bytes([code]).decode('cp1252')
        except Exception:
            continue
        for g in order:
            if toUnicode(g) == ch:
                wmap[g] = w
    gs = top.CharStrings
    charstrings, metrics, cmap = {}, {}, {}
    for g in order:
        c = gs[g]
        bp = BoundsPen(None); c.draw(bp)
        w = wmap.get(g, 0 if g == '.notdef' else 500)
        pen = T2CharStringPen(w, None); c.draw(pen)
        charstrings[g] = pen.getCharString()
        metrics[g] = (int(round(w)), int(bp.bounds[0]) if bp.bounds else 0)
        u = toUnicode(g)
        if u and len(u) == 1:
            cmap[ord(u)] = g
    fb = FontBuilder(1000, isTTF=False)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupCFF(family + '-Regular', {'FullName': family}, charstrings, {})
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=900, descent=-300)
    fb.setupNameTable({'familyName': family, 'styleName': 'Regular'})
    fb.setupOS2(sTypoAscender=900, sTypoDescender=-300, usWinAscent=900, usWinDescent=300)
    fb.setupPost()
    buf = io.BytesIO(); fb.font.save(buf)
    return buf.getvalue(), {g: (metrics[g], toUnicode(g)) for g in order}

if __name__ == '__main__':
    base, cff, first, widths, diffs = embedded_stix(sys.argv[1])
    otf, info = build_otf(cff, first, widths, diffs=diffs)
    Path(sys.argv[2]).write_bytes(otf)
    print(base, len(cff), 'cff bytes ->', len(otf), 'otf bytes', info)
