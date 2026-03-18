# api-translate.js Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a CLI tool that automates machine translation by sending English segment files to the Málstaður API and writing Icelandic output, eliminating the manual web UI step.

**Architecture:** Single CLI tool reads `.en.md` files from `02-for-mt/`, sends whole files to the Málstaður API (which preserves all content markers), normalizes Unicode artifacts, validates segment marker counts, and writes `.is.md` files to `02-mt-output/`. Uses the existing `malstadur-api.js` client library.

**Tech Stack:** Node.js 24, ES modules, `tools/lib/malstadur-api.js` (built), `tools/lib/parseArgs.js` (existing)

**Spec:** `docs/superpowers/specs/2026-03-18-api-translate-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `tools/api-translate.js` | Create | CLI tool: arg parsing, module discovery, orchestration, main loop |
| `tools/lib/malstadur-api.js` | Already built | API client: translate, glossary formatting, usage tracking |
| `tools/__tests__/api-translate.test.js` | Create | Unit tests for all pure functions + mocked integration |
| `.env.example` | Already updated | Documents `MALSTADUR_API_KEY` |

---

### Task 1: Unicode normalization function + tests (TDD)

**Files:**
- Create: `tools/__tests__/api-translate.test.js`
- Create: `tools/api-translate.js` (just the exported function initially)

This is a pure function with no dependencies — ideal to build first with TDD.

- [ ] **Step 1: Write failing tests for `normalizeUnicode()`**

```javascript
// tools/__tests__/api-translate.test.js
import { describe, it, expect } from 'vitest';
import { normalizeUnicode } from '../api-translate.js';

