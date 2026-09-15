#!/usr/bin/env python3
"""§C140 ⑨ - numloc (decimal commas in English-kept labels) and the widened
`figtext.is_identity`, tested alone. No cairo, no network, no figure on disk.

    PYTHONDONTWRITEBYTECODE=1 python3 test_numloc.py

Plain asserts and a module-level `fails` list, like its siblings - there is no pytest here.

WHAT IS PINNED
--------------
* Rule R3 (`evidence/2026-09-13-t23/reports/c9-decimal.md` §7) on EVERY row of the census
  appendix `data/c9-appendix.md` B1 (211 distinct kept lines, input -> R3 column) and B2 (the
  77 periodic-table values, which that section states R3 changes `.` -> `,`). The rows are
  LITERALS below, copied from the appendix once - never parsed at test time, so a moved or
  edited evidence file cannot quietly shrink the fixture. Sections C-F carry no R3 column.
* The line is the unit (`CNX_Chem_03_02_moles-6296` sets its numbers one glyph per run).
* Length preservation, the placeholder guard, and the documented NON-idempotency.
* `is_identity` accepting a token's localised form, English side only.

⚠️ CHECKS THAT CANNOT FAIL AGAINST AN IDENTITY `localize`: every "is left unchanged" check
(1b, 2c, 2d, 2f, 2g, 2h, 3a, 5c), length preservation (4a), and the is_identity negatives and
E regressions (7b, 7d, 7f, 7h). Each was run red against a stub that DOES change them. The
fixture-size and import checks (0a, 0b, 8a, 8b) never call `localize`; each was run red against
a dropped fixture row or a mutant import.
"""
import ast
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent          # never process.cwd() - repo rule
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / 'pylibs'))

import numloc                                   # noqa: E402
import figtext as FT                            # noqa: E402

fails = []


def check(label, ok, detail=''):
    print(('  PASS  ' if ok else '  FAIL  ') + label + (': ' + detail if detail else ''),
          flush=True)
    if not ok:
        fails.append(label)


