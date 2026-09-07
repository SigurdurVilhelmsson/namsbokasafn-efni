#!/usr/bin/env python3
"""H2 / ruling R-8: `decodable` must GATE SPEND, not merely be written into meta.json.

    FIGTEXT_PYLIBS=./pylibs python3 test_sendable.py

Before this, `send` was `not looks_verbatim(joined)` alone and `emit-blocks.py` never
opened meta.json — the read layer's `decodable` flag had no consumer at all, so any test
asserting "undecodable text is never sent" passed vacuously against every possible reader.

Assertions 1-7 use SYNTHETIC fonts, so the gate stays pinned whatever the corpus does: a
test that only ran while the artwork happened to be broken would go vacuous the day the
reader improved, which is exactly what happened to the clause this file replaces.
Assertion 9 is the other half — the gate firing END TO END on real artwork.

🔴 An earlier version of this docstring said "the real artwork no longer exercises the
undecodable path", inferred from ruling R-7's "7 of the 8 type0 figures decode cleanly".
That was an inference presented as a measurement and it was FALSE: scanning all 817
harness rows found CNX_Chem_05_02_FoodLabel carrying an undecodable PAGE/TT1, in the
PAGE-TEXT bucket — a population R-7 says nothing about. Re-derive before believing any
claim of the form "the corpus cannot exercise this".

⚠️ Assertion 9 SPAWNS emit-blocks.py, so this file WRITES out/{runs,meta,blocks}.json —
the scratch directory shared with test_blockkey_consumers.py. Both regenerate those three
themselves, so the two are order-independent in both directions (verified). It does NOT
touch out/artwork.png, which test_blockkey_consumers requires to be SciMethod's; only
strip-text.py writes that, and a manual run of it clobbers that fixture.
"""
import sys
from pathlib import Path
import _deps  # noqa: F401  - puts this directory on sys.path; never process.cwd()
from figtext import sendable, undecodable_fonts, looks_verbatim

fails = []


def check(label, got, want):
    ok = got == want
    print(f"  {'PASS' if ok else 'FAIL'}  {label}: {got!r}")
    if not ok:
        fails.append(label)


def block(text, font):
    """One run is enough: the gate is over the SET of fonts a block draws with."""
    return [dict(text=text, x=0.0, y=0.0, size=9.0, rot=0.0, adv=6.0, font=font)]


OK = {'PAGE/T1_0': dict(base='LiberationSans', decodable=True)}
BAD = {'PAGE/T1_0': dict(base='ABCDEF+Subset', decodable=False)}
PROSE = 'Wavelength'

# ── 1. the gate itself — THE DECISION IS PER BLOCK (R4b) ────────────────────────────
# R-8 said `decodable` must be CONSUMED; it did not say at what unit, and R4 read it as
# per-font. `decodable: False` is a FONT property, set the moment that font produces one
# unreadable run ANYWHERE in the figure, while the unit of PURCHASE is a BLOCK. So the
# question is not "is this font ever unreadable?" but "did THIS TEXT come out garbage?".
UNDECODED = 'Wave(cid:127)length'      # prose whose OWN text did not decode
check('prose whose OWN TEXT did not decode is NOT sent',
      sendable(block(UNDECODED, 'PAGE/T1_0'), UNDECODED, BAD), False)

# 🔴 THE R4b BEHAVIOUR CHANGE, and the assertion a per-font revert turns red. On
# CNX_Chem_05_02_FoodLabel the per-font rule held 24 blocks where 2 are genuinely
# undecoded — 22 false positives, all clean English ('Nutrition Facts', 'Calories 250').
# A figure that ships in English because one of its fonts has a bad glyph elsewhere is
# not caution, it is a silent loss.
check('R4b clean prose IS sent even on a FLAGGED font (the flag is per FONT, the '
      'decision per BLOCK)',
      sendable(block(PROSE, 'PAGE/T1_0'), PROSE, BAD), True)

