# CNXML Fidelity Fixes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix structural discrepancies between source and API-translated CNXML so the pipeline produces structurally faithful output for OpenStax remerge.

**Architecture:** Build a validation tool first, then fix the two confirmed bugs (term overproduction, SEG corruption), then re-validate to measure remaining gaps before fixing them. The term overproduction fix is in `cnxml-inject.js` (the injection regex), and the SEG corruption fix is a post-processing step in `api-translate.js`.

**Tech Stack:** Node.js 24, ES modules, Vitest

**Spec:** `docs/superpowers/specs/2026-03-18-cnxml-fidelity-fixes-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `tools/cnxml-fidelity-check.js` | Create | Validation tool — compares tag structure |
| `tools/__tests__/cnxml-fidelity-check.test.js` | Create | Unit tests for validation tool |
| `tools/cnxml-inject.js` | Modify | Fix term overproduction in reverseInlineMarkup() |
| `tools/api-translate.js` | Modify | Fix SEG tag corruption post-processing |
| `tools/__tests__/pipeline-integration.test.js` | Modify | Regression tests |
| `tools/__tests__/api-translate.test.js` | Modify | SEG repair tests |

---

### Task 1: Build cnxml-fidelity-check.js validation tool

**Files:**
- Create: `tools/cnxml-fidelity-check.js`
- Create: `tools/__tests__/cnxml-fidelity-check.test.js`

- [ ] **Step 1: Write tests for the core comparison function**

```javascript
// tools/__tests__/cnxml-fidelity-check.test.js
import { describe, it, expect } from 'vitest';
import { compareTagCounts } from '../cnxml-fidelity-check.js';

