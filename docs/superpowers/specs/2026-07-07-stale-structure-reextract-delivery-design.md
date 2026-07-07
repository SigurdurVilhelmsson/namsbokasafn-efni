# STALE-STRUCT re-extract delivery — design spec

- **Date:** 2026-07-07
- **Status:** Approved (brainstormed + Fable-5 adversarially reviewed)
- **Related:** `docs/audit/2026-07-07-stale-structure-whole-book-analysis.md` (scope),
  `docs/audit/2026-07-06-ws5-residual-example-corruption-diagnosis.md` (render-side (b), shipped),
  `docs/decisions/2026-07-06-re-mt-vs-editor-fixes-and-openstax-remerge.md` (re-MT posture),
  register `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md` (STALE-STRUCT 🔴).

## Problem

All 148 committed `books/efnafraedi-2e/02-structure/*/*-structure.json` date to 2026-03 — they
predate the July **extraction** fixes F1 (#219), OC-A/OC-C (#225), OC-B (#226), OC-E (#227). WS5
(#237) re-*injected* from that stale structure but never re-*extracted*, so the extraction fixes
never reached committed/live CNXML. The order check (`compareElementOrder`,
`tools/cnxml-fidelity-check.js`) flags **39 modules** on `main`; **~22 are live reader-facing
reading-order scrambles** — a nested `<section>` emitted before its parent section's own intro
paragraphs (a student meets "…is *also* useful" / "*Finally*…" before the concept is defined),
Fable-confirmed and structurally verified on m68702. The tag-count fidelity check ("149/0/0") is
order-blind, so nothing flagged it.

## Goal

Deliver the F1/OC-A/B/E/OC-E extraction order-fixes to committed/live content by **re-extracting**
the modules whose structure is stale, **re-injecting** with the existing translations, and
**re-rendering** — fixing the ~22 live scrambles — then **flip the order gate warn→hard**. Do it
with a **mechanical equivalence preflight** that proves each module is content-equivalent (up to
the intended reorder) before injection, so no silent regression ships.

## Scope

- **In:** the **143** modules that are re-MT-free (128 with structure fixes + 15 already-current,
  which still get marker-format-modernized EN files → keep the EN corpus consistent). Both
  publication tracks (mt-preview all chapters; faithful = the reviewed ch1/ch3 modules). Order-gate
  warn→hard flip. Two known glossary-annotation fixes (m68852, m68819).
- **Out (→ Track B4):** the **6 re-MT modules** whose segment ID set changes on re-extract —
  `m68764, m68770, m68789, m68791, m68793, m68829`. They keep their stale structure (stay
  live-buggy, already tracked) until B4 re-extracts + re-MTs them.
- **Out (this delivers order/structure only, NOT inline-marker/link corrections):** the IS
  translations are kept as-is, so extraction fixes encoded in *marker/link syntax* (e.g. m68692's
  appendix-A link still a dead local `target-id` in the IS text) do NOT reach readers here — that
  needs re-MT (B4). Logged as a register follow-up (source↔output link-target parity check).

## Key facts (verified)

- **Criterion:** a module is re-MT-free iff, on re-extract, its **segment ID set is unchanged**
  (existing translations map by ID; injection is marker-format-agnostic and handles legacy `{{ }}`
  + bracket `[[ ]]`). Verified end-to-end on m68702: re-extract → re-inject fixed the order and
  preserved Icelandic content with 0 marker residue.
- **Fable-5 adversarial review (2026-07-07)** re-extracted all 149, re-injected 6 diverse probes,
  and diffed every artifact class. It confirmed the 6 re-MT boundary independently and found that
  "ID-set stable" alone is **insufficient** — three same-ID EN-text drifts exist, one of which is a
  confirmed reader-facing regression:
  - `m68692:para:fs-idm91050016` — local xref promoted to cross-doc docref (m68859); **benign**
    (IS text unchanged; dead local link persists — a non-delivery, not a regression).
  - `m68819:glossary-term` — literal text → captured MathML; **benign improvement**.
  - `m68852:glossary-term:fs-idp72108384-term` — positron notation now captured as `[[MATH:N]]`;
    `annotateInlineTerms` strips math from the EN annotation (`cnxml-inject.js:832`) → the published
    glossary term degrades to a **garbled `(e. positron  or)`**. Order-clean, marker-clean,
    count-stable — **every listed gate waves it through and the golden would enshrine it.**
  - Positional hazards (equations `math-N` map, `inline-attrs` term/footnote id-restore) did **not**
    fire book-wide (all shared keys identical), but the plan must *verify* that, not assume it.

## Design

### D1. Re-extract the 143 (exclude the 6 re-MT)

Re-extract by explicit module (`cnxml-extract.js --module` exists) for the 143, OR re-extract by
chapter then `git restore` the 6 re-MT modules' `02-structure` + `02-for-mt` artifacts. **Assert the
6 re-MT modules' extraction artifacts are byte-unchanged before any commit** (they must stay
March-keyed until B4, or a later inject/editor "Vista + Birta" on them injects new structure against
old IDs → dropped segments).

### D2. 4-part equivalence preflight (the safety gate — NEW, from Fable)

Before injecting, for each of the 143 compare committed vs re-extracted and require **all**:
1. **segment ID-set equality** (the base re-MT-free criterion);
2. **normalized same-ID EN-text equality** — strip/canonicalize markers on both sides (format-
   agnostic: `{{i}}X{{/i}}` ≡ `[[i:X]]`, `[#X]` ≡ `[[xref:X]]`, etc.) then compare. Known exceptions:
   m68692, m68819, m68852 — must be explicitly triaged, not silently passed;
3. **`equations.json` shared-key mapping identity** — every `math-N` key present in both maps to
   byte-identical MathML; report added/removed keys explicitly;
4. **`inline-attrs.json` byte-equality** (positional term/footnote id-restore alignment).
Any module failing (2)–(4) outside the known-exception list **halts the run** for triage. Implement
as a script (`tools/verify-reextract-equivalence.js` or similar) that emits a per-module report.

### D3. Re-inject both tracks

Re-inject the 143 (mt-preview all chapters; faithful = reviewed ch1/ch3 modules) using the new
`structure.json`/`equations.json`/`inline-attrs.json` + the **existing** translations
(`02-mt-output` / `03-faithful-translation`). ch3 (in open editing) is edit-safe: committed
`03-faithful` reflects applied, ID-keyed edits that map to the stable IDs; unapplied server-DB edits
are untouched.

### D4. Fix the two glossary annotations

- **m68852**: fix the garbled `(e. positron  or)` — either correct the segment's annotation, or fix
  `annotateInlineTerms`/F6 math-strip to preserve math notation in EN annotations (prefer the code
  fix if it's contained and general; else a targeted content fix). Confirm the published term reads
  correctly.
- **m68819**: verify the change is the benign improvement (drops a mangled `(δgf°)`); accept.

### D5. Re-render + regenerate goldens/baseline

Re-render the affected modules (both tracks) → `05-publication`. Regenerate render goldens +
`render-fidelity-baseline.json`; diff-review that changes are order/structure fixes + the two
glossary lines only.

### D6. Order-gate warn→hard flip (fingerprint allowlist)

Promote the order check from warn-only to exit-affecting in `cnxml-fidelity-check.js`. The 6 re-MT
modules will still flag — allowlist them by **fingerprint** (moduleId + hash of the moved-id set),
mirroring `fidelity-allowlist.json`'s exact-match design, so a *future new* reorder in those 6 goes
red instead of being masked. Add a regression test. Point the allowlist entries at B4.

### D7. Verification suite (pass/fail bar)

- **Preflight** (D2) green for all 143 (or explicit triaged exceptions).
- **Order check → 0** for the 143 (the 6 remain, allowlisted) — primary proof the fix landed.
- **Per-module EN-residue (A2 scanner) + marker-residue** on all 143 re-injects — catches any
  stranded translation.
- **Postflight whole-book text-node diff** new vs old `03-translated` = "reorders only + the two
  known glossary lines."
- Render goldens diff-reviewed · `npm run fidelity:render` (tag-count) 0 unexplained + baseline regen
  · `assistive-mathml == mjx` count · `[[TABLE:]]`/marker hard-gates (WS5 runbook) · full `npm test`
  from repo root green · byte-diff spot-review of the known nested-section modules (m68702 etc.).

### D8. Delivery

Commit (content + code). Lead runs the Phase-6 sync + prod deploy. Post-deploy spot-check: a
nested-subsection section (e.g. m68702 / ch3 "Massaprósenta") reads intro-para-first; no out-of-order
prose; m68852 glossary term correct.

## Risks / mitigations

| Risk | Mitigation |
|---|---|
| ID-set-stable but content drifts (same-ID EN change) | D2 preflight part 2 + the 3 known exceptions |
| Positional equation/inline-attrs remap | D2 preflight parts 3–4 |
| Clobbering the 6 re-MT modules | D1 explicit exclusion + byte-unchanged assertion |
| Garbled m68852 shipped + golden-locked | D4 fix before goldens regenerate |
| Flip masks future regressions in the 6 | D6 fingerprint allowlist (drift → red) |
| Marker/link fixes assumed delivered | Scope note + register follow-up (link-target parity) |

## Out-of-scope register follow-ups (log during implementation)
- Source↔output **link `target-id`/`document` parity** check (no gate covers it; m68692 dead local
  link is invisible today).
- The 6 re-MT modules + their glossary/annotation edge cases → **Track B4**.
