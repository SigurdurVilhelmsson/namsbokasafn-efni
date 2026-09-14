"""§C140 ② - formula formatting in TRANSLATED figure labels: which source runs are sub/superscripts
or italic, which tokens carry that formatting, and where it lands in a (possibly editor-edited)
translated value. Pure: no cairo, no pdfplumber, no file IO. `compose.py` draws the result.

Spec: docs/superpowers/specs/2026-09-13-c140-t23-scripts-reflow-decimals-design.md §1.
Evidence (frozen): experiments/figure-text-translation/evidence/2026-09-13-t23/reports/c2-scripts.md
(the rule, the stacked splits, the transfer edge cases) and r2v-scripts.md (defects 2, 3, 4, 5).

THE STYLE OF ONE CHARACTER
--------------------------
`None` (plain) or `SourceStyle(ratio, frac, italic)`:
  ratio  = run size / the line's base size,
  frac   = (proj(run) - baseline) / base size, signed, UP along the text normal is positive,
  italic = figtext.run_face(run, fonts)[1].
A character is STYLED iff its run is a script (the rule below) or italic. The geometry is the
source run's OWN, never a constant: the 34 bought figures carry two subscript and two
superscript offset families, one figure holding both superscript ones.

THE SCRIPT RULE - one rule, per line, from source geometry only
---------------------------------------------------------------
* base size = the size carrying the most letters (`str.isalpha`) among NON-SYMBOL runs; tie ->
  the larger size. A symbol run (SYMBOL_FONT on its BaseFont) casts no vote - Greek STIX glyphs
  are letters, and an 11 pt `Δ` would otherwise make 11 pt the base of a 9 pt label.
* baseline = the letter-weighted mode of proj among base-size non-symbol runs, clustered to
  0.5 pt, then the median proj of those runs within 0.5 pt of the mode. NOT a plain median:
  with two base-size runs (`NH` on the baseline, a same-size `+` raised) the median lands
  between them and styles `NH`.
* script iff |proj - baseline| >= 0.075 * base when size < 0.9 * base, else >= 0.13 * base.
  Both thresholds sit in empty bins of the chemistry corpus histogram (c2 Q1); a flat 0.12
  misses the d-orbital `dz2` (7 pt on 9 pt, 0.111). Symbol runs cast no vote but CAN be scripts.

🔴 THE BASE MUST NOT INVERT (r2v-scripts defect 2). When a subscript word carries more letters
than its base letter (`qout`, `Patm`, `dxy`, `urms`) the letter vote picks the SUBSCRIPT size as
base and the real base letter becomes a "superscript" drawn larger than the label. So: if any
script on the line is larger than base + 0.2, re-derive with base1 = the largest size among
non-symbol letter-bearing runs (the spec's "largest non-symbol letter size on the line's majority
baseline", realised as: recompute the baseline from base1-size runs and re-classify); accept when
no script is larger than base1 + 0.2, otherwise the line is left UNSTYLED and `inverted=True`.
`qout` is the unresolvable case - its `q` is STIXGeneral-Italic, a symbol run, so no non-symbol
letter is larger than `out`. Two gaps in that rule are closed here, both found on the corpus:
a BLANK run never counts as a larger script (a 15 pt run of spaces inverted `E°cell = (    )ln K`),
and when no non-symbol run has a letter base1 is the largest non-symbol inked run (`10–10`).
"""
import re
import statistics
import collections

import figtext as FT

SourceStyle = collections.namedtuple('SourceStyle', 'ratio frac italic')

SYMBOL_FONT = re.compile(r'stix|symbol|mathematicalpi|mathpi|mt ?extra|cmsy|cmmi', re.I)
SMALL_RATIO = 0.9          # a run smaller than this fraction of the base is script-sized
SMALL_SHIFT = 0.075        # |Δproj| / base for a script-sized run
SAME_SHIFT = 0.13          # |Δproj| / base for a same-or-larger run
SIZE_TOL = 0.2             # "same size" (figtext.group's tolerance)
PROJ_CLUSTER = 0.5         # baseline mode bucket, pt
EDGE_PUNCT = ',.;:!?'      # trimmed from a token's edges when unstyled
# stacked-split attach (1b's `stacked_split_geom` geometry)
STACK_GAP_LO = -0.6        # * block max size
STACK_GAP_HI = 2.5         # pt
STACK_PROJ = 0.9 * 1.222   # * block max size
STACK_ROT = 3.0            # degrees


