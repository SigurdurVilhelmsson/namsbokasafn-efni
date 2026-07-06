# F3 — per-instance re-triage of the 28 "benign" fidelity-allowlist entries

**Date:** 2026-07-06
**Scope:** `books/efnafraedi-2e/fidelity-allowlist.json` — the 28 `benign` entries.
**Motivation:** Fable-5 RUN 1 (finding 3, `docs/audit/2026-07-02-fable5-fidelity-provenance-review.md`) showed the `benign` class was assigned per tag-*family* with one boilerplate reason ("text + inline formatting present in output"), never verified per instance — and byte checks falsified it in several modules. This is WS2's real definition-of-done.

**Method:** fresh-injected the affected chapters (mt-preview), then for each entry compared `01-source` vs the fresh `03-translated/mt-preview` bytes per instance — the checker only sees tag *counts*; a re-triage must read the *content*. Sub/sup adjudicated by content-multiset diff; emphasis/term/title by reading which span lost its wrapper. Output-neutral: only this doc + the allowlist JSON change; no published bytes.

**Result:** 13 of 28 entries are **real losses** mislabeled benign; 15 are genuine artifacts. The real losses cluster into **four distinct root causes**, not one.

---

## Root causes

### RC1 — glossary/`<definition><term>` headword drops/mis-anchors `<sub>`/`<emphasis>` (systemic, citable) — the big one
In the end-of-module **key-terms/glossary** headword, chemistry notation embedded in the term name loses or relocates its `<sub>`/`<emphasis>` wrapper, **while every in-body mention of the same notation renders correctly**. The `<sub>` frequently re-anchors to the *leading letter of the Icelandic word* (subscript content matched against the wrong character).

