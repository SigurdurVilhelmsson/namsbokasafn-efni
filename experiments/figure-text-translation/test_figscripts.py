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
is stated beside each fixture. The M5 section's COVAL, NPENT and TRANS are census rows too; its RVAR
and H2 are SYNTHETIC (round coordinates, default `adv`) and are labelled so.

WHAT IS PINNED, AND WHY EACH ONE CAN FAIL
----------------------------------------
* S1 same-size `NH4+` - a median baseline over the two 12 pt runs lands between `NH` and `+`
  and styles `NH` (2b's defect). The letter-weighted mode does not.
* S2 size-only STIX `=` / raised STIX `+` - a larger or same-size run needs 0.13 of the base
  to be a script; a 0.111 raise of an 11 pt STIX `+` is not one (DryCell's `(+)`).
* S3 REAL d-orbital `dz2` - the `2` sits 1.0 pt below `d` on a 9 pt base, 0.111: a flat 0.12
  rule misses it; the size-conditional 0.075 catches it.
* S4 REAL `qout` - `q` is STIXGeneral-Italic 11 pt, `out` is 7 pt: the letter vote picks 7 pt
  and would draw `q` at 11/7 of the label. Re-pinned for §C140 '6' M5 R1 ([USER] ruling R-11): the
  base letter may itself be a SYMBOL run, so the line resolves on `q` - base 11, `q` italic on the
  baseline, `out` a subscript, one token `qout`, no `inverted-base` miss. Before R1 it was left unstyled.
* S5 `Patm` - the same inversion, resolvable: base 9, `atm` styled.
* S6 arc - never styled; a size/italic variation is named `arc`.
* S7 REAL stacked splits `HCO3|–` and `NH4|+ (conjugate acid)` - FT.lines splits the charge
  onto its own line, which on its own produces no token at all.
* S8 REAL `3px and 3px` - duplicate tokens name two false `absent` misses unless de-duplicated.
* V §C140 ㉑ REAL Nitrogen / conjugate / Blood - `figtext.visual_lines` merges a stacked charge or a same-size
  superscript into ONE visual line (V1-V4); a genuine two-line label does not merge (V5); FT.lines and `block_key`
  still split (V6, V7); the threshold is 0.6 of a lead (V8); an arc is never merged (V9); the measured CbcCltPckd
  `C|B|A` over-merge is pinned (V10); the threshold scales with the LARGER first-run size (V11).
* T* transfer - whole token, repeats, `CO2` not donating `O2`, the anchored fallback, empty
  anchor, glued repeats -> `partial`, Unicode-subscript and name edits -> `absent`.
* B* body size - an 11 pt STIX first run over 9 pt letters is not the label's size.
* HS §C140 ㊾ D5(a) REAL MolSpeed1 / phscale / buffer / OxStNonmts - `is_script_style` restates the script rule on
  ONE style (heldplan's source-script pool): their sub, sup and charge are scripts, OxStNonmts' italic-only STIX
  charge is not, and both thresholds and the strict ratio boundary hold (HS1); every NON-italic style
  `source_tokens` emits on this file's REAL fixtures is a script by it, a 0.111 drop included (HS2).
* M5 §C140 '6' ([USER] rulings R-9, R-10, R-11; spec
  docs/superpowers/specs/2026-10-05-c140-composer-formatting-class-design.md D-f) - the seven narrow
  script-transfer rules, each placing a style only where it can pin it to exactly ONE occurrence. Rule
  arms (each FAILS on the composer before M5): R2 a glued same-visual-line continuation attaches for
  tokens (R2a, R2b); R3 the MT wire's joint space is marked FS.JOINT (R3a, R3b); R4 a leading italic
  prefix is placed by its right anchor (R4a); R5 a styled run spanning a space is a phrase token, and
  R5b refuses a token that also stands plain in its source line (R5a, R5b); R6 an italic compound
  prefix (R6a); R7 a translated script tail (R7 qút, R7 qinn, R7c). R1 is S4 and B6 above. Every
  `C*` arm is a CONTROL - it passes before and after M5 - pinning what each rule must NOT do. All M5
  assertions read styles through `lab()`, which classifies by `is_script_style` and the italic flag
  rather than by an exact tuple, and checks FS.JOINT first.
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


_NO_JOINT = object()                            # a module without FS.JOINT (pre-M5) matches nothing


def lab(st):
    """One style -> one character, by CLASS rather than exact tuple (M5): '.' plain, 'J' FS.JOINT,
    '_' / '^' a script (`is_script_style`) below / above the baseline, 'i' italic, '?' anything else.
    JOINT is tested FIRST: it is a bare object(), and indexing it raises."""
    if st is None:
        return '.'
    if st is getattr(FS, 'JOINT', _NO_JOINT):
        return 'J'
    if FS.is_script_style(st):
        return '_' if st[1] < 0 else '^'
    return 'i' if st[2] else '?'


def lmask(fmt):
    return ''.join(lab(s) for s in fmt)


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
print('S4 REAL Systemqw qout: an inverted base resolves on the symbol base letter (M5 R1)')

# CNX_Chem_05_03_Systemqw 'qout' (send:true): T1_1 STIXGeneral-Italic, TT0 LiberationSans
QOUT = census([['q', 11.0, 61.96, 108.06, 5.5, 0.0, 'PAGE/T1_1'],
               ['out', 7.0, 67.46, 106.06, 9.73, 0.0, 'PAGE/TT0']],
              {'PAGE/T1_1': 'SI', 'PAGE/TT0': 'R'})


def s4():
    text, styles, base, inv = FS.line_styles(QOUT, FONTS)
    check('S4a resolves on the symbol base letter: inverted is False, base 11.0', inv is False and base == 11.0,
          f'{inv} {base}')
    check('S4b q is italic on the baseline (1.0, 0.0), out a subscript (0.6364, -0.1818)',
          [None if s is None else tuple(s)[:3] for s in styles]
          == [(1.0, 0.0, True)] + [(0.6364, -0.1818, False)] * 3, repr(styles))
    toks, miss = FS.source_tokens(QOUT, FONTS)
    check('S4c one token qout, q italic and out subscripted (i___)',
          [(t['text'], lmask(t['styles'])) for t in toks] == [('qout', 'i___')], repr(toks))
    check('S4d no miss (no inverted-base)', miss == [], repr(miss))


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
print('V §C140 ㉑ figtext.visual_lines: one visual line for the LAYOUT; FT.lines and the key never move')

# CNX_Chem_18_07_Nitrogen (send:true, bought 2026-09-21, drawn on 2-3 lines): REAL runs copied from the
# committed evidence/2026-09-15-t23-review-fixes/reports/code1-control-nitrogen/runs.json (rot 0, so
# x = along and y = proj). Fonts: R1165 LiberationSans -> 'R', R1170 STIXGeneral-Italic -> 'SI'.
NITRITES = [run('nitrites (NO', 9.0, 341.303, 67.8199, adv=45.507, font='R'),
            run('2', 7.0, 386.8081, 64.8199, adv=3.892, font='R'),
            run('–', 7.0, 390.7011, 72.3199, adv=3.5, font='SI')]
AMMONIUM = [run('ammonium (NH', 9.0, 221.794, 67.8199, adv=63.0, font='R'),
            run('4', 9.0, 284.803, 64.8379, adv=5.004, font='R'),
            run('+', 9.0, 289.8081, 72.3199, adv=6.075, font='SI'),
            run(')', 9.0, 295.8831, 67.8199, adv=2.997, font='R')]
# The same figure's genuine TWO-line label, one lead (11.0 pt) apart - the control that must not merge.
ATMOS = [run('Atmospheric', 9.0, 1.9118, 348.3417, adv=50.013, font='R'),
         run('nitrogen (N', 9.0, 1.9118, 337.3417, adv=44.514, font='R'),
         run('2', 7.0, 46.4325, 334.3417, adv=3.892, font='R'),
         run(')', 9.0, 50.3258, 337.3417, adv=2.997, font='R')]
# CNX_Chem_10_06_CbcCltPckd 'C|B|A' (send:FALSE): REAL census runs - three 9 pt letters on a diagonal,
# 5.76 and 5.0 pt apart along the normal. The rule merges C and B: the reason it is confined to a block's
# OWN cues and never feeds another block's frames (figcontainers.line_frames).
CBA = census([['C', 9.0, 298.64, 95.17, 6.5, 0.0, 'PAGE/R10'], ['B', 9.0, 289.27, 89.41, 6.0, 0.0, 'PAGE/R10'],
              ['A', 9.0, 278.23, 84.41, 6.0, 0.0, 'PAGE/R10']], {'PAGE/R10': 'R'})


def texts(ls):
    return [''.join(r['text'] for r in l) for l in ls]


def v_all():
    from blockkey import block_key
    check('V-pre FT.lines splits nitrites / ammonium / conjugate / Blood into 2 / 3 / 2 / 2 lines',
          [len(FT.lines(b)) for b in (NITRITES, AMMONIUM, CONJ, BLOOD)] == [2, 3, 2, 2],
          repr([texts(FT.lines(b)) for b in (NITRITES, AMMONIUM, CONJ, BLOOD)]))
    check('V1 REAL nitrites (NO2|– is ONE visual line holding all three runs, in source order',
          [[r['text'] for r in l] for l in FT.visual_lines(NITRITES)] == [['nitrites (NO', '2', '–']],
          repr(texts(FT.visual_lines(NITRITES))))
    check('V2 REAL ammonium (NH4|+|) - three FT.lines, chained - is ONE visual line',
          texts(FT.visual_lines(AMMONIUM)) == ['ammonium (NH4+)'], repr(texts(FT.visual_lines(AMMONIUM))))
    check('V3 REAL conjugate NH4|+ (conjugate acid) is ONE visual line',
          texts(FT.visual_lines(CONJ)) == ['NH4+ (conjugate acid)'], repr(texts(FT.visual_lines(CONJ))))
    check('V4 REAL Blood ... HCO3|– is ONE visual line', len(FT.visual_lines(BLOOD)) == 1,
          repr(texts(FT.visual_lines(BLOOD))))
    check('V5 control: REAL Atmospheric|nitrogen (N2), one lead apart, stays TWO visual lines',
          texts(FT.visual_lines(ATMOS)) == ['Atmospheric', 'nitrogen (N2)'], repr(texts(FT.visual_lines(ATMOS))))
    check('V6 the keys still split: block_key is built on FT.lines, so no bought key moves',
          [block_key(b) for b in (NITRITES, AMMONIUM, CONJ)]
          == ['nitrites (NO2|–', 'ammonium (NH4|+|)', 'NH4|+ (conjugate acid)'],
          repr([block_key(b) for b in (NITRITES, AMMONIUM, CONJ)]))
    check('V7 FT.lines still returns 2 / 3 lines after visual_lines ran (nothing is merged in place)',
          len(FT.lines(NITRITES)) == 2 and len(FT.lines(AMMONIUM)) == 3)
    # the threshold, at 9 pt: one lead is 10.998 pt, so 0.59 lead (6.489 pt) merges and 0.61 lead (6.709 pt)
    # does not. Both pairs are two FT.lines (each step is >= 0.5 x 9 = 4.5 pt).
    near_ = [run('Aa', 9.0, 0.0, 100.0), run('Bb', 9.0, 12.0, 100.0 + 0.59 * 1.222 * 9.0)]
    far_ = [run('Aa', 9.0, 0.0, 100.0), run('Bb', 9.0, 12.0, 100.0 + 0.61 * 1.222 * 9.0)]
    check('V8 the merge threshold is 0.6 of a lead: 0.59 lead merges, 0.61 lead does not',
          len(FT.lines(near_)) == 2 and len(FT.lines(far_)) == 2
          and len(FT.visual_lines(near_)) == 1 and len(FT.visual_lines(far_)) == 2
          and FT.VISUAL_LEAD_FRACTION == 0.6,
          f'{len(FT.visual_lines(near_))} {len(FT.visual_lines(far_))} {getattr(FT, "VISUAL_LEAD_FRACTION", None)}')
    # an ARC (four single-glyph runs) whose steps of 5 pt the rule WOULD merge pairwise is returned as FT.lines
    arc = [run('a', 9.0, 0.0, 0.0), run('b', 9.0, 6.0, 5.0), run('c', 9.0, 12.0, 10.0), run('d', 9.0, 18.0, 15.0)]
    check('V9 an arc is returned as FT.lines, unmerged (FT.is_arc, 4 FT.lines)',
          FT.is_arc(arc) and len(FT.lines(arc)) == 4 and texts(FT.visual_lines(arc)) == texts(FT.lines(arc)),
          repr(texts(FT.visual_lines(arc))))
    check('V10 REAL CbcCltPckd C|B|A: 3 FT.lines, and the rule merges C and B - pinned as measured',
          len(FT.lines(CBA)) == 3 and texts(FT.visual_lines(CBA)) == ['CB', 'A'], repr(texts(FT.visual_lines(CBA))))
    # the threshold's SIZE is the LARGER first-run size of the two lines (instrument A's max): 6.0 pt apart, a
    # 9 pt / 7 pt pair merges whichever line holds the 9 pt run (6.0 < 0.6 x 1.222 x 9 = 6.60); sized by min, or
    # by either line's own first run, one of the two does not (0.6 x 1.222 x 7 = 5.13). Census-equivalent today
    # (0 of 14,962 blocks change), so this pins the rule, not a measured case.
    big_first = [run('Aa', 9.0, 0.0, 100.0), run('b', 7.0, 12.0, 106.0)]
    small_first = [run('a', 7.0, 0.0, 100.0), run('Bb', 9.0, 12.0, 106.0)]
    check('V11 the threshold scales with the LARGER of the two first-run sizes (9 pt over 7 pt, either order)',
          [len(FT.lines(b)) for b in (big_first, small_first)] == [2, 2]
          and [len(FT.visual_lines(b)) for b in (big_first, small_first)] == [1, 1],
          repr([texts(FT.visual_lines(b)) for b in (big_first, small_first)]))


attempt('V', v_all)
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
    # [F6] a line votes at its RESOLVED base. REAL qout (S4) resolves on its symbol base letter (M5 R1, re-pinned
    # per [USER] ruling R-11), so the label is drawn at q's own 11 pt, not at the 7 pt of its subscript.
    check('B6 [F6] REAL qout (resolves on the symbol base letter, M5 R1) -> body size 11.0',
          near(FS.body_size(QOUT, FONTS), 11.0), repr(FS.body_size(QOUT, FONTS)))
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

# --------------------------------------------------------------------------------------------
print('HS §C140 ㊾ D5(a) is_script_style: the script rule restated on ONE style (heldplan.script_pool)')

# REAL runs copied verbatim from the committed evidence/2026-10-03-c140-held/held-geometry.json (rot 0, so
# x = along and y = proj). Fonts mapped onto FONTS by face: MolSpeed1 R9 /PUMGIW+LiberationSans, phscale TT1
# /GAXDFJ+LiberationSans and buffer R9 /QPOGTQ+LiberationSans -> 'R'; OxStNonmts R9 /BFZTYJ+LiberationSans-Bold
# -> 'B' and R11 /QANPDO+STIXGeneral-BoldItalic -> 'SBI'.
HS_FONTS = dict(FONTS, SBI={'base': '/QANPDO+STIXGeneral-BoldItalic'})
# CNX_Chem_09_05_MolSpeed1 block 13 '02 at T = 300 K' (send:false)
MOLSPEED = [run('0', 9.0, 127.7819, 83.2989, adv=5.004), run('2', 7.0, 132.787, 81.2989, adv=3.892),
            run(' at T = 300 K', 9.0, 136.68, 83.2989, adv=51.782)]
# CNX_Chem_14_02_phscale block 5 '100 or 1' (send:false)
PHSCALE = [run('10', 8.9998, 27.8628, 341.6631, adv=10.008), run('0', 6.9999, 37.8735, 345.6631, adv=3.892),
           run(' or 1', 8.9998, 41.7666, 341.6631, adv=18.009)]
# CNX_Chem_14_06_buffer block 23 '[CH3CO2H] is 11% of [CH3CO2|–]' (send:false)
BUFFER = [run('[CH', 9.0, 102.052, 150.365, adv=15.498), run('3', 7.0, 117.5512, 147.365, adv=3.892),
          run('CO', 9.0, 121.4442, 150.365, adv=13.502), run('2', 7.0, 134.9442, 147.365, adv=3.892),
          run('H] is 11% of [CH', 9.0, 138.8371, 150.365, adv=65.851), run('3', 7.0, 204.6891, 147.365, adv=3.892),
          run('CO', 9.0, 208.5829, 150.365, adv=13.502), run('2', 7.0, 222.0829, 147.365, adv=3.892),
          run('–', 7.0, 224.5763, 154.365, adv=3.892), run(']', 9.0, 228.8891, 150.365, adv=2.502)]
# CNX_Chem_18_04_OxStNonmts block 2 '4+|To|4–' (send:false)
OXST = [run('4', 7.0, 163.07, 66.5133, adv=3.892, font='B'), run('+', 7.0, 166.9629, 67.0133, adv=3.99, font='SBI'),
        run('To', 7.0, 162.9211, 59.5133, adv=8.034, font='B'),
        run('4', 7.0, 163.5602, 52.5133, adv=3.892, font='B'), run('–', 7.0, 167.4532, 53.0133, adv=3.5, font='SBI')]


def styles_of(block, fonts):
    """Every distinct non-None style `source_tokens` emits for the block, as sorted plain tuples."""
    toks, _ = FS.source_tokens(block, fonts)
    return sorted({tuple(st) for t in toks for st in t['styles'] if st is not None})


def hs1():
    got = [styles_of(b, HS_FONTS) for b in (MOLSPEED, PHSCALE, BUFFER, OXST)]
    check('HS1-pre the REAL styles: MolSpeed1 sub, phscale sup, buffer sub + charge, OxStNonmts italic-only',
          got == [[(0.7778, -0.2222, False)], [(0.7778, 0.4445, False)],
                  [(0.7778, -0.3333, False), (0.7778, 0.4444, False)], [(1.0, 0.0714, True)]], repr(got))
    yes = FS.is_script_style
    check('HS1a REAL MolSpeed1 subscript (0.7778, -0.2222) is a script', yes(FS.SourceStyle(0.7778, -0.2222, False)))
    check('HS1b REAL phscale superscript (0.7778, 0.4445) is a script', yes(FS.SourceStyle(0.7778, 0.4445, False)))
    check('HS1c REAL buffer charge (0.7778, 0.4444) is a script', yes(FS.SourceStyle(0.7778, 0.4444, False)))
    check('HS1d REAL OxStNonmts italic-only STIX charge (1.0, 0.0714, italic) is NOT a script (a sign-only rule says sup)',
          not yes(FS.SourceStyle(1.0, 0.0714, True)))
    check('HS1e both thresholds: a same-size 0.111 raise is not a script, a 7/9-size 0.111 drop is',
          not yes(FS.SourceStyle(1.0, 0.1111, True)) and yes(FS.SourceStyle(0.7778, -0.1111, False)))
    check('HS1f the ratio boundary is strict: at exactly 0.9 the same-size threshold applies',
          not yes(FS.SourceStyle(0.9, 0.1, False)) and yes(FS.SourceStyle(0.8999, 0.1, False)))
    check('HS1g a plain character (None) is not a script', yes(None) is False)


attempt('HS1', hs1)


def hs2():
    real = {'DZ2': DZ2, 'QOUT': QOUT, 'BLOOD': BLOOD, 'CONJ': CONJ, 'NITRITES': NITRITES, 'AMMONIUM': AMMONIUM,
            'ATMOS': ATMOS, 'CBA': CBA, 'AOTYPE': AOTYPE, 'RELATION': RELATION, 'PH10': PH10, 'PH1': PH1,
            'MOLSPEED': MOLSPEED, 'PHSCALE': PHSCALE, 'BUFFER': BUFFER, 'OXST': OXST}
    pop = sorted({(name, st) for name, b in real.items() for st in styles_of(b, HS_FONTS) if not st[2]})
    check(f'HS2-pre the population is not empty ({len(pop)} fixture/style pairs) and holds a drop under 0.13',
          len(pop) > 0 and any(abs(st[1]) < FS.SAME_SHIFT for _, st in pop), repr(pop))
    bad = [p for p in pop if not FS.is_script_style(FS.SourceStyle(*p[1]))]
    check('HS2 every NON-italic style source_tokens emits on the REAL fixtures is a script by is_script_style',
          bad == [], repr(bad))


attempt('HS2', hs2)

# --------------------------------------------------------------------------------------------
print("M5 §C140 '6' - seven narrow script-transfer rules (R2-R7; R1 is S4/B6)")

# The census decodes PentIso's MathematicalPi-One degree glyph (code 56, /H11034) as '8'; it is kept verbatim.
M5_FONTS = dict(FONTS, MP={'base': '/AITLIF+MathematicalPi-One'})
# CNX_Chem_06_05_CovalradiT 'I radius = 266 pm = 133 pm' (send:true): R18 LiberationSans. The 7 pt
# '266 pm' is raised 3 pt - ONE styled run that spans a space, beside a plain 'pm'.
COVAL = census([['I radius = ', 9.0, 354.19, 275.57, 39.77, 0.0, 'PAGE/R18'],
                ['266 pm', 7.0, 393.96, 278.57, 23.34, 0.0, 'PAGE/R18'],
                [' = 133 pm', 9.0, 417.31, 275.57, 40.27, 0.0, 'PAGE/R18']],
               {'PAGE/R18': 'R'})
# CNX_Chem_10_01_PentIso 'n-pentane|boiling point: 36 8C' (send:true): R14 LiberationSans-Italic,
# R12 LiberationSans, R16 MathematicalPi-One.
NPENT = census([['n', 9.0, 261.37, 13.73, 5.0, 0.0, 'PAGE/R14'], ['-pentane', 9.0, 266.38, 13.73, 35.52, 0.0, 'PAGE/R12'],
                ['boiling point: 36 ', 9.0, 244.12, 2.73, 65.54, 0.0, 'PAGE/R12'],
                ['8', 9.0, 309.66, 2.73, 3.0, 0.0, 'PAGE/R16'], ['C', 9.0, 312.66, 2.73, 6.5, 0.0, 'PAGE/R12']],
               {'PAGE/R14': 'I', 'PAGE/R12': 'R', 'PAGE/R16': 'MP'})
# CNX_Chem_05_02_FoodLabel 'Trans Fat 3g' (send:true): TT2 LiberationSans-Italic, TT0 LiberationSans
TRANS = census([['Trans', 5.0, 294.07, 157.12, 12.41, 0.0, 'PAGE/TT2'], [' Fat 3g', 5.0, 306.48, 157.12, 15.56, 0.0, 'PAGE/TT0']],
               {'PAGE/TT2': 'I', 'PAGE/TT0': 'R'})
# SYNTHETIC (round coordinates, default adv): a 1-letter italic variable, and a digit subscript.
RVAR = [run('Radius ', 9.0, 10.0, 50.0, adv=30.0), run('r', 9.0, 40.0, 50.0, adv=3.0, font='SI')]
H2 = [run('H', 9.0, 10.0, 50.0, adv=6.5), run('2', 7.0, 16.5, 47.0, adv=3.9), run(' gas', 9.0, 20.4, 50.0, adv=16.0)]


def xfer(block, value):
    """source_tokens -> transfer on `value`: (the lab() mask of fmt, [(stretch, reason)] of the misses)."""
    toks, _ = FS.source_tokens(block, M5_FONTS)
    fmt, ms = FS.transfer(toks, value)
    return lmask(fmt), [(m['stretch'], m['reason']) for m in ms]


def m5_c1():
    text, st, base, inv = FS.line_styles(ATMOS[1:], M5_FONTS)
    check('C1 control: an ordinary N2 line keeps base 9 and its subscript',
          base == 9.0 and lmask(st) == '..........._.', lmask(st))


def m5_r2():
    ls = FS.token_lines(AMMONIUM, M5_FONTS)
    check('R2a ammonium: token_lines attaches the same-size + and ) (1 line)', len(ls) == 1, repr(texts(ls)))
    m, ms = xfer(AMMONIUM, 'ammóníum (NH4+)')
    check('R2b ammonium (NH4+): 4 subscript AND + superscript, no miss', m == '............_^.' and ms == [],
          repr((m, ms)))


def m5_c2():
    check('C2a control: the diagonal C|B|A is NOT attached (3 token lines)', len(FS.token_lines(CBA, M5_FONTS)) == 3,
          repr(texts(FS.token_lines(CBA, M5_FONTS))))
    check('C2b control: a genuine 2-line label stays 2 token lines', len(FS.token_lines(ATMOS, M5_FONTS)) == 2,
          repr(texts(FS.token_lines(ATMOS, M5_FONTS))))
    check('C2c control: FT.lines (the key) still splits ammonium into 3', len(FT.lines(AMMONIUM)) == 3,
          repr(texts(FT.lines(AMMONIUM))))


def m5_r3():
    m, ms = xfer(NITRITES, 'nítrít (NO2 –')
    check('R3a wire joint space: (NO2 – draws 2 sub, – sup, the space elided (J)', m.endswith('_J^') and ms == [],
          repr((m, ms)))
    m, ms = xfer(AMMONIUM, 'ammóníum (NH4 + )')
    check('R3b ammonium (NH4 + ): both joint spaces elided, 4 sub, + sup', m.endswith('_J^J.') and ms == [],
          repr((m, ms)))


def m5_c3():
    m, ms = xfer(NITRITES, 'nítrít (NO2–')
    check('C3a control: a space-free value takes the plain path, nothing elided', m.endswith('_^') and 'J' not in m,
          repr((m, ms)))
    m, ms = xfer(NITRITES, 'a (NO2 – b (NO2 –')
    check('C3b control: two joint matches are ambiguous - nothing elided', 'J' not in m, repr((m, ms)))
    m, ms = xfer(NITRITES, 'nítrít og NO2 sem –')
    check('C3c control: a space that is not at the joint is never elided', 'J' not in m, repr((m, ms)))


def m5_r4():
    m, ms = xfer(NPENT, 'Suðumark n-pentans: 36 °C')
    check('R4a a leading italic n- in an inflected word is placed (right anchor)',
          m == '.........i...............' and ms == [], repr((m, ms)))


def m5_c4():
    m, ms = xfer(NPENT, 'n-pentan og n-bútan')
    check('C4a control: two candidates -> not placed, no-base named', 'i' not in m and ('n', 'no-base') in ms,
          repr((m, ms)))
    m, ms = xfer(NPENT, 'Suðumark ísópentans')
    check('C4b control: no n- at a clean left edge -> not placed', 'i' not in m, repr((m, ms)))


def m5_r5():
    m, ms = xfer(COVAL, 'I radíus = 266 pm = 133 pm')
    check('R5a raised 266 pm (one run spanning a space) is placed as a phrase; 133 pm stays plain',
          m == '...........^^^^^^.........' and ms == [], repr((m, ms)))
    m, ms = xfer(COVAL, 'I radíus = 266pm = 133 pm')
    check('R5b an absent phrase does not style the wrong pm (it also stands plain in the source line)',
          '^' not in m, repr((m, ms)))


def m5_r6():
    m, ms = xfer(TRANS, 'Transfita 3 g')
    check('R6a an italic word compounded in the translation keeps its italic', m == 'iiiii........' and ms == [],
          repr((m, ms)))


def m5_c6():
    m, ms = xfer(RVAR, 'Radíus r')
    check('C6a control: a 1-letter italic variable is placed only standalone', m == '.......i', m)
    m, ms = xfer(RVAR, 'radíus')
    check('C6b control: a 1-letter italic variable never prefixes a word', 'i' not in m, m)
    m, ms = xfer(TRANS, 'Transfita og Transsýra')
    check('C6c control: two compound candidates -> not placed', 'i' not in m, m)


def m5_r7():
    for v, want in (('qút', 'i__'), ('qinn', 'i___')):
        m, ms = xfer(QOUT, v)
        check(f'R7 translated subscript tail: {v} -> {want}', m == want and ms == [], repr((m, ms)))
    m, ms = xfer(QOUT, 'qout')
    check('R7c (needs R1) the untranslated token is placed whole', m == 'i___', repr((m, ms)))


def m5_c7():
    m, ms = xfer(H2, 'Hiti')
    check('C7a control: a DIGIT subscript (H2) never styles a translated tail', '_' not in m, repr((m, ms)))
    m, ms = xfer(QOUT, 'qút og qinn')
    check('C7b control: two words starting with the base -> not placed', '_' not in m, repr((m, ms)))


for _f in (m5_c1, m5_r2, m5_c2, m5_r3, m5_c3, m5_r4, m5_c4, m5_r5, m5_r6, m5_c6, m5_r7, m5_c7):
    attempt(_f.__name__, _f)

print('\nALL PASS' if not fails else f'\n{len(fails)} FAILED: ' + ', '.join(fails))
sys.exit(1 if fails else 0)
