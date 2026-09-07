#!/usr/bin/env python3
"""Emit a figure's translatable blocks as JSON, classified.

    FIGTEXT_PYLIBS=./pylibs python3 emit-blocks.py <figure.pdf>

Writes out/blocks.json: one entry per block, with `key` (the content-addressed
translation key), the joined English, and whether it is prose or verbatim.
Verbatim blocks — formulas, element symbols, bare numbers, unit symbols — are
emitted with `send: false`: they are identical in Icelandic and sending them
costs money to corrupt chemistry.

`send: false` ALSO covers a block drawn with a font the read layer could not decode
to Unicode (ruling R-8): its "text" is control-byte garbage, so buying it buys
mojibake. That flag lives in out/meta.json and this is what reads it.
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
blocks = FT.merge_blocks(FT.group(runs))

out, blocked = [], []
for b in blocks:
    arc = FT.is_arc(b)
    lines = block_lines(b)
    key = block_key(b)
    joined = key if arc else ' '.join(lines)      # the MT unit is the LABEL, not the line
    bad = FT.undecodable_fonts(b, fonts)
    send = FT.sendable(b, joined, fonts)
    if bad and not FT.looks_verbatim(joined):
        blocked.append((joined, bad))             # prose we WOULD have bought
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
    print("\n  !! HELD BACK (undecodable font - would have bought mojibake):")
    for text, bad in blocked:
        print(f"    {text!r}   fonts: {bad}")