Instances (7 modules, ~8 sites):
- **m68700** (ch03, **faithful + mt-preview**): `Avogadro's number (N<sub>A</sub>)` → `<sub>A</sub>vogadrosartala (NA)` — italics dropped, `<sub>` mis-anchored to the leading "A". On the **citable** key-terms page.
- **m68733** (ch06): `m<sub>l</sub>` → `segu<sub>l</sub>skammtatala`; `m<sub>s</sub>` → `<sub>s</sub>punaskammtatala` (2 of the entry's 4; the other 2 are empty-tag artifacts).
- **m68741** (ch07): `ΔH<sub>lattice</sub>` → `grindarorka` headword lost `<sub>` (renders "Hgrind"); all 5 in-body `ΔH_lattice` correct.
- **m68791** (ch12): `t<sub>1/2</sub>` / `t<sub>l/2</sub>` (half-life) headword lost `<sub>`.
- **m68822** (ch17): `E<sub>cell</sub>` → `kerspenna (Eker)` headword lost `<sub>`.
- **m68844** (ch19): `t<sub>2g</sub>` orbitals headword lost `<sub>`; `e<sub>g</sub>` orbitals headword lost `<emphasis>`.

Because a mis-anchored `<sub>` stays a `<sub>`, it is **count-balanced and invisible to the tag-count check** — m68700/m68733 are only reachable via the collateral `emphasis -1` drop. A pure position-only mis-anchor with no count change is not in the allowlist at all (method limit — see below).

### RC2 — term-splitting mis-attaches the id/English gloss to the wrong span
`m68709` (ch04), `m68735` (ch06): one source `<term>` splits into two translated `<term>`s (`term +1`), and the `id=`+English gloss lands on the *mistranslated* span. E.g. `chemical equation` → id/gloss on `efnaformúlur` ("chemical formulas", wrong) + unlabeled `efnajöfnu` (right); `isoelectronic` → gloss on `rafeindaskipan` ("electron configuration", wrong). Not a tag-count *loss* (both spans stay term-wrapped), but a real annotation-integrity defect that silently emits wrong inline English glosses. Left `benign` for the tag-count manifest; logged as its own defect.

### RC3 — extractor doesn't round-trip `<emphasis class="…">` (attribute variant)
`m68847` (ch20): `<emphasis class="emphasis-one">O</emphasis>` (ether R–O–R) is dropped at inject → plain `R–O–R`. The extractor handles `effect="…"` emphasis but not the `class="…"` variant.

### RC4 — MT/inject duplicates a segment into translated + untranslated copies
`m68860`, `m68863` (appendices): a segment lands in the output as both its Icelandic translation and its untranslated English original, producing **visible English residue** plus structural drift:
- **m68860**: title "Graphing the Dependence of y on x" stays **untranslated in place**; its Icelandic ("Graf yfir fylgni y við x") is grafted as a phantom `<title>` onto an unrelated `<para>` that had none (drags 2 emphasis → `emphasis +2`, `title +1`).
- **m68863**: table header duplicates the ΔH column — one translated "ΔH (kJ/mól)" + one leftover untranslated "ΔH (kJ/mol)" → EN residue + column-count drift.
- The residue-report detector did **not** catch these (title/table-header text appears outside its scan scope — detector gap, logged).

---

## Full re-triage table (28 entries)

| Module | Tag | AL diff | Verdict | Sev | Root cause / evidence |
|--------|-----|--------:|---------|-----|-----------------------|
| m68700 | emphasis | −1 | **real-loss** | high | RC1 — Avogadro term, `<sub>` mis-anchor + italics dropped (citable) |
| m68709 | term | +1 | artifact* | med | RC2 — split-term, gloss misattached (`efnaformúlur`); no tag loss |
| m68710 | emphasis | −1 | artifact | low | empty self-closing `<emphasis/>` in OpenStax source |
| m68716 | emphasis | −1 | **real-loss** | low | `(aq)` state-symbol italic dropped (cosmetic) |
| m68733 | emphasis | −4 | **real-loss** | high | RC1 — 2× quantum-number term mis-anchor (+2 empty-tag artifacts) |
| m68734 | emphasis | −1 | artifact | low | empty self-closing `<emphasis/>` |
| m68735 | term | +1 | artifact* | med | RC2 — split-term, gloss misattached (`rafeindaskipan`); 3-way term inconsistency |
| m68741 | sub | −1 | **real-loss** | med | RC1 — `grindarorka` term lost `<sub>grind</sub>` |
| m68752 | sub | −1 | artifact | low | nested-`<sub>` normalization; content present (`Total`→`Heildar`) |
| m68768 | emphasis | −1 | artifact | low | empty self-closing `<emphasis/>` |
| m68781 | sub | −1 | artifact | low | nested-`<sub>` normalization; content present |
| m68783 | sub | −2 | artifact | low | nested-`<sub>` normalization; content present |
| m68786 | emphasis | −1 | artifact | low | empty self-closing `<emphasis/>` (in `<sub>`) |
| m68789 | term | −1 | **real-loss** | high | `<term>rate equations</term>` glossary anchor dropped |
| m68791 | sub | −1 | **real-loss** | med | RC1 — half-life term lost `<sub>` |
| m68793 | emphasis | −1 | artifact | low | empty self-closing `<emphasis/>`; prior `virkjun<sub>a</sub>rorka` corruption **resolved** (not in fresh) |
| m68805 | emphasis | +1 | artifact | low | benign over-wrap (Icelandic rephrase adds one italic) |
| m68811 | emphasis | −1 | artifact | low | benign over-wrap on one `K_sp`. **⚠ fresh re-inject = +1 (UNEXPLAINED) — see WS5 note** |
| m68822 | sub | −1 | **real-loss** | med | RC1 — `kerspenna (E_cell)` term lost `<sub>` |
| m68844 | emphasis | −1 | **real-loss** | med | RC1 — `e_g` orbitals term lost `<emphasis>` |
| m68844 | sub | −1 | **real-loss** | med | RC1 — `t_2g` orbitals term lost `<sub>` (different span from the emphasis) |
| m68846 | emphasis | −2 | artifact | low | 2× empty self-closing `<emphasis/>` |
| m68846 | sup | −1 | artifact | low | nested/normalization; content present |
| m68847 | emphasis | −1 | **real-loss** | med | RC3 — `<emphasis class="emphasis-one">O</emphasis>` not round-tripped |
| m68848 | emphasis | −1 | artifact | low | empty self-closing `<emphasis/>` |
| m68860 | emphasis | +2 | **real-loss** | high | RC4 — duplicated-title emphasis drift |
| m68860 | title | +1 | **real-loss** | high | RC4 — untranslated-EN title in place + phantom title on wrong para |
| m68863 | emphasis | +1 | **real-loss** | high | RC4 — table header EN residue + column drift |

\* "artifact*" = benign for the *tag-count* manifest (no tag loss), but carries a real annotation defect (RC2) tracked separately.

**Real losses:** 13 entries → reclassified `benign` → `known-loss-deferred` with per-instance reason + pointer.
**Genuine artifacts:** 15 entries → stay `benign`, boilerplate reason replaced with the accurate per-instance reason.

---

## ⚠ WS5 divergence (must handle before/at WS5 re-inject)

Fresh re-inject (post the merges since RUN 1) already diverges from the committed output that the allowlist matches:
- **m68811 `emphasis`: committed −1 (green) → fresh +1 (UNEXPLAINED).** The F5 nested-`[[i:[[link:]]]]` fix changed it; the current `−1` entry no longer matches fresh output. Verified benign (over-wrap on one `K_sp`). **At WS5, update this entry to `+1`** or the re-injected book breaks green.
- Fresh full-book check: 120 PERFECT / 29 discrepancy / **1 unexplained (m68811)**. Committed: **0 unexplained** (green). WS5 re-triage must re-run this pass against fresh output.

---

## Recommended fix split (for lead)

- **Fix before WS5 (reader-visible on the citable asset):** **RC1** — the glossary/`<term>` `<sub>`/`<emphasis>` mis-anchor. Highest value: corrupted chemical notation (`<sub>A</sub>vogadrosartala`, `ΔHgrind`, `E_cell`) on the citable key-terms page, 7 modules. One root-cause fix clears ~8 sites.
- **Fix before WS5 (small, contained):** **RC3** (m68847 `class=` emphasis round-trip) and **RC4** (m68860/m68863 appendices duplication + EN residue) — both are EN-residue / structural drift in published output.
- **Defer / decide:** **RC2** (m68709/m68735 wrong-gloss) — annotation-integrity, not a tag loss; also a terminology-consistency question. m68789 term-drop and m68716 `(aq)` italic — low/medium, can defer.
- **Method limit to log:** the tag-count check is blind to count-balanced position-only mis-anchors; RC1 is only *partially* visible via collateral emphasis drops. A content-level (not count-level) glossary check would be needed to guarantee RC1 is fully caught. Out of scope here.

## Out-of-scope finds (logged to register)
- Residue-report detector misses title / table-header text (RC4 EN residue uncaught).
- RC2 wrong-gloss / 3-way terminology inconsistency for single concepts (m68709/m68735).
- Count-balanced mis-anchor blind spot (RC1) — checker method limit.
