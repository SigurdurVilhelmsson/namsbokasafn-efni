# Evidence — does a figure label translate better with context? Per-label vs joined MT over the 34, 2026-09-15

> 🧊 **FROZEN, 2026-09-15.** Cited, never synced. Status lives in the campaign register (§C140 ⑪, ⏩ RESUME)
> and in [`../../REGISTER.md`](../../REGISTER.md). **This is an experiment, not a pipeline change:** nothing under
> `books/` was written, no sidecar or media file changed, and the figure MT leg (`translate-blocks.mjs`, one bare
> request per distinct block key) is exactly as it was. **Whether that leg changes is [USER]'s decision.**
> **Cost: about 109 ISK, paid by [USER]** — 90.88 ISK for the main comparison (`summary.json` → `billed.cost`,
> 231 requests) plus about 18.5 ISK for the alt probe (7 requests, 1,851 characters at the run's own
> characters ÷ 100 estimate; `probe-alt/results.json` stores no usage record, so that figure is not in a file).

## What was asked

[USER]'s note on the 2026-09-13 review (§C140 ⑪): *"sending tiny fragments of text for translation seems to strip
the MT-engine of context"*. Two questions, in order:

1. **Does prefixing the figure's alt text help a short label?** One figure, `CNX_Chem_04_04_limiting`, whose
   committed `After reaction` → `Eftir viðbrögð` [USER] had flagged (`Eftir hvarf` wanted).
2. **Per-label vs joined labels, over all 34 bought ch03/ch04 figures.** Does sending a figure's labels together,
   one per line, change or improve what comes back?

## Arms

All requests are bare Málstaður `/v1/translate`, `targetLanguage: 'is'`, **no glossary** — the production figure leg.

| arm | what is sent | where |
|---|---|---|
| **C** | nothing — the committed sidecar value (what production bought) | `books/efnafraedi-2e/figure-text/*.is.json`, read in place |
| **P** | one request per distinct send block — production's shape, re-run | `results.jsonl`, `arm: "P"` |
| **J1** | one request per multi-label figure, its labels newline-joined in emit order | `results.jsonl`, `arm: "J1"` |
| **J2** | J1 again, to measure the joined arm's own run-to-run variation | `results.jsonl`, `arm: "J2"` |
| probe A | `limiting`'s four labels, one request each | `probe-alt/results.json` |
| probe B | the same four labels joined, no alt | `probe-alt/results.json` |
| probe C ×2 | the figure's alt text, a blank line, then the joined labels | `probe-alt/results.json` |

**Three populations, and the numbers below name which one they use:** **169** labels (every P label, 34 figures) ·
**166** labels in the **31** figures with more than one label (only these have J arms; `brain-ec0b`, `basehyd_img`
and `GreenChem` have one each) · **76** judged items, the labels where J1 or J2 differs from P (`key/keymap.json`).

## Results

### The alt probe (`probe-alt/results.json`)

Per-label reproduces `Eftir viðbrögð`. **The joined labels WITHOUT the alt already give `Eftir hvarf`**, and
alt + labels gives it in both runs — so the context that fixed it was the sibling labels, not the alt. ⚠️ Alt run 2
also rewrote `H2` → `H₂` (Unicode subscripts) **in the label lines**, a hazard for anything that would ever send
alt text with labels. That is why the main comparison has no alt arm.

### Per-label vs joined, over the 34

| measure | result | source |
|---|---|---|
| joined answers that split back into exactly one non-empty line per label | **62 of 62** (J1 31/31, J2 31/31) | `summary.json` → `split`; `recount/recount.py` |
| per-label drift — a re-run of production's own shape (P) differs from what was bought (C) | **13 of 169** (the same 13 are **13 of 166** in the recount's multi-label population) | `summary.json` → `per_label_drift`; `recount/recount.py` |
| joined run-to-run — J1 ≠ J2 | **17 of 166** | `summary.json` → `joined.J1_vs_J2_differ`; `recount/recount.py` |
| joined vs per-label — J ≠ P | **72 of 166**, for J1 and for J2 alike | `summary.json` → `joined`; `recount/recount.py` |
| blind consensus over the 76 judged items — P | **12 wrong · 42 acceptable · 22 correct** | `verdicts.json` → `summary["P consensus"]` |
| blind consensus over the 76 judged items — J1 | **2 wrong · 20 acceptable · 54 correct** (J2: 4 · 20 · 52) | `verdicts.json` → `summary["J1 consensus"]`, `["J2 consensus"]` |
| the labels P gets wrong that J1 does not | **all 12 of P's 12** | `verdicts.json` → `summary["P wrong, J1 not wrong"]` |
| the labels J1 gets wrong that P does not | **2** (J2: **4**) | `verdicts.json` → `summary["J1 wrong, P not wrong"]`, `["J2 wrong, P not wrong"]` |
| formula, number or symbol damage, any arm | **none** | `recount/recount.py` |

