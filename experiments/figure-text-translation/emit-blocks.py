#!/usr/bin/env python3
"""Emit a figure's translatable blocks as JSON, classified.

    FIGTEXT_PYLIBS=./pylibs python3 emit-blocks.py <figure.pdf>

Writes out/blocks.json: one entry per block, with `key` (the content-addressed
translation key), the joined English, and whether it is prose or verbatim.
Verbatim blocks — formulas, element symbols, bare numbers, unit symbols — are
emitted with `send: false`: they are identical in Icelandic and sending them
costs money to corrupt chemistry.
"""
import sys, json, subprocess
import _deps
from _deps import OUT
import figtext as FT

subprocess.run([sys.executable, 'extract.py', sys.argv[1]], check=True,
               capture_output=True)
runs = [r for r in json.loads((OUT / 'runs.json').read_text()) if r['text'].strip()]
blocks = FT.merge_blocks(FT.group(runs))

out = []
for b in blocks:
    arc = FT.is_arc(b)
    lines = [''.join(y['text'] for y in l) for l in FT.lines(b)]
    key = ''.join(r['text'] for r in b) if arc else '|'.join(lines)
    joined = key if arc else ' '.join(lines)      # the MT unit is the LABEL, not the line
    out.append(dict(key=key, english=joined, lines=lines, arc=arc,
                    send=not FT.looks_verbatim(joined)))
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
