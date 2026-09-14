#!/usr/bin/env python3
"""§C140 ② - figscripts.py, the pure formula-formatting helpers, tested alone.

    PYTHONDONTWRITEBYTECODE=1 python3 test_figscripts.py

Plain asserts and a module-level `fails` list, like its siblings - there is no pytest in this
tree. No cairo, no pdfplumber, no network, no file IO: every run below is a dict literal.

WHERE THE RUNS COME FROM
------------------------
Runs marked REAL are copied from the frozen corpus census
(`evidence/2026-09-13-t23/data/1b-census.jsonl.gz`, rows `row == 'block'`), whose runs are
`[text, size, along, proj, adv, rot, font]`. Every one used here has rot 0, so `x = along`
and `y = proj` exactly. The census carries no per-run BaseFont (only a sorted set per block),
so each REAL run's font is the one a figure-level key -> BaseFont reconstruction assigned (it
agreed with the real meta.json on 51 of 51 resolved keys of the 34 bought figures); the assignment
is stated beside each fixture.

WHAT IS PINNED, AND WHY EACH ONE CAN FAIL
----------------------------------------
* S1 same-size `NH4+` - a median baseline over the two 12 pt runs lands between `NH` and `+`
  and styles `NH` (2b's defect). The letter-weighted mode does not.
* S2 size-only STIX `=` / raised STIX `+` - a larger or same-size run needs 0.13 of the base
  to be a script; a 0.111 raise of an 11 pt STIX `+` is not one (DryCell's `(+)`).
* S3 REAL d-orbital `dz2` - the `2` sits 1.0 pt below `d` on a 9 pt base, 0.111: a flat 0.12
  rule misses it; the size-conditional 0.075 catches it.
* S4 REAL `qout` - `q` is STIXGeneral-Italic 11 pt, `out` is 7 pt: the letter vote picks 7 pt
  and would draw `q` at 11/7 of the label. Unresolvable -> no styles, `inverted-base` named.
* S5 `Patm` - the same inversion, resolvable: base 9, `atm` styled.
* S6 arc - never styled; a size/italic variation is named `arc`.
* S7 REAL stacked splits `HCO3|–` and `NH4|+ (conjugate acid)` - FT.lines splits the charge
  onto its own line, which on its own produces no token at all.
* S8 REAL `3px and 3px` - duplicate tokens name two false `absent` misses unless de-duplicated.
* T* transfer - whole token, repeats, `CO2` not donating `O2`, the anchored fallback, empty
  anchor, glued repeats -> `partial`, Unicode-subscript and name edits -> `absent`.
* B* body size - an 11 pt STIX first run over 9 pt letters is not the label's size.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent          # never process.cwd() - repo rule
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / 'pylibs'))

import figtext as FT                            # noqa: E402
import figscripts as FS                         # noqa: E402

fails = []


def check(label, ok, detail=''):
    print(('  PASS  ' if ok else '  FAIL  ') + label + (': ' + detail if detail else ''), flush=True)
    if not ok:
        fails.append(label)


def attempt(label, fn):
    """Run one arm; an exception is a FAIL of that arm, never a crash of the file."""
    try:
        fn()
    except Exception as e:                      # noqa: BLE001 - reported, not swallowed
        check(label + ' (raised)', False, f'{type(e).__name__}: {e}')


FONTS = {
    'R':  {'base': '/AAAAAA+LiberationSans'},
    'I':  {'base': '/AAAAAA+LiberationSans-Italic'},
    'B':  {'base': '/AAAAAA+LiberationSans-Bold'},
    'SR': {'base': '/BBBBBB+STIXGeneral-Regular'},
    'SI': {'base': '/BBBBBB+STIXGeneral-Italic'},
    # a subset prefix that happens to spell a symbol family must not count
    'PX': {'base': '/STIXCM+LiberationSans'},
}


def run(text, size, x, y, adv=None, font='R', rot=0.0):
    return dict(text=text, size=size, x=x, y=y, rot=rot,
                adv=adv if adv is not None else 0.55 * size * len(text), font=font)


def census(rows, fontmap):
    """REAL census runs -> run dicts. rot is 0 on every fixture, so x = along, y = proj."""
    out = []
    for text, size, along, proj, adv, rot, font in rows:
        assert rot == 0.0, 'fixture must be rot 0 for x=along, y=proj'
        out.append(dict(text=text, size=size, x=along, y=proj, rot=rot, adv=adv,
                        font=fontmap[font]))
    return out


def near(a, b, eps=1e-3):
    return abs(a - b) <= eps


def style_of(text, styles, ch, nth=0):
    idx = [i for i, c in enumerate(text) if c == ch][nth]
    return styles[idx]


SUB = (0.7778, -0.3333, False)
SUP = (0.7778, 0.3333, False)
ITA = (1.0, 0.0, True)


def tok(text, mask):
    """A token from a mask: '.' plain, 'v' subscript, '^' superscript, 'i' italic."""
    assert len(text) == len(mask)
    m = {'.': None, 'v': SUB, '^': SUP, 'i': ITA}
    return {'text': text, 'styles': [m[c] for c in mask]}


def mask(fmt):
    inv = {None: '.', SUB: 'v', SUP: '^', ITA: 'i'}
    return ''.join(inv.get(None if s is None else tuple(s), '?') for s in fmt)


# --------------------------------------------------------------------------------------------
print('S0 is_symbol_run')


def s0():
    check('S0a STIXGeneral-Regular is a symbol run', FS.is_symbol_run(run('=', 11, 0, 0, font='SR'), FONTS))
    check('S0b LiberationSans is not', not FS.is_symbol_run(run('a', 9, 0, 0, font='R'), FONTS))
    check('S0c a subset prefix spelling STIX does not count',
          not FS.is_symbol_run(run('a', 9, 0, 0, font='PX'), FONTS))
    check('S0d an unknown font key is not a symbol run',
          not FS.is_symbol_run(run('a', 9, 0, 0, font='NOPE'), FONTS))


attempt('S0', s0)

# --------------------------------------------------------------------------------------------
print('S1 same-size NH4+ (planted): the baseline is the letter-weighted mode, not the median')


def s1():
    line = [run('NH', 12, 0, 100), run('4', 8, 14, 97), run('+', 12, 18.6, 103)]
    text, styles, base, inv = FS.line_styles(line, FONTS)
    check('S1a text is the joined run text', text == 'NH4+', repr(text))
    check('S1b base 12, not inverted', near(base, 12) and inv is False, f'{base} {inv}')
    check('S1c NH is not styled', styles[0] is None and styles[1] is None, repr(styles[:2]))
    check('S1d the 8 pt 4 is a subscript', styles[2] is not None and near(styles[2][0], 0.6667)
          and near(styles[2][1], -0.25), repr(styles[2]))
    check('S1e the same-size + is a superscript at ratio 1.0, +0.25', styles[3] is not None
          and near(styles[3][0], 1.0) and near(styles[3][1], 0.25) and styles[3][2] is False,
          repr(styles[3]))


attempt('S1', s1)

# --------------------------------------------------------------------------------------------
print('S2 size-only and slightly raised symbol runs are not scripts')


def s2():
    line = [run('a ', 9, 0, 50), run('=', 11, 7, 50, font='SR'), run(' b', 9, 14, 50)]
    text, styles, base, inv = FS.line_styles(line, FONTS)
    check('S2a a size-only STIX = on the baseline is not styled', style_of(text, styles, '=') is None,
          repr(styles))
    check('S2b nothing on that line is styled', all(s is None for s in styles))
    # REAL: CNX_Chem_17_05_DryCell 'Metal top cover (+)' - R18 LiberationSans, R20 STIXGeneral-Regular
    dry = census([['Metal top cover (', 9.0, 133.46, 217.48, 67.03, 0.0, 'PAGE/R18'],
                  ['+', 11.0, 200.49, 218.48, 7.54, 0.0, 'PAGE/R20'],
                  [')', 9.0, 208.02, 218.48, 3.0, 0.0, 'PAGE/R18']],
                 {'PAGE/R18': 'R', 'PAGE/R20': 'SR'})
    text, styles, base, inv = FS.line_styles(dry, FONTS)
    check('S2c REAL DryCell: an 11 pt STIX + raised 1.0 pt (0.111 of 9) is NOT a script',
          style_of(text, styles, '+') is None, repr(style_of(text, styles, '+')))
    # the control that the same-size threshold can fire at all: a 9 pt STIX + raised 1.3 pt = 0.144 >= 0.13
    line = [run('Metal (', 9, 0, 10), run('+', 9, 30, 11.3, font='SR'), run(')', 9, 37, 10)]
    text, styles, base, inv = FS.line_styles(line, FONTS)
    check('S2d control: a same-size STIX + raised 1.3 pt (0.144) IS a script',
          style_of(text, styles, '+') is not None and inv is False, f'{styles} {inv}')
    # ... and the SAME raise on an 11 pt + is a script LARGER than the base: the inversion rule
    # cannot resolve it (no larger non-symbol letter), so the line is left unstyled and named
    line = [run('Metal (', 9, 0, 10), run('+', 11, 30, 11.3, font='SR'), run(')', 9, 37, 10)]
    text, styles, base, inv = FS.line_styles(line, FONTS)
    check('S2e a raised script LARGER than the base inverts the line (all None, inverted)',
          inv is True and all(s is None for s in styles), f'{styles} {inv}')


attempt('S2', s2)

# --------------------------------------------------------------------------------------------
print('S3 REAL d-orbital dz2: a 0.111 raise on a smaller run is a script')

# CNX_Chem_19_03_Dorbital 'dz2' (send:false): TT1 LiberationSans-Italic, TT0 LiberationSans
DZ2 = census([['d', 9.0, 119.87, 7.14, 5.0, 0.0, 'PAGE/TT1'],
              ['z', 7.0, 124.87, 4.14, 3.5, 0.0, 'PAGE/TT1'],
              ['2', 7.0, 128.37, 6.14, 3.89, 0.0, 'PAGE/TT0']],
             {'PAGE/TT1': 'I', 'PAGE/TT0': 'R'})


def s3():
    text, styles, base, inv = FS.line_styles(DZ2, FONTS)
    check('S3a base 9 (d and z tie on letters; the tie goes to the larger size)', near(base, 9.0),
          repr(base))
    check('S3b the 2 at -1.0 pt (0.111) is styled', styles[2] is not None and near(styles[2][1], -0.1111),
          repr(styles[2]))
    check('S3c z is a subscript at -0.3333 and italic', styles[1] is not None and near(styles[1][1], -0.3333)
          and styles[1][2] is True, repr(styles[1]))
    check('S3d d is italic on the baseline', styles[0] is not None and near(styles[0][1], 0.0)
          and near(styles[0][0], 1.0) and styles[0][2] is True, repr(styles[0]))


attempt('S3', s3)

# --------------------------------------------------------------------------------------------
print('S4 REAL Systemqw qout: an inverted base that cannot be resolved is left unstyled and named')

# CNX_Chem_05_03_Systemqw 'qout' (send:true): T1_1 STIXGeneral-Italic, TT0 LiberationSans
QOUT = census([['q', 11.0, 61.96, 108.06, 5.5, 0.0, 'PAGE/T1_1'],
               ['out', 7.0, 67.46, 106.06, 9.73, 0.0, 'PAGE/TT0']],
              {'PAGE/T1_1': 'SI', 'PAGE/TT0': 'R'})


def s4():
    text, styles, base, inv = FS.line_styles(QOUT, FONTS)
    check('S4a inverted is True', inv is True, repr(inv))
    check('S4b every style is None (q is not drawn at 11/7 of the label)', all(s is None for s in styles),
          repr(styles))
    toks, miss = FS.source_tokens(QOUT, FONTS)
    check('S4c no token', toks == [], repr(toks))
    check('S4d one inverted-base miss naming qout',
          [(m['reason'], m['token']) for m in miss] == [('inverted-base', 'qout')], repr(miss))


attempt('S4', s4)

# --------------------------------------------------------------------------------------------
print('S5 Patm: an inverted base that resolves to the largest letter size')


def s5():
    line = [run('P', 9, 0, 20), run('atm', 7, 6, 18)]
    text, styles, base, inv = FS.line_styles(line, FONTS)
    check('S5a resolves: inverted False, base 9', inv is False and near(base, 9.0), f'{base} {inv}')
    check('S5b P is plain', styles[0] is None, repr(styles[0]))
    check('S5c atm is a subscript at 7/9, -2/9', all(s is not None and near(s[0], 0.7778) and near(s[1], -0.2222)
                                                   for s in styles[1:]), repr(styles[1:]))
    # REAL: CNX_Chem_09_01_Manometer 'Patm': R126 LiberationSans-Italic, R124 LiberationSans
    real = census([['P', 9.0, 233.28, 166.93, 6.0, 0.0, 'PAGE/R126'],
                   ['atm', 6.75, 239.28, 164.93, 11.25, 0.0, 'PAGE/R124']],
                  {'PAGE/R126': 'I', 'PAGE/R124': 'R'})
    text, styles, base, inv = FS.line_styles(real, FONTS)
    check('S5d REAL Manometer Patm resolves to base 9 with atm styled and P italic',
          inv is False and near(base, 9.0) and styles[0] == ITA
          and all(s is not None and near(s[0], 0.75) and near(s[1], -0.2222) for s in styles[1:]),
          f'{base} {inv} {styles}')
    toks, miss = FS.source_tokens(real, FONTS)
    check('S5e REAL Patm: one token, no miss', [t['text'] for t in toks] == ['Patm'] and miss == [],
          f'{toks} {miss}')


attempt('S5', s5)

# --------------------------------------------------------------------------------------------
print('S6 arc blocks are never styled')


def s6():
    import math
    def arc_block(italic_at=None, size_at=None):
        out = []
        for i, ch in enumerate('Label'):
            th = math.radians(60 + 12 * i)
            out.append(run(ch, 11.0 if i == size_at else 9.0, 100 + 40 * math.cos(th),
                           100 + 40 * math.sin(th), adv=5.0, font='I' if i == italic_at else 'R',
                           rot=12 * i - 30))
        return out
    plain = arc_block()
    check('S6-pre FT.is_arc on the planted block', FT.is_arc(plain))
    toks, miss = FS.source_tokens(plain, FONTS)
    check('S6a a plain arc: no tokens, no miss', toks == [] and miss == [], f'{toks} {miss}')
    toks, miss = FS.source_tokens(arc_block(italic_at=2), FONTS)
    check('S6b an arc with an italic glyph: no tokens, one arc miss naming the joined text',
          toks == [] and [(m['reason'], m['token']) for m in miss] == [('arc', 'Label')], f'{toks} {miss}')
    toks, miss = FS.source_tokens(arc_block(size_at=3), FONTS)
    check('S6c an arc with a size change: no tokens, one arc miss',
          toks == [] and [m['reason'] for m in miss] == ['arc'], f'{toks} {miss}')


attempt('S6', s6)

# --------------------------------------------------------------------------------------------
print('S7 REAL stacked splits attach to the previous line for tokens only')

# CNX_Chem_13_00_Blood 'CO2 + H2O … HCO3 –' (send:true): TT0 LiberationSans-Bold
BLOOD = census([['CO', 9.0, 163.82, 82.1, 13.5, 0.0, 'PAGE/TT0'], ['2 ', 7.0, 177.32, 79.1, 5.84, 0.0, 'PAGE/TT0'],
                ['+ H', 9.0, 183.16, 82.1, 14.26, 0.0, 'PAGE/TT0'], ['2', 7.0, 197.42, 79.1, 3.89, 0.0, 'PAGE/TT0'],
                ['O              H', 9.0, 201.31, 82.1, 48.53, 0.0, 'PAGE/TT0'],
                ['2', 7.0, 249.82, 79.1, 3.89, 0.0, 'PAGE/TT0'], ['CO', 9.0, 253.71, 82.1, 13.5, 0.0, 'PAGE/TT0'],
                ['3', 7.0, 267.21, 79.1, 3.89, 0.0, 'PAGE/TT0'],
                ['                      ', 5.25, 271.1, 79.1, 32.09, 0.0, 'PAGE/TT0'],
                ['HCO', 9.0, 303.17, 82.1, 20.0, 0.0, 'PAGE/TT0'], ['3', 7.0, 323.17, 79.1, 3.89, 0.0, 'PAGE/TT0'],
                ['–', 7.0, 325.66, 86.1, 3.89, 0.0, 'PAGE/TT0']],
               {'PAGE/TT0': 'B'})
# CNX_Chem_14_01_conjugate_img 'NH4|+ (conjugate acid)' (send:true): Fm10/TT0 LiberationSans
CONJ = census([['NH', 9.0, 244.92, 122.32, 13.0, 0.0, 'PAGE/Fm10/TT0'],
               ['4', 7.0, 257.92, 119.32, 3.89, 0.0, 'PAGE/Fm10/TT0'],
               ['+', 7.0, 261.81, 126.32, 4.09, 0.0, 'PAGE/Fm10/TT0'],
               [' (conjugate acid)', 9.0, 265.9, 122.32, 66.53, 0.0, 'PAGE/Fm10/TT0']],
              {'PAGE/Fm10/TT0': 'R'})


def s7():
    check('S7-pre FT.lines splits Blood into 2 lines, the second only the charge',
          [''.join(r['text'] for r in l) for l in FT.lines(BLOOD)][-1] == '–', repr(FT.lines(BLOOD)[-1]))
    check('S7-pre FT.lines splits conjugate into 2 lines',
          [''.join(r['text'] for r in l) for l in FT.lines(CONJ)] == ['NH4', '+ (conjugate acid)'])
    check('S7a token_lines attaches the Blood charge', len(FS.token_lines(BLOOD, FONTS)) == 1,
          repr([''.join(r['text'] for r in l) for l in FS.token_lines(BLOOD, FONTS)]))
    check('S7a2 token_lines(block) is callable without fonts', len(FS.token_lines(CONJ)) == 1)
    toks, miss = FS.source_tokens(BLOOD, FONTS)
    by = {t['text']: t for t in toks}
    check('S7b Blood tokens include HCO3– and no miss', 'HCO3–' in by and miss == [],
          f'{sorted(by)} {miss}')
    if 'HCO3–' in by:
        st = by['HCO3–']['styles']
        check('S7c the charge is a superscript +4/9, the 3 a subscript -3/9',
              st[4] is not None and near(st[4][1], 0.4444) and st[3] is not None and near(st[3][1], -0.3333),
              repr(st))
    toks, miss = FS.source_tokens(CONJ, FONTS)
    check('S7d conjugate token NH4+ with + superscripted', [t['text'] for t in toks] == ['NH4+']
          and toks[0]['styles'][3] is not None and near(toks[0]['styles'][3][0], 0.7778)
          and near(toks[0]['styles'][3][1], 0.4444), f'{toks} {miss}')
    check('S7e conjugate: no miss', miss == [], repr(miss))
    # the key must not move: FT.lines is untouched by token_lines
    check('S7f FT.lines still returns 2 lines after token_lines ran', len(FT.lines(CONJ)) == 2)
    # a charge line that does NOT continue the previous line is named `stacked`
    lone = [run('Mass of HCO', 9, 50, 100), run('–', 7, 10, 89)]
    check('S7-pre the planted lone charge is its own FT.lines line', len(FT.lines(lone)) == 2)
    toks, miss = FS.source_tokens(lone, FONTS)
    check('S7g a non-continuing charge-only line is named stacked',
          [(m['reason'], m['token']) for m in miss] == [('stacked', '–')] and toks == [], f'{toks} {miss}')


attempt('S7', s7)

# --------------------------------------------------------------------------------------------
print('S8 tokens: de-duplication and edge trimming')

# CNX_Chem_08_04_AOtype_img '3px and 3px' (send:true): TT0 LiberationSans, TT1 LiberationSans-Italic
AOTYPE = census([['3', 9.0, 49.59, 21.73, 5.0, 0.0, 'PAGE/TT0'], ['p', 9.0, 54.6, 21.73, 5.0, 0.0, 'PAGE/TT1'],
                 ['x', 7.0, 59.61, 18.73, 3.5, 0.0, 'PAGE/TT1'], [' and 3', 9.0, 63.11, 21.73, 25.02, 0.0, 'PAGE/TT0'],
                 ['p', 9.0, 88.13, 21.73, 5.0, 0.0, 'PAGE/TT1'], ['x', 7.0, 93.13, 18.73, 3.5, 0.0, 'PAGE/TT1']],
                {'PAGE/TT0': 'R', 'PAGE/TT1': 'I'})


def s8():
    toks, miss = FS.source_tokens(AOTYPE, FONTS)
    check('S8a REAL 3px and 3px: ONE token', [t['text'] for t in toks] == ['3px'], repr(toks))
    fmt, tmiss = FS.transfer(toks, '3px og 3px')
    check('S8b both occurrences formatted, no false absent', mask(fmt)[0:3] == mask(fmt)[7:10]
          and fmt[1] is not None and fmt[2] is not None and tmiss == [], f'{fmt} {tmiss}')
    line = [run('Mass of (H', 9, 0, 0), run('2', 7, 50, -3), run('O), and', 9, 54, 0),
            run(' N', 9, 90, 0), run('2', 7, 97, -3), run(',', 7, 101, -3), run('.', 9, 104, 0)]
    toks, miss = FS.source_tokens(line, FONTS)
    got = [t['text'] for t in toks]
    check('S8c unstyled edge , is trimmed and ( is kept', '(H2O)' in got, repr(got))
    check('S8d a STYLED edge , is kept, an unstyled edge . trimmed', 'N2,' in got, repr(got))
    check('S8e the trimmed token keeps its styles aligned', all(len(t['styles']) == len(t['text']) for t in toks))
    plain = [run('Nothing to style here', 9, 0, 0)]
    toks, miss = FS.source_tokens(plain, FONTS)
    check('S8f a plain label yields no tokens and no misses', toks == [] and miss == [], f'{toks} {miss}')


attempt('S8', s8)

# --------------------------------------------------------------------------------------------
print('S9 a BLANK run cannot invert a line (found by the corpus run, not planned)')

# CNX_Chem_17_04_Relation 'E°cell = (    )ln K' (send:true). T1_0 is STIXGeneral-Regular; the census
# cannot tell TT0 from TT1 (LiberationSans / -Italic), so both are drawn R here - the inversion
# decision does not read italic. The 15 pt run of four spaces sits 5 pt low.
RELATION = census([['E', 9.0, 147.43, 66.83, 6.0, 0.0, 'PAGE/TT0'], ['°', 9.0, 153.43, 66.83, 3.6, 0.0, 'PAGE/TT1'],
                   ['cell', 7.0, 157.03, 63.83, 10.5, 0.0, 'PAGE/TT0'], [' ', 9.0, 167.53, 66.83, 2.5, 0.0, 'PAGE/TT1'],
                   ['=', 11.0, 170.03, 66.83, 7.54, 0.0, 'PAGE/T1_0'], [' ', 9.0, 177.57, 66.83, 2.5, 0.0, 'PAGE/TT1'],
                   ['(', 15.93, 180.07, 65.83, 3.0, 0.0, 'PAGE/TT1'], ['    ', 15.0, 183.07, 61.83, 16.68, 0.0, 'PAGE/TT1'],
                   [')', 15.93, 199.74, 65.83, 3.0, 0.0, 'PAGE/TT1'], ['ln ', 9.0, 202.73, 66.83, 9.5, 0.0, 'PAGE/TT1'],
                   ['K', 9.0, 212.24, 66.83, 6.0, 0.0, 'PAGE/TT0']],
                  {'PAGE/TT0': 'R', 'PAGE/TT1': 'R', 'PAGE/T1_0': 'SR'})


def s9():
    check('S9-pre one FT.lines line', len(FT.lines(RELATION)) == 1)
    text, styles, base, inv = FS.line_styles(RELATION, FONTS)
    check('S9a REAL Relation: not inverted, base 9', inv is False and near(base, 9.0), f'{base} {inv}')
    check('S9b cell is a subscript', style_of(text, styles, 'c') is not None
          and near(style_of(text, styles, 'c')[1], -0.3333), repr(style_of(text, styles, 'c')))
    toks, miss = FS.source_tokens(RELATION, FONTS)
    check('S9c token E°cell, no inverted-base miss', 'E°cell' in [t['text'] for t in toks] and miss == [],
          f'{toks} {miss}')


attempt('S9', s9)

# --------------------------------------------------------------------------------------------
print('S10 a line with NO letters resolves an inversion on its largest glyph run')

# CNX_Chem_14_02_phscale '10–10' and '10–1' (send:false): TT1 LiberationSans
PH10 = census([['10', 9.0, 27.86, 122.96, 10.01, 0.0, 'PAGE/TT1'], ['–10', 7.0, 37.87, 126.96, 11.68, 0.0, 'PAGE/TT1']],
              {'PAGE/TT1': 'R'})
PH1 = census([['10', 9.0, 27.86, 319.79, 10.01, 0.0, 'PAGE/TT1'], ['–1', 7.0, 37.87, 323.79, 7.78, 0.0, 'PAGE/TT1']],
             {'PAGE/TT1': 'R'})


def s10():
    text, styles, base, inv = FS.line_styles(PH1, FONTS)
    check('S10-control 10–1 (2 chars each, tie -> 9 pt) is plain 10 + superscript –1',
          inv is False and near(base, 9.0) and styles[0] is None and styles[2] is not None
          and near(styles[2][1], 0.4444), f'{base} {inv} {styles}')
    text, styles, base, inv = FS.line_styles(PH10, FONTS)
    check('S10a 10–10 (the 7 pt run has MORE characters) resolves to base 9, not inverted',
          inv is False and near(base, 9.0), f'{base} {inv}')
    check('S10b ... 10 plain, –10 superscript at +4/9', styles[0] is None and styles[1] is None
          and all(s is not None and near(s[1], 0.4444) for s in styles[2:]), repr(styles))


attempt('S10', s10)

# --------------------------------------------------------------------------------------------
print('T transfer')


def t_all():
    c7 = tok('C7H5NO3S', '.v.v..v.')
    v = 'Mól af C7H5NO3S (mól)'
    fmt, miss = FS.transfer([c7], v)
    check('T1 whole token placed, no miss', mask(fmt) == '........v.v..v.......' and miss == [],
          f'{mask(fmt)} {miss}')
    check('T1b fmt is aligned 1:1 with the value', len(fmt) == len(v))

    v = 'Massi C7H5NO3S og C7H5NO3S (g)'
    fmt, miss = FS.transfer([c7], v)
    check('T2 a repeated formula is formatted twice', mask(fmt).count('v') == 6 and miss == [],
          f'{mask(fmt)} {miss}')

    co2 = tok('CO2', '..v'); o2 = tok('O2', '.v')
    v = 'CO2, H2O og aðrar'
    fmt, miss = FS.transfer([o2, co2], v)
    check('T3a CO2 formatted', fmt[2] is not None, mask(fmt))
    check('T3b CO2 does not donate its O2 and H2O gains nothing', fmt[6] is None, mask(fmt))
    check('T3c O2 named absent', [(m['token'], m['stretch'], m['reason']) for m in miss] == [('O2', '2', 'absent')],
          repr(miss))

    mol = tok('(mol–1)', '....^^.')
    v = 'Margfalda með tölu Avogadros (mól–1)'
    fmt, miss = FS.transfer([mol], v)
    check('T4 anchored fallback l–1 placed on – and 1 only', mask(fmt)[-3:] == '^^.' and mask(fmt).count('^') == 2
          and miss == [], f'{mask(fmt)} {miss}')

    fmt, miss = FS.transfer([tok('–', '^')], 'Styrkur HCO3 – jóna')
    check('T5a a non-letter all-styled token is no-base and never searched bare',
          [m['reason'] for m in miss] == ['no-base'] and all(s is None for s in fmt), f'{mask(fmt)} {miss}')
    fmt, miss = FS.transfer([tok('^2H', '^^.')], 'Massi 2H og ekkert')
    check('T5b a leading styled stretch with an empty anchor is no-base, nothing placed',
          [m['reason'] for m in miss] == ['no-base'] and all(s is None for s in fmt), f'{mask(fmt)} {miss}')
    r = tok('r', 'i')
    fmt, miss = FS.transfer([r], 'Radíus r')
    check('T5c a letter-only all-styled token at a clean unique occurrence is placed',
          mask(fmt) == '.......i' and miss == [], f'{mask(fmt)} {miss}')
    fmt, miss = FS.transfer([r], 'r og r')
    check('T5d ... two clean occurrences -> ambiguous, nothing placed',
          [(m['reason'], m['candidates']) for m in miss] == [('ambiguous', 2)] and all(s is None for s in fmt),
          f'{mask(fmt)} {miss}')
    fmt, miss = FS.transfer([r], 'Hraði')
    check('T5e ... glued only -> absent', [m['reason'] for m in miss] == ['absent'], repr(miss))

    v = '(mól–1mól–1)'
    fmt, miss = FS.transfer([mol], v)
    check('T6a glued anchored repeat is named partial', [m['reason'] for m in miss] == ['partial'], repr(miss))
    check('T6b ... the value is not altered and fmt stays aligned', len(fmt) == len(v))

    na = tok('Na3PO4', '..v..v')
    v = 'Na3PO4Na3PO4'
    fmt, miss = FS.transfer([na], v)
    got = sorted((m['stretch'], m['reason']) for m in miss)
    check("T7 planted Na3PO4Na3PO4 -> '3' ambiguous, '4' partial", got == [('3', 'ambiguous'), ('4', 'partial')],
          repr(miss))

    h2o = tok('H2O', '.v.')
    v = 'H2OH2O og H2O'
    fmt, miss = FS.transfer([h2o], v)
    check('T7b whole token: glued repeats beside a clean one -> placed once and named partial',
          mask(fmt) == '...........v.' and [(m['reason'], m['candidates']) for m in miss] == [('partial', 3)],
          f'{mask(fmt)} {miss}')

    fmt, miss = FS.transfer([c7], 'Mól af C₇H₅NO₃S (mól)')
    check('T8 a Unicode-subscript edit -> absent (3 stretches), nothing placed',
          [m['reason'] for m in miss] == ['absent'] * 3 and all(s is None for s in fmt), f'{mask(fmt)} {miss}')

    fmt, miss = FS.transfer([c7], 'Fjöldi sakkarínsameinda')
    check('T9 a formula replaced by a name -> absent, nothing placed',
          miss and all(m['reason'] == 'absent' for m in miss) and all(s is None for s in fmt), repr(miss))

    fmt, miss = FS.transfer([], 'Engin formúla')
    check('T10 no tokens: every char None, no miss', fmt == [None] * len('Engin formúla') and miss == [])

    # longest first: C8H18 must win its positions before H18 could be searched
    fmt, miss = FS.transfer([tok('H18', '.vv'), tok('C8H18', '.v.vv')], 'Massi C8H18')
    check('T11 longest token first; the shorter overlapping token is not double-placed',
          mask(fmt) == '.......v.vv' and [m['token'] for m in miss] == ['H18'], f'{mask(fmt)} {miss}')


attempt('T', t_all)

# --------------------------------------------------------------------------------------------
print('B body_size')


def b_all():
    # REAL shape: CNX_Chem_06_01_Frequency 'ν1 = 3 cycles per second = 3 hertz'
    # R11 STIXGeneral-Italic, R9 LiberationSans, R13 STIXGeneral-Regular
    freq = census([['ν', 11.0, 7.32, 146.07, 5.17, 0.0, 'PAGE/R11'], ['1 ', 7.0, 12.49, 144.07, 5.84, 0.0, 'PAGE/R9'],
                   ['=', 9.0, 18.33, 146.07, 6.17, 0.0, 'PAGE/R13'],
                   [' 3 cycles per second ', 9.0, 24.49, 146.07, 84.54, 0.0, 'PAGE/R9'],
                   ['=', 9.0, 109.03, 146.07, 6.17, 0.0, 'PAGE/R13'], [' 3 hertz', 9.0, 115.2, 146.07, 30.02, 0.0, 'PAGE/R9']],
                  {'PAGE/R11': 'SI', 'PAGE/R9': 'R', 'PAGE/R13': 'SR'})
    check('B1 an 11 pt STIX first run over 9 pt letters -> body size 9',
          near(FS.body_size(freq, FONTS), 9.0) and freq[0]['size'] == 11.0, repr(FS.body_size(freq, FONTS)))
    check('B2 no letters in non-symbol runs -> the first run size',
          near(FS.body_size([run('=', 11, 0, 0, font='SR'), run('10', 9, 8, 0)], FONTS), 11.0))
    check('B3 tie on letters -> the larger size',
          near(FS.body_size([run('ab', 9, 0, 0), run('cd', 7, 12, -2)], FONTS), 9.0))
    # [F6] B3 is now decided inside line_styles (one line, base 9, so all 4 letters vote 9); the body-level tie is
    # kept exercised by two SEPARATE lines with bases 9 and 7 and 2 letters each.
    two = [run('ab', 9, 0, 0), run('cd', 7, 0, -40)]
    check('B3b [F6] a tie between two LINES\' bases -> the larger size',
          len(FT.lines(two)) == 2 and near(FS.body_size(two, FONTS), 9.0), f'{len(FT.lines(two))} {FS.body_size(two, FONTS)}')
    # [F6] REAL CNX_Chem_09_01_Manometer 'Patm' (the S5d runs): P 9 pt italic, atm 6.75 pt. Counted at their own
    # sizes 'atm' outvotes 'P' 3:1 and the label would be drawn at 6.75; line_styles resolves the line to base 9 and
    # states atm's ratio (0.75) relative to 9, so the body size must be 9.
    patm = census([['P', 9.0, 233.28, 166.93, 6.0, 0.0, 'PAGE/R126'],
                   ['atm', 6.75, 239.28, 164.93, 11.25, 0.0, 'PAGE/R124']],
                  {'PAGE/R126': 'I', 'PAGE/R124': 'R'})
    check('B5 [F6] REAL Manometer Patm -> body size 9.0 (its line\'s resolved base), not the 6.75 subscript',
          near(FS.body_size(patm, FONTS), 9.0), repr(FS.body_size(patm, FONTS)))
    # [F6] an UNRESOLVABLE inverted line votes at its letter-vote base: REAL qout (S4) -> 7.0 - not block[0]'s 11 pt
    # STIX q (what skipping inverted lines would fall back to), and not a size the line never resolved to.
    check('B6 [F6] REAL qout (inverted, unresolved) -> body size 7.0, its letter-vote base',
          near(FS.body_size(QOUT, FONTS), 7.0), repr(FS.body_size(QOUT, FONTS)))
    text, styles, base, inv = FS.line_styles(freq, FONTS)
    check('B4 REAL Frequency line: nu italic, 1 subscript, = plain', style_of(text, styles, 'ν') is not None
          and style_of(text, styles, 'ν')[2] is True and style_of(text, styles, '1') is not None
          and near(style_of(text, styles, '1')[1], -0.2222) and style_of(text, styles, '=') is None,
          repr(styles[:4]))


attempt('B', b_all)

# --------------------------------------------------------------------------------------------
print('W words / segments / split_at_word_edges')


def w_all():
    v = '  Mól af  C7H5NO3S (mól) '
    fmt, _ = FS.transfer([tok('C7H5NO3S', '.v.v..v.')], v)
    ws = FS.words(v, fmt)
    check('W1 words == value.split() in text', [w for w, _ in ws] == v.split(), repr(ws))
    check('W2 styles travel with their word', mask(dict(ws)['C7H5NO3S']) == '.v.v..v.', repr(ws))
    segs = FS.segments([(c, None) for c in 'ab'] + [('2', SUB), ('3', SUB), ('c', None)])
    check('W3 segments are maximal equal-style runs', segs == [('ab', None), ('23', SUB), ('c', None)], repr(segs))
    cut = FS.split_at_word_edges([('Massi af H', None), ('2', SUB), ('O og meira', None)])
    check('W4 plain text next to a styled segment is cut at the adjacent space',
          cut == [('Massi af ', None), ('H', None), ('2', SUB), ('O', None), (' og meira', None)], repr(cut))
    check('W5 the cut never changes the text',
          ''.join(t for t, _ in cut) == 'Massi af H2O og meira')


attempt('W', w_all)

print('\nALL PASS' if not fails else f'\n{len(fails)} FAILED: ' + ', '.join(fails))
sys.exit(1 if fails else 0)
