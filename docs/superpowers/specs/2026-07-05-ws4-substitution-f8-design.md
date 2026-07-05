# WS4 item 5 — math-label substitution at inject + F8 math-content check — design

**Date:** 2026-07-05
**Builds on:** `docs/superpowers/specs/2026-07-05-math-label-overlay-model-design.md`
(the locked overlay model, three-state resolution precedence, and validation
reclassification — build-now items 1–4, already done: the map is filled and
`--validate`-green). This spec covers the two remaining WS4 pieces the 07-05
spec deferred: **item 5** (glossary-aware substitution at inject) and **F8**
(the math-content fidelity check that makes math edits visible).

**Scope:** one PR off `main`. Reaches readers only via a later WS5 re-render/sync.

---

## Problem

Two gaps remain after the overlay model landed:

1. **English math labels still ship.** Chemistry equations carry English
   subscript labels and inline content-words (`rate`, `cell`, `surr`, `sys`,
   `cathode`, `vap`, …) inside `[[MATH:N]]`-protected regions. The Málstaður API
   never sees them (they are protected), so they stay English in the output.
   The filled overlay `books/efnafraedi-2e/math-label-map.json` exists but is
   never *consumed* — nothing substitutes at inject.

2. **Math is a blind spot in the only fidelity oracle.** `cnxml-fidelity-check.js`
   strips `<m:math>…</m:math>` to `<m:math/>` before counting tags
   (`countTags`, line 44), so any change to math content — intended (a label
   substitution) or accidental (a dropped `<m:mrow>`, a corrupted formula) — is
   invisible. WS4's whole point is to *edit* math, and the check can't see it.

---

## Architecture: one shared resolver, two importers

The load-bearing decision. A new pure lib:

```
tools/lib/math-label-substitute.js
  resolve(label, { overlay, glossary })      → Icelandic | English (the label)
  substituteMathLabels(mathml, resolver)      → mathml' (byte-minimal)
  buildResolver({ overlay, glossary })        → (label) => resolved  (cached lookups)
```

**Both** consumers import the *same* functions:

- `cnxml-inject.js` (item 5) — **mutates**: substitutes labels in each equation
  at emit.
- `cnxml-fidelity-check.js` (F8) — **compares**: runs the identical
  `substituteMathLabels` on the *source* side, then compares to the translated
  math on disk.

If inject and F8 ever resolved a label differently by even one edge case, F8
would false-positive forever. There is exactly one implementation.

**Boundary rationale:** kept separate from `tools/lib/math-label-inventory.js`
(which owns *discovery/validation/reporting* of the map) because substitution is
a distinct concern (mutating output vs. auditing the map) with a different
consumer set. `math-label-substitute.js` imports `collectMathTokens` from the
inventory lib for the advisory pass (below) — one-way dependency, no cycle.

### `resolve(label)` — the locked precedence (from the 07-05 spec)

```
resolve(label):
  1. overlay[label] is Icelandic (non-empty, ≠ label)  → use it
  2. overlay[label] === label (self-map)               → use English, STOP
  3. overlay[label] empty / absent (PENDING):
       glossary approved term for `label`  → use it   (auto-replacement)
       else                                → keep the English word
```

- **Empty is safe** — never substitutes an empty string; falls through to the
  glossary, else keeps English. Empty = pending, not an error.
- **Self-map is a real signal** — renders English *and* opts out of
  auto-replacement (international units `ppm`/`psi`/`amu`/`bar`).
- **Glossary lookup is filtered** — only `status === 'approved'` terms with a
  non-empty `icelandic` (`t.icelandic?.trim()`). This mirrors the known
  Málstaður empty-`targetWord` bug class: the glossary has ~330 empty-Icelandic
  terms; an unfiltered lookup would substitute a blank. Lookup is a
  `Map<englishLower, icelandic>` built once per book.

---

## Item 5 — substitution at inject

### Mutation = byte-minimal regex, one seam

Applied once at the equations load seam (`cnxml-inject.js:3520`, where
`equations` is read from `02-structure/…/<module>-equations.json`). All four
`eq.mathml` emit sites (lines 1112, 1114, 3205, 3238) then render the substituted
form. No emit site hashes, dedups, or compares `eq.mathml` by byte-identity
(verified), so mutating the loaded `equations` object is safe.

```
/(<m:m(?:text|i)\b[^>]*>)([^<]*)(<\/m:m(?:text|i)>)/g
```

For each match: take the captured inner text, `.trim()`, resolve it. Replace the
inner text **only when the trimmed content exactly equals a resolvable key**.

**Whole-node exact match, never substring.** `<m:mtext>14.82 g carbon</m:mtext>`
trims to `"14.82 g carbon"` — not a key — so it is untouched. Only a bare
`<m:mtext>carbon</m:mtext>` matches. Substring replacement would corrupt phrases
(`carbon` inside `14.82 g carbon`) and formulae. This mirrors exactly how the map
was built: `collectMathTokens` + `bucketToken` only inventory bare all-lowercase
≥3-char tokens.

- `[^<]*` guarantees no match on a node containing child elements (labels are
  pure leaf text).
- Whitespace: match on trimmed content; replace the trimmed core, preserving any
  leading/trailing whitespace in the node.
- **OV-M2:** the substituted value is charset-asserted at emit (no `< > & " '`),
  including self-maps — a self-map must not short-circuit the charset check. The
  overlay is already `--validate`-clean, so this is a fail-loud belt-and-braces
  assertion, not expected to fire.

