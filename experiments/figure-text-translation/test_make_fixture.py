#!/usr/bin/env python3
"""The committed read-layer fixture is what `make_fixture.py` produces, and it has the
properties the positive controls downstream depend on.

    FIGTEXT_PYLIBS=./pylibs python3 test_make_fixture.py

Plain asserts, like test_sources.py - no pytest in this tree.

🔴 THIS SUITE IS NOT ALL REFUSALS. Cases 2-6 fail if the fixture does not actually carry
the designed shape, and case 7 is the control that proves the measurement can MOVE: it
regenerates the fixture with the block spacing pushed inside `figtext`'s newline window
and asserts the four blocks collapse to one. Without that control, "4 blocks" would be
indistinguishable from a grouping stage that returns whatever it is given.

🔴 THE NUMBERS HERE WERE MEASURED, NOT COPIED. The plan that asked for this fixture
asserts `blocks == 4, sendable == 3` against a file that had never existed; those were
design targets. This file re-derives them by running the real read layer over the real
committed bytes, and the fixture was iterated until it hit them - not the other way round.
The first draft, lifted from `test_readlayer.py`'s `synth()`, produced 2 blocks / 2
sendable and no subset signal at all.
"""
import json
import shutil
import subprocess
import sys
import tempfile
from collections import Counter
from pathlib import Path

import _deps  # noqa: F401  - puts this directory and FIGTEXT_PYLIBS on sys.path

import figtext as FT           # noqa: E402
import make_fixture as MF      # noqa: E402
from extract import is_subset  # noqa: E402  - the predicate itself, never a copy
from readlayer import read     # noqa: E402

HERE = Path(__file__).resolve().parent
FIXTURE = HERE / 'fixtures' / 'fixture_figure.pdf'

# What the fixture is DESIGNED to say. Kept here as an ordered list rather than a count:
# a count cannot tell "two blocks merged and one split" from "no change".
WANT_BLOCKS = ['Observation and curiosity', 'Form a hypothesis',
               'Test the hypothesis', 'H2O (g)']
WANT_SENDABLE = ['Observation and curiosity', 'Form a hypothesis', 'Test the hypothesis']

fails = []


def check(label, ok, detail=''):
    print(f"  {'PASS' if ok else 'FAIL'}  {label}" + (f": {detail}" if detail else ''),
          flush=True)
    if not ok:
        fails.append(label)


def measure(pdf_path):
    """-> (ordered block texts, sendable texts, meta). Through the real read layer and
    the real block model, never a re-implementation of either."""
    runs, meta, outcome = read(str(pdf_path))
    blocks = FT.merge_blocks(FT.group(runs))
    texts, sendable = [], []
    for b in blocks:
        joined = ' '.join(''.join(r['text'] for r in line) for line in FT.lines(b))
        texts.append(joined)
        if FT.sendable(b, joined, meta['fonts']):
            sendable.append(joined)
    return texts, sendable, meta, outcome


# ── 1. the fixture is committed, not merely generated on this box ────────────────────
tracked = subprocess.run(['git', 'ls-files', '--error-unmatch', str(FIXTURE)],
                         cwd=str(HERE), capture_output=True, text=True)
check('1 the fixture is tracked by git', FIXTURE.exists() and tracked.returncode == 0,
      f'exists={FIXTURE.exists()} git ls-files exit={tracked.returncode} '
      f'{tracked.stderr.strip()[:120]}')

if not FIXTURE.exists():
    print('\n1 FAILED — nothing further can be measured')
    sys.exit(1)

texts, sendable, meta, outcome = measure(FIXTURE)

# ── 2. the designed shape, by NAME and in order, not by count ────────────────────────
check('2 the fixture reads as the four designed blocks, in order',
      texts == WANT_BLOCKS, f'{texts!r}')
check('2b exactly three of them are sendable, and they are the three prose ones',
      Counter(sendable) == Counter(WANT_SENDABLE), f'{sendable!r}')

# ── 3. the fourth block is held for the RIGHT reason ─────────────────────────────────
# "3 sendable" is also what a broken plumbing gate produces. `missing_fonts` firing would
# hold a block for a reason that has nothing to do with the verbatim rule this fixture
# exists to exercise, so the two must be told apart.
held = [t for t in texts if t not in sendable]
verbatim_held = [t for t in texts if FT.looks_verbatim(t)]
check('3 the held block is held by looks_verbatim, not by a plumbing fault',
      held == verbatim_held == ['H2O (g)'],
      f'held={held!r} verbatim={verbatim_held!r}')
blocks = FT.merge_blocks(FT.group(read(str(FIXTURE))[0]))
missing = sorted({f for b in blocks for f in FT.missing_fonts(b, meta['fonts'])})
check('3b no block draws with a font meta.json does not describe', missing == [],
      f'{missing!r}')

