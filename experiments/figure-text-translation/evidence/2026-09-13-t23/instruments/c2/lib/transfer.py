#!/usr/bin/env python3
"""Prototype (scratch only): transfer SOURCE-run formatting into a translated value.

Rules: tokens come from the read-only source runs (analyse.tokens). Longest token first;
match only CLEAN occurrences (not glued to a letter/digit); each value position consumed
once. A token with no clean exact occurrence falls back to its script STRETCHES, each
anchored on its preceding base char (e.g. 'l–1'), also clean-right and consumed once.
Anything unplaced is NAMED in `unformatted`; the value is never altered.
"""
import json, re, sys
import analyse as A


def transfer(tokens, value):
    fmt = [None] * len(value)          # per value char: None | 'v' | '^' | 'i'
    taken = [False] * len(value)
    unformatted, placed = [], []
    for t in sorted(tokens, key=lambda t: -len(t['text'])):
        tok, m = t['text'], t['mask']
        hit = None
        for i in A.occurrences(value, tok):
            if A.is_clean(value, i, len(tok)) and not any(taken[i:i + len(tok)]):
                hit = i; break
        if hit is not None:
            for k, c in enumerate(m):
                taken[hit + k] = True
                if c in 'v^i':
                    fmt[hit + k] = c
            placed.append((tok, 'token', hit)); continue
        ok = True
        for s_, e_, kind in A.stretches(m):
            left = tok[s_ - 1] if s_ > 0 else ''
            needle = left + tok[s_:e_]
            right_char = tok[e_] if e_ < len(tok) else ''
            cands = [i for i in A.occurrences(value, needle)
                     if not any(taken[i:i + len(needle)])
                     and (i + len(needle) >= len(value) or not value[i + len(needle)].isalnum()
                          or value[i + len(needle)] == right_char)]
            if len(cands) != 1:        # ambiguous or absent -> refuse to guess
                ok = False; unformatted.append(dict(token=tok, stretch=tok[s_:e_], candidates=len(cands)))
                continue
            i = cands[0]
            for k in range(len(left), len(needle)):
                fmt[i + k] = kind; taken[i + k] = True
            placed.append((tok, 'stretch', i))
    return fmt, placed, unformatted


def show(value, fmt):
    SUB = str.maketrans('0123456789+-–', '₀₁₂₃₄₅₆₇₈₉₊₋₋')
    SUP = str.maketrans('0123456789+-–', '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁻')
    out = []
    for ch, f in zip(value, fmt):
        out.append(ch.translate(SUB) if f == 'v' else ch.translate(SUP) if f == '^'
                   else f'_{ch}_' if f == 'i' else ch)
    return ''.join(out)


if __name__ == '__main__':
    rows = [json.loads(l) for l in open(A.OUTJ)]
    T = [r for r in rows if r['state'] == 'translated' and r['first'] and r['tokens']]
    tot_str = placed_str = 0; misses = []
    for r in T:
        fmt, placed, un = transfer(r['tokens'], r['value'])
        want = sum(len(A.stretches(t['mask'])) for t in r['tokens'])
        got_chars = sum(1 for f in fmt if f)
        want_chars = sum(sum(c in 'v^i' for c in t['mask']) for t in r['tokens'])
        tot_str += want; placed_str += want - len(un)
        print(f"{r['basename'][9:]:28} {r['value']!r:45} -> {show(r['value'], fmt)!r}  "
              f"chars {got_chars}/{want_chars} unformatted={un}")
        misses += un
    print('\nstretches placed', placed_str, 'of', tot_str, '; blocks', len(T), '; misses', misses)

    # identity control: an IS==EN value must reproduce the source mask EXACTLY, char for char
    I = [r for r in rows if r['state'] in ('identical',) and r['first'] and r['tokens']]
    for r in I:
        fmt, placed, un = transfer(r['tokens'], r['value'])
        src = ''.join(r['masks'])  # single-line identity blocks here
        mine = ''.join(f if f else '.' for f in fmt)
        srcm = re.sub('[s]', '.', src)
        print('IDENTITY', r['basename'][9:], 'mask-equal' if mine == srcm else f'DIFF\n  src {srcm}\n  got {mine}', un)

    # editor-edit robustness: plant edits into real values; each must be NAMED, never mis-placed
    probes = [
        ('CNX_Chem_03_02_sacch_img-3278', 'Mól af C7H5NO3S (mól)', 'Mól af C₇H₅NO₃S (mól)'),   # editor types unicode subscripts
        ('CNX_Chem_03_02_sacch_img-3278', 'Mól af C7H5NO3S (mól)', 'Mól af sakkaríni (mól)'),  # editor replaces formula by name
        ('CNX_Chem_04_05_combustion', 'CO2, H2O, O2 og aðrar lofttegundir', 'CO2, H2O og aðrar lofttegundir'),  # O2 dropped; CO2 must NOT donate
        ('CNX_Chem_03_02_copperMoles_img-a962', 'Margfaldaðu með tölu Avogadros (mól–1)', 'Margfaldaðu með tölu Avogadros (mól−1)'),  # U+2212
    ]
    for bn, orig, edited in probes:
        r = next(x for x in T if x['basename'] == bn and x['value'] == orig)
        fmt, placed, un = transfer(r['tokens'], edited)
        print('PROBE', repr(edited), '->', repr(show(edited, fmt)), 'unformatted=', un)
