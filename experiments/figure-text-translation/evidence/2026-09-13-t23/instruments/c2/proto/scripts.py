"""c2 PROTOTYPE (scratch only) - source-keyed formatting transfer carrying GEOMETRY, plus a
wrap-safe word representation. Evidence for the §C140 ② design; not the design itself.

Style of one character: None (plain) or a tuple (ratio, frac, italic):
  ratio  = run size / line base size          (7/9 = 0.7778 for every script in the 34)
  frac   = baseline shift / line base size    (signed; + is UP along the text normal)
  italic = the run's BaseFont is italic/oblique
A character is STYLED iff it is a sub/superscript under the single rule, or italic.
"""
import re, statistics, collections
import figtext as FT

SHIFT_FRAC = 0.12        # 2b's rule: |dproj| > 0.12 * base size  -> sub/sup
EDGE_PUNCT = ',.;:!?'


def line_char_styles(line, fonts):
    """-> (text, [style|None per char], base_size). ONE rule, per FT.lines line."""
    by_size = collections.Counter()
    for r in line:
        by_size[round(r['size'], 1)] += sum(c.isalpha() for c in r['text'])
    if not any(by_size.values()):
        by_size = collections.Counter()
        for r in line:
            by_size[round(r['size'], 1)] += max(1, len(r['text']))
    base = max(by_size.items(), key=lambda kv: (kv[1], kv[0]))[0]
    # c2 FIX: the baseline is the proj carrying the most LETTERS among base-size runs (a weighted
    # mode, clustered to 0.5 pt), NOT 2b's median of base-size runs - the median is the midpoint
    # when a SAME-SIZE script is one of two base-size runs (planted NH4+ probe), which styled 'NH'.
    votes = collections.Counter()
    for r in line:
        if abs(r['size'] - base) < 0.2:
            votes[round(FT.proj(r) * 2) / 2] += max(sum(c.isalpha() for c in r['text']), 0.001 * len(r['text']))
    top = max(votes.items(), key=lambda kv: kv[1])[0]
    base_proj = statistics.median(FT.proj(r) for r in line
                                  if abs(r['size'] - base) < 0.2 and abs(FT.proj(r) - top) <= 0.5)
    text, styles = '', []
    for r in line:
        shift = FT.proj(r) - base_proj
        script = abs(shift) > SHIFT_FRAC * base
        _, italic = FT.run_face(r, fonts)
        st = (round(r['size'] / base, 4), round(shift / base, 4), italic) if (script or italic) else None
        text += r['text']
        styles += [st] * len(r['text'])
    return text, styles, base


def source_tokens(block, fonts):
    """Formatted tokens of a block: maximal non-whitespace stretches containing a styled char,
    edge sentence punctuation trimmed when unstyled (2b's unit)."""
    toks = []
    for li, l in enumerate(FT.lines(block)):
        text, styles, base = line_char_styles(l, fonts)
        for m in re.finditer(r'\S+', text):
            s, e = m.start(), m.end()
            while s < e and text[s] in EDGE_PUNCT and styles[s] is None:
                s += 1
            while e > s and text[e - 1] in EDGE_PUNCT and styles[e - 1] is None:
                e -= 1
            if any(styles[s:e]):
                toks.append(dict(line=li, text=text[s:e], styles=styles[s:e]))
    return toks


def _occ(hay, needle):
    out, i = [], hay.find(needle)
    while i >= 0:
        out.append(i); i = hay.find(needle, i + 1)
    return out


def _clean(hay, i, n):
    b = hay[i - 1] if i > 0 else ''
    a = hay[i + n] if i + n < len(hay) else ''
    return not (b.isalnum() or a.isalnum())


def _stretches(styles):
    out, i = [], 0
    while i < len(styles):
        if styles[i] is None:
            i += 1; continue
        j = i
        while j < len(styles) and styles[j] == styles[i]:
            j += 1
        out.append((i, j)); i = j
    return out