DOM mutation is rejected: re-serialization reflows attribute order and
whitespace, destroying the source parity that F8 and OpenStax remerge depend on.

### Analysis = DOM, for the advisory + unmapped report

A second, read-only pass per module using `collectMathTokens` (DOM — gives
`position`/`klass`, which the regex cannot):

- **Subscript-length advisory** — when a *glossary-fallback* fills a
  **subscript-class** pending label with a term > 6 chars, substitution uses it
  and emits an advisory: "glossary term X is N chars in a subscript; consider a
  compact overlay override." A long Icelandic subscript still beats an
  untranslated English one; the overlay stays the escape hatch.
- **Loud unmapped-label report** — any bucket-1 label token present in the math
  but absent from the overlay is reported loudly (mirrors the C3 loud-seam
  convention). Should be empty for efnafraedi-2e (the map is complete), but the
  guard travels to future books.

A test asserts the regex pass and the DOM pass **agree on the token set** for
real modules — a guard, not an assumption.

**OV-M1:** while touching the tool, reword the stale `renderReport` help text in
`math-label-inventory.js` (it still describes the old ≤6-mandatory / blank-deletes
model; the current model is length-advisory + empty-is-pending).

---

## F8 — math-content fidelity check

### Semantics

Replace the `<m:math/>` strip in `cnxml-fidelity-check.js` with a per-`<m:math>`-block
comparison:

> **F8 = does `substituteMathLabels(source_math)` equal the corresponding
> `translated_math` on disk?** — the *same* substitute function, run on the
> source side.

Extract the ordered sequence of `<m:math>…</m:math>` blocks from both source and
translated CNXML; for each source block, run `substituteMathLabels`; compare to
the translated block at the same position. Report the count of mismatched
blocks (and which module).

**Why a direct string compare, no hash/normalizer:** both sides pass through
identical code, and extraction stores MathML verbatim, so absent any real
corruption the two strings are byte-equal. Intended substitutions cancel (both
sides carry them). The reverse-map ambiguity (`rate`/`speed`→`hraði`) never
arises because we forward-substitute the source, never reverse the translated.
(A hash is optional future sugar for compact reporting; equality is the check.)

### What F8 catches — and does not

- **Catches:** math dropped/reordered/corrupted between source and translated by
  anything *other* than the intended substitution — a lost `<m:mrow>`, a mangled
  formula, entity damage, an equation that went stale vs. its source.
- **Does NOT catch:** a bug *inside* `substituteMathLabels` — both reference and
  actual would be wrong in the same way. **Unit tests on the substitute function
  are the substitution-correctness oracle; F8 is the "math survived inject /
  isn't stale" oracle.** Two guards, different jobs. This is stated so no one
  later assumes F8 proves the substitution is right.

### Routing = warn-only until WS5

F8 does **not** affect the exit code, exactly like the existing order check
(`orderMismatchModules`). Reported on its own summary line and per-module.

Rationale: pre-WS5 the committed `03-translated/` is stale English (no
substitution applied yet), so F8 mismatches on every label — pure noise until
WS5 re-injects. This is the identical staging used for F1 / OC-A / OC-B: build
the mechanism now, flip to hard-gate after WS5 re-inject. The flip is explicitly
out of scope here.

F8 makes `cnxml-fidelity-check.js` load the overlay map + glossary per book (new
per-book deps) — same shape as the allowlist it already loads per book. A
glossary that advanced since the last inject will correctly surface as a warn:
that is the pending/auto-replacement model working, not a false positive.

---

## Testing

Unit tests (the real correctness oracle for substitution):

- `resolve`: translated overlay wins; self-map → English, no glossary hit;
  empty + approved glossary term → term; empty + empty-Icelandic glossary term →
  English (filter proof); empty + no glossary term → English.
- `substituteMathLabels`: `<m:mtext>rate</m:mtext>` → `hraði`;
  `<m:mtext>14.82 g carbon</m:mtext>` untouched (whole-node, not substring);
  `<m:mi>k</m:mi>` untouched (2-letter, not bucket-1); node with child elements
  untouched; charset-clean output (OV-M2 assertion path).
- Regex-vs-DOM token-set agreement on ≥1 real module fixture.
- Subscript-length advisory fires on a glossary-fill > 6 chars in a
  subscript-class slot; does not fire inline.
- F8 compare fn: `substitute(source) === translated` → match; a hand-corrupted
  translated block → mismatch; a stale (English) translated block → mismatch
  (the pre-WS5 warn case).
- F8 is warn-only: a mismatch does not change the process exit code.

Test gate: local `npm test` from the repo root (no branch protection — the local
gate is authoritative). One PR off `main`. Fable-5 final review at the end (real
spend — confirm with lead before launching).

---

## Out of scope

- Filling the 7 pending labels (`con`/`dep`/`eff`/`ele`/`frz`/`sub`/`tet`) —
  pending→English is *designed* behavior; those auto-flow from the glossary
  later. Item 5 only consumes the map.
- Flipping F8 (or the order check) to hard-gate — post-WS5, after re-inject.
- WS5 re-render/sync — the step that actually delivers substituted math to
  readers on namsbokasafn.is.
- The A→C overlay-into-glossary migration (documented trigger in the 07-05 spec).

## Out-of-scope finds

Log any discovered issues to the register in
`docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md` and to
memory, per the batch-triage convention.