# ── 2. THE POSITIVE CONTROL — without it assertion 1 passes on `return False` ───────
check('CONTROL prose on a DECODABLE font IS sent',
      sendable(block(PROSE, 'PAGE/T1_0'), PROSE, OK), True)

# ── 3. the verbatim clause still fires independently ────────────────────────────────
check('verbatim on a decodable font is NOT sent',
      sendable(block('H2O', 'PAGE/T1_0'), 'H2O', OK), False)

# ── 4. a block is only as sendable as its WORST RUN ─────────────────────────────────
# A block is bought whole, so one garbled run poisons the purchase — but the evidence is
# that run's OWN TEXT, not its font's reputation. Both halves are asserted so the unit
# cannot drift back: garbled -> held, clean -> sent, with the SAME flagged font table.
mixed = block('Wave', 'PAGE/T1_0') + block('length', 'PAGE/T2_0')
fonts = {'PAGE/T1_0': dict(decodable=True), 'PAGE/T2_0': dict(decodable=False)}
mixed_bad = block('Wave', 'PAGE/T1_0') + block('(cid:5)length', 'PAGE/T2_0')
MIXED_BAD_JOINED = 'Wave (cid:5)length'
check('one UNDECODED run in a mixed block holds the whole block',
      sendable(mixed_bad, MIXED_BAD_JOINED, fonts), False)
check('R4b CONTROL the same mixed block reading CLEAN is sent, flagged font and all',
      sendable(mixed, PROSE, fonts), True)
check('CONTROL the same mixed block with BOTH fonts decodable IS sent',
      sendable(mixed, PROSE, {'PAGE/T1_0': dict(decodable=True),
                              'PAGE/T2_0': dict(decodable=True)}), True)

# ── 5. a font MISSING from meta.json fails CLOSED ───────────────────────────────────
# readlayer.resolve_font mints an UNSCOPED/... entry so this cannot normally happen; if
# it does, runs.json and meta.json are out of step and the cheap direction is to hold
# the money. The names are reported by the caller, never swallowed.
check('a font absent from meta fails CLOSED',
      sendable(block(PROSE, 'PAGE/GHOST'), PROSE, OK), False)
check('the missing font is NAMED, not silently dropped',
      undecodable_fonts(block(PROSE, 'PAGE/GHOST'), OK), ['PAGE/GHOST'])

# ── 6. the ACCIDENTAL protection this gate replaces ─────────────────────────────────
# Today's undecoded bytes are held back by luck: looks_verbatim is True because there is
# no run of 3+ letters. Once a reader decodes them even partially they read as prose.
# Both halves are asserted so the reasoning cannot rot silently.
GARBAGE = '\x00\x0b\x00D\x00\x0c'
check('undecoded bytes look verbatim BY LUCK', looks_verbatim(GARBAGE), True)
# A PARTIALLY decoded block is the case the luck runs out on: 'Wave\x0blength' carries a
# run of 3+ letters, so looks_verbatim calls it PROSE and would have sent it. Only the
# text-decodability clause holds it — and it holds it on a font table where nothing is
# flagged at all, which is exactly what a per-font rule could never do.
PARTIAL = 'Wave\x0blength'
check('a PARTIALLY decoded block reads as prose to the old heuristic',
      looks_verbatim(PARTIAL), False)
check('...and the block-text gate holds it even with EVERY font marked decodable',
      sendable(block(PARTIAL, 'PAGE/T1_0'), PARTIAL, OK), False)

# ── 7. undecodable_fonts returns EMPTY, not None, on a clean block ───────────────────
check('clean block reports no blocking fonts',
      undecodable_fonts(block(PROSE, 'PAGE/T1_0'), OK), [])