def _base_name(run, fonts):
    """The run's BaseFont without the leading '/' and the 6-letter subset prefix.

    ⚠️ The prefix is stripped BEFORE matching: it is six random capitals, and a prefix like
    `STIXCM+` would otherwise make LiberationSans a symbol font."""
    base = fonts.get(run['font'], {}).get('base', '')
    return base.lstrip('/').split('+')[-1]


def is_symbol_run(run, fonts):
    """Does this run draw with a math/symbol font (STIX, Symbol, MathematicalPi, MT Extra, cmsy/cmmi)?
    An unknown font key is not a symbol run (the same default as `figtext.run_face`)."""
    return bool(SYMBOL_FONT.search(_base_name(run, fonts)))


def _letters(text):
    return sum(c.isalpha() for c in text)


def _vote(runs, weight):
    """The size with the largest total `weight(run)`; tie -> larger. Sizes are clustered to 0.1 pt
    and the EXACT size returned is the heaviest one inside the winning cluster (so a 6.75 pt
    label is 6.75, not the 6.8 of its bucket). None when every weight is 0."""
    buckets = collections.OrderedDict()
    for r in runs:
        w = weight(r)
        if w:
            buckets.setdefault(round(r['size'], 1), collections.Counter())[r['size']] += w
    if not buckets:
        return None
    key = max(buckets, key=lambda k: (sum(buckets[k].values()), k))
    exact = buckets[key]
    return max(exact, key=lambda s: (exact[s], s))


def _size_vote(runs):
    """Most letters; else (a line of digits and signs) most non-blank characters."""
    s = _vote(runs, lambda r: _letters(r['text']))
    if s is None:
        s = _vote(runs, lambda r: len(r['text'].strip()))
    return s


def body_size(block, fonts):
    """The size a translated label is drawn at: the size carrying the most letters of NON-SYMBOL runs
    across the whole block, where each run's letters are counted at its LINE'S RESOLVED BASE - the
    `base` that `line_styles` returns for that `FT.lines` line (the resolved base of a line whose
    inversion resolved, the letter-vote base of an unresolvable inverted one). Tie -> the larger
    size (0.1 pt clusters, as the per-line vote); `block[0]['size']` when no non-symbol run has a
    letter.

    🔴 NOT `block[0]['size']` (r2v-scripts defect 3): 47 corpus `send:true` blocks start with an
    11 pt STIX symbol over a 9 pt body, and ② multiplies every script by this size.
    🔴 NOT a vote over each run's OWN size either: where a subscript word carries more letters than
    its base letter (`Patm`, `urms`, `dxy`, `E°cell`) that vote returns the SUBSCRIPT size, while
    `line_styles` resolves the line to the base letter's size and states every ratio relative to
    it - the label would be drawn at 75-78 % of its source size (13 `send:true` corpus blocks)."""
    votes = []
    for line in FT.lines(block):
        base = line_styles(line, fonts)[2]
        votes += [{'size': base, 'text': r['text']} for r in line if not is_symbol_run(r, fonts)]
    s = _vote(votes, lambda r: _letters(r['text']))
    return s if s is not None else block[0]['size']


def _classify(line, fonts, base):
    """-> (baseline, [is_script per run]) for one candidate base size."""
    at_base = [r for r in line if abs(r['size'] - base) < SIZE_TOL and not is_symbol_run(r, fonts)]
    if not at_base:                               # a line of symbol runs only
        at_base = [r for r in line if abs(r['size'] - base) < SIZE_TOL] or list(line)
    votes = collections.OrderedDict()             # insertion order breaks a tie: first in run order
    for r in at_base:
        k = round(FT.proj(r) / PROJ_CLUSTER) * PROJ_CLUSTER
        votes[k] = votes.get(k, 0.0) + max(_letters(r['text']), 0.001 * len(r['text']))
    mode = max(votes, key=votes.get)
    baseline = statistics.median(FT.proj(r) for r in at_base if abs(FT.proj(r) - mode) <= PROJ_CLUSTER)
    scripts = []
    for r in line:
        shift = abs(FT.proj(r) - baseline)
        thr = SMALL_SHIFT if r['size'] < SMALL_RATIO * base else SAME_SHIFT
        scripts.append(shift >= thr * base)
    return baseline, scripts


def _larger_scripts(line, scripts, base):
    """Inked runs classified as scripts yet LARGER than the base - the inversion signal.

    ⚠️ A BLANK run is never one: it draws no glyph and carries no styled character a token can
    hold. Measured on the corpus: the 15 pt run of four spaces inside `E°cell = (    )ln K`
    (17_04_Relation, send:true) sits 5 pt low and inverted the whole line."""
    return [r for r, s in zip(line, scripts) if s and r['text'].strip() and r['size'] > base + SIZE_TOL]


