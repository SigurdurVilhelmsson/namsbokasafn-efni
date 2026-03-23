# Emphasis Fidelity Fixes — Nested Bracket Bug + Hybrid Marker Support

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two injection bugs that cause ~14+ of the 81 fidelity discrepancies, then re-run the pipeline to establish a new baseline.

**Architecture:** Two targeted fixes to `reverseInlineMarkup()` in `cnxml-inject.js`: (1) replace the broken `[^\]]+` regex for bracket markers with an innermost-first loop using `[^\[\]]+` that resolves nested brackets in either direction (`[[sup:[[i:x]]]]` and `[[i:[[sub:p]]]]`), (2) add a regex for the hybrid `{{i:text}}` marker format. Then re-inject and re-check affected modules. Optionally normalize nested emphasis in the fidelity counter.

**Tech Stack:** Vitest, cnxml-inject.js, cnxml-fidelity-check.js, repair-emphasis.js

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `tools/cnxml-inject.js` | Modify (lines 1061-1096) | Innermost-first bracket loop; add `{{i:text}}` regex; update `hasApiMarkers` |
| `tools/__tests__/cnxml-inject.test.js` | Modify (append after line 511) | Add tests for nested brackets (both directions), hybrid markers |
| `tools/cnxml-fidelity-check.js` | Modify (lines 32-43) | Optional: normalize nested emphasis before counting |
| `books/efnafraedi-2e/translation-errors.json` | Regenerated | Auto-updated by re-injection pipeline |

---

## The Nested Bracket Problem

The `[^\]]+` character class in `reverseInlineMarkup` can't handle nested bracket markers. Two real nesting patterns exist in the data:

| Pattern | Example | Meaning | Occurrences |
|---------|---------|---------|-------------|
| sub/sup wrapping emphasis | `[[sup:[[i:x]]−1]]` | x^(italic x − 1) | ~7 (rate laws, exponents) |
| emphasis wrapping sub/sup | `[[i:[[sub:s]]]]` | italic subscript-s (σ_s orbital) | ~10 (molecular orbital notation) |

Simple reordering (emphasis first OR sub/sup first) only fixes one direction while breaking the other. The correct fix is **innermost-first resolution**: use `[^\[\]]+` to match only leaf-level markers (content with no brackets), then loop until all nesting layers are resolved.

**Trace — `[[sup:[[i:x]]−1]]`:**
- Iteration 1: `[[i:x]]` matches (leaf — content `x` has no brackets) → `<emphasis effect="italics">x</emphasis>`. Result: `[[sup:<emphasis effect="italics">x</emphasis>−1]]`
- Iteration 2: `[[sup:...]]` matches (content has no brackets) → `<sup><emphasis effect="italics">x</emphasis>−1</sup>` ✓

**Trace — `[[i:[[sub:p]]]]`:**
- Iteration 1: `[[sub:p]]` matches (leaf — content `p` has no brackets) → `<sub>p</sub>`. Result: `[[i:<sub>p</sub>]]`
- Iteration 2: `[[i:...]]` matches (content has no brackets) → `<emphasis effect="italics"><sub>p</sub></emphasis>` ✓

---

### Task 1: Test nested bracket bug (RED)

**Files:**
- Modify: `tools/__tests__/cnxml-inject.test.js` (append after line 511)

- [ ] **Step 1: Write failing tests for nested bracket markers**

Add to `tools/__tests__/cnxml-inject.test.js` after line 511 (end of file):

