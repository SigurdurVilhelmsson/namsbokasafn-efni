#!/usr/bin/env python3
"""§C140 ㊾ D5(a) - heldplan.py, the planner for a held block, tested alone.

    FIGTEXT_PYLIBS=./pylibs python3 -B -u test_heldplan.py

Plain checks and a module-level `fails` list, like its siblings - there is no pytest in this tree.
HP0-HP15, HP17 and HP18 are PURE: real runs from the committed evidence, a fake container (a thunk
that counts its calls), a fake width (0.5 x size x ratio per character; HP18's own depends on the run's
weight) and a fake has_glyph. HP16 adds non-pure inputs: a test-local cairo width (hint
metrics off - compose.lin_advance's measure, copied) and the real figis cmap, against each block's REAL
committed container. HP10c is the other non-pure arm: a REAL figcontainers.container_for (Pillow from
pylibs), imported lazily so HP0 still sees heldplan's own imports only. No file IO but one read of evidence/2026-10-03-c140-held/held-geometry.json;
nothing is spawned, nothing is drawn.

Design: docs/superpowers/specs/2026-10-03-c140-step2-part5-heldblockvalues-design.md, D-a, D-b, D-c,
D-i (HP1-HP16). Values are ASCII sentinels (QZX, QZQ, QZ) and formula characters; the one exception is
the value sheet's B3, quoted verbatim as evidence (docs/handoffs/2026-10-03-step2-value-sheet.md).

WHAT IS PINNED, AND WHY EACH ONE CAN FAIL
----------------------------------------
* HP0  heldplan imports only figtext, figscripts, figlayout, heldvalues (and figtext's numloc): no
       cairo, Pillow, pdfplumber or _deps. Kills a planner that cannot be unit-tested.
* HP1-HP3 script characters are drawn in the block's OWN source style: MolSpeed1's letter O plain and
       its 2 at (0.7778, -0.2222); phscale's 0 at (0.7778, 0.4445); buffer's (B3) 3 and 2 at
       (0.7778, -0.3333) and its charge as U+2013 at (0.7778, 0.4444). Kills FS.transfer (it styles 0
       characters of B1: digit-zero 02 against letter-O), constant geometry, a sub/sup swap, NFKC
       (U+2212) and literal script glyphs.
* HP4-HP6 a kind with no source style refuses `no-source-script:<kind>`, two or more refuse
       `ambiguous-source-script:<kind>`, and OxStNonmts' italic-only STIX charge (1.0, 0.0714, italic)
       is NOT a superscript. Kills a constant fallback, take-first, and a sign-only script reading.
       ⚠️ HP6 DEVIATES from the design's literal value `4⁺\\nQZQ\\n4–`: under D-c's own unchanged rule
       (script marks ignored) its line 0 decodes to `4+`, equal to the source, so it is planned as runs
       and nothing asks for a superscript. HP6 moves the ⁺ onto the CHANGED line (`4+\\nQZ⁺\\n4–`), and
       pins the literal value as accepted with line 0 planned as runs. A changed line 0 there refuses
       `italic-not-carried` first (D-c's order) - HP6c measures that on the committed runs.
* HP7  the value's line count is the VISUAL line count: buffer is 1 (2 FT.lines), OxStNonmts 3.
* HP8  unchanged lines are planned as the `drawn` runs THEMSELVES (identity, not equality - drawn is
       built from copies, because compose.localise_block returns the SAME dict for an unchanged run
       and an equality check could not tell a drawn slice from a source slice), at the right offsets.
* HP9  numloc: the localised source form counts as unchanged, and a changed line is never localised.
* HP10 a box with a multi-line block refuses `box-multiline`; a one-line block in it is accepted.
       HP10c (§C140 '6', M7; ruling R-2a = C) a box that holds ANOTHER block's source line is a SHARED
       box, laid out on the cell path (which reads the source baselines), so the same 2-visual-line
       amide1 block in a planted stroked rect beside amide1 b1 is PLANNED, not refused; its pair, the
       same rect holding the block alone, is still refused `box-multiline` (a CONTROL). Red before M7
       (container_for called that box a box). The container is the REAL figcontainers.container_for
       on a planted page and a blank Pillow image, imported lazily inside the arm as HP16 imports cairo.
* HP11 the acceptance predicate, ONE KILLER PER CLAUSE: (a) buffer with a long sentinel (the design's
       arm) and (e) a cell wrap to 2 lines at sz0, step 'fit' - only `len(lines) == 1` refuses it;
       (b) an open shrink (step iii-anchor, which the step clause catches too) and (f) a CELL shrink,
       step 'fit' at 8.75 pt - only `size == sz0` refuses it; (c) a 7 pt open label overflowing at its
       own floor, which is 0.8 x 7.0 since R-16 ([USER] 2026-10-05: a source below 7.5 pt may shrink to
       0.8 x its size); (c2) an open and (c3) a CELL 7 pt label that fits only BELOW its source size under
       R-16 - a held value is still never shrunk, and in the cell only `size == sz0` refuses it. Both are
       red before R-16 in their DETAIL only (they refused at 7.0 then); what makes c3 the size clause's
       killer is a planted mutant without that clause, which plans it (G13 evidence, in the T8 report);
       c3-pre is its CONTROL. (d1) a stubbed decide returning 'floor-overflow' with overflow None at sz0 on one line
       - only the step clause; (d2) a stubbed decide returning step 'i' with an overflow - only the
       overflow clause. figlayout sets `overflow` on every 'floor-overflow' and never on 'i'/'ii'/'fit',
       so a stub is the only way to make those two clauses the deciding one (the design keeps them as
       belts).
* HP12 `opens-styled` and `italic-not-carried`, and their order. HP12d PINS THE STYLE UNIT: a run's
       style is figscripts.line_styles of its OWN figtext.lines line (the probe's and body_size's unit),
       so an italic stacked charge on a changed visual line refuses (fail-closed), where analysed with
       the whole visual line it would read as an italic script.
* HP13 `no-glyph:U+XXXX` names the code point; has_glyph is asked about the face the segment draws in
       (bold from the line's first run, italic from the style) - and an italic SCRIPT is carried, not
       refused `italic-not-carried`.
* HP14 `arc`, `no-change`, `container-error`; a malformed value raises HeldValueError, never a
       refusal or a draw. Every refusal's detail is JSON (compose writes it to compose-report.json).
* HP15 all-or-nothing: a refusal on line 2 after a good line 1 returns no plan. The container thunk
       is called once on a planned block and never on an arc, line-count, malformed or no-change one.
* HP17 sz0 is the line's BODY size (figscripts.body_size), not its first run's: an 11 pt STIX symbol
       opening a 9 pt line is planned at 9.0.
* HP18 (a skeptic's finding, 2026-10-03) the AXES and the MEASURING RUN of a changed line, against a
       width that depends on the weight of the run it is handed (as compose's seg_width does): a rot-90
       line is centred on its own ALONG extent at its own PROJ (kills cues read from x / y), and a bold
       changed line under a regular first line is measured in its OWN run's weight (kills measuring with
       block[0]). Every value-sheet line is rot 0 and shares its weight with block[0], so HP16 cannot.
* HP16 REAL PLACEMENTS on the 13 value-sheet lines: step, size, top, disp and vdisp literally as the
       D-c table gives them, and the ANCHOR each row's drawn extent implies - the table's midpoint for a
       centred row, its x0 for amide1 b1 (left), its right edge 87.26 for amide1 b0 (right: a block
       anchor would sit at 104.53). ⚠️ DEVIATES: the table's own extents were measured with [USER]'s
       Icelandic values, which no test here may author, so 12 rows draw a sentinel and assert the
       anchor; buffer draws B3 verbatim and asserts the full extent 101.72..234.21 (disp +1.24, the
       0.51 pt spare). The width is pinned on English source text instead of `Nei`: No bold 9 = 12.00,
       or = 8.00, R or H = 26.00, To bold 7 = 8.55, buffer's line 130.99 before and B3 132.49 after.
* HP19-HP23 (§C140 '6', M2; spec docs/superpowers/specs/2026-10-05-c140-composer-formatting-class-design.md
       D-b, ruling R-17) a source line that draws only U+0020 (the next row's indent space) is NO line: on
       FoodLabel's purple cell (evidence/2026-10-06-c140-v6-m2/foodlabel-purple-runs.json, the real runs and
       the real container snapshot, still with the pure fake width and has_glyph) [USER]'s ruled one-line
       bullets plan with line 0 changed (HP19 `• 5% eða minna`, HP20 `• 20% eða` - quoted from the R-15g2
       ruling / the value sheet, the second exception to D-i's sentinels); a two-line bullet, whose second
       line would sit on `er lítið`, refuses `line-count` (HP21); a value equal to the ink text refuses
       `no-change` and is never re-laid in English (HP22 - the unchanged test reads the INK runs, not the
       visual line with its folded space). HP19-HP22 are red on the pre-M2 planner (it counted 2 visual
       lines: HP19/HP20/HP22 refused `line-count`, HP21 was ACCEPTED as the collision). HP23 is a CONTROL:
       an unchanged value on the no-blank `Quick|guide to|% DV` is `no-change` on both sides.
* HP24 (G21 review-fix round, F2 n5) a script style that differs only in its STIX face (`serif`) is ONE pooled
       style: a Liberation `2` and a STIX `+` of one size and rise pool to one `sup` (red before: a TypeError
       sorting None against a tuple), and a held ^ mark on it is planned (HP24a/b); two STIX faces pool to one,
       face None (HP24c, red before: two entries); HP24d is a CONTROL - faces that agree keep that face (its
       mutant, the face always None, is in the round's report).
* HP25 (G21, F2 n46; this pins what T1 D4 disclosed as NOT PINNED) a changed line with a folded blank run: its
       'layout' entry spans the FULL visual line, so the entries partition the block (HP25a planted, HP25c the
       real FoodLabel bullet - mutant: the entry carries the ink slice), and its cues are the INK runs' - the
       layout equals the same block without the blank run (HP25b - mutant: cues from the full line pull x0 left).
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent          # never process.cwd() - repo rule
sys.path.insert(0, str(HERE))

_BEFORE = set(sys.modules)
import heldplan as HP                           # noqa: E402 - FIRST, so HP0 sees only its imports
_NEW = set(sys.modules) - _BEFORE

import figtext as FT                            # noqa: E402
import figscripts as FS                         # noqa: E402
import figlayout as FL                          # noqa: E402
import heldvalues as HV                         # noqa: E402
import numloc                                   # noqa: E402
import blockkey as BK                           # noqa: E402 - HP19-HP23 address FoodLabel blocks by key

GEOMETRY = HERE / 'evidence' / '2026-10-03-c140-held' / 'held-geometry.json'
GEOM = json.loads(GEOMETRY.read_text(encoding='utf-8'))
# The value sheet's B3, quoted VERBATIM as evidence (docs/handoffs/2026-10-03-step2-value-sheet.md) -
# the only value in this file that is not an ASCII sentinel (design D-i).
B3 = '[CH₃CO₂H] er 11% af [CH₃CO₂⁻]'
SUB_MOL = FS.SourceStyle(0.7778, -0.2222, False)
SUP_PH = FS.SourceStyle(0.7778, 0.4445, False)
SUB_BUF = FS.SourceStyle(0.7778, -0.3333, False)
SUP_BUF = FS.SourceStyle(0.7778, 0.4444, False)
OX_CHARGE = FS.SourceStyle(1.0, 0.0714, True, (True, True))   # M6: from a Type 1 STIXGeneral-BoldItalic run

fails = []
REFUSALS = []


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


def held(basename, index):
    """(runs, container, fonts) of one committed value-sheet block."""
    fig = GEOM['figures'][basename]
    blk = next(b for b in fig['blocks'] if b['block'] == index)
    return blk['runs'], blk['container'], fig['fonts']


def localise(block):
    """compose.localise_block's rule (compose.py draws at import and cannot be imported), except that
    EVERY run is a copy - so an identity check can tell a drawn run from a source run."""
    out = []
    for line in FT.lines(block):
        for r, t in zip(line, numloc.localize_runs([r['text'] for r in line])):
            out.append(dict(r, text=t))
    return out


class Thunk:
    """A container thunk that counts its calls."""

    def __init__(self, c):
        self.c, self.calls = c, 0

    def __call__(self):
        self.calls += 1
        return self.c


def fake_width(chars, size, run):
    return sum(0.5 * size * (st.ratio if st is not None else 1.0) for _, st in chars)


def yes_glyph(ch, bold, italic):
    return True


ROOMY = {'cls': 'open', 'why': 'test-roomy', 'FL': -10000.0, 'FR': 10000.0, 'room_up': 100.0,
         'room_down': 100.0, 'free_left_clear': 0.0, 'free_right_clear': 0.0, 'align': 'center',
         'align_why': 'test'}
BOX = {'cls': 'box', 'why': 'test-box', 'L': -10000.0, 'R': 10000.0, 'D': -10000.0, 'U': 10000.0,
       'src_left_margin': 1.0, 'src_right_margin': 1.0, 'src_up_margin': 1.0, 'src_down_margin': 1.0,
       'align': 'center', 'align_why': 'test'}


def bold_of(fonts):
    return lambda r: 'bold' in fonts.get(r['font'], {}).get('base', '').lower()


def plan(block, value, fonts, *, drawn=None, container=ROOMY, width=fake_width, has_glyph=yes_glyph):
    th = container if isinstance(container, Thunk) else Thunk(container)
    return HP.plan_block(block, value, fonts, localise(block) if drawn is None else drawn,
                         is_bold=bold_of(fonts), container=th, width=width, has_glyph=has_glyph)


def refused(fn):
    """The HeldRefusal fn raises, or None when it returns."""
    try:
        fn()
    except HP.HeldRefusal as e:
        REFUSALS.append(e)
        return e
    return None


def why(e):
    return 'returned a plan' if e is None else f'{e.reason} {e.detail}'


def layout_chars(p, entry):
    """The (char, style) list of the ONE drawn line of plan entry `entry` (a 'layout' entry)."""
    return p.lines[entry][1]['lines'][0]


# Planted runs for the shapes no value-sheet block has. Every font key is described in PF.
PF = {'T/R': {'base': '/AAAAAA+LiberationSans'}, 'T/B': {'base': '/AAAAAA+LiberationSans-Bold'},
      'T/I': {'base': '/AAAAAA+LiberationSans-Italic'}, 'T/S': {'base': '/AAAAAA+STIXGeneral-Regular'}}


def run(text, size, x, y, adv=None, font='T/R'):
    return dict(text=text, font=font, size=size, rot=0.0, x=x, y=y,
                adv=0.5 * size * len(text) if adv is None else adv, fill=['cmyk', 0.0, 0.0, 0.0, 1.0])


MATT, MATT_C, MATT_F = held('CNX_Chem_01_02_MattType', 11)
MOL, MOL_C, MOL_F = held('CNX_Chem_09_05_MolSpeed1', 13)
PH, PH_C, PH_F = held('CNX_Chem_14_02_phscale', 5)
BUF, BUF_C, BUF_F = held('CNX_Chem_14_06_buffer', 23)
OX, OX_C, OX_F = held('CNX_Chem_18_04_OxStNonmts', 2)
AM0, AM0_C, AM_F = held('CNX_Chem_20_04_amide1_img', 0)
AM1, AM1_C, _ = held('CNX_Chem_20_04_amide1_img', 1)


# ── HP0 ────────────────────────────────────────────────────────────────────────────────────────
print('HP0 heldplan is pure: its imports')
EXPERIMENT = {p.stem for p in HERE.glob('*.py')}
_exp = {m for m in _NEW if m in EXPERIMENT}
check('HP0a heldplan imports exactly figtext, figscripts, figlayout, heldvalues and figtext\'s numloc',
      _exp == {'heldplan', 'figtext', 'figscripts', 'figlayout', 'heldvalues', 'numloc'}, f'{sorted(_exp)}')
_bad = sorted(_NEW & {'cairo', 'PIL', 'pikepdf', 'pdfplumber', 'pdfminer', '_deps', 'fontTools', 'figis'})
check('HP0b no cairo, Pillow, pikepdf, pdfplumber, fontTools, figis or _deps', not _bad, f'{_bad}')


# ── HP1-HP3 ────────────────────────────────────────────────────────────────────────────────────
print('\nHP1-HP3 a script character is drawn in the block\'s OWN source style')


def hp1():
    check('HP1-pre MolSpeed1\'s pool is its one subscript style',
          HP.script_pool(MOL, MOL_F) == {'sub': [SUB_MOL], 'sup': []}, f'{HP.script_pool(MOL, MOL_F)}')
    p = plan(MOL, 'O₂ QZ T = 300 K', MOL_F)
    ch = layout_chars(p, 0)
    check('HP1a one changed line, laid out on one line',
          p.changed == [0] and p.lines[0][0] == 'layout' and len(p.lines[0][1]['lines']) == 1, f'{p.changed}')
    check('HP1b the LETTER O is plain', ch[0] == ('O', None), f'{ch[0]}')
    check('HP1c the 2 is drawn in the block\'s own subscript style (0.7778, -0.2222, roman)',
          ch[1] == ('2', SUB_MOL), f'{ch[1]}')
    check('HP1d nothing else is styled', all(st is None for _, st in ch[2:]),
          f'{[c for c in ch[2:] if c[1] is not None]}')


def hp2():
    p = plan(PH, '10⁰ QZ 1', PH_F)
    ch = layout_chars(p, 0)
    check('HP2a phscale: the raised 0 is drawn in its own superscript style (0.7778, 0.4445)',
          ch[2] == ('0', SUP_PH), f'{ch[:3]}')
    check('HP2b the 1 and 0 before it are plain (a sub/sup swap or a shifted index fails here)',
          ch[0] == ('1', None) and ch[1] == ('0', None), f'{ch[:2]}')


def hp3():
    check('HP3-pre buffer\'s pool: one subscript, one charge style (the charge reaches it via token_lines)',
          HP.script_pool(BUF, BUF_F) == {'sub': [SUB_BUF], 'sup': [SUP_BUF]}, f'{HP.script_pool(BUF, BUF_F)}')
    p = plan(BUF, B3, BUF_F)
    ch = layout_chars(p, 0)
    decoded = B3.translate({ord('₃'): '3', ord('₂'): '2', ord('⁻'): '–'})
    check('HP3a B3 is drawn as its decoded text, one line', ''.join(c for c, _ in ch) == decoded,
          repr(''.join(c for c, _ in ch)))
    check('HP3b the styled characters are 3 2 3 2 in the subscript style, then U+2013 in the charge style',
          [(c, st) for c, st in ch if st is not None]
          == [('3', SUB_BUF), ('2', SUB_BUF), ('3', SUB_BUF), ('2', SUB_BUF), ('–', SUP_BUF)],
          f'{[(c, st) for c, st in ch if st is not None]}')
    check('HP3c no character of U+2070-U+209F is drawn (no literal script glyph, no U+2212)',
          not any(0x2070 <= ord(c) <= 0x209F or c == '−' for c, _ in ch))


attempt('HP1', hp1)
attempt('HP2', hp2)
attempt('HP3', hp3)


# ── HP4-HP6 ────────────────────────────────────────────────────────────────────────────────────
print('\nHP4-HP6 a kind needs EXACTLY one source style of it')


def hp4():
    check('HP4-pre MattType has no script style at all', HP.script_pool(MATT, MATT_F) == {'sub': [], 'sup': []})
    e = refused(lambda: plan(MATT, 'Q₂', MATT_F))
    check('HP4 MattType with Q₂ refuses no-source-script:sub (never a constant, never flat)',
          e is not None and e.reason == 'no-source-script:sub' and e.detail == {'line': 0, 'found': 0}, why(e))


def hp5():
    two = [run('H', 9.0, 100.0, 100.0, 6.5), run('2', 7.0, 106.5, 98.0, 3.9),
           run(' and C', 9.0, 110.4, 100.0, 25.0), run('2', 7.0, 135.4, 97.0, 3.9)]
    pool = HP.script_pool(two, PF)
    check('HP5-pre the planted block holds two subscript families (-0.2222 and -0.3333)',
          pool == {'sub': [FS.SourceStyle(0.7778, -0.3333, False), FS.SourceStyle(0.7778, -0.2222, False)],
                   'sup': []}, f'{pool}')
    e = refused(lambda: plan(two, 'Q₂', PF))
    check('HP5a Q₂ refuses ambiguous-source-script:sub (no take-first, no most-characters)',
          e is not None and e.reason == 'ambiguous-source-script:sub' and e.detail == {'line': 0, 'found': 2},
          why(e))
    check('HP5b CONTROL the same block with no script character is planned',
          refused(lambda: plan(two, 'QZX', PF)) is None)


def hp6():
    tokens, _ = FS.source_tokens(OX, OX_F)
    check('HP6-pre OxStNonmts\' STIX charge IS styled in the source (1.0, 0.0714, italic) - the pool sees it',
          any(st == OX_CHARGE for t in tokens for st in t['styles']), f'{tokens}')
    check('HP6-pre ... and rejects it: the pool is empty', HP.script_pool(OX, OX_F) == {'sub': [], 'sup': []},
          f'{HP.script_pool(OX, OX_F)}')
    e = refused(lambda: plan(OX, '4+\nQZ⁺\n4–', OX_F))
    check('HP6a a superscript on the changed line refuses no-source-script:sup (the italic charge is not sup)',
          e is not None and e.reason == 'no-source-script:sup' and e.detail == {'line': 1, 'found': 0}, why(e))
    p = plan(OX, '4⁺\nQZQ\n4–', OX_F)
    check('HP6b the design\'s literal value is ACCEPTED: its line 0 decodes to 4+ and is planned as runs',
          p.changed == [1] and p.lines[0][0] == 'runs', f'{p.changed}')
    e = refused(lambda: plan(OX, '4⁺ QZ\nQZQ\n4–', OX_F))
    check('HP6c a CHANGED line 0 refuses italic-not-carried before any script check (D-c\'s order)',
          e is not None and e.reason == 'italic-not-carried' and e.detail == {'line': 0}, why(e))


attempt('HP4', hp4)
attempt('HP5', hp5)
attempt('HP6', hp6)


# ── HP7-HP9 ────────────────────────────────────────────────────────────────────────────────────
print('\nHP7-HP9 visual lines, the plan\'s shape, numloc')


def hp7():
    check('HP7-pre buffer is 2 FT.lines and 1 visual line; OxStNonmts 3 and 3',
          (len(FT.lines(BUF)), len(FT.visual_lines(BUF)), len(FT.lines(OX)), len(FT.visual_lines(OX)))
          == (2, 1, 3, 3))
    th = Thunk(ROOMY)
    e = refused(lambda: plan(BUF, 'QZX\nQZQ', BUF_F, container=th))
    check('HP7a a 2-line value on buffer refuses line-count {value 2, visual 1}',
          e is not None and e.reason == 'line-count' and e.detail == {'value': 2, 'visual': 1}, why(e))
    e = refused(lambda: plan(OX, 'QZX\nQZQ', OX_F, container=th))
    check('HP7b a 2-line value on OxStNonmts refuses line-count {value 2, visual 3}',
          e is not None and e.reason == 'line-count' and e.detail == {'value': 2, 'visual': 3}, why(e))
    check('HP7c a line-count refusal never fetches the container', th.calls == 0, f'{th.calls}')
    check('HP7d CONTROL a 1-line value on buffer is planned', refused(lambda: plan(BUF, 'QZX QZQ', BUF_F)) is None)


def hp8():
    drawn = localise(OX)
    p = plan(OX, '4+\nQZQ\n4–', OX_F, drawn=drawn)
    check('HP8a OxStNonmts: three entries, only line 1 changed', len(p.lines) == 3 and p.changed == [1],
          f'{len(p.lines)} {p.changed}')
    check('HP8b line 0 is (\'runs\', drawn[0:2]) - the drawn dicts THEMSELVES',
          p.lines[0] == ('runs', drawn[0:2]) and all(a is b for a, b in zip(p.lines[0][1], drawn[0:2])))
    check('HP8c line 1 is (\'layout\', <layout>, the SOURCE runs of visual line 1)',
          p.lines[1][0] == 'layout' and len(p.lines[1]) == 3 and len(p.lines[1][2]) == 1
          and p.lines[1][2][0] is OX[2] and isinstance(p.lines[1][1], dict))
    check('HP8d line 2 is (\'runs\', drawn[3:5]) - the drawn dicts THEMSELVES',
          p.lines[2] == ('runs', drawn[3:5]) and all(a is b for a, b in zip(p.lines[2][1], drawn[3:5])))
    check('HP8e the entries partition the block in order (2 + 1 + 2 runs)',
          [len(e[1]) if e[0] == 'runs' else len(e[2]) for e in p.lines] == [2, 1, 2])


def hp9():
    nl = [run('2.54 cm', 9.0, 100.0, 100.0), run('length', 9.0, 100.0, 89.0)]
    drawn = localise(nl)
    check('HP9-pre the planted block is 2 visual lines and localises to 2,54 cm',
          len(FT.visual_lines(nl)) == 2 and drawn[0]['text'] == '2,54 cm', drawn[0]['text'])
    p = plan(nl, '2,54 cm\nQZX', PF, drawn=drawn)
    check('HP9a the LOCALISED source form is unchanged: line 0 is planned as the drawn run',
          p.changed == [1] and p.lines[0] == ('runs', drawn[0:1]) and p.lines[0][1][0] is drawn[0], f'{p.changed}')
    p = plan(nl, '2.54 cm\nQZX', PF, drawn=drawn)
    check('HP9b the SOURCE form is unchanged too', p.changed == [1] and p.lines[0][0] == 'runs', f'{p.changed}')
    p = plan(nl, '2.54 QZ\nlength', PF, drawn=drawn)
    text = ''.join(c for c, _ in layout_chars(p, 0))
    check('HP9c a changed line keeps [USER]\'s separators verbatim (2.54, never localised)',
          p.changed == [0] and text == '2.54 QZ' and p.lines[1][0] == 'runs', f'{p.changed} {text!r}')


attempt('HP7', hp7)
attempt('HP8', hp8)
attempt('HP9', hp9)


# ── HP10-HP11 ──────────────────────────────────────────────────────────────────────────────────
print('\nHP10-HP11 the container and the acceptance predicate')


def hp10():
    e = refused(lambda: plan(AM0, 'C\nQZX R', AM_F, container=BOX))
    check('HP10a a box with a 2-visual-line block refuses box-multiline',
          e is not None and e.reason == 'box-multiline' and e.detail == {'visual': 2}, why(e))
    p = plan(AM1, 'R QZX H', AM_F, container=BOX)
    check('HP10b CONTROL a 1-line block in the same box is planned (step fit)',
          p.changed == [0] and p.lines[0][1]['step'] == 'fit' and p.lines[0][1]['cls'] == 'box')


def hp10c():
    sys.path.insert(0, str(HERE / 'pylibs'))
    import math
    from PIL import Image
    import figcontainers as FC
    pw, ph = GEOM['figures']['CNX_Chem_20_04_amide1_img']['page']
    rect = {'object_type': 'rect', 'x0': 50.0, 'y0': 65.0, 'x1': 170.0, 'y1': 110.0, 'stroke': True,
            'fill': False, 'linewidth': 1.0, 'path': [], 'pts': []}     # holds b0's two lines AND b1's one
    pg = {'width': pw, 'height': ph, 'bbox': (0.0, 0.0, pw, ph), 'rects': [rect], 'curves': [], 'lines': []}
    dark = Image.new('L', (math.ceil(pw * FC.S), math.ceil(ph * FC.S)), 255)
    alone = FC.container_for(0, [AM0], pg, dark, ph)
    e = refused(lambda: plan(AM0, 'C\nQZX R', AM_F, container=alone))
    check('HP10c-pre CONTROL the planted rect holding the 2-visual-line block ALONE is a box and refuses '
          'box-multiline', alone['cls'] == 'box' and e is not None and e.reason == 'box-multiline'
          and e.detail == {'visual': 2}, f"{alone['cls']} {alone['why']} / {why(e)}")
    shared = FC.container_for(0, [AM0, AM1], pg, dark, ph)
    check('HP10c-shape the same rect with b1\'s line inside it is a SHARED box (cell, why ends +shared)',
          shared['cls'] == 'cell' and shared['why'].endswith('+shared'), f"{shared['cls']} {shared['why']}")
    th = Thunk(shared)
    e = refused(lambda: plan(AM0, 'C\nQZX R', AM_F, container=th))
    check('HP10c a 2-visual-line block in a SHARED box is planned, not refused box-multiline',
          e is None and th.calls == 1, why(e))


def _stubbed(fn, edit):
    """Run fn with figlayout.decide replaced by one that edits the REAL layout; always restored."""
    real = FL.decide
    FL.decide = lambda *a, **k: dict(real(*a, **k), **edit)
    try:
        return refused(fn)
    finally:
        FL.decide = real


def hp11():
    e = refused(lambda: plan(BUF, ' '.join(['QZX'] * 12), BUF_F, container=BUF_C))
    check('HP11a a long sentinel in buffer\'s REAL cell refuses does-not-fit, naming step, size and lines',
          e is not None and e.reason == 'does-not-fit' and set(e.detail) == {'line', 'step', 'size', 'lines'}
          and (e.detail['lines'] != 1 or e.detail['size'] != 9.0), why(e))
    one = [run('No', 9.0, 100.0, 100.0, 10.0)]                  # anchor (centre) at 105
    tight = dict(ROOMY, FL=105.0 - 15.25, FR=105.0 + 15.25, room_up=0.0, room_down=0.0)
    e = refused(lambda: plan(one, 'QZXQZX', PF, container=tight))   # 27 pt at 9, 26.25 at 8.75; budget 26.5
    check('HP11b an open fit only after a SHRINK refuses (step iii-anchor, 8.75 pt)',
          e is not None and e.reason == 'does-not-fit' and e.detail == {'line': 0, 'step': 'iii-anchor',
                                                                         'size': 8.75, 'lines': 1}, why(e))
    check('HP11b CONTROL the same container takes a narrower sentinel at source size',
          refused(lambda: plan(one, 'QZXQZ', PF, container=tight)) is None)
    seven = [run('To', 7.0, 100.0, 100.0, 8.0)]                 # sz0 7, below R4's floor; anchor 104
    narrow = dict(ROOMY, FL=104.0 - 6.0, FR=104.0 + 6.0, room_up=0.0, room_down=0.0)
    # R-16: its ladder now runs to 0.8 x 7.0; 'QZXQZX' is 3 x size = 16.8 there, (ii) budget 8 -> still v-overflow.
    e = refused(lambda: plan(seven, 'QZXQZX', PF, container=narrow))
    check('HP11c a 7 pt open label overflowing at its R-16 floor refuses (v-overflow, 0.8 x 7.0 pt, one line)',
          e is not None and e.reason == 'does-not-fit' and e.detail == {'line': 0, 'step': 'v-overflow',
                                                                         'size': 0.8 * 7.0, 'lines': 1}, why(e))
    # HP11c2/c3: R-16 lengthens the ladder below sz0, so a held 7 pt line can now FIT shrunk - and must still refuse.
    # 'QZX' = 1.5 x size: 10.5 at 7.0, 9.75 at 6.5, 9.375 at 6.25; both containers are 13.5 wide -> budget 9.5.
    mid = dict(ROOMY, FL=104.0 - 6.75, FR=104.0 + 6.75, room_up=0.0, room_down=0.0)
    e = refused(lambda: plan(seven, 'QZX', PF, container=mid))
    check('HP11c2 a 7 pt open label that fits only shrunk below its source size (R-16) refuses (iii-anchor, 6.25 pt)',
          e is not None and e.reason == 'does-not-fit' and e.detail == {'line': 0, 'step': 'iii-anchor',
                                                                         'size': 6.25, 'lines': 1}, why(e))
    mid_cell = {'cls': 'cell', 'why': 'test-cell', 'L': 104.0 - 6.75, 'R': 104.0 + 6.75, 'D': 50.0, 'U': 150.0,
                'src_left_margin': 5.0, 'src_right_margin': 5.0, 'src_up_margin': 5.0, 'src_down_margin': 5.0,
                'align': 'center', 'align_why': 'test'}
    e = refused(lambda: plan(seven, 'QZX', PF, container=mid_cell))
    check('HP11c3 a 7 pt CELL fit only below its source size (step fit, 6.25 pt, R-16) refuses: only size == sz0',
          e is not None and e.reason == 'does-not-fit' and e.detail == {'line': 0, 'step': 'fit',
                                                                         'size': 6.25, 'lines': 1}, why(e))
    check('HP11c3-pre CONTROL the same cell takes a narrower held value at source size',
          refused(lambda: plan(seven, 'QZ', PF, container=mid_cell)) is None)
    check('HP11d-pre CONTROL MattType QZX in the roomy container is planned at 9.0, one line, no overflow',
          refused(lambda: plan(MATT, 'QZX', MATT_F)) is None)
    e = _stubbed(lambda: plan(MATT, 'QZX', MATT_F), {'step': 'floor-overflow'})
    check('HP11d1 a floor-overflow with overflow None at sz0 on one line refuses: only the step clause',
          e is not None and e.reason == 'does-not-fit' and e.detail['step'] == 'floor-overflow'
          and e.detail['size'] == 9.0 and e.detail['lines'] == 1, why(e))
    e = _stubbed(lambda: plan(MATT, 'QZX', MATT_F),
                 {'overflow': {'word': None, 'needPt': 1.0, 'budgetPt': 0.5, 'sizePt': 9.0, 'axis': 'width'}})
    check('HP11d2 a step i that names an overflow refuses: only the overflow clause',
          e is not None and e.reason == 'does-not-fit' and e.detail['step'] == 'i', why(e))
    check('HP11d-post figlayout.decide is restored', HP.FL.decide is FL.decide and FL.decide.__module__ == 'figlayout')
    cell = {'cls': 'cell', 'why': 'test-cell', 'L': 90.0, 'R': 120.0, 'D': 50.0, 'U': 150.0,
            'src_left_margin': 5.0, 'src_right_margin': 5.0, 'src_up_margin': 5.0, 'src_down_margin': 5.0,
            'align': 'center', 'align_why': 'test'}
    e = refused(lambda: plan(one, 'QZX QZX', PF, container=cell))   # 31.5 pt on one line, budget 26
    check('HP11e a cell wrap to 2 lines at sz0 (step fit, no overflow) refuses: only len(lines) == 1',
          e is not None and e.reason == 'does-not-fit' and e.detail == {'line': 0, 'step': 'fit',
                                                                         'size': 9.0, 'lines': 2}, why(e))
    narrow_cell = dict(cell, L=105.0 - 15.25, R=105.0 + 15.25)      # budget 26.5: 27 pt at 9, 26.25 at 8.75
    e = refused(lambda: plan(one, 'QZXQZX', PF, container=narrow_cell))
    check('HP11f a CELL fit only after a shrink (step fit, 8.75 pt, one line) refuses: only size == sz0',
          e is not None and e.reason == 'does-not-fit' and e.detail == {'line': 0, 'step': 'fit',
                                                                         'size': 8.75, 'lines': 1}, why(e))


def hp17():
    sym = [run('Δ', 11.0, 100.0, 100.0, 6.7, font='T/S'), run('H = 5 kJ', 9.0, 106.7, 100.0, 36.0)]
    check('HP17-pre the planted line opens with an UNSTYLED 11 pt STIX symbol over a 9 pt body',
          FS.line_styles(sym, PF)[1][0] is None and FS.body_size(sym, PF) == 9.0)
    p = plan(sym, 'Δ QZX', PF)
    check('HP17 sz0 is the BODY size: the changed line is planned at 9.0, not the symbol\'s 11.0',
          p.lines[0][1]['size'] == 9.0, f"{p.lines[0][1]['size']}")


attempt('HP10', hp10)
attempt('HP10c', hp10c)
attempt('HP11', hp11)
attempt('HP17', hp17)


# ── HP12-HP13 ──────────────────────────────────────────────────────────────────────────────────
print('\nHP12-HP13 styled source runs, and glyph coverage')


def hp12():
    iso = [run('14', 7.0, 100.0, 104.0, 7.8), run('C dating', 9.0, 107.8, 100.0, 36.0)]
    check('HP12a-pre the planted line opens with a 7 pt RAISED run that its own line calls a script',
          len(FT.lines(iso)) == 1 and FS.is_script_style(FS.line_styles(iso, PF)[1][0]))
    e = refused(lambda: plan(iso, 'QZX', PF))
    check('HP12a a changed line opening with a styled run refuses opens-styled',
          e is not None and e.reason == 'opens-styled' and e.detail == {'line': 0}, why(e))
    ital = [run('rate ', 9.0, 100.0, 100.0, 20.0), run('k', 9.0, 120.0, 100.0, 4.5, font='T/I'),
            run(' here', 9.0, 124.5, 100.0, 20.0)]
    e = refused(lambda: plan(ital, 'QZX k here', PF))
    check('HP12b a changed line holding an italic-only run refuses italic-not-carried',
          e is not None and e.reason == 'italic-not-carried' and e.detail == {'line': 0}, why(e))
    both = [run('14', 7.0, 100.0, 104.0, 7.8), run('k', 9.0, 107.8, 100.0, 4.5, font='T/I'),
            run(' dating', 9.0, 112.3, 100.0, 30.0)]
    e = refused(lambda: plan(both, 'QZX', PF))
    check('HP12c a line that opens styled AND holds an italic run refuses opens-styled first',
          e is not None and e.reason == 'opens-styled', why(e))
    stack = [run('[X', 9.0, 100.0, 100.0, 10.0), run('2', 7.0, 110.0, 97.0, 3.9),
             run('–', 7.0, 113.9, 104.6, 3.9, font='T/I')]
    vstyles = FS.line_styles(stack, PF)[1]
    check('HP12d-pre an italic stacked charge: 2 FT.lines, 1 visual line, and the WHOLE visual line would call '
          'it an italic script',
          len(FT.lines(stack)) == 2 and len(FT.visual_lines(stack)) == 1
          and FS.is_script_style(vstyles[-1]) and vstyles[-1].italic, f'{vstyles[-1]}')
    e = refused(lambda: plan(stack, 'QZX', PF))
    check('HP12d THE UNIT: on its OWN FT line the charge is italic-only, so the changed line refuses '
          'italic-not-carried (fail-closed)',
          e is not None and e.reason == 'italic-not-carried', why(e))


def hp13():
    calls = []

    def no_z(ch, bold, italic):
        calls.append((ch, bold, italic))
        return ch != 'Z'

    e = refused(lambda: plan(MATT, 'QZX', MATT_F, has_glyph=no_z))
    check('HP13a a glyph the face lacks refuses no-glyph:U+005A, naming the character and the face',
          e is not None and e.reason == 'no-glyph:U+005A'
          and e.detail == {'line': 0, 'char': 'Z', 'bold': True, 'italic': False}, why(e))
    check('HP13b has_glyph is asked in the BOLD face of MattType\'s bold line', ('Q', True, False) in calls,
          f'{calls}')
    ksub = [run('k', 9.0, 100.0, 100.0, 4.5), run('2', 7.0, 104.5, 98.0, 3.9, font='T/I'),
            run(' rate', 9.0, 108.4, 100.0, 22.0)]
    calls.clear()

    def rec(ch, bold, italic):
        calls.append((ch, bold, italic))
        return True

    st = FS.SourceStyle(0.7778, -0.2222, True)
    check('HP13c-pre the planted pool is one ITALIC subscript', HP.script_pool(ksub, PF) == {'sub': [st], 'sup': []},
          f'{HP.script_pool(ksub, PF)}')
    p = plan(ksub, 'Q₂ QZX', PF, has_glyph=rec)
    check('HP13c an italic SCRIPT is carried (not italic-not-carried) and drawn italic',
          layout_chars(p, 0)[1] == ('2', st), f'{layout_chars(p, 0)[:2]}')
    check('HP13d has_glyph is asked about the 2 in the ITALIC roman-weight face', ('2', False, True) in calls,
          f'{calls}')


attempt('HP12', hp12)
attempt('HP13', hp13)


# ── HP14-HP15 ──────────────────────────────────────────────────────────────────────────────────
print('\nHP14-HP15 the block-level refusals, and all-or-nothing')


def hp14():
    th = Thunk(ROOMY)
    arc = [run('Q', 9.0, 100.0, 100.0), run('Z', 9.0, 105.0, 103.0), run('X', 9.0, 110.0, 104.0),
           run('W', 9.0, 115.0, 103.0)]
    check('HP14a-pre the planted block is an arc by figtext.is_arc', FT.is_arc(arc))
    e = refused(lambda: plan(arc, 'QZXW', PF, container=th))
    check('HP14a an arc refuses arc', e is not None and e.reason == 'arc' and e.detail == {}, why(e))
    e = refused(lambda: plan(MATT, 'No', MATT_F, container=th))
    check('HP14b a value equal to its source refuses no-change', e is not None and e.reason == 'no-change', why(e))
    e = refused(lambda: plan(OX, '4+\nTo\n4–', OX_F, container=th))
    check('HP14b a 3-line value equal line for line refuses no-change', e is not None and e.reason == 'no-change',
          why(e))
    try:
        plan(MATT, 'a|b', MATT_F, container=th)
        got = 'returned'
    except HV.HeldValueError as e:
        got = e.reason
    except HP.HeldRefusal as e:
        got = 'HeldRefusal ' + e.reason
    check('HP14d a malformed value raises HeldValueError (pipe) - never a refusal, never a draw', got == 'pipe', got)
    check('HP14e none of the above fetched the container', th.calls == 0, f'{th.calls}')
    e = refused(lambda: plan(MATT, 'QZX', MATT_F, container=dict(ROOMY, why='error: KeyError')))
    check('HP14c a container whose detection raised refuses container-error, naming why',
          e is not None and e.reason == 'container-error' and e.detail == {'why': 'error: KeyError'}, why(e))


def hp15():
    th = Thunk(ROOMY)
    e = refused(lambda: plan(OX, '4+\nQZQ\n4– QZ', OX_F, container=th))
    check('HP15a line 1 is good, line 2 (an italic STIX charge) refuses: the call raises, no plan is returned',
          e is not None and e.reason == 'italic-not-carried' and e.detail == {'line': 2}, why(e))
    check('HP15b the container was fetched exactly once for it', th.calls == 1, f'{th.calls}')
    th = Thunk(ROOMY)
    p = plan(OX, '4+\nQZQ\n4–', OX_F, container=th)
    check('HP15c a planned 3-line block fetches the container exactly once', p.changed == [1] and th.calls == 1,
          f'{th.calls}')


attempt('HP14', hp14)
attempt('HP15', hp15)


def hp_json():
    bad = []
    for e in REFUSALS:
        try:
            json.dumps({'reason': e.reason, **e.detail}, ensure_ascii=False)
        except (TypeError, ValueError) as x:
            bad.append(f'{e.reason}: {x}')
    check(f'HP14f every refusal raised above ({len(REFUSALS)}) carries a JSON detail compose can report',
          len(REFUSALS) >= 24 and not bad, f'{bad}')


attempt('HP14f', hp_json)


# ── HP16 ───────────────────────────────────────────────────────────────────────────────────────
print('\nHP16 REAL placements of the 13 value-sheet lines (D-c table)')


def cairo_width(fonts):
    """compose.lin_advance + line_segments + seg_width, copied: cairo FORMAT_A8, hint metrics OFF,
    'Liberation Sans', weight from the line's run, size and slant from the segment's style."""
    import cairo
    S = 200 / 72.0
    surf = cairo.ImageSurface(cairo.FORMAT_A8, 8, 8)
    ctx = cairo.Context(surf)
    fo = cairo.FontOptions()
    fo.set_hint_metrics(cairo.HINT_METRICS_OFF)
    ctx.set_font_options(fo)
    bold_keys = {k for k, v in fonts.items() if 'bold' in v['base'].lower()}
    memo = {}

    def lin_advance(text, run_, size, st):
        bold = run_['font'] in bold_keys
        italic = st is not None and st.italic
        px = size * S if st is None else size * st.ratio * S
        k = (text, bold, italic, px)
        if k not in memo:
            ctx.select_font_face('Liberation Sans', cairo.FONT_SLANT_ITALIC if italic else cairo.FONT_SLANT_NORMAL,
                                 cairo.FONT_WEIGHT_BOLD if bold else cairo.FONT_WEIGHT_NORMAL)
            ctx.set_font_size(px)
            memo[k] = ctx.text_extents(text).x_advance / S
        return memo[k]

    def seg_width(chars, run_, size):
        segs = FS.segments(chars) or [('', None)]
        if any(st is not None for _, st in segs):
            segs = FS.split_at_word_edges(segs)
        return sum(lin_advance(t, run_, size, st) for t, st in segs)

    return lambda chars, size, run_: seg_width(chars, run_, size)


def figis_glyph():
    sys.path.insert(0, str(HERE / 'pylibs'))
    import figis
    cmaps = {}

    def has(ch, bold, italic):
        k = (bool(bold), bool(italic))
        if k not in cmaps:
            cmaps[k] = figis.load(k).getBestCmap()
        return ord(ch) in cmaps[k]
    return has


def plain(s):
    return [(c, None) for c in s]


def near(a, b):
    return abs(a - b) <= 0.01


# basename, block, value, changed line, step, size, top, disp, anchor kind, the anchor the D-c table's
# drawn extent implies (its midpoint for 'center', x0 for 'left', the right edge for 'right'; buffer's
# whole extent for 'extent').
ROWS = [
    ('CNX_Chem_01_02_MattType', 11, 'QZX', 0, 'i', 9.0, 117.89, 0.0, 'center', (144.70 + 158.71) / 2),
    ('CNX_Chem_01_02_MattType', 13, 'QZX', 0, 'i', 9.0, 66.38, 0.0, 'center', (45.77 + 59.78) / 2),
    ('CNX_Chem_01_02_MattType', 15, 'QZX', 0, 'i', 9.0, 66.38, 0.0, 'center', (281.93 + 295.94) / 2),
    ('CNX_Chem_07_04_HNO2_img', 8, 'QZX', 0, 'i', 9.0, 8.45, 0.0, 'center', (61.24 + 76.26) / 2),
    ('CNX_Chem_20_04_amide1_img', 1, 'R QZX H', 0, 'i', 9.0, 93.49, 0.0, 'left', 132.76),
    ('CNX_Chem_20_04_amide1_img', 2, 'R QZX H', 0, 'i', 9.0, 66.12, 0.0, 'center', (122.00 + 155.02) / 2),
    ('CNX_Chem_20_04_amide1_img', 0, 'C\nQZX R', 1, 'i', 9.0, 83.49, 0.0, 'right', 87.26),
    ('CNX_Chem_09_05_MolSpeed1', 13, 'O₂ QZ T = 300 K', 0, 'i', 9.0, 83.30, 0.0, 'center', (124.79 + 191.46) / 2),
    ('CNX_Chem_14_02_phscale', 5, '10⁰ QZ 1', 0, 'fit', 8.9998, 341.66, 0.0, 'center', (24.36 + 63.28) / 2),
    ('CNX_Chem_14_02_phscale', 87, '10⁰ QZ 1', 0, 'fit', 8.9998, 35.48, 0.0, 'center', (74.01 + 112.94) / 2),
    ('CNX_Chem_14_06_buffer', 23, B3, 0, 'fit', 9.0, 150.37, 1.24, 'extent', (101.72, 234.21)),
    ('CNX_Chem_18_04_OxStNonmts', 2, '4+\nQZQ\n4–', 1, 'fit', 7.0, 59.51, 0.0, 'center', (163.83 + 170.05) / 2),
    ('CNX_Chem_18_04_OxStNonmts', 4, '5+\nQZQ\n3–', 1, 'fit', 7.0, 59.51, 0.0, 'center', (241.83 + 248.05) / 2),
]


def hp16_pins():
    w = cairo_width(MATT_F)
    check('HP16-pin the width: No bold 9 = 12.00 (PDF advance 11.997)', near(w(plain('No'), 9.0, MATT[0]), 12.00),
          f"{w(plain('No'), 9.0, MATT[0]):.4f}")
    hno, _, hno_f = held('CNX_Chem_07_04_HNO2_img', 8)
    v = cairo_width(hno_f)(plain('or'), 9.0, hno[0])
    check('HP16-pin or 9 = 8.00 (PDF 8.001)', near(v, 8.00), f'{v:.4f}')
    v = cairo_width(AM_F)(plain('R or H'), 9.0, AM1[0])
    check('HP16-pin R or H 9 = 26.00 (PDF 26.001)', near(v, 26.00), f'{v:.4f}')
    v = cairo_width(OX_F)(plain('To'), 7.0, OX[2])
    check('HP16-pin To bold 7 = 8.55 (the PDF advance 8.03 carries a kern pair)', near(v, 8.55), f'{v:.4f}')
    bw = cairo_width(BUF_F)
    text, styles = '', []
    for line in FT.lines(BUF):
        t, s, _, _ = FS.line_styles(line, BUF_F)
        text, styles = text + t, styles + s
    v = bw(list(zip(text, styles)), 9.0, BUF[0])
    check('HP16-pin buffer\'s source line, measured with its own styles, = 130.99 before', near(v, 130.99), f'{v:.4f}')
    pool = HP.script_pool(BUF, BUF_F)
    chars = [(c, None if k is None else pool[k][0]) for c, k in HV.parse_value(B3)[0]]
    v = bw(chars, 9.0, BUF[0])
    check('HP16-pin B3, decoded into buffer\'s own styles, = 132.49 after', near(v, 132.49), f'{v:.4f}')


def hp16():
    has = figis_glyph()
    check('HP16-pre 13 changed lines in 7 figures', len(ROWS) == 13 and len({r[0] for r in ROWS}) == 7)
    for base, bi, value, li, step, size, top, disp, kind, anchor in ROWS:
        runs, cont, fonts = held(base, bi)
        th = Thunk(cont)
        p = plan(runs, value, fonts, container=th, width=cairo_width(fonts), has_glyph=has)
        lay = p.lines[li][1]
        x0, wd = lay['x0'][0], lay['widths'][0]
        tag = f'HP16 {base} b{bi} line {li}'
        others = [e[0] for j, e in enumerate(p.lines) if j != li]
        check(f'{tag}: only line {li} changed, the others planned as runs', p.changed == [li] and
              all(o == 'runs' for o in others) and th.calls == 1, f'{p.changed} {others}')
        check(f'{tag}: step {step}, size {size}, one line', lay['step'] == step and lay['size'] == size
              and len(lay['lines']) == 1, f"{lay['step']} {lay['size']} {len(lay['lines'])}")
        check(f'{tag}: top {top}, vdisp 0, disp {disp}', near(lay['top'], top) and near(lay['vdisp'], 0.0)
              and near(lay['disp'], disp), f"top {lay['top']:.4f} vdisp {lay['vdisp']:.4f} disp {lay['disp']:.4f}")
        if kind == 'center':
            got = x0 + wd / 2
        elif kind == 'left':
            got = x0
        elif kind == 'right':
            got = x0 + wd
        else:
            got = None
        if kind == 'extent':
            check(f'{tag}: drawn extent {anchor[0]:.2f}..{anchor[1]:.2f} (0.51 pt inside the cell)',
                  near(x0, anchor[0]) and near(x0 + wd, anchor[1]), f'{x0:.4f}..{x0 + wd:.4f}')
        else:
            check(f'{tag}: {kind} anchor {anchor:.3f}', near(got, anchor), f'{got:.4f} ({x0:.2f}..{x0 + wd:.2f})')


# ── HP18 (skeptic, 2026-10-03) ─────────────────────────────────────────────────────────────────
# Every value-sheet line is rot 0 and every changed line shares its weight with the block's first run, so
# neither the ALONG/PROJ axes nor the per-line measuring run was pinned: a planner reading x/y, or measuring
# with block[0], passed HP0-HP17. Both are planted here, against a width that depends on the weight of the
# run it is handed, as compose's seg_width does.
def hp18():
    def wdep(chars, size, r):
        k = 0.62 if bold_of(PF)(r) else 0.5
        return sum(k * size * (st.ratio if st is not None else 1.0) for _, st in chars)

    r90 = [dict(run('QQ', 9.0, 100.0, 20.0), rot=90.0)]
    a, e = FT.along(r90[0]), FT.along(r90[0]) + r90[0]['adv']
    lay = plan(r90, 'QZQZ', PF, width=wdep).lines[0][1]
    want = (a + e) / 2 - wdep([(c, None) for c in 'QZQZ'], 9.0, r90[0]) / 2
    check('HP18a a rot-90 changed line is centred on its own ALONG extent, at its own PROJ',
          abs(lay['x0'][0] - want) < 1e-6 and abs(lay['top'] - FT.proj(r90[0])) < 1e-6,
          f"x0 {lay['x0']} want {want}; top {lay['top']} proj {FT.proj(r90[0])}")

    mixed = [run('Ab', 9.0, 10.0, 50.0), run('Cd', 9.0, 10.0, 39.0, font='T/B')]
    p = plan(mixed, 'Ab\nQZQZQZ', PF, width=wdep)
    want = (10.0 + 19.0) / 2 - wdep([(c, None) for c in 'QZQZQZ'], 9.0, mixed[1]) / 2
    check("HP18b a changed BOLD line under a regular first line is measured in ITS OWN run's weight",
          [x[0] for x in p.lines] == ['runs', 'layout'] and abs(p.lines[1][1]['x0'][0] - want) < 1e-6,
          f"{[x[0] for x in p.lines]} x0 {p.lines[-1][1].get('x0') if p.lines[-1][0] == 'layout' else None} want {want}")


attempt('HP18', hp18)
attempt('HP16-pins', hp16_pins)
attempt('HP16', hp16)


# ── HP19-HP23 (§C140 '6', M2) ──────────────────────────────────────────────────────────────────
# FoodLabel's purple cell: the real runs and container snapshot (evidence/2026-10-06-c140-v6-m2). The two
# bullets are [USER]'s ruled values (R-15g2 / the value sheet), quoted verbatim - see the docstring.
print('\nHP19-HP23 a source line of only U+0020 is no line (M2, R-17)')
FOOD = json.loads((HERE / 'evidence' / '2026-10-06-c140-v6-m2' / 'foodlabel-purple-runs.json')
                  .read_text(encoding='utf-8'))
FOOD_F = FOOD['fonts']
FOOD_BLOCKS = FT.merge_blocks(FT.group(FOOD['runs']))
FOOD_KEYS = [BK.block_key(b) for b in FOOD_BLOCKS]
K_FQ, K_F42, K_F44 = 'Quick|guide to|% DV', '(cid:127) 5% or less| ', '(cid:127) 20% or| '


def food(key):
    """(runs, container thunk) of one FoodLabel fixture block, by its block key."""
    i = FOOD_KEYS.index(key)
    return FOOD_BLOCKS[i], Thunk(FOOD['containers'][str(i)])


def hp19():
    for tag, key, value in (('HP19', K_F42, '• 5% eða minna'), ('HP20', K_F44, '• 20% eða')):
        b, th = food(key)
        e = refused(lambda: plan(b, value, FOOD_F, container=th))
        p = None if e is not None else plan(b, value, FOOD_F, container=th)
        check(f"{tag} [USER]'s one-line bullet {value!r} on {key!r} plans with line 0 changed",
              p is not None and p.changed == [0] and [x[0] for x in p.lines] == ['layout'], why(e))
    b, th = food(K_F42)
    e = refused(lambda: plan(b, '• 5% eða\nminna', FOOD_F, container=th))
    check("HP21 a two-line bullet (its 2nd line would sit on 'er lítið') refuses line-count",
          e is not None and e.reason == 'line-count', why(e))
    e = refused(lambda: plan(b, '(cid:127) 5% or less', FOOD_F, container=th))
    check('HP22 a value equal to the INK text refuses no-change - never re-laid in English',
          e is not None and e.reason == 'no-change', why(e))
    b, th = food(K_FQ)
    e = refused(lambda: plan(b, 'Quick\nguide to\n% DV', FOOD_F, container=th))
    check('HP23 CONTROL: an unchanged value on the no-blank `Quick|guide to|% DV` is no-change',
          e is not None and e.reason == 'no-change', why(e))


attempt('HP19', hp19)


# ── HP24-HP25 (G21 review-fix round, F2 n5 / n46) ──────────────────────────────────────────────────
print('\nHP24 a script style that differs only in its STIX face is ONE pooled style (G21 #5)')
PFS = dict(PF, **{'T/SB': {'base': '/AAAAAA+STIXGeneral-Bold', 'subtype': '/Type1'}})
SUP_G = FS.SourceStyle(0.7778, 0.4444, False)          # 'Mg2+': the 7 pt charge raised 4 pt on a 9 pt base


def mg(font2, fontp):
    """'Mg2+ ion' with the 2 in `font2` and the + in `fontp`: the same size and rise, possibly another face."""
    return [run('Mg', 9.0, 100.0, 100.0, 10.0), run('2', 7.0, 110.0, 104.0, 3.9, font=font2),
            run('+', 7.0, 113.9, 104.0, 4.0, font=fontp), run(' ion', 9.0, 117.9, 100.0, 14.0)]


def hp24():
    lib_stix = mg('T/R', 'T/S')                         # Liberation 2, STIX Regular + (serif None vs (False, False))
    try:
        pool = HP.script_pool(lib_stix, PFS)
    except Exception as exc:                            # noqa: BLE001 - the pre-fix TypeError, named
        pool = f'{type(exc).__name__}: {exc}'
    check('HP24a Liberation and STIX Regular superscripts of one geometry pool to ONE style, its face None (the '
          'faces disagree, so the mark draws FigIS as under composer 5) - never a TypeError',
          isinstance(pool, dict) and pool == {'sub': [], 'sup': [SUP_G]} and pool['sup'][0].serif is None,
          repr(pool))
    e = refused(lambda: plan(lib_stix, 'Mg²⁺ QZ', PFS))
    ch = [] if e is not None else layout_chars(plan(lib_stix, 'Mg²⁺ QZ', PFS), 0)
    check('HP24b ... so a held ^ mark on it is planned (not refused ambiguous-source-script:sup), in that style',
          e is None and [st for c, st in ch if c in '2+'] == [SUP_G, SUP_G], why(e) if e else repr(ch))
    two_stix = mg('T/S', 'T/SB')                        # STIX Regular and Type 1 STIX Bold: (F, F) vs (T, F)
    pool = HP.script_pool(two_stix, PFS)
    check('HP24c two STIX faces of one geometry pool to ONE style, face None', pool == {'sub': [], 'sup': [SUP_G]}
          and pool['sup'][0].serif is None, repr(pool))
    agree = mg('T/S', 'T/S')
    pool = HP.script_pool(agree, PFS)
    check('HP24d CONTROL faces that AGREE keep that face: one style, serif (False, False) - drawn FigSym as before',
          pool == {'sub': [], 'sup': [SUP_G._replace(serif=(False, False))]}
          and pool['sup'][0].serif == (False, False), repr(pool))


attempt('HP24', hp24)

print('\nHP25 a changed line with a folded blank run: its entry spans the FULL visual line, its cues the INK (G21 n46)')


def hp25():
    """The two halves n46 named, each killing its mutant: HP2 (`('layout', layout, vl)` - the entry one run short)
    and HP3 (the cues read from the full line, the blank run's along included). The planted block is one ink line
    and a lone U+0020 run 12 pt lower and 20 pt to the LEFT (the next row's indent space), which visual_lines folds
    into line 0."""
    blk = [run('QZ abc', 9.0, 100.0, 100.0, 27.0), run(' ', 9.0, 80.0, 88.0, 2.5)]
    check('HP25-pre the plant is TWO FT.lines and ONE visual line (the blank folded)',
          len(FT.lines(blk)) == 2 and len(FT.visual_lines(blk)) == 1, repr(FT.visual_lines(blk)))
    p = plan(blk, 'QZX', PF)
    ink = plan(blk[:1], 'QZX', PF)
    span = sum(len(x[1]) if x[0] == 'runs' else len(x[2]) for x in p.lines)
    check('HP25a the plan entries partition the block (their lengths sum to len(block)): the layout entry carries '
          'the folded blank run', span == len(blk) and [r['text'] for r in p.lines[0][2]] == ['QZ abc', ' '],
          f'span {span} of {len(blk)}; entry runs {[r["text"] for r in p.lines[0][2]]}')
    check('HP25b ... and is laid out from its INK runs only: the layout equals the same block without the blank run '
          '(x0 is not pulled 20 pt left by it)', p.lines[0][1] == ink.lines[0][1],
          f"x0 {p.lines[0][1]['x0']} vs ink-only {ink.lines[0][1]['x0']}")
    b, th = food(K_F42)
    p = plan(b, '• 5% eða minna', FOOD_F, container=th)
    span = sum(len(x[1]) if x[0] == 'runs' else len(x[2]) for x in p.lines)
    check('HP25c the real FoodLabel bullet (HP19) partitions its block too', span == len(b), f'{span} of {len(b)}')


attempt('HP25', hp25)

print(f"\n{'ALL PASS' if not fails else str(len(fails)) + ' FAILED: ' + ', '.join(fails)}")
sys.exit(1 if fails else 0)
