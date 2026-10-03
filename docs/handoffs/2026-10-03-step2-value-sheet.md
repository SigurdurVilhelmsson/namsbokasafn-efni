# §C140 step 2 — the value sheet for [USER] (labels the recompose pass draws from your wording)

> **Handoff, banner-dated 2026-10-03.** Evidence and a form, never status: status lives in the campaign register
> (§C140 ㊾ and its ⏩ RESUME). It belongs to the step-2 spec
> (`docs/superpowers/specs/2026-10-02-c140-step2-recompose-pass-design.md`, D4 and D5) and is read by PR-B's
> user-input step. Nothing in PR-B's data commits proceeds until every row you want changed has a value.

**Why you, and not the MT or an agent:** these labels never went to the paid MT (the composer holds 2-letter words in
English, so element symbols such as *No*, *In* and *As* stay correct), or the MT returned them wrong. The standing rule
is that translations come from the Málstaður API or from a person, never from an agent. Every Icelandic word below is
**evidence quoted from a committed file**, labelled with where it came from. None of it is a suggestion.

**How to fill it in:** write the value exactly as it should be drawn, including the decimal comma, in the last column
(or reply in chat with row number and value). Leave a row blank to keep it as it is today. Every key was measured
byte-exact on 2026-10-03 (`figure-prepare.py` into a scratch dir; the sidecars for group D). In a key, `|` marks a
line break in the source; the value replaces the WHOLE label.

## A. Plain words (`heldBlockValues`, spec D5(a))

| # | Figure (chapter) | Exact block key | Drawn today | June copy read (EVIDENCE) | Value from [USER] |
|---|---|---|---|---|---|
| A1 | `CNX_Chem_01_02_MattType` (ch01), 3 labels, one key | `No` | `No` ×3 | *Nei* ×3 (`9269fcda8`: the label text `JáNeiJáNeiJáNei`) — **a June regression** | |
| A2 | `CNX_Chem_07_04_HNO2_img` (ch07) | `or` | `or` | `or`, English in June too (`9269fcda8`) | |
| A3 | `CNX_Chem_20_04_amide1_img` (ch20), 2 labels, one key | `R or H` | `R or H` ×2 | English in June too (`34402e8a6`) | |

## B. Labels that carry a formula (`heldBlockValues`; depends on Part 5's design)

⚠️ **Before you write these, know that the value replaces the whole label, formula included.** Whether a supplied value
can keep the subscripts, superscripts and charge signs these labels carry is a design question for PR-A's Part 5, which
is not drafted yet. If formatting cannot be kept, the formula would be drawn flat (for example `O2` instead of O₂). You
may prefer to leave this group in English, as the June copies did.

| # | Figure (chapter) | Exact block key | Drawn today | June copy read (EVIDENCE) | Value from [USER] |
|---|---|---|---|---|---|
| B1 | `CNX_Chem_09_05_MolSpeed1` (ch09) | `02 at T = 300 K` (it begins with the DIGIT zero `0x30`, as the source typed it; drawn as O₂) | `at T = 300 K` after the formula | English in June too (`9269fcda8`) | |
| B2 | `CNX_Chem_14_02_phscale` (ch14), 2 labels, one key | `100 or 1` (the `0` is a superscript: 10⁰ or 1) | `10⁰ or 1` ×2 | English in June too (`34402e8a6`) | |
| B3 | `CNX_Chem_14_06_buffer` (ch14) | `[CH3CO2H] is 11% of [CH3CO2\|–]` (subscripts, and a charge on its own source line) | `[CH₃CO₂H] is 11% of [CH₃CO₂⁻]` | English in June too (`34402e8a6`) | |
| B4 | `CNX_Chem_18_04_OxStNonmts` (ch18) | `4+\|To\|4–` (ONE block over three source lines; the charges are italic) | `4+` / `To` / `4–` stacked | `To`, English in June too (`34402e8a6`) | |
| B5 | `CNX_Chem_18_04_OxStNonmts` (ch18) | `5+\|To\|3–` (as B4) | `5+` / `To` / `3–` stacked | `To`, English in June too | |
| B6 | `CNX_Chem_20_04_amide1_img` (ch20) | `C\|H or R` (two source lines: the carbon, then the substituent) | `C` / `H or R` | English in June too (`34402e8a6`) | |

## C. Units and abbreviations (a policy question first: localise, or keep the English?)

| # | Figure (chapter) | Exact block key(s) | Drawn today | June copy read (EVIDENCE) | Localise? Value from [USER] |
|---|---|---|---|---|---|
| C1 | `CNX_Chem_01_04_MYdCmIn` (ch01) | `1 in. = 2.54 cm` | `1 in. = 2,54 cm` (the composer already localises the decimal) | *1 tomma = 2,54 cm* (`9269fcda8`) — **a June regression**. Its translated siblings today: *1 tomma*, *1 jardi*, *1 sentimetri* | |
| C2 | `CNX_Chem_01_04_MYdCmIn` (ch01) | `1ft`, `2ft`, `3ft` | `1ft` `2ft` `3ft` | `1ft2ft3ft`, English in June too | |
| C3 | `CNX_Chem_06_01_AMFM` (ch06) | `AM`, `FM` | `AM` `FM` | `AMFM`, English in June too (`9269fcda8`) | |

## D. Sidecar value edits (spec D4, route 1: you authorised these two hand edits of paid MT on 2026-10-02)

These are bought translations, changed by VALUE only. The key is never edited: it is content-addressed to what the
read layer extracts. HetCats' key carries the superseded English *absorbed*, because the base-tree EPS it was bought
from says so (figure `REGISTER.md` ⑭), while the 2e figure says *adsorbed*.

| # | Figure (chapter) | Exact block key | Value today (paid MT) | EVIDENCE | Value from [USER] |
|---|---|---|---|---|---|
| D1 | `CNX_Chem_12_07_HetCats-230a` (ch12) | `Ethylene absorbed on \|surface breaking π bonds` | *Eten frásogast á yfirborðið og rýfur π-tengi* | June copy (`34402e8a6`): *Etýlen aðsogað á* / *yfirborð, π‐tengi rofna*. This module's MT caption (b): *Eten er aðsogað á yfirborðið, rýfur C–C π-tengið og myndar Ni–C tengi.*; its MT alt: *Eten aðsogað á yfirborð sem rýfur pí-tengi*; caption (d) uses *frásogast* for **desorb**. The per-label MT arm gave *Etýlen frásogast á yfirborði og rýfur π-tengi* | |
| D2 | `CNX_Chem_12_07_HetCats-230a` (ch12), optional | `Ethylene ` (with a trailing space) | *Eten* | June: *Etýlen*. Per-label MT arm: *Etýlen* | |
| D3 | `CNX_Chem_12_07_HetCats-230a` (ch12), optional | `Ni surface` | *Nikkel yfirborð* | June: *Ni‐yfirborð*. Per-label MT arm: *Ekkert yfirborð* (wrong: "no surface") | |
| D4 | `CNX_Chem_10_05_Graphene` (ch10) | `Buckyball` | `Buckyball` (the MT returned it unchanged) | June copy (`34402e8a6`): *Knattkol (buckyball)* | |

**Not on this sheet, and why:** FoodLabel's `5% or less` is held by a different rule (an undecoded glyph), not the
2-letter rule. Its June copy has no such label, so it is not a June regression. Element symbols and numbers that the
composer keeps (`N`, `O`, `CH2`, `P, As`, the pH scale's numbers, …) are correct as they are.