```js
// ─── Nested bracket markers (both nesting directions) ─────────────

describe('reverseInlineMarkup nested bracket markers', () => {
  const emptyEq = {};

  // Direction 1: sub/sup wrapping emphasis (rate laws, exponents)
  it('should handle [[sup:[[i:x]]−1]] — emphasis inside superscript', () => {
    const result = reverseInlineMarkup('rate = k[[sup:[[i:x]]−1]]', emptyEq);
    expect(result).toContain('<sup><emphasis effect="italics">x</emphasis>−1</sup>');
    expect(result).not.toContain('[[i:');
    expect(result).not.toContain('[[sup:');
  });

  it('should handle [[sub:[[i:t]]]] — emphasis inside subscript', () => {
    const result = reverseInlineMarkup('Tíminn er [[sub:[[i:t]]]]', emptyEq);
    expect(result).toContain('<sub><emphasis effect="italics">t</emphasis></sub>');
  });

  it('should handle [[sup:[[b:x]]2]] — bold inside superscript', () => {
    const result = reverseInlineMarkup('gildi [[sup:[[b:x]]2]]', emptyEq);
    expect(result).toContain('<sup><emphasis effect="bold">x</emphasis>2</sup>');
  });

  // Direction 2: emphasis wrapping sub/sup (molecular orbital notation)
  it('should handle [[i:[[sub:s]]]] — subscript inside emphasis', () => {
    const result = reverseInlineMarkup('σ[[i:[[sub:s]]]]', emptyEq);
    expect(result).toContain('<emphasis effect="italics"><sub>s</sub></emphasis>');
    expect(result).not.toContain('[[sub:');
    expect(result).not.toContain('[[i:');
  });

  it('should handle [[i:[[sub:p]]]] — subscript inside emphasis (p orbital)', () => {
    const result = reverseInlineMarkup('σ[[i:[[sub:p]]]]', emptyEq);
    expect(result).toContain('<emphasis effect="italics"><sub>p</sub></emphasis>');
  });

  it('should handle [[b:[[sup:2]]]] — superscript inside bold', () => {
    const result = reverseInlineMarkup('x[[b:[[sup:2]]]]', emptyEq);
    expect(result).toContain('<emphasis effect="bold"><sup>2</sup></emphasis>');
  });

  // Adjacent (non-nested) — should still work
  it('should handle adjacent [[i:q]][[sub:in]] — emphasis then subscript', () => {
    const result = reverseInlineMarkup('[[i:q]][[sub:in]]', emptyEq);
    expect(result).toContain('<emphasis effect="italics">q</emphasis>');
    expect(result).toContain('<sub>in</sub>');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tools/__tests__/cnxml-inject.test.js --reporter=verbose 2>&1 | tail -25`

Expected: At least 2 tests FAIL — `[[sup:[[i:x]]−1]]` (direction 1) and `[[i:[[sub:s]]]]` (direction 2). The current `[^\]]+` regex can't handle either nested pattern.

- [ ] **Step 3: Commit failing tests**

```bash
git add tools/__tests__/cnxml-inject.test.js
git commit -m "test: add failing tests for nested bracket markers in reverseInlineMarkup

Tests both nesting directions: sub/sup wrapping emphasis ([[sup:[[i:x]]]])
and emphasis wrapping sub/sup ([[i:[[sub:p]]]]). Both fail with the
current [^\\]]+ regex."
```

---

### Task 2: Fix nested bracket bug with innermost-first loop (GREEN)

**Files:**
- Modify: `tools/cnxml-inject.js` (lines 1061-1096)

The fix: replace the three separate conversion blocks (sub/sup then emphasis) with a single `while` loop that processes **leaf-level** bracket markers first (using `[^\[\]]+` which excludes both `[` and `]`), then repeats until all nesting layers are resolved.

- [ ] **Step 4: Replace bracket marker conversion with innermost-first loop**

In `tools/cnxml-inject.js`, replace the block from line 1061 (`// Restore API-safe [[sub:content]]`) through line 1095 (end of `{{i}}...{{/i}}` conversion) with:

```js
  // ── Bracket markers: innermost-first resolution ───────────────────
  // Nested bracket markers like [[sup:[[i:x]]−1]] and [[i:[[sub:p]]]]
  // require processing from the inside out. Each iteration converts
  // leaf-level markers (content with no [ or ] chars). After conversion,
  // outer markers become leaf-level for the next iteration.
  // Typically resolves in 1-2 iterations (max nesting depth + 1).
  let bracketChanged = true;
  while (bracketChanged) {
    const before = result;

    // Leaf-level emphasis: [[i:text]] and [[b:text]] where text has no brackets
    result = result.replace(/\[\[i:([^\[\]]+)\]\]/g, '<emphasis effect="italics">$1</emphasis>');
    result = result.replace(/\[\[b:([^\[\]]+)\]\]/g, '<emphasis effect="bold">$1</emphasis>');

    // Leaf-level sub/sup: [[sub:content]] and [[sup:content]] where content has no brackets.
    // Inner legacy {{i}}/{{b}} handled for backward compat with older segments.
    result = result.replace(/\[\[sub:([^\[\]]+)\]\]/g, (match, content) => {
      const inner = content
        .replace(/\{\{b\}\}([\s\S]*?)\{\{\/b\}\}/g, '<emphasis effect="bold">$1</emphasis>')
        .replace(/\{\{i\}\}([\s\S]*?)\{\{\/i\}\}/g, '<emphasis effect="italics">$1</emphasis>');
      return `<sub>${inner}</sub>`;
    });
    result = result.replace(/\[\[sup:([^\[\]]+)\]\]/g, (match, content) => {
      const inner = content
        .replace(/\{\{b\}\}([\s\S]*?)\{\{\/b\}\}/g, '<emphasis effect="bold">$1</emphasis>')
        .replace(/\{\{i\}\}([\s\S]*?)\{\{\/i\}\}/g, '<emphasis effect="italics">$1</emphasis>');
      return `<sup>${inner}</sup>`;
    });

    bracketChanged = result !== before;
  }

  // Restore API-safe {{i}}text{{/i}} and {{b}}text{{/b}} emphasis markers to CNXML.
  // Legacy paired marker format — kept for backward compatibility.
  // (Runs after bracket loop since bracket content may contain legacy markers)
  result = result.replace(
    /\{\{b\}\}([\s\S]*?)\{\{\/b\}\}/g,
    '<emphasis effect="bold">$1</emphasis>'
  );
  result = result.replace(
    /\{\{i\}\}([\s\S]*?)\{\{\/i\}\}/g,
    '<emphasis effect="italics">$1</emphasis>'
  );
```

