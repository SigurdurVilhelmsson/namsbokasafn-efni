# Fidelity Fix Prompt — Remaining 141 Discrepancies

**Use this as the opening prompt for a fresh Claude Code session.**

---

## Context

Chemistry 2e (efnafraedi-2e) has 148 modules translated via Málstaður API. After the bracket marker migration (`[[i:text]]`, `[[link:text|url]]`), fidelity stands at **110/148 PERFECT (74%), 141 total discrepancies across 38 modules**.

The error manifest is at `books/efnafraedi-2e/translation-errors.json` (auto-updated after every `cnxml-inject.js` or `repair-emphasis.js` run).

## Your task

Investigate ALL 38 modules with remaining discrepancies. For each discrepancy, determine the root cause, whether it's fixable, and what fix is needed. Then implement the fixes, starting with the highest-impact ones.

**Important:** The remaining issues are NOT from API marker loss (that was solved by the bracket format). They are from structural problems in the injection pipeline itself. Be prepared to consider partial or complete refactoring of injection functions if the regex-based approach has hit its limits.

## Current discrepancy categories

Run `node tools/cnxml-fidelity-check.js --book efnafraedi-2e` for the live data. As of 2026-03-22, the breakdown is:

### 1. Emphasis discrepancies (~50 total across ~25 modules)

**Both overcounting and undercounting.** Root causes to investigate:

- **EN annotation emphasis leakage:** `annotateInlineTerms()` converts `{{i}}` to `<emphasis>` in EN term annotation text. This creates `<emphasis>` tags inside `(e. english term)` annotations, which may not match the source. For overcounting modules (m68735, m68747, m68805, m68813, m68819, m68844, m68860, m68863), check if the overcounted emphasis comes from annotation text.

- **Source doubled emphasis (m68778, -6):** The source CNXML has 6 redundantly nested `<emphasis>` tags. Extraction correctly collapses them. This is not a bug — it's correct normalization. But the fidelity check reports it as a discrepancy. Consider: should the fidelity check account for known source bugs?

- **Residual emphasis loss in modules with large emphasis counts:** m68727 (-16), m68733 (-6), m68789 (-5), m68799 (-6). The `[[i:text]]` markers survived at 100%, so these losses are from emphasis inside elements that the extraction doesn't capture (e.g., emphasis inside notes/examples that are preserved verbatim from original CNXML, or emphasis in glossary definitions that don't round-trip perfectly). Investigate by diffing source vs translated CNXML for each module — where exactly are the missing `<emphasis>` tags?

### 2. Sub/sup overcounting (~40 total across ~10 modules)

The `[[sub:]]`/`[[sup:]]` markers survive at 100%, so overcounting means the translated CNXML has MORE sub/sup than the source. Root causes to investigate:

- **Annotation markup:** When `annotateInlineTerms()` converts `[[sub:2]]` → `<sub>2</sub>` in EN term text, the `(e. h<sub>2</sub>o)` annotation adds sub tags not present in the source CNXML. Worst case: m68837 (+5), m68823 (+4). **Fix option:** strip sub/sup from annotation text instead of converting (annotations are reference hints, not structural content).

- **Injection duplication in examples/exercises:** When `buildExample()` preserves original CNXML (which contains `<sub>` tags) AND the segment text also has `[[sub:]]` markers that get converted, both appear in the output. This is the same root cause as media duplication. Worst case: m68727 (+2), m68813 (+2). **Fix option:** track which sub/sup already exist in preserved CNXML, skip duplicate creation from markers.

### 3. Structural: image/media/list/item/para (~22 total, 2-3 modules)

- **m68739 (ch07):** image +8, media +8, item -5, list -1. This is media duplication from `buildExample()` preserving original CNXML (with `<media>` inside `<item>`) while the segment text also generates `<media>` from `[[MEDIA:N]]` markers. **Fix:** Deduplicate media IDs — after injection, scan for duplicate media IDs and remove the second occurrence.