def _analyse(line, fonts):
    """The whole per-line decision, with the runs that looked like larger scripts (for naming)."""
    nonsym = [r for r in line if not is_symbol_run(r, fonts)]
    base = _size_vote(nonsym)
    if base is None:
        base = _size_vote(line)
    if base is None:
        base = line[0]['size']
    baseline, scripts = _classify(line, fonts, base)
    suspects = _larger_scripts(line, scripts, base)
    inverted = False
    if suspects:
        # base1 = the largest non-symbol LETTER-bearing run; when no non-symbol run has a letter
        # (`10–10`: the 7 pt exponent has more characters than the 9 pt `10`, so the character
        # fallback voted 7 pt) the largest non-symbol INKED run - the same fallback the vote uses.
        lettered = ([r for r in nonsym if _letters(r['text'])]
                    or [r for r in nonsym if r['text'].strip()])
        if lettered:
            base1 = max(r['size'] for r in lettered)
            baseline1, scripts1 = _classify(line, fonts, base1)
            if not _larger_scripts(line, scripts1, base1):
                base, baseline, scripts = base1, baseline1, scripts1
            else:
                inverted = True
        else:
            inverted = True
    text = ''.join(r['text'] for r in line)
    if inverted:
        return text, [None] * len(text), base, True, suspects
    styles = []
    for r, s in zip(line, scripts):
        italic = FT.run_face(r, fonts)[1]
        st = (SourceStyle(round(r['size'] / base, 4), round((FT.proj(r) - baseline) / base, 4), italic)
              if (s or italic) else None)
        styles += [st] * len(r['text'])
    return text, styles, base, False, suspects


def line_styles(line, fonts):
    """-> (text, styles, base, inverted) for ONE line of runs (see the module docstring).

    `styles` is one `SourceStyle | None` per character of `text` (the joined run text).
    On an unresolvable inverted base every style is None, `inverted` is True and `base` is the
    letter-vote base the inversion was detected against. A blank run may carry a style (Blood's
    5.25 pt run of spaces sits on the subscript baseline); it is harmless - spaces never enter a
    `\\S+` token and never count as an inversion suspect."""
    text, styles, base, inverted, _ = _analyse(line, fonts)
    return text, styles, base, inverted


def _block_max(block, fonts):
    """The block's largest glyph size among non-blank non-symbol runs (fallbacks: non-blank, all)."""
    pool = ([r for r in block if r['text'].strip() and not (fonts is not None and is_symbol_run(r, fonts))]
            or [r for r in block if r['text'].strip()] or list(block))
    return max(r['size'] for r in pool)


def token_lines(block, fonts=None):
    """`FT.lines(block)` with each STACKED-SPLIT line attached to the line before it - for token
    building ONLY. The block key (`blockkey.block_key`, which uses FT.lines) never changes.

    `HCO3|–`: FT.lines puts a charge kerned back over its subscript on its own line, where it is
    the only run, becomes its own base and is never styled - 15 of 19 real `send:true` charge lines
    produced no token at all (c2 Q4). Line i+1 attaches to line i when its FIRST run is
    script-sized (< 0.9 x the block's max non-symbol size) and it geometrically continues line i:
    along-gap from the end of line i's last run within [-0.6 x max, 2.5 pt], |Δproj| < 0.9 x max x
    1.222, |Δrot| < 3; never on an arc. Chains attach onto the accumulated line.

    `fonts` is optional so the fixed interface `token_lines(block)` stays callable; without it
    every run counts as non-symbol for the block max."""
    ls = [list(l) for l in FT.lines(block)]
    if FT.is_arc(block) or len(ls) < 2:
        return ls
    bmax = _block_max(block, fonts)
    out = [ls[0]]
    for l in ls[1:]:
        x, y = out[-1][-1], l[0]
        gap = FT.along(y) - FT.along(x) - x['adv']
        if (y['size'] < SMALL_RATIO * bmax
                and STACK_GAP_LO * bmax <= gap <= STACK_GAP_HI
                and abs(FT.proj(y) - FT.proj(x)) < STACK_PROJ * bmax
                and abs(y['rot'] - x['rot']) < STACK_ROT):
            out[-1] = out[-1] + l
        else:
            out.append(l)
    return out