**Key differences from original:**
- `[^\]]+` → `[^\[\]]+` (excludes both `[` and `]`, matching only leaf-level content)
- All four bracket regexes (i, b, sub, sup) inside one `while` loop
- Inner `[[i:]]/[[b:]]` handlers removed from sub/sup callbacks (handled by the loop)
- Legacy `{{i}}/{{b}}` paired handlers remain both inside sub/sup callbacks AND after the loop

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tools/__tests__/cnxml-inject.test.js --reporter=verbose 2>&1 | tail -30`

Expected: ALL tests pass — the 7 new nested bracket tests AND all existing tests (including the existing sub/sup + emphasis tests at lines 280-298).

- [ ] **Step 6: Run full test suite to check for regressions**

Run: `npm test 2>&1 | tail -20`

Expected: All 724+ tests pass. No regressions.

- [ ] **Step 7: Commit the fix**

```bash
git add tools/cnxml-inject.js
git commit -m "fix(inject): innermost-first loop for nested bracket markers

Replaces the broken [^\\]]+ regex with a [^\\[\\]]+ loop that resolves
nested bracket markers from the inside out. Fixes both nesting directions:
[[sup:[[i:x]]−1]] (sub/sup wrapping emphasis) and [[i:[[sub:p]]]]
(emphasis wrapping sub/sup). Typically completes in 1-2 iterations."
```

---

### Task 3: Test hybrid `{{i:text}}` format (RED)

**Files:**
- Modify: `tools/__tests__/cnxml-inject.test.js` (append)

The bug: The Málstaður API occasionally converts `[[i:text]]` to `{{i:text}}` (a hybrid format that matches neither the bracket nor legacy paired regex). Confirmed in m68799: 6 occurrences, all lost.

- [ ] **Step 8: Write failing tests for hybrid marker format**

Append to `tools/__tests__/cnxml-inject.test.js`:

```js
// ─── Hybrid {{i:text}} marker format ─────────────────────────────

