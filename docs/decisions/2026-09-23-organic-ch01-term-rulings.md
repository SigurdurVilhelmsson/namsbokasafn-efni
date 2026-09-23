# Decision: organic ch01's pre-buy rulings — atóm, four house-style terms (tengja- plural for bonds), shell on the wire, and a by-hand run

- **Date:** 2026-09-23
- **Status:** Accepted — superseded IN PART by `docs/decisions/2026-09-23-bond-terms-singular-tengi.md` (the `bond angle` / `bond length` forms are singular `tengi-`); its organic-only rulings (Q1 book preference, Q3–Q5) are moot per `docs/decisions/2026-09-23-organic-translation-stopped-openstax-notice.md` — the house-style rows stand
- **Context owners:** [USER] (rulings), prepared by a 0-ISK pre-buy audit
- **Supersedes:** none
- **Related:** the active register `docs/plans/2026-07-21-post-item17-followup-campaign.md` (the 2026-09-23 midday ⏩ RESUME, questions Q1–Q5; §C186–§C189) · `docs/plans/2026-09-05-per-chapter-loop.md` (Steps 1b, 2, 4) · `server/lib/houseStyleTerms.js` + `server/__tests__/houseStyleTerms2026-09-23.test.js` · `docs/decisions/2026-09-22-organic-text-before-figures-exception.md` · `docs/decisions/2026-08-12-idordabankinn-rank-is-not-editorial-consent.md` (the earlier `atóm` preference) · `docs/decisions/2026-09-21-chemistry-terminology-rulings.md` (the `lone pair` ruling this subset inherits)

> **FROZEN EVIDENCE — banner-dated 2026-09-23.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

Organic chemistry's first text buy (ch01, 15 units, 107,386 characters, ~1,074 ISK at list) was lined up with every free check run on current `main`. Five questions changed **what would be bought** — a term sent on the wire is obeyed on some occurrences and spreads into compounds, and correcting it afterwards costs an editor pass or a re-buy. At stake: ch01's 586 segments, and — because house-style rows are global to the `chemistry` domain — chemistry's export too.

## Decision

[USER], 2026-09-23: *"atóm, yes to the rest, except use plural for bonds (tengjalengd, tengjahorn)."*

| # | Question | Ruled |
|---|---|---|
| Q1 | organic `atom` | **`atóm`** — and `atom` / `atomic orbital` stay OFF ch01's wire |
| Q2 | the book's own key terms with no glossary row | **house-style rows:** `line-bond structure → strikamynd` · `bond angle → tengjahorn` · `bond length → tengjalengd` · `condensed structure`, `condensed formula → þéttformúla` |
| Q3 | `shell → hvolf` on ch01's `--glossary-only` subset | **yes** |
| Q4 | how ch01 runs | **by hand**, not through the chemistry autorun driver; the loop's "a red fidelity manifest is a stop" is read **per chapter** (0 `unexplained` rows for ch01's modules) |
| Q5 | the ch01 text buy | **authorised** once Q1–Q3 are in place |

## Reasoning

### Q1 — `atóm`, applied per book, not through house style
The lead's standing preference was already *"atóm, at least for now"* (2026-08-12 record), and chemistry resolves `atom → atóm` through a **book-level preference**. Organic's export still resolves `atom → frumeind` (measured by hand on the committed export), and published organic ch03, bought with that row on the wire, has `frumeind` in 45 of 667 IS segments against `atóm` in 1. Unprompted, the model writes `frumeind` in only 9% of chemistry segments (audit, 135 of 1,500), so keeping `atom` **off** the wire yields `atóm` without any row. A house-style row was rejected because it is global to the `chemistry` domain and reaches 5 of the 6 books' fallback chains; the ruling is about one book.