def transfer(tokens, value, all_occurrences=True):
    """-> (fmt per value char, unformatted[]). Never alters `value`.

    all_occurrences=True formats EVERY clean unconsumed exact occurrence of a whole token
    (closes verify N4, the silent partial); False reproduces 2b's first-occurrence prototype."""
    fmt = [None] * len(value)
    taken = [False] * len(value)
    miss = []
    for t in sorted(tokens, key=lambda t: -len(t['text'])):
        tok, sts = t['text'], t['styles']
        if all(st is not None for st in sts):
            # c2 FIX: a token with NO unstyled character (a stacked-split '–', a lone italic 'x')
            # is a bare formatted character - unusable as a search key (2b: '2' x31, 'l' x213).
            miss.append(dict(token=tok, stretch=tok, reason='no-base', candidates=None))
            continue
        hits = [i for i in _occ(value, tok)
                if _clean(value, i, len(tok)) and not any(taken[i:i + len(tok)])]
        # a later hit may overlap an earlier one only if tok is self-overlapping; consume greedily
        placed = 0
        for i in hits:
            if any(taken[i:i + len(tok)]):
                continue
            for k in range(len(tok)):
                taken[i + k] = True
                if sts[k] is not None:
                    fmt[i + k] = sts[k]
            placed += 1
            if not all_occurrences:
                break
        if placed:
            continue
        for s_, e_ in _stretches(sts):
            left = tok[s_ - 1] if s_ > 0 else ''
            if left == '':
                miss.append(dict(token=tok, stretch=tok[s_:e_], reason='no-anchor', candidates=None))
                continue
            needle = left + tok[s_:e_]
            right = tok[e_] if e_ < len(tok) else ''
            cands = [i for i in _occ(value, needle)
                     if not any(taken[i:i + len(needle)])
                     and (i + len(needle) >= len(value) or not value[i + len(needle)].isalnum()
                          or value[i + len(needle)] == right)]
            if len(cands) != 1:
                miss.append(dict(token=tok, stretch=tok[s_:e_],
                                 reason='absent' if not cands else 'ambiguous',
                                 candidates=len(cands)))
                continue
            i = cands[0]
            for k in range(len(left), len(needle)):
                fmt[i + k] = sts[s_ + k - len(left)]; taken[i + k] = True
    return fmt, miss


def words(value, fmt):
    """-> [(word, styles)] with offsets taken from the RAW value, so a transfer computed on the
    raw string survives `wrap()`'s whitespace collapse. Equivalent to value.split() in text."""
    return [(m.group(), fmt[m.start():m.end()]) for m in re.finditer(r'\S+', value)]


def segments(styled_chars):
    """[(char, style)] -> [(text, style)] maximal equal-style runs."""
    out = []
    for ch, st in styled_chars:
        if out and out[-1][1] == st:
            out[-1] = (out[-1][0] + ch, st)
        else:
            out.append((ch, st))
    return out


def split_at_word_edges(segs):
    """c2 variant: a plain segment adjacent to a styled one is cut at its last/first SPACE, so a
    formula word is drawn from its own first letter and browser/cairo advance error from a long
    plain prefix lands in a space instead of between a base letter and its script."""
    out = []
    n = len(segs)
    for i, (t, st) in enumerate(segs):
        if st is not None:
            out.append((t, st)); continue
        pieces = [t]
        if i + 1 < n and segs[i + 1][1] is not None:          # styled follows: cut after last space
            k = pieces[-1].rfind(' ')
            if 0 <= k < len(pieces[-1]) - 1:
                last = pieces.pop(); pieces += [last[:k + 1], last[k + 1:]]
        if i > 0 and segs[i - 1][1] is not None:              # styled precedes: cut before first space
            first = pieces[0]; k = first.find(' ')
            if k > 0:
                pieces = [first[:k], first[k:]] + pieces[1:]
        out += [(pc, None) for pc in pieces if pc]
    return out