**What the 12 fixes are** (`verdicts.json` → `rows`): `Element` `Þáttur` → `Frumefni` (5 figures), `Molecular mass`
`Mólmassi` → `Sameindamassi` (3), `Product side`/`Product` `Vörumegin`/`Vara` → `Myndefnamegin`/`Myndefni`,
`After reaction` → `Eftir hvarf`, and one `Average atomic mass` rendering.

🔴 **What joining costs: `Stoichiometric factor` is DESTABILISED.** Per-label, it is `Efnajöfnustuðull` in all 8 of
its labels, committed and re-run alike; joined, it is `Efnajöfnustuðull` in only 4 of 16 answers, the other 12
spread over six different renderings, two of which the judges called wrong (`Stöðugleikastuðull`, "stability
factor", and `Stöðumælingarstuðull`) — `labels.json`; `verdicts.json` rows `i45`, `i52`, `i55`, `i56`, `i58`, `i67`, `i71`. The remaining J2-only regression drops `sem` from the ethene
arrow label.

**How "none" was measured.** `recount/recount.py` compares, per label and per arm (C, P, J1, J2), the multiset of
formula tokens, numbers (a decimal comma counted equal to a point) and the symbols `+ – − = → % × /` against the
English. 95 of the 166 English labels carry at least one such token. It printed **4 damage candidates, all the word
`We` in `We can make:` misread as a formula, identically in every arm including the committed value**, and its
positive control — a deliberately mutated `C8H18 → C8H17`, `9.55 → 9,56` — was flagged. `mL → ml` changes in every
arm including C, so it is not a joining effect.

## Caveats — read before using any number above

- **The judges are models, not people.** Three blind lenses (terminology, book-consistency, label-fit), each shown
  only `judge/items.json` — the English label, the figure's other English labels, and candidate texts under
  neutral letter ids with no arm names; `key/keymap.json` unblinds them in `aggregate.py`. Consensus is the median of the
  three. `judge-result.json` is the workflow's raw output, including a narrative recount.
- **Many "gains" are style conventions, not errors** — `Mól af X` → `Mól X` / `Mólfjöldi X`, hyphenation, verb
  mood. A consensus `correct` over `acceptable` is not evidence a reader was misled before.
- **One figure set only**: the 34 bought ch03/ch04 chemistry figures, one MT model on one day, two joined runs.
  Joined output varies run to run (17 of 166), so a single joined run is not a stable deliverable.
- **The scripts reference absolute scratch paths** (`/home/siggi/dev/scratch-c140/label-context-mt`,
  `/home/siggi/dev/scratch-c140/prep/figs`, and the repository at `/home/siggi/dev/repos/namsbokasafn-efni`).
  They are kept here as the exact code that produced the data, not as runnable tools; `run.mjs` is **billable**
  and reads the repository's `.env` for the API credentials.

## Files

| file | what it is |
|---|---|
| `run.mjs` | the paid runner — P, J1, J2 arms; resumable; appends every answer to `results.jsonl` |
| `results.jsonl` | every request and answer, one JSON record per line, with the billed `usage` |
| `analyse.py` | pairs P/J1/J2 with the committed C → `labels.json` and `summary.json` |
| `labels.json` | one row per label: English, C, P, J1, J2 and an integrity check |
| `summary.json` | the headline counts and the billed cost |
| `judge/items.json` | what the blind judges saw |
| `key/keymap.json` | the unblinding key — candidate id → text and arms |
| `judge-result.json` | the three-lens judging workflow's raw output |
| `aggregate.py` | unblinds and scores → `verdicts.json` |
| `verdicts.json` | per-item consensus and the summary counts |
| `recount/recount.py` | an independent recount of `results.jsonl` against the committed sidecars, with the damage check and its control (prints; writes nothing) |
| `probe-alt/run.mjs`, `probe-alt/results.json` | the alt-text probe on `CNX_Chem_04_04_limiting` and its answers |