### Q2 — four rows, one of them two deliberate overrides
All four heads are the book's own key terms with **no** glossary row, so each wins by being the only candidate. Evidence is from committed MT, re-counted by hand on 2026-09-23:
- **`line-bond structure`** — 35 ch01 segments; unprimed renderings split four ways (línutengibygging 5, strikamynd 3, línubygging 2, línustriksformúla 1). `strikamynd` is attested and is the only one in the ruled *-mynd* family (Lewis-mynd, vokmynd; the model's own beinagrindarmynd).
- **`bond angle`, `bond length`** — [USER] chose the **plural genitive** *tengja-* ("the angle between bonds"). The committed MT writes the singular — `tengihorn-` 34 times, `tengilengd-` 11 of 15 aligned chemistry segments — and the *tengja-* forms **zero** times. This is therefore a deliberate override of a form the model already produces, the same shape as the 2026-09-21 `trigonal planar` ruling, and it is recorded that way in the row's `why`.
- **`condensed structure` / `condensed formula`** — one concept under two English spellings. Unprimed chemistry MT splits `þétt-` (þéttformúl- 6, þéttiformúl- 4) against `þjappað-` 5; `þéttformúla` is the most frequent attested spelling.

### Q3 — `shell` is genuinely undecided without a row
The model writes hvolf 58 / hvel 21 / skel 13 over 109 chemistry segments, and hvolf dominates only where a chapter was primed by `subshell → undirhvolf`. `hvolf` is an existing approved row, so no deploy is needed.

### Q4 — the chemistry driver cannot run an organic chapter
It would stop *after paying* at the figure step (organic has no artwork source; see the text-before-figures exception), stop again on the book-level manifest (`green` requires every one of 342 modules injected), and it never runs `exercise-assemble`. Register §C188 owns making it organic-capable.

### What was checked against the tree, and what was not
Checked by hand: the tool defect that made the computed subset unusable (`compute-glossary-subset.js` ranks over `alignedEn || fullEn`), the segment counts (586 total; `atom` 103, `valence` 26, `hybrid orbital` 25), the `atóm` precedent, organic's `atom` row and ch03's renderings, the rendering counts above, and that every new head is present in organic's source-English census. Taken from the audit without re-measurement: the 9% unprompted `frumeind` rate and the `shell` split.

## Consequences

- **ch01's `--glossary-only` subset** is the audited list plus Q3 and Q2's heads: `enthalpy, enthalpy change, hybridization, hybrid orbital, Lewis structure, lone pair, molecular formula, orbital, shell, line-bond structure, bond angle, bond length, condensed structure, condensed formula`. Q2's heads reach the wire only after merge → deploy → boot (migration 051) → cron export → pull; `--glossary-only` refuses a head the pulled export lacks.
- **Chemistry is affected too.** Every Q2 head except `line-bond structure` occurs in chemistry's English, so they enter chemistry's export; its already-bought chapters keep the singular `tengi-` forms and the `þjappað-`/other `þétt-` spellings until an editor substitution or a re-buy. Editor QA will flag them — that is the ruling taking effect.
- **The plural forms are untested on the wire.** Compliance with a form the model never produces may be partial; count `tengja-` against `tengi-` after ch01's buy.
- **`atom` needs an organic book-preference row** (an editor action on prod) before editors open ch01; the buy does not wait for it, because editors are held off ch01 until its figures land. Published organic ch03 then needs an editor substitution `frumeind → atóm`.
- **Reversible** by editing `server/lib/houseStyleTerms.js` and redeploying (migration 051 re-asserts the file on every boot), at the cost of whatever was bought under the old form.

## Alternatives considered

1. **Buy with `--no-glossary`** — rejected: it drops four existing [USER] rulings ch01 uses (hybridization, hybrid orbital, Lewis structure, lone pair).
2. **Use the tool's computed 5-term subset** — rejected: it was ranked over the already-translated 35% of segments, proposed `valence → girðitala` (which means coordination number) and dropped three rulings (register §C186).
3. **Leave the key terms to editors** — rejected: [USER]'s standing feedback is one buy per chapter, with terms found before the buy.
4. **The singular `tengihorn` / `tengilengd`** that the model writes unprompted — [USER] chose the plural.
5. **`atom → frumeind`** (organic's current export) — rejected in favour of the standing `atóm` preference.
