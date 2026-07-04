# WS4 — Math-label inventory tool (design)

**Date:** 2026-07-04
**Workstream:** WS4 (math-embedded English labels), clean-slate chemistry track
**Scope of this item:** the **inventory tool only** — the read-only scan + validate
round-trip that produces a `math-label-map.json` skeleton for the lead to fill with
Icelandic. The inject-side **substitution** and the **F8 math-content hash** are
separate later items that *consume* the filled map; they are out of scope here.

Parent spec: `docs/plans/2026-07-01-chemistry-clean-slate-design.md` § WS4.

---

## Problem

Descriptive English subscript labels live *inside* equations (`<m:mtext>` / `<m:mi>`
text nodes) — e.g. `rate`, `cell`, `surr`, `sys`, `vap`, `cathode`, `mass`, `change`.
Because they are wrapped in `[[MATH:N]]` protection at extract, the translation API
never sees them, so they render (and read aloud via assistive MathML) in English.

The chemistry source has ~19,000 `<m:mtext>` and ~10,700 `<m:mi>` nodes. The genuine
translatable labels are a small island among look-alikes:

- **Real labels (targets):** `rate`(64), `mol`(208, → Icelandic `mól`), `cell`(50),
  `vap`(19), `surr`(17), `sys`(16), `mass`(15), `volume`(13), `cathode`(13),
  `solution`(12), `density`(12), `change`(12), `anode`(12), `water`(11), `univ`(11),
  `molecules`(10), `and`(11), …
- **Chemical formulae (never touch):** `MnO`, `HCl`, `CaCO`, `AgCl`, `NaCl`, `pOH` — all
  carry uppercase element symbols.
- **Units — mostly keep, but some localize:** `atm`, `torr`, `ppb`, `kPa`, `kJ` stay as
  is; but `mol` localizes to `mól`. All are all-lowercase, so **not** separable from real
  labels by casing — and even a "unit" may be a translatable label. Whether a given unit
  localizes is a chemistry-domain human call, which is exactly why these surface for the
  lead to decide rather than being auto-kept.
- **Math functions:** `log`, `ln`, `rms` — all-lowercase too.
- **Operators / single chars:** `−`, `Δ`, `°`, `/`, and single-letter variables (`k`, `P`).

No heuristic can perfectly separate "keep" from "translate" — `atm` (keeps) and `rate`
(→ `hraði`) look identical to a regex, and `mol` (→ `mól`) shows even a unit may localize.
That separation is intrinsically a **chemistry-domain human decision** (the lead is a
chemistry teacher). The tool's job is therefore to **surface
candidates with enough context to decide, without silently hiding any real label** — a
hidden label is a silent, reader-visible loss at render, the exact failure WS4 exists to
prevent.

## Non-goals

- No substitution of labels into CNXML (that is the inject-side item).
- No math-content hashing / fidelity-check change (that is F8).
- No writing under `books/*/01-source/` (read-only; scanning only).
- No AI-generated Icelandic — the lead supplies every value by hand.

## Interface

New file `tools/inventory-math-labels.js`. Mirrors `analyze-order-causes.js`
conventions: `parseArgs` / `BOOK_OPTION` / `requireBook` from `tools/lib/parseArgs.js`;
`REPO_ROOT` resolved via `import.meta.url` (never `process.cwd()`).

```
node tools/inventory-math-labels.js --book efnafraedi-2e            # generate
node tools/inventory-math-labels.js --book efnafraedi-2e --validate # check filled map
```

`--book` is required (`requireBook`). The tool is book-parameterized so it is reusable
for biology and the other books later; this item runs it for `efnafraedi-2e`.

## Generate mode — data flow

1. Discover every `books/<book>/01-source/**/*.cnxml` (read-only).
2. Collect every `<m:mtext>` and `<m:mi>` text node with:
   - its exact text content,
   - an occurrence count across the book,
   - one **best-effort readable context**: the concatenated math-text tokens of the
     enclosing expression (e.g. `Δ H vap`) plus the module id it first appears in.
3. **Bucket each distinct token:**
   - **Bucket 1 — likely labels:** all-lowercase, ≥3 ASCII letters, and **not** in a
     curated units/functions stoplist (`atm, torr, ppb, kPa, kJ, log, ln, exp, sin, cos,
     tan, …` — seeded from observed content, extensible as a `const`). Note `mol` is
     **not** stoplisted: it localizes to `mól`, so it must reach the lead as a Bucket-1
     fill slot. The stoplist holds only units/functions confirmed to stay unchanged.
   - **Bucket 2 — also review:** everything else — contains any uppercase (formula-like:
     `MnO`, `HCl`, `pOH`), fewer than 3 letters, non-alphabetic operators, or a
     stoplisted unit/function.
