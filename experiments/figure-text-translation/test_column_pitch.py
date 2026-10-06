#!/usr/bin/env python3
"""§C140 '6', M4 - a centre-guessed single-line label takes its source COLUMN's side (A2v), and a label drawn on
the source's own line count is drawn on the source's own rows (P1v).

    FIGTEXT_PYLIBS=./pylibs python3 -B -u test_column_pitch.py

Plain checks and a module-level `RESULTS` list, like its siblings - there is no pytest in this tree. PURE: no
artwork, no cairo, nothing composed, nothing spawned. It reads only the committed fixtures in
evidence/2026-10-06-c140-v6-m4/ (provenance in that directory's README): three figures' prepared `runs.json`
(FoodLabel, strong, PeriodicPU_img - the figures whose BLOCKS `column_side` walks), and `base-records.json`, the
pre-M4 composer's own decide records (container + cues exactly as compose.py built them) for every block used here.
MassSpec, FracDistil and HazDiamond are read through `base-records.json` only.

Design: docs/superpowers/specs/2026-10-05-c140-composer-formatting-class-design.md, D-d (A2v) and D-e (P1v).
Gates: figcontainers.COLUMN_ALIGN / COLUMN_MIN / COLUMN_SIZE_TOL and figlayout.PITCH_SRC / PITCH_SRC_MIN.

WHAT IS PINNED, AND WHY EACH ONE CAN FAIL
----------------------------------------
Red on the pre-M4 composer (A2v):
* A-1  FoodLabel 'Total Fat 12g' (cell, block 7) aligns LEFT - the pre-M4 centre drew Heildarfita outside the frame.
* A-2  FoodLabel 'Saturated Fat 3g' (cell, block 11) aligns LEFT.
* A-3  FoodLabel 'Footnote' (OPEN, block 40) aligns LEFT - the open_alignment hook, not the cell one.
* A-4  strong 'hydrochloric acid' (cell, block 9) aligns LEFT - a corpus case outside the named figure.
Red on the pre-M4 composer (P1v):
* P-1  FoodLabel's lower table (cell, block 16, 6 rows) is drawn on the source rows: lead 5.5, top = the first
       source baseline (the pre-M4 lead is sz0 * LEAD = 4.888).
* P-2  FracDistil 'Small molecules' (open, block 2, 5 rows): lead = the source pitch 9.209, not 10.998.
CONTROLS (G13: pass before and after by design; each is turned red by a variant the spec rejected, recorded in the
spec's D-d/D-e tests and the M4 design run - the ungated A2 and the threshold-free P1/P1B):
* C-1  periodic table 'copper' (block 221) stays CENTRE. The GRID-COINCIDENCE control: a column rule that counts
       siblings at any size sees copper's right edge against its symbol and mass and moves it right (column
       L3C7R8 under the ungated A2). Only the same-size rule and the centre veto hold it.
* C-2  periodic table 'samarium' (block 407, which shares all three edges with 'plutonium') stays CENTRE. It guards
       only a same-size-majority variant.
* C-7  the CENTRE VETO (R-8b, `c['center'] > 0`), on `column_side` itself: periodic table 'meitnerium' (block 196)
       has two same-size left-edge siblings and seven centre ones (column L2C7R0) and returns no side. C-1 cannot
       see the veto alone - under the same-size rule copper has no left/right support to veto - so a variant that
       drops only the veto passes C-1..C-6 and fails here. SKIPPED where figcontainers has no column_side.
* C-3  MassSpec block 4, whose source pitch equals sz0 * LEAD: the lead is unchanged.
* C-4  FoodLabel 'more is| ' with a blank second source line (cues['blank'] = [False, True]): the lead is unchanged.
       The cue shape is the pre-M2 one (n_src 2): after M2 compose folds that line and builds n_src 1, so this pins
       the guard as defence in depth, with hand-built cues.
* C-4+ the POSITIVE control for the blank guard: with PITCH_SRC_MIN opened to 0 (that span is off by only
       0.61 pt), the same cues WITHOUT 'blank' DO move the lead, and WITH it they do not - so C-4 holds because of
       the guard, not because the threshold happened to hold it. SKIPPED where figlayout has no PITCH_SRC.
* C-5  HazDiamond's first 'box' block drawn on its source line count: the lead stays sz0 * LEAD and the glyph box
       stays centred in the box (R2 box-vertical; P1v never reaches a box).
* C-6  FoodLabel 'Cholesterol|Sodium' (block 8, span off by 0.67 pt, below PITCH_SRC_MIN 1.0) keeps its lead.
Gate-off controls (spec §2 records that M4's gate-off = base was asserted, never measured; these measure it on
these records). SKIPPED where the gate constant does not exist; the constant is restored in `finally`:
* G-1  COLUMN_ALIGN = False: A-1..A-4 return 'center', the base record's own `align`.
* G-2  PITCH_SRC = False: P-1 and P-2 return the base record's own `lead` and `top`.
`cell_align` falls back to the 3-argument `cell_alignment` on a TypeError, so on the pre-M4 composer A-1/A-2/A-4
fail on their VALUE and C-1/C-2 still run, instead of one crash for all of them.
"""
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, os.environ.get('FIGTEXT_PYLIBS', str(HERE / 'pylibs')))
sys.path.insert(0, str(HERE))
import figtext as FT  # noqa: E402
import figcontainers as FC  # noqa: E402
import figlayout as FL  # noqa: E402
import figscripts as FS  # noqa: E402

