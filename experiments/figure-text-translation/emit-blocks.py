#!/usr/bin/env python3
"""Emit a figure's translatable blocks as JSON, classified.

    FIGTEXT_PYLIBS=./pylibs python3 emit-blocks.py <figure.pdf>

Writes out/blocks.json: one entry per block, with `key` (the content-addressed
translation key), the joined English, and whether it is prose or verbatim.
Verbatim blocks — formulas, element symbols, bare numbers, unit symbols — are
emitted with `send: false`: they are identical in Icelandic and sending them
costs money to corrupt chemistry.

`send: false` ALSO covers a block whose OWN TEXT the read layer could not decode to
Unicode (ruling R-8, completed by R4b): its "text" is control-byte garbage, so buying
it buys mojibake. The `decodable` FLAG is per-font and lives in out/meta.json; this is
what reads it, and it reports with it — but the DECISION is per BLOCK, because a block
is the unit of purchase. On CNX_Chem_05_02_FoodLabel a per-font decision held 24 blocks
where 2 are genuinely undecoded: 22 false positives, all of them clean English.
"""
import sys, json, subprocess
import _deps
from _deps import OUT
import figtext as FT
from blockkey import block_key, block_lines

subprocess.run([sys.executable, 'extract.py', sys.argv[1]], check=True,
               capture_output=True)
# P8: NO blank-run filter. Dropping blank runs before grouping buys
# "notconsistentwith" instead of "not consistent with", and the key rule
# must be identical in every consumer -> blockkey.block_key.
runs = json.loads((OUT / 'runs.json').read_text())
# H2 / ruling R-8: `decodable` is written into meta.json by the read layer, and until now
# NOTHING READ IT — the flag was a detector reporting into a file with no consumer. The
# spend decision is made here, so the consumption belongs here.
fonts = json.loads((OUT / 'meta.json').read_text())['fonts']
# The per-BLOCK predicate (R4b). Imported from the read layer, never re-implemented:
# it is deliberately identical to the judge's classify_type0, and a copy is how the
# two drift apart.
from readlayer import _looks_undecoded
blocks = FT.merge_blocks(FT.group(runs))

out, blocked, freed = [], [], []
for b in blocks:
    arc = FT.is_arc(b)
    lines = block_lines(b)
    key = block_key(b)
    joined = key if arc else ' '.join(lines)      # the MT unit is the LABEL, not the line
    bad = FT.undecodable_fonts(b, fonts)          # per-FONT flag — REPORTING only
    send = FT.sendable(b, joined, fonts)
    if not FT.looks_verbatim(joined):
        if _looks_undecoded(joined):
            blocked.append((joined, bad))         # prose we WOULD have bought
        elif bad and send:
            freed.append((joined, bad))           # drawn with a flagged font, reads CLEAN
    out.append(dict(key=key, english=joined, lines=lines, arc=arc, send=send))
(OUT / 'blocks.json').write_text(json.dumps(out, indent=1, ensure_ascii=False))

send = [b for b in out if b['send']]
chars = sum(len(b['english']) for b in send)
print(f"  {len(out)} blocks: {len(send)} prose to send, {len(out)-len(send)} verbatim held back")
print(f"  billable characters: {chars}   estimated cost: {chars*10/1000:.2f} ISK")
print("\n  WILL SEND:")
for b in send:
    print(f"    {b['english']!r}")
print("\n  HELD BACK (verbatim - identical in Icelandic):")
for b in out:
    if not b['send']:
        print(f"    {b['english']!r}")

# Reported, never silent: a block held back for UNDECODABLE FONTS is a different fact
# from a verbatim one — it is prose we would have bought, and it means this figure needs
# a font fix rather than a translation. A fail-closed gate nobody can see is a gate
# nobody can debug.
if blocked:
    print("\n  !! HELD BACK (undecoded TEXT - would have bought mojibake):")
    for text, bad in blocked:
        print(f"    {text!r}   fonts: {bad}")
# The other half of the same fact, and it is the one R4b exists to make visible: a block
# drawn with a flagged font whose own text reads CLEAN is BOUGHT. Silence here is what a
# per-font decision produced — 22 of 24 holds on CNX_Chem_05_02_FoodLabel were blocks
# like 'Nutrition Facts', withheld with no line of output saying so.
# ⚠️ `and send` is LOAD-BEARING, not belt-and-braces. `bad` comes from
# `undecodable_fonts`, which reports every font that is not KNOWN-decodable — and that
# includes a font MISSING from meta.json, which `sendable` refuses via `missing_fonts`.
# Without this clause a block held by the fail-closed plumbing check would be printed
# under "SENT ANYWAY" while `send` is False: a report contradicting the spend decision it
# describes, which is the very class of defect R4b exists to remove.
if freed:
    flagged = sorted({f for _t, bad in freed for f in bad})
    print(f"\n  SENT ANYWAY ({len(freed)} prose blocks on a flagged font, text reads "
          f"clean - the decision is per BLOCK, the flag is per FONT: {flagged}):")
    for text, bad in freed:
        print(f"    {text!r}   fonts: {bad}")
