# Linguistic Fidelity Check + Orverufraedi Ch01 Re-translation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a tool that detects untranslated English text in translated CNXML, re-translate orverufraedi ch01 with the extraction fix, and scan all translated chapters.

**Architecture:** Compare text nodes between source and translated CNXML — identical non-trivial text = untranslated. Follows the same CLI pattern, discovery loop, and output formatting as `tools/cnxml-fidelity-check.js`. No external dependencies.

**Tech Stack:** Node.js ES modules, Vitest, existing `parseArgs` CLI helpers

---

## File Structure

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `tools/cnxml-linguistic-check.js` | Core tool: extract text nodes, compare source vs translated, report untranslated content |
| Create | `tools/__tests__/cnxml-linguistic-check.test.js` | Unit tests for `findUntranslatedText()` |
| Modify | `tools/cnxml-fidelity-check.js` | No changes needed (structural check remains independent) |

---

### Task 1: Build `cnxml-linguistic-check.js` — core function

**Files:**
- Create: `tools/__tests__/cnxml-linguistic-check.test.js`
- Create: `tools/cnxml-linguistic-check.js`

**Core function signature:**
```javascript
/**
 * Compare text content between source and translated CNXML.
 * Returns array of { text, tag, id, context } for untranslated blocks.
 */
function findUntranslatedText(sourceCnxml, translatedCnxml, options = {})
```

**Algorithm:**
1. Pre-process both CNXML strings: strip `<metadata>...</metadata>` blocks and `<m:math>...</m:math>` blocks (replace with empty string)
2. Extract **leaf-level elements** with `id` attributes from both source and translated. Target only: `<para>`, `<item>`, `<caption>`, `<title>` (when parent has id). These elements don't self-nest, so simple non-greedy regex is safe: `/<(para|item|caption)\s+[^>]*?id="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g`
3. For each extracted element, strip all inner XML tags to get plain text content
4. Build maps: `sourceTexts = { id → plainText }` and `translatedTexts = { id → plainText }`
5. For each ID present in both maps, compare text. If identical and longer than `minLength` (default: 15 chars), flag as untranslated
6. Return array of flagged items: `{ id, tag, text, context }`

**Why leaf-level only:** Container elements (note, list, section, document) nest and would require balanced-tag parsing. Leaf elements (para, item, caption) don't self-nest in OpenStax CNXML, so non-greedy regex is reliable. This catches the exact class of bugs we're targeting (untranslated paragraphs, list items, captions).

**Limitation:** `<title>` elements don't have their own `id` attribute (the id is on the parent section/note). These are intentionally excluded from this check — titles are short and typically caught in editorial review.

**Skip rules (legitimate English):**
- Metadata blocks (stripped in pre-processing)
- MathML blocks (stripped in pre-processing)
- Text shorter than `minLength` characters
- Text that is purely numeric, whitespace, or punctuation
- Text matching URL/DOI patterns (`https?://`, `10.\d+/`)

- [ ] **Step 1: Write failing tests for `findUntranslatedText`**