4. Write two artifacts under `books/<book>/`:
   - **`math-label-inventory.md`** — the ranked two-bucket report: Bucket 1 listed first
     (token · count · context · empty fill slot), Bucket 2 listed after (compact), and
     the Icelandic-value constraints stated inline. This is the lead's reference while
     filling the map.
   - **`math-label-map.json`** — a skeleton object: Bucket-1 tokens as keys, values `""`
     (empty string = unfilled). This is the file the lead edits and the file the later
     inject item consumes.

### Bucketing rule (precise)

A distinct token `t` goes to **Bucket 1** iff *all* hold:

- `t` matches `^[a-z]{3,}$` (all-lowercase ASCII, length ≥ 3), **and**
- `t` is not in the units/functions stoplist.

Otherwise `t` goes to **Bucket 2**. The stoplist only *reranks* — Bucket 2 is fully
printed in the report, so a mis-tuned stoplist can misrank a token but can never hide
it. If the lead spots a real label in Bucket 2 (e.g. a 2-letter state symbol, or a
unit that *should* be localized), they add it to `math-label-map.json` by hand; §
"Non-destructive regeneration" guarantees a re-run preserves it.

## Non-destructive regeneration (robustness)

If `math-label-map.json` already exists when generate runs, the tool **merges — it never
clobbers**:

- keep every existing key's value (filled or empty),
- add any newly-discovered Bucket-1 key with value `""`,
- **report** (to stdout, not delete) any existing key no longer found in source, so the
  lead decides whether to remove it.

This makes re-running after new content lands safe, and it is what lets a hand-added
Bucket-2 label survive regeneration.

## Validate mode

`--validate` re-reads the filled `math-label-map.json` and **fails loud (exit 1)** on any
value violating the design's Icelandic-label rules. For each violating entry it prints
`✗ 'key' → 'value' : <reason>`; on a clean map it prints a success line and exits 0.

Rules (from the parent spec § WS4):

| Rule | Violation |
|------|-----------|
| Non-empty | value is `""` → *empty (use self-map to keep English)* |
| Length ≤ 6 chars | value longer than 6 characters |
| Single token | value contains whitespace |
| Charset | value contains any of `< > & " '` |

A **self-map** (`surr` → `surr`) is valid and means "decided: keep the English label as
is." An empty value is **not** valid — empty is the "not yet reviewed" state, and letting
it pass would silently delete the label from the equation at render. This deliberate
two-state distinction (`""` = undecided vs `x`→`x` = decided-keep) prevents an
un-reviewed label from passing as if it were intentional.

The 6-character cap is a hard cap (labels render at small subscript size; a longer label
reflows the equation). Case is left to the lead; Icelandic letters (`á é í ó ú ý ð þ æ ö`)
are allowed — only the XML-special characters above are forbidden.

## Artifacts (locations)

Both files live under `books/<book>/`, alongside the book's other committed config
(`embed-mapping.json`, book-rendering config): the map because the inject item reads it
there; the report alongside it for discoverability while filling.

- `books/efnafraedi-2e/math-label-map.json` — filled by lead, consumed by inject (later item)
- `books/efnafraedi-2e/math-label-inventory.md` — generated reference report

## Implementation approach

**Regex scan, not DOM parse.** We only need text-node contents + counts + a light
enclosing-context string; there is no structural editing here (that belongs to the
inject item). A scoped regex over `<m:mtext>…</m:mtext>` and `<m:mi>…</m:mi>` is simpler
and faster than instantiating xmldom for ~30k nodes. Pure, testable helpers:

- `collectMathTokens(cnxml)` → `[{ text, context }]` for one file
- `bucketToken(text, stoplist)` → `'label' | 'other'`
- `aggregate(files)` → `{ bucket1: Map<text,{count,context}>, bucket2: … }`
- `mergeSkeleton(existingMap, bucket1)` → `{ merged, addedKeys, orphanKeys }`
- `validateValue(value)` → `null | reason` and `validateMap(map)` → `violations[]`

The CLI `main()` wires these; the helpers are exported for unit tests.

## Testing (TDD)

Unit tests on the pure helpers (no filesystem needed for the core logic):

- **bucketer:** `rate`, `surr`, `and`, `vap`, `mol` → Bucket 1 (`mol` localizes to `mól`,
  so it must NOT be stoplisted); `atm`, `MnO`, `pOH`, `−`, `k` → Bucket 2.
- **validator:** rejects `""` (empty), `bakskaut` (8 > 6), `a b` (space), `x<` (special);
  accepts `surr`→`surr` (self-map) and `hraði` (5 chars, Icelandic letters).