- **m68710 (ch04):** emphasis -2, item -1, list -1, para -1. This is the nested para issue (`<para>` containing `<list>` containing `<item>` containing `<para>`). The non-greedy regex stops at the inner `</para>`. A depth-aware replacement was attempted and reverted because it destroyed nested content. **Fix:** The correct approach is TEXT-ONLY replacement — replace just the text content of the outer para (before the first nested element) while leaving nested lists/equations intact. This requires parsing the para to identify where the text ends and the nested elements begin.

- **m68764 (ch10):** image +1, media +1, emphasis -1, term +1. Similar media duplication plus annotation side-effects.

### 4. Math loss (5 total, 3 modules)

- m68819: m:math -1, m68823: m:math -2, m68852: m:math -2. The API occasionally drops `[[MATH:N]]` placeholders entirely. The existing `restoreMathMarkers()` function handles most cases but misses some. **Investigate:** Check if the missing math placeholders are in specific segment patterns (long segments, segments with many math placeholders). Check if the IS segments have the math placeholders or if they were lost during translation.

### 5. Link loss (3 total, 3 modules)

- m68818: link -1, m68823: link -1, m68854: link -1. These are cross-document links without `target-id` that weren't fully captured by extraction. **Fix:** Check if the bracket link format `[[docref:]]` now captures these — if the modules were re-translated with the new extraction, the links may already be in bracket format. If not, the extraction may need to handle additional link patterns.

### 6. Title discrepancy (2 total, 2 modules)

- m68826: title -1, m68860: title +1. One title lost, one extra. Investigate the specific title element in each module.

## Approach

1. **Start with annotation side-effects** (category 2 — sub/sup overcounting). This is likely the simplest fix: change the annotation text to strip sub/sup instead of converting them. This should fix ~20 discrepancies across ~8 modules.

2. **Then investigate emphasis discrepancies** (category 1). For each overcounting module, verify the overcounted emphasis comes from annotations. For undercounting, diff the source vs translated CNXML to find exactly where emphasis is missing.

3. **Then tackle structural issues** (category 3). The media deduplication is a contained fix. The nested para issue is harder and may require refactoring `buildExample()` to use an XML parser for para content replacement.

4. **Finally, address math/link/title losses** (categories 4-6). These are small-count, module-specific issues.

## Architecture question

The regex-based approach in `reverseInlineMarkup()` (200+ lines) and `buildExample()`/`buildExercise()` has reached its practical limits. The remaining bugs are all from regex failing on nested/overlapping patterns. Consider:

- **Incremental:** Fix each category with targeted patches (as above). Gets us to maybe 120-130 PERFECT. Some discrepancies may be permanently irreducible.

- **Partial refactor:** Replace `buildExample()` and `buildExercise()` with XML-parser-based functions (using `fast-xml-parser` or `xmldom`). These two functions are the source of all structural issues. The rest of the pipeline (extraction, segment handling, rendering) works fine with regex.

- **Full pipeline refactor:** Parse CNXML into an AST, walk the tree, translate nodes, serialize back. Eliminates all regex failure modes. Major engineering effort (~weeks) but makes the pipeline robust for future books. Only justified if the pipeline will process many more books.

Evaluate the trade-offs based on the actual discrepancy data. The right answer depends on how many discrepancies each approach can fix and what the project's future book pipeline looks like.

## Verification

After any fix:
1. Re-inject affected modules: `node tools/cnxml-inject.js --book efnafraedi-2e --chapter <N>`
2. Check `translation-errors.json` was auto-updated (look at summary line in stdout)
3. Run tests: `npx vitest run tools/__tests__/cnxml-inject.test.js tools/__tests__/cnxml-extract.test.js tools/__tests__/pipeline-integration.test.js`
4. Target: 130+ PERFECT (88%+), <80 total discrepancies

## Files to read first

1. `books/efnafraedi-2e/translation-errors.json` — current error manifest
2. `tools/cnxml-inject.js` — injection pipeline (focus on `reverseInlineMarkup()`, `buildExample()`, `buildExercise()`, `annotateInlineTerms()`)
3. `tools/cnxml-extract.js` — extraction (to understand what markers the segments contain)
4. `tools/cnxml-fidelity-check.js` — how discrepancies are counted