# ── the census fixture ───────────────────────────────────────────────────────────────
B1 = [  # (line text, R3 output, class) - every row of c9-appendix.md B1, in table order
    ("1.008", "1,008", "plain-decimal"),
    ("12.01", "12,01", "plain-decimal"),
    ("16.00", "16,00", "plain-decimal"),
    ("22.99", "22,99", "plain-decimal"),
    ("26.98", "26,98", "plain-decimal"),
    ("32.06", "32,06", "plain-decimal"),
    ("35.45", "35,45", "plain-decimal"),
    ("0.5", "0,5", "plain-decimal"),
    ("1.5", "1,5", "plain-decimal"),
    ("2.5", "2,5", "plain-decimal"),
    ("3.5", "3,5", "plain-decimal"),
    ("4.5", "4,5", "plain-decimal"),
    ("1 in. = 2.54 cm", "1 in. = 2,54 cm", "plain-decimal"),
    ("55.0 g", "55,0 g", "plain-decimal"),
    ("0.00832407 mL", "0,00832407 mL", "plain-decimal"),
    ("70.607 mL", "70,607 mL", "plain-decimal"),
    ("1.0023", "1,0023", "plain-decimal"),
    ("4.383", "4,383", "plain-decimal"),
    ("421.23", "421,23", "plain-decimal"),
    ("5.3853", "5,3853", "plain-decimal"),
    ("64.77", "64,77", "plain-decimal"),
    ("0.008020", "0,008020", "plain-decimal"),
    ("233.15 K", "233,15 K", "plain-decimal"),
    ("273.15 K", "273,15 K", "plain-decimal"),
    ("373.15 K", "373,15 K", "plain-decimal"),
    ("1.6 × 10–19 C", "1,6 × 10–19 C", "plain-decimal"),
    ("3.2 × 10–19 C", "3,2 × 10–19 C", "plain-decimal"),
    ("4.8 × 10–19 C", "4,8 × 10–19 C", "plain-decimal"),
    ("6.4 × 10–19 C", "6,4 × 10–19 C", "plain-decimal"),
    ("192.00", "192,00", "plain-decimal"),
    ("342.14", "342,14", "plain-decimal"),
    ("53.96", "53,96", "plain-decimal"),
    ("96.18", "96,18", "plain-decimal"),
    ("108.09", "108,09", "plain-decimal"),
    ("180.15", "180,15", "plain-decimal"),
    ("64.00", "64,00", "plain-decimal"),
    ("8.064", "8,064", "plain-decimal"),
    ("106.35", "106,35", "plain-decimal"),
    ("119.37", "119,37", "plain-decimal"),
    ("14.007", "14,007", "plain-decimal"),
    ("24.02", "24,02", "plain-decimal"),
    ("32.00", "32,00", "plain-decimal"),
    ("5.040", "5,040", "plain-decimal"),
    ("75.07", "75,07", "plain-decimal"),
    ("58.44", "58,44", "plain-decimal"),
    ("H2, Raney Ni", "H2, Raney Ni", "trailing-separator"),
    ("2,000", "2.000", "thousands"),
    ("2,400mg", "2.400mg", "thousands"),
    ("2,500", "2.500", "thousands"),
    ("ΔH = –282.5 kJ", "ΔH = –282,5 kJ", "plain-decimal"),
    ("ΔH = –393.5 kJ", "ΔH = –393,5 kJ", "plain-decimal"),
    ("1.0", "1,0", "plain-decimal"),
    ("2.0", "2,0", "plain-decimal"),
    ("3.0", "3,0", "plain-decimal"),
    ("0.00 ", "0,00 ", "plain-decimal"),
    ("0.25 ", "0,25 ", "plain-decimal"),
    ("0.50 ", "0,50 ", "plain-decimal"),
    ("0.75 ", "0,75 ", "plain-decimal"),
    ("1.00 ", "1,00 ", "plain-decimal"),
    ("1.25 ", "1,25 ", "plain-decimal"),
    ("1.50 ", "1,50 ", "plain-decimal"),
    ("1.75 ", "1,75 ", "plain-decimal"),
    ("2.00 ", "2,00 ", "plain-decimal"),
    ("0.0 J, ∞", "0,0 J, ∞", "plain-decimal"),
    ("–1.36 × 10–19 J, 4", "–1,36 × 10–19 J, 4", "plain-decimal"),
    ("–2.18 x 10–18 J, 1", "–2,18 x 10–18 J, 1", "plain-decimal"),
    ("–2.42 × 10–19 J, 3", "–2,42 × 10–19 J, 3", "plain-decimal"),
    ("–5.45 × 10–19 J, 2", "–5,45 × 10–19 J, 2", "plain-decimal"),
    ("–8.72 × 10–20 J, 5", "–8,72 × 10–20 J, 5", "plain-decimal"),
    ("0.74", "0,74", "plain-decimal"),
    ("–7.24 × 10–19 J", "–7,24 × 10–19 J", "plain-decimal"),
    ("109.5°", "109,5°", "plain-decimal"),
    ("106.8°", "106,8°", "plain-decimal"),
    ("(2.49 ft)", "(2,49 ft)", "plain-decimal"),
    ("(33.9 ft)", "(33,9 ft)", "plain-decimal"),
    ("10,744 mm", "10.744 mm", "thousands"),
    ("36.0", "36,0", "plain-decimal"),
    ("46.4", "46,4", "plain-decimal"),
    ("56.7", "56,7", "plain-decimal"),
    ("67.1", "67,1", "plain-decimal"),
    ("77.5", "77,5", "plain-decimal"),
    ("88.0", "88,0", "plain-decimal"),
    ("(10.0, 19.5)", "(10.0, 19.5)", "plain-decimal"),
    ("(15.0, 13.0)", "(15.0, 13.0)", "plain-decimal"),
    ("(20.0, 9.8)", "(20.0, 9.8)", "plain-decimal"),
    ("(25.0, 7.8)", "(25.0, 7.8)", "plain-decimal"),
    ("(30.0, 6.5)", "(30.0, 6.5)", "plain-decimal"),
    ("(5.0, 39.0)", "(5.0, 39.0)", "plain-decimal"),
    ("0.02", "0,02", "plain-decimal"),
    ("0.04", "0,04", "plain-decimal"),
    ("0.06", "0,06", "plain-decimal"),
    ("0.08", "0,08", "plain-decimal"),
    ("0.1", "0,1", "plain-decimal"),
    ("0.12", "0,12", "plain-decimal"),
    ("0.14", "0,14", "plain-decimal"),
    ("0.16", "0,16", "plain-decimal"),
    ("0.18", "0,18", "plain-decimal"),
    ("0.22", "0,22", "plain-decimal"),
    ("0.31", "0,31", "plain-decimal"),
    ("1.07", "1,07", "plain-decimal"),
    ("16.1", "16,1", "plain-decimal"),
    ("1,000,000", "1.000.000", "thousands"),
    ("10,000", "10.000", "thousands"),
    ("100,000", "100.000", "thousands"),
    ("0.00", "0,00", "plain-decimal"),
    ("0.010", "0,010", "plain-decimal"),
    ("0.0208", "0,0208", "plain-decimal"),
    ("0.0417", "0,0417", "plain-decimal"),
    ("0.0625", "0,0625", "plain-decimal"),
    ("0.0833", "0,0833", "plain-decimal"),
    ("0.125", "0,125", "plain-decimal"),
    ("0.250", "0,250", "plain-decimal"),
    ("0.500", "0,500", "plain-decimal"),
    ("1.000", "1,000", "plain-decimal"),
    ("12.00", "12,00", "plain-decimal"),
    ("18.00", "18,00", "plain-decimal"),
    ("24.00", "24,00", "plain-decimal"),
    ("6.00", "6,00", "plain-decimal"),
    ("–0.062", "–0,062", "plain-decimal"),
    ("–0.125", "–0,125", "plain-decimal"),
    ("–0.250", "–0,250", "plain-decimal"),
    ("–0.500", "–0,500", "plain-decimal"),
    ("1.0 × 10", "1,0 × 10", "plain-decimal"),
    ("2.0 × 10", "2,0 × 10", "plain-decimal"),
    ("3.0 × 10", "3,0 × 10", "plain-decimal"),
    ("4.0 × 10", "4,0 × 10", "plain-decimal"),
    ("0.000", "0,000", "plain-decimal"),
    ("0.200", "0,200", "plain-decimal"),
    ("0.400", "0,400", "plain-decimal"),
    ("0.600", "0,600", "plain-decimal"),
    ("1.0 × 10–3", "1,0 × 10–3", "plain-decimal"),
    ("2.0 × 10–3", "2,0 × 10–3", "plain-decimal"),
    ("3.0 × 10–3", "3,0 × 10–3", "plain-decimal"),
    ("1.00 × 104", "1,00 × 104", "plain-decimal"),
    ("1.50 × 104", "1,50 × 104", "plain-decimal"),
    ("2.00 × 104", "2,00 × 104", "plain-decimal"),
    ("2.50 × 104", "2,50 × 104", "plain-decimal"),
    ("3.00 × 104", "3,00 × 104", "plain-decimal"),
    ("3.50 × 104", "3,50 × 104", "plain-decimal"),
    ("4.00 × 104", "4,00 × 104", "plain-decimal"),
    ("5.00 × 103", "5,00 × 103", "plain-decimal"),
    ("–2.303", "–2,303", "plain-decimal"),
    ("–2.412", "–2,412", "plain-decimal"),
    ("–2.523", "–2,523", "plain-decimal"),
    ("–2.632", "–2,632", "plain-decimal"),
    ("–2.852", "–2,852", "plain-decimal"),
    ("–2.962", "–2,962", "plain-decimal"),
    ("–3.182", "–3,182", "plain-decimal"),
    ("0.", "0,", "trailing-separator"),
    ("0.0625 M", "0,0625 M", "plain-decimal"),
    ("0.125 M", "0,125 M", "plain-decimal"),
    ("0.250 M", "0,250 M", "plain-decimal"),
    ("0.500 M", "0,500 M", "plain-decimal"),
    ("1.000 M", "1,000 M", "plain-decimal"),
    ("2.", "2,", "trailing-separator"),
    ("2.16 × 104", "2,16 × 104", "plain-decimal"),
    ("2.16 × 104 s", "2,16 × 104 s", "plain-decimal"),
    ("4.", "4,", "trailing-separator"),
    ("4.32 × 104", "4,32 × 104", "plain-decimal"),
    ("4.32 × 104 s", "4,32 × 104 s", "plain-decimal"),
    ("6.", "6,", "trailing-separator"),
    ("6.48 × 104", "6,48 × 104", "plain-decimal"),
    ("6.48 × 104 s", "6,48 × 104 s", "plain-decimal"),
    ("8.", "8,", "trailing-separator"),
    ("8.64 × 104 s", "8,64 × 104 s", "plain-decimal"),
    (" 0.000", " 0,000", "plain-decimal"),
    (" 0.00446", " 0,00446", "plain-decimal"),
    ("0.00160", "0,00160", "plain-decimal"),
    ("0.00175", "0,00175", "plain-decimal"),
    ("0.00909", "0,00909", "plain-decimal"),
    ("0.0108", "0,0108", "plain-decimal"),
    ("0.0115", "0,0115", "plain-decimal"),
    ("0.0117", "0,0117", "plain-decimal"),
    ("0.0135", "0,0135", "plain-decimal"),
    ("0.0190", "0,0190", "plain-decimal"),
    ("0.0231", "0,0231", "plain-decimal"),
    ("0.0243", "0,0243", "plain-decimal"),
    ("0.0260", "0,0260", "plain-decimal"),
    ("0.0330", "0,0330", "plain-decimal"),
    ("0.0468", "0,0468", "plain-decimal"),
    ("0.10", "0,10", "plain-decimal"),
    ("0.640", "0,640", "plain-decimal"),
    ("N2, H2", "N2, H2", "trailing-separator"),
    ("+3.39 × 10", "+3,39 × 10", "plain-decimal"),
    ("1.000 × 10", "1,000 × 10", "plain-decimal"),
    ("3.39 × 10", "3,39 × 10", "plain-decimal"),
    ("6.61 × 10", "6,61 × 10", "plain-decimal"),
    ("6.61 × 10–4", "6,61 × 10–4", "plain-decimal"),
    ("–3.39 × 10", "–3,39 × 10", "plain-decimal"),
    ("0.15", "0,15", "plain-decimal"),
    ("0.15 – x", "0,15 – x", "plain-decimal"),
    ("1.00", "1,00", "plain-decimal"),
    ("1.00 – x", "1,00 – x", "plain-decimal"),
    ("0.534", "0,534", "plain-decimal"),
    ("0.534 + (–x)", "0,534 + (–x)", "plain-decimal"),
    ("0.50", "0,50", "plain-decimal"),
    ("0.50 + (–x) =", "0,50 + (–x) =", "plain-decimal"),
    ("0.50 – x", "0,50 – x", "plain-decimal"),
    ("0.033", "0,033", "plain-decimal"),
    ("0.033 – x", "0,033 – x", "plain-decimal"),
    ("0.10 + x", "0,10 + x", "plain-decimal"),
    ("0.10 – x", "0,10 – x", "plain-decimal"),
    ("0.010 + x ", "0,010 + x ", "plain-decimal"),
    ("+ 0.337 V", "+ 0,337 V", "plain-decimal"),
    (".625 g", ".625 g", "leading-point"),
    ("1.25 g", "1,25 g", "plain-decimal"),
    ("12.5", "12,5", "plain-decimal"),
    ("2.5 g", "2,5 g", "plain-decimal"),
    ("5.272 a", "5,272 a", "plain-decimal"),
    ("1,000", "1.000", "thousands"),
    ("5,000", "5.000", "thousands"),
]
B2 = [  # (value, R3 output) - every value of c9-appendix.md B2 (periodic tables; R3 = "." -> ",")
    ("4.003", "4,003"), ("6.94", "6,94"), ("9.012", "9,012"), ("10.81", "10,81"), ("14.01", "14,01"), ("19.00", "19,00"),
    ("20.18", "20,18"), ("24.31", "24,31"), ("28.09", "28,09"), ("30.97", "30,97"), ("39.10", "39,10"), ("39.95", "39,95"),
    ("40.08", "40,08"), ("44.96", "44,96"), ("47.87", "47,87"), ("50.94", "50,94"), ("52.00", "52,00"), ("54.94", "54,94"),
    ("55.85", "55,85"), ("58.69", "58,69"), ("58.93", "58,93"), ("63.55", "63,55"), ("65.38", "65,38"), ("69.72", "69,72"),
    ("72.63", "72,63"), ("74.92", "74,92"), ("78.97", "78,97"), ("79.90", "79,90"), ("83.80", "83,80"), ("85.47", "85,47"),
    ("87.62", "87,62"), ("88.91", "88,91"), ("91.22", "91,22"), ("92.91", "92,91"), ("95.95", "95,95"), ("101.1", "101,1"),
    ("102.9", "102,9"), ("106.4", "106,4"), ("107.9", "107,9"), ("112.4", "112,4"), ("114.8", "114,8"), ("118.7", "118,7"),
    ("121.8", "121,8"), ("126.9", "126,9"), ("127.6", "127,6"), ("131.3", "131,3"), ("132.9", "132,9"), ("137.3", "137,3"),
    ("138.9", "138,9"), ("140.1", "140,1"), ("140.9", "140,9"), ("144.2", "144,2"), ("150.4", "150,4"), ("152.0", "152,0"),
    ("157.3", "157,3"), ("158.9", "158,9"), ("162.5", "162,5"), ("164.9", "164,9"), ("167.3", "167,3"), ("168.9", "168,9"),
    ("173.1", "173,1"), ("175.0", "175,0"), ("178.5", "178,5"), ("180.9", "180,9"), ("183.8", "183,8"), ("186.2", "186,2"),
    ("190.2", "190,2"), ("192.2", "192,2"), ("195.1", "195,1"), ("197.0", "197,0"), ("200.6", "200,6"), ("204.4", "204,4"),
    ("207.2", "207,2"), ("209.0", "209,0"), ("231.0", "231,0"), ("232.0", "232,0"), ("238.0", "238,0"),
]
# c9-decimal.md §7 hazard strings R3 must leave: the seven `send:true` locants, the formula
# lists (one identity, one kept, one translated) and a translated sentence ending on a formula.
LEFT_HAZARDS = [
    '1,2-dichloroethane', '2,2,4-trimethylpentane', '1,1,2,2-tetrabromoethane',
    '1,2,3-propanetriol', '1,2-ethanediol', '2,4-difluorohexane', '2,4-Dinitrophenol',
    'N2, H2', 'H2, Raney Ni', 'CO2, H2O, O2,',
]
# CNX_Chem_03_02_moles-6296: the seven decimal lines of the census (appendix D), which the
# PDF sets ONE GLYPH PER RUN - so each line's runs are list(line). Edge spaces are the source's.
MOLES_6296 = ['118.7 g Sn', '12.0 g C ', '24.3 g ', '28.1 g Si', '32.1 g S       ',
              '63.5 g Cu', '65.4 g Zn     ']