def _miss(token, stretch, reason, candidates=None):
    return dict(token=token, stretch=stretch, reason=reason, candidates=candidates)


def source_tokens(block, fonts):
    """-> (tokens, misses). Built from the SOURCE runs only, never from a translated value.

    A token is a maximal `\\S+` stretch of a `token_lines` line holding a styled character, with
    unstyled `,.;:!?` trimmed from its edges: `{'text', 'styles'}`, de-duplicated by
    (text, styles) - a label repeating a formula (`3px and 3px`) otherwise names two false
    `absent` misses after both occurrences were formatted.

    Source-side misses (reasons `stacked`, `inverted-base`, `arc`):
    * an ARC block (FT.is_arc) is never styled - curvature reads as a baseline shift; if any run
      differs in size by >= 0.2 from the first or is italic, ONE `arc` miss names the joined text;
    * a line left all script-sized with no letters after attachment is `stacked` (its tokens, if
      any, are not built - naming it once is the report);
    * an unresolvable inverted base is `inverted-base`; `stretch` names the runs that looked like
      larger scripts."""
    tokens, misses, seen = [], [], set()
    if FT.is_arc(block):
        s0 = block[0]['size']
        if any(abs(r['size'] - s0) >= SIZE_TOL or FT.run_face(r, fonts)[1] for r in block):
            t = ''.join(r['text'] for r in block)
            misses.append(_miss(t, t, 'arc'))
        return tokens, misses
    bmax = _block_max(block, fonts)
    for line in token_lines(block, fonts):
        text, styles, base, inverted, suspects = _analyse(line, fonts)
        inked = [r for r in line if r['text'].strip()]
        if inked and all(r['size'] < SMALL_RATIO * bmax for r in inked) and not _letters(text):
            misses.append(_miss(text.strip(), text.strip(), 'stacked'))
            continue
        if inverted:
            misses.append(_miss(text.strip(), ' '.join(r['text'].strip() for r in suspects), 'inverted-base'))
            continue
        for m in re.finditer(r'\S+', text):
            s, e = m.start(), m.end()
            while s < e and text[s] in EDGE_PUNCT and styles[s] is None:
                s += 1
            while e > s and text[e - 1] in EDGE_PUNCT and styles[e - 1] is None:
                e -= 1
            if s < e and any(st is not None for st in styles[s:e]):
                key = (text[s:e], tuple(styles[s:e]))
                if key not in seen:
                    seen.add(key)
                    tokens.append(dict(text=text[s:e], styles=list(styles[s:e])))
    return tokens, misses


# ---- transfer ------------------------------------------------------------------------------------

def _occ(hay, needle):
    """Every start index of `needle` in `hay`, overlapping."""
    out, i = [], hay.find(needle)
    while i >= 0:
        out.append(i)
        i = hay.find(needle, i + 1)
    return out


def _clean(hay, i, n):
    """Not glued to a letter or digit on either side."""
    before = hay[i - 1] if i > 0 else ''
    after = hay[i + n] if i + n < len(hay) else ''
    return not (before.isalnum() or after.isalnum())


def _free(taken, i, n):
    return not any(taken[i:i + n])


def _raw_count(hay, needle, taken):
    """Non-overlapping occurrences of `needle` lying wholly in unconsumed positions."""
    n, count, last = len(needle), 0, -1
    for i in _occ(hay, needle):
        if i >= last and _free(taken, i, n):
            count += 1
            last = i + n
    return count


def _stretches(styles):
    """Maximal EQUAL-style runs of styled characters: [(start, end)]."""
    out, i = [], 0
    while i < len(styles):
        if styles[i] is None:
            i += 1
            continue
        j = i
        while j < len(styles) and styles[j] == styles[i]:
            j += 1
        out.append((i, j))
        i = j
    return out