FX = HERE / 'evidence' / '2026-10-06-c140-v6-m4'
REC = json.loads((FX / 'base-records.json').read_text())
RESULTS = []
FOOD, STRONG, PERIODIC = 'CNX_Chem_05_02_FoodLabel', 'CNX_Chem_14_03_strong', 'CNX_Chem_00_AA_PeriodicPU_img'
FRAC, MASS, HAZ = 'CNX_Chem_20_01_FracDistil', 'CNX_Chem_02_03_MassSpec', 'CNX_Chem_01_03_HazDiamond'


def check(name, ok, detail=''):
    RESULTS.append((name, bool(ok)))
    print(('PASS ' if ok else 'FAIL ') + name + (f'   [{detail}]' if detail else ''))


def blocks_of(fig):
    return FT.merge_blocks(FT.group(json.loads((FX / f'{fig}.runs.json').read_text())))


def cell_align(fig, bi):
    blocks, c = blocks_of(fig), REC[fig][str(bi)]['container']
    try:
        return FC.cell_alignment(blocks[bi], c['src_left_margin'], c['src_right_margin'], bi, blocks)
    except TypeError:                                   # pre-M4: the 3-argument signature
        return FC.cell_alignment(blocks[bi], c['src_left_margin'], c['src_right_margin'])


def open_align(fig, bi):
    blocks, c = blocks_of(fig), REC[fig][str(bi)]['container']
    return FC.open_alignment(bi, blocks, c['free_left_clear'], c['free_right_clear'])


def lay(fig, bi, text, cues_extra=None, drop=()):
    r = REC[fig][str(bi)]
    cues = {k: v for k, v in r['cues'].items() if k not in drop}
    cues.update(cues_extra or {})
    words = FS.words(text, [None] * len(text))
    width = lambda chars, size, j: 0.5 * size * len(chars)  # noqa: E731
    return FL.decide(words, width, dict(r['container']), cues), r


A_ARMS = (('A-1 FoodLabel Total Fat 12g -> left', FOOD, 7, cell_align),
          ('A-2 FoodLabel Saturated Fat 3g -> left', FOOD, 11, cell_align),
          ('A-3 FoodLabel Footnote (open) -> left', FOOD, 40, open_align),
          ('A-4 strong hydrochloric acid -> left', STRONG, 9, cell_align))
P_TEXT = {(FOOD, 16): 'a b c d e f', (FRAC, 2): 'aa bb cc dd ee'}

# ---------------- RED arms ----------------
for name, fig, bi, fn in A_ARMS:
    side, why = fn(fig, bi)
    check(name, side == 'left', why)

L, r = lay(FOOD, 16, P_TEXT[(FOOD, 16)])
projs = r['cues']['projs']
check('P-1 FoodLabel lower table on the source rows (lead 5.5, top = first baseline)',
      len(L['lines']) == 6 and abs(L['lead'] - 5.5) < 1e-6 and abs(L['top'] - projs[0]) < 1e-6,
      f"n {len(L['lines'])} lead {L['lead']:.4f} top {L['top']:.4f} first baseline {projs[0]:.4f}")
L, r = lay(FRAC, 2, P_TEXT[(FRAC, 2)])
p = r['cues']['projs']
check('P-2 FracDistil small molecules: lead = source pitch',
      len(L['lines']) == 5 and abs(L['lead'] - (p[0] - p[-1]) / 4) < 1e-6,
      f"n {len(L['lines'])} lead {L['lead']:.4f} source {(p[0] - p[-1]) / 4:.4f}")

# ---------------- CONTROLS ----------------
for name, bi in (('C-1 periodic copper stays centre', 221), ('C-2 periodic samarium stays centre', 407)):
    side, why = cell_align(PERIODIC, bi)
    check(name, side == 'center', why)

if hasattr(FC, 'column_side'):
    blocks = blocks_of(PERIODIC)
    name = ''.join(r['text'] for r in blocks[196])
    side, why = FC.column_side(196, blocks)
    check('C-7 periodic meitnerium: a centre coincidence vetoes the left column (R-8b)',
          name == 'meitnerium' and side is None and why == 'column(L2C7R0)', f'{name!r} {side} {why}')
