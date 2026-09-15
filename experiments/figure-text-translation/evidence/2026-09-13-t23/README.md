# Evidence — §C140 ② ③ ⑨ ⑩ design investigation, 2026-09-13

> 🧊 **FROZEN, 2026-09-13.** Cited, never synced. Status lives in the campaign register (§C140, ⏩ RESUME)
> and in `../../REGISTER.md`; the design it backs is
> `docs/superpowers/specs/2026-09-13-c140-t23-scripts-reflow-decimals-design.md`. If this folder disagrees
> with either, they win. **Cost of everything here: 0 ISK** — no MT call; nothing under `books/` written;
> the repository was read-only for every agent (one gitignored `__pycache__` write by omission is disclosed
> in `reports/c10-brain.md` and `reports/critic.md`).

Copied out of a session scratch directory (`/home/siggi/dev/scratch-c140/`, on real disk, not the tmpfs)
so the reports' citations resolve. Scripts keep their scratch paths; re-point them before reuse. Rendered
PNG/SVG outputs, prepared figure directories and scratch composer trees were **not** copied (hundreds of MB,
all regenerable at 0 ISK from the scripts and the committed sidecars).

## Reports — read in this order

| report | what it answers |
|---|---|
| `reports/prep.md` | the shared dataset: the 34 bought figures re-prepared and recomposed with E; every inherited denominator re-measured |
| `reports/c2-scripts.md` | ② the drawing half: script rule defects, per-run geometry, per-word styles through `wrap()`, browser drift, editor edits, report consumers |
| `reports/c3-containers.md` | ③ the geometry: box / cell / open census, why no constant budget works, [USER] rows → blocks → mechanisms |
| `reports/c3b-counterfactuals.md` | ③ first counterfactuals (V0–V3L). Assembled by the controller from the agent's return value — its Write was refused |
| `reports/c9-decimal.md` | ⑨ the convention, what the chapter does, the full kept-number census, font metrics, rules R1–R3 |
| `reports/c10-brain.md` | ⑩ the brain outline is a `pdftocairo -svg` soft-mask ring; a heal and its measurements |
| `reports/critic.md` | completeness critic over the five above; spot-checks; the gaps that changed decisions |
| `reports/r2-build.md` | the combined ② + ③ prototype under [USER]'s rulings, swept over floor and padding |
| `reports/r2v-numbers.md` | adversarial: every r2 headline number re-derived from raw outputs |
| `reports/r2v-rulings.md` | adversarial: conformance to the rulings, block by block, plus a picture review |
| `reports/r2v-scripts.md` | adversarial: ② placement, text sentinel, kept items, decimals, planted editor edits (found the census crash) |
| `reports/exo-spike.md` | why exocytosis never loads in Chromium `<img>`; the blend-lerp collapse; ⑩'s heal damages exocytosis |
| `reports/exo-verify.md` | adversarial: the collapse re-implemented independently, exact on all 155 paints |

⚠️ **Read the verifiers against the reports they check.** Numbers superseded by a verifier: `r2-build.md`'s
"three single words wider than the budget" (1 of 3 — `r2v-numbers.md` D1); "PROBLEM 50 → 4" population
(176 blocks, not the 50 flagged items — D2); `exo-spike.md`'s "31 byte-identical (27 with no add filter)"
(30 — `exo-verify.md` defect 1). ⚠️ **c2's and c9's claim that the panel's double-space suggestion would
send HClsoln's identity blocks to the layout path is false**: `figtext.is_identity` compares
`text.split()`, so whitespace edits keep a block identity (checked against the code by the controller).
⚠️ **⑩'s heal finding on exocytosis (`exo-spike.md` §7) was not re-run by the verifier.**

## Data

| file | what |
|---|---|
| `data/c3-blocks.jsonl` | 176 rows, one per layout-path block of the 34: container class and geometry, source cues, baseline verdicts, [USER] flag + mechanism |
| `data/c3b-tables.md` | c3b's generated tables T1–T8 |
| `data/c9-appendix.md`, `data/c9-matches.jsonl` | the full kept-number census and every rule's output |
| `data/r2-best-rule.txt` | r2's pre-registered ranking rule (written before any variant was composed) |
| `data/1b-census.jsonl.gz` + `.sha256` | the 1b corpus census (1,148 figures, 14,962 blocks with runs). **The frozen `../2026-09-13-compose-fidelity/reports/1b-census.md` cites this file as `findings/1b-census.jsonl`, which never reached the repo** — it survived only on a dead tmpfs; this is the one real copy, sha256 of the uncompressed bytes alongside |

## Instruments

One directory per agent (`instruments/<agent>/`), scripts only. Notable reusable ones:
`c3/` (the rebuilt collision instruments — the originals behind "~44/176" were lost with a tmpfs — and the
raster/vector container census), `r2/` (variant patcher, measure adapter, sentinels), `exo/tools/refgraph.py`
(no-sharing reference cost of an SVG — the shape-independent sentinel), `exo/fix/collapse_blend_lerp.py` and
`exo-v/fix/lerpcollapse.py` (two independent implementations of the collapse, byte-equal on 34/34),
`c10/strip_text_heal.py` (the ⑩ heal — **not safe as is**, see `exo-spike.md` §7), `c9/rules_eval.py`
(R1–R3 over the census).

⚠️ **Tooling traps recorded here:** `pgrep -x headless_shell` / `pgrep -x chrome` do NOT see Playwright's
`chrome-headless` processes (`exo-verify.md`); a subagent's Write to a report file may be refused by the
harness, so ask for the report text in the return value as well.