def mismatches(pairs):
    return [(t, numloc.localize(t), e) for t, e in pairs if numloc.localize(t) != e]


# ── 0. the fixture is what it claims to be ───────────────────────────────────────────
converts = [(t, e) for t, e, _ in B1 if t != e]
leaves = [(t, e) for t, e, _ in B1 if t == e]
check('0a NON-VACUITY the fixture is every row of B1 (211) and every value of B2 (77)',
      len(B1) == 211 and len(B2) == 77 and len({t for t, _, _ in B1}) == 211,
      f'B1={len(B1)} B2={len(B2)}')
check('0b B1 holds 202 lines R3 converts and 9 it leaves',
      len(converts) == 202 and len(leaves) == 9, f'{len(converts)} / {len(leaves)}')

# ── 1. the census appendix ───────────────────────────────────────────────────────────
bad = mismatches(converts)
check('1a every B1 line R3 CONVERTS gives the census R3 output (202)', not bad, repr(bad[:5]))
bad = mismatches(leaves)
check('1b every B1 line R3 LEAVES is returned unchanged (9)', not bad, repr(bad[:5]))
bad = mismatches(B2)
check('1c every B2 periodic-table value gives its census R3 output (77)', not bad, repr(bad[:5]))

# ── 2. the named shapes ──────────────────────────────────────────────────────────────
got = numloc.localize('1,000,000')
check("2a every thousands group becomes a period: 1,000,000 -> 1.000.000 "
      "(not localizeNumberFull's 1.000,000)", got == '1.000.000', repr(got))
