# Whole-book stale-structure analysis (efnafraedi-2e) — 2026-07-07

**Trigger:** the "flip order+F8 gates warn→hard" task (chemistry clean-slate). Investigating why
the order gate still flags 39 modules on `main` uncovered that the flags are real reader-facing
reading-order corruption, root-caused to **stale `structure.json`**. This doc is the whole-book
quantification.

## The core finding

**All 148 committed `structure.json` files date to 2026-03; zero from July.** They predate every
**extraction-stage** fix merged in July: F1 (section-order, #219), OC-A/OC-C (#225), OC-B (#226),
OC-E (#227). Because those are *extraction* fixes, they only take effect on **re-extract** — but
**WS5 (#237) re-*injected* from the March `structure.json`**, so it shipped only the inject/render
-stage fixes (OC-B table translation, RC1 glossary, WS4 math labels). **The extract-stage fixes
never reached the data or the published HTML.** The tag-count fidelity check ("149/0/0") is
order-blind, so nothing flagged it; the order check that *would* have was left warn-only.

Reader-visible consequence (confirmed live + Fable-adjudicated on m68702): in ~22 modules a nested
`<section>` is emitted **before** its parent section's own intro paragraphs — a student meets
"…is *also* useful" / "*Finally*…" before the concept is introduced. See
`docs/audit/2026-07-06-ws5-residual-example-corruption-diagnosis.md` for the render-side (b) fixes
that were shipped; this is the separate, larger extract-side gap.

## Scope — whole-book re-extract-and-diff (149 modules; re-extracted, categorized, reverted)

Fix method = re-extract (regenerates `structure.json` with the July fixes) → re-inject (reuses the
**existing** translations, matched by stable segment ID; injection is marker-format-agnostic) →
re-render. **Verified end-to-end on m68702: order fixed, Icelandic content preserved, 0 marker
residue — re-MT-free.**

Categorization criterion = **does the segment ID set change?** IDs stable → existing translations
(and any editor edits) map by ID → inject works → **re-MT-free & edit-safe**. IDs change
(segments split/added/removed) → some segments unmapped → **needs re-MT**. (Comparing EN segment
*text* is unreliable — re-extract modernizes marker syntax `{{i}}`→`[[i:]]`, `[#x]`→`[[xref:x]]`,
but the English is byte-identical, copied from immutable `01-source`.)

| Category | Count | Action |
|---|---|---|
| **already-current** (structure unchanged) | 15 | none |
| **re-MT-free** (structure/marker change, seg IDs stable) | **128** | re-extract → re-inject (existing translations) → re-render. Edit-safe. |
| **re-MT** (seg ID set changes) | **6** | needs re-MT → fold into Track B4 with signature-(a)/RC3/RC4. Edit-UNSAFE. |

**The 6 re-MT modules:** `m68764` (ch10), `m68770` (ch10), `m68789` (ch12), `m68791` (ch12),
`m68793` (ch12), `m68829` (ch18). (m68789/m68793 are the signature-(a) list-double-record family;
m68770 also had the `uppleyst→leyst` term mutation already logged.)

### Per chapter [current | re-MT-free | re-MT]

```
appendices: 3 | 10 | 0      ch06: 0 | 6 | 0      ch13: 1 | 4 | 0
ch00:       1 | 0  | 0      ch07: 0 | 7 | 0      ch14: 0 | 8 | 0
ch01:       3 | 4  | 0      ch08: 0 | 5 | 0      ch15: 0 | 4 | 0
ch02:       2 | 6  | 0      ch09: 0 | 7 | 0      ch16: 0 | 5 | 0
ch03:       1 | 4  | 0      ch10: 0 | 5 | 2      ch17: 0 | 8 | 0
ch04:       0 | 6  | 0      ch11: 0 | 6 | 0      ch18: 0 | 12| 1
ch05:       2 | 2  | 0      ch12: 2 | 3 | 3      ch19: 0 | 4 | 0
                            ch20: 0 | 5 | 0      ch21: 0 | 7 | 0
```

## Editing safety (answers the lead's 2026-07-06 question)

The lead is editing **ch3** and holding off opening more chapters until sure edits won't need redo.
- **ch3 = 1 current + 4 re-MT-free, 0 re-MT → entirely edit-safe.** A structure-fix re-extract keeps
  ch3's segment IDs, so edits (keyed by ID) survive.
- Book-wide, the **only** edit-unsafe modules are the **6 re-MT** ones (ch10/12/18).
- **Safest sequence:** run the re-MT-free structure fix (128 modules) *first*, then open chapters
  on the corrected/stable base — zero redo risk, and it mirrors the "B4-before-review" rule in
  `docs/decisions/2026-07-06-re-mt-vs-editor-fixes-and-openstax-remerge.md`.

## Recommended endgame ("clean efnafraedi", corrected)

1. **Book-wide re-extract → re-inject → re-render** the 128 re-MT-free modules. Finally applies
   F1/OC-A/B/E/OC-E to the *data*; fixes the ~22 nested-section scrambles + residual order/id bugs.
   Re-MT-free, edit-safe. Then order gate drops toward 0 → its warn→hard flip becomes real.
   WS5 should have re-*extracted*, not just re-injected — this is the missing step.
2. **The 6 re-MT modules** → Track B4 (re-extract + re-MT), with signature-(a)/RC3/RC4.
3. **Then** broad Pass-1 editing + biology onboarding.

Gate note: after step 1, re-triage the order check (expect near-0), then flip warn→hard. F8 math
(11 modules) is a separate axis (WS4 substitution coverage) — triage independently; several of its
flags are the same stale/(a) modules.
