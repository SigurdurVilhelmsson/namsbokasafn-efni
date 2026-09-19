# Chemistry ch05 `m68727` — the glossary-off probe (2026-09-19)

**Frozen evidence.** Kept for research into Málstaður / Miðeind MT behaviour ([USER] 2026-09-19).
It is not pipeline input: the pipeline's `m68727` MT is the `--glossary-only` run in
`books/efnafraedi-2e/02-mt-output/ch05/`.

| file | what |
|---|---|
| `m68727-segments.is.no-glossary.md` | the paid MT output, `--no-glossary`, 2026-09-19T08:51Z (51,774 billed chars) |
| `m68727-provenance.no-glossary.json` | its run record (`arm: "no-glossary"`) |
| `enthalpy-probe.mjs` | the per-segment instrument: `node enthalpy-probe.mjs <en.md> <is.md>` |

**A same-input, same-day pair.** Both runs used the same English
(`books/efnafraedi-2e/02-for-mt/ch05/m68727-segments.en.md` at commit `92c9e249f`, byte-identical to its
state since 2026-08-31) and the same model on the same day. The only difference was the glossary arm.
So any difference between the two outputs comes from the glossary, not from a model change.

| 86 enthalpy segments | `verm-` | `varm-` only | neither |
|---|---|---|---|
| June MT, full glossary (commit `827424dae`) — control | 83 | 0 | 2 (+1 missing) |
| **this file, no glossary** | 19 | 40 | 27 |
| `--glossary-only "enthalpy,enthalpy change"` (commit `9cc6861e3`) | 86 | 0 | 0 |

Decision it led to: `docs/decisions/2026-09-19-enthalpy-glossary-subset-exception.md`.
