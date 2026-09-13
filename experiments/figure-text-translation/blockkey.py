"""The ONE block-key derivation. Every consumer imports it; there is no second copy.

The block key is what is BOUGHT, what keys the sidecar (`blocks` in
`books/<slug>/figure-text/<basename>.is.json`), and what the editor sees. So
`emit-blocks.py`, `census.py`, `compose.py` and `read_layer_accept.py` must derive it
identically or their counts describe four different populations. Holding the rule in four
places is how they drift; holding it here is why they cannot (P8 / ruling R-11).

⚠️ THERE ARE FOUR CONSUMERS, AND `compose.py` IS THE ONE THAT MATTERS MOST — it is what
looks the translation up at DRAW time (`TR[key]`). A key that differs from the one
`emit-blocks.py` bought leaves the label in English while every count stays green, because
both sides succeeded at their own job. `test_blockkey_consumers.py` asserts the emit-side
and compose-side keys are identical on a real figure; that assertion is the point of
importing rather than restating. Do not trust this enumeration — re-derive it with
`grep -an "from blockkey import" *.py`.

⚠️ THE KEY IS DERIVED OVER UNFILTERED RUNS. `emit-blocks.py` used to drop blank runs
(`if r['text'].strip()`) before grouping. That filter is DELETED, by measurement, not by
taste: deleting it leaves `compose.py` byte-identical and the composed image 0 pixels
different, and it buys `"not consistent with"` instead of `"notconsistentwith"` — 194
characters / 1.94 ISK corpus-wide. The mirror change (adding the filter to `compose.py`)
moves block boundaries on 32 of 393 figures and produces overlapping text.

⚠️ IF A BLANK FILTER IS EVER WANTED AGAIN, ITS PREDICATE MUST BE `text == ''`, NEVER
`not text.strip()`. `'\\x1f'.isspace()` is True and a /Differences font maps \\x1f to a
Greek alpha, so `.strip()` silently deletes a real glyph.
"""
import _deps  # noqa: F401  — puts this directory on sys.path; never process.cwd()
import figtext as FT


def block_lines(block):
    """The block's text, one string per visual line, in reading order."""
    return [''.join(r['text'] for r in line) for line in FT.lines(block)]


def block_key(block):
    """The content-addressed translation key for one block.

    An ARC block is laid out glyph by glyph along a fitted circle, so its runs are single
    characters and the key is their bare concatenation — inserting line separators into a
    circular label would key on a line structure it does not have. Every other block is
    its lines joined with '|', which preserves the line structure the composer needs
    while staying ONE key, and therefore ONE thing bought.
    """
    if FT.is_arc(block):
        return ''.join(r['text'] for r in block)
    return '|'.join(block_lines(block))


def block_english(block):
    """What emit-blocks.py SENT for this block - the MT wire text.

    An ARC (FT.is_arc) sends its key, the bare concatenation of its glyphs; every other block
    sends its lines joined by ONE space - the MT unit is the LABEL, not the line.

    ⚠️ THE SAME `FT.is_arc` AS `block_key`, DELIBERATELY NOT compose.py's `arc`, which also
    requires a usable circle. The question this answers is what went on the wire, and a
    degenerate arc went on the wire as its bare concatenation. compose.py asks it to decide
    IDENTITY (`figtext.is_identity`); deriving the wire from its own `arc` compared a reply
    against a string that was never sent (spec §C140 ①, component 1).
    """
    if FT.is_arc(block):
        return block_key(block)
    return ' '.join(block_lines(block))
