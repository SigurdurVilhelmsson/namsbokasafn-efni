# Math-label overlay model — design (WS4 refinement)

**Date:** 2026-07-05
**Supersedes/extends:** `docs/superpowers/specs/2026-07-04-ws4-math-label-inventory-design.md`
(the inventory tool + its position-aware amendment). This spec refines the *model* the
tool and the (planned) substitution share.

**Origin:** surfaced while the lead filled `math-label-map.json`. Two flaws in the
original model came out: (1) the ≤6-char cap was a **hard gate** but is really a **style
preference** that wrongly blocked full-word labels; (2) labels with no accepted Icelandic
term needed a **pending** state that renders English now but is revisitable and
auto-replaced when the glossary gains a term. Design settled in a brainstorming pass with
the lead.

---

## Model decision (locked): Option A — a math-rendering overlay over the glossary

`math-label-map.json` is reframed as a **math-rendering overlay**, composed over the
chemistry glossary at substitution time. It is NOT folded into the glossary (Option C was
rejected: not all math labels are terminology — incidental sample-exercise words like
`pancakes`, `elephant`, `rebar` are not glossary terms — and a rendering-only field on
~1,100 glossary terms + a terminology-manager UI change is a one-way commitment). Option A
keeps clean separation of concerns (glossary = terminology; overlay = math-rendering) and
preserves the A→C migration path.

**C-migration trigger (documented, not built):** migrate the overlay into the glossary
(add a `labelForm` field; substitution reads the glossary; delete the overlay) when *both*
hold: the terminology manager owns label editing, **and** the incidental-sample-word share
stays below ~10% across ≥3 books. Until then the overlay owns math-rendering concerns.

## The three-state model & resolution precedence

Every math label is in exactly one state, determined by its overlay value:

| state | overlay value | renders | auto-replaces from glossary? |
|-------|---------------|---------|------------------------------|
| **Translated** | Icelandic (≠ English) | the Icelandic | n/a — overlay wins |
| **Final-English** | == English (self-map) | English | **No** — decided to keep English (e.g. international units `ppm`, `psi`, `amu`, `bar`) |
| **Pending** | empty / absent | English (via glossary term if one exists, else the English word) | **Yes** — upgrades the moment a glossary term appears |

Substitution resolves a label by this precedence (the **substitution contract**, item 5):

```
resolve(label):
  1. overlay[label] is Icelandic (non-empty, ≠ English)  → use it
  2. overlay[label] == English (self-map)                → use English, STOP
  3. overlay[label] empty / absent (PENDING):
       glossary[label] has an approved term  → use it   (auto-replacement)
       else                                  → keep the English word
```

Key consequences:
- **Empty is safe** — it never substitutes an empty string (that was the old deletion
  risk); it falls through to the glossary, else keeps English. So empty = pending, not an
  error.
- **Self-map is a real signal**, not a hack: empty and self-map both render English but
  mean different things (undecided-auto-replace vs decided-keep). This gives the
  never-replace opt-out for international units without any new schema field.
- **Incidental sample-words live in the overlay** as translated values
  (`pancakes`→`pönnukökur`), never in the glossary.

## Validation reclassification

The tool stops conflating *style* and *incompleteness* with *correctness*. Only
correctness hard-fails.

| rule | classification | rationale |
|------|----------------|-----------|
| value contains `< > & " '` | **HARD fail** (exit 1) | genuinely corrupts MathML — the only true correctness break |
| value length > 6, **subscript-class only** | **advisory warning** | full/sample words legitimately run long; warn only where compaction matters (a subscript); inline length is expected → no warning (noise) |
| value contains whitespace | **advisory warning** | multi-word values (`fast efni`) are valid XML and render fine — lead allowed them |
| value empty / absent | **informational (pending)** | safe fallback; surfaced as "N pending," never blocks |

`--validate` exits **0** when there are no charset violations, and **always prints** (even
on a green run — a warning nobody sees is worse than none):
- **warnings** — subscript-class values > 6 chars, and any multi-word values, each labelled;
- **a pending summary** — count + list of labels currently rendering English, split into
  pending (empty) vs final-English (self-map).