describe('reverseInlineMarkup hybrid {{i:text}} markers', () => {
  const emptyEq = {};

  it('should convert {{i:text}} to emphasis', () => {
    const result = reverseInlineMarkup('Þetta er {{i:röskun}} fyrirbæri', emptyEq);
    expect(result).toContain('<emphasis effect="italics">röskun</emphasis>');
  });

  it('should convert {{b:text}} to bold emphasis', () => {
    const result = reverseInlineMarkup('Þetta er {{b:mikilvægt}} efni', emptyEq);
    expect(result).toContain('<emphasis effect="bold">mikilvægt</emphasis>');
  });

  it('should convert hybrid alongside other API markers', () => {
    const input = '{{term}}efnafræði{{/term}} og {{i:tilfærsla}} í jafnvægi';
    const result = reverseInlineMarkup(input, emptyEq);
    expect(result).toContain('<term>efnafræði</term>');
    expect(result).toContain('<emphasis effect="italics">tilfærsla</emphasis>');
  });

  it('should handle hybrid marker with long phrase', () => {
    const input = '{{i:ef jafnvægiskerfi er raskað mun kerfið gangast undir tilfærslu}}';
    const result = reverseInlineMarkup(input, emptyEq);
    expect(result).toContain('<emphasis effect="italics">ef jafnvægiskerfi er raskað');
  });
});
```

- [ ] **Step 9: Run tests to verify they fail**

Run: `npx vitest run tools/__tests__/cnxml-inject.test.js --reporter=verbose 2>&1 | grep -E 'FAIL|PASS|hybrid'`

Expected: 4 new hybrid tests FAIL.

- [ ] **Step 10: Commit failing tests**

```bash
git add tools/__tests__/cnxml-inject.test.js
git commit -m "test: add failing tests for hybrid {{i:text}} marker format"
```

---

### Task 4: Fix hybrid marker format + update API marker guard (GREEN)

**Files:**
- Modify: `tools/cnxml-inject.js` (2 locations)

- [ ] **Step 11: Add hybrid marker regex and update hasApiMarkers**

In `tools/cnxml-inject.js`, make two changes:

**Change A — Update `hasApiMarkers` (line ~999):**

Replace the existing `hasApiMarkers` regex:
```js
  const hasApiMarkers = /\{\{[ib]\}\}|\{\{term\}\}|\{\{fn\}\}|\[\[sub:|\[\[sup:|\[\[i:|\[\[b:/.test(
    text
  );
```

With (adds `\{\{[ib]:` to detect hybrid format):
```js
  const hasApiMarkers = /\{\{[ib]\}\}|\{\{[ib]:|\{\{term\}\}|\{\{fn\}\}|\[\[sub:|\[\[sup:|\[\[i:|\[\[b:/.test(
    text
  );
```

**Change B — Add hybrid regex after the bracket loop and legacy paired conversion:**

Find the legacy paired conversion block (from Task 2's edit):
```js
  result = result.replace(
    /\{\{i\}\}([\s\S]*?)\{\{\/i\}\}/g,
    '<emphasis effect="italics">$1</emphasis>'
  );
```

Add immediately after:
```js

  // Handle hybrid {{i:text}} format — API occasionally converts [[brackets]]
  // to {{braces}}. Same self-contained pattern, different delimiters.
  result = result.replace(/\{\{i:([^}]+)\}\}/g, '<emphasis effect="italics">$1</emphasis>');
  result = result.replace(/\{\{b:([^}]+)\}\}/g, '<emphasis effect="bold">$1</emphasis>');
```

- [ ] **Step 12: Run tests to verify they pass**

Run: `npx vitest run tools/__tests__/cnxml-inject.test.js --reporter=verbose 2>&1 | tail -30`

Expected: ALL tests pass (nested bracket + hybrid + all existing).

- [ ] **Step 13: Run full test suite**

Run: `npm test 2>&1 | tail -20`

Expected: All tests pass.

- [ ] **Step 14: Commit the fix**

```bash
git add tools/cnxml-inject.js
git commit -m "fix(inject): handle hybrid {{i:text}} marker format from API

The Málstaður API occasionally converts [[i:text]] bracket markers to
{{i:text}} brace markers. This hybrid format matched neither the bracket
regex nor the legacy {{i}}text{{/i}} paired regex, causing emphasis loss.
Also updates hasApiMarkers guard to detect the hybrid format."
```

---

### Task 5: Re-inject affected modules and verify

**Files:**
- Regenerated: `books/efnafraedi-2e/03-translated/mt-preview/` (multiple chapters)
- Regenerated: `books/efnafraedi-2e/translation-errors.json`

- [ ] **Step 15: Re-inject the full book**

Run: `node tools/cnxml-inject.js --book efnafraedi-2e 2>&1 | tail -30`

This re-injects all 148 modules with the fixed `reverseInlineMarkup`.

- [ ] **Step 16: Run fidelity check and capture new baseline**

Run: `node tools/cnxml-fidelity-check.js --book efnafraedi-2e 2>&1 | tail -40`

Record the new counts:
- How many PERFECT modules? (was 116)
- How many total discrepancies? (was 81)
- Which modules changed?

- [ ] **Step 17: Run repair-emphasis on the whole book**

Run: `node tools/repair-emphasis.js --book efnafraedi-2e 2>&1 | tail -20`

This applies existing emphasis repair (fidelity-capped) on the fresh injection output.

- [ ] **Step 18: Run fidelity check again after repair**

Run: `node tools/cnxml-fidelity-check.js --book efnafraedi-2e 2>&1 | tail -40`

Record final baseline. Compare to starting point (116 PERFECT / 81 discrepancies).

- [ ] **Step 19: Commit re-injected content**

```bash
git add books/efnafraedi-2e/03-translated/ books/efnafraedi-2e/translation-errors.json
git commit -m "chore: re-inject full book with nested bracket + hybrid marker fixes

Baseline: [N] PERFECT / [M] discrepancies (was 116 / 81)"
```

---

### Task 6 (Optional): Normalize nested emphasis in fidelity counter

**Files:**
- Modify: `tools/cnxml-fidelity-check.js` (lines 32-43)

The source CNXML for m68778 and m68813 contains `<emphasis><emphasis>x</emphasis></emphasis>` (double-nested). These count as 2 source tags but the translation produces 1 (flattened). Since they render identically, normalizing before counting makes the comparison accurate.

Only pursue this if m68778 is still showing discrepancies after Task 5.

- [ ] **Step 20: Add nested emphasis normalization to countTags**

In `tools/cnxml-fidelity-check.js`, in the `countTags` function (line 32), add normalization after the MathML strip:

```js
function countTags(cnxml) {
  // Strip MathML blocks before counting — they are preserved as-is
  // and contain m:math, m:mrow, m:mo etc. that inflate counts
  let normalized = cnxml.replace(/<m:math[\s\S]*?<\/m:math>/g, '<m:math/>');
  // Collapse nested emphasis of same type: <emphasis X><emphasis X> → <emphasis X>
  // OpenStax source occasionally has redundant nesting that flattens during translation.
  // Renders identically — not a real fidelity difference.
  normalized = normalized.replace(
    /<emphasis([^>]*)><emphasis\1>/g,
    '<emphasis$1>'
  );
  normalized = normalized.replace(/<\/emphasis><\/emphasis>/g, '</emphasis>');
  const counts = new Map();
  const matches = normalized.matchAll(/<([a-zA-Z][a-zA-Z0-9:]*?)[\s>/]/g);
  for (const m of matches) {
    const tag = m[1];
    counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  return counts;
}
```

- [ ] **Step 21: Run fidelity check to verify m68778 improves**

Run: `node tools/cnxml-fidelity-check.js --book efnafraedi-2e --module m68778 2>&1`

Expected: m68778 now shows PERFECT (0 discrepancies).

- [ ] **Step 22: Run full fidelity check and update errors**

Run: `node tools/cnxml-fidelity-check.js --book efnafraedi-2e 2>&1 | tail -20`

Then update translation-errors.json:

Run: `node -e "import { updateTranslationErrors } from './tools/lib/update-translation-errors.js'; const r = updateTranslationErrors('books/efnafraedi-2e'); console.log(r);" 2>&1`

- [ ] **Step 23: Commit counter normalization**

```bash
git add tools/cnxml-fidelity-check.js books/efnafraedi-2e/translation-errors.json
git commit -m "fix(fidelity): normalize nested emphasis before counting

OpenStax source has <emphasis><emphasis>x</emphasis></emphasis> in some
modules (m68778, m68813). These render identically to single emphasis
but inflated the discrepancy count."
```

---

## Actual Outcome (2026-03-23)

**Status: COMPLETE**

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| PERFECT modules | 116 / 148 | 116 / 148 | m68799 fixed (+1), m68778 normalized (+1), 2 MT link losses exposed (-2) |
| Total discrepancies | 81 | 72 | **-9** |

**Commits:**
- `744871a2` test: failing tests for nested bracket markers
- `18645fd8` fix: innermost-first loop for nested bracket markers
- `4837ad2c` test: failing tests for hybrid markers
- `58c12e95` fix: hybrid `{{i:text}}` marker format
- `88ee5e7a` chore: re-inject full book
- `fef47a59` fix: normalize nested emphasis in fidelity counter

**Key findings during execution:**
- The hybrid `{{i:text}}` fix recovered m68799 (6 emphasis, now PERFECT)
- The nested bracket loop is a defensive fix — current MT output doesn't heavily trigger it, but it prevents future regressions
- Re-injection exposed 3 pre-existing MT link losses (m68818, m68823, m68854) where the Málstaður API dropped `[[docref:]]` markers — these are MT quality issues, not code regressions
- Nested emphasis normalization recovered m68778 (6 emphasis, now PERFECT in the counter)

## What This Does NOT Fix (deferred)

- **Emphasis overcounting** (m68727 +12, etc.): Needs source-aware emphasis budget — evaluate separately.
- **Structural item/list loss** (m68739): Needs extraction-level changes.
- **Link losses from MT** (m68818, m68823, m68854): Need re-translation or API marker survival improvements.
- **Remaining small emphasis losses**: Some in stripped elements (tables in exercises), some potentially recoverable via repair-emphasis.js v2.
