"""§C140 ⑨ - Icelandic number separators for figure labels DRAWN IN ENGLISH.

    import numloc
    numloc.localize('26.98')                         # -> '26,98'
    numloc.localize_runs(['2', '8', '.', '1', ' g'])  # -> ['2', '8', ',', '1', ' g']

The source is always US-formatted and Icelandic INVERTS both separators, so a kept label
`26.98` is drawn `26,98` and `1,000` is drawn `1.000` - as the chapter text and the June
figures already do. Rule R3 of `evidence/2026-09-13-t23/reports/c9-decimal.md` §7, on ONE
LINE of text:

1. a line holding a coordinate pair (`(10.0, 19.5)`) is left alone - a comma decimal inside a
   comma-separated pair is ambiguous, and changing the `,` is an editorial decision;
2. every thousands group becomes a period, ACROSS ALL GROUPS (`1,000,000` -> `1.000.000`);
3. every `.` flanked by digits becomes `,`;
4. a line that is then exactly a bare overprint fragment `\\d+\\.` (`0.`) has its `.` made `,`,
   so the fragment agrees with the label it overprints.

Left alone by construction: a leading point (`.625 g`), a trailing sentence point (`Br2.`),
locants (`1,2-dichloroethane` - a thousands group needs three digits) and `N2, H2`.

The regexes are copied VERBATIM from the instrument that measured the rule
(`instruments/c9/rules_eval.py`: `TH`, `r2_line`, `TUPLE`, `r3_line`), except that the
fragment test is applied to the line (c9 applied it to the block key; for a one-line fragment
block the two are the same string, and rule 2/3 cannot turn a non-fragment into one).

🔴 NOT IDEMPOTENT ON THREE-DECIMAL VALUES: `1.008 -> 1,008 -> 1.008`, because `1,008` IS a
US thousands group. So this runs ONLY on source run text read from `runs.json`, never on
text that may already be localised - an MT reply, an editor's value, or its own output.

🔴 WHY `localize_runs` WORKS ON THE LINE, NOT ON EACH RUN: a PDF may set a number one glyph
per run (`CNX_Chem_03_02_moles-6296` draws `28.1 g Si` as `2`,`8`,`.`,`1`,...), and no run
on its own holds a digit-flanked point. The line is joined, localised, and cut back at the
original run lengths - which is sound only because every substitution is one character for
one character. `localize` asserts that.

⚠️ DO NOT REUSE the chapter's `mathml-to-latex.js` `localizeNumberFull`: it corrupts
multi-group values (`1,000,000` -> `1.000,000`).

⚠️ `\\d` here is Python's Unicode digit class, where the review panel's JavaScript
(`tools/lib/figure-consistency.cjs`) is ASCII-only. They differ only on non-ASCII decimal
digits, of which the chemistry figure census holds none.

Imports NOTHING from the experiment: the standard library's `re` only.
"""
import re

# Stands in for a thousands comma while step 3 rewrites points. It must never occur in the
# input, or step 2's un-substitution would turn a real one into a period; `localize` returns
# such a line unchanged rather than guess.
_PH = '\u2800'

# ── copied verbatim from instruments/c9/rules_eval.py ────────────────────────────────────
TH = re.compile(r'(?<![\d.,])\d{1,3}(?:,\d{3})+(?=(?:\.\d+)?(?![\d,]))')
TUPLE = re.compile(r'\d\.\d+\s*,\s*[–−-]?\d')
_DIGIT_FLANKED_POINT = r'(?<=\d)\.(?=\d)'
_FRAGMENT = r'\s*\d+\.\s*'
_POINT_AFTER_DIGIT = r'(?<=\d)\.'
# ─────────────────────────────────────────────────────────────────────────────────────────


def _r2_line(t):
    """Digit-flanked decimal point -> ',' and ALL thousands groups -> '.' (c9's `r2_line`)."""
    t = TH.sub(lambda m: m.group().replace(',', _PH), t)
    t = re.sub(_DIGIT_FLANKED_POINT, ',', t)
    return t.replace(_PH, '.')


def localize(text):
    """Rule R3 on ONE line of source text -> the same line with Icelandic separators.

    Returns a string of exactly `len(text)` characters (asserted): only `.` and `,` are ever
    exchanged, one for one, so whitespace and every other character stay where they were.
    A line containing the internal placeholder U+2800 is returned unchanged.
    """
    if _PH in text:
        return text
    if TUPLE.search(text):            # coordinate tuple "(10.0, 19.5)": leave for a human
        return text
    out = _r2_line(text)
    if re.fullmatch(_FRAGMENT, out):   # overprint fragment "0." -> "0,"
        out = re.sub(_POINT_AFTER_DIGIT, ',', out)
    assert len(out) == len(text), (text, out)
    return out


def localize_runs(texts):
    """`localize` one LINE given as its runs' texts -> the runs' new texts, same lengths.

    `texts` are the raw `run['text']` values of one `figtext.lines()` line, in order. They are
    joined, localised as one line, and split back at the original lengths, so a number set
    one glyph per run is found and each changed character lands in the run that drew it.
    """
    texts = list(texts)
    out = localize(''.join(texts))
    pieces, i = [], 0
    for t in texts:
        pieces.append(out[i:i + len(t)])
        i += len(t)
    return pieces