# ── 8. THE CALL SITE — a gate never called is a gate that does not exist ────────────
# The assertions above test the FUNCTION. This one tests that emit-blocks.py reaches it,
# which is the failure R-8 actually found: `decodable` was computed, written to
# meta.json, and read by nobody.
#
# Written as a positive check, not a forbidden-token pin — a pin that forbids a token
# trips on the comment documenting the prohibition. Assertion 9 below is the behavioural
# half; this one still earns its place because it fails FAST and names the call site.
src = (Path(__file__).resolve().parent / 'emit-blocks.py').read_text()
code = '\n'.join(l for l in src.splitlines() if not l.lstrip().startswith('#'))
check('emit-blocks.py CALLS the shared gate', 'FT.sendable(' in code, True)
check("emit-blocks.py opens the file `decodable` lives in", "'meta.json'" in code, True)
# ⚠️ BOTH sides are space-stripped. Normalising only the haystack made this assertion
# UNFIREABLE — the needle kept a space the haystack no longer had — and a mutation round
# caught it passing against the exact source it forbids.
_flat = code.replace(' ', '')
check('emit-blocks.py no longer decides with looks_verbatim ALONE',
      'send=notFT.looks_verbatim'.replace(' ', '') in _flat, False)

# ── 9. THE BEHAVIOURAL PIN — the gate firing on REAL ARTWORK ────────────────────────
# 🔴 An earlier version of this file asserted that no corpus figure could exercise this,
# reasoning from ruling R-7 ("7 of the 8 type0 figures decode cleanly"). THAT WAS AN
# INFERENCE, NOT A MEASUREMENT, AND IT WAS WRONG. Scanning all 817 harness rows
# (800 resolved, 0 read errors) found exactly ONE figure carrying a decodable:False
# font — CNX_Chem_05_02_FoodLabel, font PAGE/TT1 — and it is in the PAGE-TEXT bucket,
# which is why a type0 argument could never have reached it.
#
# Measured on that figure: pre-R4 `looks_verbatim` alone would send 30 blocks / 736
# chars; the R-8 gate sends 11 / 442. So this holds back 19 prose blocks — including
# two that literally contain '(cid:' — that the paid MT would otherwise have been
# billed for and returned as mojibake.
#
# ⚠️ FAILS, never skips, when the artwork is absent: a skip here reads as a pass.
import json
import subprocess
import sources as S
from _deps import HERE, OUT

FIGURE = 'CNX_Chem_05_02_FoodLabel'
cfg = S.load_config()
try:
    trees = S.load_trees('efnafraedi-2e', cfg)
    fig_path, _edition = S.resolve(FIGURE, trees, cfg['editionPrecedence'])
except Exception as exc:                                       # noqa: BLE001
    fig_path = None
    print(f"  (source trees unavailable: {type(exc).__name__}: {exc})")

if fig_path is None:
    check(f'9 {FIGURE} resolves (a skip here would read as a pass)', False, True)
