#!/usr/bin/env python3
"""Regenerate fixtures/fixture_figure.pdf - the read-layer POSITIVE CONTROL.

    python3 make_fixture.py                 # -> fixtures/fixture_figure.pdf
    python3 make_fixture.py --out /tmp/x.pdf

Needs only pikepdf, which is system-installed; it deliberately imports NOTHING from
this experiment, so the generator cannot drift with the code it is a fixture for.

WHY A SYNTHETIC FIGURE AT ALL
-----------------------------
Every other test in this tree reads REAL artwork out of the machine-local trees named by
the gitignored `sources.local.json`. That is right for the fidelity questions - a
synthetic figure cannot tell you what OpenStax actually ships - but it makes a plain
"does the chain run end to end?" test impossible on a box without the artwork, and it
makes the numbers in such a test unpredictable. Precedent for a committed synthetic is
ruling R-7 (see test_readlayer.py case 14), which kept the `(cid:` detector against a
synthetic fixture once the real corpus stopped exercising it.

WHAT EACH PIECE IS FOR - do not "tidy" any of it away
----------------------------------------------------
* FOUR text blocks, of which exactly THREE are sendable. The fourth, `H2O (g)`, is held
  back by `figtext.looks_verbatim` (no run of 3+ letters), so the fixture exercises the
  spend gate rather than merely the reader. A fixture where every block is sendable makes
  `sendable == blocks` and the assertion stops being able to fail.
* The blocks sit 40pt apart with size 12. That is deliberate: `figtext.group`'s `nl` test
  and `figtext.merge_blocks` both join lines whose baselines differ by
  `size * 1.222` (14.66pt here) +/- 2.0, so a spacing anywhere in 12.7..16.7pt would
  silently merge four blocks into one. 40pt is far outside it in the safe direction.
* The font dictionary carries BOTH subset signals `extract.is_subset` knows about - a
  `/LastChar` below `SUBSET_LAST` (200) AND an `ABCDEF+` `/BaseFont` prefix - because real
  chemistry artwork carries both at once (measured: `/LWCEUZ+LiberationSans-Bold`,
  last=121). No embedded font PROGRAM is needed: `is_subset` reads the dictionary only.
* The `/FontDescriptor` is LOAD-BEARING. pdfminer reads `char['fontname']` from
  /FontDescriptor/FontName and falls back to the literal `'unknown'`, NOT to /BaseFont, so
  a font dictionary without one makes every run resolve through `readlayer.resolve_font`'s
  UNSCOPED fallback - the branch that exists so a broken file cannot silently break the
  runs/meta join. A fixture that fires it is testing the wrong path.
* `/Widths` is LOAD-BEARING, not decoration. pdfminer looks `/BaseFont` up in its built-in
  metrics database WITHOUT stripping the subset prefix, so `ABCDEF+Helvetica` misses and
  every advance would come from a default table. `char['adv']` is what `readlayer._continues`
  and `figtext.group` decide run and block boundaries with, so wrong widths change the
  block count.
* The rectangle and the rule are vector paint operations. They give the fixture a non-zero
  paint-op count and something for `pdftocairo` to draw, which the composition side needs;
  a text-only PDF renders as an empty page once the text is stripped.

DETERMINISM
-----------
`deterministic_id=True` makes qpdf derive /ID from the file's own content instead of the
clock, and nothing here writes a /Info date. Regenerating must produce byte-identical
output; `test_make_fixture.py` asserts it, and also re-measures 4/3 so the file still says
something if byte-identity ever turns out to be pikepdf-version-fragile on another box.
"""
import argparse
import sys
from pathlib import Path

import pikepdf

HERE = Path(__file__).resolve().parent          # never process.cwd() - repo rule
DEFAULT_OUT = HERE / 'fixtures' / 'fixture_figure.pdf'

N = pikepdf.Name

PAGE_W, PAGE_H = 300, 220
SIZE = 12
BASELINE_GAP = 40                                # >> SIZE * 1.222 + 2.0 - see the header

# Adobe's Helvetica AFM advance widths for WinAnsi codes 32..122, in 1/1000 em. Written
# out as a literal on purpose: deriving them from pdfminer at generation time would make
# the committed bytes depend on the installed pdfminer version.
FIRST_CHAR, LAST_CHAR = 32, 122
WIDTHS = [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
    1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
    333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
    556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500,
]

# (text, is_it_meant_to_be_bought). The flag is documentation, not input: the fixture
# does not tell the pipeline what to do with a block - `figtext.sendable` decides, and
# the test asserts it decided this way.
BLOCKS = [
    ('Observation and curiosity', True),
    ('Form a hypothesis', True),
    ('Test the hypothesis', True),
    ('H2O (g)', False),          # verbatim: no run of 3+ letters -> never bought
]

ARTWORK = (
    b'0.20 0.40 0.80 rg 10 190 80 16 re f\n'      # a filled rectangle
    b'0 0 0 RG 1 w 10 20 m 290 20 l S\n'          # a stroked rule
)


def _escape(text):
    """PDF literal-string escaping: backslash, then both parentheses."""
    out = text.replace('\\', r'\\').replace('(', r'\(').replace(')', r'\)')
    return out.encode('ascii')


def content_stream():
    parts = [ARTWORK]
    y = PAGE_H - 60
    for text, _send in BLOCKS:
        parts.append(b'BT /F1 %d Tf 10 %d Td (%s) Tj ET\n'
                     % (SIZE, y, _escape(text)))
        y -= BASELINE_GAP
    return b''.join(parts)


def build(dst):
    pdf = pikepdf.new()
    descriptor = pdf.make_indirect(pikepdf.Dictionary(
        Type=N('/FontDescriptor'),
        # MEASURED, not decoration: pdfminer reports `char['fontname']` from
        # /FontDescriptor/FontName and falls back to the literal string 'unknown' - NOT
        # to /BaseFont. Without this descriptor every run came back on
        # `UNSCOPED/unknown`, `meta['unscoped_fonts']` was {'UNSCOPED/unknown': 68} and
        # `fonts_unexercised` was 1, i.e. the fixture exercised the read layer's
        # never-should-fire fallback instead of its normal path.
        FontName=N('/ABCDEF+Helvetica'),
        Flags=32,                                # nonsymbolic
        FontBBox=pikepdf.Array([-166, -225, 1000, 931]),   # Helvetica's own
        ItalicAngle=0, Ascent=718, Descent=-207, CapHeight=718, StemV=88))
    font = pdf.make_indirect(pikepdf.Dictionary(
        Type=N('/Font'),
        Subtype=N('/Type1'),
        # Both subset signals at once, exactly as the real corpus carries them.
        BaseFont=N('/ABCDEF+Helvetica'),
        FirstChar=FIRST_CHAR,
        LastChar=LAST_CHAR,
        Widths=pikepdf.Array(WIDTHS),
        FontDescriptor=descriptor,
        Encoding=N('/WinAnsiEncoding')))
    page = pdf.add_blank_page(page_size=(PAGE_W, PAGE_H))
    page.Contents = pdf.make_stream(content_stream())
    page.Resources = pikepdf.Dictionary(Font=pikepdf.Dictionary(F1=font))
    dst = Path(dst)
    dst.parent.mkdir(parents=True, exist_ok=True)
    pdf.save(str(dst), deterministic_id=True)
    return dst


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--out', default=str(DEFAULT_OUT))
    args = ap.parse_args(argv)
    written = build(args.out)
    print(f'wrote {written}  ({written.stat().st_size} bytes)')


if __name__ == '__main__':
    main(sys.argv[1:])