describe('compareTagCounts', () => {
  it('returns empty array for identical tag structure', () => {
    const source = '<document><title>Hello</title><para id="p1">text</para></document>';
    const translated = '<document><title>Hæ</title><para id="p1">texti</para></document>';
    expect(compareTagCounts(source, translated)).toEqual([]);
  });

  it('detects missing elements', () => {
    const source = '<para><emphasis>bold</emphasis><emphasis>italic</emphasis></para>';
    const translated = '<para><emphasis>feitletrað</emphasis></para>';
    const diffs = compareTagCounts(source, translated);
    expect(diffs).toEqual([{ tag: 'emphasis', source: 2, translated: 1, diff: -1 }]);
  });

  it('detects extra elements', () => {
    const source = '<para><term>acid</term></para>';
    const translated = '<para><term>sýra</term><term>efni</term><term>vatn</term></para>';
    const diffs = compareTagCounts(source, translated);
    expect(diffs).toEqual([{ tag: 'term', source: 1, translated: 3, diff: 2 }]);
  });

  it('ignores metadata-only tags', () => {
    const source = '<metadata><md:content-id>m68664</md:content-id></metadata>';
    const translated = '<metadata><md:content-id>m68664</md:content-id></metadata>';
    expect(compareTagCounts(source, translated)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tools/__tests__/cnxml-fidelity-check.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement cnxml-fidelity-check.js**

```javascript
#!/usr/bin/env node
/**
 * cnxml-fidelity-check.js — Compare source vs translated CNXML tag structure
 *
 * Counts opening tags by element name in both files and reports differences.
 * Used to verify that the extract→translate→inject pipeline preserves
 * all CNXML structural elements.
 *
 * Usage:
 *   node tools/cnxml-fidelity-check.js --book efnafraedi-2e --chapter 1
 *   node tools/cnxml-fidelity-check.js --book efnafraedi-2e --chapter 1 --module m68664
 *   node tools/cnxml-fidelity-check.js --book efnafraedi-2e
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseArgs, BOOK_OPTION, CHAPTER_OPTION, MODULE_OPTION } from './lib/parseArgs.js';

let BOOKS_DIR = 'books/efnafraedi-2e';

// Tags to exclude from comparison (metadata, not structural)
const EXCLUDE_TAGS = new Set(['md:content-id', 'md:created', 'md:revised']);

/**
 * Count opening tags by element name in CNXML content.
 * Returns a Map of tagName → count.
 */
function countTags(cnxml) {
  const counts = new Map();
  const matches = cnxml.matchAll(/<([a-zA-Z:]+)[\s>/]/g);
  for (const m of matches) {
    const tag = m[1];
    if (!tag.startsWith('/') && !EXCLUDE_TAGS.has(tag)) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  return counts;
}

/**
 * Compare tag counts between source and translated CNXML.
 * Returns array of { tag, source, translated, diff } for differences.
 */
export function compareTagCounts(sourceCnxml, translatedCnxml) {
  const sourceCounts = countTags(sourceCnxml);
  const translatedCounts = countTags(translatedCnxml);

  const allTags = new Set([...sourceCounts.keys(), ...translatedCounts.keys()]);
  const diffs = [];

  for (const tag of [...allTags].sort()) {
    const s = sourceCounts.get(tag) || 0;
    const t = translatedCounts.get(tag) || 0;
    if (s !== t) {
      diffs.push({ tag, source: s, translated: t, diff: t - s });
    }
  }

  return diffs;
}

// --- CLI (formatChapter, discoverModules, main, printHelp) ---
// Follow the same pattern as api-translate.js: BOOK_OPTION, CHAPTER_OPTION,
// MODULE_OPTION, iterate source vs translated files, report per-module.

function formatChapter(chapter) {
  if (chapter === 'appendices') return 'appendices';
  return `ch${String(chapter).padStart(2, '0')}`;
}

function discoverChapters(bookDir) {
  const sourceDir = path.join(bookDir, '01-source');
  if (!fs.existsSync(sourceDir)) return [];
  return fs.readdirSync(sourceDir)
    .filter(d => d.match(/^ch\d+$/) || d === 'appendices')
    .sort((a, b) => {
      if (a === 'appendices') return 1;
      if (b === 'appendices') return -1;
      return a.localeCompare(b, undefined, { numeric: true });
    });
}

function discoverModules(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.match(/^m\d+\.cnxml$/))
    .sort()
    .map(f => ({ moduleId: f.replace('.cnxml', ''), filename: f }));
}

function printHelp() {
  console.log(`
cnxml-fidelity-check.js — Compare source vs translated CNXML structure

Counts XML elements in source and translated files, reports differences.
Exit code 0 if identical, 1 if discrepancies found.

Usage:
  node tools/cnxml-fidelity-check.js --book <slug> --chapter <num>
  node tools/cnxml-fidelity-check.js --book <slug> --chapter <num> --module <id>
  node tools/cnxml-fidelity-check.js --book <slug>

Options:
  --book <slug>       Book slug (default: efnafraedi-2e)
  --chapter <num>     Chapter number (omit for whole book)
  --module <id>       Single module ID (requires --chapter)
  --track <name>      Translation track (default: mt-preview)
  -v, --verbose       Show perfect modules too
  -h, --help          Show this help
`);
}

function parseCliArgs(argv) {
  return parseArgs(argv, [
    BOOK_OPTION,
    CHAPTER_OPTION,
    MODULE_OPTION,
    { name: 'track', flags: ['--track'], type: 'string', default: 'mt-preview' },
  ]);
}

function main() {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.help) { printHelp(); process.exit(0); }
  if (args.module && !args.chapter) {
    console.error('Error: --module requires --chapter');
    process.exit(1);
  }

  BOOKS_DIR = `books/${args.book}`;
  const chapters = args.chapter
    ? [formatChapter(args.chapter)]
    : discoverChapters(BOOKS_DIR);

  if (chapters.length === 0) {
    console.error(`No chapters found in ${BOOKS_DIR}/01-source/`);
    process.exit(1);
  }

  let totalDiscrepancies = 0;
  let modulesChecked = 0;
  let modulesWithDiffs = 0;
  let modulesPerfect = 0;
  let modulesSkipped = 0;

  for (const chapterDir of chapters) {
    const sourceDir = path.join(BOOKS_DIR, '01-source', chapterDir);
    const transDir = path.join(BOOKS_DIR, '03-translated', args.track, chapterDir);

    let modules = discoverModules(sourceDir);
    if (args.module) {
      modules = modules.filter(m => m.moduleId === args.module);
    }

    for (const mod of modules) {
      const sourcePath = path.join(sourceDir, mod.filename);
      const transPath = path.join(transDir, mod.filename);

      if (!fs.existsSync(transPath)) {
        modulesSkipped++;
        if (args.verbose) console.log(`${chapterDir}/${mod.moduleId}: SKIPPED (no translated file)`);
        continue;
      }

      const sourceCnxml = fs.readFileSync(sourcePath, 'utf8');
      const translatedCnxml = fs.readFileSync(transPath, 'utf8');
      const diffs = compareTagCounts(sourceCnxml, translatedCnxml);

      modulesChecked++;

      if (diffs.length === 0) {
        modulesPerfect++;
        if (args.verbose) console.log(`${chapterDir}/${mod.moduleId}: PERFECT`);
      } else {
        modulesWithDiffs++;
        const totalDiff = diffs.reduce((s, d) => s + Math.abs(d.diff), 0);
        totalDiscrepancies += totalDiff;
        console.log(`${chapterDir}/${mod.moduleId}: ${diffs.length} discrepancy(ies)`);
        for (const d of diffs) {
          console.log(`  ${d.tag}: ${d.source} → ${d.translated} (${d.diff > 0 ? '+' : ''}${d.diff})`);
        }
      }
    }
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`Checked: ${modulesChecked} modules`);
  console.log(`Perfect: ${modulesPerfect}`);
  console.log(`With discrepancies: ${modulesWithDiffs}`);
  console.log(`Skipped: ${modulesSkipped}`);
  console.log(`Total discrepancies: ${totalDiscrepancies}`);

  process.exit(totalDiscrepancies > 0 ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
```

- [ ] **Step 4: Run tests + verify CLI**

Run: `npx vitest run tools/__tests__/cnxml-fidelity-check.test.js`
Expected: PASS

Run: `node tools/cnxml-fidelity-check.js --book efnafraedi-2e --chapter 1 --verbose`
Expected: Shows discrepancies for current state (baseline measurement)

- [ ] **Step 5: Commit**

```bash
git add tools/cnxml-fidelity-check.js tools/__tests__/cnxml-fidelity-check.test.js
git commit -m "feat: add cnxml-fidelity-check.js validation tool"
```

---

### Task 2: Fix term overproduction in cnxml-inject.js

**Files:**
- Modify: `tools/cnxml-inject.js`
- Modify: `tools/__tests__/pipeline-integration.test.js`

**Root cause:** The Málstaður API preserves original `__term__` markers AND adds new `__term__` markers around glossary terms it recognizes. EN source has 8 terms, IS API output has 64. The injection's `reverseInlineMarkup()` at line ~561 converts ALL `__text__` to `<term>`, producing 56 false terms.

**Fix strategy:** Before converting `__text__` → `<term>`, compare the IS segment's `__text__` count against the EN segment's count. Only the first N markers (matching EN count) become `<term>`. Extra API-added markers are stripped to plain text.

This requires `reverseInlineMarkup()` to receive the EN source text for each segment, which it currently doesn't.

- [ ] **Step 1: Write failing test**

Add to `tools/__tests__/pipeline-integration.test.js`:

```javascript
describe('term overproduction fix', () => {
  it('should not produce more terms than the source has', () => {
    // Re-inject ch01 m68664 and check term count matches source
    run(`node ${join(TOOLS, 'cnxml-inject.js')} --chapter 1 --module m68664 --source-dir 02-mt-output`);

    const sourceCnxml = readFileSync(
      join(BOOKS, '01-source', 'ch01', 'm68664.cnxml'), 'utf8'
    );
    const translatedCnxml = readFileSync(
      join(BOOKS, '03-translated', 'mt-preview', 'ch01', 'm68664.cnxml'), 'utf8'
    );

    const sourceTermCount = (sourceCnxml.match(/<term[\s>]/g) || []).length;
    const translatedTermCount = (translatedCnxml.match(/<term[\s>]/g) || []).length;

    // Translated should have same number of terms as source (±1 tolerance for edge cases)
    expect(translatedTermCount).toBeLessThanOrEqual(sourceTermCount + 1);
    expect(translatedTermCount).toBeGreaterThanOrEqual(sourceTermCount - 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/pipeline-integration.test.js -t "term overproduction"`
Expected: FAIL — translated has 72 terms, source has 16

- [ ] **Step 3: Implement the fix**

The fix has two parts:

**Part A:** In `reverseInlineMarkup()`, strip API-added `__term__` markers before the term conversion regex. Add a parameter for the EN source segment text:

In `cnxml-inject.js`, find the term conversion line (around line 561):
```javascript
// OLD:
result = result.replace(/\_\_([^_]+)\_\_/g, '<term>$1</term>');
result = result.replace(/__([^_]+)__/g, '<term>$1</term>');
```

Replace with logic that limits terms to the EN count:
```javascript
// Count terms in EN source for this segment
const enTermCount = enSourceText ? (enSourceText.match(/__[^_]+__/g) || []).length : 0;

// Convert __text__ to <term>, but only up to EN count
let termIndex = 0;
result = result.replace(/\_\_([^_]+)\_\_/g, (match, inner) => {
  termIndex++;
  if (termIndex <= enTermCount) {
    return `<term>${inner}</term>`;
  }
  return inner; // Strip the marker, keep text
});
result = result.replace(/__([^_]+)__/g, (match, inner) => {
  termIndex++;
  if (termIndex <= enTermCount) {
    return `<term>${inner}</term>`;
  }
  return inner; // Strip the marker, keep text
});
```

**Part B:** Thread the EN source segment text through to `reverseInlineMarkup()`. The function is called from `buildPara()` and other builders which have access to the segment ID. The EN source segments can be loaded from `02-for-mt/` using the same segment parser.

This is the most invasive part of the change. The simplest approach: load the EN segment file once at the start of injection, build a map of segmentId → EN text, and pass the EN text to `reverseInlineMarkup()`.

In the `buildCnxml()` function (which orchestrates injection), add EN segment loading:
```javascript
// Load EN source segments for term count comparison
const enSegmentPath = path.join(BOOKS_DIR, '02-for-mt', chapterDir, `${moduleId}-segments.en.md`);
const enSegments = {};
if (fs.existsSync(enSegmentPath)) {
  const enContent = fs.readFileSync(enSegmentPath, 'utf8');
  const enParts = enContent.split(/(?=<!-- SEG:)/);
  for (const part of enParts) {
    const match = part.match(/<!-- SEG:(\S+)/);
    if (match) enSegments[match[1]] = part;
  }
}
```

Then pass `enSegments[segId]` through the call chain to `reverseInlineMarkup()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/__tests__/pipeline-integration.test.js -t "term overproduction"`
Expected: PASS

- [ ] **Step 5: Run full pipeline tests**

Run: `npx vitest run tools/__tests__/pipeline-integration.test.js`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add tools/cnxml-inject.js tools/__tests__/pipeline-integration.test.js
git commit -m "fix(inject): limit term markers to EN source count, strip API-added extras"
```

---

### Task 3: Fix SEG tag corruption in api-translate.js

**Files:**
- Modify: `tools/api-translate.js`
- Modify: `tools/__tests__/api-translate.test.js`

**Root cause:** The Málstaður API occasionally inserts hyphens in numeric module IDs inside SEG tags (e.g., `m68683` → `m6-8683`).

**Fix:** After receiving API output, scan for `<!-- SEG:` tags, compare each against the input's tags, and fix corrupted IDs. Add this as a `repairSegTags()` function called after `normalizeUnicode()`.

- [ ] **Step 1: Write failing test**

```javascript
// Add to tools/__tests__/api-translate.test.js
import { repairSegTags } from '../api-translate.js';

describe('repairSegTags', () => {
  it('fixes hyphenated module IDs in SEG tags', () => {
    const input = '<!-- SEG:m68683:para:1 --> Hello\n\n<!-- SEG:m68683:para:2 --> World';
    const output = '<!-- SEG:m6-8683:para:1 --> Hæ\n\n<!-- SEG:m68683:para:2 --> Heimur';
    expect(repairSegTags(input, output)).toBe(
      '<!-- SEG:m68683:para:1 --> Hæ\n\n<!-- SEG:m68683:para:2 --> Heimur'
    );
  });

  it('leaves correct SEG tags unchanged', () => {
    const input = '<!-- SEG:m68664:title:auto-1 --> Hello';
    const output = '<!-- SEG:m68664:title:auto-1 --> Hæ';
    expect(repairSegTags(input, output)).toBe(output);
  });

  it('handles multiple corrupted tags', () => {
    const input = '<!-- SEG:m68683:a:1 -->\n<!-- SEG:m68683:b:2 -->';
    const output = '<!-- SEG:m6-8683:a:1 -->\n<!-- SEG:m-68683:b:2 -->';
    const result = repairSegTags(input, output);
    expect(result).toContain('<!-- SEG:m68683:a:1 -->');
    expect(result).toContain('<!-- SEG:m68683:b:2 -->');
  });
});
```

- [ ] **Step 2: Implement `repairSegTags()`**

```javascript
/**
 * Repair SEG tags corrupted by the MT API (e.g., m6-8683 → m68683).
 * Compares output SEG tags against input to find and fix corruptions.
 */
export function repairSegTags(input, output) {
  // Build set of valid SEG tag IDs from input
  const inputTags = new Set();
  for (const match of input.matchAll(/<!-- SEG:(\S+?) -->/g)) {
    inputTags.add(match[1]);
  }

  // Replace corrupted SEG tags in output
  return output.replace(/<!-- SEG:(\S+?) -->/g, (fullMatch, tagId) => {
    if (inputTags.has(tagId)) return fullMatch; // Already correct

    // Try to find the matching input tag by removing hyphens from the module ID
    const cleaned = tagId.replace(/^(m)[\d-]+(:)/, (m, prefix, colon) => {
      const digits = m.slice(1, -1).replace(/-/g, '');
      return `${prefix}${digits}${colon}`;
    });

    if (inputTags.has(cleaned)) {
      return `<!-- SEG:${cleaned} -->`;
    }

    return fullMatch; // Can't fix — leave as-is
  });
}
```

- [ ] **Step 3: Integrate into translateModule()**

In `api-translate.js` `translateModule()`, add after `normalizeUnicode()`:

```javascript
output = normalizeUnicode(output);
output = repairSegTags(input, output);  // Fix corrupted SEG tags
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tools/__tests__/api-translate.test.js`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add tools/api-translate.js tools/__tests__/api-translate.test.js
git commit -m "fix(api-translate): repair SEG tag corruption from MT API"
```

---

### Task 4: Re-validate and assess remaining gaps

**Files:** None modified — validation step

After fixing terms and SEG tags, re-translate m68683 (the one with SEG corruption), re-inject all ch01 modules, and run the fidelity check.

- [ ] **Step 1: Re-translate m68683**

Run: `node tools/api-translate.js --book efnafraedi-2e --chapter 1 --module m68683 --force`
Expected: Translates successfully (SEG corruption auto-repaired)

- [ ] **Step 2: Re-inject all ch01 modules**

Run: `node tools/cnxml-inject.js --book efnafraedi-2e --chapter 1 --source-dir 02-mt-output`
Expected: All 7 modules inject [COMPLETE] (no missing segments)

- [ ] **Step 3: Run fidelity check**

Run: `node tools/cnxml-fidelity-check.js --book efnafraedi-2e --chapter 1 --verbose`
Expected: Significant improvement. Term overproduction should be 0. Remaining gaps are the investigation targets for Tasks 5+.

- [ ] **Step 4: Document results**

Record the fidelity check output. If discrepancies remain, they guide Tasks 5-7. If all 7 modules are PERFECT, skip Tasks 5-7.

---

### Task 5: Fix remaining gaps (if any after re-validation)

This task is conditional on Task 4 results. The investigation showed:
- **Emphasis:** All markers preserved in API output — losses may be secondary effect of term bug (likely fixed now)
- **Cross-doc links:** `<link document="m68860">` without target-id — extraction gap in `cnxml-extract.js` ~line 263
- **Equation wrappers:** Structure.json has equation metadata for m68683 but wrappers not reconstructed
- **Superscripts:** API adds extra `^text^` markers (similar to term overproduction — may need same count-based limiting)

Each sub-fix follows the same pattern: write test → implement → verify.

- [ ] **Step 1: Assess Task 4 results and fix what's needed**

For each remaining discrepancy:
1. Trace the specific element through the pipeline
2. Write a failing test
3. Implement the minimal fix
4. Verify

- [ ] **Step 2: Commit each fix separately**

---

### Task 6: Final validation + full test suite

- [ ] **Step 1: Run fidelity check on ch01**

Run: `node tools/cnxml-fidelity-check.js --book efnafraedi-2e --chapter 1 --verbose`
Expected: 0 discrepancies (or documented known limitations)

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 3: Commit and push**

```bash
git push
```