# ── 4. the fixture exercises the NORMAL font path, not the read layer's fallback ─────
# Measured while building this file: without a /FontDescriptor pdfminer reports
# `fontname='unknown'`, every run lands on `UNSCOPED/unknown`, and the fixture silently
# tests `resolve_font`'s never-should-fire branch instead of the resource walk.
check('4 no run resolved through the UNSCOPED fallback',
      meta['unscoped_fonts'] == {}, f"{meta['unscoped_fonts']!r}")
check('4b every declared font was actually drawn with',
      meta['fonts_unexercised'] == 0, f"{meta['fonts_unexercised']!r}")
check('4c the reader needed no advance repairs and hit no unparsable colour',
      meta['adv_repaired'] == {} and meta['color_warnings'] == 0
      and meta['unknown_colorspaces'] == {},
      f"adv_repaired={meta['adv_repaired']} colour={meta['color_warnings']} "
      f"cs={meta['unknown_colorspaces']}")
check('4d the read layer reports the figure as text-bearing', outcome == 'reads', outcome)

# ── 5. the subset signal, and a control proving the predicate can say NO ─────────────
subset = [f for f, d in meta['fonts'].items() if is_subset(d)]
check('5 NON-VACUITY the fixture declares at least one font', len(meta['fonts']) >= 1,
      f'{sorted(meta["fonts"])!r}')
check('5b every font in the fixture reads as a SUBSET font',
      subset == sorted(meta['fonts']), f'{subset!r}')
check('5c the fixture carries BOTH subset signals, as real artwork does',
      all(d['last'] is not None and d['last'] < 200
          and (d['base'] or '').lstrip('/')[6:7] == '+'
          for d in meta['fonts'].values()),
      json.dumps(meta['fonts']))
check('5d CONTROL is_subset says NO to a full font, so 5b is not a stuck predicate',
      is_subset({'last': None, 'base': '/Helvetica'}) is False)

# ── 6. regenerating is deterministic ─────────────────────────────────────────────────
with tempfile.TemporaryDirectory() as td:
    again = MF.build(Path(td) / 'again.pdf')
    same_bytes = again.read_bytes() == FIXTURE.read_bytes()
    check('6 make_fixture.py regenerates the committed bytes EXACTLY',
          same_bytes,
          f'{again.stat().st_size} B regenerated vs {FIXTURE.stat().st_size} B committed '
          f'(pikepdf/qpdf version drift is the likely cause if this is the only red)')
    # The second tier: byte-identity is the contract, but if a future pikepdf changes the
    # serialisation the fixture is still USABLE iff it still measures the same. Reporting
    # both separates "the bytes moved" from "the fixture stopped working".
    re_texts, re_sendable, _re_meta, _o = measure(again)
    check('6b ...and the regenerated file measures the same, bytes aside',
          (re_texts, Counter(re_sendable)) == (WANT_BLOCKS, Counter(WANT_SENDABLE)),
          f'{re_texts!r} / {re_sendable!r}')

# ── 7. CONTROL — the measurement MOVES when the fixture changes ──────────────────────
# Without this, "4 blocks" is indistinguishable from a grouping stage that returns
# whatever it is handed. 14pt is inside figtext's newline window (SIZE * 1.222 = 14.66,
# tolerance 2.0), so the four blocks MUST collapse into one.
with tempfile.TemporaryDirectory() as td:
    original_gap = MF.BASELINE_GAP
    try:
        MF.BASELINE_GAP = 14
        collapsed = MF.build(Path(td) / 'collapsed.pdf')
    finally:
        MF.BASELINE_GAP = original_gap
    c_texts, c_sendable, _m, _o = measure(collapsed)
    check('7 CONTROL block spacing inside the newline window collapses 4 blocks to 1',
          len(c_texts) == 1 and len(c_sendable) == 1,
          f'{len(c_texts)} blocks, {len(c_sendable)} sendable: {c_texts!r}')
    check('7b CONTROL and the 40pt spacing is what the committed fixture actually uses',
          MF.BASELINE_GAP == 40 and MF.SIZE == 12,
          f'gap={MF.BASELINE_GAP} size={MF.SIZE}')

# ── 8. the fixture is small enough to belong in git ──────────────────────────────────
check('8 the committed fixture is a few kB, not a real figure',
      0 < FIXTURE.stat().st_size < 32 * 1024, f'{FIXTURE.stat().st_size} bytes')

print(f"\n{'ALL PASS' if not fails else str(len(fails)) + ' FAILED: ' + ', '.join(fails)}")
sys.exit(1 if fails else 0)