```javascript
import { describe, it, expect } from 'vitest';
import { findUntranslatedText } from '../cnxml-linguistic-check.js';

describe('findUntranslatedText', () => {
  it('returns empty array when all text is translated', () => {
    const source = '<document xmlns="http://cnx.rice.edu/cnxml"><para id="p1">Hello world</para></document>';
    const translated = '<document xmlns="http://cnx.rice.edu/cnxml"><para id="p1">Halló heimur</para></document>';
    expect(findUntranslatedText(source, translated)).toEqual([]);
  });

  it('flags identical text as untranslated', () => {
    const source = '<document xmlns="http://cnx.rice.edu/cnxml"><para id="p1">This text was not translated at all</para></document>';
    const translated = '<document xmlns="http://cnx.rice.edu/cnxml"><para id="p1">This text was not translated at all</para></document>';
    const result = findUntranslatedText(source, translated);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'p1', tag: 'para' });
  });

  it('skips short text below minLength threshold', () => {
    const source = '<document xmlns="http://cnx.rice.edu/cnxml"><para id="p1">Short</para></document>';
    const translated = '<document xmlns="http://cnx.rice.edu/cnxml"><para id="p1">Short</para></document>';
    expect(findUntranslatedText(source, translated)).toEqual([]);
  });

  it('skips metadata blocks entirely', () => {
    const source = '<document xmlns="http://cnx.rice.edu/cnxml"><metadata><md:abstract><para id="abs1">This module introduces chemistry</para></md:abstract></metadata><para id="p1">Translated here ok</para></document>';
    const translated = '<document xmlns="http://cnx.rice.edu/cnxml"><metadata><md:abstract><para id="abs1">This module introduces chemistry</para></md:abstract></metadata><para id="p1">Þýtt hér allt í lagi</para></document>';
    // abs1 is inside metadata — should be skipped even though it has an id and identical text
    expect(findUntranslatedText(source, translated)).toEqual([]);
  });

  it('skips MathML content inside paragraphs', () => {
    const source = '<document xmlns="http://cnx.rice.edu/cnxml"><para id="p1">The equation <m:math><m:mi>x</m:mi><m:mo>=</m:mo><m:mn>5</m:mn></m:math> shows the result</para></document>';
    const translated = '<document xmlns="http://cnx.rice.edu/cnxml"><para id="p1">Jafnan <m:math><m:mi>x</m:mi><m:mo>=</m:mo><m:mn>5</m:mn></m:math> sýnir niðurstöðuna</para></document>';
    // Text differs after MathML stripping, so not flagged
    expect(findUntranslatedText(source, translated)).toEqual([]);
  });

  it('does not flag para whose only content is MathML', () => {
    const source = '<document xmlns="http://cnx.rice.edu/cnxml"><para id="p1"><m:math><m:mrow><m:mi>E</m:mi><m:mo>=</m:mo><m:mi>m</m:mi><m:msup><m:mi>c</m:mi><m:mn>2</m:mn></m:msup></m:mrow></m:math></para></document>';
    const translated = '<document xmlns="http://cnx.rice.edu/cnxml"><para id="p1"><m:math><m:mrow><m:mi>E</m:mi><m:mo>=</m:mo><m:mi>m</m:mi><m:msup><m:mi>c</m:mi><m:mn>2</m:mn></m:msup></m:mrow></m:math></para></document>';
    // After MathML stripping, remaining text is empty — skip
    expect(findUntranslatedText(source, translated)).toEqual([]);
  });

  it('handles list items inside notes', () => {
    const source = `<document xmlns="http://cnx.rice.edu/cnxml">
      <note id="n1"><list id="l1" list-type="bulleted">
        <item id="i1">What are the main types of organisms?</item>
        <item id="i2">Name some characteristics.</item>
      </list></note></document>`;
    const translated = `<document xmlns="http://cnx.rice.edu/cnxml">
      <note id="n1"><list id="l1" list-type="bulleted">
        <item id="i1">What are the main types of organisms?</item>
        <item id="i2">Name some characteristics.</item>
      </list></note></document>`;
    const result = findUntranslatedText(source, translated);
    expect(result).toHaveLength(2);
    expect(result.map(r => r.id)).toContain('i1');
    expect(result.map(r => r.id)).toContain('i2');
  });

  it('respects custom minLength option', () => {
    const source = '<document xmlns="http://cnx.rice.edu/cnxml"><para id="p1">Medium text</para></document>';
    const translated = '<document xmlns="http://cnx.rice.edu/cnxml"><para id="p1">Medium text</para></document>';
    expect(findUntranslatedText(source, translated, { minLength: 5 })).toHaveLength(1);
    expect(findUntranslatedText(source, translated, { minLength: 20 })).toEqual([]);
  });
});
```

Run: `npx vitest run tools/__tests__/cnxml-linguistic-check.test.js`
Expected: FAIL — module not found

- [ ] **Step 2: Implement `findUntranslatedText`**

Key implementation details:
1. Pre-process: strip `<metadata>...</metadata>` and `<m:math>...</m:math>` blocks from both inputs
2. Extract leaf elements with IDs using non-greedy regex per tag type:
   ```javascript
   const LEAF_TAGS = ['para', 'item', 'caption'];
   // For each tag: /<(tag)\s+[^>]*?id="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g
   ```
3. Strip remaining XML tags from extracted content to get plain text: `content.replace(/<[^>]+>/g, '').trim()`
4. Build maps: `{ id → { tag, text } }` for source and translated
5. Compare: for each ID in both maps, flag if text is identical and `text.length >= minLength`
6. Additional skip: text matching URL/DOI patterns, or purely numeric/punctuation

This is leaf-element-only regex — safe because para, item, caption don't self-nest in OpenStax CNXML.

- [ ] **Step 3: Run tests — verify all pass**

Run: `npx vitest run tools/__tests__/cnxml-linguistic-check.test.js`
Expected: All 7 tests PASS

- [ ] **Step 4: Commit**

```bash
git add tools/cnxml-linguistic-check.js tools/__tests__/cnxml-linguistic-check.test.js
git commit -m "feat: add cnxml-linguistic-check core function with tests"
```

---

### Task 2: Add CLI wrapper to `cnxml-linguistic-check.js`

**Files:**
- Modify: `tools/cnxml-linguistic-check.js`