got = numloc.localize('1,234,567.8')
check('2b groups and a decimal in one number: 1,234,567.8 -> 1.234.567,8',
      got == '1.234.567,8', repr(got))
got = numloc.localize('(10.0, 19.5)')
check('2c a coordinate pair (10.0, 19.5) is left whole', got == '(10.0, 19.5)', repr(got))
got = numloc.localize('.625 g')
check('2d a leading point .625 g is left', got == '.625 g', repr(got))
got = numloc.localize('0.')
check('2e a bare overprint fragment 0. becomes 0,', got == '0,', repr(got))
got = [numloc.localize('Br2.'), numloc.localize('with an excess of Br2.')]
check('2f a trailing sentence point after a digit is left (Br2.)',
      got == ['Br2.', 'with an excess of Br2.'], repr(got))
got = [numloc.localize(t) for t in LEFT_HAZARDS[:7]]
check('2g locants are left (1,2-dichloroethane and the other six of c9 §7)',
      got == LEFT_HAZARDS[:7], repr([g for g, t in zip(got, LEFT_HAZARDS) if g != t]))
got = [numloc.localize(t) for t in LEFT_HAZARDS[7:]]
check('2h formula lists are left (N2, H2 · H2, Raney Ni · CO2, H2O, O2,)',
      got == LEFT_HAZARDS[7:], repr(got))