else:
    print('SKIP C-7 (figcontainers has no column_side)')

L, r = lay(MASS, 4, 'aa bb cc')
check('C-3 MassSpec: source pitch == sz0*LEAD keeps the lead',
      len(L['lines']) == 3 and abs(L['lead'] - r['cues']['sz0'] * FL.LEAD) < 1e-9, f"lead {L['lead']}")

L, r = lay(FOOD, 45, 'aa bb', {'blank': [False, True]})
lead0 = r['cues']['sz0'] * FL.LEAD
check('C-4 FoodLabel more is| with blank cue: lead unchanged',
      len(L['lines']) == 2 and abs(L['lead'] - lead0) < 1e-9, f"lead {L['lead']:.4f} vs {lead0:.4f}")
if hasattr(FL, 'PITCH_SRC'):
    saved = FL.PITCH_SRC_MIN
    try:
        FL.PITCH_SRC_MIN = 0.0      # the span is off by 0.61 pt; open the threshold so only the blank guard decides
        L2, _ = lay(FOOD, 45, 'aa bb', {'blank': [False, False]})
        L3, _ = lay(FOOD, 45, 'aa bb', {'blank': [False, True]})
    finally:
        FL.PITCH_SRC_MIN = saved
    check('C-4+ positive control: without the blank cue the same label DOES move; with it, it does not',
          abs(L2['lead'] - lead0) > 0.1 and abs(L3['lead'] - lead0) < 1e-9,
          f"no-blank lead {L2['lead']:.4f}, blank lead {L3['lead']:.4f}")
else:
    print('SKIP C-4+ (figlayout has no PITCH_SRC gate)')

hz = REC[HAZ]
k = [k for k, v in hz.items() if v['container'].get('cls') == 'box' and v['n'] == v['cues']['n_src'] >= 2][0]
L, r = lay(HAZ, int(k), ' '.join(['ab'] * hz[k]['n']))
c = r['container']
gl_mid = L['top'] - (len(L['lines']) - 1) / 2 * L['lead'] + (FL.ASC - FL.DESC) / 2 * L['size']
check(f'C-5 HazDiamond box block {k}: lead stays sz0*LEAD and the glyph box stays centred in the box',
      abs(L['lead'] - r['cues']['sz0'] * FL.LEAD) < 1e-9 and abs(gl_mid - (c['D'] + c['U']) / 2) < 1e-6,
      f"lead {L['lead']:.4f}, glyph mid {gl_mid:.3f} vs box mid {(c['D'] + c['U']) / 2:.3f}")

L, r = lay(FOOD, 8, 'aaaa bbbb')
check('C-6 FoodLabel Cholesterol|Sodium (span off 0.67 pt) keeps the lead',
      len(L['lines']) == 2 and abs(L['lead'] - r['lead']) < 1e-9, f"lead {L['lead']:.4f} vs base {r['lead']:.4f}")

# ---------------- gate-off controls ----------------
if hasattr(FC, 'COLUMN_ALIGN'):
    saved = FC.COLUMN_ALIGN
    try:
        FC.COLUMN_ALIGN = False
        got = [(name, fn(fig, bi)[0], REC[fig][str(bi)]['align']) for name, fig, bi, fn in A_ARMS]
    finally:
        FC.COLUMN_ALIGN = saved
    check('G-1 COLUMN_ALIGN off: A-1..A-4 return the base align (center)',
          all(side == base == 'center' for _, side, base in got),
          '; '.join(f'{n.split()[0]} {s} (base {b})' for n, s, b in got))
else:
    print('SKIP G-1 (figcontainers has no COLUMN_ALIGN gate)')

if hasattr(FL, 'PITCH_SRC'):
    saved = FL.PITCH_SRC
    try:
        FL.PITCH_SRC = False
        got = [(fig, bi, lay(fig, bi, txt)) for (fig, bi), txt in P_TEXT.items()]
    finally:
        FL.PITCH_SRC = saved
    check('G-2 PITCH_SRC off: P-1 and P-2 return the base lead and top',
          all(len(L['lines']) == r['n'] and abs(L['lead'] - r['lead']) < 1e-9 and abs(L['top'] - r['top']) < 1e-9
              for _, _, (L, r) in got),
          '; '.join(f"{fig.split('_')[-1]} {bi}: lead {L['lead']:.4f}/{r['lead']:.4f} top {L['top']:.4f}/{r['top']:.4f}"
                    for fig, bi, (L, r) in got))
else:
    print('SKIP G-2 (figlayout has no PITCH_SRC gate)')

bad = [n for n, ok in RESULTS if not ok]
print('ALL PASS' if not bad else f'{len(bad)} FAILED: ' + '; '.join(bad))
sys.exit(1 if bad else 0)
