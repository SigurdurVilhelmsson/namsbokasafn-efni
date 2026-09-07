#!/usr/bin/env python3
"""H2 / ruling R-8: `decodable` must GATE SPEND, not merely be written into meta.json.

    FIGTEXT_PYLIBS=./pylibs python3 test_sendable.py

Before this, `send` was `not looks_verbatim(joined)` alone and `emit-blocks.py` never
opened meta.json — the read layer's `decodable` flag had no consumer at all, so any test
asserting "undecodable text is never sent" passed vacuously against every possible reader.

🔴 The gate is tested on SYNTHETIC fonts on purpose. The current corpus decodes 7 of the 8
type0 figures cleanly (ruling R-7), so the real artwork no longer exercises the undecodable
path. A test that only ran when the corpus happened to be broken would go vacuous the day
the reader improved — which is exactly what happened to the clause this replaces.
"""
import sys
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

# ── 1. the gate itself ──────────────────────────────────────────────────────────────
check('prose on an UNDECODABLE font is NOT sent',
      sendable(block(PROSE, 'PAGE/T1_0'), PROSE, BAD), False)

# ── 2. THE POSITIVE CONTROL — without it assertion 1 passes on `return False` ───────
check('CONTROL prose on a DECODABLE font IS sent',
      sendable(block(PROSE, 'PAGE/T1_0'), PROSE, OK), True)

# ── 3. the verbatim clause still fires independently ────────────────────────────────
check('verbatim on a decodable font is NOT sent',
      sendable(block('H2O', 'PAGE/T1_0'), 'H2O', OK), False)

# ── 4. a block is only as sendable as its WORST font ────────────────────────────────
# A label mixing a decodable body font with an undecodable symbol font must be held:
# a block is bought whole, so one bad font poisons the purchase.
mixed = block('Wave', 'PAGE/T1_0') + block('length', 'PAGE/T2_0')
fonts = {'PAGE/T1_0': dict(decodable=True), 'PAGE/T2_0': dict(decodable=False)}
check('one undecodable font in a mixed block holds the whole block',
      sendable(mixed, PROSE, fonts), False)
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
check('...and once they decode, only the font gate holds them',
      (sendable(block(PROSE, 'PAGE/T1_0'), PROSE, BAD),
       sendable(block(PROSE, 'PAGE/T1_0'), PROSE, OK)), (False, True))

# ── 7. undecodable_fonts returns EMPTY, not None, on a clean block ───────────────────
check('clean block reports no blocking fonts',
      undecodable_fonts(block(PROSE, 'PAGE/T1_0'), OK), [])

print(f"\n{'ALL PASS' if not fails else str(len(fails)) + ' FAILED: ' + ', '.join(fails)}")
sys.exit(1 if fails else 0)