- **merge:** existing filled value preserved; a new source token added with `""`; a key
  absent from source reported as orphan (not dropped).
- A small fixture-CNXML integration test that `collectMathTokens` pulls `rate`/`vap` with
  a readable context and ignores non-math text.

## Test gate

Local `npm test` from the repo root (no branch protection — the local gate is
authoritative). One PR off `main`.

## Out-of-scope finds

Log any discovered issues to the register in
`docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md` and to memory, per
the batch-triage convention — do not fix inline.

---

## Amendment 2026-07-04 — position-aware length cap (post-smoke-run)

The first smoke run on `efnafraedi-2e` produced **133 Bucket-1 keys**, far more than the
"~15–25 subscript labels" the original design assumed. Inspection showed the scan
faithfully surfaces **two populations** of English-inside-math, and the single `≤6`
length rule fits only one of them:

1. **Subscript labels** (`mol`, `rate`, `cell`, `vap`, `surr`, `sys`, `cathode`, `rxn`,
   `fus`…) — render as small subscripts, so a compact Icelandic form (`≤6` chars) is
   genuinely required; a longer value reflows the equation.
2. **Inline content-words in word-equations / annotations** (`pancakes`, `sunlight`,
   `graphite`, `diamond`, `glucose`, `electrolysis`, `catalyst`, `density`, `mass`,
   `volume`…) — full words in the body of an expression. A faithful Icelandic edition
   should translate these, but their Icelandic exceeds 6 chars
   (`pancakes`→`pönnukökur`=10) — the `≤6` **hard cap would wrongly reject them.**

There is **no frequency or regex discriminator** between the two (real subscript labels
sit at low counts — `fus`(5), `rxn`(5); content-words sit high — `mass`(15),
`density`(12)), so filtering is rejected — it would hide real low-count labels, exactly
the silent loss the two-bucket design forbids. **Lead decision (2026-07-04): make the cap
position-aware** — keep all tokens, enforce `≤6` **only** where the token renders as a
subscript.

### Position rule (requires DOM)

A token occurrence is **`script`** (subscript/superscript position) iff its node descends
from the **≥2nd element-child** of an `m:msub` / `m:msup` / `m:msubsup` ancestor (child
index 0 is the base; index ≥1 is a script slot). Otherwise it is **`body`**. This needs a
parsed tree — a flat regex cannot see structural role through the common `<m:mrow>`
wrapping and nesting. The tool therefore parses each source file with `@xmldom/xmldom`
(already a project dependency, used by `tools/lib/cnxml-dom.js`); `xmlns:m` is declared on
the CNXML root so prefixes resolve. `collectMathTokens` moves from regex to DOM and
returns `{ text, context, position }` per occurrence. `decodeEntities` stays exported (DOM
`textContent` is already entity-decoded, so `collectMathTokens` no longer needs it, but it
remains a tested utility).

### Per-key classification

A distinct token is classified **`subscript`** if **any** of its occurrences is in
`script` position (conservative — a too-long value would reflow wherever it *is* a
subscript), else **`inline`**. Icelandic is frequently shorter than English
(`solution`→`lausn`=5, `reaction`→`hvarf`=5), so the conservative rule rarely blocks a
real translation; where it genuinely can't fit, abbreviating is the correct outcome for a
subscript anyway. The report shows both position counts so the lead has visibility.

### Validation (position-aware)

`validateValue(value, { enforceLength })`: non-empty, no whitespace, and no `< > & " '`
apply to **all** values; the `≤6` code-point cap applies **only when `enforceLength` is
true** (i.e. the key is `subscript`-class). `validateMap(map, classes)` looks up each
key's class and passes `enforceLength` accordingly. The map file stays a plain
`{ english: icelandic }` object (keys sorted) — position is **re-derived at validate time**
by re-scanning `01-source/` (validate is already book-scoped), so the fill format the lead
edits never carries structural metadata.

### Report (three sections)

`renderReport` splits Bucket 1 into two ranked tables — **Subscript labels (`≤6`
enforced)** and **Inline content-words (no length cap)** — followed by the unchanged
**Also review** (Bucket 2) list. Each subscript/inline row shows count and current value;
the constraints block states the cap applies to subscript labels only.

### Additional hardening (lead-directed, this branch)

`--validate`'s `JSON.parse` of the hand-edited map is wrapped so a JSON typo yields a
clean `ERROR: <path> is not valid JSON: <message>` (exit 1) instead of a raw stack trace —
the lead hand-edits 133 values and runs `--validate` to check them, so the friendly error
lands exactly in the path they lean on.
