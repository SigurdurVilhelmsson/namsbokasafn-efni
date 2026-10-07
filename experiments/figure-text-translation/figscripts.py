"""§C140 ② - formula formatting in TRANSLATED figure labels: which source runs are sub/superscripts
or italic, which tokens carry that formatting, and where it lands in a (possibly editor-edited)
translated value. Pure: no cairo, no pdfplumber, no file IO. `compose.py` draws the result.

Spec: docs/superpowers/specs/2026-09-13-c140-t23-scripts-reflow-decimals-design.md §1.
Evidence (frozen): experiments/figure-text-translation/evidence/2026-09-13-t23/reports/c2-scripts.md
(the rule, the stacked splits, the transfer edge cases) and r2v-scripts.md (defects 2, 3, 4, 5).

THE STYLE OF ONE CHARACTER
--------------------------
`None` (plain) or `SourceStyle(ratio, frac, italic, serif)`:
  ratio  = run size / the line's base size,
  frac   = (proj(run) - baseline) / base size, signed, UP along the text normal is positive,
  italic = figtext.run_face(run, fonts)[1],
  serif  = figsym.verified_face(run, fonts) - the (bold, italic) STIX 1.1.0 General face the source character
           was drawn in, or None (default) for any other font (§C140 '6' M6 half B, [USER] R-13). It is part of
           the style, so equal-style segmentation splits a STIX character from a Liberation one.
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
no script is larger than base1 + 0.2. §C140 '6' M5 R1: when base1 also fails, the base letter may
itself be a SYMBOL run - `qout`, whose `q` is STIXGeneral-Italic, so no non-symbol letter is larger
than `out` - and base2 = the largest letter-bearing run of ANY font is tried the same way; accepted
when no script is larger than base2 + 0.2 (`qout` resolves: base 11, `q` italic, `out` a subscript).
Only when that fallback fails too is the line left UNSTYLED with `inverted=True`; the drawn size
then stays the letter-vote base. Two gaps in that rule are closed here, both found on the corpus:
a BLANK run never counts as a larger script (a 15 pt run of spaces inverted `E°cell = (    )ln K`),
and when no non-symbol run has a letter base1 is the largest non-symbol inked run (`10–10`).
"""
import re
import statistics
import collections

import figtext as FT

SourceStyle = collections.namedtuple('SourceStyle', 'ratio frac italic serif', defaults=(None,))

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
JOINT = object()           # M5 R3: a value position that is the MT wire's own joint space - drawn elided