Follow the exact CLI pattern from `cnxml-fidelity-check.js`:
- `parseArgs()` with `BOOK_OPTION`, `CHAPTER_OPTION`, `MODULE_OPTION`
- `--track` option (default: 'mt-preview')
- `-v, --verbose` (show clean modules)
- `--book` (default: 'efnafraedi-2e')
- Discovery loop: chapters → modules → findUntranslatedText()
- Per-module output with untranslated items listed
- Summary with counts
- Exit code 0 (all translated) or 1 (untranslated found)

**Output format:**
```
ch01/m58781: 4 untranslated text block(s)
  item[i1]: "What types of microorganisms would be killed by..."
  item[i2]: "Give two examples of foods that have historically..."
  item[i3]: "Explain how historical understandings of disease..."
  item[i4]: "How did the discovery of microbes change human..."
ch01/m58782: 1 untranslated text block(s)
  item[i1]: "What types of microorganisms could be causing..."

══════════════════════════════════════════════════
Checked: 4 modules
All translated: 1
With untranslated content: 3
Total untranslated blocks: 11
```

- [ ] **Step 1: Add CLI argument parsing and main loop**

Use same helpers: `import { parseArgs, BOOK_OPTION, CHAPTER_OPTION, MODULE_OPTION } from './lib/parseArgs.js'`
Use same discovery: `discoverChapters()`, `discoverModules()` pattern from fidelity-check.

- [ ] **Step 2: Add output formatting and summary**

Truncate displayed text to ~60 chars with ellipsis. Show tag and ID for each flagged item.

- [ ] **Step 3: Test CLI on orverufraedi ch01 (before re-translation)**

Run: `node tools/cnxml-linguistic-check.js --book orverufraedi --chapter 1`
Expected: Exit 1, showing the untranslated list items in m58781, m58782, m58783

- [ ] **Step 4: Commit**

```bash
git add tools/cnxml-linguistic-check.js
git commit -m "feat: add CLI wrapper for linguistic fidelity check"
```

---

### Task 3: Re-translate orverufraedi ch01

**Context:** The extraction fix (processNote list extraction) added 23 new segments. The API translate tool is file-level incremental — since the MT output files already exist, we need `--force` to re-translate.

**Files:**
- No code changes. Pipeline operations only.

- [ ] **Step 1: Dry run to check cost**

Run: `node tools/api-translate.js --book orverufraedi --chapter 1 --force --dry-run`
Expected: Shows 4 modules to translate with character count and cost estimate

- [ ] **Step 2: Run translation**

Run: `node tools/api-translate.js --book orverufraedi --chapter 1 --force`
Expected: 4 modules translated, output written to `books/orverufraedi/02-mt-output/ch01/`

- [ ] **Step 3: Re-inject translated CNXML**

Run: `node tools/cnxml-inject.js --book orverufraedi --chapter 1 --track mt-preview`
Expected: 4 modules injected, translation-errors.json updated

- [ ] **Step 4: Re-render to HTML**

Run: `node tools/cnxml-render.js --book orverufraedi --chapter 1 --track mt-preview`
Expected: HTML files updated in `books/orverufraedi/05-publication/mt-preview/chapters/01/`

- [ ] **Step 5: Run structural fidelity check**

Run: `node tools/cnxml-fidelity-check.js --book orverufraedi --chapter 1 -v`
Expected: Fewer discrepancies than the 34 we saw before (term overproduction fix should help)

- [ ] **Step 6: Run linguistic fidelity check**

Run: `node tools/cnxml-linguistic-check.js --book orverufraedi --chapter 1`
Expected: Exit 0 — no untranslated content (list items now translated)

---

### Task 4: Scan all translated chapters

**Files:**
- No code changes. Diagnostic only.

- [ ] **Step 1: Scan efnafraedi-2e (all 148 modules)**

Run: `node tools/cnxml-linguistic-check.js --book efnafraedi-2e`
Expected: Report of any untranslated text blocks across all 21 chapters + appendices

- [ ] **Step 2: Scan orverufraedi (ch01 + ch05)**

Run: `node tools/cnxml-linguistic-check.js --book orverufraedi`
Expected: ch01 clean (just re-translated), ch05 may have untranslated lists

- [ ] **Step 3: Document findings**

Record the scan results. If untranslated content is found in efnafraedi-2e, those chapters would also need re-extraction → re-translation → re-injection to pick up the newly-extracted list segments.

---

## Verification

1. **Unit tests pass:** `npx vitest run tools/__tests__/cnxml-linguistic-check.test.js`
2. **All existing tests still pass:** `npx vitest run tools/__tests__/cnxml-extract.test.js` and `npx vitest run tools/__tests__/cnxml-fidelity-check.test.js`
3. **CLI produces correct output** on orverufraedi ch01 before and after re-translation
4. **Full scan completes** on both books without errors
5. **Orverufraedi ch01 list items** appear translated in the rendered HTML
