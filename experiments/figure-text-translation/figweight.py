"""
§C168 — decide whether a composed figure is published as VECTOR or as a
RASTER-ARTWORK + LIVE-TEXT SVG.

🔴 WHY. The composed vector SVGs have a short, heavy tail: 1,066 distinct figures,
median 98 KB, and the top dozen hold about half of all bytes. The worst,
`CNX_Chem_12_07_HetCats-230a_IS.svg`, is 63.4 MB and — because base64'd raster
tiles do not compress — costs a reader **28.0 MB** at the gzip level production
nginx actually uses, against ~7.35 MB for a same-sized pure-vector figure.

✅ THE REMEDY NEEDS NO NEW MACHINERY AND HAS A DEPLOYED POSITIVE CONTROL.
`compose.py` already writes `translated.png` on every run; the vector arm sits
behind `if SVG:`. And a raster-artwork + live-text SVG of this exact figure
already renders on the live site at **266,465 bytes — 211x smaller** — with its
translated text still selectable, searchable and re-editable.
`.../Myndir/chemistry-2e/base/Ch_10/Translated_IS/SVG/CNX_Chem_10_01_KMTPhases1_IS.svg`.

🔴 THE ARTWORK IS TEXT-FREE, WHICH IS WHAT MAKES THIS SAFE. `strip-text.py` makes
`artwork.svg`/`artwork.png` with `pdftocairo` from a page whose text has been
removed, so rasterising the artwork cannot bake an English label into the picture.
The Icelandic is drawn afterwards as live `<text>`, exactly as in the vector arm.

⚠️ THREE MECHANISMS MAKE A FIGURE HEAVY, AND A COUNT OF ONE MISSES THE OTHERS.
Measured over the corpus:
  path soup    KMTPhases1  93,289 vector elements,      0 tiles, 53.5 MB
  tile soup    sandwich     1,192 vector elements,  5,800 tiles, 18.8 MB
  path DATA    exocytosis   5,809 vector elements,     37 tiles, 23.8 MB
The third is the one an element count cannot see: few elements, enormous
coordinate strings. ▶ So SIZE is the necessary condition — it is also what a
reader actually pays — and the mechanism counters are reported alongside so the
verdict is explicable and can be refined later.

⚠️ AND A SMALL FIGURE IS NOT WORTH RASTERISING WHATEVER ITS MECHANISM.
`HPerDcmp` has 929 tiles in 1.1 MB and `Electrolys` 524 in 0.9 MB; converting
those trades crispness for nothing.

🔴 THE THRESHOLD IS PROVISIONAL AND SAYS SO. The 2026-09-21 investigation named
one measurement nobody has run — how long a browser takes to PAINT these figures —
and said it may change the gate from a byte count to an element count. Until then
this is set conservatively, to the clear tail only. Revisit with that measurement;
do not treat the number as settled.
"""

import re

#: Publish as raster above this many bytes of composed vector SVG. PROVISIONAL —
#: see the module docstring. 8 MB catches the ~18 figures that dominate the tail
#: while leaving the 1,000+ ordinary figures untouched.
RASTER_BYTES_MIN = 8 * 1024 * 1024

#: DOM backstops: a figure can be painful to paint without being huge on disk.
#: Both sit well above the corpus p99 (vector elements 20,991; tiles 317).
RASTER_VECTOR_ELEMENTS_MIN = 25_000
RASTER_TILES_MIN = 2_000

_PATH = re.compile(r'<path\b')
_CLIP = re.compile(r'<clipPath\b')
_IMAGE = re.compile(r'<image\b')


def measure(svg_text):
    """Mechanism counters for a composed or artwork SVG."""
    return {
        'bytes': len(svg_text.encode('utf-8')),
        'paths': len(_PATH.findall(svg_text)),
        'clipPaths': len(_CLIP.findall(svg_text)),
        'tiles': len(_IMAGE.findall(svg_text)),
    }


def should_rasterise(svg_text):
    """
    -> (bool, metrics, reason)

    `reason` names the mechanism that fired, so a verdict is never a bare
    boolean: an operator reading the log can tell path soup from tile soup from
    path data, and a later refinement has the evidence it needs.
    """
    m = measure(svg_text)
    vec = m['paths'] + m['clipPaths']
    m['vectorElements'] = vec
    if m['bytes'] >= RASTER_BYTES_MIN:
        if vec >= RASTER_VECTOR_ELEMENTS_MIN:
            why = f'path soup ({vec:,} vector elements)'
        elif m['tiles'] >= RASTER_TILES_MIN:
            why = f'tile soup ({m["tiles"]:,} raster tiles)'
        else:
            why = f'path data ({vec:,} elements but {m["bytes"] / 1048576:.1f} MB)'
        return True, m, f'{m["bytes"] / 1048576:.1f} MB — {why}'
    if vec >= RASTER_VECTOR_ELEMENTS_MIN:
        return True, m, f'{vec:,} vector elements (DOM backstop, {m["bytes"] / 1048576:.1f} MB)'
    if m['tiles'] >= RASTER_TILES_MIN:
        return True, m, f'{m["tiles"]:,} raster tiles (DOM backstop, {m["bytes"] / 1048576:.1f} MB)'
    return False, m, f'{m["bytes"] / 1048576:.1f} MB, {vec:,} elements, {m["tiles"]:,} tiles — vector'