def is_script_style(st):
    """Is this SourceStyle a sub/superscript? The script rule above, restated on ONE style, beside its
    thresholds so the rule keeps one owner: |frac| >= SMALL_SHIFT when ratio < SMALL_RATIO, else
    >= SAME_SHIFT. `st` is a style as `line_styles` / `source_tokens` write it (ratio and frac rounded
    to 4 places; a plain tuple works too); None - a plain character - is not a script.

    The italic bit is not read: an italic-only style is NOT a script. OxStNonmts' STIX charges are
    (1.0, 0.0714, italic) - italic, raised 0.0714 < SAME_SHIFT - so a sign-only reading would call
    them superscripts. §C140 ㊾ D5(a): heldplan pools a block's script styles with this, to draw a
    held value's ₂ / ⁰ / ⁻ in the block's OWN source style of that kind."""
    if st is None:
        return False
    ratio, frac = st[0], st[1]
    return abs(frac) >= (SMALL_SHIFT if ratio < SMALL_RATIO else SAME_SHIFT)


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
    # Imported HERE, not at module top: figsym imports _deps (and fontsubset), and heldplan - which imports this
    # module - is pinned PURE by test_heldplan.py HP0 (no _deps). verified_face reads names only; no font is loaded.
    import figsym
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
        if inverted:
            # M5 R1: the base letter may itself be a SYMBOL run (`qout`: q is STIXGeneral-Italic).
            anyl = [r for r in line if _letters(r['text'])]
            if anyl:
                base2 = max(r['size'] for r in anyl)
                baseline2, scripts2 = _classify(line, fonts, base2)
                if not _larger_scripts(line, scripts2, base2):
                    base, baseline, scripts, inverted = base2, baseline2, scripts2, False
    text = ''.join(r['text'] for r in line)
    if inverted:
        return text, [None] * len(text), base, True, suspects
    styles = []
    for r, s in zip(line, scripts):
        italic = FT.run_face(r, fonts)[1]
        # §C140 '6' M6 half B: a styled character from an eligible STIX 1.1.0 General run remembers its source face,
        # so compose can draw it serif (compose.serif_face).
        serif = figsym.verified_face(r, fonts)
        st = (SourceStyle(round(r['size'] / base, 4), round((FT.proj(r) - baseline) / base, 4), italic, serif)
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

    §C140 '6' M5 R2 ([USER] ruling R-9): a line ALSO attaches, whatever its first run's size, when it
    is glued on (the same along-gap and rotation tests) and lies on the accumulated line's VISUAL
    line - |Δproj| from that line's FIRST run < FT.VISUAL_LEAD_FRACTION x 1.222 x the larger of the
    two first-run sizes, figtext.visual_lines' threshold. `ammonium (NH4|+|)`'s same-size `+` and `)`
    attach, so `NH4+)` is one token. FT.lines and the block key still do not move.

    `fonts` is optional so the fixed interface `token_lines(block)` stays callable; without it
    every run counts as non-symbol for the block max."""
    return _token_lines_j(block, fonts)[0]


def _token_lines_j(block, fonts=None):
    """`token_lines` plus where each attachment happened: -> (lines, joints), where joints[i] holds
    the character offsets, in line i's joined run text, at which an ATTACHED FT.lines line begins.
    The MT wire (blockkey.block_english) joins FT.lines lines with ONE space, so a value may echo a
    space at exactly these offsets (M5 R3, `source_tokens` / `transfer`)."""
    ls = [list(l) for l in FT.lines(block)]
    if FT.is_arc(block) or len(ls) < 2:
        return ls, [[] for _ in ls]
    bmax = _block_max(block, fonts)
    out = [ls[0]]
    joints = [[]]
    for l in ls[1:]:
        x, y = out[-1][-1], l[0]
        gap = FT.along(y) - FT.along(x) - x['adv']
        glued = STACK_GAP_LO * bmax <= gap <= STACK_GAP_HI and abs(y['rot'] - x['rot']) < STACK_ROT
        stacked = (y['size'] < SMALL_RATIO * bmax and glued
                   and abs(FT.proj(y) - FT.proj(x)) < STACK_PROJ * bmax)
        p0 = out[-1][0]
        visual = (glued
                  and abs(FT.proj(y) - FT.proj(p0)) < FT.VISUAL_LEAD_FRACTION * 1.222 * max(p0['size'], y['size']))
        if stacked or visual:
            joints[-1].append(sum(len(r['text']) for r in out[-1]))
            out[-1] = out[-1] + l
        else:
            out.append(l)
            joints.append([])
    return out, joints


def _miss(token, stretch, reason, candidates=None):
    return dict(token=token, stretch=stretch, reason=reason, candidates=candidates)


def source_tokens(block, fonts):
    """-> (tokens, misses). Built from the SOURCE runs only, never from a translated value.

    A token is a maximal `\\S+` stretch of a `token_lines` line holding a styled character, with
    unstyled `,.;:!?` trimmed from its edges: `{'text', 'styles'}`, de-duplicated by
    (text, styles) - a label repeating a formula (`3px and 3px`) otherwise names two false
    `absent` misses after both occurrences were formatted. §C140 '6' M5 adds two optional fields
    and one token kind:
    * `joints` (R3) - offsets in the token text where an attached FT.lines line begins
      (`_token_lines_j`); present only when the token spans one;
    * `srcplain` (R5b) - True on an all-styled token whose text ALSO stands unstyled and clean in
      the same source line (`pm` in `266 pm = 133 pm`): a bare search cannot tell which one was
      styled, so `transfer` names it `ambiguous` and places nothing;
    * a PHRASE token (R5) - one maximal equal-style styled stretch of a line that spans a space and
      holds a letter (`266 pm`, a raised 7 pt run), outer spaces stripped: `{'text', 'styles',
      'phrase': True, 'parts'}`, `parts` its `\\S+` words. De-duplicated with the word tokens.

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
    tls, tjs = _token_lines_j(block, fonts)
    for line, js in zip(tls, tjs):
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
                    tok = dict(text=text[s:e], styles=list(styles[s:e]))
                    if all(x is not None for x in styles[s:e]):
                        # M5 R5b: the same text also stands UNSTYLED in this source line (`pm` in
                        # `266 pm = 133 pm`): a bare search cannot tell which occurrence was styled.
                        for mm in re.finditer(re.escape(text[s:e]), text):
                            a_, b_ = mm.start(), mm.end()
                            if (a_, b_) != (s, e) and all(x is None for x in styles[a_:b_]) and _clean(text, a_, b_ - a_):
                                tok['srcplain'] = True
                    jj = [j - s for j in js if s < j < e]
                    if jj:
                        tok['joints'] = jj
                    tokens.append(tok)
        # M5 R5: ONE equal-style styled stretch spanning a space (`266 pm`, a raised 7 pt run) is
        # also a PHRASE token; placed, it suppresses the word tokens it contains.
        i = 0
        while i < len(styles):
            if styles[i] is None:
                i += 1; continue
            j = i
            while j < len(styles) and styles[j] == styles[i]:
                j += 1
            s, e = i, j
            while s < e and text[s].isspace(): s += 1
            while e > s and text[e - 1].isspace(): e -= 1
            ph = text[s:e]
            if re.search(r'\s', ph) and _letters(ph):
                key = (ph, tuple(styles[s:e]))
                if key not in seen:
                    seen.add(key)
                    tokens.append(dict(text=ph, styles=list(styles[s:e]), phrase=True,
                                       parts=[m.group() for m in re.finditer(r'\S+', ph)]))
            i = j
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
    NEVER altered - it is the sidecar value as compose.py reads it, possibly editor-edited. Under R3
    below a position may instead be `JOINT`: compose.py ELIDES every JOINT position from the DRAWN
    text, so the drawn text can differ from the value by exactly those spaces.

    Tokens are placed LONGEST FIRST and every value position is consumed once.
    * a token whose every character is styled:
      - with no letter (`+`, `–`, `=`) -> `no-base`, never searched bare (a bare `2` or `–`
        matches everywhere);
      - with a letter (an italic variable `r`, `ν1`, `dz2`) -> placed only at a clean UNIQUE
        unconsumed occurrence, else `ambiguous` (several) / `absent` (none) - R5, R5b, R6 and R7
        below refine this case;
    * otherwise EVERY clean unconsumed occurrence is formatted; when the raw token also occurs
      glued (unconsumed) more often than it was placed, `partial` names it;
    * a token with no clean occurrence falls back per styled stretch (maximal equal-style run),
      anchored on the token character before it: a stretch at the token start has an empty anchor
      -> `no-base` (unless R4 places it); else exactly ONE unconsumed occurrence of anchor+stretch
      whose next value character is not alphanumeric or equals the token's next character is placed
      (the stretch only; the anchor is not consumed), several -> `ambiguous`, none -> `absent`, both
      with `candidates`; a placed needle that occurs (unconsumed) more often -> `partial`.

    §C140 '6' M5 - narrow rules, each placing a style only where it can pin it to exactly ONE
    occurrence; anything else falls through to the rules above ([USER] rulings R-9, R-10; spec
    docs/superpowers/specs/2026-10-05-c140-composer-formatting-class-design.md D-f). R1 and R2 act
    at the source, in `_analyse` and `_token_lines_j`.
    * R3 - a token with `joints` and no clean unconsumed whole occurrence is matched with ONE
      optional space before each joint offset (the MT wire's joint: `NO2 –`). Exactly one clean
      unconsumed match holding a space is placed, each such joint space marked JOINT; several or
      none -> the rules above.
    * R4 - a LEADING styled stretch holding a letter is anchored on the token character AFTER it:
      exactly one unconsumed stretch+next occurrence at a word's left edge styles the stretch only
      (`n-pentans`); otherwise `no-base`.
    * R5 - a PHRASE token is placed only at a clean unique unconsumed occurrence; placed, the word
      tokens named by its `parts` are skipped (by text). Unplaced it names no miss: its word tokens
      carry the report.
    * R5b - an all-styled token marked `srcplain` is never placed: `ambiguous`, with the count of
      clean candidates.
    * R6 - an all-styled, single-style, italic, non-script, alphabetic token of >= 3 characters with
      no clean occurrence is placed at its unique unconsumed occurrence that starts a word and is
      continued by a letter: an italic compound prefix (`Trans` in `Transfita`).
    * R7 - a token that is a base plus ONE trailing letter script stretch (>= 2 letters, no script
      in the base), not placed otherwise, takes the unique unconsumed value WORD (trailing `,.;:!?`
      trimmed) that starts with the base and continues with letters only: the base's styles, then
      the script style to the word's end (`qout` -> `qút`). Placed, every per-stretch miss except
      `partial` is dropped: the whole word is styled, an interior base stretch (`H` in `ΔHvap`) included.
    Misses: `{'token', 'stretch', 'reason', 'candidates'}`."""
    fmt = [None] * len(value)
    taken = [False] * len(value)
    misses = []
    suppressed = collections.Counter()

    def put(i, k_sts):
        for q, st in k_sts:
            taken[q] = True
            if st is not None:
                fmt[q] = st

    def stretch_fallback(tok, sts, n):
        """The original per-stretch fallback (+R4). -> (placed_any, list of (stretch,reason,cands) misses,
        placed_last) where placed_last says whether the trailing stretch was placed."""
        ms, placed_last, any_ = [], False, False
        sl = _stretches(sts)
        for s_, e_ in sl:
            stretch = tok[s_:e_]
            if s_ == 0:
                if e_ < n and _letters(stretch):
                    needle = stretch + tok[e_]
                    m = len(needle)
                    cands = [i for i in _occ(value, needle) if _free(taken, i, m)
                             and (i == 0 or not value[i - 1].isalnum())]
                    if len(cands) == 1:
                        i = cands[0]
                        put(i, [(i + k, sts[k]) for k in range(e_ - s_)])
                        any_ = True
                        continue
                ms.append((stretch, 'no-base', None))
                continue
            needle = tok[s_ - 1] + stretch
            right = tok[e_] if e_ < n else ''
            m = len(needle)
            # Only the STRETCH positions must be free: the anchor (needle[0]) is never consumed by this placement, so
            # it may already be taken - by R4 placing the leading stretch it anchors on (`Ka`: K italic, then `a`
            # subscript; review-fix round G21 #6), or by an adjacent stretch placed just before.
            free = [i for i in _occ(value, needle) if _free(taken, i + 1, m - 1)]
            cands = [i for i in free
                     if i + m >= len(value) or not value[i + m].isalnum() or value[i + m] == right]
            if len(cands) != 1:
                ms.append((stretch, 'ambiguous' if cands else 'absent', len(cands)))
                continue
            raw = _raw_count(value, needle, taken)
            i = cands[0]
            put(i, [(i + k, sts[s_ + k - 1]) for k in range(1, m)])
            any_ = True
            if e_ == n:
                placed_last = True
            if raw > 1:
                ms.append((stretch, 'partial', raw))
        return any_, ms, placed_last

    def tail(tok, sts, n, placed_last=False):
        """M5 R7: BASE + one trailing LETTER script stretch (`qout`, `Patm`); a free value WORD that starts
        with the base and continues with letters takes the base styles then the script style. Unique."""
        sl = _stretches(sts)
        if not sl:
            return False
        a = sl[-1][0]
        if not (sl[-1][1] == n and is_script_style(sts[-1]) and a > 0
                and not any(is_script_style(x) for x in sts[:a]) and tok[a:].isalpha() and n - a >= 2
                and not placed_last):
            return False
        base = tok[:a]
        ws = []
        for m_ in re.finditer(r'\S+', value):
            ws_, we_ = m_.start(), m_.end()
            while we_ > ws_ and value[we_ - 1] in EDGE_PUNCT: we_ -= 1
            ws.append((ws_, we_))
        cands = [(ws_, we_) for ws_, we_ in ws
                 if we_ - ws_ > a and value.startswith(base, ws_) and _free(taken, ws_, we_ - ws_)
                 and value[ws_ + a:we_].isalpha()]
        if len(cands) != 1:
            return False
        ws_, we_ = cands[0]
        put(ws_, [(ws_ + k, sts[k]) for k in range(a)] + [(q, sts[-1]) for q in range(ws_ + a, we_)])
        return True

    for t in sorted(tokens, key=lambda t: -len(t['text'])):
        tok, sts = t['text'], t['styles']
        n = len(tok)
        if n == 0 or all(st is None for st in sts):
            continue
        if not t.get('phrase') and suppressed[tok]:
            continue
        # ---- R3: a token spanning an attached FT.line, value echoing the wire's joint space
        if t.get('joints') and not any(_clean(value, i, n) and _free(taken, i, n) for i in _occ(value, tok)):
            js = set(t['joints'])
            pat = ''.join(('(?: ?)' if k in js else '') + re.escape(c) for k, c in enumerate(tok))
            hits = [(m_.start(), m_.end()) for m_ in re.finditer(pat, value)
                    if ' ' in m_.group() and _clean(value, m_.start(), m_.end() - m_.start())
                    and _free(taken, m_.start(), m_.end() - m_.start())]
            if len(hits) == 1:
                i, e = hits[0]
                k = 0
                for q in range(i, e):
                    taken[q] = True
                    if value[q] == ' ' and k in js and tok[k] != ' ' and (q == i or value[q - 1] != ' '):
                        fmt[q] = JOINT
                        continue
                    fmt[q] = sts[k]
                    k += 1
                continue
        if all(st is not None for st in sts):
            if not any(c.isalpha() for c in tok):
                misses.append(_miss(tok, tok, 'no-base'))
                continue
            hits = [i for i in _occ(value, tok) if _clean(value, i, n) and _free(taken, i, n)]
            if t.get('srcplain') and not t.get('phrase'):
                misses.append(_miss(tok, tok, 'ambiguous', len(hits)))
                continue
            if len(hits) == 1:
                i = hits[0]
                put(i, [(i + k, sts[k]) for k in range(n)])
                if t.get('phrase'):
                    suppressed.update(t['parts'])
                continue
            if (not hits and not t.get('phrase') and len(set(sts)) == 1 and sts[0][2]
                    and not is_script_style(sts[0]) and n >= 3 and tok.isalpha()):
                pre = [i for i in _occ(value, tok) if _free(taken, i, n)
                       and (i == 0 or not value[i - 1].isalnum()) and i + n < len(value) and value[i + n].isalpha()]
                if len(pre) == 1:
                    i = pre[0]
                    put(i, [(i + k, sts[k]) for k in range(n)])
                    continue
            if t.get('phrase'):
                continue
            if not hits and tail(tok, sts, n):
                continue
            misses.append(_miss(tok, tok, 'ambiguous' if hits else 'absent', len(hits)))
            continue
        raw = _raw_count(value, tok, taken)
        placed = 0
        for i in _occ(value, tok):
            if _clean(value, i, n) and _free(taken, i, n):
                put(i, [(i + k, sts[k]) for k in range(n)])
                placed += 1
        if placed:
            if raw > placed:
                misses.append(_miss(tok, tok, 'partial', raw))
            continue
        any_, ms, placed_last = stretch_fallback(tok, sts, n)
        if tail(tok, sts, n, placed_last):
            # R7 styled the WHOLE word - every base stretch with its own style, the tail with the script - so a
            # `no-base` / `absent` / `ambiguous` miss for any stretch of this token now contradicts the drawing
            # (an interior base stretch, `H` in `ΔHvap`, included: G21 #8). A `partial` names unformatted glued
            # repeats of a stretch the fallback placed elsewhere, which R7 did not touch, so it is kept.
            ms = [x for x in ms if x[1] == 'partial']
        for stretch, reason, c in ms:
            misses.append(_miss(tok, stretch, reason, c))
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
    drawn from its own first letter and anything a browser lays out differently in a long plain
    prefix lands in a word space. The bound this was sized on (in-formula error <= 0.57 pt instead
    of up to 1.56 pt, c2 Q3) was browser advance ROUNDING, measured before svgout set
    text-rendering="geometricPrecision"; under it Chromium's advances equal compose's linear ones.
    The kern pairs Chromium applied on top (cairo applies none) are removed since §C140 ⑥b, which draws
    every layout segment with font-kerning:none ([USER] ruling (a), 2026-09-17) - on the 34 they drew
    up to 0.99 pt short and never long, though the font's r’/f’ pairs (U+2019) would draw longer. The
    cut is kept as it was; removing it would re-segment every translated LINE that holds a styled
    segment next to a space (compose.line_segments calls this only when a style is present)."""
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
