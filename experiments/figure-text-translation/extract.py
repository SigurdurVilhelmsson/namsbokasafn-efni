#!/usr/bin/env python3
"""Stage 1 - read an OpenStax figure PDF, emit positioned text runs to out/runs.json.

    FIGTEXT_PYLIBS=./pylibs python3 extract.py ~/path/CNX_Chem_01_01_SciMethod.pdf

The reading itself lives in `readlayer.py`; this is the CLI and the on-disk seam.
`emit-blocks.py` spawns this as a subprocess and then reads out/runs.json, so that
boundary is unchanged by the swap — which is what answers the contract's
library-vs-subprocess question.

An .eps/.ai argument is staged through ghostscript by `readlayer.read` itself, and
`meta['source']` names the ORIGINAL file, not the temporary PDF.
"""
import sys, json
import _deps
from _deps import OUT
from readlayer import read


# A subset font carries only the glyphs the figure actually draws, so it has no Icelandic
# letters and the composer must substitute a full system font. TWO signals, because the
# original one does not exist on every font:
#   - a simple font declares /LastChar, and a low one means a narrow encoding;
#   - a /Type0 font carries /W instead and has NO /FirstChar or /LastChar at all. That is
#     precisely what made the old reader raise `AttributeError: /FirstChar` on all 8 type0
#     figures, so `last` is None for them and the test below must not compare it to a
#     number. The remaining signal is the 'ABCDEF+' subset prefix on the BaseFont.
SUBSET_LAST = 200


def is_subset(entry):
    last = entry.get('last')
    if last is not None:
        return last < SUBSET_LAST
    base = (entry.get('base') or '').lstrip('/')
    return len(base) > 7 and base[6] == '+' and base[:6].isalpha() and base[:6].isupper()


def main(pdf_path):
    OUT.mkdir(exist_ok=True)
    runs, meta, outcome = read(pdf_path)

    (OUT / 'runs.json').write_text(json.dumps(runs, indent=1, ensure_ascii=False))
    (OUT / 'meta.json').write_text(json.dumps(meta, indent=1, ensure_ascii=False))

    print(f"fonts: {json.dumps(meta['fonts'], indent=1)}")
    print(f"page:  {meta['page'][0]} x {meta['page'][1]} pt")
    print(f"runs:  {len(runs)}  ({outcome}, {meta['chars']} chars)  -> out/runs.json")
    if meta.get('staged'):
        print(f"       staged through ghostscript from {meta['source']}")

    undecodable = [k for k, v in meta['fonts'].items() if v.get('decodable') is False]
    if undecodable:
        print(f"\n!! fonts whose bytes could not be decoded to Unicode: {undecodable}")
        print("   their text is NOT translatable and must not be sent to the MT.")

    # R-12: a zero here would be a count from a blind instrument, so it is only printed
    # when it fires — and it is printed as a caveat on the FILLS, not as an error.
    if meta.get('color_warnings'):
        print(f"\n!! pdfminer could not parse {meta['color_warnings']} colour operand(s); "
              f"fills on this figure are unreliable.")
        print(f"   {meta['color_warning_note']}")

    if meta.get('unscoped_fonts'):
        print(f"\n!! fonts used but not found in any /Resources: "
              f"{meta['unscoped_fonts']}")

    if meta.get('unknown_colorspaces'):
        print(f"\n!! unrecognised colour spaces: {meta['unknown_colorspaces']}")

    sub = [f for f, d in meta['fonts'].items() if is_subset(d)]
    if sub:
        print(f"\n!! subset fonts (no Icelandic glyphs): {sub}")
        print("   the composer substitutes the full system font instead.")


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1])