## Pending tracking & glossary auto-replacement

Auto-replacement reuses the pipeline that already exists — no new sync tool, no map
re-editing:

```
editor adds/approves a term in the terminology manager (server, terminologyService)
  → export-terminology + tools/merge-glossary.js regenerate glossary-unified.json (committed)
  → next inject: substitution resolves pending labels → glossary approved term → 03-translated
  → WS5 re-render/sync → readers
```

A pending label upgrades on the next re-inject after its term lands in the glossary.

**`--pending` report** (new inventory-tool mode) — the revisit work-list per book:
- **pending (empty)** — the terminology work-list (will auto-upgrade);
- **final-English (self-map)** — shown for reference, not nagged.

This report is the concrete "available for manual editing (1st pass)" artifact. Each Pass-1
decision goes into the glossary (auto-flows to the label) or, when a compact subscript form
is needed, into the overlay.

**Subscript-length loop closure (part of item 5's contract):** when the glossary-fallback
fills a **subscript-class** pending label with a term > 6 chars, substitution **uses it and
emits the length advisory** ("glossary term X is N chars in a subscript; consider a compact
overlay override"). A long Icelandic subscript beats an untranslated English one for the
reader; the overlay stays the escape hatch for tightening it.

## Scope decomposition

**Built now (this spec → one implementation plan):**
1. **Validation reclassification** — `validateValue(value, { enforceLength })` becomes
   charset-hard / length-advisory / whitespace-advisory; `validateMap` returns
   `{ hard: [], warnings: [], pending: [] }` (or equivalent) rather than a single failure
   list; the CLI exits 0 unless a hard (charset) violation exists, and always prints
   warnings + the pending summary.
2. **Three-state semantics** — define empty = pending and self-map = final-English in the
   tool's reporting/validation (map file format unchanged: `{ english: icelandic }`).
3. **`--pending` report mode.**
4. **Lead's data transfer** — move the 133 reviewed choices from
   `books/efnafraedi-2e/math-label-erlendur-review.md` (the glossary-IS column) into
   `math-label-map.json`, and split the 17 kept-English into **self-map/final**
   (`ppm`, `psi`, `amu`, `bar`, and any other genuinely-international) vs **empty/pending**
   (`sub`, `con`, `dep`, `eff`, `ele`, `frz`, `tet`, `iii`, and similar no-context
   abbreviations). Verified by a green `--validate`.

**Specified here, built as the separate WS4-substitution PR (item 5):**
5. **Glossary-aware substitution at inject** — implements the resolution precedence above,
   the subscript-length advisory on glossary-fills, and a loud unmapped-label report
   (mirrors the C3 loud-seam). Separate PR: touches inject, reaches readers only via WS5.

**Documented, not built:** the C-migration trigger (above).

## Testing

Unit tests (build-now items 1–3):
- `validateValue`: `'a<b'` → hard reason; `'uppgufun'` (8 cp) with `enforceLength:true`
  (subscript) → **warning, not fail**; same value with `enforceLength:false` (inline) →
  no warning; `'fast efni'` → whitespace warning, not fail; `''` → pending, not fail.
- `validateMap` / CLI: exits 0 with charset-clean input even when warnings + pending exist;
  exits 1 only on a charset violation; the printed output includes the subscript-length
  warnings, whitespace warnings, and the pending vs final-English split.
- `--pending` report: given a map with translated + self-map + empty entries, the report
  lists the empties under pending and the self-maps under final-English, and omits
  translated ones.
- Data transfer (item 4): after transfer, `--validate` exits 0; a spot-check asserts a
  known final-English (`ppm`→`ppm`) and a known pending (`sub` empty) landed correctly.

Test gate: local `npm test` from the repo root. One PR off `main` for items 1–4.

## Out-of-scope finds

Log any discovered issues to the register in
`docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md` and to memory, per the
batch-triage convention.
