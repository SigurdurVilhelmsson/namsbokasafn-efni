# Acceptance criteria — first paid Málstaður run (fixed BEFORE the run)

Figure: `CNX_Chem_01_06_TempScales` · 8 prose blocks · 120 chars · ~1.20 ISK
Sent **without a glossary**, deliberately: per CLAUDE.md §C73 the unprompted
rendering is the control, and a first measurement should isolate the model from
the glossary rather than confound them.

## Must pass
1. All 8 requests return 200 with non-empty Icelandic.
2. Billed characters within ±20 % of the 120 estimated.
3. The 5 multi-word blocks return text **different from the English**. (The three
   one-word blocks — Fahrenheit / Celsius / Kelvin — are proper nouns and may
   legitimately come back unchanged; unchanged there is NOT a failure.)
4. No block comes back empty, truncated, or carrying stray markup.
5. The composed SVG renders in Chromium inside `<img>` with every block present.
6. No block overflows its width budget after composition (auto-fit shrink is the
   only permitted response, and any shrink is reported).

## Recorded, not gated
- Domain quality of each rendering, listed for editorial review. **This run cannot
  approve translations** — CLAUDE.md requires human approval before content ships,
  and nothing here goes near `books/`.
- Whether the 3 K-values needing a decimal comma (373.15 → 373,15) are handled.
  They are NOT: number localization is unimplemented, so this run should show them
  passing through with a period. That is an expected, recorded gap, not a failure.

## Will NOT be claimed on this run
- That figure MT is "working" in general. n=1 figure, 8 blocks, one subject area.
- Any statement about glossary behaviour — none was sent.