else:
    r = subprocess.run([sys.executable, 'emit-blocks.py', str(fig_path)], cwd=str(HERE),
                       capture_output=True, timeout=600)
    if r.returncode != 0:
        check('9 emit-blocks.py runs on the figure', r.stderr.decode()[-400:], '')
    else:
        blocks = json.loads((OUT / 'blocks.json').read_text())
        meta_fonts = json.loads((OUT / 'meta.json').read_text())['fonts']
        # Real block objects, re-derived from runs.json exactly as emit-blocks.py does
        # (same grouping, same key rule — never a second implementation): blocks.json
        # carries no font field, and 9d's non-vacuity clause needs one.
        import figtext as FT
        from blockkey import block_key, block_lines
        _runs = json.loads((OUT / 'runs.json').read_text())
        _blocks = FT.merge_blocks(FT.group(_runs))
        undec = [k for k, v in meta_fonts.items() if v.get('decodable') is False]
        # 9a NON-VACUITY: the figure must really carry an undecodable font, or 9b is
        # asserting over an empty set and would pass on a gate that does nothing.
        check('9a NON-VACUITY the real figure carries an undecodable font',
              bool(undec), True)
        # 9b every block drawn with it is held back, END TO END through the CLI
        # `send` is `not looks_verbatim AND fonts ok`, so a block that is PROSE and
        # NOT sent can only have been stopped by the font clause. That is the gate
        # firing, observed through the CLI rather than by calling the function.
        held = [b for b in blocks if not b['send'] and not looks_verbatim(b['english'])]
        check('9b prose blocks ARE held back on the real undecodable figure',
              len(held) > 0, True)
        # 9c CONTROL: the gate did NOT hold everything — decodable prose still sells.
        # Without this, a gate that refused the whole figure would pass 9b.
        check('9c CONTROL decodable prose on the SAME figure is still sent',
              sum(1 for b in blocks if b['send']) > 0, True)
        # ── 9d THE DECISION UNIT, ASSERTED BY CONTENT (R4b) ─────────────────────────
        # 🔴 9b and 9c pass under BOTH units — which is precisely why they were not
        # enough, and why the per-font decision survived R4 with everything green. A
        # COUNT cannot say WHICH blocks were held, and both of this task's defects are
        # cases where the count looked reasonable: 24 holds on a figure with a broken
        # font reads as diligence until you read the 24 strings.
        #
        # Measured on this figure: per-FONT holds 24 blocks, per-BLOCK holds 2. The 2
        # carry a bullet glyph poppler renders as (cid:127); the 22 are clean English.
        from readlayer import _looks_undecoded
        clean_on_flagged = []
        for _b in _blocks:
            _joined = (block_key(_b) if FT.is_arc(_b)
                       else ' '.join(block_lines(_b)))
            if (not looks_verbatim(_joined) and not _looks_undecoded(_joined)
                    and {r['font'] for r in _b} & set(undec)):
                clean_on_flagged.append(_joined)
        # 9d-i NON-VACUITY, BOTH SIDES. A "2" proves nothing unless this figure really
        # carries an undecodable font (9a) AND really carries clean prose drawn with it
        # — otherwise the held set could be 2 on a figure with nothing to get wrong.
        check('9d-i NON-VACUITY clean prose IS drawn with the undecodable font '
              f'({len(clean_on_flagged)} blocks)',
              len(clean_on_flagged) > 0, True)
        # 9d-ii the held set BY CONTENT, not by count.
        held_now = sorted(b['english'].strip() for b in blocks
                          if not b['send'] and not looks_verbatim(b['english']))
        check('9d-ii the held prose set is EXACTLY the two undecoded blocks',
              held_now, ['(cid:127) 20% or', '(cid:127) 5% or less'])
        # 9d-iii one freed block NAMED — the purchase R4b unblocks, asserted positively
        # so a gate that quietly held everything again cannot pass 9d-ii by accident.
        sent_now = {b['english'].strip() for b in blocks if b['send']}
        check('9d-iii the flagship false positive IS now bought',
              'Nutrition Facts' in sent_now, True)

# ── 10. THE IMPORT MUST STAY LAZY (R4b introduced this dependency) ─────────────────
# `figtext.sendable` imports readlayer._looks_undecoded rather than copying it, because a
# third implementation of the predicate is how the reader and the judge drift apart. But
# `readlayer` pulls in pdfplumber at module scope, and `read_layer_accept.py` imports
# readlayer LAZILY on purpose, so that "readlayer.py is not importable" is a REPORTABLE
# CONTRACT FAILURE naming what Task R2 must build — not a crash at its own import line.
# Hoisting figtext's import to module scope would silently take that away, because
# read_layer_accept imports figtext at module scope. Asserted in a SUBPROCESS: this file
# has already imported readlayer by now, so an in-process check would pass vacuously.
import subprocess as _sp
_probe = ("import sys, figtext; "
          "print('LOADED' if 'readlayer' in sys.modules else 'LAZY')")
_r = _sp.run([sys.executable, '-c', _probe], cwd=str(Path(__file__).resolve().parent),
             capture_output=True, text=True, timeout=120)
check('10 importing figtext does NOT eagerly import readlayer',
      _r.stdout.strip(), 'LAZY')

print(f"\n{'ALL PASS' if not fails else str(len(fails)) + ' FAILED: ' + ', '.join(fails)}")
sys.exit(1 if fails else 0)