describe('normalizeUnicode', () => {
  it('converts Unicode subscript digits to ~N~ format', () => {
    expect(normalizeUnicode('H₂O')).toBe('H~2~O');
    expect(normalizeUnicode('CO₂')).toBe('CO~2~');
    expect(normalizeUnicode('C₆H₁₂O₆')).toBe('C~6~H~12~O~6~');
  });

  it('converts Unicode superscript digits to ^N^ format', () => {
    expect(normalizeUnicode('10⁵')).toBe('10^5^');
    expect(normalizeUnicode('x²')).toBe('x^2^');
    expect(normalizeUnicode('10⁻⁶')).toBe('10^-6^');
  });

  it('converts subscript operators', () => {
    expect(normalizeUnicode('A₊B₋')).toBe('A~+~B~-~');
  });

  it('converts superscript operators', () => {
    expect(normalizeUnicode('x⁺y⁻')).toBe('x^+^y^-^');
  });

  it('groups mixed subscript digits and operators', () => {
    expect(normalizeUnicode('A₁₊₂')).toBe('A~1+2~');
  });

  it('leaves normal text unchanged', () => {
    expect(normalizeUnicode('Hello world')).toBe('Hello world');
  });

  it('leaves existing ~N~ and ^N^ markers unchanged', () => {
    expect(normalizeUnicode('H~2~O and 10^5^')).toBe('H~2~O and 10^5^');
  });

  it('handles mixed content with markers and Unicode', () => {
    expect(normalizeUnicode('<!-- SEG:m68674:para:1 --> H₂O is [[MATH:1]] 10⁵ kg'))
      .toBe('<!-- SEG:m68674:para:1 --> H~2~O is [[MATH:1]] 10^5^ kg');
  });

  it('groups consecutive subscript digits', () => {
    expect(normalizeUnicode('x₁₂₃')).toBe('x~123~');
  });

  it('groups consecutive superscript digits', () => {
    expect(normalizeUnicode('x¹²³')).toBe('x^123^');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tools/__tests__/api-translate.test.js`
Expected: FAIL — `normalizeUnicode` not found

- [ ] **Step 3: Implement `normalizeUnicode()` in `api-translate.js`**

```javascript
// tools/api-translate.js (initial — just the function + exports)
#!/usr/bin/env node

/**
 * api-translate.js — Automated MT via Málstaður API
 *
 * Translates English segment files to Icelandic using the Miðeind API.
 * Part of the Extract-Inject-Render pipeline.
 */

// ─── Unicode Normalization ──────────────────────────────────────────

const SUBSCRIPT_MAP = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
  '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
  '₊': '+', '₋': '-', '₌': '=', '₍': '(', '₎': ')',
};

const SUPERSCRIPT_MAP = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁺': '+', '⁻': '-', '⁼': '=', '⁽': '(', '⁾': ')',
};

const SUB_CHARS = Object.keys(SUBSCRIPT_MAP).join('');
const SUP_CHARS = Object.keys(SUPERSCRIPT_MAP).join('');

const SUB_REGEX = new RegExp(`[${SUB_CHARS}]+`, 'g');
const SUP_REGEX = new RegExp(`[${SUP_CHARS}]+`, 'g');

/**
 * Convert Unicode subscript/superscript characters to ~N~ / ^N^ markdown format.
 * Groups consecutive characters: ₁₂₃ → ~123~
 */
export function normalizeUnicode(text) {
  let result = text.replace(SUB_REGEX, (match) => {
    const converted = [...match].map(ch => SUBSCRIPT_MAP[ch]).join('');
    return `~${converted}~`;
  });
  result = result.replace(SUP_REGEX, (match) => {
    const converted = [...match].map(ch => SUPERSCRIPT_MAP[ch]).join('');
    return `^${converted}^`;
  });
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tools/__tests__/api-translate.test.js`
Expected: All 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add tools/__tests__/api-translate.test.js tools/api-translate.js
git commit -m "feat(api-translate): add normalizeUnicode with tests (TDD)"
```

---

### Task 2: .env loader + module discovery + validation helpers (TDD)

**Files:**
- Modify: `tools/api-translate.js`
- Modify: `tools/__tests__/api-translate.test.js`

- [ ] **Step 1: Write failing tests for `loadEnvFile()`, `discoverModules()`, `validateMarkers()`, `bookToDomain()`**

```javascript
// Add to tools/__tests__/api-translate.test.js
import { loadEnvFile, discoverModules, validateMarkers, bookToDomain } from '../api-translate.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('loadEnvFile', () => {
  it('parses KEY=VALUE lines from .env content', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-test-'));
    const envPath = path.join(tmpDir, '.env');
    fs.writeFileSync(envPath, 'FOO=bar\nBAZ=qux\n');
    const vars = loadEnvFile(envPath);
    expect(vars).toEqual({ FOO: 'bar', BAZ: 'qux' });
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('skips comments and empty lines', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-test-'));
    const envPath = path.join(tmpDir, '.env');
    fs.writeFileSync(envPath, '# comment\n\nKEY=value\n  \n');
    const vars = loadEnvFile(envPath);
    expect(vars).toEqual({ KEY: 'value' });
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('strips surrounding quotes from values', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-test-'));
    const envPath = path.join(tmpDir, '.env');
    fs.writeFileSync(envPath, 'KEY="quoted value"\nKEY2=\'single\'\n');
    const vars = loadEnvFile(envPath);
    expect(vars).toEqual({ KEY: 'quoted value', KEY2: 'single' });
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns empty object for missing file', () => {
    expect(loadEnvFile('/nonexistent/.env')).toEqual({});
  });
});

describe('discoverModules', () => {
  it('finds primary .en.md files and excludes splits', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'discover-'));
    fs.writeFileSync(path.join(tmpDir, 'm68664-segments.en.md'), 'content');
    fs.writeFileSync(path.join(tmpDir, 'm68667-segments.en.md'), 'content');
    fs.writeFileSync(path.join(tmpDir, 'm68667-segments(b).en.md'), 'split');
    fs.writeFileSync(path.join(tmpDir, 'm68664-segments-links.json'), '{}');

    const modules = discoverModules(tmpDir);
    expect(modules).toHaveLength(2);
    expect(modules.map(m => m.moduleId)).toEqual(['m68664', 'm68667']);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns empty array for nonexistent directory', () => {
    expect(discoverModules('/nonexistent')).toEqual([]);
  });
});

describe('validateMarkers', () => {
  it('returns true when marker counts match', () => {
    const input = '<!-- SEG:a:b:1 --> text\n\n<!-- SEG:a:b:2 --> more';
    const output = '<!-- SEG:a:b:1 --> texti\n\n<!-- SEG:a:b:2 --> meira';
    expect(validateMarkers(input, output)).toBe(true);
  });

  it('returns false when output has fewer markers', () => {
    const input = '<!-- SEG:a:b:1 --> text\n\n<!-- SEG:a:b:2 --> more';
    const output = '<!-- SEG:a:b:1 --> texti';
    expect(validateMarkers(input, output)).toBe(false);
  });
});

describe('bookToDomain', () => {
  it('maps efnafraedi to chemistry', () => {
    expect(bookToDomain('efnafraedi-2e')).toBe('chemistry');
  });

  it('maps liffraedi to biology', () => {
    expect(bookToDomain('liffraedi-2e')).toBe('biology');
  });

  it('maps oerverufraedi to microbiology', () => {
    expect(bookToDomain('orverufraedi')).toBe('microbiology');
  });

  it('returns generic for unknown books', () => {
    expect(bookToDomain('unknown-book')).toBe('science');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tools/__tests__/api-translate.test.js`
Expected: FAIL — functions not found

- [ ] **Step 3: Implement the helper functions**

Add to `tools/api-translate.js`:

```javascript
import fs from 'fs';
import path from 'path';

// ─── .env Loading ───────────────────────────────────────────────────

/**
 * Parse a .env file into a key-value object.
 * Skips comments (#) and empty lines. Does not override existing env vars.
 */
export function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, 'utf8');
  const vars = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

// ─── Module Discovery ───────────────────────────────────────────────

/**
 * Find translatable .en.md module files in a directory.
 * Excludes split files like (b).en.md.
 */
export function discoverModules(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir)
    .filter(f => f.match(/^m\d+-segments\.en\.md$/))
    .sort();
  return files.map(f => {
    const moduleId = f.match(/^(m\d+)-/)[1];
    return { moduleId, filename: f, path: path.join(dir, f) };
  });
}

// ─── Validation ─────────────────────────────────────────────────────

/**
 * Validate that input and output have the same number of SEG markers.
 */
export function validateMarkers(input, output) {
  const inputCount = (input.match(/<!-- SEG:/g) || []).length;
  const outputCount = (output.match(/<!-- SEG:/g) || []).length;
  return inputCount === outputCount;
}

// ─── Book → Domain Mapping ──────────────────────────────────────────

export function bookToDomain(bookSlug) {
  if (bookSlug.startsWith('efnafraedi')) return 'chemistry';
  if (bookSlug.startsWith('liffraedi')) return 'biology';
  if (bookSlug.startsWith('orverufraedi')) return 'microbiology';
  return 'science';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tools/__tests__/api-translate.test.js`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add tools/api-translate.js tools/__tests__/api-translate.test.js
git commit -m "feat(api-translate): add env loader, module discovery, validation helpers (TDD)"
```

---

### Task 3: Glossary loading

**Files:**
- Modify: `tools/api-translate.js`
- Modify: `tools/__tests__/api-translate.test.js`

- [ ] **Step 1: Write failing test for `loadGlossary()`**

```javascript
// Add to tools/__tests__/api-translate.test.js
import { loadGlossary } from '../api-translate.js';

describe('loadGlossary', () => {
  it('loads approved terms and formats as API glossary', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glossary-'));
    const glossary = {
      terms: [
        { english: 'atom', icelandic: 'atóm', status: 'approved' },
        { english: 'ion', icelandic: 'jón', status: 'proposed' },
        { english: 'acid', icelandic: 'sýra', status: 'approved' },
      ]
    };
    fs.writeFileSync(path.join(tmpDir, 'glossary-unified.json'), JSON.stringify(glossary));

    const result = loadGlossary(tmpDir, 'chemistry');
    expect(result.terms).toHaveLength(2);
    expect(result.terms[0]).toEqual({ sourceWord: 'atom', targetWord: 'atóm' });
    expect(result.domain).toBe('chemistry');
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns null when glossary file is missing', () => {
    expect(loadGlossary('/nonexistent', 'chemistry')).toBeNull();
  });

  it('returns null when no approved terms exist', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glossary-'));
    const glossary = {
      terms: [
        { english: 'ion', icelandic: 'jón', status: 'proposed' },
      ]
    };
    fs.writeFileSync(path.join(tmpDir, 'glossary-unified.json'), JSON.stringify(glossary));

    const result = loadGlossary(tmpDir, 'chemistry');
    expect(result).toBeNull();
    fs.rmSync(tmpDir, { recursive: true });
  });
});
```

- [ ] **Step 2: Run to verify fail, then implement**

```javascript
// Add to tools/api-translate.js
import { formatGlossary } from './lib/malstadur-api.js';

/**
 * Load glossary from a book's glossary directory.
 * Returns API-formatted glossary object or null if unavailable.
 */
export function loadGlossary(glossaryDir, domain) {
  const glossaryPath = path.join(glossaryDir, 'glossary-unified.json');
  if (!fs.existsSync(glossaryPath)) return null;

  try {
    const data = JSON.parse(fs.readFileSync(glossaryPath, 'utf8'));
    const glossary = formatGlossary(data.terms || [], { domain, approvedOnly: true });
    if (glossary.terms.length === 0) return null;
    return glossary;
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `npx vitest run tools/__tests__/api-translate.test.js`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add tools/api-translate.js tools/__tests__/api-translate.test.js
git commit -m "feat(api-translate): add glossary loading with approved-only filtering"
```

---

### Task 4: CLI argument parsing + help text

**Files:**
- Modify: `tools/api-translate.js`

No tests needed for CLI parsing (tested through `parseArgs` library) or help text.

- [ ] **Step 1: Add CLI parsing and help**

```javascript
// Add to tools/api-translate.js
import { fileURLToPath } from 'url';
import { parseArgs, BOOK_OPTION, CHAPTER_OPTION, MODULE_OPTION } from './lib/parseArgs.js';

let BOOKS_DIR = 'books/efnafraedi-2e';

function parseCliArgs(argv) {
  return parseArgs(argv, [
    BOOK_OPTION,
    CHAPTER_OPTION,
    MODULE_OPTION,
    { name: 'force', flags: ['--force'], type: 'boolean', default: false },
    { name: 'dryRun', flags: ['--dry-run', '-n'], type: 'boolean', default: false },
    { name: 'noGlossary', flags: ['--no-glossary'], type: 'boolean', default: false },
    { name: 'rateDelay', flags: ['--rate-delay'], type: 'number', default: 500 },
  ]);
}

function formatChapter(chapter) {
  if (chapter === 'appendices') return 'appendices';
  return `ch${String(chapter).padStart(2, '0')}`;
}

function printHelp() {
  console.log(`
api-translate.js — Automated MT via Málstaður API

Translates English segment files to Icelandic using the Miðeind Málstaður API.
Sends whole module files directly — no protection or splitting needed.

Usage:
  node tools/api-translate.js --book <slug> --chapter <num> [--module <id>]
  node tools/api-translate.js --book <slug>

Options:
  --book <slug>       Book slug (default: efnafraedi-2e)
  --chapter <num>     Chapter number (omit for whole book)
  --module <id>       Single module ID (requires --chapter)
  --force             Overwrite existing output files
  --dry-run, -n       Show what would be translated + cost estimate
  --no-glossary       Don't send glossary terms with requests
  --rate-delay <ms>   Delay between API calls (default: 500)
  -v, --verbose       Detailed progress output
  -h, --help          Show this help

Environment:
  MALSTADUR_API_KEY   API key (or set in .env file)

Examples:
  node tools/api-translate.js --book efnafraedi-2e --chapter 1
  node tools/api-translate.js --book efnafraedi-2e --dry-run
  node tools/api-translate.js --book liffraedi-2e --chapter 3 --module m71234
`);
}
```

- [ ] **Step 2: Verify help works**

Run: `node tools/api-translate.js --help`
Expected: Help text displayed, exit 0

- [ ] **Step 3: Commit**

```bash
git add tools/api-translate.js
git commit -m "feat(api-translate): add CLI argument parsing and help text"
```

---

### Task 5: Main translation loop + `translateModule()`

**Files:**
- Modify: `tools/api-translate.js`

This is the core orchestration: discover modules, load glossary, translate each module, validate, write output.

- [ ] **Step 1: Implement `translateModule()` and `main()`**

```javascript
// Add to tools/api-translate.js
import { createClient } from './lib/malstadur-api.js';

/**
 * Discover chapter directories for a book.
 * Returns sorted list: ['ch01', 'ch02', ..., 'appendices']
 */
function discoverChapters(bookDir) {
  const mtDir = path.join(bookDir, '02-for-mt');
  if (!fs.existsSync(mtDir)) return [];
  return fs.readdirSync(mtDir)
    .filter(d => d.match(/^ch\d+$/) || d === 'appendices')
    .sort((a, b) => {
      if (a === 'appendices') return 1;
      if (b === 'appendices') return -1;
      return a.localeCompare(b, undefined, { numeric: true });
    });
}

/**
 * Translate a single module file via the API.
 */
async function translateModule(client, inputPath, outputPath, glossary, verbose) {
  const input = fs.readFileSync(inputPath, 'utf8');

  const translateOpts = { targetLanguage: 'is' };
  if (glossary) {
    translateOpts.glossaries = [glossary];
  }

  const result = await client.translateAuto(input, translateOpts);
  let output = result.text;

  // Post-process: normalize Unicode sub/superscripts
  output = normalizeUnicode(output);

  // Validate marker count
  if (!validateMarkers(input, output)) {
    const inputCount = (input.match(/<!-- SEG:/g) || []).length;
    const outputCount = (output.match(/<!-- SEG:/g) || []).length;
    throw new Error(
      `Segment marker mismatch: input has ${inputCount}, output has ${outputCount}. ` +
      `API may have truncated the response.`
    );
  }

  // Write output
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(outputPath, output, 'utf8');

  // Copy -links.json if it exists
  const linksFilename = path.basename(inputPath).replace('-segments.en.md', '-segments-links.json');
  const linksSource = path.join(path.dirname(inputPath), linksFilename);
  if (fs.existsSync(linksSource)) {
    const linksDest = path.join(outputDir, linksFilename);
    fs.copyFileSync(linksSource, linksDest);
  }

  return { chars: input.length, usage: result.usage };
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));

  if (args.help) { printHelp(); process.exit(0); }

  // Validate: --module requires --chapter
  if (args.module && !args.chapter) {
    console.error('Error: --module requires --chapter');
    process.exit(1);
  }

  BOOKS_DIR = `books/${args.book}`;
  const mtInputDir = path.join(BOOKS_DIR, '02-for-mt');
  const mtOutputDir = path.join(BOOKS_DIR, '02-mt-output');

  // Load .env if API key not in environment
  if (!process.env.MALSTADUR_API_KEY) {
    const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const envVars = loadEnvFile(path.join(projectRoot, '.env'));
    if (envVars.MALSTADUR_API_KEY) {
      process.env.MALSTADUR_API_KEY = envVars.MALSTADUR_API_KEY;
    }
  }

  // Load glossary
  let glossary = null;
  if (!args.noGlossary) {
    const domain = bookToDomain(args.book);
    glossary = loadGlossary(path.join(BOOKS_DIR, 'glossary'), domain);
    if (glossary) {
      console.log(`Glossary: ${glossary.terms.length} approved ${glossary.domain} terms`);
    } else {
      console.log('Glossary: none available (continuing without)');
    }
  }

  // Discover modules to translate
  const chapters = args.chapter
    ? [formatChapter(args.chapter)]
    : discoverChapters(BOOKS_DIR);

  if (chapters.length === 0) {
    console.error(`No chapters found in ${mtInputDir}`);
    process.exit(1);
  }

  // Build work list
  const workList = [];
  for (const chapterDir of chapters) {
    const inputDir = path.join(mtInputDir, chapterDir);
    const outputDir = path.join(mtOutputDir, chapterDir);
    let modules = discoverModules(inputDir);

    // Filter to specific module if requested
    if (args.module) {
      modules = modules.filter(m => m.moduleId === args.module);
    }

    for (const mod of modules) {
      const outputPath = path.join(outputDir, mod.filename.replace('.en.md', '.is.md'));
      const exists = fs.existsSync(outputPath);

      workList.push({
        ...mod,
        chapterDir,
        outputPath,
        skip: exists && !args.force,
      });
    }
  }

  const toTranslate = workList.filter(m => !m.skip);
  const toSkip = workList.filter(m => m.skip);

  if (workList.length === 0) {
    console.error('No modules found for the specified scope.');
    process.exit(1);
  }

  // Dry run
  if (args.dryRun) {
    console.log(`\nDry run — ${workList.length} modules found:`);
    console.log(`  To translate: ${toTranslate.length}`);
    console.log(`  Already done:  ${toSkip.length} (use --force to re-translate)`);

    let totalChars = 0;
    for (const mod of toTranslate) {
      const content = fs.readFileSync(mod.path, 'utf8');
      totalChars += content.length;
      if (args.verbose) {
        console.log(`  ${mod.chapterDir}/${mod.moduleId}: ${content.length.toLocaleString()} chars`);
      }
    }
    console.log(`\n  Estimated characters: ${totalChars.toLocaleString()}`);
    console.log(`  Estimated cost: ~${(totalChars * 5 / 1000).toFixed(0)} ISK`);
    process.exit(0);
  }

  // Create API client
  let client;
  try {
    client = createClient({ rateDelayMs: args.rateDelay });
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }

  console.log(`\nTranslating ${toTranslate.length} module(s), skipping ${toSkip.length}...`);
  console.log('');

  // Translate
  const results = { translated: 0, skipped: toSkip.length, failed: 0, errors: [] };

  for (const mod of workList) {
    if (mod.skip) {
      if (args.verbose) console.log(`  ⏭  ${mod.chapterDir}/${mod.moduleId} (exists)`);
      continue;
    }

    process.stdout.write(`  ${mod.chapterDir}/${mod.moduleId}... `);

    try {
      const { chars } = await translateModule(client, mod.path, mod.outputPath, glossary, args.verbose);
      console.log(`✅ (${chars.toLocaleString()} chars)`);
      results.translated++;
    } catch (err) {
      console.log(`❌ ${err.message}`);
      results.failed++;
      results.errors.push({ module: mod.moduleId, chapter: mod.chapterDir, error: err.message });
    }
  }

  // Summary
  const usage = client.getUsage();
  console.log('\n' + '═'.repeat(50));
  console.log('Summary:');
  console.log(`  Translated: ${results.translated}`);
  console.log(`  Skipped:    ${results.skipped}`);
  console.log(`  Failed:     ${results.failed}`);
  console.log(`  API usage:  ${usage.totalChars.toLocaleString()} chars`);
  console.log(`  Est. cost:  ~${usage.estimatedISK.toFixed(0)} ISK`);
  console.log(`  Time:       ${(usage.elapsedMs / 1000).toFixed(1)}s`);

  if (results.errors.length > 0) {
    console.log('\nFailed modules:');
    for (const err of results.errors) {
      console.log(`  ${err.chapter}/${err.module}: ${err.error}`);
    }
  }

  if (results.failed > 0) process.exit(1);
}

// Only run when executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
}
```

- [ ] **Step 2: Verify help and dry-run work**

Run: `node tools/api-translate.js --help`
Expected: Help text

Run: `node tools/api-translate.js --book efnafraedi-2e --chapter 1 --dry-run`
Expected: Shows 7 modules, character count, cost estimate, no API calls

- [ ] **Step 3: Verify --module validation**

Run: `node tools/api-translate.js --module m68664`
Expected: Error: `--module requires --chapter`

- [ ] **Step 4: Commit**

```bash
git add tools/api-translate.js
git commit -m "feat(api-translate): implement main translation loop with resume, validation, cost tracking"
```

---

### Task 6: Live API test with a single module

**Files:** None modified — this is a verification step

- [ ] **Step 1: Translate one small module**

Run: `node tools/api-translate.js --book efnafraedi-2e --chapter 1 --module m68663 --force --verbose`

Expected:
- Module translated successfully
- Output written to `books/efnafraedi-2e/02-mt-output/ch01/m68663-segments.is.md`
- Segment markers preserved
- Usage and cost reported

- [ ] **Step 2: Verify output format**

Run: `head -20 books/efnafraedi-2e/02-mt-output/ch01/m68663-segments.is.md`

Expected: Icelandic text with `<!-- SEG:m68663:... -->` markers intact

- [ ] **Step 3: Verify resumability**

Run: `node tools/api-translate.js --book efnafraedi-2e --chapter 1 --module m68663`

Expected: Module skipped (already exists), no API call

- [ ] **Step 4: Verify pipeline round-trip (inject the API output)**

Run: `node tools/cnxml-inject.js --book efnafraedi-2e --chapter 1 --module m68663 --source-dir 02-mt-output`

Expected: Injection succeeds with 0 missing segments

- [ ] **Step 5: Commit the verified output (optional — user decides)**

The translated output in `02-mt-output/` is generated data. The user may want to commit it or leave it uncommitted.

---

### Task 7: Error recovery test

**Files:**
- Modify: `tools/__tests__/api-translate.test.js`

- [ ] **Step 1: Write test verifying error recovery in batch mode**

```javascript
// Add to tools/__tests__/api-translate.test.js
describe('translateModule error recovery', () => {
  it('validateMarkers rejects truncated output', () => {
    const input = '<!-- SEG:a:b:1 --> hello\n\n<!-- SEG:a:b:2 --> world\n\n<!-- SEG:a:b:3 --> end';
    const truncated = '<!-- SEG:a:b:1 --> hæ';
    expect(validateMarkers(input, truncated)).toBe(false);
  });

  it('validateMarkers accepts output with same count', () => {
    const input = '<!-- SEG:a:b:1 --> hello\n\n<!-- SEG:a:b:2 --> world';
    const output = '<!-- SEG:a:b:1 --> hæ\n\n<!-- SEG:a:b:2 --> heimur';
    expect(validateMarkers(input, output)).toBe(true);
  });

  it('validateMarkers handles input with zero markers', () => {
    expect(validateMarkers('no markers here', 'engin merki hér')).toBe(true);
  });
});