# ── 3. the placeholder ───────────────────────────────────────────────────────────────
got = numloc.localize('1,000\u2800')
check('3a a line already holding the placeholder U+2800 is returned unchanged',
      got == '1,000\u2800', repr(got))
got = numloc.localize('1,000 ')
check('3b CONTROL the same line with a space in its place IS converted',
      got == '1.000 ', repr(got))

# ── 4. length ────────────────────────────────────────────────────────────────────────
every = ([t for t, _, _ in B1] + [t for t, _ in B2] + LEFT_HAZARDS + MOLES_6296
         + ['1,000,000', '1,234,567.8', '0.', 'Br2.', '1,000\u2800', '1,000 '])
bad = [t for t in every if len(numloc.localize(t)) != len(t)]
check(f'4a localize preserves the length of every fixture string ({len(every)})',
      not bad, repr(bad[:5]))

# ── 5. the line is the unit ──────────────────────────────────────────────────────────
got = numloc.localize_runs(['2', '8', '.', '1', ' g Si'])
check("5a a run-split line ['2','8','.','1',' g Si'] converts the point in its own run",
      got == ['2', '8', ',', '1', ' g Si'], repr(got))
bad = []
for line in MOLES_6296:
    runs = list(line)
    want = [',' if ch == '.' else ch for ch in runs]
    got = numloc.localize_runs(runs)
    if got != want:
        bad.append((line, got))