def transfer(tokens, value):
    """-> (fmt, misses). `fmt` is one `SourceStyle | None` per character of `value`, which is
    NEVER altered - it is the sidecar value as compose.py reads it, possibly editor-edited.

    Tokens are placed LONGEST FIRST and every value position is consumed once.
    * a token whose every character is styled:
      - with no letter (`+`, `–`, `=`) -> `no-base`, never searched bare (a bare `2` or `–`
        matches everywhere);
      - with a letter (an italic variable `r`, `ν1`, `dz2`) -> placed only at a clean UNIQUE
        unconsumed occurrence, else `ambiguous` (several) / `absent` (none);
    * otherwise EVERY clean unconsumed occurrence is formatted; when the raw token also occurs
      glued (unconsumed) more often than it was placed, `partial` names it;
    * a token with no clean occurrence falls back per styled stretch (maximal equal-style run),
      anchored on the token character before it: a stretch at the token start has an empty anchor
      -> `no-base`; else exactly ONE unconsumed occurrence of anchor+stretch whose next value
      character is not alphanumeric or equals the token's next character is placed (the stretch
      only; the anchor is not consumed), several -> `ambiguous`, none -> `absent`, both with
      `candidates`; a placed needle that occurs (unconsumed) more often -> `partial`.
    Misses: `{'token', 'stretch', 'reason', 'candidates'}`."""
    fmt = [None] * len(value)
    taken = [False] * len(value)
    misses = []
    for t in sorted(tokens, key=lambda t: -len(t['text'])):
        tok, sts = t['text'], t['styles']
        n = len(tok)
        if n == 0 or all(st is None for st in sts):
            continue
        if all(st is not None for st in sts):
            if not any(c.isalpha() for c in tok):
                misses.append(_miss(tok, tok, 'no-base'))
                continue
            hits = [i for i in _occ(value, tok) if _clean(value, i, n) and _free(taken, i, n)]
            if len(hits) == 1:
                i = hits[0]
                for k in range(n):
                    taken[i + k] = True
                    fmt[i + k] = sts[k]
            else:
                misses.append(_miss(tok, tok, 'ambiguous' if hits else 'absent', len(hits)))
            continue
        raw = _raw_count(value, tok, taken)
        placed = 0
        for i in _occ(value, tok):
            if _clean(value, i, n) and _free(taken, i, n):
                for k in range(n):
                    taken[i + k] = True
                    if sts[k] is not None:
                        fmt[i + k] = sts[k]
                placed += 1
        if placed:
            if raw > placed:
                misses.append(_miss(tok, tok, 'partial', raw))
            continue
        for s_, e_ in _stretches(sts):
            stretch = tok[s_:e_]
            if s_ == 0:
                misses.append(_miss(tok, stretch, 'no-base'))
                continue
            needle = tok[s_ - 1] + stretch
            right = tok[e_] if e_ < n else ''
            m = len(needle)
            free = [i for i in _occ(value, needle) if _free(taken, i, m)]
            cands = [i for i in free
                     if i + m >= len(value) or not value[i + m].isalnum() or value[i + m] == right]
            if len(cands) != 1:
                misses.append(_miss(tok, stretch, 'ambiguous' if cands else 'absent', len(cands)))
                continue
            raw = _raw_count(value, needle, taken)
            i = cands[0]
            for k in range(1, m):
                taken[i + k] = True
                fmt[i + k] = sts[s_ + k - 1]
            if raw > 1:
                misses.append(_miss(tok, stretch, 'partial', raw))
    return fmt, misses


# ---- drawing helpers -----------------------------------------------------------------------------

def words(value, fmt):
    """-> [(word, styles)] with offsets from the RAW value (`re.finditer(r'\\S+')`, identical to
    `str.split()` on every codepoint), so wrap()'s whitespace collapse cannot misalign styles."""
    return [(m.group(), fmt[m.start():m.end()]) for m in re.finditer(r'\S+', value)]


def segments(chars):
    """[(char, style)] -> [(text, style)], maximal equal-style runs."""
    out = []
    for ch, st in chars:
        if out and out[-1][1] == st:
            out[-1] = (out[-1][0] + ch, st)
        else:
            out.append((ch, st))
    return out


def split_at_word_edges(segs):
    """Cut a plain segment adjacent to a styled one at its last/first SPACE, so a formula word is
    drawn from its own first letter and browser/cairo advance rounding from a long plain prefix
    lands in a word space (in-formula error <= 0.57 pt instead of up to 1.56 pt, c2 Q3)."""
    out = []
    n = len(segs)
    for i, (t, st) in enumerate(segs):
        if st is not None:
            out.append((t, st))
            continue
        pieces = [t]
        if i + 1 < n and segs[i + 1][1] is not None:          # styled follows: cut after last space
            k = pieces[-1].rfind(' ')
            if 0 <= k < len(pieces[-1]) - 1:
                last = pieces.pop()
                pieces += [last[:k + 1], last[k + 1:]]
        if i > 0 and segs[i - 1][1] is not None:              # styled precedes: cut before first space
            first = pieces[0]
            k = first.find(' ')
            if k > 0:
                pieces = [first[:k], first[k:]] + pieces[1:]
        out += [(pc, None) for pc in pieces if pc]
    return out