describe('skip-existing logic', () => {
  it('discoverModules finds files that need translation vs already done', () => {
    const inputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'input-'));
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'output-'));

    // Two modules in input
    fs.writeFileSync(path.join(inputDir, 'm68664-segments.en.md'), 'content');
    fs.writeFileSync(path.join(inputDir, 'm68667-segments.en.md'), 'content');

    // One already translated
    fs.writeFileSync(path.join(outputDir, 'm68664-segments.is.md'), 'translated');

    const modules = discoverModules(inputDir);
    const needsTranslation = modules.filter(m => {
      const outputPath = path.join(outputDir, m.filename.replace('.en.md', '.is.md'));
      return !fs.existsSync(outputPath);
    });

    expect(modules).toHaveLength(2);
    expect(needsTranslation).toHaveLength(1);
    expect(needsTranslation[0].moduleId).toBe('m68667');

    fs.rmSync(inputDir, { recursive: true });
    fs.rmSync(outputDir, { recursive: true });
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run tools/__tests__/api-translate.test.js`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add tools/__tests__/api-translate.test.js
git commit -m "test(api-translate): add marker validation edge case tests"
```

---

### Task 8: Run full test suite + final cleanup

**Files:**
- Modify: `tools/api-translate.js` (if cleanup needed)

- [ ] **Step 1: Run all project tests**

Run: `npm test`
Expected: All existing tests still pass + new api-translate tests pass

- [ ] **Step 2: Verify dry-run for whole book**

Run: `node tools/api-translate.js --book efnafraedi-2e --dry-run`
Expected: Shows all chapters, total module count (~197), character estimate, cost estimate

- [ ] **Step 3: Final commit with any cleanup**

```bash
git add tools/api-translate.js tools/__tests__/api-translate.test.js
git commit -m "feat(api-translate): complete implementation — automated MT via Málstaður API"
```