check('5b the 7 real moles-6296 lines, one glyph per run, each convert their point run',
      not bad, repr(bad[:3]))
bad = [line for line in MOLES_6296 if [numloc.localize(ch) for ch in line] != list(line)]
check('5c CONTROL localising each glyph run ALONE changes none of them - why the unit is the line',
      not bad, repr(bad))
got = numloc.localize_runs(['1', '', '.5', ' g'])
check('5d each run keeps its length, an empty run included',
      got == ['1', '', ',5', ' g'], repr(got))

# ── 6. never applied twice ───────────────────────────────────────────────────────────
once = numloc.localize('1.008')
twice = numloc.localize(once)
check('6 NOT IDEMPOTENT, a documented hazard (spec §2): 1.008 -> 1,008 -> 1.008 - '
      'a "fix" that makes this idempotent changes the rule and must show up here',
      once == '1,008' and twice == '1.008', f'{once!r} -> {twice!r}')

# ── 7. is_identity ───────────────────────────────────────────────────────────────────
check('7a a localised numeric reply is identity: 373,15 K for 373.15 K',
      FT.is_identity('373,15 K', '373.15 K', False) is True)
check('7b ... a different number is not: 373,15 K for 373.16 K',
      FT.is_identity('373,15 K', '373.16 K', False) is False)
check('7c a legacy LIST value, localised, is identity',
      FT.is_identity(['373,15', 'K'], '373.15 K', False) is True)
check("7d a legacy LIST value, plain, is still identity (E's case)",
      FT.is_identity(['Mass of', 'reactant'], 'Mass of reactant', False) is True)
check('7e tokens are decided one by one: 12,01 and 1.008 for 12.01 and 1.008',
      FT.is_identity('12,01 and 1.008', '12.01 and 1.008', False) is True)
check('7f only the ENGLISH side is localised: 1.2-dichloroethane is not identity for '
      '1,2-dichloroethane', FT.is_identity('1.2-dichloroethane', '1,2-dichloroethane', False) is False)
check('7g an arc value is widened the same way: 26,98 for 26.98',
      FT.is_identity('26,98', '26.98', True) is True)
check('7h a changed token count is never identity: 373,15 for 373.15 K',
      FT.is_identity('373,15', '373.15 K', False) is False)

# ── 8. numloc imports nothing from the experiment ────────────────────────────────────
def imported(path):
    names = set()
    for node in ast.walk(ast.parse(path.read_text(encoding='utf-8'))):
        if isinstance(node, ast.Import):
            names.update(a.name.split('.')[0] for a in node.names)
        elif isinstance(node, ast.ImportFrom):
            names.add((node.module or '').split('.')[0])
    return names


got = imported(HERE / 'numloc.py')
check('8a numloc.py imports nothing but re', got == {'re'}, repr(sorted(got)))
got = imported(HERE / 'figtext.py')
check('8b CONTROL the same scan sees figtext.py import numloc', 'numloc' in got, repr(sorted(got)))

print('\nALL PASS' if not fails else f'\n{len(fails)} FAILED: ' + ', '.join(fails))
sys.exit(1 if fails else 0)
